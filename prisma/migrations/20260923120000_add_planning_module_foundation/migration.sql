-- CreateEnum
CREATE TYPE "PlanWindowKind" AS ENUM ('flexible', 'partial', 'fixed');

-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'planning';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ListTemplateKind" ADD VALUE 'plan_category';
ALTER TYPE "ListTemplateKind" ADD VALUE 'plan_location';
ALTER TYPE "ListTemplateKind" ADD VALUE 'plan_leader';
ALTER TYPE "ListTemplateKind" ADD VALUE 'plan_day_template';
ALTER TYPE "ListTemplateKind" ADD VALUE 'plan_activity';

-- CreateTable
CREATE TABLE "plan_days" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "date" DATE,
    "label" TEXT NOT NULL,
    "theme" TEXT,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "plan_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_windows" (
    "id" TEXT NOT NULL,
    "day_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_min" INTEGER NOT NULL,
    "end_min" INTEGER NOT NULL,
    "kind" "PlanWindowKind" NOT NULL DEFAULT 'flexible',
    "color" TEXT,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "plan_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_slots" (
    "id" TEXT NOT NULL,
    "window_id" TEXT NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "plan_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_blocks" (
    "id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "branch_order" INTEGER NOT NULL,
    "activity_id" TEXT,
    "custom_name" TEXT,
    "description" TEXT,
    "primary_category_id" TEXT,
    "secondary_category_id" TEXT,
    "leader_id" TEXT,
    "location_id" TEXT,
    "notes" TEXT,

    CONSTRAINT "plan_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_activities" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "default_duration_min" INTEGER NOT NULL,
    "description" TEXT,
    "primary_category_id" TEXT,
    "secondary_category_id" TEXT,
    "default_leader_id" TEXT,
    "default_location_id" TEXT,
    "energy_level" TEXT,
    "repeatable" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source_template_id" TEXT,

    CONSTRAINT "plan_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_days_event_id_idx" ON "plan_days"("event_id");

-- CreateIndex
CREATE INDEX "plan_windows_day_id_idx" ON "plan_windows"("day_id");

-- CreateIndex
CREATE INDEX "plan_slots_window_id_idx" ON "plan_slots"("window_id");

-- CreateIndex
CREATE INDEX "plan_blocks_slot_id_idx" ON "plan_blocks"("slot_id");

-- CreateIndex
CREATE INDEX "plan_activities_event_id_idx" ON "plan_activities"("event_id");

-- AddForeignKey
ALTER TABLE "plan_days" ADD CONSTRAINT "plan_days_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_windows" ADD CONSTRAINT "plan_windows_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "plan_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_slots" ADD CONSTRAINT "plan_slots_window_id_fkey" FOREIGN KEY ("window_id") REFERENCES "plan_windows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_blocks" ADD CONSTRAINT "plan_blocks_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "plan_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_blocks" ADD CONSTRAINT "plan_blocks_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "plan_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_blocks" ADD CONSTRAINT "plan_blocks_primary_category_id_fkey" FOREIGN KEY ("primary_category_id") REFERENCES "event_list_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_blocks" ADD CONSTRAINT "plan_blocks_secondary_category_id_fkey" FOREIGN KEY ("secondary_category_id") REFERENCES "event_list_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_blocks" ADD CONSTRAINT "plan_blocks_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "event_list_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_blocks" ADD CONSTRAINT "plan_blocks_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "event_list_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_activities" ADD CONSTRAINT "plan_activities_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_activities" ADD CONSTRAINT "plan_activities_primary_category_id_fkey" FOREIGN KEY ("primary_category_id") REFERENCES "event_list_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_activities" ADD CONSTRAINT "plan_activities_secondary_category_id_fkey" FOREIGN KEY ("secondary_category_id") REFERENCES "event_list_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_activities" ADD CONSTRAINT "plan_activities_default_leader_id_fkey" FOREIGN KEY ("default_leader_id") REFERENCES "event_list_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_activities" ADD CONSTRAINT "plan_activities_default_location_id_fkey" FOREIGN KEY ("default_location_id") REFERENCES "event_list_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

