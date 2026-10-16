-- Banka (bank reconciliation): module key, account sources, transactions, matches, import batches, bill payment fields, audit actions, bank ingest channel; bill file optional. Additive only.
-- CreateEnum
CREATE TYPE "BankSourceType" AS ENUM ('fio_api', 'sheet', 'file');

-- CreateEnum
CREATE TYPE "BankClassification" AS ENUM ('expense', 'income', 'cash', 'transfer', 'fee', 'private', 'other_event');

-- CreateEnum
CREATE TYPE "BankIncomeType" AS ENUM ('fee', 'grant', 'donation', 'refund', 'other');

-- CreateEnum
CREATE TYPE "BankMatchMethod" AS ENUM ('suggested', 'manual');

-- CreateEnum
CREATE TYPE "BankMatchTier" AS ENUM ('sure', 'possible');

-- CreateEnum
CREATE TYPE "BankDifferenceReason" AS ENUM ('fx', 'fee', 'rounding', 'partial');

-- CreateEnum
CREATE TYPE "BankImportSource" AS ENUM ('fio', 'sheet', 'csv', 'xlsx', 'paste', 'gpc', 'camt');

-- CreateEnum
CREATE TYPE "BillPaymentChannel" AS ENUM ('cash', 'other_account');

-- AlterEnum
ALTER TYPE "IngestChannel" ADD VALUE 'bank';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditActionType" ADD VALUE 'bank_pair';
ALTER TYPE "AuditActionType" ADD VALUE 'bank_unpair';
ALTER TYPE "AuditActionType" ADD VALUE 'bank_reject';
ALTER TYPE "AuditActionType" ADD VALUE 'bank_create';
ALTER TYPE "AuditActionType" ADD VALUE 'bank_replace';
ALTER TYPE "AuditActionType" ADD VALUE 'bank_channel';

-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'bank';

-- AlterTable
ALTER TABLE "bills" ADD COLUMN     "document_from_statement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "document_missing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "missing_doc_assignee_author_id" TEXT,
ADD COLUMN     "payment_channel" "BillPaymentChannel",
ADD COLUMN     "payment_note" TEXT,
ALTER COLUMN "gcs_object_path" DROP NOT NULL;

-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN     "column_mapping" JSONB,
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'CZK',
ADD COLUMN     "iban" TEXT,
ADD COLUMN     "last_sync_at" TIMESTAMP(3),
ADD COLUMN     "last_sync_result" JSONB,
ADD COLUMN     "sheet_id" TEXT,
ADD COLUMN     "sheet_range" TEXT,
ADD COLUMN     "source_type" "BankSourceType" NOT NULL DEFAULT 'fio_api',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "event_bank_accounts" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "booking_date" DATE NOT NULL,
    "value_date" DATE,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CZK',
    "original_amount" DECIMAL(14,2),
    "original_currency" TEXT,
    "counterparty_account" TEXT,
    "counterparty_bank_code" TEXT,
    "counterparty_name" TEXT,
    "vs" TEXT,
    "ks" TEXT,
    "ss" TEXT,
    "message" TEXT,
    "note" TEXT,
    "bank_type" TEXT,
    "classification" "BankClassification" NOT NULL,
    "classified_by_user" BOOLEAN NOT NULL DEFAULT false,
    "income_type" "BankIncomeType",
    "person_author_id" TEXT,
    "reimbursement_author_id" TEXT,
    "no_document_needed" BOOLEAN NOT NULL DEFAULT false,
    "user_note" TEXT,
    "source_missing" BOOLEAN NOT NULL DEFAULT false,
    "import_batch_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_matches" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "amount_czk" DECIMAL(14,2) NOT NULL,
    "method" "BankMatchMethod" NOT NULL,
    "tier" "BankMatchTier",
    "score" INTEGER NOT NULL DEFAULT 0,
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "difference_reason" "BankDifferenceReason",
    "set_paid_to_author" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_by_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "rejected_by_id" TEXT,
    "rejected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_import_batches" (
    "id" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "source" "BankImportSource" NOT NULL,
    "file_name" TEXT,
    "counts" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_bank_accounts_event_id_bank_account_id_key" ON "event_bank_accounts"("event_id", "bank_account_id");

-- CreateIndex
CREATE INDEX "bank_transactions_event_id_booking_date_idx" ON "bank_transactions"("event_id", "booking_date");

-- CreateIndex
CREATE INDEX "bank_transactions_event_id_classification_idx" ON "bank_transactions"("event_id", "classification");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_bank_account_id_external_id_key" ON "bank_transactions"("bank_account_id", "external_id");

-- CreateIndex
CREATE INDEX "bank_matches_bill_id_idx" ON "bank_matches"("bill_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_matches_transaction_id_bill_id_key" ON "bank_matches"("transaction_id", "bill_id");

-- CreateIndex
CREATE INDEX "bank_import_batches_event_id_created_at_idx" ON "bank_import_batches"("event_id", "created_at");

-- AddForeignKey
ALTER TABLE "event_bank_accounts" ADD CONSTRAINT "event_bank_accounts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_bank_accounts" ADD CONSTRAINT "event_bank_accounts_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "bank_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_matches" ADD CONSTRAINT "bank_matches_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "bank_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_matches" ADD CONSTRAINT "bank_matches_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_import_batches" ADD CONSTRAINT "bank_import_batches_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_import_batches" ADD CONSTRAINT "bank_import_batches_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

