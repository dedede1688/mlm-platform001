-- 补齐 migration 历史中缺失的表（生产库已存在，本文件用于历史对齐与新环境重建）
-- 全部幂等：表已存在时跳过，不触碰数据

-- 1. password_reset_codes（对应 schema PasswordResetCode）
CREATE TABLE IF NOT EXISTS "password_reset_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_codes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "password_reset_codes_phone_code_idx" ON "password_reset_codes"("phone", "code");
CREATE INDEX IF NOT EXISTS "password_reset_codes_expires_at_idx" ON "password_reset_codes"("expires_at");

-- 2. categories（对应 schema Category，含自引用）
CREATE TABLE IF NOT EXISTS "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "categories_parent_id_idx" ON "categories"("parent_id");

-- 3. notification_templates（对应 schema NotificationTemplate）
CREATE TABLE IF NOT EXISTS "notification_templates" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "notification_templates_type_idx" ON "notification_templates"("type");
CREATE INDEX IF NOT EXISTS "notification_templates_channel_idx" ON "notification_templates"("channel");
CREATE INDEX IF NOT EXISTS "notification_templates_enabled_idx" ON "notification_templates"("enabled");

-- 4. refund_requests（对应 schema RefundRequest）
CREATE TABLE IF NOT EXISTS "refund_requests" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "images" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "admin_comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "refund_requests_user_id_idx" ON "refund_requests"("user_id");
CREATE INDEX IF NOT EXISTS "refund_requests_order_id_idx" ON "refund_requests"("order_id");
CREATE INDEX IF NOT EXISTS "refund_requests_status_idx" ON "refund_requests"("status");

-- 5. banners（对应 schema banners：UUID 主键 + TIMESTAMPTZ，created_at/updated_at 可空）
CREATE TABLE IF NOT EXISTS "banners" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "image_url" TEXT NOT NULL,
    "link" TEXT,
    "title" TEXT,
    "alt" TEXT,
    "order" INTEGER DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) DEFAULT now(),
    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- 6. products.category_id 列 + 索引（migration 中无任何记录）
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "category_id" TEXT;
CREATE INDEX IF NOT EXISTS "products_category_id_idx" ON "products"("category_id");

-- 7. 外键与唯一约束（PG 无 ADD CONSTRAINT IF NOT EXISTS，用 DO 块幂等）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'password_reset_codes_user_id_fkey') THEN
    ALTER TABLE "password_reset_codes" ADD CONSTRAINT "password_reset_codes_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_parent_id_fkey') THEN
    ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey"
      FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_category_id_fkey') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey"
      FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_templates_type_channel_key') THEN
    ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_type_channel_key"
      UNIQUE ("type", "channel");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refund_requests_order_id_fkey') THEN
    ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_order_id_fkey"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refund_requests_user_id_fkey') THEN
    ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;