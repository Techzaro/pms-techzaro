/**
 * draftService.js
 * API service layer for the centralized Draft Management System.
 */

import { api } from "../lib/api";

const draftService = {
  list: (params) => api.get("/drafts", params),
  get: (id) => api.get(`/drafts/${id}`),
  create: (data) => api.post("/drafts", data),
  update: (id, data) => api.put(`/drafts/${id}`, data),
  delete: (id) => api.delete(`/drafts/${id}`),
  publish: (id) => api.post(`/drafts/${id}/publish`),
  publishReturned: (id, data) => api.post(`/drafts/${id}/publish-returned`, data),
  duplicate: (id) => api.post(`/drafts/${id}/duplicate`),
  restoreVersion: (draftId, version) =>
    api.post(`/drafts/${draftId}/restore/${version}`),
  autoSave: (id, data) => api.post(`/drafts/${id}/auto-save`, data),
  cleanup: (days) => api.post("/drafts/cleanup", { days }),
  archive: (days) => api.post("/drafts/archive", { days }),
};

export default draftService;
