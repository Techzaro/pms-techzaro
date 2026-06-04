import { getCurrentRole, getToken, clearSession } from "../utils/auth";

const API_URL = import.meta.env.VITE_API_URL;

/**
 * Global fetch interceptor.
 * On 401, force logout only if the token for this role hasn't been
 * replaced by another tab.
 *
 * Multi-tab rule: each role (admin, manager, team_lead, member) can
 * have ONE active session.  If a second tab logs in with the same
 * role, the old tab is kicked out.  Different roles coexist.
 */
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  const role = getCurrentRole();
  const tokenAtRequest = getToken(role);
  const res = await originalFetch.apply(this, args);

  if (res.status === 401) {
    const tokenNow = getToken(role);

    // Only log out if THIS tab's token hasn't been replaced by another tab
    if (tokenNow && tokenNow === tokenAtRequest) {
      clearSession(role);
      window.location.href = "/?message=" + encodeURIComponent("Your session has expired. Please login again.");
    }
  }

  return res;
};

/**
 * Listen for storage changes from other tabs.
 * If another tab logs in with the SAME role, this tab should redirect
 * to the login page (the old session is superseded).
 */
window.addEventListener("storage", (e) => {
  if (!e.key) return;

  const role = getCurrentRole();
  if (!role) return;

  // Another tab changed this role's token → same role logged in elsewhere
  if (e.key === `token_${role}` && e.oldValue && e.newValue && e.oldValue !== e.newValue) {
    clearSession(role);
    window.location.href = "/?message=" + encodeURIComponent("You have been logged in from another tab.");
  }
});

export default API_URL;
