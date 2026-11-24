-- Pole -> Formulář (2026-11-24): per-event question settings of a field (additive, nullable; null = today's rules).
ALTER TABLE "event_participant_fields" ADD COLUMN "form_config" JSONB;
