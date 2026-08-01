ALTER TABLE "Director"
DROP COLUMN "impersonationPasswordHash";

ALTER TABLE "ImpersonationSession"
RENAME COLUMN "chairmanId" TO "adminId";

ALTER INDEX "ImpersonationSession_chairmanId_idx"
RENAME TO "ImpersonationSession_adminId_idx";
