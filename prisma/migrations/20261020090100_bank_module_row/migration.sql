-- The Banka module row (separate migration: a new enum value can't be used in the transaction that adds it).
INSERT INTO "modules" ("key", "name") VALUES ('bank', 'Banka') ON CONFLICT ("key") DO NOTHING;
