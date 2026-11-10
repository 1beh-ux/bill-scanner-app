-- "Lidé na akci" parts as module switches (additive; values used by the next migration).
ALTER TYPE "ModuleKey" ADD VALUE IF NOT EXISTS 'adults';
ALTER TYPE "ModuleKey" ADD VALUE IF NOT EXISTS 'registration';
ALTER TYPE "ModuleKey" ADD VALUE IF NOT EXISTS 'portal';
