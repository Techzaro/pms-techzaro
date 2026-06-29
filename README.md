# Techxaro PMS — Project Management System

A full-stack web application designed to manage projects, tasks, deliverables, teams, and employee performance for **Techxaro**. Built with **Laravel 12** (backend API) and **React 19** (frontend dashboard).

---

## Table of Contents

- [Overview](#overview)
- [Key Benefits](#key-benefits)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Roles & Permissions](#roles--permissions)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Database Models](#database-models)
- [API Routes](#api-routes)
- [Frontend Pages](#frontend-pages)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

**Techxaro PMS** is a comprehensive project management system that streamlines how teams plan, execute, and track projects. It provides role-based dashboards for admins, managers, team leads, and members — each with tailored views and capabilities.

The system covers the full project lifecycle: from project creation and task assignment to deliverable tracking, submission workflows, approval/rejection cycles, performance reporting, and real-time notifications.

---

## Key Benefits

| Benefit | Description |
|---|---|
| **Centralized Management** | All projects, tasks, deliverables, and team activities in one platform. |
| **Role-Based Access** | Admin, Manager, Team Lead, and Member each see only what's relevant to them. |
| **Workflow Automation** | Submit → Approve → Reject → Reopen cycles for projects, tasks, and deliverables. |
| **Real-Time Notifications** | Push notifications (Firebase FCM) and in-app alerts keep everyone updated. |
| **Performance Tracking** | Reports, team performance metrics, and user activity tracking. |
| **Calendar Integration** | Unified calendar view for tasks, projects, deliverables, and events. |
| **Mobile Responsive** | Fully responsive UI works on desktop, tablet, and mobile. |
| **Audit Trail** | Complete activity logs and change tracking for every project, task, and deliverable. |

---

## Features

### Authentication & User Management
- Secure login with email/password (Laravel Sanctum tokens)
- First-time password change enforcement for new users
- Per-tab session isolation (multiple roles can coexist in different tabs)
- User CRUD with profile management, documents, and resignation handling
- User reordering (drag-and-drop)

### Project Management
- Create, edit, delete projects with full metadata (client, budget, priority, deadlines, description)
- Project milestones with checklist and sort ordering
- File/link attachments per project
- Project visibility control (admin/manager can show/hide projects to specific users)
- Project submission workflow (submit → approve → reject → reopen)
- Change tracking with unread indicators
- Activity logs per project

### Task Management
- Create tasks within projects or as standalone tasks
- Task assignment to one or more users
- Task status tracking (pending → submitted → approved → rejected → reopened)
- Task file/link attachments
- Task reordering via drag-and-drop
- Personal user notes on tasks (private per user)
- Task submission workflow with file uploads and comments
- "Assigned by me", "My tasks", "Self tasks" views

### Deliverables Management
- Create deliverables within projects
- Assign to team members
- Submit → approve → reject → reopen workflow
- Self-approve / self-rework for personal deliverables
- Deliverable file attachments and submission history

### Team Management
- Create and manage teams
- Assign team leaders
- Add/remove team members
- Team descriptions

### Dashboard
- Role-specific dashboards with summary cards (Active Projects, Tasks Due Today, Approved Tasks, Pending Tasks)
- Today's workload with assignee avatars and priority badges
- Active projects carousel with progress bars
- Today's activity feed with action icons and timestamps
- Expandable past activity history

### Calendar
- Unified calendar view (Month, Week, Day)
- Events from tasks, projects, deliverables, and custom events
- Event creation with types: Meeting, Training, Workshop, Client Meeting, Holiday, etc.
- Color-coded event types
- Day popup with detailed event listing

### Notifications
- In-app notification center with unread count badge
- Notification types: project assigned/updated/submitted/approved/rejected/reopened, task assigned/updated/submitted/completed, deliverable assigned/updated/submitted, event created/updated/cancelled
- Push notifications via Firebase Cloud Messaging (FCM)
- Device token management
- Email preference settings

### Reports & Analytics
- Team performance reports
- Summary reports with cards
- Detailed performance reports
- User performance tracking
- Project-level reports
- Company employee reports
- Export to PDF (jsPDF + autoTable)

### Other Features
- Responsive sidebar navigation (collapsible on mobile)
- Right sidebar with activity/events quick view
- Breadcrumb navigation
- Loading spinners and skeleton states
- Toast notifications
- Drag-and-drop sortable tables
- Rich text editor (Quill) for descriptions
- PDF export for reports

---

## Tech Stack

### Backend
| Technology | Version | Purpose |
|---|---|---|
| **PHP** | 8.2+ | Server-side language |
| **Laravel** | 12.x | PHP framework |
| **Laravel Sanctum** | 4.3 | API token authentication |
| **MySQL** | — | Database |
| **Composer** | — | PHP dependency manager |

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| **React** | 19.x | UI library |
| **React Router** | 7.x | Client-side routing |
| **Vite** | 8.x | Build tool & dev server |
| **Tailwind CSS** | 4.x | Utility-first CSS framework |
| **Tanstack React Query** | 5.x | Server state management & caching |
| **React Icons** | 5.x | Icon library |
| **Lucide React** | 1.x | Additional icons |
| **Quill** | 2.x | Rich text editor |
| **jsPDF + autoTable** | — | PDF report generation |
| **@dnd-kit** | — | Drag-and-drop functionality |
| **Firebase** | 12.x | Push notifications (FCM) |
| **Bootstrap** | 5.x | Additional UI components |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│  React 19 + Vite + Tailwind CSS                 │
│  ┌─────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Pages   │  │Components│  │  Context/Hooks │  │
│  └────┬─────┘  └─────┬────┘  └───────┬───────┘  │
│       └───────────────┴───────────────┘          │
│                        │                         │
│                   API calls (fetch)              │
└────────────────────────┼────────────────────────┘
                         │
                    HTTP / JSON
                         │
┌────────────────────────┼────────────────────────┐
│                   Backend                        │
│  Laravel 12 + Sanctum                           │
│  ┌─────────────────────────────────────┐        │
│  │  Routes (api.php)                    │        │
│  ├─────────────────────────────────────┤        │
│  │  Controllers → Services → Models     │        │
│  ├─────────────────────────────────────┤        │
│  │  Middleware (Auth, Role)              │        │
│  ├─────────────────────────────────────┤        │
│  │  MySQL Database                      │        │
│  └─────────────────────────────────────┘        │
└─────────────────────────────────────────────────┘
```

---

## Roles & Permissions

| Role | Dashboard | Projects | Tasks | Deliverables | Reports | Users | Teams |
|---|---|---|---|---|---|---|---|
| **Admin** | Full | Full CRUD | Full CRUD | Full CRUD | Full | Full CRUD | Full CRUD |
| **Manager** | Full | Full CRUD | Full CRUD | Full CRUD | Full | Full CRUD | Full CRUD |
| **Team Lead** | Team View | View + Submit | View + Submit | Create + Approve | View | View | View |
| **Member** | Own View | View | View + Submit | View + Submit | View | — | — |

---

## Getting Started

### Prerequisites

- PHP 8.2+
- Node.js 18+
- MySQL 5.7+ or 8.0+
- Composer
- npm or yarn

### Backend Setup

```bash
cd backend

# Install PHP dependencies
composer install

# Copy environment file
cp .env.example .env

# Generate application key
php artisan key:generate

# Configure database in .env
DB_DATABASE=pms
DB_USERNAME=root
DB_PASSWORD=

# Run migrations
php artisan migrate

# (Optional) Seed database
php artisan db:seed

# Start the development server
php artisan serve
```

### Frontend Setup

```bash
cd frontend

# Install Node dependencies
npm install

# Create .env file with API URL
echo "VITE_API_URL=http://localhost:8000/api" > .env

# Start development server
npm run dev
```

### Quick Setup (Backend)

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

This starts: Laravel server + Queue worker + Logs (Pail) + Vite dev server concurrently.

---

## Project Structure

### Backend (`backend/`)

```
backend/
├── app/
│   ├── Console/              # Artisan commands
│   ├── Http/
│   │   ├── Controllers/     # API controllers (14 controllers)
│   │   ├── Middleware/       # Role middleware
│   │   └── Requests/        # Form request validation
│   ├── Jobs/                 # Queued jobs
│   ├── Mail/                 # Email templates
│   ├── Models/               # Eloquent models (27 models)
│   ├── Notifications/        # Notification classes
│   ├── Providers/            # Service providers
│   └── Services/             # Business logic services
├── config/                   # Configuration files
├── database/
│   ├── migrations/           # Database migrations (60+ files)
│   └── seeders/              # Database seeders
├── routes/
│   └── api.php               # API route definitions
├── storage/                  # File storage
├── tests/                    # PHPUnit tests
├── .env.example              # Environment template
├── composer.json             # PHP dependencies
└── vite.config.js            # Vite configuration
```

### Frontend (`frontend/`)

```
frontend/
├── src/
│   ├── components/
│   │   ├── layout/           # DashboardLayout, Header, Sidebar, RightSidebar
│   │   ├── Breadcrumb.jsx
│   │   ├── ProtectedRoute.jsx
│   │   ├── RoleProtectedRoute.jsx
│   │   ├── Modal components (Submit*, View*, Reopen*)
│   │   ├── Toast.jsx
│   │   └── Pagination.jsx
│   ├── config/
│   │   └── api.js            # API base URL
│   ├── context/
│   │   ├── NotificationContext.jsx
│   │   └── LoadingContext.jsx
│   ├── data/
│   │   └── dashboardMock.js  # Mock data
│   ├── hooks/
│   │   ├── useApi.js         # React Query integration
│   │   ├── useCalendarData.js
│   │   ├── useRefreshOnEvent.js
│   │   ├── useRelativeTime.js
│   │   └── useUnifiedSummary.js
│   ├── lib/
│   │   ├── api.js            # API client
│   │   └── queryClient.js    # React Query client
│   ├── pages/                # Page components (25+ pages)
│   ├── utils/
│   │   ├── auth.js           # Auth & role helpers
│   │   ├── firebase.js       # Firebase/FCM init
│   │   ├── formatDateTime.js # Date formatting
│   │   ├── notify.js         # Toast notifications
│   │   ├── eventBus.js       # Event pub/sub
│   │   ├── pdfUtils.js       # PDF generation
│   │   └── browserNotification.js
│   ├── App.jsx               # Router definitions
│   ├── main.jsx              # Entry point
│   └── index.css             # Global styles
├── package.json              # Node dependencies
├── tailwind.config.js        # Tailwind config
├── vite.config.js            # Vite config
└── eslint.config.js          # ESLint config
```

---

## Database Models

The backend uses **27 Eloquent models** with the following key relationships:

| Model | Purpose | Key Relationships |
|---|---|---|
| `User` | User accounts | Has many Tasks, Projects, Teams, Deliverables, Notifications |
| `Team` | Teams | Belongs to User (leader), Many-to-many with Users |
| `Project` | Projects | Belongs to Team & User (creator), Has many Tasks, Deliverables, Milestones, Files, Activities |
| `Task` | Tasks | Belongs to Project & User (assignee/creator), Has many Submissions, Files, Changes |
| `Deliverable` | Deliverables | Belongs to Project & User, Has many Submissions, Changes |
| `ProjectMilestone` | Project milestones | Belongs to Project |
| `ProjectActivity` | Project activity logs | Belongs to Project |
| `ProjectFile` | Project file attachments | Belongs to Project |
| `ProjectSubmission` | Project submission history | Belongs to Project |
| `TaskSubmission` | Task submission history | Belongs to Task |
| `DeliverableSubmission` | Deliverable submission history | Belongs to Deliverable |
| `Event` | Calendar events | Many-to-many with Users |
| `Notification` | In-app notifications | Belongs to User |
| `Activity` | Global activity logs | — |
| `TaskUserNote` | Private notes on tasks | Belongs to Task & User |

---

## API Routes

### Public Routes
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/login` | User login |

### Protected Routes (require Bearer token)

#### Authentication
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/logout` | User logout |
| GET | `/api/user` | Get authenticated user |
| GET | `/api/auth/my-profile` | Get own profile |
| POST | `/api/auth/update-profile` | Update own profile |
| PUT | `/api/user/change-password` | Change password |
| PUT | `/api/user/first-time-change-password` | First-time password change |

#### Dashboard
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/dashboard` | Get dashboard data |

#### User Management (admin, manager)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users` | List users |
| POST | `/api/users` | Create user |
| GET | `/api/users/{user}` | Get user |
| PUT | `/api/users/{user}` | Update user |
| DELETE | `/api/users/{user}` | Delete user |

#### Team Management (admin, manager)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/teams` | List teams |
| POST | `/api/teams` | Create team |
| PUT | `/api/teams/{team}` | Update team |
| PUT | `/api/teams/{team}/leader` | Set team leader |
| POST | `/api/teams/{team}/members` | Add member |
| DELETE | `/api/teams/{team}/members/{user}` | Remove member |

#### Projects
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create project (admin, manager) |
| GET | `/api/projects/{project}` | Get project details |
| PUT | `/api/projects/{project}` | Update project (admin, manager) |
| DELETE | `/api/projects/{project}` | Delete project (admin, manager) |
| POST | `/api/projects/{project}/submit` | Submit project |
| POST | `/api/projects/{project}/approve` | Approve project |
| POST | `/api/projects/{project}/reject` | Reject project |
| POST | `/api/projects/{project}/reopen` | Reopen project |

#### Tasks
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/tasks` | Create standalone task |
| POST | `/api/projects/{project}/tasks` | Create task in project |
| GET | `/api/tasks/{task}` | Get task details |
| PUT | `/api/tasks/{task}` | Update task |
| DELETE | `/api/tasks/{task}` | Delete task |
| POST | `/api/tasks/{task}/submit` | Submit task |
| POST | `/api/tasks/{task}/approve` | Approve task |
| POST | `/api/tasks/{task}/reject` | Reject task |
| POST | `/api/tasks/{task}/reopen` | Reopen task |
| GET | `/api/my-tasks` | Get assigned tasks |
| GET | `/api/assigned-tasks` | Get tasks assigned by me |
| GET | `/api/self-tasks` | Get self-created tasks |

#### Deliverables
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/deliverables` | List deliverables |
| POST | `/api/projects/{project}/deliverables` | Create deliverable |
| PUT | `/api/deliverables/{deliverable}` | Update deliverable |
| POST | `/api/deliverables/{deliverable}/submit` | Submit deliverable |
| POST | `/api/deliverables/{deliverable}/approve` | Approve deliverable |
| POST | `/api/deliverables/{deliverable}/reject` | Reject deliverable |

#### Reports
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/reports/team-performance` | Team performance |
| GET | `/api/reports/summary` | Summary report |
| GET | `/api/reports/detailed` | Detailed report |
| GET | `/api/reports/user/{user}` | User performance |
| GET | `/api/reports/project/{project}` | Project report |
| GET | `/api/reports/company-employees` | Company employee report |

#### Calendar & Events
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/events` | List events |
| POST | `/api/events` | Create event |
| PUT | `/api/events/{event}` | Update event |
| DELETE | `/api/events/{event}` | Delete event |
| GET | `/api/unified-calendar` | Unified calendar view |

#### Notifications
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/notifications` | List notifications |
| GET | `/api/notifications/unread-count` | Unread count |
| POST | `/api/notifications/{notification}/read` | Mark as read |
| POST | `/api/notifications/read-all` | Mark all as read |

---

## Frontend Pages

| Page | Path | Description |
|---|---|---|
| Login | `/` | User authentication |
| Dashboard | `/:role/dashboard` | Role-specific dashboard |
| Projects | `/:role/projects` | List all projects |
| Create Project | `/:role/create-project` | Project creation form |
| Project Details | `/:role/projects/project-details/:id` | Detailed project view |
| Tasks | `/:role/tasks` | My assigned tasks |
| Tasks by Me | `/:role/taskby` | Tasks assigned by me |
| Self Tasks | `/:role/self-tasks` | Tasks I created |
| Task Details | `/:role/tasks/task-details/:id` | Detailed task view |
| Deliveries | `/:role/deliveries` | My assigned deliverables |
| Deliveries by You | `/:role/deliveries-by-you` | Deliverables assigned by me |
| Self Deliveries | `/:role/self-deliveries` | My self-created deliverables |
| Deliverable Details | `/:role/deliveries/deliverable-details/:id` | Detailed deliverable view |
| Reports | `/:role/reports` | Performance reports |
| User Performance | `/:role/reports/user-performance/:id` | Individual user performance |
| Manage Users | `/:role/manage-users` | User management (admin, manager) |
| User Profile | `/:role/manage-users/user-profile/:id` | View/edit user profile |
| My Profile | `/:role/my-profile` | Own profile page |
| Manage Team | `/:role/manage-team` | Team management (admin, manager) |
| Calendar | `/:role/calender` | Calendar & events view |
| Notifications | `/:role/notifications` | Notification center |
| History | `/:role/history` | Activity history |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is proprietary to **Techxaro**. All rights reserved.
