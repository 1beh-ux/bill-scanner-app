-- Fields Manager (2026-11-24): answers to an event's own fields on the ticket form (additive, nullable).
ALTER TABLE "ticket_orders" ADD COLUMN "field_values" JSONB;
