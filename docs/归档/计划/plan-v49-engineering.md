# MLM Platform 执行计划 v49 - 工程操作版

> **版本**: v49  
> **生成时间**: 2026-06-26  
> **组织方式**: 按文件/模块聚合，减少工程切换成本  
> **执行原则**: 一个文件改完再改下一个，便于CR和回滚

---

## 📁 文件分组总览

| 组 | 文件 | 任务数 | 工期 | 依赖 |
|----|------|--------|------|------|
| **Group A** | `dashboard/rewards/page.tsx` | 2个 | 4小时 | 无 |
| **Group B** | `prisma/schema.prisma` + migration | 1个 | 2小时 | 无 |
| **Group C** | `lib/services/*.ts` | 3个 | 1天 | Group B |
| **Group D** | `api/*` 路由文件 | 4个 | 1天 | Group C |
| **Group E** | `admin/*` 后台页面 | 2个 | 4小时 | Group D |
| **Group F** | `payment/*` + `dashboard/orders/*` | 2个 | 4小时 | 无 |
| **Group G** | `lib/utils/*.ts` + config | 2个 | 4小时 | 无 |

---

## Group A: 收益明细页面 (dashboard/rewards/page.tsx)

**工期**: 4小时  
**执行顺序**: 先A1 → 再A2

### A1. 移除团队奖tab

**原因**: 业务需求v2已取消团队奖，前端tab是历史遗留

**改动位置**: line 46-54, 63-68

```typescript
// 修改前
const TYPE_TABS: { key: RewardTypeKey; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: '全部', icon: <TrendingUp className="w-4 h-4" /> },
  { key: 'referral', label: '直推奖', icon: <UserPlus className="w-4 h-4" /> },
  { key: 'team', label: '团队奖', icon: <Users className="w-4 h-4" /> },  // 删除
  { key: 'brand_bonus', label: '品牌管理奖', icon: <BadgeCheck className="w-4 h-4" /> },
  { key: 'dividend', label: '分红奖', icon: <PiggyBank className="w-4 h-4" /> },
]

// 修改后
const TYPE_TABS = [
  { key: 'all', label: '全部', icon: <TrendingUp className="w-4 h-4" /> },
  { key: 'referral', label: '直推奖', icon: <UserPlus className="w-4 h-4" /> },
  { key: 'brand_bonus', label: '品牌管理奖', icon: <BadgeCheck className="w-4 h-4" /> },
  { key: 'dividend', label: '分红奖', icon: <PiggyBank className="w-4 h-4" /> },
]
```

同样删除 `TYPE_CONFIG` 中的 `team` 配置 (line 63-68)

**验证**:
- [ ] 收益明细页面只有4个tab（全部/直推/品牌/分红）
- [ ] 切换tab正常显示数据

---

### A2. 收益明细过滤已退款奖励

**原因**: 当前显示status='refunded'的奖励，用户困惑

**改动位置**: 需修改API，见Group D

---

## Group B: 数据库 Schema (prisma/schema.prisma)

**工期**: 2小时  
**执行顺序**: B1 → 执行migration

### B1. BalanceRecord type 添加 earnings_void

**改动位置**: 找到 BalanceRecord model 的 type 字段

```prisma
model BalanceRecord {
  // ...其他字段
  type String // 添加 earnings_void 到枚举或注释
  
  // 如果是枚举，修改为：
  // type BalanceRecordType
}
```

**migration命令**:
```bash
npx prisma migrate dev --name add_earnings_void_type
npx prisma generate
```

**验证**:
- [ ] migration成功执行
- [ ] TypeScript类型更新

---

## Group C: Service层 (lib/services/*.ts)

**工期**: 1天  
**执行顺序**: C1 → C2 → C3  
**依赖**: Group B完成

### C1. reward.service.ts - 添加团队奖发放（如需要）

**注意**: 先确认业务是否真的要团队奖！v2需求已删除。

如确认需要，实现 `createTeamReward` 方法。

---

### C2. reward.service.ts - 统计修复

**改动位置**: `getUserRewardStats` 方法 (line 352-380)

如团队奖取消，确保不返回teamTotal或返回0。

---

### C3. 各Service - BalanceRecord description 4字段标签

**改动文件**:
- `reward.service.ts` - 直推/品牌/分红奖发放
- `dividend.service.ts` - 分红结算
- `order.service.ts` - 订单支付/退款
- `admin.service.ts` - 后台调账

