-- 资金底座第 3 包：充值申请基础
-- 新增 RechargeRequest / RechargeAuditLog / RechargeRejectTemplate 三张表

-- CreateTable: recharge_requests
CREATE TABLE "recharge_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "payment_method" TEXT NOT NULL,
    "payment_proof_url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reject_reason" TEXT,
    "reject_template_id" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "remark" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recharge_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable: recharge_audit_logs
CREATE TABLE "recharge_audit_logs" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "old_status" TEXT,
    "new_status" TEXT,
    "operator_id" TEXT,
    "reason" TEXT,
    "remark" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recharge_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: recharge_reject_templates
CREATE TABLE "recharge_reject_templates" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recharge_reject_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recharge_requests_user_id_idx" ON "recharge_requests"("user_id");
CREATE INDEX "recharge_requests_status_idx" ON "recharge_requests"("status");
CREATE INDEX "recharge_requests_payment_method_idx" ON "recharge_requests"("payment_method");
CREATE INDEX "recharge_requests_reject_template_id_idx" ON "recharge_requests"("reject_template_id");

CREATE INDEX "recharge_audit_logs_request_id_idx" ON "recharge_audit_logs"("request_id");
CREATE INDEX "recharge_audit_logs_action_idx" ON "recharge_audit_logs"("action");
CREATE INDEX "recharge_audit_logs_created_at_idx" ON "recharge_audit_logs"("created_at");

CREATE INDEX "recharge_reject_templates_is_enabled_idx" ON "recharge_reject_templates"("is_enabled");
CREATE INDEX "recharge_reject_templates_sort_order_idx" ON "recharge_reject_templates"("sort_order");

-- AddForeignKey
ALTER TABLE "recharge_requests" ADD CONSTRAINT "recharge_requests_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recharge_requests" ADD CONSTRAINT "recharge_requests_reject_template_id_fkey"
    FOREIGN KEY ("reject_template_id") REFERENCES "recharge_reject_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recharge_audit_logs" ADD CONSTRAINT "recharge_audit_logs_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "recharge_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
