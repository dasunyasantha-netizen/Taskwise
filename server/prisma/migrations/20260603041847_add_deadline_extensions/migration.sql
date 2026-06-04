-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "originalDeadline" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DeadlineExtension" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "oldDeadline" TIMESTAMP(3) NOT NULL,
    "newDeadline" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "extendedById" TEXT NOT NULL,
    "extendedByType" TEXT NOT NULL,
    "extendedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeadlineExtension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeadlineExtension_taskId_idx" ON "DeadlineExtension"("taskId");

-- CreateIndex
CREATE INDEX "DeadlineExtension_workspaceId_idx" ON "DeadlineExtension"("workspaceId");

-- AddForeignKey
ALTER TABLE "DeadlineExtension" ADD CONSTRAINT "DeadlineExtension_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
