-- Organizations step 4, additive: participant_field_templates gets an `id` (the coming primary key;
-- `key` becomes unique per organization in organizations_field_template_id). The DB default fills
-- every existing row and any row older code inserts during the deploy window.
-- The unused self reference on `key` (source_template_id, all NULL) is dropped; it returns on `id`.

-- DropForeignKey
ALTER TABLE "participant_field_templates" DROP CONSTRAINT "participant_field_templates_source_template_id_fkey";

-- AlterTable
ALTER TABLE "participant_field_templates" ADD COLUMN "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text;

-- CreateIndex
CREATE UNIQUE INDEX "participant_field_templates_id_key" ON "participant_field_templates"("id");
