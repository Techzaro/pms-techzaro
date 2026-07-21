/**
 * TaskDetails page component.
 *
 * Full detail view for a single task.  Shows task metadata (status, priority,
 * assignees, dates), subtasks table (sortable, with submit/view actions),
 * task submission workflow panel, file attachments, a sidebar with task info
 * and a personal notes section.  Supports navigation between tasks via
 * previous/next buttons and tracks which tasks have been viewed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage } from "../utils/notify";
import {
  BarChart3,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  FolderOpen,
  Globe,
  Lock,
  Pause,
  Pencil,
  Play,
  Plus,
  Shield,
  Timer,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import EditTaskModal from "../components/EditTaskModal";
import ConfirmModal from "../components/ConfirmModal";
import PauseReasonModal from "../components/PauseReasonModal";
import SubmitDeliverableModal from "../components/SubmitDeliverableModal";
import ViewDeliverableModal from "../components/ViewDeliverableModal";
import AssignerViewModal from "../components/AssignerViewModal";
import SubmitTaskModal from "../components/SubmitTaskModal";
import TaskSubmissionPanel from "../components/TaskSubmissionPanel";
import AddAccessModal from "../components/AddAccessModal";
import TaskDiscussion from "../components/TaskDiscussion";
import CreateDeliverableModel from "../components/layout/CreateDeliverableModel";
import API_URL from "../config/api";
import { authToken, getUser, rolePath } from "../utils/auth";

const API_BASE = API_URL.replace(/\/api\/?$/, "");

/** Build a full URL for a relative file path, or return absolute URLs as-is. */
function fileUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return API_BASE + url;
}
import { publish } from "../utils/eventBus";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import { useSubmit } from "../hooks/useSubmit";
import { formatDateTimeShort, formatDateTime } from "../utils/formatDateTime";
import { useActivityHighlight } from "../hooks/useActivityHighlight";
import { useWorkTimer } from "../hooks/useWorkTimer";
import { useIdleDetection } from "../hooks/useIdleDetection";
import FileUploadSection from "../components/FileUploadSection";
import "../components/layout/ActivityHighlight.css";
import "./TaskDetails.css";
import "./Deliveries.css";

