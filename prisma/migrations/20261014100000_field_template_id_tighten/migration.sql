-- Organizations step 4, tighten (after scripts/migrate-field-template-ids.ts --apply):
-- `id` becomes the primary key, `key` is unique per organization -- NULL (app level) counts as one
-- group (NULLS NOT DISTINCT, edited by hand: Prisma can't express it) -- and source_template_id
-- points at `id`. The DB default on `id` stays, so older code can still insert during the deploy window.

-- DropIndex
DROP INDEX "participant_field_templates_id_key";

-- AlterTable
ALTER TABLE "participant_field_templates" DROP CONSTRAINT "participant_field_templates_pkey",
ADD CONSTRAINT "participant_field_templates_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "participant_field_templates_organization_id_key_key" ON "participant_field_templates"("organization_id", "key") NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "participant_field_templates" ADD CONSTRAINT "participant_field_templates_source_template_id_fkey" FOREIGN KEY ("source_template_id") REFERENCES "participant_field_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
