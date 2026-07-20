-- AlterTable: 分红周结改造 - 新增结算标记字段
-- PRD §2.4.3 规定分红"每周统一发放"，原日结实现改为周结
-- settled: 是否已入账（false=仅快照未发放，true=已入账）
-- settle_batch_id: 结算批次ID（幂等标识，同一批次只入账一次）
-- settle_date: 实际入账时间

ALTER TABLE "dividends" ADD COLUMN "settled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "dividends" ADD COLUMN "settle_batch_id" TEXT;
ALTER TABLE "dividends" ADD COLUMN "settle_date" TIMESTAMPTZ(6);

-- 历史数据已通过日结入账，标记为已结算（settled=true, settle_date=dividend_date）
UPDATE "dividends" SET "settled" = true, "settle_date" = "dividend_date" WHERE "settled" = false;

-- CreateIndex
CREATE INDEX "dividends_settled_idx" ON "dividends"("settled");
CREATE INDEX "dividends_settle_batch_id_idx" ON "dividends"("settle_batch_id");
