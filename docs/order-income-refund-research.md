# mlm-platform 现状调研报告 — 订单状态机 / 收益到账 / 退款拦截

> 调研时间：2026-06-23
> 调研范围：`D:\mlm-platform-source\mlm-platform`
> 调研方式：源码精读 + grep 全量验证，**所有结论均有源码引用**
> 报告状态：v1，待设计阶段二次校核

---

## 0. 摘要（先看这里）

| 模块 | 现状 | 评价 |
|------|------|------|
| **订单状态机** | 6 个状态：`pending/paid/shipped/completed/refunded/cancelled`；前端硬编码、API 有 `VALID_TRANSITIONS` 白名单 | **基本完整**，但 `pending → cancelled` 与 `paid → cancelled` 已被实现，**未在管理员 UI 中明确暴露"中断订单后状态回退/收益回退"的语义** |
| **支付密码** | 字段 `User.paymentPasswordHash`（bcryptjs 6位数字）；路由 `/api/orders/[id]/verify-payment` 已实现 | **后端完整，前端错位** —— `payment/order/[orderId]/page.tsx` 仍调用旧的 `/api/orders/[id]/pay`，**完全没用到 verify-payment**，且 verify-payment 路由**没有任何前端调用方** |
| **支付 + 发奖** | `verify-payment` 事务内 `paidAt` + `balance decrement` + `balanceRecord` 一次到位；`RewardService.processOrderRewards` 立即触发 | **链路已闭环**（v43-4 修复了 payOrder 重复 updateMany 的 P0 bug） |
| **退款申请** | `RefundRequest(status=pending/approved/rejected/completed)`；管理员"通过 → 确认退款"两步审核 | **流程完整**，**实际退款逻辑在 `OrderService.requestRefund` 中执行（v54a 修复）** |
| **退款扣回奖励** | `RewardService.processRefund`：扣回 `reward(referral/brand_bonus)` + 删除 `dividend` + 写 `balanceRecord(type=refund_reward/refund_dividend)` | **已实现**，且会校验余额（line 402-403，余额不足会抛错） |
| **余额流水 vs 收益明细** | 余额流水走 `BalanceRecord` 表（含全部类型）；收益明细走 `Reward` 表（**只含 referral/brand_bonus/dividend**） | **数据源不同**，这是 8001 的 3 笔直推奖"在余额流水能看到但收益明细看不到"的根因之一 |
| **自动确认收货** | `OrderService.autoCompleteOrders` 函数存在 | **没有任何代码调用**——前端没入口，cron 没挂载 |
| **定时任务** | `src/lib/utils/cron.ts`：`dailyUnlock` + `settleDailyDividends`；`package.json` 有 `daily:tasks` 脚本 | **没有 vercel.json / schedule 配置**——必须手动 `pnpm daily:tasks`，Vercel 部署后**不能自动跑** |
| **管理员角色权限** | 大量路由用 `verifyPermission(req, ['admin', 'super_admin'])` 但 schema/admin/users 提供的是 `user/auditor/support_admin/goods_admin/finance_admin/super_admin` | **存在 bug**：`admin` 角色不会被任何代码路径写入，**所有 `'admin', 'super_admin'` 白名单的路由只有 super_admin 能访问** |

---

## 1. Prisma Schema 现状

文件：`D:\mlm-platform-source\mlm-platform\prisma\schema.prisma`

### 1.1 `User` 模型（line 10-56）

**余额相关字段**（line 21-25）：
- `balance` (Float) — 可用余额，单位元
- `frozenBalance` (Float) — 冻结余额（提现冻结用）
- `totalPoints` (Int) — 累计积分
- `unlockedPoints` (Int) — 可用积分
- `lockedPoints` (Int) — 锁定积分（升级积分每日释放用）

**等级 / 推荐关系**（line 17-20）：
- `level` (Int, default 1) — 0=游客, 1=会员, 2=经销商, 3=主任, 4=经理, 5=总监, 6=总裁, 7=董事
- `referrerId` — 推荐人（直推链）
- `parentId` + `position` — 安置链（用于品牌管理奖）

**业绩字段**（line 26-28）：
- `upgradeProductCount` (Int) — 升级产品购买数量（晋升经销商用）
- `directSalesAmount` (Float) — 直推销售额
- `directDistributorCount` (Int) — 直推经销商人数

**角色**（line 29）：
- `role` (String, default `"user"`)
- **真实可用值**（来自 `src/app/admin/users/page.tsx:792-797`）：
  ```
  user / auditor / support_admin / goods_admin / finance_admin / super_admin
  ```
- `verifyPermission` 中常用 `'admin'` 这个值，**但没有任何代码路径写入 `role: 'admin'`**（见 §7.2 bug）

**支付密码**（line 49）：
- `paymentPasswordHash` (String?) — bcryptjs 哈希，6 位数字（详见 §3）

### 1.2 `Order` 模型（line 103-133）

**状态字段**：
- `status` (String, default `"pending"`)

**真实状态枚举**（来自 `src/lib/constants.ts:23-30` 和所有路由的 hardcoded 字符串）：
```
pending → paid → shipped → completed
         ↓        ↓
    cancelled  refunded（任意时刻经退款流程进入）
```

**时间字段**：
- `paidAt` — 支付成功时间
- `shippedAt` — 发货时间
- `completedAt` — 确认收货时间
- `cancelledAt` — 取消时间
- ⚠️ **注意**：`Order` 模型**没有 `refundedAt` 字段**（schema 中没有这个 column）—— 退款时间只能通过 `updatedAt` 推断

**v43-2 新增字段**（line 124-127）：
- `recipientName` / `recipientPhone` / `shippingAddress` — 收货信息
- `paymentVerified` (Boolean) — 支付密码是否验证通过

### 1.3 跟金额变动相关的所有模型

