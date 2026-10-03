import { api } from './apiService'
export type LetterPerson = { key: string; name: string; logger?: boolean }
export type LetterContext = {
  me: { key: string; name: string; director: boolean; logger: boolean }
  today: string
  people: LetterPerson[]
  entryDelayDays: number
  assigneeDays: number
  driveConnected: boolean
}
export type LetterFile = {
  id: string
  name: string
  mime: string
  size: number
  uploadState: string
  uploadError?: string
  previewState: string
  previewError?: string
  pageCount?: number
  previews: { page: number }[]
}
export type LetterEvent = {
  id: string
  sequence: number
  kind: string
  actorName: string
  notes: string
  correspondent?: string
  correspondenceDate?: string
  receivedDate?: string
  createdAt: string
  fromAssigneeName?: string
  toAssigneeName?: string
  holdingDays?: number
  entryDelayDays?: number
  attachments: LetterFile[]
}
export type Letter = {
  id: string
  reference: string
  subject: string
  sender: string
  senderContact?: string
  externalReference?: string
  channel: string
  createdBy: string
  createdByName: string
  assignedTo: string
  assignedToName: string
  assignedAt: string
  firstReceivedDate: string
  latestReceivedDate: string
  status: string
  version: number
  createdAt: string
  closedAt?: string
  entryDelayDays: number
  assigneeAgeDays: number
  events?: LetterEvent[]
  permissions?: { canManage: boolean; canReply: boolean; canReceive: boolean }
}
export type LetterList = {
  items: Letter[]
  total: number
  page: number
  pageSize: number
  metrics: {
    open: number
    closed: number
    overdue: number
    lateEntries: number
    averageEntryDays: number
    holders: { name: string; open: number; overdue: number; maxDays: number }[]
  }
  thresholds: { entryDelayDays: number; assigneeDays: number }
}
export type DriveSettings = {
  folderId: string
  clientId: string
  hasClientSecret: boolean
  connected: boolean
  entryDelayDays: number
  assigneeDays: number
  encryptionReady: boolean
  callbackUrl: string
  managed: boolean
}
export const letters = {
  context: () => api.get<LetterContext>('/letters/context'),
  list: (params: string) => api.get<LetterList>('/letters?' + params),
  get: (id: string) => api.get<Letter>('/letters/' + id),
  create: (data: unknown) => api.post<{ id: string }>('/letters', data),
  event: (id: string, data: unknown) =>
    api.post('/letters/' + id + '/events', data),
  settings: () => api.get<DriveSettings>('/letters/settings'),
  saveSettings: (data: unknown) =>
    api.put<DriveSettings>('/letters/settings', data),
  logger: (id: string, enabled: boolean) =>
    api.put('/letters/loggers/' + id, { enabled }),
  connect: () => api.post<{ url: string }>('/letters/drive/connect'),
  test: () => api.post<{ name: string }>('/letters/drive/test'),
  disconnect: () => api.post('/letters/drive/disconnect'),
  retry: (id: string) => api.post('/letters/files/' + id + '/retry'),
  async file(id: string, view: string) {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL || '/api'}/letters/files/${id}/${view}`,
      {
        headers: {
          Authorization: 'Bearer ' + localStorage.getItem('taskwise_token'),
        },
      }
    )
    if (!response.ok)
      throw new Error(
        'The document is unavailable or you no longer have access.'
      )
    return response.blob()
  },
}
