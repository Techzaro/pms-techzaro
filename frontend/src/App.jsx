/**
 * @file App.jsx
 * @description Main application component with routing configuration.
 * Defines all routes with role-based access control and lazy-loaded page components.
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy, useEffect, useState, Component } from "react";
import { useLocation } from "react-router-dom";
import LoadingSpinner from "./components/LoadingSpinner";
import { useInactivityTimeout } from "./utils/useInactivityTimeout";
import { useTheme } from "./context/ThemeContext";

// Lazy-loaded page components for code splitting
const Login = lazy(() => import("./pages/Login"));
const Admin = lazy(() => import("./pages/Admin"));

// Super Admin lazy-loaded pages
const SuperAdminLayout = lazy(() => import("./pages/super-admin/layouts/SuperAdminLayout"));
const SuperDashboard = lazy(() => import("./pages/super-admin/DashboardPage"));
const SuperOrganizations = lazy(() => import("./pages/super-admin/OrganizationsPage"));
const SuperOrganizationDetail = lazy(() => import("./pages/super-admin/OrganizationDetailPage"));
const SuperPlans = lazy(() => import("./pages/super-admin/PlansPage"));
const SuperModules = lazy(() => import("./pages/super-admin/ModulesPage"));
const SuperDomains = lazy(() => import("./pages/super-admin/DomainsPage"));
const SuperHealth = lazy(() => import("./pages/super-admin/SystemHealthPage"));
const SuperActivity = lazy(() => import("./pages/super-admin/ActivityLogsPage"));
const SuperSettings = lazy(() => import("./pages/super-admin/SettingsPage"));
const SuperMyProfile = lazy(() => import("./pages/super-admin/SuperAdminMyProfile"));
const SuperNotifications = lazy(() => import("./pages/super-admin/SuperAdminNotifications"));
const BrandingPage = lazy(() => import("./pages/BrandingPage"));
const SubscriptionPage = lazy(() => import("./pages/SubscriptionPage"));
const RegisterOrganization = lazy(() => import("./pages/super-admin/RegisterOrganization"));
const Manager = lazy(() => import("./pages/Manager"));
const TeamLead = lazy(() => import("./pages/TeamLead"));
const Member = lazy(() => import("./pages/Member"));
const Tasks = lazy(() => import("./pages/Tasks"));
const GuestTasks = lazy(() => import("./pages/GuestTasks"));
const Taskby = lazy(() => import("./pages/Taskby"));
const SelfTasks = lazy(() => import("./pages/SelfTasks"));
const AllTasks = lazy(() => import("./pages/AllTasks"));
const Projects = lazy(() => import("./pages/Projects"));
const CreateProject = lazy(() => import("./pages/CreateProject"));
const ProjectDetails = lazy(() => import("./pages/ProjectDetails"));
const ManageUsers = lazy(() => import("./pages/ManageUsers"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const MyProfile = lazy(() => import("./pages/MyProfile"));
const Deliveries = lazy(() => import("./pages/Deliveries"));
const DeliveriesByYou = lazy(() => import("./pages/DeliveriesByYou"));
const AllDeliveries = lazy(() => import("./pages/AllDeliveries"));
const History = lazy(() => import("./pages/History"));
const Reports = lazy(() => import("./pages/Reports"));
const ManageTeam = lazy(() => import("./pages/ManageTeam"));
const MemberTeam = lazy(() => import("./pages/MemberTeam"));
const TaskDetails = lazy(() => import("./pages/TaskDetails"));
const SubtaskDetails = lazy(() => import("./pages/DeliverableDetails"));
const SelfDeliveries = lazy(() => import("./pages/SelfDeliveries"));
const Calender = lazy(() => import("./pages/Calender"));
const Notifications = lazy(() => import("./pages/Notifications"));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const UserPerformance = lazy(() => import("./pages/UserPerformance"));
const TeamMembersReport = lazy(() => import("./pages/TeamMembersReport"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const LoggedOut = lazy(() => import("./pages/LoggedOut"));
const Chat = lazy(() => import("./pages/Chat"));
const DraftCenter = lazy(() => import("./pages/DraftCenter"));
const Templates = lazy(() => import("./pages/Templates"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));

import { authToken } from "./utils/auth";

// Route protection components
import ProtectedRoute from "./components/ProtectedRoute";
import RoleProtectedRoute from "./components/RoleProtectedRoute";

class ErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { console.error('Page error:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
          <h2 style={{ marginBottom: 12 }}>Something went wrong</h2>
          <p style={{ color: '#666', marginBottom: 16 }}>Please try refreshing the page.</p>
          <button onClick={() => { this.setState({ hasError: false }); window.location.reload(); }} style={{ padding: '8px 24px', cursor: 'pointer' }}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    const el = document.querySelector('.main-layout');
    if (el) el.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/**
 * AuthSecurityGuard - Global session & history security monitor.
 * Detects browser Back button, BFCache restoration, popstate, and visibility changes.
 * Immediately ejects unauthenticated sessions and replaces history to prevent back-navigation.
 */
