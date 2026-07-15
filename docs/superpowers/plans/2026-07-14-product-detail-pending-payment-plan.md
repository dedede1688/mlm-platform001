# 商品详情待支付订单恢复实施计划

> **For agentic workers（给执行代理）:** REQUIRED SUB-SKILL（必须使用的子流程）: Use `superpowers:subagent-driven-development`（子代理驱动开发，推荐）or `superpowers:executing-plans`（按计划执行）to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 修复订单详情接口敏感字段泄露，并让商品详情页在余额不足、收益转入和充值往返后始终复用同一待支付订单。

**架构：** 先把 `OrderService.getOrderDetail` 和 GET 路由收敛为显式字段白名单，再新增独立的会话存储工具。商品详情页使用服务端订单验证恢复状态，共用结算弹窗在待支付状态下显示只读收货快照；购物车沿用现有内存字典，只共享锁定展示。

**技术栈：** Next.js App Router、React、TypeScript、Prisma ORM、Vitest、Tailwind CSS、`sessionStorage（当前标签页会话存储）`。

## 全局约束

- 固定工作目录：`D:\mlm-platform-source\mlm-platform`。
- 先读取 `AGENTS.md`、`docs/agent-tasks/README.md`、`docs/agent-tasks/catpaw/猫爪执行岗位说明.md` 和本计划。
- 必须采用 TDD（测试驱动开发）：先写失败测试并记录真实红灯，再写最小实现，再记录绿灯。
- 本轮禁止 commit（提交）、push（推送）和部署；完成后先交小 M 只读复审。
- 禁止修改 `prisma/schema.prisma`、迁移、生产数据、通知模板和后台页面。
- 禁止修改支付事务、库存、积分、奖励、订单状态机和购物车待支付字典结构。
- 禁止自动支付；收益转入或充值完成后仍需用户手动输入支付密码并重新确认。
- 禁止使用 `$queryRaw` 或 `$queryRawUnsafe`。
- 禁止 `git add .`、`git add -A`、暂存历史文件或清理旧任务文件。
- 长命令输出写入 `$env:TEMP`，不得在仓库根目录创建输出文件。
- 同一完整测试和构建命令只运行一次并等待结束，不得因为后台终端暂时无输出就重复启动。

## 文件结构

**修改：**

- `src/lib/services/order.service.ts`：订单详情数据库白名单。
- `src/app/api/orders/[id]/route.ts`：GET 公开响应白名单。
- `src/components/checkout/CheckoutDialog.tsx`：待支付订单只读收货快照。
- `src/app/products/[id]/page.tsx`：商品详情余额不足、收益转入和订单恢复主流程。
- `__tests__/services/order.test.ts`：订单服务白名单测试。

**新增：**

- `src/lib/utils/pending-payment-session.ts`：商品待支付会话的校验、读写、清除和缺口计算。
- `__tests__/api/orders/order-detail-route.test.ts`：订单详情接口安全响应测试。
- `__tests__/lib/pending-payment-session.test.ts`：会话工具真实行为测试。
- `__tests__/components/checkout-pending-order-lock.test.ts`：共用结算弹窗锁定契约测试。
- `__tests__/components/product-pending-payment-flow.test.ts`：商品详情完整支付恢复契约测试。

除以上 10 个文件外，不得修改其他业务或测试文件。若必须扩大范围，立即停止并报告。

---

### 任务 1：订单详情服务和接口安全白名单

**文件：**

- 修改：`src/lib/services/order.service.ts` 中 `getOrderDetail`
- 修改：`src/app/api/orders/[id]/route.ts` 中 GET 路由
- 修改测试：`__tests__/services/order.test.ts`
- 新增测试：`__tests__/api/orders/order-detail-route.test.ts`

**接口：**

- 输入：现有 `OrderService.getOrderDetail(orderId: string)`。
- 服务端输出：安全订单详情和仅供服务端鉴权的 `userId`。
- GET 公开输出：不含 `userId`、`user`、`passwordHash`、`paymentPasswordHash`。

