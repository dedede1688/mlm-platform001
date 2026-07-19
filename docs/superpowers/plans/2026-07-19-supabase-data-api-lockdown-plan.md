# Supabase Data API Lockdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Supabase `anon` and `authenticated` roles from reading or modifying any `public` application table while preserving Prisma, service-role, and Storage behavior.

**Architecture:** Add one explicit, reviewable Prisma SQL migration that revokes table/sequence privileges and enables RLS on the 28 production tables. Protect the migration with a static Vitest contract test, provide read-only before/after audit SQL and an operational runbook, then require 小M review and 胡子老师 approval before any production execution.

**Tech Stack:** PostgreSQL 17, Supabase, Prisma 6 migrations, Vitest 4, PowerShell, Next.js 15.

## Global Constraints

- This is a P-level production permission change.
- Do not execute production SQL before 小M passes the implementation and 胡子老师 explicitly approves the execution window.
- Do not change table data, columns, indexes, constraints, Storage buckets, Storage policies, Prisma models, or application behavior.
- Do not grant any new privilege or create any permissive RLS policy.
- Use the explicit 28-table list from the approved design; stop if production inventory changes.
- Do not include `password_reset_codes`; it is absent from production and belongs to a separate schema-drift task.
- Do not use `git add .`.
- Do not push, deploy, or run `prisma migrate deploy` during implementation or pre-review.

---

## File Structure

- Create `__tests__/security/supabase-data-api-lockdown.test.ts`: static contract tests for migration scope and forbidden SQL.
- Create `prisma/migrations/20260719_lock_down_supabase_data_api/migration.sql`: explicit REVOKE and RLS statements for the 28 tables.
- Create `scripts/audit-supabase-data-api.sql`: read-only before/after production audit queries.
- Modify `scripts/README.md`: register the audit script and state that it never mutates the database.
- Create `docs/runbooks/supabase-data-api-lockdown.md`: production preflight, execution, verification, stop conditions, and minimal recovery procedure.
- Create `docs/roles/tasks/xiaom/todo/小M_003号任务.md`: independent read-only pre-production review task.

### Interfaces

- The static test consumes the exact migration file as UTF-8 text.
- The migration produces only PostgreSQL permission and RLS metadata changes.
- The audit script produces table inventory, RLS status, grants, policies, and non-sensitive row counts.
- The runbook consumes the migration and audit output; it does not contain credentials.
- 小M reviews the complete uncommitted implementation diff and command evidence.

---

### Task 1: Lock the expected security contract with a failing test

**Files:**
- Create: `__tests__/security/supabase-data-api-lockdown.test.ts`
- Future create: `prisma/migrations/20260719_lock_down_supabase_data_api/migration.sql`

- [ ] **Step 1: Create the contract test before the migration exists**

The test must define the exact production inventory:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const tables = [
  '_prisma_migrations',
  'addresses',
  'balance_records',
  'banners',
  'carts',
  'categories',
  'dividends',
  'level_snapshots',
  'manual_rewards',
  'notification_batches',
  'notification_templates',
  'notifications',
  'operation_logs',
  'order_items',
  'orders',
  'points_records',
  'points_unlock_schedules',
  'products',
  'recharge_audit_logs',
  'recharge_reject_templates',
  'recharge_requests',
  'refund_requests',
  'rewards',
  'system_configs',
  'users',
  'withdrawal_audit_logs',
  'withdrawal_reject_templates',
  'withdrawals',
] as const

const migrationPath = resolve(
  process.cwd(),
  'prisma/migrations/20260719_lock_down_supabase_data_api/migration.sql',
)

