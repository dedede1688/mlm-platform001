# Order and Refund State Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent paid-order direct cancellation, block order completion while a refund is active, and complete approved refunds atomically for paid, shipped, or approved historical completed orders.

**Architecture:** `OrderLifecycleService` remains the single state-machine owner. Admin routes delegate cancellation, shipping, completion, and refund completion to lifecycle methods instead of directly updating order status. Refund financial reversal and `refund_requests.approved → completed` execute inside one Prisma transaction; UI confirmation and error handling sit outside this core.

**Tech Stack:** Next.js 15 App Router, TypeScript 5.7, Prisma 6, React 19, Vitest 4.

## Global Constraints

- Only `pending` orders may transition to `cancelled`.
- Paid orders must use the refund workflow; no direct cancellation.
- `pending` or `approved` refund requests block user, admin, and automatic order completion.
- An approved refund may reverse a historical `completed` order.
- Financial reversal and refund-request completion are one database transaction.
- No schema migration and no live data repair in this plan.
- Write and run every regression test before the production change that makes it pass.
- Preserve the unrelated untracked `temp-s13d.js`.

---

### Task 1: Guard every order-completion path against active refunds

**Files:**
- Modify: `__tests__/services/order-lifecycle.test.ts`
- Modify: `src/lib/services/order-lifecycle.service.ts`
- Modify: `src/app/api/orders/[id]/route.ts`

**Interfaces:**
- Produces: `OrderLifecycleService.completeOrder(orderId: string)` rejects with `订单存在进行中的退款申请，不能完成`.
- Produces: `OrderLifecycleService.confirmOrder(orderId: string, userId: string)` delegates the state transition to `completeOrder`.
- Produces: `OrderLifecycleService.autoCompleteOrders()` excludes orders with `pending` or `approved` refunds.

- [ ] **Step 1: Add the missing Prisma refund-request mock**

Add to the hoisted mock and transaction client:

```ts
refundRequest: {
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
},
```

Set the default in `beforeEach`:

```ts
mocks.refundRequest.findFirst.mockResolvedValue(null)
```

- [ ] **Step 2: Write failing completion-guard tests**

Add tests that assert:

```ts
it.each(['pending', 'approved'])(
  'completeOrder blocks an order with a %s refund',
  async status => {
    mocks.refundRequest.findFirst.mockResolvedValueOnce({ id: 'refund-1', status })

    await expect(OrderLifecycleService.completeOrder('order-1'))
      .rejects.toThrow('订单存在进行中的退款申请，不能完成')
    expect(mocks.order.updateMany).not.toHaveBeenCalled()
  }
)
```

Add one test proving the update condition contains a relational `none` guard:

```ts
expect(mocks.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
  where: expect.objectContaining({
    id: 'order-1',
    status: 'shipped',
    refundRequests: { none: { status: { in: ['pending', 'approved'] } } },
  }),
}))
```

Add tests proving `confirmOrder` preserves ownership checks and delegates the transition, and `autoCompleteOrders` queries only orders without active refunds.

- [ ] **Step 3: Run the new tests and verify RED**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run __tests__/services/order-lifecycle.test.ts
```

Expected: new tests fail because `completeOrder` and the automatic query do not inspect refund requests.

- [ ] **Step 4: Implement the completion guard**

Add a private helper:

```ts
private static async assertNoActiveRefund(orderId: string) {
  const activeRefund = await prisma.refundRequest.findFirst({
    where: { orderId, status: { in: ['pending', 'approved'] } },
    select: { id: true },
  })
  if (activeRefund) throw new Error('订单存在进行中的退款申请，不能完成')
}
```

Call it before `completeOrder` updates. Keep the same constraint inside `updateMany`:

```ts
where: {
  id: orderId,
  status: ORDER_STATUS.SHIPPED,
  refundRequests: { none: { status: { in: ['pending', 'approved'] } } },
}
```

Make `confirmOrder` perform ownership/status checks and then return `this.completeOrder(orderId)`. Add the same `none` filter to `autoCompleteOrders`.

In `src/app/api/orders/[id]/route.ts`, return the actual business error and use status 409 for the active-refund conflict instead of always returning a generic 500.

- [ ] **Step 5: Run the service tests and verify GREEN**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run __tests__/services/order-lifecycle.test.ts
```

