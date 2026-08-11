// ─── Auth ───────────────────────────────────────────────────────────────────

export type ActorType = 'director' | 'personnel'

export interface ImpersonationInfo {
  sessionId: string
  adminId: string
  adminName: string
  startedAt: string
  expiresAt: string
  reason: string
}

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
  isChairman?: boolean
  isSyswiseAdmin?: boolean
  isCompanyAdmin?: boolean
  loginId?: string
  companyId?: string
  companyPrefix?: string
  features?: string[]
  impersonation?: ImpersonationInfo
}

// â”€â”€â”€ Fairfirst Insurance Management â”€â”€â”€

export type InsuranceType = 'MOTOR' | 'FIRE' | 'CASUALTY' | 'MARINE' | 'TRAVEL'
export type QuotationStatus = 'ACTIVE' | 'CONVERTED' | 'EXPIRED' | 'RENEWED'

export interface InsuranceSubjectDetails {
  vehicleNumber?: string | null
  vehicleMakeModel?: string | null
  fuelType?: string | null
  vehicleUsage?: string | null
  propertyAddress?: string | null
  propertyType?: string | null
  propertyUsage?: string | null
  riskDescription?: string | null
  businessActivity?: string | null
  cargoDescription?: string | null
  transitFrom?: string | null
  transitTo?: string | null
  conveyance?: string | null
  passportNumber?: string | null
  destination?: string | null
  travelStartDate?: string | null
  travelEndDate?: string | null
}

export interface InsuranceQuotation extends InsuranceSubjectDetails {
  id: string
  workspaceId: string
  quotationNumber: string
  insuranceType: InsuranceType
  customerName: string
  contactNumber: string
  introducer?: string | null
  partner?: string | null
  sumInsured: number
  premium: number
  issueDate: string
  expiresAt: string
  status: QuotationStatus
  notes?: string | null
  createdByName: string
  createdAt: string
  updatedAt: string
  convertedPolicy?: { id: string; policyNumber: string } | null
  renewedFrom?: { id: string; quotationNumber: string } | null
  renewedTo?: Array<{ id: string; quotationNumber: string }>
}

export interface InsurancePolicy extends InsuranceSubjectDetails {
  id: string
  workspaceId: string
  policyNumber: string
  insuranceType: InsuranceType
  customerName: string
  contactNumber: string
  introducer?: string | null
  sumInsured: number
  premium: number
  issueDate: string
  expiryDate: string
  status: 'COMPLETED'
  paid: boolean
  paymentAmount: number
  remainingAmount: number
  paymentUpdatedAt?: string | null
  notes?: string | null
  createdByName: string
  createdAt: string
  updatedAt: string
  sourceQuotation?: { id: string; quotationNumber: string } | null
}

export interface InsuranceSummary {
  activeQuotations: number
  expiredQuotations: number
  convertedQuotations: number
  completedPolicies: number
  unpaidPolicies: number
  expiringPolicies: number
  totalActiveQuotationPremium: number
  totalPolicyPremium: number
  totalPayments: number
  outstandingAmount: number
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

export interface TaskGroup {
  id: string
  workspaceId: string
  name: string
  description?: string
  members?: TaskGroupMember[]
  groupProjects?: TaskGroupProject[]
  deletedAt: string | null
  createdAt: string
}

export interface TaskGroupMember {
  id: string
  groupId: string
  personnelId: string
  personnel?: Personnel
  createdAt: string
}

export interface TaskGroupProject {
  id: string
  groupId: string
  projectId: string
  project?: Project
  createdAt: string
}

// ─── Project Categories ──────────────────────────────────────────────────────

export interface ProjectCategory {
  id: string
  workspaceId: string
  directorId?: string | null
  name: string
  description?: string
  color: string
  status: 'active' | 'archived'
  isSystem: boolean
  createdAt: string
  updatedAt: string
  projects?: Project[]
}

// ─── Projects ────────────────────────────────────────────────────────────────

export interface Project {
  id: string
  workspaceId: string
  name: string
  description?: string
  color: string
  status: 'active' | 'archived'
  directorId?: string | null
  categoryId?: string
  category?: { id: string; name: string; color: string; status: string }
  _count?: { tasks: number }
  deletedAt: string | null
  createdAt: string
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export type TaskStatus =
  | 'PENDING'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
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
  personnelId?: string
  personnel?: Personnel
  assignedAt: string
}

export interface DeadlineExtension {
  id: string
  taskId: string
  workspaceId: string
  oldDeadline: string
  newDeadline: string
  reason: string
  note?: string
  extendedById: string
  extendedByType: ActorType
  extendedByName: string
  createdAt: string
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
  originalDeadline?: string
  deadlineSetById?: string
  deadlineSetByType?: ActorType
  createdByDirectorId?: string
  createdByPersonnelId?: string
  approvalById?: string
  approvalByType?: string
  actedById?: string
  actedByType?: ActorType
  actedByName?: string
  groupTaskId?: string
  groupTask?: Task
  groupTaskInstances?: Task[]
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
  editedAt?: string
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
  | 'company_request_submitted'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  taskId?: string
  payload?: { reference?: string; [key: string]: unknown }
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
  | 'recent_updates'
  | 'broadcasts'
  | 'group_tasks'
  | 'reports'
  | 'impersonation'
  | 'user_analytics'
  | 'user_management'
  | 'leaderboard'
  | 'company_requests'
  | 'insurance_management'
  | 'settings'
  | 'profile'

export interface ImpersonationSession {
  id: string
  adminId: string
  targetActorId: string
  targetActorType: string
  targetName: string
  workspaceId: string
  startedAt: string
  expiresAt: string | null
  endedAt: string | null
  endReason: string | null
  reason: string | null
  adminName?: string
  ipAddress: string | null
  userAgent: string | null
}
