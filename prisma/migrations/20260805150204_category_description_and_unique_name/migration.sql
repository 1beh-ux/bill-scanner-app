/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `category_templates` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "category_templates" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "event_categories" ADD COLUMN     "description" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "category_templates_name_key" ON "category_templates"("name");
