/**
 * @file api.js
 * @description API configuration and global fetch interceptor.
 * Handles session expiration detection, automatic notification display,
 * and cross-tab session synchronization.
 */

import { getCurrentRole, getToken, clearSession, getSessionId, getTenantSlug } from "../utils/auth";
import { notify } from "../utils/notify";

/** @type {string} API base URL without trailing slashes */
const rawApiUrl = import.meta.env.VITE_API_URL || "";
const API_URL = rawApiUrl.replace(/\/+$/g, "");

// Global fetch interceptor for session management and notifications
let _401Handled = false;
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  try {
    const [resource, config = {}] = args;
    const noCacheConfig = { ...config, cache: 'no-store' };

    // Inject X-Tenant-ID header when tenantSlug is present in localStorage
    // Skip for login and public auth routes — they don't need tenant resolution
    // and a stale slug from a deleted org would cause errors.
    const tenantSlug = getTenantSlug();
    const url = typeof resource === "string" ? resource : resource?.url || "";
    const isPublicAuthRoute = url.includes("login") || url.includes("forgot-password") || url.includes("reset-password") || url.includes("register");
    if (tenantSlug && !isPublicAuthRoute) {
      noCacheConfig.headers = { ...noCacheConfig.headers, "X-Tenant-ID": tenantSlug };
    }

    const role = getCurrentRole();
    const tokenAtRequest = getToken(role);
    const res = await originalFetch.apply(this, [resource, noCacheConfig]);

    // Handle session expiration (401 Unauthorized)
    // Skip for public auth endpoints (login, password change, etc.) and when on the login page
    const isPasswordChange = url.includes("first-time-change-password") || url.includes("change-password");
    const isLoginPage = typeof window !== "undefined" && (window.location.pathname === "/" || window.location.pathname === "/login");
    const isSuperAdminApi = url.includes("/super-admin/");

    if (res.status === 401 && !_401Handled && !isPasswordChange && !isPublicAuthRoute && !isLoginPage && !isSuperAdminApi) {
      const tokenNow = getToken(role);
      const isTokenExpired = tokenNow && tokenNow === tokenAtRequest;
      const isZombieTab = !tokenAtRequest && !tokenNow && role;
      if (isTokenExpired || isZombieTab) {
        _401Handled = true;
        _sessionConflictHandled = true;
        clearSession(role);
        const reason = isZombieTab
          ? "Your session is no longer valid. Please login again."
          : "Your session has expired. Please login again.";
        try {
          const clone = res.clone();
          const data = await clone.json();
          if (data?.message === "resigned") {
            window.location.href = "/?message=" + encodeURIComponent("Your account has been resigned. You no longer have access.");
          } else {
            window.location.href = "/?message=" + encodeURIComponent(reason);
          }
        } catch {
          window.location.href = "/?message=" + encodeURIComponent(reason);
        }
      }
    }

    // Handle 403 Forbidden — organization suspended/archived
    if (res.status === 403 && !_401Handled && !isPublicAuthRoute && !isLoginPage) {
      try {
        const clone = res.clone();
        const data = await clone.json();
        if (data?.status === 'suspended' || data?.status === 'archived') {
          _401Handled = true;
          _sessionConflictHandled = true;
          clearSession(role);
          window.location.href = "/?message=" + encodeURIComponent(data.message || "Your organization is not active. Please contact TechXaro support team.");
        }
      } catch {}
    }

    // Auto-show notifications for API responses (unless disabled via _notifHandled)
    if (!config._notifHandled && res.status !== 204) {
      const url = typeof resource === "string" ? resource : resource?.url || "";
      const isApiCall = url.includes("/api") || (API_URL && url.includes(API_URL));
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
// Detects when our session is removed by another tab (e.g. logout, max tabs exceeded)
let _sessionConflictHandled = false;
window.addEventListener("storage", (e) => {
  if (!e.key || _sessionConflictHandled) return;

  // Skip on login/public pages — those are already handled or don't need session conflict logic
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  if (pathname === "/" || pathname === "/login" || pathname === "/forgot-password" || pathname === "/reset-password" || pathname === "/register-organization") return;

  const role = getCurrentRole();
  if (!role) return;
  const sid = getSessionId();
  if (!sid) return;

  // Check if sessions_{role} was modified
  if (e.key === `sessions_${role}` && e.newValue !== e.oldValue) {
    try {
      const sessions = JSON.parse(e.newValue || "{}");
      if (!sessions[sid]) {
        // Our session was removed by another tab
        _sessionConflictHandled = true;
        _401Handled = true;
        clearSession(role);
        window.location.href = "/?message=" + encodeURIComponent("You have been logged in from another tab.");
      }
    } catch {
      // Parse error — treat as session lost
      _sessionConflictHandled = true;
      _401Handled = true;
      clearSession(role);
      window.location.href = "/?message=" + encodeURIComponent("Your session has been interrupted. Please login again.");
    }
  }
});

export default API_URL;
