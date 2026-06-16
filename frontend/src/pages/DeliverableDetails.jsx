import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Download } from "lucide-react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import API_URL from "../config/api";
import { authToken, getUser, rolePath } from "../utils/auth";
import "./TaskDetails.css";
import { formatDateTimeShort } from "../utils/formatDateTime";
import "./DeliverableDetails.css";

function formatShortDate(value) {
  return formatDateTimeShort(value);
}

function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hours ago`;
  return `${Math.floor(sec / 86400)} days ago`;
}

function statusStyle(status) {
  const s = (status || "").toLowerCase();
  if (s === "approved") return { bg: "#DCFCE7", text: "#166534" };
  if (s === "submitted") return { bg: "#DBEAFE", text: "#1E40AF" };
  if (s === "rejected") return { bg: "#FEE2E2", text: "#991B1B" };
  return { bg: "#FEF3C7", text: "#92400E" };
}

function buildAttachmentUrl(attachment) {
  if (!attachment) return null;
  if (attachment.attachment_type === "link") return attachment.url;
  const url = attachment.full_url || attachment.url;
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${API_URL.replace("/api", "")}${url}`;
}

function DeliverableDetails() {
  const params = useParams();
  const location = useLocation();
  const deliverableId = params.deliverable;

  const deliverableSourcePages = {
    deliveries: { label: "Deliverables Assigned To You", path: rolePath("deliveries") },
    "deliveries-by-you": { label: "Deliverables Assigned By You", path: rolePath("deliveries-by-you") },
    "self-deliveries": { label: "Self Deliverables", path: rolePath("self-deliveries") },
  };
  const deliverableSource = deliverableSourcePages[location.state?.from] || null;

  const [deliverable, setDeliverable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [submitComment, setSubmitComment] = useState("");
  const [submitFiles, setSubmitFiles] = useState([]);
  const [submitLinks, setSubmitLinks] = useState([""]);
  const [submitting, setSubmitting] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const fileInputRef = useRef(null);

  const showToast = useCallback((text, type = "success") => {
    setMessage(text);
    setMessageType(type);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => { setMessage(""); setMessageType(""); }, 4000);
  }, []);

  const fetchDeliverable = useCallback(() => {
    setLoading(true);
    const token = authToken();
    fetch(`${API_URL}/deliverables/${deliverableId}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setDeliverable(data?.deliverable || null);
        setShowSubmitForm(false);
        setShowRejectForm(false);
      })
      .catch(() => setDeliverable(null))
      .finally(() => setLoading(false));
  }, [deliverableId]);

  useEffect(() => { fetchDeliverable(); }, [fetchDeliverable]);

  const currentUser = getUser();
  const isCreator = deliverable && currentUser && parseInt(deliverable.created_by, 10) === parseInt(currentUser.id, 10);
  const isAdminManager = currentUser && ["admin", "manager"].includes(currentUser.role);
  const isAssignee = deliverable && currentUser && deliverable.assigned_to && parseInt(deliverable.assigned_to, 10) === parseInt(currentUser.id, 10);
  const canApproveReject = isCreator || isAdminManager;

  const addSelectedFiles = (incomingFiles) => {
    if (!incomingFiles?.length) return;
    setSubmitFiles((prev) => [...prev, ...Array.from(incomingFiles)]);
  };

  const removeSubmitFileAt = (index) => {
    setSubmitFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLinkAt = (index, value) => {
    setSubmitLinks((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  const addLinkField = () => setSubmitLinks((prev) => [...prev, ""]);
  const removeLinkField = (index) => {
    setSubmitLinks((prev) => (prev.length === 1 ? [""] : prev.filter((_, i) => i !== index)));
  };

  const handleSubmit = async () => {
    const trimmedLinks = submitLinks.map((link) => link.trim()).filter(Boolean);
    if (!submitComment.trim() && submitFiles.length === 0 && trimmedLinks.length === 0) {
      showToast("Please add notes, at least one attachment, or a link.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const token = authToken();
      const formData = new FormData();
      if (submitComment.trim()) formData.append("comment", submitComment.trim());
      submitFiles.forEach((selectedFile) => formData.append("files[]", selectedFile));
      trimmedLinks.forEach((link) => formData.append("links[]", link));

      const res = await fetch(`${API_URL}/deliverables/${deliverableId}/submit`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        showToast("Deliverable submitted successfully!");
        setShowSubmitForm(false);
        setSubmitComment("");
        setSubmitFiles([]);
        setSubmitLinks([""]);
        fetchDeliverable();
      } else {
        showToast(data.message || "Failed to submit", "error");
      }
    } catch {
      showToast("An error occurred", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${deliverableId}/approve`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Deliverable approved!");
        fetchDeliverable();
      } else {
        showToast(data.message || "Failed to approve", "error");
      }
    } catch {
      showToast("An error occurred", "error");
    }
  };

  const handleReject = async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${deliverableId}/reject`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ comment: rejectComment }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Deliverable rejected");
        setShowRejectForm(false);
        setRejectComment("");
        fetchDeliverable();
      } else {
        showToast(data.message || "Failed to reject", "error");
      }
    } catch {
      showToast("An error occurred", "error");
    }
  };

  if (loading) {
    return (
      <DashboardLayout hideRightSidebar>
        <div className="td-loading">Loading deliverable...</div>
      </DashboardLayout>
    );
  }

  if (!deliverable) {
    return (
      <DashboardLayout hideRightSidebar>
        <div className="td-loading td-error">Deliverable not found.</div>
      </DashboardLayout>
    );
  }

  const ss = statusStyle(deliverable.status);
  const submissions = deliverable.submissions || [];
  const canSubmit = isAssignee && ["pending", "rejected", "reopened", "rework_required"].includes(deliverable.status);
  const isApproved = deliverable.status === "approved";
  const isSubmitted = deliverable.status === "submitted";
  const isRejected = deliverable.status === "rejected";

  return (
    <DashboardLayout hideRightSidebar>
      <div className="td-page">
        {message && <div className={`td-toast td-toast--${messageType}`}>{message}</div>}

        <div className="td-layout">
          <div className="td-main">
            <Breadcrumb items={[
              { label: "Deliverables", path: rolePath("deliveries") },
              ...(deliverableSource ? [{ label: deliverableSource.label, path: deliverableSource.path }] : []),
              { label: deliverable.title },
            ]} />

            <div className="td-title-row">
              <h1 className="td-title">{deliverable.title}</h1>
            </div>

            <div className="td-badges">
              <span className="td-badge" style={{ background: ss.bg, color: ss.text }}>
                <span className="td-badge-dot" style={{ background: ss.text }} />
                {(deliverable.status || "").charAt(0).toUpperCase() + (deliverable.status || "").slice(1)}
              </span>
            </div>

            {/* Info Cards */}
            <div className="td-stats" style={{ marginTop: "20px" }}>
              <div className="td-stat td-stat--trio" style={{ width: "100%" }}>
                <div className="td-trio-item">
                  <div>
                    <span className="td-stat-label">Related Task</span>
                    <span className="td-stat-big td-stat-big--sm" style={{ display: "block" }}>{deliverable.task?.title || "\u2014"}</span>
                  </div>
                </div>
                <div className="td-trio-item">
                  <div>
                    <span className="td-stat-label">Assigned To</span>
                    <span className="td-stat-big td-stat-big--sm" style={{ display: "block" }}>{deliverable.assignee?.name || "\u2014"}</span>
                  </div>
                </div>
                <div className="td-trio-item">
                  <div>
                    <span className="td-stat-label">Due Date</span>
                    <span className="td-stat-big td-stat-big--sm" style={{ display: "block" }}>{formatShortDate(deliverable.due_date)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Description */}
            {deliverable.description && (
              <div style={{ marginTop: "20px" }}>
                <h2 className="td-section-title">Description</h2>
                <p style={{ color: "#6b7280", lineHeight: 1.6 }}>{deliverable.description}</p>
              </div>
            )}

            {/* Submit Form - Assignee: show Submit button for pending, Resubmit button for rejected */}
            {canSubmit && (
              <div style={{ marginTop: "24px" }}>
                {!showSubmitForm && (
                  <button className="td-btn-primary" onClick={() => setShowSubmitForm(true)}>
                    {isRejected ? "Resubmit Deliverable" : "Submit Deliverable"}
                  </button>
                )}
                {showSubmitForm && (
                  <div className="td-card" style={{ padding: "20px" }}>
                    <h3 className="td-card-title">{isRejected ? "Resubmit Deliverable" : "Submit Deliverable"}</h3>
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
                      <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: 500, color: "#374151" }}>File Attachments</label>
                      <input
                        type="file"
                        ref={fileInputRef}
                        multiple
                        onChange={(e) => { addSelectedFiles(e.target.files); e.target.value = ""; }}
                        style={{ fontSize: "14px" }}
                      />
                      {submitFiles.length > 0 && (
                        <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                          {submitFiles.map((selectedFile, index) => (
                            <div key={`${selectedFile.name}-${index}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "#6366f1" }}>
                              <span>{selectedFile.name}</span>
                              <button type="button" className="td-btn-outline" style={{ padding: "2px 8px" }} onClick={() => removeSubmitFileAt(index)}>Remove</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ marginTop: "12px" }}>
                      <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: 500, color: "#374151" }}>Links</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {submitLinks.map((link, index) => (
                          <div key={`details-link-${index}`} style={{ display: "flex", gap: "8px" }}>
                            <input
                              type="url"
                              value={link}
                              onChange={(e) => updateLinkAt(index, e.target.value)}
                              placeholder="https://example.com/..."
                              style={{ width: "100%", minHeight: "40px", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px" }}
                            />
                            <button type="button" className="td-btn-outline" onClick={() => removeLinkField(index)}>Remove</button>
                          </div>
                        ))}
                        <button type="button" className="td-btn-outline" style={{ width: "fit-content" }} onClick={addLinkField}>+ Add Link</button>
                      </div>
                    </div>
                    <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
                      <button className="td-btn-primary" onClick={handleSubmit} disabled={submitting}>
                        {submitting ? "Submitting..." : "Submit"}
                      </button>
                      <button className="td-btn-outline" onClick={() => { setShowSubmitForm(false); setSubmitComment(""); setSubmitFiles([]); setSubmitLinks([""]); }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Review Deliverable - Assigner: show Approve/Reject buttons when submitted */}
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
            {isRejected && deliverable.rejection_comment && (
              <div style={{ marginTop: "20px", padding: "16px", background: "#FEE2E2", borderRadius: "8px", border: "1px solid #FECACA" }}>
                <h3 className="td-card-title" style={{ color: "#991B1B" }}>Rejection Reason</h3>
                <p style={{ color: "#7F1D1D", marginTop: "6px" }}>{deliverable.rejection_comment}</p>
                {deliverable.rejected_by && <p style={{ color: "#7F1D1D", fontSize: "12px", marginTop: "4px" }}>By: {deliverable.rejected_by.name}</p>}
              </div>
            )}

            {/* Approved info */}
            {isApproved && (
              <div style={{ marginTop: "20px", padding: "16px", background: "#DCFCE7", borderRadius: "8px", border: "1px solid #BBF7D0" }}>
                <h3 className="td-card-title" style={{ color: "#166534" }}>Approved</h3>
                {deliverable.approved_by && <p style={{ color: "#166534", marginTop: "4px", fontSize: "13px" }}>Approved by: {deliverable.approved_by.name}</p>}
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
                    {(sub.attachments || []).filter((item) => item.attachment_type === "file").length > 0 && (
                      <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        {(sub.attachments || []).filter((item) => item.attachment_type === "file").map((file) => (
                          <a
                            key={`details-file-${file.id}`}
                            href={buildAttachmentUrl(file)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#6366f1", fontSize: "13px", textDecoration: "none" }}
                          >
                            <Download size={14} />
                            {file.original_name || file.file_name}
                          </a>
                        ))}
                      </div>
                    )}
                    {(sub.attachments || []).filter((item) => item.attachment_type === "image").length > 0 && (
                      <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
                        {(sub.attachments || []).filter((item) => item.attachment_type === "image").map((image) => (
                          <a key={`details-image-${image.id}`} href={buildAttachmentUrl(image)} target="_blank" rel="noopener noreferrer">
                            <img src={buildAttachmentUrl(image)} alt={image.original_name || image.file_name || "Submission image"} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "8px", border: "1px solid #e5e7eb" }} />
                          </a>
                        ))}
                      </div>
                    )}
                    {(sub.attachments || []).filter((item) => item.attachment_type === "link").length > 0 && (
                      <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        {(sub.attachments || []).filter((item) => item.attachment_type === "link").map((link) => (
                          <a key={`details-link-${link.id}`} href={link.url} target="_blank" rel="noopener noreferrer" style={{ color: "#4f46e5", fontSize: "13px" }}>
                            {link.url}
                          </a>
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
              <h3 className="td-card-title">Deliverable Info</h3>
              <ul className="td-info">
                <li>
                  <span className="td-dot" style={{ background: "#3b82f6" }} />
                  <div>
                    <span className="td-info-label">Task</span>
                    <span className="td-info-val">{deliverable.task?.title || "\u2014"}</span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "#f59e0b" }} />
                  <div>
                    <span className="td-info-label">Assigned To</span>
                    <span className="td-info-val">{deliverable.assignee?.name || "\u2014"}</span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "#8b5cf6" }} />
                  <div>
                    <span className="td-info-label">Created By</span>
                    <span className="td-info-val">{deliverable.creator?.name || "\u2014"}</span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "#22c55e" }} />
                  <div>
                    <span className="td-info-label">Due Date</span>
                    <span className="td-info-val">{formatShortDate(deliverable.due_date)}</span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "#ef4444" }} />
                  <div>
                    <span className="td-info-label">Status</span>
                    <span className="td-info-val">{(deliverable.status || "").charAt(0).toUpperCase() + (deliverable.status || "").slice(1)}</span>
                  </div>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default DeliverableDetails;
