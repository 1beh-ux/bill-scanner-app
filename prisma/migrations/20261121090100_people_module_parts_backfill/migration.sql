-- Existing events keep everything they use (nothing disappears): each part is switched on where the
-- event already uses it. Public events (ticket sales) have no people parts.
INSERT INTO "modules" ("key", "name") VALUES ('adults', 'Dospělí na akci'), ('registration', 'Přihláška'), ('portal', 'Rodičovský portál') ON CONFLICT ("key") DO NOTHING;

-- Přihláška: a public form, a connected registration, prices, payment check, a reply deadline, or a membership year.
INSERT INTO "event_modules" ("event_id", "module_key", "enabled")
SELECT e."id", 'registration'::"ModuleKey", true FROM "events" e
WHERE e."kind" <> 'public_event' AND (
  e."public_registration" OR e."registration_connected" OR e."bank_check_enabled" OR e."kind" = 'membership'
  OR e."registration_deadline" IS NOT NULL OR e."member_price_czk" IS NOT NULL OR e."non_member_price_czk" IS NOT NULL OR e."price_rules" IS NOT NULL)
ON CONFLICT ("event_id", "module_key") DO UPDATE SET "enabled" = true;

-- Rodičovský portál: open in the portal, eligibility or portal info set, or a membership year.
INSERT INTO "event_modules" ("event_id", "module_key", "enabled")
SELECT e."id", 'portal'::"ModuleKey", true FROM "events" e
WHERE e."kind" <> 'public_event' AND (e."portal_open" OR e."eligibility" IS NOT NULL OR e."portal_info" IS NOT NULL OR e."kind" = 'membership')
ON CONFLICT ("event_id", "module_key") DO UPDATE SET "enabled" = true;

-- Dospělí: adults already assigned, or Kuchyně / Účastníci on. A bills-only event without adults loses the
-- menu item on purpose (that is the point of the switch); Kuchyně turns Dospělí on by itself anyway.
INSERT INTO "event_modules" ("event_id", "module_key", "enabled")
SELECT e."id", 'adults'::"ModuleKey", true FROM "events" e
WHERE e."kind" <> 'public_event' AND (
  EXISTS (SELECT 1 FROM "event_persons" p WHERE p."event_id" = e."id")
  OR EXISTS (SELECT 1 FROM "event_modules" m WHERE m."event_id" = e."id" AND m."enabled" AND m."module_key" IN ('kitchen', 'participants')))
ON CONFLICT ("event_id", "module_key") DO UPDATE SET "enabled" = true;

-- Děti (participants) under everything that needs them: Zdraví, Pošta, Přihláška, Portál.
INSERT INTO "event_modules" ("event_id", "module_key", "enabled")
SELECT DISTINCT m."event_id", 'participants'::"ModuleKey", true FROM "event_modules" m
JOIN "events" e ON e."id" = m."event_id"
WHERE e."kind" <> 'public_event' AND m."enabled" AND m."module_key" IN ('health', 'mail', 'registration', 'portal')
ON CONFLICT ("event_id", "module_key") DO UPDATE SET "enabled" = true;
