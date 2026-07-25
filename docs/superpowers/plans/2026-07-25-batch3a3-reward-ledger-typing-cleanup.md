# Batch 3A-3 Reward Ledger Typing Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove one `any` type in the reward service transaction helper and correct refund-dividend balance ledger source semantics without changing money amounts, balances, database schema, or production data.

**Architecture:** Keep the existing `RewardService` structure. Add a narrow Prisma client type alias that accepts both the root Prisma client and a transaction client for `findBrandBonusRecipients`. Update the refund-dividend negative ledger record so its `sourceType` matches the `dividend.id` in `sourceId`, then lock that behavior with unit-test assertions.

**Tech Stack:** Next.js App Router, TypeScript, Prisma 6, Vitest, PostgreSQL/Supabase, existing `@/lib/prisma` singleton.

## Global Constraints

- Scope is limited to `src/lib/services/reward.service.ts` and `__tests__/services/reward.test.ts`.
- Do not add, edit, or execute a database migration.
- Do not change reward/dividend amounts, user balances, settlement behavior, refund idempotency, order state, API contracts, or UI.
- Do not trigger real refund, real dividend settlement, cron execution, production database writes, push, or deployment during implementation.
- Use exact git staging only; do not use `git add .`, `git add -A`, or `git add -u`.
- Because this touches funds ledger semantics, treat as P-sensitive even though it is a small code/test cleanup.

---

## File Structure

- `src/lib/services/reward.service.ts`
  - Import Prisma namespace/type support.
  - Define a local helper type for callers that expose `user.findUnique`.
  - Change `findBrandBonusRecipients` parameter from `tx: any` to the local type.
  - Change only the refund-dividend negative ledger `sourceType` from `'reward'` to `'dividend'`.

- `__tests__/services/reward.test.ts`
  - Add explicit assertions that refund-dividend balance records have `sourceType: 'dividend'` and `sourceId: dividend.id`.
  - Reuse existing refund tests; do not create broad new fixtures unless an existing test cannot express the assertion.

## Task 1: Lock refund-dividend source semantics with a failing test

**Files:**
- Modify: `D:/mlm-platform-source/mlm-platform/__tests__/services/reward.test.ts`
- No production source modification in this task.

**Interfaces:**
- Consumes: `RewardService.processRefund(orderId: string): Promise<void>`
- Produces: Failing assertion proving refund-dividend negative ledger should use `sourceType: 'dividend'`.

- [ ] **Step 1: Record the clean baseline**

Run:

```powershell
git status --short --branch
git diff --name-status
git diff --cached --name-status
```

Expected:

```text
## main...origin/main
```

No modified/staged/untracked implementation files should be present before editing.

- [ ] **Step 2: Add the failing semantic assertion**

In `D:/mlm-platform-source/mlm-platform/__tests__/services/reward.test.ts`, find the existing test:

```ts
it('should deduct dividends and write BalanceRecord with type=refund_dividend', async () => {
```

After the existing assertions:

```ts
expect(call.data[0].type).toBe('refund_dividend')
expect(call.data[0].amount).toBe(-50)
expect(call.data[0].balance).toBe(300)
```

add:

```ts
expect(call.data[0].sourceType).toBe('dividend')
expect(call.data[0].sourceId).toBe('dividend-refund-1')
```

Use the actual dividend fixture id already defined in that test. If the id differs, copy the literal id from the test's `prisma.dividend.findMany.mockResolvedValueOnce(...)` fixture and use that exact value.

- [ ] **Step 3: Run the targeted test and confirm red**

