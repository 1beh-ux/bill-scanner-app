-- Public page without the heading (event setting).
ALTER TABLE "events" ADD COLUMN "public_hide_header" BOOLEAN NOT NULL DEFAULT false;
