import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Pencil,
  Plus,
  Users,
} from "lucide-react";
import { IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import CreateSubtaskModal from "../components/CreateSubtaskModal";
import EditTaskModal from "../components/EditTaskModal";
import ConfirmModal from "../components/ConfirmModal";
import SubmitDeliverableModal from "../components/SubmitDeliverableModal";
import ViewDeliverableModal from "../components/ViewDeliverableModal";
import AssignerViewModal from "../components/AssignerViewModal";
import API_URL from "../config/api";
import { authToken, getUser, rolePath } from "../utils/auth";
import "./TaskDetails.css";

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

function statusLabel(status) {
  const s = (status || "").toLowerCase();
  if (s === "completed" || s === "done") return "Completed";
  if (s === "in_progress") return "In Progress";
  if (s === "pending") return "Pending";
  if (s === "review") return "Review";
  if (s === "failed") return "Failed";
  if (s === "abandoned") return "Abandoned";
  return status || "Pending";
}

function statusColor(status) {
  const s = (status || "").toLowerCase();
  if (s === "completed" || s === "done") return "#166534";
  if (s === "in_progress") return "#1E40AF";
  if (s === "pending") return "#92400E";
  if (s === "review") return "#5B21B6";
  if (s === "failed") return "#991B1B";
  if (s === "abandoned") return "#374151";
  return "#374151";
}

function statusBgColor(status) {
  const s = (status || "").toLowerCase();
  if (s === "completed" || s === "done") return "#DCFCE7";
  if (s === "in_progress") return "#DBEAFE";
  if (s === "pending") return "#FEF3C7";
  if (s === "review") return "#EDE9FE";
  if (s === "failed") return "#FEE2E2";
  if (s === "abandoned") return "#F3F4F6";
  return "#F3F4F6";
}

function priorityColor(priority) {
  const p = (priority || "").toLowerCase();
  if (p === "high") return "#991B1B";
  if (p === "medium") return "#92400E";
  if (p === "low") return "#166534";
  return "#374151";
}

function priorityBgColor(priority) {
  const p = (priority || "").toLowerCase();
  if (p === "high") return "#FEE2E2";
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

function TaskDetails() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const taskIds = location.state?.taskIds || [];
  const sourcePages = {
   tasks: { label: "My Tasks", path: rolePath("tasks") },
   taskby: { label: "Tasks Assigned By You", path: rolePath("taskby") },
   "self-tasks": { label: "Self Tasks", path: rolePath("self-tasks") },
  };

const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSubtaskModal, setShowSubtaskModal] = useState(false);
  const [deleteTaskConfirmOpen, setDeleteTaskConfirmOpen] = useState(false);
  const [tab, setTab] = useState("details");
  const [submitModal, setSubmitModal] = useState({ open: false, deliverable: null });
  const [viewModal, setViewModal] = useState({ open: false, deliverable: null });
  const [assignerModal, setAssignerModal] = useState({ open: false, deliverable: null });

const source = sourcePages[location.state?.from] || null;

const fetchTask = useCallback(async (refresh = false) => {
  if (!taskId) return;

  try {
    setLoading(true);
    const token = authToken();
    const res = await fetch(`${API_URL}/tasks/${taskId}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setTask(data.task);
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
}, [taskId]);

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
  fetchTask(true);
}, [fetchTask]);

// YAHAN taskSourcePages aur second source declaration NAHI hona chahiye

const currentUser = getUser();
const isCreator =
  task &&
  currentUser &&
  parseInt(task.assigned_by, 10) === parseInt(currentUser.id, 10);
  const assignees = task?.assignees || [];
  const assigner = task?.assigner;
  const subtasks = task?.subtasks || [];
  const project = task?.project;
  const activities = project?.activities || [];
  const files = project?.files || [];
  const progress = typeof task?.progress_percent === "number" ? task.progress_percent : 0;
  const completedCount = subtasks.filter((t) => ["completed", "done"].includes((t.status || "").toLowerCase())).length;

  const showMessage = useCallback((text, type = "success") => {
    setMessage(text);
    setMessageType(type);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => { setMessage(""); setMessageType(""); }, 4000);
  }, []);

  const handleDeliverableActionSuccess = (updatedDeliverable) => {
    setTask((prev) => {
      if (!prev) return prev;
      const deliverables = (prev.deliverables || []).map((d) =>
        d.id === updatedDeliverable.id ? { ...d, ...updatedDeliverable } : d
      );
      const delTotal = deliverables.length;
      const delCompleted = deliverables.filter((d) => d.status === "approved").length;
      return {
        ...prev,
        deliverables,
        total_deliverables: delTotal,
        completed_deliverables: delCompleted,
        deliverables_progress: delTotal > 0 ? Math.round((delCompleted / delTotal) * 100) : 0,
      };
    });
  };

  const handleDeleteTask = async () => {
    setDeleteTaskConfirmOpen(true);
  };

  const confirmDeleteTask = async () => {
    setDeleteTaskConfirmOpen(false);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (res.ok) { showMessage("Task deleted."); setTimeout(() => navigate(rolePath("tasks")), 800); }
      else showMessage("Failed to delete task.", "error");
    } catch { showMessage("Failed to delete task.", "error"); }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) { setTask((p) => p ? { ...p, status: newStatus } : p); showMessage("Status updated."); }
    } catch { showMessage("Failed to update status.", "error"); }
  };

  if (loading) return <DashboardLayout hideRightSidebar><div className="td-loading">Loading task...</div></DashboardLayout>;
  if (!task) return <DashboardLayout hideRightSidebar><div className="td-loading td-error">Task not found.</div></DashboardLayout>;

  return (
    <>
    <DashboardLayout hideRightSidebar>
      <div className="td-page">
        {message && <div className={`td-toast td-toast--${messageType}`}>{message}</div>}

        <div className="td-layout">
          {/* ===== LEFT ===== */}
          <div className="td-main">
            <Breadcrumb items={[
              { label: "Tasks", path: rolePath("tasks") },
              ...(source ? [{ label: source.label, path: source.path }] : []),
              { label: task.title },
            ]} />

            <div className="td-title-row">
              <h1 className="td-title">{task.title}</h1>
              <div className="td-title-actions">
                <button className="td-nav-btn" onClick={() => goToTask(prevTaskId)} disabled={!prevTaskId}><ChevronLeft size={18} /></button>
                <button className="td-nav-btn" onClick={() => goToTask(nextTaskId)} disabled={!nextTaskId}><ChevronRight size={18} /></button>
                {isCreator && (
                  <>
                    <button className="td-btn-outline" onClick={() => setShowEditModal(true)}>
                      <Pencil size={15} strokeWidth={2.5} />
                      Edit
                    </button>
                    <button className="td-btn-danger" onClick={handleDeleteTask}>
                      Delete
                    </button>
                  </>
                )}
                <button className="td-btn-primary" onClick={() => setShowSubtaskModal(true)}>
                  <Plus size={16} strokeWidth={2.5} />
                  Add Subtask
                </button>
              </div>
            </div>

            {task.description && <p className="td-desc">{task.description}</p>}

            <div className="td-badges">
              <span className="td-badge" style={{ background: statusBgColor(task.status), color: statusColor(task.status) }}>
                <span className="td-badge-dot" style={{ background: statusColor(task.status) }} />
                {statusLabel(task.status)}
              </span>
              <span className="td-badge" style={{ background: priorityBgColor(task.priority), color: priorityColor(task.priority) }}>
                <span className="td-badge-dot" style={{ background: priorityColor(task.priority) }} />
                {task.priority} Priority
              </span>
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
                  <div className="td-stat-ic td-stat-ic--blue"><Users size={18} /></div>
                  <div>
                    <span className="td-stat-big">{subtasks.length}</span>
                    <span className="td-stat-label">Subtasks</span>
                  </div>
                </div>
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
                    <span className="td-stat-big td-stat-big--sm">{formatShortDate(task.end_date)}</span>
                    <span className="td-stat-label">Deadline</span>
                  </div>
                </div>
              </div>
            </div>

          

            {/* TAB CONTENT */}
            <div className="td-content">
                {/* TABS */}
            <div className="td-tabs">
              {[
                { id: "overview", label: "Overview", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
                { id: "subtasks", label: "Tasks", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M9 3v4M14 3v4"/><path d="M9 12l2 2 4-4"/></svg> },
                { id: "deliverables", label: "Deliverables", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },
                { id: "team", label: "Team", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg> },
                { id: "activity", label: "Activity", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
                { id: "files", label: "Files", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg> },
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
                  <h2 className="td-section-title">Project Description</h2>
                  <div className="td-overview-grid">
                    <div className="td-overview-left">
                      <p>{task.description || "No description provided for this task."}</p>
                      <div className="td-reqs">
                        <h3>Requirements</h3>
                        {Array.isArray(task.requirements) && task.requirements.length > 0 ? (
                          <ul>
                            {task.requirements.map((req, idx) => (
                              <li key={idx}><CheckCircle2 size={16} /> {req}</li>
                            ))}
                          </ul>
                        ) : (
                          <p style={{ color: "#6b7280", fontSize: "14px" }}>No requirements added.</p>
                        )}
                      </div>
                    </div>
                    <div className="td-overview-right">
                      <div className="td-img-placeholder">
                        <FolderOpen size={48} strokeWidth={1} />
                        <span>Task Preview</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === "subtasks" && (
                <div>
                  <div className="td-section-header">
                    <h2 className="td-section-title">Subtasks</h2>
                    <span className="td-section-count">{completedCount}/{subtasks.length} Completed</span>
                  </div>
                  {subtasks.length === 0 ? (
                    <p className="td-empty">No subtasks yet. Click "Add Subtask" to create one.</p>
                  ) : (
                    <table className="td-table">
                      <thead>
                        <tr>
                          <th>Deliverables</th>
                          <th>Assigned By</th>
                          <th>Status</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subtasks.map((t) => (
                          <tr key={t.id}>
                            <td>
                              <div className="td-task-name">{t.title}</div>
                              {t.description && <div className="td-task-sub">{t.description}</div>}
                            </td>
                            <td>
                              <div className="td-assignee">
                                <div className="td-avatar">{initials(t.assignee?.name)}</div>
                                <div>
                                  <div className="td-assignee-name">{t.assignee?.name || "—"}</div>
                                  <div className="td-assignee-role">Member</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="td-pill" style={{ background: statusBgColor(t.status), color: statusColor(t.status) }}>
                                <span className="td-pill-dot" style={{ background: statusColor(t.status) }} />
                                {statusLabel(t.status)}
                              </span>
                            </td>
                            <td className="td-date">{formatShortDate(t.end_date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {tab === "deliverables" && (
                <div>
                  <div className="td-section-header">
                    <h2 className="td-section-title">Deliverables</h2>
                    <span className="td-section-count">{task.completed_deliverables || 0}/{task.total_deliverables || 0} Completed</span>
                  </div>
                  {(task.deliverables || []).length === 0 ? (
                    <p className="td-empty">No deliverables linked to this task.</p>
                  ) : (
                    <table className="td-table">
                      <thead>
                        <tr>
                          <th>Deliverable</th>
                          <th>Due Date</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(task.deliverables || []).map((d) => (
                          <tr key={d.id}>
                            <td>
                              <div className="td-task-name">{d.title}</div>
                              {d.description && <div className="td-task-sub">{d.description}</div>}
                            </td>
                            <td className="td-date">{formatShortDate(d.due_date)}</td>
                            <td>
                              <span className="td-pill" style={{ background: statusBgColor(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status === 'reopened' ? 'pending' : d.status), color: statusColor(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status === 'reopened' ? 'pending' : d.status) }}>
                                <span className="td-pill-dot" style={{ background: statusColor(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status === 'reopened' ? 'pending' : d.status) }} />
                                {(d.status || "").charAt(0).toUpperCase() + (d.status || "").slice(1)}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: "6px" }}>
                                {(d.status === "pending" || d.status === "rejected" || d.status === "reopened") ? (
                                  <button
                                    className="td-btn-outline"
                                    style={{ padding: "4px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}
                                    onClick={() => setSubmitModal({ open: true, deliverable: d })}
                                  >
                                    <LuSend size={12} /> Submit
                                  </button>
                                ) : (
                                  <button
                                    className="td-btn-outline"
                                    style={{ padding: "4px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}
                                    onClick={() => {
                                      if (isCreator) {
                                        setAssignerModal({ open: true, deliverable: d });
                                      } else {
                                        setViewModal({ open: true, deliverable: d });
                                      }
                                    }}
                                  >
                                    <IoEyeOutline size={12} /> View
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {tab === "team" && (
                <div>
                  <h2 className="td-section-title">Team Members</h2>
                  <p className="td-empty" style={{ textAlign: "left", padding: "0" }}>Team information is managed at the project level.</p>
                </div>
              )}

              {tab === "activity" && (
                <div>
                  <h2 className="td-section-title">Activity</h2>
                  {activities.length === 0 ? <p className="td-empty">No activity yet.</p> : (
                    <ul className="td-feed">
                      {activities.map((a) => (
                        <li key={a.id} className="td-feed-row">
                          <div className="td-avatar">{initials(a.user?.name)}</div>
                          <div className="td-feed-info">
                            <span className="td-feed-name">{a.user?.name || "System"}</span>{" "}
                            <span className="td-feed-text">{a.summary}</span>
                            <div className="td-feed-time">{timeAgo(a.created_at)}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {tab === "files" && (
                <div>
                  <h2 className="td-section-title">Files & Attachments</h2>
                  {files.length === 0 ? <p className="td-empty">No files attached.</p> : (
                    <ul className="td-files">
                      {files.map((f) => (
                        <li key={f.id}>
                          <FolderOpen size={18} />
                          {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.name}</a> : <span>{f.name}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* SUBTASKS TABLE - SEPARATE CARD BELOW */}
            {tab === "overview" && (
              <div className="td-subtasks-card">
                <div className="td-section-header">
                  <h2 className="td-section-title">Subtasks</h2>
                  <span className="td-section-count">{completedCount}/{subtasks.length} Completed</span>
                </div>
                <table className="td-table">
                  <thead>
                    <tr>
                      <th>Deliverables</th>
                      <th>Assigned By</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subtasks.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <p className="td-empty" style={{ padding: "20px 0", margin: 0 }}>No subtasks yet. Click "Add Subtask" to create one.</p>
                        </td>
                      </tr>
                    ) : (
                      subtasks.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <div className="td-task-name">{t.title}</div>
                            {t.description && <div className="td-task-sub">{t.description}</div>}
                          </td>
                          <td>
                            <div className="td-assignee">
                              <div className="td-avatar">{initials(t.assignee?.name)}</div>
                              <div>
                                <div className="td-assignee-name">{t.assignee?.name || "—"}</div>
                                <div className="td-assignee-role">Member</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="td-pill" style={{ background: statusBgColor(t.status), color: statusColor(t.status) }}>
                              <span className="td-pill-dot" style={{ background: statusColor(t.status) }} />
                              {statusLabel(t.status)}
                            </span>
                          </td>
                          <td className="td-date">{formatShortDate(t.end_date)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                {(task.deliverables || []).length > 0 && (
                  <>
                    <div className="td-section-header" style={{ marginTop: "24px" }}>
                      <h2 className="td-section-title">Deliverables</h2>
                      <span className="td-section-count">{task.completed_deliverables || 0}/{task.total_deliverables || 0} Completed</span>
                    </div>
                    <table className="td-table">
                      <thead>
                        <tr>
                          <th>Deliverable</th>
                          <th>Assigned To</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(task.deliverables || []).map((d) => (
                          <tr key={d.id}>
                            <td>
                              <div className="td-task-name">{d.title}</div>
                              {d.description && <div className="td-task-sub">{d.description}</div>}
                            </td>
                            <td>
                              <div className="td-assignee">
                                <div className="td-avatar">{initials(d.assignee?.name)}</div>
                                <div>
                                  <div className="td-assignee-name">{d.assignee?.name || "—"}</div>
                                  <div className="td-assignee-role">{d.assignee?.role ? d.assignee.role.replace("_", " ") : ""}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="td-pill" style={{ background: statusBgColor(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status === 'reopened' ? 'pending' : d.status), color: statusColor(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status === 'reopened' ? 'pending' : d.status) }}>
                                <span className="td-pill-dot" style={{ background: statusColor(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status === 'reopened' ? 'pending' : d.status) }} />
                                {(d.status || "").charAt(0).toUpperCase() + (d.status || "").slice(1)}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: "6px" }}>
                                {(d.status === "pending" || d.status === "rejected" || d.status === "reopened") ? (
                                  <button
                                    className="td-btn-outline"
                                    style={{ padding: "4px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}
                                    onClick={() => setSubmitModal({ open: true, deliverable: d })}
                                  >
                                    <LuSend size={12} /> Submit
                                  </button>
                                ) : (
                                  <button
                                    className="td-btn-outline"
                                    style={{ padding: "4px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}
                                    onClick={() => {
                                      if (isCreator) {
                                        setAssignerModal({ open: true, deliverable: d });
                                      } else {
                                        setViewModal({ open: true, deliverable: d });
                                      }
                                    }}
                                  >
                                    <IoEyeOutline size={12} /> View
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            )}
            </div>
          </div>

          {/* ===== RIGHT SIDEBAR ===== */}
          <aside className="td-sidebar">
            <div className="td-card">
              <h3 className="td-card-title">Task Information</h3>
              <ul className="td-info">
                <li><span className="td-dot" style={{ background: "#3b82f6" }} /><div><span className="td-info-label">Project</span><span className="td-info-val">{project?.title || "—"}</span></div></li>
                <li><span className="td-dot" style={{ background: "#f59e0b" }} /><div><span className="td-info-label">Created By</span><span className="td-info-val">{assigner?.name || "—"}</span></div></li>
                <li><span className="td-dot" style={{ background: "#8b5cf6" }} /><div><span className="td-info-label">Assigned To</span><span className="td-info-val">{assignees.map((a) => a.name).join(", ") || "—"}</span></div></li>
                <li><span className="td-dot" style={{ background: "#22c55e" }} /><div><span className="td-info-label">Last Updated</span><span className="td-info-val">{task.updated_at ? timeAgo(task.updated_at) : "—"}</span></div></li>
                <li><span className="td-dot" style={{ background: "#ef4444" }} /><div><span className="td-info-label">Estimated Time</span><span className="td-info-val">{task.end_date ? formatShortDate(task.end_date) : "—"}</span></div></li>
              </ul>
            </div>

            <div className="td-card">
              <div className="td-card-head">
                <h3 className="td-card-title">Notes</h3>
                <button className="td-card-action"><Pencil size={12} /> Edit</button>
              </div>
              <p className="td-notes">{project?.sidebar_notes || "No notes added yet."}</p>
            </div>

            <div className="td-card">
              <div className="td-card-head">
                <h3 className="td-card-title">Activity Feed</h3>
                <button className="td-card-action" onClick={() => setTab("activity")}>View all</button>
              </div>
              <ul className="td-mini-feed">
                {activities.length === 0 ? <li className="td-empty" style={{ padding: 0 }}>No activity yet.</li> : (
                  activities.slice(0, 3).map((a) => (
                    <li key={a.id} className="td-mini-feed-row">
                      <div className="td-avatar-xs">{initials(a.user?.name)}</div>
                      <div>
                        <span className="td-feed-name">{a.user?.name || "System"}</span>{" "}
                        <span className="td-feed-text">{a.summary}</span>
                        <div className="td-feed-time">{timeAgo(a.created_at)}</div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </aside>
        </div>
      </div>

      {showEditModal && (
        <EditTaskModal
          task={task}
          onClose={(refresh) => { setShowEditModal(false); if (refresh) fetchTask(false); }}
        />
      )}

      {showSubtaskModal && (
        <CreateSubtaskModal
          parentId={task.id}
          projectId={task.project_id}
          onClose={(refresh) => { setShowSubtaskModal(false); if (refresh) fetchTask(false); }}
        />
      )}
    </DashboardLayout>

    <SubmitDeliverableModal
      key={`td-submit-${submitModal.deliverable?.id || "none"}`}
      isOpen={submitModal.open}
      onClose={() => setSubmitModal({ open: false, deliverable: null })}
      deliverable={submitModal.deliverable}
      onSubmitSuccess={handleDeliverableActionSuccess}
    />

    <ViewDeliverableModal
      key={`td-view-${viewModal.deliverable?.id || "none"}`}
      isOpen={viewModal.open}
      onClose={() => setViewModal({ open: false, deliverable: null })}
      deliverable={viewModal.deliverable}
      onSubmitSuccess={handleDeliverableActionSuccess}
    />

    <AssignerViewModal
      key={`td-assigner-${assignerModal.deliverable?.id || "none"}`}
      isOpen={assignerModal.open}
      onClose={() => setAssignerModal({ open: false, deliverable: null })}
      deliverable={assignerModal.deliverable}
      onActionSuccess={handleDeliverableActionSuccess}
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
    </>
  );
}

export default TaskDetails;
