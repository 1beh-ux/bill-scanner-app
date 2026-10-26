-- Členové list columns, calculated price category + details status, participant export columns.
ALTER TABLE "participant_field_templates" ADD COLUMN "member_list_column" BOOLEAN NOT NULL DEFAULT false;
ALTER TYPE "ComputedFieldType" ADD VALUE IF NOT EXISTS 'price_category';
ALTER TYPE "ComputedFieldType" ADD VALUE IF NOT EXISTS 'details_status';
ALTER TABLE "events" ADD COLUMN "export_columns" JSONB;
ALTER TABLE "organizations" ADD COLUMN "export_columns" JSONB;
