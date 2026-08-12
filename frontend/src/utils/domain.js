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
 *   staging.admin.one.techxaro.com  → Super Admin
 *   staging.app.one.techxaro.com    → PMS (Organizations)
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
 * Matches: admin.one.techxaro.com, staging.admin.one.techxaro.com, localhost
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
 * Matches: app.one.techxaro.com, staging.app.one.techxaro.com, localhost
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
 * Production:  https://admin.one.techxaro.com
 * Staging:     https://staging.admin.one.techxaro.com
 * Local:       http://localhost:5173
 */
export function getAdminBaseUrl() {
  const env = getEnvironment();
  if (env === 'staging') return 'https://staging.admin.one.techxaro.com';
  if (env === 'production') return 'https://admin.one.techxaro.com';
  return window.location.origin;
}

/**
 * Get the org base URL for the current environment.
 * Production:  https://app.one.techxaro.com
 * Staging:     https://staging.app.one.techxaro.com
 * Local:       http://localhost:5173
 */
export function getOrgBaseUrl() {
  const env = getEnvironment();
  if (env === 'staging') return 'https://staging.app.one.techxaro.com';
  if (env === 'production') return 'https://app.one.techxaro.com';
  return window.location.origin;
}
