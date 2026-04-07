import React, { useState, useEffect } from 'react'
import type { AuthUser, ViewMode, Task, Project } from '../types'
import { taskApi, projectApi } from '../services/apiService'
import NotificationsMenu from './NotificationsMenu'
import TaskCard from './TaskCard'
import TaskDetailPanel from './TaskDetailPanel'
import BoardView from './BoardView'

interface Props {
  user: AuthUser
  currentView: ViewMode
  setView: (v: ViewMode) => void
  onLogout: () => void
}

export default function PersonnelDashboard({ user, currentView, setView, onLogout }: Props) {
  const [queue, setQueue] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [tasks, projs] = await Promise.all([
        taskApi.list() as Promise<Task[]>,
        projectApi.list() as Promise<Project[]>,
      ])
      // Show tasks assigned to this person that are not done
      const myTasks = tasks.filter(t => {
        const mine = t.assignments?.some(a => a.personnelId === user.actorId)
        return mine && !['APPROVED', 'CANCELLED'].includes(t.status)
      })
      setQueue(myTasks)
      setProjects(projs)
    } catch { /* silent */ }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const navItems = [
    { label: 'My Queue',    view: 'personnel_queue' as ViewMode, icon: '📋' },
    { label: 'Board View',  view: 'project_board'   as ViewMode, icon: '⊞' },
  ]

  const byStatus = (status: string) => queue.filter(t => t.status === status)

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
        <nav className="flex-1 p-2 space-y-0.5">
          {navItems.map(item => (
            <button key={item.view} onClick={() => { setView(item.view); setSelectedProject(null) }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${currentView === item.view ? 'bg-tw-primary-light text-tw-primary' : 'text-tw-text-secondary hover:bg-tw-hover hover:text-tw-text'}`}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-tw-border">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
            <div className="w-7 h-7 rounded-full bg-tw-primary flex items-center justify-center text-white text-xs font-bold">{user.name.charAt(0).toUpperCase()}</div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-tw-text truncate">{user.name}</div>
              <div className="text-xs text-tw-text-secondary">Personnel</div>
            </div>
          </div>
          <button onClick={onLogout} className="w-full text-left px-2 py-1 text-xs text-tw-text-secondary hover:text-tw-danger transition-colors rounded">Sign out</button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-tw-surface border-b border-tw-border px-6 py-3 flex items-center justify-between">
          <span className="font-medium text-tw-text text-sm capitalize">{currentView.replace('_', ' ')}</span>
          <NotificationsMenu />
        </header>

        <main className="flex-1 overflow-auto">
          {/* MY QUEUE */}
          {currentView === 'personnel_queue' && (
            <div className="p-6">
              <h1 className="text-xl font-bold text-tw-text mb-1">My Task Queue</h1>
              <p className="text-sm text-tw-text-secondary mb-6">{queue.length} active task{queue.length !== 1 ? 's' : ''} assigned to you</p>

              {loading ? <div className="text-sm text-tw-text-secondary">Loading...</div> : (
                queue.length === 0 ? (
                  <div className="card p-12 text-center">
                    <div className="text-4xl mb-3">🎉</div>
                    <p className="text-tw-text font-semibold">All clear!</p>
                    <p className="text-tw-text-secondary text-sm mt-1">No tasks assigned to you right now.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {['ASSIGNED', 'IN_PROGRESS', 'RETURNED', 'REJECTED', 'SUBMITTED'].map(status => (
                      byStatus(status).length > 0 && (
                        <div key={status}>
                          <h3 className="text-xs font-semibold text-tw-text-secondary uppercase tracking-wide mb-3">
                            {status.replace('_', ' ')} ({byStatus(status).length})
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {byStatus(status).map(t => (
                              <TaskCard key={t.id} task={t} onClick={task => setSelectedTask(task)} />
                            ))}
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {/* BOARD VIEW — pick project */}
          {currentView === 'project_board' && !selectedProject && (
            <div className="p-6">
              <h1 className="text-xl font-bold text-tw-text mb-6">Projects</h1>
              {projects.length === 0 ? (
                <div className="card p-12 text-center text-tw-text-secondary text-sm">No projects available.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {projects.filter(p => p.status === 'active').map(p => (
                    <div key={p.id} onClick={() => setSelectedProject(p)}
                      className="card p-4 cursor-pointer hover:shadow-panel transition-shadow">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="font-semibold text-tw-text text-sm">{p.name}</span>
                      </div>
                      {p.description && <p className="text-xs text-tw-text-secondary">{p.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentView === 'project_board' && selectedProject && (
            <BoardView project={selectedProject} isDirector={false} actorId={user.actorId} />
          )}
        </main>
      </div>

      {/* Task Detail for queue items */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          isDirector={false}
          actorId={user.actorId}
          layers={[]}
          personnel={[]}
          groups={[]}
          onClose={() => setSelectedTask(null)}
          onRefresh={async () => {
            await load()
            const updated = await taskApi.get(selectedTask.id) as Task
            setSelectedTask(updated)
          }}
        />
      )}
    </div>
  )
}
