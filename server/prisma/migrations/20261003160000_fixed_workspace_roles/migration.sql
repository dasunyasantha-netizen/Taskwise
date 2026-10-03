ALTER TABLE "Workspace" ADD COLUMN "roleBasedIdentity" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "WorkspaceRole" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "personnelId" TEXT,
  "directorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceRole_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceRole_actor_required" CHECK ("personnelId" IS NOT NULL OR "directorId" IS NOT NULL),
  CONSTRAINT "WorkspaceRole_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceRole_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceRole_directorId_fkey" FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkspaceRole_personnelId_key" ON "WorkspaceRole"("personnelId");
CREATE UNIQUE INDEX "WorkspaceRole_directorId_key" ON "WorkspaceRole"("directorId");
CREATE INDEX "WorkspaceRole_workspaceId_idx" ON "WorkspaceRole"("workspaceId");
