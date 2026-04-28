import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../prisma'

function signToken(actorId: string, actorType: 'director' | 'personnel', workspaceId: string, extra?: { layerNumber?: number; departmentId?: string }) {
  return jwt.sign(
    { actorId, actorType, workspaceId, ...extra },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  )
}

// POST /api/auth/login  — unified phone-based login (Director first, then Personnel)
export async function unifiedLogin(req: Request, res: Response): Promise<void> {
  try {
    const { phone, password } = req.body
    if (!phone || !password) {
      res.status(400).json({ error: 'phone and password are required' })
      return
    }

    // 1. Try Director
    const director = await prisma.director.findUnique({ where: { phone } })
    if (director) {
      if (!(await bcrypt.compare(password, director.password))) {
        res.status(401).json({ error: 'Invalid credentials' })
        return
      }
      const token = signToken(director.id, 'director', director.workspaceId!)

      // Load workspace branding
      const workspace = director.workspaceId
        ? await prisma.workspace.findUnique({
            where: { id: director.workspaceId },
            select: { companyName: true, companyLogo: true }
          })
        : null

      res.json({
        token,
        user: {
          actorId: director.id,
          actorType: 'director',
          workspaceId: director.workspaceId,
          name: director.name,
          phone: director.phone,
          email: director.email,
          avatarUrl: director.avatarUrl,
          companyName: workspace?.companyName,
          companyLogo: workspace?.companyLogo,
        }
      })
      return
    }

    // 2. Try Personnel (phone globally unique)
    const personnel = await prisma.personnel.findUnique({
      where: { phone },
      include: { department: { include: { layer: true } } }
    })
    if (personnel?.deletedAt) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }
    if (personnel) {
      if (!(await bcrypt.compare(password, personnel.password))) {
        res.status(401).json({ error: 'Invalid credentials' })
        return
      }
      const layerNumber = personnel.department.layer.number
      const token = signToken(personnel.id, 'personnel', personnel.workspaceId, {
        layerNumber,
        departmentId: personnel.departmentId,
      })

      // Load workspace branding
      const workspace = await prisma.workspace.findUnique({
        where: { id: personnel.workspaceId },
        select: { companyName: true, companyLogo: true }
      })

      res.json({
        token,
        mustChangePassword: personnel.mustChangePassword,
        user: {
          actorId: personnel.id,
          actorType: 'personnel',
          workspaceId: personnel.workspaceId,
          name: personnel.name,
          phone: personnel.phone,
          email: personnel.email,
          avatarUrl: personnel.avatarUrl,
          layerNumber,
          departmentId: personnel.departmentId,
          companyName: workspace?.companyName,
          companyLogo: workspace?.companyLogo,
          mustChangePassword: personnel.mustChangePassword,
        }
      })
      return
    }

    res.status(401).json({ error: 'Invalid credentials' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// POST /api/auth/director/register  — Director creates their workspace (blocked in production UI)
export async function directorRegister(req: Request, res: Response): Promise<void> {
  try {
    const { phone, password, name, workspaceName } = req.body
    if (!phone || !password || !name) {
      res.status(400).json({ error: 'phone, password, and name are required' })
      return
    }
    const existing = await prisma.director.findUnique({ where: { phone } })
    if (existing) {
      res.status(409).json({ error: 'Phone already registered' })
      return
    }
    const hashed = await bcrypt.hash(password, 12)
    const director = await prisma.$transaction(async tx => {
      const workspace = await tx.workspace.create({
        data: { name: workspaceName || `${name}'s Workspace` }
      })
      await tx.layer.createMany({
        data: [
          { workspaceId: workspace.id, number: 1, name: 'Layer 1' },
          { workspaceId: workspace.id, number: 2, name: 'Layer 2' },
          { workspaceId: workspace.id, number: 3, name: 'Layer 3' },
        ]
      })
      const dir = await tx.director.create({
        data: { phone, password: hashed, name, workspaceId: workspace.id }
      })
      return dir
    })
    const token = signToken(director.id, 'director', director.workspaceId!)
    res.status(201).json({
      token,
      user: {
        actorId: director.id,
        actorType: 'director',
        workspaceId: director.workspaceId,
        name: director.name,
        phone: director.phone,
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// POST /api/auth/change-password
export async function changePassword(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType } = req.user!
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'currentPassword and newPassword are required' }); return
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' }); return
    }

    if (actorType === 'director') {
      const director = await prisma.director.findUnique({ where: { id: actorId } })
      if (!director || !(await bcrypt.compare(currentPassword, director.password))) {
        res.status(401).json({ error: 'Current password is incorrect' }); return
      }
      await prisma.director.update({ where: { id: actorId }, data: { password: await bcrypt.hash(newPassword, 12) } })
    } else {
      const personnel = await prisma.personnel.findUnique({ where: { id: actorId } })
      if (!personnel || !(await bcrypt.compare(currentPassword, personnel.password))) {
        res.status(401).json({ error: 'Current password is incorrect' }); return
      }
      await prisma.personnel.update({
        where: { id: actorId },
        data: { password: await bcrypt.hash(newPassword, 12), mustChangePassword: false }
      })
    }
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// GET /api/auth/me
export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, actorType, workspaceId } = req.user!
    if (actorType === 'director') {
      const director = await prisma.director.findUnique({
        where: { id: actorId },
        select: { id: true, phone: true, email: true, nic: true, name: true, avatarUrl: true, workspaceId: true }
      })
      const workspace = workspaceId
        ? await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { companyName: true, companyLogo: true }
          })
        : null
      res.json({ actorId, actorType, workspaceId, ...director, companyName: workspace?.companyName, companyLogo: workspace?.companyLogo })
    } else {
      const personnel = await prisma.personnel.findUnique({
        where: { id: actorId },
        select: { id: true, phone: true, email: true, nic: true, name: true, avatarUrl: true, departmentId: true, workspaceId: true }
      })
      const workspace = workspaceId
        ? await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { companyName: true, companyLogo: true }
          })
        : null
      res.json({ actorId, actorType, workspaceId, ...personnel, companyName: workspace?.companyName, companyLogo: workspace?.companyLogo })
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
