import { Request, Response } from 'express'
import prisma from '../prisma'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireDirector(req: Request, res: Response): boolean {
  if (req.user!.actorType !== 'director') {
    res.status(403).json({ error: 'Director only' })
    return false
  }
  return true
}

// Walk up the supervisor chain until we find someone with no supervisor or
// whose supervisor is the director. Returns a list of personnel IDs that still
// need a supervisor assigned.
async function findMissingSupervision(
  personnelId: string,
  workspaceId: string,
  directorId: string,
  visited = new Set<string>()
): Promise<string[]> {
  if (visited.has(personnelId)) return []
  visited.add(personnelId)

  const person = await prisma.personnel.findFirst({
    where: { id: personnelId, workspaceId, deletedAt: null },
    select: { id: true, supervisorId: true },
  })
  if (!person) return []

  if (!person.supervisorId) {
    // Has no supervisor — needs one
    return [personnelId]
  }

  // Check if the supervisor is the director (they're the chain root)
  const supervisor = await prisma.personnel.findFirst({
    where: { id: person.supervisorId, workspaceId, deletedAt: null },
    select: { id: true, supervisorId: true },
  })
  if (!supervisor) {
    return [personnelId]
  }

  // Recurse up
  return findMissingSupervision(supervisor.id, workspaceId, directorId, visited)
}

