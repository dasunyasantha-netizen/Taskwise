# Letter management

## Roles and workflow

The Director grants **Letter Logger** permission to selected existing personnel in Settings. This permission is independent of the reporting hierarchy. Only Loggers and Directors create inquiries; the person who logs an inquiry becomes its initial assignee. Directors and Loggers see the complete workspace register. Other staff see inquiries they created, currently hold, previously held, or were explicitly given permission to view. Workspace boundaries and active membership are checked on every request.

The current assignee, original enterer, and Director can transfer responsibility, record outgoing replies, add notes, and share a thread for viewing. Other Loggers have register visibility, but cannot take these actions on somebody else's inquiry unless assigned to it. Shared access alone never grants editing permission. Previous assignees retain view access for continuity.

An outgoing reply requires a copy of the sent document and closes the inquiry immediately. Taskwise records correspondence sent elsewhere; it does not send letters or email. Only the original enterer or Director can append an incoming reply and reopen a closed inquiry. The original enterer's authority remains after Logger permission is revoked, while their account remains active. Reopening retains the assignee and starts a new assignment period. Incoming correspondence added to an already-open inquiry does not reset its age.

Each thread has one workspace/year reference, allocated atomically. Incoming, outgoing, handover, note, and sharing events form an append-only chronological sequence. Outgoing and subsequent incoming letters retain the same reference. Search existing inquiries before logging another; sender/reference suggestions help the Logger find an existing thread. Request identifiers prevent accidental duplicate saves, and version checks reject stale concurrent edits.

Received dates are date-only. The server supplies immutable logged timestamps. Metrics use Sri Lanka calendar dates, not working days or elapsed 24-hour blocks. Entry delay is measured for every incoming event. Open assignment age starts at creation, handover, or reopening. Default flags are **2 days for entry delay** and **7 days with an assignee**, inclusive; the Director may set each to 1–365 days. Closed inquiries do not accrue assignment age. Letter activity does not change task or YSO scores.

## Director setup

1. Open **Settings → Letter management**, and grant Logger permission to the appropriate staff. No production personnel are automatically granted this permission.
2. In Google Cloud, enable the Google Drive API and configure an OAuth consent screen and Web application OAuth client. Register the exact callback URL shown in Settings. Production defaults to `https://syswise.lk/taskwise-api/api/letters/drive/callback`.
3. Save the destination folder ID, OAuth client ID, and client secret in Settings. Use an account that can add files to the destination folder, including any Shared Drive permissions required by Google.
4. Choose **Connect Google Drive**, complete Google's consent, then **Test folder access**. Connection validates the folder before activating uploads. Google's consent-screen publishing, test-user, verification, and offline-token policies apply.

The integration requests the Google Drive scope to access an administrator-specified existing folder. It never changes file sharing or creates public links. Credentials are encrypted on the server and never returned by settings endpoints. Blank client-secret input retains the saved secret. Changing the client, secret, or folder disconnects the configuration and requires reconnection. Disconnecting removes Taskwise's stored refresh token; it does not delete existing Drive files. Account-level revocation can also be performed through Google account permissions.

## Operations and storage

- Set `LETTER_ENCRYPTION_KEY` to a persistent 32-byte random key represented by 64 hexadecimal characters. Keep it out of Git, restrict access, and back it up securely with the deployment configuration. Losing it makes saved OAuth credentials unreadable. Do not rotate it without a credential re-encryption/reconnection plan.
- Optional `LETTER_OAUTH_CALLBACK` and `LETTER_FRONTEND_URL` override production defaults for a separate environment. The frontend return URL is fixed server configuration, never a user-supplied redirect.
- Apply Prisma migrations and build the server before starting it. The API process starts the durable background queue; PDF/image rendering runs in a separate process with a 45-second timeout and bounded render dimensions. Build output must include `dist/helpers/letterPreviewChild.js`.
- Accept PDF, PNG, and JPEG files: up to 4 per event, 4 MiB each, 8 MiB combined. File signatures are checked. The letters API accepts a 12 MiB JSON body for base64 transport; configure its reverse-proxy location to at least 12 MiB.
- Original bytes are durably stored in PostgreSQL before responding to the Logger, then copied to Google Drive asynchronously. They remain in PostgreSQL for authenticated downloads and recovery; database backups therefore include documents. Capacity planning must account for both originals and previews. A Drive outage never discards a saved letter.
- Preview generation is independent of Drive availability. Images become reduced WebP previews; PDFs preview up to the first 10 pages, while original downloads retain every page. Unsupported or damaged documents can fail preview generation without losing the original.
- Upload and preview jobs have independent states, leases, and up to three automatic attempts. Errors are visible beside attachments, with manual retry for the owner/Director. Files waiting for initial Drive setup resume after connection. Failed uploads can be retried after repairing configuration.
- A Drive file ID is reserved and stored before uploading. Retrying a lost upload response uses the same ID and verifies attachment identity, size, and hash metadata on conflict, avoiding duplicate Drive copies. An upload already reserved for a folder retains that destination across retries.
- All in-app originals and previews require authorization and use private, non-cacheable responses. Audit records cover Logger grants and Drive configuration changes without including secrets.

## Verification

From `server`, run `npm run test:letters`. The suite uses only a dedicated localhost `taskwise_letters_test` database with isolated fixtures. It covers roles, tenant isolation, reference concurrency, idempotency, stale edits, transfers, close/reopen rules, encrypted settings, dates, real PNG/PDF rendering, background states, and retry-safe Drive uploads. The Drive network path is mocked; a real Google account must be connected and tested separately in Settings.

Related regression checks: `npm test`, `npm run test:yso`, and `npm run test:yso:integration`. Run frontend and backend builds before deployment.

Integration references: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Drive uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads), and [Drive file creation](https://developers.google.com/workspace/drive/api/guides/create-file).
