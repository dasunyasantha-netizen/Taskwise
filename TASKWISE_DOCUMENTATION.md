# TaskWise — Complete Documentation & User Guide

> **Live URL:** https://syswise.lk/taskwise/
> **Last updated:** April 2026

---

## Table of Contents

### Part 1 — User Guide
1. [What is TaskWise?](#1-what-is-taskwise)
2. [Logging In](#2-logging-in)
3. [Director Guide](#3-director-guide)
   - [Dashboard](#31-dashboard)
   - [Setting Up Your Workspace](#32-setting-up-your-workspace)
   - [Managing Projects](#33-managing-projects)
   - [Creating & Assigning Tasks](#34-creating--assigning-tasks)
   - [The Kanban Board](#35-the-kanban-board)
   - [Task Detail Panel](#36-task-detail-panel)
   - [Approval Queue](#37-approval-queue)
   - [Overdue Tasks](#38-overdue-tasks)
   - [Audit Log](#39-audit-log)
   - [Notifications](#310-notifications)
4. [Personnel Guide](#4-personnel-guide)
   - [My Task Queue](#41-my-task-queue)
   - [Working on a Task](#42-working-on-a-task)
   - [Creating Subtasks](#43-creating-subtasks)
   - [Returning a Task](#44-returning-a-task)
   - [Submitting for Approval](#45-submitting-for-approval)
5. [Task Lifecycle Reference](#5-task-lifecycle-reference)
6. [Test Accounts](#6-test-accounts)

### Part 2 — Technical Reference
7. [Architecture Overview](#7-architecture-overview)
8. [Directory Structure](#8-directory-structure)
9. [Ports & URLs](#9-ports--urls)
10. [Database](#10-database)
11. [Authentication & JWT](#11-authentication--jwt)
12. [API Reference](#12-api-reference)
13. [Git Repository & Branches](#13-git-repository--branches)
14. [Local Development Setup](#14-local-development-setup)
15. [Production Server](#15-production-server)
16. [Deployment Update Guide](#16-deployment-update-guide)

---

# Part 1 — User Guide

---

## 1. What is TaskWise?

TaskWise is a hierarchical task management system inside SysWise. It is built for desktop use and styled after Monday.com — clean card-based boards, soft shadows, and a consistent blue color palette.

**Core concept:** A Director owns a workspace. Inside that workspace, they set up a 3-layer organizational structure (e.g. Management → Operations → Field). Personnel are placed inside departments within those layers. The Director creates projects and tasks, assigns them down through the hierarchy, and monitors progress from a central dashboard.

**Key rules:**
- Only Directors can create top-level tasks
- Personnel can break tasks into subtasks
- A task cannot be marked done until the assigning authority approves it
- A parent task cannot be approved until all its subtasks are approved
- Deadlines can only be changed by whoever set them
- Nothing is permanently deleted — everything stays in history

---

## 2. Logging In

Go to **https://syswise.lk/taskwise/** or click the **TaskWise** card on the SysWise apps page.

You will see a login screen with two tabs:

### Director Tab
Enter your Director email and password. Directors have a globally unique email address.

### Personnel Tab
Enter your email, password, and **Workspace ID**. Personnel are scoped to a workspace, so the Workspace ID is required to identify which organisation you belong to. Your Director will provide this.

> **First time?** A Director account must be registered first. Go to the Director tab and use the Register link (if available), or ask your system administrator to create your account.

---

## 3. Director Guide

### 3.1 Dashboard

After logging in as a Director, you land on the **Dashboard**. It shows:

| Card | What it shows |
|---|---|
| Projects | Total number of active projects in your workspace |
| Total Tasks | All tasks across all projects |
| Pending Approval | Tasks submitted by personnel waiting for your sign-off |
| Overdue | Tasks whose deadline has passed and are not yet approved |

Below the stat cards are two live panels:
- **Pending Approvals** — the most recent tasks submitted for your review, with a link to the full queue
- **Overdue Tasks** — tasks past their deadline, with the date shown in red

---

### 3.2 Setting Up Your Workspace

Before creating tasks, set up your hierarchy under **Team Hierarchy** in the sidebar.

#### Step 1 — Rename Your Layers (optional)

Your workspace comes with 3 default layers numbered 1, 2, 3. Layer 1 is the senior layer, Layer 3 is the ground level. You can rename them to match your organisation (e.g. Management, Operations, Field).

#### Step 2 — Create Departments

Click **+ Department** at the top right of the Hierarchy page.

- Select which **Layer** this department belongs to
- Enter the **Department Name** (e.g. Engineering, Finance, Customer Support)
- Click **Create**

You can create as many departments as you need across the 3 layers.

#### Step 3 — Add Personnel

Click **+ Personnel** to add a team member.

Fill in:
- Full name
- Email address (unique within your workspace)
- Temporary password (the person uses this to log in)
- Phone number (optional)
- Department (select which department they belong to — grouped by layer)

The person can now log in using the **Personnel tab** with your Workspace ID.

#### Step 4 — Create Groups (optional)

Groups are collections of personnel within the same department. A task assigned to a group can be actioned by any group member.

Click **+ Group**, select the department, and give the group a name. Then use the group card to add members from that department.

> A person can belong to multiple groups. Groups are department-scoped — you cannot mix personnel from different departments in one group.

#### Tabs in Team Hierarchy

| Tab | What you see |
|---|---|
| **Structure** | Visual layer → department → personnel tree. Click ⇄ on any person to move them to a different department. |
| **Personnel** | Full table of all personnel with their department, layer, and actions (Move / Remove) |
| **Groups** | All groups with their members. Add/remove members directly from each group card. |

---

### 3.3 Managing Projects

Click **Projects** in the sidebar.

#### Creating a Project
Click **+ New Project** and fill in:
- Project name
- Description (optional)
- Color (click a color dot — used as the project's visual identifier on the board)

#### Opening a Project
Click any project card to open its Kanban board.

#### Archiving a Project
Hover over a project card and click **Archive**. Archived projects are shown in a separate section and cannot receive new tasks.

---

### 3.4 Creating & Assigning Tasks

From inside a project board, click **+ New Task**.

Fill in:
| Field | Notes |
|---|---|
| **Title** | Short, clear task name |
| **Description** | Full details of what needs to be done |
| **Priority** | Critical / High / Medium / Low |
| **Deadline** | Click the calendar icon — custom date picker with month/year navigation |
| **Assign to** | Optional at creation time. Select type (Person / Group / Department), then select the target. |

If you assign at creation, the task immediately moves to **ASSIGNED** status and the assignee receives an in-app notification.

If you skip assignment, the task stays in **PENDING** and you can assign it later from the task detail panel.

> **Only Directors can create top-level tasks.** Personnel can only create subtasks under existing tasks.

---

### 3.5 The Kanban Board

The board shows 6 columns:

| Column | Meaning |
|---|---|
| **Pending** | Task created, not yet assigned |
| **Assigned** | Assigned to someone, not yet started |
| **In Progress** | Assignee is actively working on it |
| **Submitted** | Assignee has submitted for approval |
| **Approved** | You have approved — task is complete |
| **Returned** | Assignee sent the task back with a reason |

Each **Task Card** shows:
- Colored left bar = priority (red = Critical, orange = High, yellow = Medium, grey = Low)
- Task title
- Assignee name
- Status badge
- Deadline (red if overdue, orange if within 48 hours)
- Subtask count and comment count

Click any card to open the **Task Detail Panel**.

---

### 3.6 Task Detail Panel

A slide-over panel opens from the right when you click a task. It has 4 tabs:

#### Details Tab
Shows the full task description, who it's assigned to, the deadline, and any return/rejection reason.

**Action buttons** appear at the top based on the task's current state:

| Button | When it appears | What it does |
|---|---|---|
| **Assign** | Task is PENDING or RETURNED | Assign to a person, group, or department |
| **Approve** | Task is SUBMITTED and you are the approving authority | Mark as fully approved |
| **Reject** | Task is SUBMITTED and you are the approving authority | Reject with a reason — assignee can revise and resubmit |
| **Cancel task** | Any state except APPROVED/CANCELLED | Cancel the task (requires reason, Director only) |

#### Subtasks Tab
Lists all direct subtasks under this task, showing their status and deadline.

#### Comments Tab
Full comment thread. Type a message and press Enter or click Send to add a comment. All comments are timestamped and show whether they came from a Director or Personnel.

#### History Tab
Complete audit trail for this task — every state change, assignment, comment, and modification with the actor type and exact timestamp.

---

### 3.7 Approval Queue

The **Approval Queue** page (sidebar) shows all tasks currently in SUBMITTED status waiting for your sign-off.

For each task you can open it via the board to approve or reject.

The badge number on the sidebar updates in real time.

---

### 3.8 Overdue Tasks

The **Overdue Tasks** page shows all tasks where the deadline has passed and the task is not yet APPROVED or CANCELLED.

The table shows: task title, project, deadline (in red), who it's assigned to, and current status.

---

### 3.9 Audit Log

The **Audit Log** page (Director only) shows a full chronological log of every action taken in your workspace.

Each entry shows:
- Event type (e.g. `TASK_ASSIGNED`, `TASK_APPROVED`, `PERSONNEL_MOVED`)
- Actor type (Director or Personnel)
- Task ID (if applicable)
- Date and time

Use this to track accountability and investigate any disputes.

---

### 3.10 Notifications

The **bell icon** in the top-right corner shows your unread notification count (red badge).

Click it to open the notification dropdown. Notifications are polled every **15 seconds** and also refresh when you return to the browser tab.

Click any unread notification to mark it as read. Use **Mark all read** to clear everything at once.

**Director notifications include:**
- A task has been submitted for your approval
- A task was returned by the assignee
- A personnel was moved between departments

---

## 4. Personnel Guide

### 4.1 My Task Queue

After logging in as Personnel, you land on **My Task Queue**.

Tasks are grouped by status:
- **Assigned** — tasks waiting for you to start
- **In Progress** — tasks you are currently working on
- **Returned** — tasks sent back for correction
- **Rejected** — tasks rejected after submission
- **Submitted** — tasks you have submitted, waiting for approval

Each card shows the task title, priority bar, deadline, and status badge. Click any card to open the **Task Detail Panel**.

---

### 4.2 Working on a Task

When a task is **ASSIGNED** to you:

1. Click the task card to open the detail panel
2. Click **▶ Start** — this moves the task to **IN_PROGRESS** and signals you have begun
3. Work on the task. You can add comments to document progress
4. If the task has subtasks, all subtasks must be completed and approved before you can submit the parent

---

### 4.3 Creating Subtasks

If a task is too large to handle as a single unit, you can break it into subtasks.

From the task detail panel (while the task is IN_PROGRESS or ASSIGNED):
1. Click **+ Subtask**
2. Fill in title, description, priority, and deadline
3. Click **Create Subtask**

The subtask appears in the Subtasks tab. You can assign it to yourself or another person (if you have permission). Subtasks follow the same full lifecycle as regular tasks.

> **Remember:** The parent task cannot be submitted for approval until every subtask is APPROVED.

---

### 4.4 Returning a Task

If a task has been assigned to you incorrectly, or is outside your scope, you can send it back.

From the task detail panel (while IN_PROGRESS):
1. Click **↩ Return**
2. Type a clear reason explaining why you are returning it
3. Click **Confirm**

The task moves to **RETURNED** status. The assigning authority receives a notification with your reason. They can then reassign it to the correct person or department.

---

### 4.5 Submitting for Approval

When you have completed all the work (and all subtasks are approved):

1. Click **✓ Submit for Approval**
2. The task moves to **SUBMITTED**
3. The assigning authority receives an in-app notification to review it

**What happens next:**
- If **Approved** — the task is marked APPROVED (done). You receive a notification.
- If **Rejected** — you receive a notification with a reason. Click **↻ Reopen** to move it back to IN_PROGRESS, make corrections, and resubmit.

---

## 5. Visibility Rules

TaskWise enforces hierarchy-based visibility. What you can see on the board depends on which layer you belong to.

### Directors
Directors see **everything** in their workspace — all projects, all tasks, all layers.

### Personnel — Layer-Based Visibility

| Your Layer | Tasks you can see |
|---|---|
| **Layer 1** (senior) | All tasks assigned to any Layer 1, 2, or 3 department, group, or person in the workspace — plus tasks you are the approval authority for |
| **Layer 2** (mid) | Tasks assigned to Layer 2 or Layer 3 departments/groups/personnel — plus tasks you are the approval authority for |
| **Layer 3** (ground) | Only tasks assigned directly to you, your group, or your department |

### Accountability on Group Tasks

When a task is assigned to a group or department (not a specific person), any eligible member can act on it. The system tracks **who actually clicked "Start", "Submit", or "Return"** — this is stored separately from the assignment and shown in the task's audit history. This makes individual accountability clear even for shared tasks.

---

## 6. Task Lifecycle Reference

```
PENDING
  │
  │ Director assigns to person / group / department
  ▼
ASSIGNED
  │
  │ Assignee clicks Start
  ▼
IN_PROGRESS ─────────────────────── Return (with reason) ──► RETURNED
  │                                                               │
  │ Assignee clicks Submit                                        │ Director reassigns
  │ (all subtasks must be APPROVED first)                        ▼
  ▼                                                           ASSIGNED
SUBMITTED
  │
  ├─ Director clicks Approve ──────────────────────────► APPROVED ✓ (final)
  │
  └─ Director clicks Reject (with reason) ─────────────► REJECTED
                                                              │
                                                              │ Assignee clicks Reopen
                                                              ▼
                                                          IN_PROGRESS

Any state → CANCELLED (Director only, reason required, soft delete)
```

### Who can do what

| Action | Director | Personnel |
|---|---|---|
| Create top-level task | ✅ | ❌ |
| Create subtask | ✅ | ✅ (on tasks they own) |
| Assign task | ✅ | ❌ |
| Start task | ✅ | ✅ |
| Submit for approval | ✅ | ✅ |
| Return task | ❌ | ✅ |
| Approve task | ✅ (if approving authority) | ✅ (if approving authority) |
| Reject task | ✅ (if approving authority) | ✅ (if approving authority) |
| Cancel task | ✅ | ❌ |
| Change deadline | Only the person who set it | Only the person who set it |
| Move personnel | ✅ | ❌ |
| Create departments/groups | ✅ | ❌ |
| View all tasks in workspace | ✅ | ❌ (visibility depends on layer — see below) |
| View tasks assigned to lower layers | N/A | Layer 1 only |
| View tasks in same + lower layers | N/A | Layer 1 + Layer 2 |
| View own tasks only | N/A | Layer 3 |

---

## 6. Test Accounts

Test account credentials are kept in the internal ops file on the server at `/var/www/taskwise/server/.env` and are not stored in this document.

To retrieve the Director email or Workspace ID for testing:
```bash
# On the production server
sudo -u postgres psql taskwise_db -c 'SELECT id, name FROM "Workspace";'
```

Contact the system administrator for current test credentials. Do not store passwords in documentation files.

---

# Part 2 — Technical Reference

---

## 7. Architecture Overview

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Vite + React 18 + TypeScript | Port 3500 (local), `/taskwise/` (production) |
| Styling | Tailwind CSS 3 | Monday.com color palette, custom components |
| Backend | Node.js + Express + TypeScript | Port 4300 (local), 4003 (production) |
| ORM | Prisma 5 | PostgreSQL provider |
| Database | PostgreSQL 14+ | Separate `taskwise_db` |
| Process manager | PM2 | `taskwise-backend` (id 17) |
| Web server | Nginx | Reverse proxy, static file serving |
| SSL | Let's Encrypt (Certbot) | Auto-renewed, expires ~April 2026 |

Follows the same monorepo pattern as DayWise and CricWise. No SysWise SSO — TaskWise has its own standalone auth.

---

## 8. Directory Structure

```
taskwise-local/
├── index.html                        # HTML entry point
├── vite.config.ts                    # Port 3500, base /taskwise/ in prod
├── tailwind.config.js                # Monday.com palette + custom tokens
├── .env.production                   # VITE_API_URL=/taskwise-api/api
├── src/
│   ├── main.tsx                      # React entry
│   ├── App.tsx                       # Auth state, routing, localStorage
│   ├── types.ts                      # All shared TypeScript types
│   ├── index.css                     # Tailwind base + .btn-*, .card, .input, .badge-* classes
│   ├── vite-env.d.ts                 # ImportMeta.env type declarations
│   ├── components/
│   │   ├── Auth.tsx                  # Director / Personnel login tabs
│   │   ├── DirectorDashboard.tsx     # Director layout, sidebar, all Director views
│   │   ├── PersonnelDashboard.tsx    # Personnel layout, queue, board
│   │   ├── HierarchyPanel.tsx        # Layers / departments / personnel / groups management
│   │   ├── ProjectManager.tsx        # Project list, create, archive
│   │   ├── BoardView.tsx             # Kanban board (6 columns), create task modal
│   │   ├── TaskCard.tsx              # Card component used on board and in queue
│   │   ├── TaskDetailPanel.tsx       # Slide-over panel: details/subtasks/comments/history
│   │   ├── NotificationsMenu.tsx     # Bell icon, polling, dropdown
│   │   ├── DatePicker.tsx            # Custom calendar date picker (no native input)
│   │   └── Select.tsx                # Custom dropdown (no native select)
│   └── services/
│       └── apiService.ts             # All typed API calls (auth, workspace, projects, tasks, notifications, audit)
└── server/
    ├── prisma/
    │   └── schema.prisma             # 12-model PostgreSQL schema
    ├── src/
    │   ├── index.ts                  # Express server, CORS, routes
    │   ├── prisma.ts                 # PrismaClient singleton
    │   ├── middleware/
    │   │   └── authMiddleware.ts     # JWT decode → req.user, requireDirector guard
    │   ├── routes/
    │   │   ├── authRoutes.ts         # /api/auth/*
    │   │   ├── workspaceRoutes.ts    # /api/workspace/*
    │   │   ├── projectRoutes.ts      # /api/projects/*
    │   │   ├── taskRoutes.ts         # /api/tasks/*
    │   │   ├── notificationRoutes.ts # /api/notifications/*
    │   │   └── auditRoutes.ts        # /api/audit/*, /api/reports/*
    │   └── controllers/
    │       ├── authController.ts     # register, login (director + personnel), /me
    │       ├── workspaceController.ts # layers, departments, personnel, groups CRUD
    │       ├── projectController.ts  # project CRUD
    │       ├── taskController.ts     # task CRUD + all state transitions + comments
    │       ├── notificationController.ts # list, mark read, mark all read
    │       └── auditController.ts    # audit log, overdue report, progress, queue
    ├── .env                          # Git-ignored — local secrets
    └── .env.example                  # Template
```

---

## 9. Ports & URLs

| Environment | Frontend | Backend API |
|---|---|---|
| Local dev | `http://localhost:3500` | `http://localhost:4300/api` |
| Production | `https://syswise.lk/taskwise/` | `https://syswise.lk/taskwise-api/api` |

### How production routing works (Nginx)

```
Browser → syswise.lk/taskwise/        → Nginx serves /var/www/taskwise/dist/index.html
Browser → syswise.lk/taskwise-api/api → Nginx proxies to localhost:4003
```

The React app in production has `VITE_API_URL=/taskwise-api/api` baked in at build time via `.env.production`.

---

## 10. Database

### Connection Details

| Setting | Local | Production |
|---|---|---|
| Engine | PostgreSQL | PostgreSQL |
| Database | `taskwise_db` | `taskwise_db` |
| User | `postgres` | `syswise_user` |
| Password | (see `server/.env`) | (see server `.env` — not in this file) |
| Host | `localhost:5432` | `localhost:5432` |

### Connection String Format

```
postgresql://<user>:<password>@localhost:5432/taskwise_db?schema=public
```

Credentials are stored in `taskwise-local/server/.env` (local, git-ignored) and in the production server's `.env` file at `/var/www/taskwise/server/.env`. They are never committed to the repository.

### Schema — 12 Models

| Model | Purpose | Key fields |
|---|---|---|
| `Director` | Director accounts | email (globally unique), password, workspaceId |
| `Workspace` | One per Director, all data scoped here | name |
| `Layer` | 3 per workspace (1=senior, 3=ground) | number, name, workspaceId |
| `Department` | Belongs to a Layer | name, layerId, workspaceId, deletedAt |
| `Personnel` | Leaf users with login | email (unique per workspace), password, departmentId |
| `Group` | Named team within one Department | name, departmentId |
| `GroupMember` | Personnel ↔ Group junction | groupId, personnelId |
| `Project` | Created by Director | name, color, status, workspaceId, directorId |
| `Task` | Self-referencing (parentTaskId = subtree) | title, status, priority, deadline, deadlineSetById, approvalById, actedById, parentTaskId |
| `TaskAssignment` | Polymorphic: dept OR group OR person | taskId + one of: departmentId, groupId, personnelId |
| `TaskComment` | Comments on tasks | taskId, content, authorType |
| `AuditLog` | Every action permanently logged | event, actorType, actorId, taskId, payload (JSON) |
| `Notification` | In-app alerts | recipientType, recipientId, type, isRead |

### Key Schema Decisions

- **Self-referencing Task** — `parentTaskId` handles unlimited subtask depth. Top-level vs subtask is enforced in the controller, not the schema.
- **Polymorphic TaskAssignment** — one FK per target type, exactly one set at a time. Enforced in the controller.
- **Soft deletes** — `deletedAt DateTime?` on Task, Department, Personnel, Project, Group, TaskComment. All list queries filter `WHERE deletedAt IS NULL` but history endpoints return everything.
- **Deadline ownership** — `deadlineSetById` + `deadlineSetByType` stored per task. Controller rejects deadline edits from anyone else.
- **No cascading auto-approvals** — when all subtasks are APPROVED, the parent's assignee is notified but must manually submit. Keeps human review at each level.
- **`actedById` / `actedByType`** — updated on every start/submit/return action. For group or department tasks, this field identifies exactly which individual performed each action, maintaining clear accountability even when a task is shared among many people.
- **Recursive subtask blocking** — `submitTask` uses a PostgreSQL recursive CTE to walk the full subtask tree before allowing submission. A parent task is blocked if any descendant subtask at any depth is not APPROVED. Direct children alone are not sufficient.
- **Layer-based visibility** — `buildTaskVisibilityFilter()` in `server/src/helpers/visibility.ts` computes which department IDs each personnel member can see based on their `layerNumber`. This filter is applied to every `listTasks` and `getTask` query for non-Director actors.

---

## 11. Authentication & JWT

TaskWise has its own standalone auth — no SysWise SSO.

### JWT Payload

**Director token:**
```json
{
  "actorId": "uuid",
  "actorType": "director",
  "workspaceId": "uuid",
  "iat": 1234567890,
  "exp": 1234567890
}
```

**Personnel token** (includes hierarchy context for visibility enforcement):
```json
{
  "actorId": "uuid",
  "actorType": "personnel",
  "workspaceId": "uuid",
  "layerNumber": 2,
  "departmentId": "uuid",
  "iat": 1234567890,
  "exp": 1234567890
}
```

Token stored in `localStorage` as `taskwise_token`. User profile stored as `taskwise_user`. Both are read on app load to restore session. Token expiry: **7 days**.

### Director Registration
`POST /api/auth/director/register`
- Atomically creates: Director account + Workspace + 3 default Layers
- Director email must be globally unique across all workspaces

### Personnel Login
`POST /api/auth/personnel/login`
- Requires `{ email, password, workspaceId }` — same email can exist in multiple workspaces

### Auth Middleware
Every protected route runs `authenticateToken` which:
1. Reads the `Authorization: Bearer <token>` header
2. Verifies and decodes the JWT
3. Attaches `req.user = { actorId, actorType, workspaceId }` to the request

`requireDirector` is a secondary middleware applied to Director-only routes.

---

## 12. API Reference

All endpoints prefixed `/api`. Require `Authorization: Bearer <token>` unless noted.

### Auth
```
POST  /api/auth/director/register    { email, password, name, workspaceName? }
POST  /api/auth/director/login       { email, password }
POST  /api/auth/personnel/login      { email, password, workspaceId }
GET   /api/auth/me                   Returns current actor profile
```

### Workspace & Hierarchy
```
GET    /api/workspace                           Workspace + layers + departments
GET    /api/workspace/layers                    All 3 layers with departments + personnel
GET    /api/workspace/departments               All departments (filter: no params)
POST   /api/workspace/departments               { name, layerId }  [Director]
PUT    /api/workspace/departments/:id           { name }  [Director]
DELETE /api/workspace/departments/:id           Soft delete  [Director]

GET    /api/workspace/personnel                 All personnel (filter: ?departmentId= ?layerId=)
POST   /api/workspace/personnel                 { name, email, password, departmentId, phone? }  [Director]
PUT    /api/workspace/personnel/:id             { name, phone, avatarUrl }
PUT    /api/workspace/personnel/:id/move        { departmentId }  [Director]
DELETE /api/workspace/personnel/:id             Soft delete  [Director]
GET    /api/workspace/personnel/:id/queue       Active task queue for this person

GET    /api/workspace/groups                    All groups (filter: ?departmentId=)
POST   /api/workspace/groups                    { name, departmentId }  [Director]
PUT    /api/workspace/groups/:id                { name }
DELETE /api/workspace/groups/:id                Soft delete  [Director]
POST   /api/workspace/groups/:id/members        { personnelId }  [Director]
DELETE /api/workspace/groups/:id/members/:pid   Remove member  [Director]
```

### Projects
```
GET    /api/projects           All active + archived projects in workspace
POST   /api/projects           { name, description?, color? }  [Director]
GET    /api/projects/:id       Project details
PUT    /api/projects/:id       { name?, description?, color?, status? }  [Director]
DELETE /api/projects/:id       Soft delete  [Director]
```

### Tasks
```
GET    /api/tasks              List tasks (filter: ?projectId= ?status= ?parentTaskId=null ?overdue=true)
POST   /api/tasks              { title, description?, projectId, parentTaskId?, priority?, deadline? }
GET    /api/tasks/:id          Full task with subtasks, assignments, comments
PUT    /api/tasks/:id          Update fields (deadline edit enforced)
DELETE /api/tasks/:id          Soft delete  [Director]

POST   /api/tasks/:id/assign   { personnelId } OR { groupId } OR { departmentId }
POST   /api/tasks/:id/start    ASSIGNED → IN_PROGRESS
POST   /api/tasks/:id/submit   IN_PROGRESS → SUBMITTED (checks all subtasks APPROVED)
POST   /api/tasks/:id/return   IN_PROGRESS → RETURNED  { reason }
POST   /api/tasks/:id/approve  SUBMITTED → APPROVED  [approvalById actor only]
POST   /api/tasks/:id/reject   SUBMITTED → REJECTED  { reason }  [approvalById actor only]
POST   /api/tasks/:id/reopen   REJECTED → IN_PROGRESS
POST   /api/tasks/:id/cancel   Any → CANCELLED  { reason }  [Director]

GET    /api/tasks/:id/subtasks   Direct subtasks only (add ?recursive=true for full deep tree via PostgreSQL CTE)
GET    /api/tasks/:id/comments   All comments
POST   /api/tasks/:id/comments   { content }
GET    /api/tasks/:id/history    AuditLog entries for this task
```

### Notifications
```
GET   /api/notifications             Last 50 notifications for current actor
POST  /api/notifications/:id/read    Mark one read
POST  /api/notifications/read-all    Mark all read
```

### Audit & Reports (Director only)
```
GET   /api/audit                         Full workspace audit log (filter: ?event= ?from= ?to= ?actorPersonnelId=)
GET   /api/reports/overdue               All overdue tasks
GET   /api/reports/progress              Project-level status count summary
GET   /api/reports/queue/:personnelId    Active task queue for a specific person
```

---

## 13. Git Repository & Branches

**Repository:** https://github.com/dasunyasantha-netizen/Taskwise.git

| Branch | Purpose |
|---|---|
| `main` | Production code — only merge from `develop` |
| `develop` | Integration branch — test here before promoting to main |
| `feature/auth` | Director register/login + Personnel login |
| `feature/tasks` | Task CRUD, state machine, subtasks, approval workflow |
| `feature/hierarchy` | Layers, departments, personnel CRUD, groups |
| `feature/ui-board` | Kanban board, TaskCard, TaskDetailPanel, DatePicker, Select |
| `feature/notifications` | In-app notification polling and bell menu |

### Branch workflow
```
feature/xxx  →  develop  →  main  →  deploy to production
```

Never commit directly to `main`.

---

## 14. Local Development Setup

### Prerequisites
- Node.js 20+
- PostgreSQL running on localhost:5432
- Database created: `CREATE DATABASE taskwise_db;`

### First-time setup

**Terminal 1 — Backend:**
```bash
cd "c:\Users\dasun\Dasun Systems\Syswise\taskwise-local\server"
npm install
# Create .env from .env.example and verify values
npx prisma db push      # Creates all 12 tables
npm run dev             # Starts on port 4300
```

**Terminal 2 — Frontend:**
```bash
cd "c:\Users\dasun\Dasun Systems\Syswise\taskwise-local"
npm install
npm run dev             # Starts on port 3500, proxies /api → localhost:4300
```

Open `http://localhost:3500`

### After first setup — use the start script

The monorepo start script launches TaskWise alongside all other modules:
```powershell
# From c:\Users\dasun\Dasun Systems\Syswise\
.\start-local-dev.ps1
```

### Local environment variables (`server/.env`)
```env
DATABASE_URL="postgresql://postgres:wealthpeshala@localhost:5432/taskwise_db?schema=public"
JWT_SECRET="taskwise_jwt_secret_local_dev_2026"
PORT=4300
NODE_ENV=development
```

### Useful commands
```bash
# Rebuild database after schema change
npx prisma db push

# Open Prisma Studio (visual DB browser)
npx prisma db studio

# Build backend for production
npm run build

# Build frontend for production
NODE_ENV=production npm run build
```

---

## 15. Production Server

**Provider:** Hetzner Cloud Singapore
**IP:** `5.223.76.20`
**SSH alias:** `ssh syswise-hetzner`

### Server Paths

| Component | Path |
|---|---|
| Frontend dist (served by Nginx) | `/var/www/taskwise/dist/` |
| Backend source | `/var/www/taskwise/server/` |
| Backend compiled JS | `/var/www/taskwise/server/dist/` |
| Backend env file | `/var/www/taskwise/server/.env` |
| Nginx config | `/etc/nginx/sites-enabled/syswise` |

### PM2 Processes

| Name | ID | Port | Started |
|---|---|---|---|
| `taskwise-backend` | 17 | 4003 | April 2026 |

```bash
pm2 status               # View all processes
pm2 logs taskwise-backend  # View live logs
pm2 restart taskwise-backend
```

### Nginx Routes for TaskWise

```nginx
location = /taskwise {
    return 301 /taskwise/;
}
location /taskwise/ {
    alias /var/www/taskwise/dist/;
    try_files $uri $uri/ /taskwise/index.html;
}
location /taskwise-api/ {
    proxy_pass http://localhost:4003/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Production environment variables (`server/.env`)
```env
DATABASE_URL="postgresql://syswise_user:SysW1se2026!Secure@localhost:5432/taskwise_db?schema=public"
JWT_SECRET="<strong random — do not share>"
PORT=4003
NODE_ENV=production
```

---

## 16. Deployment Update Guide

Use this every time you push a change to production.

### Full deploy (frontend + backend changed)

```bash
# 1. Local — commit and push to main
cd "c:\Users\dasun\Dasun Systems\Syswise\taskwise-local"
git add .
git commit -m "feat: ..."
git push origin main

# 2. SSH into server
ssh syswise-hetzner

# 3. Pull latest code
cd /var/www/taskwise
git pull

# 4. If Prisma schema changed
cd server
npx prisma db push

# 5. Rebuild backend
cd /var/www/taskwise/server
npm run build
pm2 restart taskwise-backend

# 6. Rebuild frontend
cd /var/www/taskwise
NODE_ENV=production npm run build

# No Nginx restart needed unless config changed
```

### Frontend only (no backend changes)
```bash
ssh syswise-hetzner
cd /var/www/taskwise && git pull
NODE_ENV=production npm run build
```

### Backend only (no frontend changes)
```bash
ssh syswise-hetzner
cd /var/www/taskwise && git pull
cd server && npm run build
pm2 restart taskwise-backend
```

### Check deployment is healthy
```bash
# Check PM2 is running
pm2 status

# Check backend is responding
curl https://syswise.lk/taskwise-api/api/health

# Check frontend loads
curl -sI https://syswise.lk/taskwise/ | head -3
```

---

## Implementation Status

| Phase | Status | Scope |
|---|---|---|
| Phase 1 | ✅ Complete | Auth, workspace hierarchy, projects, full Kanban board, task detail panel, notifications, audit log, Director + Personnel dashboards |
| Phase 2 | 🔄 Partial | Groups, subtasks, return/reject workflow, deadline ownership — all implemented in backend, UI complete |
| Phase 3 | Pending | Layer-based visibility enforcement (currently all tasks visible to everyone in workspace), recursive subtask CTE queries, drag-drop status change on board |
| Phase 4 | ✅ Complete | Production deployment, Nginx, PM2, PostgreSQL, SSL |

### Known current limitations
- **Visibility** — Phase 3 layer-scoped filtering not yet applied. All personnel can currently see all tasks in the workspace. This is safe for single-org use but should be addressed before multi-tenant rollout.
- **Recursive subtask tree** — the `/subtasks?recursive=true` endpoint returns only direct children. Deep tree traversal via PostgreSQL CTE is a Phase 3 item.
- **No drag-and-drop** — task status changes require opening the detail panel and clicking an action button. Board drag-to-column is Phase 3.

---

*Documentation maintained in `/var/www/taskwise/TASKWISE_DOCUMENTATION.md` on the server and in the GitHub repo.*
