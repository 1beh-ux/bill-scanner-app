-- AlterTable
ALTER TABLE "participant_diets" ADD COLUMN     "unmapped" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "unmapped_reviewed" BOOLEAN NOT NULL DEFAULT false;

