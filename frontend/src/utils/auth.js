/**
 * @file auth.js
 * @description Role-based authentication helper for multi-role session management.
 *
 * Storage strategy:
 * - Per-tab identity (sessionStorage): currentRole - which role THIS tab is logged in as
 * - Per-role data (localStorage): token_{role} and user_{role} - shared across tabs
 *
 * This allows 4 tabs (admin, manager, team_lead, member) to coexist.
 * A second login with the SAME role kicks out the old tab for that role.
 */

const ROLES = ["admin", "manager", "team_lead", "member", "guest"];

/* ───── current role (tab-scoped) ───── */

/**
 * Gets the current role for this browser tab.
 * @returns {string} Current role (admin, manager, team_lead, member) or empty string
 */
export function getCurrentRole() {
  return sessionStorage.getItem("currentRole") || "";
}

/**
 * Sets the current role for this browser tab.
 * @param {string} role - Role to set as current
 */
export function setCurrentRole(role) {
  sessionStorage.setItem("currentRole", role);
}

/* ───── token (per-role, shared) ───── */

/**
 * Gets the authentication token for a specific role.
 * @param {string} [role] - Role to get token for (defaults to current role)
 * @returns {string} Bearer token or empty string
 */
export function getToken(role) {
  const r = role || getCurrentRole();
  return localStorage.getItem(`token_${r}`) || "";
}

/**
 * Stores the authentication token for a specific role.
 * @param {string} role - Role to store token for
 * @param {string} token - Bearer token to store
 */
export function setToken(role, token) {
  localStorage.setItem(`token_${role}`, token);
}

/**
 * Removes the authentication token for a specific role.
 * @param {string} role - Role to remove token for
 */
export function removeToken(role) {
  localStorage.removeItem(`token_${role}`);
}

/* ───── user object (per-role, shared) ───── */

/**
 * Gets the user object for a specific role.
 * @param {string} [role] - Role to get user for (defaults to current role)
 * @returns {Object|null} Parsed user object or null if not found
 */
export function getUser(role) {
  const r = role || getCurrentRole();
  try {
    return JSON.parse(localStorage.getItem(`user_${r}`)) || null;
  } catch {
    return null;
  }
}

/**
 * Stores the user object for a specific role.
 * @param {string} role - Role to store user for
 * @param {Object} user - User object to store (will be JSON stringified)
 */
export function setUser(role, user) {
  localStorage.setItem(`user_${role}`, JSON.stringify(user));
}

/**
 * Removes the user object for a specific role.
 * @param {string} role - Role to remove user for
 */
export function removeUser(role) {
  localStorage.removeItem(`user_${role}`);
}

/* ───── convenience shortcuts ───── */

/**
 * Gets the authentication token for the current role.
 * @returns {string} Bearer token for current role
 */
export function authToken() {
  return getToken();
}

/**
 * Returns headers object with Authorization and Content-Type for API requests.
 * @returns {Object} Headers object with Bearer token
 */
export function authHeaders() {
  const t = authToken();
  if (!t) return { "Content-Type": "application/json" };
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${t}`,
  };
}

/* ───── session management ───── */

/**
 * Saves a complete session (role, token, user) for a specific role.
 * @param {string} role - Role to save session for
 * @param {string} token - Bearer token
 * @param {Object} user - User object
 */
export function saveSession(role, token, user) {
  setCurrentRole(role);
  setToken(role, token);
  setUser(role, user);
}

/**
 * Clears the session for a specific role.
 * @param {string} role - Role to clear session for
 */
export function clearSession(role) {
  removeToken(role);
  removeUser(role);
  if (getCurrentRole() === role) {
    sessionStorage.removeItem("currentRole");
  }
}

/**
 * Clears all sessions for all roles and removes legacy storage keys.
 */
export function clearAllSessions() {
  ROLES.forEach((r) => {
    localStorage.removeItem(`token_${r}`);
    localStorage.removeItem(`user_${r}`);
  });
  sessionStorage.removeItem("currentRole");
  // Clean up legacy keys from older versions
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
  localStorage.removeItem("name");
  localStorage.removeItem("email");
}

/**
 * Checks if a session exists for a specific role.
 * @param {string} role - Role to check
 * @returns {boolean} True if token exists for the role
 */
export function hasSession(role) {
  return !!getToken(role);
}

/**
 * Gets the display user information for the current role.
 * @returns {Object|null} Object with name, email, role or null if not logged in
 */
export function getDisplayUser() {
  const role = getCurrentRole();
  const user = getUser(role);
  if (!user) return null;
  return {
    name: user.name || "User",
    email: user.email || "",
    role: user.role || role,
    avatar: user.avatar || null,
  };
}

/* ───── role-prefixed path helper ───── */

/** Maps role names to URL-friendly role slugs */
const ROLE_URL_MAP = {
  admin: "admin",
  manager: "manager",
  team_lead: "teamlead",
  teamlead: "teamlead",
  member: "member",
  guest: "guest",
};

/**
 * Generates a role-prefixed path for navigation.
 * @param {string} [page=""] - Page name (e.g., "tasks", "projects")
 * @returns {string} Role-prefixed path (e.g., "/admin/tasks")
 */
export function rolePath(page = "") {
  const role = getCurrentRole() || "member";
  const urlRole = ROLE_URL_MAP[role] || "member";
  return page ? `/${urlRole}/${page}` : `/${urlRole}/dashboard`;
}

/**
 * Gets the URL-friendly role slug for the current role.
 * @returns {string} URL role slug (admin, manager, teamlead, member)
 */
export function getUrlRole() {
  return ROLE_URL_MAP[getCurrentRole()] || "member";
}

/* ───── role display normalization ───── */

/**
 * Normalizes a role string for display purposes.
 * @param {string} role - Role to normalize
 * @returns {string} Normalized role (e.g., "team_lead" → "Team Lead")
 */
export function normalizeRole(role) {
  if (!role) return "";
  if (role === "team_lead" || role === "teamlead") return "Team Lead";
  if (role === "guest") return "Guest";
  return role.charAt(0).toUpperCase() + role.slice(1);
}
