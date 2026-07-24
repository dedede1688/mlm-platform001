# Batch 3A-2 Single-Path Dividend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make order payment the only dividend-generation path, guarantee each order reward is issued at most once, automatically retry failed issuance, preserve refund audit history, and migrate the existing ¥150 without changing user funds.

**Architecture:** A paid order owns a reward-processing state machine. One idempotent orchestrator claims the order, calculates all reward recipients, writes referral rewards, brand rewards, dividends, ledgers and earnings in one Prisma transaction, then marks the order complete. A daily retry job processes only recoverable orders; database unique constraints are the final duplicate-payment barrier.

**Tech Stack:** Next.js 15 App Router, TypeScript 5.7, Prisma 6, PostgreSQL 17 on Supabase, Vitest 4, Vercel Cron

## Global Constraints

- This is a P-level funds and database task. Do not skip design review, independent 小M review, user acceptance, or deployment verification.
- Keep `DIVIDEND_SETTLEMENT_PAUSED = true` until Task 7 passes every release gate.
- Never execute production `INSERT`, `UPDATE`, `DELETE`, DDL, or migration without explicit user authorization for that exact stage.
- Never change dividend rates, membership eligibility, `include_upstream` meaning, withdrawal rules, or unrelated reward algorithms.
- Existing production baseline is 6 dividends / ¥150 and 6 `dividend_reward` ledgers / ¥150; 2 rows / ¥50 are already credited despite `settled=false`.
- Historical migration must not increment or decrement any user funds.
- Use Prisma ORM by default. `$queryRaw` and `$queryRawUnsafe` are prohibited.
- Do not use `git add .` or `git add -A`; stage only the files listed in the current task.
- Each task stops after its commit and returns to 小酷 for review. Do not push or deploy without user approval.

---

## File Structure

- Modify: `prisma/schema.prisma` — reward state fields, dividend pool identity, refund audit fields, unique constraints.
- Create: `prisma/migrations/20260725040000_single_path_dividend_foundation/migration.sql` — additive schema and safe historical backfill.
- Create: `src/lib/services/order-reward-state.service.ts` — atomic claim, failure recording and retry eligibility.
- Modify: `src/lib/services/reward.service.ts` — one transaction for all order rewards and idempotent business keys.
- Modify: `src/app/api/orders/[id]/verify-payment/route.ts` — mark reward pending during payment and invoke the orchestrator after commit.
- Modify: `src/lib/utils/cron.ts` — replace dividend snapshot with failed reward retry.
- Modify: `src/app/api/cron/daily-tasks/route.ts` — update daily-task contract and comments.
- Modify/Delete: `src/app/api/cron/weekly-tasks/route.ts`, `vercel.json` — remove weekly funds trigger only after replacement is verified.
- Modify: `src/lib/services/reward.service.ts` refund section — retain dividends and mark `refundedAt`.
- Replace: `src/app/admin/dividends/page.tsx` — read-only dividend records.
- Create/Modify: `src/app/api/admin/dividends/route.ts` and `src/lib/admin-menu.ts` — read-only API and menu naming.
- Delete: `src/app/api/admin/settle-dividends/route.ts` after the read-only replacement is live.
- Modify: focused Vitest files under `__tests__/services`, `__tests__/api`, `__tests__/lib`, and `__tests__/components`.

---

### Task 1: Additive Data Foundation and Dry-Run Guards

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260725040000_single_path_dividend_foundation/migration.sql`
- Create: `__tests__/schema/single-path-dividend-schema.test.ts`

**Interfaces:**
- Produces `Order.rewardStatus`, `rewardAttempts`, `rewardLastError`, `rewardLastAttemptAt`, `rewardsCompletedAt`.
- Produces `Dividend.poolType` and `Dividend.refundedAt`.
- Produces database uniqueness for dividend business identity and reward business identity.

- [ ] **Step 1: Create the exact migration file**

Create `prisma/migrations/20260725040000_single_path_dividend_foundation/migration.sql` with `apply_patch`. Do not run `prisma migrate dev` against any shared or production database. The SQL content is completed in Step 5 and validated against an isolated local/test database before release.

- [ ] **Step 2: Write a failing schema contract test**

Create a source-level schema test that asserts these exact contracts:

```ts
expect(orderModel).toContain('rewardStatus')
expect(orderModel).toContain('rewardAttempts')
expect(orderModel).toContain('rewardLastError')
expect(orderModel).toContain('rewardLastAttemptAt')
expect(orderModel).toContain('rewardsCompletedAt')
expect(dividendModel).toContain('poolType')
expect(dividendModel).toContain('refundedAt')
expect(dividendModel).toContain('@@unique([orderId, userId, poolType])')
```

Also assert the reward model contains a deterministic, non-null `idempotencyKey String @unique`.

- [ ] **Step 3: Run the contract test and verify RED**

Run:

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/schema/single-path-dividend-schema.test.ts
```

