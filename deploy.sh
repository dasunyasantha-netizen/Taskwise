#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# TaskWise Deploy Script
# Run from your local machine: bash deploy.sh
# Requires: git, ssh alias 'syswise-hetzner' configured in ~/.ssh/config
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[deploy]${NC} $1"; }
ok()   { echo -e "${GREEN}[ok]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
fail() { echo -e "${RED}[fail]${NC} $1"; exit 1; }

# ── 1. Enforce git-only deploys ───────────────────────────────────────────────
log "Checking git status..."
if [ -n "$(git status --porcelain)" ]; then
  fail "Uncommitted changes detected. Commit and push to GitHub before deploying.\n       Run: git add -A && git commit -m '...' && git push origin main"
fi

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main 2>/dev/null || echo "unknown")
if [ "$LOCAL" != "$REMOTE" ]; then
  fail "Local branch is not in sync with origin/main. Run: git push origin main"
fi
ok "Git is clean and pushed."

# ── 2. Stamp cache version with current git SHA ───────────────────────────────
CACHE_VERSION=$(git rev-parse --short HEAD)
log "Cache version: $CACHE_VERSION"

# Inject into sw.js before building (restored after build)
sed -i.bak "s/__CACHE_VERSION__/$CACHE_VERSION/" public/sw.js

# ── 3. Build frontend locally ─────────────────────────────────────────────────
log "Building frontend..."
npm run build || { mv public/sw.js.bak public/sw.js; fail "Frontend build failed."; }

# Restore sw.js template
mv public/sw.js.bak public/sw.js
ok "Frontend built."

# ── 4. SSH into production and deploy ────────────────────────────────────────
log "Deploying to production (syswise-hetzner)..."
ssh syswise-hetzner bash -s << 'REMOTE'
set -euo pipefail
cd /var/www/taskwise

echo "[remote] Pulling from GitHub..."
git fetch origin main
git reset --hard origin/main

echo "[remote] Installing frontend dependencies..."
npm install --silent

echo "[remote] Installing backend dependencies..."
cd server
npm install --silent

echo "[remote] Generating Prisma client..."
npx prisma generate

echo "[remote] Running database migrations..."
npx prisma migrate deploy

echo "[remote] Building backend..."
npm run build
cd ..

echo "[remote] Building frontend with cache-busted SW..."
CACHE_VERSION=$(git rev-parse --short HEAD)
CURRENT_SHA=$(git rev-parse HEAD)
sed -i "s/__CACHE_VERSION__/$CACHE_VERSION/g" public/sw.js
echo "{\"sha\":\"$CURRENT_SHA\"}" > public/version.json
VITE_BUILD_SHA=$CURRENT_SHA npm run build
git checkout public/sw.js

echo "[remote] Restarting backend..."
pm2 restart taskwise-backend

echo "[remote] Done. Deployed commit: $CACHE_VERSION"
REMOTE

ok "Production deploy complete."

# ── 5. Verify backend is up ───────────────────────────────────────────────────
log "Verifying backend health..."
sleep 3
STATUS=$(ssh syswise-hetzner "pm2 jlist 2>/dev/null | python3 -c \"import sys,json; apps=json.load(sys.stdin); app=next((a for a in apps if a['name']=='taskwise-backend'),None); print(app['pm2_env']['status'] if app else 'not found')\" 2>/dev/null || echo unknown")
if [ "$STATUS" = "online" ]; then
  ok "taskwise-backend is online."
else
  warn "taskwise-backend status: $STATUS — check with: ssh syswise-hetzner 'pm2 logs taskwise-backend --lines 20'"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  TaskWise deployed successfully!${NC}"
echo -e "${GREEN}  Commit : $(git rev-parse --short HEAD)${NC}"
echo -e "${GREEN}  URL    : https://syswise.lk/taskwise/${NC}"
echo -e "${GREEN}  Cache  : SW version bumped — all PWA clients will auto-update${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