function migrationSql(): string {
  return readFileSync(migrationPath, 'utf8')
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

describe('Supabase Data API lockdown migration', () => {
  it('revokes anon and authenticated privileges from every approved table', () => {
    const sql = migrationSql()
    for (const table of tables) {
      expect(sql).toContain(
        `revoke all privileges on table public.${table} from anon, authenticated;`,
      )
    }
  })

  it('enables RLS on every approved table', () => {
    const sql = migrationSql()
    for (const table of tables) {
      expect(sql).toContain(
        `alter table public.${table} enable row level security;`,
      )
    }
  })

  it('does not weaken permissions or mutate business data', () => {
    const sql = migrationSql()
    expect(sql).not.toMatch(/\bgrant\b/)
    expect(sql).not.toContain('disable row level security')
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate|drop)\b/)
    expect(sql).not.toContain('password_reset_codes')
  })
})
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
npx vitest run __tests__/security/supabase-data-api-lockdown.test.ts
```

Expected: FAIL with `ENOENT` for the migration file. A syntax error or test discovery failure is not an acceptable RED result.

---

### Task 2: Add the explicit permission migration

**Files:**
- Create: `prisma/migrations/20260719_lock_down_supabase_data_api/migration.sql`
- Test: `__tests__/security/supabase-data-api-lockdown.test.ts`

- [ ] **Step 1: Create the migration with one explicit pair per table**

Create the migration with this complete SQL:

```sql
REVOKE ALL PRIVILEGES ON TABLE public._prisma_migrations FROM anon, authenticated;
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.addresses FROM anon, authenticated;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.balance_records FROM anon, authenticated;
ALTER TABLE public.balance_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.banners FROM anon, authenticated;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.carts FROM anon, authenticated;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.categories FROM anon, authenticated;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.dividends FROM anon, authenticated;
ALTER TABLE public.dividends ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.level_snapshots FROM anon, authenticated;
ALTER TABLE public.level_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.manual_rewards FROM anon, authenticated;
ALTER TABLE public.manual_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.notification_batches FROM anon, authenticated;
ALTER TABLE public.notification_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.notification_templates FROM anon, authenticated;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.notifications FROM anon, authenticated;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.operation_logs FROM anon, authenticated;
ALTER TABLE public.operation_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.order_items FROM anon, authenticated;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.orders FROM anon, authenticated;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.points_records FROM anon, authenticated;
ALTER TABLE public.points_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.points_unlock_schedules FROM anon, authenticated;
ALTER TABLE public.points_unlock_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.products FROM anon, authenticated;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.recharge_audit_logs FROM anon, authenticated;
ALTER TABLE public.recharge_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.recharge_reject_templates FROM anon, authenticated;
ALTER TABLE public.recharge_reject_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.recharge_requests FROM anon, authenticated;
ALTER TABLE public.recharge_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.refund_requests FROM anon, authenticated;
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.rewards FROM anon, authenticated;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.system_configs FROM anon, authenticated;
ALTER TABLE public.system_configs ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.users FROM anon, authenticated;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.withdrawal_audit_logs FROM anon, authenticated;
ALTER TABLE public.withdrawal_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.withdrawal_reject_templates FROM anon, authenticated;
ALTER TABLE public.withdrawal_reject_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.withdrawals FROM anon, authenticated;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
```

Do not use a dynamic `DO $$` block. Explicit statements are required for reviewability and to ensure an unexpected future table is not silently included.

- [ ] **Step 2: Run the contract test and verify GREEN**

Run:

```powershell
npx vitest run __tests__/security/supabase-data-api-lockdown.test.ts
```

Expected: 1 file passed, 3 tests passed.

- [ ] **Step 3: Verify migration statement counts**

Run:

```powershell
$sql = Get-Content -Raw -Encoding UTF8 'prisma/migrations/20260719_lock_down_supabase_data_api/migration.sql'
([regex]::Matches($sql, '(?im)^REVOKE ALL PRIVILEGES ON TABLE public\.')).Count
([regex]::Matches($sql, '(?im)^ALTER TABLE public\..* ENABLE ROW LEVEL SECURITY;')).Count
```

Expected: `28` and `28`.

---

### Task 3: Add a read-only production audit script

**Files:**
- Create: `scripts/audit-supabase-data-api.sql`
- Modify: `scripts/README.md`

- [ ] **Step 1: Add inventory and RLS query**

```sql
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;
```

- [ ] **Step 2: Add role grant query**

```sql
SELECT grantee, table_name,
       string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
GROUP BY grantee, table_name
ORDER BY table_name, grantee;
```

- [ ] **Step 3: Add policy and safe row-count queries**

The script must list `pg_policies` for `public` and return `count(*)` for the security-critical tables without selecting row data:

```sql
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

SELECT
  (SELECT count(*) FROM public.users) AS users,
  (SELECT count(*) FROM public.orders) AS orders,
  (SELECT count(*) FROM public.withdrawals) AS withdrawals,
  (SELECT count(*) FROM public.balance_records) AS balance_records,
  (SELECT count(*) FROM public.rewards) AS rewards;
