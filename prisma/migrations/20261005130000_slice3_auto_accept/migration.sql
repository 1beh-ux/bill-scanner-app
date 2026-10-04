-- CreateEnum
CREATE TYPE "AutoAccept" AS ENUM ('manual', 'accept', 'accept_send');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "auto_accept" "AutoAccept" NOT NULL DEFAULT 'manual';

