-- AlterTable: 提现收益化改造第 2 包
-- 新增完成打款相关字段
ALTER TABLE "withdrawals" ADD COLUMN "completed_by" TEXT;
ALTER TABLE "withdrawals" ADD COLUMN "completed_at" TIMESTAMPTZ(6);
ALTER TABLE "withdrawals" ADD COLUMN "payment_proof_url" TEXT;
