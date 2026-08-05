/**
 * RoleProtectedRoute.jsx
 * Route guard that restricts access based on both authentication status
 * and the user's role. Validates that the URL role parameter matches the
 * session role and optionally checks against an allowed roles list.
 */

import { useLayoutEffect } from "react";
import { Navigate, useParams, useNavigate, useLocation } from "react-router-dom";
import { authToken, getCurrentRole, rolePath } from "../utils/auth";

/** Maps URL-friendly role names to internal session role names */
const URL_ROLE_TO_SESSION = {
  admin: "admin",
  manager: "manager",
  teamlead: "team_lead",
  member: "member",
  guest: "guest",
};

const SESSION_ROLE_TO_URL = {
  admin: "admin",
  manager: "manager",
  team_lead: "teamlead",
  member: "member",
  guest: "guest",
};

/**
 * Guards a route by checking authentication and role permissions.
 * Redirects to login if unauthenticated, or to dashboard if role doesn't match.
 * @param {string[]} [allowedRoles] - Optional array of permitted session roles.
 * @param {React.ReactNode} children - The protected page content.
 */
function RoleProtectedRoute({ allowedRoles, children }) {
  const { role: urlRole } = useParams();
  const token = authToken();
  const sessionRole = getCurrentRole();
  const navigate = useNavigate();
  const location = useLocation();
  // Convert session role (e.g. "team_lead") to URL format (e.g. "teamlead") for comparison
  const sessionUrlRole = SESSION_ROLE_TO_URL[sessionRole] || "";

  useLayoutEffect(() => {
    if (!authToken()) {
      try {
        window.history.replaceState(null, "", "/");
      } catch {}
      navigate("/", { replace: true });
    }
  }, [location.pathname, navigate]);

  if (!token) {
    return <Navigate to="/" replace />;
  }

  if (urlRole !== sessionUrlRole) {
    return <Navigate to={rolePath("dashboard")} replace />;
  }

  if (sessionRole === "guest" && (location.pathname.includes("/reports") || location.pathname.includes("/manage-users") || location.pathname.includes("/manage-team") || location.pathname.includes("/audit-logs"))) {
    return <Navigate to={rolePath("guest-tasks")} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(sessionRole)) {
    return <Navigate to={rolePath(sessionRole === "guest" ? "guest-tasks" : "dashboard")} replace />;
  }

  return children;
}

export default RoleProtectedRoute;
