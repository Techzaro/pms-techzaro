import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { notify } from "../utils/notify";

async function apiFetch(path, options = {}) {
  const token = authToken();
  if (!token && !options.skipAuth) return null;

  const url = `${API_URL}${path}`;
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    ...options.headers,
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, { ...options, headers, _notifHandled: true });

  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized");
    let errMsg = `Request failed (${res.status})`;
    try {
      const errData = await res.json();
      if (errData.message) errMsg = errData.message;
    } catch {}
    if (!options.skipNotify) notify.error(errMsg);
    throw new Error(errMsg);
  }

  if (res.status === 204) return null;

  const data = await res.json();

  if (!options.skipNotify) {
    if (data?.success === true && data?.message) {
      notify.success(data.message);
    } else if (data?.success === false && data?.message) {
      notify.error(data.message);
    }
  }

  return data;
}

export const api = {
  get: (path, params) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch(`${path}${qs}`);
  },
  post: (path, body) =>
    apiFetch(path, { method: "POST", body: JSON.stringify(body) }),
  put: (path, body) =>
    apiFetch(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: (path, body) =>
    apiFetch(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path) => apiFetch(path, { method: "DELETE" }),
  upload: (path, formData) =>
    apiFetch(path, { method: "POST", body: formData, headers: {} }),
};

export default api;
