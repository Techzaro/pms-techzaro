import { useLocation, useParams } from "react-router-dom";
import { rolePath } from "../utils/auth";

/**
 * Hook to generate breadcrumb items based on current route
 * @returns {Array} Array of breadcrumb items [{label, path}]
 */
export default function useBreadcrumb() {
  const location = useLocation();
  const params = useParams();
  const pathSegments = location.pathname.split("/").filter(Boolean);

  // Remove role segment (first segment)
  const segments = pathSegments.slice(1);

  const breadcrumbs = [];

  // Map of route segments to labels
  const routeLabels = {
    dashboard: "Dashboard",
    tasks: "Tasks",
    taskby: "Tasks",
    "self-tasks": "Tasks",
    projects: "Projects",
    deliveries: "Deliverables",
    "deliveries-by-you": "Deliverables",
    "self-deliveries": "Deliverables",
    "manage-users": "Users",
    "manage-team": "Teams",
    calender: "Calendar",
    reports: "Reports",
    "my-profile": "Profile",
    notifications: "Notifications",
    history: "History",
    "create-project": "Projects",
  };

  // Sub-route labels
  const subRouteLabels = {
    tasks: "Assigned To You",
    taskby: "Assigned By You",
    "self-tasks": "Self Tasks",
    deliveries: "Assigned To You",
    "deliveries-by-you": "Assigned By You",
    "self-deliveries": "Self Deliverables",
  };

  // Detail page labels
  const detailLabels = {
    "task-details": "Task Details",
    "deliverable-details": "Deliverable Details",
    "project-details": "Project Details",
    "user-profile": "User Profile",
  };

  // Build breadcrumb based on route
  if (segments.length === 0) {
    // Dashboard
    breadcrumbs.push({ label: "Dashboard", path: null });
  } else {
    const mainRoute = segments[0];

    // Add main section
    if (mainRoute === "taskby" || mainRoute === "self-tasks") {
      breadcrumbs.push({ label: "Tasks", path: rolePath("tasks") });
    } else if (mainRoute === "deliveries-by-you" || mainRoute === "self-deliveries") {
      breadcrumbs.push({ label: "Deliverables", path: rolePath("deliveries") });
    } else if (mainRoute === "create-project") {
      breadcrumbs.push({ label: "Projects", path: rolePath("projects") });
    } else if (mainRoute === "manage-users") {
      breadcrumbs.push({ label: "Users", path: rolePath("manage-users") });
    } else if (mainRoute === "manage-team") {
      breadcrumbs.push({ label: "Teams", path: rolePath("manage-team") });
    } else if (mainRoute === "reports") {
      breadcrumbs.push({ label: "Reports", path: rolePath("reports") });
    } else if (mainRoute === "my-profile") {
      breadcrumbs.push({ label: "Profile", path: rolePath("my-profile") });
    } else {
      breadcrumbs.push({
        label: routeLabels[mainRoute] || mainRoute,
        path: segments.length > 1 ? rolePath(mainRoute) : null,
      });
    }

    // Add sub-route if exists
    if (segments.length > 1 && segments[1] !== "task-details" && segments[1] !== "deliverable-details" && segments[1] !== "project-details" && segments[1] !== "user-profile") {
      const subLabel = subRouteLabels[segments[1]];
      if (subLabel) {
        breadcrumbs.push({
          label: subLabel,
          path: segments.length > 2 ? rolePath(segments[1]) : null,
        });
      }
    }

    // Handle detail pages
    if (segments.includes("task-details") || segments.includes("deliverable-details") || segments.includes("project-details") || segments.includes("user-profile")) {
      const detailIndex = segments.findIndex(seg =>
        ["task-details", "deliverable-details", "project-details", "user-profile"].includes(seg)
      );

      if (detailIndex > 0) {
        const prevSegment = segments[detailIndex - 1];
        const subLabel = subRouteLabels[prevSegment];
        if (subLabel && !breadcrumbs.find(b => b.label === subLabel)) {
          breadcrumbs.push({
            label: subLabel,
            path: rolePath(prevSegment),
          });
        }
      }

      const detailLabel = detailLabels[segments[detailIndex]];
      if (detailLabel) {
        breadcrumbs.push({ label: detailLabel, path: null });
      }
    }

    // Handle special cases
    if (segments[0] === "reports" && segments.length > 1) {
      if (segments[1] === "user-performance") {
        breadcrumbs.push({ label: "User Performance", path: null });
      }
    }
  }

  return breadcrumbs;
}
