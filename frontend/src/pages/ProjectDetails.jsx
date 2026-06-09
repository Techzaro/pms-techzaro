/**
 * ProjectDetails page component.
 * Rendered when the user navigates to /projectdetails or related route.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  Building2,
  Calendar,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  DollarSign,
  FolderOpen,
  ListChecks,
  Monitor,
  Pencil,
  Percent,
  Settings,
  Tag,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import DashboardLayout from "../components/layout/DashboardLayout";
import CreateTaskModal from "../components/CreateTaskModal";
import EditProjectModal from "../components/EditProjectModal";
import "./ProjectDetails.css";

import { authToken, getCurrentRole, rolePath } from "../utils/auth";
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
  /**
   * Perform the s.
   */

  /**
   * Handle s.
   */
  const s = (status || "").toLowerCase();
  if (s === "completed" || s === "done") return "Completed";
  if (s === "in_progress") return "In Progress";
  if (s === "pending") return "Pending";
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
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

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
    if (!window.confirm("Delete this task?")) return;
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
    if (!window.confirm("Delete this project permanently?")) return;
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
  const recentTasks = tasks.filter((t) => t.status === 'in_progress').slice(0, 6);

  const tabs = [
    { id: "overview", label: "Overview", icon: ListChecks },
    { id: "tasks", label: "Tasks", icon: Calendar },
    { id: "team", label: "Team", icon: Users },
    { id: "activity", label: "Activity", icon: Activity },
    { id: "files", label: "Files", icon: FolderOpen },
    { id: "settings", label: "Settings", icon: Settings },
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
        <section className="pd-card-flat pd-card-flat--table">
          <div className="pd-card-flat__head">
            <h2 className="pd-block-title pd-block-title--inline">Recent Tasks</h2>
          </div>
          <div className="pd-table-wrap">
            <table className="pd-table">
              <thead>
                <tr>
                  <th>Task name</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Due date</th>
                </tr>
              </thead>
              <tbody>
                {recentTasks.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="pd-muted pd-table-empty">
                      No tasks yet.
                    </td>
                  </tr>
                ) : (
                  recentTasks.map((t) => (
                    <tr key={t.id}>
                      <td className="pd-table-strong">{t.title}</td>
                      <td>
                        <span className={`pd-pill pd-pill--task-${statusSlug(taskStatusLabel(t.status))}`}>
                          {taskStatusLabel(t.status)}
                        </span>
                      </td>
                      <td>
                        <span className={`pd-pill pd-pill--pri-${(t.priority || "medium").toLowerCase()}`}>{t.priority}</span>
                      </td>
                      <td>{formatShortDate(t.end_date)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

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

        <nav className="pd-breadcrumb" aria-label="Breadcrumb">
          <Link to={rolePath("projects")}>Projects</Link>
          <ChevronRight size={14} aria-hidden />
          <span>{project.title}</span>
        </nav>

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
              <span className={`pd-pill-status pd-pill-status--${statusSlug(project.status)}`}>{project.status}</span>
              {["admin", "manager"].includes(getCurrentRole()) && (
                <button type="button" className="pd-btn-tx pd-btn-tx--outline" onClick={() => setShowEditModal(true)}>
                  <Pencil size={16} />
                  Edit Project
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
          <div className="pd-mini-stat1">
            <div className="pd-mini-stat__ic pd-mini-stat__ic--orange">
              <ClipboardList size={20} />
            </div>
            <div className="pd-mini-stat__text">
              <span className="pd-mini-stat__label">Tasks</span>
              <span className="pd-mini-stat__num">{tasks.length}</span>
            </div>
            <div className="pd-mini-stat2">
              <div className="pd-mini-stat__ic pd-mini-stat__ic--indigo">
                <Users size={20} />
              </div>
              <div className="pd-mini-stat__text">
                <span className="pd-mini-stat__label">Members</span>
                <span className="pd-mini-stat__num">{memberCount}</span>
              </div>
            </div>
            <div className="pd-mini-stat3">
              <div className="pd-mini-stat__ic pd-mini-stat__ic--green">
                <CalendarDays size={20} />
              </div>
              <div className="pd-mini-stat__text">
                <span className="pd-mini-stat__label">Deadline</span>
                <span className="pd-mini-stat__num pd-mini-stat__num--sm">{formatShortDate(project.end_date)}</span>
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
                        <h2 className="pd-block-title pd-block-title--inline">All tasks</h2>
                        {["admin", "manager"].includes(getCurrentRole()) && (
                          <button className="pd-btn-assign" onClick={() => setShowTaskModal(true)}>
                            + Assign Task
                          </button>
                        )}
                      </div>
                      <div className="pd-table-wrap">
                        <table className="pd-table">
                          <thead>
                            <tr>
                              <th>Task</th>
                              <th>Assignee</th>
                              <th>Status</th>
                              <th>Priority</th>
                              <th>Due</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {tasks.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="pd-muted pd-table-empty">
                                  No tasks.
                                </td>
                              </tr>
                            ) : (
                              tasks.map((t) => (
                                <tr key={t.id}>
                                  <td className="pd-table-strong">{t.title}</td>
                                  <td>{t.assignees?.map((a) => a.name).join(", ") || "—"}</td>
                                  <td>
                                    <span className={`pd-pill pd-pill--task-${statusSlug(taskStatusLabel(t.status))}`}>
                                      {taskStatusLabel(t.status)}
                                    </span>
                                  </td>
                                  <td>
                                    <span className={`pd-pill pd-pill--pri-${(t.priority || "medium").toLowerCase()}`}>
                                      {t.priority}
                                    </span>
                                  </td>
                                  <td>{formatShortDate(t.end_date)}</td>
                                  <td>
                                    <button type="button" className="pd-icon-del" onClick={() => handleDeleteTask(t.id)}>
                                      <Trash2 size={16} />
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

                {tab === "team" && (
                  <div className="pd-tab-panel">
                    <section className="pd-card-flat">
                      <h2 className="pd-block-title">Linked team</h2>
                      {project.team ? (
                        <div className="pd-team-block">
                          <p>
                            <strong>{project.team.name}</strong>
                          </p>
                          {project.team.leader && <p className="pd-muted">Team lead: {project.team.leader.name}</p>}
                          {project.team.members?.length > 0 && (
                            <ul className="pd-team-members">
                              {project.team.members.map((m) => (
                                <li key={m.id}>
                                  {m.name} <span className="pd-muted">({m.role})</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : (
                        <p className="pd-muted">No team linked to this project.</p>
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

                {tab === "settings" && (
                  <div className="pd-tab-panel">
                    <section className="pd-card-flat">
                      <h2 className="pd-block-title">Sheets & documents</h2>
                      {project.sheets_documents ? (
                        <div className="pd-rich" dangerouslySetInnerHTML={{ __html: sanitizeHtml(project.sheets_documents) }} />
                      ) : (
                        <p className="pd-muted">None.</p>
                      )}
                    </section>
                    <section className="pd-card-flat">
                      <h2 className="pd-block-title">Website</h2>
                      {project.website_link ? (
                        <a href={project.website_link} className="pd-ext-link" target="_blank" rel="noopener noreferrer">
                          {project.website_name || project.website_link}
                        </a>
                      ) : (
                        <p className="pd-muted">No website.</p>
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
    </>
  );
}

export default ProjectDetails;
