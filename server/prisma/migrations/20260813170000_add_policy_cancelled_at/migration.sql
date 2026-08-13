-- Expiry and cancellation are separate: the expiry date is entered by the user,
-- while cancellation is the date a policy lapsed because the full premium was
-- not received within the 30-day grace period.
ALTER TABLE "InsurancePolicy" ADD COLUMN "cancelledAt" TIMESTAMP(3);

-- Anything already cancelled lapsed 30 days after it was issued.
UPDATE "InsurancePolicy"
SET "cancelledAt" = "issueDate" + INTERVAL '30 days'
WHERE "status" = 'CANCELLED' AND "cancelledAt" IS NULL;
