/**
 * ProtectedRoute component.
 */

import { Navigate } from "react-router-dom";
import { authToken } from "../utils/auth";

/**
 * Guard component that redirects unauthenticated users to login.
 */
function ProtectedRoute({ children }) {

  const token = authToken();

  if (!token) {
    return <Navigate to="/" />;
  }

  return children;
}

export default ProtectedRoute;
