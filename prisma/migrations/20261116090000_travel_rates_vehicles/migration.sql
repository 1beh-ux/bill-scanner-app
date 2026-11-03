-- CreateEnum
CREATE TYPE "VehicleGearbox" AS ENUM ('manual', 'automatic');

-- CreateEnum
CREATE TYPE "VehicleFuel" AS ENUM ('diesel', 'petrol95', 'petrol98', 'electric');

-- AlterTable
ALTER TABLE "authors" ADD COLUMN     "address" TEXT,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "ico" TEXT;

-- CreateTable
CREATE TABLE "travel_rate_sets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "valid_from" DATE NOT NULL,
    "base_per_km" DECIMAL(8,2) NOT NULL,
    "trailer_surcharge_pct" DECIMAL(5,2) NOT NULL,
    "diesel_price" DECIMAL(8,2) NOT NULL,
    "petrol95_price" DECIMAL(8,2) NOT NULL,
    "petrol98_price" DECIMAL(8,2) NOT NULL,
    "electricity_price" DECIMAL(8,2) NOT NULL,
    "consumption_defaults" JSONB NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_rate_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "cylinder_cc" INTEGER,
    "plate" TEXT,
    "gearbox" "VehicleGearbox" NOT NULL,
    "fuel" "VehicleFuel" NOT NULL,
    "tp_consumption_1" DECIMAL(5,2),
    "tp_consumption_2" DECIMAL(5,2),
    "tp_consumption_3" DECIMAL(5,2),
    "tp_consumption_4" DECIMAL(5,2),
    "owner_child_id" TEXT,
    "owner_author_id" TEXT,
    "owner_name" TEXT,
    "created_by_user_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "travel_rate_sets_organization_id_valid_from_key" ON "travel_rate_sets"("organization_id", "valid_from");

-- CreateIndex
CREATE INDEX "vehicles_organization_id_idx" ON "vehicles"("organization_id");

-- AddForeignKey
ALTER TABLE "travel_rate_sets" ADD CONSTRAINT "travel_rate_sets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_child_id_fkey" FOREIGN KEY ("owner_child_id") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_author_id_fkey" FOREIGN KEY ("owner_author_id") REFERENCES "authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

