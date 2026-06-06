import { PrismaClient } from '@prisma/client'
// Temporarily point at production DB for this export
process.env.DATABASE_URL = 'postgresql://syswise_user:SysW1se2026!Secure@5.223.76.20:5432/taskwise_db?schema=public'
import ExcelJS from 'exceljs'
import path from 'path'
import os from 'os'

const prisma = new PrismaClient()

const tasks = await prisma.task.findMany({
  where: { deletedAt: null, parentTaskId: null },
  include: {
    project: { select: { name: true } },
    assignments: {
      include: {
        personnel: { select: { id: true, name: true, supervisorId: true } },
        department: { select: { name: true } },
      },
    },
  },
  orderBy: { createdAt: 'asc' },
})

// Build a map of all personnel for supervisor chain lookups
const allPersonnel = await prisma.personnel.findMany({
  where: { deletedAt: null },
  select: { id: true, name: true, supervisorId: true },
})
const personnelMap = new Map(allPersonnel.map(p => [p.id, p]))

function getSupervisorName(personnelId, level) {
  let current = personnelMap.get(personnelId)
  for (let i = 0; i < level; i++) {
    if (!current?.supervisorId) return '—'
    current = personnelMap.get(current.supervisorId)
  }
  return current?.name ?? '—'
}

const workbook = new ExcelJS.Workbook()
const sheet = workbook.addWorksheet('Tasks')

sheet.columns = [
  { header: 'Task',        key: 'task',        width: 50 },
  { header: 'Status',      key: 'status',      width: 15 },
  { header: 'Priority',    key: 'priority',    width: 12 },
  { header: 'Project',     key: 'project',     width: 30 },
  { header: 'Assigned To', key: 'assignedTo',  width: 30 },
  { header: 'Supervisor 1',key: 'supervisor1', width: 30 },
  { header: 'Supervisor 2',key: 'supervisor2', width: 30 },
  { header: 'Deadline',    key: 'deadline',    width: 15 },
  { header: 'Created',     key: 'created',     width: 15 },
]

// Header row styling
const headerRow = sheet.getRow(1)
headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0073EA' } }
headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
headerRow.height = 22

const STATUS_DISPLAY = {
  PENDING: 'Pending', ASSIGNED: 'Assigned', IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted', APPROVED: 'Approved', RETURNED: 'Returned',
  REJECTED: 'Rejected', CANCELLED: 'Cancelled',
}

for (const task of tasks) {
  const personnelAssignees = task.assignments.filter(a => a.personnelId && a.personnel)
  const deptAssignees      = task.assignments.filter(a => a.departmentId && !a.personnelId)

  const assignedToNames = [
    ...personnelAssignees.map(a => a.personnel.name),
    ...deptAssignees.map(a => a.department?.name ?? '—'),
  ].join(', ') || '—'

  // Supervisor chain from first personnel assignee
  const firstPersonnel = personnelAssignees[0]?.personnel
  const sup1 = firstPersonnel ? getSupervisorName(firstPersonnel.id, 1) : '—'
  const sup2 = firstPersonnel ? getSupervisorName(firstPersonnel.id, 2) : '—'

  const row = sheet.addRow({
    task:        task.title,
    status:      STATUS_DISPLAY[task.status] ?? task.status,
    priority:    task.priority,
    project:     task.project?.name ?? '—',
    assignedTo:  assignedToNames,
    supervisor1: sup1,
    supervisor2: sup2,
    deadline:    task.deadline ? new Date(task.deadline).toLocaleDateString('en-GB') : '—',
    created:     new Date(task.createdAt).toLocaleDateString('en-GB'),
  })

  // Colour status cell
  const statusColors = {
    APPROVED: 'FFD1FAE5', CANCELLED: 'FFF3F4F6', SUBMITTED: 'FFEDE9FE',
    IN_PROGRESS: 'FFFEF3C7', RETURNED: 'FFFFF7ED', REJECTED: 'FFFEE2E2',
    ASSIGNED: 'FFDBEAFE', PENDING: 'FFF3F4F6',
  }
  const bg = statusColors[task.status]
  if (bg) {
    row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
  }

  row.alignment = { vertical: 'middle', wrapText: false }
}

// Freeze header
sheet.views = [{ state: 'frozen', ySplit: 1 }]

// Auto-filter
sheet.autoFilter = { from: 'A1', to: 'I1' }

const outPath = path.join(os.homedir(), 'OneDrive', 'Desktop', `TaskWise_Export_${new Date().toISOString().slice(0,10)}.xlsx`)
await workbook.xlsx.writeFile(outPath)
console.log(`Saved: ${outPath}`)
console.log(`Rows: ${tasks.length}`)

await prisma.$disconnect()
