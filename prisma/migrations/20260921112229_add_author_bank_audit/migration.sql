-- CreateEnum
CREATE TYPE "AuthorBankAuditSource" AS ENUM ('event_edit', 'admin_edit', 'merge', 'create', 'import');

-- CreateTable
CREATE TABLE "author_bank_audit" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "changed_by_user_id" TEXT NOT NULL,
    "event_id" TEXT,
    "old_bank_account_number" TEXT,
    "old_bank_code" TEXT,
    "new_bank_account_number" TEXT,
    "new_bank_code" TEXT,
    "source" "AuthorBankAuditSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "author_bank_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "author_bank_audit_author_id_created_at_idx" ON "author_bank_audit"("author_id", "created_at");

-- AddForeignKey
ALTER TABLE "author_bank_audit" ADD CONSTRAINT "author_bank_audit_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_bank_audit" ADD CONSTRAINT "author_bank_audit_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_bank_audit" ADD CONSTRAINT "author_bank_audit_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

