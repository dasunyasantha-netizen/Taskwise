import { api } from './apiService'
export type YsoField = {
  key: string
  label: string
  type: string
  min?: number
  max?: number
  optional?: boolean
  options?: string[]
}
export type YsoTask = {
  id: number
  title: string
  rule: string
  fields: YsoField[]
}
export type YsoPerson = {
  id: string
  name: string
  adId: string
  adName: string
  district: string
  active: boolean
  startDate?: string
  managerValid: boolean
}
export type YsoEntry = {
  id: string
  personnelId: string
  assignedAdId: string
  task: number
  period: string
  data: Record<string, any>
  status: string
  submittedAt: string
  queuedAt?: string
  reviewedAt?: string
  feedback?: string
  previousId?: string
  supersededAt?: string
  attachment?: { id: string; name: string; mime: string; size?: number }
}
export type YsoMeeting = {
  id: string
  adId: string
  date: string
  title: string
  location: string
  invitees: string[]
  cancelled: boolean
}
export type YsoObligation = {
  key: string
  personnelId: string
  task: number
  period: string
  points: number
  reason: string
  blocked: boolean
  outcome?: string
}
export type YsoDashboard = {
  role: 'YSO' | 'AD' | 'DIRECTOR'
  today: string
  /** Workspace Google Drive (Letters) is connected — required for certificate scans */
  driveConnected?: boolean
  ruleVersion: string
  tasks: YsoTask[]
  criteria: { key: string; label: string; max: number }[]
  people: YsoPerson[]
  entries: YsoEntry[]
  meetings: YsoMeeting[]
  ads: { id: string; name: string; active: boolean; district: string }[]
  obligations: YsoObligation[]
  assessments: {
    id: string
    personnelId: string
    adId: string
    period: string
    scores: Record<string, number>
    rationale: string
    updatedAt: string
  }[]
  decisions: {
    personnelId: string
    key: string
    outcome: string
    reason: string
  }[]
  ledger: {
    id: string
    personnelId: string
    adId: string
    period: string
    task: number
    points: number
    reason: string
    createdAt: string
  }[]
  events: {
    id: string
    personnelId?: string
    actorId: string
    event: string
    data: Record<string, any>
    createdAt: string
  }[]
}
export const ysoApi = {
  dashboard: () => api.get<YsoDashboard>('/yso/dashboard'),
  activate: (id: string, startDate: string) =>
    api.post(`/yso/people/${id}/activate`, { startDate }),
  submit: (body: unknown) => api.post('/yso/submissions', body),
  review: (id: string, action: string, feedback: string) =>
    api.post(`/yso/submissions/${id}/review`, { action, feedback }),
  meeting: (body: unknown) => api.post('/yso/meetings', body),
  cancelMeeting: (id: string, reason: string) =>
    api.post(`/yso/meetings/${id}/cancel`, { reason }),
  assess: (id: string, body: unknown) =>
    api.post(`/yso/people/${id}/assessment`, body),
  penalty: (id: string, body: unknown) =>
    api.post(`/yso/people/${id}/penalty`, body),
  certificate: async (file: { id: string; name: string }) => {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL || '/api'}/yso/certificates/${file.id}`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('taskwise_token') || ''}`,
        },
      }
    )
    if (!response.ok)
      throw new Error(
        'Certificate download failed. Check your session and access.'
      )
    const url = URL.createObjectURL(await response.blob())
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.name
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}
