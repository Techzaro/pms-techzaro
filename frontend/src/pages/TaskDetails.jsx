/**
 * TaskDetails page component.
 *
 * Full detail view for a single task.  Shows task metadata (status, priority,
 * assignees, dates), subtasks table (sortable, with submit/view actions),
 * task submission workflow panel, file attachments, a sidebar with task info
 * and a personal notes section.  Supports navigation between tasks via
 * previous/next buttons and tracks which tasks have been viewed.
 */

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage, notify, toast } from "../utils/notify";
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
  RefreshCw,
  RotateCcw,
  Shield,
  Timer,
  Trash2,
  Users,
  X,
  XCircle,
  StickyNote,
  Pin,
  Activity,
} from "lucide-react";
import { usePinnedTasks, togglePinTask, isTaskPinned } from "../utils/pinnedTasks";
import { IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import { renderDynamicDates } from "../utils/tableDateUtils";
import SmartDragHandle from "../components/SmartDragHandle";
import EditTaskModal from "../components/EditTaskModal";
import ConfirmModal from "../components/ConfirmModal";
import PauseReasonModal from "../components/PauseReasonModal";
import SubmitDeliverableModal from "../components/SubmitDeliverableModal";
import ActionPopover from "../components/ActionPopover";
import "../components/ActionPopover.css";
import SubmitTaskModal from "../components/SubmitTaskModal";
import TaskSubmissionPanel from "../components/TaskSubmissionPanel";
import TaskReopenDialog from "../components/TaskReopenDialog";
import TransferTaskDialog from "../components/TransferTaskDialog";
import DelegationChain from "../components/DelegationChain";
import AddAccessModal from "../components/AddAccessModal";
import AddNoteModal from "../components/AddNoteModal";
import TaskDiscussion from "../components/TaskDiscussion";
import UnifiedActivityFeed from "../components/UnifiedActivityFeed";
import AbandonModal from "../components/AbandonModal";
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
import FileUploadSection from "../components/FileUploadSection";
import "../components/layout/ActivityHighlight.css";
import "./TaskDetails.css";
import "./Deliveries.css";

/** Convert an ISO timestamp to a human-friendly "X time ago" string. */
function timeAgo(iso, t) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return t ? t("just now", { defaultValue: "just now" }) : "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hours ago`;
  return `${Math.floor(sec / 86400)} days ago`;
}