| 模型 | 关键字段 | 用途 | 来源 |
|------|---------|------|------|
| `Reward` | type(referral/brand_bonus/dividend/team)、amount、status(pending/paid/refunded)、orderId、fromUserId、level | 三种奖励（直推/品牌/分红）+ 团队奖（声明但未实现） | schema:171-190 |
| `Dividend` | amount、userLevel、totalPool、dividendDate、orderId | **每日分红结算**独立记录（与 Reward.createDividendReward 是两套逻辑） | schema:192-208 |
| `ManualReward` | amount、reason、operatorId | 管理员手动发放的奖励 | schema:315-328 |
| `BalanceRecord` | type(payment/refund/reward/referral_reward/brand_bonus/dividend_reward/withdraw_freeze/withdraw/unfreeze/admin_adjust/manual_reward/refund_reward/refund_dividend/daily_dividend)、amount(+/-)、balance(变动后)、frozenBalance、sourceType、sourceId | **余额流水**——这是 `/api/user/balance-records` 的数据源 | schema:409-427 |
| `PointsRecord` | type(earn/unlock/use/transfer_in/transfer_out/void)、amount、totalPoints/unlockedPoints/lockedPoints、sourceId、relatedUserId | **积分流水** | schema:151-169 |
| `Withdrawal` | amount、status(pending/approved/rejected)、paymentMethod、accountNumber、reviewedBy | 余额提现申请 | schema:210-229 |
| `RefundRequest` | orderId、userId、amount、reason、description、images(Json)、status(pending/approved/rejected/completed)、adminComment | **退款申请**——状态机独立于 Order.status | schema:367-387 |

---

## 2. 订单状态机

### 2.1 状态值（真实验证）

定义：`src/lib/constants.ts:23-30`
```typescript
export const ORDER_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  SHIPPED: 'shipped',
  COMPLETED: 'completed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
} as const
```

### 2.2 状态变更的所有路径

| 来源 | 入口 | 目标状态 | 关键文件 |
|------|------|---------|---------|
| **创建订单** | `OrderService.createOrder` | `pending` | `order.service.ts:113` |
| **用户支付（密码验证）** | `verify-payment` POST | `pending → paid` | `verify-payment/route.ts:69-76` |
| **用户支付（旧路径）** | `payOrder` | `pending → paid` + 发奖 | `order.service.ts:184` |
| **管理员发货** | PATCH `/api/admin/orders/[id]/status` (status='shipped') | `paid → shipped` | `admin/orders/[id]/status/route.ts:79-82` |
| **管理员手动发货（旧）** | PUT `/api/admin/orders/[id]` (action='ship') | `paid → shipped` | `admin/orders/[id]/route.ts:114-120` |
| **管理员完成订单** | PATCH `/api/admin/orders/[id]/status` (status='completed') | `shipped → completed` | `admin/orders/[id]/status/route.ts:71-77` |
| **用户确认收货** | POST `/api/orders/[id]/confirm` | `shipped → completed` | `orders/[id]/confirm/route.ts:31-34` |
| **用户取消订单** | POST `/api/orders/[id]/cancel` | `pending → cancelled` | `orders/[id]/cancel/route.ts:36` |
| **管理员取消订单** | PATCH `/api/admin/orders/[id]/status` (status='cancelled') | `pending → cancelled` 或 `paid → cancelled` | `admin/orders/[id]/status/route.ts:75-77` |
| **管理员退款完成** | PATCH `/api/admin/refunds/[id]/complete` → 调 `OrderService.requestRefund` | `paid/shipped → refunded` | `order.service.ts:358` |
| **自动确认收货（未挂载）** | `OrderService.autoCompleteOrders` | `shipped → completed` | `order.service.ts:240-268` —— **0 调用方** |

### 2.3 状态流转白名单（后端硬编码）

`src/app/api/admin/orders/[id]/status/route.ts:7-13`：
```typescript
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['completed'],
}
const ALLOWED_STATUSES = ['paid', 'shipped', 'completed', 'cancelled']
```

**重要限制**：
- **没有 `refunded`** 在 ALLOWED_STATUSES 中 —— 管理员**无法**通过 PATCH `/api/admin/orders/[id]/status` 把订单改为 refunded；refunded 状态**只能**通过管理员"确认退款"接口进入（已实现在 `OrderService.requestRefund`）
- **没有 `pending → completed` 的快速通道** —— 跳过发货直接完成的路径不存在

### 2.4 状态变更前端 UI（管理员）

`src/app/admin/orders/page.tsx:220-232`：
```typescript
const STATUS_ACTIONS: Record<string, ...> = {
  pending:  [{ label: '标记已支付', status: 'paid' }, { label: '取消订单', status: 'cancelled' }],
  paid:     [{ label: '发货', status: 'shipped' }, { label: '取消订单', status: 'cancelled' }],
  shipped:  [{ label: '完成订单', status: 'completed' }],
}
```

**注意**：`refunded` 和 `cancelled` 状态下**没有任何操作按钮**——管理员无法"反悔"已退款/已取消的订单。

### 2.5 ⚠️ Bug：状态机缺一环

**自动确认收货的 cron 不存在**：
- `src/lib/services/order.service.ts:250-268` 定义了 `autoCompleteOrders()`（7 天后自动 shipped → completed）
- `src/lib/utils/cron.ts` 只跑了 `dailyUnlock` 和 `settleDailyDividends`，**没调用 `autoCompleteOrders`**
- 全局 grep `'autoCompleteOrders'` 调用：**0 个**

→ **真实风险**：发货 7 天后订单永远停在 `shipped`，没有自动 completed，也**永远不会触发 7 天确认收货的奖励或售后窗口逻辑**。

---

## 3. 支付密码逻辑

### 3.1 字段与算法

**字段**：`User.paymentPasswordHash` (`schema.prisma:49`)

