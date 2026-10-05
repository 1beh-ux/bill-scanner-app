-- CreateEnum
CREATE TYPE "FieldAudience" AS ENUM ('both', 'children', 'adults');

-- CreateEnum
CREATE TYPE "FieldLevel" AS ENUM ('basic', 'detailed');

-- AlterTable
ALTER TABLE "participant_field_templates" ADD COLUMN     "audience" "FieldAudience" NOT NULL DEFAULT 'both',
ADD COLUMN     "level" "FieldLevel" NOT NULL DEFAULT 'basic';

