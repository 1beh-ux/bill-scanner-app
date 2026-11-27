-- Automation (2026-11-27): condition marks, automatic e-mails, Sheet exports, CC settings. Additive only.
ALTER TABLE "events" ADD COLUMN "cc_rule" JSONB;
ALTER TABLE "events" ADD COLUMN "email_cc" JSONB;

CREATE TABLE "automation_marks" (
    "participant_id" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "reached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "automation_marks_pkey" PRIMARY KEY ("participant_id","condition")
);
CREATE INDEX "automation_marks_event_id_idx" ON "automation_marks"("event_id");

CREATE TABLE "mail_rules" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "purpose_key" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mail_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mail_rules_event_id_idx" ON "mail_rules"("event_id");
ALTER TABLE "mail_rules" ADD CONSTRAINT "mail_rules_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mail_rule_sends" (
    "rule_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mail_rule_sends_pkey" PRIMARY KEY ("rule_id","participant_id")
);
ALTER TABLE "mail_rule_sends" ADD CONSTRAINT "mail_rule_sends_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "mail_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "sheet_exports" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sheet_id" TEXT,
    "columns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "every_hours" INTEGER,
    "daily_at" TEXT,
    "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sheet_exports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sheet_exports_event_id_idx" ON "sheet_exports"("event_id");
ALTER TABLE "sheet_exports" ADD CONSTRAINT "sheet_exports_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
