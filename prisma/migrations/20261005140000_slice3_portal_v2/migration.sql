-- AlterEnum
ALTER TYPE "MailDocReceivedVia" ADD VALUE 'portal';

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "location" TEXT,
ADD COLUMN     "portal_info" TEXT;

-- AlterTable
ALTER TABLE "participant_documents" ALTER COLUMN "received_by_user_id" DROP NOT NULL;

