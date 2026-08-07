import React, { useState, useEffect } from "react";
import API_URL from "../../config/api";
import { authToken } from "../../utils/auth";
import {
  X,
  Clock,
  User,
  Shield,
  FileText,
  Paperclip,
  MessageSquare,
  Upload,
  Send,
  CheckCircle,
  XCircle,
  RotateCcw,
  HelpCircle,
  Lock,
  UserCheck,
  Eye,
  AlertTriangle,
  Download,
  Calendar,
  Building,
  Tag,
  Laptop
} from "lucide-react";
import "./ApplicationHistoryModal.css";

function ApplicationHistoryModal({ isOpen, onClose, requestType, requestId, onRefresh }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("timeline"); // timeline, attachments, comments

  // Action states
  const [newComment, setNewComment] = useState("");
  const [actionType, setActionType] = useState("Comment Added"); // Comment Added, Info Requested, Returned for Revision
  const [isInternal, setIsInternal] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const [uploadFile, setUploadFile] = useState(null);
  const [uploadNote, setUploadNote] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);

  const [adminStatus, setAdminStatus] = useState("");
  const [assignedAdminId, setAssignedAdminId] = useState("");
  const [adminRemarks, setAdminRemarks] = useState("");
  const [submittingStatus, setSubmittingStatus] = useState(false);

  const [adminsList, setAdminsList] = useState([]);

  useEffect(() => {
    if (isOpen && requestType && requestId) {
      fetchDetail();
    }
  }, [isOpen, requestType, requestId]);

  const fetchDetail = async () => {
    setLoading(true);
    setError("");
    try {
      const token = authToken();
      const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };

      // Log view event & fetch detail
      const res = await fetch(`${API_URL}/hrm/application-history/${encodeURIComponent(requestType)}/${requestId}`, { headers });
      const json = await res.json();

      if (json.success && json.data) {
        setData(json.data);
        setAdminStatus(json.data.application.status || "");
        setAssignedAdminId(json.data.application.assigned_admin_id || "");
      } else {
        setError(json.message || "Failed to load application history.");
      }

      // Fetch admins list for re-assignment dropdown if needed
      const filtersRes = await fetch(`${API_URL}/hrm/application-history`, { headers });
      const filtersJson = await filtersRes.json();
      if (filtersJson.filters?.admins) {
        setAdminsList(filtersJson.filters.admins);
      }

    } catch (err) {
      setError("Network error while retrieving application timeline.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const app = data?.application || {};
  const audits = data?.audits || [];
  const comments = data?.comments || [];
  const attachments = data?.attachments || [];

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmittingComment(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/hrm/application-history/${encodeURIComponent(requestType)}/${requestId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          comment: newComment,
          action_type: actionType,
          is_internal: isInternal
        })
      });
      const json = await res.json();
      if (json.success) {
        setNewComment("");
        fetchDetail();
        if (onRefresh) onRefresh();
      } else {
        alert(json.message || "Failed to post comment.");
      }
    } catch (err) {
      alert("Error posting comment.");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleUploadAttachment = async (e) => {
    e.preventDefault();
    if (!uploadFile) return;

    setUploadingFile(true);
    try {
      const token = authToken();
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("action_note", uploadNote);

      const res = await fetch(`${API_URL}/hrm/application-history/${encodeURIComponent(requestType)}/${requestId}/attachments`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`
        },
        body: formData
      });
      const json = await res.json();
      if (json.success) {
        setUploadFile(null);
        setUploadNote("");
        fetchDetail();
        if (onRefresh) onRefresh();
      } else {
        alert(json.message || "Failed to upload file.");
      }
    } catch (err) {
      alert("Error uploading file.");
    } finally {
      setUploadingFile(false);
    }
  };

  const handleUpdateStatus = async (newStat, customRemarks = null) => {
    setSubmittingStatus(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/hrm/application-history/${encodeURIComponent(requestType)}/${requestId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          status: newStat || adminStatus,
          assigned_admin_id: assignedAdminId,
          remarks: customRemarks || adminRemarks
        })
      });
      const json = await res.json();
      if (json.success) {
        setAdminRemarks("");
        fetchDetail();
        if (onRefresh) onRefresh();
      } else {
        alert(json.message || "Failed to update status.");
      }
    } catch (err) {
      alert("Error updating application status.");
    } finally {
      setSubmittingStatus(false);
    }
  };

  const getStatusBadge = (status) => {
    const s = (status || "Pending").toLowerCase();
    if (s === "approved") return <span className="app-badge app-badge--approved"><CheckCircle size={13} /> Approved</span>;
    if (s === "rejected") return <span className="app-badge app-badge--rejected"><XCircle size={13} /> Rejected</span>;
    if (s === "returned for revision" || s === "returned") return <span className="app-badge app-badge--returned"><RotateCcw size={13} /> Returned for Revision</span>;
    if (s === "info requested") return <span className="app-badge app-badge--info"><HelpCircle size={13} /> Info Requested</span>;
    if (s === "resubmitted") return <span className="app-badge app-badge--resubmitted"><Upload size={13} /> Resubmitted</span>;
    if (s === "closed" || s === "cancelled") return <span className="app-badge app-badge--closed"><Lock size={13} /> {status}</span>;
    return <span className="app-badge app-badge--pending"><Clock size={13} /> Pending</span>;
  };

  const getRolePill = (role) => {
    const r = (role || "").toLowerCase();
    if (r.includes("admin")) return <span className="role-pill role-pill--admin">Admin</span>;
    if (r.includes("manager") || r.includes("hr")) return <span className="role-pill role-pill--manager">HR Manager</span>;
    return <span className="role-pill role-pill--member">Member</span>;
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="app-history-modal" onClick={(e) => e.stopPropagation()}>
        {/* MODAL HEADER */}
        <div className="modal-header">
          <div className="modal-header-main">
            <div className="modal-title-row">
              <span className="app-id-tag">{app.formatted_id || `REQ-${requestId}`}</span>
              <h2>{app.subject || app.type || "Application Timeline"}</h2>
              {getStatusBadge(app.status)}
            </div>
            <p className="modal-subtitle">
              Submitted by <strong>{app.user_name}</strong> ({app.department || "General"}) on{" "}
              {app.created_at ? new Date(app.created_at).toLocaleString() : "—"}
            </p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="modal-loading">
            <div className="spinner"></div>
            <p>Retrieving complete application history and audit trail...</p>
          </div>
        ) : error ? (
          <div className="modal-error">
            <AlertTriangle size={24} color="#ef4444" />
            <p>{error}</p>
          </div>
        ) : (
          <div className="modal-body">
            {/* APPLICATION SUMMARY METADATA CARD */}
            <div className="app-summary-card">
              <div className="summary-col">
                <span className="meta-label"><User size={13} /> Applicant</span>
                <span className="meta-val">{app.user_name} ({getRolePill(app.user_role)})</span>
                <span className="meta-sub">{app.user_email}</span>
              </div>

              <div className="summary-col">
                <span className="meta-label"><Building size={13} /> Department</span>
                <span className="meta-val">{app.department || "N/A"}</span>
                <span className="meta-sub">Type: {app.type}</span>
              </div>

              <div className="summary-col">
                <span className="meta-label"><Tag size={13} /> Priority &amp; Assigned Admin</span>
                <span className="meta-val">
                  <span className={`priority-pill priority-pill--${(app.priority || "Medium").toLowerCase()}`}>
                    {app.priority || "Medium"} Priority
                  </span>
                </span>
                <span className="meta-sub">Assigned: {app.assigned_admin_name || "Unassigned"}</span>
              </div>

              <div className="summary-col">
                <span className="meta-label"><Clock size={13} /> Last Activity</span>
                <span className="meta-val">{app.updated_at ? new Date(app.updated_at).toLocaleString() : "—"}</span>
                <span className="meta-sub">{audits.length} lifecycle events recorded</span>
              </div>
            </div>

            {/* MEMBER LIFETIME APPLICATION HISTORY BREAKDOWN CARD */}
            {data?.member_stats && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "12px 16px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: "13px", color: "#166534", display: "flex", alignItems: "center", gap: "6px" }}>
                    📊 {app.user_name}'s Total Application Lifetime History
                  </h4>
                  <div style={{ display: "flex", gap: "12px", marginTop: "6px", flexWrap: "wrap", fontSize: "12px" }}>
                    <span style={{ fontWeight: "700", color: "#0f172a" }}>Total Submissions: {data.member_stats.total_submissions}</span>
                    <span style={{ color: "#166534", fontWeight: "700" }}>🟢 {data.member_stats.approved_count} Approved</span>
                    <span style={{ color: "#991b1b", fontWeight: "700" }}>🔴 {data.member_stats.rejected_count} Rejected</span>
                    <span style={{ color: "#b45309", fontWeight: "700" }}>⏳ {data.member_stats.pending_count} Pending</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {Object.entries(data.member_stats.type_breakdown || {}).map(([tName, tCount]) => (
                    tCount > 0 && (
                      <span key={tName} style={{ fontSize: "11px", background: "#ffffff", border: "1px solid #86efac", color: "#14532d", padding: "3px 9px", borderRadius: "12px", fontWeight: "700" }}>
                        {tName}: {tCount}
                      </span>
                    )
                  ))}
                </div>
              </div>
            )}

            {/* DETAILS / REASON BOX */}
            <div className="app-details-box">
              <label>Application Details / Remarks:</label>
              <p>{app.details || app.subject || "No details specified."}</p>
            </div>

            {/* NAVIGATION TABS */}
            <div className="modal-tabs">
              <button
                className={`modal-tab ${activeTab === "timeline" ? "active" : ""}`}
                onClick={() => setActiveTab("timeline")}
              >
                <Clock size={15} /> Complete Lifecycle Timeline ({audits.length})
              </button>
              <button
                className={`modal-tab ${activeTab === "attachments" ? "active" : ""}`}
                onClick={() => setActiveTab("attachments")}
              >
                <Paperclip size={15} /> Attachments &amp; Documents ({attachments.length})
              </button>
            </div>

            {/* TAB CONTENT 1: IMMUTABLE AUDIT TIMELINE */}
            {activeTab === "timeline" && (
              <div className="timeline-container">
                <div className="timeline-banner">
                  <Shield size={16} color="#3b82f6" />
                  <span>Immutable Enterprise Audit Trail — Permanent record of all actions performed.</span>
                </div>

                <div className="timeline-list">
                  {audits.map((event, idx) => (
                    <div key={event.id || idx} className="timeline-item">
                      <div className="timeline-marker">
                        <div className="marker-dot"></div>
                        {idx < audits.length - 1 && <div className="marker-line"></div>}
                      </div>

                      <div className="timeline-content">
                        <div className="timeline-header">
                          <div className="timeline-action">
                            <strong>{event.action}</strong>
                            {getRolePill(event.user_role)}
                          </div>
                          <span className="timeline-date">
                            {new Date(event.created_at).toLocaleString()}
                          </span>
                        </div>

                        <div className="timeline-user">
                          <span>Performed by: <strong>{event.user_name || "System"}</strong></span>
                        </div>

                        {event.previous_status !== event.new_status && event.new_status && (
                          <div className="timeline-status-change">
                            <span>Status changed:</span>
                            <span className="status-old">{event.previous_status || "Draft"}</span>
                            <span>➔</span>
                            <span className="status-new">{event.new_status}</span>
                          </div>
                        )}

                        {event.remarks && (
                          <div className="timeline-remarks">
                            <p>"{event.remarks}"</p>
                          </div>
                        )}

                        {/* Optional IP & Device info */}
                        {(event.ip_address || event.user_agent) && (
                          <div className="timeline-meta">
                            {event.ip_address && <span>🌐 IP: {event.ip_address}</span>}
                            {event.user_agent && (
                              <span title={event.user_agent}>
                                💻 {event.user_agent.substring(0, 45)}...
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB CONTENT 2: ATTACHMENTS & UPLOAD */}
            {activeTab === "attachments" && (
              <div className="attachments-container">
                {/* Upload Form */}
                <form className="upload-box" onSubmit={handleUploadAttachment}>
                  <h4><Upload size={16} /> Upload Additional or Replacement Document</h4>
                  <div className="upload-inputs">
                    <input
                      type="file"
                      className="file-input"
                      onChange={(e) => setUploadFile(e.target.files[0])}
                      required
                    />
                    <input
                      type="text"
                      className="note-input"
                      placeholder="Remarks/Note (e.g. Revised medical report)..."
                      value={uploadNote}
                      onChange={(e) => setUploadNote(e.target.value)}
                    />
                    <button type="submit" className="upload-btn" disabled={uploadingFile || !uploadFile}>
                      {uploadingFile ? "Uploading..." : "Upload Document"}
                    </button>
                  </div>
                </form>

                {/* Attachments List */}
                <div className="attachments-list">
                  <h4>Uploaded Files ({attachments.length})</h4>
                  {attachments.length === 0 ? (
                    <p className="empty-text">No documents attached to this application yet.</p>
                  ) : (
                    attachments.map((file) => (
                      <div key={file.id} className="attachment-card">
                        <div className="file-icon">
                          <FileText size={20} color="#4f46e5" />
                        </div>
                        <div className="file-info">
                          <span className="file-name">{file.file_name}</span>
                          <span className="file-meta">
                            Uploaded by {file.uploaded_by_name} on {new Date(file.created_at).toLocaleString()}
                          </span>
                        </div>
                        <a
                          href={`${API_URL.replace('/api', '')}${file.file_path}`}
                          target="_blank"
                          rel="noreferrer"
                          className="download-link"
                          download
                        >
                          <Download size={15} /> Download
                        </a>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ADMIN DECISION PANEL */}
            <div className="admin-actions-bar">
              <div className="actions-header">
                <Shield size={16} color="#4f46e5" />
                <span>Admin Decision Panel</span>
              </div>

              <div className="actions-grid" style={{ gridTemplateColumns: "1fr" }}>
                <div className="action-col" style={{ width: "100%" }}>
                  <label>Admin Decision Remarks:</label>
                  <input
                    type="text"
                    className="remarks-input"
                    placeholder="Provide detailed decision remarks or revision instructions..."
                    value={adminRemarks}
                    onChange={(e) => setAdminRemarks(e.target.value)}
                  />
                </div>
              </div>

              <div className="quick-action-buttons">
                <button
                  className="btn-action btn-action--approve"
                  onClick={() => handleUpdateStatus("Approved")}
                  disabled={submittingStatus}
                >
                  <CheckCircle size={15} /> Approve Application
                </button>

                <button
                  className="btn-action btn-action--return"
                  onClick={() => handleUpdateStatus("Returned for Revision")}
                  disabled={submittingStatus}
                >
                  <RotateCcw size={15} /> Return for Revision
                </button>

                <button
                  className="btn-action btn-action--reject"
                  onClick={() => handleUpdateStatus("Rejected")}
                  disabled={submittingStatus}
                >
                  <XCircle size={15} /> Reject
                </button>

              
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ApplicationHistoryModal;
