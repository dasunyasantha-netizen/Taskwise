-- Multi-company onboarding and prefixed login support.

CREATE TABLE "Company" (
  "id" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "displayName" TEXT,
  "registrationNumber" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "allowUnprefixedLogin" BOOLEAN NOT NULL DEFAULT false,
  "workspaceId" TEXT,
  "createdFromRequestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyRequest" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "legalName" TEXT NOT NULL,
  "displayName" TEXT,
  "registrationNumber" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "industry" TEXT NOT NULL,
  "website" TEXT,
  "expectedUsers" INTEGER,
  "reason" TEXT NOT NULL,
  "supportingDocumentName" TEXT,
  "supportingDocumentMime" TEXT,
  "supportingDocumentData" TEXT,
  "applicantFirstName" TEXT NOT NULL,
  "applicantMiddleName" TEXT,
  "applicantLastName" TEXT NOT NULL,
  "applicantName" TEXT NOT NULL,
  "applicantPhone" TEXT NOT NULL,
  "applicantNormalizedPhone" TEXT NOT NULL,
  "applicantEmail" TEXT NOT NULL,
  "applicantPasswordHash" TEXT NOT NULL,
  "suggestedPrefix" TEXT NOT NULL,
  "finalPrefix" TEXT,
  "publicStatusTokenHash" TEXT NOT NULL,
  "moreInfoInstructions" TEXT,
  "rejectionReason" TEXT,
  "internalNote" TEXT,
  "approvedByDirectorId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "companyId" TEXT,
  "administratorDirectorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyRequestAction" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "actorDirectorId" TEXT,
  "action" TEXT NOT NULL,
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyRequestAction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Director"
  ADD COLUMN "normalizedPhone" TEXT,
  ADD COLUMN "loginId" TEXT,
  ADD COLUMN "companyId" TEXT,
  ADD COLUMN "isSyswiseAdmin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isCompanyAdmin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Personnel"
  ADD COLUMN "companyId" TEXT,
  ADD COLUMN "normalizedPhone" TEXT,
  ADD COLUMN "loginId" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Workspace" ADD COLUMN "companyId" TEXT;

INSERT INTO "Company" ("id", "legalName", "displayName", "registrationNumber", "prefix", "status", "allowUnprefixedLogin", "workspaceId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, COALESCE(w."companyName", w."name", 'National Youth Services Council'), COALESCE(w."companyName", w."name"),
       'LEGACY-' || w."id", 'YC', 'ACTIVE', true, w."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Workspace" w
WHERE NOT EXISTS (SELECT 1 FROM "Company" c WHERE c."workspaceId" = w."id");

UPDATE "Workspace" w SET "companyId" = c."id"
FROM "Company" c
WHERE c."workspaceId" = w."id" AND w."companyId" IS NULL;

UPDATE "Director" d SET
  "companyId" = w."companyId",
  "loginId" = d."phone",
  "normalizedPhone" = CASE
    WHEN regexp_replace(d."phone", '\D', '', 'g') LIKE '94%' THEN regexp_replace(d."phone", '\D', '', 'g')
    WHEN regexp_replace(d."phone", '\D', '', 'g') LIKE '0%' THEN '94' || substring(regexp_replace(d."phone", '\D', '', 'g') from 2)
    ELSE '94' || regexp_replace(d."phone", '\D', '', 'g')
  END
FROM "Workspace" w
WHERE d."workspaceId" = w."id";

UPDATE "Personnel" p SET
  "companyId" = w."companyId",
  "loginId" = p."phone",
  "normalizedPhone" = CASE
    WHEN regexp_replace(p."phone", '\D', '', 'g') LIKE '94%' THEN regexp_replace(p."phone", '\D', '', 'g')
    WHEN regexp_replace(p."phone", '\D', '', 'g') LIKE '0%' THEN '94' || substring(regexp_replace(p."phone", '\D', '', 'g') from 2)
    ELSE '94' || regexp_replace(p."phone", '\D', '', 'g')
  END
FROM "Workspace" w
WHERE p."workspaceId" = w."id";

UPDATE "Director" SET "isSyswiseAdmin" = true WHERE regexp_replace("phone", '\D', '', 'g') IN ('0760786776', '760786776', '94760786776');

-- Phone is no longer globally unique: the same phone may exist in different
-- companies (distinguished by prefix). Prisma's @unique creates a unique INDEX,
-- not a table CONSTRAINT, so both forms are dropped defensively.
ALTER TABLE "Director" DROP CONSTRAINT IF EXISTS "Director_phone_key";
ALTER TABLE "Personnel" DROP CONSTRAINT IF EXISTS "Personnel_phone_key";
DROP INDEX IF EXISTS "Director_phone_key";
DROP INDEX IF EXISTS "Personnel_phone_key";

CREATE UNIQUE INDEX "Company_registrationNumber_key" ON "Company"("registrationNumber");
CREATE UNIQUE INDEX "Company_prefix_key" ON "Company"("prefix");
CREATE UNIQUE INDEX "Company_workspaceId_key" ON "Company"("workspaceId");
CREATE UNIQUE INDEX "Company_createdFromRequestId_key" ON "Company"("createdFromRequestId");
CREATE INDEX "Company_status_idx" ON "Company"("status");

CREATE UNIQUE INDEX "CompanyRequest_reference_key" ON "CompanyRequest"("reference");
CREATE INDEX "CompanyRequest_status_createdAt_idx" ON "CompanyRequest"("status", "createdAt");
CREATE INDEX "CompanyRequest_registrationNumber_idx" ON "CompanyRequest"("registrationNumber");
CREATE INDEX "CompanyRequest_applicantNormalizedPhone_idx" ON "CompanyRequest"("applicantNormalizedPhone");

CREATE INDEX "CompanyRequestAction_requestId_createdAt_idx" ON "CompanyRequestAction"("requestId", "createdAt");
CREATE INDEX "CompanyRequestAction_actorDirectorId_idx" ON "CompanyRequestAction"("actorDirectorId");

CREATE UNIQUE INDEX "Director_loginId_key" ON "Director"("loginId");
CREATE INDEX "Director_companyId_idx" ON "Director"("companyId");
CREATE INDEX "Director_normalizedPhone_idx" ON "Director"("normalizedPhone");

CREATE UNIQUE INDEX "Personnel_loginId_key" ON "Personnel"("loginId");
CREATE INDEX "Personnel_companyId_idx" ON "Personnel"("companyId");
CREATE INDEX "Personnel_normalizedPhone_idx" ON "Personnel"("normalizedPhone");
CREATE UNIQUE INDEX "Personnel_companyId_normalizedPhone_key" ON "Personnel"("companyId", "normalizedPhone");

CREATE UNIQUE INDEX "Workspace_companyId_key" ON "Workspace"("companyId");

ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Company" ADD CONSTRAINT "Company_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Director" ADD CONSTRAINT "Director_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Personnel" ADD CONSTRAINT "Personnel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyRequest" ADD CONSTRAINT "CompanyRequest_approvedByDirectorId_fkey" FOREIGN KEY ("approvedByDirectorId") REFERENCES "Director"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyRequest" ADD CONSTRAINT "CompanyRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyRequestAction" ADD CONSTRAINT "CompanyRequestAction_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CompanyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyRequestAction" ADD CONSTRAINT "CompanyRequestAction_actorDirectorId_fkey" FOREIGN KEY ("actorDirectorId") REFERENCES "Director"("id") ON DELETE SET NULL ON UPDATE CASCADE;
