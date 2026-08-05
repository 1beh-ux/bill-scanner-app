-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('active', 'closed');

-- CreateTable
CREATE TABLE "user_event_access" (
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,

    CONSTRAINT "user_event_access_pkey" PRIMARY KEY ("user_id","event_id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'active',
    "drive_ingest_folder_id" TEXT,
    "drive_export_folder_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "category_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_categories" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "budget_amount" DECIMAL(12,2) NOT NULL,
    "is_from_template" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "event_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authors" (
    "id" TEXT NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "bank_account_number" TEXT,
    "bank_code" TEXT,
    "merged_into_author_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author_event_access" (
    "author_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,

    CONSTRAINT "author_event_access_pkey" PRIMARY KEY ("author_id","event_id")
);

-- CreateTable
CREATE TABLE "translations" (
    "key" TEXT NOT NULL,
    "cs" TEXT NOT NULL,
    "en" TEXT NOT NULL,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("key")
);

-- AddForeignKey
ALTER TABLE "user_event_access" ADD CONSTRAINT "user_event_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_event_access" ADD CONSTRAINT "user_event_access_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authors" ADD CONSTRAINT "authors_merged_into_author_id_fkey" FOREIGN KEY ("merged_into_author_id") REFERENCES "authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_event_access" ADD CONSTRAINT "author_event_access_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_event_access" ADD CONSTRAINT "author_event_access_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
