/**
 * TaskDetails page component.
 *
 * Full detail view for a single task.  Shows task metadata (status, priority,
 * assignees, dates), deliverables table (sortable, with submit/view actions),
 * task submission workflow panel, file attachments, a sidebar with task info
 * and a personal notes section.  Supports navigation between tasks via
 * previous/next buttons and tracks which tasks have been viewed.
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage } from "../utils/notify";
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Pencil,
  Trash2,
} from "lucide-react";
import { IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import SortableTableWrapper from "../components/SortableTableWrapper";
import EditTaskModal from "../components/EditTaskModal";
import ConfirmModal from "../components/ConfirmModal";
import SubmitDeliverableModal from "../components/SubmitDeliverableModal";
import ViewDeliverableModal from "../components/ViewDeliverableModal";
import AssignerViewModal from "../components/AssignerViewModal";
import SubmitTaskModal from "../components/SubmitTaskModal";
import TaskSubmissionPanel from "../components/TaskSubmissionPanel";
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
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import { formatDateTimeShort, formatDateTime } from "../utils/formatDateTime";
import { useActivityHighlight } from "../hooks/useActivityHighlight";
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
  if (s === "submitted") return "Submitted";
  if (s === "reopened") return "Reopened";
  if (s === "approved") return "Approved";
  if (s === "rejected") return "Rejected";
  return status || "Pending";
}

/** Return text colour for a given task status. */
function statusColor(status) {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "#166534";
  if (s === "pending" || s === "reopened") return "#92400E";
  if (s === "submitted") return "#1E40AF";
  if (s === "rejected") return "#991B1B";
  return "#374151";
}

/** Return background colour for a given task status badge. */
function statusBgColor(status) {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "#DCFCE7";
  if (s === "pending" || s === "reopened") return "#FEF3C7";
  if (s === "submitted") return "#DBEAFE";
  if (s === "rejected") return "#FEE2E2";
  return "#F3F4F6";
}

/** Return text colour for a priority level. */
function priorityColor(priority) {
  const p = (priority || "").toLowerCase();
  if (p === "high") return "#991B1B";
  if (p === "medium") return "#92400E";
  if (p === "low") return "#166534";
  return "#374151";
}

