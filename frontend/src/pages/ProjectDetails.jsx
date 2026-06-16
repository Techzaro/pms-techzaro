/**
 * ProjectDetails page component.
 * Rendered when the user navigates to /projectdetails or related route.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { PiLineVerticalLight } from "react-icons/pi";
import {
  Activity,
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
  Percent,
  Settings,
  Send,
  Tag,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
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
import "./ProjectDetails.css";

import { authToken, getCurrentRole, getUser, rolePath } from "../utils/auth";
import API_URL from "../config/api";
const API = API_URL;

/**
 * Perform the status slug.
 */

/**
 * Handle status slug.
 */
function statusSlug(status) {
  return (status || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Perform the format short date.
 */

/**
 * Handle format short date.
 */
function formatShortDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Perform the time ago.
 */

/**
 * Handle time ago.
 */
function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hours ago`;
  return `${Math.floor(sec / 86400)} days ago`;
}

/**
 * Perform the task status label.
 */

/**
 * Handle task status label.
 */
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

/**
 * Perform the initials.
 */

/**
 * Handle initials.
 */
function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] || "";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase() || a.toUpperCase();
}

/**
 * Perform the sanitize html.
 */

/**
 * Handle sanitize html.
 */
function sanitizeHtml(html) {
  return String(html || "").replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
}

/**
 * Perform the project details.
 */

/**
 * Page displaying full project details, tasks, milestones and notes.
 */
function ProjectDetails() {
  const { projectId } = useParams();
  const navigate = useNavigate();
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
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteProjectConfirmOpen, setDeleteProjectConfirmOpen] = useState(false);
  const [deleteTaskConfirmOpen, setDeleteTaskConfirmOpen] = useState(false);
  const [deleteTaskId, setDeleteTaskId] = useState(null);
  const [submitModal, setSubmitModal] = useState({ open: false, deliverable: null });
  const [viewModal, setViewModal] = useState({ open: false, deliverable: null });
  const [assignerModal, setAssignerModal] = useState({ open: false, deliverable: null });
  const [submitProjectModal, setSubmitProjectModal] = useState({ open: false, project: null });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: null });
  const [reopenDialog, setReopenDialog] = useState(false);
  const [acting, setActing] = useState(false);

  const memberCount = useMemo(() => {
    if (!project) return 0;
    const ids = new Set();
    if (project.creator?.id) ids.add(project.creator.id);
    (project.members || []).forEach((m) => ids.add(m.id));
    return ids.size;
  }, [project]);

  const showMessage = useCallback((text, type = "success") => {
    setMessage(text);
    setMessageType(type);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 4000);
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
        progress_percent: delTotal > 0 ? Math.round((delCompleted / delTotal) * 100) : 0,
      };
    });
  };

  const handleProjectActionSuccess = (updatedProject) => {
    setProject((prev) => ({ ...prev, ...updatedProject }));
  };

  const loadProject = useCallback(async () => {
    const token = authToken();
    const res = await fetch(`${API}/projects/${projectId}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      throw new Error("Failed to load project");
    }
    const data = await res.json();
    const p = data.project;
    if (!p) throw new Error("Invalid response");
    setProject(p);
    setNotesDraft(p.sidebar_notes || "");
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
          showMessage("Unable to load project details.", "error");
          setTimeout(() => navigate(rolePath("projects")), 2000);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProject, navigate, showMessage]);


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
      });
      if (!res.ok) throw new Error("Failed to delete task");
      await loadProject();
      showMessage("Task deleted.");
    } catch (err) {
      console.error(err);
      showMessage("Failed to delete task.", "error");
    }
  };

  /**
   * Perform the handle save notes.
   */

  /**
   * Handle handle save notes.
   */
  const handleSaveNotes = async () => {
    setNotesSaving(true);
    try {
      const token = authToken();
      const res = await fetch(`${API}/projects/${projectId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sidebar_notes: notesDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Save failed");
      setProject((prev) => ({ ...prev, ...data.project }));
      showMessage("Notes saved.");
    } catch (err) {
      console.error(err);
      showMessage(err.message || "Could not save notes.", "error");
    } finally {
      setNotesSaving(false);
    }
  };

  /**
   * Perform the handle toggle goal.
   */

  /**
   * Handle handle toggle goal.
   */
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
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Update failed");
      setProject((prev) => ({ ...prev, ...data.project }));
    } catch (err) {
      console.error(err);
      showMessage("Could not update goals.", "error");
    }
  };

  /**
   * Perform the handle delete project.
   */

  /**
   * Handle handle delete project.
   */
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
      });
      if (!res.ok) throw new Error("Delete failed");
      showMessage("Project deleted.");
      setTimeout(() => navigate(rolePath("projects")), 800);
    } catch (err) {
      console.error(err);
      showMessage("Could not delete project.", "error");
    }
  };

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

  const tasks = project.tasks || [];
  const members = project.members || [];
  const milestones = project.milestones || [];
  const activities = project.activities || [];
  const files = project.files || [];
  const checklist = Array.isArray(project.goals_checklist) ? project.goals_checklist : [];
  const progress = typeof project.progress_percent === "number" ? project.progress_percent : 0;

  const currentUser = getUser();
  const currentUserId = currentUser ? parseInt(currentUser.id, 10) : null;
  const role = getCurrentRole();
  const isCreator = project.creator?.id === currentUserId;
  const isAssigned = currentUserId && (project.assigned_users || []).includes(currentUserId);
  const isAdminOrManager = role === "admin" || role === "manager";
  const canSubmitProject = (project.status === "pending" || project.status === "reopened" || project.status === "Planned" || project.status === "in_progress" || project.status === "In Progress") && (isAssigned || isCreator);
  const canReviewProject = project.status === "submitted" && (isCreator || isAdminOrManager);

  const tabs = [
    { id: "overview", label: "Overview", icon: ListChecks },
    { id: "tasks", label: "Tasks", icon: ClipboardList },
    { id: "deliverables", label: "Deliverables", icon: Calendar },
    { id: "files", label: "Files", icon: FolderOpen },
  ];

  /**
   * Perform the render rail.
   */

  /**
   * Handle render rail.
   */
  const renderRail = () => (
    <div className="pd-rail">
      <section className="pd-rail-card">
        <h3 className="pd-rail-card__title">Deadlines</h3>
        <ul className="pd-milestones">
          {milestones.length === 0 ? (
            <li className="pd-muted">No milestones.</li>
          ) : (
            milestones.map((m) => (
              <li key={m.id} className="pd-milestones__item">
                <span className={`pd-dot pd-dot--${statusSlug(m.status)}`} />
                <div>
                  <div className="pd-milestones__title">{m.title}</div>
                  <div className="pd-milestones__date">{formatShortDate(m.due_date)}</div>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="pd-rail-card">
        <h3 className="pd-rail-card__title">Tasks</h3>
        {tasks.length === 0 ? (
          <p className="pd-muted" style={{ margin: 0 }}>
            No tasks yet.
          </p>
        ) : (
          <ul className="pd-rail-tasks">
            {tasks.slice(0, 6).map((t) => (
              <li key={t.id} className="pd-rail-tasks__row">
                <span className="pd-rail-tasks__name">{t.title}</span>
                <span className={`pd-pill pd-pill--task-${statusSlug(taskStatusLabel(t.status))}`} style={{ fontSize: 10 }}>
                  {taskStatusLabel(t.status)}
                </span>
                <span className="pd-rail-tasks__due">{formatShortDate(t.end_date)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pd-rail-card">
        <h3 className="pd-rail-card__title">Notes</h3>
        <textarea
          className="pd-notes"
          rows={5}
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          placeholder="Client notes or internal reminders…"
        />
        <button type="button" className="pd-btn" disabled={notesSaving} onClick={handleSaveNotes}>
          {notesSaving ? "Saving…" : "Save notes"}
        </button>
      </section>

      <section className="pd-rail-card">
        <h3 className="pd-rail-card__title">Activity feed</h3>
        <ul className="pd-feed">
          {activities.length === 0 ? (
            <li className="pd-muted">No activity yet.</li>
          ) : (
            activities.slice(0, 8).map((a) => (
              <li key={a.id} className="pd-feed__row">
                <div className="pd-avatar pd-avatar--sm">{initials(a.user?.name || "?")}</div>
                <div>
                  <span className="pd-feed__who">{a.user?.name || "System"}</span>{" "}
                  <span className="pd-feed__text">{a.summary}</span>
                  <div className="pd-feed__when">{timeAgo(a.created_at)}</div>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );

  /**
   * Perform the overview inner.
   */

  /**
   * Handle overview inner.
   */
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
                <span className="pd-meta-rows__value">{formatShortDate(project.start_date)}</span>
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
            {["admin", "manager"].includes(getCurrentRole()) && (
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
        {message && <div className={`pd-toast pd-toast--${messageType}`}>{message}</div>}

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
            </div>
            {project.description && (
              <div className="pd-desc-tx pd-rich" dangerouslySetInnerHTML={{ __html: sanitizeHtml(project.description) }} />
            )}
            <div className="pd-hero-actions">
              <button className="td-nav-btn" onClick={() => goToProject(prevProjectId)} disabled={!prevProjectId} title="Previous project"><ChevronLeft size={18} /></button>
              <button className="td-nav-btn" onClick={() => goToProject(nextProjectId)} disabled={!nextProjectId} title="Next project"><ChevronRight size={18} /></button>
              <span className={`pd-pill-status pd-pill-status--${statusSlug(project.status)}`}>{project.status}</span>
              {["admin", "manager"].includes(getCurrentRole()) && (
                <button type="button" className="pd-btn-tx pd-btn-tx--outline" onClick={() => setShowEditModal(true)}>
                  <Pencil size={16} />
                  Edit Project
                </button>
              )}
              {canSubmitProject && (
                <button type="button" className="pd-btn-tx pd-btn-tx--primary" onClick={() => setSubmitProjectModal({ open: true, project })}>
                  <Send size={16} />
                  {project.status === "reopened" ? "Resubmit Project" : "Submit Project"}
                </button>
              )}
              {["admin", "manager"].includes(getCurrentRole()) && (
                <button type="button" className="pd-btn-tx pd-btn-tx--danger" onClick={handleDeleteProject}>
                  <Trash2 size={16} />
                  Delete
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="pd-stat-strip">
          <div className="pd-mini-stat">
            <div className="pd-mini-stat__ic pd-mini-stat__ic--blue">
              <Percent size={20} />
            </div>
            <div className="pd-mini-stat__text">
              <span className="pd-mini-stat__label">Overall Progress</span>
              <div className="pd-mini-stat__bar">
                <span style={{ width: `${progress}%` }} />
              </div>
              <span className="pd-mini-stat__val">{progress}%</span>
            </div>
          </div>
          <div className="pd-stat"> 
          <div className="pd-mini-stat1">
            <div className="pd-mini-stat__ic pd-mini-stat__ic--orange">
              <ClipboardList size={20} />
            </div>
            <div className="pd-mini-stat__text">
              <span className="pd-mini-stat__num">{tasks.length}</span>
              <span className="pd-mini-stat__label">Tasks</span>
            </div>
            </div>
            <PiLineVerticalLight fontSize={60} color="#aab1b9" />
            <div className="pd-mini-stat2">
              <div className="pd-mini-stat__ic pd-mini-stat__ic--indigo">
                <Users size={20} />
              </div>
              <div className="pd-mini-stat__text">
                <span className="pd-mini-stat__num">{memberCount}</span>
                <span className="pd-mini-stat__label">Members</span>
              </div>
            </div>
            <PiLineVerticalLight fontSize={60} color="#aab1b9" />
            <div className="pd-mini-stat3">
              <div className="pd-mini-stat__ic pd-mini-stat__ic--green">
                <CalendarDays size={20} />
              </div>
              <div className="pd-mini-stat__text">
                <span className="pd-mini-stat__num pd-mini-stat__num--sm">{formatShortDate(project.end_date)}</span>
                <span className="pd-mini-stat__label">Deadline</span>
              </div>
            </div>
          </div>
        </div>

        {/* Project Submission Workflow */}
        {(project.status === "submitted" || project.status === "reopened" || (["approved","rejected"].includes(project.status) && project.latestSubmission)) && (
          <ProjectSubmissionPanel
            project={project}
            isCreator={isCreator}
            isAssignee={isAssigned || isCreator}
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
                        <table className="pd-table">
                          <thead>
                            <tr>
                              <th>Task name</th>
                              <th>Assigned To</th>
                              <th>Status</th>
                              <th>Priority</th>
                              <th>Due date</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tasks.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="pd-muted pd-table-empty">
                                  No tasks yet.
                                </td>
                              </tr>
                            ) : (
                              tasks.map((t) => (
                                <tr key={t.id}>
                                  <td className="pd-table-strong">
                                    <Link to={rolePath(`tasks/task-details/${t.id}`)} style={{ color: "inherit", textDecoration: "none" }}>
                                      {t.title}
                                    </Link>
                                  </td>
                                  <td>{(t.assignees || []).map((a) => a.name).join(", ") || "—"}</td>
                                  <td>
                                    <span className={`pd-pill pd-pill--task-${statusSlug(taskStatusLabel(t.status))}`}>
                                      {taskStatusLabel(t.status)}
                                    </span>
                                  </td>
                                  <td>
                                    <span className={`pd-pill pd-pill--pri-${(t.priority || "medium").toLowerCase()}`}>{t.priority}</span>
                                  </td>
                                  <td>{formatShortDate(t.end_date)}</td>
                                  <td>
                                    <button type="button" className="pd-btn-tx pd-btn-tx--danger" style={{ padding: "4px 8px", fontSize: "12px" }} onClick={() => handleDeleteTask(t.id)}>
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
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
                        <table className="pd-table">
                          <thead>
                            <tr>
                              <th>Deliverable</th>
                              <th>Assigned To</th>
                              <th>Due Date</th>
                              <th>Status</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(project.deliverables || []).length === 0 ? (
                              <tr>
                                <td colSpan={5} className="pd-muted pd-table-empty">
                                  No deliverables.
                                </td>
                              </tr>
                            ) : (
                              (project.deliverables || []).map((d) => (
                                <tr key={d.id}>
                                  <td className="pd-table-strong">{d.title}</td>
                                  <td>{d.assignee?.name || "—"}</td>
                                  <td>{formatShortDate(d.due_date)}</td>
                                  <td>
                                    <span className={`pd-pill pd-pill--task-${statusSlug(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status)}`}>
                                      {(d.status || "").charAt(0).toUpperCase() + (d.status || "").slice(1)}
                                    </span>
                                  </td>
                                  <td>
                                         <div style={{ display: "flex", gap: "6px" }}>
                                          {(d.status === "pending" || d.status === "rejected" || d.status === "reopened") ? (
                                            <button
                                              type="button"
                                              className="pd-btn-tx pd-btn-tx--outline"
                                              style={{ padding: "4px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}
                                              onClick={() => setSubmitModal({ open: true, deliverable: d })}
                                            >
                                              <Send size={12} /> Submit
                                            </button>
                                          ) : (
                                            <button
                                              type="button"
                                              className="pd-btn-tx pd-btn-tx--outline"
                                              style={{ padding: "4px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}
                                              onClick={() => {
                                                if (getCurrentRole() === 'admin' || getCurrentRole() === 'manager' || (project.creator?.id && project.creator.id === authToken())) {
                                                  setAssignerModal({ open: true, deliverable: d });
                                                } else {
                                                  setViewModal({ open: true, deliverable: d });
                                                }
                                              }}
                                            >
                                              <Eye size={12} /> View
                                            </button>
                                          )}
                                        </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
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
                                <a href={f.url} target="_blank" rel="noopener noreferrer">
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

                {tab === "activity" && (
                  <div className="pd-tab-panel">
                    <section className="pd-card-flat">
                      <h2 className="pd-block-title">Project activity</h2>
                      <ul className="pd-feed pd-feed--full">
                        {activities.length === 0 ? (
                          <li className="pd-muted">No activity yet.</li>
                        ) : (
                          activities.map((a) => (
                            <li key={a.id} className="pd-feed__row">
                              <div className="pd-avatar pd-avatar--sm">{initials(a.user?.name || "?")}</div>
                              <div>
                                <span className="pd-feed__who">{a.user?.name || "System"}</span>{" "}
                                <span className="pd-feed__text">{a.summary}</span>
                                <div className="pd-feed__when">{timeAgo(a.created_at)}</div>
                              </div>
                            </li>
                          ))
                        )}
                      </ul>
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
