# Supabase 数据接口权限封锁生产操作手册

> 任务级别：P 级生产数据库权限变更
> 适用迁移：`prisma/migrations/20260719_lock_down_supabase_data_api/migration.sql`
> 默认状态：禁止执行，必须满足全部前置门槛

## 1. 目标与边界

本手册用于撤销 Supabase `anon`（匿名访问角色）和 `authenticated`（Supabase 已认证角色）对 28 张 `public` 业务表的直接权限，并为这些表启用 RLS（Row Level Security，行级安全）。

本次变更：

- 不修改任何表数据；
- 不修改列、索引、约束或 Prisma 模型；
- 不修改 Storage（对象存储）bucket 或 policy；
- 不创建允许客户端读取业务表的 RLS policy；
- 不影响 Prisma 服务端数据库用户和 Supabase `service_role`（服务端特权角色）。

## 2. 生产执行前置门槛

以下条件必须全部满足，缺一项立即停止：

1. 小M对完整实施差异给出“通过”；
2. 胡子老师明确批准本次生产执行窗口；
3. 实施提交已经精确推送，且本地 HEAD 与 `origin/main` 完全一致；
4. Vercel 当前生产版本健康，可用于变更后冒烟测试；
5. 最新生产表清单仍与批准的 28 表清单完全一致；
6. `password_reset_codes` 仍不在本次迁移范围；
7. 已运行 `scripts/audit-supabase-data-api.sql` 并在当前对话中保存执行前结果；
8. 已记录关键表执行前行数；
9. 工作区除已经批准的文件外没有无关改动；
10. 没有把生产数据、凭据或审计输出写入 Git 跟踪文件。

如果生产表清单发生变化，停止执行并更新设计、计划、测试和小M任务，不得临时把新表加入 SQL。

## 3. 执行前只读快照

通过 Supabase SQL Editor（SQL 编辑器）或经批准的只读 SQL 工具运行：

```text
scripts/audit-supabase-data-api.sql
```

执行前必须确认：

- 生产普通表总数为 28；
- 当前未启用 RLS 的表数和已有授权与复审基线一致；
- 记录 `users/orders/withdrawals/balance_records/rewards` 五张关键表行数；
- 不输出这些表的具体行内容；
- 不在仓库中保存执行结果。

## 4. 生产执行

只允许执行已经复审并提交的完整文件：

```text
prisma/migrations/20260719_lock_down_supabase_data_api/migration.sql
```

执行方式二选一：

1. 在 Supabase SQL Editor 中完整粘贴已复审 SQL，一次执行；
2. 使用已批准的 Supabase SQL 执行工具，一次提交完整 SQL。

禁止：

- 手工改写表名；
- 拆成未经复审的多批 SQL；
- 增加 `GRANT`（授权）语句；
- 增加允许访问的 RLS policy；
- 执行 `prisma migrate deploy` 以外的额外迁移；
- 顺手修改 Storage 或业务数据。

## 5. 执行后数据库验证

立即重新运行 `scripts/audit-supabase-data-api.sql`，逐项确认：

1. 28 张目标表全部显示 `rls_enabled = true`；
2. `anon/authenticated` 在 `public` 业务表上的授权结果为空；
3. 五张关键表行数与执行前完全一致；
4. 没有新增允许客户端访问业务表的 policy；
5. `service_role` 和 Prisma 数据库连接没有被撤权。

随后重新运行 Supabase Security Advisor（安全顾问）：

- 目标表不再出现 `rls_disabled_in_public`；
- `withdrawals.account_number` 不再出现无 RLS 的敏感列暴露；
- 本任务不要求处理 Storage 或性能顾问项。

任何一项不符合，禁止宣布完成。

## 6. 应用冒烟测试

数据库验证通过后，按顺序测试：

1. 公开设置接口可读取；
2. 商品列表和商品详情可读取；
3. 用户可以登录；
4. 已登录用户可以读取个人资料；
5. super_admin 可以读取后台会员列表；
6. goods_admin 或 super_admin 可以读取订单列表；
7. 现有图片/视频上传行为未因本任务改变。

Storage 匿名上传风险仍是下一项独立 P0，不得因“上传仍可用”将其误报为已修复。

## 7. 停止条件

出现以下任一情况立即停止：

- 表清单不是批准的 28 张；
- 关键表行数变化；
- Prisma 报数据库权限错误；
- 登录、商品、会员或订单接口出现权限错误；
- Security Advisor 仍报告目标业务表无 RLS；
- SQL 实际范围与已复审 migration 不一致；
- 需要新增授权或 policy 才能继续。

停止后保留现场证据，只向胡子老师报告，不自行扩大修复范围。

## 8. 恢复原则

禁止使用以下宽泛恢复：

```sql
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated;
```

该语句会重新制造本次正在修复的安全漏洞。

如果应用调用被阻断：

1. 先确认调用方是否直接使用 Supabase Data API；
2. 优先把调用改为受项目 JWT 保护的 Next.js API；
3. 确实无法立即迁移时，另行设计单表、单操作、默认拒绝的最小 RLS policy；
4. 最小恢复方案必须重新经过小M复审和胡子老师批准；
5. 不允许恢复 `users`、`withdrawals`、`orders` 等敏感表的匿名直接访问。

## 9. 完成交付

最终报告必须包含：

- 执行提交哈希；
- 本地与远程一致证据；
- 小M复审结论；
- 胡子老师生产执行批准；
- 执行前后 RLS 与授权对比；
- 关键表行数不变证据；
- Security Advisor 结果；
- 应用冒烟测试结果；
- 未完成的 Storage P0 和其他后续任务。
