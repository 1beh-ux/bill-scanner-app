-- Účastníci becomes its own module: on wherever Zdraví or Pošta is on, and granted to whoever had either,
-- so nothing changes for existing events and people.
INSERT INTO "event_modules" ("event_id", "module_key", "enabled")
SELECT DISTINCT "event_id", 'participants'::"ModuleKey", true FROM "event_modules"
WHERE "module_key" IN ('health', 'mail') AND "enabled"
ON CONFLICT ("event_id", "module_key") DO UPDATE SET "enabled" = true;

INSERT INTO "user_event_module_access" ("user_id", "event_id", "module_key")
SELECT DISTINCT "user_id", "event_id", 'participants'::"ModuleKey" FROM "user_event_module_access"
WHERE "module_key" IN ('health', 'mail')
ON CONFLICT DO NOTHING;
