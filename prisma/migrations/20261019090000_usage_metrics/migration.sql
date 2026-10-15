-- Usage metrics: user activity, AI usage, app settings, GCS sizes. Additive only.
-- AlterTable
ALTER TABLE "bills" ADD COLUMN     "size_bytes" BIGINT;

-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "size_bytes" BIGINT;

-- AlterTable
ALTER TABLE "incident_updates" ADD COLUMN     "size_bytes" BIGINT;

-- AlterTable
ALTER TABLE "parent_email_log" ADD COLUMN     "size_bytes" BIGINT;

-- AlterTable
ALTER TABLE "participant_documents" ADD COLUMN     "size_bytes" BIGINT;

-- AlterTable
ALTER TABLE "person_documents" ADD COLUMN     "size_bytes" BIGINT;

-- CreateTable
CREATE TABLE "user_activity" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "event_id" TEXT,
    "module" TEXT,
    "route" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "bill_id" TEXT,
    "user_id" TEXT,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "thinking_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(12,6),
    "success" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "user_activity_created_at_idx" ON "user_activity"("created_at");

-- CreateIndex
CREATE INDEX "user_activity_user_id_created_at_idx" ON "user_activity"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "user_activity_organization_id_created_at_idx" ON "user_activity"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_event_id_created_at_idx" ON "ai_usage"("event_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_created_at_idx" ON "ai_usage"("created_at");

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

