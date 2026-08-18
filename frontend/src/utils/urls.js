/**
 * @file urls.js
 * @description Centralized URL generation for the SaaS platform.
 * All environment-specific URLs are generated here.
 */

import { isAdminDomain, isOrgDomain, getAdminBaseUrl, getOrgBaseUrl } from './domain';
import { getTenantSlug } from './auth';

/** Get the current organization slug from the URL path */
export function getSlugFromUrl() {
  const match = window.location.pathname.match(/^\/org\/([a-z0-9](?:[a-z0-9\-]*[a-z0-9])?)(?:\/|$)/);
  return match ? match[1] : null;
}

/** Get the organization app base URL */
export function getOrgAppUrl() {
  return import.meta.env.VITE_ORG_APP_URL || getOrgBaseUrl();
}

/** Get the super admin app base URL */
export function getAdminAppUrl() {
  return import.meta.env.VITE_ADMIN_APP_URL || getAdminBaseUrl();
}

/** Build full organization URL: /org/{slug} or /org/{slug}/{page} */
export function getOrganizationUrl(slug, page = '') {
  const base = `/org/${slug}`;
  return page ? `${base}/${page}` : base;
}

/** Build the org path for the current user (reads slug from URL) */
export function orgPath(page = '') {
  const slug = getSlugFromUrl() || getTenantSlug() || '';
  if (!slug) return page ? `/${page}` : '/login';
  return page ? `/org/${slug}/${page}` : `/org/${slug}/dashboard`;
}

/** Get the super admin path */
export function adminPath(page = '') {
  return page ? `/super-admin/${page}` : '/super-admin';
}

/** Get the login path based on current domain */
export function getLoginPath() {
  return isAdminDomain() ? '/super-admin/login' : '/login';
}

/** Get the dashboard path based on current domain */
export function getDashboardPath() {
  if (isAdminDomain()) return '/super-admin';
  const slug = getTenantSlug() || '';
  return slug ? `/org/${slug}/dashboard` : '/login';
}

// Re-export domain helpers for convenience
export { isAdminDomain, isOrgDomain } from './domain';