- [ ] **步骤 1：写订单服务失败测试**

把 `__tests__/services/order.test.ts` 中旧的 `getOrderDetail` 断言改为检查 Prisma `select`：

```typescript
expect(mocks.order.findUnique).toHaveBeenCalledWith({
  where: { id: 'o1' },
  select: expect.objectContaining({
    id: true,
    userId: true,
    orderNo: true,
    totalAmount: true,
    pointsUsed: true,
    pointsDiscount: true,
    payAmount: true,
    status: true,
    recipientName: true,
    recipientPhone: true,
    shippingAddress: true,
    items: expect.objectContaining({
      select: expect.objectContaining({
        id: true,
        productId: true,
        quantity: true,
        unitPrice: true,
        totalPrice: true,
        product: {
          select: { id: true, name: true, imageUrl: true },
        },
      }),
    }),
    refundRequests: expect.objectContaining({
      orderBy: { createdAt: 'desc' },
    }),
  }),
})

const query = mocks.order.findUnique.mock.calls[0][0]
expect(query).not.toHaveProperty('include.user')
expect(query.select).not.toHaveProperty('user')
```

- [ ] **步骤 2：新增 GET 路由安全失败测试**

在 `__tests__/api/orders/order-detail-route.test.ts` mock（模拟）`verifyToken` 和 `OrderService.getOrderDetail`。模拟服务结果故意携带危险字段，以证明公开响应不会透传：

```typescript
const unsafeOrder = {
  id: 'order-1',
  userId: 'user-1',
  orderNo: 'NO001',
  totalAmount: 500,
  pointsUsed: 0,
  pointsDiscount: 0,
  payAmount: 500,
  status: 'pending',
  trackingNumber: null,
  paidAt: null,
  shippedAt: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-07-14T00:00:00Z'),
  recipientName: '胡子',
  recipientPhone: '13800138001',
  shippingAddress: '广东省 广州市 白云区 详细地址',
  items: [{
    id: 'item-1',
    productId: 'product-1',
    quantity: 1,
    unitPrice: 500,
    totalPrice: 500,
    product: { id: 'product-1', name: '测试商品', imageUrl: null },
  }],
  refundRequests: [],
  user: {
    id: 'user-1',
    passwordHash: 'LOGIN_SECRET',
    paymentPasswordHash: 'PAY_SECRET',
  },
  passwordHash: 'ROOT_LOGIN_SECRET',
  paymentPasswordHash: 'ROOT_PAY_SECRET',
}
```

测试必须真实调用 GET，并断言：

```typescript
const responseText = await response.text()
expect(response.status).toBe(200)
expect(responseText).not.toContain('LOGIN_SECRET')
expect(responseText).not.toContain('PAY_SECRET')
expect(responseText).not.toContain('passwordHash')
expect(responseText).not.toContain('paymentPasswordHash')

const body = JSON.parse(responseText)
expect(body.data).not.toHaveProperty('userId')
expect(body.data).not.toHaveProperty('user')
expect(body.data.items[0].product.name).toBe('测试商品')
expect(body.data.recipientPhone).toBe('13800138001')
```

同时覆盖 401、403、404 和服务异常 500。

- [ ] **步骤 3：运行红灯测试**

运行：

```powershell
pnpm vitest run __tests__/services/order.test.ts __tests__/api/orders/order-detail-route.test.ts
```

预期：旧实现仍使用 `include.user=true`，安全测试失败。记录失败测试数和关键错误。

- [ ] **步骤 4：实现服务层显式 select**

`getOrderDetail` 只查询以下字段：

