import React, { useState, useEffect, useMemo } from 'react'
import type { Task, Layer, Personnel } from '../types'
import { taskApi, auditApi, workspaceApi } from '../services/apiService'
import FilterBar, { DEFAULT_FILTERS, filterTasks, computeAvailableOptions, hasActiveFilters } from './FilterBar'
import type { ActiveFilters, AvailableOptions } from './FilterBar'
import TaskDetailPanel from './TaskDetailPanel'

// ─── Persisted page state (lifted from parent so it survives view switches) ──

export interface ReportsState {
  filters: ActiveFilters
  activeTab: ReportTab
  scrollTop: number
}

export const DEFAULT_REPORTS_STATE: ReportsState = {
  filters: DEFAULT_FILTERS,
  activeTab: 'pending_approvals',
  scrollTop: 0,
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportTab =
  | 'pending_approvals'
  | 'overdue'
  | 'due_soon'
  | 'sitting_longest'
  | 'completed'
  | 'by_status'
  | 'by_officer'
  | 'by_department'
  | 'approval_delay'

const TABS: { id: ReportTab; label: string }[] = [
  { id: 'pending_approvals', label: 'Pending Approvals' },
  { id: 'overdue',           label: 'Overdue' },
  { id: 'due_soon',          label: 'Due in 7 Days' },
  { id: 'sitting_longest',   label: 'Sitting Longest' },
  { id: 'completed',         label: 'Completed' },
  { id: 'by_status',         label: 'By Status' },
  { id: 'by_officer',        label: 'By Officer' },
  { id: 'by_department',     label: 'By Department' },
  { id: 'approval_delay',    label: 'Approval Delay' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending', ASSIGNED: 'Assigned', IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted', APPROVED: 'Approved', RETURNED: 'Returned',
  REJECTED: 'Rejected', CANCELLED: 'Cancelled',
}
const STATUS_COLORS: Record<string, string> = {
  PENDING:     'bg-gray-100 text-gray-600',
  ASSIGNED:    'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-yellow-50 text-yellow-700',
  SUBMITTED:   'bg-purple-50 text-purple-700',
  APPROVED:    'bg-green-50 text-green-700',
  RETURNED:    'bg-orange-50 text-orange-700',
  REJECTED:    'bg-red-50 text-red-600',
  CANCELLED:   'bg-gray-50 text-gray-400',
}
const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: 'text-red-600', HIGH: 'text-orange-500', MEDIUM: 'text-yellow-600', LOW: 'text-gray-400',
}
const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-500', HIGH: 'bg-orange-400', MEDIUM: 'bg-yellow-400', LOW: 'bg-gray-300',
}

function daysSince(date: string | Date): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
}
function daysUntil(date: string | Date): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000)
}
function fmtDate(d: string | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function assigneeName(t: Task): string {
  const a = t.assignments?.[0]
  return a?.personnel?.name || a?.department?.name || '—'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-16 text-center">
      <div className="text-3xl mb-3">📊</div>
      <p className="text-tw-text font-semibold mb-1">No results</p>
      <p className="text-tw-text-secondary text-sm">{message}</p>
    </div>
  )
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base font-bold text-tw-text">{title}</h2>
      <span className="text-xs font-semibold text-tw-text-secondary bg-tw-hover px-2.5 py-1 rounded-full">
        {count} {count === 1 ? 'task' : 'tasks'}
      </span>
    </div>
  )
}

// Desktop table wrapper
function ReportTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#f0f4ff] border-b-2 border-tw-primary/20">
              {headers.map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-tw-border">{children}</tbody>
        </table>
      </div>
    </div>
  )
}