/** Convert an ISO timestamp to a human-friendly "X time ago" string. */
function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hours ago`;
  return `${Math.floor(sec / 86400)} days ago`;
}

/** Map a raw status string to a display-friendly label. */
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

/** Return text colour for a given task status. */
function statusColor(status) {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "var(--color-success)";
  if (s === "pending") return "var(--color-warning)";
  if (s === "in_progress" || s === "acknowledged") return "var(--color-blue)";
  if (s === "paused") return "var(--color-warning)";
  if (s === "reopened") return "var(--color-warning)";
  if (s === "submitted") return "var(--color-blue)";
  if (s === "rejected") return "var(--color-danger)";
  return "var(--text-dark)";
}

/** Return background colour for a given task status badge. */
function statusBgColor(status) {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "var(--color-success-bg)";
  if (s === "pending") return "var(--color-warning-bg)";
  if (s === "in_progress" || s === "acknowledged") return "var(--color-blue-bg)";
  if (s === "paused") return "var(--color-warning-bg)";
  if (s === "reopened") return "var(--color-warning-bg)";
  if (s === "submitted") return "var(--color-blue-bg)";
  if (s === "rejected") return "var(--color-danger-bg)";
  return "var(--bg-hover)";
}

/** Return text colour for a priority level. */
function priorityColor(priority) {
  const p = (priority || "").toLowerCase();
  if (p === "high") return "var(--color-danger)";
  if (p === "medium") return "var(--color-warning)";
  if (p === "low") return "var(--color-success)";
  return "var(--text-dark)";
}

/** Return background colour for a priority badge. */
function priorityBgColor(priority) {
  const p = (priority || "").toLowerCase();
  if (p === "high") return "var(--color-danger-bg)";
  if (p === "medium") return "var(--color-warning-bg)";
  if (p === "low") return "var(--color-success-bg)";
  return "var(--bg-hover)";
}

/** Extract up to 2 uppercase initials from a name for avatar display. */
function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] || "";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase() || a.toUpperCase();
}

/** Format a date string to a short "Mon DD, YYYY" display. */
function formatShortDate(dateString) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function CredentialRow({ credential, onDelete }) {
  const [copied, setCopied] = useState(false);
  const [copiedUser, setCopiedUser] = useState(false);

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(credential.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = credential.password;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyUsername = async () => {
    try {
      await navigator.clipboard.writeText(credential.username);
      setCopiedUser(true);
      setTimeout(() => setCopiedUser(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = credential.username;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopiedUser(true);
      setTimeout(() => setCopiedUser(false), 2000);
    }
  };

  return (
    <div className="td-cred-card">
      <div className="td-cred-header">
        <div className="td-cred-website">
          <Globe size={18} />
          <span className="td-cred-name">{credential.website_name}</span>
          {credential.website_url && (
            <a href={credential.website_url} target="_blank" rel="noopener noreferrer" className="td-cred-link">Visit</a>
          )}
        </div>
        {onDelete && (
          <button className="td-cred-delete" onClick={onDelete} title="Delete credential">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="td-cred-fields">
        <div className="td-cred-field">
          <label>Username / Email</label>
          <div className="td-cred-value-row">
            <span className="td-cred-value">{credential.username}</span>
            <button className={`td-cred-copy ${copiedUser ? "td-cred-copied" : ""}`} onClick={copyUsername} title="Copy username">
              {copiedUser ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <div className="td-cred-field">
          <label>Password</label>
          <div className="td-cred-value-row">
            <span className="td-cred-value">{"\u2022".repeat(12)}</span>
            <button className={`td-cred-copy ${copied ? "td-cred-copied" : ""}`} onClick={copyPassword} title="Copy password">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <span className="td-cred-hint">{copied ? "Copied!" : "Click copy to use this password"}</span>
        </div>

        {credential.assigned_users && credential.assigned_users.length > 0 && (
          <div className="td-cred-field">
            <label>Assigned To</label>
            <div className="td-cred-assigned">
              {credential.assigned_users.map((u) => (
                <span key={u.id} className="td-cred-badge">{u.name}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Main TaskDetails component — renders the full task detail view with
 * sidebar, tabs, subtasks table and submission workflow.
 */
function TaskDetails() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const notify = useNotification();
  const taskIds = location.state?.taskIds || [];
  const sourcePages = {
    tasks: { label: "My Tasks", path: rolePath("tasks") },
    taskby: { label: "Tasks Assigned By You", path: rolePath("taskby") },
    "self-tasks": { label: "Self Tasks", path: rolePath("self-tasks") },
    "all-tasks": { label: "All Tasks", path: rolePath("all-tasks") },
  };

  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteTaskConfirmOpen, setDeleteTaskConfirmOpen] = useState(false);
  const [tab, setTab] = useState("overview");
  const [showCreateSubtaskModal, setShowCreateSubtaskModal] = useState(false);
  const [submitModal, setSubmitModal] = useState({ open: false, subtask: null });
  const [viewModal, setViewModal] = useState({ open: false, subtask: null });
  const [assignerModal, setAssignerModal] = useState({ open: false, subtask: null });
  const [taskSubmitModalOpen, setTaskSubmitModalOpen] = useState(false);
  const [taskConfirmDialog, setTaskConfirmDialog] = useState({ open: false, type: null });
  const [taskReopenDialog, setTaskReopenDialog] = useState(false);
  const [taskActing, setTaskActing] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [notes, setNotes] = useState([]);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteDeleteOpen, setNoteDeleteOpen] = useState(false);
  const [pendingNoteId, setPendingNoteId] = useState(null);
  const [orderedSubtasks, setOrderedSubtasks] = useState([]);
  const [subtaskSearch, setSubtaskSearch] = useState("");
  const [overviewSearch, setOverviewSearch] = useState("");
  const [accessSearch, setAccessSearch] = useState("");
  const [showAddAccessModal, setShowAddAccessModal] = useState(false);
  const [accessCredentials, setAccessCredentials] = useState([]);
  const [loadingCredentials, setLoadingCredentials] = useState(false);
  const [deleteCredentialConfirmOpen, setDeleteCredentialConfirmOpen] = useState(false);
  const [pendingDeleteCredential, setPendingDeleteCredential] = useState(null);

  const taskChangesForHighlight = (task?.changes || []).map((c) => ({ ...c, id: c.id || 0 }));
  const {
    hasUnread: taskHasUnread,
    isItemUnread: isTaskItemUnread,
    markViewed: markTaskViewed,
  } = useActivityHighlight("task", task?.id, task?.activity_max_id || 0, taskChangesForHighlight);

  const source = sourcePages[location.state?.from] || null;
  const readOnly = location.state?.readOnly === true;

  const fetchTask = useCallback(async (refresh = false) => {
    if (!taskId) return;

    try {
      setLoading(true);
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      if (res.ok) {
        const data = await res.json();
        setTask(data.task);
      } else if (res.status === 404) {
        setTask(null);
        notify.error("Task not found");
      } else {
        setTask(null);
      }
    } catch (err) {
      console.error("Failed to fetch task", err);
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (taskId) fetchTask(true);
  }, [taskId, fetchTask]);

  useAutoRefresh(() => fetchTask(false), {
    events: ["task:updated", "task:deleted", "deliverable:created", "deliverable:updated", "deliverable:deleted", "data:changed"],
  });

  const currentIdx = taskIds.findIndex(
    (id) => String(id) === String(taskId)
  );

  const prevTaskId =
    currentIdx > 0 ? taskIds[currentIdx - 1] : null;

  const nextTaskId =
    currentIdx >= 0 && currentIdx < taskIds.length - 1
      ? taskIds[currentIdx + 1]
      : null;

  useEffect(() => {
    setOrderedSubtasks(task?.deliverables || []);
  }, [task?.deliverables]);

  const handleSubtaskReorder = useCallback((reordered) => {
    setOrderedSubtasks(reordered);
    const payload = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
    fetch(`${API_URL}/deliverables/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ items: payload }),
      _notifHandled: true,
    }).catch(() => {});
  }, []);

  const currentUser = getUser();
  const isCreator = task?.is_creator ?? (task && currentUser && parseInt(task.assigned_by, 10) === parseInt(currentUser.id, 10));
  const isAssignee = task?.is_assignee ?? (task && currentUser && (task.assignees || []).some((a) => parseInt(a.id, 10) === parseInt(currentUser.id, 10)));
  const canEdit = readOnly ? false : (task?.can_edit ?? (task && currentUser && isCreator && task?.status?.toLowerCase() !== "approved"));
  const canSubmitTask = readOnly ? false : (task?.can_submit ?? (task && currentUser && isAssignee && ["pending", "in_progress", "reopened", "paused"].includes(task?.status)));
  const canAcknowledge = readOnly ? false : (task && currentUser && isAssignee && task?.status === "pending");
  const canPause = readOnly ? false : (task && currentUser && isAssignee && task?.status === "in_progress" && !task?.assigner_paused);
  const canContinue = readOnly ? false : (task && currentUser && isAssignee && task?.status === "paused" && !task?.assigner_paused);
  const isAssignerLocked = !!task?.assigner_paused;
  const canAssignerPause = readOnly ? false : (task && currentUser && isCreator && !task?.assigner_paused && ["pending", "in_progress", "reopened", "paused"].includes(task?.status));
  const canAssignerResume = readOnly ? false : (task && currentUser && isCreator && task?.assigner_paused);
  const isApproved = task?.status?.toLowerCase() === "approved";

  const { submitting: acknowledging, run: runAcknowledge } = useSubmit();
  const { submitting: pausing, run: runPause } = useSubmit();
  const { submitting: continuing, run: runContinue } = useSubmit();
  const { submitting: deleting, run: runDelete } = useSubmit();
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [assignerPauseModalOpen, setAssignerPauseModalOpen] = useState(false);
  const { submitting: assignerPausing, run: runAssignerPause } = useSubmit();
  const { submitting: assignerResuming, run: runAssignerResume } = useSubmit();

  const { workDisplay, workSeconds, elapsedDisplay, elapsedSeconds, pauseDisplay, pauseSeconds, pauseCount, state: timerState } = useWorkTimer(task?.timer);

  const handleAutoPause = useCallback(async () => {
    if (timerState !== 'running') return;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: "auto_paused", reason_detail: "Auto paused due to inactivity" }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setTask(data.task);
        publish('task:updated', { id: taskId, status: 'paused' });
        publish('data:changed', { type: 'task', action: 'updated' });
      }
    } catch {}
  }, [timerState, taskId]);

  const [idleModalOpen, setIdleModalOpen] = useState(false);
  const idleTimerRef = useRef(null);

  const handleIdle = useCallback(() => {
    if (timerState !== 'running') return;
    setIdleModalOpen(true);
    idleTimerRef.current = setTimeout(() => {
      setIdleModalOpen(false);
      handleAutoPause();
    }, 60000);
  }, [timerState, handleAutoPause]);

  const handleIdleResume = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setIdleModalOpen(false);
  }, []);

  useIdleDetection({
    timeout: 600000,
    onIdle: handleIdle,
    onActivity: handleIdleResume,
  });

  const fetchAccessCredentials = useCallback(async () => {
    if (!task) return;
    setLoadingCredentials(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${task.id}/access-credentials`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load access credentials");
      const data = await res.json();
      setAccessCredentials(data.credentials || []);
    } catch (err) {
      console.error("Fetch access credentials error:", err);
      setAccessCredentials([]);
    } finally {
      setLoadingCredentials(false);
    }
  }, [task]);

  const deleteAccessCredential = async (credentialId) => {
    if (!task) return;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${task.id}/access-credentials/${credentialId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete access credential");
      fetchAccessCredentials();
    } catch (err) {
      console.error("Delete access credential error:", err);
    }
  };

  useEffect(() => {
    if (tab === "access" && task) {
      fetchAccessCredentials();
    }
  }, [tab, task, fetchAccessCredentials]);

  const goToTask = (id) => {
    if (!id) return;
    navigate(rolePath(`tasks/task-details/${id}`), {
      state: { taskIds, from: location.state?.from },
    });
  };
  const assignees = task?.assignees || [];
  const assigner = task?.assigner;
  const project = task?.project;
  const files = task?.files || [];
  const progress = typeof task?.deliverables_progress === "number" ? task.deliverables_progress : 0;

  const handleFileReorder = useCallback((reordered) => {
    if (!task?.id) return;
    const payload = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
    fetch(`${API_URL}/tasks/${task.id}/files/reorder`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ items: payload }),
      _notifHandled: true,
    }).catch((err) => console.error('Task file reorder failed:', err));
    setTask((prev) => prev ? { ...prev, files: reordered } : prev);
  }, [task?.id]);

  useEffect(() => {
    if (!task?.id) return;
    const token = authToken();
    fetch(`${API_URL}/tasks/${task.id}/my-note`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    })
      .then((res) => res.ok ? res.json() : { notes: [] })
      .then((data) => { setNotes(data.notes || []); setNoteInput(""); })
      .catch(() => { });
  }, [task?.id]);

  useEffect(() => {
    if (!task?.id || !task?.unviewed_changes_count) return;
    const token = authToken();
    fetch(`${API_URL}/tasks/${task.id}/changes/mark-read`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      _notifHandled: true,
    }).catch(() => { });
  }, [task?.id, task?.unviewed_changes_count]);

  const saveNote = async () => {
    if (!task?.id || !noteInput.trim()) return;
    setNoteSaving(true);
    const token = authToken();
    try {
      const res = await fetch(`${API_URL}/tasks/${task.id}/my-note`, {
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
    } catch {
      notify.error("Could not save note.");
    }
    setNoteSaving(false);
  };

  const deleteNote = async (noteId) => {
    if (!task?.id) return;
    const token = authToken();
    try {
      const res = await fetch(`${API_URL}/tasks/${task.id}/my-note/${noteId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      }
    } catch {
      notify.error("Could not delete note.");
    }
  };

  const handleSubtaskActionSuccess = (updatedSubtask) => {
    setTask((prev) => {
      if (!prev) return prev;
      const localSubtasks = (prev.deliverables || []).map((d) =>
        d.id === updatedSubtask.id ? { ...d, ...updatedSubtask } : d
      );
      const previousSubtask = (prev.deliverables || []).find((d) => d.id === updatedSubtask.id);
      const wasApproved = previousSubtask?.status === "approved";
      const isApprovedNow = updatedSubtask.status === "approved";
      const wasPending = previousSubtask?.status === "pending";
      const isPendingNow = updatedSubtask.status === "pending";
      const delTotal = prev.total_deliverables ?? localSubtasks.length;
      const delCompleted = Math.max(
        0,
        (prev.completed_deliverables ?? 0) + (isApprovedNow && !wasApproved ? 1 : !isApprovedNow && wasApproved ? -1 : 0)
      );
      const pendingCount = Math.max(
        0,
        (prev.pending_deliverables_count ?? 0) + (isPendingNow && !wasPending ? 1 : !isPendingNow && wasPending ? -1 : 0)
      );
      return {
        ...prev,
        deliverables: localSubtasks,
        total_deliverables: delTotal,
        completed_deliverables: delCompleted,
        pending_deliverables_count: pendingCount,
        can_submit: isAssignee && ["pending", "reopened"].includes(prev.status) && pendingCount === 0,
        deliverables_progress: delTotal > 0 ? Math.round((delCompleted / delTotal) * 100) : 0,
      };
    });
  };

  const handleTaskActionSuccess = (updatedTask) => {
    setTask((prev) => ({ ...prev, ...updatedTask }));
    const statusActions = {
      submitted: "submitted",
      approved: "approved",
      rejected: "rejected",
      reopened: "reopened",
    };
    const action = statusActions[updatedTask?.status] || "updated";
    showSuccessMessage("Task", action);
    publish('task:updated', updatedTask);
    publish('data:changed', { type: 'task', action: 'updated' });
  };

  const handleDeleteTask = async () => {
    setDeleteTaskConfirmOpen(true);
  };

  const confirmDeleteTask = async () => {
    setDeleteTaskConfirmOpen(false);
    await runDelete(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/tasks/${taskId}`, {
          method: "DELETE",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          _notifHandled: true,
        });
        if (res.ok) { publish('task:deleted', { id: taskId }); publish('data:changed', { type: 'task', action: 'deleted' }); showSuccessMessage("Task", "deleted"); setTimeout(() => navigate(rolePath("tasks")), 800); }
        else notify.error("Failed to delete task.");
      } catch { notify.error("Failed to delete task."); }
    });
  };

  const handleAcknowledge = async () => {
    await runAcknowledge(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/tasks/${taskId}/acknowledge`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          _notifHandled: true,
        });
        const data = await res.json();
        if (res.ok) {
          setTask(data.task);
          publish('task:updated', { id: taskId, status: 'in_progress' });
          publish('data:changed', { type: 'task', action: 'updated' });
          showSuccessMessage("Task", "acknowledged");
        } else {
          notify.error(data.message || "Failed to acknowledge task.");
        }
      } catch {
        notify.error("Failed to acknowledge task.");
      }
    });
  };

  const handlePause = async ({ reason, reason_detail }) => {
    await runPause(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/tasks/${taskId}/pause`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ reason, reason_detail }),
          _notifHandled: true,
        });
        const data = await res.json();
        if (res.ok) {
          setTask(data.task);
          publish('task:updated', { id: taskId, status: 'paused' });
          publish('data:changed', { type: 'task', action: 'updated' });
          showSuccessMessage("Task", "paused");
        } else {
          notify.error(data.message || "Failed to pause task.");
        }
      } catch {
        notify.error("Failed to pause task.");
      }
    });
  };

  const handleContinue = async () => {
    await runContinue(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/tasks/${taskId}/continue`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          _notifHandled: true,
        });
        const data = await res.json();
        if (res.ok) {
          setTask(data.task);
          publish('task:updated', { id: taskId, status: 'in_progress' });
          publish('data:changed', { type: 'task', action: 'updated' });
          showSuccessMessage("Task", "resumed");
        } else {
          notify.error(data.message || "Failed to continue task.");
        }
      } catch {
        notify.error("Failed to continue task.");
      }
    });
  };

  const handleAssignerPause = async ({ reason, reason_detail }) => {
    await runAssignerPause(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/tasks/${taskId}/assigner-pause`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ reason: reason_detail || reason }),
          _notifHandled: true,
        });
        const data = await res.json();
        if (res.ok) {
          setTask(data.task);
          publish('task:updated', { id: taskId });
          publish('data:changed', { type: 'task', action: 'updated' });
          showSuccessMessage("Task", "placed on hold");
        } else {
          notify.error(data.message || "Failed to place task on hold.");
        }
      } catch {
        notify.error("Failed to place task on hold.");
      }
    });
  };

  const handleAssignerResume = async () => {
    await runAssignerResume(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/tasks/${taskId}/assigner-resume`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          _notifHandled: true,
        });
        const data = await res.json();
        if (res.ok) {
          setTask(data.task);
          publish('task:updated', { id: taskId });
          publish('data:changed', { type: 'task', action: 'updated' });
          showSuccessMessage("Task", "resumed by assigner");
        } else {
          notify.error(data.message || "Failed to resume task.");
        }
      } catch {
        notify.error("Failed to resume task.");
      }
    });
  };

  const handleStatusChange = async (newStatus) => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
        _notifHandled: true,
      });
      if (res.ok) { publish('task:updated', { id: taskId, status: newStatus }); publish('data:changed', { type: 'task', action: 'updated' }); setTask((p) => p ? { ...p, status: newStatus } : p); showSuccessMessage("Task", "status updated"); }
    } catch { notify.error("Failed to update status."); }
  };

  if (loading) return <DashboardLayout hideRightSidebar><div className="td-loading">Loading task...</div></DashboardLayout>;
  if (!task) return <DashboardLayout hideRightSidebar><div className="td-loading td-error">Task not found.</div></DashboardLayout>;

  return (
    <>
      <DashboardLayout hideRightSidebar>
        <div className="td-page">

          <div className="td-layout">
            {/* ===== LEFT ===== */}
            <div className="td-main">
              <Breadcrumb items={[
                { label: "Tasks", path: rolePath("tasks") },
                ...(source ? [{ label: source.label, path: source.path }] : []),
                { label: task.title },
              ]} />



              <div className="td-title-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  <h1 className="td-title">
                    {task.title}
                  </h1>
                  {task.business_id && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: '#eff6ff', color: '#2563eb', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {task.business_id}
                      <button
                        onClick={() => { navigator.clipboard.writeText(task.business_id); notify.success("Task ID copied!"); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                        title="Copy Task ID"
                      >
                        <Copy size={13} color="#2563eb" />
                      </button>
                    </span>
                  )}
                </div>
                <div className="td-title-actions">
                  <button className="td-nav-btn" onClick={() => goToTask(prevTaskId)} disabled={!prevTaskId}><ChevronLeft size={18} /></button>
                  <button className="td-nav-btn" onClick={() => goToTask(nextTaskId)} disabled={!nextTaskId}><ChevronRight size={18} /></button>
                  {canEdit && (
                    <>
                      <button className="td-btn-outline" onClick={() => setShowEditModal(true)}>
                        <Pencil size={15} strokeWidth={2.5} />
                        Edit
                      </button>
                      <button className="td-btn-danger" onClick={handleDeleteTask} disabled={deleting} style={deleting ? { opacity: 0.6, cursor: "not-allowed" } : {}}>
                        {deleting ? "Deleting..." : "Delete"}
                      </button>
                    </>
                  )}
                  {canAcknowledge && (
                    <button className="td-btn-primary" onClick={handleAcknowledge} disabled={acknowledging || isAssignerLocked} style={acknowledging || isAssignerLocked ? { opacity: 0.6, cursor: "not-allowed" } : {}}>
                      <CheckCircle2 size={15} />
                      {acknowledging ? "Acknowledging..." : "Acknowledge"}
                    </button>
                  )}
                  {canPause && (
                    <button className="td-btn-primary" onClick={() => setPauseModalOpen(true)} disabled={pausing} style={{ backgroundColor: pausing ? "var(--text-muted)" : "var(--color-warning)", borderColor: pausing ? "var(--text-muted)" : "var(--color-warning)", opacity: pausing ? 0.7 : 1, cursor: pausing ? "not-allowed" : "pointer" }}>
                      <Pause size={15} />
                      {pausing ? "Pausing..." : "Pause"}
                    </button>
                  )}
                  {canContinue && (
                    <button className="td-btn-primary" onClick={handleContinue} disabled={continuing} style={continuing ? { opacity: 0.6, cursor: "not-allowed" } : {}}>
                      <Play size={15} />
                      {continuing ? "Resuming..." : "Resume"}
                    </button>
                  )}
                  {canAssignerPause && (
                    <button className="td-btn-primary" onClick={() => setAssignerPauseModalOpen(true)} disabled={assignerPausing} style={{ backgroundColor: assignerPausing ? "var(--text-muted)" : "var(--color-primary)", borderColor: assignerPausing ? "var(--text-muted)" : "var(--color-primary)", opacity: assignerPausing ? 0.7 : 1, cursor: assignerPausing ? "not-allowed" : "pointer" }}>
                      <Lock size={15} />
                      {assignerPausing ? "Pausing..." : "Put On Hold"}
                    </button>
                  )}
                  {canAssignerResume && (
                    <button className="td-btn-primary" onClick={handleAssignerResume} disabled={assignerResuming} style={{ backgroundColor: assignerResuming ? "var(--text-muted)" : "var(--color-success)", borderColor: assignerResuming ? "var(--text-muted)" : "var(--color-success)", opacity: assignerResuming ? 0.7 : 1, cursor: assignerResuming ? "not-allowed" : "pointer" }}>
                      <Play size={15} />
                      {assignerResuming ? "Resuming..." : "Resume"}
                    </button>
                  )}
                  {isAssignerLocked && !isCreator && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", borderRadius: "6px", backgroundColor: "var(--color-warning-bg)", color: "var(--color-warning)", fontSize: "13px", fontWeight: 600, border: "1px solid var(--color-warning)" }}>
                      <Lock size={14} />
                      On Hold by Assigner
                    </span>
                  )}
                  {!readOnly && isAssignee && ["in_progress", "reopened", "paused"].includes(task?.status) && (
                    <button
                      className="td-btn-primary"
                      disabled={task?.status === "paused" || isAssignerLocked}
                      title={isAssignerLocked ? "Task is on hold by the assigner" : task?.status === "paused" ? "Continue the task first to submit" : ""}
                      onClick={() => !isAssignerLocked && setTaskSubmitModalOpen(true)}
                      style={task?.status === "paused" || isAssignerLocked ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                    >
                      <LuSend size={15} />
                      {task.status === "reopened" ? "Resubmit Task" : "Submit Task"}
                    </button>
                  )}
                </div>
              </div>

              <div className="td-badges">
                <span className="td-badge" style={{ background: statusBgColor(task.status), color: statusColor(task.status) }}>
                  <span className="td-badge-dot" style={{ background: statusColor(task.status) }} />
                  {statusLabel(task.status)}
                </span>
                <span className="td-badge" style={{ background: priorityBgColor(task.priority), color: priorityColor(task.priority) }}>
                  <span className="td-badge-dot" style={{ background: priorityColor(task.priority) }} />
                  {task.priority} Priority
                </span>
                {task?.assigner_paused && (
                  <span className="td-badge" style={{ background: "var(--color-warning-bg)", color: "var(--color-warning)" }}>
                    <Lock size={12} />
                    On Hold by Assigner
                  </span>
                )}
              </div>

              {/* STATS */}
              <div className="td-stats">
                <div className="td-stat td-stat--progress">
                  <span className="td-stat-label">Overall Progress</span>
                  <div className="td-progress"><span style={{ width: `${progress}%` }} /></div>
                  <span className="td-stat-big">{progress}%</span>
                </div>
                <div className="td-stat td-stat--trio">
                  <div className="td-trio-item">
                    <div className="td-stat-ic td-stat-ic--orange"><FolderOpen size={18} /></div>
                    <div>
                      <span className="td-stat-big">{files.length}</span>
                      <span className="td-stat-label">Attachments</span>
                    </div>
                  </div>
                  <div className="td-trio-item">
                    <div className="td-stat-ic td-stat-ic--green"><Calendar size={18} /></div>
                    <div>
                      <span className="td-stat-big td-stat-big--sm">{formatDateTimeShort(task.end_date)}</span>
                      <span className="td-stat-label">Deadline</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Task Submission Workflow */}
              {!readOnly && (isAssignee || isCreator) && (
                <TaskSubmissionPanel
                  task={task}
                  isCreator={isCreator}
                  isAssignee={isAssignee}
                  onTaskUpdate={handleTaskActionSuccess}
                  onSubmitClick={() => setTaskSubmitModalOpen(true)}
                  confirmDialog={taskConfirmDialog}
                  setConfirmDialog={setTaskConfirmDialog}
                  reopenDialog={taskReopenDialog}
                  setReopenDialog={setTaskReopenDialog}
                  acting={taskActing}
                  setActing={setTaskActing}
                  hideTimeline
                />
              )}

              {/* TAB CONTENT */}
              <div className="td-content">
                {/* Heading based on source page */}
                <div style={{ marginBottom: "16px", marginTop: "4px", paddingLeft: "4px" }}>
                  <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-heading)", margin: 0 }}>
                    {location.state?.from === "taskby" && "Assigned by You"}
                    {location.state?.from === "tasks" && "Assigned to You"}
                    {location.state?.from === "self-tasks" && "Self Tasks"}
                    {location.state?.from === "all-tasks" && "All Tasks"}
                  </h2>
                </div>
                {/* TABS */}
                <div className="td-tabs">
                  {[
                    { id: "overview", label: "Overview", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg> },
                    { id: "subtasks", label: "Subtasks", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg> },
                    { id: "files", label: "Platform files & links", icon: <FolderOpen size={16} /> },
                    { id: "access", label: "Access", icon: <Shield size={16} /> },
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
                        <h2 className="td-section-title">Task Details</h2>
                        {Array.isArray(task.requirements) && task.requirements.length > 0 && (
                          <div className="pd-files-search" >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                            <input type="text" placeholder="Search by requirement text..." value={overviewSearch} onChange={(e) => setOverviewSearch(e.target.value)} />
                          </div>
                        )}
                      </div>
                      <div className="td-overview-grid">
                        <div className="td-overview-left">
                          <div
                            className="rte-display"
                            dangerouslySetInnerHTML={{
                              __html: task.description || "No description provided for this task.",
                            }}
                          />
                          <div className="td-reqs">
                            <h3>Requirements</h3>
                            {(() => {
                              const allReqs = Array.isArray(task.requirements) ? task.requirements : [];
                              const filteredReqs = overviewSearch ? allReqs.filter((r) => r.toLowerCase().includes(overviewSearch.toLowerCase())) : allReqs;
                              return filteredReqs.length > 0 ? (
                                <ul>
                                  {filteredReqs.map((req, idx) => (
                                    <li key={idx}><CheckCircle2 size={16} /> {req}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>{overviewSearch ? "No requirements match your search." : "No requirements added."}</p>
                              );
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* TASK DISCUSSION - inside overview */}
                      <TaskDiscussion taskId={task.id} readOnly={readOnly} />
                    </div>
                  )}

                  {tab === "subtasks" && (
                    <div>
                      <div className="td-section-header">
                        <h2 className="td-section-title">Subtasks</h2>
                        {!readOnly && isCreator && (
                          <button
                            onClick={() => setShowCreateSubtaskModal(true)}
                            style={{ marginLeft: "auto", marginRight: 12, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}
                          >
                            <Plus size={15} /> Create Subtask
                          </button>
                        )}
                        <div className="pd-files-search" style={{ margin: "0 0 0 auto" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                          <input type="text" placeholder="Search by subtask name or description..." value={subtaskSearch} onChange={(e) => setSubtaskSearch(e.target.value)} />
                        </div>
                        <span className="td-section-count">{task.completed_deliverables || 0}/{task.total_deliverables || 0} Completed</span>
                      </div>
                      {(() => {
                        const allSubtasks = orderedSubtasks.length ? orderedSubtasks : (task.deliverables || []);
                        const subtasksSearch = subtaskSearch ? allSubtasks.filter((d) => {
                          const q = subtaskSearch.toLowerCase();
                          return (d.title || "").toLowerCase().includes(q) || (d.description || "").toLowerCase().includes(q);
                        }) : allSubtasks;
                        return subtasksSearch.length === 0 ? (
                          <p className="td-empty">{subtaskSearch ? "No subtasks match your search." : "No subtasks linked to this task."}</p>
                        ) : (
                          <div className="pd-table-wrap">
                            <div className="deliveries-table-header" style={{ gridTemplateColumns: "32px minmax(150px, 1.6fr) minmax(160px, 1.8fr) minmax(110px, 1.1fr) minmax(90px, 0.9fr) minmax(70px, 0.5fr)" }}>
                              <div></div>
                              <div>Subtask</div>
                              <div>{isCreator ? "Assigned To" : "Assigned By"}</div>
                              <div>Status</div>
                              <div>Start & Due Date</div>
                              <div>Action</div>
                            </div>
                              <SortableTableWrapper
                                items={subtasksSearch}
                              onReorder={handleSubtaskReorder}
                            as="div"
                            handleOnly
                          >
                            {(d, idx, dndProps) => (
                              <div className="deliveries-table-row" style={{ gridTemplateColumns: "32px minmax(150px, 1.6fr) minmax(160px, 1.8fr) minmax(110px, 1.1fr) minmax(90px, 0.9fr) minmax(70px, 0.5fr)" }}>
                                <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} businessId={d.business_id} color="#16a34a" />
                                <div className="user-box">
                                  <div className="avatar" style={{ background: statusBgColor(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status === 'reopened' ? 'pending' : d.status), color: statusColor(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status === 'reopened' ? 'pending' : d.status), width: '42px', height: '42px', fontSize: '14px' }}>
                                    {initials(d.title)}
                                  </div>
                                  <div>
                                    <div className="user-name">{d.title}</div>
                                    {d.description && <div className="user-role">{d.description.length > 40 ? d.description.slice(0, 40) + '...' : d.description}</div>}
                                  </div>
                                </div>
                                <div>
                                  <div className="user-name">{isCreator ? (d.assignee?.name || "—") : (d.creator?.name || "—")}</div>
                                  <div className="user-role">{isCreator ? (d.assignee?.role ? d.assignee.role.replace("_", " ") : "") : (d.creator?.role ? d.creator.role.replace("_", " ") : "")}</div>
                                </div>
                                <div>
                                  <span className="badge" style={{ background: statusBgColor(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status === 'reopened' ? 'pending' : d.status), color: statusColor(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status === 'reopened' ? 'pending' : d.status) }}>
                                    <span className="dot" style={{ background: statusColor(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status === 'reopened' ? 'pending' : d.status) }} />
                                    {statusLabel(d.status)}
                                  </span>
                                </div>
                                <div className="date-box" style={{ whiteSpace: "pre-line" }}>{formatDateTimeShort(d.start_date)}{"\n"}{formatDateTimeShort(d.due_date)}</div>
                                <div className="action-btns">
                                  {!readOnly && (d.status === "pending" || d.status === "rejected" || d.status === "reopened") ? (
                                    <button className="action-icon-btn action-submit" title="Submit" onClick={() => setSubmitModal({ open: true, subtask: d })}>
                                      <LuSend size={16} />
                                    </button>
                                  ) : (
                                    <button className="action-icon-btn action-view" title="View" onClick={() => {
                                      if (isCreator) {
                                        setAssignerModal({ open: true, subtask: d });
                                      } else {
                                        setViewModal({ open: true, subtask: d });
                                      }
                                    }}>
                                      <IoEyeOutline size={16} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </SortableTableWrapper>
                        </div>
                      );
                      })()}
                    </div>
                  )}

                  {tab === "files" && <FileUploadSection entityType="task" entityId={task.id} files={files} onReorder={handleFileReorder} onFilesChange={() => fetchTask(true)} readOnly={readOnly} />}

                  {tab === "access" && (
                    <div className="td-access-section">
                      <div className="td-section-header">
                        <h2 className="td-section-title">Task Access Credentials</h2>
                        <div className="pd-files-search" style={{ margin: "0 0 0 auto" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                          <input type="text" placeholder="Search by credential name, URL, or username..." value={accessSearch} onChange={(e) => setAccessSearch(e.target.value)} />
                        </div>
                        {!readOnly && isCreator && (
                          <button className="td-access-add-btn" onClick={() => setShowAddAccessModal(true)}>
                            <Plus size={16} /> Add Access
                          </button>
                        )}
                      </div>
                      {loadingCredentials ? (
                        <p className="td-muted">Loading credentials...</p>
                      ) : accessCredentials.length === 0 ? (
                        <p className="td-muted">No access credentials added yet. Click "Add Access" to store login details.</p>
                      ) : (
                        <div className="td-credentials-list">
                          {accessCredentials.filter((cred) => {
                            if (!accessSearch) return true;
                            const q = accessSearch.toLowerCase();
                            return (cred.name || "").toLowerCase().includes(q) || (cred.url || "").toLowerCase().includes(q) || (cred.username || "").toLowerCase().includes(q);
                          }).map((cred) => (
                            <CredentialRow
                              key={cred.id}
                              credential={cred}
                              onDelete={!readOnly && isCreator ? () => {
                                setPendingDeleteCredential(cred.id);
                                setDeleteCredentialConfirmOpen(true);
                              } : undefined}
                            />
                          ))}
                          {accessSearch && accessCredentials.filter((cred) => {
                            const q = accessSearch.toLowerCase();
                            return (cred.name || "").toLowerCase().includes(q) || (cred.url || "").toLowerCase().includes(q) || (cred.username || "").toLowerCase().includes(q);
                          }).length === 0 && (
                            <p className="td-muted" style={{ textAlign: "center" }}>No credentials match your search.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

              </div>
            </div>
          </div>
        </div>

        {/* ===== RIGHT SIDEBAR - UPDATED WITH START DATE AND DUE DATE WITH TIME ===== */}
          <aside className="td-sidebar">
            <div className="td-card">
              <h3 className="td-card-title">Task Information</h3>
              <ul className="td-info">
                <li>
                  <span className="td-dot" style={{ background: "var(--color-blue-text)" }} />
                  <div>
                    <span className="td-info-label">Project</span>
                    <span className="td-info-val">
                      {project ? (
                        <Link to={rolePath(`projects/project-details/${project.id}`)} className="td-project-link">
                          {project.title}
                        </Link>
                      ) : "—"}
                    </span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "var(--color-orange-text)" }} />
                  <div>
                    <span className="td-info-label">Created By</span>
                    <span className="td-info-val">{assigner?.name || "—"}</span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "var(--color-primary)" }} />
                  <div>
                    <span className="td-info-label">Assigned To</span>
                    <span className="td-info-val" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {assignees.length > 0 ? assignees.map((a) => (
                        <span key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                          <span>{a.name}</span>
                          {a.pivot?.due_date && (
                            <span style={{ fontSize: "11px", color: "var(--color-danger)", whiteSpace: "nowrap" }}>
                              {formatDateTime(a.pivot.due_date)}
                            </span>
                          )}
                        </span>
                      )) : "—"}
                    </span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "var(--color-success)" }} />
                  <div>
                    <span className="td-info-label">Last Updated</span>
                    <span className="td-info-val">{task.updated_at ? timeAgo(task.updated_at) : "—"}</span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "var(--color-blue-text)" }} />
                  <div>
                    <span className="td-info-label">Start Date</span>
                    <span className="td-info-val">{task.start_date ? formatDateTime(task.start_date) : "—"}</span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "var(--color-danger)" }} />
                  <div>
                    <span className="td-info-label">Due Date</span>
                    <span className="td-info-val">{task.end_date ? formatDateTime(task.end_date) : "—"}</span>
                  </div>
                </li>
              </ul>
            </div>

            {/* TIMELINE HISTORY */}
            {(() => {
              const workflowEvents = task?.workflow_events || task?.workflowEvents || [];
              const historyItems = workflowEvents
                .filter((e) => e.action !== 'field_changed')
                .map((e) => ({
                  id: `evt-${e.id}`,
                  action: e.action,
                  user: e.user,
                  date: e.created_at,
                  comment: e.comment,
                }))
                .reverse();
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
                };
                return map[action] || action;
              };
              if (historyItems.length === 0) return null;
              return (
                <div className="td-card">
                  <h3 className="td-card-title">Timeline History</h3>
                  <ul className="td-history-list">
                    {historyItems.map((item) => (
                      <li key={item.id} className="td-history-item">
                        <div className="td-history-header">
                          <span className={`td-history-badge td-history-badge--${item.action}`}>{actionLabel(item.action)}</span>
                          <span className="td-history-date">{formatDateTime(item.date)}</span>
                        </div>
                        <div className="td-history-meta">
                          by {item.user?.name || "Unknown"}
                        </div>
                        {item.comment && <p className="td-submission-text">{item.comment}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            {/* WORK DURATION */}
            {(timerState !== 'idle' || task?.timer?.work_started_at) && (
              <div className="td-card">
                <h3 className="td-card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Timer size={16} />
                  {timerState === 'completed' ? 'Time Summary' : 'Work Duration'}
                </h3>
                <div className="td-timer-display">
                  <span className={`td-timer-value ${timerState === 'running' ? 'td-timer-running' : ''} ${timerState === 'completed' ? 'td-timer-completed' : ''}`}>
                    {workDisplay}
                  </span>
                  {timerState === 'running' && (
                    <span className="td-timer-pulse" />
                  )}
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
                    <span className="td-timer-metric-value">{task?.timer?.resume_count || 0}</span>
                  </div>
                </div>

                {task?.timer?.work_started_at && (
                  <div className="td-timer-meta">
                    <span>Started: {formatDateTime(task.timer.work_started_at)}</span>
                    {task?.timer?.work_completed_at && (
                      <span>Finished: {formatDateTime(task.timer.work_completed_at)}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* PERFORMANCE DASHBOARD */}
            {task?.status === 'approved' && (
              <div className="td-card">
                <h3 className="td-card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <BarChart3 size={16} />
                  Performance
                </h3>
                <div className="td-timer-metrics">
                  {task.submitted_at && (
                    <div className="td-timer-metric">
                      <span className="td-timer-metric-label">Submitted</span>
                      <span className="td-timer-metric-value">{formatDateTime(task.submitted_at)}</span>
                    </div>
                  )}
                  {task.approved_at && (
                    <div className="td-timer-metric">
                      <span className="td-timer-metric-label">Approved</span>
                      <span className="td-timer-metric-value">{formatDateTime(task.approved_at)}</span>
                    </div>
                  )}
                  {task.end_date && (
                    <div className="td-timer-metric">
                      <span className="td-timer-metric-label">Deadline</span>
                      <span className="td-timer-metric-value">{formatDateTime(task.end_date)}</span>
                    </div>
                  )}
                  {task.approved_at && task.end_date && (
                    <div className="td-timer-metric">
                      <span className="td-timer-metric-label">Result</span>
                      <span className="td-timer-metric-value" style={{                         color: new Date(task.approved_at) <= new Date(task.end_date) ? "var(--color-success)" : "var(--color-danger)" }}>
                        {new Date(task.approved_at) <= new Date(task.end_date) ? "On Time" : "Late"}
                      </span>
                    </div>
                  )}
                  {(() => {
                    const reworkCount = (task?.workflowEvents || []).filter(e => e.action === 'reopened').length;
                    return reworkCount > 0 ? (
                      <div className="td-timer-metric">
                        <span className="td-timer-metric-label">Reworks</span>
                        <span className="td-timer-metric-value">{reworkCount}</span>
                      </div>
                    ) : null;
                  })()}
                  {(() => {
                    const approvalAttempts = (task?.workflowEvents || []).filter(e => e.action === 'submitted').length;
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

            {/* ACTIVITY LOG */}
            <div className={`td-card${taskHasUnread ? " activity-panel--unread" : ""}`}>
              <h3 className="td-card-title">Activity</h3>
              {(() => {
                const events = (task?.workflowEvents || []).map(e => ({
                  id: e.id,
                  type: 'event',
                  action: e.action,
                  comment: e.comment,
                  created_at: e.created_at,
                  sort: new Date(e.created_at).getTime(),
                }));
                const changes = (task?.changes || []).map(c => ({
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
                      <li key={i} className={`td-activity-item${isTaskItemUnread(item) ? " activity-item--unread" : ""}`}>
                        <span className="td-activity-icon">
                          {item.type === 'event' && (
                            <>
                              {item.action === 'created' && '📝'}
                              {item.action === 'submitted' && '📤'}
                              {item.action === 'acknowledged' && '👍'}
                              {item.action === 'paused' && '⏸️'}
                              {item.action === 'continued' && '▶️'}
                              {item.action === 'approved' && '✅'}
                              {item.action === 'rejected' && '❌'}
                              {item.action === 'reopened' && '🔄'}
                              {item.action === 'field_changed' && '✏️'}
                              {item.action === 'timer_started' && '⏱️'}
                              {item.action === 'timer_paused' && '⏸️'}
                              {item.action === 'timer_resumed' && '▶️'}
                              {item.action === 'timer_paused_by_assigner' && '🔒'}
                              {item.action === 'timer_resumed_by_assigner' && '🔓'}
                              {item.action === 'timer_stopped' && '⏹️'}
                              {item.action === 'assigner_paused' && '🔒'}
                              {item.action === 'assigner_resumed' && '🔓'}
                              {!['created','submitted','acknowledged','paused','continued','approved','rejected','reopened','field_changed','timer_started','timer_paused','timer_resumed','timer_paused_by_assigner','timer_resumed_by_assigner','timer_stopped','assigner_paused','assigner_resumed'].includes(item.action) && '📌'}
                            </>
                          )}
                          {item.type === 'change' && '✏️'}
                        </span>
                        <div className="td-activity-body">
                          <span className="td-activity-text">
                            {item.type === 'event'
                              ? (item.comment || item.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))
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
                {noteSaving ? "Saving…" : "Add Note"}
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

        {showEditModal && (
          <EditTaskModal
            task={task}
            onClose={(refresh) => { setShowEditModal(false); if (refresh) fetchTask(false); }}
          />
        )}

      </DashboardLayout>

      <SubmitDeliverableModal
        key={`td-submit-${submitModal.subtask?.id || "none"}`}
        isOpen={submitModal.open}
        onClose={() => setSubmitModal({ open: false, subtask: null })}
        subtask={submitModal.subtask}
        onSubmitSuccess={handleSubtaskActionSuccess}
      />

      <ViewDeliverableModal
        key={`td-view-${viewModal.subtask?.id || "none"}`}
        isOpen={viewModal.open}
        onClose={() => setViewModal({ open: false, subtask: null })}
        subtask={viewModal.subtask}
        onSubmitSuccess={handleSubtaskActionSuccess}
      />

      <AssignerViewModal
        key={`td-assigner-${assignerModal.subtask?.id || "none"}`}
        isOpen={assignerModal.open}
        onClose={() => setAssignerModal({ open: false, subtask: null })}
        subtask={assignerModal.subtask}
        onActionSuccess={handleSubtaskActionSuccess}
      />

      <SubmitTaskModal
        key={`td-task-submit-${task?.id || "none"}`}
        isOpen={taskSubmitModalOpen}
        onClose={() => setTaskSubmitModalOpen(false)}
        task={task}
        onSubmitSuccess={handleTaskActionSuccess}
      />

      <PauseReasonModal
        isOpen={pauseModalOpen}
        onClose={() => setPauseModalOpen(false)}
        onConfirm={async (data) => { await handlePause(data); setPauseModalOpen(false); }}
      />
      <PauseReasonModal
        isOpen={assignerPauseModalOpen}
        onClose={() => setAssignerPauseModalOpen(false)}
        onConfirm={async (data) => { await handleAssignerPause(data); setAssignerPauseModalOpen(false); }}
        isAssigner
      />

      <ConfirmModal
        isOpen={deleteTaskConfirmOpen}
        onClose={() => setDeleteTaskConfirmOpen(false)}
        onConfirm={confirmDeleteTask}
        title="Confirm Deletion"
        message="Are you sure you want to delete this task? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger
      />
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

      <AddAccessModal
        isOpen={showAddAccessModal}
        onClose={() => setShowAddAccessModal(false)}
        taskId={task?.id}
        projectName={task?.title || ""}
        onSuccess={fetchAccessCredentials}
        files={task?.files || []}
      />

      <ConfirmModal
        isOpen={deleteCredentialConfirmOpen}
        onClose={() => { setDeleteCredentialConfirmOpen(false); setPendingDeleteCredential(null); }}
        onConfirm={() => {
          deleteAccessCredential(pendingDeleteCredential);
          setDeleteCredentialConfirmOpen(false);
          setPendingDeleteCredential(null);
        }}
        title="Delete Credential"
        message="Are you sure you want to delete this access credential? This action cannot be undone."
        confirmText="Delete"
        danger
      />

      {showCreateSubtaskModal && (
        <CreateDeliverableModel
          projectId={task?.project_id || null}
          taskId={task?.id || null}
          taskTitle={task?.title || null}
          onClose={(refresh) => {
            setShowCreateSubtaskModal(false);
            if (refresh) fetchTask(false);
          }}
        />
      )}

      {idleModalOpen && (
        <div className="cm-overlay" onClick={handleIdleResume}>
          <div className="cm-modal" role="dialog" onClick={e => e.stopPropagation()}>
            <div className="cm-icon" style={{ background: "rgba(245, 158, 11, 0.08)" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h3>No Activity Detected</h3>
            <p style={{ marginBottom: "16px" }}>Are you still working on this task?</p>
            <div className="cm-actions">
              <button className="cm-cancel-btn" onClick={handleAutoPause}>Pause Task</button>
              <button className="cm-confirm-btn" style={{ background: "var(--color-success)" }} onClick={handleIdleResume}>Continue Working</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TaskDetails;