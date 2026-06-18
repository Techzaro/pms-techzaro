import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Link as LinkIcon,
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
import SubmitTaskModal from "../components/SubmitTaskModal";
import TaskSubmissionPanel from "../components/TaskSubmissionPanel";
import API_URL from "../config/api";
import { authToken, getUser, rolePath } from "../utils/auth";
import { publish } from "../utils/eventBus";
import { formatDateTimeShort, formatDateTime } from "../utils/formatDateTime";
import "./TaskDetails.css";

function formatShortDate(value) {
  return formatDateTimeShort(value);
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
  if (s === "pending") return "Pending";
  if (s === "submitted") return "Submitted";
  if (s === "reopened") return "Reopened";
  if (s === "approved") return "Approved";
  if (s === "rejected") return "Rejected";
  return status || "Pending";
}

function statusColor(status) {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "#166534";
  if (s === "pending" || s === "reopened") return "#92400E";
  if (s === "submitted") return "#1E40AF";
  if (s === "rejected") return "#991B1B";
  return "#374151";
}

function statusBgColor(status) {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "#DCFCE7";
  if (s === "pending" || s === "reopened") return "#FEF3C7";
  if (s === "submitted") return "#DBEAFE";
  if (s === "rejected") return "#FEE2E2";
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
  const [tab, setTab] = useState("deliverables");
  const [submitModal, setSubmitModal] = useState({ open: false, deliverable: null });
  const [viewModal, setViewModal] = useState({ open: false, deliverable: null });
  const [assignerModal, setAssignerModal] = useState({ open: false, deliverable: null });
  const [taskSubmitModalOpen, setTaskSubmitModalOpen] = useState(false);
  const [taskConfirmDialog, setTaskConfirmDialog] = useState({ open: false, type: null });
  const [taskReopenDialog, setTaskReopenDialog] = useState(false);
  const [taskActing, setTaskActing] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [notes, setNotes] = useState([]);
  const [noteSaving, setNoteSaving] = useState(false);

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
      } else if (res.status === 404) {
        setTask(null);
        showMessage("Task not found", "error");
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

  const currentIdx = taskIds.findIndex(
    (id) => String(id) === String(taskId)
  );

  const prevTaskId =
    currentIdx > 0 ? taskIds[currentIdx - 1] : null;

  const nextTaskId =
    currentIdx >= 0 && currentIdx < taskIds.length - 1
      ? taskIds[currentIdx + 1]
      : null;

  // YAHAN taskSourcePages aur second source declaration NAHI hona chahiye

  const currentUser = getUser();
  const canEdit = task?.can_edit ?? (task && currentUser && parseInt(task.assigned_by, 10) === parseInt(currentUser.id, 10) && task?.status?.toLowerCase() !== "approved");
  const canSubmitTask = task?.can_submit ?? (task && currentUser && (task.assignees || []).some((a) => parseInt(a.id, 10) === parseInt(currentUser.id, 10)) && ["pending", "reopened"].includes(task?.status));
  const isCreator = task?.is_creator ?? (task && currentUser && parseInt(task.assigned_by, 10) === parseInt(currentUser.id, 10));
  const isAssignee = task?.is_assignee ?? (task && currentUser && (task.assignees || []).some((a) => parseInt(a.id, 10) === parseInt(currentUser.id, 10)));
  const isApproved = task?.status?.toLowerCase() === "approved";

  const goToTask = (id) => {
    if (!id) return;
    navigate(rolePath(`tasks/task-details/${id}`), {
      state: { taskIds, from: location.state?.from },
    });
  };
  const assignees = task?.assignees || [];
  const assigner = task?.assigner;
  const subtasks = task?.subtasks || [];
  const project = task?.project;
  const files = task?.files || [];
  const progress = typeof task?.deliverables_progress === "number" ? task.deliverables_progress : 0;
  const completedCount = subtasks.filter((t) => ["completed", "done"].includes((t.status || "").toLowerCase())).length;

  const showMessage = useCallback((text, type = "success") => {
    setMessage(text);
    setMessageType(type);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => { setMessage(""); setMessageType(""); }, 4000);
  }, []);

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
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
        setNoteInput("");
      }
    } catch {
      showMessage("Could not save note.", "error");
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
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      }
    } catch {
      showMessage("Could not delete note.", "error");
    }
  };

  const handleDeliverableActionSuccess = (updatedDeliverable) => {
    setTask((prev) => {
      if (!prev) return prev;
      const deliverables = (prev.deliverables || []).map((d) =>
        d.id === updatedDeliverable.id ? { ...d, ...updatedDeliverable } : d
      );
      const previousDeliverable = (prev.deliverables || []).find((d) => d.id === updatedDeliverable.id);
      const wasApproved = previousDeliverable?.status === "approved";
      const isApprovedNow = updatedDeliverable.status === "approved";
      const wasPending = previousDeliverable?.status === "pending";
      const isPendingNow = updatedDeliverable.status === "pending";
      const delTotal = prev.total_deliverables ?? deliverables.length;
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
        deliverables,
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
    showMessage("Task updated successfully.");
    publish('task:updated', updatedTask);
    publish('data:changed', { type: 'task', action: 'updated' });
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
      if (res.ok) { publish('task:deleted', { id: taskId }); publish('data:changed', { type: 'task', action: 'deleted' }); showMessage("Task deleted."); setTimeout(() => navigate(rolePath("tasks")), 800); }
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
      if (res.ok) { publish('task:updated', { id: taskId, status: newStatus }); publish('data:changed', { type: 'task', action: 'updated' }); setTask((p) => p ? { ...p, status: newStatus } : p); showMessage("Status updated."); }
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

              {isAssignee && task?.unviewed_changes?.length > 0 && (
                <div className="td-changes-panel">
                  <div className="td-changes-header">
                    <span className="td-changes-icon">&#9654;</span>
                    <span className="td-changes-title">Recent Changes</span>
                    <span className="td-changes-count">{task.unviewed_changes.length} update(s)</span>
                  </div>
                  <ul className="td-changes-list">
                    {task.unviewed_changes.map((c, i) => (
                      <li key={c.id || i}>
                        <strong>{c.modified_by}</strong> changed <strong>{c.field_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</strong>
                        {c.old_value ? <span className="td-change-detail"> — {c.old_value} → {c.new_value}</span> : <span className="td-change-detail"> — {c.new_value}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="td-title-row">
                <h1 className="td-title">
                  {task.title}
                </h1>
                <div className="td-title-actions">
                  <button className="td-nav-btn" onClick={() => goToTask(prevTaskId)} disabled={!prevTaskId}><ChevronLeft size={18} /></button>
                  <button className="td-nav-btn" onClick={() => goToTask(nextTaskId)} disabled={!nextTaskId}><ChevronRight size={18} /></button>
                  {canEdit && (
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
                  {!isApproved && (
                    <button className="td-btn-primary" onClick={() => setShowSubtaskModal(true)}>
                      <Plus size={16} strokeWidth={2.5} />
                      Add Subtask
                    </button>
                  )}
                  {isAssignee && ["pending", "reopened"].includes(task?.status) && (
                    <button
                      className="td-btn-primary"
                      disabled={!canSubmitTask}
                      title={!canSubmitTask ? "Submit all deliverables first" : ""}
                      onClick={() => setTaskSubmitModalOpen(true)}
                      style={!canSubmitTask ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                    >
                      <LuSend size={15} />
                      {task.status === "reopened" ? "Resubmit Task" : "Submit Task"}
                    </button>
                  )}
                </div>
              </div>

            {task.description && (
              <div>
                <p className="td-desc">{task.description}</p>
              </div>
            )}

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

              {/* Task Submission Workflow */}
              {(isAssignee || isCreator) && (
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
                />
              )}

              {/* TAB CONTENT */}
              <div className="td-content">
                {/* TABS */}
                <div className="td-tabs">
                  {[
                    { id: "deliverables", label: "Deliverables", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg> },
                    { id: "overview", label: "Overview", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg> },
                    { id: "subtasks", label: "Subtasks", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="14" height="14" rx="2" /><path d="M9 3v4M14 3v4" /><path d="M9 12l2 2 4-4" /></svg> },
                    { id: "files", label: "Files", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg> },
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
                      <h2 className="td-section-title">Task Details</h2>
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

                  {tab === "files" && <FileUploadSection taskId={task.id} files={files} isCreator={isCreator} isAssignee={isAssignee} isApproved={isApproved} onFileChange={() => fetchTask(false)} />}

                </div>
              </div>
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
                    <button type="button" className="td-note-delete" onClick={() => deleteNote(n.id)} title="Delete note">&times;</button>
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

      <SubmitTaskModal
        key={`td-task-submit-${task?.id || "none"}`}
        isOpen={taskSubmitModalOpen}
        onClose={() => setTaskSubmitModalOpen(false)}
        task={task}
        onSubmitSuccess={handleTaskActionSuccess}
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

/* ── File Upload Section Component ── */
function FileUploadSection({ taskId, files, isCreator, isAssignee, isApproved, onFileChange }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [message, setMessage] = useState("");

  const canManage = (isCreator || isAssignee) && !isApproved;

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage("");
    try {
      const token = authToken();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/tasks/${taskId}/files`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        setMessage("File uploaded.");
        onFileChange();
      } else {
        const d = await res.json();
        setMessage(d.message || "Upload failed.");
      }
    } catch {
      setMessage("Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleAddLink = async () => {
    if (!linkUrl) return;
    setAddingLink(true);
    setMessage("");
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: linkUrl, name: linkName || undefined }),
      });
      if (res.ok) {
        setMessage("Link added.");
        setLinkUrl("");
        setLinkName("");
        onFileChange();
      } else {
        const d = await res.json();
        setMessage(d.message || "Failed to add link.");
      }
    } catch {
      setMessage("Failed to add link.");
    } finally {
      setAddingLink(false);
    }
  };

  const handleDelete = async (fileId) => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/files/${fileId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMessage("File deleted.");
        onFileChange();
      }
    } catch {
      setMessage("Failed to delete file.");
    }
  };

  return (
    <div>
      <div className="td-section-header">
        <h2 className="td-section-title">Files & Attachments</h2>
      </div>
      {message && <p style={{ fontSize: "13px", margin: "0 0 12px", color: message.includes("failed") || message.includes("Failed") ? "#dc2626" : "#16a34a" }}>{message}</p>}
      {canManage && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          <button className="td-btn-outline" style={{ display: "flex", alignItems: "center", gap: "6px" }} disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> {uploading ? "Uploading..." : "Upload File"}
          </button>
          <input ref={fileRef} type="file" style={{ display: "none" }} onChange={handleFileUpload} />
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
            <input type="url" placeholder="Link URL" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} style={{ padding: "6px 10px", fontSize: "13px", border: "1px solid #d1d5db", borderRadius: "6px", width: "200px", maxWidth: "100%" }} />
            <input type="text" placeholder="Name (optional)" value={linkName} onChange={(e) => setLinkName(e.target.value)} style={{ padding: "6px 10px", fontSize: "13px", border: "1px solid #d1d5db", borderRadius: "6px", width: "140px", maxWidth: "100%" }} />
            <button className="td-btn-outline" style={{ display: "flex", alignItems: "center", gap: "6px" }} disabled={addingLink || !linkUrl} onClick={handleAddLink}>
              <LinkIcon size={14} /> {addingLink ? "Adding..." : "Add Link"}
            </button>
          </div>
        </div>
      )}
      {files.length === 0 ? (
        <p className="td-empty">No files attached to this task.</p>
      ) : (
        <ul className="td-files">
          {files.map((f) => (
            <li key={f.id}>
              <FolderOpen size={18} />
              {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.name}</a> : <span>{f.name}</span>}
              {canManage && (
                <button className="td-btn-danger" style={{ marginLeft: "auto", padding: "2px 8px", fontSize: "12px" }} onClick={() => handleDelete(f.id)}>
                  <Trash2 size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default TaskDetails;
