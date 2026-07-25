# Batch 4A-3 Historical Unlock Schedule Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent any new `PointsUnlockSchedule` from being created with an empty order ID while preserving the existing three historical `orderId = ''` schedules.

**Architecture:** Add fail-closed runtime guards at the lowest write boundary (`PointsService.createPointsUnlockSchedule`) and at the upgrade orchestration boundary (`UserService.checkAndUpgradeLevel`). Update existing tests that currently bless empty `orderId` behavior, then run reward/refund regression tests to prove the real order-paid path still passes `order.id`.

**Tech Stack:** Next.js App Router, TypeScript, Prisma ORM, PostgreSQL on Supabase, Vitest, PowerShell local verification

## Global Constraints

- This is a P-level points/refund/history-data task. Do not push, deploy, migrate, or write production data without explicit 胡子老师 authorization.
- Follow approved design: `docs/superpowers/specs/2026-07-25-batch4a3-historical-unlock-schedule-guard-design.md`.
- Preserve the three existing production `PointsUnlockSchedule` rows with `orderId = ''`; do not update, void, delete, or backfill them.
- Do not add migration, database columns, indexes, API routes, cron jobs, UI, or admin pages in this batch.
- Do not change daily unlock behavior, refund amount logic, reward扣回, dividend扣回, qualification-stat rollback, or level “只升不降” behavior.
- Use Prisma ORM only. `$queryRaw` and `$queryRawUnsafe` are prohibited.
- Missing, empty, or whitespace-only order ID must fail closed before any new unlock schedule is created.
- Use local binaries under `.\node_modules\.bin\`; do not use `npx`.
- Stage only exact authorized files with `git add -- <files>`. Never use `git add .`, `git add -A`, or `git add -u`.
- Each implementation task must capture RED test evidence before implementation and GREEN evidence after implementation.

---

## File Structure

- Modify: `src/lib/services/points.service.ts` — validate `data.orderId` before `user.update` and before `pointsUnlockSchedule.create`.
- Modify: `src/lib/services/user.service.ts` — require a real `sourceOrderId` only when the upgrade would create distributor upgrade points and a schedule.
- Modify: `__tests__/services/points.test.ts` — replace the old “null becomes empty orderId” test with fail-closed tests; keep the valid order ID test green.
- Modify: `__tests__/services/user.test.ts` — update old upgrade tests to pass real order IDs where success is expected; add fail-closed test for missing `sourceOrderId`.
- Review only: `__tests__/services/reward.test.ts` — keep existing assertions that `RewardService.processOrderRewards` passes `order.id` into `UserService.checkAndUpgradeLevel`.
- Review only: `src/lib/services/reward.service.ts` and `src/lib/services/order-lifecycle.service.ts` — no expected code change; confirm the real flow still uses true order IDs.

---

### Task 1: PointsService orderId hard guard

**Files:**
- Modify: `src/lib/services/points.service.ts`
- Modify: `__tests__/services/points.test.ts`

**Interfaces:**
- Consumes: `PointsService.createPointsUnlockSchedule(data, tx?)`
- Produces: the same method signature, but with fail-closed behavior for `data.orderId` that is `null`, `''`, or whitespace.
- Later tasks rely on this exact error text: `创建升级积分解锁计划必须绑定真实订单ID`

- [ ] **Step 1: Replace the old empty-order test with fail-closed tests**

In `__tests__/services/points.test.ts`, inside `describe('createPointsUnlockSchedule (179-186)', ...)`, replace the test named:

```ts
it('creates schedule with no tx (uses prisma direct) and empty orderId', async () => {
```

with these three tests:

```ts
    it('fails closed when orderId is null and does not lock points or create schedule', async () => {
      await expect(PointsService.createPointsUnlockSchedule({
        userId: 'u-null',
        orderId: null,
        totalPoints: 1000,
        dailyUnlockRate: 0.01,
        totalDays: 100,
        nextUnlockDate: new Date(),
      })).rejects.toThrow('创建升级积分解锁计划必须绑定真实订单ID')

      expect(prisma.user.update).not.toHaveBeenCalled()
      expect(prisma.pointsUnlockSchedule.create).not.toHaveBeenCalled()
    })

    it('fails closed when orderId is empty string', async () => {
      await expect(PointsService.createPointsUnlockSchedule({
        userId: 'u-empty',
        orderId: '',
        totalPoints: 500,
        dailyUnlockRate: 0.02,
        totalDays: 50,
        nextUnlockDate: new Date(),
      })).rejects.toThrow('创建升级积分解锁计划必须绑定真实订单ID')

      expect(prisma.user.update).not.toHaveBeenCalled()
      expect(prisma.pointsUnlockSchedule.create).not.toHaveBeenCalled()
    })

    it('fails closed when orderId is whitespace only', async () => {
      await expect(PointsService.createPointsUnlockSchedule({
        userId: 'u-space',
        orderId: '   ',
        totalPoints: 300,
        dailyUnlockRate: 0.01,
        totalDays: 100,
        nextUnlockDate: new Date(),
      })).rejects.toThrow('创建升级积分解锁计划必须绑定真实订单ID')

      expect(prisma.user.update).not.toHaveBeenCalled()
      expect(prisma.pointsUnlockSchedule.create).not.toHaveBeenCalled()
    })
```

- [ ] **Step 2: Tighten the valid-order test assertion**

In the existing test named `uses provided orderId when not null`, keep the setup, and ensure it asserts both locked points and trimmed order ID:

```ts
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u2' },
          data: { lockedPoints: { increment: 500 } },
        })
      )
      expect(prisma.pointsUnlockSchedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u2',
            orderId: 'order-123',
            totalPoints: 500,
            remainingPoints: 500,
            completedDays: 0,
          }),
        })
      )
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__/services/points.test.ts --reporter=verbose
```

Expected RED evidence:

```text
expected promise to reject
```

The old implementation still accepts `null`, `''`, and whitespace, so at least one new fail-closed test must fail before implementation.

- [ ] **Step 4: Implement the minimal guard**

In `src/lib/services/points.service.ts`, inside `createPointsUnlockSchedule`, insert validation immediately after `const client = tx ?? prisma` and before `client.user.update`:

```ts
    const orderId = data.orderId?.trim()
    if (!orderId) {
      throw new Error('创建升级积分解锁计划必须绑定真实订单ID')
    }
