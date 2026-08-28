/**
 * Tasks page component — "Tasks Assigned To You".
 *
 * Displays tasks that have been assigned to the current user
 * by others.  Provides search with debounce, status filtering, time-range
 * filtering, drag-and-drop reordering and pagination.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { GoDotFill } from "react-icons/go";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";
import { CheckCircle2, Lock, Pause, Play, StickyNote, Users, ArrowUpRight, ChevronDown, XCircle, RotateCcw, AlertOctagon, Sliders, Pin, Trash2 } from "lucide-react";
import { usePinnedTasks, togglePinTask, isTaskPinned } from "../utils/pinnedTasks";
import { showSuccessMessage, notify, toast } from "../utils/notify";
import { publish } from "../utils/eventBus";
import CreateTaskModal from "../components/CreateTaskModal";
import SubmitTaskModal from "../components/SubmitTaskModal";
import ConfirmModal from "../components/ConfirmModal";
import SortableTableWrapper from "../components/SortableTableWrapper";
import SmartDragHandle from "../components/SmartDragHandle";
import Pagination from "../components/Pagination";
import ActionPopover from "../components/ActionPopover";
import TaskNotesPopover from "../components/TaskNotesPopover";
import AddNoteModal from "../components/AddNoteModal";
import TransferTaskDialog from "../components/TransferTaskDialog";
import TaskFilterBar from "../components/TaskFilterBar";
import DynamicWidgetSection from "../components/DynamicWidgetSection";
import DraggableStatusBadges from "../components/DraggableStatusBadges";
import TaskMultiStatusBadges from "../components/TaskMultiStatusBadges";
import API_URL from "../config/api";
import { usePersonalization } from "../context/PersonalizationContext";
import { authToken, getUser, rolePath } from "../utils/auth";
import { renderDynamicDates } from "../utils/tableDateUtils";
import { formatDateTimeInline } from "../utils/formatDateTime";
import "../components/ActionPopover.css";
import "../pages/Task.css";

function canUserPauseResume(item, currentUser) {
  if (!item || !currentUser) return false;
  if (["admin", "manager"].includes(currentUser.role)) return true;
  const uid = parseInt(currentUser.id, 10);
  if (item.assigned_to && parseInt(item.assigned_to, 10) === uid) return true;
  if (item.assignedTo?.id && parseInt(item.assignedTo.id, 10) === uid) return true;
  if (item.assignee?.id && parseInt(item.assignee.id, 10) === uid) return true;
  if (Array.isArray(item.assignees) && item.assignees.some((a) => parseInt(a.id, 10) === uid)) return true;
  if (item.is_assignee) return true;
  return false;
}

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

const STATUS_LABELS = {
  pending: "Pending",
  in_progress: "In Progress",
  paused: "Paused",
  submitted: "Submitted",
  reopened: "Reopened",
  approved: "Approved",
  rejected: "Rejected",
  abandon_requested: "Abandon Requested",
  abandoned: "Abandoned",
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

function formatTaskId(id) {
  if (!id) return "#0";
  return `#${id}`;
}

/** Main Tasks page — renders tasks assigned to the current user by others. */
function Tasks() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isWidgetEnabled } = usePersonalization();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [orderedItems, setOrderedItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const currentUser = getUser();
  const [statusFilter, setStatusFilter] = useState(() => {
    const filterParam = searchParams.get("filter");
    if (filterParam === "due_today") return "due_today";
    const status = searchParams.get("status");
    if (status) return status;
    return filterParam || "";
  });
  const [timeFilter, setTimeFilter] = useState("");
  const [submitTaskModal, setSubmitTaskModal] = useState({ open: false, task: null });
  const [restoreDraftId, setRestoreDraftId] = useState(null);
  const [noteModal, setNoteModal] = useState({ open: false, itemId: null });
  const [transferDialog, setTransferDialog] = useState({ open: false, task: null });
  const [pinnedTasks] = usePinnedTasks();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(10);

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

  const handleReorder = (newItems) => {
    setItems(newItems);
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /** Fetch tasks assigned to the current user from the API. */
  const fetchTasks = useCallback(() => {
    try {
      setLoading(true);
      const token = authToken();
      const params = new URLSearchParams();
      if (timeFilter) params.append("time_filter", timeFilter);
      if (debouncedSearch) params.append("search", debouncedSearch);

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

      fetch(`${API_URL}/my-tasks?${params.toString()}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
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
  }, [debouncedSearch, timeFilter, statusFilter, advancedFilters, sortBy, sortDirection]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useAutoRefresh(fetchTasks, {
    events: ['task:created', 'task:updated', 'task:deleted', 'data:changed'],
  });

  // Handle draft restoration from DraftCenter
  useEffect(() => {
    const draftId = location.state?.openDraft;
    if (!draftId) return;
    window.history.replaceState({}, document.title);
    setRestoreDraftId(draftId);
    setShowTaskModal(true);
  }, [location.state]);

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  const handleTaskListReorder = useCallback((reordered) => {
    setOrderedItems(reordered);
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
    const filterParam = searchParams.get("filter");
    const statusParam = searchParams.get("status");
    const nextFilter = filterParam === "due_today" ? "due_today" : (statusParam || filterParam || "");
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

  const handleModalClose = (refresh) => {
    setShowTaskModal(false);
    if (refresh) fetchTasks();
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
    return formatDateTimeInline(dateStr);
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
      abandon_requested: "Abandon Requested",
      abandoned: "Abandoned",
    };
    return map[status] || status;
  };

  const handleTaskSubmitSuccess = (updatedTask) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === updatedTask.id
          ? { ...item, ...updatedTask }
          : item
      )
    );
    setSubmitTaskModal({ open: false, task: null });
  };

  const handleDirectApprove = async (e, taskId) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === taskId ? { ...item, status: "approved", ...(data.task || {}) } : item
          )
        );
        publish('task:updated', { id: taskId, status: 'approved' });
        publish('data:changed', { type: 'task', action: 'updated' });
        showSuccessMessage("Task", "approved");
      } else {
        notify.error(data.message || "Failed to approve task.");
      }
    } catch {
      notify.error("An error occurred while approving task.");
    }
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
        showSuccessMessage("Task", "acknowledged");
      } else {
        const errorMsg = data?.message || data?.error || (data?.errors ? Object.values(data.errors).flat().join(", ") : null) || "Failed to acknowledge task.";
        if (notify?.error) {
          notify.error(errorMsg);
        }
      }
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to acknowledge task.";
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
        showSuccessMessage("Task", "resumed");
      } else {
        const errorMsg = data?.message || data?.error || (data?.errors ? Object.values(data.errors).flat().join(", ") : null) || "Failed to continue task.";
        notify.error(errorMsg);
      }
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to continue task.";
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
        showSuccessMessage("Task", "paused");
      } else {
        notify.error(data?.message || data?.error || "Failed to pause task.");
      }
    } catch {
      notify.error("Failed to pause task.");
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
        toast.success("Task deleted successfully");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || "Failed to delete task.");
      }
    } catch {
      toast.error("Failed to delete task.");
    }
  };

  const baseItems = orderedItems.length ? orderedItems : items;
  const pendingStatuses = ["pending", "planned", "Planning", "Planned"];
  const inProgressStatuses = ["in_progress", "In Progress", "In-progress", "reopened", "Reopened"];

  const allCount = baseItems.length;
  const dueTodayCount = baseItems.filter((i) => { const d = i.end_date ? new Date(i.end_date) : null; return d && d.toDateString() === new Date().toDateString(); }).length;
  const pendingCount = baseItems.filter((i) => pendingStatuses.includes(i.status)).length;
  const inProgressCount = baseItems.filter((i) => inProgressStatuses.includes(i.status)).length;
  const pausedCount = baseItems.filter((i) => i.status === "paused").length;
  const submittedCount = baseItems.filter((i) => i.status === "submitted").length;
  const reopenedCount = baseItems.filter((i) => i.status === "reopened").length;
  const transferredCount = baseItems.filter((i) => i.delegation_chain && i.delegation_chain.length > 0).length;
  const approvedCount = baseItems.filter((i) => i.status === "approved").length;
  const rejectedCount = baseItems.filter((i) => i.status === "rejected").length;
  const abandonedCount = baseItems.filter((i) => i.status === "abandoned" || i.status === "abandon_requested").length;
  const searchFilteredItems = useMemo(() => {
    return baseItems;
  }, [baseItems]);

  const filteredItems = statusFilter
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
        if (statusFilter === "abandoned") {
          return item.status === "abandoned" || item.status === "abandon_requested";
        }
        return item.status === statusFilter;
      })
    : searchFilteredItems;

  const taskIdList = filteredItems.map((i) => i.id);

  const totalPages = showAll ? 1 : Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = showAll ? filteredItems : filteredItems.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const breadcrumbs = [
    { label: "Tasks", path: rolePath("tasks") },
    { label: "Assigned To You" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="Task">
        <div className="task-text">
          <h3>Tasks Assigned To You</h3>
          <p>Manage and track your tasks and projects</p>
        </div>

        <div className="task-btns">
          <div className="all-time">
            <select value={timeFilter} onChange={(e) => { setTimeFilter(e.target.value); setPage(1); }}>
              <option value="">All Time</option>
              <option value="today">Today</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="180">Last 6 Months</option>
            </select>
          </div>
        </div>
      </div>

      {showTaskModal && (
        <CreateTaskModal
          restoreDraftId={restoreDraftId}
          onClose={(refresh) => {
            setShowTaskModal(false);
            setRestoreDraftId(null);
            if (refresh) fetchTasks();
          }}
        />
      )}

      {isWidgetEnabled("tasks", "stats_cards") && (
        <DraggableStatusBadges
        badges={[
          { id: "", label: "All", count: allCount, className: "All" },
          { id: "pending", label: "Pending", count: pendingCount, className: "Pending" },
          { id: "in_progress", label: "In Progress", count: inProgressCount, className: "InProgress" },
          { id: "submitted", label: "Submitted", count: submittedCount, className: "Submitted" },
          { id: "approved", label: "Approved", count: approvedCount, className: "Approved" },
          { id: "paused", label: "Paused", count: pausedCount, className: "Paused" },
          { id: "rejected", label: "Declined", count: rejectedCount, className: "Rejected" },
          { id: "abandoned", label: "Abandoned", count: abandonedCount, className: "Abandoned", dotColor: "#DC2626" },
        ]}
        activeStatus={statusFilter}
          onSelectStatus={selectStatusFilter}
          storageKey="pms_tasks_status_order"
          containerClassName="task-progress"
        />
      )}

      {/* DEDICATED ACTION BAR & FILTERS */}
      {isWidgetEnabled("tasks", "filter_bar") && (
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
      )}

      {/* TABLE */}
      <div className="container">
        <div className="table-header1">
          <div style={{ fontSize: 12, fontWeight: 600 }}>ID</div>
          <div style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("assigned_by")}>
            Assigned by
          </div>
          <div className="task-name-column" style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("title")}>
            Task Name
          </div>
          <div className="status-column" style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("status")}>
            Status
          </div>
          <div>Progress</div>
          <div className="priority-column" style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("priority")}>
            Priority
          </div>
          <div className="date-column" style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("due_date")}>
            Start & Due Date
          </div>
          <div>Action</div>
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No items found</div>
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

              const hasChain = item.delegation_chain && item.delegation_chain.length > 0;
              const assigner = item.assigner;
              const displayName = item.transferred_by_name || assigner?.name || "System";
              const displayRole = item.transferred_by_name ? "Transferred" : (assigner?.role || "");
              return (
                <div className="taskby-row" key={item.sortableId}>
                  <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} id={item.id} businessId={item.business_id} />
                  <div className="col-assigned-to">
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div className="avatar" style={{ background: colors.bg, color: colors.text }}>{getInitials(displayName)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="user-name">{displayName}</div>
                        <div className="user-role">{displayRole}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="col-task-name">
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {hasChain && <ArrowUpRight size={14} style={{ color: "#6B7280", flexShrink: 0 }} />}
                      <div className="task-title">{item.title}</div>
                      <TaskNotesPopover taskId={item.id} itemType="task" />
                    </div>
                    {item.project && (
                      <Link to={rolePath(`projects/project-details/${item.project.id}`)} onClick={(e) => e.stopPropagation()} style={{ fontSize: "11px", color: "#6B7280", textDecoration: "none", marginTop: "2px", display: "inline-block" }}>
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
                          {item.approved_deliverables || 0}/{item.total_deliverables || 0} subtasks
                        </div>
                      </div>
                    );
                  })()}
                  
                  <div className="col-priority">
                    <span className="badge" style={{ background: PRIORITY_COLORS[item.priority] || "#F3F4F6", color: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}>
                      <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}></span>
                      {item.priority}
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
                      title="View Task"
                      onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'tasks' } })}
                    >
                      <IoEyeOutline size={18} />
                    </button>
                    <ActionPopover
                      trigger={
                        <button className="action-icon-btn action-manage action-trigger-lg" title="Status Actions" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "4px", borderRadius: "6px", background: "var(--bg-hover, #f3f4f6)", color: "var(--text-primary, #374151)", border: "1px solid var(--border-color, #e5e7eb)", cursor: "pointer" }}>
                          <Sliders size={18} />
                        </button>
                      }
                    >
                      <button className="action-icon-btn action-note" title="Add Note" onClick={() => setNoteModal({ open: true, itemId: item.id })}><StickyNote size={14} /></button>
                      <button
                        className="action-icon-btn"
                        title={isTaskPinned(item.id) ? "Unpin from Dashboard" : "Pin to Dashboard"}
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); togglePinTask(item); }}
                      >
                        <Pin size={14} style={{ color: isTaskPinned(item.id) ? "#4f46e5" : "var(--text-secondary)", fill: isTaskPinned(item.id) ? "#4f46e5" : "none" }} />
                      </button>
                      {(() => {
                        const isUserAdminOrManager = ["admin", "manager"].includes(currentUser?.role);
                        const canUserApprove = isUserAdminOrManager || item.created_by === currentUser?.id || item.is_next_approver;
                        return (
                          <>
                            {canUserApprove && (item.status === "submitted" || item.status === "reopened") && (
                              <button
                                className="action-icon-btn"
                                title="Approve Task"
                                style={{ color: "#16A34A", fontWeight: "bold" }}
                                onClick={(e) => handleDirectApprove(e, item.id)}
                              >
                                <CheckCircle2 size={16} />
                              </button>
                            )}
                            {canUserApprove && (item.status === "submitted" || item.status === "reopened") && (
                              <button
                                className="action-icon-btn"
                                title="Decline Task"
                                style={{ color: "#DC2626" }}
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'tasks' } }); }}
                              >
                                <XCircle size={16} />
                              </button>
                            )}
                            {canUserApprove && (item.status === "approved" || item.status === "submitted" || item.status === "reopened" || item.status === "abandoned") && (
                              <button
                                className="action-icon-btn"
                                title="Reopen Task"
                                style={{ color: "#2563EB" }}
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'tasks' } }); }}
                              >
                                <RotateCcw size={16} />
                              </button>
                            )}
                            {item.status !== "abandoned" && (
                              <button
                                className="action-icon-btn"
                                title={isUserAdminOrManager ? "Abandon Task" : "Request Abandon"}
                                style={{ color: "#F59E0B" }}
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'tasks' } }); }}
                              >
                                <AlertOctagon size={16} />
                              </button>
                            )}
                          </>
                        );
                      })()}
                      {(() => {
                        if (item.is_transferor) {
                          return (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "#EFF6FF", color: "#1D4ED8", fontSize: "11px", fontWeight: 600 }}>
                              Transferred
                            </span>
                          );
                        }
                        const myPivotStatus = item.assignees?.find(a => parseInt(a.id, 10) === parseInt(currentUser?.id, 10))?.pivot?.status;
                        if (item.assigner_paused) {
                          return (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "#FEF3C7", color: "#92400E", fontSize: "11px", fontWeight: 600, border: "1px solid #F59E0B" }}>
                              <Lock size={12} />
                              Paused by Assigner
                            </span>
                          );
                        }
                        if (item.status === "pending") {
                          return (
                            <button className="action-icon-btn action-submit" title="Acknowledge Task" onClick={(e) => handleAcknowledge(e, item.id)}>
                              <CheckCircle2 size={16} />
                            </button>
                          );
                        }
                        if (item.status === "paused" && canUserPauseResume(item, currentUser)) {
                          return (
                            <button className="action-icon-btn action-submit" title="Continue Task" onClick={(e) => handleContinue(e, item.id)}>
                              <Play size={16} />
                            </button>
                          );
                        }
                        if (["in_progress", "submitted"].includes(item.status?.toLowerCase()) && !item.assigner_paused && canUserPauseResume(item, currentUser)) {
                          return (
                            <button className="action-icon-btn action-submit" title="Pause Task" onClick={(e) => handlePause(e, item.id)} style={{ color: "#D97706" }}>
                              <Pause size={16} />
                            </button>
                          );
                        }
                        if ((item.status === "in_progress" || item.status === "reopened") && myPivotStatus !== "submitted") {
                          return (
                            <div style={{ position: "relative", display: "inline-flex" }}>
                              <button
                                className="action-icon-btn action-submit"
                                title={item.pending_deliverables_count > 0 ? "Submit all subtasks first" : item.status === "paused" || item.assigner_paused ? "Task is paused. Resume first." : "Submit Task"}
                                disabled={item.pending_deliverables_count > 0 || item.status === "paused" || item.assigner_paused}
                                onClick={(e) => { e.stopPropagation(); !item.pending_deliverables_count && item.status !== "paused" && !item.assigner_paused && setSubmitTaskModal({ open: true, task: item }); }}
                                style={item.pending_deliverables_count > 0 || item.status === "paused" || item.assigner_paused ? { opacity: 0.4, cursor: "not-allowed" } : {}}
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
                            title="Delete Task"
                            onClick={(e) => handleDelete(e, item.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        );
                      })()}
                      {!["approved", "rejected", "pending", "submitted"].includes(item.status) && !item.is_transferor && (
                        <button
                          className="action-icon-btn"
                          title="Transfer Task"
                          onClick={(e) => { e.stopPropagation(); setTransferDialog({ open: true, task: item }); }}
                          style={{ color: "#2563EB", cursor: "pointer" }}
                        >
                          <Users size={16} />
                        </button>
                      )}
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
        title="Confirm Deletion"
        message="Are you sure you want to delete this task? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger
      />

      <SubmitTaskModal
        key={`tasks-submit-${submitTaskModal.task?.id || "none"}`}
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

      {transferDialog.open && (
        <TransferTaskDialog
          isOpen={transferDialog.open}
          onClose={() => setTransferDialog({ open: false, task: null })}
          task={transferDialog.task}
          onTransferSuccess={() => { setTransferDialog({ open: false, task: null }); fetchTasks(); showSuccessMessage("Task", "transferred"); }}
        />
      )}

      <DynamicWidgetSection storageKey="pms_tasks_widgets" sectionTitle="Tasks Widgets" />
    </DashboardLayout>
  );
}

export default Tasks;