Expected: FAIL because the new fields and constraints do not exist.

- [ ] **Step 4: Add the Prisma fields**

Use these exact defaults:

```prisma
rewardStatus        String    @default("completed") @map("reward_status")
rewardAttempts      Int       @default(0) @map("reward_attempts")
rewardLastError     String?   @map("reward_last_error")
rewardLastAttemptAt DateTime? @map("reward_last_attempt_at")
rewardsCompletedAt  DateTime? @map("rewards_completed_at")
```

New orders are explicitly changed to `pending` by the payment transaction; the database default remains `completed` so pre-existing orders cannot be accidentally replayed.

Add to `Dividend`:

```prisma
poolType   String    @map("pool_type")
refundedAt DateTime? @map("refunded_at")

@@unique([orderId, userId, poolType])
```

Add to `Reward`:

```prisma
idempotencyKey String @unique @map("idempotency_key")
```

- [ ] **Step 5: Make the migration additive and safe**

The migration must:

1. Add order state fields with historical-safe defaults.
2. Add nullable `pool_type`, backfill it using `user_level`:

```sql
CASE "user_level"
  WHEN 3 THEN 'director'
  WHEN 4 THEN 'manager'
  WHEN 5 THEN 'supervisor'
  WHEN 6 THEN 'president'
  WHEN 7 THEN 'board'
END
```

3. Stop with a constraint failure if any pool type remains null.
4. Set all existing dividend rows to `settled=true` without touching users or ledgers.
5. Add `pool_type NOT NULL`, `refunded_at`, and the unique dividend index.
6. Add nullable reward `idempotency_key`, backfill deterministic historical keys from existing record IDs, then set it `NOT NULL` and unique.
7. Contain no update to `users`, `balance_records.amount`, or reward/dividend amounts.

- [ ] **Step 6: Verify schema and migration locally**

Run:

```powershell
& ".\node_modules\.bin\prisma.cmd" validate
& ".\node_modules\.bin\prisma.cmd" generate
& ".\node_modules\.bin\vitest.cmd" run __tests__/schema/single-path-dividend-schema.test.ts
git diff --check
```

Expected: all exit 0.

- [ ] **Step 7: Commit only the foundation**

```powershell
git add -- "prisma/schema.prisma" "prisma/migrations/20260725040000_single_path_dividend_foundation/migration.sql" "__tests__/schema/single-path-dividend-schema.test.ts"
git diff --cached --check
git diff --cached --name-status
git commit -m "feat: add single-path reward data foundation"
```

Stop for 小酷 review. Do not apply to production.

---

### Task 2: Atomic and Idempotent Order Reward Orchestrator

**Files:**
- Create: `src/lib/services/order-reward-state.service.ts`
- Modify: `src/lib/services/reward.service.ts`
- Modify: `__tests__/services/reward.test.ts`
- Create: `__tests__/services/order-reward-state.test.ts`

**Interfaces:**
- Produces:

```ts
type RewardProcessOutcome =
  | { status: 'completed'; orderId: string }
  | { status: 'skipped'; orderId: string; reason: 'already_completed' | 'already_processing' | 'not_paid' }
  | { status: 'failed'; orderId: string; error: string }
```

- Produces `RewardService.processPaidOrderRewards(orderId: string): Promise<RewardProcessOutcome>`.

- [ ] **Step 1: Write failing state-claim tests**

Cover:

- `pending -> processing` succeeds.
- `failed` with attempts below 5 succeeds.
- recent `processing` cannot be claimed.
- `processing` older than 30 minutes can be claimed.
- `completed` is skipped.
- attempts at 5 are skipped.

The claim must use `prisma.order.updateMany` with order status in `paid`, `shipped`, or `completed`, plus the reward-state/time predicates.

- [ ] **Step 2: Run the claim tests and verify RED**

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/services/order-reward-state.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the claim and failure state service**

Expose:

```ts
claim(orderId: string): Promise<'claimed' | 'already_completed' | 'already_processing' | 'not_paid'>
markFailed(orderId: string, error: unknown): Promise<void>
```

`markFailed` must:

- truncate the sanitized message to 500 characters;
- increment `rewardAttempts`;
- set `rewardStatus='failed'`;
- set `rewardLastAttemptAt`;
- never update money fields.

- [ ] **Step 4: Write failing atomic reward tests**

