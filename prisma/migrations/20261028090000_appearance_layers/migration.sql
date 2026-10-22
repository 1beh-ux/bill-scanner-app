-- Appearance layers: the organization's columns = the parent portal; embed / standalone registration
-- layers on top, plus a layer per event (src/lib/public-appearance.ts pageAppearance).
ALTER TABLE "organizations" ADD COLUMN "appearance_embed" JSONB;
ALTER TABLE "organizations" ADD COLUMN "appearance_registration" JSONB;
ALTER TABLE "events" ADD COLUMN "appearance" JSONB;

-- "No background" and the width were set for embedding: they move to the embed layer, and the
-- portal gets its own look back (with a background, the default width).
UPDATE "organizations"
SET "appearance_embed" = jsonb_build_object('publicTransparent', "public_transparent", 'publicContentWidth', "public_content_width"),
    "public_transparent" = false,
    "public_content_width" = NULL
WHERE "public_transparent" = true OR "public_content_width" IS NOT NULL;
