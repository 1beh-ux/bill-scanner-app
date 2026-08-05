-- CreateEnum
CREATE TYPE "IngestChannel" AS ENUM ('drive', 'upload', 'camera');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('new', 'queued', 'processing', 'auto_approved', 'to_review', 'failed', 'approved');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('CZK', 'PLN', 'EUR');

-- CreateEnum
CREATE TYPE "AuditActionType" AS ENUM ('edit', 'approve', 'reopen');

-- CreateTable
CREATE TABLE "bills" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "gcs_object_path" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "display_filename" TEXT,
    "drive_source_file_id" TEXT,
    "content_hash" TEXT NOT NULL,
    "ingest_channel" "IngestChannel" NOT NULL,
    "merchant_name" TEXT,
    "bill_date" DATE,
    "total_amount" DECIMAL(12,2),
    "currency" "Currency" NOT NULL DEFAULT 'CZK',
    "amount_czk" DECIMAL(12,2),
    "exchange_rate_used" DECIMAL(12,6),
    "exchange_rate_date" DATE,
    "payer_author_id" TEXT,
    "paid_to_author" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMP(3),
    "paid_by_user_id" TEXT,
    "status" "BillStatus" NOT NULL DEFAULT 'new',
    "notes" TEXT,
    "ai_confidence" DECIMAL(5,4),
    "ai_raw_response" JSONB,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "approved_by_user_id" TEXT,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_categories" (
    "id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "event_category_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "amount_czk" DECIMAL(12,2),

    CONSTRAINT "bill_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_audit_log" (
    "id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action_type" "AuditActionType" NOT NULL,
    "field_name" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_audit_log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_payer_author_id_fkey" FOREIGN KEY ("payer_author_id") REFERENCES "authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_paid_by_user_id_fkey" FOREIGN KEY ("paid_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_categories" ADD CONSTRAINT "bill_categories_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_categories" ADD CONSTRAINT "bill_categories_event_category_id_fkey" FOREIGN KEY ("event_category_id") REFERENCES "event_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_audit_log" ADD CONSTRAINT "bill_audit_log_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_audit_log" ADD CONSTRAINT "bill_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
