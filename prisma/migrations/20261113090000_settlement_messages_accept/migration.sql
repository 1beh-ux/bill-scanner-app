-- AlterTable
ALTER TABLE "events" ADD COLUMN     "settlement_messages" JSONB;

-- AlterTable
ALTER TABLE "settlement_links" ADD COLUMN     "accepted_amount" DECIMAL(12,2),
ADD COLUMN     "accepted_at" TIMESTAMP(3);

