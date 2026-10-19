
-- CreateEnum
CREATE TYPE "TicketOrderStatus" AS ENUM ('pending', 'paid', 'cancelled');

-- AlterEnum
ALTER TYPE "EventKind" ADD VALUE 'public_event';

-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'tickets';

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "ticket_scan_token" TEXT,
ADD COLUMN     "ticket_settings" JSONB;

-- AlterTable
ALTER TABLE "bank_movements" ADD COLUMN     "ticket_order_id" TEXT;

-- CreateTable
CREATE TABLE "ticket_orders" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "variable_symbol" TEXT NOT NULL,
    "buyer_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "items" JSONB NOT NULL,
    "total_czk" INTEGER NOT NULL,
    "status" "TicketOrderStatus" NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL,
    "public_token" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3),
    "paid_via" TEXT,
    "paid_by_user_id" TEXT,
    "tickets_sent_at" TIMESTAMP(3),
    "send_error" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "price_key" TEXT NOT NULL,
    "price_label" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "used_by" TEXT,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_orders_public_token_key" ON "ticket_orders"("public_token");

-- CreateIndex
CREATE INDEX "ticket_orders_event_id_status_idx" ON "ticket_orders"("event_id", "status");

-- CreateIndex
CREATE INDEX "ticket_orders_variable_symbol_idx" ON "ticket_orders"("variable_symbol");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_orders_event_id_number_key" ON "ticket_orders"("event_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_code_key" ON "tickets"("code");

-- CreateIndex
CREATE INDEX "tickets_event_id_idx" ON "tickets"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "events_ticket_scan_token_key" ON "events"("ticket_scan_token");

-- CreateIndex
CREATE INDEX "bank_movements_ticket_order_id_idx" ON "bank_movements"("ticket_order_id");

-- AddForeignKey
ALTER TABLE "bank_movements" ADD CONSTRAINT "bank_movements_ticket_order_id_fkey" FOREIGN KEY ("ticket_order_id") REFERENCES "ticket_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "ticket_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

