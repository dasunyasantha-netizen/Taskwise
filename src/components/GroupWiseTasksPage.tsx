import React, { useState, useEffect, useCallback } from 'react'
import type { Personnel, Layer, Task } from '../types'
import { taskGroupApi, workspaceApi, projectApi } from '../services/apiService'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GroupMemberInfo {
  id: string
  name: string
  avatarUrl?: string
  department?: { name: string; layer: { number: number; name: string } }
  supervisor?: { id: string; name: string } | null
  supervisorId?: string | null
}

interface TaskGroupMemberRec {
  id: string
  groupId: string
  personnelId: string
  personnel?: GroupMemberInfo
  createdAt: string
}

interface GroupProjectRec {
  id: string
  groupId: string
  projectId: string
  project?: { id: string; name: string; color: string; status: string }
  createdAt: string
}

interface TaskGroup {
  id: string
  name: string
  description?: string
  members?: TaskGroupMemberRec[]
  groupProjects?: GroupProjectRec[]
  deletedAt: string | null
  createdAt: string
}

interface ProgressLog {
  id: string
  note: string
  logDate: string
  createdAt: string
  authorName?: string
}

interface MemberTask {
  id: string
  title: string
  status: string
  priority: string
  deadline?: string
  assignments: Array<{ personnel?: { id: string; name: string } }>
  progressLogs: ProgressLog[]
}

interface ParentGroupTask {
  id: string
  title: string
  status: string
  priority: string
  deadline?: string
  createdAt: string
  project?: { id: string; name: string; color: string }
  groupTaskInstances: MemberTask[]
}

interface MonitorData {
  group: TaskGroup
  parentTasks: ParentGroupTask[]
}

// ─── Utility ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  SUBMITTED: 'bg-purple-100 text-purple-700',
  APPROVED: 'bg-green-100 text-green-700',
  RETURNED: 'bg-orange-100 text-orange-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-400',
}

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-500', HIGH: 'bg-orange-400', MEDIUM: 'bg-yellow-400', LOW: 'bg-gray-300',
}

