-- Adults from outside the organization (2026-10-29).
ALTER TABLE "children" ADD COLUMN "external" BOOLEAN NOT NULL DEFAULT false;

-- An adult's days at the event: a set of days (any intervals) instead of one from–to range.
ALTER TABLE "event_persons" ADD COLUMN "days" TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE "event_persons" ep
SET "days" = ARRAY(
  SELECT to_char(d, 'YYYY-MM-DD')
  FROM generate_series(GREATEST(COALESCE(ep."from_date", e."start_date"), e."start_date"), LEAST(COALESCE(ep."to_date", e."end_date"), e."end_date"), interval '1 day') d
)
FROM "events" e
WHERE e."id" = ep."event_id" AND (ep."from_date" IS NOT NULL OR ep."to_date" IS NOT NULL);
ALTER TABLE "event_persons" DROP COLUMN "from_date", DROP COLUMN "to_date";

-- Ingredients: "vždy v kuchyni" and another unit to count in.
ALTER TABLE "ingredients" ADD COLUMN "alt_unit_name" TEXT,
ADD COLUMN "alt_unit_qty" DECIMAL(12,3),
ADD COLUMN "pantry" BOOLEAN NOT NULL DEFAULT false;
