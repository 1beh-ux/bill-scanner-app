-- CreateEnum
CREATE TYPE "ParticipantFieldKind" AS ENUM ('custom', 'builtin', 'guardian', 'computed');

-- CreateEnum
CREATE TYPE "ComputedFieldType" AS ENUM ('effective_price', 'variable_symbol', 'payment_qr_image');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ParticipantFieldSurface" ADD VALUE 'documents';
ALTER TYPE "ParticipantFieldSurface" ADD VALUE 'import';

-- AlterEnum
ALTER TYPE "ParticipantFieldType" ADD VALUE 'image';

-- AlterTable
ALTER TABLE "event_participant_fields" ADD COLUMN     "computed_type" "ComputedFieldType",
ADD COLUMN     "kind" "ParticipantFieldKind" NOT NULL DEFAULT 'custom';

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "participants_list_columns" JSONB,
ADD COLUMN     "vs_event_type" INTEGER,
ADD COLUMN     "vs_membership_field_key" TEXT,
ADD COLUMN     "vs_order_in_year" INTEGER;

-- AlterTable
ALTER TABLE "participant_field_templates" ALTER COLUMN "default_surfaces" DROP DEFAULT;

-- DropTable
DROP TABLE "merge_variables";

-- DropEnum
DROP TYPE "MergeVariableSourceType";
