-- Supabase Data API 权限封锁执行前/执行后只读审计。
-- 本脚本只输出元数据和关键表行数，不读取具体业务数据。

-- 1. public 普通表清单与 RLS 状态。
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- 2. anon/authenticated 对 public 表的直接授权。
SELECT
  grantee,
  table_name,
  string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
GROUP BY grantee, table_name
ORDER BY table_name, grantee;

-- 3. public schema 的 RLS 策略。
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 4. 安全关键表行数快照；执行前后必须完全一致。
SELECT
  (SELECT count(*) FROM public.users) AS users,
  (SELECT count(*) FROM public.orders) AS orders,
  (SELECT count(*) FROM public.withdrawals) AS withdrawals,
  (SELECT count(*) FROM public.balance_records) AS balance_records,
  (SELECT count(*) FROM public.rewards) AS rewards;
