-- Členové list columns, calculated price category + details status, participant export columns.
ALTER TABLE "participant_field_templates" ADD COLUMN "member_list_column" BOOLEAN NOT NULL DEFAULT false;
ALTER TYPE "ComputedFieldType" ADD VALUE IF NOT EXISTS 'price_category';
ALTER TYPE "ComputedFieldType" ADD VALUE IF NOT EXISTS 'details_status';
ALTER TABLE "events" ADD COLUMN "export_columns" JSONB;
ALTER TABLE "organizations" ADD COLUMN "export_columns" JSONB;
-- Where the portal profile shows the price category (Šablony -> Pořadí polí pro rodiče).
ALTER TABLE "organizations" ADD COLUMN "profile_category" JSONB;
