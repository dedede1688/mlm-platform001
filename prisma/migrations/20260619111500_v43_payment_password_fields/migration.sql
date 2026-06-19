-- v43 补迁移：v43-2 加了 schema 字段但忘了在 Supabase 跑
-- 补齐 5 个字段，让 findUnique / update 之类的 ORM 操作不报"列不存在"

-- users: 支付密码 hash（bcryptjs）
ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_password_hash TEXT;

-- orders: 收货 + 支付验证
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_verified BOOLEAN NOT NULL DEFAULT FALSE;
