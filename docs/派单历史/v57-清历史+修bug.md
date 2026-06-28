# v57 批次：清理历史数据 + 修核心 bug（候选 A+B+C）

> **批次决策**：2026-06-28 胡子哥确认选项 1 —— 把待排期问题清单中的 3 条一次性清掉，再做新功能。
> **批次范围**：① 修复待排期-1（每日解锁历史数据 P0）② 修复待排期-2（admin 调积分不写 pointsRecord P1）③ 修复历史-1（手续费 key 不一致 P2）
> **版本基线**：v56.2（commit `dc5599f`）→ v57
> **总工作量**：2-3 天

---

# v57 批次 / 步骤 1：修复手续费 key 不一致（候选 C）

## 任务背景

`待排期-1/2` 之外的另一个隐藏 bug：系统配置 key 注册名是 `points.transfer_fee_percent`，但 `/api/points/transfer` 路由读的是旧 key `transfer_fee_percent`。结果是 —— 你改了配置里的手续费比例，转账 API 读不到，永远是默认值 10%。

## 1.1 根因（已 grep 确认）

| 文件 | 行号 | 读哪个 key | 状态 |
|------|------|-----------|------|
| `src/lib/services/points.service.ts` | 78 | `points.transfer_fee_percent` | ✅ 对的 |
| `src/lib/config/system-parameters.ts` | 189 | `points.transfer_fee_percent`（注册） | ✅ 对的 |
| **`src/app/api/points/transfer/route.ts`** | **42** | **`transfer_fee_percent`** | ❌ **错的** |

## 1.2 改动（**就 1 行**）

**文件**：`src/app/api/points/transfer/route.ts`
**位置**：第 42 行附近（`prisma.systemConfig.findUnique` 那行）
**改动**：

```typescript
// ❌ 改前
where: { key: 'transfer_fee_percent' },

// ✅ 改后
where: { key: 'points.transfer_fee_percent' },
```

## 1.3 验证

- **不需要新测试** —— 改的是字符串字面量，build/typecheck 通过就够
- 改完后本地 build 一次确认无错
- 推送后胡子哥可以在 admin 后台改 `points.transfer_fee_percent` 配置项（比如改成 5），下一次转账费率会立刻生效

## 1.4 提交

```bash
git add src/app/api/points/transfer/route.ts
git commit -m "fix(v57.1): 修复手续费 key 不一致 - transfer route 改读 points.transfer_fee_percent

- 历史-1：points.transfer_fee_percent 是 system-parameters 注册的正确 key
- 但 /api/points/transfer route 读的是旧 key transfer_fee_percent
- 导致改配置永远不生效，费率硬编码 10%
- 改动：1 行（route.ts:42）

需求文档：业务规则 v2 第 8.1 节系统参数表"
git push origin main
git log origin/main --oneline -1  # 铁律 1 验证
```

---

# v57 批次 / 步骤 2：admin 调积分写 pointsRecord + 通知（候选 B）

## 任务背景

胡子哥测试 v56.2 时发现：后台给测试账号「充值 500 积分」后，顶部统计正确（总积分 1500→2000、可用 0→500），但「积分明细」里**只看到 2 条 reward 记录**，**没有充值记录**。用户根本不知道积分被调过。

**同类历史 bug 模式**：
- v46.11：admin 调钱（balance）没调 `sendInApp` 通知用户 → 已修
- v46.12：退款审核/完成没发通知 → 已修
- **本次：积分调账没写历史表 → 同一类"写 DB 但不写记录"**

## 2.1 根因（已 grep 确认）

**文件**：`src/app/api/admin/users/[id]/points/route.ts`
**问题**：line 46-105 整个事务里**只做了 4 件事**：
1. 查询用户
2. 联动计算 totalPoints/unlockedPoints/lockedPoints
3. `tx.user.update(...)` 更新 user 表
4. 返回结果

**没有调用 `tx.pointsRecord.create(...)`** ❌

- `logOperation`（管理员操作日志）✅ 已写
- `console.log` ✅ 已写
- **`pointsRecord` 表 ❌ 没写**

## 2.2 改动 1：事务里加 pointsRecord.create

**文件**：`src/app/api/admin/users/[id]/points/route.ts`
**位置**：在 `tx.user.update(...)` 之后、`return { ... }` 之前

**插入代码**：

