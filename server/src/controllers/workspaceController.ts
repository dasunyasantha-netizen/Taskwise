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
    const { name, email, password, departmentId, phone } = req.body
    if (!name || !email || !password || !departmentId) { res.status(400).json({ error: 'name, email, password, departmentId required' }); return }
    const dept = await prisma.department.findFirst({ where: { id: departmentId, workspaceId: req.user!.workspaceId, deletedAt: null } })
    if (!dept) { res.status(404).json({ error: 'Department not found' }); return }
    const existing = await prisma.personnel.findFirst({ where: { email, workspaceId: req.user!.workspaceId, deletedAt: null } })
    if (existing) { res.status(409).json({ error: 'Email already in use in this workspace' }); return }
    const hashed = await bcrypt.hash(password, 12)
    const person = await prisma.personnel.create({ data: { name, email, password: hashed, departmentId, workspaceId: req.user!.workspaceId, phone } })
    const { password: _p, ...safe } = person
    res.status(201).json(safe)
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
    const { name, phone, avatarUrl } = req.body
    const updated = await prisma.personnel.update({ where: { id: req.params.id }, data: { name, phone, avatarUrl } })
    const { password: _p, ...safe } = updated
    res.json(safe)
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
