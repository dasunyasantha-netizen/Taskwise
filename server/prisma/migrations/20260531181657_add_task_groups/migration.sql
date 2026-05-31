/*
  Warnings:

  - You are about to drop the column `groupId` on the `TaskAssignment` table. All the data in the column will be lost.
  - You are about to drop the `Group` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GroupMember` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Group" DROP CONSTRAINT "Group_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "GroupMember" DROP CONSTRAINT "GroupMember_groupId_fkey";

-- DropForeignKey
ALTER TABLE "GroupMember" DROP CONSTRAINT "GroupMember_personnelId_fkey";

-- DropForeignKey
ALTER TABLE "TaskAssignment" DROP CONSTRAINT "TaskAssignment_groupId_fkey";

-- DropIndex
DROP INDEX "TaskAssignment_groupId_idx";

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "groupTaskId" TEXT;

-- AlterTable
ALTER TABLE "TaskAssignment" DROP COLUMN "groupId";

-- DropTable
DROP TABLE "Group";

-- DropTable
DROP TABLE "GroupMember";

-- CreateTable
CREATE TABLE "TaskGroup" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TaskGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskGroupProject" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskGroupProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskGroup_workspaceId_idx" ON "TaskGroup"("workspaceId");

-- CreateIndex
CREATE INDEX "TaskGroupMember_personnelId_idx" ON "TaskGroupMember"("personnelId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskGroupMember_groupId_personnelId_key" ON "TaskGroupMember"("groupId", "personnelId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskGroupProject_projectId_key" ON "TaskGroupProject"("projectId");

-- CreateIndex
CREATE INDEX "TaskGroupProject_groupId_idx" ON "TaskGroupProject"("groupId");

-- CreateIndex
CREATE INDEX "Task_groupTaskId_idx" ON "Task"("groupTaskId");

-- AddForeignKey
ALTER TABLE "TaskGroupMember" ADD CONSTRAINT "TaskGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TaskGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskGroupMember" ADD CONSTRAINT "TaskGroupMember_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskGroupProject" ADD CONSTRAINT "TaskGroupProject_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TaskGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskGroupProject" ADD CONSTRAINT "TaskGroupProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_groupTaskId_fkey" FOREIGN KEY ("groupTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
