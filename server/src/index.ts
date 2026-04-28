import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

import authRoutes        from './routes/authRoutes'
import workspaceRoutes   from './routes/workspaceRoutes'
import projectRoutes     from './routes/projectRoutes'
import taskRoutes        from './routes/taskRoutes'
import notificationRoutes from './routes/notificationRoutes'
import auditRoutes       from './routes/auditRoutes'

const app  = express()
const PORT = process.env.PORT || 4300

app.use(cors({
  origin: [
    'http://localhost:3500',
    'http://localhost:3100',
    'https://syswise.lk',
  ],
  credentials: true,
}))

app.use(express.json({ limit: '2mb' }))  // allow avatar/logo base64 payloads up to ~1.5MB

// Routes
app.use('/api/auth',          authRoutes)
app.use('/api/workspace',     workspaceRoutes)
app.use('/api/projects',      projectRoutes)
app.use('/api/tasks',         taskRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/audit',         auditRoutes)
app.use('/api/reports',       auditRoutes)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'taskwise-backend', timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`TaskWise backend running on port ${PORT}`)
})

export default app