```typescript
return prisma.order.findUnique({
  where: { id: orderId },
  select: {
    id: true,
    userId: true,
    orderNo: true,
    totalAmount: true,
    pointsUsed: true,
    pointsDiscount: true,
    payAmount: true,
    status: true,
    trackingNumber: true,
    paidAt: true,
    shippedAt: true,
    completedAt: true,
    cancelledAt: true,
    createdAt: true,
    recipientName: true,
    recipientPhone: true,
    shippingAddress: true,
    items: {
      select: {
        id: true,
        productId: true,
        quantity: true,
        unitPrice: true,
        totalPrice: true,
        product: {
          select: { id: true, name: true, imageUrl: true },
        },
      },
    },
    refundRequests: {
      select: {
        id: true,
        reason: true,
        description: true,
        images: true,
        status: true,
        adminComment: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    },
  },
})
```

不得查询 `user` 和 `rewards`。

- [ ] **步骤 5：实现 GET 公开响应映射**

GET 路由完成所有权判断后，逐项构造公开对象，不使用 `{ ...order }`：

```typescript
const publicOrder = {
  id: order.id,
  orderNo: order.orderNo,
  totalAmount: order.totalAmount,
  pointsUsed: order.pointsUsed,
  pointsDiscount: order.pointsDiscount,
  payAmount: order.payAmount,
  status: order.status,
  trackingNumber: order.trackingNumber,
  paidAt: order.paidAt,
  shippedAt: order.shippedAt,
  completedAt: order.completedAt,
  cancelledAt: order.cancelledAt,
  createdAt: order.createdAt,
  recipientName: order.recipientName,
  recipientPhone: order.recipientPhone,
  shippingAddress: order.shippingAddress,
  items: order.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
    product: {
      id: item.product.id,
      name: item.product.name,
      imageUrl: item.product.imageUrl,
    },
  })),
  refundRequests: order.refundRequests.map((refund) => ({
    id: refund.id,
    reason: refund.reason,
    description: refund.description,
    images: refund.images,
    status: refund.status,
    adminComment: refund.adminComment,
    createdAt: refund.createdAt,
  })),
}
```

只修改 GET 分支；POST、PUT、DELETE 不得改动。

- [ ] **步骤 6：运行绿灯测试**

重复步骤 3 命令。预期：订单服务和路由测试全部通过。

---

### 任务 2：商品待支付会话工具

**文件：**

- 新增：`src/lib/utils/pending-payment-session.ts`
- 新增测试：`__tests__/lib/pending-payment-session.test.ts`

**接口：**

```typescript
export interface ProductPendingPaymentSession {
  version: 1
  userId: string
  productId: string
  orderId: string
  shortage: number
}

export type PendingPaymentLoadResult =
  | { status: 'empty' }
  | { status: 'valid'; value: ProductPendingPaymentSession }
  | { status: 'invalid'; error: string }
  | { status: 'unavailable'; error: string }

export type PendingPaymentWriteResult =
  | { ok: true }
  | { ok: false; error: string }

export function getProductPendingPaymentKey(userId: string, productId: string): string
export function loadProductPendingPayment(userId: string, productId: string): PendingPaymentLoadResult
export function saveProductPendingPayment(value: ProductPendingPaymentSession): PendingPaymentWriteResult
export function clearProductPendingPayment(userId: string, productId: string): boolean
export function calculatePendingShortage(payAmount: number, balance: number): number
```

- [ ] **步骤 1：写会话工具失败测试**

使用内存版 `sessionStorage` mock，覆盖：

```typescript
expect(getProductPendingPaymentKey('u1', 'p1'))
  .not.toBe(getProductPendingPaymentKey('u2', 'p1'))

expect(saveProductPendingPayment({
  version: 1,
  userId: 'u1',
  productId: 'p1',
  orderId: 'o1',
  shortage: 300,
})).toEqual({ ok: true })

expect(loadProductPendingPayment('u1', 'p1')).toEqual({
  status: 'valid',
  value: expect.objectContaining({ orderId: 'o1', shortage: 300 }),
})

expect(calculatePendingShortage(500, 200)).toBe(300)
expect(calculatePendingShortage(500, 800)).toBe(0)
```

还必须覆盖：损坏 JSON、版本错误、用户或商品不匹配、空订单编号、负数、`NaN`、`Infinity`、存储读写抛错、清除。

- [ ] **步骤 2：运行红灯测试**

