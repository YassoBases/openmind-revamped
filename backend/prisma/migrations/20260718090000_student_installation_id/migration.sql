-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "installationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Student_installationId_key" ON "Student"("installationId");

