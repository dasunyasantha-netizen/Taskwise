import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import prisma from '../prisma'
import { isFourLevelWorkspace, resolveSupervisor } from '../helpers/hierarchy'

// Provision a vacant position following an explicit company support request.
// Usage: tsx src/scripts/createLetterAssigner.ts <workspace ID> [--apply]
async function main() {
  const workspaceId = process.argv[2]
  assert.ok(workspaceId, 'Provide a workspace ID')
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } })
  assert.equal(workspace.roleBasedIdentity, true, 'Fixed roles must be enabled')
  const chairmanRoles = await prisma.workspaceRole.findMany({
    where: { workspaceId, director: { isActive: true, name: { equals: 'Chairman', mode: 'insensitive' } } },
    include: { director: true, personnel: { include: { department: { include: { layer: true } } } } },
  })
  assert.equal(chairmanRoles.length, 1, 'Exactly one active Chairman role is required')
  const chairman = chairmanRoles[0]
  assert.ok(chairman.personnel?.isActive && !chairman.personnel.deletedAt, 'Active Chairman reporting position required')
  const level = chairman.personnel.department.layer.number + 1
  const layer = await prisma.layer.findUniqueOrThrow({ where: { workspaceId_number: { workspaceId, number: level } } })
  const admin = await prisma.director.findFirstOrThrow({ where: { isSyswiseAdmin: true, isActive: true } })
  const fourLevel = await isFourLevelWorkspace(workspaceId)
  const supervisor = await resolveSupervisor({ fourLevel, workspaceId,
    level, provided: chairman.personnelId, isCreate: true })
  assert.ok(!('error' in supervisor), 'Reporting relationship must satisfy the company hierarchy')
  const plan = { company: workspace.companyName || workspace.name, role: 'Letter Assigner', department: 'Correspondence',
    reportsTo: chairman.director!.name, level, phoneAssigned: false, managesCompanyLetters: true }
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ dryRun: true, ...plan })); return }
  const password = await bcrypt.hash(randomBytes(32).toString('base64url'), 12)
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId + ':letter-assigner'}))`
    const existing = await tx.workspaceRole.findMany({ where: { workspaceId,
      personnel: { name: { equals: 'Letter Assigner', mode: 'insensitive' } } }, include: { personnel: true } })
    assert.ok(existing.length <= 1, 'Multiple Letter Assigner roles exist; review before provisioning')
    if (existing.length) {
      const position = existing[0].personnel!
      assert.ok(position.isActive && !position.deletedAt && position.supervisorId === chairman.personnelId && position.isLetterAssigner,
        'Existing role differs from the requested configuration; review it first')
      return { id: existing[0].id, created: false }
    }
    const company = await tx.company.findUniqueOrThrow({ where: { workspaceId } })
    assert.equal(company.status, 'ACTIVE')
    let department = await tx.department.findFirst({ where: { workspaceId, layerId: layer.id,
      name: 'Correspondence', deletedAt: null } })
    if (!department) {
      department = await tx.department.create({ data: { workspaceId, layerId: layer.id, name: 'Correspondence',
        officeCategory: fourLevel && [2, 3].includes(level) ? 'HEAD_OFFICE' : null } })
      await tx.auditLog.create({ data: { workspaceId, actorType: 'director', actorDirectorId: admin.id,
        event: 'DEPARTMENT_CREATED', payload: { departmentId: department.id, name: department.name,
          source: 'approved-company-support-request' } } })
    }
    const id = randomUUID()
    await tx.personnel.create({ data: { id, workspaceId, companyId: company.id, departmentId: department.id,
      supervisorId: chairman.personnelId, name: 'Letter Assigner', phone: '', loginId: 'role:' + id,
      password, mustChangePassword: false, isLetterAssigner: true } })
    await tx.workspaceRole.create({ data: { id, workspaceId, personnelId: id } })
    await tx.auditLog.create({ data: { workspaceId, actorType: 'director', actorDirectorId: admin.id,
      event: 'ROLE_CREATED', payload: { roleId: id, name: 'Letter Assigner', departmentId: department.id,
        supervisorId: chairman.personnelId, isLetterAssigner: true, source: 'approved-company-support-request' } } })
    return { id, created: true }
  })
  console.log(JSON.stringify({ ...result, ...plan }))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(() => prisma.$disconnect())
