-- Banka: allocation in the transaction's currency (foreign-currency accounts). Additive.
-- AlterTable
ALTER TABLE "bank_matches" ADD COLUMN     "amount_tx" DECIMAL(14,2);

