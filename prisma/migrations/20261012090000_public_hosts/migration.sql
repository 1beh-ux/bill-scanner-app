-- CreateEnum
CREATE TYPE "PublicHostPurpose" AS ENUM ('registration', 'portal', 'both');

-- CreateTable
CREATE TABLE "public_hosts" (
    "id" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "purpose" "PublicHostPurpose" NOT NULL,
    "event_id" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,

    CONSTRAINT "public_hosts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "public_hosts_hostname_key" ON "public_hosts"("hostname");

-- CreateIndex
CREATE INDEX "public_hosts_event_id_idx" ON "public_hosts"("event_id");

-- AddForeignKey
ALTER TABLE "public_hosts" ADD CONSTRAINT "public_hosts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Only registration hosts may be tied to one event.
ALTER TABLE "public_hosts" ADD CONSTRAINT "public_hosts_event_only_registration" CHECK ("event_id" IS NULL OR "purpose" = 'registration');
