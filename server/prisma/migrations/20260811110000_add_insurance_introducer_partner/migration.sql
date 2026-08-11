ALTER TABLE "InsuranceQuotation"
ADD COLUMN "introducer" TEXT,
ADD COLUMN "partner" TEXT;

ALTER TABLE "InsurancePolicy"
ADD COLUMN "introducer" TEXT;
