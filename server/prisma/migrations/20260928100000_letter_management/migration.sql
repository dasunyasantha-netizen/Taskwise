-- AlterTable
ALTER TABLE "Personnel" ADD COLUMN     "isLetterLogger" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LetterThread" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "senderContact" TEXT,
    "externalReference" TEXT,
    "channel" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "assignedTo" TEXT NOT NULL,
    "assignedToName" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstReceivedDate" TEXT NOT NULL,
    "latestReceivedDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LetterThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterEvent" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "correspondent" TEXT,
    "correspondenceDate" TEXT,
    "receivedDate" TEXT,
    "fromAssignee" TEXT,
    "fromAssigneeName" TEXT,
    "toAssignee" TEXT,
    "toAssigneeName" TEXT,
    "previousAssignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LetterEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterAccess" (
    "threadId" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,

    CONSTRAINT "LetterAccess_pkey" PRIMARY KEY ("threadId","actorKey")
);

-- CreateTable
CREATE TABLE "LetterCounter" (
    "workspaceId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LetterCounter_pkey" PRIMARY KEY ("workspaceId","year")
);

-- CreateTable
CREATE TABLE "LetterSettings" (
    "workspaceId" TEXT NOT NULL,
    "folderId" TEXT,
    "clientId" TEXT,
    "encryptedSecret" TEXT,
    "encryptedRefreshToken" TEXT,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "entryDelayDays" INTEGER NOT NULL DEFAULT 2,
    "assigneeDays" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LetterSettings_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "LetterOAuthState" (
    "stateHash" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "directorId" TEXT NOT NULL,
    "configVersion" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LetterOAuthState_pkey" PRIMARY KEY ("stateHash")
);

-- CreateTable
CREATE TABLE "LetterAttachment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "original" BYTEA NOT NULL,
    "driveFileId" TEXT,
    "driveFolderId" TEXT,
    "uploadState" TEXT NOT NULL DEFAULT 'PENDING',
    "uploadError" TEXT,
    "uploadAttempts" INTEGER NOT NULL DEFAULT 0,
    "uploadNextAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadLeaseUntil" TIMESTAMP(3),
    "previewState" TEXT NOT NULL DEFAULT 'PENDING',
    "previewError" TEXT,
    "previewAttempts" INTEGER NOT NULL DEFAULT 0,
    "previewNextAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previewLeaseUntil" TIMESTAMP(3),
    "pageCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LetterAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterPreview" (
    "attachmentId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "LetterPreview_pkey" PRIMARY KEY ("attachmentId","page")
);

-- CreateIndex
CREATE INDEX "LetterThread_workspaceId_status_assignedAt_idx" ON "LetterThread"("workspaceId", "status", "assignedAt");

-- CreateIndex
CREATE INDEX "LetterThread_workspaceId_assignedTo_idx" ON "LetterThread"("workspaceId", "assignedTo");

-- CreateIndex
CREATE UNIQUE INDEX "LetterThread_workspaceId_reference_key" ON "LetterThread"("workspaceId", "reference");

-- CreateIndex
CREATE INDEX "LetterEvent_threadId_createdAt_idx" ON "LetterEvent"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LetterEvent_workspaceId_requestId_key" ON "LetterEvent"("workspaceId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "LetterEvent_threadId_sequence_key" ON "LetterEvent"("threadId", "sequence");

-- CreateIndex
CREATE INDEX "LetterAttachment_uploadState_uploadNextAt_idx" ON "LetterAttachment"("uploadState", "uploadNextAt");

-- CreateIndex
CREATE INDEX "LetterAttachment_previewState_previewNextAt_idx" ON "LetterAttachment"("previewState", "previewNextAt");

-- AddForeignKey
ALTER TABLE "LetterThread" ADD CONSTRAINT "LetterThread_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterEvent" ADD CONSTRAINT "LetterEvent_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "LetterThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterAccess" ADD CONSTRAINT "LetterAccess_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "LetterThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterAttachment" ADD CONSTRAINT "LetterAttachment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "LetterEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterPreview" ADD CONSTRAINT "LetterPreview_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "LetterAttachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
