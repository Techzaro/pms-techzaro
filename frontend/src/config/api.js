import { getCurrentRole, getToken, clearSession } from "../utils/auth";
import { notify } from "../utils/notify";

const rawApiUrl = import.meta.env.VITE_API_URL || "";
const API_URL = rawApiUrl.replace(/\/+$/g, "");

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

    if (!config._notifHandled && res.status !== 204) {
      const url = typeof resource === "string" ? resource : resource?.url || "";
      const isApiCall = url.includes("/api") || url.includes("techxaro.com");
      if (isApiCall) {
        try {
          const clone = res.clone();
          const data = await clone.json();
          if (data?.success === true && data?.message) {
            notify.success(data.message);
          } else if (data?.success === false && data?.message) {
            notify.error(data.message);
          }
        } catch {}
      }
    }

    return res;
  } catch (e) {
    throw e;
  }
};

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
