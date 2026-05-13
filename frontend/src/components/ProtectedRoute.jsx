import { Navigate } from "react-router-dom";

function ProtectedRoute({ children }) {

  const token = localStorage.getItem("token");

  // if token not found
  if (!token) {
    return <Navigate to="/" />;
  }

  // if logged in
  return children;
}

export default ProtectedRoute;