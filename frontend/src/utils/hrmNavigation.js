/**
 * hrmNavigation.js
 * Single source of truth for "which HRM landing page a given role sees".
 * Add new roles here only — don't hardcode HRM paths anywhere else
 * (Header links, route redirects, etc. should all import from here).
 */
import { getCurrentRole, getUrlRole } from "./auth";

/** Roles that get the limited/member HRM dashboard instead of the full admin app. */
const LIMITED_HRM_ROLES = new Set(["member", "team_lead"]);

/**
 * Returns the canonical HRM landing path for a role.
 * @param {string} [role] - defaults to the currently logged-in role
 * @returns {string} e.g. "/member/hrm/member-dashboard" or "/admin/hrm/dashboard"
 */
export function getHrmLandingPath(role = getCurrentRole()) {
  // We must map 'team_lead' -> 'teamlead' for the URL route parameter
  const urlRole = role === "team_lead" ? "teamlead" : role;
  
  if (LIMITED_HRM_ROLES.has(role)) {
    return `/${urlRole}/hrm/member-dashboard`;
  }
  // Matches the existing "/:role/hrm" route in App.jsx (renders HRMAdmin).
  return `/${urlRole}/hrm`;
}