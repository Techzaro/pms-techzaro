/**
 * navigation.js — Smart Redirection System
 *
 * Centralized navigation helper for resolving destinations for notifications
 * and activity items. Handles all module types, role-based access control,
 * null/missing entity IDs, and provides graceful fallbacks for deleted records.
 *
 * Used by:
 *   - Notifications.jsx (notification click destinations)
 *   - Admin.jsx (dashboard activity click destinations)
 */

import { rolePath, getCurrentRole } from "./auth";

// ── Notification → Destination mapping ──

/**
 * Maps notification types to their destination routes.
 * Each entry: { page: string, param?: string, from?: string }
 *   - page: the route page segment (passed to rolePath)
 *   - param: optional ID to append (e.g., "tasks/task-details/{id}")
 *   - from: optional query param for sidebar highlighting
 */
const NOTIFICATION_TYPE_MAP = {
  // Projects
  project_assigned:       { page: "projects", buildPath: (id) => `projects/project-details/${id}` },
  project_updated:        { page: "projects", buildPath: (id) => `projects/project-details/${id}` },
  project_submitted:      { page: "projects", buildPath: (id) => `projects/project-details/${id}` },
  project_approved:       { page: "projects", buildPath: (id) => `projects/project-details/${id}` },
  project_rejected:       { page: "projects", buildPath: (id) => `projects/project-details/${id}` },
  project_reopened:       { page: "projects", buildPath: (id) => `projects/project-details/${id}` },
  project_access_granted: { page: "projects", buildPath: (id) => `projects/project-details/${id}` },
  project_access_removed: { page: "projects", buildPath: (id) => `projects/project-details/${id}` },

  // Tasks
  task_assigned:  { page: "tasks", buildPath: (id) => `tasks/task-details/${id}`, from: "tasks" },
  task_updated:   { page: "tasks", buildPath: (id) => `tasks/task-details/${id}`, from: "tasks" },
  task_submitted: { page: "tasks", buildPath: (id) => `tasks/task-details/${id}`, from: "taskby" },
  task_completed: { page: "tasks", buildPath: (id) => `tasks/task-details/${id}`, from: "taskby" },
  task_approved:  { page: "tasks", buildPath: (id) => `tasks/task-details/${id}`, from: "tasks" },
  task_rejected:  { page: "tasks", buildPath: (id) => `tasks/task-details/${id}`, from: "tasks" },
  task_reopened:  { page: "tasks", buildPath: (id) => `tasks/task-details/${id}`, from: "tasks" },

  // Deliverables (backend uses selectedDeliverable query param pattern)
  deliverable_assigned:  { page: "deliveries", buildPath: (id) => `deliveries?selectedDeliverable=${id}` },
  deliverable_updated:   { page: "deliveries", buildPath: (id) => `deliveries?selectedDeliverable=${id}` },
  deliverable_submitted: { page: "deliveries", buildPath: (id) => `deliveries-by-you?selectedDeliverable=${id}` },
  deliverable_approved:  { page: "deliveries", buildPath: (id) => `deliveries?selectedDeliverable=${id}` },
  deliverable_rejected:  { page: "deliveries", buildPath: (id) => `deliveries?selectedDeliverable=${id}` },
  deliverable_reopened:  { page: "deliveries", buildPath: (id) => `deliveries?selectedDeliverable=${id}` },
  deliverable_added:     { page: "deliveries", buildPath: (id) => `deliveries?selectedDeliverable=${id}` },

  // Events
  event_created:   { page: "calender" },
  event_updated:   { page: "calender" },
  event_cancelled: { page: "calender" },
  event_reminder:  { page: "calender" },

  // Teams
  team_created:         { page: "manage-team", buildPath: (id) => `manage-team?selectedTeam=${id}` },
  team_updated:         { page: "manage-team", buildPath: (id) => `manage-team?selectedTeam=${id}` },
  team_deleted:         { page: "manage-team" },
  team_leader_changed:  { page: "manage-team", buildPath: (id) => `manage-team?selectedTeam=${id}` },
  team_member_added:    { page: "manage-team", buildPath: (id) => `manage-team?selectedTeam=${id}` },
  team_member_removed:  { page: "manage-team" },

  // Users
  user_updated: { page: "my-profile" },
  user_created: { page: "manage-users" },
  user_resigned: { page: "manage-users" },
};

// ── Dashboard Activity → Destination mapping ──

/**
 * Maps activity module+action combinations to their destination routes.
 * Used by the Dashboard (Admin.jsx) activity feed.
 */
const ACTIVITY_MODULE_MAP = {
  task:        { buildPath: (id) => `tasks/task-details/${id}`, from: "tasks" },
  project:     { buildPath: (id) => `projects/project-details/${id}`, from: "projects" },
  deliverable: { buildPath: (id) => `deliveries/deliverable-details/${id}`, from: "deliveries" },
  user:        { buildPath: (id) => `manage-users/user-profile/${id}` },
  team:        { buildPath: (id) => `manage-team?selectedTeam=${id}` },
};

// ── Public API ──

/**
 * Resolve the navigation destination for a notification.
 *
 * Priority:
 *   1. If the notification has a `link` field, use it (backend-generated links
 *      are the source of truth for task/deliverable/project deep-links).
 *   2. Fall back to type-based mapping using NOTIFICATION_TYPE_MAP.
 *   3. If no entity ID is available, fall back to the module listing page.
 *   4. For user module, redirect to own profile if not admin/manager.
 *
 * @param {Object} notification - The notification object from the API
 * @param {string} notification.type - Notification type (e.g., "task_assigned")
 * @param {string} notification.link - Backend-generated link (may be null)
 * @param {number} notification.related_id - Entity ID
 * @param {string} notification.related_module - Module name (task, project, etc.)
 * @returns {string} Role-prefixed path for navigation
 */
