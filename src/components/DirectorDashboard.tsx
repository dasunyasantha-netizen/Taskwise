import React, { useState, useEffect } from 'react'
import type { AuthUser, ViewMode, Project, Task, AuditLog, TaskComment } from '../types'
import { projectApi, taskApi, auditApi } from '../services/apiService'
import NotificationsMenu from './NotificationsMenu'
import HierarchyPanel from './HierarchyPanel'
import ProjectManager from './ProjectManager'
import BoardView from './BoardView'
import FlowchartView from './FlowchartView'
import ProfilePage from './ProfilePage'
import WorkspaceSettings from './WorkspaceSettings'

interface Props {
  user: AuthUser
  currentView: ViewMode
  setView: (v: ViewMode) => void
  onLogout: () => void
  onUserUpdate: (updated: Partial<AuthUser>) => void
}

type ProjectSubView = 'board' | 'flowchart'

// ─── Approval Queue View ──────────────────────────────────────────────────────

const priorityBadge: Record<string, string> = {
  CRITICAL: 'badge-danger', HIGH: 'badge-warning', MEDIUM: 'badge-primary', LOW: 'badge-gray',
}
const subtaskStatusBadge: Record<string, string> = {
  PENDING: 'badge-gray', ASSIGNED: 'badge-primary', IN_PROGRESS: 'badge-warning',
  BLOCKED: 'bg-orange-100 text-orange-700 border border-orange-200',
  SUBMITTED: 'badge-purple', APPROVED: 'badge-success',
  RETURNED: 'badge-danger', REJECTED: 'badge-danger', CANCELLED: 'badge-gray',
}
const subtaskStatusDot: Record<string, string> = {
  PENDING: 'bg-gray-400', ASSIGNED: 'bg-blue-500', IN_PROGRESS: 'bg-yellow-500',
  BLOCKED: 'bg-orange-500', SUBMITTED: 'bg-purple-500', APPROVED: 'bg-green-500',
  RETURNED: 'bg-red-400', REJECTED: 'bg-red-500', CANCELLED: 'bg-gray-300',
}

