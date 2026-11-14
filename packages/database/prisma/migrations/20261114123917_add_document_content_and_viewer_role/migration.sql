-- AlterEnum
ALTER TYPE "workspace_role" ADD VALUE 'VIEWER';

-- CreateTable
CREATE TABLE "document_contents" (
    "document_id" UUID NOT NULL,
    "state" BYTEA NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "document_contents_pkey" PRIMARY KEY ("document_id")
);

-- AddForeignKey
ALTER TABLE "document_contents" ADD CONSTRAINT "document_contents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
