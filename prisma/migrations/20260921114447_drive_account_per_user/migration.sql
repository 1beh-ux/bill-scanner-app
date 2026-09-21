-- AlterTable
ALTER TABLE "drive_accounts" ADD COLUMN     "token_invalid_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "drive_configured_by_user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "drive_accounts_connected_by_user_id_key" ON "drive_accounts"("connected_by_user_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_drive_configured_by_user_id_fkey" FOREIGN KEY ("drive_configured_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

