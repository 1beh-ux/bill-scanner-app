-- CreateEnum
CREATE TYPE "TravelOrderStatus" AS ENUM ('draft', 'submitted');

-- CreateTable
CREATE TABLE "travel_orders" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "bill_id" TEXT,
    "status" "TravelOrderStatus" NOT NULL DEFAULT 'draft',
    "worker_child_id" TEXT,
    "worker_author_id" TEXT,
    "vehicle_id" TEXT,
    "worker_name" TEXT,
    "worker_address" TEXT,
    "worker_phone" TEXT,
    "vehicle_label" TEXT,
    "vehicle_plate" TEXT,
    "cylinder_cc" INTEGER,
    "gearbox" "VehicleGearbox",
    "fuel" "VehicleFuel",
    "tp_values" JSONB,
    "payout_method" TEXT NOT NULL DEFAULT 'bank',
    "payout_name" TEXT,
    "payout_account_number" TEXT,
    "payout_bank_code" TEXT,
    "consumption_used" DECIMAL(6,2),
    "consumption_source" TEXT,
    "fuel_price_used" DECIMAL(8,2),
    "price_from_receipt" BOOLEAN NOT NULL DEFAULT false,
    "receipt_price" DECIMAL(8,2),
    "rate_set_id" TEXT,
    "rate_values" JSONB,
    "purpose" TEXT,
    "origin_place" TEXT,
    "destination_place" TEXT,
    "round_trip" BOOLEAN NOT NULL DEFAULT true,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "approval_date" DATE,
    "approver_name" TEXT,
    "co_travellers" TEXT,
    "free_meals" JSONB,
    "receipt_bill_id" TEXT,
    "total_km" DECIMAL(9,1),
    "total_amount" DECIMAL(12,2),
    "pdf_path" TEXT,
    "submitted_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_legs" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "date" DATE,
    "from_place" TEXT,
    "to_place" TEXT,
    "depart_time" TEXT,
    "arrive_time" TEXT,
    "trailer" BOOLEAN NOT NULL DEFAULT false,
    "km" DECIMAL(8,1),
    "stravne" DECIMAL(10,2),
    "nocleh" DECIMAL(10,2),
    "vedlejsi" DECIMAL(10,2),
    "km_amount" DECIMAL(12,2),
    "amount" DECIMAL(12,2),

    CONSTRAINT "travel_legs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "known_distances" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "from_place" TEXT NOT NULL,
    "to_place" TEXT NOT NULL,
    "km" DECIMAL(8,1) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "known_distances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "travel_orders_bill_id_key" ON "travel_orders"("bill_id");

-- CreateIndex
CREATE INDEX "travel_orders_organization_id_idx" ON "travel_orders"("organization_id");

-- CreateIndex
CREATE INDEX "travel_orders_event_id_idx" ON "travel_orders"("event_id");

-- CreateIndex
CREATE INDEX "travel_legs_order_id_idx" ON "travel_legs"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "known_distances_organization_id_from_place_to_place_key" ON "known_distances"("organization_id", "from_place", "to_place");

-- AddForeignKey
ALTER TABLE "travel_orders" ADD CONSTRAINT "travel_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_orders" ADD CONSTRAINT "travel_orders_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_orders" ADD CONSTRAINT "travel_orders_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_orders" ADD CONSTRAINT "travel_orders_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_legs" ADD CONSTRAINT "travel_legs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "travel_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "known_distances" ADD CONSTRAINT "known_distances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