```powershell
pnpm vitest run __tests__/lib/pending-payment-session.test.ts
```

预期：模块不存在，测试失败。

- [ ] **步骤 3：实现严格校验和存储访问**

关键规则：

```typescript
const PREFIX = 'product-pending-payment:v1'

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const isValidSession = (value: unknown): value is ProductPendingPaymentSession => {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<ProductPendingPaymentSession>
  return data.version === 1
    && isNonEmptyString(data.userId)
    && isNonEmptyString(data.productId)
    && isNonEmptyString(data.orderId)
    && typeof data.shortage === 'number'
    && Number.isFinite(data.shortage)
    && data.shortage >= 0
}

export const calculatePendingShortage = (payAmount: number, balance: number) => {
  if (!Number.isFinite(payAmount) || !Number.isFinite(balance)) return 0
  return Math.max(0, payAmount - balance)
}
```

损坏或不匹配数据必须尝试删除并返回 `invalid`；浏览器存储不可用或抛错返回 `unavailable`。不要记录令牌、支付密码和地址。

- [ ] **步骤 4：运行绿灯测试**

重复步骤 2 命令。预期全部通过。

---

### 任务 3：共用结算弹窗的待支付锁定状态

**文件：**

- 修改：`src/components/checkout/CheckoutDialog.tsx`
- 新增测试：`__tests__/components/checkout-pending-order-lock.test.ts`

**接口：**

```typescript
export interface CheckoutLockedShipping {
  recipientName: string
  recipientPhone: string
  shippingAddress: string
}

pendingOrderShipping?: CheckoutLockedShipping | null
```

- [ ] **步骤 1：写锁定行为失败测试**

测试必须从真实组件源码提取 `CheckoutDialog` 和 `handleSubmit` 相关代码并断言：

```typescript
expect(source).toContain('pendingOrderShipping?: CheckoutLockedShipping | null')
expect(source).toContain('const [submittedShipping')
expect(source).toContain('const lockedShipping = pendingOrderShipping ?? submittedShipping')
expect(source).toContain('订单已创建，收货信息以首次提交为准')
expect(source).toContain('hasPendingOrder && lockedShipping')
```

还要锁定以下契约：

- `hasPendingOrder` 时不渲染可编辑地址表单分支；
- 支付密码区域位于锁定分支之外；
- 首次提交前保存收货快照；
- 待支付重试时不再次调用 `onSaveAddress`；
- 购物车仍传入 `hasPendingOrder`，无需修改购物车页面。

- [ ] **步骤 2：运行红灯测试**

```powershell
pnpm vitest run __tests__/components/checkout-pending-order-lock.test.ts __tests__/components/cart-earnings-transfer-flow.test.ts
```

预期：新锁定测试失败，购物车原测试保持通过。

- [ ] **步骤 3：实现收货快照和只读摘要**

组件内部增加：

```typescript
const [submittedShipping, setSubmittedShipping] = useState<CheckoutLockedShipping | null>(null)
const lockedShipping = pendingOrderShipping ?? submittedShipping
```

`handleSubmit` 在调用 `onConfirm` 前构造一次快照：

```typescript
const shippingAddress = `${addressPca.province} ${addressPca.city} ${addressPca.district} ${detailAddress}`.trim()
const shippingSnapshot = {
  recipientName: recipientName.trim(),
  recipientPhone: recipientPhone.trim(),
  shippingAddress,
}
setSubmittedShipping(shippingSnapshot)
```

锁定状态的只读摘要 JSX：

```tsx
<div className="border border-amber-200 bg-amber-50 p-3">
  <p className="font-medium text-amber-800">订单已创建，收货信息以首次提交为准</p>
  {lockedShipping ? (
    <div className="mt-2 text-sm text-gray-700">
      <p>收货人：{lockedShipping.recipientName}</p>
      <p>手机号：{lockedShipping.recipientPhone}</p>
      <p>收货地址：{lockedShipping.shippingAddress}</p>
    </div>
  ) : (
    <p className="mt-2 text-sm text-gray-600">收货信息已保存到订单</p>
  )}
</div>
```

