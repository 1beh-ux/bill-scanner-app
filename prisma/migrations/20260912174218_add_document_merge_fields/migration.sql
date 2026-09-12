-- CreateEnum
CREATE TYPE "MergeVariableSourceType" AS ENUM ('participant_field', 'guardian_field', 'event_field', 'computed');

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "address" TEXT,
ADD COLUMN     "health_insurance" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "is_member" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "release_persons" TEXT,
ADD COLUMN     "registration_number" INTEGER;

-- AlterTable
ALTER TABLE "participant_guardians" ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "member_price_czk" INTEGER,
ADD COLUMN     "non_member_price_czk" INTEGER,
ADD COLUMN     "registration_bank_account_number" TEXT,
ADD COLUMN     "registration_bank_code" TEXT;

-- CreateTable
CREATE TABLE "merge_variables" (
    "key" TEXT NOT NULL,
    "source_type" "MergeVariableSourceType" NOT NULL,
    "source_field" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "merge_variables_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "participants_event_id_registration_number_key" ON "participants"("event_id", "registration_number");
