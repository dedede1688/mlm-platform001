-- CreateTable: balance_records
CREATE TABLE "balance_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "frozen_balance" DOUBLE PRECISION NOT NULL,
    "source_type" TEXT,
    "source_id" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_records_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "balance_records_user_id_idx" ON "balance_records"("user_id");
CREATE INDEX "balance_records_type_idx" ON "balance_records"("type");
CREATE INDEX "balance_records_created_at_idx" ON "balance_records"("created_at");

-- Foreign Key
ALTER TABLE "balance_records" ADD CONSTRAINT "balance_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
