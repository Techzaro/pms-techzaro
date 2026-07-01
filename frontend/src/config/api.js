/**
 * @file api.js
 * @description API configuration and global fetch interceptor.
 * Handles session expiration detection, automatic notification display,
 * and cross-tab session synchronization.
 */

import { getCurrentRole, getToken, clearSession } from "../utils/auth";
import { notify } from "../utils/notify";

/** @type {string} API base URL without trailing slashes */
const rawApiUrl = import.meta.env.VITE_API_URL || "";
const API_URL = rawApiUrl.replace(/\/+$/g, "");

// Global fetch interceptor for session management and notifications
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  try {
    const [resource, config = {}] = args;
    const noCacheConfig = { ...config, cache: 'no-store' };
    const role = getCurrentRole();
    const tokenAtRequest = getToken(role);
    const res = await originalFetch.apply(this, [resource, noCacheConfig]);

    // Handle session expiration (401 Unauthorized)
    if (res.status === 401) {
      const tokenNow = getToken(role);
      if (tokenNow && tokenNow === tokenAtRequest) {
        clearSession(role);
        try {
          const clone = res.clone();
          const data = await clone.json();
          if (data?.message === "resigned") {
            window.location.href = "/?message=" + encodeURIComponent("Your account has been resigned. You no longer have access.");
          } else {
            window.location.href = "/?message=" + encodeURIComponent("Your session has expired. Please login again.");
          }
        } catch {
          window.location.href = "/?message=" + encodeURIComponent("Your session has expired. Please login again.");
        }
      }
    }

    // Auto-show notifications for API responses (unless disabled via _notifHandled)
    if (!config._notifHandled && res.status !== 204) {
      const url = typeof resource === "string" ? resource : resource?.url || "";
      const isApiCall = url.includes("/api") || (API_URL && url.includes(API_URL));
      if (isApiCall) {
        try {
          const clone = res.clone();
          const data = await clone.json();
          if (data?.success === true && data?.message) {
            notify.success(data.message);
          } else if (data?.success === false && data?.message) {
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
// Detects when token changes in another tab and logs out this tab
let _sessionConflictHandled = false;
window.addEventListener("storage", (e) => {
  if (!e.key || _sessionConflictHandled) return;
  const role = getCurrentRole();
  if (!role) return;
  if (e.key === `token_${role}` && e.oldValue && e.newValue && e.oldValue !== e.newValue) {
    _sessionConflictHandled = true;
    clearSession(role);
    window.location.href = "/?message=" + encodeURIComponent("You have been logged in from another tab.");
  }
});

export default API_URL;