Add tests proving:

1. referral, brand bonus and all dividend pools use the same `prisma.$transaction`.
2. one injected dividend failure produces zero reward, dividend, ledger and user-update commits.
3. two sequential calls return `completed` then `skipped`.
4. dividend idempotency key is `${orderId}:dividend:${userId}:${poolType}`.
5. reward idempotency keys include order, type, recipient and normalized layer.
6. dividends are created with `settled=true`, `settleDate` equal to issue time, and `poolType`.

- [ ] **Step 5: Run the reward tests and verify RED**

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/services/reward.test.ts __tests__/services/order-reward-state.test.ts
```

Expected: FAIL against the current per-reward transactions.

- [ ] **Step 6: Implement one reward transaction**

Refactor calculation into read-only preparation followed by exactly one Prisma transaction. The transaction must:

- create rewards with deterministic `idempotencyKey`;
- create dividends with `poolType`, `settled=true`, and deterministic business identity;
- write each positive ledger using the created reward/dividend ID as `sourceId`;
- aggregate user increments so each user is updated once;
- set the order to `rewardStatus='completed'`, clear `rewardLastError`, and set `rewardsCompletedAt`.

Do not use `createMany({ skipDuplicates: true })` as a substitute for understanding which record won. Catch only Prisma unique-conflict errors that correspond to the declared business keys.

- [ ] **Step 7: Verify GREEN**

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/services/reward.test.ts __tests__/services/order-reward-state.test.ts
& ".\node_modules\.bin\tsc.cmd" --noEmit --project tsconfig.typecheck.json
```

Expected: all pass, 0 type errors.

- [ ] **Step 8: Commit**

```powershell
git add -- "src/lib/services/order-reward-state.service.ts" "src/lib/services/reward.service.ts" "__tests__/services/reward.test.ts" "__tests__/services/order-reward-state.test.ts"
git diff --cached --check
git commit -m "feat: issue order rewards atomically"
```

Stop for 小酷 review.

---

### Task 3: Payment Integration and Automatic Retry

**Files:**
- Modify: `src/app/api/orders/[id]/verify-payment/route.ts`
- Modify: `src/lib/utils/cron.ts`
- Modify: `src/app/api/cron/daily-tasks/route.ts`
- Modify: `__tests__/lib/cron.test.ts`
- Create: `__tests__/api/orders/reward-state-payment.test.ts`

**Interfaces:**
- Consumes `RewardService.processPaidOrderRewards(orderId)`.
- Produces `retryFailedOrderRewards(limit = 20)` within the daily task.

- [ ] **Step 1: Write failing payment integration tests**

Assert:

- payment transaction sets `rewardStatus='pending'`, attempts 0 and clears old error;
- after commit, it calls `processPaidOrderRewards` once;
- reward failure still returns payment success but persists `failed`;
- the route never calls legacy `processOrderRewards`.

- [ ] **Step 2: Verify RED**

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/api/orders/reward-state-payment.test.ts
```

- [ ] **Step 3: Integrate the new orchestrator**

Keep payment balance and order status changes atomic. Replace the legacy reward call only after the payment transaction commits. Do not combine payment funds and downstream rewards into one transaction.

- [ ] **Step 4: Write failing retry tests**

Daily retry must:

- query only paid/shipped/completed orders in `pending`, eligible `failed`, or stale `processing`;
- process at most 20 per run;
- continue after one order fails;
- report attempted, completed, skipped and failed counts;
- never call `snapshotDailyDividends`.

- [ ] **Step 5: Verify RED**

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/lib/cron.test.ts
```

- [ ] **Step 6: Implement retry and update the daily route**

Replace dividend snapshot result with:

```ts
rewardRetry?: {
  success: boolean
  attempted: number
  completed: number
  skipped: number
  failed: number
  error?: string
}
```

Preserve points unlock and auto-complete behavior.

- [ ] **Step 7: Verify and commit**

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/api/orders/reward-state-payment.test.ts __tests__/lib/cron.test.ts __tests__/services/reward.test.ts
& ".\node_modules\.bin\tsc.cmd" --noEmit --project tsconfig.typecheck.json
git add -- "src/app/api/orders/[id]/verify-payment/route.ts" "src/lib/utils/cron.ts" "src/app/api/cron/daily-tasks/route.ts" "__tests__/lib/cron.test.ts" "__tests__/api/orders/reward-state-payment.test.ts"
git diff --cached --check
git commit -m "feat: retry failed order rewards safely"
```

Stop for review.

---

### Task 4: Refund Without Deleting Audit Records

**Files:**
- Modify: `src/lib/services/reward.service.ts`
- Modify: `__tests__/services/reward.test.ts`
- Modify if required by the existing route contract: `src/app/api/admin/refunds/[id]/complete/route.ts`

**Interfaces:**
- Consumes dividends where `refundedAt=null`.
- Produces retained dividends with `refundedAt=<transaction time>`.

- [ ] **Step 1: Write failing refund tests**

Assert:

- refund selects only paid rewards and non-refunded dividends;
- dividend rows are updated, never deleted;
- positive source records remain queryable;
- negative ledgers use the original reward/dividend ID;
- a second refund call makes zero money changes;
- available-shortfall behavior still increments `earningsVoided`.

- [ ] **Step 2: Verify RED**

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/services/reward.test.ts -t "refund"
```

