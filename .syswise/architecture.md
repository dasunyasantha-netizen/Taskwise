# Architecture

## Modules

| Area | Path | Role |
|------|------|------|
| FE entry | `src/main.tsx` → `src/App.tsx` | Boot; Auth vs Director/Personnel dashboards; `captureLaunchSource` |
| Launcher return-nav | `src/services/launchSource.ts` | `pickiti-launcher-protocol` **1.0.0** consumer |
| Dashboards | `src/components/DirectorDashboard.tsx`, `PersonnelDashboard.tsx` | Primary shells; Back to Pickiti/SysWise |
| Task UI | `TasksPage.tsx`, `TaskCard.tsx`, `TaskDetailPanel.tsx`, `PersonnelTaskModal.tsx`, `BoardView.tsx`, `FilterBar.tsx`, `FlowchartView.tsx`, `GroupWiseTasksPage.tsx` | List/board/detail/filters |
| FE API client | `src/services/apiService.ts` | REST to `/api/*` |
| BE entry | `server/src/index.ts` | Express app, CORS for :3500/:3100/syswise.lk, listen `PORT\|4300` |
| Task API | `server/src/routes/taskRoutes.ts` → `controllers/taskController.ts` | `/api/tasks` CRUD + lifecycle |
| Other routes | `authRoutes`, `notificationRoutes`, `projectRoutes`, `workspaceRoutes`, `adminRoutes`, … | Auth, notifs, projects, admin |
| Prisma | `server/prisma/schema.prisma` | Models: Task, Notification, Director, Personnel, Workspace, Company, … |
| Helpers/tests | `server/src/helpers/*`, `server/src/tests/*` | Pure filters/phone/scoring + some integration |

## Request flow

Browser (Vite :3500) → Vite proxy `/api` → Express (:4300) → `authenticateToken` middleware →
route handlers → Prisma → Postgres. JWT carried from local login / WebAuthn.

## Auth flow (accurate as of main @ investigation)

1. Local login / WebAuthn → Taskwise JWT stored as `taskwise_token`.
2. **No live Syswise JWT SSO exchange in this repo** — portal docs state TaskWise has no
   `/sso/taskwise` and launches directly at `/taskwise/` with company-prefixed login.
   `TASKWISE_DOCUMENTATION.md` §"SSO from SysWise" (`/sso?token=`) is **stale**.
3. Pickiti/Syswise **return-navigation** is live: `source` + `launcher_origin` per
   `PICKITI_INTEGRATION.md` and shared contract `pickiti-launcher-protocol` **1.0.0**.
4. Company onboarding uses local `Director.isSyswiseAdmin` (Taskwise DB), not portal JWT.
5. Do **not** invent parallel users/groups/entitlements — see portal
   `GROUPS_AND_IDENTITY_CONTRACT.md`. Pickiti entitlement gate for opening Taskwise lives
   on the portal (`PAID_APPS`).

## Data stores

- PostgreSQL (shared host typically `:5432`; Taskwise DB name separate from portal).
- No separate notifications microservice — `Notification` model + `/api/notifications`.

## External dependencies

- **syswise** (portal): launcher protocol, entitlements product, CORS/origins, future SSO/launch-codes.
- Shared Postgres service.
- See `dependencies.json`.

## Task status lifecycle (backend)

Documented on `Task.status` (String):
`PENDING | ASSIGNED | IN_PROGRESS | BLOCKED | SUBMITTED | APPROVED | RETURNED | REJECTED | CANCELLED`.

Controller already implements `blockTask` / `unblockTask` (`IN_PROGRESS ↔ BLOCKED`) but routes and
FE client/UI completeness tracked under M1 / known-risks.
