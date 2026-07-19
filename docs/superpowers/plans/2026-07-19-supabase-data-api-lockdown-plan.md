# Supabase 数据接口权限封锁实施计划

> **执行人员必读：** 实施时必须使用 `superpowers:subagent-driven-development`（子代理驱动开发，推荐）或 `superpowers:executing-plans`（按计划分批执行）技能，逐项完成本计划。所有步骤使用复选框（`- [ ]`）跟踪。

**目标：** 阻止 Supabase 的 `anon`（匿名访问角色）和 `authenticated`（Supabase 已认证角色）读取或修改任何 `public` 业务表，同时保持 Prisma 服务端连接、`service_role`（Supabase 服务端特权角色）和 Storage（对象存储）的现有行为。

**架构：** 新增一份显式、可逐行复审的 Prisma SQL 迁移，对生产库 28 张表撤销表/序列权限并启用 RLS（Row Level Security，行级安全）。使用 Vitest 静态契约测试保护迁移范围，提供生产变更前后的只读审计 SQL 和操作手册；任何生产执行都必须先经过小M复审和胡子老师批准。

**技术栈：** PostgreSQL 17、Supabase、Prisma 6 数据库迁移、Vitest 4 测试框架、PowerShell、Next.js 15。

## 全局约束

- 本任务是 P 级生产权限变更。
- 小M未通过实施复审、胡子老师未明确批准执行窗口之前，禁止执行生产 SQL。
- 禁止修改表数据、列、索引、约束、Storage bucket（对象存储桶）、Storage policy（对象存储策略）、Prisma 模型或应用行为。
- 禁止授予任何新权限，禁止创建允许访问的宽松 RLS 策略。
- 必须使用已批准设计中的显式 28 表清单；生产表清单发生变化时立即停止。
- 不得包含 `password_reset_codes`；生产库不存在该表，它属于独立的数据库结构漂移任务。
- 禁止使用 `git add .`。
- 实施和预审阶段禁止推送、部署或运行 `prisma migrate deploy`（执行 Prisma 生产迁移）。

---

## 文件结构

- 新建 `__tests__/security/supabase-data-api-lockdown.test.ts`：验证迁移范围和禁用 SQL 的静态契约测试。
- 新建 `prisma/migrations/20260719_lock_down_supabase_data_api/migration.sql`：针对 28 张表的显式 `REVOKE`（撤权）和 RLS 语句。
- 新建 `scripts/audit-supabase-data-api.sql`：生产变更前后使用的只读审计查询。
- 修改 `scripts/README.md`：登记审计脚本，并声明脚本绝不修改数据库。
- 新建 `docs/runbooks/supabase-data-api-lockdown.md`：生产预检、执行、验证、停止条件和最小恢复程序。
- 新建 `docs/roles/tasks/xiaom/todo/小M_003号任务.md`：生产执行前的小M独立只读复审任务。

### 文件之间的关系

- 静态测试以 UTF-8 文本读取并检查目标迁移文件。
- 迁移只能产生 PostgreSQL 权限和 RLS 元数据变化。
- 审计脚本输出表清单、RLS 状态、授权、策略和不含业务内容的行数。
- 操作手册引用迁移和审计输出，但不包含任何凭据。
- 小M复审完整的未提交实施差异和命令证据。

---

### 任务 1：先用失败测试锁定安全契约

**文件：**
- 新建：`__tests__/security/supabase-data-api-lockdown.test.ts`
- 后续新建：`prisma/migrations/20260719_lock_down_supabase_data_api/migration.sql`

- [ ] **步骤 1：在迁移文件不存在时先创建契约测试**

测试必须定义准确的生产表清单：

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

