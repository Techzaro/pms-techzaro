import { getSuperAdminUser, superAdminAuthToken, getSuperAdminSessionId, getSuperAdminRole, clearSuperAdminSession } from '../../../utils/auth';

const rawBase = import.meta.env.VITE_API_URL || '';
const API_BASE = rawBase.replace(/\/+$/, '');
const BASE = `${API_BASE}/super-admin`;

function getAdminName() {
  try {
    const user = getSuperAdminUser();
    if (user?.name) return user.name;
  } catch (err) { void err; }
  return 'Super Admin';
}

async function request(url, options = {}) {
  const token = superAdminAuthToken();
  const { headers: extraHeaders, ...restOptions } = options;
  const res = await fetch(`${BASE}${url}`, {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Admin-Name': getAdminName(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
  });
  const data = await res.json();
  if (res.status === 401) {
    clearSuperAdminSession();
    window.location.href = '/super-admin/login';
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Request failed: ${res.status}`);
  }
  return data;
}

async function publicRequest(url, options = {}) {
  const { headers: extraHeaders, ...restOptions } = options;
  const res = await fetch(`${BASE}${url}`, {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...extraHeaders,
    },
  });
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Request failed: ${res.status}`);
  }
  return data;
}

export const api = {
  // ─── Auth (public) ────────────────────────────────────────────
  login: (email, password, rememberMe = false) =>
    publicRequest('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, remember_me: rememberMe }),
    }),

  logout: () => request('/logout', { method: 'POST' }),

  forgotPassword: (email) =>
    publicRequest('/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (email, token, password) =>
    publicRequest('/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, token, password }),
    }),

  register: (data) =>
    publicRequest('/organizations/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  changePassword: (oldPassword, newPassword) =>
    request('/change-password', {
      method: 'POST',
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    }),

  // ─── Stats ────────────────────────────────────────────────────
  getStats: () => request('/stats'),

  // ─── Organizations ────────────────────────────────────────────
  getOrganizations: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/organizations${qs ? '?' + qs : ''}`);
  },
  getOrganization: (id) => request(`/organizations/${id}`),
  checkEmailAvailability: (email) => request('/check-email', { method: 'POST', body: JSON.stringify({ email }) }),
  createOrganization: (data) => request('/organizations', { method: 'POST', body: JSON.stringify(data) }),
  updateOrganization: (id, data) => request(`/organizations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteOrganization: (id) => request(`/organizations/${id}`, { method: 'DELETE' }),
  suspendOrganization: (id) => request(`/organizations/${id}/suspend`, { method: 'POST' }),
  activateOrganization: (id) => request(`/organizations/${id}/activate`, { method: 'POST' }),
  changeOrgAdminPassword: (id, data) => request(`/organizations/${id}/change-admin-password`, { method: 'POST', body: JSON.stringify(data) }),

  // ─── Plans & Modules ─────────────────────────────────────────
  getPlans: () => request('/plans'),
  updatePlan: (id, data) => request(`/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getModules: () => request('/modules'),
  getDomains: () => request('/domains'),

  // ─── Trial Settings ──────────────────────────────────────────
  getTrialDefaults: () => request('/trial-defaults'),
  getOrgTrialSettings: (orgId) => request(`/organizations/${orgId}/trial-settings`),
  updateOrgTrialSettings: (orgId, data) => request(`/organizations/${orgId}/trial-settings`, { method: 'PUT', body: JSON.stringify(data) }),
  resetOrgTrialSettings: (orgId) => request(`/organizations/${orgId}/trial-settings`, { method: 'DELETE' }),

  // ─── Subscription History ────────────────────────────────────
  getSubscriptionHistory: (orgId) => request(`/organizations/${orgId}/subscription-history`),
  getSubscriptionSummary: (orgId) => request(`/organizations/${orgId}/subscription-summary`),

  // ─── Organization Storage ───────────────────────────────────
  getOrgStorage: (orgId) => request(`/organizations/${orgId}/storage`),
  getOrgStorageSummary: (orgId) => request(`/organizations/${orgId}/storage/summary`),
  deleteOrgStorageRecord: (orgId, recordId) => request(`/organizations/${orgId}/storage/${recordId}`, { method: 'DELETE' }),
  deleteOrgStorageBulk: (orgId, type, params = {}) => {
    const qs = new URLSearchParams({ type, ...params }).toString();
    return request(`/organizations/${orgId}/storage/bulk?${qs}`, { method: 'DELETE' });
  },

  // ─── Organization Storage Notifications (Super Admin) ──────
  getOrgStorageNotifications: (orgId) => request(`/organizations/${orgId}/storage/notifications`),
  dismissOrgStorageNotification: (orgId, notifId) => request(`/organizations/${orgId}/storage/notifications/${notifId}/dismiss`, { method: 'POST' }),
  dismissAllOrgStorageNotifications: (orgId) => request(`/organizations/${orgId}/storage/notifications/dismiss-all`, { method: 'POST' }),

  // ─── Organization Storage Preferences (Super Admin) ────────
  getOrgStoragePreferences: (orgId) => request(`/organizations/${orgId}/storage/preferences`),
  updateOrgStoragePreferences: (orgId, data) => request(`/organizations/${orgId}/storage/preferences`, { method: 'PUT', body: JSON.stringify(data) }),
  testOrgS3Connection: (orgId, data) => request(`/organizations/${orgId}/storage/test-connection`, { method: 'POST', body: JSON.stringify(data) }),

  // ─── Organization Billing ───────────────────────────────────
  getOrgBilling: (orgId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/organizations/${orgId}/billing${qs ? '?' + qs : ''}`);
  },
  approvePayment: (invoiceId, notes = '') => request(`/billing/${invoiceId}/approve`, { method: 'POST', body: JSON.stringify({ notes }) }),
  rejectPayment: (invoiceId, reason = '') => request(`/billing/${invoiceId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  downloadInvoice: async (invoiceId) => {
    const token = superAdminAuthToken();
    const res = await fetch(`${BASE}/billing/${invoiceId}/download`, {
      headers: {
        'X-Admin-Name': getAdminName(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${invoiceId}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },
  getBillingSummary: () => request('/billing/summary'),

  // ─── Organization Support ───────────────────────────────────
  getOrgSupportTickets: (orgId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/organizations/${orgId}/support/tickets${qs ? '?' + qs : ''}`);
  },
  getOrgSupportTicketDetail: (orgId, ticketId) => request(`/organizations/${orgId}/support/tickets/${ticketId}`),
  replyOrgSupportTicket: (orgId, ticketId, message) => request(`/organizations/${orgId}/support/tickets/${ticketId}/reply`, {
    method: 'POST', body: JSON.stringify({ message }),
  }),
  closeOrgSupportTicket: (orgId, ticketId) => request(`/organizations/${orgId}/support/tickets/${ticketId}/close`, { method: 'POST' }),

  // ─── Feedback Tickets ──────────────────────────────────────
  getFeedbackTickets: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/feedback-tickets${qs ? '?' + qs : ''}`);
  },
  getFeedbackTicketDetail: (ticketId) => request(`/feedback-tickets/${ticketId}`),
  replyFeedbackTicket: (ticketId, message) => request(`/feedback-tickets/${ticketId}/reply`, {
    method: 'POST', body: JSON.stringify({ message }),
  }),
  closeFeedbackTicket: (ticketId) => request(`/feedback-tickets/${ticketId}/close`, { method: 'POST' }),
  updateFeedbackTicketStatus: (ticketId, status) => request(`/feedback-tickets/${ticketId}/status`, {
    method: 'POST', body: JSON.stringify({ status }),
  }),

  // ─── Organization Audit Logs (Super Admin) ──────────────────
  getOrgAuditLogs: (orgId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/organizations/${orgId}/audit-logs${qs ? '?' + qs : ''}`);
  },
  getOrgAuditLogModules: (orgId) => request(`/organizations/${orgId}/audit-logs/modules`),
  getOrgAuditLogActions: (orgId) => request(`/organizations/${orgId}/audit-logs/actions`),
  getOrgAuditLogUsers: (orgId) => request(`/organizations/${orgId}/audit-logs/users`),

  // ─── Activity Logs ───────────────────────────────────────────
  getActivityLogs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/activity-logs${qs ? '?' + qs : ''}`);
  },
  getActivityLogActions: () => request('/activity-logs/actions'),
  getAllOrgAuditLogs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/all-org-audit-logs${qs ? '?' + qs : ''}`);
  },
  getAllOrgAuditLogModules: () => request('/all-org-audit-logs/modules'),

  // ─── Notifications ───────────────────────────────────────────
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

  // ─── Health ──────────────────────────────────────────────────
  getHealth: () => request('/health'),
  getHealthAll: () => request('/health/all'),

  // ─── Profile ─────────────────────────────────────────────────
  getMyProfile: (email) => request(`/my-profile?email=${encodeURIComponent(email)}`),
  updateMyProfile: (data) => request('/my-profile', { method: 'POST', body: JSON.stringify(data) }),

  getAvailablePlans: () => request('/available-plans'),

  // ─── TechXaro's Own Subscription ─────────────────────────────
  getMySubscription: () => request('/my-subscription'),
  changeMyPlan: (planId, billingPeriod) => request('/change-my-plan', { method: 'POST', body: JSON.stringify({ plan_id: planId, billing_period: billingPeriod }) }),

  // ─── Org Chat ──────────────────────────────────────────────
  getOrgChatConversations: () => request('/org-chat/conversations'),
  getOrgChatConversation: (id) => request(`/org-chat/conversations/${id}`),
  createOrgChatConversation: (data) => request('/org-chat/conversations', { method: 'POST', body: JSON.stringify(data) }),
  sendOrgChatMessage: (conversationId, body) => {
    const formData = new FormData();
    formData.append('body', body);
    return request(`/org-chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': undefined },
      body: formData,
    });
  },
  sendOrgChatMessageWithFile: (conversationId, body, file) => {
    const formData = new FormData();
    formData.append('body', body);
    if (file) formData.append('file', file);
    return request(`/org-chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': undefined },
      body: formData,
    });
  },
};
