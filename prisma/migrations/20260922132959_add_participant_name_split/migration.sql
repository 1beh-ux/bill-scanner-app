-- AlterEnum
ALTER TYPE "ComputedFieldType" ADD VALUE 'contact_email';

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "first_name" TEXT,
ADD COLUMN     "last_name" TEXT;