describe('Supabase 数据接口权限封锁迁移', () => {
  it('撤销每张已批准表的 anon 和 authenticated 权限', () => {
    const sql = migrationSql()
    for (const table of tables) {
      expect(sql).toContain(
        `revoke all privileges on table public.${table} from anon, authenticated;`,
      )
    }
  })

  it('为每张已批准表启用 RLS', () => {
    const sql = migrationSql()
    for (const table of tables) {
      expect(sql).toContain(
        `alter table public.${table} enable row level security;`,
      )
    }
  })

  it('不放宽权限且不修改业务数据', () => {
    const sql = migrationSql()
    expect(sql).not.toMatch(/\bgrant\b/)
    expect(sql).not.toContain('disable row level security')
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate|drop)\b/)
    expect(sql).not.toContain('password_reset_codes')
  })
})
```

- [ ] **步骤 2：运行新测试并确认红灯（预期失败）**

运行：

```powershell
npx vitest run __tests__/security/supabase-data-api-lockdown.test.ts
```

预期：因为迁移文件不存在而以 `ENOENT`（找不到文件）失败。语法错误或测试未被发现不算有效红灯。

---

### 任务 2：新增显式权限迁移

**文件：**
- 新建：`prisma/migrations/20260719_lock_down_supabase_data_api/migration.sql`
- 测试：`__tests__/security/supabase-data-api-lockdown.test.ts`

- [ ] **步骤 1：为每张表创建一对显式迁移语句**

使用以下完整 SQL 创建迁移：

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

禁止使用动态 `DO $$` 代码块。必须显式列出语句，以便逐行复审，并避免未来新增表被静默纳入。

- [ ] **步骤 2：运行契约测试并确认绿灯（测试通过）**

运行：

```powershell
npx vitest run __tests__/security/supabase-data-api-lockdown.test.ts
```

预期：1 个测试文件通过，3 项测试通过。

- [ ] **步骤 3：核对迁移语句数量**

运行：

```powershell
$sql = Get-Content -Raw -Encoding UTF8 'prisma/migrations/20260719_lock_down_supabase_data_api/migration.sql'
([regex]::Matches($sql, '(?im)^REVOKE ALL PRIVILEGES ON TABLE public\.')).Count
([regex]::Matches($sql, '(?im)^ALTER TABLE public\..* ENABLE ROW LEVEL SECURITY;')).Count
```

预期：两个结果均为 `28`。

---

### 任务 3：新增生产只读审计脚本

**文件：**
- 新建：`scripts/audit-supabase-data-api.sql`
- 修改：`scripts/README.md`

- [ ] **步骤 1：增加表清单和 RLS 状态查询**

```sql
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;
```

- [ ] **步骤 2：增加角色授权查询**

```sql
SELECT grantee, table_name,
       string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
GROUP BY grantee, table_name
ORDER BY table_name, grantee;
```

- [ ] **步骤 3：增加策略和安全行数查询**

脚本必须列出 `public` schema（数据库命名空间）的 `pg_policies`（RLS 策略），并仅用 `count(*)` 返回关键表行数，不得读取具体行内容：

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

脚本只能包含 `SELECT`（只读查询）语句和注释。

- [ ] **步骤 4：登记审计脚本**

更新 `scripts/README.md`，明确说明：

- 用途：Data API（Supabase 数据接口）权限/RLS 的执行前和执行后审计；
- 安全性：严格只读，不含凭据，不输出行内容；
- 执行方式：通过 Supabase SQL Editor（SQL 编辑器）或只读 SQL 工具运行；
- 禁止事项：不得把包含生产统计的输出重定向到 Git 跟踪文件。

- [ ] **步骤 5：在契约测试中增加审计脚本安全断言**

扩展测试文件，读取 `scripts/audit-supabase-data-api.sql`，删除注释后执行以下断言：

```ts
expect(auditSql).not.toMatch(/\b(insert|update|delete|truncate|drop|alter|grant|revoke)\b/)
expect(auditSql).toMatch(/\bselect\b/)
```

创建脚本前先运行测试并观察红灯；创建脚本后重新运行并确认绿灯。

---

### 任务 4：新增生产操作手册

**文件：**
- 新建：`docs/runbooks/supabase-data-api-lockdown.md`

- [ ] **步骤 1：记录生产执行前置门槛**

操作手册必须要求：

1. 除已批准文件外，工作区必须干净；
2. 小M复审结论必须为“通过”；
3. 胡子老师明确批准生产执行窗口；
4. 最新生产表清单仍与已批准的 28 表完全一致；
5. 执行前审计输出只在对话中保存，不提交到仓库；
6. 数据库连接和 Vercel 应用处于可验证状态。

- [ ] **步骤 2：记录不含凭据的执行方式**

执行章节必须要求小酷把已复审的迁移 SQL 复制到 Supabase SQL 编辑器，或使用已批准的 SQL 执行工具。不得写入项目密钥、数据库连接地址、密码或 `service_role` token（服务端特权令牌）。

- [ ] **步骤 3：记录生产执行后验证**

必须按顺序执行：

1. 运行审计脚本；
2. 确认 28 张目标表全部启用 RLS；
3. 确认 `anon/authenticated` 的表授权数量为 0；
4. 确认关键表行数与执行前完全一致；
5. 重新运行 Supabase Security Advisor（安全顾问）；
6. 调用公开设置和商品接口；
7. 测试登录、认证用户资料、后台会员列表和订单列表；
8. 确认 Storage 上传行为没有因本任务改变，同时明确 Storage 风险仍由下一项 P0 处理。

- [ ] **步骤 4：记录停止和恢复条件**

操作手册必须禁止用 `GRANT ALL`（授予全部权限）回滚。应用失败时，先识别被阻断的真实调用方。另行批准后，只能为单张表恢复单项必要操作并配置默认拒绝的 RLS 策略；更优先的方案是把调用迁移到 Next.js API。

---

### 任务 5：运行本地验证并创建小M复审任务

**文件：**
- 新建：`docs/roles/tasks/xiaom/todo/小M_003号任务.md`
- 复核任务 1—4 的全部文件。

- [ ] **步骤 1：运行针对性检查和全仓库检查**

运行：

```powershell
npx vitest run __tests__/security/supabase-data-api-lockdown.test.ts
npm run typecheck
npm test
npm run build
git diff --check
git status --short --branch
```

预期：

- 针对性测试通过；
- `typecheck`（TypeScript 类型检查）退出码为 0；
- 全仓库测试全部通过；
- `build`（生产构建）退出码为 0；
- 差异格式检查退出码为 0；
- 没有暂存任何无关文件。

- [ ] **步骤 2：检查准确的实施差异**

运行：

```powershell
git -c core.quotePath=false diff -- \
  __tests__/security/supabase-data-api-lockdown.test.ts \
  prisma/migrations/20260719_lock_down_supabase_data_api/migration.sql \
  scripts/audit-supabase-data-api.sql \
  scripts/README.md \
  docs/runbooks/supabase-data-api-lockdown.md