```typescript
// v57.2 B: 创建积分明细记录（用户能在积分明细看到调账历史）
await tx.pointsRecord.create({
  data: {
    userId: id,
    type: 'admin_adjust',  // String 自由类型，无需改 schema
    amount,  // 可能是正或负
    totalPoints: result.updated.totalPoints,
    unlockedPoints: result.updated.unlockedPoints,
    lockedPoints: result.updated.lockedPoints,
    sourceId: admin.id,
    description: `管理员调账：${result.fieldLabel}${amount > 0 ? '增加' : '扣减'} ${Math.abs(amount)} 积分，原因：${reason.trim()}`,
  },
})
```

> **重要**：`result.updated` 在原代码里要等事务结束才返回，**但 `tx.pointsRecord.create` 必须在事务内调用**。
>
> **修复方案**：在 `return { ... }` 之前，**不要 return updated 对象**，改用 `updated` 局部变量：

```typescript
const updated = await tx.user.update({
  where: { id },
  data: { totalPoints: total, unlockedPoints: unlocked, lockedPoints: locked },
})

// v57.2 B: 创建积分明细
await tx.pointsRecord.create({
  data: { /* ... */ },
})

return {
  updated,
  oldValue: { /* ... */ },
  fieldLabel,
}
```

**注意**：原代码 `return { updated, ... }` 在 `tx.user.update` 后面已经有 `updated` 变量（line 87-94），所以不用改结构，**只在中间插一行 `tx.pointsRecord.create` 即可**。

## 2.3 改动 2：加 notifyPointsAdjust 通知方法

**文件**：`src/lib/services/order-notification.service.ts`
**位置**：在 `notifyBalanceChange` 方法（line 105-157）**后面**追加新方法

**插入代码**（参考 `notifyBalanceChange` 模板）：

```typescript
// v57.2 B: 抽公共方法 - 积分变动通知（给 admin/users/[id]/points 路由调用）
static async notifyPointsAdjust(params: {
  userId: string
  fieldLabel: string  // 总积分 / 可用积分 / 锁定积分
  amount: number
  newTotalPoints: number
  newUnlockedPoints: number
  newLockedPoints: number
  reason: string
  operatorId?: string
}) {
  const sign = params.amount > 0 ? '+' : ''
  const variables = {
    fieldLabel: params.fieldLabel,
    changeAmount: `${sign}${params.amount}`,
    newTotalPoints: String(params.newTotalPoints),
    newUnlockedPoints: String(params.newUnlockedPoints),
    newLockedPoints: String(params.newLockedPoints),
    reason: params.reason,
  }
  await (async () => {
    try {
      const b = await prisma.notificationBatch.create({
        data: {
          type: 'business',
          title: '账户积分变动通知',
          content: `${params.fieldLabel} ${variables.changeAmount} 积分，当前总积分 ${params.newTotalPoints}`,
          templateType: 'points_adjust',
          recipientCount: 1,
          senderId: params.operatorId ?? null,
        },
      })
      await sendInApp({
        userId: params.userId,
        templateType: 'points_adjust',
        variables,
        batchId: b.id,
        senderId: params.operatorId,
      })
    } catch (err) {
      console.error('[v57.2 notifyPointsAdjust]', {
        error: String(err),
        code: (err as any)?.code,
        meta: (err as any)?.meta,
      })
      logger.error('积分变动通知失败', { error: String(err) })
    }
  })()
}
```

## 2.4 改动 3：admin 路由调通知

**文件**：`src/app/api/admin/users/[id]/points/route.ts`
**位置**：在事务结束后、`return NextResponse.json(...)` 之前
**参考**：balance 路由 line 154 的 `OrderNotificationService.notifyBalanceChange` 调用模式

**插入代码**：

```typescript
// v57.2 B: 触发积分变动通知
await OrderNotificationService.notifyPointsAdjust({
  userId: id,
  fieldLabel: result.fieldLabel,
  amount,
  newTotalPoints: result.updated.totalPoints,
  newUnlockedPoints: result.updated.unlockedPoints,
  newLockedPoints: result.updated.lockedPoints,
  reason: reason.trim(),
  operatorId: admin.id,
})
```

**注意顶部 import**：确认 `import { OrderNotificationService }` 已经在文件里（balance 路由已经 import 了）。如果 points 路由没有，需要加上。

