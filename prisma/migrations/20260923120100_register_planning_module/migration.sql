-- Separate migration from the enum change: Postgres won't let a newly added
-- enum value ('planning') be used in the same transaction that added it.
-- Register the `planning` module (off by default for every existing event,
-- same pattern as `health` and `mail`).
INSERT INTO "modules" ("key", "name") VALUES ('planning', 'Plánování');

INSERT INTO "event_modules" ("event_id", "module_key", "enabled")
  SELECT "id", 'planning', false FROM "events";
