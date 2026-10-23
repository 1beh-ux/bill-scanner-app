-- Two-step registration: details after acceptance; the participant's own page.
ALTER TABLE "events" ADD COLUMN "details_after_acceptance" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "participants" ADD COLUMN "details_token" TEXT;
CREATE UNIQUE INDEX "participants_details_token_key" ON "participants"("details_token");
