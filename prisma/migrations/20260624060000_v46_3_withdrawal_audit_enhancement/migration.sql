-- AlterTable: Withdrawal 加字段
ALTER TABLE "withdrawals" ADD COLUMN "reject_template_id" TEXT;
ALTER TABLE "withdrawals" ADD COLUMN "remark" TEXT;

-- CreateTable: WithdrawalRejectTemplate
CREATE TABLE "withdrawal_reject_templates" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawal_reject_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WithdrawalAuditLog
CREATE TABLE "withdrawal_audit_logs" (
    "id" TEXT NOT NULL,
    "withdrawal_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "old_status" TEXT,
    "new_status" TEXT,
    "operator_id" TEXT,
    "reason" TEXT,
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawal_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Notification
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "source_id" TEXT,
    "source_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_reject_template_id_fkey" FOREIGN KEY ("reject_template_id") REFERENCES "withdrawal_reject_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_audit_logs" ADD CONSTRAINT "withdrawal_audit_logs_withdrawal_id_fkey" FOREIGN KEY ("withdrawal_id") REFERENCES "withdrawals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "withdrawal_reject_templates_is_enabled_idx" ON "withdrawal_reject_templates"("is_enabled");
CREATE INDEX "withdrawal_reject_templates_sort_order_idx" ON "withdrawal_reject_templates"("sort_order");
CREATE INDEX "withdrawals_reject_template_id_idx" ON "withdrawals"("reject_template_id");
CREATE INDEX "withdrawal_audit_logs_withdrawal_id_idx" ON "withdrawal_audit_logs"("withdrawal_id");
CREATE INDEX "withdrawal_audit_logs_action_idx" ON "withdrawal_audit_logs"("action");
CREATE INDEX "withdrawal_audit_logs_created_at_idx" ON "withdrawal_audit_logs"("created_at");
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");
CREATE INDEX "notifications_is_read_idx" ON "notifications"("is_read");
CREATE INDEX "notifications_type_idx" ON "notifications"("type");
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");