-- Possible duplicate bills: pairs marked as not duplicates. Additive.
-- CreateTable
CREATE TABLE "bill_duplicate_dismissals" (
    "id" TEXT NOT NULL,
    "bill_a_id" TEXT NOT NULL,
    "bill_b_id" TEXT NOT NULL,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_duplicate_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bill_duplicate_dismissals_bill_b_id_idx" ON "bill_duplicate_dismissals"("bill_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "bill_duplicate_dismissals_bill_a_id_bill_b_id_key" ON "bill_duplicate_dismissals"("bill_a_id", "bill_b_id");

-- AddForeignKey
ALTER TABLE "bill_duplicate_dismissals" ADD CONSTRAINT "bill_duplicate_dismissals_bill_a_id_fkey" FOREIGN KEY ("bill_a_id") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_duplicate_dismissals" ADD CONSTRAINT "bill_duplicate_dismissals_bill_b_id_fkey" FOREIGN KEY ("bill_b_id") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

