-- Optional director-applied point penalty recorded on a deadline extension.
ALTER TABLE "DeadlineExtension" ADD COLUMN "pointsDeducted" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeadlineExtension" ADD COLUMN "penalizedPersonnelId" TEXT;

CREATE INDEX "DeadlineExtension_workspaceId_penalizedPersonnelId_idx"
  ON "DeadlineExtension" ("workspaceId", "penalizedPersonnelId");
