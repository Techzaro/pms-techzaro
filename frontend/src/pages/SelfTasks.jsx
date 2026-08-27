/**
 * SelfTasks page component.
 *
/**
 * SelfTasks page component.
 *
 * Displays tasks that the current user assigned to themselves.
 * Includes search with debounce, status filtering, time-range filtering,
 * drag-and-drop reordering and pagination.  Modals are available for
 * creating new tasks and submitting subtasks.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import DraggableStatusBadges from "../components/DraggableStatusBadges";
import { GoDotFill } from "react-icons/go";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";
import { ArrowUpRight, CheckCircle2, Lock, Pause, Play, StickyNote, ChevronDown, XCircle, RotateCcw, AlertOctagon, Sliders, Trash2 } from "lucide-react";
import { publish } from "../utils/eventBus";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage, notify, toast } from "../utils/notify";
import CreateTaskModal from "../components/CreateTaskModal";
import SubmitTaskModal from "../components/SubmitTaskModal";
import SubmitDeliverableModal from "../components/SubmitDeliverableModal"; // Added missing import
import SelfDeliverableViewModal from "../components/SelfDeliverableViewModal"; // Added missing import
import ConfirmModal from "../components/ConfirmModal";
import SortableTableWrapper from "../components/SortableTableWrapper";
import SmartDragHandle from "../components/SmartDragHandle";
import Pagination from "../components/Pagination";
import ActionPopover from "../components/ActionPopover";
import TaskNotesPopover from "../components/TaskNotesPopover";
import AddNoteModal from "../components/AddNoteModal";
import TaskMultiStatusBadges from "../components/TaskMultiStatusBadges";
import TaskFilterBar from "../components/TaskFilterBar";
import API_URL from "../config/api";
import { authToken, getUser, rolePath } from "../utils/auth";
import { renderDynamicDates } from "../utils/tableDateUtils";
import { formatDateTimeInline } from "../utils/formatDateTime";
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
  abandon_requested: "#FEF3C7",
  abandoned: "#FEE2E2",
};

const STATUS_TEXT_COLORS = {
  pending: "#92400E",
  in_progress: "#1E40AF",
  paused: "#92400E",
  submitted: "#1E40AF",
  reopened: "#5B21B6",
  approved: "#166534",
  rejected: "#991B1B",
  abandon_requested: "#92400E",
  abandoned: "#991B1B",
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

/** Main Self Tasks page — renders tasks assigned by the current user to themselves. */
const SelfTasks = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentUser = getUser();
  const notify = useNotification();
  
  // State declarations
  const [showTaskModal, setShowTaskModal] = useState({ open: false, projectId: null, id: null });
  const [showSubtaskSubmitModal, setShowSubtaskSubmitModal] = useState({ open: false, subtask: null });
  const [submitTaskModal, setSubmitTaskModal] = useState({ open: false, task: null });
  const [viewModal, setViewModal] = useState({ open: false, subtask: null });
  const [noteModal, setNoteModal] = useState({ open: false, itemId: null });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [advancedFilters, setAdvancedFilters] = useState({
    user_id: [],
    project_id: [],
    statuses: [],
    status: [],
    states: [],
    due_states: [],
    start_date: "",
    end_date: "",
  });
  const [orderedItems, setOrderedItems] = useState([]);
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

  const handleTaskReorder = (newItems) => {
    setItems(newItems);
  };

  const selectStatusFilter = (filter) => {
    if (filter === statusFilter && filter === "") {
      setShowAll(!showAll);
    } else {
      setStatusFilter(filter);
      setShowAll(false);
      setPage(1);
    }
  };

  const handleModalClose = (refresh) => {
    setShowTaskModal({ open: false, projectId: null, id: null });
    if (refresh) fetchTasks();
  };

  const handleTaskCreated = () => {
    fetchTasks();
  };

  const handleTaskSubmitSuccess = (taskId, updatedTask) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === taskId
          ? { ...item, ...updatedTask }
          : item
      )
    );
    setSubmitTaskModal({ open: false, task: null });
  };

  const handleSubtaskSubmitSuccess = () => {
    setShowSubtaskSubmitModal({ open: false, subtask: null });
    fetchTasks();
  };

  const handleSubtaskUpdate = () => {
    setViewModal({ open: false, subtask: null });
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
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
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
        showSuccessMessage(t("Task", { defaultValue: "Task" }), t("acknowledged", { defaultValue: "acknowledged" }));
      } else {
        const errorMsg = data?.message || data?.error || (data?.errors ? Object.values(data.errors).flat().join(", ") : null) || t("Failed to acknowledge task.", { defaultValue: "Failed to acknowledge task." });
        if (notify?.error) {
          notify.error(errorMsg);
        }
      }
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || t("Failed to acknowledge task.", { defaultValue: "Failed to acknowledge task." });
      if (notify?.error) {
        notify.error(errorMsg);
      }
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
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
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
        showSuccessMessage(t("Task", { defaultValue: "Task" }), t("resumed", { defaultValue: "resumed" }));
      } else {
        const errorMsg = data?.message || data?.error || (data?.errors ? Object.values(data.errors).flat().join(", ") : null) || t("Failed to continue task.", { defaultValue: "Failed to continue task." });
        notify.error(errorMsg);
      }
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || t("Failed to continue task.", { defaultValue: "Failed to continue task." });
      notify.error(errorMsg);
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
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
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
        showSuccessMessage(t("Task", { defaultValue: "Task" }), t("paused", { defaultValue: "paused" }));
      } else {
        notify.error(data?.message || data?.error || t("Failed to pause task.", { defaultValue: "Failed to pause task." }));
      }
    } catch {
      notify.error(t("Failed to pause task.", { defaultValue: "Failed to pause task." }));
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
        headers: { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
        _notifHandled: true,
      });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => String(item.id) !== String(taskId)));
        setOrderedItems((prev) => prev.filter((item) => String(item.id) !== String(taskId)));
        publish('task:deleted', { id: taskId });
        publish('data:changed', { type: 'task', action: 'deleted' });
        toast.success(t("Task deleted successfully", { defaultValue: "Task deleted successfully" }));
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || t("Failed to delete task.", { defaultValue: "Failed to delete task." }));
      }
    } catch {
      toast.error(t("Failed to delete task.", { defaultValue: "Failed to delete task." }));
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /** Fetch self-assigned tasks/projects from the API with current filters. */
  const fetchTasks = useCallback(() => {
    try {
      setLoading(true);
      const token = authToken();
      const params = new URLSearchParams();
      if (timeFilter) params.append("time_filter", timeFilter);
      if (debouncedSearch) params.append("search", debouncedSearch);
      if (statusFilter && (!advancedFilters.statuses || advancedFilters.statuses.length === 0)) {
        params.append("status", statusFilter);
      }

      const stList = Array.isArray(advancedFilters.statuses)
        ? advancedFilters.statuses
        : Array.isArray(advancedFilters.status)
        ? advancedFilters.status
        : [];
      if (stList.length > 0) {
        stList.forEach((st) => params.append("statuses[]", st));
        params.append("statuses", stList.join(","));
      }

      const statesList = Array.isArray(advancedFilters.states) ? advancedFilters.states : [];
      if (statesList.length > 0) {
        statesList.forEach((st) => params.append("states[]", st));
        params.append("states", statesList.join(","));
      }

      const dueList = Array.isArray(advancedFilters.due_states) ? advancedFilters.due_states : [];
      if (dueList.length > 0) {
        dueList.forEach((st) => params.append("due_states[]", st));
        params.append("due_states", dueList.join(","));
      }

      const uList = Array.isArray(advancedFilters.user_id) ? advancedFilters.user_id : [];
      if (uList.length > 0) {
        params.append("user_id", uList.join(","));
      }

      const pList = Array.isArray(advancedFilters.project_id) ? advancedFilters.project_id : [];
      if (pList.length > 0) {
        params.append("project_id", pList.join(","));
      }

      if (advancedFilters.start_date) params.append("start_date", advancedFilters.start_date);
      if (advancedFilters.end_date) params.append("end_date", advancedFilters.end_date);
      if (sortBy) {
        params.append("sort_by", sortBy);
        params.append("sort_direction", sortDirection);
        params.append("sort_dir", sortDirection);
        params.append("sort_order", sortDirection);
      }

      fetch(`${API_URL}/self-tasks?${params.toString()}`, {
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
  }, [timeFilter, debouncedSearch, statusFilter, advancedFilters, sortBy, sortDirection]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks, page]);

  useAutoRefresh(fetchTasks, {
    events: ['task:created', 'task:updated', 'task:deleted', 'data:changed'],
  });

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  const baseItems = orderedItems.length ? orderedItems : items;
  const pendingStatuses = ["pending", "planned", "Planning", "Planned"];
  const inProgressStatuses = ["in_progress", "In Progress", "In-progress"];

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
  const abandonedCount = useMemo(() => baseItems.filter((i) => i.status === "abandoned" || i.status === "abandon_requested").length, [baseItems]);
  const searchFilteredItems = useMemo(() => {
    return baseItems;
  }, [baseItems]);

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
        if (statusFilter === "transferred") {
          return item.delegation_chain && item.delegation_chain.length > 0;
        }
        if (statusFilter === "abandoned") {
          return item.status === "abandoned" || item.status === "abandon_requested";
        }
        return item.status === statusFilter;
      })
    : searchFilteredItems, [searchFilteredItems, statusFilter]);

  const taskIdList = filteredItems.map((i) => i.id);

  const totalPages = showAll ? 1 : Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = showAll ? filteredItems : filteredItems.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const breadcrumbs = [
    { label: t("Tasks", { defaultValue: "Tasks" }), path: rolePath("tasks") },
    { label: t("Self Tasks", { defaultValue: "Self Tasks" }) },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="Task">
        <div className="task-text">
          <h3>{t("Self Tasks", { defaultValue: "Self Tasks" })}</h3>
          <p>{t("Tasks you assigned to yourself", { defaultValue: "Tasks you assigned to yourself" })}</p>
        </div>

        <div className="task-btns">
          <div className="all-time">
            <select value={timeFilter} onChange={(e) => { setTimeFilter(e.target.value); setPage(1); }}>
              <option value="">{t("All Time", { defaultValue: "All Time" })}</option>
              <option value="today">{t("Today", { defaultValue: "Today" })}</option>
              <option value="7">{t("Last 7 Days", { defaultValue: "Last 7 Days" })}</option>
              <option value="30">{t("Last 30 Days", { defaultValue: "Last 30 Days" })}</option>
              <option value="180">{t("Last 6 Months", { defaultValue: "Last 6 Months" })}</option>
            </select>
          </div>

          <button
            className="export task-btn--mobile"
            onClick={() => setShowTaskModal({ open: true, projectId: null, id: Date.now() })}
            style={{ whiteSpace: "nowrap" }}
          >
            {t("+ Task", { defaultValue: "+ Task" })}
          </button>
        </div>
      </div>

      <DraggableStatusBadges
        badges={[
          { id: "", label: t("All", { defaultValue: "All" }), count: allCount, className: "All" },
          { id: "pending", label: t("Pending", { defaultValue: "Pending" }), count: pendingCount, className: "Pending" },
          { id: "in_progress", label: t("In Progress", { defaultValue: "In Progress" }), count: inProgressCount, className: "InProgress" },
          { id: "submitted", label: t("Submitted", { defaultValue: "Submitted" }), count: submittedCount, className: "Submitted" },
          { id: "approved", label: t("Approved", { defaultValue: "Approved" }), count: approvedCount, className: "Approved" },
          { id: "paused", label: t("Paused", { defaultValue: "Paused" }), count: pausedCount, className: "Paused" },
          { id: "rejected", label: t("Declined", { defaultValue: "Declined" }), count: rejectedCount, className: "Rejected" },
          { id: "abandoned", label: t("Abandoned", { defaultValue: "Abandoned" }), count: abandonedCount, className: "Abandoned", dotColor: "#DC2626" },
        ]}
        activeStatus={statusFilter}
        onSelectStatus={selectStatusFilter}
        storageKey="pms_self_tasks_status_order"
        containerClassName="task-progress"
      />

      {/* DEDICATED ACTION BAR & FILTERS */}
      <TaskFilterBar
        search={search}
        onSearchChange={setSearch}
        filters={advancedFilters}
        onFilterChange={(key, val) => setAdvancedFilters((prev) => ({ ...prev, [key]: val }))}
        onReset={() => {
          setSearch("");
          setAdvancedFilters({ user_id: [], project_id: [], status: [], start_date: "", end_date: "" });
        }}
      />

      <div className="container">
        <div className="table-header-compact">
          <div style={{ fontSize: 12, fontWeight: 600 }}>{t("ID", { defaultValue: "ID" })}</div>
          <div style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("title")}>
            {t("Task Name", { defaultValue: "Task Name" })}
          </div>
          <div style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("status")}>
            {t("Status", { defaultValue: "Status" })}
          </div>
          <div>{t("Progress", { defaultValue: "Progress" })}</div>
          <div style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("priority")}>
            {t("Priority", { defaultValue: "Priority" })}
          </div>
          <div style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("due_date")}>
            {t("Start & Due Date", { defaultValue: "Start & Due Date" })}
          </div>
          <div>{t("Action", { defaultValue: "Action" })}</div>
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>{t("Loading...", { defaultValue: "Loading..." })}</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>{t("No items found", { defaultValue: "No items found" })}</div>
        ) : (
          <SortableTableWrapper 
            as="div" 
            items={paginatedItems.map((i) => ({ ...i, sortableId: `task-${i.id}` }))} 
            onReorder={(reordered) => handleTaskReorder(reordered)} 
            idKey="sortableId"
            handleOnly
          >
            {(item, idx, dndProps) => {
              return (
                <div className="taskby-row-compact" key={item.sortableId}>
                  <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} id={item.id} businessId={item.business_id} />
                  <div>
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
                        <div className="progress-bar-track"><div className="progress-bar-fill" style={{ width: `${prog}%` }}></div></div>
                        <div style={{ fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {t("{{approved}}/{{total}} subtasks", { approved: item.approved_deliverables || 0, total: item.total_deliverables || 0, defaultValue: `${item.approved_deliverables || 0}/${item.total_deliverables || 0} subtasks` })}
                        </div>
                      </div>
                    );
                  })()}
                  <div>
                    <span className="badge" style={{ background: PRIORITY_COLORS[item.priority] || "#F3F4F6", color: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}>
                      <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}></span>
                      {t(item.priority || "Medium", { defaultValue: item.priority || "Medium" })}
                    </span>
                  </div>
                  <div className="date-box">
                    {renderDynamicDates(item, currentUser)}
                  </div>
                  <div className="col-action" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      className="action-icon-btn action-view action-trigger-lg"
                      title={t("View Task", { defaultValue: "View Task" })}
                      onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'self-tasks' } })}
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
                        const isUserAdminOrManager = ["admin", "manager"].includes(currentUser?.role);
                        const canUserApprove = isUserAdminOrManager || item.created_by === currentUser?.id || item.is_next_approver;
                        return (
                          <>
                            {canUserApprove && (item.status === "submitted" || item.status === "reopened") && (
                              <button
                                className="action-icon-btn"
                                title={t("Approve Task", { defaultValue: "Approve Task" })}
                                style={{ color: "#16A34A" }}
                                onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'self-tasks' } })}
                              >
                                <CheckCircle2 size={16} />
                              </button>
                            )}
                            {canUserApprove && (item.status === "submitted" || item.status === "reopened") && (
                              <button
                                className="action-icon-btn"
                                title={t("Decline Task", { defaultValue: "Decline Task" })}
                                style={{ color: "#DC2626" }}
                                onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'self-tasks' } })}
                              >
                                <XCircle size={16} />
                              </button>
                            )}
                            {canUserApprove && (item.status === "approved" || item.status === "submitted" || item.status === "reopened" || item.status === "abandoned") && (
                              <button
                                className="action-icon-btn"
                                title={t("Reopen Task", { defaultValue: "Reopen Task" })}
                                style={{ color: "#2563EB" }}
                                onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'self-tasks' } })}
                              >
                                <RotateCcw size={16} />
                              </button>
                            )}
                            {item.status !== "abandoned" && (
                              <button
                                className="action-icon-btn"
                                title={isUserAdminOrManager ? t("Abandon Task", { defaultValue: "Abandon Task" }) : t("Request Abandon", { defaultValue: "Request Abandon" })}
                                style={{ color: "#F59E0B" }}
                                onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'self-tasks' } })}
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
                        if (item.status === "paused") {
                          return (
                            <button className="action-icon-btn action-submit" title={t("Continue Task", { defaultValue: "Continue Task" })} onClick={(e) => handleContinue(e, item.id)}>
                              <Play size={16} />
                            </button>
                          );
                        }
                        if (["in_progress", "submitted"].includes(item.status?.toLowerCase()) && !item.assigner_paused) {
                          return (
                            <button className="action-icon-btn action-submit" title={t("Pause Task", { defaultValue: "Pause Task" })} onClick={(e) => handlePause(e, item.id)} style={{ color: "#D97706" }}>
                              <Pause size={16} />
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
                      <button
                        className="action-icon-btn action-delete"
                        title={t("Delete Task", { defaultValue: "Delete Task" })}
                        onClick={(e) => handleDelete(e, item.id)}
                      >
                        <Trash2 size={16} />
                      </button>
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

      {/* Modals */}
      {showTaskModal.open && (
        <CreateTaskModal
          key={`task-create-${showTaskModal.id}`}
          isOpen={showTaskModal.open}
          onClose={handleModalClose}
          onTaskCreated={handleTaskCreated}
          projectId={showTaskModal.projectId}
        />
      )}

      {submitTaskModal.open && (
        <SubmitTaskModal
          key={`task-submit-${submitTaskModal.task?.id || "none"}`}
          isOpen={submitTaskModal.open}
          onClose={() => setSubmitTaskModal({ open: false, task: null })}
          task={submitTaskModal.task}
          onSubmitSuccess={handleTaskSubmitSuccess}
        />
      )}

      {showSubtaskSubmitModal.open && (
        <SubmitDeliverableModal
          key={`subtask-submit-${showSubtaskSubmitModal.subtask?.id || "none"}`}
          isOpen={showSubtaskSubmitModal.open}
          onClose={() => setShowSubtaskSubmitModal({ open: false, subtask: null })}
          deliverable={showSubtaskSubmitModal.subtask}
          onSubmitSuccess={handleSubtaskSubmitSuccess}
        />
      )}

      {viewModal.open && (
        <SelfDeliverableViewModal
          key={`view-${viewModal.subtask?.id || "none"}`}
          isOpen={viewModal.open}
          onClose={() => setViewModal({ open: false, subtask: null })}
          deliverable={viewModal.subtask}
          onActionSuccess={handleSubtaskUpdate}
          onResubmit={(subtask) => setShowSubtaskSubmitModal({ open: true, subtask })}
        />
      )}

      <AddNoteModal
        isOpen={noteModal.open}
        onClose={() => setNoteModal({ open: false, itemId: null })}
        itemType="task"
        itemId={noteModal.itemId}
        onSaved={fetchTasks}
      />
    </DashboardLayout>
  );
};

export default SelfTasks;