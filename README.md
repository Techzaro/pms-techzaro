# PMS Techxaro

## Project Summary

This repository implements a Project Management System (PMS) for Techxaro.
It consists of a backend API built with Laravel and a frontend dashboard built with React.

## Architecture

- `backend/`: Laravel application that provides REST API endpoints.
- `frontend/`: React application that provides the frontend user interface.

## What the project does

- User authentication with login, logout, and password change.
- Role-based access for `admin`, `manager`, `teamlead`, and `member` users.
- Team management with team creation, leader assignment, and member assignment.
- Project management with create, update, view, patch, and delete operations.
- Task management inside projects with task creation and deletion.
- Project details include milestones, files, activities, assigned members, and progress calculation.

## Key backend relationships

- `User` is the authenticated user entity.
- `Team` can have many `User` members and one team leader.
- `Project` belongs to a `Team` and to a user as the creator.
- `Project` has many `Task`, `ProjectMilestone`, `ProjectFile`, and `ProjectActivity` records.
- `Task` belongs to a `Project` and can be assigned to a `User`.
- `ProjectMilestone` tracks project milestones and sort order.
- `ProjectActivity` stores activity logs for a project.

## Key frontend structure

- `src/App.jsx`: Main router definition for public and protected pages.
- `src/main.jsx`: Application entry point that renders the React app.
- `src/components/ProtectedRoute.jsx`: Guards protected routes and redirects unauthenticated users.
- `src/pages/`: Contains page components for login, dashboards, projects, tasks, team management, and profile.

## How the parts relate

- Frontend sends requests to backend APIs under `backend/routes/api.php`.
- Backend validates requests, applies role middleware, and returns JSON responses.
- Frontend stores the authentication token in `localStorage` and uses it to protect routes.
- Project detail pages request rich project data from the backend and use model relationships to show related tasks, milestones, files, and team members.

## Notes

- Use the backend folder to run Laravel commands and install PHP dependencies.
- Use the frontend folder to run React build and install JavaScript dependencies.
- The code is designed to make the system easy to extend with new user roles, teams, and project management features.