**算法**：`src/lib/auth/payment-password.ts`（24 行）
- `hashPaymentPassword(password)` → `bcrypt.hash(password, 10)`（line 9）
- `verifyPaymentPassword(password, hash)` → `bcrypt.compare`（line 16）
- `isValidPaymentPassword(password)` → `/^\d{6}$/`（line 23）**仅接受 6 位数字**

### 3.2 支付密码 API

| 路由 | 方法 | 文件 | 作用 |
|------|------|------|------|
| `/api/user/payment-password/set` | POST | `payment-password/set/route.ts` | 设置（line 27-41：检查已存在则拒绝 → hash 存） |
| `/api/user/payment-password/update` | PUT | `payment-password/update/route.ts` | 修改（line 35-58：验旧密码 → hash 新密码） |

### 3.3 支付密码校验（核心路由）

`src/app/api/orders/[id]/verify-payment/route.ts`（**完整阅读，已修复 v43-4 bug**）：

完整链路（line 30-130）：
1. **归属校验**（line 39-41）：`order.userId !== user.userId` → 403
2. **状态校验**（line 44-46）：`order.status !== PENDING` → 400
3. **密码 hash 查询**（line 49-58）：未设置 → 400「尚未设置支付密码」
4. **密码校验**（line 60-63）：`bcrypt.compare` 失败 → 401「支付密码错误」
5. **事务**（line 67-122）：
   - `updateMany(where: status=pending, data: status=paid + paymentVerified=true + paidAt=now)`（line 69-76）
   - 若 `payAmount > 0`：`updateMany` 原子扣减 `balance`（line 94-105）
   - 写 `BalanceRecord(type='payment', amount=-payAmount, ...)`（line 109-120）
6. **触发奖励**（line 125）：`RewardService.processOrderRewards(orderId)` —— **直接调用，跳过 payOrder，避免双重 updateMany**

### 3.4 ⚠️ Bug：verify-payment 没有前端调用方

**这是报告中最关键的设计缺陷**：

- **路由存在**：`/api/orders/[id]/verify-payment` (POST)
- **前端支付入口**：两处
  1. `src/app/dashboard/orders/page.tsx:105` → `fetch('/api/orders/${orderId}/pay')` （line 105-107）
  2. `src/app/dashboard/orders/[id]/page.tsx:140-143` → `router.push('/payment/order/${order.id}')`
  3. `src/app/payment/order/[orderId]/page.tsx:111-137` → `handleMockPay` 又调 `/api/orders/${order.id}/pay`
- **真实路径**：`/api/orders/[id]/pay`（`pay/route.ts`，line 46）→ `OrderService.payOrder(id)`
- **`OrderService.payOrder`**（`order.service.ts:179-203`）—— **仍然存在**，且**没有支付密码校验**

```typescript
// order.service.ts:179-203 payOrder — 没有支付密码
static async payOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('订单不存在')
  if (order.status !== ORDER_STATUS.PENDING) throw new Error('订单不存在或状态已变更')
  const paidOrder = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({ ... status: PAID, paymentVerified: true, paidAt: new Date() ... })
    // ... 扣余额 + 发奖
  })
  await RewardService.processOrderRewards(orderId)
  // ...
}
```

**结论**：
- `paymentVerified: true` 这个字段被**自动**写入（line 184），但实际上**根本没有验证支付密码**
- `/api/verify-payment` 路由是**孤儿路由**——后端存在但前端从不调
- 用户**当前能用 `/api/orders/[id]/pay` 无密码支付**（这是 v43-4 修复的"重复调 payOrder bug"留下的另一面：旧路由还在工作）

**设计阶段必须做的事**：
- 选项 A：把前端所有支付入口改走 `/api/orders/[id]/verify-payment`（带 password）
- 选项 B：把 `/api/orders/[id]/pay` 和 `/api/verify-payment` 合并/删除
- 选项 C：把"无密码支付"作为业务规则（明确说明，按需保留）

---

## 4. 退款逻辑

### 4.1 退款流程（4 步审核）

```
用户申请 → 写入 RefundRequest(status=pending)
   ↓
管理员"通过/拒绝" → RefundRequest(status=approved/rejected) [只改状态，不退款]
   ↓
管理员"确认退款" → 调 OrderService.requestRefund → 真实退余额 + 扣奖励 + 改 Order.status=refunded
   ↓
   RefundRequest.status='completed'
```

### 4.2 退款申请创建（用户端）

`src/app/api/orders/[id]/refund/route.ts`：
- line 48-53：状态校验——只允许 `paid` 或 `shipped` 申请退款
- line 55-64：防重复——已存在 pending 则拒绝
- line 81-92：写入 `RefundRequest(status=pending, amount=order.payAmount, reason, description, images)`
- **关键**：**创建申请时不动库存、不动余额、不动奖励**——纯申请记录

### 4.3 退款审核（管理员）

`src/app/api/admin/refunds/[id]/review/route.ts`：
- line 38-43：只允许 `pending` 操作
- line 47-53：改成 `approved` 或 `rejected`，可填 `adminComment`
- **不做任何退款动作**——纯审核

### 4.4 退款执行（核心）

`src/app/api/admin/refunds/[id]/complete/route.ts`：
- line 25-30：要求 `refundRequest.status === 'approved'`
- **line 41**：`await OrderService.requestRefund(refundRequest.orderId)` ← **实际退款逻辑**
- line 43-46：更新 RefundRequest.status='completed'

**`OrderService.requestRefund`**（`src/lib/services/order.service.ts:271-364`）—— v54a 修复后的执行逻辑：

