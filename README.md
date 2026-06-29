# Techxaro PMS — Project Management System

> A full-stack project management platform built for **Techxaro** to manage projects, tasks, deliverables, teams, employees, and performance — all in one place.

---

## Live Demo

| | URL |
|---|---|
| **Frontend** | [https://newpms.techxaro.com](https://newpms.techxaro.com) |
| **Backend API** | [https://newpms.api.techxaro.com](https://newpms.api.techxaro.com) |

> Click the frontend link above to access the login page directly.

---

## Source Code

| | Link |
|---|---|
| **GitHub Repository** | [https://github.com/Techzaro/pms-techzaro](https://github.com/Techzaro/pms-techzaro) |

```bash
git clone https://github.com/Techzaro/pms-techzaro.git
```

---

## Table of Contents

- [Overview](#overview)
- [Why This Project Exists](#why-this-project-exists)
- [Key Benefits](#key-benefits)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Roles and Permissions](#roles-and-permissions)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Frontend Pages](#frontend-pages)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

**Techxaro PMS** is a comprehensive internal project management system designed to streamline how teams plan, execute, track, and deliver projects. It provides role-based dashboards for **Admin**, **Manager**, **Team Lead**, and **Member** — each with tailored views and capabilities.

The system covers the full project lifecycle:

```
Project Creation → Task Assignment → Deliverable Tracking → Submission Workflow → Approval/Rejection/Reopening → Performance Reporting
```

It also includes real-time notifications, a unified calendar, employee profile management, PDF report exports, and activity logging — making it a complete operational backbone for the company.

---

## Why This Project Exists

Before this system, teams relied on scattered tools — spreadsheets, chat apps, and manual follow-ups. This caused:

- Lost task ownership and unclear responsibilities
- No visibility into who is working on what
- Missed deadlines with no tracking mechanism
- No centralized record of project progress or employee performance

**Techxaro PMS** solves all of this by providing a single platform where:

- Every project, task, and deliverable has a clear owner
- Workflows enforce quality through submit → approve → reject → reopen cycles
- Managers get real-time visibility into team performance
- Employees can track their own tasks and submissions
- Activity logs provide a complete audit trail

---

## Key Benefits

| Benefit | Description |
|---|---|
| **Centralized Management** | Projects, tasks, deliverables, teams, and employees — everything in one platform. |
| **Role-Based Access Control** | Admin, Manager, Team Lead, and Member each see only what's relevant to them. |
| **Workflow Enforcement** | Submit → Approve → Reject → Reopen cycles ensure quality before completion. |
| **Real-Time Notifications** | In-app alerts + Firebase push notifications keep everyone updated instantly. |
| **Performance Tracking** | Team performance reports, user analytics, and activity dashboards. |
| **Unified Calendar** | Tasks, projects, deliverables, and events — all on one calendar view. |
| **Audit Trail** | Every change to projects, tasks, and deliverables is logged with who did what and when. |
| **PDF Export** | Generate professional PDF reports for team performance and project summaries. |
| **Mobile Responsive** | Fully responsive UI works on desktop, tablet, and mobile devices. |
| **Employee Management** | Full HR profiles with documents, salary info, emergency contacts, and employment history. |

---

## Features

### Authentication and User Management
- Secure login with email and password (Laravel Sanctum token-based)
- First-time password change enforcement for new users
- Per-tab session isolation — multiple roles can coexist in different browser tabs
- Password change with token revocation for security
- Session expiration detection with auto-redirect to login
- Cross-tab session synchronization (login from one tab affects others)

### Project Management
- Create, edit, delete projects with full metadata (title, description, goals, client, budget, priority, deadlines)
- Project goals with interactive checklist
- Milestones with sort ordering and status tracking
- File and link attachments per project
- Project visibility control — Admin/Manager can show/hide projects to specific users
- Project submission workflow (submit → approve → reject → reopen with instructions)
- Change tracking with unread indicators for assigned users
- Activity logs per project
- Automatic deliverable creation from projects

### Task Management
- Create tasks within projects or as standalone tasks
- Multi-user task assignment via junction table
- Task assignment tracking (who assigned to whom)
- Task status workflow: pending → submitted → approved → rejected → reopened
- File and link attachments per task
- Task reordering via drag-and-drop
- Personal user notes on tasks (private per user)
- Task submission with file uploads and comments
- "My Tasks", "Assigned by Me", "Self Tasks" filtered views
- Due today, approved, pending, submitted, reopened, rejected status filters

### Deliverables Management
- Create deliverables within projects or under tasks
- Assign to team members with due dates
- Submit → approve → reject → reopen workflow
- Self-approve / self-rework for personal deliverables
- Deliverable file attachments and submission history
- Reorderable deliverable lists

### Team Management
- Create and manage teams with descriptions
- Assign team leaders
- Add/remove team members
- Team-based project visibility

### Dashboard
- Role-specific dashboards with summary cards:
  - Active Projects count
  - Tasks Due Today
  - Approved Tasks
  - Pending Tasks
- Today's workload with assignee avatars and priority badges
- Active projects carousel with animated progress bars
- Today's activity feed with action icons and timestamps
- Expandable past activity history grouped by date

### Calendar
- Unified calendar view (Month, Week, Day)
- Events from tasks, projects, deliverables, and custom events
- Event creation with types: Meeting, Training, Workshop, Client Meeting, Company Event, Holiday, Interview, Project Milestone, Internship Activity, Other
- Color-coded event types
- Day popup with detailed event listing

### Notifications
- In-app notification center with unread count badge
- 20+ notification types covering all workflow actions
- Push notifications via Firebase Cloud Messaging (FCM)
- Device token management for push delivery
- Email preference settings

### Reports and Analytics
- Team performance reports with per-member stats
- Summary reports with interactive cards
- Detailed performance reports
- Individual user performance tracking
- Project-level reports
- Company-wide employee reports
- PDF export with styled tables, stat cards, and timelines (jsPDF + autoTable)

### Employee Profile Management
- Full profile with 40+ fields (personal, contact, employment, bank, documents)
- Document uploads (employment contract, offer letter, CV, education cert, etc.)
- Login history tracking
- Account status and age info
- Task and project statistics per employee

### Other Features
- Responsive sidebar navigation (collapsible on mobile)
- Right sidebar with quick activity/events view
- Breadcrumb navigation on all pages
- Loading spinners and skeleton states
- Toast notifications (success, error, warning, info)
- Drag-and-drop sortable tables and lists
- Rich text editor (Quill) for descriptions
- PDF report generation with professional styling
- Global fetch interceptor for session management and auto-notifications
- Event bus for cross-component communication
- React Query for server state caching and refetching

---

## Tech Stack

### Backend

| Technology | Version | Purpose |
|---|---|---|
| PHP | 8.2+ | Server-side language |
| Laravel | 12.x | PHP framework with MVC architecture |
| Laravel Sanctum | 4.3 | API token authentication |
| MySQL | 5.7+ / 8.0+ | Relational database |
| Composer | — | PHP dependency manager |

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 19.x | UI library with component-based architecture |
| React Router | 7.x | Client-side routing with role-based paths |
| Vite | 8.x | Build tool and dev server |
| Tailwind CSS | 4.x | Utility-first CSS framework |
| Tanstack React Query | 5.x | Server state management and caching |
| React Icons | 5.x | Icon library (Material Design, etc.) |
| Lucide React | 1.x | Additional icon set |
| Quill | 2.x | Rich text editor for descriptions |
| jsPDF + autoTable | — | PDF report generation |
| @dnd-kit | — | Drag-and-drop for sortable lists |
| Firebase | 12.x | Push notifications via FCM |
| Bootstrap | 5.x | Additional UI components |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      FRONTEND                           │
│              React 19 + Vite + Tailwind CSS              │
│                                                         │
│  ┌──────────┐  ┌────────────┐  ┌────────────────────┐  │
│  │  Pages    │  │ Components │  │ Hooks / Utils /    │  │
│  │ (25+)     │  │ (30+)      │  │ Context / Lib      │  │
│  └─────┬─────┘  └─────┬──────┘  └─────────┬──────────┘  │
│        └───────────────┴───────────────────┘             │
│                          │                               │
│                   HTTP (fetch + Bearer token)            │
└──────────────────────────┼──────────────────────────────┘
                           │
                      REST API (JSON)
                           │
┌──────────────────────────┼──────────────────────────────┐
│                      BACKEND                            │
│              Laravel 12 + Sanctum + MySQL                │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Routes (api.php — 80+ endpoints)                │   │
│  ├─────────────────────────────────────────────────┤   │
│  │  Middleware (Auth + Role)                         │   │
│  ├─────────────────────────────────────────────────┤   │
│  │  Controllers (14) → Services (2) → Models (27)   │   │
│  ├─────────────────────────────────────────────────┤   │
│  │  MySQL Database (60+ migrations)                 │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Request Flow

1. User interacts with React frontend
2. Frontend sends HTTP request with `Authorization: Bearer <token>` header
3. Laravel routes the request through `auth:sanctum` middleware
4. Role-based middleware checks user permissions
5. Controller processes the request, interacts with Models and Services
6. JSON response returned to frontend
7. React Query caches the response
8. Toast notification auto-displayed based on response

---

## Roles and Permissions

| Feature | Admin | Manager | Team Lead | Member |
|---|---|---|---|---|
| Dashboard | Full | Full | Team View | Own View |
| Projects | Full CRUD | Full CRUD | View + Submit | View |
| Tasks | Full CRUD | Full CRUD | View + Submit | View + Submit |
| Deliverables | Full CRUD | Full CRUD | Create + Approve | View + Submit |
| Reports | Full | Full | View (Team) | View (Own) |
| User Management | Full CRUD | Full CRUD | View | — |
| Team Management | Full CRUD | Full CRUD | View | — |
| Employee Profiles | Full | Full | View | View (Own) |
| Calendar | Full | Full | Full | Full |
| Notifications | Full | Full | Full | Full |

---

## Getting Started

### Prerequisites

- PHP 8.2 or higher
- Node.js 18 or higher
- MySQL 5.7+ or 8.0+
- Composer
- npm or yarn

### Clone the Repository

```bash
git clone https://github.com/Techzaro/pms-techzaro.git
cd pms-techzaro
```

### Backend Setup

```bash
cd backend

# Install PHP dependencies
composer install

# Copy environment file
cp .env.example .env

# Generate application key
php artisan key:generate

# Configure your database in .env file, then run:
php artisan migrate

# Create storage symlink
php artisan storage:link

# Start the development server
php artisan serve
```

The API will be available at `http://localhost:8000/api`.

### Frontend Setup

```bash
cd frontend

# Install Node dependencies
npm install

# Create .env file
echo "VITE_API_URL=http://localhost:8000/api" > .env

# Start development server
npm run dev
```

The frontend will be available at `http://localhost:5173`.

### Quick Setup (All-in-One)

```bash
cd backend
composer setup
```

This runs: `composer install` → `.env` copy → `key:generate` → `migrate` → `npm install` → `npm run build`

### Full Dev Mode (Backend)

```bash
cd backend
composer dev
```

Starts concurrently: Laravel server + Queue worker + Logs (Pail) + Vite dev server.

---

## Environment Variables

### Backend (`.env`)

```env
APP_NAME="PMS Techxaro"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:8000

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=pms
DB_USERNAME=root
DB_PASSWORD=

MAIL_MAILER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password
MAIL_ENCRYPTION=tls

FRONTEND_URL=http://localhost:5173
SANCTUM_STATEFUL_DOMAINS=localhost:5173
SANCTUM_TOKEN_EXPIRATION=1440
```

### Frontend (`.env`)

```env
VITE_API_URL=http://localhost:8000/api

# Firebase (for push notifications)
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_VAPID_KEY=your-vapid-key
```

---

## Project Structure

### Backend (`backend/`)

```
backend/
├── app/
│   ├── Console/                    # Artisan commands
│   ├── Http/
│   │   ├── Controllers/            # 14 API controllers
│   │   │   ├── AuthController.php          # Login, logout, profile, password
│   │   │   ├── UserController.php          # User CRUD, documents, resignation
│   │   │   ├── ProjectController.php       # Project CRUD, workflow, visibility
│   │   │   ├── TaskController.php          # Task CRUD, workflow, reordering
│   │   │   ├── DeliverableController.php   # Deliverable CRUD, workflow
│   │   │   ├── TeamController.php          # Team CRUD, leader/members
│   │   │   ├── DashboardController.php     # Dashboard summary data
│   │   │   ├── ReportController.php        # Reports and analytics
│   │   │   ├── EventController.php         # Calendar events
│   │   │   ├── NotificationController.php  # Notifications
│   │   │   ├── DeviceTokenController.php   # Push notification tokens
│   │   │   ├── ActivityController.php      # Activity logs
│   │   │   └── TaskUserNoteController.php  # Private notes on tasks
│   │   └── Middleware/
│   │       └── RoleMiddleware.php          # Role-based access control
│   ├── Jobs/                       # Queued jobs
│   ├── Mail/                       # Email templates
│   ├── Models/                     # 27 Eloquent models
│   ├── Notifications/              # Notification classes
│   ├── Providers/                  # Service providers
│   └── Services/
│       ├── NotificationService.php # Notification creation and management
│       └── ActivityService.php     # Activity logging
├── config/                         # Configuration files
├── database/
│   ├── migrations/                 # 60+ migration files
│   └── seeders/                    # Database seeders
├── routes/
│   └── api.php                     # API route definitions (270 lines)
├── storage/                        # File storage (uploads)
├── tests/                          # PHPUnit tests
├── .env.example                    # Environment template
├── composer.json                   # PHP dependencies
└── vite.config.js                  # Vite configuration
```

### Frontend (`frontend/`)

```
frontend/
├── src/
│   ├── components/
│   │   ├── layout/                 # Layout components
│   │   │   ├── DashboardLayout.jsx # Main dashboard wrapper
│   │   │   ├── Header.jsx          # Top navigation header
│   │   │   ├── Sidebar.jsx         # Left sidebar navigation
│   │   │   └── RightSidebar.jsx    # Right sidebar (activity/events)
│   │   ├── Breadcrumb.jsx          # Breadcrumb navigation
│   │   ├── ProtectedRoute.jsx      # Auth guard
│   │   ├── RoleProtectedRoute.jsx  # Role-based route guard
│   │   ├── Pagination.jsx          # Paginated lists
│   │   ├── Toast.jsx               # Toast notification component
│   │   ├── Event.jsx               # Calendar event component
│   │   ├── EventInfoPopup.jsx      # Event info popup
│   │   ├── ItemDetailPopup.jsx     # Item detail popup
│   │   ├── DayPopup.jsx            # Calendar day popup
│   │   ├── LoadingSpinner.jsx      # Loading spinner
│   │   └── Modal components        # Submit*, View*, Reopen* modals
│   ├── config/
│   │   └── api.js                  # API URL + global fetch interceptor
│   ├── context/
│   │   ├── NotificationContext.jsx # Toast notification provider
│   │   └── LoadingContext.jsx      # Loading state provider
│   ├── hooks/
│   │   ├── useApi.js               # React Query hooks (useApiQuery, useApiMutation)
│   │   ├── useCalendarData.js      # Calendar data fetching
│   │   ├── useRefreshOnEvent.js    # Auto-refresh on events
│   │   ├── useRelativeTime.js      # Live relative time updates
│   │   ├── useUnifiedSummary.js    # Unified calendar summary
│   │   ├── useBreadcrumb.js        # Breadcrumb generation
│   │   └── useDragReorder.js       # Drag-and-drop reordering
│   ├── lib/
│   │   ├── api.js                  # HTTP client with auth headers
│   │   └── queryClient.js          # React Query client config
│   ├── pages/                      # 25+ page components
│   ├── utils/
│   │   ├── auth.js                 # Auth helpers (token, role, session)
│   │   ├── firebase.js             # Firebase/FCM initialization
│   │   ├── formatDateTime.js       # Date formatting utilities
│   │   ├── notify.js               # Global toast notification API
│   │   ├── eventBus.js             # Publish-subscribe event bus
│   │   ├── pdfUtils.js             # PDF generation utilities
│   │   ├── browserNotification.js  # Browser native notifications
│   │   ├── loadingManager.js       # Global loading state
│   │   └── useRefreshOnEvent.js    # Event-based data refresh
│   ├── data/
│   │   └── dashboardMock.js        # Mock dashboard data
│   ├── App.jsx                     # Router definitions (69 routes)
│   ├── main.jsx                    # Application entry point
│   └── index.css                   # Global styles
├── package.json                    # Node dependencies
├── tailwind.config.js              # Tailwind CSS config
├── vite.config.js                  # Vite build config
└── eslint.config.js                # ESLint config
```

---

## Database Schema

The backend uses **60+ migration files** creating the following key tables:

### Core Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `users` | User accounts | name, email, password, role, active, must_change_password, 30+ profile fields |
| `teams` | Teams | name, description, leader_id |
| `team_user` | Team membership pivot | team_id, user_id |
| `projects` | Projects | title, description, goals, client_name, budget, priority, status, assigned_users (JSON), team_id, created_by |
| `tasks` | Tasks | title, description, status, assigned_to, assigned_by, project_id, sort_order, requirements |
| `deliverables` | Deliverables | title, description, status, assigned_to, created_by, project_id, task_id, due_date, sort_order |
| `events` | Calendar events | title, type, start_date, end_date, all_day, description |

### Workflow Tables

| Table | Purpose |
|---|---|
| `project_submissions` | Project submission history with files and comments |
| `task_submissions` | Task submission history with files and comments |
| `deliverable_submissions` | Deliverable submission history with files and comments |
| `project_workflow_events` | Project workflow audit trail (created, submitted, approved, rejected, reopened) |
| `task_workflow_events` | Task workflow audit trail |
| `deliverable_workflow_events` | Deliverable workflow audit trail |
| `project_changes` | Field-level change tracking for projects |
| `task_changes` | Field-level change tracking for tasks |
| `deliverable_changes` | Field-level change tracking for deliverables |

### Supporting Tables

| Table | Purpose |
|---|---|
| `project_milestones` | Project milestones with sort ordering |
| `project_files` | Project file/link attachments |
| `task_files` | Task file/link attachments |
| `project_activities` | Project activity logs |
| `project_visibility` | Per-user project visibility control |
| `project_notebooks` | Project notebooks |
| `submission_attachments` | File attachments for submissions |
| `task_user_notes` | Private user notes on tasks |
| `notifications` | In-app notifications |
| `user_device_tokens` | Firebase FCM device tokens |
| `user_email_preferences` | Email notification preferences |
| `activities` | Global activity log |
| `events` | Calendar events |
| `event_users` | Event-user pivot table |

---

## API Reference

The backend exposes **80+ REST API endpoints** under `/api/`. All protected routes require a `Bearer` token in the `Authorization` header.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/login` | Login and get token |
| POST | `/api/logout` | Revoke current token |
| GET | `/api/user` | Get authenticated user |
| GET | `/api/auth/my-profile` | Full profile with stats |
| POST | `/api/auth/update-profile` | Update own profile |
| PUT | `/api/user/change-password` | Change password |
| PUT | `/api/user/first-time-change-password` | First-time password change |

### Dashboard

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/dashboard` | Dashboard summary data |

### User Management (admin, manager)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users` | List all users |
| POST | `/api/users` | Create user |
| GET | `/api/users/{user}` | Get user details |
| PUT | `/api/users/{user}` | Update user |
| DELETE | `/api/users/{user}` | Delete user |
| PUT | `/api/users/{user}/resign` | Mark user as resigned |
| GET | `/api/users/{id}/profile` | Full user profile with stats |
| POST | `/api/users/reorder` | Reorder users |

### Team Management (admin, manager)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/teams` | List all teams |
| POST | `/api/teams` | Create team |
| GET | `/api/teams/{team}` | Get team details |
| PUT | `/api/teams/{team}` | Update team |
| PUT | `/api/teams/{team}/leader` | Set team leader |
| POST | `/api/teams/{team}/members` | Add member |
| DELETE | `/api/teams/{team}/members/{user}` | Remove member |
| DELETE | `/api/teams/{team}` | Delete team |

### Projects

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/projects` | List projects (filtered by visibility) |
| POST | `/api/projects` | Create project (admin, manager) |
| GET | `/api/projects/{project}` | Get project with all relations |
| PUT | `/api/projects/{project}` | Update project |
| PATCH | `/api/projects/{project}` | Partial update (notes, checklist, status) |
| DELETE | `/api/projects/{project}` | Delete project |
| POST | `/api/projects/{project}/submit` | Submit for review |
| POST | `/api/projects/{project}/approve` | Approve project |
| POST | `/api/projects/{project}/reject` | Reject project |
| POST | `/api/projects/{project}/reopen` | Reopen for revision |
| POST | `/api/projects/{project}/complete` | Mark as completed |
| POST | `/api/projects/{project}/files` | Upload file |
| POST | `/api/projects/{project}/links` | Add link |
| DELETE | `/api/projects/{project}/files/{file}` | Delete file |
| GET | `/api/projects/{project}/visibility` | Get visibility settings |
| POST | `/api/projects/{project}/visibility` | Update visibility |

### Tasks

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/tasks` | Create standalone task |
| POST | `/api/projects/{project}/tasks` | Create task in project |
| GET | `/api/tasks/{task}` | Get task details |
| PUT | `/api/tasks/{task}` | Update task |
| DELETE | `/api/tasks/{task}` | Delete task |
| PATCH | `/api/tasks/{task}/status` | Update status |
| POST | `/api/tasks/{task}/submit` | Submit task |
| POST | `/api/tasks/{task}/approve` | Approve task |
| POST | `/api/tasks/{task}/reject` | Reject task |
| POST | `/api/tasks/{task}/reopen` | Reopen task |
| POST | `/api/tasks/{task}/complete` | Mark as completed |
| POST | `/api/tasks/{task}/files` | Upload file |
| POST | `/api/tasks/{task}/links` | Add link |
| DELETE | `/api/tasks/{task}/files/{file}` | Delete file |
| GET | `/api/tasks/{task}/my-note` | Get personal note |
| POST | `/api/tasks/{task}/my-note` | Save personal note |
| DELETE | `/api/tasks/{task}/my-note/{note}` | Delete personal note |
| GET | `/api/my-tasks` | Tasks assigned to me |
| GET | `/api/assigned-tasks` | Tasks I assigned |
| GET | `/api/self-tasks` | Tasks I created |
| POST | `/api/tasks/reorder` | Reorder tasks |

### Deliverables

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/deliverables` | List my deliverables |
| GET | `/api/deliverables/assigned-by-me` | Deliverables I assigned |
| GET | `/api/self-deliverables` | Self-created deliverables |
| POST | `/api/projects/{project}/deliverables` | Create deliverable |
| PUT | `/api/deliverables/{deliverable}` | Update deliverable |
| DELETE | `/api/deliverables/{deliverable}` | Delete deliverable |
| POST | `/api/deliverables/{deliverable}/submit` | Submit deliverable |
| POST | `/api/deliverables/{deliverable}/approve` | Approve deliverable |
| POST | `/api/deliverables/{deliverable}/reject` | Reject deliverable |
| POST | `/api/deliverables/{deliverable}/reopen` | Reopen deliverable |
| POST | `/api/deliverables/{deliverable}/self-approve` | Self-approve |
| POST | `/api/deliverables/{deliverable}/self-rework` | Self-rework |
| POST | `/api/deliverables/reorder` | Reorder deliverables |

### Reports

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/reports/team-performance` | Team performance stats |
| GET | `/api/reports/summary` | Summary report |
| GET | `/api/reports/detailed` | Detailed report |
| GET | `/api/reports/performance` | Performance report |
| GET | `/api/reports/progress` | Progress report |
| GET | `/api/reports/user/{user}` | User performance |
| GET | `/api/reports/project/{project}` | Project report |
| GET | `/api/reports/summary-cards` | Summary cards |
| GET | `/api/reports/user-performance-table` | User performance table |
| GET | `/api/reports/company-employees` | Company employee report |

### Calendar and Events

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/events` | List events |
| GET | `/api/events/{event}` | Get event |
| POST | `/api/events` | Create event |
| PUT | `/api/events/{event}` | Update event |
| DELETE | `/api/events/{event}` | Delete event |
| GET | `/api/unified-calendar` | Unified calendar (tasks + projects + deliverables + events) |
| GET | `/api/unified-summary` | Unified summary |

### Notifications

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/notifications` | List notifications |
| GET | `/api/notifications/unread-count` | Unread count |
| POST | `/api/notifications/{notification}/read` | Mark as read |
| POST | `/api/notifications/read-all` | Mark all as read |

### Device Tokens (Push Notifications)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/device-tokens` | Register device token |
| DELETE | `/api/device-tokens` | Remove device token |

### Activities

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/activities/today` | Today's activities |
| GET | `/api/activities/past` | Past activities |
| GET | `/api/activities` | All activities |

---

## Frontend Pages

| Page | Route | Description |
|---|---|---|
| Login | `/` | User authentication with first-time password change |
| Dashboard | `/:role/dashboard` | Role-specific dashboard with summary cards and activity |
| Projects | `/:role/projects` | List all projects with filters and search |
| Create Project | `/:role/create-project` | Project creation form with milestones and deliverables |
| Project Details | `/:role/projects/project-details/:id` | Full project view with tasks, deliverables, submissions, activity |
| Tasks | `/:role/tasks` | My assigned tasks (excluding self-assigned) |
| Tasks by Me | `/:role/taskby` | Tasks I assigned to others |
| Self Tasks | `/:role/self-tasks` | Tasks I created for myself |
| Task Details | `/:role/tasks/task-details/:id` | Full task view with submissions and workflow |
| Deliveries | `/:role/deliveries` | My assigned deliverables |
| Deliveries by You | `/:role/deliveries-by-you` | Deliverables I assigned |
| Self Deliveries | `/:role/self-deliveries` | Self-created deliverables |
| Deliverable Details | `/:role/deliveries/deliverable-details/:id` | Full deliverable view |
| Reports | `/:role/reports` | Performance reports with filters |
| User Performance | `/:role/reports/user-performance/:id` | Individual user performance |
| Company Employee Report | `/:role/reports` | Company-wide employee report |
| Manage Users | `/:role/manage-users` | User management (admin, manager only) |
| User Profile | `/:role/manage-users/user-profile/:id` | User profile with stats and documents |
| My Profile | `/:role/my-profile` | Own profile page |
| Manage Team | `/:role/manage-team` | Team management (admin, manager only) |
| Calendar | `/:role/calender` | Calendar with month/week/day views |
| Notifications | `/:role/notifications` | Notification center |
| History | `/:role/history` | Activity history |

---

## Deployment

The application is hosted on **HostArmada cPanel** hosting:

| Component | URL | Hosting |
|---|---|---|
| **Frontend** | [https://newpms.techxaro.com](https://newpms.techxaro.com) | HostArmada cPanel (static build) |
| **Backend API** | [https://newpms.api.techxaro.com](https://newpms.api.techxaro.com) | HostArmada cPanel (Laravel) |

### Deployment Steps

**Backend (cPanel):**
1. Run `npm run build` and `composer install --optimize-autoloader --no-dev` locally
2. Upload the entire `backend/` folder to cPanel's `public_html` or subdomain
3. Point the document root to `backend/public/`
4. Configure `.htaccess` for URL rewriting (already included)
5. Set up MySQL database via cPanel and update `.env`
6. Run `php artisan migrate --force` via SSH or cPanel terminal

**Frontend (cPanel):**
1. Run `npm run build` locally
2. Upload the `dist/` folder contents to cPanel's public directory
3. Add `.htaccess` for SPA routing (already included in `public/`)

---

## Contributing

1. Fork the repository from [GitHub](https://github.com/Techzaro/pms-techzaro)
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is proprietary to **Techxaro**. All rights reserved.