export function getNotificationDestination(notification) {
  const { type, link, related_id, related_module } = notification;
  const role = getCurrentRole();
  const isAdminOrManager = role === "admin" || role === "manager";

  // 1. Use backend link if available (strip leading slash for rolePath)
  if (link) {
    const cleanLink = link.replace(/^\//, "");
    // Handle user module with role check
    if (cleanLink.startsWith("manage-users/") && !isAdminOrManager) {
      return rolePath("my-profile");
    }
    // Handle team module: members see my-team, admin/manager see manage-team
    if (cleanLink.startsWith("manage-team") && !isAdminOrManager) {
      return rolePath("my-team");
    }
    return rolePath(cleanLink);
  }

  // 2. Fall back to type-based mapping
  const mapping = NOTIFICATION_TYPE_MAP[type];
  if (mapping) {
    // Handle user module with role check
    if (related_module === "user" && mapping.page === "manage-users" && !isAdminOrManager) {
      return rolePath("my-profile");
    }

    // Handle team module: members see my-team, admin/manager see manage-team
    if (related_module === "team" && mapping.page === "manage-team" && !isAdminOrManager) {
      if (mapping.buildPath && related_id) {
        return rolePath("my-team");
      }
      return rolePath("my-team");
    }

    if (mapping.buildPath && related_id) {
      const dest = mapping.buildPath(related_id);
      let path = rolePath(dest);
      if (mapping.from) path += `?from=${mapping.from}`;
      return path;
    }

    return rolePath(mapping.page);
  }

  // 3. Module-based fallback
  if (related_module && related_id) {
    const moduleMapping = ACTIVITY_MODULE_MAP[related_module];
    if (moduleMapping) {
      if (related_module === "user" && !isAdminOrManager) {
        return rolePath("my-profile");
      }
      return rolePath(moduleMapping.buildPath(related_id));
    }
  }

  // 4. Final fallback: dashboard
  return rolePath("dashboard");
}

/**
 * Resolve the navigation destination for a dashboard activity item.
 *
 * Activity items come from the DashboardController's merged workflow events
 * and have: module, action, entity_id, id.
 *
 * @param {Object} item - Activity item from dashboard API
 * @param {string} item.module - Module name (task, project, deliverable, user)
 * @param {number|string} item.entity_id - Entity ID (may be null/undefined)
 * @param {string} item.id - Composite ID string (e.g., "task_event_123")
 * @returns {string} Role-prefixed path for navigation
 */
export function getActivityDestination(item) {
  const { module: mod, entity_id, id } = item;
  const role = getCurrentRole();
  const isAdminOrManager = role === "admin" || role === "manager";

  // Extract entity_id from composite ID if not directly available
  const resolvedId = entity_id || extractIdFromComposite(id, mod);

  // User module: check role permissions
  if (mod === "user") {
    if (resolvedId && isAdminOrManager) {
      return rolePath(`manage-users/user-profile/${resolvedId}`);
    }
    // Non-admin: fallback to manage-users listing (or my-profile)
    return rolePath(isAdminOrManager ? "manage-users" : "my-profile");
  }

  // Task module
  if (mod === "task") {
    if (resolvedId) {
      return rolePath(`tasks/task-details/${resolvedId}`);
    }
    return rolePath("tasks");
  }

  // Project module
  if (mod === "project") {
    if (resolvedId) {
      return rolePath(`projects/project-details/${resolvedId}`);
    }
    return rolePath("projects");
  }

  // Deliverable module
  if (mod === "deliverable") {
    if (resolvedId) {
      return rolePath(`deliveries/deliverable-details/${resolvedId}`);
    }
    return rolePath("deliveries");
  }

  // Team module
  if (mod === "team") {
    if (!isAdminOrManager) {
      return rolePath("my-team");
    }
    if (resolvedId) {
      return rolePath(`manage-team?selectedTeam=${resolvedId}`);
    }
    return rolePath("manage-team");
  }

  // Unknown module: fallback to dashboard
  return rolePath("dashboard");
}

/**
 * Get the sidebar "from" parameter for an activity item.
 * This ensures the correct sidebar sub-link is highlighted when
 * navigating to a detail page from the dashboard.
 *
 * @param {Object} item - Activity item
 * @returns {string} The "from" query parameter value
 */
export function getActivityFrom(item) {
  const mapping = ACTIVITY_MODULE_MAP[item.module];
  return mapping?.from || item.module || "dashboard";
}

/**
 * Extract entity ID from a composite activity ID string.
 * Composite IDs follow patterns like:
 *   - "task_event_123" → 123
 *   - "task_sub_123" → 123
 *   - "project_event_123" → 123
 *   - "dlv_event_123" → 123
 *   - "dlv_sub_123" → 123
 *
 * @param {string} compositeId - The composite ID string
 * @param {string} module - Module name for prefix matching
 * @returns {string|null} Extracted ID or null
 */
function extractIdFromComposite(compositeId, module) {
  if (!compositeId) return null;
  const str = String(compositeId);

  // Try common patterns
  const patterns = [
    /task_event_(\d+)/,
    /task_sub_(\d+)/,
    /project_event_(\d+)/,
    /project_sub_(\d+)/,
    /deliverable_event_(\d+)/,
    /deliverable_sub_(\d+)/,
    /dlv_event_(\d+)/,
    /dlv_sub_(\d+)/,
    /user_activity_(\d+)/,
    /team_activity_(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = str.match(pattern);
    if (match) return match[1];
  }

  // If it's already a plain numeric ID, return as-is
  if (/^\d+$/.test(str)) return str;

  return null;
}
