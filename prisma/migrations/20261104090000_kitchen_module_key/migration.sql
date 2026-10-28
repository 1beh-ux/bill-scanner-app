-- Kuchyně module key (its own migration: a new enum value can't be used in the transaction that adds it).
ALTER TYPE "ModuleKey" ADD VALUE IF NOT EXISTS 'kitchen';
