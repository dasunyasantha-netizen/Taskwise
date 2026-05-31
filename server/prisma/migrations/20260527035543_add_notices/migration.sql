-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'ALL',
    "layerNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoticeDismissal" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoticeDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notice_workspaceId_createdAt_idx" ON "Notice"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NoticeDismissal_noticeId_actorId_actorType_key" ON "NoticeDismissal"("noticeId", "actorId", "actorType");

-- AddForeignKey
ALTER TABLE "NoticeDismissal" ADD CONSTRAINT "NoticeDismissal_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