## 2.5 通知模板登记

**文件**：`scripts/seed-points-adjust-template.cjs`（新建）

参考 `scripts/seed-balance-change-template.cjs` 的格式，创建 `points_adjust` 模板：

```javascript
// 模板要点：
// - code: 'points_adjust'
// - title: '账户积分变动通知'
// - content 模板：包含 fieldLabel / changeAmount / newTotalPoints / reason 变量
// - 渠道：站内信（in_app）
// - 状态：active
```

**执行**：

```bash
node scripts/seed-points-adjust-template.cjs
```

## 2.6 测试

**新建文件**：`__tests__/api/admin/users/points.test.ts`

参考 `__tests__/api/points/transfer.test.ts`（v56.2 写的）的 mock 模式，写 4 个 it：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/utils/admin-auth', () => ({
  verifyPermission: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    pointsRecord: { create: vi.fn() },
    notificationBatch: { create: vi.fn() },
  },
}))
vi.mock('@/lib/services/order-notification.service', () => ({
  OrderNotificationService: {
    notifyPointsAdjust: vi.fn(),
  },
}))

describe('POST /api/admin/users/[id]/points', () => {
  beforeEach(() => vi.clearAllMocks())

  it('调可用积分 → 写 pointsRecord', async () => {
    // mock verifyPermission 通过
    // mock tx.user.findUnique 返回老数据
    // mock tx.user.update 成功
    // mock tx.pointsRecord.create 成功
    // 验证：返回 success && pointsRecord.create 被调用且 type='admin_adjust'
  })

  it('调可用积分 → 触发 notifyPointsAdjust', async () => {
    // 验证：事务结束后 OrderNotificationService.notifyPointsAdjust 被调用
  })

  it('事务失败 → 全部回滚（不写 pointsRecord / 不发通知）', async () => {
    // mock tx.user.updateMany count=0（模拟余额不足）
    // 验证：抛出 error && pointsRecord.create 没被调用
  })

  it('鉴权失败 → 401', async () => {
    // mock verifyPermission 返回 error
    // 验证：返回 401
  })
})
```

**预计 +4 个 it**。

## 2.7 验证

```powershell
npx tsc --noEmit -p tsconfig.typecheck.json  # 必须 0 错误
pnpm test                                    # 必须全过（含新增 4 个 it）
pnpm build                                   # 必须 0 错误
pnpm test:coverage:check                     # 必须 ≥ 73.08%
```

## 2.8 提交

```bash
git add src/app/api/admin/users/[id]/points/route.ts \
        src/lib/services/order-notification.service.ts \
        __tests__/api/admin/users/points.test.ts \
        scripts/seed-points-adjust-template.cjs

git commit -m "fix(v57.2): admin 调积分写 pointsRecord + 触发通知（修复待排期-2）

- /api/admin/users/[id]/points 事务里加 tx.pointsRecord.create({ type: 'admin_adjust' })
- 加 OrderNotificationService.notifyPointsAdjust 方法（参考 notifyBalanceChange v46.11）
- admin points route 调通知（事务外，参考 balance route 模式）
- 通知模板 scripts/seed-points-adjust-template.cjs
- 测试 +4 个 it：写记录 / 发通知 / 失败回滚 / 鉴权

需求文档：待排期问题清单 待排期-2
同类 bug：v46.11 balance 调账没通知 / v46.12 退款完成没通知"

git push origin main
git log origin/main --oneline -1  # 铁律 1 验证
```

---

# v57 批次 / 步骤 3：每日解锁历史数据补建（候选 A）⚠️ **最复杂**

## 任务背景

胡子哥测试账号注册 5 天（升级发生在 v55.1 修复**之前**）：
- 总积分：1500
- 可用积分：0（**应该每天解锁 15 分，5 天应该有 ~75 分**）
- 锁定积分：0（**应该是 1500**）

**根因**：v55.1 修复（commit `289ac3d`，2026-06-27）**之前**的升级流程：
- 只调 `createPointsRecord` 加 totalPoints（→ totalPoints=1500）
- **没调 `createPointsUnlockSchedule`，没动 lockedPoints**
- 没 schedule → cron 跑了也没东西可解锁

**影响**：所有 v55.1 之前的升级用户都"卡在" lockedPoints=0 状态，积分永远释放不出来。

## 3.1 修复策略

**两阶段执行**（**关键**，避免一次性写错数据）：
1. **干跑（dry run）**：脚本输出"将修改哪些账号、改成什么"，**不写 DB**
2. **胡子哥看输出，确认无误 → 实跑（真写 DB）**

## 3.2 脚本设计

**新建文件**：`scripts/fix-unlock-schedules.ts`（不入代码库，是工具脚本）

**参考格式**：项目现有 `scripts/reset-admin-password.ts`（也是 ts 脚本）

**脚本逻辑**：

```typescript
// 干跑 / 实跑 双模式
//   node scripts/fix-unlock-schedules.ts --dry-run
//   node scripts/fix-unlock-schedules.ts --apply

