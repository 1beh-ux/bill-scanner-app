-- Léky a výdej settings + "Dotazy na rodiče".
ALTER TABLE "events" ADD COLUMN "meds_page_settings" JSONB;
CREATE TABLE "parent_questions" (
  "id" TEXT NOT NULL,
  "participant_id" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "options" JSONB,
  "answer" TEXT,
  "answered_at" TIMESTAMP(3),
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "parent_questions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "parent_questions_participant_id_idx" ON "parent_questions"("participant_id");
ALTER TABLE "parent_questions" ADD CONSTRAINT "parent_questions_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