/** Return background colour for a priority badge. */
function priorityBgColor(priority) {
  const p = (priority || "").toLowerCase();
  if (p === "high") return "#FEE2E2";
  if (p === "medium") return "#FEF3C7";
  if (p === "low") return "#DCFCE7";
  return "#F3F4F6";
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

/**
 * Main TaskDetails component — renders the full task detail view with
 * sidebar, tabs, deliverables table and submission workflow.
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
  };

  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
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
  const [orderedDeliverables, setOrderedDeliverables] = useState([]);

  const taskChangesForHighlight = (task?.changes || []).map((c) => ({ ...c, id: c.id || 0 }));
  const {
    hasUnread: taskHasUnread,
    isItemUnread: isTaskItemUnread,
    markViewed: markTaskViewed,
  } = useActivityHighlight("task", task?.id, task?.activity_max_id || 0, taskChangesForHighlight);

  const source = sourcePages[location.state?.from] || null;

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

  useRefreshOnEvent(["task:updated", "task:deleted", "deliverable:created", "deliverable:updated", "deliverable:deleted"], () => fetchTask(false));

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
    setOrderedDeliverables(task?.deliverables || []);
  }, [task?.deliverables]);

  const handleDeliverableReorder = useCallback((reordered) => {
    setOrderedDeliverables(reordered);
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
  const canEdit = task?.can_edit ?? (task && currentUser && isCreator && task?.status?.toLowerCase() !== "approved");
  const canSubmitTask = task?.can_submit ?? (task && currentUser && isAssignee && ["pending", "reopened"].includes(task?.status));
  const isApproved = task?.status?.toLowerCase() === "approved";

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
                <p className="td-desc" style={{ color: "#6b7280", margin: "8px 0 0", fontSize: "14px", lineHeight: 1.6 }}>{task.description}</p>
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
                    { id: "files", label: "Platform files & links", icon: <FolderOpen size={16} /> },
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
                      </div>
                    </div>
                  )}

                  {tab === "deliverables" && (
                    <div>
                      <div className="td-section-header">
                        <h2 className="td-section-title">Deliverables</h2>
                        <span className="td-section-count">{task.completed_deliverables || 0}/{task.total_deliverables || 0} Completed</span>
                      </div>
                      {(orderedDeliverables.length === 0 && (task.deliverables || []).length === 0) ? (
                        <p className="td-empty">No deliverables linked to this task.</p>
                      ) : (
                        <div className="pd-table-wrap">
                          <div className="deliveries-table-header" style={{ gridTemplateColumns: "minmax(150px, 1.6fr) minmax(160px, 1.8fr) minmax(110px, 1.1fr) minmax(90px, 0.9fr) minmax(70px, 0.5fr)" }}>
                            <div>Deliverable</div>
                            <div>{isCreator ? "Assigned To" : "Assigned By"}</div>
                            <div>Due Date</div>
                            <div>Status</div>
                            <div>Action</div>
                          </div>
                          <SortableTableWrapper
                            items={orderedDeliverables.length ? orderedDeliverables : (task.deliverables || [])}
                            onReorder={handleDeliverableReorder}
                            as="div"
                          >
                            {(d) => (
                              <div className="deliveries-table-row" style={{ gridTemplateColumns: "minmax(150px, 1.6fr) minmax(160px, 1.8fr) minmax(110px, 1.1fr) minmax(90px, 0.9fr) minmax(70px, 0.5fr)" }}>
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
                                <div className="date-box" style={{ whiteSpace: "pre-line" }}>{formatDateTime(d.due_date)}</div>
                                <div>
                                  <span className="badge" style={{ background: statusBgColor(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status === 'reopened' ? 'pending' : d.status), color: statusColor(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status === 'reopened' ? 'pending' : d.status) }}>
                                    <span className="dot" style={{ background: statusColor(d.status === 'approved' ? 'completed' : d.status === 'submitted' ? 'review' : d.status === 'rejected' ? 'failed' : d.status === 'reopened' ? 'pending' : d.status) }} />
                                    {statusLabel(d.status)}
                                  </span>
                                </div>
                                <div className="action-btns">
                                  {(d.status === "pending" || d.status === "rejected" || d.status === "reopened") ? (
                                    <button className="action-icon-btn action-submit" title="Submit" onClick={() => setSubmitModal({ open: true, deliverable: d })}>
                                      <LuSend size={16} />
                                    </button>
                                  ) : (
                                    <button className="action-icon-btn action-view" title="View" onClick={() => {
                                      if (isCreator) {
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
                            )}
                          </SortableTableWrapper>
                        </div>
                      )}
                    </div>
                  )}

                  {tab === "files" && <FileUploadSection taskId={task.id} files={files} onReorder={handleFileReorder} />}

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
                  <span className="td-dot" style={{ background: "#3b82f6" }} />
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
                  <span className="td-dot" style={{ background: "#f59e0b" }} />
                  <div>
                    <span className="td-info-label">Created By</span>
                    <span className="td-info-val">{assigner?.name || "—"}</span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "#8b5cf6" }} />
                  <div>
                    <span className="td-info-label">Assigned To</span>
                    <span className="td-info-val">{assignees.map((a) => a.name).join(", ") || "—"}</span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "#22c55e" }} />
                  <div>
                    <span className="td-info-label">Last Updated</span>
                    <span className="td-info-val">{task.updated_at ? timeAgo(task.updated_at) : "—"}</span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "#3b82f6" }} />
                  <div>
                    <span className="td-info-label">Start Date</span>
                    <span className="td-info-val">{task.start_date ? formatDateTime(task.start_date) : "—"}</span>
                  </div>
                </li>
                <li>
                  <span className="td-dot" style={{ background: "#ef4444" }} />
                  <div>
                    <span className="td-info-label">Due Date</span>
                    <span className="td-info-val">{task.end_date ? formatDateTime(task.end_date) : "—"}</span>
                  </div>
                </li>
              </ul>
            </div>

            {/* ACTIVITY LOG */}
            <div className={`td-card${taskHasUnread ? " activity-panel--unread" : ""}`}>
              <h3 className="td-card-title">Activity</h3>
              {(() => {
                const events = (task?.workflowEvents || []).map(e => ({
                  id: e.id,
                  type: 'event',
                  action: e.action,
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
                              {item.action === 'approved' && '✅'}
                              {item.action === 'rejected' && '❌'}
                              {item.action === 'reopened' && '🔄'}
                              {item.action === 'field_changed' && '✏️'}
                              {!['created','submitted','approved','rejected','reopened','field_changed'].includes(item.action) && '📌'}
                            </>
                          )}
                          {item.type === 'change' && '✏️'}
                        </span>
                        <div className="td-activity-body">
                          <span className="td-activity-text">
                            {item.type === 'event'
                              ? item.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
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
/** Renders the list of files attached to a task, with download links and drag-drop reorder. */
function FileUploadSection({ taskId, files, onReorder }) {
  const [fileSearch, setFileSearch] = useState("");
  const boxColors = [
    "#eef2ff", "#f0fdf4", "#fefce8", "#fef2f2",
    "#f5f3ff", "#ecfeff", "#fff7ed", "#fce7f3",
  ];
  const filteredFiles = files.filter((f) => {
    if (!fileSearch) return true;
    const q = fileSearch.toLowerCase();
    return (f.name || "").toLowerCase().includes(q) || (f.url || "").toLowerCase().includes(q);
  });
  return (
    <div>
      <div className="td-section-header">
        <h2 className="td-section-title">Platform files & links</h2>
      </div>
      {files.length > 0 && (
        <div className="td-files-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            type="text"
            placeholder="Search files & links..."
            value={fileSearch}
            onChange={(e) => setFileSearch(e.target.value)}
          />
        </div>
      )}
      {files.length === 0 ? (
        <p className="td-empty">No files attached to this task.</p>
      ) : filteredFiles.length === 0 ? (
        <p className="td-empty">No files match your search.</p>
      ) : (
        <SortableTableWrapper
          items={filteredFiles}
          onReorder={onReorder}
          as="div"
        >
          {(f, idx) => {
            const bg = boxColors[idx % boxColors.length];
            return (
              <div key={f.id} className="pd-file-box" style={{ background: bg }}>
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
                    style={{ color: "#6366f1" }}
                  >
                    {f.url}
                  </a>
                )}
              </div>
            );
          }}
        </SortableTableWrapper>
      )}
    </div>
  );
}

export default TaskDetails;