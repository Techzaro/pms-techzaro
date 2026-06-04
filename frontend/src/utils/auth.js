/**
 * Role-based authentication helper.
 *
 * Per-tab identity  → sessionStorage  (tab-scoped, never shared)
 *   currentRole – which role THIS tab is logged in as
 *
 * Per-role data     → localStorage    (shared across tabs)
 *   token_{role} – bearer token
 *   user_{role}  – JSON user object
 *
 * This lets 4 tabs (admin, manager, team_lead, member) coexist.
 * A second login with the SAME role kicks out the old tab for that role.
 */

const ROLES = ["admin", "manager", "team_lead", "member"];

/* ───── current role (tab-scoped) ───── */

export function getCurrentRole() {
  return sessionStorage.getItem("currentRole") || "";
}

export function setCurrentRole(role) {
  sessionStorage.setItem("currentRole", role);
}

/* ───── token (per-role, shared) ───── */

export function getToken(role) {
  const r = role || getCurrentRole();
  return localStorage.getItem(`token_${r}`) || "";
}

export function setToken(role, token) {
  localStorage.setItem(`token_${role}`, token);
}

export function removeToken(role) {
  localStorage.removeItem(`token_${role}`);
}

/* ───── user object (per-role, shared) ───── */

export function getUser(role) {
  const r = role || getCurrentRole();
  try {
    return JSON.parse(localStorage.getItem(`user_${r}`)) || null;
  } catch {
    return null;
  }
}

export function setUser(role, user) {
  localStorage.setItem(`user_${role}`, JSON.stringify(user));
}

export function removeUser(role) {
  localStorage.removeItem(`user_${role}`);
}

/* ───── convenience shortcuts ───── */

export function authToken() {
  return getToken();
}

export function authHeaders() {
  const t = authToken();
  return {
    "Content-Type": "application/json",
    Authorization: t ? `Bearer ${t}` : "",
  };
}

/* ───── session management ───── */

export function saveSession(role, token, user) {
  setCurrentRole(role);
  setToken(role, token);
  setUser(role, user);
}

export function clearSession(role) {
  removeToken(role);
  removeUser(role);
  if (getCurrentRole() === role) {
    sessionStorage.removeItem("currentRole");
  }
}

export function clearAllSessions() {
  ROLES.forEach((r) => {
    localStorage.removeItem(`token_${r}`);
    localStorage.removeItem(`user_${r}`);
  });
  sessionStorage.removeItem("currentRole");
  // also clean up legacy keys
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
  localStorage.removeItem("name");
  localStorage.removeItem("email");
}

export function hasSession(role) {
  return !!getToken(role);
}

export function getDisplayUser() {
  const role = getCurrentRole();
  const user = getUser(role);
  if (!user) return null;
  return {
    name: user.name || "User",
    email: user.email || "",
    role: user.role || role,
  };
}
