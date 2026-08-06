CREATE TABLE "ScoringRuleVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "changedByDirectorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScoringRuleVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskCancellationReview" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "penaltyPoints" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "decidedByDirectorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaskCancellationReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskCancellationPenaltyRecipient" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskCancellationPenaltyRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScoringRuleVersion_workspaceId_eventType_effectiveAt_key"
  ON "ScoringRuleVersion"("workspaceId", "eventType", "effectiveAt");
CREATE INDEX "ScoringRuleVersion_workspaceId_eventType_effectiveAt_idx"
  ON "ScoringRuleVersion"("workspaceId", "eventType", "effectiveAt");
CREATE UNIQUE INDEX "TaskCancellationReview_taskId_key" ON "TaskCancellationReview"("taskId");
CREATE INDEX "TaskCancellationReview_workspaceId_status_createdAt_idx"
  ON "TaskCancellationReview"("workspaceId", "status", "createdAt");
CREATE UNIQUE INDEX "TaskCancellationPenaltyRecipient_reviewId_personnelId_key"
  ON "TaskCancellationPenaltyRecipient"("reviewId", "personnelId");
CREATE INDEX "TaskCancellationPenaltyRecipient_personnelId_idx"
  ON "TaskCancellationPenaltyRecipient"("personnelId");

ALTER TABLE "ScoringRuleVersion" ADD CONSTRAINT "ScoringRuleVersion_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScoringRuleVersion" ADD CONSTRAINT "ScoringRuleVersion_changedByDirectorId_fkey"
  FOREIGN KEY ("changedByDirectorId") REFERENCES "Director"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskCancellationReview" ADD CONSTRAINT "TaskCancellationReview_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskCancellationReview" ADD CONSTRAINT "TaskCancellationReview_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskCancellationReview" ADD CONSTRAINT "TaskCancellationReview_decidedByDirectorId_fkey"
  FOREIGN KEY ("decidedByDirectorId") REFERENCES "Director"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskCancellationPenaltyRecipient" ADD CONSTRAINT "TaskCancellationPenaltyRecipient_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "TaskCancellationReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskCancellationPenaltyRecipient" ADD CONSTRAINT "TaskCancellationPenaltyRecipient_personnelId_fkey"
  FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing cancelled tasks also require an explicit decision.
INSERT INTO "TaskCancellationReview" (
  "id", "workspaceId", "taskId", "status", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::text, t."workspaceId", t."id", 'PENDING',
       COALESCE(t."cancelledAt", t."updatedAt"), CURRENT_TIMESTAMP
FROM "Task" t
WHERE t."status" = 'CANCELLED' AND t."deletedAt" IS NULL
ON CONFLICT ("taskId") DO NOTHING;

-- Snapshot the responsible individual. Prefer the person who acted on the task;
-- otherwise use its directly assigned personnel.
INSERT INTO "TaskCancellationPenaltyRecipient" ("id", "reviewId", "personnelId")
SELECT gen_random_uuid()::text, recipients."reviewId", recipients."personnelId"
FROM (
  SELECT r."id" AS "reviewId", t."actedById" AS "personnelId"
  FROM "TaskCancellationReview" r
  JOIN "Task" t ON t."id" = r."taskId"
  WHERE t."actedByType" = 'personnel' AND t."actedById" IS NOT NULL
  UNION
  SELECT r."id" AS "reviewId", a."personnelId"
  FROM "TaskCancellationReview" r
  JOIN "Task" t ON t."id" = r."taskId"
  JOIN "TaskAssignment" a ON a."taskId" = t."id" AND a."personnelId" IS NOT NULL
  WHERE NOT (t."actedByType" = 'personnel' AND t."actedById" IS NOT NULL)
) recipients
ON CONFLICT ("reviewId", "personnelId") DO NOTHING;