import { prisma } from '@/lib/prisma'

async function main() {
  const isApply = process.argv.includes('--apply')
  
  console.log('========================================')
  console.log(`  每日解锁历史数据补建脚本`)
  console.log(`  模式: ${isApply ? '实跑（会写 DB）' : '干跑（只输出，不写）'}`)
  console.log('========================================\n')

  // 1. 找出所有用户
  const allUsers = await prisma.user.findMany({
    where: {
      status: { not: 'deleted' },
      totalPoints: { gt: 0 },
    },
    select: {
      id: true,
      phone: true,
      nickname: true,
      totalPoints: true,
      unlockedPoints: true,
      lockedPoints: true,
      createdAt: true,
      pointsUnlockSchedules: {
        where: { status: 'active' },
        select: { id: true, remainingPoints: true, totalPoints: true },
      },
    },
  })

  console.log(`共扫描 ${allUsers.length} 个有积分的用户\n`)

  // 2. 筛选异常用户
  const abnormalUsers = allUsers.filter((u) => {
    // 无 active schedule 且 (unlocked + locked) < total
    const hasActiveSchedule = u.pointsUnlockSchedules.length > 0
    const accounted = u.unlockedPoints + u.lockedPoints
    return !hasActiveSchedule && accounted < u.totalPoints
  })

  console.log(`异常用户数: ${abnormalUsers.length}\n`)

  if (abnormalUsers.length === 0) {
    console.log('✅ 所有用户数据正常，无需修复')
    return
  }

  // 3. 输出每个用户的修复方案
  const fixPlans = abnormalUsers.map((u) => {
    const diff = u.totalPoints - u.unlockedPoints - u.lockedPoints
    return {
      userId: u.id,
      phone: u.phone,
      nickname: u.nickname,
      totalPoints: u.totalPoints,
      unlockedPoints: u.unlockedPoints,
      lockedPoints: u.lockedPoints,
      diff,  // 应该补到 lockedPoints 的量
      newLockedPoints: u.lockedPoints + diff,
    }
  })

  console.log('===== 修复方案 =====\n')
  console.table(fixPlans.map((p) => ({
    phone: p.phone,
    nickname: p.nickname || '(空)',
    total: p.totalPoints,
    unlocked: p.unlockedPoints,
    locked: p.lockedPoints,
    diff: p.diff,
    'new locked': p.newLockedPoints,
  })))

  if (!isApply) {
    console.log('\n⚠️ 干跑模式：未写 DB。如确认无误，加 --apply 参数实跑')
    return
  }

  // 4. 实跑：每个用户建一个合并的 schedule
  const tomorrow = new Date()
  tomorrow.setHours(0, 0, 0, 0)
  tomorrow.setDate(tomorrow.getDate() + 1)

  let successCount = 0
  for (const plan of fixPlans) {
    await prisma.$transaction(async (tx) => {
      // lockedPoints += diff
      await tx.user.update({
        where: { id: plan.userId },
        data: { lockedPoints: { increment: plan.diff } },
      })

      // 建合并的 schedule
      await tx.pointsUnlockSchedule.create({
        data: {
          userId: plan.userId,
          orderId: '',  // 历史数据没有 order_id
          totalPoints: plan.diff,
          unlockedPoints: 0,
          remainingPoints: plan.diff,
          dailyUnlockRate: 0.01,
          totalDays: 100,
          completedDays: 0,
          status: 'active',
          nextUnlockDate: tomorrow,
        },
      })
    })
    successCount++
    console.log(`✅ 修复 ${plan.phone}（diff=${plan.diff}）`)
  }

  console.log(`\n========================================`)
  console.log(`  实跑完成: ${successCount}/${fixPlans.length}`)
  console.log(`========================================`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('脚本失败:', err)
    process.exit(1)
  })
