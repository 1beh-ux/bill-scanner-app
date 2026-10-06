-- CreateTable
CREATE TABLE "person_documents" (
    "id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "doc_key" TEXT NOT NULL,
    "gcs_path" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "original_filename" TEXT,
    "source_participant_document_id" TEXT,
    "source_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_user_id" TEXT,

    CONSTRAINT "person_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "person_documents_child_id_doc_key_idx" ON "person_documents"("child_id", "doc_key");

-- AddForeignKey
ALTER TABLE "person_documents" ADD CONSTRAINT "person_documents_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_documents" ADD CONSTRAINT "person_documents_source_event_id_fkey" FOREIGN KEY ("source_event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_documents" ADD CONSTRAINT "person_documents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_documents" ADD CONSTRAINT "person_documents_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

