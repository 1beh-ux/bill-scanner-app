-- Event: folder for processed (imported / cleaned) Drive files. Additive.
-- AlterTable
ALTER TABLE "events" ADD COLUMN     "drive_processed_folder_id" TEXT;

