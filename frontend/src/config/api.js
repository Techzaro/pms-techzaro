import { getCurrentRole, getToken, clearSession } from "../utils/auth";
import { showGlobalLoading, hideGlobalLoading } from "../utils/loadingManager";

const rawApiUrl = import.meta.env.VITE_API_URL || "";
// Normalize: remove any trailing slashes to avoid double-slash in constructed endpoints
const API_URL = rawApiUrl.replace(/\/+$/g, "");

/**
 * Global fetch interceptor.
 * Automatically shows/hides the global loading spinner for fetch calls.
 * Pass { skipLoader: true } in the fetch options to skip the spinner.
 *
 * Usage:
 *   fetch(url)                          → shows spinner
 *   fetch(url, { skipLoader: true })    → skips spinner
 */
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  const [resource, config] = args;
  const skipLoader = config?.skipLoader === true;

  if (!skipLoader) {
    showGlobalLoading();
  }

  try {
    const role = getCurrentRole();
    const tokenAtRequest = getToken(role);
    const res = await originalFetch.apply(this, args);

    if (res.status === 401) {
      const tokenNow = getToken(role);
      if (tokenNow && tokenNow === tokenAtRequest) {
        clearSession(role);
        window.location.href = "/?message=" + encodeURIComponent("Your session has expired. Please login again.");
      }
    }

    return res;
  } finally {
    if (!skipLoader) {
      hideGlobalLoading();
    }
  }
};

/**
 * Listen for storage changes from other tabs.
 */
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
