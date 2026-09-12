-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('pending', 'accepted');

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "registration_status" "RegistrationStatus" NOT NULL DEFAULT 'pending';
