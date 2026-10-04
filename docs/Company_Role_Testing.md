# Taskwise Company Role Testing

Open `/taskwise/?legacy=1&testing=1` on the deployed server, or
`http://localhost:3500/?legacy=1&testing=1` locally. Deployment is required before
the hosted link becomes available. Select a test role and use `test@123`.

| Login ID | Role | Reports To |
| --- | --- | --- |
| TESTCHAIRMAN | Chairman / company management | - |
| TESTDIRECTOR | Director | Chairman |
| TESTDD | Deputy Director, Head Office | TESTDIRECTOR |
| TESTPD | Provincial Director | TESTDIRECTOR |
| TESTADHO | Assistant Director, Head Office | TESTDD |
| TESTAD | Assistant Director, Provincial | TESTPD |
| TESTYSO | Youth Services Officer | TESTAD |
| TESTYSO2 | Second Youth Services Officer | TESTAD |
| TESTLOGGER | Letter Logger | - |
| TESTASSIGNER | Letter Assigner | - |

## Sample Data

The test company is independent of real companies. Its fictional data reflects
real operational workflows without copying personal information:

- Two youth programme projects, one category, and 70 tasks across assigned,
  in-progress, submitted, returned and approved states.
- Overdue tasks, comments, progress logs, audit events and notifications.
- Two YSO profiles, pending/approved/rejected sponsorship submissions,
  evaluations, a meeting, calendar entries, scores, and approved/pending
  qualifications with downloadable fictional certificates.
- Three incoming letters with downloadable sample PDFs.

Sample scenarios are restored at midnight in Sri Lanka (UTC+05:30). The baseline
is permanent in the seed definition, so edits and deletions cannot permanently
remove samples. Dates are refreshed to keep the scenarios usable. Testers'
changes, new records, uploads and login history are cleared during restoration.
Feedback is stored separately and survives resets. The Test Chairman can review
feedback and restore samples immediately from the test banner.

The API checks for an overdue reset before accepting test sessions; a failed
reset blocks testing until restoration succeeds. A 30-second worker also handles
resets while the API is running. Sessions expire at midnight under Taskwise's
existing session policy. This is application-data retention, not a promise to
remove database backups or infrastructure logs within 24 hours.

Google Drive and real identity/contact linking are disabled. Letter files and
YSO certificates stay in sandbox database storage and are removed at reset.
Never grant these accounts system-wide administrator privileges.

## Suggested Test Sequence

1. As Chairman, inspect reports, create a project and assign tasks.
2. As Director, DD, PD and AD, inspect the reporting scope, delegate work,
   return a submission and approve a corrected task.
3. As YSO, update progress, submit an activity and upload a qualification scan.
4. As Provincial AD, review YSO submissions and record an evaluation.
5. As Letter Logger, enter a letter and attach a document. As Letter Assigner,
   route it to an AD. As AD, reply or forward it.
6. Check the same workflow on mobile and in the company's working languages.
7. Submit feedback with the expected behaviour, actual result and proposed change.

## Setup And Verification

From `server`, apply migrations and generate the Prisma client, then run
`npm run test-company:setup`. It only resets the registered test workspace and
refuses an existing workspace whose company identity does not match the sandbox.
The API starts the daily worker automatically. Run
`npx tsx src/tests/testSandbox.test.ts` with the local API on port 4300 to verify
accounts, permissions, restoration, documents, feedback retention and isolation.
This integration test resets the test company; use it before inviting testers.
