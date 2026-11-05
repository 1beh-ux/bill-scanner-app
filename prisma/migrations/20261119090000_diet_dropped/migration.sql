-- AlterTable
ALTER TABLE "participant_diets" ADD COLUMN     "dropped" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "dropped_reason" TEXT;

