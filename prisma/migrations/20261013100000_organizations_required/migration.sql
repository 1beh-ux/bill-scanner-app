-- Run only after scripts/migrate-organizations.ts --apply: every organization_id below must be filled.
-- Template uniques: NULL (app-level template) counts as one group (NULLS NOT DISTINCT, Postgres 15+);
-- Prisma cannot express that, so these two lines were edited by hand.

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT "events_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "authors" DROP CONSTRAINT "authors_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "merchant_aliases" DROP CONSTRAINT "merchant_aliases_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "children" DROP CONSTRAINT "children_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "families" DROP CONSTRAINT "families_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "mail_sender_accounts" DROP CONSTRAINT "mail_sender_accounts_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "drive_accounts" DROP CONSTRAINT "drive_accounts_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public_hosts" DROP CONSTRAINT "public_hosts_organization_id_fkey";

-- DropIndex
DROP INDEX "category_templates_name_key";

-- DropIndex
DROP INDEX "merchant_aliases_raw_text_key";

-- DropIndex
DROP INDEX "email_templates_purpose_key_key";

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "events" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "authors" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "merchant_aliases" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "children" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "families" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "mail_sender_accounts" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "drive_accounts" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "public_hosts" ALTER COLUMN "organization_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "category_templates_organization_id_name_key" ON "category_templates"("organization_id", "name") NULLS NOT DISTINCT;

-- CreateIndex
CREATE UNIQUE INDEX "merchant_aliases_organization_id_raw_text_key" ON "merchant_aliases"("organization_id", "raw_text");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_organization_id_purpose_key_key" ON "email_templates"("organization_id", "purpose_key") NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authors" ADD CONSTRAINT "authors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_aliases" ADD CONSTRAINT "merchant_aliases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "families" ADD CONSTRAINT "families_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_sender_accounts" ADD CONSTRAINT "mail_sender_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_accounts" ADD CONSTRAINT "drive_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_hosts" ADD CONSTRAINT "public_hosts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

