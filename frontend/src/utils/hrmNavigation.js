/**
 * hrmNavigation.js
 * Single source of truth for "which HRM landing page a given role sees".
 * Add new roles here only — don't hardcode HRM paths anywhere else
 * (Header links, route redirects, etc. should all import from here).
 */
import { getCurrentRole, getUser, rolePath } from "./auth";

/** Roles that get the limited/member HRM dashboard instead of the full admin app. */
const LIMITED_HRM_ROLES = new Set(["member", "team_lead"]);

/** Return the authenticated user's role, falling back to legacy session metadata. */
export function getHrmRole() {
  const userRole = getUser()?.role;
  const role = userRole || getCurrentRole();
  return String(role || "").toLowerCase() === "teamlead"
    ? "team_lead"
    : String(role || "").toLowerCase();
}

export function isHrmAdminRole(role = getHrmRole()) {
  return ["admin", "manager"].includes(String(role || "").toLowerCase());
}

/**
 * Returns the canonical HRM landing path for a role.
 * @param {string} [role] - defaults to the currently logged-in role
 * @returns {string} e.g. "/org/acme/hrm/member-dashboard" or "/org/acme/hrm"
 */
export function getHrmLandingPath(role = getHrmRole()) {
  const normalizedRole = String(role || "").toLowerCase();
  if (LIMITED_HRM_ROLES.has(normalizedRole)) {
    return rolePath("hrm/member-dashboard");
  }
  return rolePath("hrm");
}
