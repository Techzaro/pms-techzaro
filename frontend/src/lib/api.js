/**
 * @file api.js
 * @description HTTP client module for API requests with authentication and error handling.
 * Provides a high-level API object with methods for GET, POST, PUT, PATCH, DELETE, and file uploads.
 */

import API_URL from "../config/api";
import { authToken, getTenantSlug } from "../utils/auth";
import { notify } from "../utils/notify";

/**
 * Core fetch function with authentication and error handling.
 * @param {string} path - API endpoint path
 * @param {Object} [options={}] - Fetch options
 * @param {boolean} [options.skipAuth] - Skip authentication check
 * @param {boolean} [options.skipNotify] - Skip notification display
 * @param {Object|string} [options.body] - Request body
 * @returns {Promise<Object|null>} Response data or null if no auth
 * @throws {Error} On HTTP errors
 */
async function apiFetch(path, options = {}) {
  const token = authToken();
  if (!token && !options.skipAuth) return null;

  const url = `${API_URL}${path}`;
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    ...options.headers,
  };

  // Set content type only for non-FormData bodies
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

  // Auto-show notifications based on response
  if (!options.skipNotify) {
    if (data?.success === true && data?.message) {
      notify.success(data.message);
    } else if (data?.success === false && data?.message) {
      notify.error(data.message);
    }
  }

  return data;
}

/**
 * API client object with methods for HTTP requests.
 */
export const api = {
  /**
   * Sends a GET request.
   * @param {string} path - API endpoint path
   * @param {Object} [params] - Query parameters
   * @returns {Promise<Object>} Response data
   */
  get: (path, params) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch(`${path}${qs}`);
  },
  /**
   * Sends a POST request.
   * @param {string} path - API endpoint path
   * @param {Object} body - Request body
   * @returns {Promise<Object>} Response data
   */
  post: (path, body) =>
    apiFetch(path, { method: "POST", body: JSON.stringify(body) }),
  /**
   * Sends a PUT request.
   * @param {string} path - API endpoint path
   * @param {Object} body - Request body
   * @returns {Promise<Object>} Response data
   */
  put: (path, body) =>
    apiFetch(path, { method: "PUT", body: JSON.stringify(body) }),
  /**
   * Sends a PATCH request.
   * @param {string} path - API endpoint path
   * @param {Object} body - Request body
   * @returns {Promise<Object>} Response data
   */
  patch: (path, body) =>
    apiFetch(path, { method: "PATCH", body: JSON.stringify(body) }),
  /**
   * Sends a DELETE request.
   * @param {string} path - API endpoint path
   * @returns {Promise<Object>} Response data
   */
  delete: (path) => apiFetch(path, { method: "DELETE" }),
  /**
   * Uploads a file using FormData.
   * @param {string} path - API endpoint path
   * @param {FormData} formData - FormData object containing file(s)
   * @returns {Promise<Object>} Response data
   */
  upload: (path, formData) =>
    apiFetch(path, { method: "POST", body: formData, headers: {} }),
};

export default api;
