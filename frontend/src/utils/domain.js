/**
 * @file domain.js
 * @description Domain detection utility for subdomain-based routing.
 * Detects whether the current domain is admin or organization.
 *
 * Production:
 *   admin.one.techxaro.com  → Super Admin
 *   app.one.techxaro.com    → PMS (Organizations)
 *
 * Staging:
 *   admin.one.staging.techxaro.com  → Super Admin
 *   app.one.staging.techxaro.com    → PMS (Organizations)
 *
 * Local:
 *   localhost:5173 → Both allowed (dev mode)
 */

/**
 * Get the current hostname (e.g., "admin.one.techxaro.com")
 */
function getHostname() {
  return window.location.hostname;
}

/**
 * Check if current domain is a super admin domain.
 * Matches: admin.one.techxaro.com, admin.one.staging.techxaro.com, localhost
 */
export function isAdminDomain() {
  const host = getHostname();

  // Local development — both domains on same host
  if (host === 'localhost' || host === '127.0.0.1') {
    // In local mode, check if URL starts with /super-admin
    return window.location.pathname.startsWith('/super-admin');
  }

  // Production/Staging admin domains
  return host.startsWith('admin.');
}

/**
 * Check if current domain is an organization (PMS) domain.
 * Matches: app.one.techxaro.com, app.one.staging.techxaro.com, localhost
 */
export function isOrgDomain() {
  const host = getHostname();

  // Local development — both domains on same host
  if (host === 'localhost' || host === '127.0.0.1') {
    // In local mode, check if URL does NOT start with /super-admin
    return !window.location.pathname.startsWith('/super-admin');
  }

  // Production/Staging org domains
  return host.startsWith('app.');
}

/**
 * Get the current environment: 'production', 'staging', or 'local'
 */
export function getEnvironment() {
  const host = getHostname();

  if (host.includes('staging')) return 'staging';
  if (host === 'localhost' || host === '127.0.0.1') return 'local';
  return 'production';
}

/**
 * Get the admin base URL for the current environment.
 * Uses window.location.origin since both staging and production
 * run on their respective domains with relative /api paths.
 */
export function getAdminBaseUrl() {
  return window.location.origin;
}

/**
 * Get the org base URL for the current environment.
 * Uses window.location.origin since both staging and production
 * run on their respective domains with relative /api paths.
 */
export function getOrgBaseUrl() {
  return window.location.origin;
}
