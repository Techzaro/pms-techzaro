/**
 * Main React application router.
 * Defines public and protected routes for different user roles.
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";

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
import Deliveries from "./pages/Deliveries";
import Details from "./pages/Details";
import History from "./pages/History";
import Reports from "./pages/Reports";
import ManageTeam from "./pages/ManageTeam";
import DeliverableDetails from "./pages/DeliverableDetails"; // file name exactly

import ProtectedRoute from "./components/ProtectedRoute";
import TaskDetails from "./pages/TaskDetails";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* PUBLIC */}

        <Route path="/" element={<Login />} />

        {/* ADMIN */}

        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Admin />
            </ProtectedRoute>
          }
        />

        {/* MANAGER */}

        <Route
          path="/manager"
          element={
            <ProtectedRoute>
              <Manager />
            </ProtectedRoute>
          }
        />

        {/* TEAM LEAD */}

        <Route
          path="/teamlead"
          element={
            <ProtectedRoute>
              <TeamLead />
            </ProtectedRoute>
          }
        />

        {/* MEMBER */}

        <Route
          path="/member"
          element={
            <ProtectedRoute>
              <Member />
            </ProtectedRoute>
          }
        />

        {/* TASKS */}

        <Route
          path="/tasks"
          element={
            <ProtectedRoute>
              <Tasks />
            </ProtectedRoute>
          }
        />

        {/* TASK BY */}

        <Route
          path="/taskby"
          element={
            <ProtectedRoute>
              <Taskby />
            </ProtectedRoute>
          }
        />
        {/* TASK Details */}

        <Route
          path="/taskdetails"
          element={
            <ProtectedRoute>
              <TaskDetails/>
            </ProtectedRoute>
          }
        />

     

        {/* PROJECTS */}

        <Route
          path="/projects"
          element={
            <ProtectedRoute>
              <Projects />
            </ProtectedRoute>
          }
        />

        {/* CREATE PROJECT */}

        <Route
          path="/create-project"
          element={
            <ProtectedRoute>
              <CreateProject />
            </ProtectedRoute>
          }
        />

        {/* PROJECT DETAILS */}

        <Route
          path="/projects/:projectId"
          element={
            <ProtectedRoute>
              <ProjectDetails />
            </ProtectedRoute>
          }
        />

        {/* DELIVERIES */}

        <Route
          path="/deliveries"
          element={
            <ProtectedRoute>
              <Deliveries />
            </ProtectedRoute>
          }
        />

        {/* DETAILS */}

        <Route
          path="/details"
          element={
            <ProtectedRoute>
              <Details />
            </ProtectedRoute>
          }
        />

        <Route
          path="/details/:taskId"
          element={
            <ProtectedRoute>
              <TaskDetails />
            </ProtectedRoute>
          }
        />

        {/* HISTORY */}

        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          }
        />

        {/* REPORTS */}

        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <Reports />
            </ProtectedRoute>
          }
        />

        {/* MANAGE USERS */}

        <Route
          path="/manage-users"
          element={
            <ProtectedRoute>
              <ManageUsers />
            </ProtectedRoute>
          }
        />

        {/* MANAGE TEAM */}

        <Route
          path="/manage-team"
          element={
            <ProtectedRoute>
              <ManageTeam />
            </ProtectedRoute>
          }
        />

<Route
  path="/deliverable/:taskId"
  element={
    <ProtectedRoute>
      <DeliverableDetails />
    </ProtectedRoute>
  }
/>

      </Routes>
    </BrowserRouter>
  );
}

export default App;