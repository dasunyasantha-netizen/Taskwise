-- CreateTable
CREATE TABLE "YsoProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YsoProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YsoMeeting" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "invitees" JSONB NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YsoMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YsoSubmission" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "assignedAdId" TEXT NOT NULL,
    "task" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "businessKey" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queuedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "feedback" TEXT,
    "previousId" TEXT,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "YsoSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YsoAttachment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "YsoAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YsoAssessment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "scores" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YsoAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YsoPenaltyDecision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "task" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YsoPenaltyDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YsoScoreEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "task" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL DEFAULT '2026-09-v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YsoScoreEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YsoAuditEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "personnelId" TEXT,
    "actorId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YsoAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "YsoProfile_personnelId_key" ON "YsoProfile"("personnelId");

-- CreateIndex
CREATE INDEX "YsoProfile_workspaceId_idx" ON "YsoProfile"("workspaceId");

-- CreateIndex
CREATE INDEX "YsoMeeting_workspaceId_date_idx" ON "YsoMeeting"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "YsoSubmission_workspaceId_personnelId_period_idx" ON "YsoSubmission"("workspaceId", "personnelId", "period");

-- CreateIndex
CREATE INDEX "YsoSubmission_workspaceId_status_idx" ON "YsoSubmission"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "YsoSubmission_personnelId_businessKey_idx" ON "YsoSubmission"("personnelId", "businessKey");

-- CreateIndex
CREATE UNIQUE INDEX "YsoAttachment_submissionId_key" ON "YsoAttachment"("submissionId");

-- CreateIndex
CREATE INDEX "YsoAssessment_workspaceId_period_idx" ON "YsoAssessment"("workspaceId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "YsoAssessment_personnelId_period_key" ON "YsoAssessment"("personnelId", "period");

-- CreateIndex
CREATE INDEX "YsoPenaltyDecision_workspaceId_period_idx" ON "YsoPenaltyDecision"("workspaceId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "YsoPenaltyDecision_personnelId_key_key" ON "YsoPenaltyDecision"("personnelId", "key");

-- CreateIndex
CREATE INDEX "YsoScoreEntry_workspaceId_personnelId_period_idx" ON "YsoScoreEntry"("workspaceId", "personnelId", "period");

-- CreateIndex
CREATE INDEX "YsoAuditEvent_workspaceId_personnelId_createdAt_idx" ON "YsoAuditEvent"("workspaceId", "personnelId", "createdAt");

-- AddForeignKey
ALTER TABLE "YsoProfile" ADD CONSTRAINT "YsoProfile_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YsoAttachment" ADD CONSTRAINT "YsoAttachment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "YsoSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
