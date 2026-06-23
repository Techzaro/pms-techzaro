import { getCurrentRole, getToken, clearSession } from "../utils/auth";

const rawApiUrl = import.meta.env.VITE_API_URL || "";
const API_URL = rawApiUrl.replace(/\/+$/g, "");

// No response cache here — React Query handles caching.
// The fetch wrapper only handles 401 session expiry.

const originalFetch = window.fetch;
window.fetch = async function (...args) {
  try {
    const [resource, config = {}] = args;
    const noCacheConfig = { ...config, cache: 'no-store' };
    const role = getCurrentRole();
    const tokenAtRequest = getToken(role);
    const res = await originalFetch.apply(this, [resource, noCacheConfig]);

    if (res.status === 401) {
      const tokenNow = getToken(role);
      if (tokenNow && tokenNow === tokenAtRequest) {
        clearSession(role);
        window.location.href = "/?message=" + encodeURIComponent("Your session has expired. Please login again.");
      }
    }

    return res;
  } catch (e) {
    throw e;
  }
};

// Cache removed — React Query handles caching.
// These are kept as no-ops for backward compatibility.
export function invalidateCache() {}
export function onMutation() {}

window.addEventListener("storage", (e) => {
  if (!e.key) return;
  const role = getCurrentRole();
  if (!role) return;
  if (e.key === `token_${role}` && e.oldValue && e.newValue && e.oldValue !== e.newValue) {
    clearSession(role);
    window.location.href = "/?message=" + encodeURIComponent("You have been logged in from another tab.");
  }
});

export default API_URL;
