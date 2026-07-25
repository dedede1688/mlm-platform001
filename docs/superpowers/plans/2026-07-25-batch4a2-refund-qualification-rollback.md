# Batch 4A-2 Refund Qualification Rollback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make refunded orders stop contributing to qualification statistics while preserving the confirmed “levels only go up, never down” business rule.

**Architecture:** Add a focused `UserService.recomputeQualificationStatsForUsers()` method that recalculates qualification fields from current valid orders and current referral relationships. Call that method inside the existing refund transaction after the order status is changed to `refunded`, so money rollback and qualification-stat rollback succeed or fail together.

**Tech Stack:** Next.js App Router, TypeScript, Prisma ORM, PostgreSQL on Supabase, Vitest, PowerShell local verification

## Global Constraints

- This is a P-level refund and qualification-stat task. Do not push, deploy, migrate, or write production data without explicit 胡子老师 authorization.
- Follow approved design: `docs/superpowers/specs/2026-07-25-batch4a2-refund-qualification-rollback-design.md`.
- Keep level behavior as “只升不降”; do not decrement or recalculate `user.level`.
- Refunded orders must not contribute to `directSalesAmount` or `upgradeProductCount`.
- `directDistributorCount` must be recalculated from current direct children with `level >= MEMBER_LEVELS.DISTRIBUTOR`.
- Do not add migration, tables, columns, cron jobs, API routes, UI, or admin pages in this batch.
- Do not change reward rates, dividend rates, upgrade thresholds, withdrawal logic, or existing money ledgers.
- Use Prisma ORM only. `$queryRaw` and `$queryRawUnsafe` are prohibited.
- Use local binaries under `.\node_modules\.bin\`; do not use `npx`.
- Stage only exact authorized files with `git add -- <files>`. Never use `git add .`, `git add -A`, or `git add -u`.
- Each task must capture RED test evidence before implementation and GREEN evidence after implementation.

---

## File Structure

- Modify: `src/lib/services/user.service.ts` — add qualification-stat recomputation method; import `Prisma` type; keep existing upgrade logic unchanged.
- Modify: `src/lib/services/order-lifecycle.service.ts` — import `UserService`; include buyer referrer in refund order query; call recomputation inside the refund transaction after status becomes `refunded`.
- Modify: `__tests__/services/user.test.ts` — add mock Prisma chains for `order` and `orderItem`; add focused tests for the new recomputation method.
- Modify: `__tests__/services/order-lifecycle.test.ts` — mock `UserService.recomputeQualificationStatsForUsers`; assert refund chain invokes it in the transaction and fail-closed behavior works.

---

### Task 1: UserService Qualification Recompute

**Files:**
- Modify: `src/lib/services/user.service.ts`
- Modify: `__tests__/services/user.test.ts`

**Interfaces:**
- Produces: `UserService.recomputeQualificationStatsForUsers(userIds: string[], tx?: Prisma.TransactionClient): Promise<void>`
- Consumes: `MEMBER_LEVELS.DISTRIBUTOR`
- Later tasks rely on this method accepting duplicate/nullable-cleaned user IDs safely and not changing `level`.

- [ ] **Step 1: Extend the UserService test mock**

In `__tests__/services/user.test.ts`, extend `createMockChain()` users by adding `order` and `orderItem` to the mocked Prisma object:

```ts
const mockPrisma: any = {
  user: createMockChain(),
  order: createMockChain(),
  orderItem: createMockChain(),
  pointsRecord: createMockChain(),
  $transaction: vi.fn(),
}
```

This is only test scaffolding. It should not change production code.

- [ ] **Step 2: Add failing tests for qualification recomputation**

Append this new describe block near the existing `addDirectSales` and `addUpgradeProductCount` tests in `__tests__/services/user.test.ts`:

```ts
describe('recomputeQualificationStatsForUsers', () => {
  it('recomputes sales, upgrade product count and direct distributor count from valid current data', async () => {
    prisma.order.aggregate
      .mockResolvedValueOnce({ _sum: { payAmount: 1200 } }) // own valid orders
      .mockResolvedValueOnce({ _sum: { payAmount: 800 } }) // current direct children valid orders
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'child-1' }, { id: 'child-2' }])
    prisma.orderItem.aggregate.mockResolvedValueOnce({ _sum: { quantity: 3 } })
    prisma.user.count.mockResolvedValueOnce(1)
    prisma.user.update.mockResolvedValueOnce({} as any)

    await UserService.recomputeQualificationStatsForUsers(['u-main'])

    expect(prisma.order.aggregate).toHaveBeenNthCalledWith(1, {
      where: {
        userId: 'u-main',
        status: { in: ['paid', 'shipped', 'completed'] },
        rewardStatus: 'completed',
      },
      _sum: { payAmount: true },
    })
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { referrerId: 'u-main' },
      select: { id: true },
    })
    expect(prisma.order.aggregate).toHaveBeenNthCalledWith(2, {
      where: {
        userId: { in: ['child-1', 'child-2'] },
        status: { in: ['paid', 'shipped', 'completed'] },
        rewardStatus: 'completed',
      },
      _sum: { payAmount: true },
    })
    expect(prisma.orderItem.aggregate).toHaveBeenCalledWith({
      where: {
        order: {
          userId: 'u-main',
          status: { in: ['paid', 'shipped', 'completed'] },
          rewardStatus: 'completed',
        },
        product: { isUpgradeProduct: true },
      },
      _sum: { quantity: true },
    })
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        referrerId: 'u-main',
        level: { gte: 2 },
      },
    })
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-main' },
      data: {
        directSalesAmount: 2000,
        upgradeProductCount: 3,
        directDistributorCount: 1,
      },
    })
  })

  it('deduplicates user ids and handles users without current direct children', async () => {
    prisma.order.aggregate
      .mockResolvedValueOnce({ _sum: { payAmount: null } })
      .mockResolvedValueOnce({ _sum: { payAmount: 0 } })
    prisma.user.findMany.mockResolvedValueOnce([])
    prisma.orderItem.aggregate.mockResolvedValueOnce({ _sum: { quantity: null } })
    prisma.user.count.mockResolvedValueOnce(0)
    prisma.user.update.mockResolvedValueOnce({} as any)

    await UserService.recomputeQualificationStatsForUsers(['u-one', 'u-one'])

    expect(prisma.user.update).toHaveBeenCalledTimes(1)
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-one' },
      data: {
        directSalesAmount: 0,
        upgradeProductCount: 0,
        directDistributorCount: 0,
      },
    })
  })

  it('uses the provided transaction client when supplied', async () => {
    const tx: any = {
      order: { aggregate: vi.fn()
        .mockResolvedValueOnce({ _sum: { payAmount: 100 } })
        .mockResolvedValueOnce({ _sum: { payAmount: 50 } }) },
      orderItem: { aggregate: vi.fn().mockResolvedValueOnce({ _sum: { quantity: 2 } }) },
      user: {
        findMany: vi.fn().mockResolvedValueOnce([{ id: 'child-tx' }]),
        count: vi.fn().mockResolvedValueOnce(1),
        update: vi.fn().mockResolvedValueOnce({}),
      },
    }

    await UserService.recomputeQualificationStatsForUsers(['u-tx'], tx)

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u-tx' },
      data: {
        directSalesAmount: 150,
        upgradeProductCount: 2,
        directDistributorCount: 1,
      },
    })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__/services/user.test.ts --reporter=verbose
