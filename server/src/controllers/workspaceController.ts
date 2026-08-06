import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import prisma from '../prisma'
import { makeLoginId, normalizeSriLankanPhone, companyLoginPrefix } from '../helpers/phone'

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

// GET /api/workspace/managed-users — Chairman only
export async function getManagedUsers(req: Request, res: Response): Promise<void> {
  try {
    const users = await prisma.personnel.findMany({
      where: { workspaceId: req.user!.workspaceId, deletedAt: null },
      select: {
        id: true,
        name: true,
        loginId: true,
        phone: true,
        email: true,
        nic: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
        department: { select: { id: true, name: true, layer: { select: { number: true, name: true } } } },
      },
      orderBy: { name: 'asc' },
    })
    res.json(users)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/workspace/managed-users/:id/reset-password — Chairman only
export async function resetManagedUserPassword(req: Request, res: Response): Promise<void> {
  try {
    const { workspaceId, actorId } = req.user!
    const person = await prisma.personnel.findFirst({
      where: { id: req.params.id, workspaceId, deletedAt: null },
      select: { id: true, name: true, loginId: true, phone: true },
    })
    if (!person) { res.status(404).json({ error: 'User not found in your company' }); return }

    const temporaryPassword = 'Youth@123'
    const password = await bcrypt.hash(temporaryPassword, 12)
    await prisma.$transaction(async tx => {
      await tx.personnel.update({
        where: { id: person.id },
        data: { password, mustChangePassword: true },
      })
      await tx.auditLog.create({
        data: {
          workspaceId,
          event: 'PERSONNEL_PASSWORD_RESET',
          actorType: 'director',
          actorDirectorId: actorId,
          payload: {
            personnelId: person.id,
            personnelName: person.name,
            loginId: person.loginId || person.phone,
            forcePasswordChange: true,
          },
        },
      })
    })

    res.json({
      success: true,
      user: { id: person.id, name: person.name, loginId: person.loginId || person.phone },
      temporaryPassword,
      mustChangePassword: true,
    })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// POST /api/workspace/personnel
export async function createPersonnel(req: Request, res: Response): Promise<void> {
  try {
    const { name, phone, email, nic, departmentId, password, mustChangePassword, isActive } = req.body
    if (!name || !phone || !departmentId) { res.status(400).json({ error: 'name, phone, departmentId required' }); return }
    const dept = await prisma.department.findFirst({ where: { id: departmentId, workspaceId: req.user!.workspaceId, deletedAt: null } })
    if (!dept) { res.status(404).json({ error: 'Department not found' }); return }
    const normalized = normalizeSriLankanPhone(phone)
    const director = req.user!.actorType === 'director'
      ? await prisma.director.findUnique({ where: { id: req.user!.actorId }, include: { company: true } })
      : null
    const companyId = director?.companyId || null
    const companyPrefix = companyLoginPrefix(director?.company)
    const loginId = makeLoginId(companyPrefix, normalized.local)

    if (companyId) {
      const sameCompanyPhone = await prisma.personnel.findFirst({ where: { companyId, normalizedPhone: normalized.canonical, deletedAt: null } })
      if (sameCompanyPhone) { res.status(409).json({ error: 'Phone number already registered in this company' }); return }
    } else {
      const existingPhone = await prisma.personnel.findFirst({ where: { OR: [{ loginId }, { phone: normalized.local }] } })
      if (existingPhone) { res.status(409).json({ error: 'Phone number already registered' }); return }
      const directorPhone = await prisma.director.findFirst({ where: { OR: [{ loginId }, { phone: normalized.local }] } })
      if (directorPhone) { res.status(409).json({ error: 'Phone number already registered' }); return }
    }
    if (nic) {
      // NIC is globally unique — check across all workspaces and directors
      const nicPersonnel = await prisma.personnel.findUnique({ where: { nic } })
      if (nicPersonnel) { res.status(409).json({ error: 'NIC already registered' }); return }
      const nicDirector = await prisma.director.findUnique({ where: { nic } })
      if (nicDirector) { res.status(409).json({ error: 'NIC already registered' }); return }
    }
    // Generate a unique password when the creator leaves the temporary-password
    // field blank. It is returned only in this response and never stored in plain text.
    const temporaryPassword = password ? String(password) : `Tw!7${randomBytes(6).toString('base64url')}`
    const hashed = await bcrypt.hash(temporaryPassword, 12)
    const person = await prisma.personnel.create({
      data: {
        name,
        phone: normalized.local,
        normalizedPhone: normalized.canonical,
        loginId,
        email,
        nic,
        password: hashed,
        departmentId,
        workspaceId: req.user!.workspaceId,
        companyId,
        mustChangePassword: mustChangePassword ?? !password,
        isActive: isActive ?? true,
      }
    })
    const { password: _p, ...safe } = person
    res.status(201).json({ ...safe, temporaryPassword })
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err) {
      const prismaErr = err as { code: string; meta?: { target?: string[] } }
      if (prismaErr.code === 'P2002') {
        const field = prismaErr.meta?.target?.[0] ?? 'field'
        const label = field === 'nic' ? 'NIC' : field === 'phone' ? 'Phone number' : field
        res.status(409).json({ error: `${label} already registered` }); return
      }
    }
    console.error(err); res.status(500).json({ error: 'Internal server error' })
  }
}

// PUT /api/workspace/profile  — update own profile (works for both directors and personnel)
export async function updateProfile(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType } = req.user!
    const { name, phone, nic, email } = req.body
    if (!name || !phone) { res.status(400).json({ error: 'name and phone are required' }); return }
    const normalized = normalizeSriLankanPhone(phone)

    const currentDirector = actorType === 'director' ? await prisma.director.findUnique({ where: { id: actorId }, include: { company: true } }) : null
    const currentPersonnel = actorType === 'personnel' ? await prisma.personnel.findUnique({ where: { id: actorId }, include: { company: true } }) : null
    const companyId = currentDirector?.companyId || currentPersonnel?.companyId || null
    const prefix = companyLoginPrefix(currentDirector?.company ?? currentPersonnel?.company)
    const loginId = makeLoginId(prefix, normalized.local)

    const dirPhoneConflict = await prisma.director.findFirst({ where: { loginId, NOT: actorType === 'director' ? { id: actorId } : undefined } })
    if (dirPhoneConflict) { res.status(409).json({ error: 'Phone number already in use' }); return }
    const perPhoneConflict = await prisma.personnel.findFirst({ where: { ...(companyId ? { companyId, normalizedPhone: normalized.canonical } : { loginId }), NOT: actorType === 'personnel' ? { id: actorId } : undefined } })
    if (perPhoneConflict) { res.status(409).json({ error: 'Phone number already in use' }); return }

    // Check NIC globally unique (excluding self)
    if (nic) {
      const dirNicConflict = await prisma.director.findFirst({ where: { nic, NOT: actorType === 'director' ? { id: actorId } : undefined } })
      if (dirNicConflict) { res.status(409).json({ error: 'NIC already in use' }); return }
      const perNicConflict = await prisma.personnel.findFirst({ where: { nic, NOT: actorType === 'personnel' ? { id: actorId } : undefined } })
      if (perNicConflict) { res.status(409).json({ error: 'NIC already in use' }); return }
    }

    if (actorType === 'director') {
      const updated = await prisma.director.update({ where: { id: actorId }, data: { name, phone: normalized.local, normalizedPhone: normalized.canonical, loginId, nic: nic || null, email: email || null } })
      const { password: _p, ...safe } = updated
      res.json(safe)
    } else {
      const updated = await prisma.personnel.update({ where: { id: actorId }, data: { name, phone: normalized.local, normalizedPhone: normalized.canonical, loginId, nic: nic || null, email: email || null } })
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
    const person = await prisma.personnel.findFirst({ where: { id: req.params.id, workspaceId, deletedAt: null }, include: { company: true } })
    if (!person) { res.status(404).json({ error: 'Personnel not found' }); return }
    const { name, phone, nic, email, supervisorId, departmentId } = req.body

    // If phone is changing, check uniqueness globally
    if (phone && phone !== person.phone) {
      const normalized = normalizeSriLankanPhone(phone)
      const director = req.user!.actorType === 'director'
        ? await prisma.director.findUnique({ where: { id: req.user!.actorId }, include: { company: true } })
        : null
      const targetCompanyId = director?.companyId || person.companyId
      const targetPrefix = companyLoginPrefix(director?.company ?? person.company)
      const loginId = makeLoginId(targetPrefix, normalized.local)
      const phoneConflictPersonnel = await prisma.personnel.findFirst({ where: { ...(targetCompanyId ? { companyId: targetCompanyId, normalizedPhone: normalized.canonical } : { loginId }), NOT: { id: req.params.id } } })
      if (phoneConflictPersonnel) { res.status(409).json({ error: 'Phone number is already in use' }); return }
      const phoneConflictDirector = await prisma.director.findFirst({ where: { loginId } })
      if (phoneConflictDirector) { res.status(409).json({ error: 'Phone number is already in use' }); return }
    }

    // If NIC is changing, check uniqueness globally
    if (nic && nic !== person.nic) {
      const nicConflictPersonnel = await prisma.personnel.findFirst({ where: { nic, NOT: { id: req.params.id } } })
      if (nicConflictPersonnel) { res.status(409).json({ error: 'NIC already in use' }); return }
      const nicConflictDirector = await prisma.director.findFirst({ where: { nic } })
      if (nicConflictDirector) { res.status(409).json({ error: 'NIC already in use' }); return }
    }

    // Directors can set any supervisorId; personnel can set their own supervisorId (for approval chain setup)
    const supervisorUpdate = supervisorId !== undefined ? { supervisorId: supervisorId || null } : {}
    const deptUpdate = actorType === 'director' && departmentId ? { departmentId } : {}

    const normalizedUpdate = phone ? normalizeSriLankanPhone(phone) : null
    const directorForLogin = req.user!.actorType === 'director'
      ? await prisma.director.findUnique({ where: { id: req.user!.actorId }, include: { company: true } })
      : null
    const updatePrefix = companyLoginPrefix(directorForLogin?.company ?? person.company)
    const updated = await prisma.personnel.update({
      where: { id: req.params.id },
      data: {
        name,
        ...(normalizedUpdate ? {
          phone: normalizedUpdate.local,
          normalizedPhone: normalizedUpdate.canonical,
          loginId: makeLoginId(updatePrefix, normalizedUpdate.local),
        } : {}),
        nic: nic || null,
        email: email || null,
        ...supervisorUpdate,
        ...deptUpdate,
      }
    })
    const { password: _p, ...safe } = updated
    res.json(safe)
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      const field = (err as { meta?: { target?: string[] } }).meta?.target?.[0] ?? ''
      const label = field === 'nic' ? 'NIC' : field === 'phone' ? 'Phone number' : 'A unique field'
      res.status(409).json({ error: `${label} already in use` }); return
    }
    console.error(err); res.status(500).json({ error: 'Internal server error' })
  }
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