```

Then replace:

```ts
        orderId: data.orderId || '',
```

with:

```ts
        orderId,
```

Do not move the validation below `client.user.update`; the purpose is to avoid increasing `lockedPoints` when order ID is invalid.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__/services/points.test.ts --reporter=verbose
```

Expected GREEN evidence:

```text
__tests__/services/points.test.ts
```

with all tests in that file passing.

- [ ] **Step 6: Commit Task 1**

Run:

```powershell
git diff --check
git add -- "src/lib/services/points.service.ts" "__tests__/services/points.test.ts"
git diff --cached --check
git commit -m "fix: require order id for point unlock schedules"
```

---

### Task 2: UserService upgrade sourceOrderId guard

**Files:**
- Modify: `src/lib/services/user.service.ts`
- Modify: `__tests__/services/user.test.ts`

**Interfaces:**
- Consumes: `UserService.checkAndUpgradeLevel(userId: string, sourceOrderId?: string)`
- Produces: the same method signature, but when an upgrade would create distributor points/schedule and `sourceOrderId` is missing or blank, it throws `升级积分发放必须绑定真实订单ID`.
- Later reward code still calls `UserService.checkAndUpgradeLevel(userId, order.id)`.

- [ ] **Step 1: Add a fail-closed user test**

In `__tests__/services/user.test.ts`, inside `describe('v54 D: 升级为经销商创建积分释放计划', ...)`, add this test before the existing success tests:

```ts
    it('缺失 sourceOrderId 时升级积分发放 fail-closed，不创建积分记录和解锁计划', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u-missing-order',
        level: 1,
        upgradeProductCount: 10,
        directSalesAmount: 0,
        referrerId: null,
      })

      const { getBusinessConfig } = await import('@/lib/config/business')
      vi.mocked(getBusinessConfig).mockImplementation(async (key: string, defaultValue: any) => {
        if (key === 'upgrade.points_per_box') return 500
        if (key === 'upgrade.daily_unlock_rate') return 0.01
        if (key === 'upgrade.distributor.box_count') return 10
        if (key.startsWith('upgrade.') && key.endsWith('.sales_amount')) return 999999
        return defaultValue
      })

      await expect(UserService.checkAndUpgradeLevel('u-missing-order'))
        .rejects.toThrow('升级积分发放必须绑定真实订单ID')

      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(prisma.user.update).not.toHaveBeenCalled()
      expect(PointsService.createPointsRecord).not.toHaveBeenCalled()
      expect(PointsService.createPointsUnlockSchedule).not.toHaveBeenCalled()
    })
```

This test intentionally expects the guard to fire before entering the transaction.

- [ ] **Step 2: Update existing success tests to pass real sourceOrderId**

In the same describe block and in `describe('v55.1: 升级事务原子化', ...)`, update success/failure tests that currently call without a second argument.

