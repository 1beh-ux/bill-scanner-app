-- AlterTable
ALTER TABLE "children" ADD COLUMN     "family_id" TEXT;

-- CreateTable
CREATE TABLE "families" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "portal_token" TEXT,
    "portal_gate_failures" INTEGER NOT NULL DEFAULT 0,
    "portal_gate_window_start" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "families_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "families_portal_token_key" ON "families"("portal_token");

-- CreateIndex
CREATE INDEX "children_family_id_idx" ON "children"("family_id");

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE SET NULL ON UPDATE CASCADE;

