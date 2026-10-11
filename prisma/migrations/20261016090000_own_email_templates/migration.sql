-- Own e-mail templates (Poslat e-mail): a name for custom_… templates. Additive only.
-- AlterTable
ALTER TABLE "email_templates" ADD COLUMN     "name" TEXT;

-- AlterTable
ALTER TABLE "event_email_templates" ADD COLUMN     "name" TEXT;

