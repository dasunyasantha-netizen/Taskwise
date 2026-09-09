/**
 * Create the level 4 "YSO" job-role department and a batch of YSO users.
 *
 * Everything goes through the REST API as a signed-in director, so the same
 * validation the UI enforces applies here — including the rule that a level 4
 * user must report to a level 3 manager. Nothing is written straight to the
 * database.
 *
 * The target company must hold the `four_level_hierarchy` feature and have a
 * level 4 tier, which the 20260909100000 migration creates on deploy.
 *
 * Usage (dry run prints the plan and writes nothing):
 *
 *   node scripts/seed-yso-users.mjs \
 *     --api      http://localhost:4300/api \
 *     --login    0771234567 \
 *     --password '<director password>' \
 *     --count    5 \
 *     --phone    0781000001 \
 *     --user-password 'YSO@1234' \
 *     [--manager "<level 3 manager name or login ID>"] \
 *     [--force-password-change] \
 *     [--apply]
 */

// Flags that are a bare switch; everything else must be given a value. Without
// this an empty argument would silently become `true` and be sent as the value.
const SWITCHES = new Set(['apply', 'force-password-change'])

const args = new Map()
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (!a.startsWith('--')) continue
  const key = a.slice(2)
  if (SWITCHES.has(key)) { args.set(key, true); continue }
  const next = process.argv[i + 1]
  if (next === undefined || next.startsWith('--')) {
    console.error(`\n✗ --${key} needs a value\n`); process.exit(1)
  }
  if (next === '') {
    console.error(`\n✗ --${key} was given an empty value. If you used a shell variable, note that "VAR=x cmd \\$VAR" expands \\$VAR before the assignment applies.\n`)
    process.exit(1)
  }
  args.set(key, next); i++
}

const API = args.get('api') || 'http://localhost:4300/api'
const LOGIN = args.get('login')
const PASSWORD = args.get('password')
const COUNT = Number(args.get('count') || 5)
const PHONE_START = String(args.get('phone') || '')
const USER_PASSWORD = args.get('user-password')
const MANAGER = args.get('manager')
const FORCE_CHANGE = args.get('force-password-change') === true
const APPLY = args.get('apply') === true

const DEPARTMENT = 'YSO'
const LEVEL = 4

function die(message) { console.error(`\n✗ ${message}\n`); process.exit(1) }

if (!LOGIN || !PASSWORD) die('--login and --password (a director account) are required')
if (!USER_PASSWORD) die('--user-password is required')
if (!/^07\d{8}$/.test(PHONE_START)) die('--phone must be a Sri Lankan mobile in 07XXXXXXXX form; it is the first number and the rest increment from it')
if (!Number.isInteger(COUNT) || COUNT < 1 || COUNT > 200) die('--count must be between 1 and 200')
// TaskWise enforces 8 characters on every password *change*, but not at
// creation — so a shorter one would stick as a permanent shared credential.
// It is allowed only as a one-time temporary password the user must replace.
if (USER_PASSWORD.length < 8 && !FORCE_CHANGE) {
  die(`--user-password is ${USER_PASSWORD.length} characters, below the 8 TaskWise requires whenever a password is changed. Without --force-password-change it would become a permanent shared credential that fails the app's own policy. Either add --force-password-change to issue it as a one-time temporary password, or choose 8+ characters.`)
}

let token = null
async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let payload
  try { payload = text ? JSON.parse(text) : null } catch { payload = text }
  if (!res.ok) die(`${method} ${path} → ${res.status} ${payload?.error ?? text}`)
  return payload
}

const phoneAt = i => '0' + String(Number(PHONE_START.slice(1)) + i).padStart(9, '0')

// ── Sign in ─────────────────────────────────────────────────────────────────
// The login endpoint takes the login ID in its `phone` field.
const auth = await call('POST', '/auth/login', { phone: LOGIN, password: PASSWORD })
token = auth.token
if (auth.user?.actorType !== 'director') die('that account is not a director; only a director can create departments and personnel')
console.log(`Signed in as ${auth.user.name} (${auth.user.companyName ?? 'company'})`)

if (!auth.user.features?.includes('four_level_hierarchy')) {
  die('this company does not hold the four_level_hierarchy feature, so it has no level 4. Deploy the migration, or enable the feature from the Company Features screen, then re-run.')
}

// ── Locate level 4 and the YSO department ───────────────────────────────────
const layers = await call('GET', '/workspace/layers')
const level4 = layers.find(l => l.number === LEVEL)
if (!level4) die('this workspace has no level 4 tier')

let dept = (level4.departments || []).find(d => d.name.toLowerCase() === DEPARTMENT.toLowerCase())

// ── Pick the level 3 reporting manager ──────────────────────────────────────
const managers = await call('GET', `/workspace/managers?level=${LEVEL}`)
if (managers.length === 0) {
  die('there are no level 3 users to report to. Level 4 users must have a level 3 manager, so create one first.')
}
let manager
if (MANAGER) {
  const needle = String(MANAGER).toLowerCase()
  const matches = managers.filter(m => m.name.toLowerCase() === needle || (m.loginId || '').toLowerCase() === needle)
  if (matches.length === 0) die(`no level 3 manager matches "${MANAGER}". Available: ${managers.map(m => `${m.name} (${m.loginId})`).join(', ')}`)
  if (matches.length > 1) die(`"${MANAGER}" matches more than one manager; pass a login ID instead`)
  manager = matches[0]
} else if (managers.length === 1) {
  manager = managers[0]
} else {
  die(`several level 3 managers exist — pass --manager to choose one: ${managers.map(m => `${m.name} (${m.loginId})`).join(', ')}`)
}

// ── Plan ────────────────────────────────────────────────────────────────────
const planned = Array.from({ length: COUNT }, (_, i) => ({ name: `YSO ${i + 1}`, phone: phoneAt(i) }))
console.log(`\nPlan${APPLY ? '' : ' (dry run — nothing will be written)'}:`)
console.log(`  Department  ${DEPARTMENT} — level 4 (job role)${dept ? ' [already exists]' : ' [will be created]'}`)
console.log(`  Manager     ${manager.name} — ${manager.department.name}, level ${manager.department.layer.number}`)
console.log(`  Password    ${'•'.repeat(USER_PASSWORD.length)} (${USER_PASSWORD.length} chars, shared)${FORCE_CHANGE ? ', must change at first login' : ', permanent until the user changes it'}`)
console.log(`  Users       ${planned.map(p => `${p.name} (${p.phone})`).join(', ')}`)

if (!APPLY) {
  console.log('\nRe-run with --apply to create them.\n')
  process.exit(0)
}

// ── Apply ───────────────────────────────────────────────────────────────────
if (!dept) {
  dept = await call('POST', '/workspace/departments', { name: DEPARTMENT, layerId: level4.id })
  console.log(`\nCreated department ${dept.name}`)
} else {
  console.log(`\nReusing existing department ${dept.name}`)
}

const created = []
for (const p of planned) {
  const person = await call('POST', '/workspace/personnel', {
    name: p.name,
    phone: p.phone,
    departmentId: dept.id,
    supervisorId: manager.id,
    password: USER_PASSWORD,
    mustChangePassword: FORCE_CHANGE,
  })
  created.push({ name: person.name, loginId: person.loginId })
  console.log(`  ✓ ${person.name} — login ${person.loginId}`)
}

console.log(`\nDone. ${created.length} users in ${DEPARTMENT}, all reporting to ${manager.name}.\n`)
