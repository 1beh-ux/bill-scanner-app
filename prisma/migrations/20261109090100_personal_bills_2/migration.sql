
-- DropForeignKey
ALTER TABLE "personal_bills" DROP CONSTRAINT "personal_bills_author_id_fkey";

-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "internal_note" TEXT;

-- AlterTable
ALTER TABLE "personal_bills" ADD COLUMN     "line_items" JSONB,
ADD COLUMN     "unit_label" TEXT,
ADD COLUMN     "unit_price" DECIMAL(12,2),
ADD COLUMN     "via_event" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "author_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "personal_bill_shares" ADD COLUMN     "creditor_paid_at" TIMESTAMP(3),
ADD COLUMN     "quantity" DECIMAL(10,2);

-- AddForeignKey
ALTER TABLE "personal_bills" ADD CONSTRAINT "personal_bills_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

