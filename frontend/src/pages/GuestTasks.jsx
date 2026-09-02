/**
 * GuestTasks page component — Tasks Assigned To Guest.
 *
 * Displays tasks that have been assigned to the current guest user
 * by admin/manager. Provides search with debounce, status filtering,
 * time-range filtering, drag-and-drop reordering and pagination.
 * Same action pattern as Tasks Assigned To You (acknowledge/pause/continue/submit).
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import DraggableStatusBadges from "../components/DraggableStatusBadges";
import { GoDotFill } from "react-icons/go";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";
import { ArrowUpRight, CheckCircle2, Lock, Pause, Play, StickyNote, Sliders, XCircle, RotateCcw, AlertOctagon, Trash2 } from "lucide-react";
import { showSuccessMessage, notify, toast } from "../utils/notify";
import { publish } from "../utils/eventBus";
import SubmitTaskModal from "../components/SubmitTaskModal";
import ConfirmModal from "../components/ConfirmModal";
import SortableTableWrapper from "../components/SortableTableWrapper";
import SmartDragHandle from "../components/SmartDragHandle";
import Pagination from "../components/Pagination";
import ActionPopover from "../components/ActionPopover";
import TaskNotesPopover from "../components/TaskNotesPopover";
import AddNoteModal from "../components/AddNoteModal";
import TaskMultiStatusBadges from "../components/TaskMultiStatusBadges";
import API_URL from "../config/api";
import { authToken, getUser, rolePath } from "../utils/auth";
import { renderDynamicDates } from "../utils/tableDateUtils";
import { formatDateTime } from "../utils/formatDateTime";
import "../components/ActionPopover.css";
import "../pages/Task.css";

const STATUS_COLORS = {
  pending: "#FEF3C7",
  in_progress: "#DBEAFE",
  paused: "#FEF3C7",
  submitted: "#DBEAFE",
  reopened: "#EDE9FE",
  approved: "#DCFCE7",
  rejected: "#FEE2E2",
};

const STATUS_TEXT_COLORS = {
  pending: "#92400E",
  in_progress: "#1E40AF",
  paused: "#92400E",
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

/** Guest Tasks page — renders tasks assigned to the current guest user. */
function GuestTasks() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [orderedItems, setOrderedItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const currentUser = getUser();
  const [statusFilter, setStatusFilter] = useState(() => {
    const status = searchParams.get("status");
    if (status) return status;
    return "";
  });
  const [timeFilter, setTimeFilter] = useState("");
  const [submitTaskModal, setSubmitTaskModal] = useState({ open: false, task: null });
  const [noteModal, setNoteModal] = useState({ open: false, itemId: null });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [sortBy, setSortBy] = useState("");
  const [sortDirection, setSortDirection] = useState("desc");

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDirection("asc");
    }
    setPage(1);
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /** Fetch tasks assigned to the current guest user from the API. */
  const fetchTasks = useCallback(() => {
    try {
      setLoading(true);
      const token = authToken();
      const params = new URLSearchParams();
      if (timeFilter) params.append("time_filter", timeFilter);
      if (debouncedSearch) params.append("search", debouncedSearch);
      
      // Kept from feature/time-zone
      if (statusFilter) {
        params.append("status", statusFilter);
      }

      if (sortBy) {
        params.append("sort_by", sortBy);
        params.append("sort_direction", sortDirection);
        params.append("sort_dir", sortDirection);
        params.append("sort_order", sortDirection);
      }

      fetch(`${API_URL}/my-tasks?${params.toString()}`, {
        headers: { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
        skipLoader: true,
      })
        .then((res) => (res.ok ? res.json() : { data: [] }))
        .then((data) => {
          setItems(Array.isArray(data?.data) ? data.data : []);
          setTotalCount(typeof data?.total === "number" ? data.total : Array.isArray(data?.data) ? data.data.length : 0);
        })
        .catch((err) => {
          console.warn("Failed to fetch tasks:", err);
          setItems([]);
        })
        .finally(() => setLoading(false));
    } catch (err) {
      console.error("fetchTasks exception:", err);
      setLoading(false);
      setItems([]);
    }
  }, [timeFilter, debouncedSearch, statusFilter, sortBy, sortDirection]);

  // Merged dependencies from feature/time-zone and feature-Tasks-setup-backup
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks, page]);

  useAutoRefresh(fetchTasks, {
    events: ['task:created', 'task:updated', 'task:deleted', 'data:changed'],
  });

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  const handleTaskListReorder = useCallback((reordered) => {
    setOrderedItems(reordered);
    setItems(reordered); // update immediately
    if (reordered.length) {
      const payload = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
      const token = authToken();
      fetch(`${API_URL}/tasks/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: payload }),
        _notifHandled: true,
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const nextFilter = searchParams.get("status") || "";
    setStatusFilter((current) => {
      if (nextFilter === "due_today" || current === "due_today" || nextFilter !== current) {
        return nextFilter;
      }
      return current;
    });
  }, [searchParams]);

  const selectStatusFilter = (filter) => {
    if (filter === statusFilter && filter === "") {
      setShowAll(!showAll);
    } else {
      setStatusFilter(filter);
      setShowAll(false);
      setPage(1);
      if (filter) {
        setSearchParams({ status: filter });
      } else {
        setSearchParams({});
      }
    }
  };

  const getInitials = (name) => {
    if (!name) return "??";
    return name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase();
  };

  const getRandomColors = (id) => {
    const colors = [
      { bg: "#E0E7FF", text: "#4338CA" },
      { bg: "#FEE2E2", text: "#B91C1C" },
      { bg: "#DCFCE7", text: "#22C55E" },
      { bg: "#FEF3C7", text: "#D97706" },
      { bg: "#EDE9FE", text: "#7C3AED" },
      { bg: "#FCE7F3", text: "#DB2777" },
    ];
    return colors[id % colors.length];
  };

  const formatDate = (dateStr) => {
    return formatDateTime(dateStr);
  };

  const formatStatus = (status) => {
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
  };

  const handleTaskSubmitSuccess = (updatedTask) => {
    if (updatedTask) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === updatedTask.id
            ? { ...item, ...updatedTask }
            : item
        )
      );
    }
    setSubmitTaskModal({ open: false, task: null });
    fetchTasks();
  };

  const handleAcknowledge = async (e, taskId) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === taskId ? { ...item, status: "in_progress", ...(data.task || {}) } : item
          )
        );
        publish('task:updated', { id: taskId, status: 'in_progress' });
        publish('data:changed', { type: 'task', action: 'updated' });
        showSuccessMessage(t("Task acknowledged", { defaultValue: "Task acknowledged" }));
      } else {
        notify.error(data.message || t("Failed to acknowledge task."));
      }
    } catch {
      notify.error(t("Failed to acknowledge task."));
    }
  };

  const handleStartTimer = async (e, taskId) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/start-timer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === taskId ? { ...item, status: "in_progress", ...(data.task || {}) } : item
          )
        );
        publish('task:updated', { id: taskId, status: 'in_progress' });
        publish('data:changed', { type: 'task', action: 'updated' });
        showSuccessMessage(t("Task timer started", { defaultValue: "Task timer started" }));
      } else {
        notify.error(data.message || t("Failed to start task timer.", { defaultValue: "Failed to start task timer." }));
      }
    } catch {
      notify.error(t("Failed to start task timer.", { defaultValue: "Failed to start task timer." }));
    }
  };

  const handleContinue = async (e, taskId) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === taskId ? { ...item, status: "in_progress", ...(data.task || {}) } : item
          )
        );
        publish('task:updated', { id: taskId, status: 'in_progress' });
        publish('data:changed', { type: 'task', action: 'updated' });
        showSuccessMessage(t("Task resumed", { defaultValue: "Task resumed" }));
      } else {
        notify.error(data.message || t("Failed to continue task."));
      }
    } catch {
      notify.error(t("Failed to continue task."));
    }
  };

  const handlePause = async (e, taskId) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: "other", reason_detail: "Paused from task list" }),
        _notifHandled: true,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === taskId ? { ...item, status: "paused", ...(data.task || {}) } : item
          )
        );
        publish('task:updated', { id: taskId, status: 'paused' });
        publish('data:changed', { type: 'task', action: 'updated' });
        showSuccessMessage(t("Task paused", { defaultValue: "Task paused" }));
      } else {
        notify.error(data?.message || data?.error || t("Failed to pause task."));
      }
    } catch {
      notify.error(t("Failed to pause task."));
    }
  };

  const handleDelete = (e, taskId) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    setDeleteTargetId(taskId);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    const taskId = deleteTargetId;
    setDeleteConfirmOpen(false);
    setDeleteTargetId(null);
    if (!taskId) return;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => String(item.id) !== String(taskId)));
        setOrderedItems((prev) => prev.filter((item) => String(item.id) !== String(taskId)));
        publish('task:deleted', { id: taskId });
        publish('data:changed', { type: 'task', action: 'deleted' });
        showSuccessMessage(t("Task deleted successfully", { defaultValue: "Task deleted successfully" }));
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || t("Failed to delete task"));
      }
    } catch {
      toast.error(t("Failed to delete task"));
    }
  };

  // Deduped constants based on both branches
  const baseItems = orderedItems.length ? orderedItems : items;
  const pendingStatuses = ["pending", "planned", "Planning", "Planned", "reopened"];
  const inProgressStatuses = ["in_progress", "In Progress", "In-progress", "Reopened"];

  const allCount = useMemo(() => baseItems.length, [baseItems]);
  const dueTodayCount = useMemo(() => baseItems.filter((i) => { const d = i.end_date ? new Date(i.end_date) : null; return d && d.toDateString() === new Date().toDateString(); }).length, [baseItems]);
  const pendingCount = useMemo(() => baseItems.filter((i) => pendingStatuses.includes(i.status)).length, [baseItems]);
  const inProgressCount = useMemo(() => baseItems.filter((i) => inProgressStatuses.includes(i.status)).length, [baseItems]);
  const pausedCount = useMemo(() => baseItems.filter((i) => i.status === "paused").length, [baseItems]);
  const submittedCount = useMemo(() => baseItems.filter((i) => i.status === "submitted").length, [baseItems]);
  const reopenedCount = useMemo(() => baseItems.filter((i) => i.status === "reopened").length, [baseItems]);
  const transferredCount = useMemo(() => baseItems.filter((i) => i.delegation_chain && i.delegation_chain.length > 0).length, [baseItems]);
  const approvedCount = useMemo(() => baseItems.filter((i) => i.status === "approved").length, [baseItems]);
  const rejectedCount = useMemo(() => baseItems.filter((i) => i.status === "rejected").length, [baseItems]);
  const abandonedCount = useMemo(() => baseItems.filter((i) => i.status === "abandoned").length, [baseItems]);
  
  const searchFilteredItems = useMemo(() => debouncedSearch
    ? baseItems.filter((item) => {
        const q = debouncedSearch.toLowerCase();
        const titleMatch = (item.title || "").toLowerCase().includes(q);
        const assigneeMatch = (item.assignees || []).some(a => (a.name || "").toLowerCase().includes(q));
        const assignerMatch = (item.assigner?.name || "").toLowerCase().includes(q);
        return titleMatch || assigneeMatch || assignerMatch;
      })
    : baseItems, [baseItems, debouncedSearch]);
    
  const filteredItems = useMemo(() => statusFilter
    ? searchFilteredItems.filter((item) => {
        if (statusFilter === "due_today") {
          const dateVal = item.end_date || item.due_date || item.start_date;
          if (!dateVal) return false;
          const d = new Date(dateVal);
          const now = new Date();
          const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
          const isCompleted = ["approved", "completed", "done"].includes((item.status || "").toLowerCase());
          return isToday && !isCompleted;
        }
        if (statusFilter === "pending") {
          return pendingStatuses.includes(item.status);
        }
        if (statusFilter === "in_progress") {
          return inProgressStatuses.includes(item.status);
        }
        if (statusFilter === "transferred") {
          return item.delegation_chain && item.delegation_chain.length > 0;
        }
        return item.status === statusFilter;
      })
    : searchFilteredItems, [searchFilteredItems, statusFilter, pendingStatuses, inProgressStatuses]);

  const taskIdList = items.map((i) => i.id);
  const totalPages = showAll ? 1 : Math.ceil(totalCount / itemsPerPage);
  
  // Note: Since pagination might be server-side depending on API, keeping this exactly as original
  const paginatedItems = filteredItems;

  const breadcrumbs = [
    { label: t("Tasks", { defaultValue: "Tasks" }), path: rolePath("guest-tasks") },
    { label: t("Assigned To You", { defaultValue: "Assigned To You" }) },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="Task">
        <div className="task-text">
          <h3>{t("Tasks Assigned To You", { defaultValue: "Tasks Assigned To You" })}</h3>
          <p>{t("View and manage tasks assigned to you", { defaultValue: "View and manage tasks assigned to you" })}</p>
        </div>

        <div className="task-btns">
          <div className="all-time">
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
              <option value="">{t("All Time", { defaultValue: "All Time" })}</option>
              <option value="7">{t("Last 7 Days", { defaultValue: "Last 7 Days" })}</option>
              <option value="30">{t("Last 30 Days", { defaultValue: "Last 30 Days" })}</option>
              <option value="180">{t("Last 6 Months", { defaultValue: "Last 6 Months" })}</option>
            </select>
          </div>
        </div>
      </div>

      {/* STATUS FILTERS */}
      <DraggableStatusBadges
        badges={[
          { id: "", label: t("All", { defaultValue: "All" }), count: allCount, className: "All" },
          { id: "pending", label: t("Pending", { defaultValue: "Pending" }), count: pendingCount, className: "Pending" },
          { id: "in_progress", label: t("In Progress", { defaultValue: "In Progress" }), count: inProgressCount, className: "InProgress" },
          { id: "submitted", label: t("Submitted", { defaultValue: "Submitted" }), count: submittedCount, className: "Submitted" },
          { id: "approved", label: t("Completed", { defaultValue: "Completed" }), count: approvedCount, className: "Approved" },
          { id: "paused", label: t("Paused", { defaultValue: "Paused" }), count: pausedCount, className: "Paused" },
          { id: "rejected", label: t("Declined", { defaultValue: "Declined" }), count: rejectedCount, className: "Rejected" },
          { id: "abandoned", label: t("Abandoned", { defaultValue: "Abandoned" }), count: abandonedCount, className: "Abandoned", dotColor: "#DC2626" },
        ]}
        activeStatus={statusFilter}
        onSelectStatus={selectStatusFilter}
        storageKey="pms_guest_tasks_status_order"
        containerClassName="task-progress"
      />

      {/* SEARCH BAR */}
      <div className="tasks-search-bar">
        <IoSearchOutline fontSize={"20px"} />
        <input
          type="text"
          placeholder={t("Search by task name or user name", { defaultValue: "Search by task name or user name" })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* TABLE */}
      <div className="container">
        <div className="table-header1">
          <div style={{ fontSize: 12, fontWeight: 600 }}>{t("ID", { defaultValue: "ID" })}</div>
          <div style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("assigned_by")}>
            {t("Assigned by", { defaultValue: "Assigned by" })}
          </div>
          <div className="task-name-column" style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("title")}>
            {t("Task Name", { defaultValue: "Task Name" })}
          </div>
          <div className="status-column" style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("status")}>
            {t("Status", { defaultValue: "Status" })}
          </div>
          <div>{t("Progress", { defaultValue: "Progress" })}</div>
          <div className="priority-column" style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("priority")}>
            {t("Priority", { defaultValue: "Priority" })}
          </div>
          <div className="date-column" style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("due_date")}>
            {t("Date", { defaultValue: "Date" })}
          </div>
          <div>{t("Action", { defaultValue: "Action" })}</div>
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>{t("Loading...", { defaultValue: "Loading..." })}</div>
        ) : paginatedItems.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>{t("No tasks assigned to you", { defaultValue: "No tasks assigned to you" })}</div>
        ) : (
          <SortableTableWrapper
            items={paginatedItems.map((i) => ({ ...i, sortableId: `task-${i.id}` }))}
            onReorder={(reordered) => handleTaskListReorder(reordered)}
            idKey="sortableId"
            as="div"
            handleOnly
          >
            {(item, idx, dndProps) => {
              const colors = getRandomColors(item.id);

              const assigner = item.assigner;
              return (
                <div className="taskby-row" key={item.sortableId}>
                  <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} id={item.id} businessId={item.business_id} />
                  <div className="col-assigned-to">
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div className="avatar" style={{ background: colors.bg, color: colors.text }}>{getInitials(assigner?.name)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="user-name">{assigner?.name || t("System", { defaultValue: "System" })}</div>
                        <div className="user-role">{assigner?.role ? t(assigner.role, { defaultValue: assigner.role }) : ""}</div>
                      </div>
                    </div>
                  </div>

                  <div className="col-task-name">
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {item.delegation_chain && item.delegation_chain.length > 0 && <ArrowUpRight size={14} style={{ color: "#6B7280", flexShrink: 0 }} />}
                      <div className="task-title">{item.title}</div>
                      <TaskNotesPopover taskId={item.id} itemType="task" />
                    </div>
                    {item.project && (
                      <Link to={rolePath(`projects/project-details/${item.project.id}`)} onClick={(e) => e.stopPropagation()} style={{ fontSize: "11px", color: "#2563eb", textDecoration: "none", marginTop: "2px", display: "inline-block" }}>
                        {item.project.title}
                      </Link>
                    )}
                  </div>

                  <div className="col-status">
                    <TaskMultiStatusBadges item={item} />
                  </div>

                  {(() => {
                    const isTerminal = ["completed", "approved", "submitted", "submitted_late", "done"].includes((item.status || "").toLowerCase());
                    const prog = isTerminal ? 100 : (item.deliverables_progress || 0);
                    return (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
                          {prog}%
                        </div>
                        <div className="progress-bar-track">
                          <div className="progress-bar-fill" style={{ width: `${prog}%` }}></div>
                        </div>
                        <div style={{ fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {t("{{approved}}/{{total}} subtasks", { approved: item.approved_deliverables || 0, total: item.total_deliverables || 0, defaultValue: `${item.approved_deliverables || 0}/${item.total_deliverables || 0} subtasks` })}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="col-priority">
                    <span className="badge" style={{ background: PRIORITY_COLORS[item.priority] || "#F3F4F6", color: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}>
                      <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}></span>
                      {t(item.priority || "Medium", { defaultValue: item.priority || "Medium" })}
                    </span>
                  </div>

                  <div className="col-due-date">
                    <div className="date-box">
                      {renderDynamicDates(item, currentUser)}
                    </div>
                  </div>

                  <div className="col-action" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      className="action-icon-btn action-view action-trigger-lg"
                      title={t("View Task", { defaultValue: "View Task" })}
                      onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'guest-tasks' } })}
                    >
                      <IoEyeOutline size={20} />
                    </button>
                    <ActionPopover
                      trigger={
                        <button className="action-icon-btn action-manage action-trigger-lg" title={t("Status Actions", { defaultValue: "Status Actions" })} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "4px", borderRadius: "6px", background: "var(--bg-hover, #f3f4f6)", color: "var(--text-primary, #374151)", border: "1px solid var(--border-color, #e5e7eb)", cursor: "pointer" }}>
                          <Sliders size={18} />
                        </button>
                      }
                    >
                      <button className="action-icon-btn action-note" title={t("Add Note", { defaultValue: "Add Note" })} onClick={() => setNoteModal({ open: true, itemId: item.id })}><StickyNote size={14} /></button>
                      {(() => {
                        const currentUser = getUser();
                        const isUserAdminOrManager = ["admin", "manager"].includes(currentUser?.role);
                        const canUserApprove = isUserAdminOrManager || item.created_by === currentUser?.id || item.is_next_approver;
                        return (
                          <>
                            {canUserApprove && (item.status === "submitted" || item.status === "reopened") && (
                              <button
                                className="action-icon-btn"
                                title={t("Approve Task", { defaultValue: "Approve Task" })}
                                style={{ color: "#16A34A" }}
                                onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'guest-tasks' } })}
                              >
                                <CheckCircle2 size={16} />
                              </button>
                            )}
                            {canUserApprove && (item.status === "submitted" || item.status === "reopened") && (
                              <button
                                className="action-icon-btn"
                                title={t("Decline Task", { defaultValue: "Decline Task" })}
                                style={{ color: "#DC2626" }}
                                onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'guest-tasks' } })}
                              >
                                <XCircle size={16} />
                              </button>
                            )}
                            {canUserApprove && (item.status === "approved" || item.status === "submitted" || item.status === "reopened" || item.status === "abandoned") && (
                              <button
                                className="action-icon-btn"
                                title={t("Reopen Task", { defaultValue: "Reopen Task" })}
                                style={{ color: "#2563EB" }}
                                onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'guest-tasks' } })}
                              >
                                <RotateCcw size={16} />
                              </button>
                            )}
                            {item.status !== "abandoned" && (
                              <button
                                className="action-icon-btn"
                                title={isUserAdminOrManager ? t("Abandon Task", { defaultValue: "Abandon Task" }) : t("Request Abandon", { defaultValue: "Request Abandon" })}
                                style={{ color: "#F59E0B" }}
                                onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'guest-tasks' } })}
                              >
                                <AlertOctagon size={16} />
                              </button>
                            )}
                          </>
                        );
                      })()}
                      {(() => {
                        const myPivotStatus = item.assignees?.find(a => parseInt(a.id, 10) === parseInt(currentUser?.id, 10))?.pivot?.status;
                        if (item.assigner_paused) {
                          return (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "#FEF3C7", color: "#92400E", fontSize: "11px", fontWeight: 600, border: "1px solid #F59E0B" }}>
                              <Lock size={12} />
                              {t("Paused by Assigner", { defaultValue: "Paused by Assigner" })}
                            </span>
                          );
                        }
                        if (item.status === "pending") {
                          return (
                            <button className="action-icon-btn action-submit" title={t("Acknowledge Task", { defaultValue: "Acknowledge Task" })} onClick={(e) => handleAcknowledge(e, item.id)}>
                              <CheckCircle2 size={16} />
                            </button>
                          );
                        }
                        if (item.status === "in_progress" && (!item.timer || item.timer?.state === "idle" || !item.timer?.state)) {
                          return (
                            <button className="action-icon-btn action-submit" title={t("Start Timer", { defaultValue: "Start Timer" })} onClick={(e) => handleStartTimer(e, item.id)} style={{ color: "#2563eb" }}>
                              <Play size={16} />
                            </button>
                          );
                        }
                        if (["in_progress", "submitted"].includes(item.status?.toLowerCase()) && item.timer?.state === "running" && !item.assigner_paused) {
                          return (
                            <button className="action-icon-btn action-submit" title={t("Pause Task", { defaultValue: "Pause Task" })} onClick={(e) => handlePause(e, item.id)} style={{ color: "#D97706" }}>
                              <Pause size={16} />
                            </button>
                          );
                        }
                        if (item.status === "paused" || item.timer?.state === "paused") {
                          return (
                            <button className="action-icon-btn action-submit" title={t("Continue Task", { defaultValue: "Continue Task" })} onClick={(e) => handleContinue(e, item.id)}>
                              <Play size={16} />
                            </button>
                          );
                        }
                        if ((item.status === "in_progress" || item.status === "reopened") && myPivotStatus !== "submitted") {
                          return (
                            <div style={{ position: "relative", display: "inline-flex" }}>
                              <button
                                className="action-icon-btn action-submit"
                                title={item.pending_deliverables_count > 0 ? t("Submit all subtasks first", { defaultValue: "Submit all subtasks first" }) : t("Submit Task", { defaultValue: "Submit Task" })}
                                disabled={item.pending_deliverables_count > 0}
                                onClick={(e) => { e.stopPropagation(); !item.pending_deliverables_count && setSubmitTaskModal({ open: true, task: item }); }}
                                style={item.pending_deliverables_count > 0 ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                              >
                                <LuSend size={16} />
                              </button>
                            </div>
                          );
                        }
                        return null;
                      })()}
                      {(() => {
                        const canDelete = ["admin", "manager", "super_admin"].includes(currentUser?.role) || (item.created_by && Number(item.created_by) === Number(currentUser?.id)) || (item.assigned_by && Number(item.assigned_by) === Number(currentUser?.id));
                        if (!canDelete) return null;
                        return (
                          <button
                            className="action-icon-btn action-delete"
                            title={t("Delete Task", { defaultValue: "Delete Task" })}
                            onClick={(e) => handleDelete(e, item.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        );
                      })()}
                    </ActionPopover>
                  </div>
                </div>
              );
            }}
          </SortableTableWrapper>
        )}
      </div>

      {!showAll && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={(val) => { setItemsPerPage(val); setPage(1); }}
        />
      )}

      <ConfirmModal
        isOpen={deleteConfirmOpen}
        onClose={() => { setDeleteConfirmOpen(false); setDeleteTargetId(null); }}
        onConfirm={confirmDelete}
        title={t("Confirm Deletion", { defaultValue: "Confirm Deletion" })}
        message={t("Are you sure you want to delete this task? This action cannot be undone.", { defaultValue: "Are you sure you want to delete this task? This action cannot be undone." })}
        confirmText={t("Delete", { defaultValue: "Delete" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        danger
      />

      <SubmitTaskModal
        key={`guest-tasks-submit-${submitTaskModal.task?.id || "none"}`}
        isOpen={submitTaskModal.open}
        onClose={() => setSubmitTaskModal({ open: false, task: null })}
        task={submitTaskModal.task}
        onSubmitSuccess={handleTaskSubmitSuccess}
      />

      <AddNoteModal
        isOpen={noteModal.open}
        onClose={() => setNoteModal({ open: false, itemId: null })}
        itemType="task"
        itemId={noteModal.itemId}
        onSaved={fetchTasks}
      />

    </DashboardLayout>
  );
}

export default GuestTasks;