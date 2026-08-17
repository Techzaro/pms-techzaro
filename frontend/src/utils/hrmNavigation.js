/**
 * hrmNavigation.js
 * Single source of truth for "which HRM landing page a given role sees".
 * Add new roles here only — don't hardcode HRM paths anywhere else
 * (Header links, route redirects, etc. should all import from here).
 */
import { getCurrentRole, rolePath } from "./auth";

/** Roles that get the limited/member HRM dashboard instead of the full admin app. */
const LIMITED_HRM_ROLES = new Set(["member", "team_lead"]);

/**
 * Returns the canonical HRM landing path for a role.
 * @param {string} [role] - defaults to the currently logged-in role
 * @returns {string} e.g. "/org/acme/hrm/member-dashboard" or "/org/acme/hrm"
 */
export function getHrmLandingPath(role = getCurrentRole()) {
  if (LIMITED_HRM_ROLES.has(role)) {
    return rolePath("hrm/member-dashboard");
  }
  return rolePath("hrm");
}
