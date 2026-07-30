const BASE_URL = import.meta.env.VITE_API_URL || '/api'

function getToken(): string | null {
  return localStorage.getItem('taskwise_token')
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    if (res.status === 401 && token) {
      localStorage.removeItem('taskwise_token')
      localStorage.removeItem('taskwise_user')
      localStorage.removeItem('taskwise_view')
      localStorage.removeItem('taskwise_real_token')
      localStorage.removeItem('taskwise_real_user')
      window.dispatchEvent(new CustomEvent('taskwise:session-expired'))
    }
    throw new Error(err.error || `HTTP ${res.status}`)
  }

  return res.json()
}

export const api = {
  get:    <T>(path: string)                  => request<T>('GET',    path),
  post:   <T>(path: string, body?: unknown)  => request<T>('POST',   path, body),
  put:    <T>(path: string, body?: unknown)  => request<T>('PUT',    path, body),
  delete: <T>(path: string)                  => request<T>('DELETE', path),
}

// ─── Auth ───────────────────────────────────────────────────────────────────
export const authApi = {
  login: (phone: string, password: string) =>
    api.post<{ token: string; user: unknown }>('/auth/login', { phone, password }),
  directorRegister: (data: { phone: string; password: string; name: string; workspaceName?: string }) =>
    api.post<{ token: string; user: unknown }>('/auth/director/register', data),
  me: () => api.get<unknown>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
  setImpersonationPassword: (currentLoginPassword: string, newImpersonationPassword: string) =>
    api.post('/auth/impersonation-password', { currentLoginPassword, newImpersonationPassword }),
  startImpersonation: (targetIdentifier: string, impersonationPassword: string) =>
    api.post<{ token: string; user: unknown; session: { id: string; startedAt: string } }>('/auth/impersonate', { targetIdentifier, impersonationPassword }),
  endImpersonation: (reason?: string) =>
    api.post('/auth/impersonate/end', { reason: reason || 'exit' }),
  listImpersonationSessions: () =>
    api.get<unknown[]>('/auth/impersonation/sessions'),
}

// ─── Workspace ───────────────────────────────────────────────────────────────
export const workspaceApi = {
  get:               ()              => api.get('/workspace'),
  update:            (data: unknown) => api.put('/workspace', data),
  updateProfile:     (data: unknown) => api.put('/workspace/profile', data),
  getLayers:         ()              => api.get('/workspace/layers'),
  updateLayer:       (id: string, data: unknown) => api.put(`/workspace/layers/${id}`, data),
  uploadAvatar:      (avatarDataUrl: string) => api.post('/workspace/avatar', { avatarDataUrl }),
  getDepartments:    ()              => api.get('/workspace/departments'),
  createDepartment:  (data: unknown) => api.post('/workspace/departments', data),
  updateDepartment:  (id: string, data: unknown) => api.put(`/workspace/departments/${id}`, data),
  deleteDepartment:  (id: string)    => api.delete(`/workspace/departments/${id}`),
  getPersonnel:      (params?: string) => api.get(`/workspace/personnel${params ? '?' + params : ''}`),
  getPersonnelAboveMe: () => api.get<{ type: 'directors' | 'personnel'; items: Array<{ id: string; name: string; phone?: string; email?: string; department?: { name: string } }> }>('/workspace/personnel/above-me'),
  createPersonnel:   (data: unknown) => api.post('/workspace/personnel', data),
  updatePersonnel:   (id: string, data: unknown) => api.put(`/workspace/personnel/${id}`, data),
  setSupervisor:     (id: string, supervisorId: string | null) => api.put(`/workspace/personnel/${id}`, { supervisorId }),
  movePersonnel:     (id: string, data: unknown) => api.put(`/workspace/personnel/${id}/move`, data),
  deletePersonnel:   (id: string)    => api.delete(`/workspace/personnel/${id}`),
  getPersonnelQueue: (id: string)    => api.get(`/workspace/personnel/${id}/queue`),
}

// ─── Projects ────────────────────────────────────────────────────────────────
export const projectApi = {
  list:   (params?: string) => api.get(`/projects${params ? '?' + params : ''}`),
  get:    (id: string)    => api.get(`/projects/${id}`),
  create: (data: unknown) => api.post('/projects', data),
  update: (id: string, data: unknown) => api.put(`/projects/${id}`, data),
  delete: (id: string)    => api.delete(`/projects/${id}`),
}

