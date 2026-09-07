/**
 * @file api.js
 * @description API configuration and global fetch interceptor.
 * Handles session expiration detection, automatic notification display,
 * and cross-tab session synchronization.
 */

import { getCurrentRole, getToken, clearSession, getSessionId, getTenantSlug } from "../utils/auth";
import { isAdminDomain } from "../utils/domain";
import { notify } from "../utils/notify";

/** @type {string} API base URL without trailing slashes */
const rawApiUrl = import.meta.env.VITE_API_URL || "";
const API_URL = rawApiUrl.replace(/\/+$/g, "");

// Global fetch interceptor for session management and notifications
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  try {
    const [resource, config = {}] = args;
    const tenantSlug = getTenantSlug();
    const url = typeof resource === 'string' ? resource : resource?.url || '';
    const skipTenantHeader = url.includes('/login') || url.includes('/forgot-password') || url.includes('/reset-password') || url.includes('/public/') || url.includes('/super-admin');

    // Only add tenant header, don't force no-cache (allows browser HTTP cache for GET requests)
    const headers = { ...config.headers };
    if (tenantSlug && !skipTenantHeader) {
      headers["X-Tenant-ID"] = tenantSlug;
    }
    const noCacheConfig = { ...config, headers };

    const role = getCurrentRole();
    const tokenAtRequest = getToken(role);
    const res = await originalFetch.apply(this, [resource, noCacheConfig]);

    // Handle session expiration (401 Unauthorized)
    if (res.status === 401) {
      const url = typeof resource === "string" ? resource : resource?.url || "";
      if (url.includes("/super-admin")) return res;
      // On admin domain, super admin has its own 401 handling (superAdminApi.js)
      // Skip zombie tab detection to avoid cross-role interference from shared localStorage
      if (isAdminDomain()) return res;
      const tokenNow = getToken(role);
      const isTokenExpired = tokenNow && tokenNow === tokenAtRequest;
      const isZombieTab = !tokenAtRequest && !tokenNow && role;
      if (isTokenExpired || isZombieTab) {
        clearSession(role);
        const reason = isZombieTab
          ? "Your session is no longer valid. Please login again."
          : "Your session has expired. Please login again.";
        let targetMsg = reason;
        try {
          const clone = res.clone();
          const data = await clone.json();
          if (data?.message === "resigned") {
            targetMsg = "Your account has been resigned. You no longer have access.";
          }
        } catch {}

        // Domain-aware redirect
        const loginPath = isAdminDomain() ? "/super-admin/login" : "/login";
        try {
          window.history.replaceState(null, "", loginPath);
        } catch {}
        window.location.replace(`${loginPath}?message=${encodeURIComponent(targetMsg)}`);
      }
    }

    // Auto-show notifications for API responses (unless disabled via _notifHandled)
    // Single clone + parse to avoid double-parsing the response body
    if (!config._notifHandled && res.status !== 204) {
      const notifUrl = typeof resource === "string" ? resource : resource?.url || "";
      const isApiCall = notifUrl.includes("/api") || (API_URL && notifUrl.includes(API_URL));
      if (isApiCall) {
        try {
          const clone = res.clone();
          const data = await clone.json();
          if (data?.success === true && data?.message && typeof data.message === "string") {
            notify.success(data.message);
          } else if (data?.success === false && data?.message && typeof data.message === "string") {
            notify.error(data.message);
          }
        } catch {}
      }
    }

    return res;
  } catch (e) {
    throw e;
  }
};

/**
 * Invalidates React Query cache (placeholder for future implementation).
 */
export function invalidateCache() {}

/**
 * Called after mutations (placeholder for future implementation).
 */
export function onMutation() {}

// Cross-tab session synchronization
// Detects when our session is removed by another tab (e.g. logout)
// NOTE: On admin domain, skip entirely — super admin uses its own session management
// (clearSuperAdminSession + superAdminApi.js handles 401s independently)
let _sessionConflictHandled = false;
window.addEventListener("storage", (e) => {
  if (!e.key || _sessionConflictHandled) return;
  if (isAdminDomain()) return;

  const role = getCurrentRole();
  if (!role) return;
  const sid = getSessionId();
  if (!sid) return;

  // Only react to sessions_{role} changes
  if (e.key !== `sessions_${role}`) return;

  // No change — ignore
  if (e.newValue === e.oldValue) return;

  try {
    const oldSessions = e.oldValue ? JSON.parse(e.oldValue) : {};
    const newSessions = e.newValue ? JSON.parse(e.newValue) : {};

    // Our session was explicitly removed (existed before, gone now)
    if (oldSessions[sid] && !newSessions[sid]) {
      _sessionConflictHandled = true;
      clearSession(role);
      const loginPath = isAdminDomain() ? "/super-admin/login" : "/login";
      try {
        window.history.replaceState(null, "", loginPath);
      } catch {}
      window.location.replace(`${loginPath}?message=${encodeURIComponent("You have been logged in from another tab.")}`);
    }
  } catch {
    // Parse error — ignore (don't force logout on corrupted data)
  }
});

export default API_URL;
