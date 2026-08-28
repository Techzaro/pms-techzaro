import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import FeedbackModal from "../components/FeedbackModal";
import { authToken, rolePath } from "../utils/auth";
import API_URL from "../config/api";
import {
  MdOutlineFeedback,
  MdRefresh,
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
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  const fetchFeedbacks = useCallback(() => {
    setIsLoading(true);
    const token = authToken();
    const params = new URLSearchParams();

    if (search) params.append("search", search);
    if (typeFilter) params.append("feedback_type", typeFilter);
    if (statusFilter) params.append("status", statusFilter);
    if (priorityFilter) params.append("priority", priorityFilter);
    if (moduleFilter) params.append("module", moduleFilter);
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
    dateStart,
    dateEnd,
  ]);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

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
            { label: "Dashboard", path: rolePath("dashboard") },
            { label: "User Feedback Center" },
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
              User Feedback & Product Improvement
            </h1>
            <p>
              Manage, review, and track user bug reports, feature requests, and suggestions.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="fb-btn-submit" onClick={() => setIsFeedbackModalOpen(true)}>
              + Create Feedback
            </button>
            <button className="fb-btn-cancel" onClick={fetchFeedbacks} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px", fontSize: "0.82rem" }}>
              <MdRefresh size={16} />
              Refresh
            </button>
          </div>
        </div>

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

        <div className="fbc-table-card">
          <table className="fbc-table">
            <thead>
              <tr>
                <th>Reference #</th>
                <th>Type</th>
                <th>Subject</th>
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
                  <td colSpan={8} style={{ textAlign: "center", padding: 30 }}>
                    Loading feedback entries...
                  </td>
                </tr>
              ) : feedbacks.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: 30, color: "#64748b" }}>
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
                      <div>{new Date(item.submitted_at || item.created_at).toLocaleDateString()}</div>
                      <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>{new Date(item.submitted_at || item.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td>
                      <button
                        className="fb-btn-cancel"
                        style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                        onClick={() => navigate(rolePath(`feedback/${item.id}`))}
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
