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
import { useTranslation } from "react-i18next";
import { useParams, useLocation, useNavigate, Link } from "react-router-dom";
import { BarChart3, Calendar, Check, CheckCircle2, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, FileText, FolderOpen, Lock, Pause, Pencil, Play, RefreshCw, Timer, Trash2, XCircle, Activity, BookOpen } from "lucide-react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import ConfirmModal from "../components/ConfirmModal";
import PauseReasonModal from "../components/PauseReasonModal";
import ReopenDialog from "../components/ReopenDialog";
import AbandonModal from "../components/AbandonModal";
import TransferTaskDialog from "../components/TransferTaskDialog";
import DelegationChain from "../components/DelegationChain";
import TaskDiscussion from "../components/TaskDiscussion";
import FileUploadSection from "../components/FileUploadSection";
import UnifiedActivityFeed from "../components/UnifiedActivityFeed";
import CreateDeliverableModel from "../components/layout/CreateDeliverableModel";
import API_URL from "../config/api";
const API_BASE = API_URL.replace(/\/api\/?$/, "");

function fileUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return API_BASE + (url.startsWith("/") ? "" : "/storage/") + url;
}

function downloadUrl(path, filename) {
  if (!path) return null;
  const name = filename || path.split("/").pop();
  return `${API_URL}/files/download?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name)}`;
}
import { authToken, getUser, rolePath } from "../utils/auth";
import { publish } from "../utils/eventBus";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage } from "../utils/notify";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import { useSubmit } from "../hooks/useSubmit";
import { useWorkTimer } from "../hooks/useWorkTimer";
import { formatDateTimeShort, formatDateTime, parseUtcToEpochMs } from "../utils/formatDateTime";
import "./TaskDetails.css";
import "./SubtaskDetails.css";

