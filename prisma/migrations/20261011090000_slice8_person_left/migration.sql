-- CreateEnum
CREATE TYPE "PersonLeftVia" AS ENUM ('portal', 'admin');

-- AlterTable
ALTER TABLE "children" ADD COLUMN     "left_at" TIMESTAMP(3),
ADD COLUMN     "left_note" TEXT,
ADD COLUMN     "left_via" "PersonLeftVia";

