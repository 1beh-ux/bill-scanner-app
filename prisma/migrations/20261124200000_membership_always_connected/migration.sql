-- A membership year is always connected to Lidé and creates people (the settings are hidden for it).
UPDATE "events" SET "registration_connected" = true, "people_link_mode" = 'all' WHERE "kind" = 'membership' AND ("registration_connected" = false OR "people_link_mode" <> 'all');
