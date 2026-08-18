/**
 * RoleProtectedRoute.jsx
 * Route guard that restricts access based on both authentication status
 * and the user's role. For the new /org/:slug/* routing, the slug is
 * validated against the stored tenant_slug, and role permissions are checked.
 */

import { useLayoutEffect } from "react";
import { Navigate, useParams, useNavigate, useLocation } from "react-router-dom";
import { authToken, getCurrentRole, getTenantSlug } from "../utils/auth";
import { isAdminDomain } from "../utils/domain";

/**
 * Guards a route by checking authentication, org slug, and role permissions.
 * Redirects to /login if unauthenticated, or to correct org dashboard if slug doesn't match.
 * @param {string[]} [allowedRoles] - Optional array of permitted session roles.
 * @param {React.ReactNode} children - The protected page content.
 */
function RoleProtectedRoute({ allowedRoles, children }) {
  const { slug } = useParams();
  const token = authToken();
  const sessionRole = getCurrentRole();
  const navigate = useNavigate();
  const location = useLocation();

  useLayoutEffect(() => {
    if (!authToken()) {
      const currentPath = window.location.pathname;
      const loginPath = isAdminDomain() ? '/super-admin/login' : '/login';
      const safePath = currentPath && currentPath.startsWith('/') && !currentPath.startsWith('//')
        ? currentPath
        : loginPath;
      const redirectUrl = `${loginPath}?redirect=${encodeURIComponent(safePath)}`;
      try {
        window.history.replaceState(null, "", redirectUrl);
      } catch {}
      navigate(redirectUrl, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  if (!token) {
    const loginPath = isAdminDomain() ? '/super-admin/login' : '/login';
    return <Navigate to={loginPath} replace />;
  }

  // Validate org slug matches stored tenant
  const storedSlug = getTenantSlug();
  if (slug && storedSlug && slug !== storedSlug) {
    return <Navigate to={`/org/${storedSlug}/dashboard`} replace />;
  }

  // Guest role restrictions
  if (sessionRole === "guest" && (
    location.pathname.includes("/reports") ||
    location.pathname.includes("/manage-users") ||
    location.pathname.includes("/manage-team") ||
    location.pathname.includes("/audit-logs")
  )) {
    return <Navigate to={`/org/${slug || storedSlug}/guest-tasks`} replace />;
  }

  // Role-based access control
  if (allowedRoles && !allowedRoles.includes(sessionRole)) {
    const fallbackPage = sessionRole === "guest" ? "guest-tasks" : "dashboard";
    return <Navigate to={`/org/${slug || storedSlug}/${fallbackPage}`} replace />;
  }

  return children;
}

export default RoleProtectedRoute;
