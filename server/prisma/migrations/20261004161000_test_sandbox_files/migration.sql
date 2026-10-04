CREATE TABLE "TestSandboxFile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "bytes" BYTEA NOT NULL
);
CREATE INDEX "TestSandboxFile_workspaceId_idx" ON "TestSandboxFile"("workspaceId");
