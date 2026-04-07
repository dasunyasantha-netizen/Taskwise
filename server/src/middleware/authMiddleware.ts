import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthPayload {
  actorId: string
  actorType: 'director' | 'personnel'
  workspaceId: string
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
  if (req.user?.actorType !== 'director') {
    res.status(403).json({ error: 'Director access required' })
    return
  }
  next()
}
