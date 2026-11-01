
-- DropForeignKey
ALTER TABLE "author_bank_audit" DROP CONSTRAINT "author_bank_audit_changed_by_user_id_fkey";

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "settlement_receiver" TEXT NOT NULL DEFAULT 'treasurer';

-- AlterTable
ALTER TABLE "authors" ADD COLUMN     "fio_last_checked_at" TIMESTAMP(3),
ADD COLUMN     "fio_last_error" TEXT,
ADD COLUMN     "fio_last_success_at" TIMESTAMP(3),
ADD COLUMN     "fio_token_encrypted" TEXT,
ADD COLUMN     "fio_token_set_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "author_bank_audit" ALTER COLUMN "changed_by_user_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "settlement_links" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "variable_symbol" TEXT NOT NULL,
    "claimed_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "pair_claims" JSONB NOT NULL DEFAULT '{}',
    "paid_movement_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "settlement_links_token_key" ON "settlement_links"("token");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_links_variable_symbol_key" ON "settlement_links"("variable_symbol");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_links_event_id_author_id_key" ON "settlement_links"("event_id", "author_id");

-- AddForeignKey
ALTER TABLE "author_bank_audit" ADD CONSTRAINT "author_bank_audit_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_links" ADD CONSTRAINT "settlement_links_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_links" ADD CONSTRAINT "settlement_links_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

