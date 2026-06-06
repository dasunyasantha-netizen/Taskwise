/**
 * Production migration script: add ProjectCategory model, create categories,
 * rename/categorize/merge projects from Excel data.
 *
 * Run on production server:
 *   node migrate-categories.mjs            # live run
 *   node migrate-categories.mjs --dry-run  # preview only, no DB writes
 *
 * Requirements: XLSX npm package, DATABASE_URL set in .env
 */

import { PrismaClient } from '@prisma/client'
import XLSX from 'xlsx'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync, existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load .env
const envPath = join(__dirname, '.env')
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const [k, ...rest] = line.split('=')
    if (k && rest.length) process.env[k.trim()] = rest.join('=').trim().replace(/^['"]|['"]$/g, '')
  }
}

const DRY_RUN = process.argv.includes('--dry-run')
const prisma = new PrismaClient()

// ─── Category color map ───────────────────────────────────────────────────────

const CATEGORY_COLORS = {
  'Youth Organization':         '#00c875',
  'Cultural':                   '#a358df',
  'sports':                     '#e2445c',
  'special Projects':           '#fdab3d',
  'Career guidance':            '#0086c0',
  'Vocational Training':        '#037f4c',
  'Foreign and Youth Award':    '#0073ea',
  'media and Nisco Video':      '#bb3354',
  'agri and Enterprenurship':   '#00c875',
  'Construction':               '#fdab3d',
  'procument':                  '#0073ea',
  'staff training':             '#037f4c',
  'IT':                         '#0086c0',
  'Planning':                   '#a358df',
  'Exam':                       '#e2445c',
  'HR':                         '#0073ea',
  'Legal':                      '#e2445c',
  'Internal Audit':             '#fdab3d',
  'Accounts':                   '#037f4c',
  'Transport':                  '#0086c0',
  'Other':                      '#0073ea',
}

// ─── Near-match overrides (trimmed old name → canonical trimmed old name) ─────
// Handles double spaces, spelling variants, etc.
// Format: 'raw trimmed old name' → 'canonical match to attempt'
// These are resolved by name in the DB; if still no match, flagged in report.
// For rows where old name IS the new name, we just need to find and rename.

// ─── Rows with "/" in old name that is abbreviation (NOT separator) ───────────
const SLASH_NOT_SEPARATOR = new Set([
  'සී/ස තරුණ සේවා සමාගමේ කාර්යයන්',  // row 39: "සී/ස" is abbreviation
])

function trim(s) {
  return (s || '').trim()
}

function splitSources(oldName) {
  const t = trim(oldName)
  if (!t) return []
  // If the full trimmed string is in the "not separator" set, treat as single
  if (SLASH_NOT_SEPARATOR.has(t)) return [t]
  // Split on " / " (with spaces) to avoid splitting abbreviations like "සී/ස"
  if (t.includes(' / ')) return t.split(' / ').map(s => s.trim()).filter(Boolean)
  // Also split on "/" alone if surrounded by spaces in the raw string
  if (t.includes('/') && !SLASH_NOT_SEPARATOR.has(t)) {
    // Only split if there are multiple meaningful parts
    const parts = t.split('/').map(s => s.trim()).filter(Boolean)
    if (parts.length > 1 && parts.every(p => p.length > 3)) return parts
  }
  return [t]
}