// Mobile card for a task row
function MobileTaskCard({ task, onClick, extra }: { task: Task; onClick: () => void; extra?: React.ReactNode }) {
  return (
    <div onClick={onClick} className="sm:hidden card p-4 mb-2 cursor-pointer active:scale-[0.99] transition-transform">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${PRIORITY_DOT[task.priority] ?? 'bg-gray-300'}`} />
          <span className="font-semibold text-tw-text text-sm leading-snug">{task.title}</span>
        </div>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[task.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABELS[task.status] ?? task.status}
        </span>
      </div>
      <div className="text-xs text-tw-text-secondary space-y-0.5 pl-4">
        {task.project && <div>{task.project.name}</div>}
        {extra}
      </div>
    </div>
  )
}

// ─── Report Sections ──────────────────────────────────────────────────────────

function PendingApprovalsReport({ tasks, onTaskClick }: { tasks: Task[]; onTaskClick: (t: Task) => void }) {
  const rows = tasks.filter(t => t.status === 'SUBMITTED')
  if (rows.length === 0) return <EmptyState message="No tasks awaiting approval in this filter." />
  return (
    <>
      <SectionHeader title="Pending Approvals" count={rows.length} />
      {rows.map(t => (
        <MobileTaskCard key={t.id} task={t} onClick={() => onTaskClick(t)}
          extra={<><div>Submitted by: {t.actedByName || '—'}</div><div>Date: {fmtDate(t.updatedAt)}</div></>} />
      ))}
      <ReportTable headers={['', 'Task', 'Project', 'Submitted By', 'Submitted Date', 'Priority']}>
        {rows.map(t => (
          <tr key={t.id} onClick={() => onTaskClick(t)} className="hover:bg-[#f8f9ff] cursor-pointer transition-colors">
            <td className="pl-3 pr-0 py-3 w-1"><div className={`w-1 h-8 rounded-full ${PRIORITY_DOT[t.priority] ?? 'bg-gray-300'}`} /></td>
            <td className="px-4 py-3 font-medium text-tw-text max-w-xs"><div className="truncate">{t.title}</div></td>
            <td className="px-4 py-3 text-tw-text-secondary text-xs">{t.project?.name || '—'}</td>
            <td className="px-4 py-3 text-tw-text-secondary text-xs">{t.actedByName || '—'}</td>
            <td className="px-4 py-3 text-tw-text-secondary text-xs whitespace-nowrap">{fmtDate(t.updatedAt)}</td>
            <td className="px-4 py-3"><span className={`text-xs font-semibold ${PRIORITY_COLORS[t.priority]}`}>{t.priority}</span></td>
          </tr>
        ))}
      </ReportTable>
    </>
  )
}

function OverdueReport({ tasks, onTaskClick }: { tasks: Task[]; onTaskClick: (t: Task) => void }) {
  const now = new Date()
  const rows = tasks
    .filter(t => t.deadline && !['APPROVED', 'CANCELLED'].includes(t.status) && new Date(t.deadline) < now)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
  if (rows.length === 0) return <EmptyState message="No overdue tasks in this filter." />
  return (
    <>
      <SectionHeader title="Overdue Tasks" count={rows.length} />
      {rows.map(t => {
        const days = daysSince(t.deadline!)
        return (
          <MobileTaskCard key={t.id} task={t} onClick={() => onTaskClick(t)}
            extra={<><div>Assignee: {assigneeName(t)}</div><div className="text-tw-danger font-semibold">{days}d overdue · Due {fmtDate(t.deadline)}</div></>} />
        )
      })}
      <ReportTable headers={['', 'Task', 'Project', 'Assignee', 'Deadline', 'Days Overdue', 'Status']}>
        {rows.map(t => {
          const days = daysSince(t.deadline!)
          return (
            <tr key={t.id} onClick={() => onTaskClick(t)} className="hover:bg-red-50 cursor-pointer transition-colors">
              <td className="pl-3 pr-0 py-3 w-1"><div className={`w-1 h-8 rounded-full ${PRIORITY_DOT[t.priority] ?? 'bg-gray-300'}`} /></td>
              <td className="px-4 py-3 font-medium text-tw-text max-w-xs"><div className="truncate">{t.title}</div></td>
              <td className="px-4 py-3 text-tw-text-secondary text-xs">{t.project?.name || '—'}</td>
              <td className="px-4 py-3 text-tw-text-secondary text-xs">{assigneeName(t)}</td>
              <td className="px-4 py-3 text-tw-danger text-xs font-medium whitespace-nowrap">{fmtDate(t.deadline)}</td>
              <td className="px-4 py-3">
                <span className="text-xs font-bold text-white bg-tw-danger px-2 py-0.5 rounded-full">{days}d</span>
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status]}`}>
                  {STATUS_LABELS[t.status] ?? t.status}
                </span>
              </td>
            </tr>
          )
        })}
      </ReportTable>
    </>
  )
}

