-- CreateEnum
CREATE TYPE "PortalAccess" AS ENUM ('edit', 'approval', 'read', 'hidden');

-- CreateEnum
CREATE TYPE "ChildChangeStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "eligibility" JSONB,
ADD COLUMN     "portal_open" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "portal_note" TEXT;

-- AlterTable
ALTER TABLE "children" ADD COLUMN     "field_values" JSONB,
ADD COLUMN     "portal_gate_failures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "portal_gate_window_start" TIMESTAMP(3),
ADD COLUMN     "portal_token" TEXT;

-- AlterTable
ALTER TABLE "participant_field_templates" ADD COLUMN     "portal_access" "PortalAccess" NOT NULL DEFAULT 'hidden';

-- CreateTable
CREATE TABLE "child_guardians" (
    "id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "relationship" TEXT,
    "phone" TEXT,
    "receives_communications" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "child_guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_changes" (
    "id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "status" "ChildChangeStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "child_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_email_log" (
    "id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "purpose_key" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ParentEmailStatus" NOT NULL,
    "error_message" TEXT,
    "sent_by_user_id" TEXT NOT NULL,
    "subject" TEXT,

    CONSTRAINT "child_email_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "child_guardians_child_id_idx" ON "child_guardians"("child_id");

-- CreateIndex
CREATE INDEX "child_changes_child_id_status_idx" ON "child_changes"("child_id", "status");

-- CreateIndex
CREATE INDEX "child_email_log_child_id_idx" ON "child_email_log"("child_id");

-- CreateIndex
CREATE UNIQUE INDEX "children_portal_token_key" ON "children"("portal_token");

-- AddForeignKey
ALTER TABLE "child_guardians" ADD CONSTRAINT "child_guardians_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_changes" ADD CONSTRAINT "child_changes_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_changes" ADD CONSTRAINT "child_changes_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_email_log" ADD CONSTRAINT "child_email_log_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_email_log" ADD CONSTRAINT "child_email_log_sent_by_user_id_fkey" FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