async function main() {
  console.log(`\n=== TaskWise Category Migration${DRY_RUN ? ' [DRY RUN — no changes will be made]' : ''} ===\n`)

  // Get workspace + director
  const workspace = await prisma.workspace.findFirst({ include: { director: { select: { id: true } } } })
  if (!workspace) { console.error('No workspace found!'); process.exit(1) }
  const workspaceId = workspace.id
  const directorId = workspace.director?.id
  if (!directorId) { console.error('No director found for workspace!'); process.exit(1) }
  console.log(`Workspace: ${workspace.name} (${workspaceId})\n`)

  // ── Step 1: Ensure Uncategorized system category exists ──────────────────────
  let uncategorized = await prisma.projectCategory.findFirst({ where: { workspaceId, isSystem: true } })
  if (!uncategorized) {
    if (DRY_RUN) {
      // Use a placeholder so the rest of the script can reference it
      uncategorized = { id: '[new-uncategorized]', name: 'Uncategorized' }
      console.log('[DRY RUN] Would create system category: Uncategorized')
    } else {
      uncategorized = await prisma.projectCategory.create({
        data: { workspaceId, name: 'Uncategorized', isSystem: true, color: '#c4c4c4' }
      })
      console.log('Created system category: Uncategorized')
    }
  } else {
    console.log(`Found existing system category: ${uncategorized.name} (${uncategorized.id})`)
  }

  // ── Step 2: Read Excel ────────────────────────────────────────────────────────
  const xlsxPath = join(__dirname, '..', 'task_wise_project_list_2.xlsx')
  if (!existsSync(xlsxPath)) {
    console.error('Excel file not found at:', xlsxPath)
    console.error('Upload it to the server beside this script and try again.')
    process.exit(1)
  }
  const wb = XLSX.readFile(xlsxPath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })

  // Parse rows (skip header row 0)
  const entries = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const newName = trim(row[0])
    const categoryName = trim(row[1])
    const oldName = trim(row[2])
    if (!newName && !categoryName) continue
    entries.push({ rowNum: i + 1, newName, categoryName, oldName })
  }

  console.log(`Loaded ${entries.length} project rows from Excel\n`)

  // ── Step 3: Create all unique categories ─────────────────────────────────────
  const uniqueCategoryNames = [...new Set(entries.map(e => e.categoryName).filter(Boolean))]
  console.log(`Creating/finding ${uniqueCategoryNames.length} categories...`)

  const categoryMap = new Map()
  let dryRunCatSeq = 0

  for (const catName of uniqueCategoryNames) {
    let cat = await prisma.projectCategory.findFirst({
      where: { workspaceId, name: { equals: catName, mode: 'insensitive' }, isSystem: false }
    })
    if (!cat) {
      if (DRY_RUN) {
        cat = { id: `[new-cat-${++dryRunCatSeq}]`, name: catName, color: CATEGORY_COLORS[catName] || '#0073ea' }
        console.log(`  [DRY RUN] Would CREATE category: "${catName}"`)
      } else {
        cat = await prisma.projectCategory.create({
          data: { workspaceId, name: catName, color: CATEGORY_COLORS[catName] || '#0073ea' }
        })
        console.log(`  CREATED category: "${catName}"`)
      }
    } else {
      console.log(`  FOUND   category: "${catName}" (${cat.id})`)
    }
    categoryMap.set(catName, cat)
  }

  // ── Step 4: Get all current projects ─────────────────────────────────────────
  const allProjects = await prisma.project.findMany({ where: { workspaceId } })
  console.log(`\nFound ${allProjects.length} existing projects in workspace\n`)

  // Build a lookup: trimmed name (lowercase) → project record
  const projectByName = new Map()
  for (const p of allProjects) {
    projectByName.set(p.name.trim().toLowerCase(), p)
  }

  const report = { created: [], renamed: [], categorized: [], merged: [], notFound: [], skipped: [] }

  // ── Step 5: Process each Excel row ───────────────────────────────────────────
  for (const entry of entries) {
    const { rowNum, newName, categoryName, oldName } = entry
    const cat = categoryMap.get(categoryName)
    if (!cat) {
      report.skipped.push(`Row ${rowNum}: No category "${categoryName}" — skipping "${newName}"`)
      continue
    }

    const sources = splitSources(oldName)

    if (sources.length === 0) {
      // No old name — check if new name already exists, else create
      const existing = projectByName.get(newName.toLowerCase())
      if (existing) {
        const updates = {}
        if (existing.name.trim() !== newName) updates.name = newName
        updates.categoryId = cat.id
        if (!DRY_RUN) await prisma.project.update({ where: { id: existing.id }, data: updates })
        report.categorized.push(`Row ${rowNum}: "${existing.name.trim()}" → cat "${cat.name}"${updates.name ? ` (renamed to "${newName}")` : ''}`)
        projectByName.delete(existing.name.trim().toLowerCase())
        existing.name = newName
        existing.categoryId = cat.id
        projectByName.set(newName.toLowerCase(), existing)
      } else {
        if (!DRY_RUN) {
          const newProject = await prisma.project.create({
            data: { workspaceId, directorId, name: newName, color: cat.color, categoryId: cat.id }
          })
          projectByName.set(newName.toLowerCase(), newProject)
        }
        report.created.push(`Row ${rowNum}: ${DRY_RUN ? '[DRY RUN] Would CREATE' : 'CREATED'} "${newName}" in cat "${cat.name}"`)
      }
    } else if (sources.length === 1) {
      // Single old name → find and rename/categorize
      const srcName = sources[0]
      const existing = findProjectFuzzy(projectByName, srcName)
      if (!existing) {
        const byNew = projectByName.get(newName.toLowerCase())
        if (byNew) {
          if (!DRY_RUN) await prisma.project.update({ where: { id: byNew.id }, data: { categoryId: cat.id } })
          report.categorized.push(`Row ${rowNum}: Already named "${newName}" — categorized to "${cat.name}"`)
        } else {
          report.notFound.push(`Row ${rowNum}: OLD="${srcName}" → NEW="${newName}" — project NOT FOUND`)
        }
        continue
      }
      const oldProjectName = existing.name.trim()
      if (!DRY_RUN) await prisma.project.update({ where: { id: existing.id }, data: { name: newName, categoryId: cat.id } })
      report.renamed.push(`Row ${rowNum}: "${oldProjectName}" → "${newName}" (cat: "${cat.name}")`)
      projectByName.delete(oldProjectName.toLowerCase())
      existing.name = newName
      existing.categoryId = cat.id
      projectByName.set(newName.toLowerCase(), existing)
    } else {
      // Multiple sources → merge
      let targetProject = projectByName.get(newName.toLowerCase())
      const sourceProjects = []
      for (const srcName of sources) {
        const found = findProjectFuzzy(projectByName, srcName)
        if (found) {
          if (found.name.trim().toLowerCase() === newName.toLowerCase()) {
            targetProject = found
          } else {
            sourceProjects.push(found)
          }
        } else {
          report.notFound.push(`Row ${rowNum}: Source "${srcName}" not found (for merge into "${newName}")`)
        }
      }

      if (!targetProject) {
        if (!DRY_RUN) {
          targetProject = await prisma.project.create({
            data: { workspaceId, directorId, name: newName, color: cat.color, categoryId: cat.id }
          })
          projectByName.set(newName.toLowerCase(), targetProject)
        } else {
          targetProject = { id: `[new-${newName}]`, name: newName }
        }
        report.created.push(`Row ${rowNum}: ${DRY_RUN ? '[DRY RUN] Would CREATE' : 'CREATED'} target "${newName}" for merge`)
      } else {
        if (!DRY_RUN) await prisma.project.update({ where: { id: targetProject.id }, data: { name: newName, categoryId: cat.id } })
        projectByName.delete(targetProject.name.trim().toLowerCase())
        targetProject.name = newName
        targetProject.categoryId = cat.id
        projectByName.set(newName.toLowerCase(), targetProject)
      }

      for (const src of sourceProjects) {
        const movedCount = await prisma.task.count({ where: { projectId: src.id } })
        if (!DRY_RUN) {
          if (movedCount > 0) await prisma.task.updateMany({ where: { projectId: src.id }, data: { projectId: targetProject.id } })
          await prisma.project.update({ where: { id: src.id }, data: { status: 'archived', categoryId: uncategorized.id } })
        }
        report.merged.push(`Row ${rowNum}: ${DRY_RUN ? '[DRY RUN] Would merge' : 'Merged'} "${src.name.trim()}" (${movedCount} tasks) → "${newName}", source ${DRY_RUN ? 'would be' : ''} archived`)
        projectByName.delete(src.name.trim().toLowerCase())
      }
    }
  }

  // ── Step 6: Assign remaining un-categorized projects to Uncategorized ─────────
  const uncategorizedProjects = await prisma.project.findMany({
    where: { workspaceId, categoryId: null, deletedAt: null }
  })
  if (uncategorizedProjects.length > 0) {
    if (!DRY_RUN) {
      await prisma.project.updateMany({ where: { workspaceId, categoryId: null }, data: { categoryId: uncategorized.id } })
    }
    console.log(`\n${DRY_RUN ? '[DRY RUN] Would assign' : 'Assigned'} ${uncategorizedProjects.length} remaining projects to Uncategorized:`)
    uncategorizedProjects.forEach(p => console.log(`  - "${p.name.trim()}"`))
  }

  // ── Step 7: Report ────────────────────────────────────────────────────────────
  console.log('\n=== MIGRATION REPORT ===\n')
  if (report.created.length)    { console.log('CREATED:');      report.created.forEach(l => console.log(' ', l)) }
  if (report.renamed.length)    { console.log('\nRENAMED:');     report.renamed.forEach(l => console.log(' ', l)) }
  if (report.categorized.length){ console.log('\nCATEGORIZED:'); report.categorized.forEach(l => console.log(' ', l)) }
  if (report.merged.length)     { console.log('\nMERGED:');      report.merged.forEach(l => console.log(' ', l)) }
  if (report.notFound.length)   { console.log('\n⚠ NOT FOUND:'); report.notFound.forEach(l => console.log(' ', l)) }
  if (report.skipped.length)    { console.log('\nSKIPPED:');     report.skipped.forEach(l => console.log(' ', l)) }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No changes were made. Re-run without --dry-run to apply.\n')
  } else {
    console.log('\nDone.\n')
  }
}

// ─── Fuzzy project finder ─────────────────────────────────────────────────────

function normalize(s) {
  return (s || '').trim().toLowerCase()
    .replace(/\s+/g, ' ')          // collapse multiple spaces
    .replace(/labour/g, 'labor')   // labour/labor variant
    .replace(/syestem/g, 'system') // known typo
}

function findProjectFuzzy(projectByName, searchName) {
  const key = searchName.trim().toLowerCase()
  // Exact match (trimmed, lowercase)
  if (projectByName.has(key)) return projectByName.get(key)
  // Normalized match (collapse spaces, spelling variants)
  const norm = normalize(searchName)
  for (const [k, v] of projectByName) {
    if (normalize(k) === norm) return v
  }
  return null
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
