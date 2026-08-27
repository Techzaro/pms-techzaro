/**
 * @file App.jsx
 * @description Main application component with routing configuration.
 * Defines all routes with role-based access control and lazy-loaded page components.
 */

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import { Suspense, lazy, useEffect, Component } from "react";
import { useLocation } from "react-router-dom";
import LoadingSpinner from "./components/LoadingSpinner";
import { useInactivityTimeout } from "./utils/useInactivityTimeout";
import { useTheme } from "./context/ThemeContext";

// Lazy-loaded page components for code splitting
const Login = lazy(() => import("./pages/Login"));
const Admin = lazy(() => import("./pages/Admin"));
const SuperAdminLayout = lazy(
  () => import("./pages/super-admin/layouts/SuperAdminLayout"),
);
const SuperDashboard = lazy(() => import("./pages/super-admin/DashboardPage"));
const SuperOrganizations = lazy(
  () => import("./pages/super-admin/OrganizationsPage"),
);
const SuperOrganizationDetail = lazy(
  () => import("./pages/super-admin/OrganizationDetailPage"),
);
const SuperPlans = lazy(() => import("./pages/super-admin/PlansPage"));
const SuperModules = lazy(() => import("./pages/super-admin/ModulesPage"));
const SuperDomains = lazy(() => import("./pages/super-admin/DomainsPage"));
const SuperHealth = lazy(() => import("./pages/super-admin/SystemHealthPage"));
const SuperActivity = lazy(
  () => import("./pages/super-admin/ActivityLogsPage"),
);
const SuperSettings = lazy(() => import("./pages/super-admin/SettingsPage"));
const SuperStorage = lazy(() => import("./pages/super-admin/SuperStoragePage"));
const SuperBilling = lazy(() => import("./pages/super-admin/SuperBillingPage"));
const SuperSupport = lazy(() => import("./pages/super-admin/SuperSupportPage"));
const SuperOrgChat = lazy(() => import("./pages/super-admin/SuperOrgChatPage"));
const SuperMyProfile = lazy(
  () => import("./pages/super-admin/SuperAdminMyProfile"),
);
const SuperNotifications = lazy(
  () => import("./pages/super-admin/SuperAdminNotifications"),
);
const SuperAdminLogin = lazy(
  () => import("./pages/super-admin/SuperAdminLogin"),
);
const SuperAdminForgotPassword = lazy(
  () => import("./pages/super-admin/SuperAdminForgotPassword"),
);
const SuperAdminResetPassword = lazy(
  () => import("./pages/super-admin/SuperAdminResetPassword"),
);
const SuperAdminRegister = lazy(
  () => import("./pages/super-admin/SuperAdminRegister"),
);
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
const EventsPage = lazy(() => import("./pages/EventsPage"));
const Notifications = lazy(() => import("./pages/Notifications"));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings"));
const Personalization = lazy(() => import("./pages/Personalization"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const UserPerformance = lazy(() => import("./pages/UserPerformance"));
const TeamMembersReport = lazy(() => import("./pages/TeamMembersReport"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const LoggedOut = lazy(() => import("./pages/LoggedOut"));
const Chat = lazy(() => import("./pages/Chat"));
const OrgChat = lazy(() => import("./pages/OrgChatPage"));
const DraftCenter = lazy(() => import("./pages/DraftCenter"));
const Templates = lazy(() => import("./pages/Templates"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const FeedbackCenter = lazy(() => import("./pages/FeedbackCenter"));
const BrandingPage = lazy(() => import("./pages/BrandingPage"));
const SubscriptionPage = lazy(() => import("./pages/SubscriptionPage"));
const StoragePage = lazy(() => import("./pages/StoragePage"));
const OrganizationDetailsPage = lazy(
  () => import("./pages/OrganizationDetailsPage"),
);

// HRM layout and pages. HRM routes are nested under /org/:slug/hrm.
const HRMAdminLayout = lazy(
  () => import("./components/layout/hrm/DashboardLayout"),
);
const HRMAdmin = lazy(() => import("./pages/HRM/Admin"));
const RecruitmentOnboarding = lazy(() => import("./pages/HRM/Recruitment"));
const OfferLetters = lazy(() => import("./pages/HRM/Offerletter"));
const CandidateOfferPortal = lazy(
  () => import("./pages/HRM/CandidateOfferPortal"),
);
const HrmEsign = lazy(() => import("./pages/HRM/Esign"));
const EsignPortal = lazy(() => import("./pages/HRM/EsignPortal"));
const Workforce = lazy(() => import("./pages/HRM/Workforce"));
const EmployeeDocuments = lazy(() => import("./pages/HRM/EmployeeDocuments"));
const Attendance = lazy(() => import("./pages/HRM/Attendance"));
const MemberHrmDashboard = lazy(() => import("./pages/HRM/MemberHrmDashboard"));
const AdminMyApplications = lazy(
  () => import("./pages/HRM/AdminMyApplications"),
);
const HrmPerformance = lazy(() => import("./pages/HRM/HrmPerformance"));
const Applications = lazy(() => import("./pages/HRM/Applications"));
const WorkflowSettings = lazy(() => import("./pages/HRM/WorkflowSettings"));

import { authToken, superAdminAuthToken } from "./utils/auth";
import { isAdminDomain, isOrgDomain } from "./utils/domain";
import { getHrmLandingPath, isHrmAdminRole } from "./utils/hrmNavigation";

// Route protection components
import ProtectedRoute from "./components/ProtectedRoute";
import RoleProtectedRoute from "./components/RoleProtectedRoute";

class ErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("Page error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            fontFamily: "sans-serif",
          }}
        >
          <h2 style={{ marginBottom: 12 }}>Something went wrong</h2>
          <p style={{ color: "#666", marginBottom: 16 }}>
            Please try refreshing the page.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.reload();
            }}
            style={{ padding: "8px 24px", cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    const el = document.querySelector(".main-layout");
    if (el) el.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function HrmMemberDashboardRoute() {
  if (isHrmAdminRole()) {
    return <Navigate to={getHrmLandingPath()} replace />;
  }

  return <MemberHrmDashboard />;
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
      const host = window.location.hostname;

      // Local dev: both domains on same host
      const isLocal = host === "localhost" || host === "127.0.0.1";

      // Admin domain detection
      const isOnAdminDomain = isLocal
        ? currentPath.startsWith("/super-admin")
        : (host.startsWith("admin.") || host.includes("admin"));

      // Org domain detection
      const isOnOrgDomain = isLocal
        ? !currentPath.startsWith("/super-admin")
        : (host.startsWith("app.") || (!host.includes("admin") && !currentPath.startsWith("/super-admin")));

      const publicPaths = [
        "/login",
        "/logged-out",
        "/forgot-password",
        "/reset-password",
      ];
      const superAdminPublicPaths = [
        "/super-admin/login",
        "/super-admin/register",
        "/super-admin/forgot-password",
        "/super-admin/reset-password",
      ];
      const isPublic = publicPaths.includes(currentPath) || currentPath === "/";
      const isPublicEsign = currentPath.toLowerCase().includes("/esign/") || currentPath.toLowerCase().includes("/offer-letter/portal/");
      const isSuperAdminPublic = superAdminPublicPaths.includes(currentPath);

      // On admin domain: only check super admin session
      if (isOnAdminDomain) {
        const isSuperAdminProtected =
          currentPath.startsWith("/super-admin") &&
          !isSuperAdminPublic &&
          !isPublicEsign &&
          currentPath !== "/super-admin";
        if (isSuperAdminProtected && !superAdminAuthToken()) {
          try {
            window.history.replaceState(null, "", "/super-admin/login");
          } catch {}
          window.location.replace(
            "/super-admin/login?message=" +
              encodeURIComponent("Session expired. Please log in."),
          );
        }
        return;
      }

      // On org domain: only check PMS session
      if (isOnOrgDomain) {
        const isOrgRoute = currentPath.startsWith("/org/");
        if (
          !isPublic &&
          !isPublicEsign &&
          !isOrgRoute &&
          !currentPath.startsWith("/super-admin") &&
          !authToken()
        ) {
          try {
            window.history.replaceState(null, "", "/login");
          } catch {}
          window.location.replace(
            "/login?message=" +
              encodeURIComponent("Session expired. Please log in."),
          );
        }
        return;
      }
    };

    // 1. Check BFCache (pageshow event when restored via browser Back/Forward button)
    const handlePageShow = (e) => {
      if (e.persisted) {
        verifySession();
      }
    };

    // 2. Check tab visibility (switching back to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        verifySession();
      }
    };

    // 3. Check browser back/forward navigation
    const handlePopState = () => {
      verifySession();
    };

    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("popstate", handlePopState);

    // Initial route check
    verifySession();

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [location]);

  return children;
}

function SuperAdminWrapper() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return <SuperAdminLayout isDark={isDark} toggleTheme={toggleTheme} />;
}

