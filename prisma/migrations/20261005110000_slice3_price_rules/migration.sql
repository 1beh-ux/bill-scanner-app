-- AlterTable
ALTER TABLE "events" ADD COLUMN     "price_rules" JSONB;

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "accepted_price_czk" INTEGER,
ADD COLUMN     "price_category" TEXT;