将当前组件从“选择收货地址”开始、到“支付密码”区域之前的现有 JSX 整段原样作为 `hasPendingOrder ? 只读摘要 : 现有可编辑表单` 的 false 分支。保存地址簿逻辑必须增加 `!hasPendingOrder` 条件。支付密码输入、忘记密码帮助、缺口、收益转入和充值入口保持在该条件分支之外。

- [ ] **步骤 4：运行绿灯测试**

重复步骤 2 命令。预期新测试和购物车回归测试全部通过。

---

### 任务 4：商品详情待支付订单、收益和充值恢复流程

**文件：**

- 修改：`src/app/products/[id]/page.tsx`
- 新增测试：`__tests__/components/product-pending-payment-flow.test.ts`

**接口：**

```typescript
interface ProductPageUser {
  id: string
  level: number
  unlockedPoints: number
  balance: number
  earningsAvailable: number
  phone?: string
  hasPaymentPassword?: boolean
}

interface ProductPendingPayment {
  orderId: string
  payAmount: number
  shortage: number
  shipping: CheckoutLockedShipping
}

type PendingRestoreStatus = 'idle' | 'validating' | 'restored' | 'validation_error'
```

- [ ] **步骤 1：写商品详情流程失败测试**

使用项目已有的 `extractBlock` 方式提取真实函数体，至少覆盖以下契约：

1. 用户类型包含 `id`、`balance`、`earningsAvailable`。
2. 存在 `pendingPayment`、`restoreStatus`、`restoreError` 和收益弹窗状态。
3. `handleCheckoutConfirm` 有待支付订单时不调用 `/api/orders` 创建接口。
4. 新订单创建后，在支付验证前保存 `orderId` 和服务端返回的 `payAmount`；仅当新建响应金额异常时才以本次提交使用的 `finalPrice` 兜底。
5. 识别 `verifyErr.code === 'INSUFFICIENT_BALANCE'`。
6. 优先使用 `verifyErr.data.shortage`，缺失时才用 `payAmount - balance` 兜底。
7. 余额不足时写会话，并根据 `earningsAvailable` 打开收益弹窗或显示充值提示。
8. `handleEarningsTransferSuccess` 不包含 `verify-payment` 和 `handleCheckoutConfirm`。
9. 转入成功刷新 `/api/users/me`，成功时使用 `pendingPayment.payAmount - latestUser.balance` 重算缺口，刷新失败时才按实际金额减少旧缺口。
10. 去充值前检查 `saveProductPendingPayment(...).ok`，失败时不导航。
11. 恢复 GET 使用 Bearer 令牌，校验 `pending`、当前商品、数量 1。
12. 恢复缺口使用 `calculatePendingShortage(order.payAmount, latestUser.balance)`。
13. 恢复时执行 `setPointsToUse(order.pointsUsed)`，并把有限非负的 `order.payAmount` 保存到 `pendingPayment.payAmount`。
14. 后续收益转入成功不得用页面 `finalPrice` 重算原订单缺口。
15. 404、403和明确订单失效清除会话。
16. 500 或网络错误不清除会话，进入 `validation_error`。
17. `validating` 和 `validation_error` 时阻止创建订单。
18. 页面提供“重新验证”按钮，手动重试必须绕过 `lastRestoreKeyRef` 的自动恢复去重。
19. 支付成功清除会话。
20. `CheckoutDialog` 收到 `hasPendingOrder`、`shortage`、`earningsAvailable`、`pendingOrderShipping`、收益回调和充值回调。
21. `EarningsTransferModal` 的 `initialAmount` 为缺口和可用收益的较小值。

- [ ] **步骤 2：运行红灯测试**

```powershell
pnpm vitest run __tests__/components/product-pending-payment-flow.test.ts __tests__/components/checkout-pending-order-lock.test.ts __tests__/lib/pending-payment-session.test.ts
```

