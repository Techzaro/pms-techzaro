/**
 * @file auth.js
 * @description Role-based authentication helper for multi-role session management.
 *
 * Storage strategy:
 * - Per-tab identity (sessionStorage): currentRole + sessionId
 * - Per-role sessions (localStorage): sessions_{role} = { sessionId: {token, user}, ... }
 *
 * Each tab claims a unique sessionId within its role's session pool.
 * Unlimited tabs per role are allowed.
 *
 * Migration: old tabs that have currentRole but no sessionId are automatically
 * migrated into the session pool on first use.
 */

const ROLES = ["admin", "manager", "team_lead", "member", "guest"];

/* ───── session ID generation ───── */

function _generateSessionId() {
  return "sess_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

/* ───── raw sessions object access ───── */

function _getSessions(role) {
  try {
    return JSON.parse(localStorage.getItem(`sessions_${role}`)) || {};
  } catch {
    return {};
  }
}

function _setSessions(role, sessions) {
  localStorage.setItem(`sessions_${role}`, JSON.stringify(sessions));
}

/* ───── migration: old tabs → session pool ───── */

/**
 * Attempts to migrate a legacy tab (has currentRole but no sessionId)
 * into the session pool. Returns true if migration succeeded or wasn't needed.
 */
function _migrateIfNeeded() {
  const role = getCurrentRole();
  const sid = getSessionId();
  if (!role) return true;
  if (sid) return true;

  const legacyToken = localStorage.getItem(`token_${role}`);
  let legacyUser = null;
  try {
    legacyUser = JSON.parse(localStorage.getItem(`user_${role}`)) || null;
  } catch {}

  if (!legacyToken) return true;

  const sessions = _getSessions(role);
  const existingSid = Object.keys(sessions).find(k => sessions[k].token === legacyToken);
  if (existingSid) {
    setSessionId(existingSid);
    return true;
  }

  const newSid = _generateSessionId();
  sessions[newSid] = { token: legacyToken, user: legacyUser };
  _setSessions(role, sessions);
  setSessionId(newSid);
  return true;
}

/* ───── current role (tab-scoped) ───── */

export function getCurrentRole() {
  return sessionStorage.getItem("currentRole") || "";
}

export function setCurrentRole(role) {
  sessionStorage.setItem("currentRole", role);
}

/* ───── session ID (tab-scoped) ───── */

export function getSessionId() {
  return sessionStorage.getItem("sessionId") || "";
}

export function setSessionId(id) {
  sessionStorage.setItem("sessionId", id);
}

/* ───── token ───── */

export function getToken(role) {
  const r = role || getCurrentRole();
  const sid = getSessionId();

  // Try to migrate old tabs on first access
  if (!sid && r) {
    const migrated = _migrateIfNeeded();
    if (!migrated) return "";
  }

  const finalSid = getSessionId();
  if (!finalSid) return "";

  const sessions = _getSessions(r);
  const sess = sessions[finalSid];
  if (!sess) return "";

  // Check expiration (24h for rememberMe, 3h default)
  if (sess.expiresAt && Date.now() > sess.expiresAt) {
    delete sessions[finalSid];
    _setSessions(r, sessions);
    sessionStorage.removeItem("sessionId");
    return "";
  }

  return sess.token || "";
}

export function setToken(role, token) {
  const r = role || getCurrentRole();
  const sid = getSessionId();

  if (sid) {
    const sessions = _getSessions(r);
    if (sessions[sid]) {
      sessions[sid].token = token;
      _setSessions(r, sessions);
    }
  }
}

export function removeToken(role) {
  const r = role || getCurrentRole();
  const sid = getSessionId();

  if (sid) {
    const sessions = _getSessions(r);
    if (sessions[sid]) {
      delete sessions[sid];
      _setSessions(r, sessions);
    }
    sessionStorage.removeItem("sessionId");
  }
}

/* ───── user object ───── */

export function getUser(role) {
  const r = role || getCurrentRole();
  const sid = getSessionId();

  // Try to migrate old tabs on first access
  if (!sid && r) {
    const migrated = _migrateIfNeeded();
    if (!migrated) return null;
  }

  const finalSid = getSessionId();
  if (!finalSid) return null;

  const sessions = _getSessions(r);
  const sess = sessions[finalSid];
  if (!sess) return null;

  if (sess.expiresAt && Date.now() > sess.expiresAt) {
    delete sessions[finalSid];
    _setSessions(r, sessions);
    sessionStorage.removeItem("sessionId");
    return null;
  }

  return sess.user || null;
}

export function setUser(role, user) {
  const r = role || getCurrentRole();
  const sid = getSessionId();

  if (sid) {
    const sessions = _getSessions(r);
    if (sessions[sid]) {
      sessions[sid].user = user;
      _setSessions(r, sessions);
    }
  }
}

export function removeUser(role) {
  const r = role || getCurrentRole();
  const sid = getSessionId();

  if (sid) {
    const sessions = _getSessions(r);
    if (sessions[sid]) {
      sessions[sid].user = null;
      _setSessions(r, sessions);
    }
  }
}

/* ───── convenience shortcuts ───── */

export function authToken() {
  return getToken();
}

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
 * Saves a complete session (role, token, user) for this tab.
 * Stores token in localStorage with 24-hour expiration if rememberMe is true.
 * @param {string} role
 * @param {string} token
 * @param {object} user
 * @param {boolean} [rememberMe=false]
 * @param {string|number} [expiresAt=null]
 * @returns {boolean} always true
 */
export function saveSession(role, token, user, rememberMe = false, expiresAt = null) {
  const sessions = _getSessions(role);
  const sid = _generateSessionId();

  // 24 hours (1 day) expiration if rememberMe, else default 3 hours
  const durationMs = rememberMe ? 24 * 60 * 60 * 1000 : 3 * 60 * 60 * 1000;
  const calculatedExpiry = expiresAt ? new Date(expiresAt).getTime() : Date.now() + durationMs;

  sessions[sid] = {
    token,
    user,
    rememberMe: Boolean(rememberMe),
    expiresAt: calculatedExpiry,
    createdAt: Date.now(),
  };
  _setSessions(role, sessions);

  setCurrentRole(role);
  setSessionId(sid);

  return true;
}

/**
 * Clears the session for this tab only.
 * Other tabs with the same role remain unaffected.
 */
export function clearSession(role) {
  const r = role || getCurrentRole();
  const sid = getSessionId();

  if (sid) {
    const sessions = _getSessions(r);
    if (sessions[sid]) {
      delete sessions[sid];
      _setSessions(r, sessions);
    }
    sessionStorage.removeItem("sessionId");
  }

  localStorage.removeItem(`token_${r}`);
  localStorage.removeItem(`user_${r}`);

  if (getCurrentRole() === r) {
    sessionStorage.removeItem("currentRole");
  }
}

/**
 * Clears all sessions for all roles and tab state.
 */
export function clearAllSessions() {
  ROLES.forEach((r) => {
    localStorage.removeItem(`sessions_${r}`);
    localStorage.removeItem(`token_${r}`);
    localStorage.removeItem(`user_${r}`);
  });
  sessionStorage.clear();
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
  localStorage.removeItem("name");
  localStorage.removeItem("email");
}

export function getTenantSlug() {
  return localStorage.getItem("tenant_slug") || "";
}

export function clearTenantSlug() {
  localStorage.removeItem("tenant_slug");
}

/* ───── stored email fallback (for super-admin / cross-role use) ── */

export function setStoredEmail(role, email) {
  if (role && email) localStorage.setItem(`stored_email_${role}`, email);
}

export function getStoredEmail(role) {
  return localStorage.getItem(`stored_email_${role}`) || "";
}

/**
 * Performs a complete, secure user logout.
 * Clears storage, invalidates session API-side, and replaces history entry to /logged-out or /login.
 * @param {string} [reason] - Optional reason code (e.g. "inactivity")
 */
export async function logoutUser(reason = "") {
  const role = getCurrentRole();
  const sid = getSessionId();

  if (role && sid) {
    const sessions = _getSessions(role);
    const token = sessions[sid]?.token;
    if (token) {
      try {
        const rawUrl = import.meta.env.VITE_API_URL || "";
        const apiUrl = rawUrl.replace(/\/+$/g, "");
        await fetch(`${apiUrl}/logout`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          cache: "no-store",
          _notifHandled: true,
        });
      } catch { /* ignore network error during logout */ }
    }
  }

  clearAllSessions();

  const redirectUrl = reason ? `/logged-out?reason=${encodeURIComponent(reason)}` : "/logged-out";
  try {
    window.history.replaceState(null, "", redirectUrl);
  } catch {}
  window.location.replace(redirectUrl);
}

/* ───── multi-tab helpers ───── */

/**
 * Returns the number of active sessions for a role.
 */
export function getActiveSessionCount(role) {
  const sessions = _getSessions(role);
  return Object.keys(sessions).length;
}

/**
 * Checks if a session exists for a specific role.
 */
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
    avatar: user.avatar || null,
  };
}

/* ───── role-prefixed path helper ───── */

const ROLE_URL_MAP = {
  admin: "admin",
  manager: "manager",
  team_lead: "teamlead",
  teamlead: "teamlead",
  member: "member",
  guest: "guest",
};

export function rolePath(page = "") {
  const role = getCurrentRole() || "member";
  const urlRole = ROLE_URL_MAP[role] || "member";
  return page ? `/${urlRole}/${page}` : `/${urlRole}/dashboard`;
}

export function getUrlRole() {
  return ROLE_URL_MAP[getCurrentRole()] || "member";
}

/* ───── role display normalization ───── */

export function normalizeRole(role) {
  if (!role) return "";
  if (role === "team_lead" || role === "teamlead") return "Team Lead";
  if (role === "guest") return "Guest";
  return role.charAt(0).toUpperCase() + role.slice(1);
}