```typescript
// 1. 校验：order.status 必须是 paid 或 shipped（line 278-280）
// 2. 事务内：
//    a) 退库存（line 284-294）
//    b) 退积分（如果用了积分，line 297-322）
//    c) 退余额 + 写 BalanceRecord(type='refund')（line 325-349）
//    d) 扣回已发奖励（line 352）→ RewardService.processRefund(orderId)
//    e) 改 Order.status='refunded'（line 355-360）
// 3. 返回最新 Order
```

**`RewardService.processRefund`**（`src/lib/services/reward.service.ts:385-468`）：
- 找所有 `reward(orderId, status='paid')` + `dividend(orderId)`
- **逐个扣回**：
  - **reward**（line 395-430）：
    - 校验 `user.balance >= reward.amount`（line 402-403，**不足会抛错**）
    - `user.balance -= reward.amount`
    - `reward.status = 'refunded'`
    - 写 `BalanceRecord(type='refund_reward', amount=-reward.amount, ...)`
  - **dividend**（line 432-466）：
    - 同样校验余额
    - `user.balance -= dividend.amount`
    - **删除 dividend 记录**（line 450-452）—— 注意是 **delete，不是改 status**
    - 写 `BalanceRecord(type='refund_dividend', amount=-dividend.amount, ...)`

### 4.5 退款时收益处理：✅ **已完整实现**

| 奖励类型 | 退款时动作 | 表 | BalanceRecord 类型 |
|---------|---------|----|-------------------|
| 直推奖 referral | 扣回余额 + status→refunded | Reward | `refund_reward` |
| 品牌管理奖 brand_bonus | 扣回余额 + status→refunded | Reward | `refund_reward` |
| 分红奖 dividend | 扣回余额 + **删除记录** | Dividend | `refund_dividend` |
| 团队奖 team | **Reward.type='team' 不存在** | - | - |
| 每日分红 daily_dividend（来自 `DividendService.settleDailyDividends`） | 退款时会被 processRefund 一起删 | Dividend | - |

**注意 `daily_dividend` 的陷阱**：
- `DividendService.settleDailyDividends`（line 202-210）会**同时写 Reward 表**（`type='dividend'`, `status='paid'`）和 Dividend 表
- 退款时 `processRefund` 会：
  - 从 `Reward` 表扣回（type='dividend'，被 `createDividendReward` 匹配）
  - 从 `Dividend` 表删
  - 但**两个来源可能同时存在同一个订单的分红**（processOrderRewards 的 createDividendReward + 每日结算的）—— 退款时会**两边都扣** = 重复扣

⚠️ **待设计阶段确认**：这是不是 v43-7 的 v54a 修复的真实漏洞？

### 4.6 ⚠️ 管理员前端文案过时

`src/app/admin/refunds/page.tsx:532`：
```typescript
<p className="text-xs text-gray-400">确认后状态将变更为"已完成"，实际退款逻辑后续可扩展。</p>
```

→ 实际退款逻辑**已经实现**（v54a 修复），但这条文案**没更新**——会误导管理员以为还要手动操作。

### 4.7 ⚠️ 退款拦截：当前**没有任何退款拦截逻辑**

**用户触发退款的全链路**：
- `paid` 或 `shipped` 状态 → 任意用户都可以"申请退款"（`/api/orders/[id]/refund`）→ 后端**没有任何业务限制**
- 没有"超过 N 天不能退款"、"超过金额阈值需要审批"、"特殊商品不能退款"等规则
- 管理员审核也只有 approve/reject 按钮，没有"补退金额"（部分退款）能力

→ **设计阶段需要补充**：退款拦截规则、退款金额校验（只能 ≤ payAmount）、部分退款支持等

---

## 5. 收益到账逻辑

### 5.1 触发点：`RewardService.processOrderRewards(orderId)`

`src/lib/services/reward.service.ts:281-311`：

```typescript
static async processOrderRewards(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true, items: { include: { product: true } } } })
  if (!order || order.status !== 'paid') return  // 硬性条件：必须是 paid

  const buyer = order.user
  const orderAmount = order.payAmount  // 基础是实付金额，不是总价
  const hasUpgradeProduct = order.items.some(item => item.product.isUpgradeProduct)

  if (buyer.referrerId) {
    await this.createReferralReward(orderId, orderAmount, buyer.referrerId, buyer.id)
  }
  if (buyer.referrerId && !hasUpgradeProduct) {
    await this.createBrandBonusReward(orderId, orderAmount, buyer.id, buyer.referrerId)
  }
  await this.createDividendReward(orderId, orderAmount, buyer.id)
  await this.checkUpgradeFromOrder(buyer.id, order)
}
```

**触发方**（grep 验证）：
1. `verify-payment/route.ts:125` — 新路径（支付密码验证通过后）
2. `order.service.ts:197`（payOrder 末尾）— 旧路径（用户支付后）

**触发时订单状态**：`paid`（**不是** `completed`）—— 收益在支付完成时**立即到账**，与发货/确认收货无关

### 5.2 三种奖励的真实入账逻辑

#### 5.2.1 直推奖 `createReferralReward`（line 54-106）

- **比例**：`reward.referral_rate`（seed.ts:72 = 0.20）
- **基础**：`order.payAmount`
- **前置条件**：推荐人必须**至少买过 1 个升级产品**（line 61-64：`referrer.upgradeProductCount < 1` → 不发）
- **入账字段**：`User.balance`（直接 increment）
- **写表**：`Reward(type='referral', status='paid', level=1)` + `BalanceRecord(type='referral_reward')`

#### 5.2.2 品牌管理奖 `createBrandBonusReward`（line 108-183）

- **比例**：`reward.brand_bonus_rate`（seed.ts:73 = 0.20）
- **基础**：`order.payAmount`
- **前置条件**：
  - 升级产品订单**不发**（line 304：`!hasUpgradeProduct`）
  - 推荐人 ≥ DISTRIBUTOR (level 2)
