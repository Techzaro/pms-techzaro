/**
 * @file App.jsx
 * @description Main application component with routing configuration.
 * Defines all routes with role-based access control and lazy-loaded page components.
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { useLocation } from "react-router-dom";
import LoadingSpinner from "./components/LoadingSpinner";

// Lazy-loaded page components for code splitting
const Login = lazy(() => import("./pages/Login"));
const Admin = lazy(() => import("./pages/Admin"));
const Manager = lazy(() => import("./pages/Manager"));
const TeamLead = lazy(() => import("./pages/TeamLead"));
const Member = lazy(() => import("./pages/Member"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Taskby = lazy(() => import("./pages/Taskby"));
const SelfTasks = lazy(() => import("./pages/SelfTasks"));
const Projects = lazy(() => import("./pages/Projects"));
const CreateProject = lazy(() => import("./pages/CreateProject"));
const ProjectDetails = lazy(() => import("./pages/ProjectDetails"));
const ManageUsers = lazy(() => import("./pages/ManageUsers"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const MyProfile = lazy(() => import("./pages/MyProfile"));
const Deliveries = lazy(() => import("./pages/Deliveries"));
const DeliveriesByYou = lazy(() => import("./pages/DeliveriesByYou"));
const History = lazy(() => import("./pages/History"));
const Reports = lazy(() => import("./pages/Reports"));
const ManageTeam = lazy(() => import("./pages/ManageTeam"));
const TaskDetails = lazy(() => import("./pages/TaskDetails"));
const DeliverableDetails = lazy(() => import("./pages/DeliverableDetails"));
const SelfDeliveries = lazy(() => import("./pages/SelfDeliveries"));
const Calender = lazy(() => import("./pages/Calender"));
const Notifications = lazy(() => import("./pages/Notifications"));
const UserPerformance = lazy(() => import("./pages/UserPerformance"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

// Route protection components
import ProtectedRoute from "./components/ProtectedRoute";
import RoleProtectedRoute from "./components/RoleProtectedRoute";

/**
 * Main App component with routing.
 * @returns {JSX.Element} Application with routes
 */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Dashboard routes - role-specific */}
          <Route path="/:role/dashboard" element={<RoleProtectedRoute><Admin /></RoleProtectedRoute>} />

          {/* Task routes */}
          <Route path="/:role/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
          <Route path="/:role/taskby" element={<ProtectedRoute><Taskby /></ProtectedRoute>} />
          <Route path="/:role/self-tasks" element={<ProtectedRoute><SelfTasks /></ProtectedRoute>} />
          <Route path="/:role/tasks/task-details/:taskId" element={<ProtectedRoute><TaskDetails /></ProtectedRoute>} />

          {/* Project routes */}
          <Route path="/:role/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
          <Route path="/:role/create-project" element={<ProtectedRoute><CreateProject /></ProtectedRoute>} />
          <Route path="/:role/projects/project-details/:projectId" element={<ProtectedRoute><ProjectDetails /></ProtectedRoute>} />

          {/* Deliverable routes */}
          <Route path="/:role/deliveries" element={<ProtectedRoute><Deliveries /></ProtectedRoute>} />
          <Route path="/:role/deliveries-by-you" element={<ProtectedRoute><DeliveriesByYou /></ProtectedRoute>} />
          <Route path="/:role/self-deliveries" element={<ProtectedRoute><SelfDeliveries /></ProtectedRoute>} />
          <Route path="/:role/deliveries/deliverable-details/:deliverable" element={<ProtectedRoute><DeliverableDetails /></ProtectedRoute>} />

          {/* Admin/Manager only routes */}
          <Route path="/:role/manage-users" element={<RoleProtectedRoute allowedRoles={["admin", "manager"]}><ManageUsers /></RoleProtectedRoute>} />
          <Route path="/:role/manage-users/user-profile/:userId" element={<RoleProtectedRoute allowedRoles={["admin", "manager"]}><UserProfile /></RoleProtectedRoute>} />
          <Route path="/:role/manage-team" element={<RoleProtectedRoute allowedRoles={["admin", "manager"]}><ManageTeam /></RoleProtectedRoute>} />

          {/* Other protected routes */}
          <Route path="/:role/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
          <Route path="/:role/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/:role/team-members-report" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/:role/my-profile" element={<ProtectedRoute><MyProfile /></ProtectedRoute>} />
          <Route path="/:role/calender" element={<ProtectedRoute><Calender /></ProtectedRoute>} />
          <Route path="/:role/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          <Route path="/:role/reports/user-performance/:userId" element={<ProtectedRoute><UserPerformance /></ProtectedRoute>} />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