function DashboardLayoutWrapper() {
  return <Outlet />;
}

function App() {
  useInactivityTimeout();
  const onAdmin = isAdminDomain();
  const onOrg = isOrgDomain();

  return (
    <BrowserRouter>
      <AuthSecurityGuard>
        <ScrollToTop />
        <ErrorBoundary>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              {/* ═══ ADMIN DOMAIN ROUTES ═══ */}
              {onAdmin && (
                <>
                  {/* Root and /login redirects for admin domain */}
                  <Route path="/" element={<Navigate to="/super-admin/login" replace />} />
                  <Route path="/login" element={<Navigate to="/super-admin/login" replace />} />

                  {/* Admin login */}
                  <Route
                    path="/super-admin/login"
                    element={<SuperAdminLogin />}
                  />
                  <Route
                    path="/super-admin/register"
                    element={<SuperAdminRegister />}
                  />
                  <Route
                    path="/super-admin/forgot-password"
                    element={<SuperAdminForgotPassword />}
                  />
                  <Route
                    path="/super-admin/reset-password"
                    element={<SuperAdminResetPassword />}
                  />

                  {/* Public candidate portals accessible on admin domain */}
                  <Route path="/esign/:slug/:token" element={<EsignPortal />} />
                  <Route path="/esign/:token" element={<EsignPortal />} />
                  <Route path="/offer-letter/portal/:id" element={<CandidateOfferPortal />} />

                  {/* Admin protected */}
                  <Route path="/super-admin" element={<SuperAdminWrapper />}>
                    <Route index element={<SuperDashboard />} />
                    <Route
                      path="organizations"
                      element={<SuperOrganizations />}
                    />
                    <Route
                      path="organizations/:id"
                      element={<SuperOrganizationDetail />}
                    />
                    <Route path="plans" element={<SuperPlans />} />
                    <Route path="modules" element={<SuperModules />} />
                    <Route path="domains" element={<SuperDomains />} />
                    <Route path="storage" element={<SuperStorage />} />
                    <Route path="billing" element={<SuperBilling />} />
                    <Route path="support" element={<SuperSupport />} />
                    <Route path="chat" element={<SuperOrgChat />} />
                    <Route
                      path="chat/:conversationId"
                      element={<SuperOrgChat />}
                    />
                    <Route path="health" element={<SuperHealth />} />
                    <Route path="activity" element={<SuperActivity />} />
                    <Route
                      path="notifications"
                      element={<SuperNotifications />}
                    />
                    <Route path="settings" element={<SuperSettings />} />
                    <Route path="my-profile" element={<SuperMyProfile />} />
                  </Route>

                  {/* Admin catch-all */}
                  <Route
                    path="*"
                    element={<Navigate to="/super-admin/login" replace />}
                  />
                </>
              )}

              {/* ═══ ORG DOMAIN ROUTES ═══ */}
              {onOrg && (
                <>
                  {/* Public routes */}
                  <Route path="/" element={<Login />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/logged-out" element={<LoggedOut />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/esign/:slug/:token" element={<EsignPortal />} />
                  <Route path="/esign/:token" element={<EsignPortal />} />

                  {/* Organization routes - nested under /org/:slug */}
                  <Route
                    path="/org/:slug"
                    element={
                      <ProtectedRoute>
                        <DashboardLayoutWrapper />
                      </ProtectedRoute>
                    }
                  >
                    <Route
                      index
                      element={<Navigate to="dashboard" replace />}
                    />
                    <Route path="dashboard" element={<Admin />} />

                    {/* Task routes */}
                    <Route path="tasks" element={<Tasks />} />
                    <Route path="guest-tasks" element={<GuestTasks />} />
                    <Route path="taskby" element={<Taskby />} />
                    <Route path="self-tasks" element={<SelfTasks />} />
                    <Route path="all-tasks" element={<AllTasks />} />
                    <Route
                      path="tasks/task-details/:taskId"
                      element={<TaskDetails />}
                    />

                    {/* Project routes */}
                    <Route path="projects" element={<Projects />} />
                    <Route path="create-project" element={<CreateProject />} />
                    <Route
                      path="projects/project-details/:projectId"
                      element={<ProjectDetails />}
                    />

                    {/* Subtask routes */}
                    <Route path="deliveries" element={<Deliveries />} />
                    <Route
                      path="deliveries-by-you"
                      element={<DeliveriesByYou />}
                    />
                    <Route
                      path="self-deliveries"
                      element={<SelfDeliveries />}
                    />
                    <Route
                      path="all-deliverables"
                      element={<AllDeliveries />}
                    />
                    <Route
                      path="deliveries/deliverable-details/:deliverable"
                      element={<SubtaskDetails />}
                    />

                    {/* Admin/Manager only routes */}
                    <Route
                      path="manage-users"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                          <ManageUsers />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="manage-users/user-profile/:userId"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                          <UserProfile />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="manage-team"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                          <ManageTeam />
                        </RoleProtectedRoute>
                      }
                    />

                    {/* Member/Team Lead: read-only team view */}
                    <Route path="my-team" element={<MemberTeam />} />

                    {/* Other protected routes */}
                    <Route path="history" element={<History />} />
                    <Route path="reports" element={<Reports />} />
                    <Route path="team-members-report" element={<Reports />} />
                    <Route path="my-profile" element={<MyProfile />} />
                    <Route path="calender" element={<Calender />} />
                    <Route path="calendar" element={<Calender />} />
                    <Route path="events" element={<EventsPage />} />
                    <Route path="drafts" element={<DraftCenter />} />
                    <Route path="templates" element={<Templates />} />
                    <Route path="knowledge-base" element={<KnowledgeBase />} />
                    <Route path="notifications" element={<Notifications />} />
                    <Route
                      path="settings/notifications"
                      element={<NotificationSettings />}
                    />
                    <Route
                      path="audit-logs"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                          <AuditLogs />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="feedback"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                          <FeedbackCenter />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="branding"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin"]}>
                          <BrandingPage />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="subscription"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin"]}>
                          <SubscriptionPage />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="organization-details"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin"]}>
                          <OrganizationDetailsPage />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="settings/personalization"
                      element={<Personalization />}
                    />
                    <Route
                      path="personalization"
                      element={<Personalization />}
                    />
                    <Route path="storage" element={<StoragePage />} />
                    <Route
                      path="reports/user-performance/:userId"
                      element={<UserPerformance />}
                    />
                    <Route
                      path="reports/team-members/:teamId"
                      element={<TeamMembersReport />}
                    />
                    <Route path="chat" element={<Chat />} />
                    <Route path="chat/:conversationId" element={<Chat />} />
                    <Route path="org-chat" element={<OrgChat />} />
                    <Route
                      path="org-chat/:conversationId"
                      element={<OrgChat />}
                    />
                  </Route>

                  {/* HRM routes use the same organization slug and tenant session as PMS. */}
                  <Route
                    path="/org/:slug/hrm"
                    element={
                      <ProtectedRoute>
                        <HRMAdminLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route
                      index
                      element={
                        <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                          <HRMAdmin />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="recruitment"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                          <RecruitmentOnboarding />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="offer-letters"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                          <OfferLetters />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="esign"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin", "manager", "owner", "hr_manager"]}>
                          <HrmEsign />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="workforce"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                          <Workforce />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="documents"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                          <EmployeeDocuments />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="attendance"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                          <Attendance />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="applications"
                      element={
                        <RoleProtectedRoute
                          allowedRoles={[
                            "admin",
                            "owner",
                            "manager",
                            "hr_manager",
                            "hr_user",
                            "team_lead",
                            "member",
                          ]}
                        >
                          <Applications />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="my-applications"
                      element={
                        <RoleProtectedRoute
                          allowedRoles={[
                            "admin",
                            "owner",
                            "manager",
                            "hr_manager",
                            "hr_user",
                          ]}
                        >
                          <AdminMyApplications />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="workflow-settings"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin", "owner"]}>
                          <WorkflowSettings />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="performance"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                          <HrmPerformance />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="member-dashboard"
                      element={
                        <RoleProtectedRoute
                          allowedRoles={[
                            "admin",
                            "owner",
                            "manager",
                            "hr_manager",
                            "hr_user",
                            "team_lead",
                            "member",
                            "guest",
                          ]}
                        >
                          <HrmMemberDashboardRoute />
                        </RoleProtectedRoute>
                      }
                    />
                  </Route>

                  {/* Public candidate portal does not require an organization session. */}
                  <Route
                    path="/offer-letter/portal/:id"
                    element={<CandidateOfferPortal />}
                  />
                  <Route path="/esign/:slug/:token" element={<EsignPortal />} />
                  <Route path="/esign/:token" element={<EsignPortal />} />

                  {/* Org catch-all */}
                  <Route path="*" element={<Navigate to="/login" replace />} />
                </>
              )}

              {/* ═══ LOCAL DEV: BOTH ROUTE SETS ═══ */}
              {!onAdmin && !onOrg && (
                <>
                  {/* Public routes */}
                  <Route path="/" element={<Login />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/logged-out" element={<LoggedOut />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/esign/:slug/:token" element={<EsignPortal />} />
                  <Route path="/esign/:token" element={<EsignPortal />} />

                  {/* Organization routes */}
                  <Route
                    path="/org/:slug"
                    element={
                      <ProtectedRoute>
                        <DashboardLayoutWrapper />
                      </ProtectedRoute>
                    }
                  >
                    <Route
                      index
                      element={<Navigate to="dashboard" replace />}
                    />
                    <Route path="dashboard" element={<Admin />} />
                    <Route path="tasks" element={<Tasks />} />
                    <Route path="guest-tasks" element={<GuestTasks />} />
                    <Route path="taskby" element={<Taskby />} />
                    <Route path="self-tasks" element={<SelfTasks />} />
                    <Route path="all-tasks" element={<AllTasks />} />
                    <Route
                      path="tasks/task-details/:taskId"
                      element={<TaskDetails />}
                    />
                    <Route path="projects" element={<Projects />} />
                    <Route path="create-project" element={<CreateProject />} />
                    <Route
                      path="projects/project-details/:projectId"
                      element={<ProjectDetails />}
                    />
                    <Route path="deliveries" element={<Deliveries />} />
                    <Route
                      path="deliveries-by-you"
                      element={<DeliveriesByYou />}
                    />
                    <Route
                      path="self-deliveries"
                      element={<SelfDeliveries />}
                    />
                    <Route
                      path="all-deliverables"
                      element={<AllDeliveries />}
                    />
                    <Route
                      path="deliveries/deliverable-details/:deliverable"
                      element={<SubtaskDetails />}
                    />
                    <Route
                      path="manage-users"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                          <ManageUsers />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="manage-users/user-profile/:userId"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                          <UserProfile />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="manage-team"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                          <ManageTeam />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route path="my-team" element={<MemberTeam />} />
                    <Route path="history" element={<History />} />
                    <Route path="reports" element={<Reports />} />
                    <Route path="team-members-report" element={<Reports />} />
                    <Route path="my-profile" element={<MyProfile />} />
                    <Route path="calender" element={<Calender />} />
                    <Route path="calendar" element={<Calender />} />
                    <Route path="events" element={<EventsPage />} />
                    <Route path="drafts" element={<DraftCenter />} />
                    <Route path="templates" element={<Templates />} />
                    <Route path="knowledge-base" element={<KnowledgeBase />} />
                    <Route path="notifications" element={<Notifications />} />
                    <Route
                      path="settings/notifications"
                      element={<NotificationSettings />}
                    />
                    <Route
                      path="audit-logs"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                          <AuditLogs />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="branding"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin"]}>
                          <BrandingPage />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="subscription"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin"]}>
                          <SubscriptionPage />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="organization-details"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin"]}>
                          <OrganizationDetailsPage />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="feedback"
                      element={
                        <RoleProtectedRoute allowedRoles={["admin", "manager"]}>
                          <FeedbackCenter />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="settings/personalization"
                      element={<Personalization />}
                    />
                    <Route
                      path="personalization"
                      element={<Personalization />}
                    />
                    <Route path="storage" element={<StoragePage />} />
                    <Route
                      path="reports/user-performance/:userId"
                      element={<UserPerformance />}
                    />
                    <Route
                      path="reports/team-members/:teamId"
                      element={<TeamMembersReport />}
                    />
                    <Route path="chat" element={<Chat />} />
                    <Route path="chat/:conversationId" element={<Chat />} />
                    <Route path="org-chat" element={<OrgChat />} />
                    <Route
                      path="org-chat/:conversationId"
                      element={<OrgChat />}
                    />
                  </Route>

                  {/* Super Admin auth routes (public) */}
                  <Route
                    path="/super-admin/login"
                    element={<SuperAdminLogin />}
                  />
                  <Route
                    path="/super-admin/register"
                    element={<SuperAdminRegister />}
                  />
                  <Route
                    path="/super-admin/forgot-password"
                    element={<SuperAdminForgotPassword />}
                  />
                  <Route
                    path="/super-admin/reset-password"
                    element={<SuperAdminResetPassword />}
                  />

                  {/* Super Admin routes */}
                  <Route path="/super-admin" element={<SuperAdminWrapper />}>
                    <Route index element={<SuperDashboard />} />
                    <Route
                      path="organizations"
                      element={<SuperOrganizations />}
                    />
                    <Route
                      path="organizations/:id"
                      element={<SuperOrganizationDetail />}
                    />
                    <Route path="plans" element={<SuperPlans />} />
                    <Route path="modules" element={<SuperModules />} />
                    <Route path="domains" element={<SuperDomains />} />
                    <Route path="storage" element={<SuperStorage />} />
                    <Route path="billing" element={<SuperBilling />} />
                    <Route path="support" element={<SuperSupport />} />
                    <Route path="chat" element={<SuperOrgChat />} />
                    <Route
                      path="chat/:conversationId"
                      element={<SuperOrgChat />}
                    />
                    <Route path="health" element={<SuperHealth />} />
                    <Route path="activity" element={<SuperActivity />} />
                    <Route
                      path="notifications"
                      element={<SuperNotifications />}
                    />
                    <Route path="settings" element={<SuperSettings />} />
                    <Route path="my-profile" element={<SuperMyProfile />} />
                  </Route>

                  <Route path="*" element={<Navigate to="/login" replace />} />
                </>
              )}
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </AuthSecurityGuard>
    </BrowserRouter>
  );
}

export default App;