- **算法**：
  - `paidCount = 该用户历史已支付订单数`（line 118-120）
  - `targetLayer = ((paidCount - 1) % 10) + 1`（line 121）—— 10 单循环一次
  - `findBrandBonusRecipients(buyerId, maxLayers)` —— 沿 `parentId` 安置链向上找（line 7-41）
  - `computeMaxLayers`（line 43-51）：
    - level ≥ DIRECTOR (3)：10 层
    - level = DISTRIBUTOR (2) 且 `directDistributorCount >= 2`：10 层
    - level = DISTRIBUTOR (2) 且 `directDistributorCount == 1`：4 层
    - level = DISTRIBUTOR (2) 且 `directDistributorCount == 0`：2 层
    - 其他：0 层
  - **找不到对应层** → 沉淀（line 126-139），写 `OperationLog(action='BRAND_BONUS_SINK')` 而不是给用户
- **入账字段**：`User.balance`
- **写表**：`Reward(type='brand_bonus', status='paid', level=targetLayer)` + `BalanceRecord(type='brand_bonus')`

#### 5.2.3 分红奖 `createDividendReward`（line 185-279）

- **比例**：`dividend.{level}.rate`（seed.ts:74-78，每个 level 都是 0.05）
- **基础**：`order.payAmount`
- **算法**（**与 `DividendService.settleDailyDividends` 是两套独立逻辑**）：
  - 沿推荐链（`referrerId`）向上找所有 ≥ DIRECTOR 的推荐人
  - 按 5 个等级池（director/manager/supervisor/president/board）分配
  - 每个池平分：`totalPool / poolMembers.length`
- **`include_upstream` 开关**：seed.ts:79-83 默认全部 false——每个池**只**包含精确匹配该级别的用户
- **入账字段**：`User.balance`
- **写表**：`Dividend(amount, userLevel, totalPool, dividendDate)` + `BalanceRecord(type='dividend_reward')` + `Reward(type='dividend', status='paid')` —— **三处都写**（line 240-274）

#### 5.2.4 升级等级检查 `checkUpgradeFromOrder`（line 313-350）

- 调用 `UserService.checkAndUpgradeLevel(buyer.id)` 和 `checkAndUpgradeLevel(referrer.id)`
- 升级逻辑（`user.service.ts:116-181`）：
  - DISTRIBUTOR：`upgradeProductCount >= 10`（seed.ts:84）
  - DIRECTOR 及以上：直推销售额达 `upgrade.{level}.sales_amount` 阈值（5万/10万/20万/50万/100万）
- 升级为经销商时奖励积分：`upgradeProductCount × points_per_box`（seed.ts:85 = 500/箱）
- 升级为经销商时给推荐人 `directDistributorCount += 1`

### 5.3 收益到账时机

**核心结论**：所有奖励都在 **`paid` 状态立即入账**，**不等发货/确认收货**

**含义**：
- 用户支付完成 → 立即给推荐人/上级发奖金
- 用户申请退款（即使还没审核通过）→ 推荐人/上级已经拿到了钱
- 用户确认收货 → **不会再发任何奖励**

**退款拦截的关键窗口**：在 `paid` 和 `refunded` 之间（用户已支付但可能退款）

### 5.4 ⚠️ Bug：分红重复发（待设计阶段确认）

如 §4.5 所述：
- `RewardService.createDividendReward`（line 240-274）写入 Reward(type='dividend')
- `DividendService.settleDailyDividends`（line 202-210）**也**写入 Reward(type='dividend')

→ **同一订单可能产生多条 Reward(type='dividend')**：
- 如果订单在当天内发生 → 当日结算时还会被 `settleDailyDividends` 再分配一遍
- 退款时 `processRefund` 会**两条都扣**

**待确认**：是否 v43-7 设计文档（`docs/v43-7-design.md`）有规定？我没读——待设计阶段先读。

---

## 6. 后台订单列表"确认收货"按钮

### 6.1 路径

`src/app/admin/orders/page.tsx`（管理后台）

### 6.2 按钮渲染逻辑

`src/app/admin/orders/page.tsx:220-232`：
```typescript
const STATUS_ACTIONS: Record<string, ...> = {
  pending:  [{ label: '标记已支付', ... }, { label: '取消订单', ... }],
  paid:     [{ label: '发货', ... }, { label: '取消订单', ... }],
  shipped:  [{ label: '完成订单', ... }],   // ← 这就是管理员的"确认收货"按钮
}
```

**渲染位置**：
- 列表行内（line 413-423）：`STATUS_ACTIONS[order.status]?.map(...)`
- 详情弹窗底部（line 659-684）

### 6.3 按钮背后的 API

`src/app/api/admin/orders/[id]/status/route.ts`（PATCH）：
- 状态白名单：`['paid', 'shipped', 'completed', 'cancelled']`（line 13）
- 流转白名单：`pending→[paid, cancelled], paid→[shipped, cancelled], shipped→[completed]`（line 7-11）
- 发货时可传 `trackingNumber`（line 66-68）
- 改 status 时自动写 `paidAt/shippedAt/completedAt/cancelledAt`（line 58-77）
- 操作日志：`logOperation(action='UPDATE', module='order', oldValue.status, newValue.data)`

### 6.4 ⚠️ Bug：权限校验用 `['admin', 'super_admin']`

`admin/orders/[id]/status/route.ts:21`：
```typescript
const { user: admin, error: authError } = await verifyPermission(request, ['admin', 'super_admin'])
```

**实际可用角色**（schema default + admin/users 提供）：`user / auditor / support_admin / goods_admin / finance_admin / super_admin` —— **没有 `admin`**

→ **只有 `super_admin` 能调这个接口**
→ 胡子哥能用（他是 super_admin），其他管理员角色**全部 403**
→ 详见 §7.2 bug 汇总

### 6.5 缺失：管理员没有"补发奖励"或"调整奖励金额"按钮

