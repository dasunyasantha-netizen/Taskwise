-- AlterTable
ALTER TABLE "ProjectCategory" ADD COLUMN     "directorId" TEXT;

-- AddForeignKey
ALTER TABLE "ProjectCategory" ADD CONSTRAINT "ProjectCategory_directorId_fkey" FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE SET NULL ON UPDATE CASCADE;
