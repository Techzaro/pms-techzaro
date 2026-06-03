const API_URL = import.meta.env.VITE_API_URL;

/**
 * Global fetch interceptor.
 * When any API call returns 401/403 for a resigned user,
 * force logout and redirect to login with message.
 */
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  const res = await originalFetch.apply(this, args);

  if (res.status === 401) {
    const token = localStorage.getItem("token");
    if (token) {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      localStorage.removeItem("userId");
      localStorage.removeItem("name");
      localStorage.removeItem("email");
      window.location.href = "/?message=" + encodeURIComponent("Your session has expired. Please login again.");
    }
  }

  return res;
};

export default API_URL;
