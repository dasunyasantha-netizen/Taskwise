import React, { useState, useEffect } from 'react'
import type { AuthUser, ViewMode, Project, Task, AuditLog } from '../types'
import { projectApi, taskApi, auditApi } from '../services/apiService'
import NotificationsMenu from './NotificationsMenu'
import HierarchyPanel from './HierarchyPanel'
import ProjectManager from './ProjectManager'
import BoardView from './BoardView'

interface Props {
  user: AuthUser
  currentView: ViewMode
  setView: (v: ViewMode) => void
  onLogout: () => void
}

export default function DirectorDashboard({ user, currentView, setView, onLogout }: Props) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [stats, setStats] = useState({ projects: 0, totalTasks: 0, overdue: 0, pending_approval: 0 })
  const [recentTasks, setRecentTasks] = useState<Task[]>([])
  const [overdueList, setOverdueTasks] = useState<Task[]>([])
  const [approvalQueue, setApprovalQueue] = useState<Task[]>([])
  const [auditLogs, setAuditLogs] = useState<unknown[]>([])
  const [statsLoading, setStatsLoading] = useState(true)

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
    setView('project_board')
  }

  const navItems = [
    { label: 'Dashboard',      view: 'director_dashboard' as ViewMode, icon: '⊞' },
    { label: 'Projects',       view: 'project_board'      as ViewMode, icon: '📋' },
    { label: 'Approval Queue', view: 'approval_queue'     as ViewMode, icon: '✅', badge: stats.pending_approval },
    { label: 'Overdue Tasks',  view: 'overdue'            as ViewMode, icon: '⏰', badge: stats.overdue },
    { label: 'Team Hierarchy', view: 'hierarchy_manager'  as ViewMode, icon: '👥' },
    { label: 'Audit Log',      view: 'audit_log'          as ViewMode, icon: '📜' },
  ]

  const activeView = currentView === 'project_board' && !selectedProject ? 'project_board' : currentView

  return (
    <div className="min-h-screen bg-tw-bg flex">
      {/* Sidebar */}
      <aside className="w-56 bg-tw-surface border-r border-tw-border flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-tw-border flex items-center gap-2">
          <div className="w-7 h-7 bg-tw-primary rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">T</span>
          </div>
          <span className="font-bold text-tw-text">TaskWise</span>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <button key={item.view}
              onClick={() => { if (item.view === 'project_board') setSelectedProject(null); setView(item.view) }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${activeView === item.view ? 'bg-tw-primary-light text-tw-primary' : 'text-tw-text-secondary hover:bg-tw-hover hover:text-tw-text'}`}>
              <span className="flex items-center gap-2">
                <span className="text-base">{item.icon}</span>{item.label}
              </span>
              {item.badge ? <span className="bg-tw-danger text-white text-xs rounded-full px-1.5 py-0.5 font-bold leading-none">{item.badge}</span> : null}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-tw-border">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
            <div className="w-7 h-7 rounded-full bg-tw-primary flex items-center justify-center text-white text-xs font-bold">{user.name.charAt(0).toUpperCase()}</div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-tw-text truncate">{user.name}</div>
              <div className="text-xs text-tw-text-secondary">Director</div>
            </div>
          </div>
          <button onClick={onLogout} className="w-full text-left px-2 py-1 text-xs text-tw-text-secondary hover:text-tw-danger transition-colors rounded">Sign out</button>
        </div>
      </aside>

      {/* Top bar */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-tw-surface border-b border-tw-border px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="text-sm text-tw-text-secondary">
            {currentView === 'project_board' && selectedProject ? (
              <span><button onClick={() => { setSelectedProject(null) }} className="hover:text-tw-primary">Projects</button> <span className="mx-1">/</span> <span className="text-tw-text font-medium">{selectedProject.name}</span></span>
            ) : (
              <span className="font-medium text-tw-text capitalize">{currentView.replace('_', ' ')}</span>
            )}
          </div>
          <NotificationsMenu />
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">

          {/* DASHBOARD */}
          {currentView === 'director_dashboard' && (
            <div className="p-6">
              <h1 className="text-xl font-bold text-tw-text mb-1">Welcome back, {user.name.split(' ')[0]}</h1>
              <p className="text-sm text-tw-text-secondary mb-6">Here's what's happening across your workspace.</p>

              {statsLoading ? <div className="text-sm text-tw-text-secondary">Loading...</div> : (
                <>
                  {/* Stat cards */}
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
                    {/* Approval queue preview */}
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

                    {/* Overdue preview */}
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

          {/* PROJECTS → Board */}
          {currentView === 'project_board' && !selectedProject && (
            <ProjectManager onSelectProject={handleSelectProject} />
          )}
          {currentView === 'project_board' && selectedProject && (
            <BoardView project={selectedProject} isDirector={true} actorId={user.actorId} />
          )}

          {/* HIERARCHY */}
          {currentView === 'hierarchy_manager' && <HierarchyPanel />}

          {/* APPROVAL QUEUE */}
          {currentView === 'approval_queue' && (
            <div className="p-6">
              <h1 className="text-xl font-bold text-tw-text mb-6">Approval Queue</h1>
              <div className="card overflow-hidden">
                {approvalQueue.length === 0 ? (
                  <div className="p-12 text-center text-tw-text-secondary text-sm">No tasks awaiting approval.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-tw-hover">
                      <tr>{['Task', 'Project', 'Submitted', 'Priority'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-tw-text-secondary uppercase tracking-wide">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-tw-border">
                      {approvalQueue.map(t => (
                        <tr key={t.id} className="hover:bg-tw-hover">
                          <td className="px-4 py-3 font-medium text-tw-text">{t.title}</td>
                          <td className="px-4 py-3 text-tw-text-secondary">{t.project?.name}</td>
                          <td className="px-4 py-3 text-tw-text-secondary">{new Date(t.updatedAt).toLocaleDateString()}</td>
                          <td className="px-4 py-3"><span className={`badge ${{ CRITICAL: 'badge-danger', HIGH: 'badge-warning', MEDIUM: 'badge-primary', LOW: 'badge-gray' }[t.priority]}`}>{t.priority}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* OVERDUE */}
          {currentView === 'overdue' && (
            <div className="p-6">
              <h1 className="text-xl font-bold text-tw-text mb-6">Overdue Tasks</h1>
              <div className="card overflow-hidden">
                {overdueList.length === 0 ? (
                  <div className="p-12 text-center text-tw-text-secondary text-sm">No overdue tasks. Great work!</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-tw-hover">
                      <tr>{['Task', 'Project', 'Deadline', 'Assigned To', 'Status'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-tw-text-secondary uppercase tracking-wide">{h}</th>
                      ))}</tr>
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
              <h1 className="text-xl font-bold text-tw-text mb-6">Audit Log</h1>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-tw-hover">
                    <tr>{['Event', 'Actor', 'Task', 'Date & Time'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-tw-text-secondary uppercase tracking-wide">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-tw-border">
                    {(auditLogs as AuditLog[]).length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-tw-text-secondary text-sm">No audit entries yet.</td></tr>
                    )}
                    {(auditLogs as AuditLog[]).map((log: AuditLog) => (
                      <tr key={log.id} className="hover:bg-tw-hover">
                        <td className="px-4 py-3"><span className="font-mono text-xs bg-tw-hover px-2 py-0.5 rounded">{log.event}</span></td>
                        <td className="px-4 py-3 text-tw-text-secondary capitalize">{log.actorType}</td>
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
