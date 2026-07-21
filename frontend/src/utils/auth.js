/**
 * @file auth.js
 * @description Role-based authentication helper for multi-role session management.
 *
 * Storage strategy:
 * - Per-tab identity (sessionStorage): currentRole + sessionId
 * - Per-role sessions (localStorage): sessions_{role} = { sessionId: {token, user}, ... }
 *
 * This allows up to 3 tabs per access role simultaneously.
 * Each tab claims a unique sessionId within its role's session pool.
 *
 * Migration: old tabs that have currentRole but no sessionId are automatically
 * migrated into the session pool on first use.
 */

const ROLES = ["admin", "manager", "team_lead", "member", "guest"];
const MAX_SESSIONS_PER_ROLE = 3;

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
 * Returns false if max tabs reached and migration failed.
 */
function _migrateIfNeeded() {
  const role = getCurrentRole();
  const sid = getSessionId();
  if (!role) return true;
  if (sid) return true;

  // Has role but no sessionId — try to migrate from legacy storage
  const legacyToken = localStorage.getItem(`token_${role}`);
  let legacyUser = null;
  try {
    legacyUser = JSON.parse(localStorage.getItem(`user_${role}`)) || null;
  } catch {}

  if (!legacyToken) return true;

  // Check if this exact token is already in the pool (another tab for same user)
  const sessions = _getSessions(role);
  const existingEntry = Object.values(sessions).find(s => s.token === legacyToken);
  if (existingEntry) {
    // Token already tracked — find its sessionId and claim it
    const existingSid = Object.keys(sessions).find(k => sessions[k].token === legacyToken);
    setSessionId(existingSid);
    return true;
  }

  // Try to claim a new slot
  const activeCount = Object.keys(sessions).length;
  if (activeCount >= MAX_SESSIONS_PER_ROLE) {
    // Max reached — force re-login
    return false;
  }

  // Create new session entry
  const newSid = _generateSessionId();
  sessions[newSid] = { token: legacyToken, user: legacyUser };
  _setSessions(role, sessions);
  setSessionId(newSid);
  return true;
}

/* ───── cleanup: evict oldest sessions when over limit ───── */

function _cleanupExcessSessions(role) {
  const sessions = _getSessions(role);
  const keys = Object.keys(sessions);
  if (keys.length <= MAX_SESSIONS_PER_ROLE) return;

  // Sort by sessionId timestamp (older = smaller timestamp in sess_XXXX)
  keys.sort((a, b) => {
    const timeA = parseInt(a.split("_")[1], 36) || 0;
    const timeB = parseInt(b.split("_")[1], 36) || 0;
    return timeA - timeB;
  });

  // Remove oldest entries until we're at the limit
  const toRemove = keys.slice(0, keys.length - MAX_SESSIONS_PER_ROLE);
  toRemove.forEach(k => delete sessions[k]);
  _setSessions(role, sessions);
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
  return sessions[finalSid]?.token || "";
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
  return sessions[finalSid]?.user || null;
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
 * Claims a slot in the role's session pool (max 3 per role).
 * Evicts oldest sessions if over limit.
 * @returns {boolean} true if session was saved, false if max tabs reached
 */
export function saveSession(role, token, user) {
  // Cleanup excess first (in case stale entries exist)
  _cleanupExcessSessions(role);

  const sessions = _getSessions(role);
  const activeCount = Object.keys(sessions).length;

  if (activeCount >= MAX_SESSIONS_PER_ROLE) {
    return false;
  }

  const sid = _generateSessionId();
  sessions[sid] = { token, user };
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
 * Clears all sessions for all roles.
 */
export function clearAllSessions() {
  ROLES.forEach((r) => {
    localStorage.removeItem(`sessions_${r}`);
    localStorage.removeItem(`token_${r}`);
    localStorage.removeItem(`user_${r}`);
  });
  sessionStorage.removeItem("currentRole");
  sessionStorage.removeItem("sessionId");
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
  localStorage.removeItem("name");
  localStorage.removeItem("email");
}

/* ───── multi-tab helpers ───── */

/**
 * Checks if a new session can be added for the given role (max 3 tabs).
 */
export function canAddSession(role) {
  const sessions = _getSessions(role);
  return Object.keys(sessions).length < MAX_SESSIONS_PER_ROLE;
}

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
