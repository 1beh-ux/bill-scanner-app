-- Payer flags, manifest category mode, event deposits, public page theme / background / width. Additive only.
-- AlterTable
ALTER TABLE "events" ADD COLUMN     "manifest_category_mode" TEXT;

-- AlterTable
ALTER TABLE "authors" ADD COLUMN     "is_official_account" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payout_needed" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "public_content_width" INTEGER,
ADD COLUMN     "public_theme" TEXT,
ADD COLUMN     "public_transparent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "event_deposits" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "amount_czk" DECIMAL(14,2) NOT NULL,
    "received_at" DATE NOT NULL,
    "note" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_deposits_event_id_idx" ON "event_deposits"("event_id");

-- AddForeignKey
ALTER TABLE "event_deposits" ADD CONSTRAINT "event_deposits_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

