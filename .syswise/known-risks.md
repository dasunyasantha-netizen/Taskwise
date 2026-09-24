# Known risks

- **`deploy.sh` hard-resets prod** — script runs `git reset --hard origin/main` (and related deploy steps).
  Syswise v1 must not invoke deploy from workers. Manual ops only.
- **FE `TaskStatus` missing `BLOCKED`** — Prisma/`Task.status` documents `BLOCKED`; BE has
  `blockTask`/`unblockTask` in `taskController.ts`, but:
  - `src/types.ts` `TaskStatus` omits `BLOCKED`
  - `taskRoutes.ts` does not mount `/block` or `/unblock`
  - `apiService.ts` has no block/unblock client
  - Status maps/filters omit `BLOCKED` in FilterBar, BoardView, TasksPage, ReportsPage,
    FlowchartView, ProjectManager, TaskDetailPanel, GroupWiseTasksPage, etc.
  - `PersonnelTaskModal.tsx` already references `'BLOCKED'` in one status list (ahead of types).
- **No CI** — no `.github/` workflows; rely on App Brain pipeline stages.
- **Env / secrets** — `.env.production` present in repo tree; `server/.env.example` documents
  `DATABASE_URL` / `PORT`. Never copy real `.env*` into worker worktrees or commit secrets.
- **Docs port drift** — documentation mentions FE 3600 / BE 4400; code uses **3500 / 4300**.
- **Identity boundary** — violating portal groups/identity contract (local authoritative users/groups)
  causes cross-app drift; Taskwise must remain a consumer of Syswise SSO/identity.
