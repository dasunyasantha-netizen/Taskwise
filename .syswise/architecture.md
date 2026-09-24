# Architecture

## Modules

| Area | Path | Role |
|------|------|------|
| FE entry | `src/main.tsx` → `src/App.tsx` | Boot; Auth vs Director/Personnel dashboards |
| Dashboards | `src/components/DirectorDashboard.tsx`, `PersonnelDashboard.tsx` | Primary shells / views |
| Task UI | `TasksPage.tsx`, `TaskCard.tsx`, `TaskDetailPanel.tsx`, `PersonnelTaskModal.tsx`, `BoardView.tsx`, `FilterBar.tsx`, `FlowchartView.tsx`, `GroupWiseTasksPage.tsx` | List/board/detail/filters |
| FE API client | `src/services/apiService.ts` | REST to `/api/*` |
| BE entry | `server/src/index.ts` | Express app, CORS for :3500, listen `PORT\|4300` |
| Task API | `server/src/routes/taskRoutes.ts` → `controllers/taskController.ts` | `/api/tasks` CRUD + lifecycle |
| Other routes | `authRoutes`, `notificationRoutes`, `projectRoutes`, `workspaceRoutes`, `adminRoutes`, … | Auth, notifs, projects, admin |
| Prisma | `server/prisma/schema.prisma` | Models: Task, Notification, Director, Personnel, Workspace, Company, … |
| Helpers/tests | `server/src/helpers/*`, `server/src/tests/*` | Pure filters/phone/scoring + some integration |

## Request flow

Browser (Vite :3500) → Vite proxy `/api` → Express (:4300) → `authenticateToken` middleware →
route handlers → Prisma → Postgres. JWT carried from login/SSO.

## Auth flow

1. Local login / WebAuthn → Taskwise JWT stored as `taskwise_token`.
2. SSO from Syswise portal: land on `/sso?token=<syswiseJWT>`; Taskwise matches/creates local
   Director/Personnel and issues Taskwise JWT (portal remains identity authority).
3. Pickiti/Syswise return-navigation per `PICKITI_INTEGRATION.md` / portal `docs/pickiti/*`.
4. Do **not** invent parallel users/groups/entitlements — see portal
   `GROUPS_AND_IDENTITY_CONTRACT.md`.

## Data stores

- PostgreSQL (shared host typically `:5432`; Taskwise DB name separate from portal).
- No separate notifications microservice — `Notification` model + `/api/notifications`.

## External dependencies

- **syswise** (portal): SSO, identity, groups, entitlements, route hosting.
- Shared Postgres service.
- See `dependencies.json`.

## Task status lifecycle (backend)

Documented on `Task.status` (String):
`PENDING | ASSIGNED | IN_PROGRESS | BLOCKED | SUBMITTED | APPROVED | RETURNED | REJECTED | CANCELLED`.

Controller already implements `blockTask` / `unblockTask` (`IN_PROGRESS ↔ BLOCKED`) but routes and
FE client/UI are incomplete for M1 (see known-risks / M1 scope).
