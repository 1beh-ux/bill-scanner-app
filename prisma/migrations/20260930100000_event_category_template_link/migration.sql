-- AlterTable
ALTER TABLE "event_categories" ADD COLUMN     "category_template_id" TEXT;

-- Link existing template copies to their template (they still carry its name).
UPDATE "event_categories" ec
SET "category_template_id" = ct."id"
FROM "category_templates" ct
WHERE ec."is_from_template" = true AND ec."name" = ct."name";
