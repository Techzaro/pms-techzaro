import { Navigate, useParams } from "react-router-dom";
import { authToken, getCurrentRole, rolePath } from "../utils/auth";

const URL_ROLE_TO_SESSION = {
  admin: "admin",
  manager: "manager",
  teamlead: "team_lead",
  member: "member",
};

const SESSION_ROLE_TO_URL = {
  admin: "admin",
  manager: "manager",
  team_lead: "teamlead",
  member: "member",
};

function RoleProtectedRoute({ allowedRoles, children }) {
  const { role: urlRole } = useParams();
  const token = authToken();
  const sessionRole = getCurrentRole();
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
