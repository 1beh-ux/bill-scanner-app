-- Which membership year a regular event checks (null = its start year) + the computed "Členství" field.
ALTER TABLE "events" ADD COLUMN "membership_check_year" INTEGER;
ALTER TYPE "ComputedFieldType" ADD VALUE IF NOT EXISTS 'membership_status';
-- Uploaded files per e-mail template (organization and event).
ALTER TABLE "events" ADD COLUMN "email_files" JSONB;
ALTER TABLE "organizations" ADD COLUMN "email_files" JSONB;
