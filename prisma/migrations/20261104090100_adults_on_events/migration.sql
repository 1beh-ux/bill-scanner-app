-- The Kuchyně module row, adults' food data on Child, and Dospělí na akci (event_persons).
INSERT INTO "modules" ("key", "name") VALUES ('kitchen', 'Kuchyně') ON CONFLICT ("key") DO NOTHING;

ALTER TABLE "children" ADD COLUMN "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "children" ADD COLUMN "diet_flags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "children" ADD COLUMN "diet_note" TEXT;

CREATE TABLE "event_persons" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "child_id" TEXT NOT NULL,
  "label" TEXT,
  "from_date" DATE,
  "to_date" DATE,
  "eats" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_persons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "event_persons_event_id_child_id_key" ON "event_persons"("event_id", "child_id");
CREATE INDEX "event_persons_event_id_idx" ON "event_persons"("event_id");
ALTER TABLE "event_persons" ADD CONSTRAINT "event_persons_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_persons" ADD CONSTRAINT "event_persons_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;
