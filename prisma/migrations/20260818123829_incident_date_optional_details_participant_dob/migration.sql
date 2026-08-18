-- AlterTable
ALTER TABLE "incident_updates" ADD COLUMN     "incident_date" DATE,
ADD COLUMN     "incident_time" TEXT,
ALTER COLUMN "details" DROP NOT NULL;

-- incident_updates has no rows yet, but keep the shape consistent with the
-- backfill below in case this ever runs against non-empty data.
UPDATE "incident_updates" SET "incident_date" = "updated_at"::date WHERE "incident_date" IS NULL;
ALTER TABLE "incident_updates" ALTER COLUMN "incident_date" SET NOT NULL;

-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "incident_date" DATE,
ADD COLUMN     "incident_time" TEXT,
ALTER COLUMN "details" DROP NOT NULL;

-- Backfill existing incidents with the date they were actually created on,
-- not "today" (the day this migration happens to run).
UPDATE "incidents" SET "incident_date" = "created_at"::date WHERE "incident_date" IS NULL;
ALTER TABLE "incidents" ALTER COLUMN "incident_date" SET NOT NULL;
ALTER TABLE "incidents" ALTER COLUMN "incident_date" SET DEFAULT CURRENT_DATE;

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "date_of_birth" DATE;
