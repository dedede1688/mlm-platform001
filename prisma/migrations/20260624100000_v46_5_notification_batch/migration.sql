-- v46.5: NotificationBatch + Notification 加 batchId/senderId

-- 1. 创建 notification_batches 表
CREATE TABLE "notification_batches" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sender_id" TEXT,
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "read_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "template_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_batches_pkey" PRIMARY KEY ("id")
);

-- 2. notification_batches 索引
CREATE INDEX "notification_batches_type_idx" ON "notification_batches"("type");
CREATE INDEX "notification_batches_sender_id_idx" ON "notification_batches"("sender_id");
CREATE INDEX "notification_batches_status_idx" ON "notification_batches"("status");
CREATE INDEX "notification_batches_created_at_idx" ON "notification_batches"("created_at");

-- 3. notifications 加 batch_id + sender_id 列
ALTER TABLE "notifications" ADD COLUMN "batch_id" TEXT;
ALTER TABLE "notifications" ADD COLUMN "sender_id" TEXT;

-- 4. notifications 新索引
CREATE INDEX "notifications_batch_id_idx" ON "notifications"("batch_id");
CREATE INDEX "notifications_sender_id_idx" ON "notifications"("sender_id");

-- 5. 外键
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "notification_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_batches" ADD CONSTRAINT "notification_batches_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;