-- Parent portal profile page: the organization's own profile sections, a field's section and its
-- place on the family overview.
ALTER TABLE "organizations" ADD COLUMN "portal_profile_sections" JSONB;
ALTER TABLE "participant_field_templates" ADD COLUMN "profile_section" TEXT;
ALTER TABLE "participant_field_templates" ADD COLUMN "portal_summary" BOOLEAN NOT NULL DEFAULT false;

-- The family overview shows name + birth date; "Oddíl" too where an organization has that field.
UPDATE "participant_field_templates" SET "portal_summary" = true WHERE "key" = 'oddil' AND "portal_access" <> 'hidden';
