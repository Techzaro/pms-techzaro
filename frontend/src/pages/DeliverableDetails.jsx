import { useCallback, useMemo, useState } from "react";
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
import ConfirmModal from "../components/ConfirmModal";
import { rolePath } from "../utils/auth";
import "./ProjectDetails.css";

function statusSlug(status) {
  return (status || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function formatShortDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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
  if (s === "completed" || s === "done") return "Completed";
  if (s === "in_progress") return "In Progress";
  if (s === "pending") return "Pending";
  return status || "Pending";
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] || "";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase() || a.toUpperCase();
}

const DEMO_DELIVERABLE = {
  id: 1,
  title: "Ecommerce Homepage Design",
  description: "Design and implement the new ecommerce homepage with a modern UI/UX approach.",
  status: "In Progress",
  priority: "High",
  category: "Design",
  budget: 5000,
  start_date: "2026-04-22",
  end_date: "2026-04-28",
  client_name: "TechXaro Solutions",
  creator: { id: 1, name: "Muhammad Sufyan", role: "Project Manager" },
  members: [
    { id: 2, name: "Leyla Nazir", role: "Team Lead" },
    { id: 3, name: "Ahmed Raza", role: "Developer" },
  ],
  tasks: [
    { id: 1, title: "Wireframe design", status: "completed", priority: "High", end_date: "2026-04-24", assignee: { name: "Leyla Nazir" } },
    { id: 2, title: "UI mockup", status: "in_progress", priority: "High", end_date: "2026-04-26", assignee: { name: "Ahmed Raza" } },
    { id: 3, title: "Frontend implementation", status: "pending", priority: "Medium", end_date: "2026-04-28", assignee: null },
  ],
  milestones: [
    { id: 1, title: "Design approval", status: "completed", due_date: "2026-04-24" },
    { id: 2, title: "Development phase", status: "in_progress", due_date: "2026-04-28" },
  ],
  activities: [
    { id: 1, user: { name: "Muhammad Sufyan" }, summary: "created the deliverable", created_at: new Date(Date.now() - 7200000).toISOString() },
    { id: 2, user: { name: "Leyla Nazir" }, summary: "updated the status to In Progress", created_at: new Date(Date.now() - 3600000).toISOString() },
  ],
  files: [
    { id: 1, name: "homepage_mockup.fig" },
    { id: 2, name: "design_guide.pdf" },
  ],
  progress_percent: 45,
  goals_checklist: [
    { text: "Responsive design for all screen sizes", done: true },
    { text: "Accessibility compliance (WCAG 2.1)", done: false },
    { text: "Performance optimization (Lighthouse > 90)", done: false },
  ],
  team: { name: "Design Team", leader: { name: "Leyla Nazir" }, members: [{ id: 3, name: "Ahmed Raza", role: "Developer" }] },
  sheets_documents: '<a href="#">Design Spec Sheet</a>',
  website_link: null,
};

