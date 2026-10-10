-- Fio payment check (docs/bank-payments-design.md). Additive only.
-- CreateEnum
CREATE TYPE "BankProvider" AS ENUM ('fio');

-- CreateEnum
CREATE TYPE "BankMovementStatus" AS ENUM ('settled', 'review', 'ignored');

-- AlterEnum
ALTER TYPE "MailDocReceivedVia" ADD VALUE 'bank';

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "bank_account_id" TEXT,
ADD COLUMN     "bank_check_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "accepted_variable_symbol" TEXT;

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "bank_code" TEXT NOT NULL,
    "provider" "BankProvider" NOT NULL DEFAULT 'fio',
    "token_encrypted" TEXT,
    "token_set_at" TIMESTAMP(3),
    "token_set_by_user_id" TEXT,
    "last_checked_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "last_error" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_movements" (
    "id" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "movement_id" TEXT NOT NULL,
    "booked_at" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "variable_symbol" TEXT,
    "counter_name" TEXT,
    "counter_account" TEXT,
    "message" TEXT,
    "status" "BankMovementStatus" NOT NULL,
    "reason" TEXT,
    "participant_id" TEXT,
    "participant_document_id" TEXT,
    "decided_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_organization_id_account_number_bank_code_key" ON "bank_accounts"("organization_id", "account_number", "bank_code");

-- CreateIndex
CREATE UNIQUE INDEX "bank_movements_participant_document_id_key" ON "bank_movements"("participant_document_id");

-- CreateIndex
CREATE INDEX "bank_movements_participant_id_idx" ON "bank_movements"("participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_movements_bank_account_id_movement_id_key" ON "bank_movements"("bank_account_id", "movement_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_token_set_by_user_id_fkey" FOREIGN KEY ("token_set_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_movements" ADD CONSTRAINT "bank_movements_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_movements" ADD CONSTRAINT "bank_movements_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_movements" ADD CONSTRAINT "bank_movements_participant_document_id_fkey" FOREIGN KEY ("participant_document_id") REFERENCES "participant_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_movements" ADD CONSTRAINT "bank_movements_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