function AuthSecurityGuard({ children }) {
  const location = useLocation();

  useEffect(() => {
    const verifySession = () => {
      const currentPath = window.location.pathname;
      const publicPaths = ["/", "/login", "/logged-out", "/forgot-password", "/reset-password"];
      const isPublic = publicPaths.includes(currentPath);

      if (!isPublic && !authToken()) {
        try {
          window.history.replaceState(null, "", "/");
        } catch {}
        window.location.replace("/?message=" + encodeURIComponent("Session expired. Please log in."));
      }
    };

    // 1. Check BFCache (pageshow event when restored via browser Back/Forward button)
    const handlePageShow = (e) => {
      if (e.persisted || (window.performance && window.performance.getEntriesByType("navigation")[0]?.type === "back_forward")) {
        verifySession();
      }
    };

    // 2. Check history popstate navigation
    const handlePopState = () => {
      verifySession();
    };

    // 3. Check visibility change (tab focus)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        verifySession();
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Initial route check
    verifySession();

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [location.pathname]);

  return children;
function SuperAdminWrapper() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return <SuperAdminLayout isDark={isDark} toggleTheme={toggleTheme} />;
}

function App() {
  useInactivityTimeout();

  return (
    <BrowserRouter>
      <AuthSecurityGuard>
        <ScrollToTop />
        <ErrorBoundary>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Login />} />
              <Route path="/login" element={<Login />} />
              <Route path="/logged-out" element={<LoggedOut />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Dashboard routes - role-specific */}
              <Route path="/:role/dashboard" element={<RoleProtectedRoute><Admin /></RoleProtectedRoute>} />
      <ScrollToTop />
      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Login />} />
            <Route path="/logged-out" element={<LoggedOut />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {/* <Route path="/register-organization" element={<RegisterOrganization />} /> */}

            {/* Dashboard routes - role-specific */}
            <Route path="/:role/dashboard" element={<RoleProtectedRoute><Admin /></RoleProtectedRoute>} />

            {/* Task routes */}
            <Route path="/:role/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
            <Route path="/:role/guest-tasks" element={<ProtectedRoute><GuestTasks /></ProtectedRoute>} />
            <Route path="/:role/taskby" element={<ProtectedRoute><Taskby /></ProtectedRoute>} />
            <Route path="/:role/self-tasks" element={<ProtectedRoute><SelfTasks /></ProtectedRoute>} />
            <Route path="/:role/all-tasks" element={<ProtectedRoute><AllTasks /></ProtectedRoute>} />
            <Route path="/:role/tasks/task-details/:taskId" element={<ProtectedRoute><TaskDetails /></ProtectedRoute>} />

            {/* Project routes */}
            <Route path="/:role/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
            <Route path="/:role/create-project" element={<ProtectedRoute><CreateProject /></ProtectedRoute>} />
            <Route path="/:role/projects/project-details/:projectId" element={<ProtectedRoute><ProjectDetails /></ProtectedRoute>} />

            {/* Subtask routes */}
            <Route path="/:role/deliveries" element={<ProtectedRoute><Deliveries /></ProtectedRoute>} />
            <Route path="/:role/deliveries-by-you" element={<ProtectedRoute><DeliveriesByYou /></ProtectedRoute>} />
            <Route path="/:role/self-deliveries" element={<ProtectedRoute><SelfDeliveries /></ProtectedRoute>} />
            <Route path="/:role/all-deliverables" element={<ProtectedRoute><AllDeliveries /></ProtectedRoute>} />
            <Route path="/:role/deliveries/deliverable-details/:deliverable" element={<ProtectedRoute><SubtaskDetails /></ProtectedRoute>} />

            {/* Admin/Manager only routes */}
            <Route path="/:role/manage-users" element={<RoleProtectedRoute allowedRoles={["admin", "manager"]}><ManageUsers /></RoleProtectedRoute>} />
            <Route path="/:role/manage-users/user-profile/:userId" element={<RoleProtectedRoute allowedRoles={["admin", "manager"]}><UserProfile /></RoleProtectedRoute>} />
            <Route path="/:role/manage-team" element={<RoleProtectedRoute allowedRoles={["admin", "manager"]}><ManageTeam /></RoleProtectedRoute>} />

            {/* Member/Team Lead: read-only team view */}
            <Route path="/:role/my-team" element={<ProtectedRoute><MemberTeam /></ProtectedRoute>} />

            {/* Other protected routes */}
            <Route path="/:role/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
            <Route path="/:role/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/:role/team-members-report" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/:role/my-profile" element={<ProtectedRoute><MyProfile /></ProtectedRoute>} />
            <Route path="/:role/calender" element={<ProtectedRoute><Calender /></ProtectedRoute>} />
            <Route path="/:role/drafts" element={<ProtectedRoute><DraftCenter /></ProtectedRoute>} />
            <Route path="/:role/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
            <Route path="/:role/knowledge-base" element={<ProtectedRoute><KnowledgeBase /></ProtectedRoute>} />
            <Route path="/:role/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
            <Route path="/:role/settings/notifications" element={<ProtectedRoute><NotificationSettings /></ProtectedRoute>} />
            <Route path="/:role/audit-logs" element={<RoleProtectedRoute allowedRoles={["admin", "manager"]}><AuditLogs /></RoleProtectedRoute>} />
            <Route path="/:role/branding" element={<RoleProtectedRoute allowedRoles={["admin"]}><BrandingPage /></RoleProtectedRoute>} />
            <Route path="/:role/subscription" element={<RoleProtectedRoute allowedRoles={["admin"]}><SubscriptionPage /></RoleProtectedRoute>} />
            <Route path="/:role/reports/user-performance/:userId" element={<ProtectedRoute><UserPerformance /></ProtectedRoute>} />
            <Route path="/:role/reports/team-members/:teamId" element={<ProtectedRoute><TeamMembersReport /></ProtectedRoute>} />
            <Route path="/:role/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
            <Route path="/:role/chat/:conversationId" element={<ProtectedRoute><Chat /></ProtectedRoute>} />

            {/* Super Admin routes */}
            <Route path="/super-admin" element={<SuperAdminWrapper />}>
              <Route index element={<SuperDashboard />} />
              <Route path="organizations" element={<SuperOrganizations />} />
              <Route path="organizations/:id" element={<SuperOrganizationDetail />} />
              <Route path="plans" element={<SuperPlans />} />
              <Route path="modules" element={<SuperModules />} />
              <Route path="domains" element={<SuperDomains />} />
              <Route path="health" element={<SuperHealth />} />
              <Route path="activity" element={<SuperActivity />} />
              <Route path="notifications" element={<SuperNotifications />} />
              <Route path="settings" element={<SuperSettings />} />
              <Route path="my-profile" element={<SuperMyProfile />} />
            </Route>

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AuthSecurityGuard>
  </BrowserRouter>
  );
}

export default App;