function Avatar({ name, size = 8 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500', 'bg-indigo-500']
  const color = colors[name.charCodeAt(0) % colors.length]
  return (
    <div className={`w-${size} h-${size} rounded-full ${color} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
      {initials}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ─── Member History Modal ────────────────────────────────────────────────────

function MemberHistoryModal({
  groupId, taskId, memberId, memberName, taskTitle, onClose,
}: { groupId: string; taskId: string; memberId: string; memberName: string; taskTitle: string; onClose: () => void }) {
  const [data, setData] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    taskGroupApi.getMemberHistory(groupId, taskId, memberId)
      .then(d => setData(d as Task))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [groupId, taskId, memberId])

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-tw-border flex-shrink-0">
          <div>
            <h3 className="font-bold text-tw-text">{memberName}</h3>
            <p className="text-xs text-tw-text-secondary mt-0.5">{taskTitle}</p>
          </div>
          <button onClick={onClose} className="text-tw-text-secondary hover:text-tw-text text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-tw-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : !data ? (
            <p className="text-sm text-tw-text-secondary text-center py-8">Could not load history.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <StatusBadge status={data.status} />
                {data.deadline && <span className="text-xs text-tw-text-secondary">Due {fmtDate(data.deadline)}</span>}
              </div>

              {/* Progress logs */}
              <div>
                <h4 className="text-xs font-bold text-tw-text-secondary uppercase tracking-wide mb-2">
                  Progress Updates ({(data as unknown as { progressLogs: ProgressLog[] }).progressLogs?.length || 0})
                </h4>
                {((data as unknown as { progressLogs: ProgressLog[] }).progressLogs?.length || 0) === 0 ? (
                  <p className="text-sm text-tw-text-secondary italic">No updates yet.</p>
                ) : (
                  <div className="space-y-2">
                    {(data as unknown as { progressLogs: ProgressLog[] }).progressLogs?.map((log: ProgressLog) => (
                      <div key={log.id} className="bg-tw-hover rounded-lg px-3 py-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-tw-text-secondary">{log.authorName || memberName}</span>
                          <span className="text-xs text-tw-text-secondary">{fmtDate(log.createdAt)}</span>
                        </div>
                        <p className="text-sm text-tw-text whitespace-pre-wrap">{log.note}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Member Card ─────────────────────────────────────────────────────────────

function MemberTaskCard({
  instance, memberName, groupId, parentTaskId, onViewHistory,
}: {
  instance: MemberTask
  memberName: string
  groupId: string
  parentTaskId: string
  onViewHistory: () => void
}) {
  const latestLog = instance.progressLogs?.[0]
  return (
    <div className="bg-white border border-tw-border rounded-xl p-3 hover:border-tw-primary/40 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar name={memberName} size={7} />
          <div className="min-w-0">
            <div className="font-medium text-sm text-tw-text truncate">{memberName}</div>
            {instance.assignments[0]?.personnel?.id && (
              <div className="text-xs text-tw-text-secondary truncate">
                {instance.assignments[0]?.personnel?.name}
              </div>
            )}
          </div>
        </div>
        <StatusBadge status={instance.status} />
      </div>

      {latestLog ? (
        <div className="bg-tw-hover rounded-lg px-2.5 py-2 mb-2">
          <p className="text-xs text-tw-text line-clamp-2 whitespace-pre-wrap">{latestLog.note}</p>
          <p className="text-xs text-tw-text-secondary mt-1">{fmtDateShort(latestLog.createdAt)}</p>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg px-2.5 py-2 mb-2">
          <p className="text-xs text-tw-text-secondary italic">No updates yet</p>
        </div>
      )}

      <button
        onClick={onViewHistory}
        className="text-xs text-tw-primary hover:underline font-medium"
      >
        View full history →
      </button>
    </div>
  )
}

// ─── Parent Task Row (expandable) ─────────────────────────────────────────────

function GroupTaskRow({
  parentTask, groups, onClose,
}: { parentTask: ParentGroupTask; groups: TaskGroup[]; onClose: (taskId: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [historyTarget, setHistoryTarget] = useState<{ taskId: string; memberId: string; memberName: string; groupId: string } | null>(null)

  const instances = parentTask.groupTaskInstances || []
  const approvedCount = instances.filter(i => i.status === 'APPROVED').length

  // Find which group this task belongs to — look through all groups
  const owningGroup = groups.find(g =>
    g.members?.some(m =>
      instances.some(i => i.assignments.some(a => a.personnel?.id === m.personnelId))
    )
  )

  return (
    <>
      <div className={`card overflow-hidden transition-shadow ${expanded ? 'shadow-md' : ''}`}>
        {/* Header row */}
        <button
          className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-tw-hover transition-colors"
          onClick={() => setExpanded(e => !e)}
        >
          <div className={`w-1.5 h-6 rounded-full flex-shrink-0 ${PRIORITY_DOT[parentTask.priority] || 'bg-gray-300'}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-tw-text text-sm">{parentTask.title}</span>
              {parentTask.project && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium text-white"
                  style={{ background: parentTask.project.color }}>
                  {parentTask.project.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <StatusBadge status={parentTask.status} />
              <span className="text-xs text-tw-text-secondary">
                {approvedCount}/{instances.length} members done
              </span>
              {parentTask.deadline && (
                <span className="text-xs text-tw-text-secondary">Due {fmtDate(parentTask.deadline)}</span>
              )}
              <span className="text-xs text-tw-text-secondary">Assigned {fmtDate(parentTask.createdAt)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {parentTask.status !== 'APPROVED' && parentTask.status !== 'CANCELLED' && (
              <button
                onClick={e => { e.stopPropagation(); onClose(parentTask.id) }}
                className="text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 font-medium transition-colors"
              >
                Close Task
              </button>
            )}
            <svg className={`w-4 h-4 text-tw-text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {/* Progress bar */}
        <div className="px-4 pb-1">
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-400 rounded-full transition-all"
              style={{ width: instances.length > 0 ? `${(approvedCount / instances.length) * 100}%` : '0%' }}
            />
          </div>
        </div>

        {/* Expanded member cards */}
        {expanded && (
          <div className="px-4 pb-4 pt-3 border-t border-tw-border bg-[#f8f9ff]">
            {instances.length === 0 ? (
              <p className="text-sm text-tw-text-secondary italic text-center py-4">No member assignments yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {instances.map(instance => {
                  const assignedPersonnel = instance.assignments[0]?.personnel
                  const memberName = assignedPersonnel?.name || 'Unknown'
                  const memberId = assignedPersonnel?.id || ''
                  const groupId = owningGroup?.id || ''
                  return (
                    <MemberTaskCard
                      key={instance.id}
                      instance={instance}
                      memberName={memberName}
                      groupId={groupId}
                      parentTaskId={parentTask.id}
                      onViewHistory={() => setHistoryTarget({ taskId: instance.id, memberId, memberName, groupId })}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {historyTarget && (
        <MemberHistoryModal
          groupId={historyTarget.groupId}
          taskId={historyTarget.taskId}
          memberId={historyTarget.memberId}
          memberName={historyTarget.memberName}
          taskTitle={parentTask.title}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </>
  )
}

// ─── Group View ───────────────────────────────────────────────────────────────

function GroupCard({
  group, allPersonnel, layers, onRefresh, onAddMember, onAssignTask, onCreateProject,
}: {
  group: TaskGroup
  allPersonnel: Personnel[]
  layers: Layer[]
  onRefresh: () => void
  onAddMember: (group: TaskGroup) => void
  onAssignTask: (group: TaskGroup) => void
  onCreateProject: (group: TaskGroup) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [monitor, setMonitor] = useState<MonitorData | null>(null)
  const [loadingMonitor, setLoadingMonitor] = useState(false)
  const [historyTarget, setHistoryTarget] = useState<{
    taskId: string; memberId: string; memberName: string
  } | null>(null)

  const loadMonitor = async () => {
    setLoadingMonitor(true)
    try {
      const data = await taskGroupApi.getMonitor(group.id) as MonitorData
      setMonitor(data)
    } catch { /* silent */ }
    setLoadingMonitor(false)
  }

  const toggle = () => {
    setExpanded(e => !e)
    if (!expanded && !monitor) loadMonitor()
  }

  const members = group.members || []
  const projects = group.groupProjects || []

  return (
    <>
      <div className={`card overflow-hidden transition-shadow ${expanded ? 'shadow-md' : ''}`}>
        {/* Group header */}
        <button className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-tw-hover transition-colors" onClick={toggle}>
          <div className="w-9 h-9 rounded-xl bg-tw-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-tw-primary font-bold text-sm">👥</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-tw-text">{group.name}</div>
            <div className="text-xs text-tw-text-secondary mt-0.5">
              {members.length} member{members.length !== 1 ? 's' : ''} · {projects.length} project{projects.length !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={e => { e.stopPropagation(); onAddMember(group) }}
              className="hidden sm:flex text-xs px-2.5 py-1.5 rounded-lg border border-tw-border text-tw-text-secondary hover:border-tw-primary hover:text-tw-primary transition-colors items-center gap-1"
            >
              + Member
            </button>
            <button
              onClick={e => { e.stopPropagation(); onAssignTask(group) }}
              className="hidden sm:flex text-xs px-2.5 py-1.5 rounded-lg bg-tw-primary text-white hover:opacity-90 transition-opacity items-center gap-1"
            >
              + Task
            </button>
            <svg className={`w-4 h-4 text-tw-text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {/* Expanded */}
        {expanded && (
          <div className="border-t border-tw-border">
            {/* Members list */}
            <div className="px-4 pt-3 pb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-tw-text-secondary uppercase tracking-wide">Members</span>
                <div className="flex gap-2 sm:hidden">
                  <button onClick={() => onAddMember(group)} className="text-xs px-2.5 py-1 rounded-lg border border-tw-border text-tw-text-secondary">+ Member</button>
                  <button onClick={() => onAssignTask(group)} className="text-xs px-2.5 py-1 rounded-lg bg-tw-primary text-white">+ Task</button>
                </div>
              </div>
              {members.length === 0 ? (
                <p className="text-sm text-tw-text-secondary italic">No members yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {members.map(m => (
                    <div key={m.id} className="flex items-center gap-1.5 bg-tw-hover px-2.5 py-1.5 rounded-lg">
                      <Avatar name={m.personnel?.name || '?'} size={5} />
                      <span className="text-xs text-tw-text">{m.personnel?.name}</span>
                      {m.personnel?.department && (
                        <span className="text-xs text-tw-text-secondary">· L{m.personnel.department.layer.number}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Projects */}
            {projects.length > 0 && (
              <div className="px-4 py-2 border-t border-tw-border">
                <span className="text-xs font-bold text-tw-text-secondary uppercase tracking-wide block mb-2">Projects</span>
                <div className="flex flex-wrap gap-2">
                  {projects.map(gp => (
                    <div key={gp.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-white text-xs font-medium"
                      style={{ background: gp.project?.color || '#0073ea' }}>
                      {gp.project?.name}
                    </div>
                  ))}
                </div>
                <button onClick={() => onCreateProject(group)} className="mt-2 text-xs text-tw-primary hover:underline">+ New project</button>
              </div>
            )}
            {projects.length === 0 && (
              <div className="px-4 py-2 border-t border-tw-border">
                <button onClick={() => onCreateProject(group)} className="text-xs text-tw-primary hover:underline">+ Create first project for this group</button>
              </div>
            )}

            {/* Tasks */}
            <div className="px-4 pt-2 pb-3 border-t border-tw-border bg-[#f8f9ff]">
              <span className="text-xs font-bold text-tw-text-secondary uppercase tracking-wide block mb-3">Active Tasks</span>
              {loadingMonitor ? (
                <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-tw-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : monitor && monitor.parentTasks.length > 0 ? (
                <div className="space-y-3">
                  {monitor.parentTasks.map(pt => (
                    <div key={pt.id} className="bg-white rounded-xl border border-tw-border p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-medium text-sm text-tw-text">{pt.title}</span>
                        <StatusBadge status={pt.status} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {pt.groupTaskInstances.map(instance => {
                          const assignedPersonnel = instance.assignments[0]?.personnel
                          const memberName = assignedPersonnel?.name || 'Unknown'
                          const memberId = assignedPersonnel?.id || ''
                          const latestLog = instance.progressLogs?.[0]
                          return (
                            <div key={instance.id} className="bg-tw-hover rounded-lg p-2.5 cursor-pointer hover:bg-blue-50 transition-colors"
                              onClick={() => setHistoryTarget({ taskId: instance.id, memberId, memberName })}>
                              <div className="flex items-center gap-1.5 mb-1">
                                <Avatar name={memberName} size={5} />
                                <span className="text-xs font-medium text-tw-text truncate">{memberName}</span>
                                <StatusBadge status={instance.status} />
                              </div>
                              {latestLog ? (
                                <p className="text-xs text-tw-text-secondary line-clamp-1">{latestLog.note}</p>
                              ) : (
                                <p className="text-xs text-tw-text-secondary italic">No updates</p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-tw-text-secondary italic text-center py-3">No tasks assigned to this group yet.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {historyTarget && monitor && (
        <MemberHistoryModal
          groupId={group.id}
          taskId={historyTarget.taskId}
          memberId={historyTarget.memberId}
          memberName={historyTarget.memberName}
          taskTitle={monitor.parentTasks.find(pt =>
            pt.groupTaskInstances.some(i => i.id === historyTarget.taskId)
          )?.title || ''}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </>
  )
}

// ─── Add Member Modal ─────────────────────────────────────────────────────────

function AddMemberModal({
  group, allPersonnel, layers, onClose, onAdded,
}: {
  group: TaskGroup
  allPersonnel: Personnel[]
  layers: Layer[]
  onClose: () => void
  onAdded: () => void
}) {
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // When a person needs a supervisor set before adding, track which person
  // and show an inline supervisor picker for them
  const [supervisorFor, setSupervisorFor] = useState<Personnel | null>(null)
  const [supervisorId, setSupervisorId] = useState('')
  const [savingSupervisor, setSavingSupervisor] = useState(false)
  // Local override map: personnelId → supervisorId (applied after inline save)
  const [supervisorOverrides, setSupervisorOverrides] = useState<Record<string, string>>({})

  const existingMemberIds = new Set((group.members || []).map(m => m.personnelId))
  const allDepts = layers.flatMap(l => l.departments || [])

  const getPersonnelLayer = (p: Personnel) => {
    const dept = allDepts.find(d => d.id === p.departmentId)
    return layers.find(l => l.id === dept?.layerId)
  }

  // Candidates for supervisor: people one layer above in the same branch or any higher layer
  const getSupervisorCandidates = (p: Personnel) => {
    const myDept = allDepts.find(d => d.id === p.departmentId)
    const myLayer = layers.find(l => l.id === myDept?.layerId)
    if (!myLayer) return allPersonnel.filter(x => !x.deletedAt && x.id !== p.id)
    // People from layers with a lower number (higher in hierarchy)
    const higherLayerIds = layers.filter(l => l.number < myLayer.number).map(l => l.id)
    const higherDeptIds = allDepts.filter(d => higherLayerIds.includes(d.layerId)).map(d => d.id)
    return allPersonnel.filter(x => !x.deletedAt && x.id !== p.id && higherDeptIds.includes(x.departmentId))
  }

  const filtered = allPersonnel.filter(p =>
    !p.deletedAt &&
    !existingMemberIds.has(p.id) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.department as unknown as { name: string })?.name?.toLowerCase().includes(search.toLowerCase()))
  )

  const hasSupervisor = (p: Personnel) =>
    !!p.supervisorId || !!supervisorOverrides[p.id]

  const addMember = async (personnelId: string) => {
    setSaving(true); setError('')
    try {
      await taskGroupApi.addMember(group.id, { personnelId })
      onAdded()
    } catch (e: unknown) {
      const msg = (e as { message?: string }).message || ''
      if (msg.includes('supervisor_chain_incomplete')) {
        setError(`Supervisor chain is still incomplete after saving. Please check the chain in Team Hierarchy.`)
      } else {
        setError(msg || 'Failed to add member')
      }
    }
    setSaving(false)
  }

  const handleRowClick = (p: Personnel) => {
    if (hasSupervisor(p)) {
      addMember(p.id)
    } else {
      // Open inline supervisor picker for this person
      setSupervisorFor(p)
      setSupervisorId('')
      setError('')
    }
  }

  const saveSupervisorAndAdd = async () => {
    if (!supervisorFor || !supervisorId) return
    setSavingSupervisor(true); setError('')
    try {
      await workspaceApi.setSupervisor(supervisorFor.id, supervisorId)
      // Track that we've assigned a supervisor locally
      setSupervisorOverrides(prev => ({ ...prev, [supervisorFor.id]: supervisorId }))
      setSupervisorFor(null)
      setSupervisorId('')
      // Now add to group
      await addMember(supervisorFor.id)
    } catch (e: unknown) {
      setError((e as { message?: string }).message || 'Failed to set supervisor')
    }
    setSavingSupervisor(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-tw-border flex-shrink-0">
          <div>
            <h3 className="font-bold text-tw-text">Add Member — {group.name}</h3>
            <p className="text-xs text-tw-text-secondary mt-0.5">Select any personnel from any level</p>
          </div>
          <button onClick={onClose} className="text-tw-text-secondary hover:text-tw-text text-xl">×</button>
        </div>

        {/* Inline supervisor assignment panel */}
        {supervisorFor && (
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <Avatar name={supervisorFor.name} size={6} />
              <div>
                <p className="text-sm font-semibold text-tw-text">{supervisorFor.name}</p>
                <p className="text-xs text-amber-700">needs a supervisor before being added to this group</p>
              </div>
            </div>
            <label className="block text-xs font-semibold text-tw-text mb-1">Assign supervisor</label>
            <select
              className="input w-full text-sm mb-2"
              value={supervisorId}
              onChange={e => setSupervisorId(e.target.value)}
              autoFocus
            >
              <option value="">Select supervisor…</option>
              {getSupervisorCandidates(supervisorFor).map(c => {
                const dept = allDepts.find(d => d.id === c.departmentId)
                const layer = getPersonnelLayer(c)
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} — {layer?.name} · {dept?.name}
                  </option>
                )
              })}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => { setSupervisorFor(null); setSupervisorId('') }}
                className="btn-secondary text-xs py-1.5 flex-1"
              >
                Cancel
              </button>
              <button
                disabled={!supervisorId || savingSupervisor}
                onClick={saveSupervisorAndAdd}
                className="btn-primary text-xs py-1.5 flex-1 disabled:opacity-50"
              >
                {savingSupervisor ? 'Saving…' : 'Set & Add to Group'}
              </button>
            </div>
          </div>
        )}

        <div className="px-4 py-3 border-b border-tw-border flex-shrink-0">
          <input
            className="input w-full"
            placeholder="Search by name or department..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus={!supervisorFor}
          />
        </div>
        {error && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-100 flex-shrink-0">
            <p className="text-xs text-tw-danger">{error}</p>
          </div>
        )}
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-tw-text-secondary text-center py-8">No personnel found.</p>
          ) : (
            filtered.map(p => {
              const dept = allDepts.find(d => d.id === p.departmentId)
              const layer = getPersonnelLayer(p)
              const hasSuper = hasSupervisor(p)
              const isTarget = supervisorFor?.id === p.id
              return (
                <button
                  key={p.id}
                  disabled={saving || savingSupervisor}
                  onClick={() => handleRowClick(p)}
                  className={`w-full text-left px-4 py-3 transition-colors flex items-center gap-3 border-b border-tw-border last:border-0 disabled:opacity-50 ${
                    isTarget ? 'bg-amber-50' : 'hover:bg-tw-hover'
                  }`}
                >
                  <Avatar name={p.name} size={8} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-tw-text">{p.name}</div>
                    <div className="text-xs text-tw-text-secondary">
                      {layer?.name} · {dept?.name}
                    </div>
                    {hasSuper ? (
                      supervisorOverrides[p.id] ? (
                        <div className="text-xs text-green-600 mt-0.5">
                          ✓ Supervisor just assigned
                        </div>
                      ) : (
                        <div className="text-xs text-green-600 mt-0.5">
                          ✓ Supervisor: {(p.supervisor as unknown as { name: string })?.name}
                        </div>
                      )
                    ) : (
                      <div className="text-xs text-amber-600 mt-0.5">
                        ⚠ No supervisor — tap to assign one
                      </div>
                    )}
                  </div>
                  {!hasSuper && (
                    <span className="text-xs px-2 py-1 rounded-lg bg-amber-100 text-amber-700 font-medium flex-shrink-0">
                      Set supervisor
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Assign Task Modal ────────────────────────────────────────────────────────

function AssignTaskModal({
  group, onClose, onAssigned,
}: { group: TaskGroup; onClose: () => void; onAssigned: () => void }) {
  const [projects, setProjects] = useState<Array<{ id: string; name: string; color: string }>>([])
  const [form, setForm] = useState({
    projectId: '',
    title: '',
    description: '',
    priority: 'MEDIUM',
    deadline: '',
  })
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [allMembers, setAllMembers] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Load group projects
    const groupProjects = (group.groupProjects || [])
      .map(gp => gp.project)
      .filter(Boolean) as Array<{ id: string; name: string; color: string }>
    setProjects(groupProjects)
    if (groupProjects.length === 1) setForm(f => ({ ...f, projectId: groupProjects[0].id }))
  }, [group])

  const members = group.members || []

  const toggleMember = (id: string) => {
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSubmit = async () => {
    if (!form.projectId || !form.title.trim()) {
      setError('Project and title are required'); return
    }
    setSaving(true); setError('')
    try {
      await taskGroupApi.assignTask(group.id, {
        projectId: form.projectId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        priority: form.priority,
        deadline: form.deadline || undefined,
        memberIds: allMembers ? [] : selectedMembers,
      })
      onAssigned()
    } catch (e: unknown) {
      setError((e as { message?: string }).message || 'Failed to assign task')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-tw-border flex-shrink-0">
          <div>
            <h3 className="font-bold text-tw-text">Assign Group Task — {group.name}</h3>
            <p className="text-xs text-tw-text-secondary mt-0.5">Each member will get their own task instance</p>
          </div>
          <button onClick={onClose} className="text-tw-text-secondary hover:text-tw-text text-xl">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Project selector */}
          <div>
            <label className="block text-sm font-semibold text-tw-text mb-1.5">Project</label>
            {projects.length === 0 ? (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No projects linked to this group yet. Create a project first.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {projects.map(p => (
                  <button key={p.id}
                    onClick={() => setForm(f => ({ ...f, projectId: p.id }))}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors ${
                      form.projectId === p.id ? 'border-tw-primary text-white' : 'border-transparent text-white opacity-70 hover:opacity-100'
                    }`}
                    style={{ background: p.color }}>
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-tw-text mb-1.5">Task Title</label>
            <input className="input w-full" placeholder="What needs to be done?"
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-tw-text mb-1.5">Description <span className="text-tw-text-secondary font-normal">(optional)</span></label>
            <textarea className="input resize-none w-full" rows={2} placeholder="Additional details..."
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>

          {/* Priority & Deadline */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-tw-text mb-1.5">Priority</label>
              <select className="input w-full" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-tw-text mb-1.5">Deadline <span className="text-tw-text-secondary font-normal">(optional)</span></label>
              <input type="date" className="input w-full" value={form.deadline}
                onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
            </div>
          </div>

          {/* Member selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-tw-text">Assign to</label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={allMembers} onChange={e => { setAllMembers(e.target.checked); if (e.target.checked) setSelectedMembers([]) }}
                  className="rounded border-tw-border text-tw-primary" />
                <span className="text-xs text-tw-text-secondary">All members ({members.length})</span>
              </label>
            </div>
            {!allMembers && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto border border-tw-border rounded-lg p-2">
                {members.map(m => (
                  <label key={m.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-tw-hover px-2 py-1.5 rounded-lg">
                    <input type="checkbox" checked={selectedMembers.includes(m.personnelId)}
                      onChange={() => toggleMember(m.personnelId)}
                      className="rounded border-tw-border text-tw-primary" />
                    <Avatar name={m.personnel?.name || '?'} size={6} />
                    <span className="text-sm text-tw-text">{m.personnel?.name}</span>
                    {m.personnel?.department && (
                      <span className="text-xs text-tw-text-secondary">L{m.personnel.department.layer.number}</span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-tw-danger">{error}</p>}
        </div>
        <div className="flex gap-2 justify-end px-5 py-4 border-t border-tw-border flex-shrink-0">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            disabled={saving || !form.title.trim() || !form.projectId || (!allMembers && selectedMembers.length === 0)}
            onClick={handleSubmit}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? 'Assigning…' : `Assign to ${allMembers ? 'all ' + members.length : selectedMembers.length} member${(allMembers ? members.length : selectedMembers.length) !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create Group Modal ───────────────────────────────────────────────────────

function CreateGroupModal({ onClose, onCreate }: { onClose: () => void; onCreate: (group: TaskGroup) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Group name is required'); return }
    setSaving(true); setError('')
    try {
      const group = await taskGroupApi.create({ name: name.trim(), description: description.trim() || undefined }) as TaskGroup
      onCreate(group)
    } catch (e: unknown) {
      setError((e as { message?: string }).message || 'Failed to create group')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-tw-border">
          <h3 className="font-bold text-tw-text">Create Task Group</h3>
          <button onClick={onClose} className="text-tw-text-secondary hover:text-tw-text text-xl">×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-tw-text mb-1.5">Group Name</label>
            <input className="input w-full" placeholder="e.g. National Coordinators"
              value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="block text-sm font-semibold text-tw-text mb-1.5">Description <span className="text-tw-text-secondary font-normal">(optional)</span></label>
            <textarea className="input resize-none w-full" rows={2} placeholder="What is this group for?"
              value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <p className="text-xs text-tw-text-secondary bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            You can add members from any level after creating the group.
          </p>
          {error && <p className="text-sm text-tw-danger">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button disabled={saving || !name.trim()} onClick={handleSubmit} className="btn-primary disabled:opacity-50">
              {saving ? 'Creating…' : 'Create Group'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Create Project Modal ─────────────────────────────────────────────────────

function CreateProjectModal({ group, onClose, onCreated }: { group: TaskGroup; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', description: '', color: '#0073ea' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const colors = ['#0073ea', '#6b4fbb', '#00c875', '#e2445c', '#fdab3d', '#0086c0', '#ff7575']

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      await taskGroupApi.createProject(group.id, form)
      onCreated()
    } catch (e: unknown) {
      setError((e as { message?: string }).message || 'Failed')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-tw-border">
          <div>
            <h3 className="font-bold text-tw-text">New Project — {group.name}</h3>
          </div>
          <button onClick={onClose} className="text-tw-text-secondary hover:text-tw-text text-xl">×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-tw-text mb-1.5">Project Name</label>
            <input className="input w-full" placeholder="e.g. Youth Development 2026"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div>
            <label className="block text-sm font-semibold text-tw-text mb-1.5">Color</label>
            <div className="flex gap-2">
              {colors.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${form.color === c ? 'border-white ring-2 ring-tw-primary scale-110' : 'border-transparent'}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-tw-danger">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button disabled={saving || !form.name.trim()} onClick={handleSubmit} className="btn-primary disabled:opacity-50">
              {saving ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GroupWiseTasksPage() {
  const [viewMode, setViewMode] = useState<'group' | 'project'>('group')
  const [groups, setGroups] = useState<TaskGroup[]>([])
  const [groupProjects, setGroupProjects] = useState<unknown[]>([])
  const [allPersonnel, setAllPersonnel] = useState<Personnel[]>([])
  const [layers, setLayers] = useState<Layer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Modals
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [addMemberTarget, setAddMemberTarget] = useState<TaskGroup | null>(null)
  const [assignTaskTarget, setAssignTaskTarget] = useState<TaskGroup | null>(null)
  const [createProjectTarget, setCreateProjectTarget] = useState<TaskGroup | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [g, p, l] = await Promise.all([
        taskGroupApi.list() as Promise<TaskGroup[]>,
        workspaceApi.getPersonnel() as Promise<Personnel[]>,
        workspaceApi.getLayers() as Promise<Layer[]>,
      ])
      setGroups(g)
      setAllPersonnel(p)
      setLayers(l)
    } catch { setError('Failed to load data') }
    setLoading(false)
  }, [])

  const loadProjectView = useCallback(async () => {
    try {
      const gp = await taskGroupApi.list()
      setGroupProjects(gp as unknown[])
    } catch { /* silent */ }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (viewMode === 'project') loadProjectView()
  }, [viewMode, loadProjectView])

  const handleCloseGroupTask = async (taskId: string) => {
    if (!confirm('Mark this group task as complete?')) return
    try {
      await taskGroupApi.closeGroupTask(taskId)
      load()
    } catch { /* silent */ }
  }

  if (loading) {
    return (
      <div className="p-6 flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-tw-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      {/* Page header */}
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-tw-text">Group-wise Tasks</h1>
          <p className="text-sm text-tw-text-secondary mt-0.5">
            Create cross-department groups, assign tasks to all members, and monitor progress.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex gap-1 bg-tw-hover rounded-lg p-1">
            <button
              onClick={() => setViewMode('group')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'group' ? 'bg-white text-tw-primary shadow-card' : 'text-tw-text-secondary hover:text-tw-text'}`}
            >
              👥 Groups
            </button>
            <button
              onClick={() => setViewMode('project')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'project' ? 'bg-white text-tw-primary shadow-card' : 'text-tw-text-secondary hover:text-tw-text'}`}
            >
              📋 Projects
            </button>
          </div>
          <button
            onClick={() => setShowCreateGroup(true)}
            className="px-4 py-2 rounded-lg bg-tw-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2"
          >
            + New Group
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">
          {error}
          <button className="ml-2 underline" onClick={() => setError('')}>dismiss</button>
        </div>
      )}

      {/* ── GROUP VIEW ── */}
      {viewMode === 'group' && (
        <>
          {groups.length === 0 ? (
            <div className="card p-12 text-center text-tw-text-secondary">
              <div className="text-5xl mb-4">👥</div>
              <p className="font-semibold text-tw-text text-lg">No groups yet</p>
              <p className="text-sm mt-1 mb-4">Create a cross-department group and assign tasks to all members at once.</p>
              <button onClick={() => setShowCreateGroup(true)} className="btn-primary">+ Create First Group</button>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map(group => (
                <GroupCard
                  key={group.id}
                  group={group}
                  allPersonnel={allPersonnel}
                  layers={layers}
                  onRefresh={load}
                  onAddMember={g => setAddMemberTarget(g)}
                  onAssignTask={g => setAssignTaskTarget(g)}
                  onCreateProject={g => setCreateProjectTarget(g)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── PROJECT VIEW ── */}
      {viewMode === 'project' && (
        <>
          {groups.filter(g => (g.groupProjects || []).length > 0).length === 0 ? (
            <div className="card p-12 text-center text-tw-text-secondary">
              <div className="text-5xl mb-4">📋</div>
              <p className="font-semibold text-tw-text text-lg">No group projects yet</p>
              <p className="text-sm mt-1">Create a group first, then add projects to it.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {groups
                .filter(g => (g.groupProjects || []).length > 0)
                .map(group => {
                  const projects = group.groupProjects || []
                  return (
                    <div key={group.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-tw-text-secondary uppercase tracking-wide">Group:</span>
                        <span className="text-sm font-semibold text-tw-text">{group.name}</span>
                        <span className="badge badge-gray">{(group.members || []).length} members</span>
                      </div>
                      <div className="space-y-3 ml-0 md:ml-4">
                        {projects.map(gp => {
                          // Gather all group tasks for this project
                          const projectId = gp.project?.id
                          const projectTasks: ParentGroupTask[] = []

                          return (
                            <div key={gp.id} className="card overflow-hidden">
                              <div className="px-4 py-3 flex items-center gap-3 border-b border-tw-border"
                                style={{ borderLeftWidth: 4, borderLeftColor: gp.project?.color || '#0073ea' }}>
                                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: gp.project?.color || '#0073ea' }} />
                                <span className="font-semibold text-tw-text">{gp.project?.name}</span>
                                <button
                                  onClick={() => setAssignTaskTarget(group)}
                                  className="ml-auto text-xs px-2.5 py-1 rounded-lg bg-tw-primary text-white hover:opacity-90"
                                >
                                  + Assign Task
                                </button>
                              </div>
                              <ProjectTaskMonitor
                                groupId={group.id}
                                projectId={projectId || ''}
                                groups={groups}
                                onClose={handleCloseGroupTask}
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onCreate={group => { setShowCreateGroup(false); load() }}
        />
      )}
      {addMemberTarget && (
        <AddMemberModal
          group={addMemberTarget}
          allPersonnel={allPersonnel}
          layers={layers}
          onClose={() => setAddMemberTarget(null)}
          onAdded={() => { setAddMemberTarget(null); load() }}
        />
      )}
      {assignTaskTarget && (
        <AssignTaskModal
          group={assignTaskTarget}
          onClose={() => setAssignTaskTarget(null)}
          onAssigned={() => { setAssignTaskTarget(null); load() }}
        />
      )}
      {createProjectTarget && (
        <CreateProjectModal
          group={createProjectTarget}
          onClose={() => setCreateProjectTarget(null)}
          onCreated={() => { setCreateProjectTarget(null); load() }}
        />
      )}
    </div>
  )
}

// ─── Project Task Monitor (used in project view) ──────────────────────────────

function ProjectTaskMonitor({
  groupId, projectId, groups, onClose,
}: { groupId: string; projectId: string; groups: TaskGroup[]; onClose: (id: string) => void }) {
  const [monitor, setMonitor] = useState<MonitorData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    taskGroupApi.getMonitor(groupId)
      .then(d => setMonitor(d as MonitorData))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [groupId])

  if (loading) {
    return <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-tw-primary border-t-transparent rounded-full animate-spin" /></div>
  }

  const tasks = (monitor?.parentTasks || []).filter(t => t.project?.id === projectId)

  if (tasks.length === 0) {
    return <p className="text-sm text-tw-text-secondary italic text-center py-6">No tasks assigned to this project yet.</p>
  }

  return (
    <div className="p-3 space-y-2">
      {tasks.map(pt => (
        <GroupTaskRow key={pt.id} parentTask={pt} groups={groups} onClose={onClose} />
      ))}
    </div>
  )
}
