CREATE TABLE "TestSandbox" (
  "workspaceId" TEXT NOT NULL PRIMARY KEY,
  "lastResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "enabled" BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE "TestFeedback" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "screen" TEXT NOT NULL,
  "expected" TEXT NOT NULL,
  "actual" TEXT NOT NULL,
  "suggestion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TestFeedback_workspaceId_createdAt_idx" ON "TestFeedback"("workspaceId", "createdAt");