```

Expected RED evidence:

```text
UserService.recomputeQualificationStatsForUsers is not a function
```

If the failure is different because of mock shape, fix only the test scaffolding until the failure proves the missing method.

- [ ] **Step 4: Implement the new method**

In `src/lib/services/user.service.ts`, add this import:

```ts
import type { Prisma } from '@prisma/client'
```

Then add this method inside `export class UserService` after `addUpgradeProductCount`:

```ts
  static async recomputeQualificationStatsForUsers(
    userIds: string[],
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx ?? prisma
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))
    const validStatuses = ['paid', 'shipped', 'completed']

    for (const userId of uniqueUserIds) {
      const ownSales = await client.order.aggregate({
        where: {
          userId,
          status: { in: validStatuses },
          rewardStatus: 'completed',
        },
        _sum: { payAmount: true },
      })

      const directChildren = await client.user.findMany({
        where: { referrerId: userId },
        select: { id: true },
      })
      const directChildIds = directChildren.map((child) => child.id)

      const directChildrenSales = directChildIds.length > 0
        ? await client.order.aggregate({
          where: {
            userId: { in: directChildIds },
            status: { in: validStatuses },
            rewardStatus: 'completed',
          },
          _sum: { payAmount: true },
        })
        : { _sum: { payAmount: 0 } }

      const upgradeProducts = await client.orderItem.aggregate({
        where: {
          order: {
            userId,
            status: { in: validStatuses },
            rewardStatus: 'completed',
          },
          product: { isUpgradeProduct: true },
        },
        _sum: { quantity: true },
      })

      const directDistributorCount = await client.user.count({
        where: {
          referrerId: userId,
          level: { gte: MEMBER_LEVELS.DISTRIBUTOR },
        },
      })

      await client.user.update({
        where: { id: userId },
        data: {
          directSalesAmount: Number(ownSales._sum.payAmount ?? 0) + Number(directChildrenSales._sum.payAmount ?? 0),
          upgradeProductCount: Number(upgradeProducts._sum.quantity ?? 0),
          directDistributorCount,
        },
      })
    }
  }
