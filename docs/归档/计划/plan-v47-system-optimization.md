# MLM Platform 系统优化执行计划 v47

> **版本**: v47  
> **生成时间**: 2026-06-26  
> **目标**: 系统性优化架构、性能、安全、体验、可维护性五大维度  
> **执行方式**: 可按优先级分批实施，每批独立可交付

---

## 📋 执行总览

| 批次 | 优先级 | 任务数 | 预计工期 | 交付标准 |
|------|--------|--------|----------|----------|
| **Batch 1** | 🔴 P0-紧急 | 5个 | 1周 | 安全漏洞修复 + 核心功能恢复 |
| **Batch 2** | 🟡 P1-重要 | 7个 | 2周 | 体验优化 + 性能提升 |
| **Batch 3** | 🟢 P2-长期 | 5个 | 1个月 | 技术债清理 + 架构升级 |

---

## 🔴 Batch 1: P0-紧急修复（1周）

### 任务 1.1: 支付密码强制生效

**问题描述**: 前端调用旧 `/api/orders/[id]/pay` 路由，该路由无支付密码校验；新路由 `/api/orders/[id]/verify-payment` 已实现密码校验但无前端调用。

**影响**: 用户可无密码支付，存在资金风险

**执行步骤**:

1. **修改支付页面** `src/app/payment/order/[orderId]/page.tsx`
   ```typescript
   // 找到 handleMockPay 函数（约 line 111）
   // 将调用从:
   fetch(`/api/orders/${order.id}/pay`, ...)
   // 改为:
   fetch(`/api/orders/${order.id}/verify-payment`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ password: paymentPassword })
   })
   ```

2. **修改订单列表支付** `src/app/dashboard/orders/page.tsx`
   ```typescript
   // 找到 handlePay 函数（约 line 101）
   // 同样改为调用 verify-payment
   // 需先弹出输入框获取支付密码
   ```

3. **废弃旧路由**（可选，建议保留兼容）
   - 在 `/api/orders/[id]/pay/route.ts` 中添加日志警告
   - 或返回 410 Gone 状态码

**验证标准**:
- [ ] 支付时必须输入6位数字密码
- [ ] 密码错误时支付失败并提示
- [ ] 未设置密码时提示先设置
- [ ] 支付成功后 `paymentVerified` 字段为 true

**相关文件**:
- `src/app/payment/order/[orderId]/page.tsx`
- `src/app/dashboard/orders/page.tsx`
- `src/app/api/orders/[id]/verify-payment/route.ts`

---

### 任务 1.2: 角色权限白名单统一修复

**问题描述**: 大量路由硬编码 `['admin', 'super_admin']`，但数据库中 `role` 字段实际值为 `user/auditor/support_admin/goods_admin/finance_admin/super_admin`，`'admin'` 角色不存在。

**影响**: 非 super_admin 的管理员角色（如 goods_admin/finance_admin）访问接口返回 403

**执行步骤**:

1. **确定权限矩阵**（需产品确认）
   | 路由 | 应有权限 |
   |------|----------|
   | `/api/admin/orders/*` | super_admin, goods_admin |
   | `/api/admin/refunds/*` | super_admin, finance_admin |
   | `/api/admin/users/*` | super_admin, support_admin |
   | `/api/admin/notifications/*` | super_admin |
   | `/api/admin/stats/*` | super_admin, finance_admin |

2. **批量替换白名单**
   ```bash
   # 使用 grep 找到所有需要修改的文件
   grep -r "verifyPermission.*\['admin', 'super_admin'\]" src/app/api/admin/
   ```

3. **逐文件修改**（示例）
   ```typescript
   // 修改前:
   await verifyPermission(request, ['admin', 'super_admin'])
   
   // 修改后（以订单管理为例）:
   await verifyPermission(request, ['super_admin', 'goods_admin'])
   ```

