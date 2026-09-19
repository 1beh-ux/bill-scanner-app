-- CreateTable
CREATE TABLE "drive_accounts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "refresh_token_encrypted" TEXT NOT NULL,
    "scope" TEXT,
    "connected_by_user_id" TEXT NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drive_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drive_accounts_email_key" ON "drive_accounts"("email");

-- AddForeignKey
ALTER TABLE "drive_accounts" ADD CONSTRAINT "drive_accounts_connected_by_user_id_fkey" FOREIGN KEY ("connected_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
