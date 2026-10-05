-- CreateEnum
CREATE TYPE "DocReviewStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "payment_doc_type_id" TEXT;

-- AlterTable
ALTER TABLE "participant_documents" ADD COLUMN     "review_note" TEXT,
ADD COLUMN     "review_status" "DocReviewStatus",
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by_user_id" TEXT;

-- AddForeignKey
ALTER TABLE "participant_documents" ADD CONSTRAINT "participant_documents_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

