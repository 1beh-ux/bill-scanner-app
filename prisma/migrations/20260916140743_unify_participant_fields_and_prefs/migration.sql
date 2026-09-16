-- Rename existing ParticipantFieldSurface values, add health_detail
ALTER TYPE "ParticipantFieldSurface" RENAME VALUE 'health' TO 'health_list';
ALTER TYPE "ParticipantFieldSurface" RENAME VALUE 'mail' TO 'mail_list';
ALTER TYPE "ParticipantFieldSurface" ADD VALUE 'health_detail';

-- ParticipantFieldTemplate.defaultSurfaces
ALTER TABLE "participant_field_templates" ADD COLUMN "default_surfaces" "ParticipantFieldSurface"[] NOT NULL DEFAULT '{}';

-- Backfill defaultSurfaces on the five existing templates
UPDATE "participant_field_templates" SET "default_surfaces" = ARRAY['list']::"ParticipantFieldSurface"[]
WHERE "key" IN ('adresa', 'pojistovna', 'pohlavi', 'clenstvi_zare', 'vydani_osoby');

-- Fold the four health-note columns into customFieldValues, same keys as
-- the column names (mirrors the earlier address/insurance/etc. migration)
UPDATE "participants" SET "custom_field_values" = "custom_field_values" || jsonb_strip_nulls(jsonb_build_object(
    'allergies', "allergies",
    'medsNotes', "meds_notes",
    'chronicIssues', "chronic_issues",
    'otherNotes', "other_notes"
));

ALTER TABLE "participants" DROP COLUMN "allergies",
DROP COLUMN "meds_notes",
DROP COLUMN "chronic_issues",
DROP COLUMN "other_notes";

-- Seed the four new org-level field templates, detail-only by default
-- (preserves exactly today's visibility -- Health detail page only)
INSERT INTO "participant_field_templates" ("key", "label", "field_type", "default_surfaces") VALUES
('allergies', 'Alergie', 'text', ARRAY['health_detail']::"ParticipantFieldSurface"[]),
('medsNotes', 'Léky', 'text', ARRAY['health_detail']::"ParticipantFieldSurface"[]),
('chronicIssues', 'Chronické potíže', 'text', ARRAY['health_detail']::"ParticipantFieldSurface"[]),
('otherNotes', 'Ostatní poznámky', 'text', ARRAY['health_detail']::"ParticipantFieldSurface"[]);

-- Sync them into every event that already has Health enabled (mirrors
-- what the module-enable hook now does going forward)
INSERT INTO "event_participant_fields" ("id", "event_id", "key", "label", "field_type", "surfaces", "is_from_template")
SELECT gen_random_uuid(), em."event_id", t."key", t."label", t."field_type", t."default_surfaces", true
FROM "event_modules" em
CROSS JOIN "participant_field_templates" t
WHERE em."module_key" = 'health' AND em."enabled" = true
  AND t."key" IN ('allergies', 'medsNotes', 'chronicIssues', 'otherNotes');

-- Matching MergeVariable rows (same auto-link every field gets on
-- creation via the API routes; done by hand here since this is a
-- migration, not an API call)
INSERT INTO "merge_variables" ("key", "source_type", "source_field", "label") VALUES
('allergies', 'participant_custom_field', 'allergies', 'Alergie'),
('medsNotes', 'participant_custom_field', 'medsNotes', 'Léky'),
('chronicIssues', 'participant_custom_field', 'chronicIssues', 'Chronické potíže'),
('otherNotes', 'participant_custom_field', 'otherNotes', 'Ostatní poznámky');

-- Per-user preferences
CREATE TYPE "UserLang" AS ENUM ('cs', 'en');
CREATE TYPE "UserTheme" AS ENUM ('light', 'dark');

ALTER TABLE "users" ADD COLUMN "preferred_lang" "UserLang" NOT NULL DEFAULT 'cs',
ADD COLUMN "preferred_theme" "UserTheme" NOT NULL DEFAULT 'light',
ADD COLUMN "landing_path" TEXT;
