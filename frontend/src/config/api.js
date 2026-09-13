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
    const role = getCurrentRole();
    const tokenAtRequest = getToken(role);

    // Dynamically attach authorization header if not already provided
    if (tokenAtRequest && !skipTenantHeader && !headers.Authorization && !headers.authorization) {
      headers.Authorization = `Bearer ${tokenAtRequest}`;
    }

    const noCacheConfig = { ...config, headers };
    const res = await originalFetch.apply(this, [resource, noCacheConfig]);

    // Handle session expiration (401 Unauthorized)
    if (res.status === 401) {
      const url = typeof resource === "string" ? resource : resource?.url || "";
      if (url.includes("/super-admin")) return res;
      // On admin domain, super admin has its own 401 handling (superAdminApi.js)
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
// Detects when our session is removed by another tab (logout)
let _sessionConflictHandled = false;
window.addEventListener("storage", (e) => {
  if (!e.key || _sessionConflictHandled) return;
  if (isAdminDomain()) return;

  // If token or active_role was removed across tabs (logout)
  if (e.key === "token" || e.key === "active_role" || e.key === "currentRole") {
    if (!e.newValue && e.oldValue) {
      _sessionConflictHandled = true;
      clearSession();
      const loginPath = isAdminDomain() ? "/super-admin/login" : "/login";
      try {
        window.history.replaceState(null, "", loginPath);
      } catch {}
      window.location.replace(`${loginPath}?message=${encodeURIComponent("You have been logged out from another tab.")}`);
    }
  }
});

export default API_URL;
