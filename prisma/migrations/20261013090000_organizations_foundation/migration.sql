-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_super_admin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "category_templates" ADD COLUMN     "organization_id" TEXT,
ADD COLUMN     "source_template_id" TEXT;

-- AlterTable
ALTER TABLE "authors" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "merchant_aliases" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "children" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "families" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "participant_field_templates" ADD COLUMN     "organization_id" TEXT,
ADD COLUMN     "source_template_id" TEXT;

-- AlterTable
ALTER TABLE "list_templates" ADD COLUMN     "organization_id" TEXT,
ADD COLUMN     "source_template_id" TEXT;

-- AlterTable
ALTER TABLE "email_templates" ADD COLUMN     "organization_id" TEXT,
ADD COLUMN     "source_template_id" TEXT;

-- AlterTable
ALTER TABLE "mail_sender_accounts" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "drive_accounts" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "public_hosts" ADD COLUMN     "organization_id" TEXT;

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "contact_email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");

-- CreateIndex
CREATE INDEX "events_organization_id_idx" ON "events"("organization_id");

-- CreateIndex
CREATE INDEX "category_templates_organization_id_idx" ON "category_templates"("organization_id");

-- CreateIndex
CREATE INDEX "authors_organization_id_idx" ON "authors"("organization_id");

-- CreateIndex
CREATE INDEX "merchant_aliases_organization_id_idx" ON "merchant_aliases"("organization_id");

-- CreateIndex
CREATE INDEX "children_organization_id_idx" ON "children"("organization_id");

-- CreateIndex
CREATE INDEX "families_organization_id_idx" ON "families"("organization_id");

-- CreateIndex
CREATE INDEX "participant_field_templates_organization_id_idx" ON "participant_field_templates"("organization_id");

-- CreateIndex
CREATE INDEX "list_templates_organization_id_idx" ON "list_templates"("organization_id");

-- CreateIndex
CREATE INDEX "email_templates_organization_id_idx" ON "email_templates"("organization_id");

-- CreateIndex
CREATE INDEX "mail_sender_accounts_organization_id_idx" ON "mail_sender_accounts"("organization_id");

-- CreateIndex
CREATE INDEX "drive_accounts_organization_id_idx" ON "drive_accounts"("organization_id");

-- CreateIndex
CREATE INDEX "public_hosts_organization_id_idx" ON "public_hosts"("organization_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_templates" ADD CONSTRAINT "category_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_templates" ADD CONSTRAINT "category_templates_source_template_id_fkey" FOREIGN KEY ("source_template_id") REFERENCES "category_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authors" ADD CONSTRAINT "authors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_aliases" ADD CONSTRAINT "merchant_aliases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "families" ADD CONSTRAINT "families_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_field_templates" ADD CONSTRAINT "participant_field_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_field_templates" ADD CONSTRAINT "participant_field_templates_source_template_id_fkey" FOREIGN KEY ("source_template_id") REFERENCES "participant_field_templates"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_templates" ADD CONSTRAINT "list_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_templates" ADD CONSTRAINT "list_templates_source_template_id_fkey" FOREIGN KEY ("source_template_id") REFERENCES "list_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_source_template_id_fkey" FOREIGN KEY ("source_template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_sender_accounts" ADD CONSTRAINT "mail_sender_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_accounts" ADD CONSTRAINT "drive_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_hosts" ADD CONSTRAINT "public_hosts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

