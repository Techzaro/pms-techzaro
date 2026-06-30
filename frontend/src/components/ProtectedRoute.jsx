/**
 * ProtectedRoute.jsx
 * Route guard component that prevents unauthenticated users from accessing
 * protected pages. Redirects to the login page if no auth token is found.
 */

import { Navigate } from "react-router-dom";
import { authToken } from "../utils/auth";

/**
 * Redirects to login if no auth token is present, otherwise renders children.
 * @param {React.ReactNode} children - The protected page content.
 */
function ProtectedRoute({ children }) {

  const token = authToken();

  if (!token) {
    return <Navigate to="/" />;
  }

  return children;
}

export default ProtectedRoute;