Expected: all order-lifecycle tests pass.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- __tests__/services/order-lifecycle.test.ts src/lib/services/order-lifecycle.service.ts src/app/api/orders/[id]/route.ts
git commit -m "P: 阻止退款处理中订单继续完成"
```

### Task 2: Make approved-refund completion atomic

**Files:**
- Modify: `__tests__/services/order-lifecycle.test.ts`
- Modify: `src/lib/services/order-lifecycle.service.ts`

**Interfaces:**
- Replaces: separate `requestRefund(orderId)` plus `completeRefund(refundId)`.
- Produces: `OrderLifecycleService.completeApprovedRefund(refundId: string)`.
- Returns: the updated refund request with `status: 'completed'`.

- [ ] **Step 1: Write failing approved-refund tests**

Add tests for:

```ts
const makeRefundOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'order-1',
  status: 'paid',
  userId: 'user-1',
  orderNo: 'ORD001',
  payAmount: 500,
  pointsUsed: 0,
  user: { referrerId: null },
  items: [],
  ...overrides,
})

await expect(OrderLifecycleService.completeApprovedRefund('missing'))
  .rejects.toThrow('退款申请不存在')
```

```ts
await expect(OrderLifecycleService.completeApprovedRefund('refund-1'))
  .rejects.toThrow('退款状态不是已审批')
```

```ts
it.each(['paid', 'shipped', 'completed'])(
  'atomically refunds an approved %s order',
  async orderStatus => {
    mocks.refundRequest.findUnique.mockResolvedValueOnce({
      id: 'refund-1', orderId: 'order-1', status: 'approved',
      order: makeRefundOrder({ status: orderStatus }),
    })
    mocks.refundRequest.update.mockResolvedValueOnce({
      id: 'refund-1', status: 'completed',
    })

    const result = await OrderLifecycleService.completeApprovedRefund('refund-1')

    expect(result.status).toBe('completed')
    expect(mocks.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'order-1', status: { in: ['paid', 'shipped', 'completed'] } },
      data: { status: 'refunded' },
    }))
    expect(mocks.refundRequest.update).toHaveBeenCalledWith({
      where: { id: 'refund-1' },
      data: { status: 'completed' },
    })
  }
)
```

Add negative tests for `pending`, `cancelled`, and `refunded` orders. Add an ordering/transaction test proving both the order update and refund-request update use the transaction client. Add a failure test proving a rejected refund-request update rejects the outer transaction result.

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run __tests__/services/order-lifecycle.test.ts
```

Expected: failure because `completeApprovedRefund` does not exist.

- [ ] **Step 3: Consolidate the refund implementation**

Create:

```ts
static async completeApprovedRefund(refundId: string) {
  return prisma.$transaction(async tx => {
    const refund = await tx.refundRequest.findUnique({
      where: { id: refundId },
      include: {
        order: {
          include: {
            user: { select: { referrerId: true } },
            items: { include: { product: { select: { isUpgradeProduct: true } } } },
          },
        },
      },
    })
    if (!refund) throw new Error('退款申请不存在')
    if (refund.status !== 'approved') throw new Error('退款状态不是已审批')
    if (!['paid', 'shipped', 'completed'].includes(refund.order.status)) {
      throw new Error('当前订单状态不允许退款')
    }

    // Move the current requestRefund transaction body from
    // order-lifecycle.service.ts:318-404 into this callback:
    // 1. tx.product.update for every order item.
    // 2. tx.user.update + tx.pointsRecord.create when pointsUsed > 0.
    // 3. conditional tx.user.updateMany + tx.balanceRecord.create for payAmount.
    // 4. PointsService.voidUpgradePointsForRefund(orderId, tx).
    // 5. RewardService.processRefund(orderId, tx).
    // 6. UserService.recomputeQualificationStatsForUsers(userIds, tx).

    const changed = await tx.order.updateMany({
      where: {
        id: refund.orderId,
        status: { in: ['paid', 'shipped', 'completed'] },
      },
      data: { status: ORDER_STATUS.REFUNDED },
    })
    if (changed.count === 0) throw new Error('订单状态已变更，请刷新后重试')

    return tx.refundRequest.update({
      where: { id: refundId },
      data: { status: 'completed' },
    })
  })
}
```

Move the existing financial rollback body into this transaction. Delete the split production methods `requestRefund` and `completeRefund` after their test coverage has been moved to `completeApprovedRefund`.

