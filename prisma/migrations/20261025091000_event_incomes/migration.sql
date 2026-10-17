CREATE TABLE "event_incomes" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "planned_czk" DECIMAL(14,2),
    "actual_czk" DECIMAL(14,2),
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_incomes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "event_incomes_event_id_idx" ON "event_incomes"("event_id");
ALTER TABLE "event_incomes" ADD CONSTRAINT "event_incomes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