```

The script must contain only `SELECT` statements and comments.

- [ ] **Step 4: Register the script**

Update `scripts/README.md` to describe:

- purpose: Data API permission/RLS preflight and postflight audit;
- safety: read-only, no credentials, no row contents;
- execution: run through Supabase SQL editor or read-only SQL tool;
- prohibition: never redirect its output into tracked files containing production data.

- [ ] **Step 5: Add audit-script safety assertions to the contract test**

Extend the test file to read `scripts/audit-supabase-data-api.sql` and assert after removing comments:

```ts
expect(auditSql).not.toMatch(/\b(insert|update|delete|truncate|drop|alter|grant|revoke)\b/)
expect(auditSql).toMatch(/\bselect\b/)
```

Run the test before creating the script to observe RED, then create the script and rerun to GREEN.

---

### Task 4: Add the production runbook

**Files:**
- Create: `docs/runbooks/supabase-data-api-lockdown.md`

- [ ] **Step 1: Document preflight gates**

The runbook must require:

1. clean worktree except approved files;
2. 小M review conclusion `通过`;
3. explicit 胡子老师 production-window approval;
4. fresh table inventory still equals the approved 28-table list;
5. before-snapshot audit output captured in the conversation, not committed;
6. database connection and Vercel application health available.

- [ ] **Step 2: Document the execution command without credentials**

The execution section must instruct 小酷 to copy the reviewed migration SQL into the Supabase SQL editor or use the approved SQL execution tool. It must not embed project keys, connection URLs, passwords, or service-role tokens.

- [ ] **Step 3: Document postflight verification**

Require, in order:

1. run the audit script;
2. confirm 28 target tables have RLS enabled;
3. confirm zero `anon/authenticated` table grants;
4. confirm critical row counts equal preflight values;
5. rerun Supabase Security Advisor;
6. call public settings/product endpoints;
7. test login, authenticated profile, admin users list, and order list;
8. verify Storage uploads are unchanged but explicitly still pending the next P0.

- [ ] **Step 4: Document stop and recovery conditions**

The runbook must prohibit `GRANT ALL` rollback. On application failure, first identify the blocked caller. Restore only a single required operation on a single table with a deny-by-default RLS policy after a separate approval, or migrate the caller to a Next.js API.

---

### Task 5: Run local verification and create the 小M review task

**Files:**
- Create: `docs/roles/tasks/xiaom/todo/小M_003号任务.md`
- Review all files from Tasks 1-4.

- [ ] **Step 1: Run targeted and repository checks**

Run:

```powershell
npx vitest run __tests__/security/supabase-data-api-lockdown.test.ts
npm run typecheck
npm test
npm run build
git diff --check
git status --short --branch
```

Expected:

- targeted test passes;
- typecheck exits 0;
- all repository tests pass;
- build exits 0;
- diff check exits 0;
- no unrelated file is staged.

- [ ] **Step 2: Inspect the exact implementation diff**

Run:

```powershell
git -c core.quotePath=false diff -- \
  __tests__/security/supabase-data-api-lockdown.test.ts \
  prisma/migrations/20260719_lock_down_supabase_data_api/migration.sql \
  scripts/audit-supabase-data-api.sql \
  scripts/README.md \
  docs/runbooks/supabase-data-api-lockdown.md
```

Confirm no production SQL was executed and no application file changed.

- [ ] **Step 3: Create 小M_003 with all six task elements**

The review task must specify:

- goal: independently review the Data API lockdown implementation before commit/push/production execution;
- baseline: `708eb69` plus the approved design/plan commits;
- allowed reads: the five implementation files, design, plan, Git diff/history, and read-only production metadata;
- allowed writes: none;
- prohibited operations: all file writes, commits, pushes, deployments, migrations, SQL mutations, Storage changes;
- verification: statement counts, forbidden-SQL scans, targeted test, typecheck/test/build evidence, production inventory and grant snapshots;
- completion: return `通过/有条件通过/不通过` only in conversation to 小酷.

- [ ] **Step 4: Stop for independent review**

Do not stage or commit implementation files. Give the complete 小M_003 prompt to 胡子老师 for copying to the independent Mavis AI.

---

### Task 6: Commit and production execution gates

**Files:**
- Same reviewed implementation files.

- [ ] **Step 1: After 小M passes, stage exact files only**

```powershell
git add -- \
  '__tests__/security/supabase-data-api-lockdown.test.ts' \
  'prisma/migrations/20260719_lock_down_supabase_data_api/migration.sql' \
  'scripts/audit-supabase-data-api.sql' \
  'scripts/README.md' \
  'docs/runbooks/supabase-data-api-lockdown.md' \
  'docs/roles/tasks/xiaom/todo/小M_003号任务.md'
git diff --cached --name-only
git diff --cached --check
```

Expected: exactly six reviewed files and no diff-check errors.

- [ ] **Step 2: Commit but do not execute production SQL**

```powershell
git commit -m "security: lock down Supabase Data API tables"
```

- [ ] **Step 3: Push only after 胡子老师 authorizes release**

```powershell
git push origin main
git log origin/main --oneline -1
```

Expected: remote hash equals local HEAD.

- [ ] **Step 4: Obtain a separate production execution approval**

Report the reviewed commit, tests, build, remote state, preflight database snapshot, and exact migration effects. Do not treat approval to push as approval to mutate production.

- [ ] **Step 5: Execute and verify production**

After explicit approval, execute the reviewed migration once, run every postflight check from the runbook, and provide the evidence to 小M for final read-only verification. If any stop condition triggers, do not broaden grants or make an unreviewed fix.

---

## Plan Self-Review

- The plan covers every approved design requirement: explicit scope, dual defense, no Storage changes, TDD, read-only audit, recovery, independent review, and separate production approval.
- No application behavior or schema model change is included.
- The 28-table list matches the production inventory captured on 2026-07-19.
- `password_reset_codes` is intentionally excluded and called out as a separate task.
- All implementation mutations are test-first; configuration SQL is guarded by a failing static contract test before creation.
- No placeholder or unspecified implementation step remains.