```

Do not modify `checkAndUpgradeLevel`, `addDirectSales`, or `addUpgradeProductCount`.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__/services/user.test.ts --reporter=verbose
```

Expected: all `user.test.ts` tests pass.

- [ ] **Step 6: Commit Task 1 only**

Run:

```powershell
git diff --check
git add -- "src/lib/services/user.service.ts" "__tests__/services/user.test.ts"
git diff --cached --check
git diff --cached --name-status
git commit -m "feat: recompute refund qualification stats"
```

Stop and report Task 1 RED/GREEN evidence to 小酷.

---

### Task 2: Refund Transaction Integration

**Files:**
- Modify: `src/lib/services/order-lifecycle.service.ts`
- Modify: `__tests__/services/order-lifecycle.test.ts`

**Interfaces:**
- Consumes: `UserService.recomputeQualificationStatsForUsers(userIds, tx)`
- Preserves: `PointsService.voidUpgradePointsForRefund(orderId, tx)` call before reward refund.
- Preserves: `RewardService.processRefund(orderId)` behavior and order status validation.

- [ ] **Step 1: Mock UserService in order lifecycle tests**

In `__tests__/services/order-lifecycle.test.ts`, add this mock after the `PointsService` mock and before imports:

```ts
vi.mock('@/lib/services/user.service', () => ({
  UserService: {
    recomputeQualificationStatsForUsers: vi.fn(),
  },
}))
```

Add this import with the other service imports:

```ts
import { UserService } from '@/lib/services/user.service'
```

In `beforeEach`, add:

```ts
vi.mocked(UserService.recomputeQualificationStatsForUsers).mockResolvedValue(undefined)
```

- [ ] **Step 2: Add failing refund integration tests**

Add these tests inside `describe('requestRefund', () => { ... })` after the existing `调用 PointsService.voidUpgradePointsForRefund 冲销升级积分` test:

