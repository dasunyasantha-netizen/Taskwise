-- Extra named holders for the shared Chairman role.
ALTER TABLE "MigrationRoleContact" ADD COLUMN "holderKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MigrationRoleContact" ADD COLUMN "holderName" TEXT;
DROP INDEX "MigrationRoleContact_actorType_actorId_key";
CREATE UNIQUE INDEX "MigrationRoleContact_actorType_actorId_holderKey_key" ON "MigrationRoleContact"("actorType", "actorId", "holderKey");

ALTER TABLE "AuditLog" ADD COLUMN "actorHolderName" TEXT;