预期：商品详情流程测试失败，前两个已完成任务测试通过。

- [ ] **步骤 3：增加状态、导入和用户刷新返回值**

导入：

```typescript
import { useRef, useState, useEffect } from 'react'
import { EarningsTransferModal } from '@/components/EarningsTransferModal'
import {
  CheckoutDialog,
  CheckoutInput,
  CheckoutLockedShipping,
  CheckoutProduct,
  SavedAddress,
} from '@/components/checkout/CheckoutDialog'
import {
  calculatePendingShortage,
  clearProductPendingPayment,
  loadProductPendingPayment,
  saveProductPendingPayment,
} from '@/lib/utils/pending-payment-session'
```

`fetchUser` 必须返回最新用户对象或 `null`，同时继续 `setUser`：

```typescript
const fetchUser = async (authToken: string): Promise<ProductPageUser | null> => {
  try {
    const res = await fetch('/api/users/me', {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    if (!res.ok) {
      setUser(null)
      return null
    }
    const data = await res.json()
    setUser(data.data)
    return data.data
  } catch (error) {
    console.error('获取用户信息失败:', error)
    return null
  }
}
```

增加状态和 `lastRestoreKeyRef`，防止同一用户和商品重复执行恢复 effect。恢复函数签名固定为 `restorePendingPayment(force = false): Promise<void>`，函数开头必须使用：

```typescript
if (!user || !product || !token) return
const restoreKey = `${user.id}:${product.id}`
if (!force && lastRestoreKeyRef.current === restoreKey) return
lastRestoreKeyRef.current = restoreKey
```

自动恢复调用 `restorePendingPayment(false)`；“重新验证”按钮调用 `restorePendingPayment(true)`，不得因为去重引用而成为无效按钮。

- [ ] **步骤 4：实现会话保存帮助函数**

```typescript
const persistPendingPayment = (
  orderId: string,
  shortage: number,
): boolean => {
  if (!user || !product) return false
  const result = saveProductPendingPayment({
    version: 1,
    userId: user.id,
    productId: product.id,
    orderId,
    shortage,
  })
  if (!result.ok) {
    toast.error(result.error || '待支付订单保存失败，请重试')
    return false
  }
  return true
}
```

页面内存状态必须保存 `shipping`，会话记录不得保存地址。

- [ ] **步骤 5：实现服务端订单恢复**

恢复函数顺序：

1. `loadProductPendingPayment(user.id, product.id)`。
2. `empty` 进入 `idle`。
3. `invalid` 清理后进入 `idle` 并提示记录失效。
4. `unavailable` 进入 `validation_error`。
5. `valid` 后设置 `validating`，GET `/api/orders/${orderId}`，携带 Bearer 令牌。
6. 401 跳转登录且不创建订单。
7. 403/404 清除会话并进入 `idle`。
8. 500 或网络异常进入 `validation_error`，不得清除会话。
9. 响应必须满足 `status === 'pending'`、`items.length === 1`、当前商品和 `quantity === 1`。
10. 校验 `order.payAmount` 和 `order.pointsUsed` 是有限非负数字。
11. 执行 `setPointsToUse(order.pointsUsed)`，恢复页面积分抵扣展示。
12. 使用 `order.payAmount` 和最新用户余额重新计算缺口，并更新会话。
13. 设置包含 `payAmount: order.payAmount` 的 `pendingPayment` 和 `restored`。

收货快照：

```typescript
const shipping: CheckoutLockedShipping = {
  recipientName: order.recipientName || '',
  recipientPhone: order.recipientPhone || '',
  shippingAddress: order.shippingAddress || '',
}
```

若任一收货字段为空，订单视为不完整并清除恢复记录，不允许用当前默认地址冒充原订单地址。

- [ ] **步骤 6：重写支付确认流程以复用订单**

核心结构必须是：

