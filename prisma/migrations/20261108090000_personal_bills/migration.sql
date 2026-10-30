
-- CreateEnum
CREATE TYPE "PersonalSplitMode" AS ENUM ('even', 'custom');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "treasurer_author_id" TEXT;

-- AlterTable
ALTER TABLE "authors" ADD COLUMN     "child_id" TEXT;

-- CreateTable
CREATE TABLE "personal_bills" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "bill_date" DATE NOT NULL,
    "merchant_name" TEXT,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'CZK',
    "amount_czk" DECIMAL(12,2),
    "exchange_rate_used" DECIMAL(12,6),
    "split_mode" "PersonalSplitMode" NOT NULL DEFAULT 'even',
    "note" TEXT,
    "gcs_object_path" TEXT,
    "original_filename" TEXT,
    "size_bytes" BIGINT,
    "from_bill" JSONB,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_bill_shares" (
    "id" TEXT NOT NULL,
    "personal_bill_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "amount_czk" DECIMAL(12,2) NOT NULL,
    "settled_at" TIMESTAMP(3),
    "settled_by_user_id" TEXT,

    CONSTRAINT "personal_bill_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "personal_bills_event_id_idx" ON "personal_bills"("event_id");

-- CreateIndex
CREATE INDEX "personal_bill_shares_author_id_idx" ON "personal_bill_shares"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "personal_bill_shares_personal_bill_id_author_id_key" ON "personal_bill_shares"("personal_bill_id", "author_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_treasurer_author_id_fkey" FOREIGN KEY ("treasurer_author_id") REFERENCES "authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authors" ADD CONSTRAINT "authors_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_bills" ADD CONSTRAINT "personal_bills_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_bills" ADD CONSTRAINT "personal_bills_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_bill_shares" ADD CONSTRAINT "personal_bill_shares_personal_bill_id_fkey" FOREIGN KEY ("personal_bill_id") REFERENCES "personal_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_bill_shares" ADD CONSTRAINT "personal_bill_shares_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

