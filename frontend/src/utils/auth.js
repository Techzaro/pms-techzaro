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

/* ───── current role (strictly tab-scoped, no cross-tab leakage) ───── */

export function getCurrentRole() {
  return sessionStorage.getItem("currentRole") || "";
}

export function setCurrentRole(role) {
  try { sessionStorage.setItem("currentRole", role); } catch {}
}

/* ───── session ID (strictly tab-scoped, no cross-tab leakage) ───── */

export function getSessionId() {
  return sessionStorage.getItem("sessionId") || "";
}

export function setSessionId(id) {
  if (id) {
    try { sessionStorage.setItem("sessionId", id); } catch {}
  } else {
    try { sessionStorage.removeItem("sessionId"); } catch {}
  }
}

/* ───── token ───── */

export function getToken(role) {
  let r = role || getCurrentRole();
  if (!r) return "";

  let sid = getSessionId();

  // Try to migrate old tabs on first access
  if (!sid && r) {
    const migrated = _migrateIfNeeded();
    if (!migrated) return "";
    sid = getSessionId();
  }

  let sessions = _getSessions(r);
  let sess = sid ? sessions[sid] : null;

  // No fallback to other tabs' sessions — each tab owns its own session
  // If session not found or expired, return empty (forces re-login)
  if (!sess || (sess.expiresAt && Date.now() > sess.expiresAt)) {
    if (sess && sess.expiresAt && Date.now() > sess.expiresAt) {
      // Clean up expired session from pool
      delete sessions[sid];
      _setSessions(r, sessions);
    }
    sessionStorage.removeItem("sessionId");
    return "";
  }

  if (!sess) return "";

  // Check expiration
  if (sess.expiresAt && Date.now() > sess.expiresAt) {
    delete sessions[sid];
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
  let r = role || getCurrentRole();
  if (!r) return null;

  let sid = getSessionId();

  // Try to migrate old tabs on first access
  if (!sid && r) {
    const migrated = _migrateIfNeeded();
    if (!migrated) return null;
    sid = getSessionId();
  }

  let sessions = _getSessions(r);
  let sess = sid ? sessions[sid] : null;

  // No fallback to other tabs' sessions
  if (!sess || (sess.expiresAt && Date.now() > sess.expiresAt)) {
    if (sess && sess.expiresAt && Date.now() > sess.expiresAt) {
      delete sessions[sid];
      _setSessions(r, sessions);
    }
    sessionStorage.removeItem("sessionId");
    return null;
  }

  if (!sess) return null;

  if (sess.expiresAt && Date.now() > sess.expiresAt) {
    delete sessions[sid];
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
      if (user && typeof user === "object") {
        const prevUser = sessions[sid].user || {};
        const cleanedUser = { ...user };
        // Don't overwrite existing valid regional preferences with null or undefined
        ["language", "timezone", "date_format", "time_format", "working_hours"].forEach((k) => {
          if ((cleanedUser[k] === undefined || cleanedUser[k] === null || cleanedUser[k] === "") && prevUser[k]) {
            cleanedUser[k] = prevUser[k];
          }
        });
        if (cleanedUser.language) {
          try {
            localStorage.setItem("pms_active_language", cleanedUser.language);
          } catch {}
        }
        sessions[sid].user = { ...prevUser, ...cleanedUser };
      } else {
        sessions[sid].user = user;
      }
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
 * Clears only THIS tab's sessions. Other tabs remain unaffected.
 */
export function clearAllSessions() {
  const r = getCurrentRole();
  const sid = getSessionId();

  // Only remove THIS tab's session from the pool
  if (r && sid) {
    const sessions = _getSessions(r);
    if (sessions[sid]) {
      delete sessions[sid];
      _setSessions(r, sessions);
    }
  }

  // Clear only this tab's sessionStorage
  sessionStorage.removeItem("sessionId");
  sessionStorage.removeItem("currentRole");
  sessionStorage.removeItem("tenant_slug");

  // Clear legacy keys
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
  localStorage.removeItem("name");
  localStorage.removeItem("email");
  localStorage.removeItem("lastActiveRole");
  localStorage.removeItem("lastActiveSessionId");
}

export function getTenantSlug() {
  // Per-tab only: never share tenant_slug across tabs via localStorage
  const stored = sessionStorage.getItem("tenant_slug") || "";
  // Also try to extract from URL path as fallback
  const pathMatch = window.location.pathname.match(/^\/org\/([a-z0-9\-]+)(?:\/|$)/);
  const urlSlug = pathMatch ? pathMatch[1] : "";
  // Prefer stored value, but if it looks wrong (doesn't match URL), use URL slug
  if (stored && urlSlug && stored !== urlSlug) {
    setTenantSlug(urlSlug);
    return urlSlug;
  }
  return stored || urlSlug;
}

export function setTenantSlug(slug) {
  if (slug) {
    sessionStorage.setItem("tenant_slug", slug);
  } else {
    sessionStorage.removeItem("tenant_slug");
  }
}

export function clearTenantSlug() {
  sessionStorage.removeItem("tenant_slug");
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

/**
 * Generate a path under the current organization: /org/{slug}/{page}
 * Falls back to /login if no slug is available.
 * This replaces the old role-based /{role}/{page} pattern.
 */
export function rolePath(page = "") {
  const slug = getTenantSlug();
  if (!slug) return page ? `/login` : `/login`;
  return page ? `/org/${slug}/${page}` : `/org/${slug}/dashboard`;
}

export function getUrlRole() {
  const path = window.location.pathname;
  const match = path.match(/^\/org\/([a-z0-9\-]+)(?:\/|$)/);
  return match ? match[1] : "";
}

/* ───── role display normalization ───── */

export function normalizeRole(role) {
  if (!role) return "";
  if (role === "team_lead" || role === "teamlead") return "Team Lead";
  if (role === "guest") return "Guest";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/* ═══════════════════════════════════════════════════════════════
   SUPER ADMIN SESSION MANAGEMENT
   Completely separate from PMS session management.
   Uses its own storage keys to ensure security isolation.
   ═══════════════════════════════════════════════════════════════ */

const SUPER_ADMIN_STORAGE_KEY = "sessions_super_admin";
const SUPER_ADMIN_ROLE_KEY = "superAdminRole";
const SUPER_ADMIN_SESSION_KEY = "superAdminSessionId";

function _getSuperAdminSessions() {
  try {
    return JSON.parse(localStorage.getItem(SUPER_ADMIN_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function _setSuperAdminSessions(sessions) {
  localStorage.setItem(SUPER_ADMIN_STORAGE_KEY, JSON.stringify(sessions));
}

export function getSuperAdminRole() {
  return sessionStorage.getItem(SUPER_ADMIN_ROLE_KEY) || "super_admin";
}

export function setSuperAdminRole(role) {
  sessionStorage.setItem(SUPER_ADMIN_ROLE_KEY, role);
}

export function getSuperAdminSessionId() {
  return sessionStorage.getItem(SUPER_ADMIN_SESSION_KEY) || "";
}

export function setSuperAdminSessionId(id) {
  sessionStorage.setItem(SUPER_ADMIN_SESSION_KEY, id);
}

export function getSuperAdminToken() {
  const sid = getSuperAdminSessionId();
  if (!sid) return "";

  const sessions = _getSuperAdminSessions();
  const sess = sessions[sid];
  if (!sess) return "";

  if (sess.expiresAt && Date.now() > sess.expiresAt) {
    delete sessions[sid];
    _setSuperAdminSessions(sessions);
    sessionStorage.removeItem(SUPER_ADMIN_SESSION_KEY);
    return "";
  }

  return sess.token || "";
}

export function getSuperAdminUser() {
  const sid = getSuperAdminSessionId();
  if (!sid) return null;

  const sessions = _getSuperAdminSessions();
  const sess = sessions[sid];
  if (!sess) return null;

  if (sess.expiresAt && Date.now() > sess.expiresAt) {
    delete sessions[sid];
    _setSuperAdminSessions(sessions);
    sessionStorage.removeItem(SUPER_ADMIN_SESSION_KEY);
    return null;
  }

  return sess.user || null;
}

export function saveSuperAdminSession(token, user, rememberMe = false, expiresAt = null) {
  const sessions = _getSuperAdminSessions();
  const sid = "sess_sa_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);

  const durationMs = rememberMe ? 24 * 60 * 60 * 1000 : 3 * 60 * 60 * 1000;
  const calculatedExpiry = expiresAt ? new Date(expiresAt).getTime() : Date.now() + durationMs;

  sessions[sid] = {
    token,
    user,
    rememberMe: Boolean(rememberMe),
    expiresAt: calculatedExpiry,
    createdAt: Date.now(),
  };
  _setSuperAdminSessions(sessions);

  setSuperAdminRole("super_admin");
  setSuperAdminSessionId(sid);

  return true;
}

export function clearSuperAdminSession() {
  const sid = getSuperAdminSessionId();

  if (sid) {
    const sessions = _getSuperAdminSessions();
    if (sessions[sid]) {
      delete sessions[sid];
      _setSuperAdminSessions(sessions);
    }
    sessionStorage.removeItem(SUPER_ADMIN_SESSION_KEY);
  }

  sessionStorage.removeItem(SUPER_ADMIN_ROLE_KEY);
}

export function superAdminAuthToken() {
  return getSuperAdminToken();
}

export async function logoutSuperAdmin() {
  const sid = getSuperAdminSessionId();
  const sessions = _getSuperAdminSessions();
  const token = sid ? sessions[sid]?.token : null;

  if (token) {
    try {
      const rawUrl = import.meta.env.VITE_API_URL || "";
      const apiUrl = rawUrl.replace(/\/+$/g, "");
      await fetch(`${apiUrl}/super-admin/logout`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    } catch { /* ignore network error during logout */ }
  }

  clearSuperAdminSession();

  try {
    window.history.replaceState(null, "", "/super-admin/login");
  } catch {}
  window.location.replace("/super-admin/login");
}
