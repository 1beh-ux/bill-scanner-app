-- AlterTable
ALTER TABLE "events" ADD COLUMN     "landing_content" TEXT,
ADD COLUMN     "public_registration" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "public_slug" TEXT;

-- AlterTable
ALTER TABLE "families" ADD COLUMN     "needs_review" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "participant_field_templates" ADD COLUMN     "required_in_registration" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "portal_rate_hits" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_rate_hits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portal_rate_hits_key_created_at_idx" ON "portal_rate_hits"("key", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "events_public_slug_key" ON "events"("public_slug");