// ─── Tasks ───────────────────────────────────────────────────────────────────
export const taskApi = {
  list:       (params?: string) => api.get(`/tasks${params ? '?' + params : ''}`),
  get:        (id: string)      => api.get(`/tasks/${id}`),
  create:     (data: unknown)   => api.post('/tasks', data),
  update:     (id: string, data: unknown) => api.put(`/tasks/${id}`, data),
  delete:     (id: string)      => api.delete(`/tasks/${id}`),
  assign:     (id: string, data: unknown) => api.post(`/tasks/${id}/assign`, data),
  accept:     (id: string)      => api.post(`/tasks/${id}/accept`),
  reassign:   (id: string, personnelId: string, reason: string) => api.post(`/tasks/${id}/reassign`, { personnelId, reason }),
  start:      (id: string)      => api.post(`/tasks/${id}/start`),
  submit:     (id: string)      => api.post(`/tasks/${id}/submit`),
  return:     (id: string, reason: string) => api.post(`/tasks/${id}/return`, { reason }),
  approve:    (id: string)      => api.post(`/tasks/${id}/approve`),
  reject:     (id: string, reason: string) => api.post(`/tasks/${id}/reject`, { reason }),
  reopen:     (id: string)      => api.post(`/tasks/${id}/reopen`),
  cancel:     (id: string, reason: string) => api.post(`/tasks/${id}/cancel`, { reason }),
  changeAssignees: (id: string, data: { add: string[]; remove: string[]; reason: string }) =>
    api.post(`/tasks/${id}/change-assignees`, data),
  subtasks:       (id: string, recursive?: boolean) =>
    api.get(`/tasks/${id}/subtasks${recursive ? '?recursive=true' : ''}`),
  comments:       (id: string)      => api.get(`/tasks/${id}/comments`),
  addComment:     (id: string, content: string) => api.post(`/tasks/${id}/comments`, { content }),
  history:        (id: string)      => api.get(`/tasks/${id}/history`),
  progressLogs:      (id: string)      => api.get(`/tasks/${id}/progress-logs`),
  addProgressLog:    (id: string, note: string) => api.post(`/tasks/${id}/progress-logs`, { note }),
  extendDeadline:    (id: string, data: { newDeadline: string; reason: string; note?: string }) =>
    api.post(`/tasks/${id}/extend-deadline`, data),
  deadlineExtensions:(id: string)      => api.get(`/tasks/${id}/deadline-extensions`),
  assignNext: (id: string, data: {
    nextTasks: Array<{
      title: string; description?: string; projectId?: string; priority?: string;
      deadline?: string; personnelIds?: string[]; groupId?: string; isGroupTask?: boolean
    }>
    handoverNote?: string
    allowPreviousAssigneeView?: boolean
  }) => api.post(`/tasks/${id}/assign-next`, data),
  getChain:         (id: string)      => api.get(`/tasks/${id}/chain`),
  previousHistory:  (id: string)      => api.get(`/tasks/${id}/previous-history`),
}

// ─── Notifications ───────────────────────────────────────────────────────────
export const notificationApi = {
  list:                 () => api.get('/notifications'),
  read:                 (id: string) => api.post(`/notifications/${id}/read`),
  readAll:              () => api.post('/notifications/read-all'),
  getVapidKey:          () => fetch(`${BASE_URL}/notifications/vapid-public-key`).then(r => r.json()),
  savePushSubscription: (sub: object) => api.post('/notifications/push-subscribe', sub),
  removePushSubscription: (endpoint: string) => request('DELETE', '/notifications/push-subscribe', { endpoint }),
}

// ─── Notices ─────────────────────────────────────────────────────────────────
export const noticeApi = {
  getActive:  () => api.get<Notice[]>('/notices'),
  getAll:     () => api.get<Notice[]>('/notices/all'),
  create:     (data: { message: string; audience: string; layerNumber?: number | null; expiresAt?: string | null }) =>
    api.post<Notice>('/notices', data),
  delete:     (id: string) => api.delete(`/notices/${id}`),
  dismiss:    (id: string) => api.post(`/notices/${id}/dismiss`),
}

export interface Notice {
  id: string
  message: string
  audience: string
  layerNumber: number | null
  createdAt: string
  expiresAt: string | null
  _count?: { dismissals: number }
}

// ─── Project Categories ──────────────────────────────────────────────────────
export const projectCategoryApi = {
  list:   () => api.get('/project-categories'),
  create: (data: { name: string; description?: string; color?: string }) =>
    api.post('/project-categories', data),
  update: (id: string, data: { name?: string; description?: string; color?: string; status?: string }) =>
    api.put(`/project-categories/${id}`, data),
  delete: (id: string) => api.delete(`/project-categories/${id}`),
}

