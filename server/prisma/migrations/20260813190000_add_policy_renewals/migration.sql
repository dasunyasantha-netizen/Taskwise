-- A policy can now be renewed into a brand new policy record, including before
-- it expires. The superseded policy is marked RENEWED, a terminal state that the
-- status refresh leaves alone, so past months keep the GWP they were written in.
ALTER TABLE "InsurancePolicy" ADD COLUMN "renewedFromId" TEXT;

CREATE INDEX "InsurancePolicy_renewedFromId_idx" ON "InsurancePolicy"("renewedFromId");

ALTER TABLE "InsurancePolicy"
ADD CONSTRAINT "InsurancePolicy_renewedFromId_fkey"
FOREIGN KEY ("renewedFromId") REFERENCES "InsurancePolicy"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- The monthly summary reads by issue date and cancellation date.
CREATE INDEX "InsurancePolicy_workspaceId_issueDate_idx" ON "InsurancePolicy"("workspaceId", "issueDate");
CREATE INDEX "InsurancePolicy_workspaceId_cancelledAt_idx" ON "InsurancePolicy"("workspaceId", "cancelledAt");
