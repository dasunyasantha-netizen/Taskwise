# Taskwise (`taskwise`)

> App Brain — purpose, owners, stack, how to run, conventions.
> Keep under ~150 lines. Hand-written; updated by the App Manager as part of tasks.

## Purpose

Task management for Syswise organisations. Hierarchical workforce tasks (Director → Personnel),
projects, approvals, group-wise tasks, in-app notifications, insurance/company admin features.
Hosted under the Syswise portal route (`syswise.lk/taskwise`); identity/SSO/entitlements come from
the Syswise portal — Taskwise must not invent a parallel identity system.

## Owners

- Primary: Dasun (dasunyasantha-netizen)
- Backup:

## Repository

- GitHub: https://github.com/dasunyasantha-netizen/Taskwise.git
- Default branch: main
- Local clone (box): `/workspace/syswise/repos/taskwise`

## Stack

- Frontend: Vite + React 18 + TypeScript + Tailwind (PWA)
- Backend: Node.js + Express + TypeScript
- ORM/DB: Prisma → PostgreSQL (`taskwise_db` / local `taskwise` / `taskwise_test`)
- Auth: JWT (`taskwise_token` in localStorage) + WebAuthn/FIDO2; **no live Syswise JWT SSO exchange** (direct `/taskwise/` launch). Return-nav via `pickiti-launcher-protocol` **1.0.0**.

## How to run (local)

Ports from **code** (authoritative): FE **3500**, BE **4300**.
(`TASKWISE_DOCUMENTATION.md` still says 3600/4400 — treat as stale.)

```bash
# Postgres on localhost:5432 with DB taskwise (see server/.env.example)
cd server && cp .env.example .env   # fill DATABASE_URL — never commit
npm install && npx prisma generate && npx prisma db push
npm run dev                        # Express on :4300

# separate terminal
cd .. && npm install && npm run dev  # Vite on :3500, proxies /api → :4300
```

## Conventions

- Branching: feature branches off `main`; Syswise onboarding work uses `syswise/*` branches.
- FE under `src/**`; BE under `server/src/**`; schema under `server/prisma/**`.
- Tests: `server` package `"test"` runs several `tsx` scripts; pure unit files do not need DB
  (`companyHelpers`, `taskFilters`, `deduction`). Integration/hierarchy tests may need DB.
- Do not commit secrets (`.env*`, credentials). Do not run `deploy.sh` from Syswise workers.
- Status vocabulary for Task is documented on `Task.status` in Prisma (String, not Prisma enum).
  FE `TaskStatus` in `src/types.ts` must stay in sync (M1: add missing `BLOCKED`).

## Notes for Syswise workers

Workers receive only a scoped task packet. Prefer this brain + `file-map.json` / `symbols.json`
over broad repo crawls. Cross-app contracts:
- Launcher return-nav: `.syswise/api-contracts/pickiti-launcher-protocol.v1.json` (same file in portal brain).
- Identity/groups: portal `GROUPS_AND_IDENTITY_CONTRACT.md`, `docs/pickiti/auth-sso.md` (read; do not invent SSO).
M2 cross-app work must be routed Taskwise Manager → Orchestrator → Syswise Portal Manager.