Run:

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/services/reward.test.ts --reporter=verbose
```

Expected before implementation:

```text
FAIL __tests__/services/reward.test.ts
expected 'reward' to be 'dividend'
```

If the assertion does not fail, inspect whether the current source was already changed; do not continue blindly.

## Task 2: Implement the two-line production cleanup

**Files:**
- Modify: `D:/mlm-platform-source/mlm-platform/src/lib/services/reward.service.ts`
- Test: `D:/mlm-platform-source/mlm-platform/__tests__/services/reward.test.ts`

**Interfaces:**
- Consumes: Existing `prisma` singleton imported from `@/lib/prisma`.
- Produces: `findBrandBonusRecipients(buyerId: string, maxLayers: number, tx: RewardQueryClient): Promise<Array<{ userId: string; layer: number }>>`

- [ ] **Step 1: Import Prisma type namespace**

At the top of `D:/mlm-platform-source/mlm-platform/src/lib/services/reward.service.ts`, change:

```ts
import { prisma } from '@/lib/prisma'
```

to:

```ts
import { Prisma, prisma } from '@/lib/prisma'
```

If `@/lib/prisma` does not export `Prisma`, use this instead:

```ts
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
```

Use the option that passes `tsc --noEmit --project tsconfig.typecheck.json`.

- [ ] **Step 2: Add a narrow query-client type**

Above `findBrandBonusRecipients`, add:

```ts
type RewardQueryClient = Pick<Prisma.TransactionClient, 'user'>
```

This is intentionally narrow: `findBrandBonusRecipients` only needs `user.findUnique`, and both the transaction client and root Prisma client satisfy that shape.

- [ ] **Step 3: Remove the `any` parameter**

Change:

```ts
async function findBrandBonusRecipients(
  buyerId: string,
  maxLayers: number,
  tx: any
): Promise<Array<{ userId: string; layer: number }>> {
```

to:

```ts
async function findBrandBonusRecipients(
  buyerId: string,
  maxLayers: number,
  tx: RewardQueryClient
): Promise<Array<{ userId: string; layer: number }>> {
```

Do not change function behavior.

- [ ] **Step 4: Correct refund-dividend source type**

Inside the `refund_dividend` balance-record creation block, change only:

```ts
sourceType: 'reward',
sourceId: dividend.id,
```

to:

```ts
sourceType: 'dividend',
sourceId: dividend.id,
```

Do not change `type`, `amount`, `balance`, `frozenBalance`, or `description`.

- [ ] **Step 5: Run the targeted test and confirm green**

Run:

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/services/reward.test.ts --reporter=verbose
```

Expected:

```text
PASS __tests__/services/reward.test.ts
```

All reward service tests should pass.

## Task 3: Full local verification and commit

**Files:**
- Verify: `D:/mlm-platform-source/mlm-platform/src/lib/services/reward.service.ts`
- Verify: `D:/mlm-platform-source/mlm-platform/__tests__/services/reward.test.ts`

**Interfaces:**
- Consumes: Completed Task 1 and Task 2 changes.
- Produces: One local commit ready for 小M read-only review.

- [ ] **Step 1: Confirm no remaining `tx: any` in reward service**

Run:

```powershell
Select-String -LiteralPath "src\lib\services\reward.service.ts" -Pattern "tx: any"
```

Expected: no output.

- [ ] **Step 2: Confirm refund-dividend source semantics**

Run:

```powershell
Select-String -LiteralPath "src\lib\services\reward.service.ts" -Pattern "type: 'refund_dividend'|sourceType: 'dividend'|sourceId: dividend.id" -Context 0,5
```

Expected: the `refund_dividend` block shows `sourceType: 'dividend'` and `sourceId: dividend.id`.

- [ ] **Step 3: Run typecheck**

Run:

```powershell
& ".\node_modules\.bin\tsc.cmd" --noEmit --project tsconfig.typecheck.json
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 4: Run full tests**

Run:

```powershell
& ".\node_modules\.bin\vitest.cmd" run
```

Expected: exit code 0, all tests pass.

- [ ] **Step 5: Run production build**

Run:

```powershell
& ".\node_modules\.bin\next.cmd" build
```

Expected: exit code 0. Local Supabase reachability warnings are acceptable only if Next build completes successfully.

- [ ] **Step 6: Check whitespace and diff scope**

Run:

```powershell
git diff --check
git diff --name-status
git diff --cached --name-status
```

Expected diff scope:

```text
M	__tests__/services/reward.test.ts
M	src/lib/services/reward.service.ts
```

No staged files before explicit staging.

- [ ] **Step 7: Stage exact files**

Run:

```powershell
git add -- "src/lib/services/reward.service.ts" "__tests__/services/reward.test.ts"
git diff --cached --name-status
```

Expected staged scope:

```text
M	__tests__/services/reward.test.ts
M	src/lib/services/reward.service.ts
```

- [ ] **Step 8: Commit**

Run:

```powershell
git commit -m "fix: clean up reward ledger typing"
```

Expected: one local commit, no push.

- [ ] **Step 9: Final local status**

Run:

```powershell
git status --short --branch
git log -3 --oneline
```

Expected:

```text
## main...origin/main [ahead 1]
```

Latest commit message:

```text
fix: clean up reward ledger typing
```

## 小M只读复审门槛

After implementation, ask 小M to review only these points:

- `findBrandBonusRecipients` no longer uses `any`.
- The replacement type accepts both `tx` inside `prisma.$transaction` and root `prisma` in the legacy internal method.
- `refund_dividend` balance record uses `sourceType: 'dividend'` with `sourceId: dividend.id`.
- No reward amount, dividend amount, user balance, refund idempotency, order reward state, migration, cron, API, or UI behavior changed.
- Targeted test, full tests, typecheck, and build passed.

## Explicit Non-Goals

- Do not delete old reward helper methods in this batch.
- Do not refactor `reward.service.ts` broadly.
- Do not change ledger descriptions.
- Do not change Prisma schema.
- Do not run production database writes.
- Do not push or deploy before 小M review and 胡子老师 release confirmation.