```

## 3.3 关键设计点

1. **幂等性**：脚本逻辑依赖 `WHERE pointsUnlockSchedules.length === 0`，多次跑不会重复建 schedule
2. **多次升级合并**：胡子哥账号有 2 次升级（500+1000），但脚本按总差额建 1 个 schedule（1500），简化逻辑
3. **不影响手动调账**：胡子哥手动充的 500 不进 schedule，因为 unlockedPoints 已经 500，差额只算老升级部分
4. **不修改 totalPoints**：totalPoints 已经对，脚本只调整 lockedPoints + 建 schedule
5. **nextUnlockDate = 明天 0 点**：确保 cron 明天能立即开始解锁

## 3.4 执行流程

### 第一阶段：干跑

```bash
npx tsx scripts/fix-unlock-schedules.ts --dry-run
```

**预期输出**：

```
========================================
  每日解锁历史数据补建脚本
  模式: 干跑（只输出，不写）
========================================

共扫描 X 个有积分的用户

异常用户数: Y

===== 修复方案 =====

phone      nickname  total  unlocked  locked  diff  new locked
13800138001 用户8001   2000    500      0     1500     1500
...

⚠️ 干跑模式：未写 DB。如确认无误，加 --apply 参数实跑
```

**胡子哥确认**清单：
- 异常用户数合理
- 至少胡子哥自己的测试账号在列
- 差额 diff = 老升级积分（不是手动调账的部分）
- new locked = locked + diff

### 第二阶段：实跑

胡子哥点头后：

```bash
npx tsx scripts/fix-unlock-schedules.ts --apply
```

**预期输出**：

```
========================================
  每日解锁历史数据补建脚本
  模式: 实跑（会写 DB）
========================================

共扫描 X 个有积分的用户

异常用户数: Y

===== 修复方案 =====

...

✅ 修复 13800138001（diff=1500）
✅ 修复 13800138002（diff=500）
...

========================================
  实跑完成: Y/Y
========================================
```

### 第三阶段：手动触发 cron

实跑完成后，**手动触发一次** `GET /api/cron/daily-tasks`（带 Bearer token）让 dailyUnlock 立即跑一遍（不等明天）：

```bash
curl -X GET "https://mlm-platform001.vercel.app/api/cron/daily-tasks" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
```

> **注意**：`CRON_SECRET` 环境变量必须有，否则 middleware 会 401
> **如果本地有 .env 文件**：可以直接读 `$env:CRON_SECRET` 然后传

**预期响应**：

```json
{
  "success": true,
  "result": {
    "pointsUnlock": { "success": true, "count": Y },
    ...
  }
}
```

## 3.5 验证

实跑 + cron 触发后：

| 字段 | 用户 A 应有值 |
|------|--------------|
| totalPoints | 2000（不变） |
| unlockedPoints | 500 + 每日解锁（1% × 1500 = 15）= **515** |
| lockedPoints | 1500 - 15 = **1485** |
| 每日解锁 | 15 分/天 |

胡子哥重新登录 → `/dashboard/points` 看：
- 顶部统计：总 2000 / 可用 515 / 锁定 1485 / 每日解锁 15
- 积分明细多 1 条 unlock 类型记录（来自 dailyUnlock）

## 3.6 提交

**重要**：脚本文件 `scripts/fix-unlock-schedules.ts` 是工具脚本，**不入代码库**。提交时**只 commit 修改的代码**（如果有的话），脚本保留在本地。

但如果你想归档到代码库（参考 `scripts/reset-admin-password.ts` 也入了代码库），也可以。**派单建议归档**——以后类似迁移问题有参考。

**如果归档**：

```bash
git add scripts/fix-unlock-schedules.ts

git commit -m "chore(v57.3): 历史数据补建脚本 - 给无 schedule 但 totalPoints>0 的老账号补建 PointsUnlockSchedule

- 待排期-1：v55.1 修复之前升级的账号 lockedPoints=0 导致永远无法解锁
- 脚本支持 --dry-run / --apply 双模式
- 幂等：依赖 WHERE pointsUnlockSchedules.length === 0 条件
- 多次升级合并：按总差额建 1 个 schedule

