-- Fairfirst now records the insurer-issued policy number alongside the internal P-000000 number.
-- Existing policies are left NULL so the login completion prompt collects them.
ALTER TABLE "InsurancePolicy" ADD COLUMN "companyPolicyNumber" TEXT;
