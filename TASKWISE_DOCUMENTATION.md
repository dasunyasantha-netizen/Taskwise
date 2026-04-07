# TaskWise — Full Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Directory Structure](#directory-structure)
4. [Ports & URLs](#ports--urls)
5. [Database](#database)
6. [Authentication](#authentication)
7. [Hierarchy & Roles](#hierarchy--roles)
8. [Projects, Tasks & Subtasks](#projects-tasks--subtasks)
9. [Task Lifecycle (State Machine)](#task-lifecycle-state-machine)
10. [Approval Workflow](#approval-workflow)
11. [Notifications](#notifications)
12. [Audit Log](#audit-log)
13. [Visibility Rules](#visibility-rules)
14. [API Reference](#api-reference)
15. [Git Repository & Branches](#git-repository--branches)
16. [Local Development](#local-development)
17. [Production Deployment](#production-deployment)
18. [Test Accounts](#test-accounts)
19. [Deployment Update Guide](#deployment-update-guide)

---

## Overview

TaskWise is a hierarchical task management system built as a module within the SysWise ecosystem. It is designed for desktop use and features a Monday.com-style card-based UI.

**Key capabilities:**
- Multiple Directors, each with their own isolated workspace
- 3-layer organizational hierarchy (departments, groups, personnel)
- Project → Task → Subtask structure with unlimited nesting
- Full approval workflow — completed tasks require sign-off from the assigning authority
- In-app notifications (no email/SMS)
- Full audit trail of every action
- Soft deletes — nothing is permanently removed

**Separate login system** — TaskWise does not use SysWise SSO. Directors and Personnel log in directly at `syswise.lk/taskwise/`.

---

## Architecture

| Layer | Technology |
|---|---|
| Frontend | Vite + React + TypeScript |
| Styling | Tailwind CSS (Monday.com palette) |
| Backend | Node.js + Express + TypeScript |
| ORM | Prisma |
| Database | PostgreSQL |
| Process Manager | PM2 |
| Web Server | Nginx (reverse proxy) |

Follows the same pattern as DayWise and CricWise in the SysWise monorepo.

---

## Directory Structure

```
taskwise-local/
├── index.html                        # HTML entry point
├── vite.config.ts                    # Vite config (port 3500, base /taskwise/ in prod)
├── tailwind.config.js                # Monday.com color palette
├── .env.production                   # VITE_API_URL for production build
├── src/
│   ├── main.tsx                      # React entry point
│   ├── App.tsx                       # Root component, auth state, routing
│   ├── types.ts                      # All shared TypeScript types
│   ├── index.css                     # Tailwind base + component classes
│   ├── vite-env.d.ts                 # Vite environment type declarations
│   ├── components/
│   │   ├── Auth.tsx                  # Login screen (Director / Personnel tabs)
│   │   ├── DirectorDashboard.tsx     # Director main layout + sidebar
│   │   ├── PersonnelDashboard.tsx    # Personnel main layout + sidebar
│   │   └── (more components to be built in Phase 1+)
│   └── services/
│       └── apiService.ts             # All API calls, typed per endpoint
└── server/
    ├── prisma/
    │   └── schema.prisma             # Full database schema (12 models)
    ├── src/
    │   ├── index.ts                  # Express server entry (port 4300 local / 4003 prod)
    │   ├── prisma.ts                 # PrismaClient singleton
    │   ├── middleware/
    │   │   └── authMiddleware.ts     # JWT auth + requireDirector guard
    │   ├── routes/
    │   │   ├── authRoutes.ts
    │   │   ├── workspaceRoutes.ts
    │   │   ├── projectRoutes.ts
    │   │   ├── taskRoutes.ts
    │   │   ├── notificationRoutes.ts
    │   │   └── auditRoutes.ts
    │   └── controllers/
    │       ├── authController.ts
    │       ├── workspaceController.ts
    │       ├── projectController.ts
    │       ├── taskController.ts
    │       ├── notificationController.ts
    │       └── auditController.ts
    ├── .env                          # Local dev environment variables (git-ignored)
    └── .env.example                  # Template for env setup
```

---

## Ports & URLs

| Environment | Frontend | Backend |
|---|---|---|
| Local dev | `http://localhost:3500` | `http://localhost:4300` |
| Production | `https://syswise.lk/taskwise/` | internal port `4003` via Nginx |

**Production API routes through Nginx:**
- Frontend static files → `/taskwise/` → `/var/www/taskwise/dist/`
- API requests → `/taskwise-api/` → `localhost:4003`

---

## Database

| Setting | Value |
|---|---|
| Engine | PostgreSQL |
| Local DB name | `taskwise_db` |
| Production DB name | `taskwise_db` |
| Production DB user | `syswise_user` |
| Production DB password | `SysW1se2026!Secure` |
| Local DB password | `wealthpeshala` |
| Host | `localhost:5432` |

**Local connection string:**
```
postgresql://postgres:wealthpeshala@localhost:5432/taskwise_db?schema=public
```

**Production connection string:**
```
postgresql://syswise_user:SysW1se2026!Secure@localhost:5432/taskwise_db?schema=public
```

### Database Models (12 tables)

| Model | Purpose |
|---|---|
| `Director` | Director accounts (global unique email, owns one Workspace) |
| `Workspace` | One per Director — all data is scoped to a workspace |
| `Layer` | 3 layers per workspace (numbered 1, 2, 3) |
| `Department` | Belongs to a Layer, contains Personnel and Groups |
| `Personnel` | Leaf-level users with login credentials (email unique per workspace) |
| `Group` | Named group within a Department (same-department only) |
| `GroupMember` | Junction: Personnel ↔ Group (many-to-many) |
| `Project` | Created by Director, belongs to Workspace |
| `Task` | Self-referencing (`parentTaskId`) — top-level and subtasks in one table |
| `TaskAssignment` | Polymorphic: task assigned to Department OR Group OR Personnel |
| `TaskComment` | Comments on a task by Director or Personnel |
| `AuditLog` | Every action logged with actor, event type, timestamp, JSON payload |
| `Notification` | In-app notifications for Director or Personnel |

---

## Authentication

TaskWise has its **own separate login system** — it does not use SysWise SSO.

### JWT Token Payload
```json
{
  "actorId": "uuid",
  "actorType": "director | personnel",
  "workspaceId": "uuid"
}
```
Token expiry: **7 days**. Stored in `localStorage` as `taskwise_token`.

### Director Registration
`POST /api/auth/director/register`
- Creates the Director account
- Automatically creates a Workspace with 3 default Layers
- Director email must be globally unique

### Director Login
`POST /api/auth/director/login`
- Email + password

### Personnel Login
`POST /api/auth/personnel/login`
- Email + password + **workspaceId** (required — same email can exist in multiple workspaces)

---

## Hierarchy & Roles

```
Director
  └── Workspace
        ├── Layer 1 (e.g. Management)
        │     └── Department (e.g. Strategy)
        │           ├── Personnel (Alice)
        │           └── Group → GroupMembers
        ├── Layer 2 (e.g. Operations)
        │     └── Department (e.g. Development)
        │           └── Personnel (Bob)
        └── Layer 3 (e.g. Field)
              └── Department (e.g. Support)
                    └── Personnel (Carol)
```

### Role Capabilities

| Action | Director | Layer 1 | Layer 2 | Layer 3 |
|---|---|---|---|---|
| Create top-level tasks | Yes | No | No | No |
| Create subtasks | Yes | Yes | Yes | Yes |
| Assign tasks | Yes | Yes (downward) | Yes (downward) | No |
| Approve/Reject tasks | Yes | Yes (tasks they assigned) | Yes (tasks they assigned) | No |
| Move personnel between depts | Yes | No | No | No |
| View all layers below | Yes | Yes (L2 + L3) | Yes (L3 only) | No |
| Cancel tasks | Yes | No | No | No |
| Delete tasks (soft) | Yes | No | No | No |
| Edit deadlines | Only the setter | Only the setter | Only the setter | No |

### Groups
- A Group contains Personnel **from the same Department only**
- A Personnel can belong to **multiple groups simultaneously**
- When a task is assigned to a Group, **any member** can start/submit it
- Only Directors can create/delete groups and manage membership

---

## Projects, Tasks & Subtasks

### Projects
- Created by the Director only
- Belong to a Workspace
- Each project has a name, description, and color
- All tasks must belong to a project

### Tasks
Every task has the following fields:

| Field | Description |
|---|---|
| `title` | Task name |
| `description` | Detailed description |
| `projectId` | Which project this belongs to |
| `parentTaskId` | If set, this is a subtask |
| `priority` | `CRITICAL` / `HIGH` / `MEDIUM` / `LOW` |
| `status` | Current state in lifecycle |
| `deadline` | Due date (only editable by setter) |
| `deadlineSetById` | Who set the deadline |
| `assignments` | Who it's assigned to (dept/group/person) |
| `approvalById` | Who must approve when submitted |
| `returnReason` | Reason if task was returned |
| `cancelReason` | Reason if task was cancelled |
| `createdByDirectorId` / `createdByPersonnelId` | Who created it |

### Subtask Rules
- **Top-level tasks**: Director only
- **Subtasks**: Any Personnel who owns (is assigned to) the parent task
- Subtasks can have their own subtasks (unlimited depth)
- A parent task **cannot be submitted** until all its subtasks are APPROVED

---

## Task Lifecycle (State Machine)

```
PENDING
  │
  │ assign()  ← Director or authorized personnel assigns to dept/group/person
  ▼
ASSIGNED
  │
  │ start()   ← Assignee begins work
  ▼
IN_PROGRESS ──── return(reason) ──► RETURNED
  │                                     │
  │ submit()                            │ reassign() ← Authority re-assigns
  │ (only if all subtasks = APPROVED)   ▼
  ▼                                 ASSIGNED
SUBMITTED
  │
  ├── approve() ──► APPROVED  (terminal — task is done)
  │
  └── reject(reason) ──► REJECTED
                              │
                              │ reopen() ← Assignee can revise
                              ▼
                          IN_PROGRESS

Any state → CANCELLED  (Director only, requires reason, soft delete)
```

### State Transition Rules

| Transition | Who can trigger | Condition |
|---|---|---|
| PENDING → ASSIGNED | Director (top-level); parent task owner (subtasks) | Must specify assignment target |
| ASSIGNED → IN_PROGRESS | Assigned personnel / any group member / dept head | — |
| IN_PROGRESS → SUBMITTED | Assignee | All subtasks must be APPROVED |
| IN_PROGRESS → RETURNED | Assignee | Reason required |
| RETURNED → ASSIGNED | Assigning authority | After reviewing reason |
| SUBMITTED → APPROVED | `approvalById` actor only | — |
| SUBMITTED → REJECTED | `approvalById` actor only | Reason required |
| REJECTED → IN_PROGRESS | Assignee | Allows revision |
| Any → CANCELLED | Director only | Reason required |

---

## Approval Workflow

1. Assignee marks task as **SUBMITTED**
2. The `approvalById` person (whoever created/assigned the task) receives an **in-app notification**
3. They review and either **APPROVE** or **REJECT** with a reason
4. If rejected, assignee is notified and can reopen to IN_PROGRESS to revise
5. If approved, the task is **APPROVED** (terminal state)
6. **Parent task gate**: a task with subtasks cannot be submitted until every subtask (that is not CANCELLED) is APPROVED

**Deadline ownership**: Only the person who originally set the deadline (`deadlineSetById`) can change it. The assignee cannot modify their own deadline.

---

## Notifications

- **In-app only** — no email, SMS, or WhatsApp
- Polled every **15 seconds** by the frontend
- Also refreshed on browser tab focus
- Last 50 notifications shown in the bell menu

### Notification Types

| Type | Triggered when |
|---|---|
| `task_assigned` | A task is assigned to you |
| `task_returned` | Your assigned task was returned by assignee |
| `task_submitted_for_approval` | A task you assigned was submitted for your approval |
| `task_approved` | Your submitted task was approved |
| `task_rejected` | Your submitted task was rejected |
| `task_deadline_warning` | Deadline is approaching (future feature) |
| `subtask_created` | A subtask was created under your task |
| `comment_added` | A comment was added to your task |
| `personnel_moved` | A personnel was moved between departments (Director) |

---

## Audit Log

Every significant action is permanently recorded in the `AuditLog` table.

### Logged Events

```
TASK_CREATED        TASK_ASSIGNED       TASK_UPDATED
TASK_STARTED        TASK_SUBMITTED      TASK_APPROVED
TASK_REJECTED       TASK_RETURNED       TASK_REASSIGNED
TASK_CANCELLED      TASK_DELETED        SUBTASK_CREATED
COMMENT_ADDED       DEADLINE_CHANGED    PERSONNEL_MOVED
PROJECT_CREATED
```

Each log entry records:
- `event` — event type
- `actorType` — `director` or `personnel`
- `actorDirectorId` / `actorPersonnelId` — who did it
- `taskId` — which task (if applicable)
- `payload` — JSON snapshot of changed data, reasons, old/new values
- `createdAt` — exact timestamp

**Soft deletes** — tasks marked with `deletedAt` still appear in audit logs and history. Nothing is permanently erased.

---

## Visibility Rules

| Actor | Can See |
|---|---|
| Director | Everything in their workspace — all projects, tasks, subtasks, queues, history |
| Layer 1 Personnel | Tasks assigned to their dept/groups/self + all tasks visible to Layer 2 and 3 below |
| Layer 2 Personnel | Tasks assigned to their dept/groups/self + all tasks visible to Layer 3 |
| Layer 3 Personnel | Only tasks assigned directly to them, their group, or their department |

---

## API Reference

All endpoints are prefixed with `/api`. Protected by Bearer JWT unless marked public.

### Auth
```
POST   /api/auth/director/register     Register a new Director (creates workspace + 3 layers)
POST   /api/auth/director/login        Director login → JWT
POST   /api/auth/personnel/login       Personnel login (requires workspaceId) → JWT
GET    /api/auth/me                    Get current actor profile
```

### Workspace & Hierarchy
```
GET    /api/workspace                          Get workspace info with layers
GET    /api/workspace/layers                   List all 3 layers with departments
GET    /api/workspace/departments              List all departments
POST   /api/workspace/departments              Create department (Director only)
PUT    /api/workspace/departments/:id          Rename department (Director only)
DELETE /api/workspace/departments/:id          Soft delete department (Director only)

GET    /api/workspace/personnel                List all personnel (filter: ?departmentId= ?layerId=)
POST   /api/workspace/personnel                Create personnel account (Director only)
PUT    /api/workspace/personnel/:id            Update personnel info
PUT    /api/workspace/personnel/:id/move       Move to different department (Director only)
DELETE /api/workspace/personnel/:id            Soft delete (Director only)
GET    /api/workspace/personnel/:id/queue      Get active task queue for a person

GET    /api/workspace/groups                   List groups (filter: ?departmentId=)
POST   /api/workspace/groups                   Create group (Director only)
PUT    /api/workspace/groups/:id               Rename group
DELETE /api/workspace/groups/:id               Soft delete (Director only)
POST   /api/workspace/groups/:id/members       Add personnel to group (Director only)
DELETE /api/workspace/groups/:id/members/:pid  Remove personnel from group (Director only)
```

### Projects
```
GET    /api/projects           List all projects in workspace
POST   /api/projects           Create project (Director only)
GET    /api/projects/:id       Get project details
PUT    /api/projects/:id       Update project (Director only)
DELETE /api/projects/:id       Soft delete project (Director only)
```

### Tasks
```
GET    /api/tasks                     List tasks (filter: ?projectId= ?status= ?parentTaskId=null ?overdue=true)
POST   /api/tasks                     Create task (top-level: Director only; subtask: parent owner)
GET    /api/tasks/:id                 Get task with subtasks, assignments, comments
PUT    /api/tasks/:id                 Update task fields (deadline edit enforced)
DELETE /api/tasks/:id                 Soft delete (Director only)

POST   /api/tasks/:id/assign          Assign task → { personnelId } or { groupId } or { departmentId }
POST   /api/tasks/:id/start           ASSIGNED → IN_PROGRESS
POST   /api/tasks/:id/submit          IN_PROGRESS → SUBMITTED (checks all subtasks approved)
POST   /api/tasks/:id/return          IN_PROGRESS → RETURNED → { reason }
POST   /api/tasks/:id/approve         SUBMITTED → APPROVED (approvalById actor only)
POST   /api/tasks/:id/reject          SUBMITTED → REJECTED → { reason }
POST   /api/tasks/:id/reopen          REJECTED → IN_PROGRESS
POST   /api/tasks/:id/cancel          Any → CANCELLED → { reason } (Director only)

GET    /api/tasks/:id/subtasks        List direct subtasks
GET    /api/tasks/:id/comments        List comments
POST   /api/tasks/:id/comments        Add comment → { content }
GET    /api/tasks/:id/history         Get audit log entries for this task
```

### Notifications
```
GET    /api/notifications             Get last 50 notifications for current actor
POST   /api/notifications/:id/read   Mark one notification as read
POST   /api/notifications/read-all   Mark all as read
```

### Audit & Reports (Director only)
```
GET    /api/audit                        Full workspace audit log (filter: ?event= ?from= ?to= ?actorPersonnelId=)
GET    /api/reports/overdue              All overdue tasks (deadline < now, not APPROVED/CANCELLED)
GET    /api/reports/progress             Project progress summary with status counts
GET    /api/reports/queue/:personnelId   Active task queue for a specific person
```

---

## Git Repository & Branches

**Repository:** `https://github.com/dasunyasantha-netizen/Taskwise.git`

| Branch | Purpose |
|---|---|
| `main` | Production-ready code — only merge from `develop` |
| `develop` | Integration branch — merge feature branches here first |
| `feature/auth` | Director register/login + Personnel login |
| `feature/tasks` | Task CRUD, state machine, subtasks, approval workflow |
| `feature/hierarchy` | Layers, departments, personnel CRUD, groups, move personnel |
| `feature/ui-board` | Kanban board view, TaskCard, TaskDetailPanel, ListView |
| `feature/notifications` | In-app notification polling, bell menu |

### Branch Workflow
```
feature/xxx  →  develop  →  main
```
Never commit directly to `main`. Always merge `develop` → `main` for production.

---

## Local Development

### Prerequisites
- Node.js 20+
- PostgreSQL running on localhost:5432
- Create local database: `CREATE DATABASE taskwise_db;`

### First-time setup

**Step 1 — Backend:**
```bash
cd "c:\Users\dasun\Dasun Systems\Syswise\taskwise-local\server"
npm install
# Copy .env.example to .env and check values
npx prisma db push        # Creates all tables
npm run dev               # Starts on port 4300
```

**Step 2 — Frontend:**
```bash
cd "c:\Users\dasun\Dasun Systems\Syswise\taskwise-local"
npm install
npm run dev               # Starts on port 3500
```

### After first setup
Use the global start script:
```powershell
# From c:\Users\dasun\Dasun Systems\Syswise\
.\start-local-dev.ps1
```
This starts all SysWise modules including TaskWise.

### Local environment variables (`server/.env`)
```env
DATABASE_URL="postgresql://postgres:wealthpeshala@localhost:5432/taskwise_db?schema=public"
JWT_SECRET="taskwise_jwt_secret_local_dev_2026"
PORT=4300
NODE_ENV=development
```

---

## Production Deployment

**Server:** Hetzner Cloud Singapore — `5.223.76.20`
**SSH alias:** `ssh syswise-hetzner`

### Server paths
| Component | Path |
|---|---|
| Frontend dist | `/var/www/taskwise/dist/` |
| Backend source | `/var/www/taskwise/server/` |
| Backend env | `/var/www/taskwise/server/.env` |
| Nginx config | `/etc/nginx/sites-enabled/syswise` |

### PM2 Process
| Name | ID | Port |
|---|---|---|
| `taskwise-backend` | 17 | 4003 |

### Nginx Routes
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
    ...
}
```

### Production environment variables (`server/.env` on server)
```env
DATABASE_URL="postgresql://syswise_user:SysW1se2026!Secure@localhost:5432/taskwise_db?schema=public"
JWT_SECRET="<strong random secret — do not share>"
PORT=4003
NODE_ENV=production
```

---

## Deployment Update Guide

When you push new code and want to deploy to production:

```bash
# 1. On your local machine — commit and push to main
git add .
git commit -m "feat: ..."
git push origin main

# 2. SSH into server
ssh syswise-hetzner

# 3. Pull latest code
cd /var/www/taskwise
git pull

# 4. If schema changed — push DB changes
cd server
npx prisma db push

# 5. Rebuild backend (if backend files changed)
cd /var/www/taskwise/server
npm run build
pm2 restart taskwise-backend

# 6. Rebuild frontend (if frontend files changed)
cd /var/www/taskwise
NODE_ENV=production npm run build

# Done — no Nginx restart needed unless config changed
```

---

## Test Accounts

All test accounts use the password: **`taskwise123`**

### Director
| Email | Password | Workspace |
|---|---|---|
| `director@taskwise.lk` | `taskwise123` | Syswise HQ |

### Personnel (use Personnel tab — enter Workspace ID on login)

| Name | Email | Department | Layer |
|---|---|---|---|
| Alice Manager | `alice@taskwise.lk` | Strategy | Layer 1 — Management |
| Bob Developer | `bob@taskwise.lk` | Development | Layer 2 — Operations |
| Carol Support | `carol@taskwise.lk` | Support | Layer 3 — Field |

> **Note:** Personnel login requires the Workspace ID. The Director can find it in the workspace settings, or it can be obtained from the database:
> ```sql
> SELECT id, name FROM "Workspace";
> ```

### Sample Data
- **Project:** "TaskWise Launch" — created under Director's workspace

---

## Implementation Phases

| Phase | Status | Scope |
|---|---|---|
| Phase 1 | In progress | Auth, workspace setup, projects, basic tasks, board view, personnel queue |
| Phase 2 | Pending | Groups, subtasks, return/reject workflow, deadline ownership, task history |
| Phase 3 | Pending | Layer visibility enforcement, overdue reports, audit log UI, drag-drop board |
| Phase 4 | Complete | Production deployment, Nginx, PM2, database |

---

*Last updated: April 2026*