```typescript
let orderId = pendingPayment?.orderId ?? null
let currentPayAmount = pendingPayment?.payAmount ?? null
let currentPendingPayment = pendingPayment

if (!orderId) {
  const orderRes = await fetch('/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      items: [{ productId: product.id, quantity: 1 }],
      pointsUsed: pointsToUse > 0 ? pointsToUse : undefined,
      recipientName: input.recipientName,
      recipientPhone: input.recipientPhone,
      shippingAddress: input.shippingAddress,
    }),
  })
  if (!orderRes.ok) {
    const errorData = await orderRes.json()
    toast.error(errorData.error || '创建订单失败')
    return null
  }

  const orderData = await orderRes.json()
  orderId = String(orderData.data?.id || '')
  if (!orderId) {
    toast.error('创建订单失败：未获取到订单ID')
    return null
  }
  const createdPayAmount = Number(orderData.data?.payAmount)
  currentPayAmount = Number.isFinite(createdPayAmount) && createdPayAmount >= 0
    ? createdPayAmount
    : finalPrice

  currentPendingPayment = {
    orderId,
    payAmount: currentPayAmount,
    shortage: 0,
    shipping: {
      recipientName: input.recipientName,
      recipientPhone: input.recipientPhone,
      shippingAddress: input.shippingAddress,
    },
  }
  setPendingPayment(currentPendingPayment)
  persistPendingPayment(orderId, 0)
}

if (!currentPendingPayment || currentPayAmount === null) {
  toast.error('待支付订单状态不完整，请重新打开结算窗口')
  return null
}

const verifyRes = await fetch(`/api/orders/${orderId}/verify-payment`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ password: input.payPassword }),
})
```

余额不足处理：

```typescript
const isInsufficient = verifyErr.code === 'INSUFFICIENT_BALANCE'
  || String(verifyErr.error || '').includes('余额不足')

if (isInsufficient) {
  const apiShortage = Number(verifyErr.data?.shortage)
  const paymentAmount = currentPayAmount
  const actualShortage = Number.isFinite(apiShortage)
    ? Math.max(0, apiShortage)
    : calculatePendingShortage(paymentAmount, user.balance)

  const nextPendingPayment = {
    ...currentPendingPayment,
    payAmount: paymentAmount,
    shortage: actualShortage,
  }
  setPendingPayment(nextPendingPayment)
  persistPendingPayment(orderId, actualShortage)
  if (user.earningsAvailable > 0) {
    setShowEarningsTransfer(true)
  } else {
    toast.info('购物余额不足，请充值后重新确认支付')
  }
  return null
}
```

支付密码错误和其他支付失败保留订单及会话。支付成功后清除会话、清空待支付状态、关闭弹窗并跳转订单详情。

- [ ] **步骤 7：实现收益转入和去充值**

收益成功回调：

```typescript
const handleEarningsTransferSuccess = async (amount: number) => {
  if (!pendingPayment || !token) return
  const latestUser = await fetchUser(token)
  const remainingShortage = latestUser
    ? calculatePendingShortage(pendingPayment.payAmount, latestUser.balance)
    : Math.max(0, pendingPayment.shortage - amount)

  const next = { ...pendingPayment, shortage: remainingShortage }
  setPendingPayment(next)
  persistPendingPayment(next.orderId, remainingShortage)
  setShowEarningsTransfer(false)
  toast.success('余额已补充，请重新确认支付')
}
```

该函数不得调用支付接口。

去充值：会话保存失败时立即 return；保存成功才 `router.push('/dashboard/recharge')`。

- [ ] **步骤 8：实现页面恢复提示和弹窗接线**

- `validating` 时禁用立即购买按钮并显示“正在验证待支付订单”。
- `validation_error` 时显示错误和“重新验证”按钮；按钮必须调用 `restorePendingPayment(true)`；`handleBuyNow` 必须 return，不能新建订单。
- `restored` 时显示“已恢复待支付订单，不会重复下单”。
- `CheckoutDialog` 传入全部待支付参数和 `pendingOrderShipping`。
- `EarningsTransferModal` 的 `initialAmount` 使用：

