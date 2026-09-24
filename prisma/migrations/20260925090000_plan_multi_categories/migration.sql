-- Planning: one main + one secondary category per block/activity becomes a
-- list of categories with optional minutes ([{categoryId, minutes}]).
-- Existing assignments are carried over (minutes null = whole duration) before
-- the old columns go.

ALTER TABLE "plan_blocks" ADD COLUMN "categories" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "plan_activities" ADD COLUMN "categories" JSONB NOT NULL DEFAULT '[]';

UPDATE "plan_blocks" SET "categories" = COALESCE((
  SELECT jsonb_agg(jsonb_build_object('categoryId', c, 'minutes', NULL) ORDER BY ord)
  FROM unnest(ARRAY["primary_category_id", "secondary_category_id"]) WITH ORDINALITY AS t(c, ord)
  WHERE c IS NOT NULL
), '[]'::jsonb);

UPDATE "plan_activities" SET "categories" = COALESCE((
  SELECT jsonb_agg(jsonb_build_object('categoryId', c, 'minutes', NULL) ORDER BY ord)
  FROM unnest(ARRAY["primary_category_id", "secondary_category_id"]) WITH ORDINALITY AS t(c, ord)
  WHERE c IS NOT NULL
), '[]'::jsonb);

ALTER TABLE "plan_blocks" DROP CONSTRAINT "plan_blocks_primary_category_id_fkey";
ALTER TABLE "plan_blocks" DROP CONSTRAINT "plan_blocks_secondary_category_id_fkey";
ALTER TABLE "plan_activities" DROP CONSTRAINT "plan_activities_primary_category_id_fkey";
ALTER TABLE "plan_activities" DROP CONSTRAINT "plan_activities_secondary_category_id_fkey";

ALTER TABLE "plan_blocks" DROP COLUMN "primary_category_id", DROP COLUMN "secondary_category_id";
ALTER TABLE "plan_activities" DROP COLUMN "primary_category_id", DROP COLUMN "secondary_category_id";
