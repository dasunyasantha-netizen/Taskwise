# TaskWise — Full System Documentation

**Version:** June 2026  
**Platform:** SysWise Suite (syswise.lk/taskwise)  
**Stack:** React + TypeScript (Vite) · Node.js + Express · Prisma · PostgreSQL

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [User Roles](#3-user-roles)
4. [Workspace & Hierarchy Setup](#4-workspace--hierarchy-setup)
5. [Authentication](#5-authentication)
6. [Task Lifecycle](#6-task-lifecycle)
7. [Task Features In Detail](#7-task-features-in-detail)
8. [Subtasks](#8-subtasks)
9. [Group-Wise Tasks](#9-group-wise-tasks)
10. [Projects](#10-projects)
11. [Reports](#11-reports)
12. [Notifications & Broadcasts](#12-notifications--broadcasts)
13. [Audit & History](#13-audit--history)
14. [Director Capabilities](#14-director-capabilities)
15. [Personnel Capabilities](#15-personnel-capabilities)
16. [Chairman Impersonation](#16-chairman-impersonation)
17. [Views & Navigation](#17-views--navigation)
18. [API Reference](#18-api-reference)
19. [Database Schema](#19-database-schema)
20. [Deployment](#20-deployment)

---

## 1. System Overview

TaskWise is a structured task management system designed for organisations with a hierarchical workforce. It sits inside the SysWise platform and is accessed via SSO from the SysWise dashboard.

The core model is: a **Director** creates tasks and assigns them to people or departments. Those people work through the task, log progress, create subtasks if needed, and submit for approval. The director approves or returns the work. Every action is permanently logged.

**Key design principles:**
- Every task has exactly one approval authority (the director or the personnel who created the subtask).
- Tasks follow a strict state machine — no skipping steps.
- The full audit trail is immutable and always visible.
- PWA-first: works offline-capable as an installed app on any device.

---

## 2. Architecture

```
Browser / PWA
    └── Vite + React + TypeScript (port 3600 local / /taskwise/ on prod)
            │
            ▼
    Express + Node.js API (port 4400 local / /taskwise-api/ on prod)
            │
            ▼
    Prisma ORM
            │
            ▼
    PostgreSQL (taskwise_db on production, taskwise_local locally)
```

**Production:**
- Server: Hetzner Cloud Singapore (5.223.76.20)
- Process manager: PM2 (`taskwise-backend`)
- Nginx reverse proxy at `syswise.lk/taskwise/` and `syswise.lk/taskwise-api/`
- SSL via Let's Encrypt

**Frontend:** Vite PWA with `injectManifest` strategy. The service worker caches all hashed assets and self-updates on every deploy via a git SHA injected into `CACHE_VERSION`.

---

## 3. User Roles

There are two roles in TaskWise:

### Director
- Full access to the entire system
- Creates workspaces, layers, departments, and personnel
- Creates and assigns top-level tasks
- Approves, rejects, returns, and cancels tasks
- Views all tasks, reports, and audit logs
- Can impersonate personnel (Chairman only — see Section 16)
- Manages broadcasts, notices, and workspace settings

### Personnel
- Sees only tasks assigned to them or their department
- Accepts tasks, logs progress updates, creates subtasks, and submits work
- Can reassign their task to another person
- Can return a task to the director with a reason
- Manages their own profile and biometric credentials
- Cannot see other people's tasks or the audit log

---

## 4. Workspace & Hierarchy Setup

### Workspace
A TaskWise instance belongs to a single **Workspace**. It has a name, company name, and optional logo. All data (tasks, people, projects) belongs to one workspace.

### Layers
The hierarchy has up to **3 layers**, numbered 1–3 from top to bottom:
- Layer 1 = most senior (e.g. "Senior Management")
- Layer 2 = middle management (e.g. "Department Heads")
- Layer 3 = operational staff (e.g. "Officers")

Each layer has a name and contains one or more **Departments**.

### Departments
Each department belongs to one layer. A department groups personnel together and can receive task assignments as a unit (before any individual accepts it).

### Personnel
Each person belongs to exactly one department. Personnel fields:
- Name, phone (used as login), email, NIC, avatar
- `supervisorId` — the person one level above them in the chain
- The supervisor chain is used for task routing: when a personnel submits a subtask, it routes to their supervisor for approval, walking the chain upward until it reaches the director.

**Setting up supervisors:**
The director assigns supervisors via the Hierarchy Manager. If a personnel opens a subtask they have been assigned and they have no supervisor set, TaskWise prompts them to select one before they can proceed.

---

## 5. Authentication

### Password Login
- Unified login endpoint for both directors and personnel
- Login with phone number + password
- JWT returned, stored in `localStorage` as `taskwise_token`
- Token contains: `actorId`, `actorType`, `workspaceId`, `name`, `layerNumber`, `departmentId`, `isChairman`

### Force Password Change
- On first login (or after an admin reset), the user is forced to change their password before accessing anything
- The force-change screen blocks all other views until complete

### Biometric Login (WebAuthn / FIDO2)
- Personnel can register a fingerprint or Face ID credential from the Profile page
- Uses the WebAuthn standard — credentials are device-bound (one passkey per device)
- On subsequent logins, the user enters their phone number and a biometric prompt replaces the password field
- Multiple devices can be registered; each appears as a named credential in the Profile page
- Credentials can be deleted individually from Profile

### First-Login Setup Prompt
- New users (first login only) see a two-step guided setup:
  1. **Push notifications** — grants browser/OS permission for task alerts
  2. **Biometric enrolment** — registers their fingerprint/Face ID
- Both steps are optional and can be skipped

### SSO from SysWise
- Users arrive at `/sso?token=<syswiseJWT>` from the SysWise dashboard
- TaskWise decodes the token, auto-creates or matches the user, and returns a TaskWise-specific JWT

### Session Persistence
- The last active view is stored in `localStorage` (`taskwise_view`)
- Refreshing the browser restores the same page the user was on
- Logging out clears the stored view and token

---

## 6. Task Lifecycle

### Status State Machine

```
PENDING ──► ASSIGNED ──► IN_PROGRESS ──► SUBMITTED ──► APPROVED
                │              │
                │              ▼
                │           RETURNED   (assignee returns it with optional reason)
                │              │
                │              ▼ (re-opened by assignee)
                │           IN_PROGRESS
                │
                └──► REJECTED   (approval authority rejects with reason)
                          │
                          ▼ (reopen)
                       IN_PROGRESS

Any status ──► CANCELLED   (Director only)
```

### Step-by-Step Flow

#### 1. Task Created — PENDING
- Director creates a task with title, description, priority, deadline, and project
- Task starts as `PENDING`

#### 2. Task Assigned — ASSIGNED
- Director assigns to a specific **person**, a **department**, or a **layer**
- Status moves to `ASSIGNED`
- Assignee receives a push notification

#### 3. Task Accepted — IN_PROGRESS
- When the assigned person opens the task, it **automatically** transitions to `IN_PROGRESS`
- If assigned to a department (not a specific person), anyone in that department can open and accept it — taking personal ownership
- `actedById` and `actedByType` are set to the person who accepted

#### 4. Work in Progress
- Personnel logs **progress updates** — dated notes with timestamps
- Personnel can create **subtasks** and delegate portions of the work to others
- Personnel can add **comments**
- If blocked, personnel can **return** the task to the director with an optional reason

#### 5. Submit for Approval — SUBMITTED
- Personnel clicks "Complete"
- A pre-check runs: if any subtasks are not yet APPROVED or SUBMITTED, a warning lists them
- The user can submit anyway or go back to resolve subtasks first
- Task moves to `SUBMITTED`
- The approval authority (director by default, or the personnel who created the subtask) is notified

#### 6. Approved — APPROVED
- Director (or approval authority) reviews and approves
- Task moves to `APPROVED` — terminal state
- If all sibling subtasks are now approved, the parent task's assignee is notified automatically

#### 7. Rejected
- Director rejects with an optional reason
- Task moves to `REJECTED`
- Assignee can **reopen** it → moves back to `IN_PROGRESS`

#### 8. Returned
- Personnel can return a task (ASSIGNED or IN_PROGRESS) to the director at any time
- Reason is optional
- Director sees a notification
- The assignee sees a red alert banner the next time they open the task if it was returned by the director

#### 9. Cancelled
- Director only; works on any status
- Adds `cancelledAt` timestamp and optional reason
- Soft-delete — task remains visible in history but disappears from active queues

### Priority Levels

`CRITICAL` · `HIGH` · `MEDIUM` · `LOW`

Priority affects visual colour-coding only — it does not change routing or approval rules.

---

## 7. Task Features In Detail

### Progress Updates
- Personnel logs what they worked on, one entry per session
- Each entry records: the note text, author name, date, and time
- Displayed as a sortable table in the Updates tab of the task modal
- Only the currently assigned person can post new updates
- Updates from previously removed assignees remain as read-only history

### Comments
- Separate from progress updates — intended for questions and discussion
- Visible to all parties who can see the task
- Not used for formal progress tracking

### Deadline
- Optional at task creation
- Shown in red and labelled "OVERDUE" once the deadline passes and the task is not yet approved

### Deadline Extension
- Available to the **task creator** when a task is overdue and not yet approved
- Extension modal requires:
  - New deadline (mandatory)
  - Reason (mandatory)
  - Note (optional)
- Every extension is logged in the History tab with old date → new date, reason, and who extended it
- Multiple extensions are allowed; all are individually recorded
- `originalDeadline` is preserved from task creation and is never changed by extensions (reserved for future performance scoring)

### Edit Task
- Available to the **task creator** while the task is not APPROVED or CANCELLED
- Can change: title, description, deadline
- Priority and project cannot be changed after creation

### Change Assignees
- Available to the **task creator** (not APPROVED or CANCELLED)
- Can add multiple new assignees and remove existing ones in a single operation
- **Subtask auto-cancel:** removing an assignee automatically cancels all their active subtasks (not already APPROVED or CANCELLED); each cancelled subtask gets its own audit entry with the reason
- An inline warning is shown before saving if any person being removed has active subtasks, showing name and count
- A reason is mandatory
- History tab records the full diff: who was added, who was removed, and the reason

### Reassign (single person transfer)
- The currently assigned person can transfer their task to another person
- Requires a reason (mandatory if the task is not PENDING)
- Task moves back to ASSIGNED for the new person
- Both the new assignee and the approval authority are notified

### Return Task
- The assigned person can return a task (ASSIGNED or IN_PROGRESS) to the director
- Reason is optional
- Director receives a notification
- The person who returned it sees a dismissible red banner on next open

### Subtask Warning on Submit
- When submitting, if any subtasks are not yet APPROVED or SUBMITTED, a modal lists them by name and status
- The user can choose to submit anyway (overriding the warning) or go back to resolve them

---

## 8. Subtasks

Subtasks are tasks with a `parentTaskId` set. They have the same structure as top-level tasks but with several differences:

### Who Creates Subtasks
- The assigned personnel (or task creator) creates subtasks from within the task modal while the parent is ASSIGNED or IN_PROGRESS

### Subtask Assignment
- When creating a subtask, the creator must immediately choose a person to assign it to
- The subtask is created and assigned in one action — it has no PENDING state for unassigned work

### Subtask Deadline Constraint
- A subtask's deadline cannot be later than the parent task's deadline
- Enforced both client-side and server-side

### Subtask Approval Chain
- When a personnel submits a subtask, it routes to their **direct supervisor** for approval
- If the supervisor is at the top layer (Layer 1), it routes to the director
- This chain is resolved automatically from the `supervisorId` on each personnel record
- If the submitter has no supervisor set, they are prompted to select one before they can proceed

### Impact on the Parent Task
- When all sibling subtasks reach APPROVED status, the parent task's assignee is notified
- The parent task is **not** automatically approved — the assignee must still submit it manually
- Subtasks in SUBMITTED status (not yet approved) do not block the parent from being submitted, but a warning is shown

### Personnel View of Subtasks
- Personnel see their subtasks in the Subtasks tab of the parent task modal
- Clicking a subtask opens it in a nested modal with a Back button returning to the parent

---

## 9. Group-Wise Tasks

Group Tasks let a director assign the **same task to multiple people simultaneously** — each person gets their own independent instance.

### Groups
- A **Task Group** is a named collection of personnel members
- Created and managed by the director from the Group Tasks page
- Members are added individually
- A group also has **Group Projects** — shared projects used when assigning group tasks

### Assigning a Group Task
1. Director selects a group from the Group Tasks page
2. Clicks "Assign Task"
3. Selects a project from the group's projects (with option to create one inline)
4. Fills in title, description, priority, and deadline
5. Submits
6. TaskWise creates one task instance per group member, all linked by a shared `groupTaskId`

### Group Monitor
- The director sees a monitor view for each group task showing all member instances
- Each row shows: member name, task status, days since assigned, last progress update
- The director can click into any individual instance to view or act on it

### Member Task History
- Director can view the full audit trail for any individual member's instance

### Close Group Task
- Director can close a group task — this cancels all non-approved instances at once

### Personnel Experience
- Each member sees only their own instance in their personal task queue
- They do not see other members' instances
- Progress logs, subtasks, comments, and updates are all per-instance and fully independent

---

## 10. Projects

All tasks must belong to a **Project**. Projects provide grouping and filtering across the system.

### Project Properties
- Name and optional colour for visual identification
- Workspace-wide by default
- Group Projects are scoped to a specific Task Group

### Project States
- **Active** — visible in task creation and filtering
- **Archived** — hidden from new task creation but all existing tasks remain accessible

### Director Views
**Project Board:** Kanban-style board for one project with columns: Pending, Assigned, In Progress, Submitted, Approved.

**Project List:** All projects with task counts per status. Clicking a project opens its task list.

### Filter Mode
When any filter is active (layer, department, person, status, date range), the project list view switches to a **flat task list** showing all matching tasks across all projects. Filter options are pruned dynamically — only values actually present in the currently filtered result set appear in the dropdowns.

---

## 11. Reports

The Reports page is director-only. All 10 tabs share a single FilterBar and update instantly (client-side filtering — no extra API calls).

| Tab | What it shows |
|-----|--------------|
| **Pending Approvals** | Tasks in SUBMITTED status, sorted by submission date |
| **Overdue** | Active tasks past their deadline, sorted oldest-deadline first |
| **Due in 7 Days** | Active tasks due within the next 7 days, colour-coded by urgency |
| **Unopened** | Tasks in ASSIGNED status that have never been opened, sorted by how long they have been sitting |
| **Sitting Longest** | Active (ASSIGNED/IN_PROGRESS) tasks sorted by days since assignment |
| **Completed** | APPROVED tasks, most recent first |
| **By Status** | Count and percentage bar chart of all tasks by status |
| **By Officer** | Each person with total/completed/pending/overdue counts; expandable to show their individual tasks |
| **By Department** | Same as By Officer but grouped by department and layer |
| **Approval Delay** | SUBMITTED tasks sorted by how many days they have been waiting for the director's approval |

Every row that contains a task is clickable — opens the full TaskDetailPanel inline where the director can approve, reject, return, or cancel.

Filter state, active tab, and scroll position are all preserved when navigating away and back to the Reports page.

---

## 12. Notifications & Broadcasts

### Push Notifications
- Browser/OS push notifications via Web Push (VAPID)
- Users grant permission during the first-login setup prompt or from their Profile page
- Delivered in the background — works even when the app is closed (PWA service worker handles it)

**Triggers:**
- Task assigned to you
- Task reassigned to you
- Task returned to you
- Your task was approved
- Your task was rejected
- A subtask you created is now complete (all siblings approved)

### In-App Notifications
- Bell icon in the header shows unread count badge
- Clicking opens a notification dropdown with recent alerts
- Each notification links to the relevant task

### Broadcasts (Director)
- Director posts a workspace-wide announcement from the Broadcasts page
- Appears as a dismissible notice at the top of every personnel's dashboard
- Each user can dismiss it individually (stored in `NoticeDismissal` table)
- Director can delete any broadcast at any time

---

## 13. Audit & History

Every state change, assignment, comment, progress note, deadline extension, and approval produces an immutable `AuditLog` entry. The History tab on every task shows the complete timeline, merged with deadline extension records, sorted chronologically.

### Audit Event Types

| Event | When it fires |
|-------|--------------|
| `TASK_CREATED` | Task first saved |
| `TASK_ASSIGNED` | Assigned to a person or department |
| `TASK_ACCEPTED` | Person accepted / auto-accepted on open |
| `TASK_REASSIGNED` | Reassigned to another person |
| `TASK_STARTED` | Moved to IN_PROGRESS |
| `TASK_UPDATED` | Title, description, or deadline edited |
| `TASK_SUBMITTED` | Submitted for approval |
| `TASK_APPROVED` | Approved by authority |
| `TASK_REJECTED` | Rejected with reason |
| `TASK_RETURNED` | Returned by assignee or director |
| `TASK_CANCELLED` | Cancelled by director |
| `TASK_DELETED` | Soft-deleted by director |
| `SUBTASK_CREATED` | Subtask created under this task |
| `COMMENT_ADDED` | Comment posted |
| `DEADLINE_EXTENDED` | Deadline extended (old→new dates, reason) |
| `ASSIGNEES_CHANGED` | Assignees added or removed (full diff, reason) |

### History Tab Rendering
- Event label + actor name + timestamp on every entry
- Reason/payload shown where applicable (return reason, rejection reason, assignee diff)
- Deadline extension entries appear in amber in the same timeline
- `ASSIGNEES_CHANGED` entries show: "+ Added: [names]", "− Removed: [names]", and the reason

### Impersonation Audit Trail
- When the Chairman acts while impersonating a personnel, the audit actor is recorded as the **Chairman** (not the target user)
- The payload includes `_impersonatedBy`, `_viewingAs`, and `_impersonationSessionId` for full traceability

### Director Audit Log Page
- Directors have a dedicated Audit Log view showing all events across all tasks in the workspace
- Useful for compliance reviews and investigations

---

## 14. Director Capabilities

### Dashboard
- Summary cards: total tasks, pending approvals count, overdue count
- Shortcut card to the Reports page
- Recent updates feed (latest progress logs across all tasks in the workspace)
- Quick access to the Approval Queue

### Approval Queue
- All SUBMITTED tasks in one place
- Click a row to open the full task detail panel
- One-click approve or reject (reject requires an optional reason)

### Task Management
- Create tasks with title, description, priority, deadline, project, and assignment target (person / department / layer)
- Edit task title, description, and deadline
- Extend deadlines on overdue tasks (if creator)
- Change assignees with subtask auto-cancel
- Reassign tasks
- Cancel tasks with a reason
- Soft-delete tasks
- Return submitted tasks (Chairman only)

### Hierarchy Manager
- Create, edit, and delete layers (up to 3)
- Create, edit, and delete departments within layers
- Add, edit, and delete personnel (name, phone, email, NIC, department)
- Set and change supervisor relationships
- View personnel by layer in an expandable tree
- Mobile: tap-to-expand cards showing contact details, NIC, supervisor, and action buttons

### Group Task Manager
- Create, edit, and delete groups
- Manage group membership
- Manage group projects
- Assign tasks to all group members at once
- Monitor all instances from a single view
- Close group tasks (cancels all non-approved instances)

### Workspace Settings
- Edit workspace name, company name, and logo
- Manage director account (name, phone, password)

### Broadcasts
- Create announcement messages visible to all personnel
- Messages are dismissible per user
- Delete broadcasts at any time

### Reports
- Full access to all 10 report tabs with global filter

### Impersonation (Chairman only)
- Access the Impersonation page to act as any personnel
- Full session history log

---

## 15. Personnel Capabilities

### Task Queue (Home)
- List of all tasks assigned to this person or their department
- Filter by status and priority
- Each task card shows: title, status, priority, project, deadline, days elapsed

### Board View
- Kanban view of personal tasks by status column
- Same tasks as the queue, different layout

### Within a Task — Available Actions

| Action | When available |
|--------|---------------|
| **Accept** | Department-assigned task in ASSIGNED status |
| **Log Progress Update** | Task is IN_PROGRESS and I am the assignee |
| **Create Subtask** | Task is ASSIGNED or IN_PROGRESS; I am assignee or creator |
| **Add Comment** | Any time |
| **Return** | Task is ASSIGNED or IN_PROGRESS; I am assignee |
| **Reassign** | Task is PENDING/ASSIGNED/IN_PROGRESS; I am assignee or creator |
| **Submit / Complete** | Task is PENDING/ASSIGNED/IN_PROGRESS; I am assignee |
| **Reopen** | Task is REJECTED; I am the assignee |
| **Extend Deadline** | Task is overdue and not approved; I am the creator |
| **Change Assignees** | Task is not APPROVED or CANCELLED; I am the creator |

### Personnel Approval Queue
- Subtasks that this person created and that are now in SUBMITTED status
- They are the approval authority for subtasks they created
- Can approve or reject each one

### Profile Page
- Edit name, email, NIC, avatar
- Change password
- Register biometric credentials (fingerprint / Face ID)
- View and delete registered credential devices
- Manage push notification subscription

---

## 16. Chairman Impersonation

The **Chairman** is a director with the `isChairman` flag set on their account. Only the Chairman can use impersonation.

### Setup
The Chairman must first set an **impersonation password** (separate from their login password) from the Impersonation page. This password is required each time a new impersonation session is started.

### Starting a Session
1. Chairman opens the Impersonation page
2. Selects a personnel from the list
3. Enters their impersonation password
4. A session token is issued for the target person's account
5. A **yellow banner** appears at the top of every screen: *"Viewing as [Name] — End Session"*

### What the Chairman Can Do While Impersonating
- Everything the target personnel can do (accept tasks, log progress, submit, create subtasks, etc.)
- Additionally: return tasks that are in SUBMITTED status (normally not allowed for personnel)
- All actions are recorded in the audit log under the **Chairman's identity** with impersonation metadata attached

### Ending a Session
- Click "End Session" in the yellow banner at any time
- Session ends cleanly and the Chairman is returned to their own account

### Session Log
- All past impersonation sessions are listed in the Impersonation page
- Each record shows: target person, start time, end time, end reason, IP address, user agent
- This is a permanent compliance record

---

## 17. Views & Navigation

### Director Views

| View Key | Description |
|----------|-------------|
| `director_dashboard` | Home: summary stats, recent updates feed, approval shortcut |
| `project_board` | Kanban board for a selected project |
| `project_list` | All projects with task counts; activating filters switches to flat task list |
| `hierarchy_manager` | Manage layers, departments, personnel, and supervisors |
| `approval_queue` | All submitted tasks awaiting approval |
| `audit_log` | Full workspace audit log |
| `overdue` | All overdue tasks |
| `recent_updates` | Latest progress logs across all tasks |
| `broadcasts` | Create and manage broadcast notices |
| `group_tasks` | Group task management, assignment, and monitoring |
| `reports` | 10-tab reports page with global filter |
| `impersonation` | Chairman only: start/end impersonation sessions |
| `settings` | Workspace settings |
| `profile` | Account settings and biometric credential management |

### Personnel Views

| View Key | Description |
|----------|-------------|
| `personnel_queue` | Home: personal task list |
| `personnel_approval_queue` | Subtasks submitted to this person for approval |
| `group_tasks` | Group task view (member's own instances only) |
| `profile` | Account settings and biometric credential management |

### Navigation Behaviours

- **Back button** appears in the header on all non-home views; clicking returns to the exact previous view
- **Scroll position** is restored when navigating back (the scroll area returns to where it was)
- **View persistence:** the last open view is stored in `localStorage` — a browser refresh restores the same page
- **Filter persistence:** filter selections are stored in `sessionStorage` — survive soft reloads within the same session

---

## 18. API Reference

All endpoints require `Authorization: Bearer <token>` unless marked **Public**.

### Authentication  `/api/auth/`

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/login` | Public | Unified login for directors and personnel |
| POST | `/director/register` | Public | Register the first director for a workspace |
| GET | `/me` | Auth | Get current user profile |
| POST | `/change-password` | Auth | Change own password |
| POST | `/impersonation-password` | Chairman | Set / update impersonation password |
| POST | `/impersonate` | Chairman | Start impersonation session |
| POST | `/impersonate/end` | Chairman | End current impersonation session |
| GET | `/impersonation/sessions` | Chairman | List all impersonation sessions |
| GET | `/webauthn/register/options` | Auth | Get WebAuthn registration challenge |
| POST | `/webauthn/register/verify` | Auth | Verify and save biometric credential |
| POST | `/webauthn/auth/options` | Public | Get authentication challenge (phone in body) |
| POST | `/webauthn/auth/verify` | Public | Verify biometric response and return JWT |
| GET | `/webauthn/credentials` | Auth | List registered devices |
| DELETE | `/webauthn/credentials/:id` | Auth | Delete a registered device |

### Tasks  `/api/tasks/`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List tasks (filterable — see params below) |
| POST | `/` | Create a task |
| GET | `/:id` | Get a single task with full detail |
| PUT | `/:id` | Update task (title, description, deadline) |
| DELETE | `/:id` | Soft-delete (Director only) |
| POST | `/:id/assign` | Assign to a person or department |
| POST | `/:id/accept` | Accept task (auto-moves to IN_PROGRESS) |
| POST | `/:id/reassign` | Reassign to another person |
| POST | `/:id/start` | Explicitly start (ASSIGNED → IN_PROGRESS) |
| POST | `/:id/submit` | Submit for approval |
| POST | `/:id/return` | Return with optional reason |
| POST | `/:id/approve` | Approve (SUBMITTED → APPROVED) |
| POST | `/:id/reject` | Reject with reason |
| POST | `/:id/reopen` | Reopen a REJECTED task |
| POST | `/:id/cancel` | Cancel (Director only) |
| POST | `/:id/change-assignees` | Add/remove assignees with reason; auto-cancels removed person's subtasks |
| GET | `/:id/subtasks` | Get direct subtasks (add `?recursive=true` for full tree) |
| GET | `/:id/comments` | Get comments |
| POST | `/:id/comments` | Post a comment |
| GET | `/:id/history` | Get audit log for this task |
| GET | `/:id/progress-logs` | Get all progress updates |
| POST | `/:id/progress-logs` | Post a progress update |
| POST | `/:id/extend-deadline` | Extend deadline (creator, when overdue) |
| GET | `/:id/deadline-extensions` | List all deadline extensions for this task |

**List tasks query params:**

| Param | Description |
|-------|-------------|
| `projectId` | Filter by project |
| `status` | Filter by status value |
| `parentTaskId=null` | Top-level tasks only |
| `parentTaskId=<id>` | Subtasks of a specific task |
| `overdue=true` | Only overdue tasks |
| `filterPersonnelId` | Tasks assigned to this person |
| `filterDepartmentId` | Tasks assigned to this department |
| `filterLayerNumber` | Tasks in this layer |
| `deadlineFrom` / `deadlineTo` | Deadline date range (ISO) |
| `createdFrom` / `createdTo` | Creation date range (ISO) |

### Task Groups  `/api/task-groups/`

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/` | Auth | List all groups |
| POST | `/` | Director | Create a group |
| GET | `/projects` | Auth | List all group projects |
| GET | `/:id` | Auth | Get group with members and projects |
| PUT | `/:id` | Director | Update group name/description |
| DELETE | `/:id` | Director | Delete group |
| POST | `/:id/members` | Director | Add a member |
| DELETE | `/:id/members/:pid` | Director | Remove a member |
| POST | `/:id/projects` | Director | Create a group project |
| POST | `/:id/assign-task` | Director | Assign task to all members |
| GET | `/:id/monitor` | Director | Get all instances for monitoring |
| GET | `/:id/tasks/:taskId/members/:memberId/history` | Director | Member task audit trail |
| POST | `/tasks/:taskId/close` | Director | Close group task (cancel all instances) |

### Other Endpoints

| Prefix | Purpose |
|--------|---------|
| `/api/workspace/` | Layers, departments, personnel CRUD; supervisor management |
| `/api/projects/` | Project CRUD, archive/unarchive |
| `/api/notices/` | Broadcasts CRUD, dismiss |
| `/api/notifications/` | List notifications, mark as read |
| `/api/audit/` | Workspace-wide audit log (Director only) |
| `/api/push/` | Register/remove push subscriptions |

---

## 19. Database Schema

### Core Models Summary

#### Director
| Field | Notes |
|-------|-------|
| `id`, `workspaceId` | Identity |
| `name`, `phone`, `passwordHash` | Login credentials |
| `isChairman` | Boolean — only Chairman can impersonate |
| `impersonationPasswordHash` | Separate password for impersonation sessions |

#### Personnel
| Field | Notes |
|-------|-------|
| `id`, `workspaceId`, `departmentId` | Belongs to one department |
| `name`, `phone`, `email`, `nic`, `avatarUrl` | Profile data |
| `supervisorId` | Self-reference → Personnel (direct manager) |
| `passwordHash`, `mustChangePassword` | Auth fields |
| `syswiseToken` | SSO token from SysWise platform |

#### Workspace / Layer / Department
- **Workspace** — top-level container for all data
- **Layer** — numbered 1–3; belongs to workspace
- **Department** — belongs to one layer; groups personnel

#### Task
| Field | Notes |
|-------|-------|
| `projectId` | Must belong to a project |
| `parentTaskId` | null = top-level; set = subtask |
| `groupTaskId` | Links all instances of a group task |
| `title`, `description`, `priority`, `status` | Core fields |
| `deadline`, `originalDeadline` | `originalDeadline` never changes after creation |
| `createdByDirectorId` / `createdByPersonnelId` | Who created it |
| `approvalById` / `approvalByType` | Who approves on submit |
| `actedById` / `actedByType` | Who last acted (accepted/submitted/etc.) |
| `startedAt`, `returnedAt`, `cancelledAt`, `deletedAt` | Timestamps |
| `returnReason`, `cancelReason` | Optional free-text |

#### TaskAssignment
Polymorphic — exactly one of `personnelId` or `departmentId` is set per row. A task can have multiple assignment rows (multi-assignee).

#### AuditLog
| Field | Notes |
|-------|-------|
| `workspaceId`, `taskId` | Scope |
| `event` | Event type string (see Section 13) |
| `actorType`, `actorDirectorId`, `actorPersonnelId` | Who did it |
| `payload` | JSON — event-specific data (reason, names, diff) |
| `createdAt` | Immutable timestamp |

#### DeadlineExtension
| Field | Notes |
|-------|-------|
| `taskId` | Linked task |
| `oldDeadline`, `newDeadline` | Before and after |
| `reason`, `note` | Why and additional context |
| `extendedById`, `extendedByType`, `extendedByName` | Who extended |

#### Other Models
| Model | Purpose |
|-------|---------|
| `TaskProgressLog` | Dated progress notes with author |
| `TaskComment` | Discussion comments |
| `Notification` | In-app + push notification records |
| `Notice` | Broadcast messages from director |
| `NoticeDismissal` | Per-user dismissal tracking |
| `PushSubscription` | Web Push subscription objects per device |
| `WebAuthnCredential` | FIDO2 passkeys per device (public key, counter, device name) |
| `ImpersonationSession` | Full log of all impersonation sessions |
| `TaskGroup` / `TaskGroupMember` / `TaskGroupProject` | Group task infrastructure |
| `Project` | Task grouping container |

---

## 20. Deployment

### Prerequisites
- SSH alias `syswise-hetzner` configured in `~/.ssh/config`
- Push access to `github.com/dasunyasantha-netizen/Taskwise`
- All changes committed and pushed to `main`

### Deploy Command

```bash
bash deploy.sh
```

### What deploy.sh Does, Step by Step

| Step | Action |
|------|--------|
| 1 | Verify git working tree is clean (no uncommitted changes) |
| 2 | Verify local `HEAD` matches `origin/main` (nothing unpushed) |
| 3 | Stamp `public/sw.js` with current git SHA (`__CACHE_VERSION__` → actual SHA) |
| 4 | Build frontend locally (`npm run build`) — catches errors before touching production |
| 5 | SSH to server: `git reset --hard origin/main` |
| 6 | `npm install` (frontend + backend dependencies) |
| 7 | `npx prisma generate` (rebuild Prisma client binary after any schema changes) |
| 8 | `npx prisma migrate deploy` (run pending migrations) |
| 9 | `npm run build` (frontend build on server with stamped SW) |
| 10 | `pm2 restart taskwise-backend` |
| 11 | Health check ping to confirm the server responds |

### Mandatory Rules
1. **Never deploy by SCP or direct file copy.** All deploys must go through GitHub.
2. **Always commit and push to `main` before deploying.** The script enforces this.
3. **Never restart PM2 manually** without rebuilding first.

### Cache Strategy

| Resource | Cache-Control | Reason |
|----------|--------------|--------|
| `/taskwise/assets/*` | `public, immutable, 1 year` | Content-hashed filenames — safe to cache forever |
| `index.html`, `sw.js`, `registerSW.js`, `manifest.webmanifest` | `no-cache, no-store` | Always fetched fresh so the new SW is detected immediately |

On every deploy, `sw.js` contains a new git SHA as `CACHE_VERSION`. Since nginx serves it with `no-cache`, every device re-fetches it on the next visit. The new SHA triggers `skipWaiting()` and the activate handler deletes all stale `workbox-*` caches — so users always have the latest build even if they installed the PWA months ago.

### Rollback

```bash
# See recent commits on production
ssh syswise-hetzner "cd /var/www/taskwise && git log --oneline -5"

# Roll back to a specific commit
ssh syswise-hetzner "cd /var/www/taskwise && git reset --hard <sha> && npm run build && pm2 restart taskwise-backend"
```

---

*Documentation written June 2026. For changes after this date, see `git log` in the `taskwise-local` repository.*
