-- Drop existing tables (reverse dependency order)
DROP TABLE IF EXISTS "operation_logs" CASCADE;
DROP TABLE IF EXISTS "manual_rewards" CASCADE;
DROP TABLE IF EXISTS "carts" CASCADE;
DROP TABLE IF EXISTS "points_unlock_schedules" CASCADE;
DROP TABLE IF EXISTS "level_snapshots" CASCADE;
DROP TABLE IF EXISTS "system_configs" CASCADE;
DROP TABLE IF EXISTS "withdrawals" CASCADE;
DROP TABLE IF EXISTS "dividends" CASCADE;
DROP TABLE IF EXISTS "rewards" CASCADE;
DROP TABLE IF EXISTS "points_records" CASCADE;
DROP TABLE IF EXISTS "order_items" CASCADE;
DROP TABLE IF EXISTS "orders" CASCADE;
DROP TABLE IF EXISTS "products" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "nickname" TEXT,
    "avatar_url" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "referrer_id" TEXT,
    "parent_id" TEXT,
    "position" INTEGER,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "frozen_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "unlocked_points" INTEGER NOT NULL DEFAULT 0,
    "locked_points" INTEGER NOT NULL DEFAULT 0,
    "upgrade_product_count" INTEGER NOT NULL DEFAULT 0,
    "direct_sales_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "direct_distributor_count" INTEGER NOT NULL DEFAULT 0,
    "role" TEXT NOT NULL DEFAULT 'user',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "retail_price" DOUBLE PRECISION NOT NULL,
    "member_price" DOUBLE PRECISION NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "is_upgrade_product" BOOLEAN NOT NULL DEFAULT false,
    "max_points_ratio" INTEGER NOT NULL DEFAULT 50,
    "benefits" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_no" TEXT NOT NULL,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "points_used" INTEGER NOT NULL DEFAULT 0,
    "points_discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pay_amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tracking_number" TEXT,
    "paid_at" TIMESTAMP(3),
    "shipped_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "total_price" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "total_points" INTEGER NOT NULL,
    "unlocked_points" INTEGER NOT NULL,
    "locked_points" INTEGER NOT NULL,
    "source_id" TEXT,
    "description" TEXT,
    "related_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "points_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "from_user_id" TEXT,
    "level" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dividends" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "user_level" INTEGER NOT NULL,
    "total_pool" DOUBLE PRECISION NOT NULL,
    "dividend_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dividends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "site_name" TEXT DEFAULT '敏维生物·健康商城',
    "logo_url" TEXT DEFAULT '/logo.png',
    "contact_phone" TEXT DEFAULT '18566793066',
    "service_email" TEXT DEFAULT 'service@minwei.com',
    "service_time" TEXT DEFAULT '周一至周日 9:00-21:00',
    "company_name" TEXT DEFAULT '广州敏维生物科技有限公司',
    "company_address" TEXT DEFAULT '广州市花都区金谷南路9号',
    "icp" TEXT DEFAULT '粤ICP备XXXXXXXX号',
    "copyright" TEXT DEFAULT '2026',
    "about_us" TEXT,
    "terms_html" TEXT,
    "privacy_html" TEXT,
    "help_faq" JSONB,
    "banners" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "level_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "snapshot_date" TIMESTAMP(3) NOT NULL,
    "level" INTEGER NOT NULL,
    "direct_distributor_count" INTEGER NOT NULL,
    "direct_sales_amount" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "level_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_unlock_schedules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "total_points" INTEGER NOT NULL,
    "unlocked_points" INTEGER NOT NULL DEFAULT 0,
    "remaining_points" INTEGER NOT NULL,
    "daily_unlock_rate" DOUBLE PRECISION NOT NULL,
    "total_days" INTEGER NOT NULL,
    "completed_days" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "next_unlock_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "points_unlock_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_rewards" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'manual',
    "reason" TEXT NOT NULL,
    "operator_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "target_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_referrer_id_idx" ON "users"("referrer_id");

-- CreateIndex
CREATE INDEX "users_parent_id_idx" ON "users"("parent_id");

-- CreateIndex
CREATE INDEX "users_level_idx" ON "users"("level");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "products_status_idx" ON "products"("status");

-- CreateIndex
CREATE INDEX "products_is_upgrade_product_idx" ON "products"("is_upgrade_product");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_no_key" ON "orders"("order_no");

-- CreateIndex
CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_order_no_idx" ON "orders"("order_no");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE INDEX "points_records_user_id_idx" ON "points_records"("user_id");

-- CreateIndex
CREATE INDEX "points_records_type_idx" ON "points_records"("type");

-- CreateIndex
CREATE INDEX "points_records_source_id_idx" ON "points_records"("source_id");

-- CreateIndex
CREATE INDEX "rewards_user_id_idx" ON "rewards"("user_id");

-- CreateIndex
CREATE INDEX "rewards_type_idx" ON "rewards"("type");

-- CreateIndex
CREATE INDEX "rewards_order_id_idx" ON "rewards"("order_id");

-- CreateIndex
CREATE INDEX "rewards_status_idx" ON "rewards"("status");

-- CreateIndex
CREATE INDEX "dividends_user_id_idx" ON "dividends"("user_id");

-- CreateIndex
CREATE INDEX "dividends_order_id_idx" ON "dividends"("order_id");

-- CreateIndex
CREATE INDEX "dividends_dividend_date_idx" ON "dividends"("dividend_date");

-- CreateIndex
CREATE INDEX "withdrawals_user_id_idx" ON "withdrawals"("user_id");

-- CreateIndex
CREATE INDEX "withdrawals_status_idx" ON "withdrawals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_key_key" ON "system_configs"("key");

-- CreateIndex
CREATE INDEX "level_snapshots_snapshot_date_idx" ON "level_snapshots"("snapshot_date");

-- CreateIndex
CREATE INDEX "level_snapshots_level_idx" ON "level_snapshots"("level");

-- CreateIndex
CREATE UNIQUE INDEX "level_snapshots_user_id_snapshot_date_key" ON "level_snapshots"("user_id", "snapshot_date");

-- CreateIndex
CREATE INDEX "points_unlock_schedules_user_id_idx" ON "points_unlock_schedules"("user_id");

-- CreateIndex
CREATE INDEX "points_unlock_schedules_status_idx" ON "points_unlock_schedules"("status");

-- CreateIndex
CREATE INDEX "points_unlock_schedules_next_unlock_date_idx" ON "points_unlock_schedules"("next_unlock_date");

-- CreateIndex
CREATE INDEX "carts_user_id_idx" ON "carts"("user_id");

-- CreateIndex
CREATE INDEX "carts_product_id_idx" ON "carts"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "carts_user_id_product_id_key" ON "carts"("user_id", "product_id");

-- CreateIndex
CREATE INDEX "manual_rewards_user_id_idx" ON "manual_rewards"("user_id");

-- CreateIndex
CREATE INDEX "manual_rewards_type_idx" ON "manual_rewards"("type");

-- CreateIndex
CREATE INDEX "operation_logs_user_id_idx" ON "operation_logs"("user_id");

-- CreateIndex
CREATE INDEX "operation_logs_module_idx" ON "operation_logs"("module");

-- CreateIndex
CREATE INDEX "operation_logs_action_idx" ON "operation_logs"("action");

-- CreateIndex
CREATE INDEX "operation_logs_created_at_idx" ON "operation_logs"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_records" ADD CONSTRAINT "points_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_rewards" ADD CONSTRAINT "manual_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_logs" ADD CONSTRAINT "operation_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

