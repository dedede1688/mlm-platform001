-- AlterTable
ALTER TABLE "orders" ADD COLUMN "tracking_number" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN "benefits" JSONB;

-- AlterTable
ALTER TABLE "system_configs" ADD COLUMN "about_us" TEXT;
ALTER TABLE "system_configs" ADD COLUMN "banners" JSONB;
ALTER TABLE "system_configs" ADD COLUMN "company_address" TEXT DEFAULT '广州市花都区金谷南路9号';
ALTER TABLE "system_configs" ADD COLUMN "company_name" TEXT DEFAULT '广州敏维生物科技有限公司';
ALTER TABLE "system_configs" ADD COLUMN "contact_phone" TEXT DEFAULT '18566793066';
ALTER TABLE "system_configs" ADD COLUMN "copyright" TEXT DEFAULT '2026';
ALTER TABLE "system_configs" ADD COLUMN "help_faq" JSONB;
ALTER TABLE "system_configs" ADD COLUMN "icp" TEXT DEFAULT '粤ICP备XXXXXXXX号';
ALTER TABLE "system_configs" ADD COLUMN "logo_url" TEXT DEFAULT '/logo.png';
ALTER TABLE "system_configs" ADD COLUMN "privacy_html" TEXT;
ALTER TABLE "system_configs" ADD COLUMN "service_email" TEXT DEFAULT 'service@minwei.com';
ALTER TABLE "system_configs" ADD COLUMN "service_time" TEXT DEFAULT '周一至周日 9:00-21:00';
ALTER TABLE "system_configs" ADD COLUMN "site_name" TEXT DEFAULT '敏维生物·健康商城';
ALTER TABLE "system_configs" ADD COLUMN "terms_html" TEXT;

-- CreateTable
CREATE TABLE "carts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "carts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "manual_rewards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'manual',
    "reason" TEXT NOT NULL,
    "operator_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "manual_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "operation_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "target_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "operation_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "nickname" TEXT,
    "avatar_url" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "referrer_id" TEXT,
    "parent_id" TEXT,
    "position" INTEGER,
    "balance" REAL NOT NULL DEFAULT 0,
    "frozen_balance" REAL NOT NULL DEFAULT 0,
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "unlocked_points" INTEGER NOT NULL DEFAULT 0,
    "locked_points" INTEGER NOT NULL DEFAULT 0,
    "upgrade_product_count" INTEGER NOT NULL DEFAULT 0,
    "direct_sales_amount" REAL NOT NULL DEFAULT 0,
    "direct_distributor_count" INTEGER NOT NULL DEFAULT 0,
    "role" TEXT NOT NULL DEFAULT 'user',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "users_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "users_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_users" ("avatar_url", "balance", "created_at", "direct_distributor_count", "direct_sales_amount", "email", "frozen_balance", "id", "level", "locked_points", "nickname", "parent_id", "password_hash", "phone", "position", "referrer_id", "status", "total_points", "unlocked_points", "updated_at", "upgrade_product_count") SELECT "avatar_url", "balance", "created_at", "direct_distributor_count", "direct_sales_amount", "email", "frozen_balance", "id", "level", "locked_points", "nickname", "parent_id", "password_hash", "phone", "position", "referrer_id", "status", "total_points", "unlocked_points", "updated_at", "upgrade_product_count" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_referrer_id_idx" ON "users"("referrer_id");
CREATE INDEX "users_parent_id_idx" ON "users"("parent_id");
CREATE INDEX "users_level_idx" ON "users"("level");
CREATE INDEX "users_status_idx" ON "users"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

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