**改动示例**:
```typescript
// 修改前
description: `直推奖 ¥${amount}`

// 修改后  
description: `直推奖 ¥${amount}`,
// 同时返回字段标签信息给前端展示
metadata: {
  field: 'earningsAvailable',
  change: `+¥${amount}`
}
```

**或前端根据type自动拼接**（推荐）

---

## Group D: API路由 (app/api/*)

**工期**: 1天  
**执行顺序**: D1 → D2 → D3 → D4

### D1. /api/rewards/route.ts - 过滤已退款

**改动**:
```typescript
const rewards = await prisma.reward.findMany({
  where: {
    userId: auth.userId,
    status: { not: 'refunded' }, // 添加这行
    ...(type && { type }),
  },
})
```

---

### D2. /api/admin/users/[id]/balance/route.ts - earnings_void type

**改动**: 调账时支持传 `earnings_void` type

```typescript
// 添加 earnings_void 到允许的type列表
const ALLOWED_TYPES = ['balance', 'frozenBalance', 'earnings_void', ...]
```

---

### D3. /api/admin/refunds/[id]/complete/route.ts - 文案更新

**改动位置**: 返回的message或前端页面

```typescript
// 修改前
message: '退款已完成，实际退款逻辑后续可扩展'

// 修改后
message: '退款已完成，金额已退回用户余额'
```

---

### D4. 权限白名单批量修复

**改动文件列表**:
- `admin/orders/[id]/status/route.ts`
- `admin/refunds/[id]/review/route.ts`
- `admin/refunds/[id]/complete/route.ts`
- `admin/notifications/*/route.ts`
- `admin/stats/*/route.ts`

**改动示例**:
```typescript
// 修改前
await verifyPermission(request, ['admin', 'super_admin'])

// 修改后（按业务）
await verifyPermission(request, ['super_admin', 'goods_admin']) // 订单管理
await verifyPermission(request, ['super_admin', 'finance_admin']) // 退款管理
```

---

## Group E: 后台页面 (app/admin/*)

**工期**: 4小时  
**依赖**: Group D完成

### E1. admin/refunds/page.tsx - 文案更新

**改动位置**: line 532

```typescript
// 修改前
<p className="text-xs text-gray-400">确认后状态将变更为"已完成"，实际退款逻辑后续可扩展。</p>

// 修改后
<p className="text-xs text-gray-400">确认后将执行退款，金额将退回用户余额。</p>
```

---

### E2. admin/finance/page.tsx - 团队奖筛选移除

如团队奖取消，移除团队奖相关筛选条件。

---

## Group F: 支付相关 (payment/* + dashboard/orders/*)

**工期**: 4小时

### F1. payment/order/[orderId]/page.tsx - 改调verify-payment

**改动位置**: `handleMockPay` 函数

```typescript
// 修改前
fetch(`/api/orders/${order.id}/pay`, ...)

// 修改后
fetch(`/api/orders/${order.id}/verify-payment`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: paymentPassword })
})
```

---

### F2. dashboard/orders/page.tsx - 同样改调verify-payment

**改动位置**: `handlePay` 函数 (line 101)

---

## Group G: 工具函数 (lib/utils/*.ts)

**工期**: 4小时

### G1. cron.ts - 添加自动确认收货

**改动**:
```typescript
export async function runDailyTasks() {
  await PointsService.dailyUnlock()
  await DividendService.settleDailyDividends()
  await OrderService.autoCompleteOrders() // 添加这行
}
```

---

### G2. rate-limit.ts - 扩展使用

在关键路由引入限流（见Group D各路由文件）

---

## 执行检查清单

### 每个Group完成后
- [ ] `pnpm build` 0错误
- [ ] 相关页面功能验证
- [ ] `git commit -m "group-x: 描述"`

### 全部完成后
- [ ] `git push origin main`
- [ ] `git log origin/main --oneline -1` 验证
- [ ] Vercel Dashboard 确认 Ready

---

## 快速导航

| 你想改哪里 | 跳到 |
|-----------|------|
| 收益明细页面 | Group A |
| 数据库改字段 | Group B |
| 奖励发放逻辑 | Group C |
| 接口权限/过滤 | Group D |
| 后台页面文案 | Group E |
| 支付密码 | Group F |
| 定时任务 | Group G |