function ApprovalTaskRow({
  task, actorId, onRefresh,
}: { task: Task; actorId: string; onRefresh: () => void }) {
  const [expanded,  setExpanded]  = useState(false)
  const [subtasks,  setSubtasks]  = useState<Task[]>([])
  const [comments,  setComments]  = useState<TaskComment[]>([])
  const [loadingS,  setLoadingS]  = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError,   setActionError]   = useState('')

  const toggle = async () => {
    setExpanded(e => !e)
    if (!expanded && subtasks.length === 0) {
      setLoadingS(true)
      try {
        const [s, c] = await Promise.all([
          taskApi.subtasks(task.id) as Promise<Task[]>,
          taskApi.comments(task.id) as Promise<TaskComment[]>,
        ])
        setSubtasks(s); setComments(c)
      } catch { /* no-op */ }
      setLoadingS(false)
    }
  }

  const doApprove = async () => {
    setActionLoading(true); setActionError('')
    try { await taskApi.approve(task.id); onRefresh() }
    catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Failed') }
    setActionLoading(false)
  }

  const doReject = async () => {
    if (!rejectReason.trim()) return
    setActionLoading(true); setActionError('')
    try { await taskApi.reject(task.id, rejectReason); setShowReject(false); setRejectReason(''); onRefresh() }
    catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Failed') }
    setActionLoading(false)
  }

  const submittedBy = task.actedByName || (task.actedByType === 'director' ? 'Director' : 'Personnel')

  return (
    <>
      {/* ── Summary row ── */}
      <tr onClick={toggle}
        className={`cursor-pointer transition-colors border-b border-tw-border
          ${expanded ? 'bg-blue-50' : 'hover:bg-[#f8f9ff]'}`}>
        <td className="pl-3 pr-0 py-3 w-1">
          <div className={`w-1 h-8 rounded-full ${
            task.priority === 'CRITICAL' ? 'bg-red-500' :
            task.priority === 'HIGH'     ? 'bg-orange-400' :
            task.priority === 'MEDIUM'   ? 'bg-yellow-400' : 'bg-gray-300'
          }`} />
        </td>
        <td className="px-4 py-3">
          <div className="font-medium text-tw-text">{task.title}</div>
          <div className="text-xs text-tw-text-secondary mt-0.5">Submitted by {submittedBy}</div>
        </td>
        <td className="px-4 py-3 text-xs text-tw-text-secondary">{task.project?.name || '—'}</td>
        <td className="px-4 py-3 text-xs text-tw-text-secondary whitespace-nowrap">
          {new Date(task.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className={`badge text-xs ${priorityBadge[task.priority]}`}>{task.priority}</span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          {task.deadline
            ? <span className="text-xs text-tw-text-secondary">{new Date(task.deadline).toLocaleDateString()}</span>
            : <span className="text-xs text-tw-text-secondary">—</span>}
        </td>
        <td className="px-3 py-3 whitespace-nowrap">
          <svg className={`w-4 h-4 text-tw-text-secondary transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </td>
      </tr>

      {/* ── Expanded row ── */}
      {expanded && (
        <tr className="border-b-2 border-tw-primary/20" style={{ background: 'linear-gradient(to right, #eef3ff, #f8f9ff)' }}>
          <td colSpan={7} className="px-0 py-0">
            <div className="px-6 py-5">

              {actionError && (
                <div className="mb-4 text-xs text-tw-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between">
                  {actionError}
                  <button onClick={() => setActionError('')} className="font-bold ml-2">×</button>
                </div>
              )}

              {/* ── Task meta ── */}
              <div className="space-y-4">
                {task.description && (
                  <p className="text-sm text-tw-text leading-relaxed whitespace-pre-wrap">{task.description}</p>
                )}

                {/* Assignees + deadline chips row */}
                <div className="flex items-start justify-between gap-6">
                  {task.assignments?.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-2">Assigned To</div>
                      <div className="flex flex-wrap gap-2">
                        {task.assignments.map(a => (
                          <div key={a.id} className="flex items-center gap-1.5 bg-white border border-tw-border rounded-full px-2.5 py-1">
                            <div className="w-4 h-4 rounded-full bg-tw-primary flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                              {(a.personnel?.name || a.department?.name || '?').charAt(0)}
                            </div>
                            <span className="text-xs font-medium text-tw-text">{a.personnel?.name || a.department?.name || a.group?.name}</span>
                            <span className="text-xs text-tw-text-secondary">{a.personnel ? '· person' : a.department ? '· dept' : '· group'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {task.deadline && (
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-2">Deadline</div>
                      <span className="text-xs font-medium text-tw-text bg-white border border-tw-border rounded-lg px-2.5 py-1 inline-block">
                        {new Date(task.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Comments */}
                {!loadingS && comments.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-2">Comments ({comments.length})</div>
                    <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                      {comments.map(c => (
                        <div key={c.id} className="flex gap-2 bg-white border border-tw-border rounded-lg px-3 py-2">
                          <div className="w-6 h-6 rounded-full bg-tw-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {(c.authorName || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-tw-text">{c.authorName || c.authorType}</span>
                              <span className="text-xs text-tw-text-secondary">{new Date(c.createdAt).toLocaleString()}</span>
                            </div>
                            <p className="text-xs text-tw-text mt-0.5">{c.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Subtasks ── */}
              <div className="border-t border-tw-primary/15 pt-4 mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-sm bg-tw-indigo inline-block" />
                  <span className="text-xs font-bold text-tw-indigo uppercase tracking-wider">
                    Subtasks{subtasks.length > 0 ? ` (${subtasks.length})` : ''}
                  </span>
                </div>
                {loadingS ? (
                  <div className="text-xs text-tw-text-secondary py-1">Loading…</div>
                ) : subtasks.length === 0 ? (
                  <div className="text-xs text-tw-text-secondary italic py-1">No subtasks.</div>
                ) : (
                  <div className="bg-white border border-tw-indigo/20 rounded-xl overflow-hidden shadow-sm">
                    <div className="divide-y divide-tw-border">
                      {subtasks.map(s => {
                        const assignee = s.assignments?.[0]
                        const assigneeName = assignee?.personnel?.name || assignee?.department?.name || assignee?.group?.name || '—'
                        const dl = s.deadline ? Math.ceil((new Date(s.deadline).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000) : null
                        const isOverdue = dl !== null && dl < 0
                        return (
                          <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${subtaskStatusDot[s.status] || 'bg-gray-400'}`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-tw-text truncate">{s.title}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`badge text-xs ${subtaskStatusBadge[s.status] || 'badge-gray'}`}>{s.status.replace('_', ' ')}</span>
                                <span className="text-xs text-tw-text-secondary truncate">→ {assigneeName}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span className={`badge text-xs ${{
                                CRITICAL: 'badge-danger', HIGH: 'badge-warning', MEDIUM: 'badge-primary', LOW: 'badge-gray'
                              }[s.priority]}`}>{s.priority}</span>
                              {dl === null ? null
                                : isOverdue ? <span className="text-xs font-semibold text-tw-danger">{Math.abs(dl)}d over</span>
                                : dl === 0  ? <span className="text-xs font-semibold text-orange-600">Today</span>
                                : dl <= 3   ? <span className="text-xs font-semibold text-orange-500">{dl}d left</span>
                                : <span className="text-xs text-tw-text-secondary">{dl}d</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Action buttons ── */}
              <div className="mt-5 pt-4 border-t border-blue-200 flex items-center justify-between gap-3">
                <p className="text-xs text-tw-text-secondary">
                  Review the submission above, then approve or send back with feedback.
                </p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    disabled={actionLoading}
                    onClick={() => { setShowReject(true); setRejectReason('') }}
                    className="px-4 py-2 rounded-lg border border-tw-danger text-tw-danger bg-white hover:bg-red-50 font-semibold text-sm transition-colors disabled:opacity-50"
                  >
                    ↩ Send Back
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={doApprove}
                    className="px-4 py-2 rounded-lg bg-tw-success text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
                  >
                    ✓ Approve
                  </button>
                </div>
              </div>
            </div>

            {/* ── Send Back modal ── */}
            {showReject && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={e => e.stopPropagation()}>
                <div className="bg-white rounded-xl shadow-panel w-full max-w-md">
                  <div className="px-5 py-4 border-b border-tw-border">
                    <h3 className="font-semibold text-tw-text">Send Back for Revision</h3>
                    <p className="text-xs text-tw-text-secondary mt-0.5">
                      Provide clear feedback so the assignee knows what needs to be corrected.
                      The task will be moved back to <strong>Rejected</strong> status.
                    </p>
                  </div>
                  <div className="px-5 py-4 space-y-3">
                    <textarea
                      className="input resize-none" rows={4} autoFocus
                      placeholder="e.g. The report is missing the financial summary section. Please revise and resubmit."
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                    />
                    {actionError && <p className="text-xs text-tw-danger">{actionError}</p>}
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setShowReject(false); setRejectReason('') }} className="btn-secondary">Cancel</button>
                      <button
                        disabled={!rejectReason.trim() || actionLoading}
                        onClick={doReject}
                        className="px-4 py-2 rounded-lg bg-tw-danger text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                      >
                        Send Back
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function ApprovalQueueView({ tasks, actorId, onRefresh }: { tasks: Task[]; actorId: string; onRefresh: () => void }) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-tw-text mb-1">Approval Queue</h1>
      <p className="text-sm text-tw-text-secondary mb-6">
        {tasks.length} task{tasks.length !== 1 ? 's' : ''} waiting for your review
      </p>
      <div className="card overflow-hidden">
        {tasks.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <p className="text-tw-text font-semibold">All caught up!</p>
            <p className="text-tw-text-secondary text-sm mt-1">No tasks waiting for approval.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f0f4ff] border-b-2 border-tw-primary/20">
                <th className="w-px px-3 py-3"></th>
                <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Task</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Project</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Submitted</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Priority</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">Deadline</th>
                <th className="w-8 px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(t => (
                <ApprovalTaskRow key={t.id} task={t} actorId={actorId} onRefresh={onRefresh} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Director Dashboard ───────────────────────────────────────────────────────
export default function DirectorDashboard({ user, currentView, setView, onLogout, onUserUpdate }: Props) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [projectSubView, setProjectSubView]   = useState<ProjectSubView>('board')
  const [stats, setStats] = useState({ projects: 0, totalTasks: 0, overdue: 0, pending_approval: 0 })
  const [recentTasks, setRecentTasks] = useState<Task[]>([])
  const [overdueList, setOverdueTasks] = useState<Task[]>([])
  const [approvalQueue, setApprovalQueue] = useState<Task[]>([])
  const [auditLogs, setAuditLogs] = useState<unknown[]>([])
  const [statsLoading, setStatsLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const loadDashboard = async () => {
    setStatsLoading(true)
    try {
      const [projects, overdue, allTasks] = await Promise.all([
        projectApi.list() as Promise<Project[]>,
        auditApi.overdue() as Promise<Task[]>,
        taskApi.list() as Promise<Task[]>,
      ])
      const submitted = allTasks.filter(t => t.status === 'SUBMITTED')
      setStats({ projects: projects.length, totalTasks: allTasks.length, overdue: overdue.length, pending_approval: submitted.length })
      setRecentTasks(allTasks.slice(0, 5))
      setOverdueTasks(overdue)
      setApprovalQueue(submitted)
    } catch { /* silent */ }
    setStatsLoading(false)
  }

  const loadAudit = async () => {
    try { setAuditLogs(await auditApi.list() as unknown[]) }
    catch { /* silent */ }
  }

  useEffect(() => { loadDashboard() }, [])
  useEffect(() => { if (currentView === 'audit_log') loadAudit() }, [currentView])

  const handleSelectProject = (p: Project) => {
    setSelectedProject(p)
    setProjectSubView('board')
    setView('project_board')
  }

  const navItems = [
    { label: 'Dashboard',      view: 'director_dashboard' as ViewMode, icon: '⊞' },
    { label: 'Projects',       view: 'project_board'      as ViewMode, icon: '📋' },
    { label: 'Approval Queue', view: 'approval_queue'     as ViewMode, icon: '✅', badge: stats.pending_approval },
    { label: 'Overdue Tasks',  view: 'overdue'            as ViewMode, icon: '⏰', badge: stats.overdue },
    { label: 'Team Hierarchy', view: 'hierarchy_manager'  as ViewMode, icon: '👥' },
    { label: 'Audit Log',      view: 'audit_log'          as ViewMode, icon: '📜' },
    { label: 'Settings',       view: 'settings'           as ViewMode, icon: '⚙️' },
    { label: 'My Profile',     view: 'profile'            as ViewMode, icon: '👤' },
  ]

  const activeView = currentView === 'project_board' && !selectedProject ? 'project_board' : currentView

  // Avatar/initials for sidebar
  const initials = user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="min-h-screen bg-tw-bg flex">
      {/* Sidebar */}
      <aside className="w-60 bg-[#1f2d3d] flex flex-col flex-shrink-0">
        {/* Workspace branding */}
        <div className="px-5 py-4 border-b border-white/10">
          {user.companyLogo ? (
            <div className="flex items-center gap-2.5">
              <img src={user.companyLogo} alt="Logo" className="w-8 h-8 rounded object-contain" />
              <span className="font-bold text-white text-base truncate">{user.companyName || 'TaskWise'}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-tw-primary rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">T</span>
              </div>
              <span className="font-bold text-white text-base">{user.companyName || 'TaskWise'}</span>
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <button key={item.view}
              onClick={() => { if (item.view === 'project_board') setSelectedProject(null); setView(item.view) }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2.5
                ${activeView === item.view ? 'bg-tw-primary text-white shadow-sm' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
              <span className="text-base flex-shrink-0">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge ? <span className="bg-tw-danger text-white text-xs rounded-full px-1.5 py-0.5 font-bold leading-none">{item.badge}</span> : null}
            </button>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-white/10">
          <button
            onClick={() => setView('profile' as ViewMode)}
            className="flex items-center gap-2.5 px-2 py-2 mb-1 w-full rounded-lg hover:bg-white/10 transition-colors"
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-tw-primary flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{initials}</div>
            )}
            <div className="min-w-0 text-left">
              <div className="text-sm font-semibold text-white truncate">{user.name}</div>
              <div className="text-xs text-white/50">Director</div>
            </div>
          </button>
          <button onClick={onLogout} className="w-full text-left px-2 py-1 text-xs text-white/40 hover:text-tw-danger transition-colors rounded">Sign out</button>
          <p className="text-center text-xs text-white/25 mt-2">Created by SysWise</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-tw-surface border-b border-tw-border px-6 py-3.5 flex items-center justify-between flex-shrink-0">
          <div className="text-base font-semibold text-tw-text">
            {currentView === 'project_board' && selectedProject ? (
              <span className="flex items-center gap-1.5 text-sm">
                <button onClick={() => setSelectedProject(null)} className="text-tw-text-secondary hover:text-tw-primary">Projects</button>
                <span className="text-tw-text-secondary">/</span>
                <span className="text-tw-text font-semibold">{selectedProject.name}</span>
              </span>
            ) : (
              <span className="capitalize">{currentView.replace(/_/g, ' ')}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {currentView === 'project_board' && selectedProject && (
              <div className="flex bg-tw-hover rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => setProjectSubView('board')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${projectSubView === 'board' ? 'bg-white text-tw-primary shadow-card' : 'text-tw-text-secondary'}`}
                >
                  Board
                </button>
                <button
                  onClick={() => setProjectSubView('flowchart')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${projectSubView === 'flowchart' ? 'bg-white text-tw-primary shadow-card' : 'text-tw-text-secondary'}`}
                >
                  Flowchart
                </button>
              </div>
            )}
            <NotificationsMenu />
          </div>
        </header>

        <main className="flex-1 overflow-auto">

          {/* DASHBOARD */}
          {currentView === 'director_dashboard' && (
            <div className="p-6">
              <h1 className="text-2xl font-bold text-tw-text mb-1">Welcome back, {user.name.split(' ')[0]}</h1>
              <p className="text-sm text-tw-text-secondary mb-6">Here's what's happening across your workspace.</p>

              {statsLoading ? <div className="text-sm text-tw-text-secondary">Loading...</div> : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {[
                      { label: 'Projects', value: stats.projects, color: 'text-tw-primary', bg: 'bg-blue-50' },
                      { label: 'Total Tasks', value: stats.totalTasks, color: 'text-tw-text', bg: 'bg-gray-50' },
                      { label: 'Pending Approval', value: stats.pending_approval, color: 'text-purple-600', bg: 'bg-purple-50' },
                      { label: 'Overdue', value: stats.overdue, color: 'text-tw-danger', bg: 'bg-red-50' },
                    ].map(s => (
                      <div key={s.label} className={`card p-4 ${s.bg}`}>
                        <div className={`text-3xl font-bold ${s.color} mb-1`}>{s.value}</div>
                        <div className="text-sm text-tw-text-secondary">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="card overflow-hidden">
                      <div className="px-4 py-3 border-b border-tw-border flex items-center justify-between">
                        <span className="font-semibold text-tw-text text-sm">Pending Approvals</span>
                        {approvalQueue.length > 0 && <button onClick={() => setView('approval_queue')} className="text-xs text-tw-primary hover:underline">View all</button>}
                      </div>
                      {approvalQueue.length === 0 ? (
                        <div className="p-6 text-center text-tw-text-secondary text-sm">No tasks awaiting approval 🎉</div>
                      ) : approvalQueue.slice(0, 4).map(t => (
                        <div key={t.id} className="px-4 py-3 border-b border-tw-border last:border-0 flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-tw-text">{t.title}</div>
                            <div className="text-xs text-tw-text-secondary">{t.project?.name}</div>
                          </div>
                          <span className="badge badge-purple text-xs">Submitted</span>
                        </div>
                      ))}
                    </div>

                    <div className="card overflow-hidden">
                      <div className="px-4 py-3 border-b border-tw-border flex items-center justify-between">
                        <span className="font-semibold text-tw-text text-sm">Overdue Tasks</span>
                        {overdueList.length > 0 && <button onClick={() => setView('overdue')} className="text-xs text-tw-danger hover:underline">View all</button>}
                      </div>
                      {overdueList.length === 0 ? (
                        <div className="p-6 text-center text-tw-text-secondary text-sm">No overdue tasks 🎉</div>
                      ) : overdueList.slice(0, 4).map(t => (
                        <div key={t.id} className="px-4 py-3 border-b border-tw-border last:border-0 flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-tw-text">{t.title}</div>
                            <div className="text-xs text-tw-danger">{t.deadline ? new Date(t.deadline).toLocaleDateString() : ''}</div>
                          </div>
                          <span className="badge badge-danger text-xs">Overdue</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* PROJECTS */}
          {currentView === 'project_board' && !selectedProject && (
            <ProjectManager onSelectProject={handleSelectProject} />
          )}
          {currentView === 'project_board' && selectedProject && projectSubView === 'board' && (
            <BoardView project={selectedProject} isDirector={true} actorId={user.actorId} />
          )}
          {currentView === 'project_board' && selectedProject && projectSubView === 'flowchart' && (
            <FlowchartView
              project={selectedProject}
              user={user}
              onTaskClick={task => { setSelectedTask(task); setProjectSubView('board') }}
            />
          )}

          {/* HIERARCHY */}
          {currentView === 'hierarchy_manager' && <HierarchyPanel />}

          {/* SETTINGS */}
          {currentView === 'settings' && (
            <WorkspaceSettings user={user} onUpdate={onUserUpdate} />
          )}

          {/* PROFILE */}
          {currentView === 'profile' && (
            <ProfilePage user={user} onUserUpdate={onUserUpdate} />
          )}

          {/* APPROVAL QUEUE */}
          {currentView === 'approval_queue' && (
            <ApprovalQueueView
              tasks={approvalQueue}
              actorId={user.actorId}
              onRefresh={loadDashboard}
            />
          )}

          {/* OVERDUE */}
          {currentView === 'overdue' && (
            <div className="p-6">
              <h1 className="text-2xl font-bold text-tw-text mb-6">Overdue Tasks</h1>
              <div className="card overflow-hidden">
                {overdueList.length === 0 ? (
                  <div className="p-12 text-center text-tw-text-secondary text-sm">No overdue tasks. Great work!</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#f0f4ff] border-b-2 border-tw-primary/20">
                        {['Task', 'Project', 'Deadline', 'Assigned To', 'Status'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-tw-border">
                      {overdueList.map(t => (
                        <tr key={t.id} className="hover:bg-tw-hover">
                          <td className="px-4 py-3 font-medium text-tw-text">{t.title}</td>
                          <td className="px-4 py-3 text-tw-text-secondary">{t.project?.name}</td>
                          <td className="px-4 py-3 text-tw-danger font-medium">{t.deadline ? new Date(t.deadline).toLocaleDateString() : '—'}</td>
                          <td className="px-4 py-3 text-tw-text-secondary">{t.assignments?.[0] ? (t.assignments[0].personnel?.name || t.assignments[0].group?.name || t.assignments[0].department?.name || '—') : '—'}</td>
                          <td className="px-4 py-3"><span className="badge badge-danger">{t.status.replace('_', ' ')}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* AUDIT LOG */}
          {currentView === 'audit_log' && (
            <div className="p-6">
              <h1 className="text-2xl font-bold text-tw-text mb-6">Audit Log</h1>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#f0f4ff] border-b-2 border-tw-primary/20">
                      {['Event', 'Actor', 'Task', 'Date & Time'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-bold text-tw-primary uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tw-border">
                    {(auditLogs as AuditLog[]).length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-tw-text-secondary text-sm">No audit entries yet.</td></tr>
                    )}
                    {(auditLogs as AuditLog[]).map((log: AuditLog) => (
                      <tr key={log.id} className="hover:bg-tw-hover">
                        <td className="px-4 py-3"><span className="font-mono text-xs bg-tw-hover px-2 py-0.5 rounded">{log.event}</span></td>
                        <td className="px-4 py-3 text-tw-text-secondary capitalize">{log.actorName || log.actorType}</td>
                        <td className="px-4 py-3 text-tw-text-secondary text-xs">{log.taskId ? log.taskId.slice(0, 8) + '...' : '—'}</td>
                        <td className="px-4 py-3 text-tw-text-secondary text-xs">{new Date(log.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
