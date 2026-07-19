# Supabase Data API Lockdown Design

> 日期：2026-07-19
> 级别：P 级（生产数据库权限）
> 状态：胡子老师已批准“撤权 + RLS 双保险”方向，等待书面设计复核

## 1. 背景与证据

生产 Supabase 项目 `mlm-platform-db` 的只读审计确认：

- `public` schema 有 28 张普通表，其中 23 张未启用 RLS；
- `anon` 与 `authenticated` 对大量业务表拥有 `SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER`；
- 暴露范围包含 `users`、`orders`、`withdrawals`、`rewards`、`balance_records` 等；
- `users` 包含 `password_hash` 与 `payment_password_hash`；
- `withdrawals` 包含 `account_number`，Supabase Security Advisor 已将其标为外部敏感列暴露；
- 项目浏览器端 Supabase client 只用于 Storage，业务表读写全部应经过 Next.js API 与 Prisma。

因此，业务表不需要向 Supabase Data API 的 `anon` 或 `authenticated` 角色开放。

## 2. 目标

1. 阻止 `anon` 与 `authenticated` 通过 Supabase Data API 直接读取或修改任何 `public` 业务表。
2. 使用权限撤销和 RLS 两道独立防线，避免单点配置错误重新暴露数据。
3. 保持 Prisma 服务端数据库连接、Supabase `service_role` 和 Storage 上传链路的既有行为。
4. 提供可审计、可验证、可回滚的生产变更流程。

## 3. 非目标

- 本任务不修改 Storage bucket 或 `storage.objects` policy；该问题单独进入下一项 P0。
- 不重构 Next.js API、Prisma schema 或认证系统。
- 不为浏览器创建任何业务表 RLS policy。
- 不删除表、列、数据、索引或约束。
- 不处理性能顾问中的未使用索引。

## 4. 方案选择

采用“撤权 + RLS 双保险”。

### 4.1 权限撤销

对 `public` 中所有应用普通表撤销：

```sql
revoke all privileges on table public.<table> from anon, authenticated;
```

同时撤销未来序列访问能力：

```sql
revoke all privileges on all sequences in schema public from anon, authenticated;
```

本任务使用显式表清单，不依赖运行时动态 SQL，以便复审准确看到目标范围。

### 4.2 RLS

对所有应用普通表执行：

```sql
alter table public.<table> enable row level security;
```

已有 RLS 的表重复执行 `ENABLE ROW LEVEL SECURITY` 是幂等操作。任务不创建允许访问的 policy，因此 `anon/authenticated` 即使未来被误授表权限，也仍受 RLS 默认拒绝保护。

### 4.3 保持可用的访问

- Prisma 使用服务端 PostgreSQL 连接用户，不依赖 `anon/authenticated`。
- Supabase `service_role` 不在撤权目标中。
- Storage 使用 `storage` schema，不在本任务 SQL 范围内。
- 浏览器端代码没有 `supabase.from(...)` 业务表调用，因此不需要保留 Data API 表权限。

## 5. 目标表范围

执行前通过 `pg_class` 重新生成并核对真实清单。当前已确认至少包含：

```text
_prisma_migrations
addresses
balance_records
banners
carts
categories
dividends
level_snapshots
manual_rewards
notification_batches
notification_templates
notifications
operation_logs
order_items
orders
points_records
points_unlock_schedules
products
recharge_audit_logs
recharge_reject_templates
recharge_requests
refund_requests
rewards
system_configs
users
withdrawal_audit_logs
withdrawal_reject_templates
withdrawals
```

如果执行时清单与设计阶段不同，必须停止并更新设计/计划，不得把新表自动纳入生产变更。

`prisma/schema.prisma` 定义了 `password_reset_codes`，但生产 `public` 当前不存在该表。它不属于本次权限封锁目标；该 schema drift 作为“忘记密码”独立任务处理，不得在本次安全迁移中顺手建表。

## 6. 迁移与回滚

### 6.1 正向迁移

仓库新增一份 Prisma SQL migration，内容只允许：

- 显式 `REVOKE`；
- 显式 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`；
- 必要的注释。

不得包含数据写入、DDL 删除、policy 放行或 Storage 变更。

### 6.2 回滚脚本

回滚脚本不进入自动迁移链，作为受控运维文档保存。由于恢复宽泛的 `ALL` 权限会重新产生安全漏洞，回滚只允许在确认业务确实依赖 Data API 后，由胡子老师单独批准，并按最小表、最小操作恢复。

默认回滚策略是：

1. 找出被阻断的真实调用；
2. 优先把调用迁移到 Next.js API；
3. 只有无法立即迁移时，才针对单表、单操作创建临时最小 RLS policy；
4. 不执行全量 `GRANT ALL` 回滚。

## 7. 验证设计

### 7.1 静态验证

- 扫描 `src/`，确认不存在浏览器业务表 `supabase.from(...)` 调用；
- migration 只包含允许的 SQL 语句；
- 目标表清单与生产 `pg_class` 一致；
- `git diff --check` 为 0。

### 7.2 数据库验证

生产执行前后分别保存只读快照：

1. `pg_class.relrowsecurity`；
2. `information_schema.role_table_grants`；
3. `pg_policies`；
4. 表数量和关键表行数摘要；
5. Supabase Security Advisor。

完成标准：

- 所有目标表 `relrowsecurity = true`；
- `anon/authenticated` 对目标表没有任何 table grant；
- 关键表行数执行前后不变；
- Security Advisor 不再报告目标表 `rls_disabled_in_public` 或敏感列无 RLS；
- Prisma 服务端健康检查能够读取公开设置和商品列表；
- 登录、后台列表和订单查询 API 不因权限变更失败；
- Storage 上传行为在本任务中保持不变。

### 7.3 失败处理

- 任一表数量或关键行数变化：立即停止，按数据事故处理；
- Prisma API 出现权限错误：停止发布，定位数据库连接角色，不进行宽泛授权；
- Security Advisor 仍有目标表 ERROR：不得宣布完成；
- 只要小M复审未通过，不执行生产 SQL。

## 8. 测试策略

权限 SQL 不能用普通 Vitest 完整模拟，因此采用三层验证：

1. 新增静态迁移测试，解析 SQL 并断言每张目标表同时存在 `REVOKE` 与 `ENABLE RLS`；
2. 断言 SQL 不包含 `GRANT ALL`、`DISABLE ROW LEVEL SECURITY`、数据修改或删除语句；
3. 生产变更前后运行只读 SQL 验证和应用 API 冒烟测试。

实现必须先写静态测试并观察失败，再新增 migration 使其通过。

## 9. 协作流程

1. 小酷完成实现计划；
2. 小酷按 TDD 创建 migration、验证脚本和运维说明；
3. 小酷完成本地自审，不提交生产变更；
4. 小M严格只读复审 SQL 范围、回滚策略和验证证据；
5. 胡子老师确认复审结论；
6. 小酷精确提交并推送；
7. 胡子老师再次批准生产执行窗口；
8. 小酷执行生产 SQL并立即运行前后对照验证；
9. 小M复核执行后只读证据；
10. 胡子老师完成业务冒烟验收。

## 10. 完成标准

- 仓库中有经过测试的显式权限 migration；
- 有生产前后只读审计命令和最小恢复说明；
- 小M复审通过；
- 胡子老师明确批准生产执行；
- 生产目标表全部启用 RLS；
- `anon/authenticated` 的业务表权限为 0；
- 数据行数未变化；
- Prisma API 和登录/后台/订单关键链路正常；
- Security Advisor 的相关 ERROR 清零；
- 未触碰 Storage policy，下一项 P0 独立处理。
