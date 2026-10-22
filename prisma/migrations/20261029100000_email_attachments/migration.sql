-- Documents attached to each participant e-mail of an event (Nastavení akce -> Pošta).
ALTER TABLE "events" ADD COLUMN "email_attachments" JSONB;
