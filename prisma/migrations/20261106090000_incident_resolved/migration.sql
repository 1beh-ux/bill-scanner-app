-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "resolved_at" TIMESTAMP(3),
ADD COLUMN     "resolved_by_user_id" TEXT;

