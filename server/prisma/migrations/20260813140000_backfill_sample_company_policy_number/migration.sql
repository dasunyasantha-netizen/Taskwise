-- Backfill a placeholder company policy number on policies created before the
-- field became mandatory, so the login completion prompt no longer blocks the
-- director. Each placeholder is derived from the internal policy number, so it
-- is unique and searchable: filtering the policy list by "SAMPLE" lists every
-- record still waiting for its real Fairfirst-issued number.
UPDATE "InsurancePolicy"
SET "companyPolicyNumber" = 'SAMPLE-' || "policyNumber"
WHERE "companyPolicyNumber" IS NULL OR "companyPolicyNumber" = '';
