-- Embedding + public page appearance (docs/embed-design.md). Additive only.
-- AlterTable
ALTER TABLE "public_hosts" ADD COLUMN     "embed_origins" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "embed_page_url" TEXT;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "public_base_font_size" INTEGER,
ADD COLUMN     "public_font_family" TEXT,
ADD COLUMN     "public_heading_font_family" TEXT,
ADD COLUMN     "public_heading_scale" TEXT,
ADD COLUMN     "public_line_height" TEXT;

