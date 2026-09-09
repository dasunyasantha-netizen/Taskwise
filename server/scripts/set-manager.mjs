/**
 * Point existing personnel at a different reporting manager.
 *
 * Goes through PUT /workspace/personnel/:id, so the server's rule that a
 * manager sits exactly one level above the person is enforced — a mismatched
 * level is rejected rather than silently written.
 *
 *   node scripts/set-manager.mjs --api <url> --login <id> --password '<pw>' \
 *     --set "<user login ID>=<manager login ID>,<user>=<manager>" [--apply]
 */
const args = new Map()
const SWITCHES = new Set(['apply'])
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (!a.startsWith('--')) continue
  const key = a.slice(2)
  if (SWITCHES.has(key)) { args.set(key, true); continue }
  const next = process.argv[i + 1]
  if (next === undefined || next.startsWith('--') || next === '') {
    console.error(`\n✗ --${key} needs a value\n`); process.exit(1)
  }
  args.set(key, next); i++
}
const API = args.get('api'), LOGIN = args.get('login'), PASSWORD = args.get('password')
const SET = args.get('set'), APPLY = args.get('apply') === true
const die = m => { console.error(`\n✗ ${m}\n`); process.exit(1) }
if (!API || !LOGIN || !PASSWORD || !SET) die('--api, --login, --password and --set are required')

let token = null
async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let payload; try { payload = text ? JSON.parse(text) : null } catch { payload = text }
  if (!res.ok) die(`${method} ${path} → ${res.status} ${payload?.error ?? text}`)
  return payload
}

const auth = await call('POST', '/auth/login', { phone: LOGIN, password: PASSWORD })
token = auth.token
console.log(`Signed in as ${auth.user.name} (${auth.user.companyName ?? 'company'})`)

const people = await call('GET', '/workspace/personnel')
const byLogin = new Map(people.map(p => [String(p.loginId || p.phone), p]))
const find = id => byLogin.get(String(id).trim()) || die(`no personnel with login ID "${id}"`)

const pairs = SET.split(',').map(chunk => {
  const [who, mgr] = chunk.split('=').map(s => s && s.trim())
  if (!who || !mgr) die(`--set entries must look like "<user>=<manager>"; got "${chunk}"`)
  return { person: find(who), manager: find(mgr) }
})

console.log(`\nPlan${APPLY ? '' : ' (dry run — nothing will be written)'}:`)
for (const { person, manager } of pairs) {
  const now = people.find(p => p.id === person.supervisorId)
  console.log(`  ${person.name} (${person.loginId}): ${now ? now.name : 'no manager'} → ${manager.name}`)
}

if (!APPLY) {
  console.log('\nRe-run with --apply to save.\n')
} else {
  console.log('')
  for (const { person, manager } of pairs) {
    await call('PUT', `/workspace/personnel/${person.id}`, {
      name: person.name, phone: person.phone, supervisorId: manager.id,
    })
    console.log(`  ✓ ${person.name} now reports to ${manager.name}`)
  }
  console.log('')
}
