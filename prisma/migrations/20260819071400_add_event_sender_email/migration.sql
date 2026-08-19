-- AlterTable
ALTER TABLE "events" ADD COLUMN     "sender_email" TEXT;

-- AlterTable
ALTER TABLE "incidents" ALTER COLUMN "incident_date" SET DEFAULT CURRENT_TIMESTAMP;
