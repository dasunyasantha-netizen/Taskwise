ALTER TABLE "ImpersonationSession"
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "reason" TEXT;

UPDATE "ImpersonationSession"
SET "expiresAt" = "startedAt" + INTERVAL '15 minutes'
WHERE "expiresAt" IS NULL;