function DueSoonReport({ tasks, onTaskClick }: { tasks: Task[]; onTaskClick: (t: Task) => void }) {
  const now = new Date()
  const in7 = new Date(now.getTime() + 7 * 86400000)
  const rows = tasks
    .filter(t => t.deadline && ['ASSIGNED', 'IN_PROGRESS'].includes(t.status) && new Date(t.deadline) > now && new Date(t.deadline) <= in7)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
  if (rows.length === 0) return <EmptyState message="No tasks due in the next 7 days." />
  return (
    <>
      <SectionHeader title="Due in Next 7 Days" count={rows.length} />
      {rows.map(t => {
        const d = daysUntil(t.deadline!)
        return (
          <MobileTaskCard key={t.id} task={t} onClick={() => onTaskClick(t)}
            extra={<><div>Assignee: {assigneeName(t)}</div><div className="font-semibold text-orange-600">{d === 0 ? 'Due today' : d === 1 ? 'Tomorrow' : `${d}d left`} · {fmtDate(t.deadline)}</div></>} />
        )
      })}
      <ReportTable headers={['', 'Task', 'Project', 'Assignee', 'Deadline', 'Days Left', 'Status']}>
        {rows.map(t => {
          const d = daysUntil(t.deadline!)
          const urgencyClass = d <= 1 ? 'bg-red-100 text-red-700' : d <= 3 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-50 text-yellow-700'
          return (
            <tr key={t.id} onClick={() => onTaskClick(t)} className="hover:bg-[#f8f9ff] cursor-pointer transition-colors">
              <td className="pl-3 pr-0 py-3 w-1"><div className={`w-1 h-8 rounded-full ${PRIORITY_DOT[t.priority] ?? 'bg-gray-300'}`} /></td>
              <td className="px-4 py-3 font-medium text-tw-text max-w-xs"><div className="truncate">{t.title}</div></td>
              <td className="px-4 py-3 text-tw-text-secondary text-xs">{t.project?.name || '—'}</td>
              <td className="px-4 py-3 text-tw-text-secondary text-xs">{assigneeName(t)}</td>
              <td className="px-4 py-3 text-tw-text-secondary text-xs whitespace-nowrap">{fmtDate(t.deadline)}</td>
              <td className="px-4 py-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${urgencyClass}`}>
                  {d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `${d}d`}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status]}`}>
                  {STATUS_LABELS[t.status] ?? t.status}
                </span>
              </td>
            </tr>
          )
        })}
      </ReportTable>
    </>
  )
}

function SittingLongestReport({ tasks, onTaskClick }: { tasks: Task[]; onTaskClick: (t: Task) => void }) {
  const rows = tasks
    .filter(t => ['ASSIGNED', 'IN_PROGRESS'].includes(t.status) && t.assignments?.length > 0 && t.assignments[0].assignedAt)
    .sort((a, b) => new Date(a.assignments[0].assignedAt).getTime() - new Date(b.assignments[0].assignedAt).getTime())
  if (rows.length === 0) return <EmptyState message="No active assigned tasks in this filter." />
  return (
    <>
      <SectionHeader title="Sitting Longest" count={rows.length} />
      {rows.map(t => {
        const days = daysSince(t.assignments[0].assignedAt)
        return (
          <MobileTaskCard key={t.id} task={t} onClick={() => onTaskClick(t)}
            extra={<><div>Assignee: {assigneeName(t)}</div><div>{days}d since assigned · {fmtDate(t.assignments[0].assignedAt)}</div></>} />
        )
      })}
      <ReportTable headers={['', 'Task', 'Project', 'Assignee', 'Assigned Date', 'Days Pending', 'Status']}>
        {rows.map(t => {
          const days = daysSince(t.assignments[0].assignedAt)
          const ageClass = days >= 14 ? 'bg-red-100 text-red-700' : days >= 7 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
          return (
            <tr key={t.id} onClick={() => onTaskClick(t)} className="hover:bg-[#f8f9ff] cursor-pointer transition-colors">
              <td className="pl-3 pr-0 py-3 w-1"><div className={`w-1 h-8 rounded-full ${PRIORITY_DOT[t.priority] ?? 'bg-gray-300'}`} /></td>
              <td className="px-4 py-3 font-medium text-tw-text max-w-xs"><div className="truncate">{t.title}</div></td>
              <td className="px-4 py-3 text-tw-text-secondary text-xs">{t.project?.name || '—'}</td>
              <td className="px-4 py-3 text-tw-text-secondary text-xs">{assigneeName(t)}</td>
              <td className="px-4 py-3 text-tw-text-secondary text-xs whitespace-nowrap">{fmtDate(t.assignments[0].assignedAt)}</td>
              <td className="px-4 py-3"><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ageClass}`}>{days}d</span></td>
              <td className="px-4 py-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status]}`}>
                  {STATUS_LABELS[t.status] ?? t.status}
                </span>
              </td>
            </tr>
          )
        })}
      </ReportTable>
    </>
  )
}

