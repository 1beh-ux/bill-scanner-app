-- DropIndex
DROP INDEX "personal_bill_shares_personal_bill_id_author_id_key";

-- CreateIndex
CREATE INDEX "personal_bill_shares_personal_bill_id_idx" ON "personal_bill_shares"("personal_bill_id");

