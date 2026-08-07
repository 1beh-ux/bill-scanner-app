-- AlterTable
ALTER TABLE "bills" ADD COLUMN     "export_filename" TEXT,
ADD COLUMN     "exported_at" TIMESTAMP(3);
