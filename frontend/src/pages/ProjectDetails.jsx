/**
 * ProjectDetails page component.
 * Rendered when the user navigates to /projectdetails or related route.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";

import {
  Building2,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Banknote,
  Copy,
  FolderOpen,
  Globe,
  ListChecks,
  Lock,
  Monitor,
  Pause,
  Pencil,
  Play,
  Plus,
  Shield,
  StickyNote,
  Tag,
  Trash2,
  UserRound,
  Users,
  X,
  XCircle,
} from "lucide-react";
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import SmartDragHandle from "../components/SmartDragHandle";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import CreateTaskModal from "../components/CreateTaskModal";
import EditProjectModal from "../components/EditProjectModal";
import SubmitDeliverableModal from "../components/SubmitDeliverableModal";
import ViewDeliverableModal from "../components/ViewDeliverableModal";
import AssignerViewModal from "../components/AssignerViewModal";
import AddProjectFileModal from "../components/AddProjectFileModal";
import AddAccessModal from "../components/AddAccessModal";
import ConfirmModal from "../components/ConfirmModal";
import SubmitTaskModal from "../components/SubmitTaskModal";
import AddNoteModal from "../components/AddNoteModal";
import EditTaskModal from "../components/EditTaskModal";
import PauseReasonModal from "../components/PauseReasonModal";
import ActionPopover from "../components/ActionPopover";
import "../components/ActionPopover.css";
import { formatDateTimeShort, formatDateTime, formatDateTimeInline } from "../utils/formatDateTime";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import { useSubmit } from "../hooks/useSubmit";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage } from "../utils/notify";
import { useActivityHighlight } from "../hooks/useActivityHighlight";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import "../components/layout/ActivityHighlight.css";
import "./ProjectDetails.css";
import "./TaskDetails.css";
import "./Deliveries.css";

import { authToken, rolePath, getUser } from "../utils/auth";
import API_URL from "../config/api";
import { publish } from "../utils/eventBus";
const API = API_URL;
const API_BASE = API_URL.replace(/\/api\/?$/, "");

function fileUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return API_BASE + url;
}

const STATUS_COLORS = {
  pending: "var(--color-warning-bg)",
  in_progress: "var(--color-blue-bg)",
  paused: "var(--color-warning-bg)",
  submitted: "var(--color-blue-bg)",
  reopened: "var(--color-primary-bg)",
  approved: "var(--color-success-bg)",
  rejected: "var(--color-danger-bg)",
};

const STATUS_TEXT_COLORS = {
  pending: "var(--color-warning)",
  in_progress: "var(--color-blue)",
  paused: "var(--color-warning)",
  submitted: "var(--color-blue)",
  reopened: "var(--color-primary)",
  approved: "var(--color-success)",
  rejected: "var(--color-danger)",
};

const PRIORITY_COLORS = {
  High: "var(--color-danger-bg)",
  Medium: "var(--color-warning-bg)",
  Low: "var(--color-success-bg)",
};

const PRIORITY_TEXT_COLORS = {
  High: "var(--color-danger)",
  Medium: "var(--color-warning)",
  Low: "var(--color-success)",
};

function formatStatus(status) {
  const map = {
    pending: "Pending",
    in_progress: "In Progress",
    paused: "Paused",
    submitted: "Submitted",
    reopened: "Reopened",
    approved: "Approved",
    rejected: "Declined",
  };
  return map[status] || status;
}

function formatShortDate(dateString) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusSlug(status) {
  return (status || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
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

function taskStatusLabel(status) {
  const s = (status || "").toLowerCase();
  if (s === "pending") return "Pending";
  if (s === "submitted") return "Submitted";
  if (s === "reopened") return "Reopened";
  if (s === "approved") return "Approved";
  if (s === "rejected") return "Declined";
  if (s === "completed" || s === "done") return "Completed";
  if (s === "in_progress") return "In Progress";
  return status || "Pending";
}

function isCompletedTaskStatus(status) {
  return ["approved", "completed", "done"].includes((status || "").toLowerCase());
}

function calculateProjectProgress(tasks) {
  if (!tasks.length) return 0;
  const completed = tasks.filter((task) => isCompletedTaskStatus(task.status)).length;
  return Math.round((completed / tasks.length) * 100);
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] || "";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase() || a.toUpperCase();
}

function sanitizeHtml(html) {
  return String(html || "").replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
}

function CredentialRow({ credential, onDelete, onEdit, isGuest }) {
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
    <div className="pd-cred-card">
      <div className="pd-cred-header">
        <div className="pd-cred-website">
          <Globe size={18} />
          <span className="pd-cred-name">{credential.website_name}</span>
          {credential.website_url && (
            <a
              href={credential.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="pd-cred-link"
            >
              Visit
            </a>
          )}
        </div>
        <div className="pd-cred-actions">
          {!isGuest && (
            <>
              <button className="pd-cred-edit" onClick={() => onEdit?.(credential)} title="Edit credential">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              </button>
              <button className="pd-cred-delete" onClick={onDelete} title="Delete credential">
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="pd-cred-fields">
        <div className="pd-cred-field">
          <label>Username / Email</label>
          <div className="pd-cred-value-row">
            <span className="pd-cred-value">{credential.username}</span>
            <button className={`pd-cred-copy ${copiedUser ? "pd-cred-copied" : ""}`} onClick={copyUsername} title="Copy username">
              {copiedUser ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <div className="pd-cred-field">
          <label>Password</label>
          <div className="pd-cred-value-row">
            <span className="pd-cred-value pd-cred-password">{"\u2022".repeat(12)}</span>
            <button className={`pd-cred-copy ${copied ? "pd-cred-copied" : ""}`} onClick={copyPassword} title="Copy password">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <span className="pd-cred-hint">{copied ? "Copied!" : "Click copy to use this password"}</span>
        </div>

        <div className="pd-cred-field">
          <label>Assigned To</label>
          <div className="pd-cred-assigned">
            {(credential.assigned_users || []).map((u) => (
              <span key={u.id} className="pd-cred-user-badge">
                {u.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectDetails() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const notify = useNotification();
  const [projectIds, setProjectIds] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('projectIds') || '[]'); } catch { return []; }
  });
  const currentIdx = projectIds.findIndex((id) => String(id) === String(projectId));
  const prevProjectId = currentIdx > 0 ? projectIds[currentIdx - 1] : null;
  const nextProjectId = currentIdx >= 0 && currentIdx < projectIds.length - 1 ? projectIds[currentIdx + 1] : null;

  const goToProject = (id) => {
    if (id) {
      sessionStorage.setItem('projectIds', JSON.stringify(projectIds));
      navigate(rolePath(`projects/project-details/${id}`), { replace: true });
    }
  };

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteProjectConfirmOpen, setDeleteProjectConfirmOpen] = useState(false);
  const [deleteTaskConfirmOpen, setDeleteTaskConfirmOpen] = useState(false);
  const [deleteTaskId, setDeleteTaskId] = useState(null);
  const [submitModal, setSubmitModal] = useState({ open: false, subtask: null });
  const [viewModal, setViewModal] = useState({ open: false, subtask: null });
  const [assignerModal, setAssignerModal] = useState({ open: false, subtask: null });
  const [submitTaskModal, setSubmitTaskModal] = useState({ open: false, task: null });
  const [noteModal, setNoteModal] = useState({ open: false, itemId: null });
  const [editingTask, setEditingTask] = useState(null);
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [pauseModalTaskId, setPauseModalTaskId] = useState(null);
  const [holdingTaskId, setHoldingTaskId] = useState(null);
  const [resumingTaskId, setResumingTaskId] = useState(null);
  const [fileSearch, setFileSearch] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [subtaskSearch, setSubtaskSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [viewAccessSearch, setViewAccessSearch] = useState("");
  const [accessSearch, setAccessSearch] = useState("");
  const [editFileItem, setEditFileItem] = useState(null);
  const [editFileName, setEditFileName] = useState("");
  const [editFileUrl, setEditFileUrl] = useState("");
  const [deleteFileConfirmOpen, setDeleteFileConfirmOpen] = useState(false);
  const [pendingDeleteFile, setPendingDeleteFile] = useState(null);
  const [deleteCredentialConfirmOpen, setDeleteCredentialConfirmOpen] = useState(false);
  const [pendingDeleteCredential, setPendingDeleteCredential] = useState(null);
  const [showAddFileModal, setShowAddFileModal] = useState(false);
  const [orderedTasks, setOrderedTasks] = useState([]);
  const [orderedSubtasks, setOrderedSubtasks] = useState([]);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [visibilityUsers, setVisibilityUsers] = useState([]);
  const [visibilitySelected, setVisibilitySelected] = useState({});
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [visSearch, setVisSearch] = useState("");
  const [showAddAccessModal, setShowAddAccessModal] = useState(false);
  const [editingCredential, setEditingCredential] = useState(null);
  const [accessCredentials, setAccessCredentials] = useState([]);
  const [loadingCredentials, setLoadingCredentials] = useState(false);
  const [editingManager, setEditingManager] = useState(false);
  const [managerUsers, setManagerUsers] = useState([]);
  const [selectedManagerId, setSelectedManagerId] = useState(null);
  const [managerDropdownOpen, setManagerDropdownOpen] = useState(false);
  const managerDropdownRef = useRef(null);
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [mgrSearch, setMgrSearch] = useState("");
  const [savingManager, setSavingManager] = useState(false);
  const [mgrHighlightedIndex, setMgrHighlightedIndex] = useState(0);
  const mgrListRef = useRef(null);

  const memberCount = useMemo(() => {
    if (!project) return 0;
    const ids = new Set();
    if (project.creator?.id) ids.add(project.creator.id);
    (project.members || []).forEach((m) => ids.add(m.id));
    return ids.size;
  }, [project]);

  const authHeadersLocal = () => {
    const token = authToken();
    return { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' };
  };

  useEffect(() => {
    setOrderedTasks(project?.tasks || []);
  }, [project?.tasks]);

  useEffect(() => {
    setOrderedSubtasks(project?.deliverables || []);
  }, [project?.deliverables]);

  useEffect(() => {
    if (tab === "access" && project) {
      fetchAccessCredentials();
    }
  }, [tab, project]);

  useEffect(() => {
    const handleClickOutsideManager = (e) => {
      if (managerDropdownRef.current && !managerDropdownRef.current.contains(e.target)) {
        setManagerDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutsideManager);
    return () => document.removeEventListener("mousedown", handleClickOutsideManager);
  }, []);

  useEffect(() => {
    setMgrHighlightedIndex(0);
  }, [mgrSearch, managerDropdownOpen]);

  useEffect(() => {
    if (mgrListRef.current) {
      const item = mgrListRef.current.children[mgrHighlightedIndex];
      if (item) item.scrollIntoView({ block: "nearest" });
    }
  }, [mgrHighlightedIndex]);

  const handleTaskReorder = useCallback((reordered) => {
    setOrderedTasks(reordered);
    const payload = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
    fetch(`${API}/tasks/reorder`, {
      method: 'POST',
      headers: authHeadersLocal(),
      body: JSON.stringify({ items: payload }),
      _notifHandled: true,
    }).catch(() => { });
  }, []);

  const handleSubtaskReorder = useCallback((reordered) => {
    setOrderedSubtasks(reordered);
    const payload = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
    fetch(`${API}/deliverables/reorder`, {
      method: 'POST',
      headers: authHeadersLocal(),
      body: JSON.stringify({ items: payload }),
      _notifHandled: true,
    }).catch(() => { });
  }, []);

  const handleMemberReorder = useCallback((reordered) => {
    const ids = reordered.map((m) => m.id);
    setProject((prev) => ({ ...prev, members: reordered }));
    fetch(`${API}/projects/${projectId}`, {
      method: 'PATCH',
      headers: authHeadersLocal(),
      body: JSON.stringify({ assigned_users: ids }),
      _notifHandled: true,
    }).catch((err) => console.error('Member reorder failed:', err));
  }, [projectId]);

  const handleFileReorder = useCallback((reordered) => {
    const payload = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
    setProject((prev) => ({ ...prev, files: reordered }));
    fetch(`${API}/projects/${projectId}/files/reorder`, {
      method: 'POST',
      headers: authHeadersLocal(),
      body: JSON.stringify({ items: payload }),
      _notifHandled: true,
    }).catch((err) => console.error('File reorder failed:', err));
  }, [projectId]);

  const handleDeleteFile = useCallback(async () => {
    if (!pendingDeleteFile) return;
    const token = authToken();
    try {
      const res = await fetch(`${API}/projects/${projectId}/files/${pendingDeleteFile.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        _notifHandled: true,
      });
      if (!res.ok) throw new Error("Failed to delete");
      setProject((prev) => ({ ...prev, files: (prev.files || []).filter((f) => f.id !== pendingDeleteFile.id) }));
      showSuccessMessage("File", "deleted");
      publish("data:changed", { type: "project", action: "updated" });
    } catch (err) {
      notify.error(err.message);
    } finally {
      setDeleteFileConfirmOpen(false);
      setPendingDeleteFile(null);
    }
  }, [pendingDeleteFile, projectId, notify]);

  const handleRenameFile = useCallback(async () => {
    if (!editFileItem || !editFileName.trim()) return;
    const token = authToken();
    try {
      const res = await fetch(`${API}/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ existing_file_names: [{ id: editFileItem.id, name: editFileName.trim() }] }),
        _notifHandled: true,
      });
      if (!res.ok) throw new Error("Failed to rename");
      setProject((prev) => ({
        ...prev,
        files: (prev.files || []).map((f) => f.id === editFileItem.id ? { ...f, name: editFileName.trim() } : f),
      }));
      showSuccessMessage("File", "renamed");
      publish("data:changed", { type: "project", action: "updated" });
    } catch (err) {
      notify.error(err.message);
    } finally {
      setEditFileItem(null);
    }
  }, [editFileItem, editFileName, projectId, notify]);

  const handleSubtaskActionSuccess = (updatedSubtask) => {
    setProject((prev) => {
      const updatedSubtasks = (prev.deliverables || []).map((d) =>
        d.id === updatedSubtask.id ? { ...d, ...updatedSubtask } : d
      );
      const delTotal = updatedSubtasks.length;
      const delCompleted = updatedSubtasks.filter((d) => d.status === "approved").length;
      return {
        ...prev,
        deliverables: updatedSubtasks,
        total_deliverables: delTotal,
        completed_deliverables: delCompleted,
      };
    });
    publish('deliverable:updated', updatedSubtask);
    publish('data:changed', { type: 'deliverable', action: 'updated' });
  };

  const [loadError, setLoadError] = useState(null);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const loadErrorRef = useRef(false);

  const loadProject = useCallback(async () => {
    const token = authToken();
    const res = await fetch(`${API}/projects/${projectId}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      _notifHandled: true,
    });
    if (!res.ok) {
      const error = new Error("Failed to load project");
      error.status = res.status;
      throw error;
    }
    const data = await res.json();
    const p = data.project;
    if (!p) throw new Error("Invalid response");
    setProject(p);
    setLoadError(null);
    loadErrorRef.current = false;
    return p;
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    let errored = false;
    (async () => {
      setLoading(true);
      try {
        await loadProject();
      } catch (e) {
        if (!cancelled && !errored) {
          errored = true;
          loadErrorRef.current = true;
          console.error(e);
          if (e.status === 403) {
            setLoadError(403);
            notifyRef.current.error("You don't have access to this project.");
          } else {
            notifyRef.current.error("Unable to load project details.");
          }
          setTimeout(() => {
            if (!cancelled) navigate(rolePath("projects"));
          }, 2000);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProject, navigate]);

  const handleRefresh = useCallback(async () => {
    if (loadErrorRef.current) return;
    try {
      await loadProject();
    } catch (e) {
      loadErrorRef.current = true;
    }
  }, [loadProject]);

  useAutoRefresh(handleRefresh, {
    events: ['task:created', 'task:updated', 'task:deleted', 'project:updated', 'project:deleted', 'deliverable:updated', 'data:changed'],
  });

  useEffect(() => {
    const handler = () => loadProject();
    window.addEventListener('project-file-refresh', handler);
    return () => window.removeEventListener('project-file-refresh', handler);
  }, [loadProject]);

  useEffect(() => {
    if (!project?.id || !project?.unviewed_changes_count) return;
    const token = authToken();
    fetch(`${API}/projects/${project.id}/changes/mark-read`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      _notifHandled: true,
    }).catch(() => { });
  }, [project?.id, project?.unviewed_changes_count]);

  const handleDeleteTask = async (taskId) => {
    setDeleteTaskId(taskId);
    setDeleteTaskConfirmOpen(true);
  };

  const confirmDeleteTask = async () => {
    const taskId = deleteTaskId;
    setDeleteTaskConfirmOpen(false);
    setDeleteTaskId(null);
    try {
      const token = authToken();
      const res = await fetch(`${API}/tasks/${taskId}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        _notifHandled: true,
      });
      if (!res.ok) throw new Error("Failed to delete task");
      await loadProject();
      showSuccessMessage("Task", "deleted");
    } catch (err) {
      console.error(err);
      notify.error("Failed to delete task.");
    }
  };

  const handleTaskAcknowledge = async (taskId) => {
    try {
      const token = authToken();
      const res = await fetch(`${API}/tasks/${taskId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setOrderedTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "in_progress", ...data.task } : t));
        publish('task:updated', { id: taskId, status: 'in_progress' });
        publish('data:changed', { type: 'task', action: 'updated' });
        showSuccessMessage("Task", "acknowledged");
      } else {
        notify.error(data.message || "Failed to acknowledge task.");
      }
    } catch {
      notify.error("Failed to acknowledge task.");
    }
  };

  const handleTaskContinue = async (taskId) => {
    try {
      const token = authToken();
      const res = await fetch(`${API}/tasks/${taskId}/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setOrderedTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "in_progress", ...data.task } : t));
        publish('task:updated', { id: taskId, status: 'in_progress' });
        publish('data:changed', { type: 'task', action: 'updated' });
        showSuccessMessage("Task", "resumed");
      } else {
        notify.error(data.message || "Failed to continue task.");
      }
    } catch {
      notify.error("Failed to continue task.");
    }
  };

  const handleTaskPause = async (taskId) => {
    try {
      const token = authToken();
      const res = await fetch(`${API}/tasks/${taskId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: "other" }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setOrderedTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "paused", ...data.task } : t));
        publish('task:updated', { id: taskId, status: 'paused' });
        publish('data:changed', { type: 'task', action: 'updated' });
        showSuccessMessage("Task", "paused");
      } else {
        notify.error(data.message || "Failed to pause task.");
      }
    } catch {
      notify.error("Failed to pause task.");
    }
  };

  const handleTaskAssignerPause = async (taskId, { reason, reason_detail } = {}) => {
    setHoldingTaskId(taskId);
    try {
      const token = authToken();
      const res = await fetch(`${API}/tasks/${taskId}/assigner-pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: reason_detail || reason }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setOrderedTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, assigner_paused: true, ...data.task } : t));
        showSuccessMessage("Task", "placed on hold");
      } else {
        notify.error(data.message || "Failed to place task on hold.");
      }
    } catch {
      notify.error("Failed to place task on hold.");
    }
    setHoldingTaskId(null);
  };

  const handleTaskAssignerResume = async (taskId) => {
    setResumingTaskId(taskId);
    try {
      const token = authToken();
      const res = await fetch(`${API}/tasks/${taskId}/assigner-resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setOrderedTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, assigner_paused: false, ...data.task } : t));
        showSuccessMessage("Task", "resumed by assigner");
      } else {
        notify.error(data.message || "Failed to resume task.");
      }
    } catch {
      notify.error("Failed to resume task.");
    }
    setResumingTaskId(null);
  };

  const handleDeleteProject = async () => {
    setDeleteProjectConfirmOpen(true);
  };

  const confirmDeleteProject = async () => {
    setDeleteProjectConfirmOpen(false);
    try {
      const token = authToken();
      const res = await fetch(`${API}/projects/${projectId}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        _notifHandled: true,
      });
      if (!res.ok) throw new Error("Delete failed");
      publish('project:deleted', { id: projectId });
      publish('data:changed', { type: 'project', action: 'deleted' });
      showSuccessMessage("Project", "deleted");
      setTimeout(() => navigate(rolePath("projects")), 800);
    } catch (err) {
      console.error(err);
      notify.error("Could not delete project.");
    }
  };

  const {
    hasUnread: projectHasUnread,
    isItemUnread: isProjectItemUnread,
    markViewed: markProjectViewed,
  } = useActivityHighlight("project", project?.id, project?.activity_max_id || 0, project?.all_changes || []);

  const closeVisibility = () => {
    setVisibilityOpen(false);
    setVisibilityUsers([]);
    setVisibilitySelected({});
  };

  const { isDirty: visIsDirty, setIsDirty: setVisIsDirty, handleClose: handleVisClose, ConfirmDialog: VisConfirmDialog } = useConfirmOnClose(closeVisibility);

  const { isDirty: mgrIsDirty, setIsDirty: setMgrIsDirty, handleClose: handleMgrClose, ConfirmDialog:MgrConfirmDialog } = useConfirmOnClose(() => setShowManagerModal(false));

  const { submitting: milestoneToggling, run: runMilestoneToggle } = useSubmit();

  if (loading) {
    return (
      <DashboardLayout hideRightSidebar={true}>
        <div className="pd-loading">Loading project…</div>
      </DashboardLayout>
    );
  }

  if (!project) {
    return (
      <DashboardLayout hideRightSidebar={true}>
        <div className="pd-loading pd-error">Project not found.</div>
      </DashboardLayout>
    );
  }

  const members = project.members || [];
  const filteredMembers = memberSearch ? members.filter((m) => (m.name || "").toLowerCase().includes(memberSearch.toLowerCase())) : members;
  const milestones = project.milestones || [];
  const files = project.files || [];
  const tasks = orderedTasks.length ? orderedTasks : (project.tasks || []);
  const filteredTasks = taskSearch ? tasks.filter((t) => {
    const q = taskSearch.toLowerCase();
    const titleMatch = (t.title || "").toLowerCase().includes(q);
    const assigneeMatch = (t.assignees || []).some(a => (a.name || "").toLowerCase().includes(q));
    return titleMatch || assigneeMatch;
  }) : tasks;
  const progress = typeof project.progress_percent === "number" ? project.progress_percent : calculateProjectProgress(project.tasks || []);

  const subtasksList = orderedSubtasks.length ? orderedSubtasks : (project.deliverables || []);
  const filteredSubtasks = subtaskSearch ? subtasksList.filter((d) => {
    const q = subtaskSearch.toLowerCase();
    const name = d.deliverable_name || d.name || d.title || d.label || d.description || "";
    return name.toLowerCase().includes(q);
  }) : subtasksList;

  const currentUser = getUser();
  const currentUserId = currentUser?.id;

  const getTaskFrom = (task) => {
    if (!currentUserId) return "tasks";
    const isAssignee = (task.assignees || []).some(a => a.id === currentUserId);
    const isAssigner = task.assigner?.id === currentUserId;
    if (isAssigner && !isAssignee) return "taskby";
    if (isAssignee) return "tasks";
    return "tasks";
  };

  const isCreator = project.is_creator;
  const isAssigned = project.is_assigned;
  const isAdminOrManager = project.is_admin_or_manager;

  const canEdit = project.can_edit;

  const handleMilestoneToggle = async (milestone) => {
    await runMilestoneToggle(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/projects/${project.id}/milestones/${milestone.id}/achieve`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          _notifHandled: true,
        });
        const data = await res.json();
        if (res.ok) {
          setProject((prev) => ({
            ...prev,
            milestones: (prev.milestones || []).map((m) => m.id === milestone.id ? data.milestone : m),
          }));
          showSuccessMessage("Milestone", data.message);
          publish('data:changed', { type: 'project', action: 'updated' });
        } else {
          notify.error(data.message || "Failed to update milestone");
        }
      } catch {
        notify.error("Failed to update milestone");
      }
    });
  };

  const openVisibility = async () => {
    setVisibilityOpen(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/projects/${project.id}/visibility`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load visibility");
      const data = await res.json();
      const users = data.users || [];
      setVisibilityUsers(users);
      const selected = {};
      users.forEach((u) => { if (u.is_visible) selected[u.id] = true; });
      setVisibilitySelected(selected);
    } catch {
      setVisibilityUsers([]);
      setVisibilitySelected({});
    }
  };

  const toggleVisibilityUser = (userId) => {
    setVisibilitySelected((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  const saveVisibility = async () => {
    if (!project) return;
    setVisibilitySaving(true);
    try {
      const token = authToken();
      const userIds = Object.keys(visibilitySelected).filter((id) => visibilitySelected[id]).map(Number);
      const res = await fetch(`${API_URL}/projects/${project.id}/visibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_ids: userIds }),
        _notifHandled: true,
      });
      if (!res.ok) throw new Error("Failed to save visibility");
      closeVisibility();
    } catch (err) {
      console.error("Save visibility error:", err);
    } finally {
      setVisibilitySaving(false);
    }
  };

  const fetchAccessCredentials = async () => {
    if (!project) return;
    setLoadingCredentials(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/projects/${project.id}/access-credentials`, {
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
  };

  const deleteAccessCredential = async (credentialId) => {
    if (!project) return;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/projects/${project.id}/access-credentials/${credentialId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete access credential");
      fetchAccessCredentials();
    } catch (err) {
      console.error("Delete access credential error:", err);
    }
  };

  const openManagerEdit = () => {
    setSelectedManagerId(project.creator?.id || null);
    setManagerDropdownOpen(false);
    setShowManagerModal(true);
    const members = project.members || [];
    const creator = project.creator;
    if (creator && !members.find((m) => m.id === creator.id)) {
      setManagerUsers([creator, ...members]);
    } else {
      setManagerUsers(members);
    }
  };

  const handleManagerSelect = (userId) => {
    setSelectedManagerId(userId);
  };

  const saveManagerChange = async () => {
    if (!selectedManagerId || selectedManagerId === project.creator?.id) {
      setShowManagerModal(false);
      return;
    }
    setSavingManager(true);
    try {
      await updateProjectManager(selectedManagerId);
      setShowManagerModal(false);
    } finally {
      setSavingManager(false);
    }
  };

  const updateProjectManager = async (userId) => {
    if (!project) return;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ created_by: userId }),
        _notifHandled: true,
      });
      if (!res.ok) throw new Error("Failed to update project manager");
      setEditingManager(false);
      loadProject();
    } catch (err) {
      console.error("Update manager error:", err);
    }
  };

  const tabs = [
    { id: "overview", label: "Overview", icon: ListChecks },
    { id: "tasks", label: "Tasks", icon: ClipboardList },
    { id: "files", label: "Platform files & links", icon: FolderOpen },
    { id: "access", label: "Accessess", icon: Shield },
    { id: "members", label: "Members", icon: Users },
  ];

  const renderRail = () => (
    <div className="pd-rail">
      <section className="pd-rail-card">
        <h1 className="pd-rail-card__title">Tasks</h1>
        {tasks.length === 0 ? (
          <p className="pd-muted" style={{ margin: 0 }}>
            No tasks yet.
          </p>
        ) : (
          <ul className="pd-rail-tasks">
            {tasks.map((t) => (
              <li key={t.id} className="pd-rail-tasks__row">
                <div className="pd-rail-tasks__name">
                  {t.title}
                </div>
                <div className="pd-rail-tasks__due">
                  {t.end_date ? new Date(t.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ACTIVITY */}
      <section
        className={`pd-rail-card${projectHasUnread ? " activity-panel--unread" : ""}`}
      >
        <h1 className="pd-rail-card__title">Activity</h1>
        {(() => {
          const changes = project?.all_changes || [];
          if (!changes.length) return <p className="pd-muted" style={{ margin: 0 }}>No activity yet.</p>;
          return (
            <ul className="td-activity-list">
              {changes.map((c, i) => (
                <li key={c.id || i} className={`td-activity-item${isProjectItemUnread(c) ? " activity-item--unread" : ""}`}>
                  <span className="td-activity-icon">✏️</span>
                  <div className="td-activity-body">
                    <span className="td-activity-text">
                      {c.field_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} changed
                    </span>
                    <span className="td-activity-time">{formatDateTimeInline(c.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          );
        })()}
      </section>
    </div>
  );

  const overviewInner = (
    <>
      {project.description && (
        <div style={{ marginBottom: 20 }}>
          <h2 className="pd-block-title">Description</h2>
          <div className="pd-desc-tx pd-rich" dangerouslySetInnerHTML={{ __html: sanitizeHtml(project.description) }} />
        </div>
      )}
      <div className="pd-shell-split">
        <div className="pd-shell-left">
          <h2 className="pd-block-title">Project Milestones</h2>
          {milestones.length > 0 ? (
            <ul className="pd-milestones" style={{ marginBottom: 20 }}>
              {milestones.map((m) => (
                <li key={m.id} className="pd-milestones__item" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                    {isAdminOrManager ? (
                      <button
                        onClick={() => handleMilestoneToggle(m)}
                        disabled={milestoneToggling}
                        style={{
                          width: "22px", height: "22px", borderRadius: "50%", border: m.status === "completed" ? "2px solid var(--color-success)" : "2px solid var(--border-color)",
                          background: m.status === "completed" ? "var(--color-success)" : "transparent", cursor: "pointer", display: "flex",
                          alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s",
                        }}
                        title={m.status === "completed" ? "Click to unachieve" : "Click to achieve"}
                      >
                        {m.status === "completed" && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    ) : (
                      <span
                        style={{
                          width: "22px", height: "22px", borderRadius: "50%", border: m.status === "completed" ? "2px solid var(--color-success)" : "2px solid var(--border-color)",
                          background: m.status === "completed" ? "var(--color-success)" : "transparent", display: "flex",
                          alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}
                      >
                        {m.status === "completed" && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                    )}
                    <div>
                      <div className="pd-milestones__title" style={{ textDecoration: "none", color: m.status === "completed" ? "var(--text-secondary)" : "var(--text-primary)" }}>{m.title}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: "12px" }}>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                      Due: {formatDateTimeShort(m.due_date)}
                    </div>
                    {m.status === "completed" && m.completed_at && (
                      <div style={{ fontSize: "12px", color: "var(--color-success)", marginTop: "2px" }}>
                        Achieved: {formatDateTimeShort(m.completed_at)}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pd-muted">No milestones.</p>
          )}

          {(() => {
            if (!project.category) return null;
            let cats = [];
            try {
              const parsed = JSON.parse(project.category);
              if (Array.isArray(parsed)) cats = parsed;
              else cats = [project.category];
            } catch { cats = [project.category]; }
            if (cats.length === 0) return null;
            return (
              <div style={{ marginTop: 20 }}>
                <h2 className="pd-block-title pd-block-title--gap">Category</h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {cats.map((cat, i) => (
                    <span key={i} style={{ display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 13, fontWeight: 500, background: "var(--color-primary-bg)", color: "var(--color-primary)" }}>{cat}</span>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        <aside className="pd-shell-right">
          <h2 className="pd-block-title">Project details</h2>
          <ul className="pd-meta-rows">
            <li className="pd-meta-rows--manager">
              <span className="pd-meta-rows__ic">
                <UserRound size={18} />
              </span>
              <div className="pd-meta-rows__content">
                <div className="pd-meta-rows__header">
                  <span className="pd-meta-rows__label">Project manager</span>
                  {(currentUser?.role === "admin" || currentUser?.role === "manager") && (
                    <button className="pd-manager-edit" onClick={openManagerEdit} title="Change project manager">
                      Edit
                    </button>
                  )}
                </div>
                <span className="pd-meta-rows__value">{project.creator?.name || "—"}</span>
                {project.creator?.department && (
                  <span className="pd-meta-rows__dept">{project.creator.department}</span>
                )}
              </div>
            </li>
            <li>
              <span className="pd-meta-rows__ic">
                <CalendarDays size={18} />
              </span>
              <div>
                <span className="pd-meta-rows__label">Start date</span>
                <span className="pd-meta-rows__value">{formatDateTimeShort(project.start_date)}</span>
              </div>
            </li>
            <li>
              <span className="pd-meta-rows__ic">
                <Tag size={18} />
              </span>
              <div>
                <span className="pd-meta-rows__label">Priority</span>
                <span className="pd-meta-rows__value">
                  <span className={`pd-pill pd-pill--priority-${(project.priority || "medium").toLowerCase()}`}>
                    {project.priority || "—"}
                  </span>
                </span>
              </div>
            </li>
            <li>
              <span className="pd-meta-rows__ic">
                <Building2 size={18} />
              </span>
              <div>
                <span className="pd-meta-rows__label">Client</span>
                <span className="pd-meta-rows__value">{project.client_name || project.website_name || "—"}</span>
              </div>
            </li>
            {isAdminOrManager && (
              <li>
                <span className="pd-meta-rows__ic">
                  <Banknote size={18} />
                </span>
                <div>
                  <span className="pd-meta-rows__label">Budget</span>
                  <span className="pd-meta-rows__value">
                    {project.budget != null && project.budget !== "" ? `PKR ${Number(project.budget).toLocaleString()}` : "—"}
                  </span>
                </div>
              </li>
            )}
          </ul>
        </aside>
      </div>

    </>
  );

  return (
    <>
      <DashboardLayout hideRightSidebar={true}>
        <div className="pd-main-layout">
          <div className="pd-page pd-page--tx">
            <Breadcrumb items={[
              { label: "Projects", path: rolePath("projects") },
              { label: project.title },
            ]} />

            <header className="pd-hero-tx">
              <div className="pd-hero-tx__main">
                <div className="pd-title-row">
                  <div className="pd-title-icon" aria-hidden>
                    <Monitor size={28} strokeWidth={1.75} />
                  </div>
                  <h1 className="pd-title-tx">{project.title}</h1>
                  {project.business_id && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: '#fefce8', color: '#ca8a04', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {project.business_id}
                      <button
                        onClick={() => { navigator.clipboard.writeText(project.business_id); showSuccessMessage("Project ID copied!"); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                        title="Copy Project ID"
                      >
                        <Copy size={13} color="#ca8a04" />
                      </button>
                    </span>
                  )}
                  <div className="pd-hero-actions">
                    <button className="td-nav-btn" onClick={() => goToProject(prevProjectId)} disabled={!prevProjectId} title="Previous project"><ChevronLeft size={18} /></button>
                    <button className="td-nav-btn" onClick={() => goToProject(nextProjectId)} disabled={!nextProjectId} title="Next project"><ChevronRight size={18} /></button>
                    <span className={`pd-pill-status pd-pill-status--${statusSlug(project.status)}`}>{project.status}</span>
                    {isAdminOrManager && (
                      <button type="button" className="pd-btn-tx pd-btn-tx--outline" onClick={openVisibility}>
                        <IoEyeOutline size={16} />
                        Show To
                      </button>
                    )}
                    {canEdit && (
                      <button type="button" className="pd-btn-tx pd-btn-tx--outline" onClick={() => setShowEditModal(true)}>
                        <Pencil size={16} />
                        Edit Project
                      </button>
                    )}
                    {canEdit && (
                      <button type="button" className="pd-btn-tx pd-btn-tx--danger" onClick={handleDeleteProject}>
                        <Trash2 size={16} />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </header>

            <div className="td-stats">
              <div className="td-stat td-stat--progress">
                <span className="td-stat-label">Overall Progress</span>
                <div className="td-progress"><span style={{ width: `${progress}%` }} /></div>
                <span className="td-stat-big">{progress}%</span>
              </div>
              <div className="td-stat td-stat--trio">
                <div className="td-trio-item">
                  <div className="td-stat-ic td-stat-ic--blue"><ClipboardList size={18} /></div>
                  <div>
                    <span className="td-stat-big">{tasks.length}</span>
                    <span className="td-stat-label">Tasks</span>
                  </div>
                </div>
                <div className="td-trio-item">
                  <div className="td-stat-ic td-stat-ic--orange"><Users size={18} /></div>
                  <div>
                    <span className="td-stat-big">{memberCount}</span>
                    <span className="td-stat-label">Members</span>
                  </div>
                </div>
                <div className="td-trio-item">
                  <div className="td-stat-ic td-stat-ic--green"><CalendarDays size={18} /></div>
                  <div>
                    <span className="td-stat-big td-stat-big--sm">{formatDateTimeShort(project.end_date)}</span>
                    <span className="td-stat-label">Deadline</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pd-focus">
              <div className="pd-focus__main">
                <div className="pd-shell">
                  <div className="pd-tabs-tx" role="tablist">
                    {tabs.map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={tab === id}
                        className={`pd-tab-tx ${tab === id ? "pd-tab-tx--on" : ""}`}
                        onClick={() => setTab(id)}
                      >
                        <Icon size={17} strokeWidth={2} />
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="pd-shell-body">
                    {tab === "overview" && <div className="pd-tab-panel">{overviewInner}</div>}

                    {tab === "tasks" && (
                      <div className="pd-tab-panel">
                        <section className="pd-card-flat pd-card-flat--table">
                          <div className="pd-card-flat__head">
                            <h2 className="pd-block-title pd-block-title--inline">Tasks ({tasks.length})</h2>
                            <div className="pd-files-search" style={{ margin: "0 0 0 auto" }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                              <input type="text" placeholder="Search by task name..." value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} />
                            </div>
                            {currentUser?.role !== "guest" && (
                              <button type="button" className="pd-btn-tx pd-btn-tx--primary" onClick={() => setShowTaskModal(true)} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <Plus size={16} /> Add Task
                              </button>
                            )}
                          </div>
                          <div className="pd-table-wrap">
                            <div className="project-task-table">
                              <div className="ptt-header">
                                <div>ID</div>
                                <div>{isCreator || isAdminOrManager ? "Assigned To" : "Assigned By"}</div>
                                <div className="ptt-col-name">Task Name</div>
                                <div>Status</div>
                                <div>Progress</div>
                                <div>Priority</div>
                                <div>Start & Due Date</div>
                                <div>Action</div>
                              </div>
                              {filteredTasks.length === 0 ? (
                                <div className="pd-muted pd-table-empty" style={{ padding: "20px", textAlign: "center" }}>{taskSearch ? "No tasks match your search." : "No tasks yet."}</div>
                              ) : (
                                <SortableTableWrapper items={filteredTasks} onReorder={handleTaskReorder} as="div" handleOnly>
                                  {(t, idx, dndProps) => {
                                    const statusKey = (t.status || "").toLowerCase();
                                      return (
                                        <div className="ptt-row" key={t.id}>
                                          <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} businessId={t.business_id} />
                                          <div>{isCreator || isAdminOrManager ? ((t.assignees || []).map((a) => a.name).join(", ") || "—") : (t.assigner?.name || "—")}</div>
                                        <div className="ptt-col-name">
                                          <Link to={rolePath(`tasks/task-details/${t.id}`)} state={{ from: getTaskFrom(t) }} className="ptt-task-link">
                                            {t.title}
                                          </Link>
                                        </div>
                                        <div>
                                          <span className="badge" style={{ background: STATUS_COLORS[statusKey] || "var(--bg-hover)", color: STATUS_TEXT_COLORS[statusKey] || "var(--text-dark)" }}>
                                            <span className="dot" style={{ background: STATUS_TEXT_COLORS[statusKey] || "var(--text-dark)" }}></span>
                                            {formatStatus(t.status)}
                                          </span>
                                        </div>
                                        <div>
                                          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: "4px" }}>
                                            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-dark)" }}>
                                              {t.deliverables_progress || 0}%
                                            </span>
                                          </div>
                                          <div className="progress-bar-track">
                                            <div className="progress-bar-fill" style={{ width: `${t.deliverables_progress || 0}%` }}></div>
                                          </div>
                                          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                                            {t.approved_deliverables || 0}/{t.total_deliverables || 0} Del. Approved
                                          </div>
                                        </div>
                                        <div>
                                          <span className="badge" style={{ background: PRIORITY_COLORS[t.priority] || "var(--bg-hover)", color: PRIORITY_TEXT_COLORS[t.priority] || "var(--text-dark)" }}>
                                            <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[t.priority] || "var(--text-dark)" }}></span>
                                            {t.priority}
                                          </span>
                                        </div>
                                        <div className="col-due-date">
                                          <div className="date-box">
                                            <div style={{ whiteSpace: "pre-line" }}>
                                              {formatDateTimeInline(t.start_date)}
                                              {"\n"}
                                              {formatDateTimeInline(t.end_date)}
                                            </div>
                                          </div>
                                        </div>
                                        <div>
                                          <div className="action-btns">
                                            <ActionPopover
                                              trigger={
                                                <button className="action-icon-btn action-view action-trigger-lg" title="Actions">
                                                  <IoEyeOutline size={20} />
                                                </button>
                                              }
                                              onTriggerClick={() => navigate(rolePath(`tasks/task-details/${t.id}`), { state: { from: getTaskFrom(t) } })}
                                            >
                                              <button className="action-icon-btn action-note" title="Add Note" onClick={() => setNoteModal({ open: true, itemId: t.id })}>
                                                <StickyNote size={14} />
                                              </button>
                                              {(() => {
                                                const isAssigner = t.assigner?.id && t.assigner.id === currentUserId;
                                                const isAssignee = (t.assignees || []).some((a) => a.id === currentUserId);

                                                if (isAssigner) {
                                                  const buttons = [];
                                                  if (t.status?.toLowerCase() !== "approved") {
                                                    buttons.push(
                                                      <button
                                                        key="edit"
                                                        className="action-icon-btn action-edit"
                                                        title="Edit Task"
                                                        onClick={async () => {
                                                          try {
                                                            const token = authToken();
                                                            const res = await fetch(`${API}/tasks/${t.id}`, {
                                                              headers: { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
                                                            });
                                                            if (res.ok) {
                                                              const data = await res.json();
                                                              setEditingTask(data.task || t);
                                                            } else {
                                                              setEditingTask(t);
                                                            }
                                                          } catch {
                                                            setEditingTask(t);
                                                          }
                                                        }}
                                                      >
                                                        <Pencil size={16} />
                                                      </button>
                                                    );
                                                    buttons.push(
                                                      <button
                                                        key="delete"
                                                        className="action-icon-btn action-delete"
                                                        title="Delete Task"
                                                        onClick={() => handleDeleteTask(t.id)}
                                                      >
                                                        <Trash2 size={16} />
                                                      </button>
                                                    );
                                                  }
                                                  if (t.assigner_paused) {
                                                    buttons.push(
                                                      <button
                                                        key="resume"
                                                        className="action-icon-btn"
                                                        title="Resume"
                                                        disabled={resumingTaskId === t.id}
                                                        onClick={() => handleTaskAssignerResume(t.id)}
                                                        style={{ color: "#059669", cursor: resumingTaskId === t.id ? "not-allowed" : "pointer" }}
                                                      >
                                                        <Lock size={16} />
                                                      </button>
                                                    );
                                                  } else if (["pending", "in_progress", "reopened", "paused"].includes(t.status)) {
                                                    buttons.push(
                                                      <button
                                                        key="hold"
                                                        className="action-icon-btn"
                                                        title="Put On Hold"
                                                        disabled={holdingTaskId === t.id}
                                                        onClick={() => { setPauseModalTaskId(t.id); setPauseModalOpen(true); }}
                                                        style={{ color: "#7C3AED", cursor: holdingTaskId === t.id ? "not-allowed" : "pointer" }}
                                                      >
                                                        <Lock size={16} />
                                                      </button>
                                                    );
                                                  }
                                                  return buttons;
                                                }

                                                if (isAssignee) {
                                                  if (t.assigner_paused) {
                                                    return (
                                                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "#FEF3C7", color: "#92400E", fontSize: "11px", fontWeight: 600, border: "1px solid #F59E0B" }}>
                                                        <Lock size={12} />
                                                        On Hold
                                                      </span>
                                                    );
                                                  }
                                                  if (t.status === "pending") {
                                                    return (
                                                      <button className="action-icon-btn action-submit" title="Acknowledge" onClick={() => handleTaskAcknowledge(t.id)}>
                                                        <CheckCircle2 size={16} />
                                                      </button>
                                                    );
                                                  }
                                                  if (t.status === "paused") {
                                                    return (
                                                      <button className="action-icon-btn action-submit" title="Continue" onClick={() => handleTaskContinue(t.id)} style={{ color: "#059669" }}>
                                                        <Play size={16} />
                                                      </button>
                                                    );
                                                  }
                                                  if (t.status === "in_progress" && !t.assigner_paused) {
                                                    return (
                                                      <button className="action-icon-btn action-submit" title="Pause" onClick={() => handleTaskPause(t.id)} style={{ color: "#D97706" }}>
                                                        <Pause size={16} />
                                                      </button>
                                                    );
                                                  }
                                                  if ((t.status === "in_progress" || t.status === "reopened") && t.assigner_paused === false) {
                                                    return (
                                                      <button
                                                        className="action-icon-btn action-submit"
                                                        title={t.pending_deliverables_count > 0 ? "Submit all subtasks first" : "Submit Task"}
                                                        disabled={t.pending_deliverables_count > 0}
                                                        onClick={() => !t.pending_deliverables_count && setSubmitTaskModal({ open: true, task: t })}
                                                        style={t.pending_deliverables_count > 0 ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                                                      >
                                                        <LuSend size={16} />
                                                      </button>
                                                    );
                                                  }
                                                  return null;
                                                }

                                                return null;
                                              })()}
                                            </ActionPopover>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }}
                                </SortableTableWrapper>
                              )}
                            </div>
                          </div>
                        </section>
                      </div>
                    )}

                    {tab === "files" && (
                      <div className="pd-tab-panel">
                        <section className="pd-card-flat">
                          <div className="pd-card-flat__head">
                            <h2 className="pd-block-title pd-block-title--inline">Platform files & links ({files.length})</h2>
                            {files.length > 0 && (
                              <div className="pd-files-search" style={{ margin: "0 0 0 auto" }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                                <input
                                  type="text"
                                  placeholder="Search by file name or URL..."
                                  value={fileSearch}
                                  onChange={(e) => setFileSearch(e.target.value)}
                                />
                              </div>
                            )}
                            {isAdminOrManager && (
                              <button type="button" className="pd-btn-tx pd-btn-tx--primary" onClick={() => setShowAddFileModal(true)} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <Plus size={16} /> Add Files
                              </button>
                            )}
                          </div>

                          {files.length === 0 ? (
                            <p className="pd-muted">No files attached.</p>
                          ) : (() => {
                            const filteredFiles = files.filter((f) => {
                              if (!fileSearch) return true;
                              const q = fileSearch.toLowerCase();
                              return (f.name || "").toLowerCase().includes(q) || (f.url || "").toLowerCase().includes(q);
                            });
                            return filteredFiles.length === 0 ? (
                              <p className="pd-muted">No files match your search.</p>
                            ) : (
                              <SortableTableWrapper
                                items={filteredFiles}
                                onReorder={handleFileReorder}
                                as="div"
                              >
                                {(f, idx, dndProps) => {
                                  const boxColors = [
                                    "#eef2ff", "#f0fdf4", "#fefce8", "#fef2f2",
                                    "#f5f3ff", "#ecfeff", "#fff7ed", "#fce7f3",
                                  ];
                                  const bg = boxColors[idx % boxColors.length];
                                  return (
                                    <div key={f.id} className="pd-file-box" style={{ background: bg }}>
                                      <div className="pd-file-box__drag-handle">
                                        <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} businessId={f.business_id} color="#16a34a" />
                                      </div>
                                      <div className="pd-file-box__content">
                                        <div className="pd-file-box__name">
                                          <FolderOpen size={18} />
                                          <span>{f.name}</span>
                                        </div>
                                        {f.url && (
                                          <a
                                            href={fileUrl(f.url)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="pd-file-box__link"
                                            style={{ color: "var(--color-primary)" }}
                                          >
                                            {f.url}
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  );
                                }}
                              </SortableTableWrapper>
                            );
                          })()}

                        </section>
                      </div>
                    )}

                    {tab === "members" && (
                      <div className="pd-tab-panel">
                        <section className="pd-card-flat">
                          <div className="pd-card-flat__head">
                            <h2 className="pd-block-title pd-block-title--inline">Members</h2>
                            <div className="pd-files-search" style={{ margin: "0 0 0 auto" }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                              <input type="text" placeholder="Search by member name or role..." value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
                            </div>
                            {currentUser?.role !== "guest" && (
                              <Link to={rolePath("manage-team")} className="pd-link-manage">
                                Manage
                              </Link>
                            )}
                          </div>
                          {project.creator && (
                            <div className="pd-member">
                              <div className="pd-avatar" aria-hidden>
                                {initials(project.creator.name)}
                              </div>
                              <div>
                                <div className="pd-member-name">{project.creator.name}</div>
                                <div className="pd-member-role">Project Manager · {project.creator.role || "—"}</div>
                              </div>
                              <span className="pd-badge-owner">Project Manager</span>
                            </div>
                          )}
                          <SortableTableWrapper
                            items={filteredMembers.filter((m) => m.id !== project.creator?.id)}
                            onReorder={handleMemberReorder}
                            as="div"
                          >
                            {(m) => (
                              <div key={m.id} className="pd-member">
                                <div className="pd-avatar" aria-hidden>
                                  {initials(m.name)}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div className="pd-member-name">{m.name}</div>
                                  <div className="pd-member-role">{m.role || "Member"}</div>
                                </div>
                                <div className="pd-member-right">
                                  {m.department && <span className="pd-member-dept">{m.department}</span>}
                                  <span className="pd-badge-member">Member</span>
                                </div>
                              </div>
                            )}
                          </SortableTableWrapper>
                        </section>

                        {(project.teams || []).length > 0 && (
                          <section className="pd-card-flat" style={{ marginTop: 16 }}>
                            <div className="pd-card-flat__head">
                              <h2 className="pd-block-title pd-block-title--inline" style={{ fontSize: 20 }}>Teams</h2>
                            </div>
                            {(project.teams || []).map((team) => (
                              <div key={team.id} style={{ marginBottom: 16 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid var(--border-color)" }}>
                                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{team.name}</h3>
                                  <span className="pd-badge-member">Team</span>
                                </div>
                                {team.leader && (
                                  <div className="pd-member">
                                    <div className="pd-avatar" aria-hidden style={{ background: "var(--color-primary)" }}>
                                      {initials(team.leader.name)}
                                    </div>
                                    <div>
                                      <div className="pd-member-name">{team.leader.name}</div>
                                      <div className="pd-member-role">Team Lead · {team.leader.role || "—"}</div>
                                    </div>
                                    <span className="pd-badge-owner">Lead</span>
                                  </div>
                                )}
                                {(team.members || []).filter((m) => m.id !== team.leader?.id && m.id !== project.creator?.id).map((m) => (
                                  <div key={m.id} className="pd-member">
                                    <div className="pd-avatar" aria-hidden>
                                      {initials(m.name)}
                                    </div>
                                    <div>
                                      <div className="pd-member-name">{m.name}</div>
                                      <div className="pd-member-role">{m.role || "Member"}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </section>
                        )}

                        {(project.view_only_users || []).length > 0 && (
                          <section className="pd-card-flat" style={{ marginTop: 16 }}>
                            <div className="pd-card-flat__head">
                              <h2 className="pd-block-title pd-block-title--inline">View Access</h2>
                              <div className="pd-files-search" style={{ margin: "0 0 0 auto" }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                                <input type="text" placeholder="Search by user name..." value={viewAccessSearch} onChange={(e) => setViewAccessSearch(e.target.value)} />
                              </div>
                            </div>
                            <p className="pd-muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
                              These users have been granted view-only access via "Show To" and can see the project but are not team members.
                            </p>
                            {(() => {
                              const viewUsers = project.view_only_users || [];
                              const filtered = viewAccessSearch
                                ? viewUsers.filter((u) => (u.name || "").toLowerCase().includes(viewAccessSearch.toLowerCase()))
                                : viewUsers;
                              return filtered.length === 0 ? (
                                <p className="pd-muted" style={{ fontSize: 13 }}>{viewAccessSearch ? "No matching users found." : "No view-only users."}</p>
                              ) : (
                                filtered.map((u) => (
                                  <div key={u.id} className="pd-member">
                                    <div className="pd-avatar" aria-hidden style={{ background: "var(--color-warning)" }}>
                                      {initials(u.name)}
                                    </div>
                                    <div>
                                      <div className="pd-member-name">{u.name}</div>
                                      <div className="pd-member-role">{u.role || "—"}</div>
                                    </div>
                                  </div>
                                ))
                              );
                            })()}
                          </section>
                        )}
                      </div>
                    )}

                    {tab === "access" && (
                      <div className="pd-tab-panel">
                        <section className="pd-card-flat">
                          <div className="pd-card-flat__head">
                            <h2 className="pd-block-title pd-block-title--inline">Project Access Credentials</h2>
                            <div className="pd-files-search" style={{ margin: "0 0 0 auto" }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                              <input type="text" placeholder="Search by title, username, or URL..." value={accessSearch} onChange={(e) => setAccessSearch(e.target.value)} />
                            </div>
                            {isAdminOrManager && (
                              <button type="button" className="pd-btn-tx pd-btn-tx--primary" onClick={() => setShowAddAccessModal(true)} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <Plus size={16} /> Add Access
                              </button>
                            )}
                          </div>
                          <p className="pd-muted" style={{ margin: "0 0 16px" }}>
                            Store and manage login credentials for project-related websites. Passwords are encrypted and only visible to assigned users.
                          </p>

                          {loadingCredentials ? (
                            <p className="pd-muted">Loading credentials...</p>
                          ) : accessCredentials.length === 0 ? (
                            <p className="pd-muted">No access credentials added yet. Click "Add Access" to store login details.</p>
                          ) : (() => {
                            const filteredAccess = accessSearch ? accessCredentials.filter((cred) => {
                              const q = accessSearch.toLowerCase();
                              return (cred.title || "").toLowerCase().includes(q) || (cred.username || "").toLowerCase().includes(q) || (cred.url || "").toLowerCase().includes(q);
                            }) : accessCredentials;
                            return filteredAccess.length === 0 ? (
                              <p className="pd-muted">No access credentials match your search.</p>
                            ) : (
                              <div className="pd-credentials-list">
                                {filteredAccess.map((cred) => (
                                <CredentialRow
                                  key={cred.id}
                                  credential={cred}
                                  onDelete={() => {
                                    setPendingDeleteCredential(cred.id);
                                    setDeleteCredentialConfirmOpen(true);
                                  }}
                                  onEdit={(c) => setEditingCredential(c)}
                                  isGuest={currentUser?.role === "guest"}
                                />
                              ))}
                            </div>
                          )})()}
                        </section>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>

          <div>
            {renderRail()}
          </div>
        </div>
      </DashboardLayout>

      <SubmitDeliverableModal
        key={`pd-submit-${submitModal.subtask?.id || "none"}`}
        isOpen={submitModal.open}
        onClose={() => setSubmitModal({ open: false, subtask: null })}
        deliverable={submitModal.subtask}
        onSubmitSuccess={handleSubtaskActionSuccess}
      />

      <ViewDeliverableModal
        key={`pd-view-${viewModal.subtask?.id || "none"}`}
        isOpen={viewModal.open}
        onClose={() => setViewModal({ open: false, subtask: null })}
        deliverable={viewModal.subtask}
        onSubmitSuccess={handleSubtaskActionSuccess}
      />

      <AssignerViewModal
        key={`pd-assigner-${assignerModal.subtask?.id || "none"}`}
        isOpen={assignerModal.open}
        onClose={() => setAssignerModal({ open: false, subtask: null })}
        deliverable={assignerModal.subtask}
        onActionSuccess={handleSubtaskActionSuccess}
      />

      {showTaskModal && (
        <CreateTaskModal
          onClose={(refresh) => {
            setShowTaskModal(false);
            if (refresh) loadProject();
          }}
          projectId={projectId}
          projectName={project?.title || ""}
        />
      )}
      {showEditModal && (
        <EditProjectModal
          project={project}
          onClose={(refresh) => {
            setShowEditModal(false);
            if (refresh) loadProject();
          }}
        />
      )}

      <ConfirmModal
        isOpen={deleteProjectConfirmOpen}
        onClose={() => setDeleteProjectConfirmOpen(false)}
        onConfirm={confirmDeleteProject}
        title="Confirm Deletion"
        message="Are you sure you want to delete this project? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger
      />

      {submitTaskModal.open && (
        <SubmitTaskModal
          isOpen={submitTaskModal.open}
          onClose={() => setSubmitTaskModal({ open: false, task: null })}
          task={submitTaskModal.task}
          onSubmitSuccess={() => { setSubmitTaskModal({ open: false, task: null }); loadProject(); }}
        />
      )}

      <ConfirmModal
        isOpen={deleteTaskConfirmOpen}
        onClose={() => { setDeleteTaskConfirmOpen(false); setDeleteTaskId(null); }}
        onConfirm={confirmDeleteTask}
        title="Confirm Deletion"
        message="Are you sure you want to delete this task? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger
      />

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          onClose={(refresh) => { setEditingTask(null); if (refresh) loadProject(); }}
        />
      )}

      <PauseReasonModal
        isOpen={pauseModalOpen}
        onClose={() => { setPauseModalOpen(false); setPauseModalTaskId(null); }}
        onConfirm={async (data) => { await handleTaskAssignerPause(pauseModalTaskId, data); setPauseModalOpen(false); setPauseModalTaskId(null); }}
      />

      <AddNoteModal
        isOpen={noteModal.open}
        onClose={() => setNoteModal({ open: false, itemId: null })}
        itemType="task"
        itemId={noteModal.itemId}
        onSaved={() => { setNoteModal({ open: false, itemId: null }); loadProject(); }}
      />

      {visibilityOpen && (
        <div className="modal-overlay" onClick={handleVisClose}>
          <div className="sv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sv-modal-header">
              <h3>Show To — {project.title}</h3>
              <button className="sv-close-btn" onClick={handleVisClose}>✕</button>
            </div>
            <div className="sv-modal-body">
              {visibilityUsers.length > 0 && (
                <div className="sv-search-wrap">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                  <input
                    type="text"
                    className="sv-search-input"
                    placeholder="Search by name, role, department..."
                    value={visSearch}
                    onChange={(e) => setVisSearch(e.target.value)}
                  />
                  {visSearch && (
                    <button type="button" className="sv-search-clear" onClick={() => setVisSearch("")}>✕</button>
                  )}
                </div>
              )}
              {visibilityUsers.length === 0 ? (
                <p className="sv-muted">Loading users...</p>
              ) : (
                visibilityUsers
                  .filter((u) => {
                    if (!visSearch.trim()) return true;
                    const q = visSearch.toLowerCase();
                    return u.name?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q) || u.department?.toLowerCase().includes(q);
                  })
                  .map((u) => (
                  <label key={u.id} className="sv-user-row">
                    <input
                      type="checkbox"
                      checked={!!visibilitySelected[u.id]}
                      onChange={() => { setVisIsDirty(true); toggleVisibilityUser(u.id); }}
                    />
                    <span className="sv-user-name">{u.name}</span>
                    <span className="sv-user-role">({u.role.replace("_", " ")})</span>
                    {!u.is_member && (
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-warning)", background: "var(--color-warning-bg)", border: "1px solid var(--color-warning)", borderRadius: 6, padding: "1px 8px", fontWeight: 500 }}>View Only</span>
                    )}
                  </label>
                ))
              )}
            </div>
            <div className="sv-modal-footer">
              <button className="sv-cancel-btn" onClick={handleVisClose}>Cancel</button>
              <button className="sv-save-btn" onClick={saveVisibility} disabled={visibilitySaving}>
                {visibilitySaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {VisConfirmDialog}

      {/* Edit File/Link Popup */}
      {editFileItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }} onClick={() => setEditFileItem(null)}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: "24px 28px", width: 460, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-heading)" }}>Edit File / Link</h3>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-muted)" }}>Rename or update the URL below.</p>
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dark)", display: "block", marginBottom: 4 }}>Title</label>
                <input
                  autoFocus
                  type="text"
                  value={editFileName}
                  onChange={(e) => setEditFileName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRenameFile(); }}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border-color)", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                />
              </div>
              {editFileItem.url && (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dark)", display: "block", marginBottom: 4 }}>URL</label>
                  <input
                    type="text"
                    value={editFileUrl}
                    onChange={(e) => setEditFileUrl(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border-color)", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              )}
            </div>
            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => setEditFileItem(null)} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid var(--border-medium)", background: "var(--bg-card)", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text-dark)" }}>Cancel</button>
              <button type="button" onClick={handleRenameFile} disabled={!editFileName.trim()} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: editFileName.trim() ? "var(--color-primary)" : "var(--bg-hover)", color: editFileName.trim() ? "#fff" : "var(--text-muted)", fontSize: 13, fontWeight: 600, cursor: editFileName.trim() ? "pointer" : "not-allowed" }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={deleteFileConfirmOpen}
        onClose={() => { setDeleteFileConfirmOpen(false); setPendingDeleteFile(null); }}
        onConfirm={handleDeleteFile}
        title="Delete File"
        message={`Are you sure you want to delete "${pendingDeleteFile?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        danger
      />

      <AddProjectFileModal
        isOpen={showAddFileModal}
        onClose={() => setShowAddFileModal(false)}
        projectId={projectId}
        onSuccess={loadProject}
      />

      <AddAccessModal
        isOpen={showAddAccessModal || !!editingCredential}
        onClose={() => { setShowAddAccessModal(false); setEditingCredential(null); }}
        projectId={projectId}
        projectName={project?.title || ""}
        onSuccess={() => { fetchAccessCredentials(); setEditingCredential(null); }}
        files={project?.files || []}
        credential={editingCredential}
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

      {showManagerModal && (
        <div className="modal-overlay" onClick={handleMgrClose}>
          <div className="aam-modal" onClick={(e) => e.stopPropagation()}>
            <div className="aam-header">
              <h3>Change Project Manager</h3>
              <button className="aam-close" onClick={handleMgrClose}>
                <X size={18} />
              </button>
            </div>
            <div className="aam-body">
              <div className="aam-field">
                <label>
                  <Users size={14} /> Select Manager *
                </label>
                <p className="aam-hint">Choose a user to assign as project manager</p>
                <div className="aam-multiselect" ref={managerDropdownRef}>
                  <button
                    type="button"
                    className={`aam-multiselect-trigger ${managerDropdownOpen ? "aam-multiselect-trigger--open" : ""}`}
                    onClick={() => setManagerDropdownOpen(!managerDropdownOpen)}
                  >
                    <span className="aam-multiselect-value">
                      {selectedManagerId
                        ? managerUsers.find((u) => u.id === selectedManagerId)?.name || "1 user selected"
                        : "Select users"}
                    </span>
                    <ChevronDown size={16} className={`aam-multiselect-arrow ${managerDropdownOpen ? "aam-multiselect-arrow--open" : ""}`} />
                  </button>
                  {managerDropdownOpen && (
                    <div className="aam-multiselect-dropdown aam-multiselect-dropdown--down">
                      <div className="aam-multiselect-search">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                        <input
                          type="text"
                          placeholder="Search by name, role, department..."
                          value={mgrSearch}
                          onChange={(e) => setMgrSearch(e.target.value)}
                          onKeyDown={(e) => {
                            const filteredUsers = managerUsers.filter((u) => {
                              if (!mgrSearch.trim()) return true;
                              const q = mgrSearch.toLowerCase();
                              return u.name?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q) || u.department?.toLowerCase().includes(q);
                            });
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setMgrHighlightedIndex((prev) => (prev + 1) % filteredUsers.length);
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              setMgrHighlightedIndex((prev) => (prev - 1 + filteredUsers.length) % filteredUsers.length);
                            } else if (e.key === "Enter") {
                              e.preventDefault();
                              if (filteredUsers[mgrHighlightedIndex]) {
                                const u = filteredUsers[mgrHighlightedIndex];
                                setSelectedManagerId(u.id);
                                setMgrIsDirty(true);
                                setManagerDropdownOpen(false);
                              }
                            }
                          }}
                          autoFocus
                        />
                        {mgrSearch && <button type="button" className="aam-multiselect-search-clear" onClick={() => setMgrSearch("")}>✕</button>}
                      </div>
                      <div ref={mgrListRef}>
                      {managerUsers
                        .filter((u) => {
                          if (!mgrSearch.trim()) return true;
                          const q = mgrSearch.toLowerCase();
                          return u.name?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q) || u.department?.toLowerCase().includes(q);
                        })
                        .map((u, idx) => (
                        <label key={u.id} className={`aam-multiselect-option${mgrHighlightedIndex === idx ? " aam-multiselect-option--highlighted" : ""}`} onClick={(e) => e.stopPropagation()} onMouseEnter={() => setMgrHighlightedIndex(idx)}>
                          <input
                            type="radio"
                            name="project_manager"
                            checked={selectedManagerId === u.id}
                            onChange={() => {
                              setSelectedManagerId(u.id);
                              setMgrIsDirty(true);
                              setManagerDropdownOpen(false);
                            }}
                          />
                          <div className="aam-multiselect-info">
                            <span className="aam-multiselect-label">{u.name}</span>
                            <div className="aam-multiselect-badges">
                              {u.role && <span className="aam-multiselect-role">{u.role.replace("_", " ")}</span>}
                              {u.department && <span className="aam-multiselect-dept">{u.department}</span>}
                            </div>
                          </div>
                        </label>
                      ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="aam-footer">
                <button type="button" className="aam-btn aam-btn-cancel" onClick={handleMgrClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="aam-btn aam-btn-save"
                  onClick={saveManagerChange}
                  disabled={!selectedManagerId || selectedManagerId === project.creator?.id || savingManager}
                >
                  {savingManager ? "Saving..." : "Save Change"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {MgrConfirmDialog}
    </>
  );
}

export default ProjectDetails;