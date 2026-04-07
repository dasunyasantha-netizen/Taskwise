import React from 'react'
import type { AuthUser, ViewMode } from '../types'

interface Props {
  user: AuthUser
  currentView: ViewMode
  setView: (v: ViewMode) => void
  onLogout: () => void
}

// Full implementation coming in Phase 1 development
export default function PersonnelDashboard({ user, currentView, setView, onLogout }: Props) {
  return (
    <div className="min-h-screen bg-tw-bg flex">
      <aside className="w-60 bg-tw-surface border-r border-tw-border flex flex-col">
        <div className="p-4 border-b border-tw-border flex items-center gap-2">
          <div className="w-7 h-7 bg-tw-primary rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">T</span>
          </div>
          <span className="font-bold text-tw-text">TaskWise</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {[
            { label: 'My Task Queue', view: 'personnel_queue' as ViewMode },
            { label: 'Board View',    view: 'project_board'   as ViewMode },
          ].map(item => (
            <button
              key={item.view}
              onClick={() => setView(item.view)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentView === item.view
                  ? 'bg-tw-primary-light text-tw-primary'
                  : 'text-tw-text-secondary hover:bg-tw-hover hover:text-tw-text'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-tw-border">
          <div className="flex items-center gap-2 px-3 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-tw-primary flex items-center justify-center text-white text-xs font-bold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-tw-text truncate">{user.name}</div>
              <div className="text-xs text-tw-text-secondary">Personnel</div>
            </div>
          </div>
          <button onClick={onLogout} className="w-full text-left px-3 py-1.5 text-xs text-tw-text-secondary hover:text-tw-danger transition-colors rounded">
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <div className="card p-8 text-center text-tw-text-secondary">
          <p className="text-lg font-semibold text-tw-text mb-2">Welcome, {user.name}</p>
          <p className="text-sm">Your task queue — Phase 1 implementation in progress.</p>
        </div>
      </main>
    </div>
  )
}
