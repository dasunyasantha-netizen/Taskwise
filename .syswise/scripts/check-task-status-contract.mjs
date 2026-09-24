#!/usr/bin/env node
/**
 * M1 contract: FE TaskStatus union in src/types.ts must match
 * .syswise/api-contracts/task-status.schema.json (Prisma-documented status set).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const schemaPath = path.join(root, '.syswise/api-contracts/task-status.schema.json')
const typesPath = path.join(root, 'src/types.ts')

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
const expected = schema.enum
if (!Array.isArray(expected) || expected.length === 0) {
  console.error('schema enum missing')
  process.exit(1)
}

const types = fs.readFileSync(typesPath, 'utf8')
const m = types.match(/export type TaskStatus\s*=\s*([\s\S]*?)(?=\nexport |\n\/\/ ─)/)
if (!m) {
  console.error('Could not find export type TaskStatus in src/types.ts')
  process.exit(1)
}
const found = [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1])
const missing = expected.filter((v) => !found.includes(v))
const extra = found.filter((v) => !expected.includes(v))

if (missing.length || extra.length) {
  console.error('TaskStatus contract mismatch')
  if (missing.length) console.error('  missing on FE:', missing.join(', '))
  if (extra.length) console.error('  extra on FE:', extra.join(', '))
  console.error('  schema:', expected.join(', '))
  console.error('  fe:    ', found.join(', '))
  process.exit(1)
}

console.log('task-status contract OK:', found.join(', '))