// ─── Task Groups ─────────────────────────────────────────────────────────────
export const taskGroupApi = {
  list:             () => api.get('/task-groups'),
  get:              (id: string) => api.get(`/task-groups/${id}`),
  create:           (data: { name: string; description?: string }) => api.post('/task-groups', data),
  update:           (id: string, data: { name?: string; description?: string }) => api.put(`/task-groups/${id}`, data),
  delete:           (id: string) => api.delete(`/task-groups/${id}`),
  addMember:        (groupId: string, data: { personnelId: string }) => api.post(`/task-groups/${groupId}/members`, data),
  removeMember:     (groupId: string, pid: string) => api.delete(`/task-groups/${groupId}/members/${pid}`),
  createProject:    (groupId: string, data: { name: string; description?: string; color?: string }) =>
    api.post(`/task-groups/${groupId}/projects`, data),
  assignTask:       (groupId: string, data: {
    projectId: string; title: string; description?: string; priority?: string;
    deadline?: string; memberIds?: string[]
  }) => api.post(`/task-groups/${groupId}/assign-task`, data),
  getMonitor:       (groupId: string) => api.get(`/task-groups/${groupId}/monitor`),
  getMemberHistory: (groupId: string, taskId: string, memberId: string) =>
    api.get(`/task-groups/${groupId}/tasks/${taskId}/members/${memberId}/history`),
  closeGroupTask:   (taskId: string) => api.post(`/task-groups/tasks/${taskId}/close`),
}

// ─── WebAuthn / Biometric ─────────────────────────────────────────────────────
export const webAuthnApi = {
  getRegistrationOptions:  () => api.get<unknown>('/auth/webauthn/register/options'),
  verifyRegistration:      (response: unknown, deviceName?: string) =>
    api.post<{ verified: boolean }>('/auth/webauthn/register/verify', { response, deviceName }),
  getAuthOptions:          (phone: string) =>
    api.post<unknown>('/auth/webauthn/auth/options', { phone }),
  verifyAuthentication:    (actorId: string, actorType: string, response: unknown) =>
    api.post<{ token: string; user: unknown; mustChangePassword?: boolean }>('/auth/webauthn/auth/verify', { actorId, actorType, response }),
  listCredentials:         () =>
    api.get<Array<{ id: string; deviceName?: string; deviceType: string; backedUp: boolean; createdAt: string; lastUsedAt?: string }>>('/auth/webauthn/credentials'),
  deleteCredential:        (id: string) => api.delete(`/auth/webauthn/credentials/${id}`),
}

export interface CompanyRequestSubmission {
  company: Record<string, unknown>
  applicant: Record<string, unknown>
}

export const companyApi = {
  submitRequest: (data: CompanyRequestSubmission) =>
    api.post<{ reference: string; status: string; statusToken: string; message: string }>('/company/requests', data),
  status: (data: { reference: string; statusToken?: string; phoneOrEmail?: string }) =>
    api.post<{ reference: string; status: string; moreInfoInstructions?: string; rejectionReason?: string; suggestedPrefix?: string }>('/company/requests/status', data),
  resubmit: (data: { reference: string; statusToken: string; additionalInfo: string }) =>
    api.post('/company/requests/resubmit', data),
  listRequests: (params?: string) =>
    api.get<{ pendingCount: number; requests: CompanyRequestSummary[] }>(`/company/admin/requests${params ? '?' + params : ''}`),
  getRequest: (id: string) => api.get<CompanyRequestDetail>(`/company/admin/requests/${id}`),
  document: (id: string) => api.get<{ name?: string; mimeType: string; data: string }>(`/company/admin/requests/${id}/document`),
  action: (id: string, data: { action: string; reason?: string; instructions?: string; note?: string; prefix?: string }) =>
    api.post(`/company/admin/requests/${id}/actions`, data),
}

export interface CompanyRequestSummary {
  id: string
  reference: string
  status: string
  legalName: string
  displayName?: string | null
  registrationNumber: string
  applicantName: string
  applicantPhone: string
  applicantEmail: string
  suggestedPrefix: string
  finalPrefix?: string | null
  createdAt: string
}

export interface CompanyRequestDetail extends CompanyRequestSummary {
  address: string
  industry: string
  website?: string | null
  expectedUsers?: number | null
  reason: string
  supportingDocumentName?: string | null
  supportingDocumentMime?: string | null
  hasSupportingDocument?: boolean
  applicantFirstName: string
  applicantMiddleName?: string | null
  applicantLastName: string
  moreInfoInstructions?: string | null
  rejectionReason?: string | null
  internalNote?: string | null
  approvedAt?: string | null
  actions?: Array<{ id: string; action: string; note?: string | null; createdAt: string; actorDirector?: { name: string } | null }>
}

// ─── Audit / Reports ─────────────────────────────────────────────────────────
export const auditApi = {
  list:                (params?: string) => api.get(`/audit${params ? '?' + params : ''}`),
  overdue:             () => api.get('/reports/overdue'),
  progress:            () => api.get('/reports/progress'),
  queue:               (personnelId: string) => api.get(`/reports/queue/${personnelId}`),
  recentUpdates:       (date: string) => api.get(`/reports/recent-updates?date=${date}`),
  userAnalyticsOverview: () => api.get('/reports/user-analytics/overview'),
  userLoginHistory:    (actorId: string, actorType = 'personnel') =>
    api.get(`/reports/user-analytics/logins/${actorId}?actorType=${actorType}`),
}
