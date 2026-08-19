-- CreateTable
CREATE TABLE "mail_sender_accounts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "refresh_token_encrypted" TEXT NOT NULL,
    "connected_by_user_id" TEXT NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_sender_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mail_sender_accounts_email_key" ON "mail_sender_accounts"("email");

-- AddForeignKey
ALTER TABLE "mail_sender_accounts" ADD CONSTRAINT "mail_sender_accounts_connected_by_user_id_fkey" FOREIGN KEY ("connected_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
