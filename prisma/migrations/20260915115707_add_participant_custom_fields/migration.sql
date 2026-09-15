-- CreateEnum
CREATE TYPE "ParticipantFieldType" AS ENUM ('text', 'number', 'date', 'boolean', 'select');

-- CreateEnum
CREATE TYPE "ParticipantFieldSurface" AS ENUM ('list', 'health', 'mail');

-- AlterEnum (MergeVariableSourceType gains participant_custom_field)
ALTER TYPE "MergeVariableSourceType" ADD VALUE 'participant_custom_field';

-- CreateTable
CREATE TABLE "participant_field_templates" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" "ParticipantFieldType" NOT NULL,
    "options" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "participant_field_templates_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "event_participant_fields" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" "ParticipantFieldType" NOT NULL,
    "options" JSONB,
    "surfaces" "ParticipantFieldSurface"[],
    "sort_order" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_from_template" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "event_participant_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_participant_fields_event_id_key_key" ON "event_participant_fields"("event_id", "key");

-- AddForeignKey
ALTER TABLE "event_participant_fields" ADD CONSTRAINT "event_participant_fields_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: add the generic value store
ALTER TABLE "participants" ADD COLUMN "custom_field_values" JSONB;

-- Data backfill: fold the five old fixed columns into custom_field_values,
-- using the same keys already seeded into merge_variables for them so the
-- real {{}} template placeholders keep resolving unchanged.
UPDATE "participants" SET "custom_field_values" = jsonb_strip_nulls(jsonb_build_object(
    'adresa', "address",
    'pojistovna', "health_insurance",
    'pohlavi', "gender",
    'clenstvi_zare', "is_member"::text,
    'vydani_osoby', "release_persons"
));

-- AlterTable: drop the five now-migrated fixed columns
ALTER TABLE "participants" DROP COLUMN "address",
DROP COLUMN "health_insurance",
DROP COLUMN "gender",
DROP COLUMN "is_member",
DROP COLUMN "release_persons";

-- Seed the five org-level field templates (same keys/labels as before)
INSERT INTO "participant_field_templates" ("key", "label", "field_type") VALUES
('adresa', 'Adresa trvalého bydliště', 'text'),
('pojistovna', 'Zdravotní pojišťovna', 'text'),
('pohlavi', 'Pohlaví', 'text'),
('clenstvi_zare', 'Je členem organizace', 'boolean'),
('vydani_osoby', 'Dítě může být vydáno těmto osobám', 'text');

-- Sync them into every existing event, visible on the central roster
-- (Pavel can widen to Health/Mail per-field from the admin UI)
INSERT INTO "event_participant_fields" ("id", "event_id", "key", "label", "field_type", "surfaces", "is_from_template")
SELECT gen_random_uuid(), e."id", t."key", t."label", t."field_type", ARRAY['list']::"ParticipantFieldSurface"[], true
FROM "events" e CROSS JOIN "participant_field_templates" t;