```ts
it('退款完成时在同一事务内重算买家和当前推荐人的资格累计值', async () => {
  mocks.order.findUnique.mockResolvedValueOnce({
    id: 'order-recompute',
    status: 'paid',
    userId: 'buyer-1',
    orderNo: 'ORD_RECOMPUTE',
    payAmount: 500,
    pointsUsed: 0,
    user: { referrerId: 'ref-1' },
    items: [{ productId: 'prod-upgrade', quantity: 2, product: { isUpgradeProduct: true } }],
  } as any)
  mocks.user.findUnique.mockResolvedValue({
    balance: 1000, consumeBalance: 500, earningsAvailable: 0,
    earningsPending: 0, earningsVoided: 0, frozenBalance: 0,
    totalPoints: 1000, unlockedPoints: 500, lockedPoints: 0,
  } as any)
  mocks.product.update.mockResolvedValue({} as any)
  mocks.user.updateMany.mockResolvedValueOnce({ count: 1 } as any)
  mocks.balanceRecord.create.mockResolvedValueOnce({} as any)
  vi.mocked(PointsService.voidUpgradePointsForRefund).mockResolvedValueOnce(undefined)
  vi.mocked(RewardService.processRefund).mockResolvedValueOnce({} as any)
  mocks.order.update.mockResolvedValueOnce({} as any)
  mocks.order.findUnique.mockResolvedValueOnce({ id: 'order-recompute', status: 'refunded' } as any)

  await OrderLifecycleService.requestRefund('order-recompute')

  expect(UserService.recomputeQualificationStatsForUsers).toHaveBeenCalledWith(
    ['buyer-1', 'ref-1'],
    expect.anything()
  )
})

it('退款完成时没有推荐人也会重算买家资格累计值', async () => {
  mocks.order.findUnique.mockResolvedValueOnce({
    id: 'order-buyer-only',
    status: 'paid',
    userId: 'buyer-only',
    orderNo: 'ORD_BUYER_ONLY',
    payAmount: 0,
    pointsUsed: 0,
    user: { referrerId: null },
    items: [],
  } as any)
  vi.mocked(PointsService.voidUpgradePointsForRefund).mockResolvedValueOnce(undefined)
  vi.mocked(RewardService.processRefund).mockResolvedValueOnce({} as any)
  mocks.order.update.mockResolvedValueOnce({} as any)
  mocks.order.findUnique.mockResolvedValueOnce({ id: 'order-buyer-only', status: 'refunded' } as any)

  await OrderLifecycleService.requestRefund('order-buyer-only')

  expect(UserService.recomputeQualificationStatsForUsers).toHaveBeenCalledWith(
    ['buyer-only'],
    expect.anything()
  )
})

it('资格累计值重算失败时退款不完成、订单不改 refunded', async () => {
  mocks.order.findUnique.mockResolvedValueOnce({
    id: 'order-recompute-fail',
    status: 'paid',
    userId: 'buyer-fail',
    orderNo: 'ORD_RECOMPUTE_FAIL',
    payAmount: 500,
    pointsUsed: 0,
    user: { referrerId: 'ref-fail' },
    items: [],
  } as any)
  mocks.user.findUnique.mockResolvedValue({
    balance: 1000, consumeBalance: 500, earningsAvailable: 0,
    earningsPending: 0, earningsVoided: 0, frozenBalance: 0,
    totalPoints: 1000, unlockedPoints: 500, lockedPoints: 0,
  } as any)
  mocks.user.updateMany.mockResolvedValueOnce({ count: 1 } as any)
  mocks.balanceRecord.create.mockResolvedValueOnce({} as any)
  vi.mocked(PointsService.voidUpgradePointsForRefund).mockResolvedValueOnce(undefined)
  vi.mocked(RewardService.processRefund).mockResolvedValueOnce({} as any)
  vi.mocked(UserService.recomputeQualificationStatsForUsers)
    .mockRejectedValueOnce(new Error('资格累计值重算失败'))

  await expect(OrderLifecycleService.requestRefund('order-recompute-fail'))
    .rejects.toThrow('资格累计值重算失败')

  expect(mocks.order.update).not.toHaveBeenCalledWith({
    where: { id: 'order-recompute-fail' },
    data: { status: 'refunded' },
  })
})
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__/services/order-lifecycle.test.ts --reporter=verbose
```

Expected RED evidence:

```text
expected "spy" to be called with arguments
```

The failure must prove the refund chain does not yet call `UserService.recomputeQualificationStatsForUsers`.

- [ ] **Step 4: Import UserService in production code**

In `src/lib/services/order-lifecycle.service.ts`, add:

```ts
import { UserService } from './user.service'
```

- [ ] **Step 5: Include buyer referrer in the refund order query**

Change the order lookup in `requestRefund` from:

```ts
include: { items: true },
```

to:

```ts
include: {
  user: { select: { referrerId: true } },
  items: { include: { product: { select: { isUpgradeProduct: true } } } },
},
```

The `items.product` include is intentionally present because the approved design requires the refund chain to have upgrade-product context. Do not use it for direct decrementing in this batch; the recompute service is the source of truth.

- [ ] **Step 6: Call recomputation inside the refund transaction after status update**

Replace the final order status update block:

```ts
await tx.order.update({
  where: { id: orderId },
  data: {
    status: ORDER_STATUS.REFUNDED,
  },
})
```

with:

```ts
await tx.order.update({
  where: { id: orderId },
  data: {
    status: ORDER_STATUS.REFUNDED,
  },
})

await UserService.recomputeQualificationStatsForUsers(
  [order.userId, order.user?.referrerId].filter((id): id is string => Boolean(id)),
  tx
)
```

Keep this inside `prisma.$transaction`. Do not catch and swallow recomputation errors.