- [ ] **Step 3: Implement minimal refund refactor**

Replace `dividend.deleteMany` with conditional `updateMany`:

```ts
where: { id: { in: dividendIds }, refundedAt: null }
data: { refundedAt: refundTime }
```

Keep deduction, negative ledgers and refund markers in the same transaction.

- [ ] **Step 4: Verify and commit**

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/services/reward.test.ts
& ".\node_modules\.bin\tsc.cmd" --noEmit --project tsconfig.typecheck.json
git add -- "src/lib/services/reward.service.ts" "__tests__/services/reward.test.ts"
git diff --cached --check
git commit -m "fix: retain refunded dividend audit records"
```

Add the refund route file to the exact stage list only if its contract genuinely changed.

---

### Task 5: Replace Settlement UI With Read-Only Dividend Records

**Files:**
- Create: `src/app/api/admin/dividends/route.ts`
- Modify: `src/app/admin/dividends/page.tsx`
- Modify: `src/lib/admin-menu.ts`
- Delete: `src/app/api/admin/settle-dividends/route.ts`
- Modify/Create: `__tests__/api/admin/dividends-route.test.ts`
- Modify/Create: `__tests__/components/admin-dividends-readonly.test.ts`

**Interfaces:**
- Produces authenticated `GET /api/admin/dividends`.
- Accepts filters: `orderNo`, `user`, `poolType`, `dateFrom`, `dateTo`, `page`, `limit`.
- Allows roles `super_admin`, `finance_admin`, and `auditor`.

- [ ] **Step 1: Write failing route and UI contract tests**

Assert:

- route calls `verifyPermission` with the three read-only roles;
- pagination limit is capped at 100;
- response contains order number, recipient, pool type, amount, created time and refund state;
- UI contains no `snapshot`, `settle`, “执行日快照”, or “执行周结”;
- UI fetch includes `Authorization: Bearer ${token}`;
- menu label is “分红记录”.

- [ ] **Step 2: Verify RED**

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/api/admin/dividends-route.test.ts __tests__/components/admin-dividends-readonly.test.ts
```

- [ ] **Step 3: Implement the read-only route and page**

Use Prisma `findMany` and `count` in `Promise.all`; select only fields required by the page. Do not expose password hashes or full user objects. The page must display reward failures as a separate read-only panel and must not expose a replay button.

- [ ] **Step 4: Delete the old manual settlement API**

Confirm no frontend or test caller remains:

```powershell
rg -n "settle-dividends|action: 'snapshot'|action: 'settle'" src __tests__
```

Expected after deletion: no runtime caller.

