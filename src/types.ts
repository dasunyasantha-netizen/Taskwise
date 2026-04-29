// ─── Auth ───────────────────────────────────────────────────────────────────

export type ActorType = 'director' | 'personnel'

export interface AuthUser {
  actorId: string
  actorType: ActorType
  workspaceId: string
  name: string
  phone?: string
  email?: string
  nic?: string
  avatarUrl?: string
  layerNumber?: number
  departmentId?: string
  companyName?: string
  companyLogo?: string
  mustChangePassword?: boolean
}

// ─── Workspace & Hierarchy ───────────────────────────────────────────────────

export interface Workspace {
  id: string
  name: string
  companyName?: string
  companyLogo?: string
  createdAt: string
}

export interface Layer {
  id: string
  workspaceId: string
  number: 1 | 2 | 3
  name: string
  departments: Department[]
}

export interface Department {
  id: string
  layerId: string
  workspaceId: string
  name: string
  deletedAt: string | null
  personnel?: Personnel[]
}

export interface Personnel {
  id: string
  workspaceId: string
  departmentId: string
  department?: Department
  phone: string
  email?: string
  nic?: string
  name: string
  avatarUrl?: string
  supervisorId?: string | null
  supervisor?: { id: string; name: string } | null
  deletedAt: string | null
  createdAt: string
}

export interface Group {
  id: string
  workspaceId: string
  departmentId: string
  department?: Department
  name: string
  members?: GroupMember[]
  deletedAt: string | null
}

export interface GroupMember {
  id: string
  groupId: string
  personnelId: string
  personnel?: Personnel
  createdAt: string
}

// ─── Projects ────────────────────────────────────────────────────────────────

export interface Project {
  id: string
  workspaceId: string
  name: string
  description?: string
  color: string
  status: 'active' | 'archived'
  deletedAt: string | null
  createdAt: string
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export type TaskStatus =
  | 'PENDING'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'RETURNED'
  | 'REJECTED'
  | 'CANCELLED'

export type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export interface TaskAssignment {
  id: string
  taskId: string
  departmentId?: string
  department?: Department
  groupId?: string
  group?: Group
  personnelId?: string
  personnel?: Personnel
  assignedAt: string
}

export interface Task {
  id: string
  workspaceId: string
  projectId: string
  project?: Project
  parentTaskId?: string
  parent?: Task
  subtasks?: Task[]
  title: string
  description?: string
  priority: TaskPriority
  status: TaskStatus
  deadline?: string
  deadlineSetById?: string
  deadlineSetByType?: ActorType
  approvalById?: string
  approvalByType?: string
  actedById?: string
  actedByType?: ActorType
  actedByName?: string
  startedAt?: string
  returnReason?: string
  returnedAt?: string
  cancelledAt?: string
  cancelReason?: string
  deletedAt?: string
  createdAt: string
  updatedAt: string
  assignments: TaskAssignment[]
  _count?: { subtasks: number; comments: number }
}

export interface TaskComment {
  id: string
  taskId: string
  authorPersonnelId?: string
  authorDirectorId?: string
  authorType: ActorType
  authorName?: string
  content: string
  createdAt: string
}

// ─── Progress Logs ───────────────────────────────────────────────────────────

export interface TaskProgressLog {
  id: string
  taskId: string
  workspaceId: string
  authorPersonnelId?: string
  authorDirectorId?: string
  authorType: ActorType
  authorName?: string
  note: string
  logDate: string
  createdAt: string
}

// ─── Notifications ───────────────────────────────────────────────────────────

export type NotificationType =
  | 'task_assigned'
  | 'task_returned'
  | 'task_submitted_for_approval'
  | 'task_approved'
  | 'task_rejected'
  | 'task_deadline_warning'
  | 'subtask_created'
  | 'subtask_all_approved'
  | 'comment_added'
  | 'personnel_moved'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  taskId?: string
  isRead: boolean
  readAt?: string
  createdAt: string
}

// ─── Audit ───────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string
  workspaceId: string
  taskId?: string
  event: string
  actorType: ActorType
  actorName?: string
  payload?: { reason?: string; title?: string; action?: string; [key: string]: string | undefined }
  createdAt: string
}

// ─── UI State ────────────────────────────────────────────────────────────────

export type ViewMode =
  | 'login'
  | 'director_dashboard'
  | 'project_board'
  | 'project_list'
  | 'hierarchy_manager'
  | 'approval_queue'
  | 'personnel_queue'
  | 'personnel_approval_queue'
  | 'audit_log'
  | 'overdue'
  | 'settings'
  | 'profile'
