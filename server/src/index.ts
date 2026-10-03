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
import noticeRoutes      from './routes/noticeRoutes'
import taskGroupRoutes        from './routes/taskGroupRoutes'
import projectCategoryRoutes  from './routes/projectCategoryRoutes'
import companyRequestRoutes   from './routes/companyRequestRoutes'
import insuranceRoutes        from './routes/insuranceRoutes'
import adminRoutes            from './routes/adminRoutes'
import letterRoutes from './routes/letterRoutes'
import { startLetterWorker } from './helpers/letterWorker'
import ysoRoutes              from './routes/ysoRoutes'
import { retryPendingMigrationContacts } from './controllers/migrationContactController'

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

app.use('/api/letters', letterRoutes)

// YSO certificate scans (up to 10 MB, sent base64) are forwarded to Google Drive
app.use('/api/yso/submissions', express.json({ limit: '15mb' }))
app.use(express.json({ limit: '2mb' }))  // allow avatar/logo base64 payloads up to ~1.5MB

// Routes
app.use('/api/auth',          authRoutes)
app.use('/api/workspace',     workspaceRoutes)
app.use('/api/projects',      projectRoutes)
app.use('/api/tasks',         taskRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/audit',         auditRoutes)
app.use('/api/reports',       auditRoutes)
app.use('/api/notices',       noticeRoutes)
app.use('/api/task-groups',        taskGroupRoutes)
app.use('/api/project-categories', projectCategoryRoutes)
app.use('/api/company',            companyRequestRoutes)
app.use('/api/insurance',          insuranceRoutes)
app.use('/api/admin',              adminRoutes)
app.use('/api/yso',                ysoRoutes)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'taskwise-backend', timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`TaskWise backend running on port ${PORT}`)
  startLetterWorker()
  if (process.env.SYSWISE_BASE_URL && process.env.SYSWISE_TASKWISE_SERVICE_KEY) {
    retryPendingMigrationContacts().catch(() => {})
    setInterval(() => retryPendingMigrationContacts().catch(() => {}), 5 * 60 * 1000).unref()
  }
})

export default app
