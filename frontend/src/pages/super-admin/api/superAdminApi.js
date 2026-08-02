const BASE = '/api/super-admin';

async function request(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Request failed: ${res.status}`);
  }
  return data;
}

export const api = {
  // Stats
  getStats: () => request('/stats'),

  // Organizations
  getOrganizations: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/organizations${qs ? '?' + qs : ''}`);
  },
  getOrganization: (id) => request(`/organizations/${id}`),
  createOrganization: (data) => request('/organizations', { method: 'POST', body: JSON.stringify(data) }),
  updateOrganization: (id, data) => request(`/organizations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteOrganization: (id) => request(`/organizations/${id}`, { method: 'DELETE' }),
  suspendOrganization: (id) => request(`/organizations/${id}/suspend`, { method: 'POST' }),
  activateOrganization: (id) => request(`/organizations/${id}/activate`, { method: 'POST' }),

  // Plans & Modules
  getPlans: () => request('/plans'),
  getModules: () => request('/modules'),
  getDomains: () => request('/domains'),

  // Activity Logs
  getActivityLogs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/activity-logs${qs ? '?' + qs : ''}`);
  },

  // Health
  getHealth: () => request('/health'),
  getHealthAll: () => request('/health/all'),
};
