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
    return window.location.pathname.startsWith('/super-admin');
  }

  // Production/Staging admin domains (e.g. admin.one.staging.techxaro.com)
  return host.startsWith('admin.') || host.includes('admin');
}

export function isOrgDomain() {
  const host = getHostname();

  // Local development — both domains on same host
  if (host === 'localhost' || host === '127.0.0.1') {
    return !window.location.pathname.startsWith('/super-admin');
  }

  // Production/Staging org domains (e.g. app.one.staging.techxaro.com)
  return host.startsWith('app.') || (!host.includes('admin') && !window.location.pathname.startsWith('/super-admin'));
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
 */
export function getAdminBaseUrl() {
  const host = getHostname();
  const protocol = window.location.protocol;
  if (host === 'localhost' || host === '127.0.0.1') {
    return `${protocol}//${window.location.host}`;
  }
  if (host.startsWith('admin.')) {
    return window.location.origin;
  }
  if (host.startsWith('app.')) {
    return `${protocol}//${host.replace(/^app\./, 'admin.')}`;
  }
  return window.location.origin;
}

/**
 * Get the org base URL for the current environment.
 */
export function getOrgBaseUrl() {
  const host = getHostname();
  const protocol = window.location.protocol;
  if (host === 'localhost' || host === '127.0.0.1') {
    return `${protocol}//${window.location.host}`;
  }
  if (host.startsWith('app.')) {
    return window.location.origin;
  }
  if (host.startsWith('admin.')) {
    return `${protocol}//${host.replace(/^admin\./, 'app.')}`;
  }
  return window.location.origin;
}
