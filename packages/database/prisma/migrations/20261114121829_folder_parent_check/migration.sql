-- Prisma's schema language cannot express CHECK constraints, so this one is
-- written by hand. A folder can never be its own parent.
ALTER TABLE "folders"
  ADD CONSTRAINT "folders_not_own_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
