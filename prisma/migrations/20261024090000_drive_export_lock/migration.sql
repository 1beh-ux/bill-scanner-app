-- One Drive export per event at a time. Additive.
-- AlterTable
ALTER TABLE "events" ADD COLUMN     "drive_export_locked_until" TIMESTAMP(3);

