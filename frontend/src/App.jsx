/**
 * Main React application router.
 * All routes follow /:role/page-name pattern.
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Admin from "./pages/Admin";
import Manager from "./pages/Manager";
import TeamLead from "./pages/TeamLead";
import Member from "./pages/Member";
import Tasks from "./pages/Tasks";
import Taskby from "./pages/Taskby";
import Projects from "./pages/Projects";
import CreateProject from "./pages/CreateProject";
import ProjectDetails from "./pages/ProjectDetails";
import ManageUsers from "./pages/ManageUsers";
import UserProfile from "./pages/UserProfile";
import MyProfile from "./pages/MyProfile";
import Deliveries from "./pages/Deliveries";
import History from "./pages/History";
import Reports from "./pages/Reports";
import ManageTeam from "./pages/ManageTeam";

import ProtectedRoute from "./components/ProtectedRoute";
import RoleProtectedRoute from "./components/RoleProtectedRoute";
import TaskDetails from "./pages/TaskDetails";
import DeliverableDetails from "./pages/DeliverableDetails";
import Calender from "./pages/Calender";
import UserPerformance from "./pages/UserPerformance";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* PUBLIC */}
        <Route path="/" element={<Login />} />

        {/* DASHBOARD - role specific */}
        <Route
          path="/:role/dashboard"
          element={
            <RoleProtectedRoute>
              <Admin />
            </RoleProtectedRoute>
          }
        />

        {/* TASKS */}
        <Route
          path="/:role/tasks"
          element={
            <ProtectedRoute>
              <Tasks />
            </ProtectedRoute>
          }
        />

        {/* TASK BY */}
        <Route
          path="/:role/taskby"
          element={
            <ProtectedRoute>
              <Taskby />
            </ProtectedRoute>
          }
        />

        {/* PROJECTS */}
        <Route
          path="/:role/projects"
          element={
            <ProtectedRoute>
              <Projects />
            </ProtectedRoute>
          }
        />

        {/* CREATE PROJECT */}
        <Route
          path="/:role/create-project"
          element={
            <ProtectedRoute>
              <CreateProject />
            </ProtectedRoute>
          }
        />

        {/* PROJECT DETAILS */}
        <Route
          path="/:role/projects/project-details/:projectId"
          element={
            <ProtectedRoute>
              <ProjectDetails />
            </ProtectedRoute>
          }
        />

        {/* DELIVERIES */}
        <Route
          path="/:role/deliveries"
          element={
            <ProtectedRoute>
              <Deliveries />
            </ProtectedRoute>
          }
        />

        {/* DELIVERABLE DETAILS */}
        <Route
          path="/:role/deliveries/deliverable-details/:projectId"
          element={
            <ProtectedRoute>
              <DeliverableDetails />
            </ProtectedRoute>
          }
        />

        {/* TASK DETAILS */}
        <Route
          path="/:role/tasks/task-details/:taskId"
          element={
            <ProtectedRoute>
              <TaskDetails />
            </ProtectedRoute>
          }
        />

        {/* HISTORY */}
        <Route
          path="/:role/history"
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          }
        />

        {/* REPORTS */}
        <Route
          path="/:role/reports"
          element={
            <ProtectedRoute>
              <Reports />
            </ProtectedRoute>
          }
        />

        {/* MANAGE USERS */}
        <Route
          path="/:role/manage-users"
          element={
            <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
              <ManageUsers />
            </RoleProtectedRoute>
          }
        />

        {/* USER PROFILE */}
        <Route
          path="/:role/manage-users/user-profile/:userId"
          element={
            <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
              <UserProfile />
            </RoleProtectedRoute>
          }
        />

        {/* MY PROFILE */}
        <Route
          path="/:role/my-profile"
          element={
            <ProtectedRoute>
              <MyProfile />
            </ProtectedRoute>
          }
        />

        {/* MANAGE TEAM */}
        <Route
          path="/:role/manage-team"
          element={
            <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
              <ManageTeam />
            </RoleProtectedRoute>
          }
        />

        {/* CALENDAR */}
        <Route
          path="/:role/calender"
          element={
            <ProtectedRoute>
              <Calender />
            </ProtectedRoute>
          }
        />

        {/* USER PERFORMANCE */}
        <Route
          path="/:role/reports/user-performance/:userId"
          element={
            <ProtectedRoute>
              <UserPerformance />
            </ProtectedRoute>
          }
        />

        {/* CATCH ALL */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;
