# TaskWise — Deployment Guide

## ⚠️ Mandatory Rules

1. **Never deploy by SCP or direct file copy to the server.** All deploys must go through GitHub.
2. **Never run `pm2 restart` manually** without rebuilding first — the server runs compiled JS from `dist/`, stale builds cause subtle bugs.
3. **Always commit and push to `main` before deploying.** The deploy script enforces this and will abort if there are uncommitted changes or an unpushed commit.

---

## How to Deploy

```bash
bash deploy.sh
```

That's it. The script does everything in order:

| Step | What it does |
|------|-------------|
| 1 | Checks git is clean and pushed to `origin/main` |
| 2 | Stamps the SW with the current git SHA as `CACHE_VERSION` |
| 3 | Builds the frontend locally to catch errors before touching production |
| 4 | SSHs into the server and runs: `git reset --hard origin/main` |
| 5 | Installs npm dependencies (frontend + backend) |
| 6 | Runs `prisma generate` to rebuild the Prisma client |
| 7 | Runs `prisma migrate deploy` to apply any pending DB migrations |
| 8 | Builds the backend (`tsc`) |
| 9 | Builds the frontend on the server with the stamped SW |
| 10 | Restarts `taskwise-backend` via PM2 |
| 11 | Verifies the backend is online |

---

## How Cache Clearing Works

TaskWise is a PWA — users install it and the service worker caches assets aggressively. Without active cache busting, users can be stuck on an old version for days.

### The mechanism

Every deploy stamps `public/sw.js` with the current git SHA:

```js
const CACHE_VERSION = 'a1b2c3d'  // ← git short SHA, injected at deploy time
```

Because `sw.js` is served with `Cache-Control: no-cache` (configured in nginx), the browser re-fetches it on every page load. When the content changes (new SHA), the browser detects a new SW version and:

1. Downloads and installs the new SW in the background
2. `skipWaiting()` + `clientsClaim()` make it take over immediately (no "click to reload" prompt)
3. The `activate` handler deletes any stale Workbox caches from previous versions
4. All connected clients get the new JS/CSS assets on their next navigation

### What nginx caches vs doesn't

| File | Cache policy | Why |
|------|-------------|-----|
| `index.html` | `no-cache, no-store` | Must always be fresh so SW update is detected |
| `sw.js`, `registerSW.js`, `manifest.webmanifest` | `no-cache, no-store` | Must always be fresh |
| `assets/*.js`, `assets/*.css` | `public, immutable, 1 year` | Vite hashes filenames — old URLs never conflict |

---

## Prerequisites

- SSH alias `syswise-hetzner` must be configured in `~/.ssh/config`
- You must have push access to `github.com/dasunyasantha-netizen/Taskwise`
- Run the script from the `taskwise-local/` directory

---

## If Something Goes Wrong

**Backend won't start after deploy:**
```bash
ssh syswise-hetzner "pm2 logs taskwise-backend --lines 50"
```

**Database migration failed:**
```bash
ssh syswise-hetzner "cd /var/www/taskwise/server && npx prisma migrate status"
```

**Roll back to previous commit:**
```bash
ssh syswise-hetzner "cd /var/www/taskwise && git log --oneline -5"
ssh syswise-hetzner "cd /var/www/taskwise && git reset --hard <previous-sha> && npm run build && cd server && npm run build && pm2 restart taskwise-backend"
```

**Force all users to hard-reload (nuclear option):**
```bash
ssh syswise-hetzner "cd /var/www/taskwise && sed -i 's/__CACHE_VERSION__/force-$(date +%s)/' public/sw.js && npm run build && git checkout public/sw.js"
```