- [ ] **Step 7: Run the focused refund tests and verify GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__/services/order-lifecycle.test.ts --reporter=verbose
```

Expected: all `order-lifecycle.test.ts` tests pass.

- [ ] **Step 8: Commit Task 2 only**

Run:

```powershell
git diff --check
git add -- "src/lib/services/order-lifecycle.service.ts" "__tests__/services/order-lifecycle.test.ts"
git diff --cached --check
git diff --cached --name-status
git commit -m "fix: recompute qualification stats on refund"
```

Stop and report Task 2 RED/GREEN evidence to 小酷.

---

### Task 3: Full Regression and Scope Guard

**Files:**
- Verify only. Do not edit files unless a verification failure proves a necessary fix inside the four authorized files.

**Interfaces:**
- Consumes Task 1 commit and Task 2 commit.
- Produces final implementation report for 小酷 review.

- [ ] **Step 1: Verify changed file scope**

Run:

```powershell
git diff HEAD~2 --name-status
```

Expected file list must be only:

```text
M src/lib/services/user.service.ts
M src/lib/services/order-lifecycle.service.ts
M __tests__/services/user.test.ts
M __tests__/services/order-lifecycle.test.ts
```

No Prisma schema, migration, API route, UI, package, lockfile, or docs changes are allowed in the implementation commits.

- [ ] **Step 2: Verify no forbidden raw SQL**

Run:

```powershell
rg -n "\$queryRaw|\$queryRawUnsafe" src/lib/services/user.service.ts src/lib/services/order-lifecycle.service.ts
```

Expected: no matches.

- [ ] **Step 3: Verify level is not downgraded**

Run:

```powershell
rg -n "level:\s*\{|decrement|MEMBER_LEVELS\.MEMBER|level\s*=" src/lib/services/user.service.ts src/lib/services/order-lifecycle.service.ts
```

Expected:

- Existing `checkAndUpgradeLevel` upgrade logic may appear.
- No new `level` decrement, downgrade, or recomputation logic may appear.

- [ ] **Step 4: Run targeted tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__/services/user.test.ts __tests__/services/order-lifecycle.test.ts
```

Expected: both files pass.

- [ ] **Step 5: Run full regression**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run
```

Expected: all tests pass.

- [ ] **Step 6: Run typecheck**

Run:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit --project tsconfig.typecheck.json
```

Expected: 0 TypeScript errors.

- [ ] **Step 7: Run Prisma validation without migration**

Run:

```powershell
.\node_modules\.bin\prisma.cmd validate
.\node_modules\.bin\prisma.cmd generate
```

Expected: both pass. This does not authorize `prisma migrate`.

- [ ] **Step 8: Run production build**

Run:

```powershell
.\node_modules\.bin\next.cmd build
```

Expected: build succeeds.

- [ ] **Step 9: Run whitespace and final Git checks**

Run:

```powershell
git diff --check
git diff --cached --check
git status --short --branch
git log -5 --oneline
```

Expected:

- no whitespace errors;
- no staged files;
- working tree clean;
- branch ahead only by the Task 1 and Task 2 implementation commits.

- [ ] **Step 10: Final report**

Return a structured report to 小酷 containing:

```text
Batch 4A-2 执行报告

1. 三态结论：通过 / 有条件通过 / 不通过
2. 执行前基线：branch、HEAD、origin/main、工作区状态
3. RED 证据：
   - UserService 新方法测试首次失败信息
   - OrderLifecycle refund 集成测试首次失败信息
4. GREEN 证据：
   - user.test 结果
   - order-lifecycle.test 结果
   - full vitest 结果
   - typecheck 结果
   - prisma validate/generate 结果
   - next build 结果
   - git diff --check 结果
5. commits：
   - Task 1 hash + message
   - Task 2 hash + message
6. 修改文件清单
7. 明确声明：
   - 未 push
   - 未 deploy
   - 未 migration
   - 未写生产数据库
   - 未修改 level 降级逻辑
   - 未修改奖励/分红比例
   - 未修改后台 UI
```

Do not push, deploy, or run production database commands.

---

## Self-Review Checklist for 小猫 Before Reporting

- [ ] The implementation follows `docs/superpowers/specs/2026-07-25-batch4a2-refund-qualification-rollback-design.md`.
- [ ] The only production files changed are `src/lib/services/user.service.ts` and `src/lib/services/order-lifecycle.service.ts`.
- [ ] The only test files changed are `__tests__/services/user.test.ts` and `__tests__/services/order-lifecycle.test.ts`.
- [ ] `UserService.recomputeQualificationStatsForUsers` recalculates from valid orders instead of decrementing one order.
- [ ] Refunded orders are excluded by status.
- [ ] `rewardStatus = 'completed'` is required for included orders.
- [ ] `directDistributorCount` is counted from current children with `level >= MEMBER_LEVELS.DISTRIBUTOR`.
- [ ] `level` is not changed by the recomputation method.
- [ ] Recompute is called inside the refund transaction after the order status is set to `refunded`.
- [ ] All required verification commands pass.
