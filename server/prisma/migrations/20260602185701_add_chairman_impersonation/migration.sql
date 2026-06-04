-- AlterTable
ALTER TABLE "Director" ADD COLUMN     "impersonationPasswordHash" TEXT,
ADD COLUMN     "isChairman" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ImpersonationSession" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "targetActorId" TEXT NOT NULL,
    "targetActorType" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "ImpersonationSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImpersonationSession_chairmanId_idx" ON "ImpersonationSession"("chairmanId");

-- CreateIndex
CREATE INDEX "ImpersonationSession_workspaceId_startedAt_idx" ON "ImpersonationSession"("workspaceId", "startedAt");

-- AddForeignKey
ALTER TABLE "ImpersonationSession" ADD CONSTRAINT "ImpersonationSession_chairmanId_fkey" FOREIGN KEY ("chairmanId") REFERENCES "Director"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