function CompletedReport({ tasks, onTaskClick }: { tasks: Task[]; onTaskClick: (t: Task) => void }) {
  const rows = tasks
    .filter(t => t.status === 'APPROVED')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  if (rows.length === 0) return <EmptyState message="No completed tasks in this filter." />
  return (
    <>
      <SectionHeader title="Completed Tasks" count={rows.length} />
      {rows.map(t => (
        <MobileTaskCard key={t.id} task={t} onClick={() => onTaskClick(t)}
          extra={<><div>Completed by: {t.actedByName || '—'}</div><div>{fmtDate(t.updatedAt)}</div></>} />
      ))}
      <ReportTable headers={['', 'Task', 'Project', 'Completed By', 'Completed Date', 'Priority']}>
        {rows.map(t => (
          <tr key={t.id} onClick={() => onTaskClick(t)} className="hover:bg-green-50 cursor-pointer transition-colors">
            <td className="pl-3 pr-0 py-3 w-1"><div className={`w-1 h-8 rounded-full bg-green-400`} /></td>
            <td className="px-4 py-3 font-medium text-tw-text max-w-xs"><div className="truncate">{t.title}</div></td>
            <td className="px-4 py-3 text-tw-text-secondary text-xs">{t.project?.name || '—'}</td>
            <td className="px-4 py-3 text-tw-text-secondary text-xs">{t.actedByName || '—'}</td>
            <td className="px-4 py-3 text-tw-text-secondary text-xs whitespace-nowrap">{fmtDate(t.updatedAt)}</td>
            <td className="px-4 py-3"><span className={`text-xs font-semibold ${PRIORITY_COLORS[t.priority]}`}>{t.priority}</span></td>
          </tr>
        ))}
      </ReportTable>
    </>
  )
}