- [ ] **Step 5: Verify and commit**

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/api/admin/dividends-route.test.ts __tests__/components/admin-dividends-readonly.test.ts
& ".\node_modules\.bin\tsc.cmd" --noEmit --project tsconfig.typecheck.json
git add -- "src/app/api/admin/dividends/route.ts" "src/app/admin/dividends/page.tsx" "src/lib/admin-menu.ts" "__tests__/api/admin/dividends-route.test.ts" "__tests__/components/admin-dividends-readonly.test.ts"
git rm -- "src/app/api/admin/settle-dividends/route.ts"
git diff --cached --check
git commit -m "feat: make dividend admin view read only"
```

Stop for UI screenshot acceptance before publication.

---

### Task 6: Remove Weekly Funds Trigger and Dead Snapshot Path

**Files:**
- Modify: `vercel.json`
- Delete: `src/app/api/cron/weekly-tasks/route.ts`
- Modify: `src/lib/services/dividend.service.ts`
- Modify: `__tests__/services/dividend.test.ts`
- Modify: `__tests__/lib/cron.test.ts`
- Delete/Modify: `__tests__/api/admin/settle-dividends-route.test.ts`

**Interfaces:**
- Leaves no runtime caller for `snapshotDailyDividends` or `settleWeeklyDividends`.
- Keeps read-only dividend query helpers only if used.

- [ ] **Step 1: Write a failing dead-path contract**

Assert across `src` and `vercel.json`:

- no `/api/cron/weekly-tasks`;
- no `snapshotDailyDividends(`;
- no runtime `settleWeeklyDividends(`;
- no `daily_dividend` positive ledger creation;
- no `type: 'dividend'` weekly reward creation.

- [ ] **Step 2: Verify RED**

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/services/dividend.test.ts __tests__/lib/cron.test.ts
```

- [ ] **Step 3: Remove the dead paths**

Delete weekly route and schedule. Remove only the write-oriented dividend service methods and obsolete result types. Retain user/admin read helpers used by active APIs.

- [ ] **Step 4: Verify and commit**

```powershell
rg -n "snapshotDailyDividends|settleWeeklyDividends|daily_dividend|/api/cron/weekly-tasks" src vercel.json
& ".\node_modules\.bin\vitest.cmd" run __tests__/services/dividend.test.ts __tests__/lib/cron.test.ts
& ".\node_modules\.bin\tsc.cmd" --noEmit --project tsconfig.typecheck.json
git add -- "vercel.json" "src/lib/services/dividend.service.ts" "__tests__/services/dividend.test.ts" "__tests__/lib/cron.test.ts"
git rm -- "src/app/api/cron/weekly-tasks/route.ts" "__tests__/api/admin/settle-dividends-route.test.ts"
git diff --cached --check
git commit -m "refactor: remove duplicate dividend settlement paths"
```

Stop for review. The Batch 3A-1 guard is removed only because the guarded method itself no longer exists.

---

### Task 7: Full Verification, Independent Review, Migration and Production Acceptance

**Files:**
- Verify all Task 1–6 changes.
- No additional business implementation.

**Interfaces:**
- Produces release evidence and explicit production migration authorization request.

- [ ] **Step 1: Run fresh full verification**

```powershell
& ".\node_modules\.bin\vitest.cmd" run
& ".\node_modules\.bin\tsc.cmd" --noEmit --project tsconfig.typecheck.json
& ".\node_modules\.bin\next.cmd" build
git diff --check origin/main...HEAD
git status --short --branch
```

Expected: 0 failed tests, 0 type errors, build exit 0, no whitespace errors, clean worktree.

- [ ] **Step 2: Run production read-only preflight**

Using the connected Supabase read-only SQL tool, verify:

```text
dividends: 6 rows / ¥150
dividend_reward ledgers: 6 rows / ¥150
daily_dividend ledgers: 0
type=dividend weekly rewards: 0
unsettled historical rows: 2 / ¥50
```

If any value differs, stop. Do not apply the migration.

- [ ] **Step 3: Obtain 小M independent P-level review**

Review scope must include:

- all commits since `664282c`;
- migration safety and absence of user-fund updates;
- all business unique keys;
- atomic reward rollback;
- claim concurrency and retry limits;
- refund idempotency;
- removal of both duplicate paths;
- test adequacy.

Required result: “通过”. Any conditional or failed result returns to the relevant task.

- [ ] **Step 4: Obtain explicit user authorization for production migration and release**

Do not infer authorization from design approval. Ask separately after presenting preflight and 小M evidence.

- [ ] **Step 5: Apply migration, push and verify deployment**

Only after authorization:

1. Apply the reviewed migration.
2. Push `main`.
3. Confirm local HEAD equals `git log origin/main -1`.
4. Confirm Vercel Production commit equals the same full hash and status is Ready.

- [ ] **Step 6: Post-migration no-money-change check**

Immediately verify:

- dividends remain 6 / ¥150;
- positive dividend ledgers remain 6 / ¥150;
- both former ¥50 rows are marked paid/settled;
- every affected user’s money fields are unchanged from preflight;
- no weekly ledger or reward was created.

Any mismatch is a release incident; stop testing and report.

- [ ] **Step 7: New-order acceptance**

胡子老师 places one controlled test order. Verify:

1. order becomes paid;
2. reward status becomes completed;
3. each eligible reward/dividend has one business key;
4. each positive ledger references its exact source record;
5. user `earningsAvailable` increase equals the ledger sum;
6. waiting through the next daily retry does not add a second copy;
7. admin “分红记录” shows the same data and no funds buttons.

- [ ] **Step 8: Final report**

Report:

- commits and files;
- migration identifier;
- full test/typecheck/build results;
- 小M conclusion;
- origin/Vercel hash match;
- before/after production aggregates;
- controlled order five-way reconciliation;
- explicit statement that the old weekly settlement and daily snapshot paths are gone.
