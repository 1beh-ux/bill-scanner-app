-- Parents' order of profile fields; who an event's public form registers.
ALTER TABLE "participant_field_templates" ADD COLUMN "portal_sort_order" INTEGER;
ALTER TABLE "events" ADD COLUMN "public_audience" TEXT;