```typescript
Math.min(pendingPayment?.shortage ?? 0, user?.earningsAvailable ?? 0)
```

- [ ] **步骤 9：运行绿灯测试**

重复步骤 2 命令。预期全部通过。

---

### 任务 5：针对性回归、类型检查、构建和结果报告

**文件：**

- 不新增业务文件。
- 写本地结果：`docs/agent-tasks/catpaw/done/猫爪_024号结果.md`

- [ ] **步骤 1：运行全部针对性测试一次**

```powershell
pnpm vitest run __tests__/services/order.test.ts __tests__/api/orders/order-detail-route.test.ts __tests__/lib/pending-payment-session.test.ts __tests__/components/checkout-pending-order-lock.test.ts __tests__/components/product-pending-payment-flow.test.ts __tests__/components/cart-earnings-transfer-flow.test.ts __tests__/api/orders/verify-payment-route.test.ts
```

要求：全部通过，失败数 0。

- [ ] **步骤 2：运行代码规范检查一次**

```powershell
pnpm lint --file src/app/products/[id]/page.tsx --file src/components/checkout/CheckoutDialog.tsx --file src/app/api/orders/[id]/route.ts
```

要求：0 Error。既有 Warning 如实记录，不得扩大范围修复。

- [ ] **步骤 3：运行类型检查一次**

```powershell
pnpm typecheck
```

要求：退出码 0。

- [ ] **步骤 4：运行构建一次**

```powershell
pnpm build
```

要求：退出码 0。等待原命令结束，不重复启动。

- [ ] **步骤 5：检查最终范围**

```powershell
git diff --check -- src/lib/services/order.service.ts src/app/api/orders/[id]/route.ts src/lib/utils/pending-payment-session.ts src/components/checkout/CheckoutDialog.tsx src/app/products/[id]/page.tsx __tests__/services/order.test.ts __tests__/api/orders/order-detail-route.test.ts __tests__/lib/pending-payment-session.test.ts __tests__/components/checkout-pending-order-lock.test.ts __tests__/components/product-pending-payment-flow.test.ts
git status --short
```

要求：本任务业务和测试增量恰好是文件结构列出的 10 个文件。历史文档和旧任务文件保持原状。

- [ ] **步骤 6：尝试真实浏览器验证**

启动本地开发服务器，使用真实浏览器访问商品详情页。若没有登录状态或测试凭据，必须如实记录认证限制，改做源码级路径核对，不得声称真实页面通过。

至少验证或列出胡子老师验收项：

1. 余额不足只创建一个订单。
2. 收货信息变为只读摘要。
3. 有收益时打开收益弹窗。
4. 部分收益转入后缺口减少且不自动支付。
5. 去充值再返回后恢复同一订单。
6. 验证接口 500 时显示重新验证且不能新建订单。
7. 支付成功后会话清除。
8. 订单详情响应无任何密码哈希。

- [ ] **步骤 7：写结果文件并停止**

`猫爪_024号结果.md` 必须包含：

1. 初始目录、分支、本地 HEAD、`origin/main` 和工作区状态。
2. 是否成功读取四类规则文件。
3. 真实修改的 10 个文件清单。
4. P0 安全白名单实现和测试证据。
5. TDD 红灯测试命令、失败数和关键失败原因。
6. 绿灯测试命令、文件数、测试数和失败数。
7. 会话结构和明确未存储的敏感字段。
8. 首次创建、余额不足、收益转入、充值恢复、重新验证、支付成功的数据流。
9. 如何证明没有重复创建订单。
10. 如何证明没有自动支付。
11. 购物车回归结果。
12. lint、typecheck、build 和 diff check 结果。
13. 浏览器验证结果或登录认证限制。
14. 最终 `git status --short`。
15. 明确确认未 commit、未 push、未部署。
16. 明确确认未修改数据库结构、未写生产数据、未改支付事务。
17. P0/P1/P2 风险和未完成项。
18. 执行方案建议：下一步交小 M 024 号只读复审。

完成后停止，不得提交、推送或部署。