注意：实跑后必须手动触发一次 GET /api/cron/daily-tasks 让 dailyUnlock 立即处理"

git push origin main
git log origin/main --oneline -1  # 铁律 1 验证
```

---

# v57 批次 / 步骤 4：验证 + 部署汇总

## 4.1 本地全流程验证

```powershell
# 在 D:\mlm-platform-source\mlm-platform 下执行

# 步骤 1-3 完成后
npx tsc --noEmit -p tsconfig.typecheck.json
pnpm test
pnpm test:coverage:check
pnpm build
```

**预期**：
- typecheck：0 错误
- test：全过，新增 4 个 it（步骤 2）
- coverage：≥ 73.08%（v56.2 baseline）
- build：0 错误

## 4.2 Git 提交 + 推送

3 个 commit 分别推送：

```bash
# 步骤 1 commit + push（已推送也行）
# 步骤 2 commit + push
# 步骤 3 commit + push（如果归档脚本）
```

每个 commit 后必须跑：
```bash
git log origin/main --oneline -1  # 铁律 1 验证远程 hash
```

## 4.3 Vercel 部署验证

每次 push 后：
1. 打开 https://vercel.com/dashboard → mlm-platform001 → Deployments
2. 看最新部署 commit hash 是否对应你刚 push 的 hash
3. Status 必须是 Ready（绿点）

## 4.4 真实链路验证（铁律 2）

步骤 1 部署后：
- 胡子哥在 admin 后台改 `points.transfer_fee_percent` 配置（比如改成 5）
- 胡子哥做一笔转账（v56.2 测试已经过）
- 预期：手续费 = 转账积分 × 5%

步骤 2 部署后：
- 胡子哥从后台给测试账号调 100 积分
- 预期：积分明细多 1 条 admin_adjust 记录 + 用户端收到站内通知

步骤 3 实跑 + cron 触发后：
- 胡子哥账号：lockedPoints = 1485、unlockedPoints = 515、totalPoints = 2000
- 积分明细多 1 条 unlock 记录（每日 15 分）

---

# v57 批次 / 步骤 5：胡子哥验收清单

## 5.1 步骤 1 验收（5 分钟）

- [ ] 改 `points.transfer_fee_percent` 配置（比如 10 → 5）
- [ ] 做一笔 100 积分转账
- [ ] 预期：手续费 = 5 积分（不是默认的 10）

## 5.2 步骤 2 验收（5 分钟）

- [ ] 后台给测试账号调 100 积分（解锁积分 +100）
- [ ] 登录测试账号 → `/dashboard/points`
- [ ] 预期：积分明细多 1 条「管理员调账：可用积分增加 100 积分」记录
- [ ] 预期：Header 铃铛收到「账户积分变动通知」

## 5.3 步骤 3 验收（需要猫爪配合）

- [ ] **干跑阶段**：猫爪跑 `npx tsx scripts/fix-unlock-schedules.ts --dry-run`，把输出截图给你
- [ ] 你看输出：异常用户数合理 + 你的账号在列 + 差额正确（1500 不是 2000）
- [ ] **点头后**：猫爪实跑 `npx tsx scripts/fix-unlock-schedules.ts --apply`
- [ ] 猫爪手动触发一次 cron `GET /api/cron/daily-tasks`
- [ ] 你重新登录 → `/dashboard/points`
- [ ] 预期：lockedPoints = 1485、unlockedPoints = 515、总积分 2000
- [ ] 预期：积分明细多 1 条「积分解锁（第 1 天，每日 1%）」记录，+15 积分

## 5.4 全局回归测试（防铁律 6 业务链路破坏）

跑一次 v56.2 的 5 个转赠场景，确认没破坏：
- 弹窗打开 + 手机号校验 + 防自转 + 余额不足禁用 + 转账成功 toast

---

# v57 批次 / 派单前必做 4 步检查（铁律 11）

1. ✅ **grep 业务 service 方法的真实调用入口**
   - `/api/admin/users/[id]/points`：1 处 POST（admin 后台调账页面）
   - `/api/points/transfer`：1 处 POST（v56.2 转赠弹窗）
   - `OrderNotificationService.notifyPointsAdjust`：新建，0 处调用
   - 不破坏现有调用入口

2. ✅ **grep 枚举值**
   - `pointsRecord.type` 是 String 自由类型，无需改 schema
   - 不需要新 enum

3. ✅ **read 相关工具函数**
   - ✅ `OrderNotificationService.notifyBalanceChange`（line 105-157，参考模板）
   - ✅ `api/admin/users/[id]/balance/route.ts`（line 118-129, 154-161，balanceRecord + 通知模式）
   - ✅ `api/points/transfer/route.ts`（line 42 待修复）
   - ✅ `scripts/reset-admin-password.ts`（脚本格式参考）
   - ✅ `PointsService.createPointsUnlockSchedule`（line 168-201，建 schedule 模式）

4. ✅ **业务冲突检查**
   - 步骤 1（改 1 行）零风险
   - 步骤 2（写 pointsRecord + 通知）v56.2 转账流程不依赖 admin points 路由
   - 步骤 3（建 schedule）会动 lockedPoints 但不动 totalPoints / unlockedPoints，不破坏现有数据
   - 与 v56.x / v55.x 已完成任务无冲突

---

# v57 批次 / 派单铁律清单

- **铁律 1**：commit + push 后必须 `git log origin/main --oneline -1` 验证远程 hash
- **铁律 2**：UI 改动必须本地 dev server 真实截图（步骤 2、3 不涉及 UI 改动，但验收需要截图）
- **铁律 5**：默认禁止 `$queryRaw` / `$queryRawUnsafe`（步骤 3 脚本不用，纯 Prisma ORM）
- **铁律 6**：业务链路真实跑通（步骤 5.4 全局回归测试）
- **铁律 7**：admin 页面 fetch 加 Authorization（本任务无新 admin 页面）
- **铁律 8**：派单检查清单 6 步
- **铁律 11**：派单前 grep 业务 service 方法的真实调用入口（已完成）

---

# v57 批次 / 风险点总览

| 风险 | 等级 | 缓解 |
|------|------|------|
| 步骤 1 改 1 行容易漏提交 | 低 | typecheck + build 必跑 |
| 步骤 2 通知模板未在 DB 中存在 | 中 | 提前跑 `seed-points-adjust-template.cjs` |
| 步骤 2 pointsRecord.create 字段类型不匹配 | 低 | 字段都是已有字段，参考 createPointsRecord |
| 步骤 3 脚本幂等性 | 中 | `WHERE NOT EXISTS` 模式 + 多次跑测试 |
| 步骤 3 多次升级合并 vs 拆分 | 低 | 派单明确"建 1 个 schedule" |
| 步骤 3 老数据可能已有部分 unlock | 低 | 干跑输出含每个用户的 schedule 状态 |
| 步骤 3 cron 触发需要 CRON_SECRET | 中 | 派单明确要求从 .env 读 |

---

# v57 批次 / 决策记录

- 胡子哥 2026-06-28 决策：**选项 1** —— 先清待排期问题 3 条，再做新功能
- 批次命名：**v57**（继 v56.2 之后）
- 步骤 1（C）：改 1 行，工作量 5 分钟
- 步骤 2（B）：事务加 pointsRecord + 加通知方法，工作量半天
- 步骤 3（A）：写一次性补建脚本，两阶段执行，工作量 1-2 天
- 步骤 3 干跑先看清单，确认后实跑
- 步骤 3 实跑后手动触发 cron（不等明天）
- 步骤 3 脚本归档到代码库（参考 reset-admin-password.ts）

---

## 完成后告诉胡子哥

- **每个步骤的 commit hash + 远程 hash 验证通过（铁律 1）**
- **每个步骤的改动文件清单**
- **每个步骤的测试结果**（步骤 2 新增 4 个 it）
- **步骤 3 干跑阶段输出截图**：异常用户数 + 修复方案表
- **步骤 3 实跑后输出截图**：实跑日志 + cron 触发响应
- **真实截图**（铁律 2）—— 不需要 UI 截图，但需要 Vercel 部署截图：
  - 每次 push 后 Vercel Dashboard 最新部署 commit = 你的 commit hash
  - 步骤 3 干跑输出（表格截图）
  - 步骤 3 实跑输出（成功截图）
  - cron 触发响应截图（JSON 里 pointsUnlock count > 0）
- **胡子哥账号数据截图**（铁律 2）：
  - 实跑 + cron 触发后 `/dashboard/points`：lockedPoints = 1485、unlockedPoints = 515、总 2000
  - 积分明细多 1 条 unlock 记录