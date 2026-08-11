ALTER TABLE "InsuranceQuotation" ADD COLUMN "sequenceNumber" SERIAL NOT NULL;
CREATE UNIQUE INDEX "InsuranceQuotation_sequenceNumber_key" ON "InsuranceQuotation"("sequenceNumber");

-- Existing insurance records receive the same automatic format as new records.
UPDATE "InsuranceQuotation" SET "quotationNumber" = 'MIG-Q-' || "id";
UPDATE "InsuranceQuotation"
SET "quotationNumber" = 'Q-' || LPAD("sequenceNumber"::TEXT, 6, '0');

ALTER TABLE "InsurancePolicy"
ADD COLUMN "sequenceNumber" SERIAL NOT NULL,
ADD COLUMN "salesCode" TEXT,
ADD COLUMN "businessType" TEXT,
ADD COLUMN "gwp" DECIMAL(18,2) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "InsurancePolicy_sequenceNumber_key" ON "InsurancePolicy"("sequenceNumber");

UPDATE "InsurancePolicy" SET "policyNumber" = 'MIG-P-' || "id";
UPDATE "InsurancePolicy"
SET "policyNumber" = 'P-' || LPAD("sequenceNumber"::TEXT, 6, '0');

ALTER TABLE "InsurancePolicy" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

UPDATE "InsurancePolicy"
SET "status" = CASE
  WHEN "expiryDate" < CURRENT_TIMESTAMP THEN 'EXPIRED'
  WHEN "paymentAmount" = 0 AND "issueDate" + INTERVAL '30 days' < CURRENT_TIMESTAMP THEN 'CANCELLED'
  ELSE 'ACTIVE'
END;
