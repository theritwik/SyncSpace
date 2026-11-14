-- CreateEnum
CREATE TYPE "document_role" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateTable
CREATE TABLE "document_permissions" (
    "document_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "document_role" NOT NULL,
    "granted_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "document_permissions_pkey" PRIMARY KEY ("document_id","user_id")
);

-- CreateIndex
CREATE INDEX "document_permissions_user_id_idx" ON "document_permissions"("user_id");

-- AddForeignKey
ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: the creator of each existing document becomes its owner, as they
-- would have if the document had been created after this migration. Only
-- creators who are still members of the document's workspace are included.
INSERT INTO "document_permissions" ("document_id", "user_id", "role", "granted_by_id", "updated_at")
SELECT d."id", d."created_by_id", 'OWNER', d."created_by_id", CURRENT_TIMESTAMP
FROM "documents" d
JOIN "workspace_members" m
  ON m."workspace_id" = d."workspace_id" AND m."user_id" = d."created_by_id"
WHERE d."created_by_id" IS NOT NULL;
