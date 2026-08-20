import { useLocation } from "react-router-dom";
import { rolePath } from "../utils/auth";

/**
 * Hook to generate accurate, clean breadcrumb navigation items based on current route location.
 * @returns {Array} Array of breadcrumb items [{label, path}]
 */
export default function useBreadcrumb() {
  const location = useLocation();
  const rawSegments = location.pathname.split("/").filter(Boolean);

  // Filter out tenant/org prefixes like 'org', {slug}, or role prefixes like 'admin', 'manager', 'employee', 'super-admin'
  const ignorePrefixes = new Set(["org", "admin", "manager", "employee", "team_lead", "super-admin", "guest", "client"]);
  
  // Find index where actual application routes start
  const appSegments = rawSegments.filter((seg, idx) => {
    if (idx < 2 && ignorePrefixes.has(seg)) return false;
    if (idx === 1 && rawSegments[0] === "org") return false; // tenant slug
    return true;
  });

  const breadcrumbs = [
    { label: "Dashboard", path: rolePath("") }
  ];

  if (appSegments.length === 0 || (appSegments.length === 1 && appSegments[0] === "dashboard")) {
    breadcrumbs[0].path = null;
    return breadcrumbs;
  }

  const mainRoute = appSegments[0];

  const sectionMap = {
    tasks: { label: "Tasks", path: rolePath("tasks") },
    taskby: { label: "Tasks (Assigned By You)", path: rolePath("taskby") },
    "self-tasks": { label: "Self Tasks", path: rolePath("self-tasks") },
    projects: { label: "Projects", path: rolePath("projects") },
    "create-project": { label: "Projects", path: rolePath("projects") },
    deliveries: { label: "Subtasks", path: rolePath("deliveries") },
    "deliveries-by-you": { label: "Subtasks (Assigned By You)", path: rolePath("deliveries-by-you") },
    "self-deliveries": { label: "Self Subtasks", path: rolePath("self-deliveries") },
    "manage-users": { label: "Manage Users", path: rolePath("manage-users") },
    "manage-team": { label: "Manage Teams", path: rolePath("manage-team") },
    calender: { label: "Calendar", path: rolePath("calender") },
    reports: { label: "Reports", path: rolePath("reports") },
    "my-profile": { label: "My Profile", path: rolePath("my-profile") },
    notifications: { label: "Notifications", path: rolePath("notifications") },
    history: { label: "Activity History", path: rolePath("history") },
    branding: { label: "Branding", path: rolePath("branding") },
    billing: { label: "Billing", path: rolePath("billing") },
  };

  const detailMap = {
    "task-details": "Task Details",
    "deliverable-details": "Subtask Details",
    "project-details": "Project Details",
    "user-profile": "User Profile",
    "user-performance": "User Performance",
  };

  // Add primary section breadcrumb
  if (sectionMap[mainRoute]) {
    breadcrumbs.push({
      label: sectionMap[mainRoute].label,
      path: appSegments.length > 1 ? sectionMap[mainRoute].path : null,
    });
  } else if (!detailMap[mainRoute]) {
    const formattedLabel = mainRoute.charAt(0).toUpperCase() + mainRoute.slice(1).replace(/-/g, " ");
    breadcrumbs.push({
      label: formattedLabel,
      path: appSegments.length > 1 ? rolePath(mainRoute) : null,
    });
  }

  // Check for detail pages or nested sub-routes
  for (let i = 1; i < appSegments.length; i++) {
    const seg = appSegments[i];
    if (detailMap[seg]) {
      breadcrumbs.push({
        label: detailMap[seg],
        path: null,
      });
      break;
    } else if (sectionMap[seg] && !breadcrumbs.some(b => b.label === sectionMap[seg].label)) {
      breadcrumbs.push({
        label: sectionMap[seg].label,
        path: i < appSegments.length - 1 ? sectionMap[seg].path : null,
      });
    }
  }

  // Ensure last item has path: null (current active page)
  if (breadcrumbs.length > 0) {
    breadcrumbs[breadcrumbs.length - 1].path = null;
  }

  return breadcrumbs;
}
