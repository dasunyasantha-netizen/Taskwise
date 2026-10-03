import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import prisma from '../prisma'
import { getEnabledFeatures } from '../helpers/features'
import { ysoRole } from '../helpers/ysoAccess'
import { checkPublicThrottle } from '../helpers/publicThrottle'
import { fixedRoleMetadata, isRoleAlias } from '../helpers/fixedRoles'

type Assignment = { actorType: 'director' | 'personnel'; actorId: string; workspaceId: string; assignmentVersion: number }
type Choice = jwt.JwtPayload & { purpose: string; syswiseUserId: number; assignments: Assignment[] }

async function availableRole(a: Assignment) {
  if (await isRoleAlias(a.actorType, a.actorId)) return null
  const contact = await prisma.migrationRoleContact.findUnique({ where: { actorType_actorId: { actorType: a.actorType, actorId: a.actorId } } })
  if (!contact || contact.assignmentVersion !== a.assignmentVersion || contact.workspaceId !== a.workspaceId) return null
  const actor = a.actorType === 'director'
    ? await prisma.director.findUnique({ where: { id: a.actorId }, include: { company: true } })
    : await prisma.personnel.findUnique({ where: { id: a.actorId }, include: { company: true, department: { include: { layer: true } } } })
  if (!actor?.isActive || actor.workspaceId !== a.workspaceId || ('deletedAt' in actor && actor.deletedAt) || (actor.company && actor.company.status !== 'ACTIVE')) return null
  const workspace = await prisma.workspace.findUnique({ where: { id: a.workspaceId } })
  if (!workspace) return null
  return { contact, actor, workspace }
}

// A one-use, 60-second Syswise launch code is redeemed on the server. No
// platform access token or arbitrary browser-supplied phone is accepted.
export async function exchangeSyswiseCode(req: Request, res: Response): Promise<void> {
  if (!checkPublicThrottle(`identity-exchange:${req.ip}`, 60, 60_000)) { res.status(429).json({ error: 'Please wait and try again.' }); return }
  const code = String(req.body?.code || '')
  const base = process.env.SYSWISE_BASE_URL?.replace(/\/$/, '')
  const key = process.env.SYSWISE_TASKWISE_SERVICE_KEY
  if (!base || !key) { res.status(503).json({ error: 'Syswise sign-in is temporarily unavailable.' }); return }
  if (!/^[A-Za-z0-9_-]{32,100}$/.test(code)) { res.status(400).json({ error: 'Invalid launch code.' }); return }
  try {
    const response = await fetch(`${base}/api/auth/launch-code/exchange/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Service-Key': key },
      body: JSON.stringify({ code }), signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) { res.status(response.status === 400 ? 400 : 403).json({ error: 'This launch expired or access changed. Open Taskwise from Syswise again.' }); return }
    const identity = await response.json() as { user: { id: number }; roles: Assignment[] }
    if (!Number.isSafeInteger(identity.user?.id) || !Array.isArray(identity.roles)) throw new Error('Invalid identity response')
    const assignments: Assignment[] = []
    const roles = []
    for (const a of identity.roles) {
      if (!['director', 'personnel'].includes(a.actorType)) continue
      const role = await availableRole(a)
      if (!role) continue
      const updated = await prisma.migrationRoleContact.updateMany({
        where: { id: role.contact.id, assignmentVersion: a.assignmentVersion },
        data: { syswiseUserId: identity.user.id },
      })
      if (!updated.count) continue
      assignments.push(a)
      roles.push({ contactId: role.contact.id, companyId: role.actor.companyId || role.workspace.id,
        companyName: role.actor.company?.displayName || role.actor.company?.legalName || role.workspace.companyName || role.workspace.name,
        roleName: role.workspace.roleBasedIdentity ? role.actor.name : a.actorType === 'director' ? 'Director' : 'department' in role.actor ? role.actor.department.name : 'Personnel' })
    }
    if (!roles.length) { res.status(403).json({ error: 'No active company role is assigned to your verified account. Contact your director.' }); return }
    const selectionToken = jwt.sign({ purpose: 'taskwise-role-choice', syswiseUserId: identity.user.id, assignments }, process.env.JWT_SECRET!, { expiresIn: '5m' })
    res.setHeader('Cache-Control', 'no-store')
    res.json({ selectionToken, roles })
  } catch { res.status(503).json({ error: 'Could not connect to Syswise. Please try again.' }) }
}

export async function selectSyswiseRole(req: Request, res: Response): Promise<void> {
  try {
    const proof = jwt.verify(String(req.body?.selectionToken || ''), process.env.JWT_SECRET!) as Choice
    if (proof.purpose !== 'taskwise-role-choice' || !Number.isSafeInteger(proof.syswiseUserId) || !Array.isArray(proof.assignments)) throw new Error('Invalid choice')
    const contact = await prisma.migrationRoleContact.findUnique({ where: { id: String(req.body?.contactId || '') } })
    const a = contact && proof.assignments.find(a => a.actorId === contact.actorId && a.actorType === contact.actorType)
    if (!a) { res.status(403).json({ error: 'That role is not assigned to your account.' }); return }
    const role = await availableRole(a)
    if (!role || role.contact.syswiseUserId !== proof.syswiseUserId) { res.status(403).json({ error: 'This assignment changed. Open Taskwise again.' }); return }
    const { actor, workspace } = role
    const personnel = 'department' in actor ? actor : null
    const features = await getEnabledFeatures(workspace.id)
    const roleMetadata = await fixedRoleMetadata(a.actorType, actor.id, workspace.id)
    const token = jwt.sign({ actorId: actor.id, actorType: a.actorType, workspaceId: workspace.id,
      authenticationMethod: 'syswise', syswiseUserId: proof.syswiseUserId,
      assignmentVersion: a.assignmentVersion,
      ...(personnel ? { layerNumber: personnel.department.layer.number, departmentId: personnel.departmentId } : {}) }, process.env.JWT_SECRET!, { expiresIn: '7d' })
    await prisma.loginLog.create({ data: { actorId: actor.id, actorType: a.actorType, workspaceId: workspace.id,
      actorName: actor.name, ipAddress: req.ip, userAgent: req.headers['user-agent'] } })
    res.setHeader('Cache-Control', 'no-store')
    res.json({ token, user: { actorId: actor.id, actorType: a.actorType, workspaceId: workspace.id,
      ...roleMetadata, syswiseUserId: proof.syswiseUserId, name: actor.name, phone: role.contact.phoneE164, email: role.contact.email,
      avatarUrl: actor.avatarUrl, preferredLanguage: actor.preferredLanguage,
      companyId: actor.companyId, companyPrefix: actor.company?.prefix,
      companyName: actor.company?.displayName || actor.company?.legalName || workspace.companyName || workspace.name,
      companyLogo: workspace.companyLogo, loginId: actor.loginId || actor.phone, mustChangePassword: false,
      ...(!personnel && 'isChairman' in actor ? { isChairman: actor.isChairman, isSyswiseAdmin: actor.isSyswiseAdmin, isCompanyAdmin: actor.isCompanyAdmin } : {}),
      ...(personnel ? { layerNumber: personnel.department.layer.number, departmentId: personnel.departmentId, ysoRole: ysoRole(personnel.department) } : {}), features } })
  } catch { res.status(401).json({ error: 'Your company selection expired. Open Taskwise again.' }) }
}