```

确认没有执行任何生产 SQL，也没有修改应用文件。

- [ ] **步骤 3：创建具备六要素的小M_003任务**

复审任务必须明确：

- 目标：在提交、推送和生产执行前，独立复审 Data API 权限封锁实现；
- 基线：`708eb69` 加上已批准的设计和计划提交；
- 允许读取：五个实施文件、设计、计划、Git 差异/历史和生产只读元数据；
- 允许写入：无；
- 禁止操作：所有文件写入、提交、推送、部署、迁移执行、SQL 修改、Storage 变更；
- 验证内容：语句数量、禁用 SQL 扫描、针对性测试、类型检查/全量测试/构建证据、生产表清单和授权快照；
- 完成标准：只在对话中向小酷返回“通过/有条件通过/不通过”。

- [ ] **步骤 4：停止并等待独立复审**

不得暂存或提交实施文件。把完整的小M_003提示词交给胡子老师，由胡子老师复制给独立 Mavis AI。

---

### 任务 6：提交与生产执行门禁

**文件：**
- 与小M复审通过的实施文件完全相同。

- [ ] **步骤 1：小M通过后只精确暂存目标文件**

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

预期：恰好六个已复审文件，差异格式检查没有错误。

- [ ] **步骤 2：创建提交，但不执行生产 SQL**

```powershell
git commit -m "security: lock down Supabase Data API tables"
```

提交信息含义：安全修复——封锁 Supabase 数据接口对业务表的直接访问。

- [ ] **步骤 3：仅在胡子老师批准发布后推送**

```powershell
git push origin main
git log origin/main --oneline -1
```

预期：远程提交哈希与本地 HEAD（当前最新提交）完全一致。

- [ ] **步骤 4：单独取得生产执行批准**

报告已复审提交、测试、构建、远程状态、数据库执行前快照和迁移的准确影响。推送批准不得视为生产数据库修改批准。

- [ ] **步骤 5：执行并验证生产变更**

得到明确批准后，只执行一次已复审迁移，运行操作手册中的全部执行后检查，并把证据交给小M做最终只读复核。任何停止条件触发时，禁止扩大授权或实施未经复审的修复。

---

## 计划自审

- 计划覆盖已批准设计的全部要求：显式范围、双重防线、不修改 Storage、TDD（测试驱动开发）、只读审计、恢复策略、独立复审和单独生产批准。
- 不包含应用行为或 Prisma schema（数据模型）的变更。
- 28 表清单与 2026-07-19 获取的生产清单一致。
- `password_reset_codes` 被明确排除，并登记为独立任务。
- 所有实施变更均测试先行；配置 SQL 在创建前先由失败的静态契约测试锁定。
- 不存在占位内容或未说明的实施步骤。
