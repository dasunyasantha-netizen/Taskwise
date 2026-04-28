import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../prisma'

// GET /api/workspace
export async function getWorkspace(req: Request, res: Response): Promise<void> {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: req.user!.workspaceId },
      include: { layers: { orderBy: { number: 'asc' }, include: { departments: { where: { deletedAt: null } } } } }
    })
    res.json(workspace)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// PUT /api/workspace  (update company branding — Director only)
export async function updateWorkspace(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const { companyName, companyLogo } = req.body
    const workspace = await prisma.workspace.update({
      where: { id: req.user!.workspaceId },
      data: { companyName, companyLogo }
    })
    res.json(workspace)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/workspace/layers
export async function getLayers(req: Request, res: Response): Promise<void> {
  try {
    const layers = await prisma.layer.findMany({
      where: { workspaceId: req.user!.workspaceId },
      orderBy: { number: 'asc' },
      include: { departments: { where: { deletedAt: null }, include: { personnel: { where: { deletedAt: null } } } } }
    })
    res.json(layers)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// PUT /api/workspace/layers/:id  (rename a layer — Director only)
export async function updateLayer(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const layer = await prisma.layer.findFirst({ where: { id: req.params.id, workspaceId: req.user!.workspaceId } })
    if (!layer) { res.status(404).json({ error: 'Layer not found' }); return }
    const updated = await prisma.layer.update({ where: { id: req.params.id }, data: { name: req.body.name } })
    res.json(updated)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/workspace/departments
export async function getDepartments(req: Request, res: Response): Promise<void> {
  try {
    const depts = await prisma.department.findMany({
      where: { workspaceId: req.user!.workspaceId, deletedAt: null },
      include: { layer: true, _count: { select: { personnel: true } } }
    })
    res.json(depts)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/workspace/departments
export async function createDepartment(req: Request, res: Response): Promise<void> {
  try {
    const { name, layerId } = req.body
    if (!name || !layerId) { res.status(400).json({ error: 'name and layerId required' }); return }
    const layer = await prisma.layer.findFirst({ where: { id: layerId, workspaceId: req.user!.workspaceId } })
    if (!layer) { res.status(404).json({ error: 'Layer not found' }); return }
    const dept = await prisma.department.create({ data: { name, layerId, workspaceId: req.user!.workspaceId } })
    res.status(201).json(dept)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// PUT /api/workspace/departments/:id
export async function updateDepartment(req: Request, res: Response): Promise<void> {
  try {
    const dept = await prisma.department.findFirst({ where: { id: req.params.id, workspaceId: req.user!.workspaceId, deletedAt: null } })
    if (!dept) { res.status(404).json({ error: 'Department not found' }); return }
    const updated = await prisma.department.update({ where: { id: req.params.id }, data: { name: req.body.name } })
    res.json(updated)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// DELETE /api/workspace/departments/:id
export async function deleteDepartment(req: Request, res: Response): Promise<void> {
  try {
    const dept = await prisma.department.findFirst({ where: { id: req.params.id, workspaceId: req.user!.workspaceId, deletedAt: null } })
    if (!dept) { res.status(404).json({ error: 'Department not found' }); return }
    await prisma.department.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/workspace/personnel
export async function getPersonnel(req: Request, res: Response): Promise<void> {
  try {
    const { departmentId, layerId } = req.query as Record<string, string>
    const where: Record<string, unknown> = { workspaceId: req.user!.workspaceId, deletedAt: null }
    if (departmentId) where.departmentId = departmentId
    if (layerId) {
      const depts = await prisma.department.findMany({ where: { layerId, workspaceId: req.user!.workspaceId, deletedAt: null }, select: { id: true } })
      where.departmentId = { in: depts.map(d => d.id) }
    }
    const personnel = await prisma.personnel.findMany({ where, include: { department: { include: { layer: true } } }, orderBy: { name: 'asc' } })
    // Never expose passwords
    res.json(personnel.map(({ password: _p, ...p }) => p))
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/workspace/personnel
export async function createPersonnel(req: Request, res: Response): Promise<void> {
  try {
    const { name, phone, email, nic, departmentId } = req.body
    if (!name || !phone || !departmentId) { res.status(400).json({ error: 'name, phone, departmentId required' }); return }
    const dept = await prisma.department.findFirst({ where: { id: departmentId, workspaceId: req.user!.workspaceId, deletedAt: null } })
    if (!dept) { res.status(404).json({ error: 'Department not found' }); return }
    // Phone is globally unique — check across all workspaces
    const existingPhone = await prisma.personnel.findUnique({ where: { phone } })
    if (existingPhone) { res.status(409).json({ error: 'Phone number already registered' }); return }
    const directorPhone = await prisma.director.findUnique({ where: { phone } })
    if (directorPhone) { res.status(409).json({ error: 'Phone number already registered' }); return }
    if (nic) {
      // NIC is globally unique — check across all workspaces and directors
      const nicPersonnel = await prisma.personnel.findUnique({ where: { nic } })
      if (nicPersonnel) { res.status(409).json({ error: 'NIC already registered' }); return }
      const nicDirector = await prisma.director.findUnique({ where: { nic } })
      if (nicDirector) { res.status(409).json({ error: 'NIC already registered' }); return }
    }
    // Auto-generate password: last 6 digits of phone number
    const tempPassword = phone.replace(/\D/g, '').slice(-6)
    const hashed = await bcrypt.hash(tempPassword, 12)
    const person = await prisma.personnel.create({
      data: { name, phone, email, nic, password: hashed, departmentId, workspaceId: req.user!.workspaceId, mustChangePassword: true }
    })
    const { password: _p, ...safe } = person
    res.status(201).json(safe)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// PUT /api/workspace/profile  — update own profile (works for both directors and personnel)
export async function updateProfile(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType } = req.user!
    const { name, phone, nic, email } = req.body
    if (!name || !phone) { res.status(400).json({ error: 'name and phone are required' }); return }

    // Check phone globally unique (excluding self)
    const dirPhoneConflict = await prisma.director.findFirst({ where: { phone, NOT: actorType === 'director' ? { id: actorId } : undefined } })
    if (dirPhoneConflict) { res.status(409).json({ error: 'Phone number already in use' }); return }
    const perPhoneConflict = await prisma.personnel.findFirst({ where: { phone, NOT: actorType === 'personnel' ? { id: actorId } : undefined } })
    if (perPhoneConflict) { res.status(409).json({ error: 'Phone number already in use' }); return }

    // Check NIC globally unique (excluding self)
    if (nic) {
      const dirNicConflict = await prisma.director.findFirst({ where: { nic, NOT: actorType === 'director' ? { id: actorId } : undefined } })
      if (dirNicConflict) { res.status(409).json({ error: 'NIC already in use' }); return }
      const perNicConflict = await prisma.personnel.findFirst({ where: { nic, NOT: actorType === 'personnel' ? { id: actorId } : undefined } })
      if (perNicConflict) { res.status(409).json({ error: 'NIC already in use' }); return }
    }

    if (actorType === 'director') {
      const updated = await prisma.director.update({ where: { id: actorId }, data: { name, phone, nic: nic || null, email: email || null } })
      const { password: _p, ...safe } = updated
      res.json(safe)
    } else {
      const updated = await prisma.personnel.update({ where: { id: actorId }, data: { name, phone, nic: nic || null, email: email || null } })
      const { password: _p, ...safe } = updated
      res.json(safe)
    }
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e.code === 'P2002') { res.status(409).json({ error: 'Phone or NIC already in use' }); return }
    console.error(err); res.status(500).json({ error: 'Internal server error' })
  }
}

// POST /api/workspace/avatar  — upload profile avatar (accepts base64 data URL)
// Used by both directors and personnel to update their own avatar
export async function uploadAvatar(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType } = req.user!
    const { avatarDataUrl } = req.body
    if (!avatarDataUrl || !avatarDataUrl.startsWith('data:image/')) {
      res.status(400).json({ error: 'avatarDataUrl must be a valid image data URL' }); return
    }
    // Limit: 500KB base64 ≈ ~375KB image
    if (avatarDataUrl.length > 700_000) {
      res.status(400).json({ error: 'Image too large. Please compress further before uploading.' }); return
    }
    if (actorType === 'director') {
      await prisma.director.update({ where: { id: actorId }, data: { avatarUrl: avatarDataUrl } })
    } else {
      await prisma.personnel.update({ where: { id: actorId }, data: { avatarUrl: avatarDataUrl } })
    }
    res.json({ success: true, avatarUrl: avatarDataUrl })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// PUT /api/workspace/personnel/:id
// Directors can update anyone; personnel can only update their own profile
export async function updatePersonnel(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    if (actorType === 'personnel' && actorId !== req.params.id) {
      res.status(403).json({ error: 'You can only update your own profile' }); return
    }
    const person = await prisma.personnel.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null } })
    if (!person) { res.status(404).json({ error: 'Personnel not found' }); return }
    const { name, phone, nic, email, supervisorId } = req.body
    // Directors can set any supervisorId; personnel can set their own supervisorId (for approval chain setup)
    const supervisorUpdate = supervisorId !== undefined
      ? { supervisorId: supervisorId || null }
      : {}
    const updated = await prisma.personnel.update({ where: { id: req.params.id }, data: { name, phone, nic, email, ...supervisorUpdate } })
    const { password: _p, ...safe } = updated
    res.json(safe)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/workspace/personnel/above-me
// Returns personnel one layer above the calling personnel (for supervisor selection)
// Also includes directors if the caller is in layer 1 (top personnel layer)
export async function getPersonnelAboveMe(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    if (actorType !== 'personnel') { res.status(403).json({ error: 'Personnel only' }); return }

    // Get the caller's department and layer
    const me = await prisma.personnel.findFirst({
      where: { id: actorId, workspaceId, deletedAt: null },
      include: { department: { include: { layer: true } } }
    })
    if (!me?.department?.layer) { res.json([]); return }

    const myLayerNumber = me.department.layer.number

    if (myLayerNumber === 1) {
      // Top layer — their supervisors are directors
      const directors = await prisma.director.findMany({ where: { workspaceId }, select: { id: true, name: true, phone: true, email: true } })
      res.json({ type: 'directors', items: directors })
      return
    }

    // Find all departments in the layer one above
    const aboveLayer = await prisma.layer.findFirst({
      where: { workspaceId, number: (myLayerNumber - 1) as 1 | 2 | 3 }
    })
    if (!aboveLayer) { res.json({ type: 'personnel', items: [] }); return }

    const aboveDepts = await prisma.department.findMany({
      where: { layerId: aboveLayer.id, workspaceId, deletedAt: null },
      select: { id: true }
    })
    const abovePersonnel = await prisma.personnel.findMany({
      where: { workspaceId, deletedAt: null, departmentId: { in: aboveDepts.map(d => d.id) } },
      select: { id: true, name: true, phone: true, email: true, departmentId: true, department: { select: { name: true } } },
      orderBy: { name: 'asc' }
    })
    res.json({ type: 'personnel', items: abovePersonnel })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// PUT /api/workspace/personnel/:id/move  (Director only)
export async function movePersonnel(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const { departmentId } = req.body
    const person = await prisma.personnel.findFirst({ where: { id: req.params.id, workspaceId: req.user!.workspaceId, deletedAt: null } })
    if (!person) { res.status(404).json({ error: 'Personnel not found' }); return }
    const dept = await prisma.department.findFirst({ where: { id: departmentId, workspaceId: req.user!.workspaceId, deletedAt: null } })
    if (!dept) { res.status(404).json({ error: 'Target department not found' }); return }
    const updated = await prisma.$transaction(async tx => {
      const p = await tx.personnel.update({ where: { id: req.params.id }, data: { departmentId } })
      await tx.auditLog.create({ data: { workspaceId: req.user!.workspaceId, event: 'PERSONNEL_MOVED', actorDirectorId: req.user!.actorId, actorType: 'director', payload: { personnelId: p.id, from: person.departmentId, to: departmentId } } })
      return p
    })
    const { password: _p, ...safe } = updated
    res.json(safe)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// DELETE /api/workspace/personnel/:id
export async function deletePersonnel(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const person = await prisma.personnel.findFirst({ where: { id: req.params.id, workspaceId: req.user!.workspaceId, deletedAt: null } })
    if (!person) { res.status(404).json({ error: 'Personnel not found' }); return }
    await prisma.personnel.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/workspace/personnel/:id/queue
export async function getPersonnelQueue(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const { actorId, actorType, workspaceId } = req.user!

    // Personnel can only view their own queue; Directors can view anyone's
    if (actorType === 'personnel' && actorId !== id) {
      res.status(403).json({ error: 'You can only view your own task queue' }); return
    }

    const tasks = await prisma.task.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        assignments: { some: { personnelId: id } },
        status: { notIn: ['APPROVED', 'CANCELLED'] }
      },
      include: { project: true, assignments: true, _count: { select: { subtasks: true, comments: true } } },
      orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }]
    })
    res.json(tasks)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// GET /api/workspace/groups
export async function getGroups(req: Request, res: Response): Promise<void> {
  try {
    const { departmentId } = req.query as Record<string, string>
    const where: Record<string, unknown> = { workspaceId: req.user!.workspaceId, deletedAt: null }
    if (departmentId) where.departmentId = departmentId
    const groups = await prisma.group.findMany({ where, include: { members: { include: { personnel: { select: { id: true, name: true, avatarUrl: true } } } }, department: true } })
    res.json(groups)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/workspace/groups
export async function createGroup(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const { name, departmentId } = req.body
    if (!name || !departmentId) { res.status(400).json({ error: 'name and departmentId required' }); return }
    const dept = await prisma.department.findFirst({ where: { id: departmentId, workspaceId: req.user!.workspaceId, deletedAt: null } })
    if (!dept) { res.status(404).json({ error: 'Department not found' }); return }
    const group = await prisma.group.create({ data: { name, departmentId, workspaceId: req.user!.workspaceId } })
    res.status(201).json(group)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// PUT /api/workspace/groups/:id
export async function updateGroup(req: Request, res: Response): Promise<void> {
  try {
    const group = await prisma.group.findFirst({ where: { id: req.params.id, workspaceId: req.user!.workspaceId, deletedAt: null } })
    if (!group) { res.status(404).json({ error: 'Group not found' }); return }
    const updated = await prisma.group.update({ where: { id: req.params.id }, data: { name: req.body.name } })
    res.json(updated)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// DELETE /api/workspace/groups/:id
export async function deleteGroup(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const group = await prisma.group.findFirst({ where: { id: req.params.id, workspaceId: req.user!.workspaceId, deletedAt: null } })
    if (!group) { res.status(404).json({ error: 'Group not found' }); return }
    await prisma.group.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/workspace/groups/:id/members
export async function addGroupMember(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    const group = await prisma.group.findFirst({ where: { id: req.params.id, workspaceId: req.user!.workspaceId, deletedAt: null } })
    if (!group) { res.status(404).json({ error: 'Group not found' }); return }
    const person = await prisma.personnel.findFirst({ where: { id: req.body.personnelId, departmentId: group.departmentId, deletedAt: null } })
    if (!person) { res.status(400).json({ error: 'Personnel must be in the same department as the group' }); return }
    const member = await prisma.groupMember.create({ data: { groupId: req.params.id, personnelId: req.body.personnelId } })
    res.status(201).json(member)
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'Already a member' }); return }
    console.error(err); res.status(500).json({ error: 'Internal server error' })
  }
}

// DELETE /api/workspace/groups/:id/members/:pid
export async function removeGroupMember(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.actorType !== 'director') { res.status(403).json({ error: 'Director only' }); return }
    await prisma.groupMember.deleteMany({ where: { groupId: req.params.id, personnelId: req.params.pid } })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}
