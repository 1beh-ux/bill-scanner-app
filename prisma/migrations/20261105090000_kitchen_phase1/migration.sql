-- Kuchyně phase 1 (docs/kitchen-planning-design.md): the library (ingredients, meals), the event plan, headcount
-- adjustments, absences, confirmed diets, feedback, shopping ticks; two list kinds (meal slots, age bands).
-- CreateEnum
CREATE TYPE "IngredientUnit" AS ENUM ('g', 'ml', 'ks');

-- CreateEnum
CREATE TYPE "PlanEntryStatus" AS ENUM ('draft', 'confirmed', 'cooked');

-- CreateEnum
CREATE TYPE "HeadcountMode" AS ENUM ('auto', 'manual');

-- CreateEnum
CREATE TYPE "FeedbackVerdict" AS ENUM ('short', 'ok', 'leftover');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ListTemplateKind" ADD VALUE 'kitchen_slot';
ALTER TYPE "ListTemplateKind" ADD VALUE 'kitchen_band';

-- CreateTable
CREATE TABLE "ingredients" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "unit" "IngredientUnit" NOT NULL,
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "diet_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allergens_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "pack_size" DECIMAL(12,3),
    "pack_unit" TEXT,
    "shelf_life_days" INTEGER,
    "store_hint" TEXT,
    "category" TEXT,
    "global_id" TEXT,
    "synced_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meals" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "meal_type" TEXT,
    "yield_portions" INTEGER NOT NULL DEFAULT 10,
    "prep_minutes" INTEGER,
    "cook_minutes" INTEGER,
    "equipment" TEXT,
    "prep_ahead_ok" BOOLEAN NOT NULL DEFAULT false,
    "leftover_friendly" BOOLEAN NOT NULL DEFAULT false,
    "cold_packable" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "steps" TEXT,
    "parent_meal_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "global_id" TEXT,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_ingredients" (
    "id" TEXT NOT NULL,
    "meal_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "qty_per_adult_portion" DECIMAL(12,3) NOT NULL,
    "role" TEXT,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "meal_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_variants" (
    "id" TEXT NOT NULL,
    "meal_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clears_allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "swaps" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "meal_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_notes" (
    "id" TEXT NOT NULL,
    "meal_id" TEXT NOT NULL,
    "event_id" TEXT,
    "body" TEXT NOT NULL,
    "author_user_id" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_kitchen_settings" (
    "event_id" TEXT NOT NULL,
    "allergy_field_key" TEXT,
    "food_category_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "count_only_accepted" BOOLEAN NOT NULL DEFAULT false,
    "feedback_unlock_minutes" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "event_kitchen_settings_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "plan_entries" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "slot_item_id" TEXT NOT NULL,
    "plan_window_id" TEXT,
    "meal_id" TEXT,
    "custom_name" TEXT,
    "variant_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "headcount_mode" "HeadcountMode" NOT NULL DEFAULT 'auto',
    "manual_portions" DECIMAL(10,2),
    "sizing_multiplier" DECIMAL(6,3),
    "serving_time" TEXT,
    "status" "PlanEntryStatus" NOT NULL DEFAULT 'draft',
    "recipe_snapshot" JSONB,
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "headcount_adjusts" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "slot_item_id" TEXT,
    "count" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "factor" DECIMAL(6,3) NOT NULL DEFAULT 1.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "headcount_adjusts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_absences" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "participant_id" TEXT,
    "event_person_id" TEXT,
    "date" DATE NOT NULL,
    "slot_item_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_diets" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "diet_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "raw_text" TEXT NOT NULL,
    "raw_text_hash" TEXT NOT NULL,
    "confirmed_by_id" TEXT,
    "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "participant_diets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_feedback" (
    "id" TEXT NOT NULL,
    "plan_entry_id" TEXT NOT NULL,
    "verdict" "FeedbackVerdict" NOT NULL,
    "leftover_percent" INTEGER,
    "short_percent" INTEGER,
    "stars" INTEGER,
    "note" TEXT,
    "recorded_by_id" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_checks" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "for_date" DATE NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "qty_bought" DECIMAL(12,3),

    CONSTRAINT "shopping_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingredients_organization_id_idx" ON "ingredients"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_organization_id_name_key_key" ON "ingredients"("organization_id", "name_key");

-- CreateIndex
CREATE INDEX "meals_organization_id_idx" ON "meals"("organization_id");

-- CreateIndex
CREATE INDEX "meals_organization_id_name_key_idx" ON "meals"("organization_id", "name_key");

-- CreateIndex
CREATE INDEX "meal_ingredients_meal_id_idx" ON "meal_ingredients"("meal_id");

-- CreateIndex
CREATE INDEX "meal_variants_meal_id_idx" ON "meal_variants"("meal_id");

-- CreateIndex
CREATE INDEX "meal_notes_meal_id_idx" ON "meal_notes"("meal_id");

-- CreateIndex
CREATE INDEX "plan_entries_event_id_date_idx" ON "plan_entries"("event_id", "date");

-- CreateIndex
CREATE INDEX "headcount_adjusts_event_id_idx" ON "headcount_adjusts"("event_id");

-- CreateIndex
CREATE INDEX "meal_absences_event_id_date_idx" ON "meal_absences"("event_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "participant_diets_participant_id_key" ON "participant_diets"("participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "meal_feedback_plan_entry_id_key" ON "meal_feedback"("plan_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_checks_event_id_ingredient_id_for_date_key" ON "shopping_checks"("event_id", "ingredient_id", "for_date");

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meals" ADD CONSTRAINT "meals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meals" ADD CONSTRAINT "meals_parent_meal_id_fkey" FOREIGN KEY ("parent_meal_id") REFERENCES "meals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_ingredients" ADD CONSTRAINT "meal_ingredients_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_ingredients" ADD CONSTRAINT "meal_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_variants" ADD CONSTRAINT "meal_variants_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_notes" ADD CONSTRAINT "meal_notes_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_notes" ADD CONSTRAINT "meal_notes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_kitchen_settings" ADD CONSTRAINT "event_kitchen_settings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_entries" ADD CONSTRAINT "plan_entries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_entries" ADD CONSTRAINT "plan_entries_slot_item_id_fkey" FOREIGN KEY ("slot_item_id") REFERENCES "event_list_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_entries" ADD CONSTRAINT "plan_entries_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "meals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "headcount_adjusts" ADD CONSTRAINT "headcount_adjusts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "headcount_adjusts" ADD CONSTRAINT "headcount_adjusts_slot_item_id_fkey" FOREIGN KEY ("slot_item_id") REFERENCES "event_list_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_absences" ADD CONSTRAINT "meal_absences_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_absences" ADD CONSTRAINT "meal_absences_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_absences" ADD CONSTRAINT "meal_absences_event_person_id_fkey" FOREIGN KEY ("event_person_id") REFERENCES "event_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_absences" ADD CONSTRAINT "meal_absences_slot_item_id_fkey" FOREIGN KEY ("slot_item_id") REFERENCES "event_list_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_diets" ADD CONSTRAINT "participant_diets_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_feedback" ADD CONSTRAINT "meal_feedback_plan_entry_id_fkey" FOREIGN KEY ("plan_entry_id") REFERENCES "plan_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_checks" ADD CONSTRAINT "shopping_checks_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_checks" ADD CONSTRAINT "shopping_checks_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Exactly one of participant / adult per absence.
ALTER TABLE "meal_absences" ADD CONSTRAINT "meal_absences_one_person" CHECK (("participant_id" IS NULL) <> ("event_person_id" IS NULL));
