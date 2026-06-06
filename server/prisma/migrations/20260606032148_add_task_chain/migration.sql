-- CreateTable
CREATE TABLE "TaskChain" (
    "id" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "parentTaskId" TEXT NOT NULL,
    "childTaskId" TEXT NOT NULL,
    "chainStepNumber" INTEGER NOT NULL,
    "createdByChairmanId" TEXT NOT NULL,
    "handoverNote" TEXT,
    "allowPreviousAssigneeView" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskChain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskChain_chainId_idx" ON "TaskChain"("chainId");

-- CreateIndex
CREATE INDEX "TaskChain_parentTaskId_idx" ON "TaskChain"("parentTaskId");

-- CreateIndex
CREATE INDEX "TaskChain_childTaskId_idx" ON "TaskChain"("childTaskId");

-- CreateIndex
CREATE INDEX "TaskChain_workspaceId_idx" ON "TaskChain"("workspaceId");

-- AddForeignKey
ALTER TABLE "TaskChain" ADD CONSTRAINT "TaskChain_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskChain" ADD CONSTRAINT "TaskChain_childTaskId_fkey" FOREIGN KEY ("childTaskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
