import { getUser, authToken } from '../../../utils/auth';

const BASE = '/api/super-admin';

function getAdminName() {
  try {
    const user = getUser('admin');
    if (user?.name) return user.name;
  } catch (err) { void err; }
  return 'Super Admin';
}

async function request(url, options = {}) {
  const token = authToken();
  const res = await fetch(`${BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Admin-Name': getAdminName(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
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
  updatePlan: (id, data) => request(`/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getModules: () => request('/modules'),
  getDomains: () => request('/domains'),

  // Trial Settings
  getTrialDefaults: () => request('/trial-defaults'),
  getOrgTrialSettings: (orgId) => request(`/organizations/${orgId}/trial-settings`),
  updateOrgTrialSettings: (orgId, data) => request(`/organizations/${orgId}/trial-settings`, { method: 'PUT', body: JSON.stringify(data) }),
  resetOrgTrialSettings: (orgId) => request(`/organizations/${orgId}/trial-settings`, { method: 'DELETE' }),

  // Subscription History
  getSubscriptionHistory: (orgId) => request(`/organizations/${orgId}/subscription-history`),
  getSubscriptionSummary: (orgId) => request(`/organizations/${orgId}/subscription-summary`),

  // Activity Logs
  getActivityLogs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/activity-logs${qs ? '?' + qs : ''}`);
  },

  // Notifications
  getNotifications: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/notifications${qs ? '?' + qs : ''}`);
  },
  getUnreadCount: () => request('/notifications/unread-count'),
  getLatestNotifications: (afterId) => {
    const qs = afterId ? `?after_id=${afterId}` : '';
    return request(`/notifications/latest${qs}`);
  },
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'POST' }),

  // Health
  getHealth: () => request('/health'),
  getHealthAll: () => request('/health/all'),
};