Change:

```ts
      await UserService.checkAndUpgradeLevel('u-d1')
```

to:

```ts
      await UserService.checkAndUpgradeLevel('u-d1', 'order-u-d1')
```

Then change the old assertion:

```ts
      expect(call.orderId).toBe('')
```

to:

```ts
      expect(call.orderId).toBe('order-u-d1')
```

Change:

```ts
      await UserService.checkAndUpgradeLevel('u-d2')
```

to:

```ts
      await UserService.checkAndUpgradeLevel('u-d2', 'order-u-d2')
```

Change:

```ts
      await expect(UserService.checkAndUpgradeLevel('u-d3')).rejects.toThrow('DB error')
```

to:

```ts
      await expect(UserService.checkAndUpgradeLevel('u-d3', 'order-u-d3')).rejects.toThrow('DB error')
```

Change:

```ts
      const result = await UserService.checkAndUpgradeLevel('u-tx1')
```

to:

```ts
      const result = await UserService.checkAndUpgradeLevel('u-tx1', 'order-u-tx1')
```

Change:

```ts
      await expect(UserService.checkAndUpgradeLevel('u-tx2')).rejects.toThrow('Schedule DB error')
```

to:

```ts
      await expect(UserService.checkAndUpgradeLevel('u-tx2', 'order-u-tx2')).rejects.toThrow('Schedule DB error')
```

- [ ] **Step 3: Confirm non-upgrade paths still allow omitted sourceOrderId**

Keep these existing non-upgrade calls unchanged:

```ts
await UserService.checkAndUpgradeLevel('nonexistent')
await UserService.checkAndUpgradeLevel('u3')
```

They should continue passing because they do not create upgrade points or a schedule.

- [ ] **Step 4: Run the focused test and verify RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__/services/user.test.ts --reporter=verbose
```

Expected RED evidence:

```text
expected promise to reject
```

The new fail-closed test must fail before implementation because current `checkAndUpgradeLevel` still passes `sourceOrderId ?? ''`.

- [ ] **Step 5: Implement the upstream guard**

In `src/lib/services/user.service.ts`, inside `if (newLevel > user.level)`, after computing `pointsAmount` and before `await prisma.$transaction(...)`, add:

```ts
      const willCreateDistributorPoints =
        newLevel >= MEMBER_LEVELS.DISTRIBUTOR &&
        user.level < MEMBER_LEVELS.DISTRIBUTOR &&
        pointsAmount > 0

      const normalizedSourceOrderId = sourceOrderId?.trim()
      if (willCreateDistributorPoints && !normalizedSourceOrderId) {
        throw new Error('升级积分发放必须绑定真实订单ID')
      }
```

Then inside `PointsService.createPointsRecord`, replace:

```ts
              sourceId: sourceOrderId,
```

with:

```ts
              sourceId: normalizedSourceOrderId,
```

Inside `PointsService.createPointsUnlockSchedule`, replace:

```ts
              orderId: sourceOrderId ?? '',
```

with:

```ts
              orderId: normalizedSourceOrderId!,
```

The non-null assertion is acceptable only because `willCreateDistributorPoints` already guarded the branch that creates distributor points.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__/services/user.test.ts --reporter=verbose
```

Expected GREEN evidence:

```text
__tests__/services/user.test.ts
```

with all tests in that file passing.

- [ ] **Step 7: Commit Task 2**

Run:

```powershell
git diff --check
git add -- "src/lib/services/user.service.ts" "__tests__/services/user.test.ts"
git diff --cached --check
git commit -m "fix: require source order for upgrade point schedules"
```

---

### Task 3: Reward/refund regression and safety scan

**Files:**
- Review: `src/lib/services/reward.service.ts`
- Review: `src/lib/services/order-lifecycle.service.ts`
- Review: `__tests__/services/reward.test.ts`
- No expected source modifications unless a regression is discovered.

**Interfaces:**
- Consumes: `RewardService.processOrderRewards(orderId)`
- Consumes: `UserService.checkAndUpgradeLevel(userId, sourceOrderId?)`
- Produces: evidence that real reward flow passes `order.id`, so the new guard does not break paid-order reward processing.

- [ ] **Step 1: Confirm real production call sites pass order ID**

Run:

```powershell
Select-String -Path ".\src\lib\services\reward.service.ts" -Pattern "checkAndUpgradeLevel" -Context 1,1
```

Expected evidence:

```text
UserService.checkAndUpgradeLevel(userId, order.id)
UserService.checkAndUpgradeLevel(user.referrerId, order.id)
```

- [ ] **Step 2: Confirm no schedule writer still uses empty fallback**

