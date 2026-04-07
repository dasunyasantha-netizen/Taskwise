import React from 'react'
import type { Task } from '../types'

interface Props {
  task: Task
  onClick: (task: Task) => void
}

const priorityColor: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH:     'bg-orange-400',
  MEDIUM:   'bg-yellow-400',
  LOW:      'bg-gray-300',
}

const statusBadge: Record<string, string> = {
  PENDING:     'badge-gray',
  ASSIGNED:    'badge-primary',
  IN_PROGRESS: 'badge-warning',
  SUBMITTED:   'badge-purple',
  APPROVED:    'badge-success',
  RETURNED:    'badge-danger',
  REJECTED:    'badge-danger',
  CANCELLED:   'badge-gray',
}

export default function TaskCard({ task, onClick }: Props) {
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && !['APPROVED', 'CANCELLED'].includes(task.status)
  const deadlineSoon = task.deadline && !isOverdue && (new Date(task.deadline).getTime() - Date.now()) < 48 * 3600 * 1000

  const assigneeNames = task.assignments?.map(a =>
    a.personnel?.name || a.group?.name || a.department?.name
  ).filter(Boolean).join(', ')

  const subtaskCount = task._count?.subtasks || 0
  const commentCount = task._count?.comments || 0

  return (
    <div
      onClick={() => onClick(task)}
      className="card p-3 cursor-pointer hover:shadow-panel transition-all group mb-2 relative overflow-hidden"
    >
      {/* Priority bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${priorityColor[task.priority]}`} />

      <div className="pl-2">
        {/* Title */}
        <div className="font-medium text-tw-text text-sm leading-snug mb-2 pr-6">{task.title}</div>

        {/* Assignee */}
        {assigneeNames && (
          <div className="text-xs text-tw-text-secondary mb-2 truncate">→ {assigneeNames}</div>
        )}

        {/* Footer row */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className={`badge ${statusBadge[task.status] || 'badge-gray'} text-xs`}>
            {task.status.replace('_', ' ')}
          </span>
          <div className="flex items-center gap-2">
            {subtaskCount > 0 && (
              <span className="text-xs text-tw-text-secondary flex items-center gap-0.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                {subtaskCount}
              </span>
            )}
            {commentCount > 0 && (
              <span className="text-xs text-tw-text-secondary flex items-center gap-0.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                {commentCount}
              </span>
            )}
            {task.deadline && (
              <span className={`text-xs font-medium ${isOverdue ? 'text-tw-danger' : deadlineSoon ? 'text-tw-warning' : 'text-tw-text-secondary'}`}>
                {isOverdue ? '⚠ ' : ''}{new Date(task.deadline).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