**验证标准**:
- [ ] goods_admin 能正常访问订单管理
- [ ] finance_admin 能正常访问退款管理
- [ ] support_admin 能正常访问用户管理
- [ ] 普通 user 访问返回 403

**相关文件**:
- `src/app/api/admin/orders/[id]/status/route.ts`
- `src/app/api/admin/refunds/[id]/review/route.ts`
- `src/app/api/admin/refunds/[id]/complete/route.ts`
- `src/app/api/admin/users/[id]/*/route.ts`
- `src/app/api/admin/notifications/*/route.ts`
- `src/app/api/admin/stats/*/route.ts`

---

### 任务 1.3: 自动确认收货定时任务挂载

**问题描述**: `OrderService.autoCompleteOrders()` 已实现（7天自动完成），但 `cron.ts` 未调用，全局 0 调用方。

**影响**: 已发货订单永远不会自动完成，售后窗口不关闭

**执行步骤**:

1. **修改定时任务文件** `src/lib/utils/cron.ts`
   ```typescript
   // 在 runDailyTasks 函数中添加
   import { OrderService } from '@/lib/services/order.service'
   
   export async function runDailyTasks() {
     logger.info('开始执行每日定时任务')
     
     // 1. 积分解锁
     await PointsService.dailyUnlock()
     
     // 2. 分红结算
     await DividendService.settleDailyDividends()
     
     // 3. 自动确认收货（新增）
     const completedCount = await OrderService.autoCompleteOrders()
     logger.info(`自动确认收货完成: ${completedCount} 个订单`)
     
     logger.info('每日定时任务执行完毕')
   }
   ```

2. **配置 Vercel Cron**（如使用 Vercel 部署）
   创建 `vercel.json`:
   ```json
   {
     "crons": [
       {
         "path": "/api/cron/daily",
         "schedule": "0 2 * * *"
       }
     ]
   }
   ```

3. **创建 Cron API 路由** `src/app/api/cron/daily/route.ts`
   ```typescript
   import { NextRequest, NextResponse } from 'next/server'
   import { runDailyTasks } from '@/lib/utils/cron'
   
   export async function GET(request: NextRequest) {
     // 验证 Cron Secret
     const authHeader = request.headers.get('authorization')
     if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
     }
     
     await runDailyTasks()
     return NextResponse.json({ success: true })
   }
   ```

**验证标准**:
- [ ] 手动调用 `pnpm daily:tasks` 能看到自动完成日志
- [ ] 发货7天后的订单状态变为 completed
- [ ] 自动完成后触发相应通知

**相关文件**:
- `src/lib/utils/cron.ts`
- `src/lib/services/order.service.ts` (line 250-268)
- `vercel.json` (新建)
- `src/app/api/cron/daily/route.ts` (新建)

---

### 任务 1.4: N+1 查询优化（品牌管理奖）

**问题描述**: `findBrandBonusRecipients` 函数循环中多次调用 `prisma.user.findUnique`，层级深时查询次数爆炸。

**影响**: 高等级用户下单时响应慢，数据库压力大

**执行步骤**:

1. **分析当前实现** `src/lib/services/reward.service.ts` (line 7-41)
   - 当前：每层 2 次查询（parentId + level）
   - 目标：1 次查询获取整条链

2. **优化方案：CTE 递归查询**
   ```typescript
   // 使用 Prisma 的 $queryRaw 或分两步查询
   // 方案 A：先查整条链，内存过滤
   async function findBrandBonusRecipientsOptimized(
     buyerId: string,
     maxLayers: number
   ) {
     // 1. 一次性查询所有上级（最多 maxLayers 层）
     const chain: string[] = []
     let currentId = buyerId
     for (let i = 0; i < maxLayers; i++) {
       const user = await prisma.user.findUnique({
         where: { id: currentId },
         select: { parentId: true }
       })
       if (!user?.parentId) break
       chain.push(user.parentId)
       currentId = user.parentId
     }
     
     // 2. 批量查询所有上级的 level
     const parents = await prisma.user.findMany({
       where: { id: { in: chain } },
       select: { id: true, level: true }
     })
     
     // 3. 按顺序过滤
     return chain
       .map((id, index) => ({ 
         userId: id, 
         layer: index + 1,
         level: parents.find(p => p.id === id)?.level 
       }))
       .filter(p => p.level && p.level >= MEMBER_LEVELS.DISTRIBUTOR)
   }
   ```

