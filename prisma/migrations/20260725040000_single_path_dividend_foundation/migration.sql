-- Batch 3A-2 Task 1+2: Single-Path Dividend Foundation
-- Additive schema changes only. No user funds, balance_records.amount, or reward/dividend amounts are modified.

-- 1. Add order reward state fields with historical-safe defaults
ALTER TABLE "orders" ADD COLUMN "reward_status" TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE "orders" ADD COLUMN "reward_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "reward_last_error" TEXT;
ALTER TABLE "orders" ADD COLUMN "reward_last_attempt_at" TIMESTAMPTZ(6);
ALTER TABLE "orders" ADD COLUMN "rewards_completed_at" TIMESTAMPTZ(6);

-- 2. Add nullable pool_type to dividends, backfill from user_level
ALTER TABLE "dividends" ADD COLUMN "pool_type" TEXT;

UPDATE "dividends"
SET "pool_type" = CASE "user_level"
  WHEN 3 THEN 'director'
  WHEN 4 THEN 'manager'
  WHEN 5 THEN 'supervisor'
  WHEN 6 THEN 'president'
  WHEN 7 THEN 'board'
  ELSE NULL
END;

-- 3. Safety check: fail if any pool_type remains null
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "dividends" WHERE "pool_type" IS NULL) THEN
    RAISE EXCEPTION 'Migration aborted: dividends with unmapped user_level exist. Fix data before re-applying.';
  END IF;
END $$;

-- 4. Set all existing dividend rows to settled=true (they are already credited to users)
UPDATE "dividends" SET "settled" = true WHERE "settled" = false;

-- 5. Make pool_type NOT NULL, add refunded_at and unique dividend index
ALTER TABLE "dividends" ALTER COLUMN "pool_type" SET NOT NULL;
ALTER TABLE "dividends" ADD COLUMN "refunded_at" TIMESTAMPTZ(6);
CREATE UNIQUE INDEX "dividends_order_id_user_id_pool_type_key" ON "dividends"("order_id", "user_id", "pool_type");

-- 6. Add nullable reward idempotency_key, backfill with legacy:reward: prefix, then set NOT NULL + unique
ALTER TABLE "rewards" ADD COLUMN "idempotency_key" TEXT;
UPDATE "rewards" SET "idempotency_key" = 'legacy:reward:' || "id";
ALTER TABLE "rewards" ALTER COLUMN "idempotency_key" SET NOT NULL;
CREATE UNIQUE INDEX "rewards_idempotency_key_key" ON "rewards"("idempotency_key");
