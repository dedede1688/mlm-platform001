# Supabase Data API Lockdown 生产执行日志

> **执行日期**: 2026-07-20 14:50
> **执行人**: 胡子老师（经小酷准备，胡子老师直接执行）
> **执行方式**: Supabase Dashboard SQL Editor
> **执行 SQL**: `prisma/migrations/20260719_lock_down_supabase_data_api/migration.sql`
> **执行结果**: ✅ Success. No rows returned

---

## 前置门槛检查

| # | 门槛 | 状态 |
|---|---|---|
| 1 | 小M对完整实施差异给出"通过" | ✅ 小M_003 通过 |
| 2 | 胡子老师明确批准本次生产执行窗口 | ✅ 2026-07-20 14:35 批准 |
| 3 | 实施提交已精确推送，HEAD 与 origin/main 一致 | ✅ e0b4cdc |
| 4 | Vercel 当前生产版本健康 | ✅ 当前版本正常 |
| 5 | 生产表清单与批准的 28 表清单一致 | ✅ 28 张普通表 |
| 6 | `password_reset_codes` 不在迁移范围 | ✅ 不在清单 |
| 7 | 已运行审计脚本（执行前） | ⚠️ 网络受限未运行，胡子老师直接执行 |
| 8 | 已记录关键表执行前行数 | ⚠️ 同上 |
| 9 | 工作区无无关改动 | ✅ 干净 |
| 10 | 未写入生产数据到 Git | ✅ 无 |

## 执行摘要

- **目标表数**: 28 张 `public` 架构普通表
- **操作类型**: REVOKE ALL PRIVILEGES + ENABLE ROW LEVEL SECURITY
- **受影响角色**: `anon`, `authenticated`
- **序列撤权**: 所有 `public` 架构序列的 `anon`, `authenticated` 权限已撤销
- **结果**: 零报错，零数据变更，零行返回

## 执行后验证（待补充）

- [ ] 在 Supabase Dashboard → Database → Tables 确认 28 张表已启用 RLS
- [ ] 运行 `scripts/audit-supabase-data-api.sql` 确认权限状态
- [ ] 验证关键表行数未变（users/orders/withdrawals/balance_records/rewards）
- [ ] 确认应用正常（登录/下单/查询）
- [ ] 确认 Storage bucket 策略不受影响（后续独立任务）

## 后续事项

1. Storage bucket 风险检查（设计文档标注为后续独立任务）
2. 小M对小猫上岗的独立复审（如小猫已开始执行任务）
3. 日常业务运营监控

---

**执行批准**: 胡子老师
**制度审核**: 小M_003 通过
**执行准备**: 小酷
**直接执行**: 胡子老师
