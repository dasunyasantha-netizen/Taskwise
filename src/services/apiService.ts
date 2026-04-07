const BASE_URL = '/api'

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
  directorLogin:   (email: string, password: string) =>
    api.post<{ token: string; user: unknown }>('/auth/director/login', { email, password }),
  personnelLogin:  (email: string, password: string) =>
    api.post<{ token: string; user: unknown }>('/auth/personnel/login', { email, password }),
  directorRegister: (data: { email: string; password: string; name: string }) =>
    api.post<{ token: string; user: unknown }>('/auth/director/register', data),
  me: () => api.get<unknown>('/auth/me'),
}

// ─── Workspace ───────────────────────────────────────────────────────────────
export const workspaceApi = {
  get:               ()              => api.get('/workspace'),
  getLayers:         ()              => api.get('/workspace/layers'),
  getDepartments:    ()              => api.get('/workspace/departments'),
  createDepartment:  (data: unknown) => api.post('/workspace/departments', data),
  updateDepartment:  (id: string, data: unknown) => api.put(`/workspace/departments/${id}`, data),
  deleteDepartment:  (id: string)    => api.delete(`/workspace/departments/${id}`),
  getPersonnel:      (params?: string) => api.get(`/workspace/personnel${params ? '?' + params : ''}`),
  createPersonnel:   (data: unknown) => api.post('/workspace/personnel', data),
  updatePersonnel:   (id: string, data: unknown) => api.put(`/workspace/personnel/${id}`, data),
  movePersonnel:     (id: string, data: unknown) => api.put(`/workspace/personnel/${id}/move`, data),
  deletePersonnel:   (id: string)    => api.delete(`/workspace/personnel/${id}`),
  getPersonnelQueue: (id: string)    => api.get(`/workspace/personnel/${id}/queue`),
  getGroups:         (deptId?: string) => api.get(`/workspace/groups${deptId ? '?departmentId=' + deptId : ''}`),
  createGroup:       (data: unknown) => api.post('/workspace/groups', data),
  updateGroup:       (id: string, data: unknown) => api.put(`/workspace/groups/${id}`, data),
  deleteGroup:       (id: string)    => api.delete(`/workspace/groups/${id}`),
  addGroupMember:    (groupId: string, data: unknown) => api.post(`/workspace/groups/${groupId}/members`, data),
  removeGroupMember: (groupId: string, pid: string) => api.delete(`/workspace/groups/${groupId}/members/${pid}`),
}

// ─── Projects ────────────────────────────────────────────────────────────────
export const projectApi = {
  list:   ()              => api.get('/projects'),
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
  start:      (id: string)      => api.post(`/tasks/${id}/start`),
  submit:     (id: string)      => api.post(`/tasks/${id}/submit`),
  return:     (id: string, reason: string) => api.post(`/tasks/${id}/return`, { reason }),
  approve:    (id: string)      => api.post(`/tasks/${id}/approve`),
  reject:     (id: string, reason: string) => api.post(`/tasks/${id}/reject`, { reason }),
  reopen:     (id: string)      => api.post(`/tasks/${id}/reopen`),
  cancel:     (id: string, reason: string) => api.post(`/tasks/${id}/cancel`, { reason }),
  subtasks:   (id: string, recursive?: boolean) =>
    api.get(`/tasks/${id}/subtasks${recursive ? '?recursive=true' : ''}`),
  comments:   (id: string)      => api.get(`/tasks/${id}/comments`),
  addComment: (id: string, content: string) => api.post(`/tasks/${id}/comments`, { content }),
  history:    (id: string)      => api.get(`/tasks/${id}/history`),
}

// ─── Notifications ───────────────────────────────────────────────────────────
export const notificationApi = {
  list:    () => api.get('/notifications'),
  read:    (id: string) => api.post(`/notifications/${id}/read`),
  readAll: () => api.post('/notifications/read-all'),
}

// ─── Audit / Reports ─────────────────────────────────────────────────────────
export const auditApi = {
  list:     (params?: string) => api.get(`/audit${params ? '?' + params : ''}`),
  overdue:  () => api.get('/reports/overdue'),
  progress: () => api.get('/reports/progress'),
  queue:    (personnelId: string) => api.get(`/reports/queue/${personnelId}`),
}
