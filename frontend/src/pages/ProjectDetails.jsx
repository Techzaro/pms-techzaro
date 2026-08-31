/**
 * ProjectDetails page component.
 * Rendered when the user navigates to /projectdetails or related route.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  BookOpen,
  Megaphone,
  Video,
  Clock,
  Eye,
  ArrowUpRight,
  Activity,
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
import UnifiedActivityFeed from "../components/UnifiedActivityFeed";
import ProjectMembersModal from "../components/ProjectMembersModal";
import "../components/ActionPopover.css";
import { formatDateTimeShort, formatDateTime, formatDateTimeInline } from "../utils/formatDateTime";
import { renderDynamicDates } from "../utils/tableDateUtils";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import { useSubmit } from "../hooks/useSubmit";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage, notify, toast } from "../utils/notify";
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
  abandon_requested: "var(--color-warning-bg)",
  abandoned: "var(--color-danger-bg)",
};

const STATUS_TEXT_COLORS = {
  pending: "var(--color-warning)",
  in_progress: "var(--color-blue)",
  paused: "var(--color-warning)",
  submitted: "var(--color-blue)",
  reopened: "var(--color-primary)",
  approved: "var(--color-success)",
  rejected: "var(--color-danger)",
  abandon_requested: "var(--color-warning)",
  abandoned: "var(--color-danger)",
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
    abandon_requested: "Abandon Requested",
    abandoned: "Abandoned",
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
              {t("Visit", { defaultValue: "Visit" })}
            </a>
          )}
        </div>
        <div className="pd-cred-actions">
          {!isGuest && (
            <>
              <button className="pd-cred-edit" onClick={() => onEdit?.(credential)} title={t("Edit credential", { defaultValue: "Edit credential" })}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              </button>
              <button className="pd-cred-delete" onClick={onDelete} title={t("Delete credential", { defaultValue: "Delete credential" })}>
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="pd-cred-fields">
        <div className="pd-cred-field">
          <label>{t("Username / Email", { defaultValue: "Username / Email" })}</label>
          <div className="pd-cred-value-row">
            <span className="pd-cred-value">{credential.username}</span>
            <button className={`pd-cred-copy ${copiedUser ? "pd-cred-copied" : ""}`} onClick={copyUsername} title={t("Copy username", { defaultValue: "Copy username" })}>
              {copiedUser ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <div className="pd-cred-field">
          <label>{t("Password", { defaultValue: "Password" })}</label>
          <div className="pd-cred-value-row">
            <span className="pd-cred-value pd-cred-password">{"\u2022".repeat(12)}</span>
            <button className={`pd-cred-copy ${copied ? "pd-cred-copied" : ""}`} onClick={copyPassword} title={t("Copy password", { defaultValue: "Copy password" })}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <span className="pd-cred-hint">{copied ? t("Copied!", { defaultValue: "Copied!" }) : t("Click copy to use this password", { defaultValue: "Click copy to use this password" })}</span>
        </div>

        <div className="pd-cred-field">
          <label>{t("Assigned To", { defaultValue: "Assigned To" })}</label>
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
  const { t } = useTranslation();
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
  const [projectKbArticles, setProjectKbArticles] = useState([]);
  const [loadingKb, setLoadingKb] = useState(false);
  const [kbSearch, setKbSearch] = useState("");
  const [kbArticles, setKbArticles] = useState([]);
  const [projectEvents, setProjectEvents] = useState([]);
  const [loadingProjectEvents, setLoadingProjectEvents] = useState(false);
  const [eventSearch, setEventSearch] = useState("");
  const [eventsList, setEventsList] = useState([]);
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
  const [showProjectMembersModal, setShowProjectMembersModal] = useState(false);
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
    if (tab === "kb" && (project?.id || projectId)) {
      const pId = project?.id || projectId;
      setLoadingKb(true);
      const token = authToken();
      fetch(`${API_URL}/knowledge-base?all=1`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
        skipLoader: true,
      })
        .then((r) => r.json())
        .then((d) => {
          const list = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
          const directKbId = project?.kb_id || project?.knowledge_base?.id || project?.knowledgeBase?.id;
          const taskKbIds = Array.isArray(project?.tasks)
            ? project.tasks.map((t) => t.kb_id).filter(Boolean)
            : [];

          let filtered = list.filter((a) =>
            String(a.project_id) === String(pId) ||
            (directKbId && String(a.id) === String(directKbId)) ||
            taskKbIds.map(String).includes(String(a.id))
          );

          const linkedKbObj = project?.knowledge_base || project?.knowledgeBase;
          if (linkedKbObj && linkedKbObj.id && !filtered.some((a) => String(a.id) === String(linkedKbObj.id))) {
            filtered.unshift({
              ...linkedKbObj,
              isDirectLinked: true,
            });
          } else if (directKbId) {
            filtered = filtered.map((a) => String(a.id) === String(directKbId) ? { ...a, isDirectLinked: true } : a);
          }

          setProjectKbArticles(filtered);
        })
        .catch((err) => console.error("Error fetching project KB", err))
        .finally(() => setLoadingKb(false));
    }
  }, [tab, project?.id, project?.kb_id, project?.knowledge_base, project?.knowledgeBase, project?.tasks, projectId]);

  useEffect(() => {
    if (tab === "events" && (project?.id || projectId)) {
      const pId = project?.id || projectId;
      setLoadingProjectEvents(true);
      const token = authToken();
      fetch(`${API_URL}/events?all=true`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
        skipLoader: true,
      })
        .then((r) => r.json())
        .then((d) => {
          const list = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
          const directEventId = project?.event_id || project?.event?.id;
          const taskEventIds = Array.isArray(project?.tasks)
            ? project.tasks.map((t) => t.event_id).filter(Boolean)
            : [];

          let filtered = list.filter((e) =>
            String(e.project_id) === String(pId) ||
            (e.visibility_level === "project_team" && String(e.project_id) === String(pId)) ||
            (directEventId && String(e.id) === String(directEventId)) ||
            taskEventIds.map(String).includes(String(e.id))
          );

          const linkedEventObj = project?.event;
          if (linkedEventObj && linkedEventObj.id && !filtered.some((e) => String(e.id) === String(linkedEventObj.id))) {
            filtered.unshift({
              ...linkedEventObj,
              isDirectLinked: true,
            });
          } else if (directEventId) {
            filtered = filtered.map((e) => String(e.id) === String(directEventId) ? { ...e, isDirectLinked: true } : e);
          }

          setProjectEvents(filtered);
        })
        .catch((err) => console.error("Error fetching project events", err))
        .finally(() => setLoadingProjectEvents(false));
    }
  }, [tab, project?.id, project?.event_id, project?.event, project?.tasks, projectId]);

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
            notifyRef.current.error(t("You don't have access to this project.", { defaultValue: "You don't have access to this project." }));
          } else {
            notifyRef.current.error(t("Unable to load project details.", { defaultValue: "Unable to load project details." }));
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
  }, [loadProject, navigate, t]);

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

  const handleDeleteTask = async (e, taskId) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    setDeleteTaskId(taskId);
    setDeleteTaskConfirmOpen(true);
  };

  const confirmDeleteTask = async () => {
    const taskId = deleteTaskId;
    setDeleteTaskConfirmOpen(false);
    setDeleteTaskId(null);
    if (!taskId) return;
    let res;
    try {
      const token = authToken();
      res = await fetch(`${API}/tasks/${taskId}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        _notifHandled: true,
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete task.");
      return;
    }
    if (res.ok) {
      setOrderedTasks((prev) => prev.filter((t) => String(t.id) !== String(taskId)));
      toast.success(t("Task deleted successfully", { defaultValue: "Task deleted successfully" }));
      try {
        loadProject().catch(() => {});
        publish("task:deleted", { id: taskId });
        publish("data:changed", { type: "task", action: "deleted" });
      } catch (uiError) {
        console.error("Post-delete project refresh failed", uiError);
      }
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.message || t("Failed to delete task.", { defaultValue: "Failed to delete task." }));
    }
  };

  const handleTaskAcknowledge = async (e, taskId) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      const token = authToken();
      const res = await fetch(`${API}/tasks/${taskId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOrderedTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "in_progress", ...(data.task || {}) } : t));
        publish('task:updated', { id: taskId, status: 'in_progress' });
        publish('data:changed', { type: 'task', action: 'updated' });
        showSuccessMessage("Task", "acknowledged");
      } else {
        notify.error(data.message || t("Failed to acknowledge task.", { defaultValue: "Failed to acknowledge task." }));
      }
    } catch {
      notify.error(t("Failed to acknowledge task.", { defaultValue: "Failed to acknowledge task." }));
    }
  };

  const handleTaskContinue = async (e, taskId) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      const token = authToken();
      const res = await fetch(`${API}/tasks/${taskId}/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOrderedTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "in_progress", ...(data.task || {}) } : t));
        publish('task:updated', { id: taskId, status: 'in_progress' });
        publish('data:changed', { type: 'task', action: 'updated' });
        showSuccessMessage("Task", "resumed");
      } else {
        notify.error(data.message || t("Failed to continue task.", { defaultValue: "Failed to continue task." }));
      }
    } catch {
      notify.error(t("Failed to continue task.", { defaultValue: "Failed to continue task." }));
    }
  };

  const handleTaskPause = async (e, taskId) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      const token = authToken();
      const res = await fetch(`${API}/tasks/${taskId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: "other", reason_detail: "Paused from task list" }),
        _notifHandled: true,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOrderedTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "paused", ...(data.task || {}) } : t));
        publish('task:updated', { id: taskId, status: 'paused' });
        publish('data:changed', { type: 'task', action: 'updated' });
        showSuccessMessage("Task", "paused");
      } else {
        notify.error(data?.message || data?.error || t("Failed to pause task.", { defaultValue: "Failed to pause task." }));
      }
    } catch {
      notify.error(t("Failed to pause task.", { defaultValue: "Failed to pause task." }));
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
        showSuccessMessage("Task", "paused");
      } else {
        notify.error(data.message || t("Failed to pause task.", { defaultValue: "Failed to pause task." }));
      }
    } catch {
      notify.error(t("Failed to pause task.", { defaultValue: "Failed to pause task." }));
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
        notify.error(data.message || t("Failed to resume task.", { defaultValue: "Failed to resume task." }));
      }
    } catch {
      notify.error(t("Failed to resume task.", { defaultValue: "Failed to resume task." }));
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
      notify.error(t("Could not delete project.", { defaultValue: "Could not delete project." }));
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
        <div className="pd-loading">{t("Loading project…", { defaultValue: "Loading project…" })}</div>
      </DashboardLayout>
    );
  }

  if (!project) {
    return (
      <DashboardLayout hideRightSidebar={true}>
        <div className="pd-loading pd-error">{t("Project not found.", { defaultValue: "Project not found." })}</div>
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

  const isCreator = !!project?.is_creator;
  const isAssigned = !!project?.is_assigned;
  const isAdminOrManager = !!project?.is_admin_or_manager;
  const isViewOnlyUser = !!project?.is_view_only || (project?.view_only_users || []).some((u) => Number(u?.id || u) === Number(currentUser?.id));

  const canEdit = !isViewOnlyUser && (project?.can_edit || isAdminOrManager);
  const canManage = !isViewOnlyUser && isAdminOrManager;
  const canAddTask = !isViewOnlyUser && currentUser?.role !== "guest" && (isCreator || isAdminOrManager || isAssigned);

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
            milestones: (prev?.milestones || []).map((m) => m.id === milestone.id ? data.milestone : m),
          }));
          showSuccessMessage("Milestone", data.message);
          publish('data:changed', { type: 'project', action: 'updated' });
        } else {
          notify.error(data.message || t("Failed to update milestone", { defaultValue: "Failed to update milestone" }));
        }
      } catch {
        notify.error(t("Failed to update milestone", { defaultValue: "Failed to update milestone" }));
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
      const userIds = Object.keys(visibilitySelected || {}).filter((id) => visibilitySelected[id]).map(Number);
      const res = await fetch(`${API_URL}/projects/${project.id}/visibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_ids: userIds }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.message || t("Failed to save visibility", { defaultValue: "Failed to save visibility" }));
      }
      showSuccessMessage("Project visibility", "updated");
      closeVisibility();
      loadProject();
    } catch (err) {
      console.error("Save visibility error:", err);
      notify.error(err.message || t("Failed to save visibility", { defaultValue: "Failed to save visibility" }));
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
    { id: "overview", label: t("Overview", { defaultValue: "Overview" }), icon: ListChecks },
    { id: "tasks", label: t("Tasks", { defaultValue: "Tasks" }), icon: ClipboardList },
    { id: "files", label: t("Platform files & links", { defaultValue: "Platform files & links" }), icon: FolderOpen },
    { id: "access", label: t("Accessess", { defaultValue: "Accessess" }), icon: Shield },
    { id: "members", label: t("Members", { defaultValue: "Members" }), icon: Users },
    { id: "kb", label: t("Knowledge Base", { defaultValue: "Knowledge Base" }), icon: BookOpen },
    { id: "events", label: t("Events & Announcements", { defaultValue: "Events & Announcements" }), icon: Calendar },
    { id: "activity", label: t("Activity", { defaultValue: "Activity" }), icon: Activity },
  ];

  const overviewInner = (
    <>
      {project.description && (
        <div style={{ marginBottom: 20, maxWidth: "100%", wordBreak: "break-word", overflowWrap: "break-word" }}>
          <h2 className="pd-block-title">{t("Description", { defaultValue: "Description" })}</h2>
          <div
            className="pd-desc-tx pd-rich"
            style={{
              maxHeight: "250px",
              overflowY: "auto",
              backgroundColor: "#f9fafb",
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid var(--border-color, #e5e7eb)",
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
            }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(project.description) }}
          />
        </div>
      )}
      <div className="pd-shell-split">
        <div className="pd-shell-left">
          <h2 className="pd-block-title">{t("Project Milestones", { defaultValue: "Project Milestones" })}</h2>
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
                        title={m.status === "completed" ? t("Click to unachieve", { defaultValue: "Click to unachieve" }) : t("Click to achieve", { defaultValue: "Click to achieve" })}
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
                      {t("Due: {{date}}", { date: formatDateTimeShort(m.due_date), defaultValue: `Due: ${formatDateTimeShort(m.due_date)}` })}
                    </div>
                    {m.status === "completed" && m.completed_at && (
                      <div style={{ fontSize: "12px", color: "var(--color-success)", marginTop: "2px" }}>
                        {t("Achieved: {{date}}", { date: formatDateTimeShort(m.completed_at), defaultValue: `Achieved: ${formatDateTimeShort(m.completed_at)}` })}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pd-muted">{t("No milestones.", { defaultValue: "No milestones." })}</p>
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
                <h2 className="pd-block-title pd-block-title--gap">{t("Category", { defaultValue: "Category" })}</h2>
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
          <h2 className="pd-block-title">{t("Project details", { defaultValue: "Project details" })}</h2>
          <ul className="pd-meta-rows">
            <li className="pd-meta-rows--manager">
              <span className="pd-meta-rows__ic">
                <UserRound size={18} />
              </span>
              <div className="pd-meta-rows__content">
                <div className="pd-meta-rows__header">
                  <span className="pd-meta-rows__label">{t("Project manager", { defaultValue: "Project manager" })}</span>
                  {(currentUser?.role === "admin" || currentUser?.role === "manager") && !isViewOnlyUser && (
                    <button className="pd-manager-edit" onClick={openManagerEdit} title={t("Change project manager", { defaultValue: "Change project manager" })}>
                      {t("Edit", { defaultValue: "Edit" })}
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
                <span className="pd-meta-rows__label">{t("Start date", { defaultValue: "Start date" })}</span>
                <span className="pd-meta-rows__value">{formatDateTimeShort(project.start_date)}</span>
              </div>
            </li>
            <li>
              <span className="pd-meta-rows__ic">
                <Tag size={18} />
              </span>
              <div>
                <span className="pd-meta-rows__label">{t("Priority", { defaultValue: "Priority" })}</span>
                <span className="pd-meta-rows__value">
                  <span className={`pd-pill pd-pill--priority-${(project.priority || "medium").toLowerCase()}`}>
                    {t(project.priority || "Medium", { defaultValue: project.priority || "Medium" })}
                  </span>
                </span>
              </div>
            </li>
            <li>
              <span className="pd-meta-rows__ic">
                <Building2 size={18} />
              </span>
              <div>
                <span className="pd-meta-rows__label">{t("Client", { defaultValue: "Client" })}</span>
                <span className="pd-meta-rows__value">{project.client_name || project.website_name || "—"}</span>
              </div>
            </li>
            {isAdminOrManager && (
              <li>
                <span className="pd-meta-rows__ic">
                  <Banknote size={18} />
                </span>
                <div>
                  <span className="pd-meta-rows__label">{t("Budget", { defaultValue: "Budget" })}</span>
                  <span className="pd-meta-rows__value">
                    {project.budget != null && project.budget !== "" ? `PKR ${Number(project.budget).toLocaleString()}` : "—"}
                  </span>
                </div>
              </li>
            )}
            {(() => {
              const kbIds = Array.isArray(project?.kb_ids)
                ? project.kb_ids
                : project?.kb_id
                ? [project.kb_id]
                : [];
              return (
                <li>
                  <span className="pd-meta-rows__ic">
                    <BookOpen size={18} />
                  </span>
                  <div>
                    <span className="pd-meta-rows__label">{t("Knowledge Base", { defaultValue: "Knowledge Base" })}</span>
                    <span className="pd-meta-rows__value">
                      {kbIds && kbIds.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          {kbIds.map((kId) => {
                            const foundKb = kbArticles.find((k) => String(k.id) === String(kId)) || projectKbArticles.find((k) => String(k.id) === String(kId));
                            const kbTitle = foundKb?.title || `Article #${kId}`;
                            return (
                              <Link
                                key={kId}
                                to={rolePath ? rolePath(`knowledge-base/${kId}`) : `/knowledge-base/${kId}`}
                                className="pd-meta-link"
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
              const eventIds = Array.isArray(project?.event_ids)
                ? project.event_ids
                : project?.event_id
                ? [project.event_id]
                : [];
              return (
                <li>
                  <span className="pd-meta-rows__ic">
                    <CalendarDays size={18} />
                  </span>
                  <div>
                    <span className="pd-meta-rows__label">{t("Event", { defaultValue: "Event" })}</span>
                    <span className="pd-meta-rows__value">
                      {eventIds && eventIds.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          {eventIds.map((eId) => {
                            const foundEv = eventsList.find((e) => String(e.id) === String(eId)) || projectEvents.find((e) => String(e.id) === String(eId));
                            const eventTitle = foundEv?.title || `Event #${eId}`;
                            return (
                              <Link
                                key={eId}
                                to={rolePath ? rolePath(`events/${eId}`) : `/events/${eId}`}
                                className="pd-meta-link"
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
              { label: t("Projects", { defaultValue: "Projects" }), path: rolePath("projects") },
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
                        title={t("Copy Project ID", { defaultValue: "Copy Project ID" })}
                      >
                        <Copy size={13} color="#ca8a04" />
                      </button>
                    </span>
                  )}
                  <div className="pd-hero-actions">
                    <button className="td-nav-btn" onClick={() => goToProject(prevProjectId)} disabled={!prevProjectId} title={t("Previous project", { defaultValue: "Previous project" })}><ChevronLeft size={18} /></button>
                    <button className="td-nav-btn" onClick={() => goToProject(nextProjectId)} disabled={!nextProjectId} title={t("Next project", { defaultValue: "Next project" })}><ChevronRight size={18} /></button>
                    <span className={`pd-pill-status pd-pill-status--${statusSlug(project.status)}`}>{t(project.status, { defaultValue: project.status })}</span>
                    {isAdminOrManager && !isViewOnlyUser && (
                      <button type="button" className="pd-btn-tx pd-btn-tx--outline" onClick={openVisibility}>
                        <IoEyeOutline size={16} />
                        {t("Show To", { defaultValue: "Show To" })}
                      </button>
                    )}
                    {canEdit && (
                      <button type="button" className="pd-btn-tx pd-btn-tx--outline" onClick={() => setShowEditModal(true)}>
                        <Pencil size={16} />
                        {t("Edit Project", { defaultValue: "Edit Project" })}
                      </button>
                    )}
                    {canEdit && (
                      <button type="button" className="pd-btn-tx pd-btn-tx--danger" onClick={handleDeleteProject}>
                        <Trash2 size={16} />
                        {t("Delete", { defaultValue: "Delete" })}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </header>

            <div className="td-stats">
              <div className="td-stat td-stat--progress">
                <span className="td-stat-label">{t("Overall Progress", { defaultValue: "Overall Progress" })}</span>
                <div className="td-progress"><span style={{ width: `${progress}%` }} /></div>
                <span className="td-stat-big">{progress}%</span>
              </div>
              <div className="td-stat td-stat--trio">
                <div className="td-trio-item">
                  <div className="td-stat-ic td-stat-ic--blue"><ClipboardList size={18} /></div>
                  <div>
                    <span className="td-stat-big">{tasks.length}</span>
                    <span className="td-stat-label">{t("Tasks", { defaultValue: "Tasks" })}</span>
                  </div>
                </div>
                <div className="td-trio-item">
                  <div className="td-stat-ic td-stat-ic--orange"><Users size={18} /></div>
                  <div>
                    <span className="td-stat-big">{memberCount}</span>
                    <span className="td-stat-label">{t("Members", { defaultValue: "Members" })}</span>
                  </div>
                </div>
                <div className="td-trio-item">
                  <div className="td-stat-ic td-stat-ic--green"><CalendarDays size={18} /></div>
                  <div>
                    <span className="td-stat-big td-stat-big--sm">{project?.end_date ? formatDateTimeShort(project.end_date) : t("No Deadline", { defaultValue: "No Deadline" })}</span>
                    <span className="td-stat-label">{t("Deadline", { defaultValue: "Deadline" })}</span>
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
                            <h2 className="pd-block-title pd-block-title--inline">{t("Tasks ({{count}})", { count: tasks.length, defaultValue: `Tasks (${tasks.length})` })}</h2>
                            <div className="pd-files-search" style={{ margin: "0 0 0 auto" }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                              <input type="text" placeholder={t("Search by task name...", { defaultValue: "Search by task name..." })} value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} />
                            </div>
                            {canAddTask && (
                              <button type="button" className="pd-btn-tx pd-btn-tx--primary" onClick={() => setShowTaskModal(true)} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <Plus size={16} /> {t("Add Task", { defaultValue: "Add Task" })}
                              </button>
                            )}
                          </div>
                          <div className="pd-table-wrap">
                            <div className="project-task-table">
                                <div className={`ptt-header ${currentUser?.role === "guest" ? "ptt-header--guest" : ""}`}>
                                <div>{t("ID", { defaultValue: "ID" })}</div>
                                {currentUser?.role !== "guest" && <div>{isCreator || isAdminOrManager ? t("Assigned To", { defaultValue: "Assigned To" }) : t("Assigned By", { defaultValue: "Assigned By" })}</div>}
                                <div className="ptt-col-name">{t("Task Name", { defaultValue: "Task Name" })}</div>
                                <div>{t("Status", { defaultValue: "Status" })}</div>
                                <div>{t("Progress", { defaultValue: "Progress" })}</div>
                                <div>{t("Priority", { defaultValue: "Priority" })}</div>
                                <div>{t("Start & Due Date", { defaultValue: "Start & Due Date" })}</div>
                                <div>{t("Action", { defaultValue: "Action" })}</div>
                              </div>
                              {filteredTasks.length === 0 ? (
                                <div className="pd-muted pd-table-empty" style={{ padding: "20px", textAlign: "center" }}>{taskSearch ? t("No tasks match your search.", { defaultValue: "No tasks match your search." }) : t("No tasks yet.", { defaultValue: "No tasks yet." })}</div>
                              ) : (
                                <SortableTableWrapper items={filteredTasks} onReorder={handleTaskReorder} as="div" handleOnly>
                                  {(tItem, idx, dndProps) => {
                                    const statusKey = (tItem.status || "").toLowerCase();
                                      return (
                                        <div className={`ptt-row ${currentUser?.role === "guest" ? "ptt-row--guest" : ""}`} key={tItem.id}>
                                          <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} id={tItem.id} businessId={tItem.business_id} />
                                          {currentUser?.role !== "guest" && <div>{isCreator || isAdminOrManager ? ((tItem.assignees || []).map((a) => a.name).join(", ") || "—") : (tItem.assigner?.name || "—")}</div>}
                                        <div className="ptt-col-name">
                                          <Link to={rolePath(`tasks/task-details/${tItem.id}`)} state={{ from: getTaskFrom(tItem) }} className="ptt-task-link">
                                            {tItem.title}
                                          </Link>
                                        </div>
                                        <div>
                                          <span className="badge" style={{ background: STATUS_COLORS[statusKey] || "var(--bg-hover)", color: STATUS_TEXT_COLORS[statusKey] || "var(--text-dark)" }}>
                                            <span className="dot" style={{ background: STATUS_TEXT_COLORS[statusKey] || "var(--text-dark)" }}></span>
                                            {formatStatus(tItem.status)}
                                          </span>
                                        </div>
                                        {(() => {
                                          const isTerminal = ["completed", "approved", "submitted", "submitted_late", "done"].includes((tItem.status || "").toLowerCase());
                                          const prog = isTerminal ? 100 : (tItem.deliverables_progress || 0);
                                          return (
                                            <div>
                                              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: "4px" }}>
                                                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-dark)" }}>
                                                  {prog}%
                                                </span>
                                              </div>
                                              <div className="progress-bar-track">
                                                <div className="progress-bar-fill" style={{ width: `${prog}%` }}></div>
                                              </div>
                                              <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                                                {t("{{approved}}/{{total}} Del. Approved", { approved: tItem.approved_deliverables || 0, total: tItem.total_deliverables || 0, defaultValue: `${tItem.approved_deliverables || 0}/${tItem.total_deliverables || 0} Del. Approved` })}
                                              </div>
                                            </div>
                                          );
                                        })()}
                                        <div>
                                          <span className="badge" style={{ background: PRIORITY_COLORS[tItem.priority] || "var(--bg-hover)", color: PRIORITY_TEXT_COLORS[tItem.priority] || "var(--text-dark)" }}>
                                            <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[tItem.priority] || "var(--text-dark)" }}></span>
                                            {t(tItem.priority || "Medium", { defaultValue: tItem.priority || "Medium" })}
                                          </span>
                                        </div>
                                        <div className="col-due-date">
                                          <div className="date-box">
                                            {renderDynamicDates(tItem, currentUser)}
                                          </div>
                                        </div>
                                        <div>
                                          <div className="action-btns">
                                            <ActionPopover
                                              trigger={
                                                <button className="action-icon-btn action-view action-trigger-lg" title={t("Actions", { defaultValue: "Actions" })}>
                                                  <IoEyeOutline size={20} />
                                                </button>
                                              }
                                              onTriggerClick={() => navigate(rolePath(`tasks/task-details/${tItem.id}`), { state: { from: getTaskFrom(tItem) } })}
                                            >
                                              <button className="action-icon-btn action-note" title={t("Add Note", { defaultValue: "Add Note" })} onClick={() => setNoteModal({ open: true, itemId: tItem.id })}>
                                                <StickyNote size={14} />
                                              </button>
                                              {(() => {
                                                const isAssigner = tItem.assigner?.id && tItem.assigner.id === currentUserId;
                                                const isAssignee = (tItem.assignees || []).some((a) => a.id === currentUserId);

                                                if (isAssigner) {
                                                  const buttons = [];
                                                  if (tItem.status?.toLowerCase() !== "approved") {
                                                    buttons.push(
                                                      <button
                                                        key="edit"
                                                        className="action-icon-btn action-edit"
                                                        title={t("Edit Task", { defaultValue: "Edit Task" })}
                                                        onClick={async () => {
                                                          try {
                                                            const token = authToken();
                                                            const res = await fetch(`${API}/tasks/${tItem.id}`, {
                                                              headers: { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
                                                            });
                                                            if (res.ok) {
                                                              const data = await res.json();
                                                              setEditingTask(data.task || tItem);
                                                            } else {
                                                              setEditingTask(tItem);
                                                            }
                                                          } catch {
                                                            setEditingTask(tItem);
                                                          }
                                                        }}
                                                      >
                                                        <Pencil size={16} />
                                                      </button>
                                                    );
                                                  }
                                                  buttons.push(
                                                    <button
                                                      key="delete"
                                                      className="action-icon-btn action-delete"
                                                      title={t("Delete Task", { defaultValue: "Delete Task" })}
                                                      onClick={(e) => handleDeleteTask(e, tItem.id)}
                                                    >
                                                      <Trash2 size={16} />
                                                    </button>
                                                  );
                                                  if (tItem.assigner_paused) {
                                                    buttons.push(
                                                      <button
                                                        key="resume"
                                                        className="action-icon-btn"
                                                        title={t("Resume", { defaultValue: "Resume" })}
                                                        disabled={resumingTaskId === tItem.id}
                                                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleTaskAssignerResume(tItem.id); }}
                                                        style={{ color: "#059669", cursor: resumingTaskId === tItem.id ? "not-allowed" : "pointer" }}
                                                      >
                                                        <Lock size={16} />
                                                      </button>
                                                    );
                                                  } else if (["pending", "in_progress", "reopened", "paused", "submitted"].includes(tItem.status?.toLowerCase())) {
                                                    buttons.push(
                                                      <button
                                                        key="hold"
                                                        className="action-icon-btn"
                                                        title={t("Pause", { defaultValue: "Pause" })}
                                                        disabled={holdingTaskId === tItem.id}
                                                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setPauseModalTaskId(tItem.id); setPauseModalOpen(true); }}
                                                        style={{ color: "#7C3AED", cursor: holdingTaskId === tItem.id ? "not-allowed" : "pointer" }}
                                                      >
                                                        <Lock size={16} />
                                                      </button>
                                                    );
                                                  }
                                                  return buttons;
                                                }

                                                if (isAssignee) {
                                                  if (tItem.assigner_paused) {
                                                    return (
                                                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "#FEF3C7", color: "#92400E", fontSize: "11px", fontWeight: 600, border: "1px solid #F59E0B" }}>
                                                        <Lock size={12} />
                                                        {t("Paused by Assigner", { defaultValue: "Paused by Assigner" })}
                                                      </span>
                                                    );
                                                  }
                                                  if (tItem.status === "pending") {
                                                    return (
                                                      <button className="action-icon-btn action-submit" title={t("Acknowledge", { defaultValue: "Acknowledge" })} onClick={(e) => handleTaskAcknowledge(e, tItem.id)}>
                                                        <CheckCircle2 size={16} />
                                                      </button>
                                                    );
                                                  }
                                                  if (tItem.status === "paused") {
                                                    return (
                                                      <button className="action-icon-btn action-submit" title={t("Continue", { defaultValue: "Continue" })} onClick={(e) => handleTaskContinue(e, tItem.id)} style={{ color: "#059669" }}>
                                                        <Play size={16} />
                                                      </button>
                                                    );
                                                  }
                                                  if (["in_progress", "submitted"].includes(tItem.status?.toLowerCase()) && !tItem.assigner_paused) {
                                                    return (
                                                      <button className="action-icon-btn action-submit" title={t("Pause", { defaultValue: "Pause" })} onClick={(e) => handleTaskPause(e, tItem.id)} style={{ color: "#D97706" }}>
                                                        <Pause size={16} />
                                                      </button>
                                                    );
                                                  }
                                                  if ((tItem.status === "in_progress" || tItem.status === "reopened") && tItem.assigner_paused === false) {
                                                    return (
                                                      <button
                                                        className="action-icon-btn action-submit"
                                                        title={tItem.pending_deliverables_count > 0 ? t("Submit all subtasks first", { defaultValue: "Submit all subtasks first" }) : t("Submit Task", { defaultValue: "Submit Task" })}
                                                        disabled={tItem.pending_deliverables_count > 0}
                                                        onClick={(e) => { e.stopPropagation(); !tItem.pending_deliverables_count && setSubmitTaskModal({ open: true, task: tItem }); }}
                                                        style={tItem.pending_deliverables_count > 0 ? { opacity: 0.4, cursor: "not-allowed" } : {}}
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
                            <h2 className="pd-block-title pd-block-title--inline">{t("Platform files & links ({{count}})", { count: files.length, defaultValue: `Platform files & links (${files.length})` })}</h2>
                            {files.length > 0 && (
                              <div className="pd-files-search" style={{ margin: "0 0 0 auto" }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                                <input
                                  type="text"
                                  placeholder={t("Search by file name or URL...", { defaultValue: "Search by file name or URL..." })}
                                  value={fileSearch}
                                  onChange={(e) => setFileSearch(e.target.value)}
                                />
                              </div>
                            )}
                            {isAdminOrManager && !isViewOnlyUser && (
                              <button type="button" className="pd-btn-tx pd-btn-tx--primary" onClick={() => setShowAddFileModal(true)} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <Plus size={16} /> {t("Add Files", { defaultValue: "Add Files" })}
                              </button>
                            )}
                          </div>

                          {files.length === 0 ? (
                            <p className="pd-muted">{t("No files attached.", { defaultValue: "No files attached." })}</p>
                          ) : (() => {
                            const filteredFiles = files.filter((f) => {
                              if (!fileSearch) return true;
                              const q = fileSearch.toLowerCase();
                              return (f.name || "").toLowerCase().includes(q) || (f.url || "").toLowerCase().includes(q);
                            });
                            return filteredFiles.length === 0 ? (
                              <p className="pd-muted">{t("No files match your search.", { defaultValue: "No files match your search." })}</p>
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
                                        <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} id={f.id} businessId={f.business_id} color="#16a34a" />
                                      </div>
                                       <div className="pd-file-box__content">
                                          <a
                                            href={fileUrl(f.url || f.file_path || f.path)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="pd-file-box__name"
                                            style={{ textDecoration: "none", color: "inherit", display: "inline-flex", alignItems: "center", gap: "6px" }}
                                          >
                                            <FolderOpen size={18} />
                                            <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>{f.name}</span>
                                          </a>
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
                            <h2 className="pd-block-title pd-block-title--inline">{t("Members", { defaultValue: "Members" })}</h2>
                            <div className="pd-files-search" style={{ margin: "0 0 0 auto" }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                              <input type="text" placeholder={t("Search by member name or role...", { defaultValue: "Search by member name or role..." })} value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
                            </div>
                            {isAdminOrManager && !isViewOnlyUser && (
                              <button
                                type="button"
                                onClick={() => setShowProjectMembersModal(true)}
                                className="pd-link-manage"
                                style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                              >
                                {t("Manage Members", { defaultValue: "Manage Members" })}
                              </button>
                            )}
                          </div>
                          {project.creator && (
                            <div className="pd-member">
                              <div className="pd-avatar" aria-hidden>
                                {initials(project.creator.name)}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="pd-member-name">{project.creator.name}</div>
                                <div className="pd-member-role">{t("Project Manager", { defaultValue: "Project Manager" })} · {project.creator.role || "—"}</div>
                              </div>
                              <div className="pd-member-right">
                                <span className="pd-badge-owner">{t("Project Manager", { defaultValue: "Project Manager" })}</span>
                              </div>
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
                                  <div className="pd-member-role">{m.role || t("Member", { defaultValue: "Member" })}</div>
                                </div>
                                <div className="pd-member-right">
                                  {m.department && <span className="pd-member-dept">{m.department}</span>}
                                  <span className="pd-badge-member">{t("Member", { defaultValue: "Member" })}</span>
                                </div>
                              </div>
                            )}
                          </SortableTableWrapper>
                        </section>

                        {(project.teams || []).length > 0 && (
                          <section className="pd-card-flat" style={{ marginTop: 16 }}>
                            <div className="pd-card-flat__head">
                              <h2 className="pd-block-title pd-block-title--inline" style={{ fontSize: 20 }}>{t("Teams", { defaultValue: "Teams" })}</h2>
                            </div>
                            {(project.teams || []).map((team) => (
                              <div key={team.id} style={{ marginBottom: 16 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid var(--border-color)" }}>
                                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{team.name}</h3>
                                  <span className="pd-badge-member">{t("Team", { defaultValue: "Team" })}</span>
                                </div>
                                {team.leader && (
                                  <div className="pd-member">
                                    <div className="pd-avatar" aria-hidden style={{ background: "var(--color-primary)" }}>
                                      {initials(team.leader.name)}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div className="pd-member-name">{team.leader.name}</div>
                                      <div className="pd-member-role">{t("Team Lead", { defaultValue: "Team Lead" })} · {team.leader.role || "—"}</div>
                                    </div>
                                    <div className="pd-member-right">
                                      <span className="pd-badge-owner">{t("Lead", { defaultValue: "Lead" })}</span>
                                    </div>
                                  </div>
                                )}
                                {(team.members || []).filter((m) => m.id !== team.leader?.id && m.id !== project.creator?.id).map((m) => (
                                  <div key={m.id} className="pd-member">
                                    <div className="pd-avatar" aria-hidden>
                                      {initials(m.name)}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div className="pd-member-name">{m.name}</div>
                                      <div className="pd-member-role">{m.role || t("Member", { defaultValue: "Member" })}</div>
                                    </div>
                                    <div className="pd-member-right">
                                      {m.department && <span className="pd-member-dept">{m.department}</span>}
                                      <span className="pd-badge-member">{t("Member", { defaultValue: "Member" })}</span>
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
                              <h2 className="pd-block-title pd-block-title--inline">{t("View Access", { defaultValue: "View Access" })}</h2>
                              <div className="pd-files-search" style={{ margin: "0 0 0 auto" }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                                <input type="text" placeholder={t("Search by user name...", { defaultValue: "Search by user name..." })} value={viewAccessSearch} onChange={(e) => setViewAccessSearch(e.target.value)} />
                              </div>
                            </div>
                            <p className="pd-muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
                              {t('These users have been granted view-only access via "Show To" and can see the project but are not team members.', { defaultValue: 'These users have been granted view-only access via "Show To" and can see the project but are not team members.' })}
                            </p>
                            {(() => {
                              const viewUsers = project.view_only_users || [];
                              const filtered = viewAccessSearch
                                ? viewUsers.filter((u) => (u.name || "").toLowerCase().includes(viewAccessSearch.toLowerCase()))
                                : viewUsers;
                              return filtered.length === 0 ? (
                                <p className="pd-muted" style={{ fontSize: 13 }}>{viewAccessSearch ? t("No matching users found.", { defaultValue: "No matching users found." }) : t("No view-only users.", { defaultValue: "No view-only users." })}</p>
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
                            <h2 className="pd-block-title pd-block-title--inline">{t("Project Access Credentials", { defaultValue: "Project Access Credentials" })}</h2>
                            <div className="pd-files-search" style={{ margin: "0 0 0 auto" }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                              <input type="text" placeholder={t("Search by title, username, or URL...", { defaultValue: "Search by title, username, or URL..." })} value={accessSearch} onChange={(e) => setAccessSearch(e.target.value)} />
                            </div>
                            {isAdminOrManager && !isViewOnlyUser && (
                              <button type="button" className="pd-btn-tx pd-btn-tx--primary" onClick={() => setShowAddAccessModal(true)} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <Plus size={16} /> {t("Add Access", { defaultValue: "Add Access" })}
                              </button>
                            )}
                          </div>
                          <p className="pd-muted" style={{ margin: "0 0 16px" }}>
                            {t("Store and manage login credentials for project-related websites. Passwords are encrypted and only visible to assigned users.", { defaultValue: "Store and manage login credentials for project-related websites. Passwords are encrypted and only visible to assigned users." })}
                          </p>

                          {loadingCredentials ? (
                            <p className="pd-muted">{t("Loading credentials...", { defaultValue: "Loading credentials..." })}</p>
                          ) : accessCredentials.length === 0 ? (
                            <p className="pd-muted">{t("No access credentials added yet. Click \"Add Access\" to store login details.", { defaultValue: "No access credentials added yet. Click \"Add Access\" to store login details." })}</p>
                          ) : (() => {
                            const filteredAccess = accessSearch ? accessCredentials.filter((cred) => {
                              const q = accessSearch.toLowerCase();
                              return (cred.title || "").toLowerCase().includes(q) || (cred.username || "").toLowerCase().includes(q) || (cred.url || "").toLowerCase().includes(q);
                            }) : accessCredentials;
                            return filteredAccess.length === 0 ? (
                              <p className="pd-muted">{t("No access credentials match your search.", { defaultValue: "No access credentials match your search." })}</p>
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

                    {tab === "kb" && (
                      <div className="pd-tab-panel">
                        <section className="pd-card-flat">
                          <div className="pd-card-flat__head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                            <div>
                              <h2 className="pd-block-title pd-block-title--inline" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <BookOpen size={20} color="#2563eb" /> {t("Project Knowledge Base & Documentation", { defaultValue: "Project Knowledge Base & Documentation" })}
                              </h2>
                              <p className="pd-muted" style={{ margin: "4px 0 0" }}>
                                {t("Technical specifications, SOPs, and guidelines specific to {{project}}.", { project: project?.title || "this project", defaultValue: `Technical specifications, SOPs, and guidelines specific to ${project?.title || "this project"}.` })}
                              </p>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <div className="pd-files-search" style={{ margin: 0 }}>
                                <input
                                  type="text"
                                  placeholder={t("Search project articles...", { defaultValue: "Search project articles..." })}
                                  value={kbSearch}
                                  onChange={(e) => setKbSearch(e.target.value)}
                                />
                              </div>
                              <button
                                type="button"
                                className="pd-btn-tx pd-btn-tx--primary"
                                onClick={() => navigate(rolePath("knowledge-base/create"), { state: { projectId: project?.id || projectId, projectTitle: project?.title } })}
                                style={{ display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}
                              >
                                <Plus size={16} /> {t("Add Document", { defaultValue: "Add Document" })}
                              </button>
                            </div>
                          </div>

                          {loadingKb ? (
                            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-secondary)" }}>
                              {t("Loading project knowledge base...", { defaultValue: "Loading project knowledge base..." })}
                            </div>
                          ) : (() => {
                            const filteredKb = Array.isArray(projectKbArticles) ? projectKbArticles.filter((a) => {
                              if (!kbSearch.trim()) return true;
                              const q = kbSearch.toLowerCase();
                              return (
                                a.title?.toLowerCase().includes(q) ||
                                a.content?.toLowerCase().includes(q) ||
                                a.categoryRelation?.name?.toLowerCase().includes(q) ||
                                a.category?.toLowerCase().includes(q)
                              );
                            }) : [];

                            if (filteredKb.length === 0) {
                              return (
                                <div style={{ textAlign: "center", padding: "50px 20px", background: "var(--bg-card-subtle)", borderRadius: "10px", marginTop: "16px" }}>
                                  <BookOpen size={40} style={{ color: "#9ca3af", margin: "0 auto 10px" }} />
                                  <h4 style={{ margin: "0 0 6px", fontSize: "15px", fontWeight: 600 }}>{t("No Knowledge Base linked to this project.", { defaultValue: "No Knowledge Base linked to this project." })}</h4>
                                  <p style={{ margin: "0 0 16px", fontSize: "13px", color: "var(--text-secondary)" }}>
                                    {t("Create and share SOPs, architectural guidelines, or deliverable checklists for this project.", { defaultValue: "Create and share SOPs, architectural guidelines, or deliverable checklists for this project." })}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => navigate(rolePath("knowledge-base/create"), { state: { projectId: project?.id || projectId, projectTitle: project?.title } })}
                                    style={{ padding: "7px 16px", borderRadius: "6px", background: "#2563eb", color: "#ffffff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                                  >
                                    <Plus size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} /> {t("Add Document", { defaultValue: "Add Document" })}
                                  </button>
                                </div>
                              );
                            }

                            return (
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "14px", marginTop: "18px" }}>
                                {filteredKb.map((item) => {
                                  const isLinked = item.isDirectLinked || String(item.id) === String(project?.kb_id || project?.knowledge_base?.id || project?.knowledgeBase?.id);
                                  return (
                                    <div
                                      key={item.id}
                                      style={{
                                        padding: "16px",
                                        borderRadius: "10px",
                                        border: isLinked ? "1px solid #93c5fd" : "1px solid var(--border-color)",
                                        background: isLinked ? "var(--bg-card, #f8fafc)" : "var(--bg-card)",
                                        display: "flex",
                                        flexDirection: "column",
                                        justifyContent: "space-between",
                                        boxShadow: isLinked ? "0 2px 6px rgba(37,99,235,0.08)" : "0 1px 3px rgba(0,0,0,0.03)",
                                      }}
                                    >
                                      <div>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "6px" }}>
                                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                            <span style={{ fontSize: "11px", fontWeight: 600, color: "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: "4px" }}>
                                              {item.categoryRelation?.name || item.category || t("General", { defaultValue: "General" })}
                                            </span>
                                            {isLinked && (
                                              <span style={{ fontSize: "11px", fontWeight: 700, color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "2px 8px", borderRadius: "4px" }}>
                                                {t("Linked to Project", { defaultValue: "Linked to Project" })}
                                              </span>
                                            )}
                                          </div>
                                          {item.views_count > 0 && (
                                            <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                                              <Eye size={12} /> {item.views_count}
                                            </span>
                                          )}
                                        </div>
                                        <h4 style={{ margin: "0 0 6px", fontSize: "15px", fontWeight: 600 }}>
                                          <Link
                                            to={rolePath ? rolePath(`knowledge-base/${item.id}`) : `/knowledge-base/${item.id}`}
                                            style={{ color: "var(--text-primary, #111827)", textDecoration: "none" }}
                                            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-primary, #2563eb)")}
                                            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-primary, #111827)")}
                                          >
                                            {item.title}
                                          </Link>
                                        </h4>
                                        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "12px" }}>
                                          {t("By {{author}} on {{date}}", { author: item.creator?.name || t("Team Member", { defaultValue: "Team Member" }), date: new Date(item.updated_at || item.created_at).toLocaleDateString(), defaultValue: `By ${item.creator?.name || "Team Member"} on ${new Date(item.updated_at || item.created_at).toLocaleDateString()}` })}
                                        </div>
                                      </div>
                                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", borderTop: "1px solid var(--border-color)", paddingTop: "10px" }}>
                                        <button
                                          type="button"
                                          onClick={() => navigate(rolePath(`knowledge-base/${item.id}`))}
                                          style={{ padding: "5px 12px", borderRadius: "6px", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                                        >
                                          {t("View Article", { defaultValue: "View Article" })}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </section>
                      </div>
                    )}

                    {tab === "events" && (
                      <div className="pd-tab-panel">
                        <section className="pd-card-flat">
                          <div className="pd-card-flat__head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                            <div>
                              <h2 className="pd-block-title pd-block-title--inline" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <Calendar size={20} color="#2563eb" /> {t("Project Events & Schedule", { defaultValue: "Project Events & Schedule" })}
                              </h2>
                              <p className="pd-muted" style={{ margin: "4px 0 0" }}>
                                {t("Sprint demos, milestone reviews, and team meetings for {{project}}.", { project: project?.title || "this project", defaultValue: `Sprint demos, milestone reviews, and team meetings for ${project?.title || "this project"}.` })}
                              </p>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <div className="pd-files-search" style={{ margin: 0 }}>
                                <input
                                  type="text"
                                  placeholder={t("Search project events...", { defaultValue: "Search project events..." })}
                                  value={eventSearch}
                                  onChange={(e) => setEventSearch(e.target.value)}
                                />
                              </div>
                              <button
                                type="button"
                                className="pd-btn-tx pd-btn-tx--primary"
                                onClick={() => navigate(rolePath("events/create"), { state: { projectId: project?.id || projectId, projectTitle: project?.title } })}
                                style={{ display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}
                              >
                                <Plus size={16} /> {t("Add Event", { defaultValue: "Add Event" })}
                              </button>
                            </div>
                          </div>

                          {loadingProjectEvents ? (
                            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-secondary)" }}>
                              {t("Loading project events...", { defaultValue: "Loading project events..." })}
                            </div>
                          ) : (() => {
                            const filteredEv = Array.isArray(projectEvents) ? projectEvents.filter((ev) => {
                              if (!eventSearch.trim()) return true;
                              const q = eventSearch.toLowerCase();
                              return (
                                ev.title?.toLowerCase().includes(q) ||
                                ev.description?.toLowerCase().includes(q) ||
                                ev.location?.toLowerCase().includes(q)
                              );
                            }) : [];

                            if (filteredEv.length === 0) {
                              return (
                                <div style={{ textAlign: "center", padding: "50px 20px", background: "var(--bg-card-subtle)", borderRadius: "10px", marginTop: "16px" }}>
                                  <Calendar size={40} style={{ color: "#9ca3af", margin: "0 auto 10px" }} />
                                  <h4 style={{ margin: "0 0 6px", fontSize: "15px", fontWeight: 600 }}>{t("No Events linked to this project.", { defaultValue: "No Events linked to this project." })}</h4>
                                  <p style={{ margin: "0 0 16px", fontSize: "13px", color: "var(--text-secondary)" }}>
                                    {t("Schedule sprint meetings, demo sessions, and release deadlines for this project.", { defaultValue: "Schedule sprint meetings, demo sessions, and release deadlines for this project." })}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => navigate(rolePath("events/create"), { state: { projectId: project?.id || projectId, projectTitle: project?.title } })}
                                    style={{ padding: "7px 16px", borderRadius: "6px", background: "#2563eb", color: "#ffffff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                                  >
                                    <Plus size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} /> {t("Add Event", { defaultValue: "Add Event" })}
                                  </button>
                                </div>
                              );
                            }

                            return (
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "14px", marginTop: "18px" }}>
                                {filteredEv.map((ev) => {
                                  const dateStr = ev.start_date ? new Date(ev.start_date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : t("Scheduled", { defaultValue: "Scheduled" });
                                  const timeStr = ev.start_date && !ev.all_day ? new Date(ev.start_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : (ev.all_day ? t("All Day", { defaultValue: "All Day" }) : "");
                                  const isLinked = ev.isDirectLinked || String(ev.id) === String(project?.event_id || project?.event?.id);

                                  return (
                                    <div
                                      key={ev.id}
                                      style={{
                                        padding: "16px",
                                        borderRadius: "10px",
                                        border: isLinked ? "1px solid #93c5fd" : "1px solid var(--border-color)",
                                        background: isLinked ? "var(--bg-card, #f8fafc)" : "var(--bg-card)",
                                        display: "flex",
                                        flexDirection: "column",
                                        justifyContent: "space-between",
                                        boxShadow: isLinked ? "0 2px 6px rgba(37,99,235,0.08)" : "0 1px 3px rgba(0,0,0,0.03)",
                                      }}
                                    >
                                      <div>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "6px" }}>
                                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                            <span style={{ fontSize: "11px", fontWeight: 600, color: ev.category?.color || "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: "4px" }}>
                                              {ev.category?.name || ev.type || t("Event", { defaultValue: "Event" })}
                                            </span>
                                            {isLinked && (
                                              <span style={{ fontSize: "11px", fontWeight: 700, color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "2px 8px", borderRadius: "4px" }}>
                                                {t("Linked to Project", { defaultValue: "Linked to Project" })}
                                              </span>
                                            )}
                                          </div>
                                          <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                            <Clock size={12} /> {timeStr || dateStr}
                                          </span>
                                        </div>
                                        <h4 style={{ margin: "0 0 6px", fontSize: "15px", fontWeight: 600 }}>
                                          <Link
                                            to={rolePath ? rolePath(`events/${ev.id}`) : `/events/${ev.id}`}
                                            style={{ color: "var(--text-primary, #111827)", textDecoration: "none" }}
                                            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-primary, #2563eb)")}
                                            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-primary, #111827)")}
                                          >
                                            {ev.title}
                                          </Link>
                                        </h4>
                                        <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "10px" }}>
                                          📅 {dateStr}
                                        </div>
                                        {ev.meeting_link && (
                                          <div style={{ fontSize: "12px", color: "#2563eb", marginBottom: "8px", display: "flex", alignItems: "center", gap: "4px" }}>
                                            <Video size={13} color="#10b981" /> {t("Virtual Meeting", { defaultValue: "Virtual Meeting" })}
                                          </div>
                                        )}
                                      </div>
                                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", borderTop: "1px solid var(--border-color)", paddingTop: "10px" }}>
                                        <button
                                          type="button"
                                          onClick={() => navigate(rolePath(`events/${ev.id}`))}
                                          style={{ padding: "5px 12px", borderRadius: "6px", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                                        >
                                          {t("View Event", { defaultValue: "View Event" })}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </section>
                      </div>
                    )}

                    {tab === "activity" && (
                      <div className="pd-tab-panel">
                        <section className="pd-card-flat" style={{ padding: "20px" }}>
                          <UnifiedActivityFeed module="project" entityId={projectId} initialUsers={members} />
                        </section>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
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
        title={t("Confirm Deletion", { defaultValue: "Confirm Deletion" })}
        message={t("Are you sure you want to delete this project? This action cannot be undone.", { defaultValue: "Are you sure you want to delete this project? This action cannot be undone." })}
        confirmText={t("Delete", { defaultValue: "Delete" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
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
        title={t("Confirm Deletion", { defaultValue: "Confirm Deletion" })}
        message={t("Are you sure you want to delete this task? This action cannot be undone.", { defaultValue: "Are you sure you want to delete this task? This action cannot be undone." })}
        confirmText={t("Delete", { defaultValue: "Delete" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
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
              <h3>{t("Show To — {{title}}", { title: project.title, defaultValue: `Show To — ${project.title}` })}</h3>
              <button className="sv-close-btn" onClick={handleVisClose}>✕</button>
            </div>
            <div className="sv-modal-body">
              {visibilityUsers.length > 0 && (
                <div className="sv-search-wrap">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                  <input
                    type="text"
                    className="sv-search-input"
                    placeholder={t("Search by name, role, department...", { defaultValue: "Search by name, role, department..." })}
                    value={visSearch}
                    onChange={(e) => setVisSearch(e.target.value)}
                  />
                  {visSearch && (
                    <button type="button" className="sv-search-clear" onClick={() => setVisSearch("")}>✕</button>
                  )}
                </div>
              )}
              {visibilityUsers.length === 0 ? (
                <p className="sv-muted">{t("Loading users...", { defaultValue: "Loading users..." })}</p>
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
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-warning)", background: "var(--color-warning-bg)", border: "1px solid var(--color-warning)", borderRadius: 6, padding: "1px 8px", fontWeight: 500 }}>{t("View Only", { defaultValue: "View Only" })}</span>
                    )}
                  </label>
                ))
              )}
            </div>
            <div className="sv-modal-footer">
              <button className="sv-cancel-btn" onClick={handleVisClose}>{t("Cancel", { defaultValue: "Cancel" })}</button>
              <button className="sv-save-btn" onClick={saveVisibility} disabled={visibilitySaving}>
                {visibilitySaving ? t("Saving...", { defaultValue: "Saving..." }) : t("Save", { defaultValue: "Save" })}
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
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-heading)" }}>{t("Edit File / Link", { defaultValue: "Edit File / Link" })}</h3>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-muted)" }}>{t("Rename or update the URL below.", { defaultValue: "Rename or update the URL below." })}</p>
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dark)", display: "block", marginBottom: 4 }}>{t("Title", { defaultValue: "Title" })}</label>
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
                  <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dark)", display: "block", marginBottom: 4 }}>{t("URL", { defaultValue: "URL" })}</label>
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
              <button type="button" onClick={() => setEditFileItem(null)} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid var(--border-medium)", background: "var(--bg-card)", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text-dark)" }}>{t("Cancel", { defaultValue: "Cancel" })}</button>
              <button type="button" onClick={handleRenameFile} disabled={!editFileName.trim()} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: editFileName.trim() ? "var(--color-primary)" : "var(--bg-hover)", color: editFileName.trim() ? "#fff" : "var(--text-muted)", fontSize: 13, fontWeight: 600, cursor: editFileName.trim() ? "pointer" : "not-allowed" }}>{t("Save", { defaultValue: "Save" })}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={deleteFileConfirmOpen}
        onClose={() => { setDeleteFileConfirmOpen(false); setPendingDeleteFile(null); }}
        onConfirm={handleDeleteFile}
        title={t("Delete File", { defaultValue: "Delete File" })}
        message={t('Are you sure you want to delete "{{name}}"? This action cannot be undone.', { name: pendingDeleteFile?.name, defaultValue: `Are you sure you want to delete "${pendingDeleteFile?.name}"? This action cannot be undone.` })}
        confirmText={t("Delete", { defaultValue: "Delete" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
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
        title={t("Delete Credential", { defaultValue: "Delete Credential" })}
        message={t("Are you sure you want to delete this access credential? This action cannot be undone.", { defaultValue: "Are you sure you want to delete this access credential? This action cannot be undone." })}
        confirmText={t("Delete", { defaultValue: "Delete" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        danger
      />

      {showManagerModal && (
        <div className="modal-overlay" onClick={handleMgrClose}>
          <div className="aam-modal" onClick={(e) => e.stopPropagation()}>
            <div className="aam-header">
              <h3>{t("Change Project Manager", { defaultValue: "Change Project Manager" })}</h3>
              <button className="aam-close" onClick={handleMgrClose}>
                <X size={18} />
              </button>
            </div>
            <div className="aam-body">
              <div className="aam-field">
                <label>
                  <Users size={14} /> {t("Select Manager *", { defaultValue: "Select Manager *" })}
                </label>
                <p className="aam-hint">{t("Choose a user to assign as project manager", { defaultValue: "Choose a user to assign as project manager" })}</p>
                <div className="aam-multiselect" ref={managerDropdownRef}>
                  <button
                    type="button"
                    className={`aam-multiselect-trigger ${managerDropdownOpen ? "aam-multiselect-trigger--open" : ""}`}
                    onClick={() => setManagerDropdownOpen(!managerDropdownOpen)}
                  >
                    <span className="aam-multiselect-value">
                      {selectedManagerId
                        ? managerUsers.find((u) => u.id === selectedManagerId)?.name || t("1 user selected", { defaultValue: "1 user selected" })
                        : t("Select users", { defaultValue: "Select users" })}
                    </span>
                    <ChevronDown size={16} className={`aam-multiselect-arrow ${managerDropdownOpen ? "aam-multiselect-arrow--open" : ""}`} />
                  </button>
                  {managerDropdownOpen && (
                    <div className="aam-multiselect-dropdown aam-multiselect-dropdown--down">
                      <div className="aam-multiselect-search">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                        <input
                          type="text"
                          placeholder={t("Search by name, role, department...", { defaultValue: "Search by name, role, department..." })}
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
                  {t("Cancel", { defaultValue: "Cancel" })}
                </button>
                <button
                  type="button"
                  className="aam-btn aam-btn-save"
                  onClick={saveManagerChange}
                  disabled={!selectedManagerId || selectedManagerId === project.creator?.id || savingManager}
                >
                  {savingManager ? t("Saving...", { defaultValue: "Saving..." }) : t("Save Change", { defaultValue: "Save Change" })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {MgrConfirmDialog}

      <ProjectMembersModal
        isOpen={showProjectMembersModal}
        onClose={() => setShowProjectMembersModal(false)}
        project={project}
        onSuccess={loadProject}
      />
    </>
  );
}

export default ProjectDetails;
