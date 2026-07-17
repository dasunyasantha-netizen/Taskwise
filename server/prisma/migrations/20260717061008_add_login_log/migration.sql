-- CreateTable
CREATE TABLE "LoginLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "loggedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "LoginLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginLog_workspaceId_actorId_loggedInAt_idx" ON "LoginLog"("workspaceId", "actorId", "loggedInAt");

-- CreateIndex
CREATE INDEX "LoginLog_workspaceId_loggedInAt_idx" ON "LoginLog"("workspaceId", "loggedInAt");
