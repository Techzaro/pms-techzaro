/**
 * ProjectDetails page component.
 * Rendered when the user navigates to /projectdetails or related route.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";

import {
  Building2,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Eye,
  FolderOpen,
  ListChecks,
  Monitor,
  Pencil,
  Plus,
  Send,
  Tag,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import SortableTableWrapper from "../components/SortableTableWrapper";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import CreateTaskModal from "../components/CreateTaskModal";
import EditProjectModal from "../components/EditProjectModal";
import SubmitDeliverableModal from "../components/SubmitDeliverableModal";
import ViewDeliverableModal from "../components/ViewDeliverableModal";
import AssignerViewModal from "../components/AssignerViewModal";
import ConfirmModal from "../components/ConfirmModal";
import SubmitProjectModal from "../components/SubmitProjectModal";
import ProjectSubmissionPanel from "../components/ProjectSubmissionPanel";
import SubmitTaskModal from "../components/SubmitTaskModal";
import { formatDateTimeShort, formatDateTime, formatDateTimeInline } from "../utils/formatDateTime";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage } from "../utils/notify";
import { useActivityHighlight } from "../hooks/useActivityHighlight";
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
  pending: "#FEF3C7",
  submitted: "#DBEAFE",
  reopened: "#EDE9FE",
  approved: "#DCFCE7",
  rejected: "#FEE2E2",
};

const STATUS_TEXT_COLORS = {
  pending: "#92400E",
  submitted: "#1E40AF",
  reopened: "#5B21B6",
  approved: "#166534",
  rejected: "#991B1B",
};

const PRIORITY_COLORS = {
  High: "#FEE2E2",
  Medium: "#FEF3C7",
  Low: "#DCFCE7",
};

const PRIORITY_TEXT_COLORS = {
  High: "#991B1B",
  Medium: "#92400E",
  Low: "#166534",
};

function formatStatus(status) {
  const map = {
    pending: "Pending",
    submitted: "Submitted",
    reopened: "Reopened",
    approved: "Approved",
    rejected: "Rejected",
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
  if (s === "rejected") return "Rejected";
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
  const [submitModal, setSubmitModal] = useState({ open: false, deliverable: null });
  const [viewModal, setViewModal] = useState({ open: false, deliverable: null });
  const [assignerModal, setAssignerModal] = useState({ open: false, deliverable: null });
  const [submitProjectModal, setSubmitProjectModal] = useState({ open: false, project: null });
  const [submitTaskModal, setSubmitTaskModal] = useState({ open: false, task: null });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: null });
  const [reopenDialog, setReopenDialog] = useState(false);
  const [acting, setActing] = useState(false);
  const [orderedTasks, setOrderedTasks] = useState([]);
  const [orderedDeliverables, setOrderedDeliverables] = useState([]);

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
    setOrderedDeliverables(project?.deliverables || []);
  }, [project?.deliverables]);

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

  const handleDeliverableReorder = useCallback((reordered) => {
    setOrderedDeliverables(reordered);
    const payload = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
    fetch(`${API}/deliverables/reorder`, {
      method: 'POST',
      headers: authHeadersLocal(),
      body: JSON.stringify({ items: payload }),
      _notifHandled: true,
    }).catch(() => { });
  }, []);

  const handleDeliverableActionSuccess = (updatedDeliverable) => {
    setProject((prev) => {
      const updatedDeliverables = (prev.deliverables || []).map((d) =>
        d.id === updatedDeliverable.id ? { ...d, ...updatedDeliverable } : d
      );
      const delTotal = updatedDeliverables.length;
      const delCompleted = updatedDeliverables.filter((d) => d.status === "approved").length;
      return {
        ...prev,
        deliverables: updatedDeliverables,
        total_deliverables: delTotal,
        completed_deliverables: delCompleted,
      };
    });
    publish('deliverable:updated', updatedDeliverable);
    publish('data:changed', { type: 'deliverable', action: 'updated' });
  };

  const handleProjectActionSuccess = (updatedProject) => {
    setProject((prev) => ({ ...prev, ...updatedProject }));
    publish('project:updated', updatedProject);
    publish('data:changed', { type: 'project', action: 'updated' });
  };

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
      throw new Error("Failed to load project");
    }
    const data = await res.json();
    const p = data.project;
    if (!p) throw new Error("Invalid response");
    setProject(p);
    return p;
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await loadProject();
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          notify.error("Unable to load project details.");
          setTimeout(() => navigate(rolePath("projects")), 2000);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProject, navigate, notify]);

  useRefreshOnEvent(['task:created', 'task:updated', 'task:deleted', 'project:updated', 'project:deleted', 'deliverable:updated'], loadProject);

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

  const handleToggleGoal = async (index) => {
    const list = Array.isArray(project.goals_checklist) ? [...project.goals_checklist] : [];
    if (!list[index]) return;
    list[index] = { ...list[index], done: !list[index].done };
    try {
      const token = authToken();
      const res = await fetch(`${API}/projects/${projectId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ goals_checklist: list }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Update failed");
      setProject((prev) => ({ ...prev, ...data.project }));
    } catch (err) {
      console.error(err);
      notify.error("Could not update goals.");
    }
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
  const milestones = project.milestones || [];
  const files = project.files || [];
  const checklist = Array.isArray(project.goals_checklist) ? project.goals_checklist : [];
  const tasks = orderedTasks.length ? orderedTasks : (project.tasks || []);
  const progress = typeof project.progress_percent === "number" ? project.progress_percent : calculateProjectProgress(project.tasks || []);

  const currentUser = getUser();
  const currentUserId = currentUser?.id;

  const isCreator = project.is_creator;
  const isAssigned = project.is_assigned;
  const isAdminOrManager = project.is_admin_or_manager;

  const canEdit = project.can_edit;
  const canSubmitProject = tasks.length > 0 && tasks.every((t) => t.status === "approved");

  const tabs = [
    { id: "overview", label: "Overview", icon: ListChecks },
    { id: "tasks", label: "Tasks", icon: ClipboardList },
    { id: "deliverables", label: "Deliverables", icon: Calendar },
    { id: "files", label: "Files", icon: FolderOpen },
  ];

  const renderRail = () => (
    <div className="pd-rail">
      <section className="pd-rail-card">
        <h1 className="pd-rail-card__title">Deadlines</h1>
        <ul className="pd-milestones">
          {milestones.length === 0 ? (
            <li className="pd-muted">No milestones.</li>
          ) : (
            milestones.map((m) => (
              <li key={m.id} className="pd-milestones__item">
                <span className={`pd-dot pd-dot--${statusSlug(m.status)}`} />
                <div>
                  <div className="pd-milestones__title">{m.title}</div>
                  <div className="pd-milestones__date">{formatDateTimeShort(m.due_date)}</div>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

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
                      <strong>{c.modified_by?.name || 'Unknown'}</strong> changed{' '}
                      <strong>{c.field_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</strong>
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
      <div className="pd-shell-split">
        <div className="pd-shell-left">
          <h2 className="pd-block-title">Project Description</h2>
          {project.description ? (
            <div className="pd-rich" dangerouslySetInnerHTML={{ __html: sanitizeHtml(project.description) }} />
          ) : (
            <p className="pd-muted">No description.</p>
          )}

          <h2 className="pd-block-title pd-block-title--gap">Project Goals</h2>
          {checklist.length > 0 ? (
            <ul className="pd-goals">
              {checklist.map((item, idx) => (
                <li key={idx} className="pd-goal-row">
                  <button
                    type="button"
                    className={`pd-goal-check ${item.done ? "pd-goal-check--on" : "pd-goal-check--off"}`}
                    onClick={() => handleToggleGoal(idx)}
                    aria-pressed={!!item.done}
                  >
                    {item.done ? "✓" : ""}
                  </button>
                  <span className={item.done ? "pd-goal-done" : ""}>{item.text}</span>
                </li>
              ))}
            </ul>
          ) : project.goals ? (
            <div className="pd-rich" dangerouslySetInnerHTML={{ __html: sanitizeHtml(project.goals) }} />
          ) : (
            <p className="pd-muted">No goals recorded.</p>
          )}
        </div>

        <aside className="pd-shell-right">
          <h2 className="pd-block-title">Project details</h2>
          <ul className="pd-meta-rows">
            <li>
              <span className="pd-meta-rows__ic">
                <UserRound size={18} />
              </span>
              <div>
                <span className="pd-meta-rows__label">Project owner</span>
                <span className="pd-meta-rows__value">{project.creator?.name || "—"}</span>
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
                <FolderOpen size={18} />
              </span>
              <div>
                <span className="pd-meta-rows__label">Category</span>
                <span className="pd-meta-rows__value">{project.category || "—"}</span>
              </div>
            </li>
            {isAdminOrManager && (
              <li>
                <span className="pd-meta-rows__ic">
                  <DollarSign size={18} />
                </span>
                <div>
                  <span className="pd-meta-rows__label">Budget</span>
                  <span className="pd-meta-rows__value">
                    {project.budget != null && project.budget !== "" ? `USD ${Number(project.budget).toLocaleString()}` : "—"}
                  </span>
                </div>
              </li>
            )}
          </ul>
        </aside>
      </div>

      <div className="pd-bottom-grid">
        <section className="pd-card-flat">
          <div className="pd-card-flat__head">
            <h2 className="pd-block-title pd-block-title--inline">Team members</h2>
            <Link to={rolePath("manage-team")} className="pd-link-manage">
              Manage
            </Link>
          </div>
          <ul className="pd-member-list">
            {project.creator && (
              <li className="pd-member">
                <div className="pd-avatar" aria-hidden>
                  {initials(project.creator.name)}
                </div>
                <div>
                  <div className="pd-member-name">{project.creator.name}</div>
                  <div className="pd-member-role">Owner · {project.creator.role || "—"}</div>
                </div>
                <span className="pd-badge-owner">Owner</span>
              </li>
            )}
            {members
              .filter((m) => m.id !== project.creator?.id)
              .map((m) => (
                <li key={m.id} className="pd-member">
                  <div className="pd-avatar" aria-hidden>
                    {initials(m.name)}
                  </div>
                  <div>
                    <div className="pd-member-name">{m.name}</div>
                    <div className="pd-member-role">{m.role || "Member"}</div>
                  </div>
                  <span className="pd-badge-member">Member</span>
                </li>
              ))}
          </ul>
        </section>
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

            {isAssigned && project?.unviewed_changes?.length > 0 && (
              <div className="td-changes-panel" style={{ marginTop: "6px", marginBottom: "12px" }}>
                <div className="td-changes-header">
                  <span className="td-changes-icon">&#9654;</span>
                  <span className="td-changes-title">Recent Changes</span>
                  <span className="td-changes-count">{project.unviewed_changes.length} update(s)</span>
                </div>
                <ul className="td-changes-list">
                  {project.unviewed_changes.map((c, i) => (
                    <li key={c.id || i}>
                      <strong>{c.modified_by?.name || "Someone"}</strong> changed{' '}
                      <strong>{c.field_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</strong>
                      {c.old_value ? (
                        <span className="td-change-detail"> — {c.old_value} &rarr; {c.new_value}</span>
                      ) : (
                        <span className="td-change-detail"> — {c.new_value}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <header className="pd-hero-tx">
              <div className="pd-hero-tx__main">
                <div className="pd-title-row">
                  <div className="pd-title-icon" aria-hidden>
                    <Monitor size={28} strokeWidth={1.75} />
                  </div>
                  <h1 className="pd-title-tx">{project.title}</h1>
                  <div className="pd-hero-actions">
                    <button className="td-nav-btn" onClick={() => goToProject(prevProjectId)} disabled={!prevProjectId} title="Previous project"><ChevronLeft size={18} /></button>
                    <button className="td-nav-btn" onClick={() => goToProject(nextProjectId)} disabled={!nextProjectId} title="Next project"><ChevronRight size={18} /></button>
                    <span className={`pd-pill-status pd-pill-status--${statusSlug(project.status)}`}>{project.status}</span>
                    {canEdit && (
                      <button type="button" className="pd-btn-tx pd-btn-tx--outline" onClick={() => setShowEditModal(true)}>
                        <Pencil size={16} />
                        Edit Project
                      </button>
                    )}
                    {isAssigned && ["pending", "reopened", "Planned", "in_progress", "In Progress"].includes(project?.status) && (
                      <button
                        type="button"
                        className="pd-btn-tx pd-btn-tx--primary"
                        disabled={!canSubmitProject}
                        title={!canSubmitProject ? "All tasks and deliverables must be approved first" : ""}
                        onClick={() => setSubmitProjectModal({ open: true, project })}
                        style={!canSubmitProject ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                      >
                        <Send size={16} />
                        {project.status === "reopened" ? "Resubmit Project" : "Submit Project"}
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
                {project.description && (
                  <div className="pd-desc-tx pd-rich" dangerouslySetInnerHTML={{ __html: sanitizeHtml(project.description) }} />
                )}
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

            {(project.status === "submitted" || project.status === "reopened" || (["approved", "rejected"].includes(project.status) && project.latestSubmission)) && (
              <ProjectSubmissionPanel
                project={project}
                isCreator={isCreator}
                isAssignee={isAssigned}
                onProjectUpdate={handleProjectActionSuccess}
                onSubmitClick={() => setSubmitProjectModal({ open: true, project })}
                confirmDialog={confirmDialog}
                setConfirmDialog={setConfirmDialog}
                reopenDialog={reopenDialog}
                setReopenDialog={setReopenDialog}
                acting={acting}
                setActing={setActing}
              />
            )}

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
                            <button type="button" className="pd-btn-tx pd-btn-tx--primary" onClick={() => setShowTaskModal(true)} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <Plus size={16} /> Add Task
                            </button>
                          </div>
                          <div className="pd-table-wrap">
                            <div className="project-task-table">
                              <div className="ptt-header">
                                <div>{isCreator || isAdminOrManager ? "Assigned To" : "Assigned By"}</div>
                                <div className="ptt-col-name">Task Name</div>
                                <div>Status</div>
                                <div>Progress</div>
                                <div>Priority</div>
                                <div>Due Date</div>
                                <div>Action</div>
                              </div>
                              {tasks.length === 0 ? (
                                <div className="pd-muted pd-table-empty" style={{ padding: "20px", textAlign: "center" }}>No tasks yet.</div>
                              ) : (
                                <SortableTableWrapper items={tasks} onReorder={handleTaskReorder} as="div">
                                  {(t) => {
                                    const statusKey = (t.status || "").toLowerCase();
                                    return (
                                      <div className="ptt-row" key={t.id}>
                                        <div>{isCreator || isAdminOrManager ? ((t.assignees || []).map((a) => a.name).join(", ") || "—") : (t.assigner?.name || "—")}</div>
                                        <div className="ptt-col-name">
                                          <Link to={rolePath(`tasks/task-details/${t.id}`)} className="ptt-task-link">
                                            {t.title}
                                          </Link>
                                        </div>
                                        <div>
                                          <span className="badge" style={{ background: STATUS_COLORS[statusKey] || "#F3F4F6", color: STATUS_TEXT_COLORS[statusKey] || "#374151" }}>
                                            <span className="dot" style={{ background: STATUS_TEXT_COLORS[statusKey] || "#374151" }}></span>
                                            {formatStatus(t.status)}
                                          </span>
                                        </div>
                                        <div>
                                          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: "4px" }}>
                                            <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
                                              {t.deliverables_progress || 0}%
                                            </span>
                                          </div>
                                          <div className="progress-bar-track">
                                            <div className="progress-bar-fill" style={{ width: `${t.deliverables_progress || 0}%` }}></div>
                                          </div>
                                          <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>
                                            {t.approved_deliverables || 0}/{t.total_deliverables || 0} Del. Approved
                                          </div>
                                        </div>
                                        <div>
                                          <span className="badge" style={{ background: PRIORITY_COLORS[t.priority] || "#F3F4F6", color: PRIORITY_TEXT_COLORS[t.priority] || "#374151" }}>
                                            <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[t.priority] || "#374151" }}></span>
                                            {t.priority}
                                          </span>
                                        </div>
                                        <div style={{ whiteSpace: "pre-line" }}>{formatDateTime(t.end_date)}</div>
                                        <div>
                                          <div className="action-btns">
                                            <button className="action-icon-btn action-view" title="View" onClick={() => navigate(rolePath(`tasks/task-details/${t.id}`), { state: { from: 'project-details' } })}><IoEyeOutline /></button>
                                            {(() => {
                                              const isAssigner = t.assigner?.id && t.assigner.id === currentUserId;
                                              const isAssignee = (t.assignees || []).some((a) => a.id === currentUserId);
                                              const showSubmit = (t.status === "pending" || t.status === "reopened") && isAssignee;
                                              const showDelete = false;
                                              return (
                                                <>
                                                  {showSubmit && (
                                                    <button
                                                      className="action-icon-btn action-submit"
                                                      title={t.pending_deliverables_count > 0 ? "Submit all deliverables first" : "Submit Task"}
                                                      disabled={t.pending_deliverables_count > 0}
                                                      onClick={() => !t.pending_deliverables_count && setSubmitTaskModal({ open: true, task: t })}
                                                      style={t.pending_deliverables_count > 0 ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                                                    >
                                                      <LuSend size={14} />
                                                    </button>
                                                  )}
                                                  {showDelete && (
                                                    <button type="button" className="action-icon-btn action-delete" title="Delete" onClick={() => handleDeleteTask(t.id)}>
                                                      <Trash2 size={14} />
                                                    </button>
                                                  )}
                                                </>
                                              );
                                            })()}
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

                    {tab === "deliverables" && (
                      <div className="pd-tab-panel">
                        <section className="pd-card-flat pd-card-flat--table">
                          <div className="pd-card-flat__head">
                            <h2 className="pd-block-title pd-block-title--inline">Deliverables</h2>
                          </div>
                          <div className="pd-table-wrap">
                            <div className="deliveries-table-header pd-deliverables-grid">
                              <div>Deliverable</div>
                              <div>{isAdminOrManager || isCreator ? "Assigned To" : "Assigned By"}</div>
                              <div>Due Date</div>
                              <div>Status</div>
                              <div>Action</div>
                            </div>
                            {(orderedDeliverables.length === 0 && (project.deliverables || []).length === 0) ? (
                              <div className="pd-muted pd-table-empty" style={{ padding: "20px", textAlign: "center" }}>No deliverables.</div>
                            ) : (
                              <SortableTableWrapper
                                items={(orderedDeliverables.length ? orderedDeliverables : (project.deliverables || [])).map((d, idx) => ({ ...d, sortableId: `del-${d.id || idx}` }))}
                                onReorder={handleDeliverableReorder}
                                idKey="sortableId"
                                as="div"
                              >
                                {(d, idx) => {
                                  const deliverableName = d.deliverable_name || d.name || d.title || d.label || d.description || '';
                                  const displayName = deliverableName || `Deliverable ${idx + 1}`;
                                  const isAssigner = d.created_by && d.created_by === currentUserId;
                                  const isAssignee = d.assignee?.id && d.assignee.id === currentUserId;
                                  const isSubmittable = d.status === "pending" || d.status === "rejected" || d.status === "reopened";
                                  const showSubmit = isSubmittable && isAssignee;
                                  const showView = !isSubmittable || isAssigner || isAdminOrManager;
                                  const statusKey = (d.status || '').toLowerCase();

                                  return (
                                    <div className="deliveries-table-row pd-deliverables-grid" key={d.sortableId}>
                                      <div className="user-box">
                                        <div className="avatar" style={{ background: '#EEF2FF', color: '#4F46E5', width: '42px', height: '42px', fontSize: '14px' }}>
                                          {initials(displayName)}
                                        </div>
                                        <div>
                                          <div className="user-name">{displayName}</div>
                                        </div>
                                      </div>
                                      <div>
                                        <div className="user-name">{isAdminOrManager || isCreator ? (d.assignee?.name || d.assigned_to?.name || "—") : (d.creator?.name || "—")}</div>
                                        <div className="user-role">{isAdminOrManager || isCreator ? (d.assignee?.role ? d.assignee.role.replace("_", " ") : "") : (d.creator?.role ? d.creator.role.replace("_", " ") : "")}</div>
                                      </div>
                                      <div className="date-box" style={{ whiteSpace: "pre-line" }}>{formatDateTime(d.due_date || d.dueDate)}</div>
                                      <div>
                                        <span className="badge" style={{ background: STATUS_COLORS[statusKey] || "#F3F4F6", color: STATUS_TEXT_COLORS[statusKey] || "#374151" }}>
                                          <span className="dot" style={{ background: STATUS_TEXT_COLORS[statusKey] || "#374151" }}></span>
                                          {formatStatus(d.status)}
                                        </span>
                                      </div>
                                      <div className="action-btns">
                                        {showSubmit && (
                                          <button className="action-icon-btn action-submit" title="Submit" onClick={() => setSubmitModal({ open: true, deliverable: d })}>
                                            <LuSend size={16} />
                                          </button>
                                        )}
                                        {showView && (
                                          <button className="action-icon-btn action-view" title="View" onClick={() => {
                                            if (isAssigner || isAdminOrManager) {
                                              setAssignerModal({ open: true, deliverable: d });
                                            } else {
                                              setViewModal({ open: true, deliverable: d });
                                            }
                                          }}>
                                            <IoEyeOutline size={16} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                }}
                              </SortableTableWrapper>
                            )}
                          </div>
                        </section>
                      </div>
                    )}

                    {tab === "files" && (
                      <div className="pd-tab-panel">
                        <section className="pd-card-flat">
                          <h2 className="pd-block-title">Files & links</h2>

                          {files.length === 0 ? (
                            <p className="pd-muted">No files attached.</p>
                          ) : (
                            <ul className="pd-file-list">
                              {files.map((f) => (
                                <li key={f.id}>
                                  <FolderOpen size={18} />
                                  {f.url ? (
                                    <a
                                      href={fileUrl(f.url)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      {f.name}
                                    </a>
                                  ) : (
                                    <span>{f.name}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}

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
        key={`pd-submit-${submitModal.deliverable?.id || "none"}`}
        isOpen={submitModal.open}
        onClose={() => setSubmitModal({ open: false, deliverable: null })}
        deliverable={submitModal.deliverable}
        onSubmitSuccess={handleDeliverableActionSuccess}
      />

      <SubmitProjectModal
        key={`pd-project-submit-${submitProjectModal.project?.id || "none"}`}
        isOpen={submitProjectModal.open}
        onClose={() => setSubmitProjectModal({ open: false, project: null })}
        project={submitProjectModal.project}
        onSubmitSuccess={handleProjectActionSuccess}
      />

      <ViewDeliverableModal
        key={`pd-view-${viewModal.deliverable?.id || "none"}`}
        isOpen={viewModal.open}
        onClose={() => setViewModal({ open: false, deliverable: null })}
        deliverable={viewModal.deliverable}
        onSubmitSuccess={handleDeliverableActionSuccess}
      />

      <AssignerViewModal
        key={`pd-assigner-${assignerModal.deliverable?.id || "none"}`}
        isOpen={assignerModal.open}
        onClose={() => setAssignerModal({ open: false, deliverable: null })}
        deliverable={assignerModal.deliverable}
        onActionSuccess={handleDeliverableActionSuccess}
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
    </>
  );
}

export default ProjectDetails;