function DeliverableDetails() {
  const { id, taskId } = useParams();
  const navigate = useNavigate();
  const deliverableId = id || taskId;

  const [deliverable, setDeliverable] = useState(DEMO_DELIVERABLE);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("overview");
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    start_date: "",
    end_date: "",
    assigned_to: "",
    priority: "Medium",
    status: "pending",
  });
  const [deleteDeliverableConfirmOpen, setDeleteDeliverableConfirmOpen] = useState(false);

  const memberCount = useMemo(() => {
    if (!deliverable) return 0;
    const ids = new Set();
    if (deliverable.creator?.id) ids.add(deliverable.creator.id);
    (deliverable.members || []).forEach((m) => ids.add(m.id));
    return ids.size;
  }, [deliverable]);

  const showMessage = useCallback((text, type = "success") => {
    setMessage(text);
    setMessageType(type);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 4000);
  }, []);

  const handleTaskFormChange = (e) => {
    const { name, value } = e.target;
    setTaskForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleDeleteDeliverable = async () => {
    setDeleteDeliverableConfirmOpen(true);
  };

  const confirmDeleteDeliverable = async () => {
    setDeleteDeliverableConfirmOpen(false);
    showMessage("Deliverable deleted.");
    setTimeout(() => navigate(rolePath("deliveries")), 800);
  };

  if (loading) {
    return (
      <DashboardLayout hideRightSidebar={true}>
        <div className="pd-loading">Loading deliverable…</div>
      </DashboardLayout>
    );
  }

  if (!deliverable) {
    return (
      <DashboardLayout hideRightSidebar={true}>
        <div className="pd-loading pd-error">Deliverable not found.</div>
      </DashboardLayout>
    );
  }

  const tasks = deliverable.tasks || [];
  const members = deliverable.members || [];
  const milestones = deliverable.milestones || [];
  const activities = deliverable.activities || [];
  const files = deliverable.files || [];
  const checklist = Array.isArray(deliverable.goals_checklist) ? deliverable.goals_checklist : [];
  const progress = typeof deliverable.progress_percent === "number" ? deliverable.progress_percent : 0;
  const recentTasks = [...tasks].slice(0, 6);

  const tabs = [
    { id: "overview", label: "Overview", icon: ListChecks },
    { id: "tasks", label: "Tasks", icon: Calendar },
    { id: "team", label: "Team", icon: Users },
    { id: "activity", label: "Activity", icon: Activity },
    { id: "files", label: "Files", icon: FolderOpen },
    { id: "settings", label: "Settings", icon: Settings },
  ];

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
        <button type="button" className="pd-btn" disabled={notesSaving} onClick={() => showMessage("Notes saved.")}>
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

  const overviewInner = (
    <>
      <div className="pd-shell-split">
        <div className="pd-shell-left">
          <h2 className="pd-block-title">Deliverable Description</h2>
          {deliverable.description ? (
            <div className="pd-rich">{deliverable.description}</div>
          ) : (
            <p className="pd-muted">No description.</p>
          )}

          <h2 className="pd-block-title pd-block-title--gap">Deliverable Goals</h2>
          {checklist.length > 0 ? (
            <ul className="pd-goals">
              {checklist.map((item, idx) => (
                <li key={idx} className="pd-goal-row">
                  <button
                    type="button"
                    className={`pd-goal-check ${item.done ? "pd-goal-check--on" : "pd-goal-check--off"}`}
                    aria-pressed={!!item.done}
                  >
                    {item.done ? "✓" : ""}
                  </button>
                  <span className={item.done ? "pd-goal-done" : ""}>{item.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pd-muted">No goals recorded.</p>
          )}
        </div>

        <aside className="pd-shell-right">
          <h2 className="pd-block-title">Deliverable details</h2>
          <ul className="pd-meta-rows">
            <li>
              <span className="pd-meta-rows__ic">
                <UserRound size={18} />
              </span>
              <div>
                <span className="pd-meta-rows__label">Assigned by</span>
                <span className="pd-meta-rows__value">{deliverable.creator?.name || "—"}</span>
              </div>
            </li>
            <li>
              <span className="pd-meta-rows__ic">
                <Building2 size={18} />
              </span>
              <div>
                <span className="pd-meta-rows__label">Client</span>
                <span className="pd-meta-rows__value">{deliverable.client_name || "—"}</span>
              </div>
            </li>
            <li>
              <span className="pd-meta-rows__ic">
                <CalendarDays size={18} />
              </span>
              <div>
                <span className="pd-meta-rows__label">Start date</span>
                <span className="pd-meta-rows__value">{formatShortDate(deliverable.start_date)}</span>
              </div>
            </li>
            <li>
              <span className="pd-meta-rows__ic">
                <Tag size={18} />
              </span>
              <div>
                <span className="pd-meta-rows__label">Priority</span>
                <span className="pd-meta-rows__value">
                  <span className={`pd-pill pd-pill--priority-${(deliverable.priority || "medium").toLowerCase()}`}>
                    {deliverable.priority || "—"}
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
                <span className="pd-meta-rows__value">{deliverable.category || "—"}</span>
              </div>
            </li>
            <li>
              <span className="pd-meta-rows__ic">
                <DollarSign size={18} />
              </span>
              <div>
                <span className="pd-meta-rows__label">Budget</span>
                <span className="pd-meta-rows__value">
                  {deliverable.budget != null && deliverable.budget !== "" ? `USD ${Number(deliverable.budget).toLocaleString()}` : "—"}
                </span>
              </div>
            </li>
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
            {deliverable.creator && (
              <li className="pd-member">
                <div className="pd-avatar" aria-hidden>
                  {initials(deliverable.creator.name)}
                </div>
                <div>
                  <div className="pd-member-name">{deliverable.creator.name}</div>
                  <div className="pd-member-role">Creator · {deliverable.creator.role || "—"}</div>
                </div>
                <span className="pd-badge-owner">Creator</span>
              </li>
            )}
            {members
              .filter((m) => m.id !== deliverable.creator?.id)
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
          <Link to={rolePath("deliveries")}>Deliverables</Link>
          <ChevronRight size={14} aria-hidden />
          <span>{deliverable.title}</span>
        </nav>

        <header className="pd-hero-tx">
          <div className="pd-hero-tx__main">
            <div className="pd-title-row">
              <div className="pd-title-icon" aria-hidden>
                <Monitor size={28} strokeWidth={1.75} />
              </div>
              <h1 className="pd-title-tx">{deliverable.title}</h1>
            </div>
            {deliverable.description && (
              <div className="pd-desc-tx">{deliverable.description}</div>
            )}
            <div className="pd-hero-actions">
              <span className={`pd-pill-status pd-pill-status--${statusSlug(deliverable.status)}`}>{deliverable.status}</span>
              <button type="button" className="pd-btn-tx pd-btn-tx--outline">
                <Pencil size={16} />
                Edit Deliverable
              </button>
              <button type="button" className="pd-btn-tx pd-btn-tx--danger" onClick={handleDeleteDeliverable}>
                <Trash2 size={16} />
                Delete
              </button>
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
                <span className="pd-mini-stat__num pd-mini-stat__num--sm">{formatShortDate(deliverable.end_date)}</span>
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
                      <h2 className="pd-block-title">All tasks</h2>
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
                                    <button type="button" className="pd-icon-del" onClick={() => showMessage("Task deleted.")}>
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
                    <section className="pd-card-flat">
                      <h2 className="pd-block-title">Add task</h2>
                      <form className="pd-task-form" onSubmit={(e) => { e.preventDefault(); showMessage("Task added."); }}>
                        <div className="pd-form-grid">
                          <label className="pd-field">
                            <span>Title</span>
                            <input name="title" value={taskForm.title} onChange={handleTaskFormChange} required />
                          </label>
                          <label className="pd-field">
                            <span>Priority</span>
                            <select name="priority" value={taskForm.priority} onChange={handleTaskFormChange}>
                              <option>Low</option>
                              <option>Medium</option>
                              <option>High</option>
                            </select>
                          </label>
                          <label className="pd-field">
                            <span>Status</span>
                            <select name="status" value={taskForm.status} onChange={handleTaskFormChange}>
                              <option value="pending">Pending</option>
                              <option value="in_progress">In Progress</option>
                              <option value="completed">Completed</option>
                            </select>
                          </label>
                          <label className="pd-field">
                            <span>Assign to</span>
                            <select name="assigned_to" value={taskForm.assigned_to} onChange={handleTaskFormChange}>
                              <option value="">Unassigned</option>
                              {members.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="pd-field">
                            <span>Start</span>
                            <input type="date" name="start_date" value={taskForm.start_date} onChange={handleTaskFormChange} />
                          </label>
                          <label className="pd-field">
                            <span>Due</span>
                            <input type="date" name="end_date" value={taskForm.end_date} onChange={handleTaskFormChange} />
                          </label>
                        </div>
                        <label className="pd-field pd-field--full">
                          <span>Description</span>
                          <textarea name="description" rows={3} value={taskForm.description} onChange={handleTaskFormChange} />
                        </label>
                        <button type="submit" className="pd-btn pd-btn--primary">
                          Add task
                        </button>
                      </form>
                    </section>
                  </div>
                )}

                {tab === "team" && (
                  <div className="pd-tab-panel">
                    <section className="pd-card-flat">
                      <h2 className="pd-block-title">Linked team</h2>
                      {deliverable.team ? (
                        <div className="pd-team-block">
                          <p>
                            <strong>{deliverable.team.name}</strong>
                          </p>
                          {deliverable.team.leader && <p className="pd-muted">Team lead: {deliverable.team.leader.name}</p>}
                          {deliverable.team.members?.length > 0 && (
                            <ul className="pd-team-members">
                              {deliverable.team.members.map((m) => (
                                <li key={m.id}>
                                  {m.name} <span className="pd-muted">({m.role})</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : (
                        <p className="pd-muted">No team linked to this deliverable.</p>
                      )}
                    </section>
                  </div>
                )}

                {tab === "activity" && (
                  <div className="pd-tab-panel">
                    <section className="pd-card-flat">
                      <h2 className="pd-block-title">Deliverable activity</h2>
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
                      {deliverable.sheets_documents ? (
                        <div className="pd-rich">{deliverable.sheets_documents}</div>
                      ) : (
                        <p className="pd-muted">None.</p>
                      )}
                    </section>
                    <section className="pd-card-flat">
                      <h2 className="pd-block-title">Website</h2>
                      {deliverable.website_link ? (
                        <a href={deliverable.website_link} className="pd-ext-link" target="_blank" rel="noopener noreferrer">
                          {deliverable.website_name || deliverable.website_link}
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

    <ConfirmModal
      isOpen={deleteDeliverableConfirmOpen}
      onClose={() => setDeleteDeliverableConfirmOpen(false)}
      onConfirm={confirmDeleteDeliverable}
      title="Confirm Deletion"
      message="Are you sure you want to delete this deliverable? This action cannot be undone."
      confirmText="Delete"
      cancelText="Cancel"
      danger
    />
    </>
  );
}

export default DeliverableDetails;
