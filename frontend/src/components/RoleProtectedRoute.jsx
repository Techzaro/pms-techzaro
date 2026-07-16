/**
 * RoleProtectedRoute.jsx
 * Route guard that restricts access based on both authentication status
 * and the user's role. Validates that the URL role parameter matches the
 * session role and optionally checks against an allowed roles list.
 */

import { Navigate, useParams } from "react-router-dom";
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
  // Convert session role (e.g. "team_lead") to URL format (e.g. "teamlead") for comparison
  const sessionUrlRole = SESSION_ROLE_TO_URL[sessionRole] || "";

  if (!token) {
    return <Navigate to="/" />;
  }

  if (urlRole !== sessionUrlRole) {
    return <Navigate to={rolePath("dashboard")} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(sessionRole)) {
    return <Navigate to={rolePath("dashboard")} replace />;
  }

  return children;
}

export default RoleProtectedRoute;
