-- Reconcile historical tasks that remained ASSIGNED even though their current
-- directly assigned user posted a progress update after receiving the task.
WITH first_activity AS (
    SELECT DISTINCT ON (t."id")
        t."id" AS "taskId",
        t."workspaceId",
        l."authorPersonnelId" AS "personnelId",
        l."logDate" AS "startedAt"
    FROM "Task" t
    JOIN "TaskProgressLog" l
      ON l."taskId" = t."id"
     AND l."authorPersonnelId" IS NOT NULL
    JOIN "TaskAssignment" a
      ON a."taskId" = t."id"
     AND a."personnelId" = l."authorPersonnelId"
     AND l."logDate" >= a."assignedAt"
    WHERE t."status" = 'ASSIGNED'
      AND t."deletedAt" IS NULL
    ORDER BY t."id", l."logDate" ASC
)
INSERT INTO "AuditLog" (
    "id", "workspaceId", "taskId", "event", "actorPersonnelId", "actorType", "payload", "createdAt"
)
SELECT
    'activity-reconcile-20260806-' || activity."taskId",
    activity."workspaceId",
    activity."taskId",
    'TASK_STARTED',
    activity."personnelId",
    'personnel',
    jsonb_build_object(
        'actedBy', activity."personnelId",
        'trigger', 'existing_progress_update_reconciliation'
    ),
    activity."startedAt"
FROM first_activity activity
ON CONFLICT ("id") DO NOTHING;

WITH first_activity AS (
    SELECT DISTINCT ON (t."id")
        t."id" AS "taskId",
        l."authorPersonnelId" AS "personnelId",
        l."logDate" AS "startedAt"
    FROM "Task" t
    JOIN "TaskProgressLog" l
      ON l."taskId" = t."id"
     AND l."authorPersonnelId" IS NOT NULL
    JOIN "TaskAssignment" a
      ON a."taskId" = t."id"
     AND a."personnelId" = l."authorPersonnelId"
     AND l."logDate" >= a."assignedAt"
    WHERE t."status" = 'ASSIGNED'
      AND t."deletedAt" IS NULL
    ORDER BY t."id", l."logDate" ASC
)
UPDATE "Task" t
SET
    "status" = 'IN_PROGRESS',
    "startedAt" = COALESCE(t."startedAt", activity."startedAt"),
    "actedById" = activity."personnelId",
    "actedByType" = 'personnel',
    "updatedAt" = CURRENT_TIMESTAMP
FROM first_activity activity
WHERE t."id" = activity."taskId";
