import React, { useEffect, useState, useCallback } from 'react'
import type { Task, Project, AuthUser } from '../types'
import { taskApi } from '../services/apiService'
import { LoadingBlock, EmptyState } from './ui/Primitives'
import { Icon } from './ui/Icon'

interface Props {
  project: Project
  user: AuthUser
  onTaskClick: (task: Task) => void
}

interface TaskNode extends Task {
  children: TaskNode[]
  depth: number
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:     'bg-gray-100 border-gray-300 text-gray-600',
  ASSIGNED:    'bg-blue-50 border-blue-300 text-blue-700',
  IN_PROGRESS: 'bg-indigo-50 border-indigo-300 text-indigo-700',
  BLOCKED:     'bg-teal-50 border-teal-300 text-teal-700',
  SUBMITTED:   'bg-yellow-50 border-yellow-300 text-yellow-700',
  APPROVED:    'bg-green-50 border-green-300 text-green-700',
  RETURNED:    'bg-red-50 border-red-300 text-red-600',
  REJECTED:    'bg-red-100 border-red-400 text-red-700',
  CANCELLED:   'bg-gray-100 border-gray-200 text-gray-400',
}

const STATUS_DOT: Record<string, string> = {
  PENDING:     'bg-gray-400',
  ASSIGNED:    'bg-blue-500',
  IN_PROGRESS: 'bg-indigo-500',
  BLOCKED:     'bg-teal-500',
  SUBMITTED:   'bg-yellow-500',
  APPROVED:    'bg-green-500',
  RETURNED:    'bg-red-500',
  REJECTED:    'bg-red-600',
  CANCELLED:   'bg-gray-300',
}

function buildTree(tasks: Task[]): TaskNode[] {
  const map = new Map<string, TaskNode>()
  tasks.forEach(t => map.set(t.id, { ...t, children: [], depth: 0 }))

  const roots: TaskNode[] = []
  map.forEach(node => {
    if (node.parentTaskId && map.has(node.parentTaskId)) {
      map.get(node.parentTaskId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })

  const setDepth = (nodes: TaskNode[], depth: number) => {
    nodes.forEach(n => {
      n.depth = depth
      setDepth(n.children, depth + 1)
    })
  }
  setDepth(roots, 0)

  return roots
}

interface NodeProps {
  node: TaskNode
  onTaskClick: (task: Task) => void
  isLast: boolean
  prefix: string
}

function TaskNodeCard({ node, onTaskClick, isLast, prefix }: NodeProps) {
  const [collapsed, setCollapsed] = useState(false)
  const hasChildren = node.children.length > 0
  const colorClass = STATUS_COLORS[node.status] || STATUS_COLORS.PENDING
  const dotClass = STATUS_DOT[node.status] || STATUS_DOT.PENDING

  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-0">
        {/* Tree lines */}
        {node.depth > 0 && (
          <div className="flex flex-col items-center" style={{ width: 24, minWidth: 24 }}>
            <div className={`border-l-2 border-tw-border ${isLast ? 'h-5' : 'h-full'}`} style={{ marginLeft: 11 }} />
            <div className="border-t-2 border-tw-border" style={{ width: 13, marginLeft: 11, marginTop: 0 }} />
          </div>
        )}

        {/* Card */}
        <div className="flex-1 mb-2">
          <div
            className={`border rounded-xl px-3 py-2.5 cursor-pointer hover:shadow-panel hover:-translate-y-px transition-all ${colorClass}`}
            onClick={() => onTaskClick(node)}
          >
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
              <span className="text-sm font-medium truncate flex-1">{node.title}</span>
              {hasChildren && (
                <button
                  className="text-xs text-tw-text-secondary hover:text-tw-text flex-shrink-0 px-1"
                  onClick={e => { e.stopPropagation(); setCollapsed(c => !c) }}
                >
                  {collapsed ? <span className="inline-flex items-center gap-0.5"><Icon name="chevronRight" className="w-3.5 h-3.5" />{node.children.length}</span> : <Icon name="chevronDown" className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
            {node.deadline && (
              <p className="text-xs opacity-70 mt-0.5 ml-4">
                Due {new Date(node.deadline).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Children */}
      {hasChildren && !collapsed && (
        <div className="flex flex-col" style={{ paddingLeft: node.depth === 0 ? 24 : 24 }}>
          {node.children.map((child, i) => (
            <TaskNodeCard
              key={child.id}
              node={child}
              onTaskClick={onTaskClick}
              isLast={i === node.children.length - 1}
              prefix={prefix + (isLast ? '  ' : '│ ')}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function FlowchartView({ project, user, onTaskClick }: Props) {
  const [tasks, setTasks]     = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await taskApi.list(`projectId=${project.id}`) as Task[]
      setTasks(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [project.id])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <LoadingBlock />
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-tw-danger text-sm mb-2">{error}</p>
        <button className="btn-secondary text-sm" onClick={load}>Retry</button>
      </div>
    )
  }

  const roots = buildTree(tasks)

  if (roots.length === 0) {
    return (
      <div className="page"><div className="card"><EmptyState icon="hierarchy" title="No tasks in this project yet." /></div></div>
    )
  }

  // Group by top-level tasks
  return (
    <div className="page">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-5 card px-4 py-3">
        {Object.entries(STATUS_DOT).map(([status, dot]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${dot}`} />
            <span className="text-xs text-tw-text-secondary capitalize">{status.replace('_', ' ')}</span>
          </div>
        ))}
      </div>

      {/* Project root node */}
      <div className="mb-4 flex items-center gap-2">
        <div
          className="px-3.5 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 shadow-cta"
          style={{ backgroundColor: project.color || '#0073ea' }}
        >
          <Icon name="project" className="w-4 h-4" />
          <span>{project.name}</span>
          <span className="opacity-80 font-normal text-xs">({tasks.length} task{tasks.length !== 1 ? 's' : ''})</span>
        </div>
        <button className="btn-secondary btn-sm" onClick={load}><Icon name="refresh" className="w-3.5 h-3.5" /> Refresh</button>
      </div>

      {/* Connector line from project node to tasks */}
      <div className="border-l-2 border-tw-border ml-3 pl-5">
        {roots.map((node, i) => (
          <TaskNodeCard
            key={node.id}
            node={node}
            onTaskClick={onTaskClick}
            isLast={i === roots.length - 1}
            prefix=""
          />
        ))}
      </div>
    </div>
  )
}
