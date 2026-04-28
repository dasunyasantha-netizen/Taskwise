-- AlterTable
ALTER TABLE "Personnel" ADD COLUMN     "supervisorId" TEXT;

-- CreateIndex
CREATE INDEX "Personnel_supervisorId_idx" ON "Personnel"("supervisorId");

-- AddForeignKey
ALTER TABLE "Personnel" ADD CONSTRAINT "Personnel_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Personnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