**验证标准**:
- [ ] 品牌管理奖发放时间 < 100ms（原可能 > 500ms）
- [ ] 数据库查询次数从 2n 降到 2

**相关文件**:
- `src/lib/services/reward.service.ts`

---

### 任务 1.5: API 限流加固

**问题描述**: `rate-limit.ts` 存在但只有 1 处引用，登录/支付等敏感接口无防护。

**影响**: 存在暴力破解、刷单等风险

**执行步骤**:

1. **检查现有实现** `src/lib/utils/rate-limit.ts`

2. **在关键路由添加限流**
   ```typescript
   // src/app/api/auth/login/route.ts
   import { rateLimit } from '@/lib/utils/rate-limit'
   
   export async function POST(request: NextRequest) {
     // 限流：每IP每分钟5次
     const limitResult = await rateLimit(request, { max: 5, window: 60 })
     if (!limitResult.success) {
       return NextResponse.json({ error: '请求过于频繁' }, { status: 429 })
     }
     // ... 原有逻辑
   }
   ```

3. **需要加限流的路由清单**:
   - `/api/auth/login` - 防暴力破解
   - `/api/auth/register` - 防批量注册
   - `/api/orders/[id]/verify-payment` - 防刷单
   - `/api/user/payment-password/set` - 防篡改
   - `/api/admin/users/[id]/balance` - 防资金操作滥用

**验证标准**:
- [ ] 快速连续请求返回 429
- [ ] 正常频率请求不受影响
- [ ] 限流计数正确重置

**相关文件**:
- `src/lib/utils/rate-limit.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/register/route.ts`
- `src/app/api/orders/[id]/verify-payment/route.ts`

---

## 🟡 Batch 2: P1-体验优化（2周）

### 任务 2.1: 退款全流程通知补全

**问题描述**: 退款申请提交、审核通过、确认完成三个节点均无用户通知。

**执行步骤**:

1. **申请提交通知** `src/app/api/orders/[id]/refund/route.ts`
   ```typescript
   // 创建 RefundRequest 后添加
   await sendInApp({
     userId: order.userId,
     type: 'refund_submitted',
     title: '退款申请已提交',
     content: `订单 ${order.orderNo} 的退款申请已提交，请等待审核`
   })
   ```

2. **审核结果通知** `src/app/api/admin/refunds/[id]/review/route.ts`
   ```typescript
   // 审核后添加
   await sendInApp({
     userId: refundRequest.userId,
     type: result === 'approved' ? 'refund_approved' : 'refund_rejected',
     title: result === 'approved' ? '退款申请已通过' : '退款申请被拒绝',
     content: `您的退款申请已被${result === 'approved' ? '通过' : '拒绝'}${adminComment ? `，原因：${adminComment}` : ''}`
   })
   ```

3. **退款完成通知** `src/app/api/admin/refunds/[id]/complete/route.ts`
   ```typescript
   // 退款完成后添加
   await sendInApp({
     userId: refundRequest.userId,
     type: 'refund_completed',
     title: '退款已完成',
     content: `订单 ${order.orderNo} 的退款 ¥${refundRequest.amount} 已退回您的余额`
   })
   ```

**验证标准**:
- [ ] 申请提交后用户收到通知
- [ ] 审核后用户收到通知
- [ ] 退款完成后用户收到通知
- [ ] 通知内容准确包含金额、订单号

---

### 任务 2.2: 待支付订单超时自动取消

**问题描述**: pending 订单永远不会自动取消，库存被长期占用。

**执行步骤**:

