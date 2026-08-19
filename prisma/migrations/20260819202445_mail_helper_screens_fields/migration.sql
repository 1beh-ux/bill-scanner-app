-- AlterTable
ALTER TABLE "events" ADD COLUMN     "mail_done_label_name" TEXT,
ADD COLUMN     "mail_questionnaire_url" TEXT,
ADD COLUMN     "status_export_enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "mail_sender_accounts" ADD COLUMN     "scope" TEXT;
