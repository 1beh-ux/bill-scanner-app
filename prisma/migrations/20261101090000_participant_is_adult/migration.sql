-- Child / adult as registered, for participants not linked to a person (public form of an "existing people only" event).
ALTER TABLE "participants" ADD COLUMN "is_adult" BOOLEAN;
