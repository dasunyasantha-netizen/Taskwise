CREATE TABLE "MigrationRoleContact" (
  "id" TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "companyId" TEXT,
  "country" TEXT NOT NULL,
  "phoneE164" TEXT NOT NULL,
  "email" TEXT,
  "syswiseUserId" INTEGER,
  "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "syncedAt" TIMESTAMP(3),
  "legacyAccessRevokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MigrationRoleContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MigrationRoleContact_actorType_actorId_key" ON "MigrationRoleContact"("actorType", "actorId");
CREATE INDEX "MigrationRoleContact_syncStatus_updatedAt_idx" ON "MigrationRoleContact"("syncStatus", "updatedAt");
CREATE INDEX "MigrationRoleContact_phoneE164_idx" ON "MigrationRoleContact"("phoneE164");
CREATE INDEX "MigrationRoleContact_email_idx" ON "MigrationRoleContact"("email");
