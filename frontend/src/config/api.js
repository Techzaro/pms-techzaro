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
const rawApiUrl = import.meta.env.VITE_API_URL || "/api";
const API_URL = (rawApiUrl || "/api").replace(/\/+$/g, "");

export default API_URL;

// Global fetch interceptor for session management and notifications
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  try {
    const [resource, config = {}] = args;
    const noCacheConfig = { ...config, cache: 'no-store' };
    const tenantSlug = getTenantSlug();
    const url = typeof resource === 'string' ? resource : resource?.url || '';
    const skipTenantHeader = url.includes('/login') || url.includes('/forgot-password') || url.includes('/reset-password') || url.includes('/public/') || url.includes('/super-admin');
    if (tenantSlug && !skipTenantHeader && noCacheConfig.headers) {
      noCacheConfig.headers = { ...noCacheConfig.headers, "X-Tenant-ID": tenantSlug };
    } else if (tenantSlug && !skipTenantHeader) {
      noCacheConfig.headers = { "X-Tenant-ID": tenantSlug };
    }
    const role = getCurrentRole();
    const tokenAtRequest = getToken(role);
    const res = await originalFetch.apply(this, [resource, noCacheConfig]);

    // Handle session expiration (401 Unauthorized)
    if (res.status === 401) {
      const url = typeof resource === "string" ? resource : resource?.url || "";
      // Public purpose-token endpoints (candidate e-sign, offer portals, etc.)
      // do not use a PMS login and must not trigger employee-session redirects.
      if (url.includes("/super-admin") || url.includes("/public/")) return res;
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
        window.location.replace(
          loginPath + "?message=" + encodeURIComponent(targetMsg),
        );
      }
    }

    return res;
  } catch (error) {
    throw error;
  }
};
