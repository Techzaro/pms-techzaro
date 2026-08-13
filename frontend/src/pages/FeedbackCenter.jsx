import React, { useState, useEffect, useCallback } from "react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { authToken } from "../utils/auth";
import API_URL from "../config/api";
import {
  MdOutlineFeedback,
  MdFilterList,
  MdSearch,
  MdClose,
  MdPerson,
  MdTimeline,
  MdHistory,
  MdDownload,
  MdSend,
  MdRefresh,
} from "react-icons/md";
import DOMPurify from "dompurify";
import "./FeedbackCenter.css";

const STATUS_OPTIONS = [
  "New",
  "Under Review",
  "Accepted",
  "Planned",
  "In Development",
  "Testing",
  "Resolved",
  "Closed",
  "Rejected",
];

const TYPE_OPTIONS = [
  "Bug Report",
  "Feature Request",
  "General Suggestion",
  "Feature Rating",
  "General Feedback",
];

const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"];

export default function FeedbackCenter() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Filter state
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  // Users for assignee dropdown
  const [usersList, setUsersList] = useState([]);

  // Detail drawer state
  const [selectedId, setSelectedId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Form states in detail drawer
  const [noteText, setNoteText] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  // Fetch admin team users for assignment
  useEffect(() => {
    const token = authToken();
    fetch(`${API_URL}/team-users`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : { users: [] }))
      .then((data) => setUsersList(data.users || data.data || []))
      .catch(() => setUsersList([]));
  }, []);

  // Fetch feedback list
  const fetchFeedbacks = useCallback(() => {
    setIsLoading(true);
    const token = authToken();
    const params = new URLSearchParams();

    if (search) params.append("search", search);
    if (typeFilter) params.append("feedback_type", typeFilter);
    if (statusFilter) params.append("status", statusFilter);
    if (priorityFilter) params.append("priority", priorityFilter);
    if (moduleFilter) params.append("module", moduleFilter);
    if (orgFilter) params.append("organization", orgFilter);
    if (dateStart) params.append("date_start", dateStart);
    if (dateEnd) params.append("date_end", dateEnd);

    fetch(`${API_URL}/feedback?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => (res.ok ? res.json() : { data: [], total: 0 }))
      .then((json) => {
        setFeedbacks(json.data || []);
        setTotalCount(json.total || 0);
      })
      .catch(() => setFeedbacks([]))
      .finally(() => setIsLoading(false));
  }, [
    search,
    typeFilter,
    statusFilter,
    priorityFilter,
    moduleFilter,
    orgFilter,
    dateStart,
    dateEnd,
  ]);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  // Load single detail view
  const openDetail = (id) => {
    setSelectedId(id);
    setIsDetailLoading(true);
    const token = authToken();

    fetch(`${API_URL}/feedback/${id}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json && json.success) {
          setDetailData(json.data);
          setHistoryData(json.history || []);
        }
      })
      .finally(() => setIsDetailLoading(false));
  };

  // Update status, priority, or assignee
  const handleUpdate = async (field, value) => {
    if (!selectedId || !detailData) return;
    setIsUpdating(true);

    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/feedback/${selectedId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [field]: value }),
      });

      const json = await res.json();
      if (json.success) {
        setDetailData(json.data);
        fetchFeedbacks();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  // Add internal note
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim() || !selectedId) return;

    setIsUpdating(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/feedback/${selectedId}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ note: noteText }),
      });

      const json = await res.json();
      if (json.success) {
        setNoteText("");
        // Reload detail
        openDetail(selectedId);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusClass = (st) => {
    if (!st) return "fbc-status-new";
    const clean = st.toLowerCase().replace(/\s+/g, "-");
    return `fbc-status-${clean}`;
  };

  return (
    <DashboardLayout>
      <div className="fbc-page">
        <Breadcrumb
          items={[
            { label: "Admin", path: "/admin" },
            { label: "User Feedback Center" },
          ]}
        />

        {/* Page Title */}
        <div className="fbc-header">
          <div className="fbc-title-group">
            <h1>
              <MdOutlineFeedback
                color="#2563eb"
                size={28}
                style={{ verticalAlign: "middle", marginRight: 8 }}
              />
              User Feedback & Product Improvement
            </h1>
            <p>
              Manage, review, and track user bug reports, feature requests, and suggestions.
            </p>
          </div>
          <button className="fb-btn-cancel" onClick={fetchFeedbacks}>
            <MdRefresh size={18} style={{ verticalAlign: "middle", marginRight: 4 }} />
            Refresh
          </button>
        </div>

        {/* Advanced Filters */}
        <div className="fbc-filters-card">
          <div className="fbc-filter-grid">
            <div className="fbc-filter-item">
              <label>Search</label>
              <input
                type="text"
                className="fbc-input"
                placeholder="Search ref #, subject, user..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="fbc-filter-item">
              <label>Feedback Type</label>
              <select
                className="fbc-select"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">All Types</option>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="fbc-filter-item">
              <label>Status</label>
              <select
                className="fbc-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="fbc-filter-item">
              <label>Priority</label>
              <select
                className="fbc-select"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                <option value="">All Priorities</option>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="fbc-filter-item">
              <label>Organization</label>
              <input
                type="text"
                className="fbc-input"
                placeholder="Filter by Organization..."
                value={orgFilter}
                onChange={(e) => setOrgFilter(e.target.value)}
              />
            </div>

            <div className="fbc-filter-item">
              <label>From Date</label>
              <input
                type="date"
                className="fbc-input"
                value={dateStart}
                max={dateEnd || undefined}
                onChange={(e) => setDateStart(e.target.value)}
              />
            </div>

            <div className="fbc-filter-item">
              <label>To Date</label>
              <input
                type="date"
                className="fbc-input"
                value={dateEnd}
                min={dateStart || undefined}
                onChange={(e) => setDateEnd(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="fbc-table-card">
          <table className="fbc-table">
            <thead>
              <tr>
                <th>Reference #</th>
                <th>Type</th>
                <th>Subject</th>
                <th>User & Organization</th>
                <th>Module</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: 30 }}>
                    Loading feedback entries...
                  </td>
                </tr>
              ) : feedbacks.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: 30, color: "#64748b" }}>
                    No feedback submissions found matching your filters.
                  </td>
                </tr>
              ) : (
                feedbacks.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong style={{ color: "#2563eb" }}>{item.reference_number}</strong>
                    </td>
                    <td>
                      <div>{item.feedback_type}</div>
                      {item.rating > 0 && (
                        <div style={{ color: "#faad14", fontSize: "0.9rem", display: "flex", gap: 1, marginTop: 2 }}>
                          {[1, 2, 3, 4, 5].map((s) => (
                            <span key={s} style={{ color: s <= item.rating ? "#faad14" : "#cbd5e1" }}>★</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, maxWidth: 220 }}>{item.subject}</td>
                    <td>
                      <div><strong>{item.user_name}</strong></div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        {item.organization_name} ({item.user_role})
                      </div>
                    </td>
                    <td>{item.module || "General"}</td>
                    <td>
                      <span
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          color:
                            item.priority === "Urgent" || item.priority === "High"
                              ? "#dc2626"
                              : "#3b82f6",
                        }}
                      >
                        {item.priority || "Medium"}
                      </span>
                    </td>
                    <td>
                      <span className={`fbc-badge ${getStatusClass(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.8rem", color: "#64748b" }}>
                      {new Date(item.submitted_at || item.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <button
                        className="fb-btn-cancel"
                        style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                        onClick={() => openDetail(item.id)}
                      >
                        View Detail
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Feedback Detail Drawer */}
        {selectedId && (
          <div className="fbc-drawer-overlay" onClick={() => setSelectedId(null)}>
            <div className="fbc-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="fbc-drawer-header">
                <div>
                  <h3 style={{ margin: 0, color: "#0f172a" }}>
                    Feedback {detailData?.reference_number || `#${selectedId}`}
                  </h3>
                  <span className={`fbc-badge ${getStatusClass(detailData?.status)}`} style={{ marginTop: 4 }}>
                    {detailData?.status}
                  </span>
                </div>
                <button className="fb-modal-close" onClick={() => setSelectedId(null)}>
                  <MdClose size={22} />
                </button>
              </div>

              {isDetailLoading || !detailData ? (
                <div style={{ padding: 40, textAlign: "center" }}>
                  Loading detailed record...
                </div>
              ) : (
                <div className="fbc-drawer-body">
                  {/* Admin Controls Panel */}
                  <div className="fbc-admin-controls">
                    <div className="fbc-filter-item">
                      <label>Change Status</label>
                      <select
                        className="fbc-select"
                        value={detailData.status}
                        disabled={isUpdating}
                        onChange={(e) => handleUpdate("status", e.target.value)}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="fbc-filter-item">
                      <label>Change Priority</label>
                      <select
                        className="fbc-select"
                        value={detailData.priority || "Medium"}
                        disabled={isUpdating}
                        onChange={(e) => handleUpdate("priority", e.target.value)}
                      >
                        {PRIORITY_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="fbc-filter-item">
                      <label>Assign To</label>
                      <select
                        className="fbc-select"
                        value={detailData.assigned_to || ""}
                        disabled={isUpdating}
                        onChange={(e) => handleUpdate("assigned_to", e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">Unassigned</option>
                        {usersList.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Submission Overview */}
                  {detailData.rating > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, background: "#fffbe6", border: "1px solid #ffe58f", padding: "10px 14px", borderRadius: 8 }}>
                      <strong style={{ color: "#873800", fontSize: "0.88rem" }}>Feature Rating:</strong>
                      <div style={{ color: "#faad14", fontSize: "1.2rem", display: "flex", gap: 2 }}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <span key={s} style={{ color: s <= detailData.rating ? "#faad14" : "#d9d9d9" }}>★</span>
                        ))}
                      </div>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#d48806", marginLeft: 4 }}>
                        ({detailData.rating} / 5 Stars)
                      </span>
                    </div>
                  )}

                  <h4 style={{ margin: "0 0 8px 0", color: "#0f172a" }}>
                    {detailData.subject}
                  </h4>
                  <div
                    className="rte-display"
                    style={{ background: "#f8fafc", padding: 14, borderRadius: 8, border: "1px solid #e2e8f0", margin: "0 0 16px 0" }}
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(detailData.description || "") }}
                  />

                  {/* Auto-Captured Environment Info */}
                  <div className="fbc-section-title">
                    <MdPerson /> Auto-Captured System Information
                  </div>
                  <div className="fbc-auto-info-grid">
                    <div className="fbc-info-cell">
                      <span>Submitted By</span>
                      <strong>{detailData.user_name} ({detailData.user_role})</strong>
                    </div>
                    <div className="fbc-info-cell">
                      <span>Organization</span>
                      <strong>{detailData.organization_name}</strong>
                    </div>
                    <div className="fbc-info-cell">
                      <span>Module</span>
                      <strong>{detailData.module || "General"}</strong>
                    </div>
                    <div className="fbc-info-cell">
                      <span>Current Page Route</span>
                      <strong>{detailData.current_page}</strong>
                    </div>
                    <div className="fbc-info-cell">
                      <span>Operating System</span>
                      <strong>{detailData.operating_system}</strong>
                    </div>
                    <div className="fbc-info-cell">
                      <span>Browser</span>
                      <strong>{detailData.browser}</strong>
                    </div>
                    <div className="fbc-info-cell">
                      <span>Device Type</span>
                      <strong>{detailData.device_type}</strong>
                    </div>
                    <div className="fbc-info-cell">
                      <span>IP Address</span>
                      <strong>{detailData.ip_address || "Captured"}</strong>
                    </div>
                    <div className="fbc-info-cell">
                      <span>App Version</span>
                      <strong>{detailData.app_version}</strong>
                    </div>
                  </div>

                  {/* Media Attachments */}
                  {(detailData.screenshot_path || detailData.recording_path || detailData.attachment_path) && (
                    <>
                      <div className="fbc-section-title">
                        <MdDownload /> Downloadable Media Attachments
                      </div>
                      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                        {detailData.screenshot_path && (
                          <a
                            href={`${API_URL}/storage/${detailData.screenshot_path}`}
                            target="_blank"
                            rel="noreferrer"
                            className="fb-btn-cancel"
                            style={{ textDecoration: "none", fontSize: "0.8rem" }}
                          >
                            📷 View Screenshot
                          </a>
                        )}
                        {detailData.recording_path && (
                          <a
                            href={`${API_URL}/storage/${detailData.recording_path}`}
                            target="_blank"
                            rel="noreferrer"
                            className="fb-btn-cancel"
                            style={{ textDecoration: "none", fontSize: "0.8rem" }}
                          >
                            📹 View Recording
                          </a>
                        )}
                        {detailData.attachment_path && (
                          <a
                            href={`${API_URL}/storage/${detailData.attachment_path}`}
                            target="_blank"
                            rel="noreferrer"
                            className="fb-btn-cancel"
                            style={{ textDecoration: "none", fontSize: "0.8rem" }}
                          >
                            📁 View Attachment
                          </a>
                        )}
                      </div>
                    </>
                  )}

                  {/* Internal Admin Notes */}
                  <div className="fbc-section-title">Internal Admin Notes</div>
                  <form onSubmit={handleAddNote} style={{ marginBottom: 16 }}>
                    <textarea
                      className="fbc-input"
                      style={{ width: "100%", height: 70, marginBottom: 8 }}
                      placeholder="Add an internal note visible to admins..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="fb-btn-submit"
                      disabled={isUpdating || !noteText.trim()}
                      style={{ fontSize: "0.8rem", padding: "6px 14px" }}
                    >
                      <MdSend size={14} /> Add Note
                    </button>
                  </form>

                  {detailData.notes && detailData.notes.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                      {detailData.notes.map((n) => (
                        <div key={n.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: 10, borderRadius: 6, fontSize: "0.82rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", marginBottom: 4 }}>
                            <strong>{n.user?.name || "Admin"}</strong>
                            <span>{new Date(n.created_at).toLocaleString()}</span>
                          </div>
                          <div>{n.note}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Activity Timeline */}
                  <div className="fbc-section-title">
                    <MdTimeline /> Activity Timeline
                  </div>
                  <ul className="fbc-timeline">
                    {detailData.activity_logs && detailData.activity_logs.length > 0 ? (
                      detailData.activity_logs.map((log) => (
                        <li key={log.id} className="fbc-timeline-item">
                          <div className="fbc-timeline-dot" />
                          <div className="fbc-timeline-content">
                            <strong>{log.user?.name || "System"}</strong> — {log.details}
                            <span className="fbc-timeline-time">
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </div>
                        </li>
                      ))
                    ) : (
                      <div style={{ fontSize: "0.82rem", color: "#64748b" }}>No activity logs recorded yet.</div>
                    )}
                  </ul>

                  {/* Previous Feedback History */}
                  <div className="fbc-section-title" style={{ marginTop: 24 }}>
                    <MdHistory /> Previous Submissions from User/Org
                  </div>
                  <div className="fbc-history-list">
                    {historyData && historyData.length > 0 ? (
                      historyData.map((h) => (
                        <div key={h.id} className="fbc-history-item" onClick={() => openDetail(h.id)} style={{ cursor: "pointer" }}>
                          <div>
                            <strong style={{ color: "#2563eb" }}>{h.reference_number}</strong> — {h.subject}
                            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{h.feedback_type}</div>
                          </div>
                          <span className={`fbc-badge ${getStatusClass(h.status)}`}>
                            {h.status}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: "0.82rem", color: "#64748b" }}>No previous feedback found from this user or organization.</div>
                    )}
                  </div>

                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