// ─── List all task groups ─────────────────────────────────────────────────────
export async function listTaskGroups(req: Request, res: Response): Promise<void> {
  try {
    const groups = await prisma.taskGroup.findMany({
      where: { workspaceId: req.user!.workspaceId, deletedAt: null },
      include: {
        members: {
          include: {
            personnel: {
              select: {
                id: true, name: true, avatarUrl: true,
                department: { select: { id: true, name: true, layer: { select: { number: true, name: true } } } },
                supervisor: { select: { id: true, name: true } },
              },
            },
          },
        },
        groupProjects: {
          include: { project: { select: { id: true, name: true, color: true, status: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    res.json(groups)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// ─── Get single task group ────────────────────────────────────────────────────
export async function getTaskGroup(req: Request, res: Response): Promise<void> {
  try {
    const group = await prisma.taskGroup.findFirst({
      where: { id: req.params.id, workspaceId: req.user!.workspaceId, deletedAt: null },
      include: {
        members: {
          include: {
            personnel: {
              select: {
                id: true, name: true, avatarUrl: true, phone: true,
                department: { select: { id: true, name: true, layer: { select: { number: true, name: true } } } },
                supervisor: { select: { id: true, name: true } },
                supervisorId: true,
              },
            },
          },
        },
        groupProjects: {
          include: { project: { select: { id: true, name: true, color: true, status: true } } },
        },
      },
    })
    if (!group) { res.status(404).json({ error: 'Group not found' }); return }
    res.json(group)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// ─── Create task group ────────────────────────────────────────────────────────
export async function createTaskGroup(req: Request, res: Response): Promise<void> {
  if (!requireDirector(req, res)) return
  try {
    const { name, description } = req.body
    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return }
    const group = await prisma.taskGroup.create({
      data: { name: name.trim(), description: description?.trim() || null, workspaceId: req.user!.workspaceId },
    })
    res.status(201).json(group)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// ─── Update task group ────────────────────────────────────────────────────────
export async function updateTaskGroup(req: Request, res: Response): Promise<void> {
  if (!requireDirector(req, res)) return
  try {
    const group = await prisma.taskGroup.findFirst({
      where: { id: req.params.id, workspaceId: req.user!.workspaceId, deletedAt: null },
    })
    if (!group) { res.status(404).json({ error: 'Group not found' }); return }
    const { name, description } = req.body
    const updated = await prisma.taskGroup.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
      },
    })
    res.json(updated)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// ─── Delete task group (soft) ─────────────────────────────────────────────────
export async function deleteTaskGroup(req: Request, res: Response): Promise<void> {
  if (!requireDirector(req, res)) return
  try {
    const group = await prisma.taskGroup.findFirst({
      where: { id: req.params.id, workspaceId: req.user!.workspaceId, deletedAt: null },
    })
    if (!group) { res.status(404).json({ error: 'Group not found' }); return }
    await prisma.taskGroup.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// ─── Add member to task group ─────────────────────────────────────────────────
// Also checks supervisor chain — returns missing_supervision if chain is broken
export async function addTaskGroupMember(req: Request, res: Response): Promise<void> {
  if (!requireDirector(req, res)) return
  try {
    const group = await prisma.taskGroup.findFirst({
      where: { id: req.params.id, workspaceId: req.user!.workspaceId, deletedAt: null },
    })
    if (!group) { res.status(404).json({ error: 'Group not found' }); return }

    const { personnelId } = req.body
    if (!personnelId) { res.status(400).json({ error: 'personnelId required' }); return }

    const person = await prisma.personnel.findFirst({
      where: { id: personnelId, workspaceId: req.user!.workspaceId, deletedAt: null },
      include: {
        department: { include: { layer: true } },
        supervisor: { select: { id: true, name: true } },
      },
    })
    if (!person) { res.status(404).json({ error: 'Personnel not found' }); return }

    // Check supervisor chain
    const missingSupervisors = await findMissingSupervision(
      personnelId, req.user!.workspaceId, req.user!.actorId
    )
    if (missingSupervisors.length > 0) {
      // Return info about who needs a supervisor
      const needsSupervisor = await prisma.personnel.findMany({
        where: { id: { in: missingSupervisors } },
        select: {
          id: true, name: true,
          department: { select: { name: true, layer: { select: { number: true, name: true } } } },
        },
      })
      res.status(422).json({
        error: 'supervisor_chain_incomplete',
        needsSupervisor,
        message: `Cannot add ${person.name} — supervisor chain is incomplete`,
      })
      return
    }

    const member = await prisma.taskGroupMember.create({
      data: { groupId: req.params.id, personnelId },
      include: {
        personnel: {
          select: {
            id: true, name: true, avatarUrl: true,
            department: { select: { id: true, name: true, layer: { select: { number: true, name: true } } } },
            supervisor: { select: { id: true, name: true } },
          },
        },
      },
    })
    res.status(201).json(member)
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'Already a member' }); return }
    console.error(err); res.status(500).json({ error: 'Internal server error' })
  }
}

// ─── Remove member from task group ───────────────────────────────────────────
export async function removeTaskGroupMember(req: Request, res: Response): Promise<void> {
  if (!requireDirector(req, res)) return
  try {
    await prisma.taskGroupMember.deleteMany({
      where: { groupId: req.params.id, personnelId: req.params.pid },
    })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// ─── Create group project ─────────────────────────────────────────────────────
export async function createGroupProject(req: Request, res: Response): Promise<void> {
  if (!requireDirector(req, res)) return
  try {
    const group = await prisma.taskGroup.findFirst({
      where: { id: req.params.id, workspaceId: req.user!.workspaceId, deletedAt: null },
    })
    if (!group) { res.status(404).json({ error: 'Group not found' }); return }

    const { name, description, color } = req.body
    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return }

    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        color: color || '#0073ea',
        workspaceId: req.user!.workspaceId,
        directorId: req.user!.actorId,
      },
    })
    const groupProject = await prisma.taskGroupProject.create({
      data: { groupId: req.params.id, projectId: project.id },
      include: { project: true },
    })
    res.status(201).json(groupProject)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// ─── Assign group task ────────────────────────────────────────────────────────
// Creates a parent group-task, then per-member child task instances
export async function assignGroupTask(req: Request, res: Response): Promise<void> {
  if (!requireDirector(req, res)) return
  try {
    const group = await prisma.taskGroup.findFirst({
      where: { id: req.params.id, workspaceId: req.user!.workspaceId, deletedAt: null },
      include: { members: { include: { personnel: true } } },
    })
    if (!group) { res.status(404).json({ error: 'Group not found' }); return }

    const { projectId, title, description, priority, deadline, memberIds } = req.body
    if (!projectId || !title?.trim()) {
      res.status(400).json({ error: 'projectId and title are required' }); return
    }

    // Verify project belongs to this workspace
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId: req.user!.workspaceId, deletedAt: null },
    })
    if (!project) { res.status(404).json({ error: 'Project not found' }); return }

    // Determine target members
    const allMemberIds = group.members.map(m => m.personnelId)
    const targetIds: string[] = memberIds?.length > 0
      ? allMemberIds.filter((id: string) => memberIds.includes(id))
      : allMemberIds

    if (targetIds.length === 0) {
      res.status(400).json({ error: 'No valid members to assign' }); return
    }

    const deadlineDate = deadline ? new Date(deadline) : undefined

    // Create parent group task (PENDING, no assignment — acts as container)
    const parentTask = await prisma.task.create({
      data: {
        workspaceId: req.user!.workspaceId,
        projectId,
        title: title.trim(),
        description: description?.trim() || null,
        priority: priority || 'MEDIUM',
        status: 'ASSIGNED',
        ...(deadlineDate && { deadline: deadlineDate }),
        createdByDirectorId: req.user!.actorId,
      },
    })

    // Create per-member task instances
    const memberTasks = await Promise.all(
      targetIds.map(async (pid: string) => {
        const person = group.members.find(m => m.personnelId === pid)?.personnel
        const task = await prisma.task.create({
          data: {
            workspaceId: req.user!.workspaceId,
            projectId,
            groupTaskId: parentTask.id,
            title: title.trim(),
            description: description?.trim() || null,
            priority: priority || 'MEDIUM',
            status: 'ASSIGNED',
            ...(deadlineDate && { deadline: deadlineDate }),
            createdByDirectorId: req.user!.actorId,
            assignments: {
              create: { personnelId: pid },
            },
          },
          include: { assignments: true },
        })
        return { task, person }
      })
    )

    res.status(201).json({ parentTask, memberTasks: memberTasks.map(m => m.task) })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// ─── Monitor: get group tasks with latest member updates ─────────────────────
export async function getGroupMonitor(req: Request, res: Response): Promise<void> {
  try {
    const group = await prisma.taskGroup.findFirst({
      where: { id: req.params.id, workspaceId: req.user!.workspaceId, deletedAt: null },
      include: {
        members: {
          include: {
            personnel: {
              select: {
                id: true, name: true, avatarUrl: true,
                department: { select: { name: true, layer: { select: { number: true, name: true } } } },
              },
            },
          },
        },
        groupProjects: {
          include: { project: { select: { id: true, name: true, color: true } } },
        },
      },
    })
    if (!group) { res.status(404).json({ error: 'Group not found' }); return }

    // Find all group tasks (parent tasks with instances for this group's members)
    const memberIds = group.members.map(m => m.personnelId)

    // Get all parent tasks whose instances are assigned to group members
    const parentTasks = await prisma.task.findMany({
      where: {
        workspaceId: req.user!.workspaceId,
        groupTaskId: null,           // is a parent
        groupTaskInstances: { some: { assignments: { some: { personnelId: { in: memberIds } } } } },
      },
      include: {
        project: { select: { id: true, name: true, color: true } },
        groupTaskInstances: {
          include: {
            assignments: {
              include: {
                personnel: { select: { id: true, name: true } },
              },
            },
            progressLogs: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ group, parentTasks })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// ─── Get member history for a group task ─────────────────────────────────────
export async function getMemberTaskHistory(req: Request, res: Response): Promise<void> {
  try {
    const { taskId, memberId } = req.params

    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        workspaceId: req.user!.workspaceId,
        assignments: { some: { personnelId: memberId } },
      },
      include: {
        assignments: { include: { personnel: { select: { id: true, name: true } } } },
        progressLogs: { orderBy: { createdAt: 'desc' } },
        comments: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!task) { res.status(404).json({ error: 'Task not found' }); return }
    res.json(task)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// ─── Close group task (director manual close) ────────────────────────────────
export async function closeGroupTask(req: Request, res: Response): Promise<void> {
  if (!requireDirector(req, res)) return
  try {
    const task = await prisma.task.findFirst({
      where: { id: req.params.taskId, workspaceId: req.user!.workspaceId, groupTaskId: null },
    })
    if (!task) { res.status(404).json({ error: 'Group task not found' }); return }

    // Mark parent approved
    await prisma.task.update({
      where: { id: req.params.taskId },
      data: { status: 'APPROVED', approvalById: req.user!.actorId, approvalByType: 'director' },
    })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

// ─── Get all group-wise projects (for project view toggle) ───────────────────
export async function listGroupProjects(req: Request, res: Response): Promise<void> {
  try {
    const groupProjects = await prisma.taskGroupProject.findMany({
      where: { group: { workspaceId: req.user!.workspaceId, deletedAt: null } },
      include: {
        project: {
          include: {
            tasks: {
              where: { groupTaskId: null, deletedAt: null },
              include: {
                groupTaskInstances: {
                  include: {
                    assignments: { include: { personnel: { select: { id: true, name: true } } } },
                    progressLogs: { orderBy: { createdAt: 'desc' }, take: 1 },
                  },
                },
              },
            },
          },
        },
        group: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(groupProjects)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}
