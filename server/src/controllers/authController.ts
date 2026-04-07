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

// POST /api/auth/director/register
export async function directorRegister(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, name, workspaceName } = req.body
    if (!email || !password || !name) {
      res.status(400).json({ error: 'email, password, and name are required' })
      return
    }
    const existing = await prisma.director.findUnique({ where: { email } })
    if (existing) {
      res.status(409).json({ error: 'Email already registered' })
      return
    }
    const hashed = await bcrypt.hash(password, 12)
    const director = await prisma.$transaction(async tx => {
      const workspace = await tx.workspace.create({
        data: { name: workspaceName || `${name}'s Workspace` }
      })
      // Seed 3 default layers
      await tx.layer.createMany({
        data: [
          { workspaceId: workspace.id, number: 1, name: 'Layer 1' },
          { workspaceId: workspace.id, number: 2, name: 'Layer 2' },
          { workspaceId: workspace.id, number: 3, name: 'Layer 3' },
        ]
      })
      const dir = await tx.director.create({
        data: { email, password: hashed, name, workspaceId: workspace.id }
      })
      return dir
    })
    const token = signToken(director.id, 'director', director.workspaceId!)
    res.status(201).json({
      token,
      user: { actorId: director.id, actorType: 'director', workspaceId: director.workspaceId, name: director.name, email: director.email }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// POST /api/auth/director/login
export async function directorLogin(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body
    const director = await prisma.director.findUnique({ where: { email } })
    if (!director || !(await bcrypt.compare(password, director.password))) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }
    const token = signToken(director.id, 'director', director.workspaceId!)
    res.json({
      token,
      user: { actorId: director.id, actorType: 'director', workspaceId: director.workspaceId, name: director.name, email: director.email }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// POST /api/auth/personnel/login
export async function personnelLogin(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, workspaceId } = req.body
    if (!workspaceId) {
      res.status(400).json({ error: 'workspaceId is required for personnel login' })
      return
    }
    const personnel = await prisma.personnel.findFirst({
      where: { email, workspaceId, deletedAt: null },
      include: { department: { include: { layer: true } } }
    })
    if (!personnel || !(await bcrypt.compare(password, personnel.password))) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }
    const layerNumber = personnel.department.layer.number
    const token = signToken(personnel.id, 'personnel', personnel.workspaceId, {
      layerNumber,
      departmentId: personnel.departmentId,
    })
    res.json({
      token,
      user: {
        actorId: personnel.id,
        actorType: 'personnel',
        workspaceId: personnel.workspaceId,
        name: personnel.name,
        email: personnel.email,
        layerNumber,
        departmentId: personnel.departmentId,
      }
    })
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
      const director = await prisma.director.findUnique({ where: { id: actorId }, select: { id: true, email: true, name: true, avatarUrl: true, workspaceId: true } })
      res.json({ actorId, actorType, workspaceId, ...director })
    } else {
      const personnel = await prisma.personnel.findUnique({ where: { id: actorId }, select: { id: true, email: true, name: true, avatarUrl: true, departmentId: true, workspaceId: true } })
      res.json({ actorId, actorType, workspaceId, ...personnel })
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
