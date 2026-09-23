-- AlterTable
ALTER TABLE "plan_blocks" ADD COLUMN     "group_names" TEXT[] DEFAULT ARRAY[]::TEXT[];

