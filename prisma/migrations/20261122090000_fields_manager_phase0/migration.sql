-- CreateEnum
CREATE TYPE "FieldStorage" AS ENUM ('profile', 'event');

-- CreateEnum
CREATE TYPE "AliasTarget" AS ENUM ('field', 'guardian', 'event_variable');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ParticipantFieldType" ADD VALUE 'longtext';
ALTER TYPE "ParticipantFieldType" ADD VALUE 'multi';
ALTER TYPE "ParticipantFieldType" ADD VALUE 'consent';
ALTER TYPE "ParticipantFieldType" ADD VALUE 'email';
ALTER TYPE "ParticipantFieldType" ADD VALUE 'phone';
ALTER TYPE "ParticipantFieldType" ADD VALUE 'calculated';

-- AlterTable
ALTER TABLE "child_guardians" ADD COLUMN     "extra" JSONB,
ADD COLUMN     "position" INTEGER;

-- AlterTable
ALTER TABLE "participant_guardians" ADD COLUMN     "extra" JSONB,
ADD COLUMN     "position" INTEGER;

-- AlterTable
ALTER TABLE "participant_field_templates" ADD COLUMN     "section" TEXT,
ADD COLUMN     "storage" "FieldStorage" NOT NULL DEFAULT 'profile';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "guardian_props" JSONB,
ADD COLUMN     "guardian_slots" INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "field_aliases" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "target_kind" "AliasTarget" NOT NULL,
    "target_key" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_variables" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "event_id" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_variables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_review_items" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "sync_id" TEXT NOT NULL,
    "row_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_review_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_runs" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "sync_id" TEXT,
    "writes" JSONB NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undone_at" TIMESTAMP(3),

    CONSTRAINT "import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_edits" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "google_doc_id" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saved_revision" TEXT,

    CONSTRAINT "document_edits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_change_log" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "by_id" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undone_at" TIMESTAMP(3),

    CONSTRAINT "field_change_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_aliases_organization_id_target_key_idx" ON "field_aliases"("organization_id", "target_key");

-- CreateIndex
CREATE UNIQUE INDEX "field_aliases_organization_id_alias_key" ON "field_aliases"("organization_id", "alias");

-- CreateIndex
CREATE INDEX "event_variables_event_id_idx" ON "event_variables"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_variables_organization_id_event_id_key_key" ON "event_variables"("organization_id", "event_id", "key");

-- CreateIndex
CREATE INDEX "sync_review_items_event_id_status_idx" ON "sync_review_items"("event_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sync_review_items_event_id_sync_id_row_key_kind_key" ON "sync_review_items"("event_id", "sync_id", "row_key", "kind");

-- CreateIndex
CREATE INDEX "import_runs_event_id_created_at_idx" ON "import_runs"("event_id", "created_at");

-- CreateIndex
CREATE INDEX "document_edits_google_doc_id_status_idx" ON "document_edits"("google_doc_id", "status");

-- CreateIndex
CREATE INDEX "document_edits_organization_id_idx" ON "document_edits"("organization_id");

-- CreateIndex
CREATE INDEX "field_change_log_organization_id_at_idx" ON "field_change_log"("organization_id", "at");

-- AddForeignKey
ALTER TABLE "field_aliases" ADD CONSTRAINT "field_aliases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_variables" ADD CONSTRAINT "event_variables_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_variables" ADD CONSTRAINT "event_variables_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_review_items" ADD CONSTRAINT "sync_review_items_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_edits" ADD CONSTRAINT "document_edits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_change_log" ADD CONSTRAINT "field_change_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

