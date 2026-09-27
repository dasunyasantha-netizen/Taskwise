# YSO performance module

The module is available to workspaces with `four_level_hierarchy`. It has its own
scores and does not change the existing project-task leaderboard.

## Access and rollout

- A YSO is a Level 4 person in the `YSO` job-role department. The assigned AD must
  be an active Level 3 Provincial person. Other Level 4 roles do not receive this module.
- YSOs submit their own records. Their current assigned AD reviews them, schedules
  meetings, confirms/exempts penalties, and records Task 15 assessments.
- The Director has read-only access across the workspace, including certificates,
  scores and evaluation distributions. Director access does not bypass AD approval.
- The AD activates reporting for each YSO and sets a fixed start date between
  joining and today. No earlier obligations are generated. This makes the launch
  date explicit rather than retrospectively penalizing all existing users.
- A Director controls changes to a YSO's reporting AD. Pending records become
  reviewable by the new assigned AD; their original assigned AD remains recorded.
- Each period/task score retains its original AD attribution. Corrections create
  adjustments in that same historical bucket. Director district charts use that
  attribution; the team directory and pending queues use current reporting lines.

## Policy version 2026-09-v1

All dates and deadline boundaries use **Asia/Colombo**. Days are calendar days.
Operational scores and Task 15 assessments use monthly periods. Totals may be
negative and do not have an overall maximum.

| Task | Rule |
| --- | --- |
| 1 | +1 per registered member only when online completion is checked. |
| 2 | +1 attended, 0 for AD-approved leave, −5 absent. Unmarked invitations are treated as absent after the meeting month ends; the AD must confirm the resulting deduction. Cancelled meetings carry no points or absence penalty. |
| 3 | Program month is due on the 25th of the previous month. +1 on time; −1 to −5 for 1–5 late days; −5 thereafter. |
| 4 | Report month is due on the 5th of the following month, with the same scoring as Task 3. |
| 5 | Whole LKR amounts received and credited to the regional account. Monthly approved eligible amounts are aggregated, then divided by 1,000 and rounded down. |
| 6 | Whole LKR amounts actually received, with funding-source details. Aggregate monthly amounts, divide by 5,000 and round down. |
| 7 | +1 per distinct meeting, maximum +5 per activity month. Sixth and subsequent meetings remain valid approved entries. |
| 8 | +1 per representative sent to a district meeting; meeting reference and representative details support AD verification. |
| 9 | +1 per covered Monday–Sunday week. The month containing Sunday owns the entire week. Repeated visits in one week add no extra points. If any required week is missed, one −5 penalty applies to the month after AD confirmation. Only weeks starting on/after reporting activation are mandatory. A month can contain five required weeks. |
| 10 | An advance is first registered and approved with its due date. A separate settlement submission references it. +2 on/before due date; otherwise −1 per overdue day without a cap. Open advances generate monthly overdue assessments for AD confirmation. Settlement reconciles earlier deductions so days are never charged twice. Approved monthly exemptions remain waived on settlement. |
| 11 | +1 per program per day. Different programs on the same day each qualify; repeating the same program name/date is a duplicate (ignoring case and extra spaces). |
| 12 | +15 once per lifetime for a diploma of at least 1,200 hours. |
| 13 | +50 once per lifetime for a degree. |
| 14 | +75 once per lifetime for a postgraduate degree. Qualification levels stack; corrections replace the existing award. |
| 15 | One monthly AD assessment: Volunteer Programs 0–10, District Success 0–5, Financial Discipline 0–3, Human Relations 0–4, File Maintenance 0–3. Maximum 25. Every revision needs a rationale. |

Qualification awards are credited to the submission month upon approval. Their
historic award remains in the ledger; they are not automatically awarded again in
later months. Fund remainders do not carry between months.

Activity references are required where duplicate event/receipt claims are likely.
References are case-insensitive per YSO and task; Task 11 uses program name and attendance date.
The AD verifies real-world evidence and cross-officer representative claims: free
text representative names are not an external identity registry.

## Approval, correction and scoring

1. The server saves `SUBMITTED` with an immutable submission timestamp.
2. It automatically records `PENDING` and places the entry in the AD queue in the
   same transaction. Both transitions remain in the audit trail.
3. `APPROVED` uses the original submitted timestamp, not the approval date.
4. `REJECTED` earns zero and permits a new submission version. Feedback is optional.

A resubmission/correction has a new timestamp and retains its predecessor. This
prevents an incomplete placeholder from reserving an on-time score. A correction
to approved work leaves the existing award in place until the correction is
approved. Approving the replacement supersedes the original without double credit.
An AD can revoke an approval with a mandatory reason; the ledger records reversals.
An advance with a pending/approved settlement cannot be changed or revoked until
the settlement is reviewed/revoked.

Missing reports become eligible for assessment after the five-day late window.
Month-end meeting/weekly/advance requirements are computed whenever the dashboard
is read; no scheduler must run for them to appear. **A read does not deduct points.**
The AD explicitly confirms or exempts each requirement, with a reason. Pending
evidence blocks a new decision. Existing confirmed penalties remain until the AD
reviews the evidence; submitting a new entry cannot erase them. Accepted late
evidence reconciles any missing-entry penalty instead of adding a second one.

Scores are an append-only ledger of adjustments with a rule version, period,
task, person, AD attribution and reason. Review decisions, supersession, audit
events and score adjustments commit together. PostgreSQL workspace transaction
locks serialize concurrent approvals, cap calculations and aggregate fund awards.

Policy constants are currently code-versioned, not editable by ADs. A future
policy change must introduce an effective-dated version and preserve historical
calculations; do not modify v1 constants and retroactively recompute old entries.

## Certificates

Each qualification version requires a PDF, PNG or JPEG certificate up to 1 MiB.
The server checks file signatures and stores bytes separately from dashboard data.
Downloads require the owning YSO, their currently assigned AD, or the workspace
Director. No public certificate URL or base64 file appears in dashboard responses.

## Run and verify

From `server`:

```sh
npx prisma migrate deploy
npx prisma generate
npm run build
npm run test:yso
npm run test:yso:integration
npm test
```

From the repository root:

```sh
npm run build
```

`test:yso:integration` refuses non-local database hosts and uses only the dedicated
`taskwise_yso_test` database. It creates uniquely named synthetic fixtures per run.
The existing regression suite uses its existing `taskwise_test` database.

Deploy the migration before restarting the backend and releasing the frontend.
In the AD's **YSO Performance → YSO monitoring** tab, activate reporting for each
YSO. The first complete month should be checked against a manual calculation,
especially the weekly calendar and overdue advance adjustments.

## Pickiti and phone verification

Pickiti's existing TaskWise tile opens this module through TaskWise's own login.
YSOs land on the Task Hub; ADs and Directors open YSO Performance from navigation.
The login page and authenticated headers retain the Pickiti return destination.
Mobile forms use 44px minimum controls, 16px input text and a viewport-bounded
scrolling dialog. Bottom navigation reserves the device's safe-area inset.

Verified at a 390 × 844 browser viewport using isolated synthetic accounts:
Pickiti login and active test entitlement → TaskWise launch → YSO login →
submission pending with official score unchanged → return to Pickiti with its
session retained. Director monitoring and analytics were also inspected at phone
size. This is browser viewport coverage, not a physical Android/TWA device test.