Run:

```powershell
Select-String -Path ".\src\lib\services\points.service.ts",".\src\lib\services\user.service.ts" -Pattern "orderId: data.orderId \|\| ''|orderId: sourceOrderId \?\? ''|sourceId: sourceOrderId"
```

Expected evidence:

```text
no matches
```

- [ ] **Step 3: Run reward regression tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__/services/reward.test.ts --reporter=verbose
```

Expected GREEN evidence includes existing assertions such as:

```text
升级品订单调用 checkAndUpgradeLevel 时传入 order.id
```

and the file passes.

- [ ] **Step 4: Run refund lifecycle regression tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__/services/order-lifecycle.test.ts --reporter=verbose
```

Expected GREEN evidence:

```text
__tests__/services/order-lifecycle.test.ts
```

with all tests in that file passing.

- [ ] **Step 5: Run the combined target suite**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__/services/points.test.ts __tests__/services/user.test.ts __tests__/services/reward.test.ts __tests__/services/order-lifecycle.test.ts
```

Expected GREEN evidence:

```text
Test Files 4 passed
```

- [ ] **Step 6: Commit only if Task 3 discovers necessary test fixes**

If Step 1 through Step 5 pass without changes, do not create a Task 3 commit.

If a legitimate regression test needs adjustment, stage exact files only:

```powershell
git diff --check
git add -- "__tests__/services/reward.test.ts" "__tests__/services/order-lifecycle.test.ts"
git diff --cached --check
git commit -m "test: cover order id guard reward regressions"
```

---

### Task 4: Full verification and final implementation report

**Files:**
- Review: all modified files from Tasks 1-3
- No source modifications expected.

**Interfaces:**
- Consumes: completed commits from Task 1 and Task 2.
- Produces: final implementation report for 小酷审核.

- [ ] **Step 1: Run full Vitest**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run
```

Expected GREEN evidence:

```text
Test Files
Tests
failed 0
```

- [ ] **Step 2: Run TypeScript typecheck**

Run:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit --project tsconfig.typecheck.json
```

Expected GREEN evidence:

```text
exit code 0
```

No `error TS` output.

- [ ] **Step 3: Run Prisma validation and generation**

Run:

```powershell
.\node_modules\.bin\prisma.cmd validate
.\node_modules\.bin\prisma.cmd generate
```

Expected GREEN evidence:

```text
The schema at prisma\schema.prisma is valid
Generated Prisma Client
```

- [ ] **Step 4: Run production build**

Run:

```powershell
.\node_modules\.bin\next.cmd build
```

Expected GREEN evidence:

```text
Compiled successfully
```

- [ ] **Step 5: Final safety scan**

Run:

```powershell
git diff --check
git status --short --branch
git log -5 --oneline
Select-String -Path ".\src\lib\services\points.service.ts",".\src\lib\services\user.service.ts" -Pattern "orderId: data.orderId \|\| ''|orderId: sourceOrderId \?\? ''|sourceId: sourceOrderId"
```

Expected evidence:

```text
git diff --check has no output
working tree has no unstaged or staged changes
empty-order fallback scan has no matches
```

- [ ] **Step 6: Produce final implementation report**

The report must include:

```text
Batch 4A-3 执行报告
1. 三态结论：通过 / 有条件通过 / 不通过
2. 执行前基线：HEAD、origin/main、ahead、工作区状态
3. RED 证据：points/user 两组 fail-closed 测试首次失败摘要
4. 改动文件清单：精确列出文件和改动
5. GREEN 验证：points、user、reward、order-lifecycle、全量 vitest、typecheck、prisma validate/generate、next build、diff check
6. 空 orderId 扫描结果：确认无旧 fallback 写法
7. 安全声明：未 push、未 deploy、未 migration、未写生产数据库、未处理历史三条 schedule
8. commit hash 列表
```

---

## Self-Review Checklist

- Spec coverage: Task 1 covers lowest-level schedule guard; Task 2 covers upgrade orchestration guard; Task 3 covers reward/refund regression; Task 4 covers full verification and report.
- Historical data boundary: The plan explicitly forbids production writes, backfill, void, delete, and migration.
- Placeholder scan: No unresolved placeholder instructions are present.
- Type consistency: `PointsService.createPointsUnlockSchedule` keeps its existing signature; `UserService.checkAndUpgradeLevel` keeps its existing signature; new runtime variables are `orderId`, `willCreateDistributorPoints`, and `normalizedSourceOrderId`.
- Project workflow: This plan is for 小猫 execution after 胡子老师 approval; 小酷 will review the result before 小M只读复审.
