/**
 * ProtectedRoute.jsx
 * Route guard component that prevents unauthenticated users from accessing
 * protected pages. Redirects to the login page if no auth token is found.
 */

import { useLayoutEffect } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { authToken } from "../utils/auth";

/**
 * Redirects to login if no auth token is present, otherwise renders children.
 * Replaces browser history state so users cannot click Back into protected pages after logout.
 * @param {React.ReactNode} children - The protected page content.
 */
function ProtectedRoute({ children }) {
  const token = authToken();
  const navigate = useNavigate();
  const location = useLocation();

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

  return children;
}

export default ProtectedRoute;
