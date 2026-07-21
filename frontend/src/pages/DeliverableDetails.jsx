/**
 * SubtaskDetails.jsx — Enterprise Subtask Details Page
 *
 * Full-featured subtask detail view mirroring TaskDetails layout exactly:
 * - Parent Info Card (Project → Task → Subtask hierarchy)
 * - Timer integration via useWorkTimer
 * - Acknowledge/Pause/Resume/Submit/Approve/Reject/Reopen workflow
 * - Tabs: Overview, Files, Activity
 * - Discussion outside tabs (same as TaskDetails)
 * - Right sidebar with metadata, timer, performance, activity, notes
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useLocation, useNavigate, Link } from "react-router-dom";
import { BarChart3, Calendar, Check, CheckCircle2, ChevronRight, Copy, FolderOpen, Pause, Play, Timer } from "lucide-react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import ConfirmModal from "../components/ConfirmModal";
import TaskDiscussion from "../components/TaskDiscussion";
import FileUploadSection from "../components/FileUploadSection";
import API_URL from "../config/api";
import { authToken, getUser, rolePath } from "../utils/auth";
import { publish } from "../utils/eventBus";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage } from "../utils/notify";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import { useSubmit } from "../hooks/useSubmit";
import { useWorkTimer } from "../hooks/useWorkTimer";
import { formatDateTimeShort, formatDateTime } from "../utils/formatDateTime";
import "./TaskDetails.css";
import "./SubtaskDetails.css";

function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hours ago`;
  return `${Math.floor(sec / 86400)} days ago`;
}

function statusLabel(status) {
  const s = (status || "").toLowerCase();
  if (s === "pending") return "Pending";
  if (s === "in_progress" || s === "acknowledged") return "In Progress";
  if (s === "paused") return "Paused";
  if (s === "submitted") return "Submitted";
  if (s === "reopened") return "Reopened";
  if (s === "approved") return "Approved";
  if (s === "rejected") return "Declined";
  return status || "Pending";
}

function statusColor(status) {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "#166534";
  if (s === "pending") return "#92400E";
  if (s === "in_progress" || s === "acknowledged") return "#1E40AF";
  if (s === "paused") return "#B45309";
  if (s === "submitted") return "#1E40AF";
  if (s === "reopened") return "#92400E";
  if (s === "rejected") return "#991B1B";
  return "#374151";
}

function statusBgColor(status) {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "#DCFCE7";
  if (s === "pending") return "#FEF3C7";
  if (s === "in_progress" || s === "acknowledged") return "#DBEAFE";
  if (s === "paused") return "#FEF3C7";
  if (s === "submitted") return "#DBEAFE";
  if (s === "reopened") return "#FEF3C7";
  if (s === "rejected") return "#FEE2E2";
  return "#F3F4F6";
}

function priorityColor(priority) {
  const p = (priority || "").toLowerCase();
  if (p === "high") return "#991B1B";
  if (p === "critical") return "#7F1D1D";
  if (p === "medium") return "#92400E";
  if (p === "low") return "#166534";
  return "#374151";
}

function priorityBgColor(priority) {
  const p = (priority || "").toLowerCase();
  if (p === "high") return "#FEE2E2";
  if (p === "critical") return "#FECACA";
  if (p === "medium") return "#FEF3C7";
  if (p === "low") return "#DCFCE7";
  return "#F3F4F6";
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] || "";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase() || a.toUpperCase();
}

function SubtaskDetails() {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const subtaskId = params.deliverable;
  const notify = useNotification();

  const subtaskSourcePages = {
    deliveries: { label: "Subtasks Assigned To You", path: rolePath("deliveries") },
    "deliveries-by-you": { label: "Subtasks Assigned By You", path: rolePath("deliveries-by-you") },
    "self-deliveries": { label: "Self Subtasks", path: rolePath("self-deliveries") },
    "all-deliverables": { label: "All Sub-Tasks", path: rolePath("all-deliverables") },
  };
  const subtaskSource = subtaskSourcePages[location.state?.from] || null;
  const readOnly = location.state?.readOnly === true;

  const [subtask, setSubtask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
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
  const { submitting: approving, run: runApprove } = useSubmit();
  const { submitting: declining, run: runDecline } = useSubmit();
  const { submitting: acknowledging, run: runAcknowledge } = useSubmit();
  const { submitting: pausing, run: runPause } = useSubmit();
  const { submitting: resuming, run: runResume } = useSubmit();

  const [notes, setNotes] = useState([]);
  const [noteInput, setNoteInput] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteDeleteOpen, setNoteDeleteOpen] = useState(false);
  const [pendingNoteId, setPendingNoteId] = useState(null);
  const [files, setFiles] = useState([]);

  const currentUser = getUser();

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
        if (data?.deliverable?.files) setFiles(data.deliverable.files);
      })
      .catch(() => setSubtask(null))
      .finally(() => setLoading(false));
  }, [subtaskId]);

  useEffect(() => { fetchSubtask(); }, [fetchSubtask]);

  useAutoRefresh(fetchSubtask, { events: ["deliverable:updated", "task:updated", "data:changed"] });

  useEffect(() => {
    if (!subtask?.id || !subtask?.unviewed_changes_count) return;
    const token = authToken();
    fetch(`${API_URL}/deliverables/${subtask.id}/changes/mark-read`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      _notifHandled: true,
    }).catch(() => {});
  }, [subtask?.id, subtask?.unviewed_changes_count]);

  useEffect(() => {
    if (!subtask?.id) return;
    const token = authToken();
    fetch(`${API_URL}/deliverables/${subtask.id}/my-note`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : { notes: [] })
      .then((data) => { setNotes(data.notes || []); setNoteInput(""); })
      .catch(() => {});
  }, [subtask?.id]);

  const isCreator = subtask && currentUser && parseInt(subtask.created_by, 10) === parseInt(currentUser.id, 10);
  const isAdminManager = currentUser && ["admin", "manager"].includes(currentUser.role);
  const isAssignee = subtask && currentUser && subtask.assigned_to && parseInt(subtask.assigned_to, 10) === parseInt(currentUser.id, 10);
  const canApproveReject = isCreator || isAdminManager;

  const timerData = subtask?.timer || {
    state: subtask?.timer_state || "idle",
    work_seconds: subtask?.current_work_seconds || subtask?.total_work_seconds || 0,
    elapsed_seconds: subtask?.total_work_seconds || 0,
    total_pause_seconds: subtask?.total_pause_seconds || 0,
    last_timer_event_at: subtask?.last_timer_event_at || null,
    pause_count: subtask?.pause_count || 0,
    resume_count: subtask?.resume_count || 0,
    work_started_at: subtask?.work_started_at || null,
    work_completed_at: subtask?.work_completed_at || null,
  };

  const { workDisplay, workSeconds, elapsedDisplay, pauseDisplay, pauseSeconds, pauseCount, state: timerState } = useWorkTimer(timerData);

  const handleAddLink = () => {
    if (!linkInput.trim()) return;
    let url = linkInput.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    setLinks((prev) => [...prev, { url, name: url }]);
    setLinkInput("");
  };

  const handleFileReorder = useCallback((reordered) => {
    setFiles(reordered);
    const payload = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
    fetch(`${API_URL}/deliverables/${subtaskId}/files/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ items: payload }),
      _notifHandled: true,
    }).catch(() => {});
  }, [subtaskId]);
  const handleRemoveLink = (index) => setLinks((prev) => prev.filter((_, i) => i !== index));
  const handleLinkKeyDown = (e) => { if (e.key === "Enter") { e.preventDefault(); handleAddLink(); } };

  const handleSubmit = async () => {
    if (!submitComment.trim() && !submitFile) { notify.error("Please add a comment or attach a file."); return; }
    setSubmitting(true);
    try {
      const token = authToken();
      const formData = new FormData();
      if (submitComment.trim()) formData.append("comment", submitComment.trim());
      if (submitFile) formData.append("file", submitFile);
      submitFiles.forEach((f) => formData.append("files[]", f));
      links.forEach((l) => formData.append("links[]", l.url));
      const res = await fetch(`${API_URL}/deliverables/${subtaskId}/submit`, {
        method: "POST", headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, body: formData, _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) { publish('deliverable:updated', data.deliverable || data); publish('data:changed', { type: 'deliverable', action: 'updated' }); showSuccessMessage("Subtask", "submitted"); setShowSubmitForm(false); setSubmitComment(""); setSubmitFile(null); setSubmitFiles([]); setLinks([]); setLinkInput(""); fetchSubtask(); }
      else { notify.error(data.message || "Failed to submit"); }
    } catch { notify.error("An error occurred"); } finally { setSubmitting(false); }
  };

  const handleApprove = async () => {
    await runApprove(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/deliverables/${subtaskId}/approve`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` }, _notifHandled: true });
        const data = await res.json();
        if (res.ok) { publish('deliverable:updated', data.deliverable || data); publish('data:changed', { type: 'deliverable', action: 'updated' }); showSuccessMessage("Subtask", "approved"); fetchSubtask(); }
        else { notify.error(data.message || "Failed to approve"); }
      } catch { notify.error("An error occurred"); }
    });
  };

  const handleReject = async () => {
    await runDecline(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/deliverables/${subtaskId}/reject`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ comment: rejectComment }), _notifHandled: true });
        const data = await res.json();
        if (res.ok) { publish('deliverable:updated', data.deliverable || data); publish('data:changed', { type: 'deliverable', action: 'updated' }); showSuccessMessage("Subtask", "declined"); setShowRejectForm(false); setRejectComment(""); fetchSubtask(); }
        else { notify.error(data.message || "Failed to decline"); }
      } catch { notify.error("An error occurred"); }
    });
  };

  const handleReopen = async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${subtaskId}/reopen`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ comment: "Reopened for revision" }), _notifHandled: true });
      const data = await res.json();
      if (res.ok) { publish('deliverable:updated', data.deliverable || data); publish('data:changed', { type: 'deliverable', action: 'updated' }); showSuccessMessage("Subtask", "reopened"); fetchSubtask(); }
      else { notify.error(data.message || "Failed to reopen"); }
    } catch { notify.error("An error occurred"); }
  };

  const handleAcknowledge = async () => {
    await runAcknowledge(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/deliverables/${subtaskId}/acknowledge`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` }, _notifHandled: true });
        const data = await res.json();
        if (res.ok) { publish('deliverable:updated', data.deliverable || data); publish('data:changed', { type: 'deliverable', action: 'updated' }); showSuccessMessage("Subtask", "acknowledged"); fetchSubtask(); }
        else { notify.error(data.message || "Failed to acknowledge"); }
      } catch { notify.error("An error occurred"); }
    });
  };

  const handlePause = async () => {
    await runPause(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/deliverables/${subtaskId}/pause`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ reason: "other" }), _notifHandled: true });
        const data = await res.json();
        if (res.ok) { publish('deliverable:updated', data.deliverable || data); publish('data:changed', { type: 'deliverable', action: 'updated' }); showSuccessMessage("Subtask", "paused"); fetchSubtask(); }
        else { notify.error(data.message || "Failed to pause"); }
      } catch { notify.error("An error occurred"); }
    });
  };

  const handleResume = async () => {
    await runResume(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/deliverables/${subtaskId}/continue`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` }, _notifHandled: true });
        const data = await res.json();
        if (res.ok) { publish('deliverable:updated', data.deliverable || data); publish('data:changed', { type: 'deliverable', action: 'updated' }); showSuccessMessage("Subtask", "resumed"); fetchSubtask(); }
        else { notify.error(data.message || "Failed to resume"); }
      } catch { notify.error("An error occurred"); }
    });
  };

  const saveNote = async () => {
    if (!subtask?.id || !noteInput.trim()) return;
    setNoteSaving(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${subtask.id}/my-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note: noteInput }),
        _notifHandled: true,
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
        setNoteInput("");
      }
    } catch { notify.error("Could not save note."); }
    setNoteSaving(false);
  };

  const deleteNote = async (noteId) => {
    if (!subtask?.id) return;
    const token = authToken();
    try {
      const res = await fetch(`${API_URL}/deliverables/${subtask.id}/my-note/${noteId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      }
    } catch { notify.error("Could not delete note."); }
  };

  if (loading) return <DashboardLayout hideRightSidebar><div className="td-loading">Loading subtask...</div></DashboardLayout>;
  if (!subtask) return <DashboardLayout hideRightSidebar><div className="td-loading td-error">Subtask not found.</div></DashboardLayout>;

  const ss = statusBgColor(subtask.status);
  const workflowEvents = subtask.workflow_events || [];
  const canSubmit = isAssignee && (subtask.status === "pending" || subtask.status === "rejected" || subtask.status === "reopened");
  const isApproved = subtask.status === "approved";
  const isSubmitted = subtask.status === "submitted";
  const isRejected = subtask.status === "rejected";
  const isInProgress = subtask.status === "in_progress";
  const isPending = subtask.status === "pending";
  const timerRunning = timerState === "running";
  const timerPaused = timerState === "paused";

  return (
    <>
      <DashboardLayout hideRightSidebar>
        <div className="td-page">
          <div className="td-layout">

            {/* ===== LEFT ===== */}
            <div className="td-main">
              <Breadcrumb items={[
                { label: "Subtasks", path: rolePath("deliveries") },
                ...(subtaskSource ? [{ label: subtaskSource.label, path: subtaskSource.path }] : []),
                { label: subtask.title },
              ]} />

              {/* Parent Info Card */}
              {(subtask.project || subtask.task) && (
                <div className="td-parent-card">
                  <span className="td-parent-label">Belongs To</span>
                  {subtask.project && (
                    <>
                      <ChevronRight size={14} className="td-parent-chevron" />
                      <span className="td-parent-label">Project:</span>
                      <Link to={rolePath(`projects/project-details/${subtask.project.id}`)} className="td-parent-link">
                        {subtask.project.title}
                      </Link>
                    </>
                  )}
                  {subtask.task && (
                    <>
                      <ChevronRight size={14} className="td-parent-chevron" />
                      <span className="td-parent-label">Task:</span>
                      <Link to={rolePath(`tasks/task-details/${subtask.task.id}`)} className="td-parent-link">
                        {subtask.task.title}
                      </Link>
                      {subtask.task.business_id && <span className="td-parent-code">{subtask.task.business_id}</span>}
                    </>
                  )}
                  <ChevronRight size={14} className="td-parent-chevron" />
                  <span className="td-parent-label">Subtask:</span>
                  <span className="td-parent-current">{subtask.title}</span>
                </div>
              )}

              {/* Title Row */}
              <div className="td-title-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  <h1 className="td-title">{subtask.title}</h1>
                  {subtask.business_id && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: '#f0fdf4', color: '#16a34a', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {subtask.business_id}
                      <button
                        onClick={() => { navigator.clipboard.writeText(subtask.business_id); notify.success("Subtask ID copied!"); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                        title="Copy Subtask ID"
                      >
                        <Copy size={13} color="#16a34a" />
                      </button>
                    </span>
                  )}
                </div>
              </div>

              {/* Badges */}
              <div className="td-badges">
                <span className="td-badge" style={{ background: statusBgColor(subtask.status), color: statusColor(subtask.status) }}>
                  <span className="td-badge-dot" style={{ background: statusColor(subtask.status) }} />
                  {statusLabel(subtask.status)}
                </span>
                <span className="td-badge" style={{ background: priorityBgColor(subtask.priority), color: priorityColor(subtask.priority) }}>
                  <span className="td-badge-dot" style={{ background: priorityColor(subtask.priority) }} />
                  {subtask.priority || "Medium"} Priority
                </span>
              </div>

              {/* STATS — matches TaskDetails duo layout */}
              <div className="td-stats">
                <div className="td-stat td-stat--progress">
                  <span className="td-stat-label">Attachments</span>
                  <div className="td-stat-top">
                    <div className="td-stat-ic td-stat-ic--orange"><FolderOpen size={18} /></div>
                    <span className="td-stat-big">{files.length}</span>
                  </div>
                </div>
                <div className="td-stat td-stat--trio">
                  <div className="td-trio-item">
                    <div className="td-stat-ic td-stat-ic--green"><Calendar size={18} /></div>
                    <div>
                      <span className="td-stat-big td-stat-big--sm">{formatDateTimeShort(subtask.due_date)}</span>
                      <span className="td-stat-label">Deadline</span>
                    </div>
                  </div>
                  <div className="td-trio-item">
                    <div className="td-stat-ic" style={{ background: "#EDE9FE", color: "#7C3AED" }}><CheckCircle2 size={18} /></div>
                    <div>
                      <span className="td-stat-big td-stat-big--sm">{subtask.assignee?.name || "—"}</span>
                      <span className="td-stat-label">Assigned To</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Timeline History — matches TaskDetails */}
              {workflowEvents.length > 0 && (
                <div className="td-card" style={{ marginTop: 16 }}>
                  <h3 className="td-card-title">Timeline History</h3>
                  {workflowEvents.slice(0, 3).map((ev) => (
                    <div key={ev.id} className="td-timeline-item">
                      <div className="td-timeline-header">
                        <span className="td-timeline-action">{ev.event_type?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                        <span className="td-timeline-time">{formatDateTime(ev.created_at)}</span>
                      </div>
                      {ev.user && <div className="td-timeline-user">by {ev.user.name}</div>}
                      {ev.comment && <div className="td-timeline-comment">{ev.comment}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Workflow Actions */}
              <div className="td-actions">
                {isPending && !readOnly && (isAssignee || isAdminManager) && (
                  <button className="td-btn-primary" onClick={handleAcknowledge} disabled={acknowledging}>
                    <CheckCircle2 size={15} />
                    {acknowledging ? "Acknowledging..." : "Acknowledge"}
                  </button>
                )}
                {isInProgress && !readOnly && isAssignee && (
                  <>
                    {timerRunning && <button className="td-btn-primary" onClick={handlePause} disabled={pausing} style={{ backgroundColor: pausing ? "#9CA3AF" : "#D97706" }}><Pause size={15} />{pausing ? "Pausing..." : "Pause"}</button>}
                    {timerPaused && <button className="td-btn-primary" onClick={handleResume} disabled={resuming}><Play size={15} />{resuming ? "Resuming..." : "Resume"}</button>}
                  </>
                )}
                {!readOnly && canSubmit && !showSubmitForm && (
                  <button className="td-btn-primary" onClick={() => setShowSubmitForm(true)}>{isRejected ? "Resubmit" : "Submit"}</button>
                )}
                {!readOnly && isSubmitted && canApproveReject && (
                  <>
                    <button className="td-btn-primary" onClick={handleApprove} disabled={approving} style={{ background: "#166534" }}>{approving ? "Approving..." : "Approve"}</button>
                    <button className="td-btn-danger" onClick={() => setShowRejectForm(true)}>Decline</button>
                  </>
                )}
                {!readOnly && isApproved && canApproveReject && (
                  <button className="td-btn-outline" onClick={handleReopen}>Reopen</button>
                )}
              </div>

              {/* TAB CONTENT — matches TaskDetails exactly */}
              <div className="td-content">
                <div style={{ marginBottom: "16px", marginTop: "4px", paddingLeft: "4px" }}>
                  <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#111827", margin: 0 }}>
                    {location.state?.from === "deliveries" && "Assigned to You"}
                    {location.state?.from === "deliveries-by-you" && "Assigned by You"}
                    {location.state?.from === "self-deliveries" && "Self Subtasks"}
                    {location.state?.from === "all-deliverables" && "All Sub-Tasks"}
                  </h2>
                </div>

                <div className="td-tabs">
                  {[
                    { id: "overview", label: "Overview", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg> },
                    { id: "files", label: "Platform files & links", icon: <FolderOpen size={16} /> },
                    { id: "activity", label: "Activity", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg> },
                  ].map(({ id, label, icon }) => (
                    <button key={id} className={`td-tab ${tab === id ? "td-tab--on" : ""}`} onClick={() => setTab(id)}>
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>

                <div className="td-content-details">
                  {tab === "overview" && (
                    <div className="td-overview">
                      <div className="td-section-header">
                        <h2 className="td-section-title">Subtask Details</h2>
                      </div>
                      <div className="td-overview-grid">
                        <div className="td-overview-left">
                          {subtask.description ? (
                            <div
                              className="rte-display"
                              dangerouslySetInnerHTML={{ __html: subtask.description }}
                            />
                          ) : (
                            <p style={{ color: "#6b7280", fontSize: "14px" }}>No description provided for this subtask.</p>
                          )}

                          {/* Labels/Tags */}
                          {((subtask.labels && subtask.labels.length > 0) || (subtask.tags && subtask.tags.length > 0)) && (
                            <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {(subtask.labels || []).map((l, i) => (
                                <span key={`l-${i}`} className="td-label-tag">{l}</span>
                              ))}
                              {(subtask.tags || []).map((t, i) => (
                                <span key={`t-${i}`} className="td-label-tag td-label-tag--alt">{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Submit Form */}
                      {!readOnly && canSubmit && showSubmitForm && (
                        <div className="td-card" style={{ padding: 20, marginTop: 20 }}>
                          <h3 className="td-card-title">{isRejected ? "Resubmit Subtask" : "Submit Subtask"}</h3>
                          <div style={{ marginTop: 12 }}>
                            <label className="td-form-label">Comment</label>
                            <textarea className="td-textarea" placeholder="Add a comment..." value={submitComment} onChange={(e) => setSubmitComment(e.target.value)} />
                          </div>
                          <div style={{ marginTop: 12 }}>
                            <label className="td-form-label">File Attachment</label>
                            <input type="file" ref={fileInputRef} onChange={(e) => setSubmitFile(e.target.files[0])} style={{ fontSize: 14 }} />
                          </div>
                          <div style={{ marginTop: 12 }}>
                            <label className="td-form-label">Links</label>
                            <div style={{ display: "flex", gap: 8 }}>
                              <input type="text" placeholder="https://..." value={linkInput} onChange={(e) => setLinkInput(e.target.value)} onKeyDown={handleLinkKeyDown} className="td-input" />
                              <button type="button" onClick={handleAddLink} disabled={!linkInput.trim()} className="td-btn-primary">Add</button>
                            </div>
                          </div>
                          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                            <button className="td-btn-primary" onClick={handleSubmit} disabled={submitting}>{submitting ? "Submitting..." : "Submit"}</button>
                            <button className="td-btn-outline" onClick={() => { setShowSubmitForm(false); setSubmitComment(""); setSubmitFile(null); setLinks([]); setLinkInput(""); }}>Cancel</button>
                          </div>
                        </div>
                      )}

                      {/* Reject Info */}
                      {isRejected && subtask.rejection_comment && (
                        <div className="td-info-banner td-info-banner--danger" style={{ marginTop: 20 }}>
                          <h3 className="td-card-title" style={{ color: "#991B1B" }}>Decline Reason</h3>
                          <p style={{ color: "#7F1D1D", marginTop: 6 }}>{subtask.rejection_comment}</p>
                          {subtask.rejected_by && <p style={{ color: "#7F1D1D", fontSize: 12, marginTop: 4 }}>By: {subtask.rejected_by.name}</p>}
                        </div>
                      )}

                      {/* Approved Info */}
                      {isApproved && (
                        <div className="td-info-banner td-info-banner--success" style={{ marginTop: 20 }}>
                          <h3 className="td-card-title" style={{ color: "#166534" }}>Approved</h3>
                          {subtask.approved_by && <p style={{ color: "#166534", marginTop: 4, fontSize: 13 }}>Approved by: {subtask.approved_by.name}</p>}
                        </div>
                      )}

                      {/* Reject Form */}
                      {!readOnly && showRejectForm && (
                        <div className="td-card" style={{ padding: 16, marginTop: 20 }}>
                          <label className="td-form-label">Decline Comment</label>
                          <textarea className="td-textarea" placeholder="Reason for decline..." value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} />
                          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                            <button className="td-btn-danger" onClick={handleReject} disabled={declining}>{declining ? "Declining..." : "Confirm Decline"}</button>
                            <button className="td-btn-outline" onClick={() => { setShowRejectForm(false); setRejectComment(""); }}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {tab === "files" && (
                    <FileUploadSection entityType="deliverable" entityId={subtask.id} files={files} onReorder={handleFileReorder} onFilesChange={fetchSubtask} readOnly={readOnly} />
                  )}

                  {tab === "activity" && (
                    <div>
                      <div className="td-section-header">
                        <h2 className="td-section-title">Activity Timeline</h2>
                      </div>
                      {(() => {
                        const events = workflowEvents.map((ev) => ({
                          id: ev.id,
                          type: 'event',
                          action: ev.event_type,
                          comment: ev.comment,
                          user_name: ev.user?.name,
                          created_at: ev.created_at,
                          sort: new Date(ev.created_at).getTime(),
                        }));
                        const changes = (subtask.changes || []).map((c) => ({
                          id: c.id,
                          type: 'change',
                          field: c.field_name,
                          created_at: c.created_at,
                          sort: new Date(c.created_at).getTime(),
                        }));
                        const timeline = [...events, ...changes].sort((a, b) => b.sort - a.sort);
                        if (!timeline.length) return <p className="td-activity-empty">No activity yet.</p>;
                        return (
                          <ul className="td-activity-list">
                            {timeline.map((item, i) => (
                              <li key={i} className="td-activity-item">
                                <span className="td-activity-icon">
                                  {item.type === 'event' && (
                                    <>
                                      {item.action === 'created' && '📝'}
                                      {item.action === 'submitted' && '📤'}
                                      {item.action === 'acknowledged' && '👍'}
                                      {item.action === 'paused' && '⏸️'}
                                      {item.action === 'resumed' && '▶️'}
                                      {item.action === 'approval' && '✅'}
                                      {item.action === 'rejected' && '❌'}
                                      {item.action === 'reopened' && '🔄'}
                                      {item.action === 'field_changed' && '✏️'}
                                      {item.action === 'assigned' && '📋'}
                                      {!['created','submitted','acknowledged','paused','resumed','approval','rejected','reopened','field_changed','assigned'].includes(item.action) && '📌'}
                                    </>
                                  )}
                                  {item.type === 'change' && '✏️'}
                                </span>
                                <div className="td-activity-body">
                                  <span className="td-activity-text">
                                    {item.type === 'event'
                                      ? (item.comment || item.action?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))
                                      : item.field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) + ' changed'
                                    }
                                  </span>
                                  <span className="td-activity-time">{formatDateTime(item.created_at)}</span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        );
                      })()}
                    </div>
                  )}
                </div>

              </div>

            {/* Rejection info - shown when rejected */}
            {isRejected && subtask.rejection_comment && (
              <div style={{ marginTop: "20px", padding: "16px", background: "#FEE2E2", borderRadius: "8px", border: "1px solid #FECACA" }}>
                <h3 className="td-card-title" style={{ color: "var(--color-danger)" }}>Decline Reason</h3>
                <p style={{ color: "#7F1D1D", marginTop: "6px" }}>{subtask.rejection_comment}</p>
                {subtask.rejected_by && <p style={{ color: "#7F1D1D", fontSize: "12px", marginTop: "4px" }}>By: {subtask.rejected_by.name}</p>}
              </div>
            )}

            {/* TASK DISCUSSION — inside td-main, same as TaskDetails */}
            <TaskDiscussion taskId={subtask.task_id} deliverableId={subtask.id} entityType="deliverable" />
            </div>
          </div>

            {/* ===== RIGHT SIDEBAR — matches TaskDetails exactly ===== */}
            <aside className="td-sidebar">
              <div className="td-card">
                <h3 className="td-card-title">Subtask Information</h3>
                <ul className="td-info">
                  <li>
                    <span className="td-dot" style={{ background: "#3b82f6" }} />
                    <div>
                      <span className="td-info-label">Project</span>
                      <span className="td-info-val">
                        {subtask.project ? (
                          <Link to={rolePath(`projects/project-details/${subtask.project.id}`)} className="td-project-link">{subtask.project.title}</Link>
                        ) : "—"}
                      </span>
                    </div>
                  </li>
                  <li>
                    <span className="td-dot" style={{ background: "#8b5cf6" }} />
                    <div>
                      <span className="td-info-label">Parent Task</span>
                      <span className="td-info-val">
                        {subtask.task ? (
                          <Link to={rolePath(`tasks/task-details/${subtask.task.id}`)} className="td-project-link">{subtask.task.title}</Link>
                        ) : "—"}
                      </span>
                    </div>
                  </li>
                  <li>
                    <span className="td-dot" style={{ background: "#f59e0b" }} />
                    <div>
                      <span className="td-info-label">Created By</span>
                      <span className="td-info-val">{subtask.creator?.name || "—"}</span>
                    </div>
                  </li>
                  <li>
                    <span className="td-dot" style={{ background: "#8b5cf6" }} />
                    <div>
                      <span className="td-info-label">Assigned To</span>
                      <span className="td-info-val">{subtask.assignee?.name || "—"}</span>
                    </div>
                  </li>
                  <li>
                    <span className="td-dot" style={{ background: "#22c55e" }} />
                    <div>
                      <span className="td-info-label">Last Updated</span>
                      <span className="td-info-val">{subtask.updated_at ? timeAgo(subtask.updated_at) : "—"}</span>
                    </div>
                  </li>
                  <li>
                    <span className="td-dot" style={{ background: "#3b82f6" }} />
                    <div>
                      <span className="td-info-label">Start Date</span>
                      <span className="td-info-val">{subtask.start_date ? formatDateTime(subtask.start_date) : "—"}</span>
                    </div>
                  </li>
                  <li>
                    <span className="td-dot" style={{ background: "#ef4444" }} />
                    <div>
                      <span className="td-info-label">Due Date</span>
                      <span className="td-info-val">{subtask.due_date ? formatDateTime(subtask.due_date) : "—"}</span>
                    </div>
                  </li>
                </ul>
              </div>

              {/* WORK DURATION */}
              {(timerState !== 'idle' || timerData.work_started_at) && (
                <div className="td-card">
                  <h3 className="td-card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Timer size={16} />
                    {timerState === 'completed' ? 'Time Summary' : 'Work Duration'}
                  </h3>
                  <div className="td-timer-display">
                    <span className={`td-timer-value ${timerState === 'running' ? 'td-timer-running' : ''} ${timerState === 'completed' ? 'td-timer-completed' : ''}`}>
                      {workDisplay}
                    </span>
                    {timerState === 'running' && <span className="td-timer-pulse" />}
                  </div>
                  <div className="td-timer-metrics">
                    <div className="td-timer-metric">
                      <span className="td-timer-metric-label">Elapsed</span>
                      <span className="td-timer-metric-value">{elapsedDisplay}</span>
                    </div>
                    <div className="td-timer-metric">
                      <span className="td-timer-metric-label">Pauses</span>
                      <span className="td-timer-metric-value">{pauseCount} ({pauseDisplay})</span>
                    </div>
                    <div className="td-timer-metric">
                      <span className="td-timer-metric-label">Resumes</span>
                      <span className="td-timer-metric-value">{timerData.resume_count || 0}</span>
                    </div>
                  </div>
                  {timerData.work_started_at && (
                    <div className="td-timer-meta">
                      <span>Started: {formatDateTime(timerData.work_started_at)}</span>
                      {timerData.work_completed_at && <span>Finished: {formatDateTime(timerData.work_completed_at)}</span>}
                    </div>
                  )}
                </div>
              )}

              {/* PERFORMANCE DASHBOARD */}
              {isApproved && (
                <div className="td-card">
                  <h3 className="td-card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <BarChart3 size={16} />
                    Performance
                  </h3>
                  <div className="td-timer-metrics">
                    {subtask.submitted_at && (
                      <div className="td-timer-metric">
                        <span className="td-timer-metric-label">Submitted</span>
                        <span className="td-timer-metric-value">{formatDateTime(subtask.submitted_at)}</span>
                      </div>
                    )}
                    {subtask.approved_at && (
                      <div className="td-timer-metric">
                        <span className="td-timer-metric-label">Approved</span>
                        <span className="td-timer-metric-value">{formatDateTime(subtask.approved_at)}</span>
                      </div>
                    )}
                    {subtask.due_date && (
                      <div className="td-timer-metric">
                        <span className="td-timer-metric-label">Deadline</span>
                        <span className="td-timer-metric-value">{formatDateTime(subtask.due_date)}</span>
                      </div>
                    )}
                    {subtask.approved_at && subtask.due_date && (
                      <div className="td-timer-metric">
                        <span className="td-timer-metric-label">Result</span>
                        <span className="td-timer-metric-value" style={{ color: new Date(subtask.approved_at) <= new Date(subtask.due_date) ? "#059669" : "#ef4444" }}>
                          {new Date(subtask.approved_at) <= new Date(subtask.due_date) ? "On Time" : "Late"}
                        </span>
                      </div>
                    )}
                    {(() => {
                      const reworkCount = workflowEvents.filter(e => e.event_type === 'reopened').length;
                      return reworkCount > 0 ? (
                        <div className="td-timer-metric">
                          <span className="td-timer-metric-label">Reworks</span>
                          <span className="td-timer-metric-value">{reworkCount}</span>
                        </div>
                      ) : null;
                    })()}
                    {(() => {
                      const approvalAttempts = workflowEvents.filter(e => e.event_type === 'submitted').length;
                      return (
                        <div className="td-timer-metric">
                          <span className="td-timer-metric-label">Attempts</span>
                          <span className="td-timer-metric-value">{approvalAttempts}</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* ACTIVITY LOG — matches TaskDetails merged timeline */}
              <div className="td-card">
                <h3 className="td-card-title">Activity</h3>
                {(() => {
                  const events = workflowEvents.map((ev) => ({
                    id: ev.id,
                    type: 'event',
                    action: ev.event_type,
                    comment: ev.comment,
                    created_at: ev.created_at,
                    sort: new Date(ev.created_at).getTime(),
                  }));
                  const changes = (subtask.changes || []).map((c) => ({
                    id: c.id,
                    type: 'change',
                    field: c.field_name,
                    created_at: c.created_at,
                    sort: new Date(c.created_at).getTime(),
                  }));
                  const timeline = [...events, ...changes].sort((a, b) => b.sort - a.sort).slice(0, 10);
                  if (!timeline.length) return <p className="td-activity-empty">No activity yet.</p>;
                  return (
                    <ul className="td-activity-list">
                      {timeline.map((item, i) => (
                        <li key={i} className="td-activity-item">
                          <span className="td-activity-icon">
                            {item.type === 'event' && (
                              <>
                                {item.action === 'created' && '📝'}
                                {item.action === 'submitted' && '📤'}
                                {item.action === 'acknowledged' && '👍'}
                                {item.action === 'paused' && '⏸️'}
                                {item.action === 'resumed' && '▶️'}
                                {item.action === 'approval' && '✅'}
                                {item.action === 'rejected' && '❌'}
                                {item.action === 'reopened' && '🔄'}
                                {item.action === 'field_changed' && '✏️'}
                                {item.action === 'assigned' && '📋'}
                                {!['created','submitted','acknowledged','paused','resumed','approval','rejected','reopened','field_changed','assigned'].includes(item.action) && '📌'}
                              </>
                            )}
                            {item.type === 'change' && '✏️'}
                          </span>
                          <div className="td-activity-body">
                            <span className="td-activity-text">
                              {item.type === 'event'
                                ? (item.comment || item.action?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))
                                : item.field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) + ' changed'
                              }
                            </span>
                            <span className="td-activity-time">{formatDateTime(item.created_at)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </div>

              {/* NOTES — matches TaskDetails multi-note support */}
              <div className="td-card">
                <div className="td-card-head">
                  <h3 className="td-card-title">Notes</h3>
                </div>
                <textarea
                  className="td-notes-textarea"
                  rows={3}
                  placeholder="Write a note..."
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                />
                <button type="button" className="td-save-notes-btn" disabled={noteSaving || !noteInput.trim()} onClick={saveNote}>
                  {noteSaving ? "Saving\u2026" : "Add Note"}
                </button>
                {notes.length > 0 && (
                  <div className="td-notes-list">
                    {notes.map((n) => (
                      <div key={n.id} className="td-saved-note">
                        <button type="button" className="td-note-delete" onClick={() => { setPendingNoteId(n.id); setNoteDeleteOpen(true); }} title="Delete note">&times;</button>
                        <p className="td-notes">{n.note}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
        </div>
      </DashboardLayout>

      <ConfirmModal
        isOpen={noteDeleteOpen}
        onClose={() => { setNoteDeleteOpen(false); setPendingNoteId(null); }}
        onConfirm={() => { deleteNote(pendingNoteId); setNoteDeleteOpen(false); setPendingNoteId(null); }}
        title="Delete Note"
        message="Are you sure you want to delete this note? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger
      />
    </>
  );
}

export default SubtaskDetails;
