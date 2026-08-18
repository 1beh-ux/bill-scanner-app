/*
  Warnings:

  - You are about to drop the `user_event_access` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ModuleKey" AS ENUM ('bills', 'health', 'mail');

-- CreateEnum
CREATE TYPE "IncidentCategory" AS ENUM ('illness', 'injury', 'parasite', 'medication', 'other');

-- CreateEnum
CREATE TYPE "BodyView" AS ENUM ('front', 'back');

-- CreateEnum
CREATE TYPE "IncidentUpdateType" AS ENUM ('correct', 'void');

-- CreateEnum
CREATE TYPE "ListTemplateKind" AS ENUM ('med', 'slot', 'situation');

-- CreateEnum
CREATE TYPE "ParentEmailStatus" AS ENUM ('sent', 'failed');

-- DropForeignKey
ALTER TABLE "user_event_access" DROP CONSTRAINT "user_event_access_event_id_fkey";

-- DropForeignKey
ALTER TABLE "user_event_access" DROP CONSTRAINT "user_event_access_user_id_fkey";

-- DropTable
DROP TABLE "user_event_access";

-- CreateTable
CREATE TABLE "modules" (
    "key" "ModuleKey" NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "event_modules" (
    "event_id" TEXT NOT NULL,
    "module_key" "ModuleKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "event_modules_pkey" PRIMARY KEY ("event_id","module_key")
);

-- CreateTable
CREATE TABLE "user_event_module_access" (
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "module_key" "ModuleKey" NOT NULL,

    CONSTRAINT "user_event_module_access_pkey" PRIMARY KEY ("user_id","event_id","module_key")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group_name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "allergies" TEXT,
    "meds_notes" TEXT,
    "chronic_issues" TEXT,
    "other_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_guardians" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "relationship" TEXT,
    "receives_communications" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "participant_guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT NOT NULL,
    "category" "IncidentCategory" NOT NULL,
    "template_type" TEXT,
    "action_summary" TEXT NOT NULL,
    "pill_name" TEXT,
    "details" TEXT NOT NULL,
    "photo_gcs_path" TEXT,
    "parent_incident_id" TEXT,
    "temp_c" DECIMAL(4,1),
    "body_view" "BodyView",
    "body_x_pct" DECIMAL(5,2),
    "body_y_pct" DECIMAL(5,2),

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_updates" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_user_id" TEXT NOT NULL,
    "update_type" "IncidentUpdateType" NOT NULL,
    "action_summary" TEXT NOT NULL,
    "pill_name" TEXT,
    "details" TEXT NOT NULL,
    "photo_gcs_path" TEXT,
    "temp_c" DECIMAL(4,1),
    "body_view" "BodyView",
    "body_x_pct" DECIMAL(5,2),
    "body_y_pct" DECIMAL(5,2),
    "note" TEXT,

    CONSTRAINT "incident_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "list_templates" (
    "id" TEXT NOT NULL,
    "kind" "ListTemplateKind" NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "data" JSONB,

    CONSTRAINT "list_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_list_items" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "kind" "ListTemplateKind" NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_from_template" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB,

    CONSTRAINT "event_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_med_plans" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "event_med_id" TEXT NOT NULL,
    "event_slot_id" TEXT NOT NULL,
    "dose" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "participant_med_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med_checklist" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "event_med_id" TEXT NOT NULL,
    "event_slot_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "given" BOOLEAN NOT NULL DEFAULT false,
    "given_at" TIMESTAMP(3),
    "given_by_user_id" TEXT,

    CONSTRAINT "med_checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "purpose_key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_email_templates" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "purpose_key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_from_template" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "event_email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_email_log" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "guardian_id" TEXT NOT NULL,
    "purpose_key" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ParentEmailStatus" NOT NULL,
    "error_message" TEXT,
    "sent_by_user_id" TEXT NOT NULL,
    "pdf_gcs_path" TEXT,

    CONSTRAINT "parent_email_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "med_checklist_participant_id_event_med_id_event_slot_id_dat_key" ON "med_checklist"("participant_id", "event_med_id", "event_slot_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_purpose_key_key" ON "email_templates"("purpose_key");

-- CreateIndex
CREATE UNIQUE INDEX "event_email_templates_event_id_purpose_key_key" ON "event_email_templates"("event_id", "purpose_key");

-- AddForeignKey
ALTER TABLE "event_modules" ADD CONSTRAINT "event_modules_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_event_module_access" ADD CONSTRAINT "user_event_module_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_event_module_access" ADD CONSTRAINT "user_event_module_access_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_guardians" ADD CONSTRAINT "participant_guardians_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_parent_incident_id_fkey" FOREIGN KEY ("parent_incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_updates" ADD CONSTRAINT "incident_updates_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_updates" ADD CONSTRAINT "incident_updates_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_list_items" ADD CONSTRAINT "event_list_items_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_med_plans" ADD CONSTRAINT "participant_med_plans_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_med_plans" ADD CONSTRAINT "participant_med_plans_event_med_id_fkey" FOREIGN KEY ("event_med_id") REFERENCES "event_list_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_med_plans" ADD CONSTRAINT "participant_med_plans_event_slot_id_fkey" FOREIGN KEY ("event_slot_id") REFERENCES "event_list_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_checklist" ADD CONSTRAINT "med_checklist_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_checklist" ADD CONSTRAINT "med_checklist_event_med_id_fkey" FOREIGN KEY ("event_med_id") REFERENCES "event_list_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_checklist" ADD CONSTRAINT "med_checklist_event_slot_id_fkey" FOREIGN KEY ("event_slot_id") REFERENCES "event_list_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_checklist" ADD CONSTRAINT "med_checklist_given_by_user_id_fkey" FOREIGN KEY ("given_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_email_templates" ADD CONSTRAINT "event_email_templates_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_email_log" ADD CONSTRAINT "parent_email_log_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_email_log" ADD CONSTRAINT "parent_email_log_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "participant_guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_email_log" ADD CONSTRAINT "parent_email_log_sent_by_user_id_fkey" FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data backfill: register modules, and turn Bills on (Health off) for every
-- existing event so enforcement doesn't change behavior for anyone today.
-- `mail` gets no `modules` row yet -- not built.
INSERT INTO "modules" ("key", "name") VALUES ('bills', 'Bills'), ('health', 'Zdraví');

INSERT INTO "event_modules" ("event_id", "module_key", "enabled")
  SELECT "id", 'bills', true FROM "events";

INSERT INTO "event_modules" ("event_id", "module_key", "enabled")
  SELECT "id", 'health', false FROM "events";
