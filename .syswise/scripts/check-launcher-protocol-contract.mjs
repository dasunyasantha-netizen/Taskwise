#!/usr/bin/env node
/**
 * Taskwise side of pickiti-launcher-protocol 1.0.0.
 * Enforces contract name/version, source enum, launcher_origin allowlist hosts,
 * storage keys, return paths, and presence of listed taskwise_consumers.
 * Run from worktree root: node .syswise/scripts/check-launcher-protocol-contract.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const schemaPath = path.join(root, '.syswise/api-contracts/pickiti-launcher-protocol.v1.json')
const implPath = path.join(root, 'src/services/launchSource.ts')

function fail(msg, detail) {
  console.error(msg)
  if (detail !== undefined) console.error(detail)
  process.exit(1)
}

if (!fs.existsSync(schemaPath)) fail('missing contract JSON:', schemaPath)
if (!fs.existsSync(implPath)) fail('missing launchSource.ts:', implPath)

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
const src = fs.readFileSync(implPath, 'utf8')
const c = schema.contract

// --- contract name / version ---
if (!c || c.name !== 'pickiti-launcher-protocol' || c.version !== '1.0.0') {
  fail('contract name/version mismatch', c)
}

// --- source enum: pickiti | syswise ---
const sourceEnum = schema.query_params?.source?.enum
if (!Array.isArray(sourceEnum) || sourceEnum.length === 0) {
  fail('contract query_params.source.enum missing')
}
const expectedSources = ['pickiti', 'syswise']
for (const key of expectedSources) {
  if (!sourceEnum.includes(key)) {
    fail('contract source enum missing value', key)
  }
}
if (!/LaunchSource\s*=\s*'pickiti'\s*\|\s*'syswise'/.test(src) &&
    !/LaunchSource\s*=\s*"pickiti"\s*\|\s*"syswise"/.test(src)) {
  fail('launchSource.ts LaunchSource type must be pickiti | syswise')
}
for (const key of expectedSources) {
  const quoted = src.includes(`'${key}'`) || src.includes(`"${key}"`)
  if (!quoted) fail('launchSource.ts missing source value', key)
}

// --- launcher_origin allowlist hosts present in safeLauncherOrigin ---
const allow = schema.query_params?.launcher_origin?.allowlist
if (!Array.isArray(allow) || allow.length === 0) {
  fail('contract launcher_origin.allowlist missing')
}
const missingHosts = allow.filter((o) => {
  const host = new URL(o).hostname
  return !src.includes(host)
})
if (missingHosts.length) {
  fail('launchSource.ts missing allowlist hosts:', missingHosts.join(', '))
}
const localOrigins = allow.filter((o) => {
  try {
    const u = new URL(o)
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1'
  } catch {
    return false
  }
})
if (localOrigins.length && !src.includes('3100')) {
  fail('launchSource.ts must constrain local launcher_origin to port 3100')
}

// --- storage keys ---
const keys = schema.storage_keys?.taskwise
if (!keys?.source || !keys?.origin) {
  fail('contract storage_keys.taskwise.source/origin missing')
}
const expectedStorage = {
  source: 'taskwise_launch_source',
  origin: 'taskwise_launcher_origin',
}
if (keys.source !== expectedStorage.source || keys.origin !== expectedStorage.origin) {
  fail('contract storage_keys.taskwise unexpected', keys)
}
for (const [label, value] of Object.entries(expectedStorage)) {
  if (!src.includes(`'${value}'`) && !src.includes(`"${value}"`)) {
    fail(`launchSource.ts missing storage key (${label}):`, value)
  }
}

// --- return paths: /pickiti vs /apps ---
const returnPaths = schema.return_paths
if (!returnPaths || returnPaths.pickiti !== '/pickiti' || returnPaths.syswise !== '/apps') {
  fail('contract return_paths must be pickiti=/pickiti, syswise=/apps', returnPaths)
}
if (returnPaths.default_when_missing !== 'syswise') {
  fail('contract default_when_missing must be syswise', returnPaths.default_when_missing)
}
if (!src.includes('/pickiti')) {
  fail('launchSource.ts missing return path /pickiti')
}
if (!src.includes('/apps')) {
  fail('launchSource.ts missing return path /apps')
}
if (!src.includes("'syswise'") && !src.includes('"syswise"')) {
  fail('launchSource.ts missing default syswise source')
}

// --- taskwise_consumers files exist (strip #fragment) ---
const consumers = schema.taskwise_consumers
if (!Array.isArray(consumers) || consumers.length === 0) {
  fail('contract taskwise_consumers missing')
}
const missingConsumers = []
for (const entry of consumers) {
  const filePart = String(entry).split('#')[0].trim()
  if (!filePart) continue
  const abs = path.join(root, filePart)
  if (!fs.existsSync(abs)) missingConsumers.push(entry)
}
if (missingConsumers.length) {
  fail('taskwise_consumers missing on disk:', missingConsumers.join(', '))
}

const appTsx = path.join(root, 'src/App.tsx')
if (fs.existsSync(appTsx)) {
  const appSrc = fs.readFileSync(appTsx, 'utf8')
  if (!appSrc.includes('captureLaunchSource')) {
    fail('src/App.tsx must call/import captureLaunchSource')
  }
}

console.log('pickiti-launcher-protocol 1.0.0 OK')
console.log('  contract:', c.name, c.version)
console.log('  sources:', sourceEnum.join('|'))
console.log('  storage:', keys.source, '+', keys.origin)
console.log('  return:', `pickiti=${returnPaths.pickiti}`, `syswise=${returnPaths.syswise}`)
console.log('  allowlist hosts:', allow.map((o) => new URL(o).hostname).join(', '))
console.log('  consumers:', consumers.length, 'present')
