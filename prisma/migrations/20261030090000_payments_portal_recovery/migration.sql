-- Payment check interval + public contact per event; portal link recovery and "join" button per organization.
ALTER TABLE "events" ADD COLUMN "bank_check_interval_min" INTEGER;
ALTER TABLE "events" ADD COLUMN "public_contact_email" TEXT;
ALTER TABLE "organizations" ADD COLUMN "portal_recovery_sender_email" TEXT;
ALTER TABLE "organizations" ADD COLUMN "portal_recovery_new_link" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD COLUMN "portal_join_event_id" TEXT;
ALTER TABLE "organizations" ADD COLUMN "portal_join_url" TEXT;

-- A portal link sent on the parent's own request has no sending admin.
ALTER TABLE "child_email_log" ALTER COLUMN "sent_by_user_id" DROP NOT NULL;
