-- CreateEnum
CREATE TYPE "MailDocReceivedVia" AS ENUM ('email', 'manual');

-- CreateEnum
CREATE TYPE "MailActionType" AS ENUM ('bulk_move', 'bulk_delete', 'attachment_saved');

-- CreateEnum
CREATE TYPE "MailActionStatus" AS ENUM ('ok', 'error');

-- AlterEnum
ALTER TYPE "ListTemplateKind" ADD VALUE 'document';

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "drive_doc_sync_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "status_export_last_synced_at" TIMESTAMP(3),
ADD COLUMN     "status_export_sheet_id" TEXT;

-- CreateTable
CREATE TABLE "participant_documents" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "event_list_item_id" TEXT NOT NULL,
    "gcs_path" TEXT,
    "content_hash" TEXT,
    "original_filename" TEXT,
    "drive_file_id" TEXT,
    "drive_synced_at" TIMESTAMP(3),
    "received_via" "MailDocReceivedVia" NOT NULL,
    "source_email_message_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by_user_id" TEXT NOT NULL,

    CONSTRAINT "participant_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_action_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "action" "MailActionType" NOT NULL,
    "message_id" TEXT,
    "participant_id" TEXT,
    "subject" TEXT,
    "status" "MailActionStatus" NOT NULL,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_action_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "participant_documents" ADD CONSTRAINT "participant_documents_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_documents" ADD CONSTRAINT "participant_documents_event_list_item_id_fkey" FOREIGN KEY ("event_list_item_id") REFERENCES "event_list_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_documents" ADD CONSTRAINT "participant_documents_received_by_user_id_fkey" FOREIGN KEY ("received_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_action_logs" ADD CONSTRAINT "mail_action_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_action_logs" ADD CONSTRAINT "mail_action_logs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_action_logs" ADD CONSTRAINT "mail_action_logs_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data backfill: register the `mail` module (off by default for every
-- existing event, same pattern as `health` in the prior migration).
INSERT INTO "modules" ("key", "name") VALUES ('mail', 'Mail Helper');

INSERT INTO "event_modules" ("event_id", "module_key", "enabled")
  SELECT "id", 'mail', false FROM "events";