function ByStatusReport({ tasks }: { tasks: Task[] }) {
  const counts: Record<string, number> = {}
  for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return <EmptyState message="No tasks in this filter." />
  const total = tasks.length
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-tw-text">Tasks by Status</h2>
        <span className="text-xs font-semibold text-tw-text-secondary bg-tw-hover px-2.5 py-1 rounded-full">{total} total</span>
      </div>
      <div className="card overflow-hidden">
        <div className="divide-y divide-tw-border">
          {entries.map(([status, count]) => {
            const pct = Math.round((count / total) * 100)
            return (
              <div key={status} className="px-5 py-3.5 flex items-center gap-4">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full w-32 text-center ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABELS[status] ?? status}
                </span>
                <div className="flex-1 bg-tw-hover rounded-full h-2">
                  <div className="h-2 rounded-full bg-tw-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-sm font-bold text-tw-text w-8 text-right">{count}</span>
                <span className="text-xs text-tw-text-secondary w-8 text-right">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function ByOfficerReport({ tasks, personnel, onTaskClick }: { tasks: Task[]; personnel: Personnel[]; onTaskClick: (t: Task) => void }) {
  const now = new Date()
  const map = new Map<string, { name: string; tasks: Task[] }>()

  for (const t of tasks) {
    for (const a of t.assignments ?? []) {
      if (a.personnelId) {
        const p = personnel.find(p => p.id === a.personnelId)
        const name = p?.name ?? a.personnelId
        if (!map.has(a.personnelId)) map.set(a.personnelId, { name, tasks: [] })
        map.get(a.personnelId)!.tasks.push(t)
      }
    }
  }

  const rows = [...map.entries()]
    .map(([id, { name, tasks: ts }]) => ({
      id, name,
      total: ts.length,
      completed: ts.filter(t => t.status === 'APPROVED').length,
      pending: ts.filter(t => !['APPROVED', 'CANCELLED'].includes(t.status)).length,
      overdue: ts.filter(t => t.deadline && !['APPROVED', 'CANCELLED'].includes(t.status) && new Date(t.deadline) < now).length,
    }))
    .sort((a, b) => b.total - a.total)

  if (rows.length === 0) return <EmptyState message="No personnel assignments in this filter." />

  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-tw-text">Tasks by Officer</h2>
        <span className="text-xs text-tw-text-secondary">{rows.length} officers</span>
      </div>
      <div className="card overflow-hidden">
        {/* Desktop */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f0f4ff] border-b-2 border-tw-primary/20">
                {['Officer', 'Total', 'Completed', 'Pending', 'Overdue'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-tw-border">
              {rows.map(r => (
                <React.Fragment key={r.id}>
                  <tr onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    className="hover:bg-[#f8f9ff] cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-medium text-tw-text">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-tw-primary/10 text-tw-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {r.name.charAt(0).toUpperCase()}
                        </div>
                        {r.name}
                        <svg className={`w-3 h-3 text-tw-text-secondary ml-1 transition-transform ${expandedId === r.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-tw-text">{r.total}</td>
                    <td className="px-4 py-3 text-green-600 font-semibold">{r.completed}</td>
                    <td className="px-4 py-3 text-blue-600 font-semibold">{r.pending}</td>
                    <td className="px-4 py-3">{r.overdue > 0 ? <span className="text-tw-danger font-bold">{r.overdue}</span> : <span className="text-gray-400">0</span>}</td>
                  </tr>
                  {expandedId === r.id && (
                    <tr>
                      <td colSpan={5} className="px-4 pb-3 pt-0 bg-tw-hover/30">
                        <div className="space-y-1.5 pt-2">
                          {map.get(r.id)!.tasks.map(t => (
                            <div key={t.id} onClick={() => onTaskClick(t)}
                              className="flex items-center gap-3 px-3 py-2 bg-white rounded-lg border border-tw-border hover:border-tw-primary cursor-pointer transition-colors text-sm">
                              <span className={`w-1.5 h-6 rounded-full flex-shrink-0 ${PRIORITY_DOT[t.priority]}`} />
                              <span className="flex-1 font-medium text-tw-text truncate">{t.title}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[t.status]}`}>{STATUS_LABELS[t.status]}</span>
                              {t.deadline && <span className="text-xs text-tw-text-secondary whitespace-nowrap">{fmtDate(t.deadline)}</span>}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile */}
        <div className="sm:hidden divide-y divide-tw-border">
          {rows.map(r => (
            <div key={r.id}>
              <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                <div className="w-8 h-8 rounded-full bg-tw-primary/10 text-tw-primary text-sm font-bold flex items-center justify-center flex-shrink-0">
                  {r.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-tw-text text-sm">{r.name}</div>
                  <div className="text-xs text-tw-text-secondary">{r.total} tasks · {r.completed} done{r.overdue > 0 ? ` · ${r.overdue} overdue` : ''}</div>
                </div>
                <svg className={`w-4 h-4 text-tw-text-secondary flex-shrink-0 transition-transform ${expandedId === r.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
              </button>
              {expandedId === r.id && (
                <div className="px-4 pb-3 space-y-2">
                  {map.get(r.id)!.tasks.map(t => (
                    <div key={t.id} onClick={() => onTaskClick(t)} className="flex items-center gap-2 px-3 py-2 bg-tw-hover rounded-xl cursor-pointer active:scale-[0.99] transition-transform">
                      <span className={`w-1.5 h-5 rounded-full flex-shrink-0 ${PRIORITY_DOT[t.priority]}`} />
                      <span className="flex-1 text-sm font-medium text-tw-text truncate">{t.title}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${STATUS_COLORS[t.status]}`}>{STATUS_LABELS[t.status]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function ByDepartmentReport({ tasks, layers, onTaskClick }: { tasks: Task[]; layers: Layer[]; onTaskClick: (t: Task) => void }) {
  const now = new Date()
  const allDepts = layers.flatMap(l => (l.departments ?? []).map(d => ({ ...d, layerName: l.name })))

  const map = new Map<string, { name: string; layerName: string; tasks: Task[] }>()
  for (const t of tasks) {
    for (const a of t.assignments ?? []) {
      const deptId = a.departmentId ?? a.personnel?.departmentId
      if (deptId) {
        const dept = allDepts.find(d => d.id === deptId)
        const name = dept?.name ?? deptId
        const layerName = dept?.layerName ?? '—'
        if (!map.has(deptId)) map.set(deptId, { name, layerName, tasks: [] })
        if (!map.get(deptId)!.tasks.find(x => x.id === t.id))
          map.get(deptId)!.tasks.push(t)
      }
    }
  }

  const rows = [...map.entries()]
    .map(([id, { name, layerName, tasks: ts }]) => ({
      id, name, layerName,
      total: ts.length,
      completed: ts.filter(t => t.status === 'APPROVED').length,
      pending: ts.filter(t => !['APPROVED', 'CANCELLED'].includes(t.status)).length,
      overdue: ts.filter(t => t.deadline && !['APPROVED', 'CANCELLED'].includes(t.status) && new Date(t.deadline) < now).length,
    }))
    .sort((a, b) => b.total - a.total)

  if (rows.length === 0) return <EmptyState message="No department assignments in this filter." />

  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-tw-text">Tasks by Department</h2>
        <span className="text-xs text-tw-text-secondary">{rows.length} departments</span>
      </div>
      <div className="card overflow-hidden">
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f0f4ff] border-b-2 border-tw-primary/20">
                {['Department', 'Layer', 'Total', 'Completed', 'Pending', 'Overdue'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-tw-border">
              {rows.map(r => (
                <React.Fragment key={r.id}>
                  <tr onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    className="hover:bg-[#f8f9ff] cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-medium text-tw-text">
                      <div className="flex items-center gap-1.5">
                        {r.name}
                        <svg className={`w-3 h-3 text-tw-text-secondary ml-1 transition-transform ${expandedId === r.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-tw-text-secondary">{r.layerName}</td>
                    <td className="px-4 py-3 font-semibold text-tw-text">{r.total}</td>
                    <td className="px-4 py-3 text-green-600 font-semibold">{r.completed}</td>
                    <td className="px-4 py-3 text-blue-600 font-semibold">{r.pending}</td>
                    <td className="px-4 py-3">{r.overdue > 0 ? <span className="text-tw-danger font-bold">{r.overdue}</span> : <span className="text-gray-400">0</span>}</td>
                  </tr>
                  {expandedId === r.id && (
                    <tr>
                      <td colSpan={6} className="px-4 pb-3 pt-0 bg-tw-hover/30">
                        <div className="space-y-1.5 pt-2">
                          {map.get(r.id)!.tasks.map(t => (
                            <div key={t.id} onClick={() => onTaskClick(t)}
                              className="flex items-center gap-3 px-3 py-2 bg-white rounded-lg border border-tw-border hover:border-tw-primary cursor-pointer transition-colors text-sm">
                              <span className={`w-1.5 h-6 rounded-full flex-shrink-0 ${PRIORITY_DOT[t.priority]}`} />
                              <span className="flex-1 font-medium text-tw-text truncate">{t.title}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[t.status]}`}>{STATUS_LABELS[t.status]}</span>
                              {t.deadline && <span className="text-xs text-tw-text-secondary whitespace-nowrap">{fmtDate(t.deadline)}</span>}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sm:hidden divide-y divide-tw-border">
          {rows.map(r => (
            <div key={r.id}>
              <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-tw-text text-sm">{r.name}</div>
                  <div className="text-xs text-tw-text-secondary">{r.layerName} · {r.total} tasks{r.overdue > 0 ? ` · ${r.overdue} overdue` : ''}</div>
                </div>
                <svg className={`w-4 h-4 text-tw-text-secondary flex-shrink-0 transition-transform ${expandedId === r.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
              </button>
              {expandedId === r.id && (
                <div className="px-4 pb-3 space-y-2">
                  {map.get(r.id)!.tasks.map(t => (
                    <div key={t.id} onClick={() => onTaskClick(t)} className="flex items-center gap-2 px-3 py-2 bg-tw-hover rounded-xl cursor-pointer active:scale-[0.99] transition-transform">
                      <span className={`w-1.5 h-5 rounded-full flex-shrink-0 ${PRIORITY_DOT[t.priority]}`} />
                      <span className="flex-1 text-sm font-medium text-tw-text truncate">{t.title}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${STATUS_COLORS[t.status]}`}>{STATUS_LABELS[t.status]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function ApprovalDelayReport({ tasks, onTaskClick }: { tasks: Task[]; onTaskClick: (t: Task) => void }) {
  const rows = tasks
    .filter(t => t.status === 'SUBMITTED')
    .map(t => ({ ...t, daysWaiting: daysSince(t.updatedAt) }))
    .sort((a, b) => b.daysWaiting - a.daysWaiting)
  if (rows.length === 0) return <EmptyState message="No submitted tasks pending approval." />
  return (
    <>
      <SectionHeader title="Approval Delay" count={rows.length} />
      {rows.map(t => (
        <MobileTaskCard key={t.id} task={t} onClick={() => onTaskClick(t)}
          extra={<><div>Approver: {t.approvalById || '—'}</div><div className={t.daysWaiting >= 3 ? 'text-tw-danger font-semibold' : ''}>{t.daysWaiting}d waiting since {fmtDate(t.updatedAt)}</div></>} />
      ))}
      <ReportTable headers={['', 'Task', 'Project', 'Submitted By', 'Submitted Date', 'Days Waiting', 'Priority']}>
        {rows.map(t => (
          <tr key={t.id} onClick={() => onTaskClick(t)} className={`cursor-pointer transition-colors ${t.daysWaiting >= 3 ? 'hover:bg-red-50' : 'hover:bg-[#f8f9ff]'}`}>
            <td className="pl-3 pr-0 py-3 w-1"><div className={`w-1 h-8 rounded-full ${PRIORITY_DOT[t.priority] ?? 'bg-gray-300'}`} /></td>
            <td className="px-4 py-3 font-medium text-tw-text max-w-xs"><div className="truncate">{t.title}</div></td>
            <td className="px-4 py-3 text-tw-text-secondary text-xs">{t.project?.name || '—'}</td>
            <td className="px-4 py-3 text-tw-text-secondary text-xs">{t.actedByName || '—'}</td>
            <td className="px-4 py-3 text-tw-text-secondary text-xs whitespace-nowrap">{fmtDate(t.updatedAt)}</td>
            <td className="px-4 py-3">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${t.daysWaiting >= 5 ? 'bg-red-100 text-red-700' : t.daysWaiting >= 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                {t.daysWaiting}d
              </span>
            </td>
            <td className="px-4 py-3"><span className={`text-xs font-semibold ${PRIORITY_COLORS[t.priority]}`}>{t.priority}</span></td>
          </tr>
        ))}
      </ReportTable>
    </>
  )
}

// ─── Main ReportsPage ─────────────────────────────────────────────────────────

interface Props {
  savedState: ReportsState
  onStateChange: (s: ReportsState) => void
  scrollContainerRef?: React.RefObject<HTMLDivElement>
}

export default function ReportsPage({ savedState, onStateChange, scrollContainerRef }: Props) {
  const [allTasks, setAllTasks]     = useState<Task[]>([])
  const [layers, setLayers]         = useState<Layer[]>([])
  const [personnel, setPersonnel]   = useState<Personnel[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const filters   = savedState.filters
  const activeTab = savedState.activeTab

  const getScrollEl = () => scrollContainerRef?.current ?? null

  const setFilters = (f: ActiveFilters) => onStateChange({ ...savedState, filters: f })
  const setActiveTab = (t: ReportTab) => {
    onStateChange({ ...savedState, activeTab: t, scrollTop: 0 })
    requestAnimationFrame(() => { const el = getScrollEl(); if (el) el.scrollTop = 0 })
  }

  // Restore scroll on mount
  useEffect(() => {
    if (savedState.scrollTop) {
      const el = getScrollEl()
      if (el) el.scrollTop = savedState.scrollTop
    }
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [tasks, lay, pers] = await Promise.all([
        taskApi.list() as Promise<Task[]>,
        workspaceApi.getLayers() as Promise<Layer[]>,
        workspaceApi.getPersonnel() as Promise<Personnel[]>,
      ])
      setAllTasks(tasks)
      setLayers(lay)
      setPersonnel(pers)
    } catch { setError('Failed to load report data') }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Client-side filtering
  const filteredTasks = useMemo(
    () => hasActiveFilters(filters) ? filterTasks(allTasks, filters, layers, personnel) : allTasks,
    [allTasks, filters, layers, personnel]
  )

  const availableOptions: AvailableOptions = useMemo(
    () => computeAvailableOptions(allTasks, filters, layers, personnel),
    [allTasks, filters, layers, personnel]
  )

  const handleTaskClick = (t: Task) => {
    const el = getScrollEl()
    if (el) onStateChange({ ...savedState, scrollTop: el.scrollTop })
    setSelectedTask(t)
  }

  if (loading) return <div className="p-8 text-sm text-tw-text-secondary">Loading reports…</div>
  if (error)   return (
    <div className="p-8">
      <div className="text-sm text-tw-danger mb-2">{error}</div>
      <button onClick={load} className="btn-primary text-xs">Retry</button>
    </div>
  )

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl md:text-2xl font-bold text-tw-text">Reports</h1>
        <button onClick={load} title="Refresh" className="text-tw-text-secondary hover:text-tw-primary transition-colors p-1.5 rounded-lg">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
      <p className="text-sm text-tw-text-secondary mb-5">
        {hasActiveFilters(filters)
          ? <>{filteredTasks.length} of {allTasks.length} tasks match filters · <button onClick={() => setFilters(DEFAULT_FILTERS)} className="text-tw-primary hover:underline">Clear filters</button></>
          : <>{allTasks.length} total tasks</>
        }
      </p>

      {/* FilterBar */}
      <div className="mb-6">
        <FilterBar
          filters={filters}
          layers={layers}
          personnel={personnel}
          mode="task"
          availableOptions={availableOptions}
          onChange={setFilters}
        />
      </div>

      {/* Tab bar */}
      <div className="mb-6 -mx-1">
        <div className="flex overflow-x-auto gap-1 pb-1 px-1 scrollbar-hide">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors whitespace-nowrap
                ${activeTab === tab.id
                  ? 'bg-tw-primary text-white shadow-sm'
                  : 'bg-tw-hover text-tw-text-secondary hover:text-tw-text hover:bg-gray-200'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Report content */}
      <div>
        {activeTab === 'pending_approvals' && <PendingApprovalsReport tasks={filteredTasks} onTaskClick={handleTaskClick} />}
        {activeTab === 'overdue'           && <OverdueReport          tasks={filteredTasks} onTaskClick={handleTaskClick} />}
        {activeTab === 'due_soon'          && <DueSoonReport          tasks={filteredTasks} onTaskClick={handleTaskClick} />}
        {activeTab === 'sitting_longest'   && <SittingLongestReport   tasks={filteredTasks} onTaskClick={handleTaskClick} />}
        {activeTab === 'completed'         && <CompletedReport        tasks={filteredTasks} onTaskClick={handleTaskClick} />}
        {activeTab === 'by_status'         && <ByStatusReport         tasks={filteredTasks} />}
        {activeTab === 'by_officer'        && <ByOfficerReport        tasks={filteredTasks} personnel={personnel} onTaskClick={handleTaskClick} />}
        {activeTab === 'by_department'     && <ByDepartmentReport     tasks={filteredTasks} layers={layers} onTaskClick={handleTaskClick} />}
        {activeTab === 'approval_delay'    && <ApprovalDelayReport    tasks={filteredTasks} onTaskClick={handleTaskClick} />}
      </div>

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          isDirector={true}
          actorId=""
          layers={layers}
          personnel={personnel}
          onClose={() => setSelectedTask(null)}
          onRefresh={load}
        />
      )}
    </div>
  )
}