设计阶段如果需要管理员能手动补偿/扣回奖励，必须新增独立的 admin rewards 接口（已有 `/api/admin/rewards/route.ts` 是列表，但没找到具体的"调整单条奖励"接口）。

---

## 7. 余额流水 vs 收益明细（**重点**）

### 7.1 两条数据源完全不同

| 页面 | API | 数据表 | 包含类型 |
|------|-----|--------|---------|
| **余额流水** `/dashboard/balance` | `GET /api/user/balance-records`（`user/balance-records/route.ts`） | `BalanceRecord` | payment / refund / reward / referral_reward / brand_bonus / dividend_reward / withdraw_freeze / withdraw / unfreeze / admin_adjust / manual_reward / refund_reward / refund_dividend / daily_dividend |
| **收益明细** `/dashboard/rewards` | `GET /api/rewards`（`rewards/route.ts:20-41`） | `Reward` | **仅** referral / brand_bonus / team / dividend |

### 7.2 8001 的 3 笔"直推奖在余额流水能看到但收益明细看不到"的根因

**问题分析**：

1. **直推奖** 在 `Reward` 表写入时 `type='referral'`（`reward.service.ts:71`）—— 类型一致
2. **但** `Reward.type` 在前端 `TYPE_CONFIG` 只映射了 4 个 key（`rewards/page.tsx:56-81`）：
   ```typescript
   referral, team, brand_bonus, dividend
   ```
3. `team` 永远不会出现（`Reward.type='team'` 从未被任何代码写入，grep 验证 0 个调用方）
4. `RewardService.getUserRewardStats`（`reward.service.ts:352-383`）正确统计了所有 `paid` 状态的 rewards

**真实可能的原因**（需进一步排查）：

| 可能 | 概率 | 排查方式 |
|------|------|---------|
| 数据真的没有写入 `Reward` 表（如 processOrderRewards 失败） | 中 | 直接查 DB 看 `Reward.where({userId:8001})` 是否有记录 |
| 写入成功但 type 字段写错（不是 `referral`） | 中 | 看 DB 中 type 字段的实际值 |
| 收益明细前端筛选逻辑漏了直推 | 低 | 前端 `filtered = activeTab === 'all' ? rewards : rewards.filter(r => r.type === activeTab)`（line 151）—— "全部" tab 应该显示所有 |
| **API 返回了但前端没渲染**（如 status !== 'paid' 被过滤） | **高** | 前端 `TYPE_CONFIG` 只用了 type 做 key，如果 type 是 `referral` 应该能显示 |

**待设计阶段排查**：直接查询数据库 `/api/rewards` 返回的实际数据。

### 7.3 前端余额流水的 TAB 筛选逻辑

`balance/page.tsx:88`：
```typescript
const typeParam = activeTab === 'all' ? '' 
  : activeTab === 'reward' ? 'referral_reward,brand_bonus,dividend_reward,daily_dividend,manual_reward,reward' 
  : activeTab === 'withdraw' ? 'withdraw_freeze,withdraw,unfreeze' 
  : activeTab
```

→ **奖励 TAB** 显式列出了 5 个 type（含 daily_dividend）+ admin_adjust TAB 不显示奖励 → **这是对的**，余额流水确实能看到所有奖励类型。

### 7.4 收益明细的真实数据范围

`rewards/route.ts:20-41`：
```typescript
const rewards = await prisma.reward.findMany({
  where: { userId: auth.userId, ...(type && { type }) },
  include: { order: { ... }, fromUser: { ... } },
  orderBy: { createdAt: 'desc' },
})
```

→ **没有任何 status 过滤** —— 即使是 `refunded` 的奖励也会返回
→ 前端 `RewardCard` 用 `r.status === 'pending'` 判断"待发放"（`rewards/page.tsx:362-364`），但**没有过滤已退款**

⚠️ **Bug 候选**：收益明细会显示已经被 `processRefund` 改 status='refunded' 的奖励，但前端只是隐藏 "待发放" 标签，**仍然显示金额**——可能误导用户以为还有收益。

---

## 8. 定时任务

### 8.1 现状

| 任务 | 实现位置 | 调用方 |
|------|---------|--------|
| 每日积分解锁 `dailyUnlock` | `points.service.ts:159-214` | `cron.ts:16` |
| 每日分红结算 `settleDailyDividends` | `dividend.service.ts:19-233` | `cron.ts:26` + 手动 `POST /api/admin/settle-dividends` |
| **自动确认收货** `autoCompleteOrders` | `order.service.ts:250-268` | **0 个调用方** |

### 8.2 触发方式

`src/lib/utils/cron.ts`：
- 导出 `runDailyTasks()` 函数
- 文件末尾 `if (require.main === module)` 支持 `node` 直接运行
- `package.json:19` 有脚本：`"daily:tasks": "tsx src/lib/utils/cron.ts"`

### 8.3 ⚠️ 关键问题：**Vercel 上不会自动运行**

- **没有 `vercel.json`**（grep 验证：无文件）
- **没有 Vercel Cron Jobs 配置**（没有 `crons` 字段在 vercel.json / package.json / 项目设置里）
- **没有任何外部 cron 服务调用**（grep 验证：无 `setInterval` / `@vercel/cron` / `node-cron` 依赖）

→ **真实状态**：分红结算和积分解锁必须**手动跑**：
```bash
pnpm daily:tasks           # 跑全部（解锁 + 分红）
# 或
curl -X POST https://<domain>/api/admin/settle-dividends   # 只跑分红（需 super_admin）
```

**胡子哥的"每日分红结算一直在跑"是怎么实现的？**
- 推测 A：胡子哥（或运维）有外部 cron 每天调一次
- 推测 B：没有自动跑，所以截图里的分红记录是手动触发后的结果
- **待确认**

### 8.4 `autoCompleteOrders` 完整死代码

