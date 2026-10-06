-- CreateEnum
CREATE TYPE "PeopleLinkMode" AS ENUM ('all', 'existing');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "people_link_mode" "PeopleLinkMode" NOT NULL DEFAULT 'all';

