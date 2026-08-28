import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import FeedbackModal from "../components/FeedbackModal";
import { authToken, rolePath } from "../utils/auth";
import API_URL from "../config/api";
import { formatDateOnly as formatDate } from "../utils/formatDateTime";
import {
  MdOutlineFeedback,
  MdRefresh,
  MdPerson,
  MdDownload,
  MdSend,
  MdTimeline,
  MdHistory,
  MdClose,
} from "react-icons/md";
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
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [feedbacks, setFeedbacks] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  // Drawer / Detail View states
  const [selectedId, setSelectedId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [noteText, setNoteText] = useState("");

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
      .then((data) => {
        setDetailData(data?.feedback || null);
        setHistoryData(data?.history || []);
        setUsersList(data?.users || []);
      })
      .catch(() => setDetailData(null))
      .finally(() => setIsDetailLoading(false));
  };

  const handleUpdate = (field, value) => {
    if (!selectedId) return;
    setIsUpdating(true);
    const token = authToken();

    fetch(`${API_URL}/feedback/${selectedId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ [field]: value }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.feedback) {
          setDetailData(data.feedback);
          fetchFeedbacks();
        }
      })
      .finally(() => setIsUpdating(false));
  };

  const handleAddNote = (e) => {
    e.preventDefault();
    if (!selectedId || !noteText.trim()) return;
    setIsUpdating(true);
    const token = authToken();

    fetch(`${API_URL}/feedback/${selectedId}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ note: noteText }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.feedback) {
          setDetailData(data.feedback);
          setNoteText("");
        }
      })
      .finally(() => setIsUpdating(false));
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
            { label: t("Admin", { defaultValue: "Admin" }), path: "/admin" },
            { label: t("Dashboard", { defaultValue: "Dashboard" }), path: rolePath("dashboard") },
            { label: t("User Feedback Center", { defaultValue: "User Feedback Center" }) },
          ]}
        />

        <div className="fbc-header">
          <div className="fbc-title-group">
            <h1>
              <MdOutlineFeedback
                color="#2563eb"
                size={28}
                style={{ verticalAlign: "middle", marginRight: 8 }}
              />
              {t("User Feedback & Product Improvement", { defaultValue: "User Feedback & Product Improvement" })}
            </h1>
            <p>
              {t("Manage, review, and track user bug reports, feature requests, and suggestions.", { defaultValue: "Manage, review, and track user bug reports, feature requests, and suggestions." })}
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="fb-btn-submit" onClick={() => setIsFeedbackModalOpen(true)}>
              + {t("Create Feedback", { defaultValue: "Create Feedback" })}
            </button>
            <button className="fb-btn-cancel" onClick={fetchFeedbacks} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <MdRefresh size={18} />
              {t("Refresh", { defaultValue: "Refresh" })}
            </button>
          </div>
        </div>

        <div className="fbc-filters-card">
          <div className="fbc-filter-grid">
            <div className="fbc-filter-item">
              <label>{t("Search", { defaultValue: "Search" })}</label>
              <input
                type="text"
                className="fbc-input"
                placeholder={t("Search ref #, subject, user...", { defaultValue: "Search ref #, subject, user..." })}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="fbc-filter-item">
              <label>{t("Feedback Type", { defaultValue: "Feedback Type" })}</label>
              <select
                className="fbc-select"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">{t("All Types", { defaultValue: "All Types" })}</option>
                {TYPE_OPTIONS.map((typeOpt) => (
                  <option key={typeOpt} value={typeOpt}>
                    {t(typeOpt, { defaultValue: typeOpt })}
                  </option>
                ))}
              </select>
            </div>

            <div className="fbc-filter-item">
              <label>{t("Status", { defaultValue: "Status" })}</label>
              <select
                className="fbc-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">{t("All Statuses", { defaultValue: "All Statuses" })}</option>
                {STATUS_OPTIONS.map((statusOpt) => (
                  <option key={statusOpt} value={statusOpt}>
                    {t(statusOpt, { defaultValue: statusOpt })}
                  </option>
                ))}
              </select>
            </div>

            <div className="fbc-filter-item">
              <label>{t("Priority", { defaultValue: "Priority" })}</label>
              <select
                className="fbc-select"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                <option value="">{t("All Priorities", { defaultValue: "All Priorities" })}</option>
                {PRIORITY_OPTIONS.map((priorityOpt) => (
                  <option key={priorityOpt} value={priorityOpt}>
                    {t(priorityOpt, { defaultValue: priorityOpt })}
                  </option>
                ))}
              </select>
            </div>

            <div className="fbc-filter-item">
              <label>{t("Organization", { defaultValue: "Organization" })}</label>
              <input
                type="text"
                className="fbc-input"
                placeholder={t("Filter by Organization...", { defaultValue: "Filter by Organization..." })}
                value={orgFilter}
                onChange={(e) => setOrgFilter(e.target.value)}
              />
            </div>

            <div className="fbc-filter-item">
              <label>{t("From Date", { defaultValue: "From Date" })}</label>
              <input
                type="date"
                className="fbc-input"
                value={dateStart}
                max={dateEnd || undefined}
                onChange={(e) => setDateStart(e.target.value)}
              />
            </div>

            <div className="fbc-filter-item">
              <label>{t("To Date", { defaultValue: "To Date" })}</label>
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

        <div className="fbc-table-card">
          <table className="fbc-table">
            <thead>
              <tr>
                <th>{t("Reference #", { defaultValue: "Reference #" })}</th>
                <th>{t("Type", { defaultValue: "Type" })}</th>
                <th>{t("Subject", { defaultValue: "Subject" })}</th>
                <th>{t("User & Organization", { defaultValue: "User & Organization" })}</th>
                <th>{t("Module", { defaultValue: "Module" })}</th>
                <th>{t("Priority", { defaultValue: "Priority" })}</th>
                <th>{t("Status", { defaultValue: "Status" })}</th>
                <th>{t("Submitted", { defaultValue: "Submitted" })}</th>
                <th>{t("Action", { defaultValue: "Action" })}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: 30 }}>
                    {t("Loading feedback entries...", { defaultValue: "Loading feedback entries..." })}
                  </td>
                </tr>
              ) : feedbacks.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: 30, color: "#64748b" }}>
                    {t("No feedback submissions found matching your filters.", { defaultValue: "No feedback submissions found matching your filters." })}
                  </td>
                </tr>
              ) : (
                feedbacks.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong style={{ color: "#2563eb" }}>{item.reference_number}</strong>
                    </td>
                    <td>
                      <div>{t(item.feedback_type, { defaultValue: item.feedback_type })}</div>
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
                        {item.organization_name} ({t(item.user_role, { defaultValue: item.user_role })})
                      </div>
                    </td>
                    <td>{item.module ? t(item.module, { defaultValue: item.module }) : t("General", { defaultValue: "General" })}</td>
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
                        {item.priority ? t(item.priority, { defaultValue: item.priority }) : t("Medium", { defaultValue: "Medium" })}
                      </span>
                    </td>
                    <td>
                      <span className={`fbc-badge ${getStatusClass(item.status)}`}>
                        {t(item.status, { defaultValue: item.status })}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.8rem", color: "#64748b" }}>
                      <div>{formatDate(item.submitted_at || item.created_at)}</div>
                      <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                        {new Date(item.submitted_at || item.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td>
                      <button
                        className="fb-btn-cancel"
                        style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                        onClick={() => openDetail(item.id)}
                      >
                        {t("View Detail", { defaultValue: "View Detail" })}
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
                    {t("Feedback {{ref}}", { ref: detailData?.reference_number || `#${selectedId}`, defaultValue: `Feedback ${detailData?.reference_number || `#${selectedId}`}` })}
                  </h3>
                  <span className={`fbc-badge ${getStatusClass(detailData?.status)}`} style={{ marginTop: 4 }}>
                    {detailData?.status ? t(detailData.status, { defaultValue: detailData.status }) : ""}
                  </span>
                </div>
                <button className="fb-modal-close" onClick={() => setSelectedId(null)}>
                  <MdClose size={22} />
                </button>
              </div>

              {isDetailLoading || !detailData ? (
                <div style={{ padding: 40, textAlign: "center" }}>
                  {t("Loading detailed record...", { defaultValue: "Loading detailed record..." })}
                </div>
              ) : (
                <div className="fbc-drawer-body">
                  {/* Admin Controls Panel */}
                  <div className="fbc-admin-controls">
                    <div className="fbc-filter-item">
                      <label>{t("Change Status", { defaultValue: "Change Status" })}</label>
                      <select
                        className="fbc-select"
                        value={detailData.status}
                        disabled={isUpdating}
                        onChange={(e) => handleUpdate("status", e.target.value)}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {t(s, { defaultValue: s })}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="fbc-filter-item">
                      <label>{t("Change Priority", { defaultValue: "Change Priority" })}</label>
                      <select
                        className="fbc-select"
                        value={detailData.priority || "Medium"}
                        disabled={isUpdating}
                        onChange={(e) => handleUpdate("priority", e.target.value)}
                      >
                        {PRIORITY_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {t(p, { defaultValue: p })}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="fbc-filter-item">
                      <label>{t("Assign To", { defaultValue: "Assign To" })}</label>
                      <select
                        className="fbc-select"
                        value={detailData.assigned_to || ""}
                        disabled={isUpdating}
                        onChange={(e) => handleUpdate("assigned_to", e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">{t("Unassigned", { defaultValue: "Unassigned" })}</option>
                        {usersList.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({t(u.role, { defaultValue: u.role })})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Submission Overview */}
                  {detailData.rating > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, background: "#fffbe6", border: "1px solid #ffe58f", padding: "10px 14px", borderRadius: 8 }}>
                      <strong style={{ color: "#873800", fontSize: "0.88rem" }}>{t("Feature Rating:", { defaultValue: "Feature Rating:" })}</strong>
                      <div style={{ color: "#faad14", fontSize: "1.2rem", display: "flex", gap: 2 }}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <span key={s} style={{ color: s <= detailData.rating ? "#faad14" : "#d9d9d9" }}>★</span>
                        ))}
                      </div>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#d48806", marginLeft: 4 }}>
                        {t("({{rating}} / 5 Stars)", { rating: detailData.rating, defaultValue: `(${detailData.rating} / 5 Stars)` })}
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
                    <MdPerson /> {t("Auto-Captured System Information", { defaultValue: "Auto-Captured System Information" })}
                  </div>
                  <div className="fbc-auto-info-grid">
                    <div className="fbc-info-cell">
                      <span>{t("Submitted By", { defaultValue: "Submitted By" })}</span>
                      <strong>{detailData.user_name} ({t(detailData.user_role, { defaultValue: detailData.user_role })})</strong>
                    </div>
                    <div className="fbc-info-cell">
                      <span>{t("Organization", { defaultValue: "Organization" })}</span>
                      <strong>{detailData.organization_name}</strong>
                    </div>
                    <div className="fbc-info-cell">
                      <span>{t("Module", { defaultValue: "Module" })}</span>
                      <strong>{detailData.module ? t(detailData.module, { defaultValue: detailData.module }) : t("General", { defaultValue: "General" })}</strong>
                    </div>
                    <div className="fbc-info-cell">
                      <span>{t("Current Page Route", { defaultValue: "Current Page Route" })}</span>
                      <strong>{detailData.current_page}</strong>
                    </div>
                    <div className="fbc-info-cell">
                      <span>{t("Operating System", { defaultValue: "Operating System" })}</span>
                      <strong>{detailData.operating_system}</strong>
                    </div>
                    <div className="fbc-info-cell">
                      <span>{t("Browser", { defaultValue: "Browser" })}</span>
                      <strong>{detailData.browser}</strong>
                    </div>
                    <div className="fbc-info-cell">
                      <span>{t("Device Type", { defaultValue: "Device Type" })}</span>
                      <strong>{detailData.device_type}</strong>
                    </div>
                    <div className="fbc-info-cell">
                      <span>{t("IP Address", { defaultValue: "IP Address" })}</span>
                      <strong>{detailData.ip_address || t("Captured", { defaultValue: "Captured" })}</strong>
                    </div>
                    <div className="fbc-info-cell">
                      <span>{t("App Version", { defaultValue: "App Version" })}</span>
                      <strong>{detailData.app_version}</strong>
                    </div>
                  </div>

                  {/* Media Attachments */}
                  {(detailData.screenshot_path || detailData.recording_path || detailData.attachment_path) && (
                    <>
                      <div className="fbc-section-title">
                        <MdDownload /> {t("Downloadable Media Attachments", { defaultValue: "Downloadable Media Attachments" })}
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
                            📷 {t("View Screenshot", { defaultValue: "View Screenshot" })}
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
                            📹 {t("View Recording", { defaultValue: "View Recording" })}
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
                            📁 {t("View Attachment", { defaultValue: "View Attachment" })}
                          </a>
                        )}
                      </div>
                    </>
                  )}

                  {/* Internal Admin Notes */}
                  <div className="fbc-section-title">{t("Internal Admin Notes", { defaultValue: "Internal Admin Notes" })}</div>
                  <form onSubmit={handleAddNote} style={{ marginBottom: 16 }}>
                    <textarea
                      className="fbc-input"
                      style={{ width: "100%", height: 70, marginBottom: 8 }}
                      placeholder={t("Add an internal note visible to admins...", { defaultValue: "Add an internal note visible to admins..." })}
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="fb-btn-submit"
                      disabled={isUpdating || !noteText.trim()}
                      style={{ fontSize: "0.8rem", padding: "6px 14px" }}
                    >
                      <MdSend size={14} /> {t("Add Note", { defaultValue: "Add Note" })}
                    </button>
                  </form>

                  {detailData.notes && detailData.notes.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                      {detailData.notes.map((n) => (
                        <div key={n.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: 10, borderRadius: 6, fontSize: "0.82rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", marginBottom: 4 }}>
                            <strong>{n.user?.name || t("Admin", { defaultValue: "Admin" })}</strong>
                            <span>{new Date(n.created_at).toLocaleString()}</span>
                          </div>
                          <div>{n.note}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Activity Timeline */}
                  <div className="fbc-section-title">
                    <MdTimeline /> {t("Activity Timeline", { defaultValue: "Activity Timeline" })}
                  </div>
                  <ul className="fbc-timeline">
                    {detailData.activity_logs && detailData.activity_logs.length > 0 ? (
                      detailData.activity_logs.map((log) => (
                        <li key={log.id} className="fbc-timeline-item">
                          <div className="fbc-timeline-dot" />
                          <div className="fbc-timeline-content">
                            <strong>{log.user?.name || t("System", { defaultValue: "System" })}</strong> — {log.details}
                            <span className="fbc-timeline-time">
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </div>
                        </li>
                      ))
                    ) : (
                      <div style={{ fontSize: "0.82rem", color: "#64748b" }}>{t("No activity logs recorded yet.", { defaultValue: "No activity logs recorded yet." })}</div>
                    )}
                  </ul>

                  {/* Previous Feedback History */}
                  <div className="fbc-section-title" style={{ marginTop: 24 }}>
                    <MdHistory /> {t("Previous Submissions from User/Org", { defaultValue: "Previous Submissions from User/Org" })}
                  </div>
                  <div className="fbc-history-list">
                    {historyData && historyData.length > 0 ? (
                      historyData.map((h) => (
                        <div key={h.id} className="fbc-history-item" onClick={() => openDetail(h.id)} style={{ cursor: "pointer" }}>
                          <div>
                            <strong style={{ color: "#2563eb" }}>{h.reference_number}</strong> — {h.subject}
                            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{t(h.feedback_type, { defaultValue: h.feedback_type })}</div>
                          </div>
                          <span className={`fbc-badge ${getStatusClass(h.status)}`}>
                            {t(h.status, { defaultValue: h.status })}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: "0.82rem", color: "#64748b" }}>{t("No previous feedback found from this user or organization.", { defaultValue: "No previous feedback found from this user or organization." })}</div>
                    )}
                  </div>

                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => {
          setIsFeedbackModalOpen(false);
          fetchFeedbacks();
        }}
      />
    </DashboardLayout>
  );
}