- [ ] **Step 4: Run service tests and verify GREEN**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run __tests__/services/order-lifecycle.test.ts
```

Expected: all order-lifecycle tests pass.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- __tests__/services/order-lifecycle.test.ts src/lib/services/order-lifecycle.service.ts
git commit -m "P: 原子化已审批退款完整冲销"
```

### Task 3: Route every admin order transition through lifecycle services

**Files:**
- Create: `__tests__/api/admin/orders/status-route.test.ts`
- Modify: `src/app/api/admin/orders/[id]/status/route.ts`
- Modify: `src/app/api/admin/refunds/[id]/complete/route.ts`
- Create: `__tests__/api/admin/refunds/complete-route.test.ts`

**Interfaces:**
- Admin order cancellation calls `cancelOrder`.
- Admin shipping calls `shipOrder`.
- Admin completion calls `completeOrder`.
- Refund completion calls `completeApprovedRefund`.

- [ ] **Step 1: Write failing admin-order route tests**

Mock authentication, lifecycle services, `OrderService`, logging, and notifications. Assert:

- `paid → cancelled` returns 400 and never calls any mutation.
- `pending → cancelled` calls `cancelOrder(id)`, never `OrderService.updateOrder`.
- `paid → shipped` calls `shipOrder(id, trackingNumber)`.
- `shipped → completed` calls `completeOrder(id)`.
- The route does not send duplicate lifecycle notifications.
- A lifecycle business error is returned in the API `error` field.

- [ ] **Step 2: Write failing refund-completion route tests**

Assert:

```ts
expect(mocks.completeApprovedRefund).toHaveBeenCalledWith('refund-1')
expect(mocks.requestRefund).not.toHaveBeenCalled()
expect(mocks.completeRefund).not.toHaveBeenCalled()
```

Also assert:

- The success response remains successful if notification or operation logging rejects after the transaction.
- A known service error returns its message in `error` with status 400 or 409.
- An unknown error returns `退款完成失败`.

- [ ] **Step 3: Run route tests and verify RED**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run __tests__/api/admin/orders/status-route.test.ts __tests__/api/admin/refunds/complete-route.test.ts
```

Expected: tests fail because routes still use direct order updates and split refund calls.

- [ ] **Step 4: Implement lifecycle route delegation**

Change the admin transition map to:

```ts
const VALID_TRANSITIONS = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped'],
  shipped: ['completed'],
} as const
```

Delegate `cancelled`, `shipped`, and `completed` to lifecycle services. Keep only manual `pending → paid` on the existing direct update path. Remove route-level notification calls already owned by lifecycle services.

Change the refund completion route to:

```ts
const updated = await OrderLifecycleService.completeApprovedRefund(id)
```

Wrap operation logging and refund notification in individual `try/catch` blocks that log the side-effect failure without converting a committed refund into an API failure.

- [ ] **Step 5: Run route tests and verify GREEN**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run __tests__/api/admin/orders/status-route.test.ts __tests__/api/admin/refunds/complete-route.test.ts
```

Expected: both route files pass.

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- __tests__/api/admin/orders/status-route.test.ts __tests__/api/admin/refunds/complete-route.test.ts src/app/api/admin/orders/[id]/status/route.ts src/app/api/admin/refunds/[id]/complete/route.ts
git commit -m "P: 后台订单与退款统一走生命周期服务"
```

### Task 4: Add cancellation confirmation and truthful refund errors

**Files:**
- Create: `__tests__/components/admin-order-refund-safety.test.ts`
- Create: `src/app/admin/orders/order-actions.ts`
- Create: `src/lib/utils/client-api-error.ts`
- Modify: `src/app/admin/orders/page.tsx`
- Modify: `src/app/admin/orders/_components/OrderDetailModal.tsx`
- Modify: `src/app/admin/refunds/page.tsx`

**Interfaces:**
- Parent order page owns the pending status action and loading state.
- `OrderDetailModal` delegates every action to `handleStatusAction`.
- Produces: `getAdminOrderActions(status: string)` with no cancellation action for `paid`.
- Produces: `requiresOrderActionConfirmation(action)` returning true for cancellation.
- Produces: `getClientApiError(payload, fallback)` preferring `error`, then `message`.

- [ ] **Step 1: Write failing behavioral policy tests**

Import the wished-for helpers and assert:

```ts
expect(getAdminOrderActions('pending').map(action => action.status))
  .toEqual(['paid', 'cancelled'])
expect(getAdminOrderActions('paid').map(action => action.status))
  .toEqual(['shipped'])
