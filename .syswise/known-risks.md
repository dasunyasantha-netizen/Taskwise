# Known risks

- **`deploy.sh` hard-resets prod** — script runs `git reset --hard origin/main` (and related deploy steps).
  Syswise v1 must not invoke deploy from workers. Manual ops only.
- **FE `TaskStatus` / BLOCKED surface** — Prisma documents `BLOCKED`; BE has `blockTask`/`unblockTask`.
  M1 onboarded contract + FE status union; keep routes/UI completeness in mind for follow-ons.
- **No CI** — no `.github/` workflows; rely on App Brain pipeline stages.
- **Env / secrets** — `.env.production` may exist in tree; `server/.env.example` documents
  `DATABASE_URL` / `JWT_SECRET` / `PORT`. Never copy real `.env*` into worker worktrees.
- **Docs port drift** — some docs mention FE 3600 / BE 4400; code uses **3500 / 4300**.
- **Stale SSO docs** — `TASKWISE_DOCUMENTATION.md` and older brain text claim `/sso?token=<syswiseJWT>`;
  portal `docs/pickiti/auth-sso.md` and code show **no** TaskWise SSO page. Architecture brain
  corrected; product doc fix is part of recommended M2 acceptance (docs-only / low risk).
- **Identity boundary** — violating portal groups/identity contract causes cross-app drift.
- **Launcher origin gap on portal Apps grid** — TaskWise `launchPath` may omit `launcher_origin`
  (Pickiti stamps both). Covered by shared contract M2 candidate.
