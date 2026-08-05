/*
  Warnings:

  - A unique constraint covering the columns `[event_id,content_hash]` on the table `bills` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "bills_event_id_content_hash_key" ON "bills"("event_id", "content_hash");
