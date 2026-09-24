#!/usr/bin/env node
/**
 * Taskwise side of pickiti-launcher-protocol 1.0.0.
 * Stub validates schema + that launchSource.ts contains allowlisted origins.
 * M2 may deepen asserts (source enum, storage keys).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const schemaPath = path.join(root, '.syswise/api-contracts/pickiti-launcher-protocol.v1.json')
const implPath = path.join(root, 'src/services/launchSource.ts')
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
const c = schema.contract
if (!c || c.name !== 'pickiti-launcher-protocol' || c.version !== '1.0.0') {
  console.error('contract name/version mismatch', c)
  process.exit(1)
}
const allow = schema.query_params.launcher_origin.allowlist
const src = fs.readFileSync(implPath, 'utf8')
const missing = allow.filter((o) => {
  // code checks hostname/port separately; ensure host fragments present
  const host = new URL(o).hostname
  return !src.includes(host)
})
if (missing.length) {
  console.error('launchSource.ts missing allowlist hosts:', missing.join(', '))
  process.exit(1)
}
for (const key of ['pickiti', 'syswise']) {
  if (!src.includes(`'${key}'`) && !src.includes(`"${key}"`)) {
    console.error('launchSource.ts missing source value', key)
    process.exit(1)
  }
}
console.log('pickiti-launcher-protocol 1.0.0 OK vs launchSource.ts')
