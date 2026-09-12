-- AlterTable
ALTER TABLE "events" ADD COLUMN     "participants_sheet_id" TEXT,
ADD COLUMN     "participants_column_mapping" JSONB;
