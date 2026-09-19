-- AlterTable
ALTER TABLE "users" ADD COLUMN     "hidden_modules" "ModuleKey"[] DEFAULT ARRAY[]::"ModuleKey"[];
