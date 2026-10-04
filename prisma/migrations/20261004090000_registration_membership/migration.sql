-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('event', 'membership');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "kind" "EventKind" NOT NULL DEFAULT 'event',
ADD COLUMN     "membership_year" INTEGER,
ADD COLUMN     "registration_connected" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "child_id" TEXT;

-- CreateTable
CREATE TABLE "children" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "date_of_birth" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "participants_child_id_idx" ON "participants"("child_id");

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;

