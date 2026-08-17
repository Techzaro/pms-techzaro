/**
 * ProtectedRoute.jsx
 * Route guard component that prevents unauthenticated users from accessing
 * protected pages. Redirects to the login page if no auth token is found.
 * Preserves the intended URL for post-login redirect.
 */

import { useLayoutEffect } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { authToken } from "../utils/auth";
import { isAdminDomain } from "../utils/domain";

/**
 * Redirects to login if no auth token is present, otherwise renders children.
 * Preserves intended path for redirect after login (safe internal paths only).
 * @param {React.ReactNode} children - The protected page content.
 */
function ProtectedRoute({ children }) {
  const token = authToken();
  const navigate = useNavigate();
  const location = useLocation();

  useLayoutEffect(() => {
    if (!authToken()) {
      const currentPath = window.location.pathname;
      const loginPath = isAdminDomain() ? '/super-admin/login' : '/login';
      // Only preserve internal paths (prevent open redirect)
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

  return children;
}

export default ProtectedRoute;
