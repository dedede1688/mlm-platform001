# scripts/

> v60.1 收尾后归档（已提交）

所有历史一次性脚本(check-* / fix-* / seed-* / test-v57-4-* / reset-admin-password)已归档至 [docs/archive/scripts-v60/](../archive/scripts-v60/)。

v60.1 之后新增的运维工具,请放回 scripts/ 并在 README 中登记用途。

## audit-supabase-data-api.sql

- **用途**：在 Supabase Data API（数据接口）权限封锁前后，核对 public 表清单、RLS（行级安全）状态、anon/authenticated 授权、RLS 策略和关键表行数。
- **安全边界**：脚本严格只读，不含凭据，不输出具体业务行内容，不修改数据库。
- **执行方式**：通过 Supabase SQL Editor（SQL 编辑器）或经批准的只读 SQL 工具运行。
- **禁止事项**：不得把包含生产统计的执行结果重定向或复制到 Git 跟踪文件。