1. **修改定时任务** `src/lib/utils/cron.ts`
   ```typescript
   // 在 runDailyTasks 中添加
   static async cancelExpiredOrders() {
     const twentyFourHoursAgo = new Date()
     twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)
     
     const expiredOrders = await prisma.order.findMany({
       where: {
         status: 'pending',
         createdAt: { lt: twentyFourHoursAgo }
       }
     })
     
     for (const order of expiredOrders) {
       await OrderService.cancelOrder(order.id)
       logger.info(`自动取消过期订单: ${order.id}`)
     }
   }
   ```

2. **添加到每日任务**
   ```typescript
   // 在 runDailyTasks 中调用
   await OrderService.cancelExpiredOrders()
   ```

**验证标准**:
- [ ] 创建24小时后的pending订单自动取消
- [ ] 库存正确释放
- [ ] 用户收到取消通知

---

### 任务 2.3-2.7: 其他体验优化

| 任务 | 描述 | 文件 | 验收标准 |
|------|------|------|----------|
| 2.3 | 订单详情页加取消按钮 | `dashboard/orders/[id]/page.tsx` | 详情页有取消按钮，功能同列表 |
| 2.4 | 取消订单记录原因 | `dashboard/orders/page.tsx` + API | 弹窗可选输入原因，保存到 order.cancelReason |
| 2.5 | 退款文案更新 | `admin/refunds/page.tsx:532` | 文案改为"确认后将执行退款" |
| 2.6 | 收益明细过滤refunded | `dashboard/rewards/page.tsx` | 不显示已退款奖励，或标记为已退回 |
| 2.7 | setInterval内存泄漏修复 | 20+文件 | 所有setInterval在useEffect return中清理 |

---

## 🟢 Batch 3: P2-技术债（1个月）

### 任务 3.1: Service层拆分

**目标**: 将 `OrderService`（680+行）拆分为职责单一的Service

**拆分方案**:
```
OrderService →
  ├── OrderCreationService（创建订单）
  ├── OrderPaymentService（支付相关）
  ├── OrderLifecycleService（发货/完成/取消）
  ├── OrderRefundService（退款相关）
  └── OrderQueryService（查询相关）
```

---

### 任务 3.2-3.5: 其他技术债

| 任务 | 描述 | 方案 |
|------|------|------|
| 3.2 | 通知队列化 | 引入Bull/Redis，异步发送通知 |
| 3.3 | 缓存层引入 | Redis缓存热点数据（商品、用户等级） |
| 3.4 | 图片优化 | Next.js Image + CDN + 懒加载 |
| 3.5 | 测试覆盖 | Jest + Playwright E2E测试 |

---

## 📐 技术规范（执行时必须遵守）

### 代码规范
1. **所有API路由必须try/catch**
2. **所有数据库操作必须select字段，禁止`*`**
3. **所有资金操作必须事务包裹**
4. **所有状态变更必须记操作日志**

### Git规范
```bash
# 提交格式
type: subject

# type列表
feat: 新功能
fix: 修复
refactor: 重构
docs: 文档
chore: 杂项

# 示例
feat: 支付密码强制校验
git commit -m "feat: 支付密码强制校验 - 前端改调verify-payment路由"
```

### 验证流程
```bash
# 1. 本地验证
pnpm dev          # 启dev server
pnpm build        # 必须0错误

# 2. 功能验证
# - 走通完整业务流程
# - 截图给胡子老师确认

# 3. 提交
git add .
git commit -m "type: subject"
git push origin main

# 4. 验证推送
git log origin/main --oneline -1

# 5. 验证部署
# 打开Vercel Dashboard确认Ready
```

---

## 📞 问题反馈

执行中遇到任何问题：
1. 先查 `AGENTS.md` 项目规范
2. 再查本执行计划相关章节
3. 仍无法解决 → 联系胡子老师

---

**文档维护**: 每完成一个任务，在此文档对应项打勾并记录commit hash
