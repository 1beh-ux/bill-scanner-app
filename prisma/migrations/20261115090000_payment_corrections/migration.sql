-- CreateTable
CREATE TABLE "payment_corrections" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "personal_bill_id" TEXT,
    "title" TEXT NOT NULL,
    "amount_czk" DECIMAL(12,2) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "note" TEXT NOT NULL,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_corrections_event_id_idx" ON "payment_corrections"("event_id");

-- AddForeignKey
ALTER TABLE "payment_corrections" ADD CONSTRAINT "payment_corrections_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

