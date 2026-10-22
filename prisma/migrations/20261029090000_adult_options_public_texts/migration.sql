-- A select's own options for adult members, and the organization's / an event's own public texts.
ALTER TABLE "participant_field_templates" ADD COLUMN "adult_options" JSONB;
ALTER TABLE "organizations" ADD COLUMN "public_texts" JSONB;
ALTER TABLE "events" ADD COLUMN "public_texts" JSONB;

-- Pohlaví: adults choose Žena / Muž, children keep Dívka / Chlapec.
UPDATE "participant_field_templates" SET "adult_options" = '["Žena", "Muž"]'::jsonb
WHERE "key" = 'pohlavi' AND "field_type" = 'select' AND "options" = '["Dívka", "Chlapec"]'::jsonb;
-- Events' copies take both lists (their participant pages don't know who is an adult).
UPDATE "event_participant_fields" SET "options" = '["Dívka", "Chlapec", "Žena", "Muž"]'::jsonb
WHERE "key" = 'pohlavi' AND "options" = '["Dívka", "Chlapec"]'::jsonb;
-- Adult members already saved as Dívka / Chlapec -> Žena / Muž.
UPDATE "children" SET "field_values" = jsonb_set("field_values", '{pohlavi}', '"Žena"')
WHERE "is_adult" = true AND "field_values"->>'pohlavi' = 'Dívka';
UPDATE "children" SET "field_values" = jsonb_set("field_values", '{pohlavi}', '"Muž"')
WHERE "is_adult" = true AND "field_values"->>'pohlavi' = 'Chlapec';
