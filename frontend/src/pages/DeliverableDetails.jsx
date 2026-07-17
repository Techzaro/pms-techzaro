/**
 * SubtaskDetails.jsx — Subtask Details Page
 *
 * Displays full details of a single subtask including:
 * - Title, status badge, related task, assignee, due date, and description
 * - Submit/resubmit form for assignees (comment + file + links)
 * - Approve/reject actions for creators and managers
 * - Submission history with attachments and links
 * - Sidebar with subtask metadata
 * - Unviewed changes panel (auto-marked as read on view)
 *
 * Supports deep-linking from Deliveries, DeliveriesByYou, or SelfDeliveries pages.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Download } from "lucide-react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import ConfirmModal from "../components/ConfirmModal";
import API_URL from "../config/api";
import { authToken, getUser, rolePath } from "../utils/auth";
import { publish } from "../utils/eventBus";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage } from "../utils/notify";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import "./TaskDetails.css";
import { formatDateTimeShort } from "../utils/formatDateTime";
import "./SubtaskDetails.css";
import "../components/layout/CreateTaskModal.css";

/** Converts an ISO timestamp to relative time string (e.g. "5 min ago") */
function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hours ago`;
  return `${Math.floor(sec / 86400)} days ago`;
}

/** Returns background and text color pair based on subtask status */
function statusStyle(status) {
  const s = (status || "").toLowerCase();
  if (s === "approved") return { bg: "#DCFCE7", text: "#166534" };
  if (s === "submitted") return { bg: "#DBEAFE", text: "#1E40AF" };
  if (s === "rejected") return { bg: "#FEE2E2", text: "#991B1B" };
  return { bg: "#FEF3C7", text: "#92400E" };
}

/**
 * SubtaskDetails — Main page component for viewing a single subtask.
 * Manages fetching, submission, approval, rejection, and display of subtask data.
 */
function SubtaskDetails() {
  const params = useParams();
  const location = useLocation();
  const subtaskId = params.deliverable;

  // Map of source page keys to breadcrumb labels and paths (for back navigation)
  const subtaskSourcePages = {
    deliveries: { label: "Subtasks Assigned To You", path: rolePath("deliveries") },
    "deliveries-by-you": { label: "Subtasks Assigned By You", path: rolePath("deliveries-by-you") },
    "self-deliveries": { label: "Self Subtasks", path: rolePath("self-deliveries") },
  };
  const subtaskSource = subtaskSourcePages[location.state?.from] || null;

  const [subtask, setSubtask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [submitComment, setSubmitComment] = useState("");
  const [submitFile, setSubmitFile] = useState(null);
  const [submitFiles, setSubmitFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const fileInputRef = useRef(null);
  const filesInputRef = useRef(null);
  const [linkRemoveConfirmOpen, setLinkRemoveConfirmOpen] = useState(false);
  const [pendingLinkIndex, setPendingLinkIndex] = useState(-1);

  const notify = useNotification();

  // Fetch subtask data from API
  const fetchSubtask = useCallback(() => {
    setLoading(true);
    const token = authToken();
    fetch(`${API_URL}/deliverables/${subtaskId}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setSubtask(data?.deliverable || null);
        setShowSubmitForm(false);
        setShowRejectForm(false);
      })
      .catch(() => setSubtask(null))
      .finally(() => setLoading(false));
  }, [subtaskId]);

  useEffect(() => { fetchSubtask(); }, [fetchSubtask]);

  useRefreshOnEvent(["deliverable:updated", "task:updated"], fetchSubtask);

  // Auto-mark subtask changes as read
  useEffect(() => {
    if (!subtask?.id || !subtask?.unviewed_changes_count) return;
    const token = authToken();
    fetch(`${API_URL}/deliverables/${subtask.id}/changes/mark-read`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      _notifHandled: true,
    }).catch(() => {});
  }, [subtask?.id, subtask?.unviewed_changes_count]);

  // Determine user permissions for this subtask
  const currentUser = getUser();
  const isCreator = subtask && currentUser && parseInt(subtask.created_by, 10) === parseInt(currentUser.id, 10);
  const isAdminManager = currentUser && ["admin", "manager"].includes(currentUser.role);
  const isAssignee = subtask && currentUser && subtask.assigned_to && parseInt(subtask.assigned_to, 10) === parseInt(currentUser.id, 10);
  const canApproveReject = isCreator || isAdminManager;

  /** Adds a URL link to the submission links list */
  const handleAddLink = () => {
    if (!linkInput.trim()) return;
    let url = linkInput.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    setLinks((prev) => [...prev, { url, name: url }]);
    setLinkInput("");
  };

  const handleRemoveLink = (index) => {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLinkKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddLink(); }
  };

  // Submit subtask with comment, files, and links via FormData POST
  const handleSubmit = async () => {
    if (!submitComment.trim() && !submitFile) {
      notify.error("Please add a comment or attach a file.");
      return;
    }
    setSubmitting(true);
    try {
      const token = authToken();
      const formData = new FormData();
      if (submitComment.trim()) formData.append("comment", submitComment.trim());
      if (submitFile) formData.append("file", submitFile);
      submitFiles.forEach((f) => formData.append("files[]", f));
      links.forEach((l) => formData.append("links[]", l.url));

      const res = await fetch(`${API_URL}/deliverables/${subtaskId}/submit`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        body: formData,
        _notifHandled: true,
      });

      const data = await res.json();
      if (res.ok) {
        publish('deliverable:updated', data.deliverable || data);
        publish('data:changed', { type: 'deliverable', action: 'updated' });
        showSuccessMessage("Subtask", "submitted");
        setShowSubmitForm(false);
        setSubmitComment("");
        setSubmitFile(null);
        setSubmitFiles([]);
        setLinks([]);
        setLinkInput("");
        fetchSubtask();
      } else {
        notify.error(data.message || "Failed to submit");
      }
    } catch {
      notify.error("An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  // Approve the subtask (creator/admin/manager only)
  const handleApprove = async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${subtaskId}/approve`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        publish('deliverable:updated', data.deliverable || data);
        publish('data:changed', { type: 'deliverable', action: 'updated' });
        showSuccessMessage("Subtask", "approved");
        fetchSubtask();
      } else {
        notify.error(data.message || "Failed to approve");
      }
    } catch {
      notify.error("An error occurred");
    }
  };

  // Reject the subtask with optional comment (creator/admin/manager only)
  const handleReject = async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${subtaskId}/reject`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ comment: rejectComment }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        publish('deliverable:updated', data.deliverable || data);
        publish('data:changed', { type: 'deliverable', action: 'updated' });
        showSuccessMessage("Subtask", "rejected");
        setShowRejectForm(false);
        setRejectComment("");
        fetchSubtask();
      } else {
        notify.error(data.message || "Failed to reject");
      }
    } catch {
      notify.error("An error occurred");
    }
  };

  if (loading) {
    return (
      <DashboardLayout hideRightSidebar>
        <div className="td-loading">Loading subtask...</div>
      </DashboardLayout>
    );
  }

  if (!subtask) {
    return (
      <DashboardLayout hideRightSidebar>
        <div className="td-loading td-error">Subtask not found.</div>
      </DashboardLayout>
    );
  }

  // Derive display properties from subtask status
  const ss = statusStyle(subtask.status);
  const submissions = (subtask.submissions || []).slice().reverse();
  // Only assignee can submit if status is pending or rejected
  const canSubmit = isAssignee && (subtask.status === "pending" || subtask.status === "rejected");
  const isApproved = subtask.status === "approved";
  const isSubmitted = subtask.status === "submitted";
  const isRejected = subtask.status === "rejected";

  return (
    <>
    <DashboardLayout hideRightSidebar>
      <div className="td-page">

        <div className="td-layout">
          <div className="td-main">
            <Breadcrumb items={[
              { label: "Subtasks", path: rolePath("deliveries") },
              ...(subtaskSource ? [{ label: subtaskSource.label, path: subtaskSource.path }] : []),
              { label: subtask.title },
            ]} />



            <div className="td-title-row">
              <h1 className="td-title">{subtask.title}</h1>
            </div>

            <div className="td-badges">
              <span className="td-badge" style={{ background: ss.bg, color: ss.text }}>
                <span className="td-badge-dot" style={{ background: ss.text }} />
                {(subtask.status || "").charAt(0).toUpperCase() + (subtask.status || "").slice(1)}
              </span>
            </div>

            {/* Info Cards */}
            <div className="td-stats" style={{ marginTop: "20px" }}>
              <div className="td-stat td-stat--trio" style={{ width: "100%" }}>
                <div className="td-trio-item">
                  <div>
                    <span className="td-stat-label">Related Task</span>
                    <span className="td-stat-big td-stat-big--sm" style={{ display: "block" }}>{subtask.task?.title || "\u2014"}</span>
                  </div>
                </div>
                <div className="td-trio-item">
                  <div>
                    <span className="td-stat-label">Assigned To</span>
                    <span className="td-stat-big td-stat-big--sm" style={{ display: "block" }}>{subtask.assignee?.name || "\u2014"}</span>
                  </div>
                </div>
                <div className="td-trio-item">
                  <div>
                    <span className="td-stat-label">Due Date</span>
                    <span className="td-stat-big td-stat-big--sm" style={{ display: "block" }}>{formatDateTimeShort(subtask.due_date)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Description */}
            {subtask.description && (
              <div style={{ marginTop: "20px" }}>
                <h2 className="td-section-title">Description</h2>
                <p style={{ color: "#6b7280", lineHeight: 1.6 }}>{subtask.description}</p>
              </div>
            )}

            {/* Submit Form - Assignee: show Submit button for pending, Resubmit button for rejected */}
            {canSubmit && (
              <div style={{ marginTop: "24px" }}>
                {!showSubmitForm && (
                  <button className="td-btn-primary" onClick={() => setShowSubmitForm(true)}>
                    {isRejected ? "Resubmit Subtask" : "Submit Subtask"}
                  </button>
                )}
                {showSubmitForm && (
                  <div className="td-card" style={{ padding: "20px" }}>
                    <h3 className="td-card-title">{isRejected ? "Resubmit Subtask" : "Submit Subtask"}</h3>
                    <div style={{ marginTop: "12px" }}>
                      <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: 500, color: "#374151" }}>Comment</label>
                      <textarea
                        className="td-notes"
                        style={{ width: "100%", minHeight: "80px", padding: "10px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px" }}
                        placeholder="Add a comment about your submission..."
                        value={submitComment}
                        onChange={(e) => setSubmitComment(e.target.value)}
                      />
                    </div>
                    <div style={{ marginTop: "12px" }}>
                      <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: 500, color: "#374151" }}>File Attachment</label>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={(e) => setSubmitFile(e.target.files[0])}
                        style={{ fontSize: "14px" }}
                      />
                      {submitFile && (
                        <div style={{ marginTop: "6px", fontSize: "13px", color: "#6366f1" }}>
                          Selected: {submitFile.name}
                        </div>
                      )}
                    </div>
                    <div style={{ marginTop: "12px" }}>
                      <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: 500, color: "#374151" }}>Additional Files</label>
                      <input
                        type="file"
                        multiple
                        ref={filesInputRef}
                        onChange={(e) => setSubmitFiles(Array.from(e.target.files))}
                        style={{ fontSize: "14px" }}
                      />
                      {submitFiles.length > 0 && (
                        <div style={{ marginTop: "6px", fontSize: "13px", color: "#6366f1" }}>
                          {submitFiles.length} file(s) selected
                        </div>
                      )}
                    </div>
                    <div style={{ marginTop: "12px" }}>
                      <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: 500, color: "#374151" }}>Links</label>
                      <div className="task-link-input-row">
                        <input
                          type="text"
                          placeholder="Paste link (Drive, Figma, GitHub, etc.)"
                          value={linkInput}
                          onChange={(e) => setLinkInput(e.target.value)}
                          onKeyDown={handleLinkKeyDown}
                        />
                        <button
                          type="button"
                          className="task-link-add-btn"
                          onClick={handleAddLink}
                          disabled={!linkInput.trim()}
                        >
                          Add Link
                        </button>
                      </div>
                      {links.length > 0 && (
                        <div className="task-attachments-list">
                          {links.map((link, index) => (
                            <div key={index} className="task-attachment-item">
                              <span className="task-attachment-icon">🔗</span>
                              <a href={link.url} target="_blank" rel="noopener noreferrer" className="task-attachment-name task-attachment-link">
                                {link.url.length > 45 ? link.url.substring(0, 45) + "..." : link.url}
                              </a>
                              <a href={link.url} target="_blank" rel="noopener noreferrer" className="task-attachment-open">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                  <polyline points="15 3 21 3 21 9" />
                                  <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                              </a>
                               <button type="button" className="task-attachment-remove" onClick={() => { setPendingLinkIndex(index); setLinkRemoveConfirmOpen(true); }}>✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
                      <button className="td-btn-primary" onClick={handleSubmit} disabled={submitting}>
                        {submitting ? "Submitting..." : "Submit"}
                      </button>
                      <button className="td-btn-outline" onClick={() => { setShowSubmitForm(false); setSubmitComment(""); setSubmitFile(null); setSubmitFiles([]); setLinks([]); setLinkInput(""); }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Review Subtask - Assigner: show Approve/Reject buttons when submitted */}
            {isSubmitted && canApproveReject && (
              <div style={{ marginTop: "24px", display: "flex", gap: "10px", alignItems: "flex-start", flexDirection: "column" }}>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button className="td-btn-primary" style={{ background: "#166534" }} onClick={handleApprove}>
                    Approve
                  </button>
                  <button className="td-btn-danger" onClick={() => setShowRejectForm(true)}>
                    Reject
                  </button>
                </div>
                {showRejectForm && (
                  <div className="td-card" style={{ padding: "16px", width: "100%", maxWidth: "400px" }}>
                    <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: 500, color: "#374151" }}>Rejection Comment (optional)</label>
                    <textarea
                      style={{ width: "100%", minHeight: "60px", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px" }}
                      placeholder="Reason for rejection..."
                      value={rejectComment}
                      onChange={(e) => setRejectComment(e.target.value)}
                    />
                    <div style={{ marginTop: "10px", display: "flex", gap: "8px" }}>
                      <button className="td-btn-danger" onClick={handleReject}>Confirm Reject</button>
                      <button className="td-btn-outline" onClick={() => { setShowRejectForm(false); setRejectComment(""); }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Rejection info - shown when rejected */}
            {isRejected && subtask.rejection_comment && (
              <div style={{ marginTop: "20px", padding: "16px", background: "#FEE2E2", borderRadius: "8px", border: "1px solid #FECACA" }}>
                <h3 className="td-card-title" style={{ color: "#991B1B" }}>Rejection Reason</h3>
                <p style={{ color: "#7F1D1D", marginTop: "6px" }}>{subtask.rejection_comment}</p>
                {subtask.rejected_by && <p style={{ color: "#7F1D1D", fontSize: "12px", marginTop: "4px" }}>By: {subtask.rejected_by.name}</p>}
              </div>
            )}

            {/* Approved info */}
            {isApproved && (
              <div style={{ marginTop: "20px", padding: "16px", background: "#DCFCE7", borderRadius: "8px", border: "1px solid #BBF7D0" }}>
                <h3 className="td-card-title" style={{ color: "#166534" }}>Approved</h3>
                {subtask.approved_by && <p style={{ color: "#166534", marginTop: "4px", fontSize: "13px" }}>Approved by: {subtask.approved_by.name}</p>}
              </div>
            )}

            {/* Submission History */}
            {submissions.length > 0 && (
              <div style={{ marginTop: "24px" }}>
                <h2 className="td-section-title">Submission History</h2>
                {submissions.map((sub) => (
                  <div key={sub.id} className="td-card" style={{ marginTop: "10px", padding: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "14px" }}>{sub.submitted_by?.name || "Unknown"}</div>
                        <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "2px" }}>{timeAgo(sub.created_at)}</div>
                      </div>
                    </div>
                    {sub.comment && <p style={{ marginTop: "8px", color: "#374151", fontSize: "14px" }}>{sub.comment}</p>}
                    {sub.file_path && (
                      <div style={{ marginTop: "8px" }}>
                        <a
                          href={`${API_URL.replace("/api", "")}/storage/${sub.file_path}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#6366f1", fontSize: "13px", textDecoration: "none" }}
                        >
                          <Download size={14} />
                          {sub.file_name || "Download File"}
                        </a>
                      </div>
                    )}
                    {sub.attachments?.length > 0 && (
                      <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        {sub.attachments.map((att) => (
                          att.attachment_type === "link" ? (
                            <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer"
                              style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#6366f1", fontSize: "13px", textDecoration: "none" }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                              {att.original_name || att.url}
                            </a>
                          ) : (
                            <a key={att.id} href={att.full_url || `/storage/${att.file_path}`} target="_blank" rel="noopener noreferrer"
                              style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#6366f1", fontSize: "13px", textDecoration: "none" }}>
                              <Download size={14} />
                              {att.original_name || att.file_name || "Download File"}
                            </a>
                          )
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <aside className="td-sidebar">
            <div className="td-card">
              <h3 className="td-card-title">Subtask Info</h3>
              <ul className="td-info">
                <li>
                  <span className="td-dot" style={{ background: "#3b82f6" }} />
                  <div>
                    <span className="td-info-label">Task</span>
                    <span className="td-info-val">{subtask.task?.title || "\u2014"}</span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "#f59e0b" }} />
                  <div>
                    <span className="td-info-label">Assigned To</span>
                    <span className="td-info-val">{subtask.assignee?.name || "\u2014"}</span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "#8b5cf6" }} />
                  <div>
                    <span className="td-info-label">Created By</span>
                    <span className="td-info-val">{subtask.creator?.name || "\u2014"}</span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "#22c55e" }} />
                  <div>
                    <span className="td-info-label">Due Date</span>
                    <span className="td-info-val">{formatDateTimeShort(subtask.due_date)}</span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "#ef4444" }} />
                  <div>
                    <span className="td-info-label">Status</span>
                    <span className="td-info-val">{(subtask.status || "").charAt(0).toUpperCase() + (subtask.status || "").slice(1)}</span>
                  </div>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </DashboardLayout>
    <ConfirmModal
      isOpen={linkRemoveConfirmOpen}
      onClose={() => { setLinkRemoveConfirmOpen(false); setPendingLinkIndex(-1); }}
      onConfirm={() => { handleRemoveLink(pendingLinkIndex); setLinkRemoveConfirmOpen(false); setPendingLinkIndex(-1); }}
      title="Remove Link"
      message="Are you sure you want to remove this link?"
      confirmText="Remove"
      cancelText="Cancel"
      danger
    />
    </>
  );
}

export default SubtaskDetails;