`src/lib/services/order.service.ts:250-268`：
```typescript
static async autoCompleteOrders() {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const orders = await prisma.order.findMany({
    where: { status: ORDER_STATUS.SHIPPED, shippedAt: { lte: sevenDaysAgo } },
  })
  for (const order of orders) {
    await this.completeOrder(order.id)
  }
  return orders.length
}
```

**全局 grep `autoCompleteOrders` 调用方**：
- 定义点：`order.service.ts:250`
- **0 个调用方**（包括 cron.ts）

→ **设计阶段必须做的事**：
- 选项 A：把 `autoCompleteOrders` 加入 `runDailyTasks`
- 选项 B：删掉这段死代码（如果业务不要 7 天自动完成）

---

## 9. 管理员角色权限 Bug 汇总 ⚠️

### 9.1 Bug 列表

| 文件 | line | 代码 | 实际可用角色 | 受影响 |
|------|------|------|-------------|--------|
| `admin/refunds/route.ts` | 8 | `['admin', 'super_admin']` | 仅 super_admin | 退款列表 |
| `admin/refunds/[id]/review/route.ts` | 13 | `['admin', 'super_admin']` | 仅 super_admin | 退款审核 |
| `admin/refunds/[id]/complete/route.ts` | 14 | `['admin', 'super_admin']` | 仅 super_admin | **退款确认（核心）** |
| `admin/orders/[id]/status/route.ts` | 21 | `['admin', 'super_admin']` | 仅 super_admin | 订单状态修改 |
| `admin/notifications/route.ts` | 8, 40 | `['admin', 'super_admin']` | 仅 super_admin | 通知模板 |
| `admin/notifications/[id]/route.ts` | 11, 52, 130 | `['admin', 'super_admin']` | 仅 super_admin | 通知编辑 |
| `admin/referral-tree/[userId]/route.ts` | 63 | `['admin', 'super_admin']` | 仅 super_admin | 推荐关系图 |
| `admin/stats/route.ts` | 65 | `['admin', 'super_admin']` | 仅 super_admin | 统计 |
| `admin/stats/trend/route.ts` | 16 | `['admin', 'super_admin']` | 仅 super_admin | 趋势 |

**结论**：上表所有路由**只有 super_admin 能访问**。其他所有角色（`goods_admin/finance_admin/support_admin/auditor`）都被错误地拒之门外。

### 9.2 类似 Bug：硬编码 `user.role !== 'admin'` 检查

| 文件 | line | 代码 |
|------|------|------|
| `api/orders/[id]/route.ts` | 30 | `user.role !== 'admin'` |
| `api/orders/[id]/refund/route.ts` | 135 | `user.role !== 'admin'` |

→ 这些"看别人订单"的权限检查永远不会为真（因为没有 `admin` 用户）

### 9.3 前端期望与后端不匹配

- `src/app/login/page.tsx:62`：
  ```typescript
  const adminRoles = ['super_admin', 'admin', 'goods_manager', 'order_manager', 'user_manager', 'finance_viewer']
  ```
  —— 期望的 admin 角色列表，**和老 menu.ts 一致，但和实际 schema 不一致**

- `src/components/layout/Header.tsx:19`：
  ```typescript
  const ALL_ADMIN_ROLES = ['super_admin', 'admin', 'goods_admin', 'goods_manager', 'finance_admin', 'finance_viewer', 'order_manager', 'user_manager', 'support_admin', 'auditor']
  ```
  —— **同时**包含了新旧两套

- `src/lib/admin-menu.ts:17-25`：
  ```typescript
  export const ROLE_MENUS = {
    super_admin: [...],
    admin: [...],
    goods_manager: [...],
    order_manager: [...],
    user_manager: [...],
    finance_viewer: [...],
  }
  ```
  —— **老菜单定义**，但 schema 已升级到 `goods_admin/finance_admin/support_admin/auditor`

→ **存在两套命名约定并行**，是 v43 演进过程中没完全替换干净的**技术债**

### 9.4 待设计阶段决策

- 选项 A：把 `'admin'` 全部替换为 `'super_admin'` —— 简单但功能受限
- 选项 B：引入**角色继承**（如 super_admin 自动拥有所有权限；finance_admin 可访问所有 finance 接口）—— 长期方案
- 选项 C：每个路由单独配白名单，按业务需要（如退款 complete 用 `finance_admin + super_admin`）

---

## 10. 其他发现

### 10.1 订单收货信息缺失字段

`Order` 模型有 `recipientName/recipientPhone/shippingAddress`（schema:124-126），但**没有 province/city/district 拆分**。`Address` 模型有完整省市区（schema:389-407），但订单只存了拼好的字符串。**没有关联 Address.id**——用户换地址后老订单还是旧地址。

### 10.2 库存管理

`OrderService.createOrder`（line 127-139）使用 `updateMany(stock >= quantity)` 原子扣减；`requestRefund`（line 285-294）退库存；`cancelOrder`（line 381-389）退库存。**没有专门的库存日志表**——退库存操作没有审计记录。

### 10.3 通知模板

`NotificationTemplate` 模型（schema:350-365）已存在，订单支付/发货时调 `sendEmail`/`sendSms`（order.service.ts:198-200, 224-232）。**没有退款通知**——用户退款申请提交后、审核通过后、确认完成后都没通知（应补）。

### 10.4 `DividendService.settleDailyDividends` 的"累加分配算法" vs `createDividendReward` 的"平分算法"

两份分红发奖的逻辑**完全不同**：
- `createDividendReward`（每次订单触发）：按推荐链找 director 及以上，按等级池平分
- `settleDailyDividends`（每日定时）：把所有 ≥ director 按等级累加式分配（主任最少、董事最多）

→ **同一笔订单可能触发两份分红奖**（参考 §4.5 / §5.4）

---

