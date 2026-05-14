/**
 * ProtectedRoute component.
 */

import { Navigate } from "react-router-dom";

/**
 * Guard component that redirects unauthenticated users to login.
 */
function ProtectedRoute({ children }) {

  // Retrieve stored authentication token from browser storage.
  const token = localStorage.getItem("token");

  // Redirect to login if token is missing or expired.
  if (!token) {
    return <Navigate to="/" />;
  }

  // Allow access when user is authenticated.
  return children;
}

export default ProtectedRoute;