/** Map a raw status string to a display-friendly label. */
function statusLabel(status, t) {
  const s = (status || "").toLowerCase();
  const map = {
    pending: "Pending",
    in_progress: "In Progress",
    acknowledged: "In Progress",
    paused: "Paused",
    submitted: "Submitted",
    reopened: "Reopened",
    approved: "Approved",
    rejected: "Declined",
    abandoned: "Abandoned",
  };
  const label = map[s] || status || "Pending";
  return t ? t(label, { defaultValue: label }) : label;
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
  const { t } = useTranslation();
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
            <a href={credential.website_url} target="_blank" rel="noopener noreferrer" className="td-cred-link">{t("Visit", { defaultValue: "Visit" })}</a>
          )}
        </div>
        {onDelete && (
          <button className="td-cred-delete" onClick={onDelete} title={t("Delete credential", { defaultValue: "Delete credential" })}>
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="td-cred-fields">
        <div className="td-cred-field">
          <label>{t("Username / Email", { defaultValue: "Username / Email" })}</label>
          <div className="td-cred-value-row">
            <span className="td-cred-value">{credential.username}</span>
            <button className={`td-cred-copy ${copiedUser ? "td-cred-copied" : ""}`} onClick={copyUsername} title={t("Copy username", { defaultValue: "Copy username" })}>
              {copiedUser ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <div className="td-cred-field">
          <label>{t("Password", { defaultValue: "Password" })}</label>
          <div className="td-cred-value-row">
            <span className="td-cred-value">{"\u2022".repeat(12)}</span>
            <button className={`td-cred-copy ${copied ? "td-cred-copied" : ""}`} onClick={copyPassword} title={t("Copy password", { defaultValue: "Copy password" })}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <span className="td-cred-hint">{copied ? t("Copied!", { defaultValue: "Copied!" }) : t("Click copy to use this password", { defaultValue: "Click copy to use this password" })}</span>
        </div>

        {credential.assigned_users && credential.assigned_users.length > 0 && (
          <div className="td-cred-field">
            <label>{t("Assigned To", { defaultValue: "Assigned To" })}</label>
            <div className="td-cred-assigned">
              {credential.assigned_users.map((u) => (
                <span key={u.id} className="td-cred-badge">{u.name}</span>
              ))}
            </div>
          </div>
        )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h1 className="td-title">
                    {task.title}
                  </h1>
                  {task.business_id && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: '#eff6ff', color: '#2563eb', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {task.business_id}
                      <button
                        onClick={() => { navigator.clipboard.writeText(task.business_id); notify.success(t("Task ID copied!", { defaultValue: "Task ID copied!" })); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                        title={t("Copy Task ID", { defaultValue: "Copy Task ID" })}
                      >
                        <Copy size={13} color="#2563eb" />
                      </button>
                    </span>
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
  const { t } = useTranslation();
  const { taskId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const notify = useNotification();
  const taskIds = location.state?.taskIds || [];
  const sourcePages = {
    tasks: { label: t("Assigned To You", { defaultValue: "Assigned To You" }), path: rolePath("tasks") },
    taskby: { label: t("Assigned By You", { defaultValue: "Assigned By You" }), path: rolePath("taskby") },
    "self-tasks": { label: t("Self Tasks", { defaultValue: "Self Tasks" }), path: rolePath("self-tasks") },
    "all-tasks": { label: t("All Tasks", { defaultValue: "All Tasks" }), path: rolePath("all-tasks") },
  };
  const isDeletingRef = useRef(false);
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteTaskConfirmOpen, setDeleteTaskConfirmOpen] = useState(false);
  const [tab, setTab] = useState("overview");
  const [showCreateSubtaskModal, setShowCreateSubtaskModal] = useState(false);
  const [submitModal, setSubmitModal] = useState({ open: false, subtask: null });
  const [taskSubmitModalOpen, setTaskSubmitModalOpen] = useState(false);
  const [isEditingTaskSubmission, setIsEditingTaskSubmission] = useState(false);
  const [taskConfirmDialog, setTaskConfirmDialog] = useState({ open: false, type: null });
  const [taskReopenDialog, setTaskReopenDialog] = useState(false);
  const [transferDialog, setTransferDialog] = useState(false);
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
  const [noteModal, setNoteModal] = useState({ open: false, itemId: null });
  const [actingSubtaskId, setActingSubtaskId] = useState(null);
  const [deleteSubtaskConfirmOpen, setDeleteSubtaskConfirmOpen] = useState(false);
  const [deleteSubtaskTargetId, setDeleteSubtaskTargetId] = useState(null);

  const [followers, setFollowers] = useState(task?.followers || []);
  const [followerDropdownOpen, setFollowerDropdownOpen] = useState(false);
  const [teamUsers, setTeamUsers] = useState([]);
  const [followerSearch, setFollowerSearch] = useState("");
  const followerDropdownRef = useRef(null);

  const taskChangesForHighlight = (task?.changes || []).map((c) => ({ ...c, id: c.id || 0 }));
  const {
    hasUnread: taskHasUnread,
    isItemUnread: isTaskItemUnread,
    markViewed: markTaskViewed,
  } = useActivityHighlight("task", task?.id, task?.activity_max_id || 0, taskChangesForHighlight);

  const source = sourcePages[location.state?.from] || null;
  const readOnly = location.state?.readOnly === true;

  const fetchTask = useCallback(async (refresh = false) => {
    if (!taskId || isDeletingRef.current) return;

    try {
      setLoading(true);
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
        _notifHandled: true,
      });
      if (res.ok) {
        const data = await res.json();
        setTask(data.task);
        if (data.task?.followers) {
          setFollowers(data.task.followers);
        }
      } else if (res.status === 404) {
        setTask(null);
        if (!isDeletingRef.current) {
          notify.error(t("This task has been deleted.", { defaultValue: "This task has been deleted." }));
          setTimeout(() => navigate(rolePath("tasks")), 1500);
        }
      } else if (res.status === 403) {
        setTask(null);
        if (!isDeletingRef.current) {
          notify.error(t("You don't have permission to view this task.", { defaultValue: "You don't have permission to view this task." }));
          setTimeout(() => navigate(rolePath("tasks")), 1500);
        }
      } else {
        setTask(null);
      }
    } catch (err) {
      console.error("Failed to fetch task", err);
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [taskId, navigate, t, notify]);

  useEffect(() => {
    if (task?.followers) {
      setFollowers(task.followers);
    }
  }, [task?.followers]);

  useEffect(() => {
    const fetchTeamUsers = async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/team-users`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          skipLoader: true,
        });
        if (res.ok) {
          const data = await res.json();
          setTeamUsers(data.users || data.team_users || (Array.isArray(data) ? data : []));
        }
      } catch (err) {
        console.error("Failed to load team users for followers", err);
      }
    };
    fetchTeamUsers();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (followerDropdownRef.current && !followerDropdownRef.current.contains(event.target)) {
        setFollowerDropdownOpen(false);
      }
    };
    if (followerDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [followerDropdownOpen]);

  const handleAddFollower = async (userId) => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/followers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: userId }),
        _notifHandled: true,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.followers) {
          setFollowers(data.followers);
        } else {
          const addedUser = (teamUsers.length ? teamUsers : (task?.project?.team?.members || [])).find((u) => parseInt(u.id, 10) === parseInt(userId, 10));
          if (addedUser) setFollowers((prev) => [...prev, addedUser]);
        }
        toast.success(t("Follower added successfully", { defaultValue: "Follower added successfully" }));
        setFollowerDropdownOpen(false);
      } else {
        toast.error(data.message || t("Failed to add follower.", { defaultValue: "Failed to add follower." }));
      }
    } catch {
      toast.error(t("Failed to add follower.", { defaultValue: "Failed to add follower." }));
    }
  };

  const handleRemoveFollower = async (userId) => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/followers/${userId}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        _notifHandled: true,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.followers) {
          setFollowers(data.followers);
        } else {
          setFollowers((prev) => prev.filter((f) => parseInt(f.id, 10) !== parseInt(userId, 10)));
        }
        toast.success(t("Follower removed successfully", { defaultValue: "Follower removed successfully" }));
      } else {
        toast.error(data.message || t("Failed to remove follower.", { defaultValue: "Failed to remove follower." }));
      }
    } catch {
      toast.error(t("Failed to remove follower.", { defaultValue: "Failed to remove follower." }));
    }
  };

  const availableFollowerUsers = useMemo(() => {
    const assigneeIds = new Set((task?.assignees || []).map((a) => parseInt(a.id, 10)));
    if (task?.assigned_to) assigneeIds.add(parseInt(task.assigned_to, 10));
    const followerIds = new Set((followers || []).map((f) => parseInt(f.id, 10)));

    let sourceList = teamUsers.length > 0 ? teamUsers : (task?.project?.team?.members || []);

    return sourceList.filter((u) => {
      const uId = parseInt(u.id, 10);
      if (assigneeIds.has(uId) || followerIds.has(uId)) return false;
      if (followerSearch.trim()) {
        const query = followerSearch.toLowerCase();
        return (u.name || "").toLowerCase().includes(query) || (u.email || "").toLowerCase().includes(query);
      }
      return true;
    });
  }, [teamUsers, task?.assignees, task?.assigned_to, task?.project?.team?.members, followers, followerSearch]);

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
  const isAdminOrManager = currentUser && ["admin", "manager"].includes(currentUser.role);
  const isSuperAdmin = currentUser && ["admin", "super_admin"].includes(currentUser.role);
  const isCreator = task?.is_creator ?? (task && currentUser && parseInt(task.assigned_by, 10) === parseInt(currentUser.id, 10));
  const isAssignee = task?.is_assignee ?? (task && currentUser && (task.assignees || []).some((a) => parseInt(a.id, 10) === parseInt(currentUser.id, 10)));
  const isFollower = (followers || []).some((f) => parseInt(f.id, 10) === parseInt(currentUser?.id, 10));
  const isOnlyFollower = isFollower && !isAdminOrManager && !isCreator && !isAssignee;
  const taskStatus = (task?.status || "").toLowerCase();
  const isTerminalOrSubmitted = ["submitted", "submitted_late", "approved", "abandoned"].includes(taskStatus);
  const canEdit = (readOnly || isOnlyFollower) ? false : (task?.can_edit ?? (task && currentUser && isCreator && !["approved", "submitted", "submitted_late", "abandoned"].includes(taskStatus)));
  const canDelete = (readOnly || isOnlyFollower) ? false : (task && currentUser && (isCreator || isAdminOrManager));
  const canSubmitTask = !readOnly && !isTerminalOrSubmitted && !isOnlyFollower && task?.can_submit === true;
  const canAcknowledge = (readOnly || isOnlyFollower || task?.submission_stage === "declined") ? false : (task && currentUser && isAssignee && ["pending", "reopened"].includes(task?.status));
  const canPause = (readOnly || isOnlyFollower) ? false : (task && currentUser && (isAssignee || isAdminOrManager) && ["in_progress", "submitted"].includes(task?.status) && !task?.assigner_paused);
  const canContinue = (readOnly || isOnlyFollower) ? false : (task && currentUser && (isAssignee || isAdminOrManager) && task?.status === "paused" && !task?.assigner_paused);
  const isAssignerLocked = !!task?.assigner_paused;
  const canAssignerPause = (readOnly || isOnlyFollower) ? false : (task && currentUser && isCreator && !task?.assigner_paused && ["pending", "in_progress", "reopened", "paused", "submitted"].includes(task?.status));
  const canAssignerResume = (readOnly || isOnlyFollower) ? false : (task && currentUser && isCreator && task?.assigner_paused);
  const isApproved = taskStatus === "approved";
  const isTransferor = task?.is_transferor ?? false;
  const transferorReturnToSelf = task?.transferor_return_to_self ?? true;
  const transferorHasApproved = task?.transferor_has_approved ?? false;
  const hasPendingDelegation = task?.pending_delegation && task.pending_delegation.delegated_to === currentUser?.id;
  const isDelegatee = task?.is_delegatee ?? (task?.current_owner && currentUser && parseInt(task.current_owner, 10) === parseInt(currentUser.id, 10)) ?? false;
  const isCurrentOwner = task?.is_current_owner ?? (task?.current_owner && currentUser && parseInt(task.current_owner, 10) === parseInt(currentUser.id, 10)) ?? isAssignee;
  const canApprove = (readOnly || isOnlyFollower) ? false : (!isAssignee && (isCreator || isSuperAdmin));

  const { submitting: acknowledging, run: runAcknowledge } = useSubmit();
  const { submitting: pausing, run: runPause } = useSubmit();
  const { submitting: continuing, run: runContinue } = useSubmit();
  const { submitting: deleting, run: runDelete } = useSubmit();
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [assignerPauseModalOpen, setAssignerPauseModalOpen] = useState(false);
  const { submitting: assignerPausing, run: runAssignerPause } = useSubmit();
  const { submitting: assignerResuming, run: runAssignerResume } = useSubmit();
  const { submitting: revoking, run: runRevoke } = useSubmit();
  const { submitting: approvingTask, run: runApproveTask } = useSubmit();
  const { submitting: rejectingTask, run: runRejectTask } = useSubmit();
  const { submitting: forwardingTask, run: runForwardTask } = useSubmit();
  const [abandonModalOpen, setAbandonModalOpen] = useState(false);
  const { submitting: abandoningTask, run: runAbandonTask } = useSubmit();
  const [pinnedTasks] = usePinnedTasks();
  const isPinned = isTaskPinned(task?.id);

  const { workDisplay, workSeconds, elapsedDisplay, elapsedSeconds, pauseDisplay, pauseSeconds, pauseCount, state: timerState } = useWorkTimer(task?.timer);

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
  const isTerminalTask = ["completed", "approved", "submitted", "submitted_late", "done"].includes((task?.status || "").toLowerCase());
  const progress = isTerminalTask ? 100 : (typeof task?.deliverables_progress === "number" ? task.deliverables_progress : 0);
  const files = task?.files || [];

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
    const fetchNotes = fetch(`${API_URL}/tasks/${task.id}/my-note`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => res.ok ? res.json() : { notes: [] })
      .then((data) => { setNotes(data.notes || []); setNoteInput(""); })
      .catch(() => { });

    const markRead = task?.unviewed_changes_count
      ? fetch(`${API_URL}/tasks/${task.id}/changes/mark-read`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          skipLoader: true,
          _notifHandled: true,
        }).catch(() => { })
      : Promise.resolve();

    Promise.all([fetchNotes, markRead]);
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
      notify.error(t("Could not save note.", { defaultValue: "Could not save note." }));
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
      notify.error(t("Could not delete note.", { defaultValue: "Could not delete note." }));
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

  const handleSubtaskAcknowledge = async (subtaskId) => {
    setActingSubtaskId(subtaskId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${subtaskId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        const updated = data.deliverable || data.subtask || data;
        handleSubtaskActionSuccess(updated);
        showSuccessMessage("Subtask", "acknowledged");
      } else {
        notify.error(data.message || t("Failed to acknowledge subtask.", { defaultValue: "Failed to acknowledge subtask." }));
      }
    } catch {
      notify.error(t("Failed to acknowledge subtask.", { defaultValue: "Failed to acknowledge subtask." }));
    }
    setActingSubtaskId(null);
  };

  const handleSubtaskPause = async (subtaskId) => {
    setActingSubtaskId(subtaskId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${subtaskId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: "other" }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        const updated = data.deliverable || data.subtask || data;
        handleSubtaskActionSuccess(updated);
        showSuccessMessage("Subtask", "paused");
      } else {
        notify.error(data.message || t("Failed to pause subtask.", { defaultValue: "Failed to pause subtask." }));
      }
    } catch {
      notify.error(t("Failed to pause subtask.", { defaultValue: "Failed to pause subtask." }));
    }
    setActingSubtaskId(null);
  };

  const handleSubtaskResume = async (subtaskId) => {
    setActingSubtaskId(subtaskId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${subtaskId}/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        const updated = data.deliverable || data.subtask || data;
        handleSubtaskActionSuccess(updated);
        showSuccessMessage("Subtask", "resumed");
      } else {
        notify.error(data.message || t("Failed to resume subtask.", { defaultValue: "Failed to resume subtask." }));
      }
    } catch {
      notify.error(t("Failed to resume subtask.", { defaultValue: "Failed to resume subtask." }));
    }
    setActingSubtaskId(null);
  };

  const handleSubtaskApprove = async (subtaskId) => {
    setActingSubtaskId(subtaskId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${subtaskId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        const updated = data.deliverable || data.subtask || data;
        handleSubtaskActionSuccess(updated);
        showSuccessMessage("Subtask", "approved");
      } else {
        notify.error(data.message || t("Failed to approve subtask.", { defaultValue: "Failed to approve subtask." }));
      }
    } catch {
      notify.error(t("Failed to approve subtask.", { defaultValue: "Failed to approve subtask." }));
    }
    setActingSubtaskId(null);
  };

  const handleSubtaskReject = async (subtaskId) => {
    setActingSubtaskId(subtaskId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${subtaskId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        const updated = data.deliverable || data.subtask || data;
        handleSubtaskActionSuccess(updated);
        showSuccessMessage("Subtask", "declined");
      } else {
        notify.error(data.message || t("Failed to decline subtask.", { defaultValue: "Failed to decline subtask." }));
      }
    } catch {
      notify.error(t("Failed to decline subtask.", { defaultValue: "Failed to decline subtask." }));
    }
    setActingSubtaskId(null);
  };

  const handleSubtaskAssignerPause = async (subtaskId) => {
    setActingSubtaskId(subtaskId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${subtaskId}/assigner-pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        const updated = data.deliverable || data.subtask || data;
        handleSubtaskActionSuccess(updated);
        showSuccessMessage("Subtask", "paused");
      } else {
        notify.error(data.message || t("Failed to pause subtask.", { defaultValue: "Failed to pause subtask." }));
      }
    } catch {
      notify.error(t("Failed to pause subtask.", { defaultValue: "Failed to pause subtask." }));
    }
    setActingSubtaskId(null);
  };

  const handleSubtaskAssignerResume = async (subtaskId) => {
    setActingSubtaskId(subtaskId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${subtaskId}/assigner-resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        const updated = data.deliverable || data.subtask || data;
        handleSubtaskActionSuccess(updated);
        showSuccessMessage("Subtask", "resumed");
      } else {
        notify.error(data.message || t("Failed to resume subtask.", { defaultValue: "Failed to resume subtask." }));
      }
    } catch {
      notify.error(t("Failed to resume subtask.", { defaultValue: "Failed to resume subtask." }));
    }
    setActingSubtaskId(null);
  };

  const handleSubtaskDelete = async (subtaskId) => {
    setDeleteSubtaskTargetId(subtaskId);
    setDeleteSubtaskConfirmOpen(true);
  };

  const confirmSubtaskDelete = async () => {
    const subtaskId = deleteSubtaskTargetId;
    setDeleteSubtaskConfirmOpen(false);
    setDeleteSubtaskTargetId(null);
    setActingSubtaskId(subtaskId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${subtaskId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      if (res.ok) {
        setTask((prev) => {
          if (!prev) return prev;
          const newDeliverables = (prev.deliverables || []).filter((d) => d.id !== subtaskId);
          return { ...prev, deliverables: newDeliverables, total_deliverables: newDeliverables.length };
        });
        showSuccessMessage("Subtask", "deleted");
      } else {
        const data = await res.json();
        notify.error(data.message || t("Failed to delete subtask.", { defaultValue: "Failed to delete subtask." }));
      }
    } catch {
      notify.error(t("Failed to delete subtask.", { defaultValue: "Failed to delete subtask." }));
    }
    setActingSubtaskId(null);
  };

  const handleTaskActionSuccess = (updatedTask, options = {}) => {
    setTask((prev) => ({ ...prev, ...(updatedTask || {}) }));
    if (!options.skipToast && updatedTask) {
      const statusActions = {
        submitted: "submitted",
        submitted_late: "submitted",
        approved: "approved",
        rejected: "rejected",
        reopened: "reopened",
      };
      const action = options.isTransfer
        ? "transferred"
        : statusActions[updatedTask?.status] || "updated";
      showSuccessMessage("Task", action);
    }
    if (updatedTask) {
      publish('task:updated', updatedTask);
      publish('data:changed', { type: 'task', action: 'updated' });
    }
    fetchTask(true);
  };

  const handleDeleteTask = async () => {
    setDeleteTaskConfirmOpen(true);
  };

  const confirmDeleteTask = async () => {
    setDeleteTaskConfirmOpen(false);
    isDeletingRef.current = true;
    await runDelete(async () => {
      let res;
      try {
        const token = authToken();
        res = await fetch(`${API_URL}/tasks/${taskId}`, {
          method: "DELETE",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          _notifHandled: true,
        });
      } catch (err) {
        isDeletingRef.current = false;
        toast.error(t("Failed to delete task.", { defaultValue: "Failed to delete task." }));
        return;
      }

      if (res.ok) {
        toast.success(t("Task deleted successfully", { defaultValue: "Task deleted successfully" }));
        try {
          publish('task:deleted', { id: taskId });
          publish('data:changed', { type: 'task', action: 'deleted' });
          navigate(rolePath("tasks"), { replace: true });
        } catch (uiError) {
          // The server deletion succeeded; a navigation/event error is not a delete failure.
          console.error("Post-delete navigation failed", uiError);
        }
      } else {
        isDeletingRef.current = false;
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || t("Failed to delete task.", { defaultValue: "Failed to delete task." }));
      }
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
          notify.error(data.message || t("Failed to acknowledge task.", { defaultValue: "Failed to acknowledge task." }));
        }
      } catch {
        notify.error(t("Failed to acknowledge task.", { defaultValue: "Failed to acknowledge task." }));
      }
    });
  };

  const handleAcceptTransfer = async () => {
    if (!task?.pending_delegation) return;
    setTaskActing(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${task.id}/accept-delegation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify.success(data.message || t("Transfer acknowledged and accepted", { defaultValue: "Transfer acknowledged and accepted" }));
        if (data.task) {
          setTask(data.task);
        } else {
          fetchTask(true);
        }
        publish('task:updated', { id: task.id });
        publish('data:changed', { type: 'task', action: 'updated' });
      } else {
        notify.error(data.message || t("Failed to acknowledge transfer", { defaultValue: "Failed to acknowledge transfer" }));
      }
    } catch (err) {
      console.error("Error acknowledging transfer:", err);
      notify.error(t("Error acknowledging transfer", { defaultValue: "Error acknowledging transfer" }));
    } finally {
      setTaskActing(false);
    }
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
          notify.error(data.message || t("Failed to pause task.", { defaultValue: "Failed to pause task." }));
        }
      } catch {
        notify.error(t("Failed to pause task.", { defaultValue: "Failed to pause task." }));
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
          notify.error(data.message || t("Failed to continue task.", { defaultValue: "Failed to continue task." }));
        }
      } catch {
        notify.error(t("Failed to continue task.", { defaultValue: "Failed to continue task." }));
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
          showSuccessMessage("Task", "paused");
        } else {
          notify.error(data.message || t("Failed to pause task.", { defaultValue: "Failed to pause task." }));
        }
      } catch {
        notify.error(t("Failed to pause task.", { defaultValue: "Failed to pause task." }));
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
          notify.error(data.message || t("Failed to resume task.", { defaultValue: "Failed to resume task." }));
        }
      } catch {
        notify.error(t("Failed to resume task.", { defaultValue: "Failed to resume task." }));
      }
    });
  };

  const handleRevokeDelegation = async () => {
    await runRevoke(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/tasks/${taskId}/revoke-delegation`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ delegation_id: task?.active_outgoing_delegation_id }),
          _notifHandled: true,
        });
        const data = await res.json();
        if (res.ok) {
          setTask(data.task);
          publish('task:updated', { id: taskId });
          publish('data:changed', { type: 'task', action: 'updated' });
          showSuccessMessage("Delegation", "revoked");
        } else {
          notify.error(data.message || t("Failed to revoke delegation.", { defaultValue: "Failed to revoke delegation." }));
        }
      } catch {
        notify.error(t("Failed to revoke delegation.", { defaultValue: "Failed to revoke delegation." }));
      }
    });
  };

  const handleTaskApprove = async () => {
    await runApproveTask(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/tasks/${taskId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          _notifHandled: true,
        });
        const data = await res.json();
        if (res.ok) {
          setTask(data.task);
          publish('task:updated', { id: taskId, status: 'approved' });
          publish('data:changed', { type: 'task', action: 'updated' });
          showSuccessMessage("Task", "approved");
        } else {
          notify.error(data.message || t("Failed to approve task.", { defaultValue: "Failed to approve task." }));
        }
      } catch {
        notify.error(t("Failed to approve task.", { defaultValue: "Failed to approve task." }));
      }
    });
  };

  const handleAbandonTask = async (reason) => {
    await runAbandonTask(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/tasks/${taskId}/abandon`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ reason }),
          _notifHandled: true,
        });
        const data = await res.json();
        if (res.ok) {
          setAbandonModalOpen(false);
          setTask(data.task || { ...task, status: "abandoned" });
          publish('task:updated', { id: taskId, status: 'abandoned' });
          publish('data:changed', { type: 'task', action: 'updated' });
          showSuccessMessage("Task", "abandoned");
        } else {
          notify.error(data.message || t("Failed to abandon task.", { defaultValue: "Failed to abandon task." }));
        }
      } catch {
        notify.error(t("Failed to abandon task.", { defaultValue: "Failed to abandon task." }));
      }
    });
  };

  const handleTaskReject = async () => {
    await runRejectTask(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/tasks/${taskId}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          _notifHandled: true,
        });
        const data = await res.json();
        if (res.ok) {
          setTask(data.task);
          publish('task:updated', { id: taskId, status: 'rejected' });
          publish('data:changed', { type: 'task', action: 'updated' });
          showSuccessMessage("Task", "declined");
        } else {
          notify.error(data.message || t("Failed to decline task.", { defaultValue: "Failed to decline task." }));
        }
      } catch {
        notify.error(t("Failed to decline task.", { defaultValue: "Failed to decline task." }));
      }
    });
  };

  const handleSubmitToNext = async () => {
    await runForwardTask(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/tasks/${taskId}/submit-to-next`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          _notifHandled: true,
        });
        const data = await res.json();
        if (res.ok) {
          setTask(data.task || data);
          publish('task:updated', { id: taskId });
          publish('data:changed', { type: 'task', action: 'updated' });
          showSuccessMessage("Task", "submitted to next reviewer");
        } else {
          notify.error(data.message || "Failed to submit to next reviewer.");
        }
      } catch {
        notify.error("Failed to submit to next reviewer.");
      }
    });
  };

  const handleTaskReopen = async () => {
    setTaskReopenDialog(true);
  };

  const handleTaskReopenConfirm = async (reopenData) => {
    try {
      const token = authToken();
      const formData = new FormData();
      formData.append('reopen_reason', reopenData.reopen_reason || 'Other');
      if (reopenData.reopen_reason_detail) formData.append('reopen_reason_detail', reopenData.reopen_reason_detail);
      if (reopenData.instructions) formData.append('instructions', reopenData.instructions);
      if (reopenData.new_deadline) formData.append('new_deadline', reopenData.new_deadline);
      if (reopenData.file) formData.append('file', reopenData.file);

      const res = await fetch(`${API_URL}/tasks/${taskId}/reopen`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        body: formData,
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setTask(data.task || data);
        publish('task:updated', { id: taskId, status: 'reopened' });
        publish('data:changed', { type: 'task', action: 'updated' });
        showSuccessMessage("Task", "reopened for revision");
      } else {
        notify.error(data.message || t("Failed to reopen task.", { defaultValue: "Failed to reopen task." }));
      }
    } catch {
      notify.error(t("Failed to reopen task.", { defaultValue: "Failed to reopen task." }));
    }
    setTaskReopenDialog(false);
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
    } catch { notify.error(t("Failed to update status.", { defaultValue: "Failed to update status." })); }
  };

  if (loading) return <DashboardLayout hideRightSidebar><div className="td-loading">{t("Loading task...", { defaultValue: "Loading task..." })}</div></DashboardLayout>;
  if (!task) return <DashboardLayout hideRightSidebar><div className="td-loading td-error">{t("This task has been deleted. Redirecting...", { defaultValue: "This task has been deleted. Redirecting..." })}</div></DashboardLayout>;

  return (
    <>
      <DashboardLayout hideRightSidebar>
        <div className="td-page">

          <div className="td-layout">
            {/* ===== LEFT ===== */}
            <div className="td-main">
              <Breadcrumb items={[
                { label: t("Tasks", { defaultValue: "Tasks" }), path: rolePath("tasks") },
                ...(source ? [{ label: source.label, path: source.path }] : []),
                { label: task.title },
              ]} />

              <div className="td-title-row">
                <div className="td-title-actions">
                  <button className="td-nav-btn" onClick={() => goToTask(prevTaskId)} disabled={!prevTaskId}><ChevronLeft size={18} /></button>
                  <button className="td-nav-btn" onClick={() => goToTask(nextTaskId)} disabled={!nextTaskId}><ChevronRight size={18} /></button>
                  {canEdit && (
                    <button className="td-btn-outline" onClick={() => setShowEditModal(true)}>
                      <Pencil size={15} strokeWidth={2.5} />
                      {t("Edit", { defaultValue: "Edit" })}
                    </button>
                  )}
                  {canDelete && (
                    <button className="td-btn-danger" onClick={handleDeleteTask} disabled={deleting} style={deleting ? { opacity: 0.6, cursor: "not-allowed" } : {}}>
                      {deleting ? t("Deleting...", { defaultValue: "Deleting..." }) : t("Delete", { defaultValue: "Delete" })}
                    </button>
                  )}
                  {!readOnly && (task?.can_delegate === true || (task?.allow_transfer !== false && (isAssignee || isCurrentOwner) && !isTransferor)) && !["approved", "rejected", "pending", "submitted"].includes(task?.status) && task?.my_status !== "submitted" && !task?.active_outgoing_delegation && !hasPendingDelegation && (
                    <button className="td-btn-outline" onClick={() => setTransferDialog(true)}>
                      <Users size={15} />
                      {t("Transfer", { defaultValue: "Transfer" })}
                    </button>
                  )}
                  {hasPendingDelegation && (
                    <button
                      className="td-btn-primary"
                      onClick={handleAcceptTransfer}
                      disabled={taskActing}
                      style={{ backgroundColor: "var(--color-success)", borderColor: "var(--color-success)" }}
                    >
                      <CheckCircle2 size={15} />
                      {taskActing ? t("Acknowledging...", { defaultValue: "Acknowledging..." }) : t("Acknowledge Transfer", { defaultValue: "Acknowledge Transfer" })}
                    </button>
                  )}
                  {canAcknowledge && !isTransferor && !task?.active_outgoing_delegation && !hasPendingDelegation && (
                    <button className="td-btn-primary" onClick={handleAcknowledge} disabled={acknowledging || isAssignerLocked} style={acknowledging || isAssignerLocked ? { opacity: 0.6, cursor: "not-allowed" } : {}}>
                      <CheckCircle2 size={15} />
                      {acknowledging ? t("Acknowledging...", { defaultValue: "Acknowledging..." }) : t("Acknowledge", { defaultValue: "Acknowledge" })}
                    </button>
                  )}
                  {canPause && (!isTransferor || transferorHasApproved) && !task?.active_outgoing_delegation && (
                    <button className="td-btn-primary" onClick={() => setPauseModalOpen(true)} disabled={pausing} style={{ backgroundColor: pausing ? "var(--text-muted)" : "var(--color-warning)", borderColor: pausing ? "var(--text-muted)" : "var(--color-warning)", opacity: pausing ? 0.7 : 1, cursor: pausing ? "not-allowed" : "pointer" }}>
                      <Pause size={15} />
                      {pausing ? t("Pausing...", { defaultValue: "Pausing..." }) : t("Pause", { defaultValue: "Pause" })}
                    </button>
                  )}
                  {canContinue && (!isTransferor || transferorHasApproved) && !task?.active_outgoing_delegation && !hasPendingDelegation && (
                    <button className="td-btn-primary" onClick={handleContinue} disabled={continuing} style={continuing ? { opacity: 0.6, cursor: "not-allowed" } : {}}>
                      <Play size={15} />
                      {continuing ? t("Resuming...", { defaultValue: "Resuming..." }) : t("Resume", { defaultValue: "Resume" })}
                    </button>
                  )}
                  {canAssignerPause && !isTransferor && !task?.active_outgoing_delegation && (
                    <button className="td-btn-primary" onClick={() => setAssignerPauseModalOpen(true)} disabled={assignerPausing} style={{ backgroundColor: assignerPausing ? "var(--text-muted)" : "var(--color-primary)", borderColor: assignerPausing ? "var(--text-muted)" : "var(--color-primary)", opacity: assignerPausing ? 0.7 : 1, cursor: assignerPausing ? "not-allowed" : "pointer" }}>
                      <Lock size={15} />
                      {assignerPausing ? t("Pausing...", { defaultValue: "Pausing..." }) : t("Pause", { defaultValue: "Pause" })}
                    </button>
                  )}
                  {canAssignerResume && !isTransferor && !task?.active_outgoing_delegation && (
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
                  {canSubmitTask && !task?.active_outgoing_delegation && !hasPendingDelegation && (
                    <button
                      className="td-btn-primary"
                      disabled={task?.status === "paused" || isAssignerLocked}
                      title={isAssignerLocked ? t("Task is paused by the assigner", { defaultValue: "Task is paused by the assigner" }) : task?.status === "paused" ? t("Continue the task first to submit", { defaultValue: "Continue the task first to submit" }) : ""}
                      onClick={() => !isAssignerLocked && setTaskSubmitModalOpen(true)}
                      style={task?.status === "paused" || isAssignerLocked ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                    >
                      <LuSend size={15} />
                      {task.status === "reopened" ? t("Resubmit Task", { defaultValue: "Resubmit Task" }) : t("Submit Task", { defaultValue: "Submit Task" })}
                    </button>
                  )}
                  {task?.can_submit_to_next && (
                    <button
                      className="td-btn-primary"
                      style={{ background: "#2563eb", color: "#ffffff", border: "none", fontWeight: 600, padding: "8px 16px", borderRadius: "8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      disabled={forwardingTask}
                      onClick={handleSubmitToNext}
                    >
                      <LuSend size={15} />
                      {forwardingTask ? "Submitting..." : "Submit"}
                    </button>
                  )}
                  {canApprove && (task?.status === "submitted" || task?.status === "submitted_late" || task?.status === "reopened") && (
                    <button
                      className="td-btn-success"
                      style={{ background: "#16a34a", color: "#ffffff", border: "none", fontWeight: 600, padding: "8px 16px", borderRadius: "8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      disabled={approvingTask}
                      onClick={handleTaskApprove}
                    >
                      <CheckCircle2 size={15} />
                      {approvingTask ? t("Approving...", { defaultValue: "Approving..." }) : t("Approve Task", { defaultValue: "Approve Task" })}
                    </button>
                  )}
                  {(canApprove || task?.can_decline_submission) && (task?.status === "submitted" || task?.status === "submitted_late") && (
                    <button
                      className="td-btn-danger"
                      style={{ background: "#dc2626", color: "#ffffff", border: "none", fontWeight: 600, padding: "8px 16px", borderRadius: "8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      disabled={rejectingTask}
                      onClick={handleTaskReject}
                    >
                      <XCircle size={15} />
                      {rejectingTask ? "Declining..." : "Decline Task"}
                    </button>
                  )}
                  {(canApprove || task?.can_decline_submission) && (task?.status === "submitted" || task?.status === "submitted_late" || task?.status === "approved" || task?.status === "abandoned") && (
                    <button
                      className="td-btn-secondary"
                      style={{ border: "1px solid var(--border-color, #e5e7eb)", fontWeight: 600, padding: "8px 16px", borderRadius: "8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", background: "var(--bg-card, #ffffff)", color: "var(--color-primary, #2563EB)" }}
                      onClick={() => setTaskReopenDialog(true)}
                    >
                      <RotateCcw size={15} />
                      {t("Reopen Task", { defaultValue: "Reopen Task" })}
                    </button>
                  )}
                  {canApprove && task?.status !== "abandoned" && task?.status !== "approved" && (
                    <button
                      className="td-btn-danger"
                      style={{ background: "#dc2626", color: "#ffffff", border: "none", fontWeight: 600, padding: "8px 16px", borderRadius: "8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      onClick={() => setAbandonModalOpen(true)}
                    >
                      <Trash2 size={15} />
                      {t("Abandon Task", { defaultValue: "Abandon Task" })}
                    </button>
                  )}
                  {task && (
                    <button
                      className="td-btn-secondary"
                      onClick={() => togglePinTask(task)}
                      title={isPinned ? t("Unpin from Dashboard", { defaultValue: "Unpin from Dashboard" }) : t("Pin to Dashboard", { defaultValue: "Pin to Dashboard" })}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        background: isPinned ? "#EEF2FF" : "var(--bg-card-alt, #f8fafc)",
                        color: isPinned ? "#4F46E5" : "var(--text-secondary, #475569)",
                        border: `1px solid ${isPinned ? "#6366F1" : "var(--border-color, #cbd5e1)"}`,
                        padding: "8px 14px",
                        borderRadius: "8px",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <Pin size={15} style={{ fill: isPinned ? "currentColor" : "none" }} />
                      {isPinned ? t("Pinned to Dashboard", { defaultValue: "Pinned to Dashboard" }) : t("Pin to Dashboard", { defaultValue: "Pin to Dashboard" })}
                    </button>
                  )}
                  {isTransferor && task?.status === "submitted" && !transferorHasApproved && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", borderRadius: "6px", backgroundColor: "#EFF6FF", color: "#1D4ED8", fontSize: "13px", fontWeight: 600 }}>
                      {t("Transferred", { defaultValue: "Transferred" })}
                    </span>
                  )}
                  {!transferorHasApproved && (isTransferor || task?.active_outgoing_delegation) && !(isTransferor && transferorReturnToSelf && task?.status === "submitted") && (
                    <>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", borderRadius: "6px", backgroundColor: "#EFF6FF", color: "#1D4ED8", fontSize: "13px", fontWeight: 600 }}>
                        {t("Transferred", { defaultValue: "Transferred" })}
                      </span>
                      {task?.can_revoke_delegation && task?.active_outgoing_delegation_id && (
                        <button className="td-btn-danger" onClick={handleRevokeDelegation} disabled={revoking}>
                          <Trash2 size={15} />
                          {revoking ? t("Revoking...", { defaultValue: "Revoking..." }) : t("Revoke", { defaultValue: "Revoke" })}
                        </button>
                      )}
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h1 className="td-title">
                    {task.title}
                  </h1>
                  {task.business_id && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: '#eff6ff', color: '#2563eb', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {task.business_id}
                      <button
                        onClick={() => { navigator.clipboard.writeText(task.business_id); notify.success(t("Task ID copied!", { defaultValue: "Task ID copied!" })); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                        title={t("Copy Task ID", { defaultValue: "Copy Task ID" })}
                      >
                        <Copy size={13} color="#2563eb" />
                      </button>
                    </span>
                  )}
                </div>
              </div>

              <div className="td-badges">
                <span className="td-badge" style={{ background: statusBgColor(task?.display_status || task?.my_status || task?.status), color: statusColor(task?.display_status || task?.my_status || task?.status) }}>
                  <span className="td-badge-dot" style={{ background: statusColor(task?.display_status || task?.my_status || task?.status) }} />
                  {statusLabel(task?.display_status || task?.my_status || task?.status || "Pending", t)}
                </span>
                {Array.isArray(task?.states) && task.states.map((st, idx) => (
                  <span key={idx} className="td-badge" style={{ background: "#EDE9FE", color: "#6D28D9", border: "1px solid #DDD6FE" }}>
                    <span className="td-badge-dot" style={{ background: "#6D28D9" }} />
                    {t(st, { defaultValue: st })}
                  </span>
                ))}
                {task?.priority && (
                  <span className="td-badge" style={{ background: priorityBgColor(task.priority), color: priorityColor(task.priority) }}>
                    <span className="td-badge-dot" style={{ background: priorityColor(task.priority) }} />
                    {t("{{priority}} Priority", { priority: t(task.priority, { defaultValue: task.priority }), defaultValue: `${task.priority} Priority` })}
                  </span>
                )}
                <span className="td-badge" style={{ background: task?.allow_transfer ? "#f0fdf4" : "#fef2f2", color: task?.allow_transfer ? "#16a34a" : "#dc2626" }}>
                  <span className="td-badge-dot" style={{ background: task?.allow_transfer ? "#16a34a" : "#dc2626" }} />
                  {task?.allow_transfer ? t("Transfer Allowed", { defaultValue: "Transfer Allowed" }) : t("Transfer Not Allowed", { defaultValue: "Transfer Not Allowed" })}
                </span>
              </div>

              {/* STATS */}
              <div className="td-stats">
                <div className="td-stat td-stat--progress">
                  <span className="td-stat-label">{t("Overall Progress", { defaultValue: "Overall Progress" })}</span>
                  <div className="td-progress"><span style={{ width: `${progress}%` }} /></div>
                  <span className="td-stat-big">{progress}%</span>
                </div>
                <div className="td-stat td-stat--trio">
                  <div className="td-trio-item">
                    <div className="td-stat-ic td-stat-ic--orange"><FolderOpen size={18} /></div>
                    <div>
                      <span className="td-stat-big">{files.length}</span>
                      <span className="td-stat-label">{t("Attachments", { defaultValue: "Attachments" })}</span>
                    </div>
                  </div>
                  <div className="td-trio-item">
                    <div className="td-stat-ic td-stat-ic--green"><Calendar size={18} /></div>
                    <div>
                      <span className="td-stat-big td-stat-big--sm">{formatDateTimeShort(task.end_date)}</span>
                      <span className="td-stat-label">{t("Deadline", { defaultValue: "Deadline" })}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Task Submission Workflow */}
              {!readOnly && (isAssignee || isCreator || isSuperAdmin) && (
                <TaskSubmissionPanel
                  task={task}
                  isCreator={isCreator}
                  isAssignee={isAssignee}
                  isSuperAdmin={isSuperAdmin}
                  canApprove={canApprove}
                  onTaskUpdate={handleTaskActionSuccess}
                  onSubmitClick={() => { setIsEditingTaskSubmission(false); setTaskSubmitModalOpen(true); }}
                  onEditSubmissionClick={() => { setIsEditingTaskSubmission(true); setTaskSubmitModalOpen(true); }}
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
                    {location.state?.from === "taskby" && t("Assigned by You", { defaultValue: "Assigned by You" })}
                    {location.state?.from === "tasks" && t("Assigned to You", { defaultValue: "Assigned to You" })}
                    {location.state?.from === "self-tasks" && t("Self Tasks", { defaultValue: "Self Tasks" })}
                    {location.state?.from === "all-tasks" && t("All Tasks", { defaultValue: "All Tasks" })}
                  </h2>
                </div>
                {/* TABS */}
                <div className="td-tabs">
                  {[
                    { id: "overview", label: t("Overview", { defaultValue: "Overview" }), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg> },
                    { id: "subtasks", label: t("Subtasks", { defaultValue: "Subtasks" }), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg> },
                    { id: "files", label: t("Platform files & links", { defaultValue: "Platform files & links" }), icon: <FolderOpen size={16} /> },
                    { id: "access", label: t("Access", { defaultValue: "Access" }), icon: <Shield size={16} /> },
                    { id: "activity", label: t("Activity", { defaultValue: "Activity" }), icon: <Activity size={16} /> },
                  ].filter((t) => currentUser?.role !== "guest" || t.id !== "subtasks").map(({ id, label, icon }) => (
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
                        <h2 className="td-section-title">{t("Task Details", { defaultValue: "Task Details" })}</h2>
                        {Array.isArray(task.requirements) && task.requirements.length > 0 && (
                          <div className="pd-files-search" >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                            <input type="text" placeholder={t("Search by requirement text...", { defaultValue: "Search by requirement text..." })} value={overviewSearch} onChange={(e) => setOverviewSearch(e.target.value)} />
                          </div>
                        )}
                      </div>
                      <div className="td-overview-grid">
                        <div className="td-overview-left">
                          <div
                            className="rte-display"
                            dangerouslySetInnerHTML={{
                              __html: task.description || t("No description provided for this task.", { defaultValue: "No description provided for this task." }),
                            }}
                          />
                          <div className="td-reqs">
                            <h3>{t("Requirements", { defaultValue: "Requirements" })}</h3>
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
                                <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>{overviewSearch ? t("No requirements match your search.", { defaultValue: "No requirements match your search." }) : t("No requirements added.", { defaultValue: "No requirements added." })}</p>
                              );
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* TASK DISCUSSION - inside overview */}
                      <TaskDiscussion taskId={task.id} readOnly={readOnly} teamUsers={teamUsers} />
                    </div>
                  )}

                  {tab === "subtasks" && currentUser?.role !== "guest" && (
                    <div>
                      <div className="td-section-header">
                        <h2 className="td-section-title">{t("Subtasks", { defaultValue: "Subtasks" })} <span className="td-section-count">({(() => { const all = orderedSubtasks.length ? orderedSubtasks : (task.deliverables || []); const filtered = subtaskSearch ? all.filter((d) => { const q = subtaskSearch.toLowerCase(); return (d.title || "").toLowerCase().includes(q) || (d.description || "").toLowerCase().includes(q); }) : all; return filtered.length; })()})</span></h2>
                        <div className="pd-files-search" style={{ margin: "0 0 0 auto" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                          <input type="text" placeholder={t("Search subtasks...", { defaultValue: "Search subtasks..." })} value={subtaskSearch} onChange={(e) => setSubtaskSearch(e.target.value)} />
                        </div>
                        {!readOnly && isCreator && (
                          <button
                            onClick={() => setShowCreateSubtaskModal(true)}
                            style={{ marginLeft: 12, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}
                          >
                            <Plus size={15} /> {t("Create Subtask", { defaultValue: "Create Subtask" })}
                          </button>
                        )}
                      </div>
                      {(() => {
                        const allSubtasks = orderedSubtasks.length ? orderedSubtasks : (task.deliverables || []);
                        const subtasksSearch = subtaskSearch ? allSubtasks.filter((d) => {
                          const q = subtaskSearch.toLowerCase();
                          return (d.title || "").toLowerCase().includes(q) || (d.description || "").toLowerCase().includes(q);
                        }) : allSubtasks;
                        return subtasksSearch.length === 0 ? (
                          <p className="td-empty">{subtaskSearch ? t("No subtasks match your search.", { defaultValue: "No subtasks match your search." }) : t("No subtasks linked to this task.", { defaultValue: "No subtasks linked to this task." })}</p>
                        ) : (
                          <div className="pd-table-wrap">
                            <div className="deliveries-table-header" style={{ gridTemplateColumns: "80px 2fr 1.2fr 110px 130px 50px", alignItems: "center" }}>
                              <div>{t("ID", { defaultValue: "ID" })}</div>
                              <div>{t("Subtask", { defaultValue: "Subtask" })}</div>
                              <div>{isCreator ? t("Assigned To", { defaultValue: "Assigned To" }) : t("Assigned By", { defaultValue: "Assigned By" })}</div>
                              <div>{t("Status", { defaultValue: "Status" })}</div>
                              <div>{t("Start & Due Date", { defaultValue: "Start & Due Date" })}</div>
                              <div>{t("Action", { defaultValue: "Action" })}</div>
                            </div>
                              <SortableTableWrapper
                                items={subtasksSearch}
                              onReorder={handleSubtaskReorder}
                            as="div"
                            handleOnly
                          >
                            {(d, idx, dndProps) => {
                              const descText = d.description ? d.description.replace(/<[^>]*>/g, '').trim() : '';
                              return (
                              <div className="deliveries-table-row" style={{ gridTemplateColumns: "80px 2fr 1.2fr 110px 130px 50px", alignItems: "center" }}>
                                <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} id={d.id} businessId={d.business_id} color="#16a34a" />
                                <div className="user-box" style={{ gap: "20px" }}>
                                  <div className="avatar" style={{ background: statusBgColor(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status === 'reopened' ? 'pending' : d.status), color: statusColor(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status === 'reopened' ? 'pending' : d.status), width: '42px', height: '42px', fontSize: '14px', flexShrink: 0 }}>
                                    {initials(d.title)}
                                  </div>
                                  <div style={{ minWidth: 0 }}>
                                    <div className="user-name" style={{ fontSize: 14, fontWeight: 600 }}>{d.title}</div>
                                  </div>
                                </div>
                                <div>
                                  <div className="user-name" style={{ fontSize: 13 }}>{isCreator ? (d.assignee?.name || "—") : (d.creator?.name || "—")}</div>
                                  <div className="user-role" style={{ fontSize: 11, color: "#6b7280" }}>{isCreator ? (d.assignee?.role ? d.assignee.role.replace("_", " ") : "") : (d.creator?.role ? d.creator.role.replace("_", " ") : "")}</div>
                                </div>
                                <div>
                                  <span className="badge" style={{ background: statusBgColor(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status === 'reopened' ? 'pending' : d.status), color: statusColor(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status === 'reopened' ? 'pending' : d.status), fontSize: 12, padding: "4px 10px", borderRadius: 999 }}>
                                    <span className="dot" style={{ background: statusColor(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status === 'reopened' ? 'pending' : d.status) }} />
                                    {statusLabel(d.status, t)}
                                  </span>
                                </div>
                                 <div>
                                   {renderDynamicDates(d, currentUser)}
                                 </div>
                                <div className="action-btns">
                                  <ActionPopover
                                    trigger={
                                      <button className="action-icon-btn action-view action-trigger-lg" title={t("Actions", { defaultValue: "Actions" })}>
                                        <IoEyeOutline size={20} />
                                      </button>
                                    }
                                    onTriggerClick={() => {
                                      const deliverableIds = (orderedSubtasks.length ? orderedSubtasks : (task.deliverables || [])).map((s) => s.id);
                                      const subtaskFrom = isCreator && !isAssignee ? "deliveries-by-you" : isAssignee && !isCreator ? "deliveries" : "self-deliveries";
                                      const isGuest = currentUser?.role === "guest";
                                      navigate(rolePath(`deliveries/deliverable-details/${d.id}`), { state: { from: subtaskFrom, subtaskIds: deliverableIds, readOnly: isGuest } });
                                    }}
                                  >
                                    <button className="action-icon-btn action-note" title={t("Add Note", { defaultValue: "Add Note" })} onClick={() => setNoteModal({ open: true, itemId: d.id })}>
                                      <StickyNote size={14} />
                                    </button>
                                    {isCreator ? (
                                      <>
                                        {d.status?.toLowerCase() !== "approved" && (
                                          <button className="action-icon-btn action-edit" title={t("Edit Subtask", { defaultValue: "Edit Subtask" })}>
                                            <Pencil size={16} />
                                          </button>
                                        )}
                                        <button
                                          className="action-icon-btn action-delete"
                                          title={t("Delete Subtask", { defaultValue: "Delete Subtask" })}
                                          disabled={actingSubtaskId === d.id}
                                          onClick={() => handleSubtaskDelete(d.id)}
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                        {d.status === "submitted" && (
                                          <button className="action-icon-btn action-submit" title={t("Approve", { defaultValue: "Approve" })} disabled={actingSubtaskId === d.id} onClick={() => handleSubtaskApprove(d.id)} style={{ color: "#16A34A" }}>
                                            <CheckCircle2 size={16} />
                                          </button>
                                        )}
                                        {d.status === "submitted" && (
                                          <button className="action-icon-btn action-submit" title={t("Decline", { defaultValue: "Decline" })} disabled={actingSubtaskId === d.id} onClick={() => handleSubtaskReject(d.id)} style={{ color: "#DC2626" }}>
                                            <XCircle size={16} />
                                          </button>
                                        )}
                                        {["pending", "in_progress", "reopened", "paused", "submitted"].includes(d.status) && !d.assigner_paused && (
                                          <button
                                            className="action-icon-btn"
                                            title={t("Pause", { defaultValue: "Pause" })}
                                            disabled={actingSubtaskId === d.id}
                                            onClick={() => handleSubtaskAssignerPause(d.id)}
                                            style={{ color: "#7C3AED", cursor: actingSubtaskId === d.id ? "not-allowed" : "pointer" }}
                                          >
                                            <Lock size={16} />
                                          </button>
                                        )}
                                        {d.assigner_paused && (
                                          <button
                                            className="action-icon-btn"
                                            title={t("Resume", { defaultValue: "Resume" })}
                                            disabled={actingSubtaskId === d.id}
                                            onClick={() => handleSubtaskAssignerResume(d.id)}
                                            style={{ color: "#059669", cursor: actingSubtaskId === d.id ? "not-allowed" : "pointer" }}
                                          >
                                            <Lock size={16} />
                                          </button>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        {d.assigner_paused && (
                                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "#FEF3C7", color: "#92400E", fontSize: "11px", fontWeight: 600, border: "1px solid #F59E0B" }}>
                                            <Lock size={12} />
                                            {t("Paused by Assigner", { defaultValue: "Paused by Assigner" })}
                                          </span>
                                        )}
                                        {!d.assigner_paused && d.status === "pending" && (
                                          <button className="action-icon-btn action-submit" title={t("Acknowledge", { defaultValue: "Acknowledge" })} disabled={actingSubtaskId === d.id} onClick={() => handleSubtaskAcknowledge(d.id)}>
                                            <CheckCircle2 size={16} />
                                          </button>
                                        )}
                                        {!d.assigner_paused && ["in_progress", "submitted"].includes(d.status) && (
                                          <button className="action-icon-btn action-submit" title={t("Pause", { defaultValue: "Pause" })} disabled={actingSubtaskId === d.id} onClick={() => handleSubtaskPause(d.id)} style={{ color: "#D97706" }}>
                                            <Pause size={16} />
                                          </button>
                                        )}
                                        {!d.assigner_paused && d.status === "paused" && (
                                          <button className="action-icon-btn action-submit" title={t("Resume", { defaultValue: "Resume" })} disabled={actingSubtaskId === d.id} onClick={() => handleSubtaskResume(d.id)} style={{ color: "#059669" }}>
                                            <Play size={16} />
                                          </button>
                                        )}
                                        {(d.status === "pending" || d.status === "rejected" || d.status === "reopened") && (
                                          <button
                                            className="action-icon-btn action-submit"
                                            title={task?.status === "paused" ? t("Task is paused. Resume the task first.", { defaultValue: "Task is paused. Resume the task first." }) : task?.assigner_paused ? t("Task is paused by assigner.", { defaultValue: "Task is paused by assigner." }) : t("Submit", { defaultValue: "Submit" })}
                                            disabled={task?.status === "paused" || task?.assigner_paused}
                                            onClick={() => setSubmitModal({ open: true, subtask: d })}
                                            style={task?.status === "paused" || task?.assigner_paused ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                                          >
                                            <LuSend size={16} />
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </ActionPopover>
                                </div>
                              </div>
                            );}}
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
                        <h2 className="td-section-title">{t("Task Access Credentials", { defaultValue: "Task Access Credentials" })}</h2>
                        <div className="pd-files-search" style={{ margin: "0 0 0 auto" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                          <input type="text" placeholder={t("Search by credential name, URL, or username...", { defaultValue: "Search by credential name, URL, or username..." })} value={accessSearch} onChange={(e) => setAccessSearch(e.target.value)} />
                        </div>
                        {!readOnly && isCreator && (
                          <button className="td-access-add-btn" onClick={() => setShowAddAccessModal(true)}>
                            <Plus size={16} /> {t("Add Access", { defaultValue: "Add Access" })}
                          </button>
                        )}
                      </div>
                      {loadingCredentials ? (
                        <p className="td-muted">{t("Loading credentials...", { defaultValue: "Loading credentials..." })}</p>
                      ) : accessCredentials.length === 0 ? (
                        <p className="td-muted">{t('No access credentials added yet. Click "Add Access" to store login details.', { defaultValue: 'No access credentials added yet. Click "Add Access" to store login details.' })}</p>
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
                            <p className="td-muted" style={{ textAlign: "center" }}>{t("No credentials match your search.", { defaultValue: "No credentials match your search." })}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {tab === "activity" && (
                    <div className="td-overview" style={{ padding: "20px" }}>
                      <UnifiedActivityFeed module="task" entityId={task.id} initialUsers={assignees} />
                    </div>
                  )}

              </div>
            </div>
          </div>
        </div>

        {/* ===== RIGHT SIDEBAR - UPDATED WITH START DATE AND DUE DATE WITH TIME ===== */}
          <aside className="td-sidebar">
            {/* DELEGATION CHAIN */}
            <DelegationChain
              task={task}
              delegationChain={task?.delegation_chain || []}
              approvalChain={task?.approval_chain || []}
              onTaskUpdate={fetchTask}
            />

            {/* WORK DURATION */}
            {(timerState !== 'idle' || task?.timer?.work_started_at) && (
              <div className="td-card">
                <h3 className="td-card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Timer size={16} />
                  {timerState === 'completed' ? t('Time Summary', { defaultValue: 'Time Summary' }) : t('Work Duration', { defaultValue: 'Work Duration' })}
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
                    <span className="td-timer-metric-label">{t("Elapsed", { defaultValue: "Elapsed" })}</span>
                    <span className="td-timer-metric-value">{elapsedDisplay}</span>
                  </div>
                  <div className="td-timer-metric">
                    <span className="td-timer-metric-label">{t("Pauses", { defaultValue: "Pauses" })}</span>
                    <span className="td-timer-metric-value">{pauseCount} ({pauseDisplay})</span>
                  </div>
                  <div className="td-timer-metric">
                    <span className="td-timer-metric-label">{t("Resumes", { defaultValue: "Resumes" })}</span>
                    <span className="td-timer-metric-value">{task?.timer?.resume_count || 0}</span>
                  </div>
                </div>

                {task?.timer?.work_started_at && (
                  <div className="td-timer-meta">
                    <span>{t("Started: {{time}}", { time: formatDateTime(task.timer.work_started_at), defaultValue: `Started: ${formatDateTime(task.timer.work_started_at)}` })}</span>
                    {task?.timer?.work_completed_at && (
                      <span>{t("Finished: {{time}}", { time: formatDateTime(task.timer.work_completed_at), defaultValue: `Finished: ${formatDateTime(task.timer.work_completed_at)}` })}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="td-card">
              <h3 className="td-card-title">{t("Task Information", { defaultValue: "Task Information" })}</h3>
              <ul className="td-info">
                <li>
                  <span className="td-dot" style={{ background: "var(--color-blue-text)" }} />
                  <div>
                    <span className="td-info-label">{t("Project", { defaultValue: "Project" })}</span>
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
                    <span className="td-info-label">{t("Created By", { defaultValue: "Created By" })}</span>
                    <span className="td-info-val">{assigner?.name || "—"}</span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "var(--color-primary)" }} />
                  <div>
                    <span className="td-info-label">{t("Assigned To", { defaultValue: "Assigned To" })}</span>
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
                <li style={{ position: "relative" }}>
                  <span className="td-dot" style={{ background: "#8b5cf6" }} />
                  <div style={{ width: "100%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span className="td-info-label">{t("Followers", { defaultValue: "Followers" })}</span>
                      {!readOnly && (isAdminOrManager || isCreator || isAssignee) && (
                        <button
                          type="button"
                          onClick={() => { setFollowerDropdownOpen((prev) => !prev); setFollowerSearch(""); }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--color-primary, #2563eb)",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            padding: "0 2px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "2px",
                          }}
                        >
                          {t("+ Add Follower", { defaultValue: "+ Add Follower" })}
                        </button>
                      )}
                    </div>

                    {followerDropdownOpen && (
                      <div
                        ref={followerDropdownRef}
                        style={{
                          position: "absolute",
                          right: 0,
                          top: "28px",
                          width: "220px",
                          maxHeight: "260px",
                          backgroundColor: "#ffffff",
                          border: "1px solid var(--border-color, #e5e7eb)",
                          borderRadius: "8px",
                          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
                          zIndex: 50,
                          display: "flex",
                          flexDirection: "column",
                          overflow: "hidden",
                        }}
                      >
                        <div style={{ padding: "8px", borderBottom: "1px solid #f3f4f6" }}>
                          <input
                            type="text"
                            placeholder={t("Search users...", { defaultValue: "Search users..." })}
                            value={followerSearch}
                            onChange={(e) => setFollowerSearch(e.target.value)}
                            autoFocus
                            style={{
                              width: "100%",
                              padding: "4px 8px",
                              fontSize: "12px",
                              border: "1px solid #d1d5db",
                              borderRadius: "4px",
                              outline: "none",
                              boxSizing: "border-box",
                            }}
                          />
                        </div>
                        <div style={{ overflowY: "auto", maxHeight: "200px", padding: "4px 0" }}>
                          {availableFollowerUsers.length > 0 ? (
                            availableFollowerUsers.map((u) => (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => handleAddFollower(u.id)}
                                style={{
                                  width: "100%",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  padding: "6px 10px",
                                  border: "none",
                                  background: "transparent",
                                  cursor: "pointer",
                                  textAlign: "left",
                                  fontSize: "12px",
                                  color: "#374151",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f3f4f6")}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                              >
                                <span
                                  style={{
                                    width: "20px",
                                    height: "20px",
                                    borderRadius: "50%",
                                    backgroundColor: "#8b5cf6",
                                    color: "#ffffff",
                                    fontSize: "10px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontWeight: 600,
                                    flexShrink: 0,
                                  }}
                                >
                                  {u.avatar ? (
                                    <img src={fileUrl(u.avatar)} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                                  ) : (
                                    (u.name || "?").charAt(0).toUpperCase()
                                  )}
                                </span>
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {u.name}
                                </span>
                              </button>
                            ))
                          ) : (
                            <div style={{ padding: "8px 12px", fontSize: "12px", color: "#9ca3af", textAlign: "center" }}>
                              {t("No users available", { defaultValue: "No users available" })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                      {followers.length > 0 ? (
                        followers.map((f) => (
                          <span
                            key={f.id}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              backgroundColor: "var(--bg-card-alt, #f3f4f6)",
                              border: "1px solid var(--border-color, #e5e7eb)",
                              borderRadius: "16px",
                              padding: "2px 8px 2px 4px",
                              fontSize: "12px",
                              fontWeight: 500,
                              color: "var(--text-primary, #1f2937)",
                            }}
                          >
                            <span
                              style={{
                                width: "18px",
                                height: "18px",
                                borderRadius: "50%",
                                backgroundColor: "#8b5cf6",
                                color: "#ffffff",
                                fontSize: "10px",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 600,
                                overflow: "hidden",
                                flexShrink: 0,
                              }}
                            >
                              {f.avatar ? (
                                <img src={fileUrl(f.avatar)} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                              ) : (
                                (f.name || "?").charAt(0).toUpperCase()
                              )}
                            </span>
                            <span>{f.name}</span>
                            {!readOnly && (isAdminOrManager || isCreator || isAssignee || parseInt(f.id, 10) === parseInt(currentUser?.id, 10)) && (
                              <button
                                type="button"
                                onClick={() => handleRemoveFollower(f.id)}
                                title={t("Remove follower", { defaultValue: "Remove follower" })}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "var(--text-muted, #9ca3af)",
                                  cursor: "pointer",
                                  fontSize: "14px",
                                  lineHeight: 1,
                                  padding: "0 2px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                }}
                              >
                                &times;
                              </button>
                            )}
                          </span>
                        ))
                      ) : (
                        <span className="td-info-val" style={{ color: "var(--text-muted, #9ca3af)", fontSize: "13px" }}>{t("No followers yet", { defaultValue: "No followers yet" })}</span>
                      )}
                    </div>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "var(--color-success)" }} />
                  <div>
                    <span className="td-info-label">{t("Last Updated", { defaultValue: "Last Updated" })}</span>
                    <span className="td-info-val">{task.updated_at ? timeAgo(task.updated_at, t) : "—"}</span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "var(--color-blue-text)" }} />
                  <div>
                    <span className="td-info-label">{t("Start Date", { defaultValue: "Start Date" })}</span>
                    <span className="td-info-val">{task.start_date ? formatDateTime(task.start_date) : "—"}</span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "var(--color-danger)" }} />
                  <div>
                    <span className="td-info-label">{t("Due Date", { defaultValue: "Due Date" })}</span>
                    <span className="td-info-val">{task.end_date ? formatDateTime(task.end_date) : "—"}</span>
                  </div>
                </li>
              </ul>
            </div>

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

      <SubmitTaskModal
        key={`td-task-submit-${task?.id || "none"}-${isEditingTaskSubmission ? "edit" : "submit"}`}
        isOpen={taskSubmitModalOpen}
        onClose={() => { setTaskSubmitModalOpen(false); setIsEditingTaskSubmission(false); }}
        task={task}
        isEdit={isEditingTaskSubmission}
        existingSubmission={task?.latest_submission || task?.latestSubmission}
        onSubmitSuccess={(updatedTask) => {
          setTaskSubmitModalOpen(false);
          setIsEditingTaskSubmission(false);
          handleTaskActionSuccess(updatedTask, { skipToast: true });
        }}
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
        title={t("Confirm Deletion", { defaultValue: "Confirm Deletion" })}
        message={t("Are you sure you want to delete this task? This action cannot be undone.", { defaultValue: "Are you sure you want to delete this task? This action cannot be undone." })}
        confirmText={t("Delete", { defaultValue: "Delete" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        danger
      />
      <ConfirmModal
        isOpen={deleteSubtaskConfirmOpen}
        onClose={() => { setDeleteSubtaskConfirmOpen(false); setDeleteSubtaskTargetId(null); }}
        onConfirm={confirmSubtaskDelete}
        title={t("Confirm Deletion", { defaultValue: "Confirm Deletion" })}
        message={t("Are you sure you want to delete this subtask? This action cannot be undone.", { defaultValue: "Are you sure you want to delete this subtask? This action cannot be undone." })}
        confirmText={t("Delete", { defaultValue: "Delete" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        danger
      />
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
        title={t("Delete Credential", { defaultValue: "Delete Credential" })}
        message={t("Are you sure you want to delete this access credential? This action cannot be undone.", { defaultValue: "Are you sure you want to delete this access credential? This action cannot be undone." })}
        confirmText={t("Delete", { defaultValue: "Delete" })}
        danger
      />

      <TransferTaskDialog
        isOpen={transferDialog}
        onClose={() => setTransferDialog(false)}
        task={task}
        onTransferSuccess={handleTaskActionSuccess}
      />

      <AbandonModal
        isOpen={abandonModalOpen}
        onClose={() => setAbandonModalOpen(false)}
        title={t("Abandon Task", { defaultValue: "Abandon Task" })}
        subtitle={task?.title}
        actionLabel={t("Abandon Task", { defaultValue: "Abandon Task" })}
        onSubmit={handleAbandonTask}
        loading={abandoningTask}
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

      <AddNoteModal
        isOpen={noteModal.open}
        onClose={() => setNoteModal({ open: false, itemId: null })}
        itemType="deliverable"
        itemId={noteModal.itemId}
        onSaved={() => { setNoteModal({ open: false, itemId: null }); fetchTask(false); }}
      />

      {!readOnly && !(isAssignee || isCreator) && isTransferor && (
        <TaskReopenDialog
          isOpen={taskReopenDialog}
          onClose={() => setTaskReopenDialog(false)}
          task={task}
          onReopenSuccess={handleTaskActionSuccess}
        />
      )}
    </>
  );
}

export default TaskDetails;