expect(requiresOrderActionConfirmation({ status: 'cancelled' })).toBe(true)
expect(requiresOrderActionConfirmation({ status: 'shipped' })).toBe(false)
expect(getClientApiError({ error: '订单状态不允许退款', message: '旧字段' }, '操作失败'))
  .toBe('订单状态不允许退款')
expect(getClientApiError({ message: '兼容消息' }, '操作失败')).toBe('兼容消息')
expect(getClientApiError({}, '操作失败')).toBe('操作失败')
```

- [ ] **Step 2: Run the component test and verify RED**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run __tests__/components/admin-order-refund-safety.test.ts
```

Expected: module-resolution failure because the policy and error helpers do not exist.

- [ ] **Step 3: Implement the action and error helpers**

Move the order-action definitions from the page into `order-actions.ts`. Export the status-action type, `getAdminOrderActions`, and `requiresOrderActionConfirmation`.

Implement:

```ts
export function getClientApiError(
  payload: { error?: unknown; message?: unknown },
  fallback: string,
): string {
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message
  return fallback
}
```

- [ ] **Step 4: Implement the parent-owned confirmation flow**

Add:

```ts
const [pendingStatusAction, setPendingStatusAction] = useState<{
  orderId: string
  action: { status: string; label: string }
} | null>(null)
const [updatingStatus, setUpdatingStatus] = useState(false)
```

For cancellation, `handleStatusAction` only opens the dialog. `handleConfirmStatusAction` sets loading, performs the request once, refreshes the list and open detail, then clears the pending action. Disable action buttons while `updatingStatus` is true.

Render:

```tsx
<ConfirmDialog
  open={pendingStatusAction?.action.status === 'cancelled'}
  title="确认取消订单"
  message="仅待支付订单可以取消。取消后将恢复该订单占用的库存和积分。"
  confirmText="确认取消"
  mode="emphasize"
  loading={updatingStatus}
  onConfirm={handleConfirmStatusAction}
  onCancel={() => !updatingStatus && setPendingStatusAction(null)}
/>
```

Remove direct network and refresh props from `OrderDetailModal`; it receives `handleStatusAction` and `updatingStatus`.

- [ ] **Step 5: Fix refund error rendering**

Change:

```ts
showMessage('error', getClientApiError(data, '操作失败'))
```

- [ ] **Step 6: Run helper and related tests**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run __tests__/components/admin-order-refund-safety.test.ts __tests__/services/order-lifecycle.test.ts __tests__/api/admin/orders/status-route.test.ts __tests__/api/admin/refunds/complete-route.test.ts
```

Expected: all targeted tests pass. In addition, inspect the rendered page in the preview browser during final verification to prove the confirmation dialog opens and remains disabled while submitting.

- [ ] **Step 7: Commit Task 4**

```powershell
git add -- __tests__/components/admin-order-refund-safety.test.ts src/app/admin/orders/order-actions.ts src/lib/utils/client-api-error.ts src/app/admin/orders/page.tsx src/app/admin/orders/_components/OrderDetailModal.tsx src/app/admin/refunds/page.tsx
git commit -m "fix: 完善订单取消确认与退款错误提示"
```

### Task 5: P0 verification checkpoint

**Files:**
- Verify only; do not change production data.

- [ ] **Step 1: Run all order/refund targeted tests**

```powershell
& .\node_modules\.bin\vitest.cmd run __tests__/services/order-lifecycle.test.ts __tests__/services/order.test.ts __tests__/api/orders/order-detail-route.test.ts __tests__/api/orders/refund-route.test.ts __tests__/api/admin/refunds/review-route.test.ts __tests__/api/admin/refunds/complete-route.test.ts __tests__/api/admin/orders/status-route.test.ts __tests__/components/admin-order-refund-safety.test.ts
```

- [ ] **Step 2: Run type checking**

```powershell
& .\node_modules\.bin\tsc.cmd --noEmit -p tsconfig.typecheck.json
```

- [ ] **Step 3: Inspect the P0 diff**

```powershell
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
rg -n "OrderLifecycleService\\.(requestRefund|completeRefund)" src
rg -n "paid: \\[|status: 'cancelled'" src/app/admin/orders/page.tsx
```

Expected: no production calls to deleted split refund methods and no paid-order cancellation action.

- [ ] **Step 4: Continue to the separate P1 authentication-recovery plan**

Create and execute `docs/superpowers/plans/2026-07-28-auth-session-recovery.md` only after the P0 checkpoint is green.
