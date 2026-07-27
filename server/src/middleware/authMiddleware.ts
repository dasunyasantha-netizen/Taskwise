import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import prisma from '../prisma'

export interface AuthPayload {
  actorId: string
  actorType: 'director' | 'personnel'
  workspaceId: string
  layerNumber?: number  // Personnel only: which layer they belong to (1, 2, or 3)
  departmentId?: string // Personnel only: their department
  // Impersonation fields — present only when Chairman is viewing as another user
  impersonationSessionId?: string
  chairmanId?: string
  chairmanName?: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload
    }
  }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization']
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    res.status(401).json({ error: 'No token provided' })
    return
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload
    req.user = payload
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireDirector(req: Request, res: Response, next: NextFunction): void {
  // Allow impersonation tokens where actorType is personnel but real actor is chairman
  const u = req.user
  if (!u) { res.status(403).json({ error: 'Director access required' }); return }
  if (u.actorType !== 'director' && !u.impersonationSessionId) {
    res.status(403).json({ error: 'Director access required' })
    return
  }
  next()
}

export function requireChairman(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.actorType !== 'director') {
    res.status(403).json({ error: 'Chairman access required' })
    return
  }
  // Actual chairman check done in the controller after DB lookup
  next()
}

export async function requireSyswiseAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.actorType !== 'director') {
      res.status(403).json({ error: 'System administrator access required' })
      return
    }
    const director = await prisma.director.findUnique({
      where: { id: req.user.actorId },
      select: { isSyswiseAdmin: true, isActive: true },
    })
    if (!director?.isSyswiseAdmin || !director.isActive) {
      res.status(403).json({ error: 'System administrator access required' })
      return
    }
    next()
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}
