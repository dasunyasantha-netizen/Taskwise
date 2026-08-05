-- Company-scoped feature entitlements. New features are disabled unless a row exists.
CREATE TABLE "CompanyFeature" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyFeature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyFeature_companyId_featureKey_key" ON "CompanyFeature"("companyId", "featureKey");
CREATE INDEX "CompanyFeature_featureKey_enabled_idx" ON "CompanyFeature"("featureKey", "enabled");
ALTER TABLE "CompanyFeature" ADD CONSTRAINT "CompanyFeature_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InsuranceQuotation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "insuranceType" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "sumInsured" DECIMAL(18,2) NOT NULL,
    "premium" DECIMAL(18,2) NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "vehicleNumber" TEXT,
    "vehicleMakeModel" TEXT,
    "fuelType" TEXT,
    "vehicleUsage" TEXT,
    "propertyAddress" TEXT,
    "propertyType" TEXT,
    "propertyUsage" TEXT,
    "riskDescription" TEXT,
    "businessActivity" TEXT,
    "cargoDescription" TEXT,
    "transitFrom" TEXT,
    "transitTo" TEXT,
    "conveyance" TEXT,
    "passportNumber" TEXT,
    "destination" TEXT,
    "travelStartDate" TIMESTAMP(3),
    "travelEndDate" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdByType" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedByType" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "renewedFromId" TEXT,
    CONSTRAINT "InsuranceQuotation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InsuranceQuotation_workspaceId_quotationNumber_key" ON "InsuranceQuotation"("workspaceId", "quotationNumber");
CREATE INDEX "InsuranceQuotation_workspaceId_status_idx" ON "InsuranceQuotation"("workspaceId", "status");
CREATE INDEX "InsuranceQuotation_workspaceId_insuranceType_idx" ON "InsuranceQuotation"("workspaceId", "insuranceType");
CREATE INDEX "InsuranceQuotation_workspaceId_expiresAt_idx" ON "InsuranceQuotation"("workspaceId", "expiresAt");
CREATE INDEX "InsuranceQuotation_renewedFromId_idx" ON "InsuranceQuotation"("renewedFromId");
ALTER TABLE "InsuranceQuotation" ADD CONSTRAINT "InsuranceQuotation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InsuranceQuotation" ADD CONSTRAINT "InsuranceQuotation_renewedFromId_fkey" FOREIGN KEY ("renewedFromId") REFERENCES "InsuranceQuotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "InsurancePolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "insuranceType" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "sumInsured" DECIMAL(18,2) NOT NULL,
    "premium" DECIMAL(18,2) NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paymentAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paymentUpdatedAt" TIMESTAMP(3),
    "notes" TEXT,
    "vehicleNumber" TEXT,
    "vehicleMakeModel" TEXT,
    "fuelType" TEXT,
    "vehicleUsage" TEXT,
    "propertyAddress" TEXT,
    "propertyType" TEXT,
    "propertyUsage" TEXT,
    "riskDescription" TEXT,
    "businessActivity" TEXT,
    "cargoDescription" TEXT,
    "transitFrom" TEXT,
    "transitTo" TEXT,
    "conveyance" TEXT,
    "passportNumber" TEXT,
    "destination" TEXT,
    "travelStartDate" TIMESTAMP(3),
    "travelEndDate" TIMESTAMP(3),
    "sourceQuotationId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByType" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedByType" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InsurancePolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InsurancePolicy_sourceQuotationId_key" ON "InsurancePolicy"("sourceQuotationId");
CREATE UNIQUE INDEX "InsurancePolicy_workspaceId_policyNumber_key" ON "InsurancePolicy"("workspaceId", "policyNumber");
CREATE INDEX "InsurancePolicy_workspaceId_insuranceType_idx" ON "InsurancePolicy"("workspaceId", "insuranceType");
CREATE INDEX "InsurancePolicy_workspaceId_expiryDate_idx" ON "InsurancePolicy"("workspaceId", "expiryDate");
CREATE INDEX "InsurancePolicy_workspaceId_paid_idx" ON "InsurancePolicy"("workspaceId", "paid");
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_sourceQuotationId_fkey" FOREIGN KEY ("sourceQuotationId") REFERENCES "InsuranceQuotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Fairfirst is the only company entitled to this module.
INSERT INTO "CompanyFeature" ("id", "companyId", "featureKey", "enabled", "createdAt", "updatedAt")
SELECT 'fairfirst-insurance-management', c."id", 'insurance_management', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Company" c
WHERE UPPER(c."prefix") = 'FI'
   OR LOWER(c."legalName") LIKE '%fairfirst%'
   OR LOWER(COALESCE(c."displayName", '')) LIKE '%fairfirst%'
ON CONFLICT ("companyId", "featureKey") DO UPDATE SET "enabled" = true, "updatedAt" = CURRENT_TIMESTAMP;