## 11. 关键文件清单（绝对路径）

### 后端服务层
- `D:\mlm-platform-source\mlm-platform\src\lib\constants.ts`
- `D:\mlm-platform-source\mlm-platform\src\lib\config\business.ts`
- `D:\mlm-platform-source\mlm-platform\src\lib\auth\payment-password.ts`
- `D:\mlm-platform-source\mlm-platform\src\lib\utils\admin-auth.ts`
- `D:\mlm-platform-source\mlm-platform\src\lib\utils\cron.ts`
- `D:\mlm-platform-source\mlm-platform\src\lib\admin-menu.ts`
- `D:\mlm-platform-source\mlm-platform\src\lib\services\order.service.ts`
- `D:\mlm-platform-source\mlm-platform\src\lib\services\reward.service.ts`
- `D:\mlm-platform-source\mlm-platform\src\lib\services\dividend.service.ts`
- `D:\mlm-platform-source\mlm-platform\src\lib\services\points.service.ts`
- `D:\mlm-platform-source\mlm-platform\src\lib\services\user.service.ts`

### 后端 API 路由（关键）
- `D:\mlm-platform-source\mlm-platform\src\app\api\orders\[id]\pay\route.ts`（旧支付）
- `D:\mlm-platform-source\mlm-platform\src\app\api\orders\[id]\verify-payment\route.ts`（新支付，**未被前端调用**）
- `D:\mlm-platform-source\mlm-platform\src\app\api\orders\[id]\confirm\route.ts`（用户确认收货）
- `D:\mlm-platform-source\mlm-platform\src\app\api\orders\[id]\cancel\route.ts`（用户取消）
- `D:\mlm-platform-source\mlm-platform\src\app\api\orders\[id]\refund\route.ts`（退款申请）
- `D:\mlm-platform-source\mlm-platform\src\app\api\admin\orders\[id]\status\route.ts`（管理员改状态）
- `D:\mlm-platform-source\mlm-platform\src\app\api\admin\orders\[id]\route.ts`（管理员发货旧路径）
- `D:\mlm-platform-source\mlm-platform\src\app\api\admin\refunds\route.ts`（退款列表）
- `D:\mlm-platform-source\mlm-platform\src\app\api\admin\refunds\[id]\review\route.ts`（退款审核）
- `D:\mlm-platform-source\mlm-platform\src\app\api\admin\refunds\[id]\complete\route.ts`（退款确认）
- `D:\mlm-platform-source\mlm-platform\src\app\api\admin\settle-dividends\route.ts`（手动触发分红）
- `D:\mlm-platform-source\mlm-platform\src\app\api\rewards\route.ts`（收益明细 API）
- `D:\mlm-platform-source\mlm-platform\src\app\api\dividends\route.ts`（分红记录 API，**收益明细页未调用**）
- `D:\mlm-platform-source\mlm-platform\src\app\api\user\balance-records\route.ts`（余额流水 API）
- `D:\mlm-platform-source\mlm-platform\src\app\api\user\payment-password\set\route.ts`
- `D:\mlm-platform-source\mlm-platform\src\app\api\user\payment-password\update\route.ts`

### 前端页面
- `D:\mlm-platform-source\mlm-platform\src\app\dashboard\page.tsx`（用户首页）
- `D:\mlm-platform-source\mlm-platform\src\app\dashboard\orders\page.tsx`（订单列表-用户）
- `D:\mlm-platform-source\mlm-platform\src\app\dashboard\orders\[id]\page.tsx`（订单详情-用户）
- `D:\mlm-platform-source\mlm-platform\src\app\dashboard\orders\[id]\refund\page.tsx`（退款申请-用户）
- `D:\mlm-platform-source\mlm-platform\src\app\payment\order\[orderId]\page.tsx`（支付页-**调旧支付**）
- `D:\mlm-platform-source\mlm-platform\src\app\dashboard\balance\page.tsx`（余额流水）
- `D:\mlm-platform-source\mlm-platform\src\app\dashboard\rewards\page.tsx`（收益明细）
- `D:\mlm-platform-source\mlm-platform\src\app\dashboard\payment-password\page.tsx`（支付密码设置）
- `D:\mlm-platform-source\mlm-platform\src\app\admin\orders\page.tsx`（订单管理-管理员）
- `D:\mlm-platform-source\mlm-platform\src\app\admin\refunds\page.tsx`（退款管理-管理员）

### Prisma
- `D:\mlm-platform-source\mlm-platform\prisma\schema.prisma`
- `D:\mlm-platform-source\mlm-platform\prisma\seed.ts`

### 配置
- `D:\mlm-platform-source\mlm-platform\package.json`（无 vercel schedule 字段）

---

## 12. 设计阶段必答问题（基于调研结论）

1. **支付密码**：把前端支付入口改走 verify-payment？还是保留无密码支付？
2. **自动确认收货**：保留 7 天自动完成逻辑？放在 cron.ts 还是其他位置？
3. **退款拦截**：需要哪些规则（金额阈值/状态锁定/特殊商品/部分退款）？
4. **分红重复发**：是 v43-7 的已知设计，还是 Bug？需要补一个互斥锁吗？
5. **角色权限**：重构角色体系（`admin`→`super_admin`、引入继承）还是只补白名单？
6. **退款通知**：要不要补？什么时机补？
7. **收益明细**：要不要加 status='refunded' 的过滤？是否要补团队奖 type='team' 的实现？
8. **余额流水和收益明细**：数据源要不要统一？统一到 BalanceRecord 还是 Reward？
9. **管理员确认退款文案过时**（§4.6）：什么时候顺手改？
10. **订单收货信息**：要不要关联 Address 表？

---

**调研完毕**。报告版本 v1，输出路径：`D:\mlm-platform-source\mlm-platform\docs\现状调研-订单收益退款.md`