function timeAgo(iso, t) {
  if (!iso) return "";
  const then = parseUtcToEpochMs(iso) || new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return t ? t("just now", { defaultValue: "just now" }) : "just now";
  if (sec < 3600) return t ? t("{{count}} min ago", { count: Math.floor(sec / 60), defaultValue: `${Math.floor(sec / 60)} min ago` }) : `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return t ? t("{{count}} hours ago", { count: Math.floor(sec / 3600), defaultValue: `${Math.floor(sec / 3600)} hours ago` }) : `${Math.floor(sec / 3600)} hours ago`;
  return t ? t("{{count}} days ago", { count: Math.floor(sec / 86400), defaultValue: `${Math.floor(sec / 86400)} days ago` }) : `${Math.floor(sec / 86400)} days ago`;
}

function statusLabel(status, t) {
  const s = (status || "").toLowerCase();
  let label = "Pending";
  if (s === "pending" || s === "reopened") label = "Pending";
  else if (s === "in_progress" || s === "acknowledged") label = "In Progress";
  else if (s === "paused") label = "Paused";
  else if (s === "submitted") label = "Submitted";
  else if (s === "approved" || s === "completed") label = "Completed";
  else if (s === "rejected" || s === "declined") label = "Declined";
  else if (s === "abandoned") label = "Abandoned";
  else label = status || "Pending";
  return t ? t(label, { defaultValue: label }) : label;
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
  const { t } = useTranslation();
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const subtaskId = params.deliverable;
  const notify = useNotification();
  const currentUser = getUser();

  const subtaskSourcePages = {
    deliveries: { label: t("Subtasks Assigned To You", { defaultValue: "Subtasks Assigned To You" }), path: rolePath("deliveries") },
    "deliveries-by-you": { label: t("Subtasks Assigned By You", { defaultValue: "Subtasks Assigned By You" }), path: rolePath("deliveries-by-you") },
    "self-deliveries": { label: t("Self Subtasks", { defaultValue: "Self Subtasks" }), path: rolePath("self-deliveries") },
    "all-deliverables": { label: t("All Sub-Tasks", { defaultValue: "All Sub-Tasks" }), path: rolePath("all-deliverables") },
  };
  const subtaskSource = subtaskSourcePages[location.state?.from] || null;
  const readOnly = location.state?.readOnly === true || currentUser?.role === "guest";
  const subtaskIds = location.state?.subtaskIds || [];

  const currentIdx = subtaskIds.findIndex(
    (id) => String(id) === String(subtaskId)
  );

  const prevSubtaskId = currentIdx > 0 ? subtaskIds[currentIdx - 1] : null;
  const nextSubtaskId =
    currentIdx >= 0 && currentIdx < subtaskIds.length - 1
      ? subtaskIds[currentIdx + 1]
      : null;

  const goToSubtask = (id) => {
    if (!id) return;
    navigate(rolePath(`deliveries/deliverable-details/${id}`), {
      state: { subtaskIds, from: location.state?.from },
    });
  };

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
  const { submitting: startingTimer, run: runStartTimer } = useSubmit();
  const { submitting: pausing, run: runPause } = useSubmit();
  const { submitting: resuming, run: runResume } = useSubmit();
  const [assignerPauseModalOpen, setAssignerPauseModalOpen] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const { submitting: assignerPausing, run: runAssignerPause } = useSubmit();
  const { submitting: assignerResuming, run: runAssignerResume } = useSubmit();
  const { submitting: revoking, run: runRevoke } = useSubmit();
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [abandonModalOpen, setAbandonModalOpen] = useState(false);
  const [abandonSubmitting, setAbandonSubmitting] = useState(false);
  const [transferDialog, setTransferDialog] = useState(false);

  const [notes, setNotes] = useState([]);
  const [noteInput, setNoteInput] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteDeleteOpen, setNoteDeleteOpen] = useState(false);
  const [pendingNoteId, setPendingNoteId] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [kbArticles, setKbArticles] = useState([]);
  const [eventsList, setEventsList] = useState([]);

  useEffect(() => {
    const token = authToken();
    if (!token) return;
    fetch(`${API_URL}/knowledge-base?all=1`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      skipLoader: true,
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
        setKbArticles(list);
      })
      .catch(() => {});

    fetch(`${API_URL}/events?all=true`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      skipLoader: true,
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
        setEventsList(list);
      })
      .catch(() => {});
  }, []);

  const fetchSubtask = useCallback(() => {
    setLoading(true);
    const token = authToken();
    fetch(`${API_URL}/deliverables/${subtaskId}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
      _notifHandled: true,
    })
      .then((res) => {
        if (res.ok) return res.json();
        if (res.status === 404) {
          setSubtask(null);
          notify.error(t("This subtask has been deleted.", { defaultValue: "This subtask has been deleted." }));
          setTimeout(() => navigate(rolePath("deliveries")), 1500);
          return null;
        }
        return null;
      })
      .then((data) => {
        if (!data) return;
        setSubtask(data?.deliverable || null);
        setShowSubmitForm(false);
        setShowRejectForm(false);
        if (data?.deliverable?.files) setFiles(data.deliverable.files);
      })
      .catch(() => setSubtask(null))
      .finally(() => setLoading(false));
  }, [subtaskId, navigate, t]);

  useEffect(() => { fetchSubtask(); }, [fetchSubtask]);

  useAutoRefresh(fetchSubtask, { events: ["deliverable:updated", "deliverable:deleted", "task:updated", "task:deleted", "data:changed"] });

  useEffect(() => {
    if (!subtask?.id) return;
    const token = authToken();
    const markRead = subtask?.unviewed_changes_count
      ? fetch(`${API_URL}/deliverables/${subtask.id}/changes/mark-read`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          skipLoader: true,
          _notifHandled: true,
        }).catch(() => {})
      : Promise.resolve();

    const fetchNotes = fetch(`${API_URL}/deliverables/${subtask.id}/my-note`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((r) => r.ok ? r.json() : { notes: [] })
      .then((data) => { setNotes(data.notes || []); setNoteInput(""); })
      .catch(() => {});

    Promise.all([markRead, fetchNotes]);
  }, [subtask?.id, subtask?.unviewed_changes_count]);

  const isCreator = subtask && currentUser && parseInt(subtask.created_by, 10) === parseInt(currentUser.id, 10);
  const isAdminManager = currentUser && ["admin", "manager"].includes(currentUser.role);
  const isAssignee = subtask && currentUser && subtask.assigned_to && parseInt(subtask.assigned_to, 10) === parseInt(currentUser.id, 10);
  const isTransferor = subtask?.is_transferor ?? false;
  const isNextApprover = subtask?.is_next_approver ?? false;
  const transferorReturnToSelf = subtask?.transferor_return_to_self ?? true;
  const transferorHasApproved = subtask?.transferor_has_approved ?? false;
  const hasDelegationChain = subtask?.has_delegation_chain ?? false;
  const hasPendingDelegation = subtask?.pending_delegation && subtask.pending_delegation.delegated_to === currentUser?.id;
  const isDelegatee = subtask?.is_delegatee ?? false;
  const canApproveReject = (isCreator && !(hasDelegationChain && !isNextApprover)) || isAdminManager || (isNextApprover && !transferorHasApproved);

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
    if (!submitComment.trim() && !submitFile) { notify.error(t("Please add a comment or attach a file.", { defaultValue: "Please add a comment or attach a file." })); return; }
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
if (res.ok) {
  if (data.file_skipped) {
    notify.warning(data.message || t("Submission saved but file could not be attached due to storage limit.", { defaultValue: "Submission saved but file could not be attached due to storage limit." }));
  } else {
    showSuccessMessage(t("Subtask submitted successfully!", { defaultValue: "Subtask submitted successfully!" }));
  }
  publish('deliverable:updated', data.deliverable || data);
  publish('data:changed', { type: 'deliverable', action: 'updated' });
  setShowSubmitForm(false);
  setSubmitComment("");
  setSubmitFile(null);
 } else {
   notify.error(data.message || t("Failed to submit", { defaultValue: "Failed to submit" }));
 }
    } catch {
      notify.error(t("Failed to submit", { defaultValue: "Failed to submit" }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    await runApprove(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/deliverables/${subtaskId}/approve`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` }, _notifHandled: true });
        const data = await res.json();
        if (res.ok) { publish('deliverable:updated', data.deliverable || data); publish('data:changed', { type: 'deliverable', action: 'updated' }); showSuccessMessage("Subtask", "approved"); fetchSubtask(); }
        else { notify.error(data.message || t("Failed to approve", { defaultValue: "Failed to approve" })); }
      } catch { notify.error(t("An error occurred", { defaultValue: "An error occurred" })); }
    });
  };

  const handleReject = async () => {
    await runDecline(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/deliverables/${subtaskId}/reject`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ comment: rejectComment }), _notifHandled: true });
        const data = await res.json();
        if (res.ok) { publish('deliverable:updated', data.deliverable || data); publish('data:changed', { type: 'deliverable', action: 'updated' }); showSuccessMessage("Subtask", "declined"); setShowRejectForm(false); setRejectComment(""); fetchSubtask(); }
        else { notify.error(data.message || t("Failed to decline", { defaultValue: "Failed to decline" })); }
      } catch { notify.error(t("An error occurred", { defaultValue: "An error occurred" })); }
    });
  };

  const handleReopen = () => {
    setReopenDialogOpen(true);
  };

  const handleReopenSuccess = (updatedSubtask) => {
    publish('deliverable:updated', updatedSubtask);
    publish('data:changed', { type: 'deliverable', action: 'updated' });
    showSuccessMessage("Subtask", "reopened");
    fetchSubtask();
  };

  const handleAbandonSubmit = async (reason) => {
    setAbandonSubmitting(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${subtaskId}/abandon`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        publish('deliverable:updated', data.deliverable || data);
        publish('data:changed', { type: 'deliverable', action: 'updated' });
        showSuccessMessage("Subtask", "abandoned");
        setAbandonModalOpen(false);
        fetchSubtask();
      } else {
        notify.error(data.message || t("Failed to abandon subtask.", { defaultValue: "Failed to abandon subtask." }));
      }
    } catch {
      notify.error(t("An error occurred. Please try again.", { defaultValue: "An error occurred. Please try again." }));
    } finally {
      setAbandonSubmitting(false);
    }
  };

  const handleAcknowledge = async () => {
    await runAcknowledge(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/deliverables/${subtaskId}/acknowledge`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` }, _notifHandled: true });
        const data = await res.json();
        if (res.ok) { publish('deliverable:updated', data.deliverable || data); publish('data:changed', { type: 'deliverable', action: 'updated' }); showSuccessMessage("Subtask", "acknowledged"); fetchSubtask(); }
        else { notify.error(data.message || t("Failed to acknowledge", { defaultValue: "Failed to acknowledge" })); }
      } catch { notify.error(t("An error occurred", { defaultValue: "An error occurred" })); }
    });
  };

  const handleStartTimer = async () => {
    await runStartTimer(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/deliverables/${subtaskId}/start-timer`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` }, _notifHandled: true });
        const data = await res.json();
        if (res.ok) { publish('deliverable:updated', data.deliverable || data); publish('data:changed', { type: 'deliverable', action: 'updated' }); showSuccessMessage("Subtask", "timer started"); fetchSubtask(); }
        else { notify.error(data.message || t("Failed to start timer", { defaultValue: "Failed to start timer" })); }
      } catch { notify.error(t("An error occurred", { defaultValue: "An error occurred" })); }
    });
  };

  const handlePause = async () => {
    await runPause(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/deliverables/${subtaskId}/pause`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ reason: "other" }), _notifHandled: true });
        const data = await res.json();
        if (res.ok) { publish('deliverable:updated', data.deliverable || data); publish('data:changed', { type: 'deliverable', action: 'updated' }); showSuccessMessage("Subtask", "paused"); fetchSubtask(); }
        else { notify.error(data.message || t("Failed to pause", { defaultValue: "Failed to pause" })); }
      } catch { notify.error(t("An error occurred", { defaultValue: "An error occurred" })); }
    });
  };

  const handleResume = async () => {
    await runResume(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/deliverables/${subtaskId}/continue`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` }, _notifHandled: true });
        const data = await res.json();
        if (res.ok) { publish('deliverable:updated', data.deliverable || data); publish('data:changed', { type: 'deliverable', action: 'updated' }); showSuccessMessage("Subtask", "resumed"); fetchSubtask(); }
        else { notify.error(data.message || t("Failed to resume", { defaultValue: "Failed to resume" })); }
      } catch { notify.error(t("An error occurred", { defaultValue: "An error occurred" })); }
    });
  };

  const handleAssignerPause = async ({ reason, reason_detail }) => {
    await runAssignerPause(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/deliverables/${subtaskId}/assigner-pause`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ reason: reason_detail || reason }),
          _notifHandled: true,
        });
        const data = await res.json();
        if (res.ok) {
          publish('deliverable:updated', data.deliverable || data);
          publish('data:changed', { type: 'deliverable', action: 'updated' });
          showSuccessMessage("Subtask", "paused");
          fetchSubtask();
        } else {
          notify.error(data.message || t("Failed to pause subtask.", { defaultValue: "Failed to pause subtask." }));
        }
      } catch {
        notify.error(t("Failed to pause subtask.", { defaultValue: "Failed to pause subtask." }));
      }
    });
  };

  const handleAssignerResume = async () => {
    await runAssignerResume(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/deliverables/${subtaskId}/assigner-resume`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          _notifHandled: true,
        });
        const data = await res.json();
        if (res.ok) {
          publish('deliverable:updated', data.deliverable || data);
          publish('data:changed', { type: 'deliverable', action: 'updated' });
          showSuccessMessage("Subtask", "resumed by assigner");
          fetchSubtask();
        } else {
          notify.error(data.message || t("Failed to resume subtask.", { defaultValue: "Failed to resume subtask." }));
        }
      } catch {
        notify.error(t("Failed to resume subtask.", { defaultValue: "Failed to resume subtask." }));
      }
    });
  };

  const handleRevokeDelegation = async () => {
    await runRevoke(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/deliverables/${subtaskId}/revoke-delegation`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ delegation_id: subtask?.active_outgoing_delegation_id }),
          _notifHandled: true,
        });
        const data = await res.json();
        if (res.ok) {
          publish('deliverable:updated', data.deliverable || data);
          publish('data:changed', { type: 'deliverable', action: 'updated' });
          showSuccessMessage("Delegation", "revoked");
          fetchSubtask();
        } else {
          notify.error(data.message || t("Failed to revoke delegation.", { defaultValue: "Failed to revoke delegation." }));
        }
      } catch {
        notify.error(t("Failed to revoke delegation.", { defaultValue: "Failed to revoke delegation." }));
      }
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
    } catch { notify.error(t("Could not save note.", { defaultValue: "Could not save note." })); }
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
    } catch { notify.error(t("Could not delete note.", { defaultValue: "Could not delete note." })); }
  };

  const confirmDeleteSubtask = async () => {
    setDeleteConfirmOpen(false);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${subtask.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      if (res.ok) {
        showSuccessMessage("Subtask", "deleted");
        navigate(-1);
      } else {
        const data = await res.json().catch(() => ({}));
        notify.error(data.message || t("Failed to delete subtask.", { defaultValue: "Failed to delete subtask." }));
      }
    } catch { notify.error(t("Failed to delete subtask.", { defaultValue: "Failed to delete subtask." })); }
  };

  if (loading) return <DashboardLayout hideRightSidebar><div className="td-loading">{t("Loading subtask...", { defaultValue: "Loading subtask..." })}</div></DashboardLayout>;
  if (!subtask) return <DashboardLayout hideRightSidebar><div className="td-loading td-error">{t("This subtask has been deleted. Redirecting...", { defaultValue: "This subtask has been deleted. Redirecting..." })}</div></DashboardLayout>;

  const ss = statusBgColor(subtask.status);
  const workflowEvents = Array.isArray(subtask.workflow_events) ? subtask.workflow_events : [];
  const canSubmit = isAssignee && ["rejected", "in_progress", "paused"].includes(subtask.status);
  const isAssignerLocked = !!subtask.assigner_paused;
  const canAssignerPause = readOnly ? false : (isCreator && !subtask.assigner_paused && ["pending", "in_progress", "reopened", "paused", "submitted"].includes(subtask.status));
  const canAssignerResume = readOnly ? false : (isCreator && subtask.assigner_paused);
  const isApproved = subtask.status === "approved";
  const isSubmitted = subtask.status === "submitted";
  const isRejected = ["rejected", "reopened"].includes(subtask.status);
  const isInProgress = subtask.status === "in_progress";
  const isPending = ["pending", "reopened"].includes(subtask.status);
  const timerRunning = timerState === "running";
  const timerPaused = timerState === "paused";
  const isAdminOrManager = currentUser && ["admin", "manager", "super_admin"].includes(currentUser.role);
  const canStartSubtaskTimer = !readOnly && (isAssignee || isCreator || isAdminOrManager) && ["in_progress", "reopened"].includes(subtask.status) && (!timerState || timerState === "idle") && !isAssignerLocked && (!isTransferor || transferorHasApproved) && !subtask?.active_outgoing_delegation && !hasPendingDelegation;
  const canPauseSubtask = !readOnly && (isAssignee || isCreator || isAdminOrManager) && ["in_progress", "submitted"].includes(subtask.status) && timerRunning && !isAssignerLocked && (!isTransferor || transferorHasApproved) && !subtask?.active_outgoing_delegation;
  const canResumeSubtask = !readOnly && (isAssignee || isCreator || isAdminOrManager) && (subtask.status === "paused" || timerPaused) && !isAssignerLocked && (!isTransferor || transferorHasApproved) && !subtask?.active_outgoing_delegation && !hasPendingDelegation;
  const canAbandonSubtask = !readOnly && (isAssignee || isCreator || isAdminOrManager) && !["abandoned", "approved", "completed", "submitted", "submitted_late"].includes(subtask.status);

  return (
    <>
      <DashboardLayout hideRightSidebar>
        <div className="td-page">
          <div className="td-layout">

            {/* ===== LEFT ===== */}
            <div className="td-main">
              <Breadcrumb items={[
                { label: t("Subtasks", { defaultValue: "Subtasks" }), path: rolePath("deliveries") },
                ...(subtaskSource ? [{ label: subtaskSource.label, path: subtaskSource.path }] : []),
                { label: subtask.title },
              ]} />

              {/* Parent Info Card */}
              {(subtask.project || subtask.task) && (
                <div className="td-parent-card">
                  <span className="td-parent-label">{t("Belongs To", { defaultValue: "Belongs To" })}</span>
                  {subtask.project && (
                    <>
                      <ChevronRight size={14} className="td-parent-chevron" />
                      <span className="td-parent-label">{t("Project:", { defaultValue: "Project:" })}</span>
                      <Link to={rolePath(`projects/project-details/${subtask.project.id}`)} className="td-parent-link">
                        {subtask.project.title}
                      </Link>
                    </>
                  )}
                  {subtask.task && (
                    <>
                      <ChevronRight size={14} className="td-parent-chevron" />
                      <span className="td-parent-label">{t("Task:", { defaultValue: "Task:" })}</span>
                      <Link to={rolePath(`tasks/task-details/${subtask.task.id}`)} className="td-parent-link">
                        {subtask.task.title}
                      </Link>
                      {subtask.task.business_id && <span className="td-parent-code">{subtask.task.business_id}</span>}
                    </>
                  )}
                  <ChevronRight size={14} className="td-parent-chevron" />
                  <span className="td-parent-label">{t("Subtask:", { defaultValue: "Subtask:" })}</span>
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
                        onClick={() => { navigator.clipboard.writeText(subtask.business_id); notify.success(t("Subtask ID copied!", { defaultValue: "Subtask ID copied!" })); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                        title={t("Copy Subtask ID", { defaultValue: "Copy Subtask ID" })}
                      >
                        <Copy size={13} color="#16a34a" />
                      </button>
                    </span>
                  )}
                </div>
                <div className="td-title-actions">
                  <button className="td-nav-btn" onClick={() => goToSubtask(prevSubtaskId)} disabled={!prevSubtaskId}><ChevronLeft size={18} /></button>
                  <button className="td-nav-btn" onClick={() => goToSubtask(nextSubtaskId)} disabled={!nextSubtaskId}><ChevronRight size={18} /></button>
                  {(isCreator || isAdminOrManager) && !readOnly && !["approved", "submitted"].includes(subtask.status) && (
                    <button className="td-btn-outline" onClick={() => setShowEditModal(true)}>
                      <Pencil size={15} strokeWidth={2.5} />
                      {t("Edit", { defaultValue: "Edit" })}
                    </button>
                  )}
                  {!readOnly && (isCreator || isAdminOrManager) && (
                    <button className="td-btn-danger" onClick={() => setDeleteConfirmOpen(true)}>
                      <Trash2 size={15} />
                      {t("Delete", { defaultValue: "Delete" })}
                    </button>
                  )}
                  {!readOnly && isAssignee && subtask?.allow_transfer === true && !["approved", "rejected", "pending", "submitted"].includes(subtask.status) && !isTransferor && !subtask?.active_outgoing_delegation && !hasPendingDelegation && !isDelegatee && (
                    <button className="td-btn-outline" onClick={() => setTransferDialog(true)}>
                      {t("Transfer", { defaultValue: "Transfer" })}
                    </button>
                  )}
                  {canAssignerPause && !isTransferor && !subtask?.active_outgoing_delegation && (
                    <button className="td-btn-primary" onClick={() => setAssignerPauseModalOpen(true)} disabled={assignerPausing} style={{ backgroundColor: assignerPausing ? "var(--text-muted)" : "var(--color-primary)", borderColor: assignerPausing ? "var(--text-muted)" : "var(--color-primary)", opacity: assignerPausing ? 0.7 : 1, cursor: assignerPausing ? "not-allowed" : "pointer" }}>
                      <Lock size={15} />
                      {assignerPausing ? t("Pausing...", { defaultValue: "Pausing..." }) : t("Pause", { defaultValue: "Pause" })}
                    </button>
                  )}
                  {canAssignerResume && !isTransferor && !subtask?.active_outgoing_delegation && (
                    <button className="td-btn-primary" onClick={handleAssignerResume} disabled={assignerResuming} style={{ backgroundColor: assignerResuming ? "var(--text-muted)" : "var(--color-success)", borderColor: assignerResuming ? "var(--text-muted)" : "var(--color-success)", opacity: assignerResuming ? 0.7 : 1, cursor: assignerResuming ? "not-allowed" : "pointer" }}>
                      <Play size={15} />
                      {assignerResuming ? t("Resuming...", { defaultValue: "Resuming..." }) : t("Resume", { defaultValue: "Resume" })}
                    </button>
                  )}
                  {isAssignerLocked && !isCreator && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", borderRadius: "6px", backgroundColor: "var(--color-warning-bg)", color: "var(--color-warning)", fontSize: "13px", fontWeight: 600, border: "1px solid var(--color-warning)" }}>
                      <Lock size={14} />
                      {t("Paused by Assigner", { defaultValue: "Paused by Assigner" })}
                    </span>
                  )}
                  {isPending && !readOnly && isAssignee && !isTransferor && !subtask?.active_outgoing_delegation && (
                    <button className="td-btn-primary" onClick={handleAcknowledge} disabled={acknowledging}>
                      <CheckCircle2 size={15} />
                      {acknowledging ? t("Acknowledging...", { defaultValue: "Acknowledging..." }) : t("Acknowledge", { defaultValue: "Acknowledge" })}
                    </button>
                  )}
                  {canStartSubtaskTimer && (
                    <button className="td-btn-primary" onClick={handleStartTimer} disabled={startingTimer} style={{ backgroundColor: startingTimer ? "#9CA3AF" : "var(--color-primary)" }}>
                      <Play size={15} />
                      {startingTimer ? t("Starting...", { defaultValue: "Starting..." }) : t("Start", { defaultValue: "Start" })}
                    </button>
                  )}
                  {canPauseSubtask && (
                    <button className="td-btn-primary" onClick={handlePause} disabled={pausing} style={{ backgroundColor: pausing ? "#9CA3AF" : "#D97706" }}><Pause size={15} />{pausing ? t("Pausing...", { defaultValue: "Pausing..." }) : t("Pause", { defaultValue: "Pause" })}</button>
                  )}
                  {canResumeSubtask && (
                    <button className="td-btn-primary" onClick={handleResume} disabled={resuming}><Play size={15} />{resuming ? t("Resuming...", { defaultValue: "Resuming..." }) : t("Resume", { defaultValue: "Resume" })}</button>
                  )}
                  {!readOnly && canSubmit && !showSubmitForm && (!isTransferor || transferorHasApproved) && !subtask?.active_outgoing_delegation && !hasPendingDelegation && (
                    <button className="td-btn-primary" onClick={() => setShowSubmitForm(true)}>{isRejected ? t("Resubmit", { defaultValue: "Resubmit" }) : t("Submit", { defaultValue: "Submit" })}</button>
                  )}
                  {!readOnly && isSubmitted && canApproveReject && !transferorHasApproved && (
                    <>
                      <button className="td-btn-primary" onClick={handleApprove} disabled={approving} style={{ background: "#166534" }}>{approving ? t("Approving...", { defaultValue: "Approving..." }) : t("Approve", { defaultValue: "Approve" })}</button>
                      <button className="td-btn-danger" onClick={() => setShowRejectForm(true)}>{t("Decline", { defaultValue: "Decline" })}</button>
                    </>
                  )}
                  {!readOnly && canApproveReject && ["completed", "approved", "declined", "rejected", "abandoned"].includes(subtask.status) && (
                    <button className="td-btn-outline" onClick={handleReopen}>{t("Reopen", { defaultValue: "Reopen" })}</button>
                  )}
                  {canAbandonSubtask && (
                    <button
                      className="td-btn-danger"
                      onClick={() => setAbandonModalOpen(true)}
                      style={{ background: "#dc2626", color: "#ffffff", border: "none", fontWeight: 600, padding: "8px 16px", borderRadius: "8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
                    >
                      <Trash2 size={15} />
                      {t("Abandon Subtask", { defaultValue: "Abandon Subtask" })}
                    </button>
                  )}
                  {isTransferor && transferorReturnToSelf && subtask?.status === "submitted" && !transferorHasApproved && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", borderRadius: "6px", backgroundColor: "#EFF6FF", color: "#1D4ED8", fontSize: "13px", fontWeight: 600 }}>
                      {t("Transferred", { defaultValue: "Transferred" })}
                    </span>
                  )}
                  {!transferorHasApproved && (isTransferor || subtask?.active_outgoing_delegation) && !(isTransferor && transferorReturnToSelf && subtask?.status === "submitted") && (
                    <>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", borderRadius: "6px", backgroundColor: "#EFF6FF", color: "#1D4ED8", fontSize: "13px", fontWeight: 600 }}>
                        {t("Transferred", { defaultValue: "Transferred" })}
                      </span>
                      {subtask?.can_revoke_delegation && subtask?.active_outgoing_delegation_id && (
                        <button className="td-btn-danger" onClick={handleRevokeDelegation} disabled={revoking}>
                          <Trash2 size={15} />
                          {revoking ? t("Revoking...", { defaultValue: "Revoking..." }) : t("Revoke", { defaultValue: "Revoke" })}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Badges */}
              <div className="td-badges">
                <span className="td-badge" style={{ background: statusBgColor(subtask.status), color: statusColor(subtask.status) }}>
                  <span className="td-badge-dot" style={{ background: statusColor(subtask.status) }} />
                  {statusLabel(subtask.status, t)}
                </span>
                {Boolean(subtask.is_reopened || (Array.isArray(subtask?.states) && subtask.states.some((s) => String(s).toLowerCase() === "reopened")) || subtask?.reopened_at || Number(subtask?.reopen_count) > 0) && (
                  <span className="td-badge" style={{ background: "#EDE9FE", color: "#6D28D9", border: "1px solid #DDD6FE" }}>
                    <span className="td-badge-dot" style={{ background: "#6D28D9" }} />
                    {t("Reopened", { defaultValue: "Reopened" })}
                  </span>
                )}
                {Boolean(subtask.is_transferred || (Array.isArray(subtask?.states) && subtask.states.some((s) => String(s).toLowerCase() === "transferred")) || (Array.isArray(subtask?.delegation_chain) && subtask.delegation_chain.length > 0)) && (
                  <span className="td-badge" style={{ background: "#E0E7FF", color: "#4338CA", border: "1px solid #C7D2FE" }}>
                    <span className="td-badge-dot" style={{ background: "#4338CA" }} />
                    {t("Transferred", { defaultValue: "Transferred" })}
                  </span>
                )}
                <span className="td-badge" style={{ background: priorityBgColor(subtask.priority), color: priorityColor(subtask.priority) }}>
                  <span className="td-badge-dot" style={{ background: priorityColor(subtask.priority) }} />
                  {t("{{priority}} Priority", { priority: t(subtask.priority || "Medium", { defaultValue: subtask.priority || "Medium" }), defaultValue: `${subtask.priority || "Medium"} Priority` })}
                </span>
                <span className="td-badge" style={{ background: subtask.allow_transfer ? "#f0fdf4" : "#fef2f2", color: subtask.allow_transfer ? "#16a34a" : "#dc2626" }}>
                  <span className="td-badge-dot" style={{ background: subtask.allow_transfer ? "#16a34a" : "#dc2626" }} />
                  {subtask.allow_transfer ? t("Transfer Allowed", { defaultValue: "Transfer Allowed" }) : t("Transfer Not Allowed", { defaultValue: "Transfer Not Allowed" })}
                </span>
              </div>

              {/* STATS — matches TaskDetails duo layout */}
              <div className="td-stats">
                <div className="td-stat td-stat--progress">
                  <span className="td-stat-label">{t("Attachments", { defaultValue: "Attachments" })}</span>
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
                      <span className="td-stat-label">{t("Deadline", { defaultValue: "Deadline" })}</span>
                    </div>
                  </div>
                  <div className="td-trio-item">
                    <div className="td-stat-ic" style={{ background: "#EDE9FE", color: "#7C3AED" }}><CheckCircle2 size={18} /></div>
                    <div>
                      <span className="td-stat-big td-stat-big--sm">{subtask.assignee?.name || "—"}</span>
                      <span className="td-stat-label">{t("Assigned To", { defaultValue: "Assigned To" })}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* TAB CONTENT — matches TaskDetails exactly */}
              <div className="td-content">
                <div style={{ marginBottom: "16px", marginTop: "4px", paddingLeft: "4px" }}>
                  <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#111827", margin: 0 }}>
                    {location.state?.from === "deliveries" && t("Assigned to You", { defaultValue: "Assigned to You" })}
                    {location.state?.from === "deliveries-by-you" && t("Assigned by You", { defaultValue: "Assigned by You" })}
                    {location.state?.from === "self-deliveries" && t("Self Subtasks", { defaultValue: "Self Subtasks" })}
                    {location.state?.from === "all-deliverables" && t("All Sub-Tasks", { defaultValue: "All Sub-Tasks" })}
                  </h2>
                </div>

                <div className="td-tabs">
                  {[
                    { id: "overview", label: t("Overview", { defaultValue: "Overview" }), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg> },
                    { id: "files", label: t("Platform files & links", { defaultValue: "Platform files & links" }), icon: <FolderOpen size={16} /> },
                    { id: "activity", label: t("Activity", { defaultValue: "Activity" }), icon: <Activity size={16} /> },
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
                        <h2 className="td-section-title">{t("Subtask Details", { defaultValue: "Subtask Details" })}</h2>
                      </div>
                      <div className="td-overview-grid">
                        <div className="td-overview-left">
                          {subtask.description ? (
                            <div
                              className="rte-display"
                              dangerouslySetInnerHTML={{ __html: subtask.description }}
                            />
                          ) : (
                            <p style={{ color: "#6b7280", fontSize: "14px" }}>{t("No description provided for this subtask.", { defaultValue: "No description provided for this subtask." })}</p>
                          )}

                          {/* Labels/Tags */}
                          {((Array.isArray(subtask.labels) && subtask.labels.length > 0) || (Array.isArray(subtask.tags) && subtask.tags.length > 0)) && (
                            <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {(Array.isArray(subtask.labels) ? subtask.labels : []).map((l, i) => (
                                <span key={`l-${i}`} className="td-label-tag">{l}</span>
                              ))}
                              {(Array.isArray(subtask.tags) ? subtask.tags : []).map((t, i) => (
                                <span key={`t-${i}`} className="td-label-tag td-label-tag--alt">{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Submit Form */}
                      {!readOnly && canSubmit && showSubmitForm && (
                        <div className="td-card" style={{ padding: 20, marginTop: 20 }}>
                          <h3 className="td-card-title">{isRejected ? t("Resubmit Subtask", { defaultValue: "Resubmit Subtask" }) : t("Submit Subtask", { defaultValue: "Submit Subtask" })}</h3>
                          <div style={{ marginTop: 12 }}>
                            <label className="td-form-label">{t("Comment", { defaultValue: "Comment" })}</label>
                            <textarea className="td-textarea" placeholder={t("Add a comment...", { defaultValue: "Add a comment..." })} value={submitComment} onChange={(e) => setSubmitComment(e.target.value)} />
                          </div>
                          <div style={{ marginTop: 12 }}>
                            <label className="td-form-label">{t("File Attachment", { defaultValue: "File Attachment" })}</label>
                            <input type="file" ref={fileInputRef} onChange={(e) => setSubmitFile(e.target.files[0])} style={{ fontSize: 14 }} />
                          </div>
                          <div style={{ marginTop: 12 }}>
                            <label className="td-form-label">{t("Links", { defaultValue: "Links" })}</label>
                            <div style={{ display: "flex", gap: 8 }}>
                              <input type="text" placeholder="https://..." value={linkInput} onChange={(e) => setLinkInput(e.target.value)} onKeyDown={handleLinkKeyDown} className="td-input" />
                              <button type="button" onClick={handleAddLink} disabled={!linkInput.trim()} className="td-btn-primary">{t("Add", { defaultValue: "Add" })}</button>
                            </div>
                          </div>
                          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                            <button className="td-btn-primary" onClick={handleSubmit} disabled={submitting}>{submitting ? t("Submitting...", { defaultValue: "Submitting..." }) : t("Submit", { defaultValue: "Submit" })}</button>
                            <button className="td-btn-outline" onClick={() => { setShowSubmitForm(false); setSubmitComment(""); setSubmitFile(null); setLinks([]); setLinkInput(""); }}>{t("Cancel", { defaultValue: "Cancel" })}</button>
                          </div>
                        </div>
                      )}

                      {/* Reject Info */}
                      {isRejected && subtask.rejection_comment && (
                        <div className="td-info-banner td-info-banner--danger" style={{ marginTop: 20 }}>
                          <h3 className="td-card-title" style={{ color: "#991B1B" }}>{t("Decline Reason", { defaultValue: "Decline Reason" })}</h3>
                          <p style={{ color: "#7F1D1D", marginTop: 6 }}>{subtask.rejection_comment}</p>
                          {subtask.rejected_by && <p style={{ color: "#7F1D1D", fontSize: 12, marginTop: 4 }}>{t("By: {{name}}", { name: subtask.rejected_by.name, defaultValue: `By: ${subtask.rejected_by.name}` })}</p>}
                        </div>
                      )}

                      {/* Approved Info */}
                      {isApproved && (
                        <div className="td-info-banner td-info-banner--success" style={{ marginTop: 20 }}>
                          <h3 className="td-card-title" style={{ color: "#166534" }}>{t("Approved", { defaultValue: "Approved" })}</h3>
                          {subtask.approved_by && <p style={{ color: "#166534", marginTop: 4, fontSize: 13 }}>{t("Approved by: {{name}}", { name: subtask.approved_by.name, defaultValue: `Approved by: ${subtask.approved_by.name}` })}</p>}
                        </div>
                      )}

                      {/* Reject Form */}
                      {!readOnly && showRejectForm && (
                        <div className="td-card" style={{ padding: 16, marginTop: 20 }}>
                          <label className="td-form-label">{t("Decline Comment", { defaultValue: "Decline Comment" })}</label>
                          <textarea className="td-textarea" placeholder={t("Reason for decline...", { defaultValue: "Reason for decline..." })} value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} />
                          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                            <button className="td-btn-danger" onClick={handleReject} disabled={declining}>{declining ? t("Declining...", { defaultValue: "Declining..." }) : t("Confirm Decline", { defaultValue: "Confirm Decline" })}</button>
                            <button className="td-btn-outline" onClick={() => { setShowRejectForm(false); setRejectComment(""); }}>{t("Cancel", { defaultValue: "Cancel" })}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {tab === "files" && (
                    <FileUploadSection entityType="deliverable" entityId={subtask.id} files={files} onReorder={handleFileReorder} onFilesChange={fetchSubtask} readOnly={true} />
                  )}

                  {tab === "activity" && (
                    <div className="td-overview" style={{ padding: "20px" }}>
                      <UnifiedActivityFeed
                        module="deliverable"
                        entityId={subtask.id}
                        initialUsers={[subtask.assignee, subtask.assigner].filter(Boolean)}
                      />
                    </div>
                  )}
                </div>

              </div>

            {/* Rejection info - shown when rejected */}
            {isRejected && subtask.rejection_comment && (
              <div style={{ marginTop: "20px", padding: "16px", background: "#FEE2E2", borderRadius: "8px", border: "1px solid #FECACA" }}>
                <h3 className="td-card-title" style={{ color: "var(--color-danger)" }}>{t("Decline Reason", { defaultValue: "Decline Reason" })}</h3>
                <p style={{ color: "#7F1D1D", marginTop: "6px" }}>{subtask.rejection_comment}</p>
                {subtask.rejected_by && <p style={{ color: "#7F1D1D", fontSize: "12px", marginTop: "4px" }}>{t("By: {{name}}", { name: subtask.rejected_by.name, defaultValue: `By: ${subtask.rejected_by.name}` })}</p>}
              </div>
            )}

            {/* TASK DISCUSSION — inside td-main, same as TaskDetails */}
            <TaskDiscussion taskId={subtask.task_id} deliverableId={subtask.id} entityType="deliverable" />
            </div>
          </div>

            {/* ===== RIGHT SIDEBAR — matches TaskDetails exactly ===== */}
            <aside className="td-sidebar">
              {/* DELEGATION CHAIN */}
              <DelegationChain
                task={subtask}
                delegationChain={subtask?.delegation_chain || []}
                approvalChain={subtask?.approval_chain || []}
                onTaskUpdate={fetchSubtask}
              />

              {/* WORK DURATION */}
              {(timerState !== 'idle' || timerData.work_started_at) && (
                <div className="td-card">
                  <h3 className="td-card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Timer size={16} />
                    {timerState === 'completed' ? t('Time Summary', { defaultValue: 'Time Summary' }) : t('Work Duration', { defaultValue: 'Work Duration' })}
                  </h3>
                  <div className="td-timer-display">
                    <span className={`td-timer-value ${timerState === 'running' ? 'td-timer-running' : ''} ${timerState === 'completed' ? 'td-timer-completed' : ''}`}>
                      {workDisplay}
                    </span>
                    {timerState === 'running' && <span className="td-timer-pulse" />}
                  </div>
                  <div className="td-timer-metrics">
                    <div className="td-timer-metric">
                      <span className="td-timer-metric-label">{t("Elapsed", { defaultValue: "Elapsed" })}</span>
                      <span className="td-timer-metric-value">{elapsedDisplay}</span>
                    </div>
                    <div className="td-timer-metric">
                      <span className="td-timer-metric-label">{t("Pauses", { defaultValue: "Pauses" })}</span>
                      <span className="td-timer-metric-value">{pauseCount} ({pauseDisplay})</span>
                    </div>
                    <div className="td-timer-metric">
                      <span className="td-timer-metric-label">{t("Resumes", { defaultValue: "Resumes" })}</span>
                      <span className="td-timer-metric-value">{timerData.resume_count || 0}</span>
                    </div>
                  </div>
                  {timerData.work_started_at && (
                    <div className="td-timer-meta">
                      <span>{t("Started: {{time}}", { time: formatDateTime(timerData.work_started_at), defaultValue: `Started: ${formatDateTime(timerData.work_started_at)}` })}</span>
                      {timerData.work_completed_at && <span>{t("Finished: {{time}}", { time: formatDateTime(timerData.work_completed_at), defaultValue: `Finished: ${formatDateTime(timerData.work_completed_at)}` })}</span>}
                    </div>
                  )}
                </div>
              )}

              <div className="td-card">
                <h3 className="td-card-title">{t("Subtask Information", { defaultValue: "Subtask Information" })}</h3>
                <ul className="td-info">
                  <li>
                    <span className="td-dot" style={{ background: "#3b82f6" }} />
                    <div>
                      <span className="td-info-label">{t("Project", { defaultValue: "Project" })}</span>
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
                      <span className="td-info-label">{t("Parent Task", { defaultValue: "Parent Task" })}</span>
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
                      <span className="td-info-label">{t("Created By", { defaultValue: "Created By" })}</span>
                      <span className="td-info-val">{subtask.creator?.name || "—"}</span>
                    </div>
                  </li>
                  <li>
                    <span className="td-dot" style={{ background: "#8b5cf6" }} />
                    <div>
                      <span className="td-info-label">{t("Assigned To", { defaultValue: "Assigned To" })}</span>
                      <span className="td-info-val">{subtask.assignee?.name || "—"}</span>
                    </div>
                  </li>
                  <li>
                    <span className="td-dot" style={{ background: "#22c55e" }} />
                    <div>
                      <span className="td-info-label">{t("Last Updated", { defaultValue: "Last Updated" })}</span>
                      <span className="td-info-val">{subtask.updated_at ? timeAgo(subtask.updated_at, t) : "—"}</span>
                    </div>
                  </li>
                  <li>
                    <span className="td-dot" style={{ background: "#3b82f6" }} />
                    <div>
                      <span className="td-info-label">{t("Start Date", { defaultValue: "Start Date" })}</span>
                      <span className="td-info-val">{subtask.start_date ? formatDateTime(subtask.start_date) : "—"}</span>
                    </div>
                  </li>
                  <li>
                    <span className="td-dot" style={{ background: "#ef4444" }} />
                    <div>
                      <span className="td-info-label">{t("Due Date", { defaultValue: "Due Date" })}</span>
                      <span className="td-info-val">{subtask.due_date ? formatDateTime(subtask.due_date) : "—"}</span>
                    </div>
                  </li>
                  {(() => {
                    const kbIds = Array.isArray(subtask?.kb_ids)
                      ? subtask.kb_ids
                      : subtask?.kb_id
                      ? [subtask.kb_id]
                      : [];
                    return (
                      <li>
                        <span className="td-dot" style={{ background: "#6366f1" }} />
                        <div>
                          <span className="td-info-label">{t("Knowledge Base", { defaultValue: "Knowledge Base" })}</span>
                          <span className="td-info-val">
                            {kbIds && kbIds.length > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                {kbIds.map((kId) => {
                                  const foundKb = kbArticles.find((k) => String(k.id) === String(kId));
                                  const kbTitle = foundKb?.title || `Article #${kId}`;
                                  return (
                                    <Link
                                      key={kId}
                                      to={rolePath ? rolePath(`knowledge-base/${kId}`) : `/knowledge-base/${kId}`}
                                      className="td-project-link"
                                      style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
                                    >
                                      <BookOpen size={14} style={{ flexShrink: 0 }} />
                                      <span>{kbTitle}</span>
                                    </Link>
                                  );
                                })}
                              </div>
                            ) : "—"}
                          </span>
                        </div>
                      </li>
                    );
                  })()}
                  {(() => {
                    const eventIds = Array.isArray(subtask?.event_ids)
                      ? subtask.event_ids
                      : subtask?.event_id
                      ? [subtask.event_id]
                      : [];
                    return (
                      <li>
                        <span className="td-dot" style={{ background: "#0ea5e9" }} />
                        <div>
                          <span className="td-info-label">{t("Event", { defaultValue: "Event" })}</span>
                          <span className="td-info-val">
                            {eventIds && eventIds.length > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                {eventIds.map((eId) => {
                                  const foundEv = eventsList.find((e) => String(e.id) === String(eId));
                                  const eventTitle = foundEv?.title || `Event #${eId}`;
                                  return (
                                    <Link
                                      key={eId}
                                      to={rolePath ? rolePath(`events/${eId}`) : `/events/${eId}`}
                                      className="td-project-link"
                                      style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
                                    >
                                      <Calendar size={14} style={{ flexShrink: 0 }} />
                                      <span>{eventTitle}</span>
                                    </Link>
                                  );
                                })}
                              </div>
                            ) : "—"}
                          </span>
                        </div>
                      </li>
                    );
                  })()}
                </ul>
              </div>

              {/* TIMELINE HISTORY — matches TaskDetails sidebar */}
              {(() => {
                const historyItems = workflowEvents
                  .filter((e) => e.event_type !== 'field_changed')
                  .map((e) => ({
                    id: `evt-${e.id}`,
                    action: e.event_type,
                    user: e.user,
                    date: e.created_at,
                    comment: e.comment,
                  }));
                const actionLabel = (action) => {
                  const map = {
                    submitted: "Submitted",
                    resubmitted: "Resubmitted",
                    acknowledged: "Acknowledged",
                    paused: "Paused",
                    continued: "Continued",
                    approved: "Approved",
                    rejected: "Declined",
                    reopened: "Reopened",
                    created: "Created",
                    assigner_paused: "Paused by Assigner",
                    assigner_resumed: "Resumed",
                  };
                  const label = map[action] || action?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                  return t(label, { defaultValue: label });
                };
                if (historyItems.length === 0) return null;
                return (
                  <div className="td-card">
                    <h3 className="td-card-title">{t("Timeline History", { defaultValue: "Timeline History" })}</h3>
                    <ul className="td-history-list">
                      {historyItems.map((item) => (
                        <li key={item.id} className="td-history-item">
                          <div className="td-history-header">
                            <span className={`td-history-badge td-history-badge--${item.action}`}>{actionLabel(item.action)}</span>
                            <span className="td-history-date">{formatDateTime(item.date)}</span>
                          </div>
                          <div className="td-history-meta">
                            {t("by {{name}}", { name: item.user?.name || "Unknown", defaultValue: `by ${item.user?.name || "Unknown"}` })}
                          </div>
                          {item.comment && <p className="td-submission-text">{item.comment}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              {/* SUBMISSION HISTORY */}
              {(subtask.submissions || []).length > 0 && (
                <div className="td-card">
                  <h3 className="td-card-title">{t("Submission History", { defaultValue: "Submission History" })}</h3>
                  {(subtask.submissions || []).map((sub, idx) => (
                    <div key={sub.id} style={{
                      padding: "10px 0",
                      borderBottom: idx < (subtask.submissions || []).length - 1 ? "1px solid var(--border)" : "none",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <span style={{ fontWeight: 600, fontSize: "13px" }}>
                          {t("Submission #{{num}}", { num: sub.version_number || ((subtask.submissions || []).length - idx), defaultValue: `Submission #${sub.version_number || ((subtask.submissions || []).length - idx)}` })}
                        </span>
                        <span className="badge" style={{
                          background: sub.status === "approved" ? "var(--color-success-bg)" : sub.status === "reopened" ? "var(--color-warning-bg)" : "var(--color-blue-bg)",
                          color: sub.status === "approved" ? "var(--color-success)" : sub.status === "reopened" ? "var(--color-warning)" : "var(--color-blue)",
                          fontSize: "11px", padding: "2px 8px", borderRadius: "12px", fontWeight: 600,
                        }}>
                          {sub.status === "approved" ? t("Approved", { defaultValue: "Approved" }) : sub.status === "reopened" ? t("Reopened", { defaultValue: "Reopened" }) : t("Pending", { defaultValue: "Pending" })}
                        </span>
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        <span>{t("By: {{name}}", { name: sub.submitted_by?.name || sub.submittedBy?.name || "Unknown", defaultValue: `By: ${sub.submitted_by?.name || sub.submittedBy?.name || "Unknown"}` })}</span>
                        <span style={{ marginLeft: 12 }}>{t("On: {{date}}", { date: formatDateTime(sub.created_at), defaultValue: `On: ${formatDateTime(sub.created_at)}` })}</span>
                      </div>
                      {sub.reopen_reason && (
                        <p style={{ fontSize: "12px", color: "var(--color-warning)", marginTop: "4px" }}>
                          {t("Reason: {{reason}}", { reason: sub.reopen_reason, defaultValue: `Reason: ${sub.reopen_reason}` })}
                        </p>
                      )}
                      {(sub.attachments?.length > 0 || sub.file_name) && (
                        <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                          {(sub.attachments || []).map((att) => {
                            const isLink = att.attachment_type === "link";
                            const href = isLink ? att.url : downloadUrl(att.full_url, att.original_name || att.file_name);
                            return (
                              <a key={att.id} className="td-submission-file-link" href={href} download={isLink ? undefined : (att.original_name || att.file_name)} target="_blank" rel="noopener noreferrer" style={{ fontSize: "11px", padding: "2px 8px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                {isLink ? <ExternalLink size={12} /> : <FileText size={12} />}
                                <span>{att.original_name || att.file_name}</span>
                                {!isLink && <Download size={12} style={{ marginLeft: "auto" }} />}
                              </a>
                            );
                          })}
                          {sub.file_name && (!sub.attachments || sub.attachments.length === 0) && (
                            <a className="td-submission-file-link" href={`${API_URL}/deliverables/submission-file/${sub.id}`} download={sub.file_name} target="_blank" rel="noopener noreferrer" style={{ fontSize: "11px", padding: "2px 8px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              <FileText size={12} />
                              <span>{sub.file_name}</span>
                              <Download size={12} style={{ marginLeft: "auto" }} />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* REOPEN COUNT */}
              {(subtask.reopen_count > 0 || workflowEvents.filter(e => e.event_type === 'reopened').length > 0) && (
                <div className="td-card" style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{t("Reopen Count", { defaultValue: "Reopen Count" })}</span>
                    <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--color-warning)" }}>
                      {subtask.reopen_count || workflowEvents.filter(e => e.event_type === 'reopened').length}
                    </span>
                  </div>
                </div>
              )}

              {/* PERFORMANCE DASHBOARD */}
              {isApproved && (
                <div className="td-card">
                  <h3 className="td-card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <BarChart3 size={16} />
                    {t("Performance", { defaultValue: "Performance" })}
                  </h3>
                  <div className="td-timer-metrics">
                    {subtask.submitted_at && (
                      <div className="td-timer-metric">
                        <span className="td-timer-metric-label">{t("Submitted", { defaultValue: "Submitted" })}</span>
                        <span className="td-timer-metric-value">{formatDateTime(subtask.submitted_at)}</span>
                      </div>
                    )}
                    {subtask.approved_at && (
                      <div className="td-timer-metric">
                        <span className="td-timer-metric-label">{t("Approved", { defaultValue: "Approved" })}</span>
                        <span className="td-timer-metric-value">{formatDateTime(subtask.approved_at)}</span>
                      </div>
                    )}
                    {subtask.due_date && (
                      <div className="td-timer-metric">
                        <span className="td-timer-metric-label">{t("Deadline", { defaultValue: "Deadline" })}</span>
                        <span className="td-timer-metric-value">{formatDateTime(subtask.due_date)}</span>
                      </div>
                    )}
                    {subtask.approved_at && subtask.due_date && (
                      <div className="td-timer-metric">
                        <span className="td-timer-metric-label">{t("Result", { defaultValue: "Result" })}</span>
                        <span className="td-timer-metric-value" style={{ color: new Date(subtask.approved_at) <= new Date(subtask.due_date) ? "#059669" : "#ef4444" }}>
                          {new Date(subtask.approved_at) <= new Date(subtask.due_date) ? t("On Time", { defaultValue: "On Time" }) : t("Late", { defaultValue: "Late" })}
                        </span>
                      </div>
                    )}
                    {(() => {
                      const reworkCount = workflowEvents.filter(e => e.event_type === 'reopened').length;
                      return reworkCount > 0 ? (
                        <div className="td-timer-metric">
                          <span className="td-timer-metric-label">{t("Reworks", { defaultValue: "Reworks" })}</span>
                          <span className="td-timer-metric-value">{reworkCount}</span>
                        </div>
                      ) : null;
                    })()}
                    {(() => {
                      const approvalAttempts = workflowEvents.filter(e => e.event_type === 'submitted').length;
                      return (
                        <div className="td-timer-metric">
                          <span className="td-timer-metric-label">{t("Attempts", { defaultValue: "Attempts" })}</span>
                          <span className="td-timer-metric-value">{approvalAttempts}</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* NOTES — matches TaskDetails multi-note support */}
              <div className="td-card">
                <div className="td-card-head">
                  <h3 className="td-card-title">{t("Notes", { defaultValue: "Notes" })}</h3>
                </div>
                <textarea
                  className="td-notes-textarea"
                  rows={3}
                  placeholder={t("Write a note...", { defaultValue: "Write a note..." })}
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                />
                <button type="button" className="td-save-notes-btn" disabled={noteSaving || !noteInput.trim()} onClick={saveNote}>
                  {noteSaving ? t("Saving…", { defaultValue: "Saving…" }) : t("Add Note", { defaultValue: "Add Note" })}
                </button>
                {notes.length > 0 && (
                  <div className="td-notes-list">
                    {notes.map((n) => (
                      <div key={n.id} className="td-saved-note">
                        <button type="button" className="td-note-delete" onClick={() => { setPendingNoteId(n.id); setNoteDeleteOpen(true); }} title={t("Delete note", { defaultValue: "Delete note" })}>&times;</button>
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
        title={t("Delete Note", { defaultValue: "Delete Note" })}
        message={t("Are you sure you want to delete this note? This action cannot be undone.", { defaultValue: "Are you sure you want to delete this note? This action cannot be undone." })}
        confirmText={t("Delete", { defaultValue: "Delete" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        danger
      />
      <PauseReasonModal
        isOpen={assignerPauseModalOpen}
        onClose={() => setAssignerPauseModalOpen(false)}
        onConfirm={async (data) => { await handleAssignerPause(data); setAssignerPauseModalOpen(false); }}
        isAssigner
      />
      <ReopenDialog
        isOpen={reopenDialogOpen}
        onClose={() => setReopenDialogOpen(false)}
        subtask={subtask}
        onReopenSuccess={handleReopenSuccess}
      />
      <TransferTaskDialog
        isOpen={transferDialog}
        onClose={() => setTransferDialog(false)}
        task={subtask}
        entityType="deliverable"
        onTransferSuccess={(updated) => { setSubtask(updated); showSuccessMessage("Subtask", "transferred"); }}
      />
      {showEditModal && (
        <CreateDeliverableModel
          onClose={(refresh) => { setShowEditModal(false); if (refresh) fetchSubtask(); }}
          projectId={subtask?.project_id}
          taskId={subtask?.task_id}
          editMode={true}
          editData={subtask}
        />
      )}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={confirmDeleteSubtask}
        title={t("Delete Subtask", { defaultValue: "Delete Subtask" })}
        message={t("Are you sure you want to delete this subtask? This action cannot be undone.", { defaultValue: "Are you sure you want to delete this subtask? This action cannot be undone." })}
        confirmText={t("Delete", { defaultValue: "Delete" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        danger
      />
      <AbandonModal
        isOpen={abandonModalOpen}
        onClose={() => setAbandonModalOpen(false)}
        title={t("Abandon Subtask", { defaultValue: "Abandon Subtask" })}
        subtitle={t("Please state the reason for abandoning this subtask.", { defaultValue: "Please state the reason for abandoning this subtask." })}
        actionLabel={t("Abandon Subtask", { defaultValue: "Abandon Subtask" })}
        onSubmit={handleAbandonSubmit}
        loading={abandonSubmitting}
      />
    </>
  );
}

export default SubtaskDetails;
