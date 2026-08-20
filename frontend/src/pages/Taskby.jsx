/**
 * Taskby page component — "Tasks Assigned By You".
 *
 * Lists tasks that the current user (typically admin, manager or team lead)
 * has assigned to other team members. Provides search with debounce, status
 * filtering, time-range filtering, drag-and-drop reordering, pagination
 * and a modal for creating new tasks.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { CiCalendar } from "react-icons/ci";
import { IoIosArrowDown } from "react-icons/io";
import { GoDotFill } from "react-icons/go";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { IoSearchOutline, IoEyeOutline, IoCheckmarkCircle } from "react-icons/io5";
import { ArrowUpRight, Lock, Pencil, StickyNote, Trash2, Sliders, CheckCircle2, XCircle, RotateCcw, AlertOctagon } from "lucide-react";
import CreateTaskModal from "../components/CreateTaskModal";
import EditTaskModal from "../components/EditTaskModal";
import DeleteRecurrenceModal from "../components/DeleteRecurrenceModal";
import PauseReasonModal from "../components/PauseReasonModal";
import SortableTableWrapper from "../components/SortableTableWrapper";
import SmartDragHandle from "../components/SmartDragHandle";
import Pagination from "../components/Pagination";
import ActionPopover from "../components/ActionPopover";
import TaskNotesPopover from "../components/TaskNotesPopover";
import AddNoteModal from "../components/AddNoteModal";
import ConfirmModal from "../components/ConfirmModal";
import TaskFilterBar from "../components/TaskFilterBar";
import DynamicWidgetSection from "../components/DynamicWidgetSection";
import DraggableStatusBadges from "../components/DraggableStatusBadges";
import TaskMultiStatusBadges from "../components/TaskMultiStatusBadges";
import API_URL from "../config/api";
import { authToken, rolePath, getUser } from "../utils/auth";
import { renderDynamicDates } from "../utils/tableDateUtils";
import { formatDateTimeInline } from "../utils/formatDateTime";
import { useNotification } from "../context/NotificationContext";
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

/** Main Taskby page — renders tasks assigned by the current user. */
const Taskby = () => {
  const currentUser = getUser();
  const navigate = useNavigate();
  const notify = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState(() => {
    const filterParam = searchParams.get("filter");
    if (filterParam === "due_today") return "due_today";
    const status = searchParams.get("status");
    if (status) return status;
    return filterParam || "";
  });
  const [timeFilter, setTimeFilter] = useState("");
  const [orderedItems, setOrderedItems] = useState([]);
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [holdingTaskId, setHoldingTaskId] = useState(null);
  const [resumingTaskId, setResumingTaskId] = useState(null);
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [pauseModalTaskId, setPauseModalTaskId] = useState(null);
  const [noteModal, setNoteModal] = useState({ open: false, itemId: null });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [deleteRecurrenceTask, setDeleteRecurrenceTask] = useState(null);

  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [advancedFilters, setAdvancedFilters] = useState({
    user_id: [],
    project_id: [],
    status: [],
    start_date: "",
    end_date: "",
  });

  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /** Fetch tasks assigned by the current user from the API. */
  const fetchTasks = () => {
    setLoading(true);
    const token = authToken();
    const params = new URLSearchParams();
    if (debouncedSearch) params.append("search", debouncedSearch);
    if (timeFilter) params.append("time_filter", timeFilter);
    if (advancedFilters.user_id && advancedFilters.user_id.length > 0) {
      params.append("user_id", Array.isArray(advancedFilters.user_id) ? advancedFilters.user_id.join(",") : advancedFilters.user_id);
    }
    if (advancedFilters.project_id && advancedFilters.project_id.length > 0) {
      params.append("project_id", Array.isArray(advancedFilters.project_id) ? advancedFilters.project_id.join(",") : advancedFilters.project_id);
    }
    if (advancedFilters.status && advancedFilters.status.length > 0) {
      params.append("status", Array.isArray(advancedFilters.status) ? advancedFilters.status.join(",") : advancedFilters.status);
    }
    if (advancedFilters.start_date) params.append("start_date", advancedFilters.start_date);
    if (advancedFilters.end_date) params.append("end_date", advancedFilters.end_date);
    if (sortBy) params.append("sort_by", sortBy);
    if (sortOrder) params.append("sort_order", sortOrder);

    fetch(`${API_URL}/assigned-tasks?${params.toString()}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => {
        setItems(data?.data || []);
        setTotalCount(data?.total ?? 0);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTasks();
  }, [debouncedSearch, timeFilter, advancedFilters, sortBy, sortOrder]);

  useAutoRefresh(fetchTasks, {
    events: ['task:created', 'task:updated', 'task:deleted', 'data:changed'],
  });

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  useEffect(() => {
    const filterParam = searchParams.get("filter");
    const statusParam = searchParams.get("status");
    const nextFilter = filterParam === "due_today" ? "due_today" : (statusParam || filterParam || "");
    setStatusFilter(nextFilter);
  }, [searchParams]);

  const handleTaskReorder = useCallback((reordered) => {
    setOrderedItems(reordered);
    if (reordered.length) {
      const payload = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
      const token = authToken();
      fetch(`${API_URL}/tasks/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: payload }),
        _notifHandled: true,
      }).catch(() => { });
    }
  }, []);

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

  const handleAssignerPause = async (taskId, { reason, reason_detail } = {}) => {
    setHoldingTaskId(taskId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/assigner-pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: reason_detail || reason }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setItems((prev) => prev.map((item) => item.id === taskId ? { ...item, assigner_paused: true, ...data.task } : item));
        showSuccessMessage("Task", "placed on hold");
      } else {
        alert(data.message || "Failed to place task on hold.");
      }
    } catch {
      alert("Failed to place task on hold.");
    }
    setHoldingTaskId(null);
  };

  const handleAssignerResume = async (taskId) => {
    setResumingTaskId(taskId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/assigner-resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setItems((prev) => prev.map((item) => item.id === taskId ? { ...item, assigner_paused: false, ...data.task } : item));
        showSuccessMessage("Task", "resumed by assigner");
      } else {
        alert(data.message || "Failed to resume task.");
      }
    } catch {
      alert("Failed to resume task.");
    }
    setResumingTaskId(null);
  };

  const handleDelete = async (taskId) => {
    setDeleteTargetId(taskId);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    const taskId = deleteTargetId;
    setDeleteConfirmOpen(false);
    setDeleteTargetId(null);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== taskId));
        publish('task:deleted', { id: taskId });
        publish('data:changed', { type: 'task', action: 'deleted' });
        showSuccessMessage("Task", "deleted");
      } else {
        const data = await res.json();
        notify.error(data.message || "Failed to delete task.");
      }
    } catch {
      notify.error("Failed to delete task.");
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

  const filteredItems = useMemo(() => baseItems.filter((item) => {
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      const titleMatch = (item.title || "").toLowerCase().includes(q);
      const assigneeMatch = (item.assignees || []).some((a) => (a.name || "").toLowerCase().includes(q));
      const assignerMatch = (item.assigner?.name || "").toLowerCase().includes(q);
      const projectMatch = (item.project?.title || "").toLowerCase().includes(q);
      if (!titleMatch && !assigneeMatch && !assignerMatch && !projectMatch) return false;
    }
    if (advancedFilters.user_id && advancedFilters.user_id.length > 0) {
      const uids = (Array.isArray(advancedFilters.user_id) ? advancedFilters.user_id : [advancedFilters.user_id]).map(Number);
      const hasMatch = (item.assignees || []).some((a) => uids.includes(Number(a.id))) ||
        uids.includes(Number(item.assigned_to)) ||
        uids.includes(Number(item.assigned_by));
      if (!hasMatch) return false;
    }
    if (advancedFilters.project_id && advancedFilters.project_id.length > 0) {
      const pids = (Array.isArray(advancedFilters.project_id) ? advancedFilters.project_id : [advancedFilters.project_id]).map(Number);
      const projId = Number(item.project_id || item.project?.id);
      if (!pids.includes(projId)) return false;
    }
    if (advancedFilters.status && advancedFilters.status.length > 0) {
      const sts = Array.isArray(advancedFilters.status) ? advancedFilters.status : [advancedFilters.status];
      const match = sts.some((st) => {
        if (st === "due_today") {
          const d = item.end_date || item.due_date || item.start_date ? new Date(item.end_date || item.due_date || item.start_date) : null;
          const isToday = d && d.toDateString() === new Date().toDateString();
          const isDone = ["approved", "completed", "done"].includes((item.status || "").toLowerCase());
          return isToday && !isDone;
        }
        if (st === "pending") return ["pending", "planned", "Planning", "Planned"].includes(item.status);
        if (st === "in_progress") return ["in_progress", "In Progress", "in-progress"].includes(item.status);
        if (st === "paused") return ["paused", "pause", "Pause"].includes(item.status);
        if (st === "transferred") return Array.isArray(item.delegation_chain) && item.delegation_chain.length > 0;
        if (st === "rejected" || st === "declined") return item.status === "rejected" || item.status === "declined";
        if (st === "abandoned") return item.status === "abandoned" || item.status === "abandon_requested";
        if (st === "approved") return item.status === "approved" || item.status === "completed";
        return item.status === st;
      });
      if (!match) return false;
    }
    if (advancedFilters.start_date) {
      const itemDate = item.start_date ? new Date(item.start_date) : null;
      if (!itemDate || itemDate < new Date(advancedFilters.start_date)) return false;
    }
    if (advancedFilters.end_date) {
      const itemDate = item.end_date || item.due_date ? new Date(item.end_date || item.due_date) : null;
      if (!itemDate || itemDate > new Date(advancedFilters.end_date)) return false;
    }
    if (statusFilter === "due_today") {
      const dateVal = item.end_date || item.due_date || item.start_date;
      if (!dateVal) return false;
      const d = new Date(dateVal);
      const now = new Date();
      const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      const isCompleted = ["approved", "completed", "done"].includes((item.status || "").toLowerCase());
      return isToday && !isCompleted;
    }
    if (statusFilter) {
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
    }
    return true;
  }), [baseItems, debouncedSearch, statusFilter, advancedFilters]);

  const taskIdList = filteredItems.map((i) => i.id);

  const showAllItems = showAll;
  const totalPages = showAllItems ? 1 : Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = showAllItems ? filteredItems : filteredItems.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const breadcrumbs = [
    { label: "Tasks", path: rolePath("tasks") },
    { label: "Assigned By You" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="Task">
        <div className="task-text">
          <h3>Tasks Assigned By You</h3>
          <p>Manage and track tasks you assigned</p>
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

          <button
            className="export task-btn--mobile"
            onClick={() => setShowTaskModal(true)}
            style={{ whiteSpace: "nowrap" }}
          >
            + Task
          </button>
        </div>
      </div>

      {showTaskModal && (
        <CreateTaskModal onClose={handleModalClose} />
      )}

      <DraggableStatusBadges
        badges={[
          { id: "due_today", label: "Due Today", count: dueTodayCount, className: "DueToday", dotColor: "#EF4444" },
          { id: "pending", label: "Pending", count: pendingCount, className: "Pending" },
          { id: "in_progress", label: "In Progress", count: inProgressCount, className: "InProgress" },
          { id: "paused", label: "Paused", count: pausedCount, className: "Paused" },
          { id: "submitted", label: "Submitted", count: submittedCount, className: "Submitted" },
          { id: "reopened", label: "Reopened", count: reopenedCount, className: "Reopened" },
          { id: "transferred", label: "Transferred", count: transferredCount, className: "Transferred" },
          { id: "approved", label: "Approved", count: approvedCount, className: "Approved" },
          { id: "rejected", label: "Declined", count: rejectedCount, className: "Rejected" },
          { id: "abandoned", label: "Abandoned", count: abandonedCount, className: "Abandoned", dotColor: "#DC2626" },
          { id: "", label: "All", count: allCount, className: "All" },
        ]}
        activeStatus={statusFilter}
        onSelectStatus={selectStatusFilter}
        storageKey="pms_taskby_status_order"
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
        {/* Header Table */}
        <div className="table-header1">
          <div style={{ fontSize: 12, fontWeight: 600 }}>ID</div>
          <div>Assigned To</div>
          <div className="task-name-column">Task Name</div>
          <div className="status-column">Status</div>
          <div>Progress</div>
          <div className="priority-column">Priority</div>
          <div className="date-column">Start & Due Date</div>
          <div>Action</div>
        </div>



        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No items found</div>
        ) : (
          <div className="sortable-table-container">
            <SortableTableWrapper
              items={paginatedItems.map((i, index) => ({
                ...i,
                sortableId: `${i.id}-${index}`
              }))}
              onReorder={(reordered) => handleTaskReorder(reordered)}
              idKey="sortableId"
              as="div"
              handleOnly
            >
              {(item, idx, dndProps) => {
                const colors = getRandomColors(item.id);
                const uniqueKey = `task-${item.id}-${idx}`;

                const assignees = item.assignees || [];
                const isDirectToOa = item.has_direct_to_oa_delegation && item.current_owner_name && item.current_owner_id;
                const primaryAssignee = isDirectToOa ? { name: item.current_owner_name } : assignees[0];
                return (
                  <div className="taskby-row" key={uniqueKey}>
                    <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} id={item.id} businessId={item.business_id} />
                    <div className="col-assigned-to">
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                          {getInitials(primaryAssignee?.name)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <div className="user-name">{primaryAssignee?.name || "Unassigned"}</div>
                            {item.is_transferee && (
                              <span style={{ fontSize: "10px", fontWeight: 600, color: "#6B7280", background: "#F3F4F6", padding: "1px 6px", borderRadius: "4px", border: "1px solid #D1D5DB" }}>Transferee</span>
                            )}
                          </div>
                          <div className="user-role">{primaryAssignee?.role || ""}</div>
                          {isDirectToOa && item.delegator_name && (
                            <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
                              via {item.delegator_name}
                            </div>
                          )}
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

                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
                        {item.deliverables_progress || 0}%
                      </div>
                      <div className="progress-bar-track">
                        <div className="progress-bar-fill" style={{ width: `${item.deliverables_progress || 0}%` }}></div>
                      </div>
                      <div style={{ fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.approved_deliverables || 0}/{item.total_deliverables || 0} subtasks
                      </div>
                    </div>

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
                        onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'taskby' } })}
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
                        {(() => {
                          const isRecurrence = item.task_type === "recurring" || !!item.recurrence_settings;
                          const recEnd = item.recurrence_end_date || item.end_date;
                          const isRecurrenceActive = isRecurrence ? (!recEnd || new Date(recEnd) > new Date()) : true;
                          if (isRecurrence && !isRecurrenceActive) {
                            return null;
                          }
                          return (
                            <>
                              {item.status?.toLowerCase() !== "approved" && (
                                <button
                                  className="action-icon-btn action-edit"
                                  title="Edit"
                                  onClick={async () => {
                                    try {
                                      const token = authToken();
                                      const res = await fetch(`${API_URL}/tasks/${item.id}`, {
                                        headers: { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
                                      });
                                      if (res.ok) {
                                        const data = await res.json();
                                        setEditingTask(data.task || item);
                                      } else {
                                        setEditingTask(item);
                                      }
                                    } catch {
                                      setEditingTask(item);
                                    }
                                  }}
                                >
                                  <Pencil size={16} />
                                </button>
                              )}
                              {item.status?.toLowerCase() !== "approved" && (
                                <button
                                  className="action-icon-btn action-delete"
                                  title="Delete"
                                  onClick={() => {
                                    if (isRecurrence) {
                                      setDeleteRecurrenceTask(item);
                                    } else {
                                      handleDelete(item.id);
                                    }
                                  }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </>
                          );
                        })()}
                        {(() => {
                          const currentUser = getUser();
                          const isUserAdminOrManager = ["admin", "manager"].includes(currentUser?.role);
                          const canUserApprove = isUserAdminOrManager || item.created_by === currentUser?.id || item.is_next_approver;
                          return (
                            <>
                              {canUserApprove && (item.status === "submitted" || item.status === "reopened") && (
                                <button
                                  className="action-icon-btn"
                                  title="Approve Task"
                                  style={{ color: "#16A34A" }}
                                  onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'taskby' } })}
                                >
                                  <CheckCircle2 size={16} />
                                </button>
                              )}
                              {canUserApprove && (item.status === "submitted" || item.status === "reopened") && (
                                <button
                                  className="action-icon-btn"
                                  title="Decline Task"
                                  style={{ color: "#DC2626" }}
                                  onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'taskby' } })}
                                >
                                  <XCircle size={16} />
                                </button>
                              )}
                              {canUserApprove && (item.status === "approved" || item.status === "submitted" || item.status === "reopened" || item.status === "abandoned") && (
                                <button
                                  className="action-icon-btn"
                                  title="Reopen Task"
                                  style={{ color: "#2563EB" }}
                                  onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'taskby' } })}
                                >
                                  <RotateCcw size={16} />
                                </button>
                              )}
                              {item.status !== "abandoned" && (
                                <button
                                  className="action-icon-btn"
                                  title={isUserAdminOrManager ? "Abandon Task" : "Request Abandon"}
                                  style={{ color: "#F59E0B" }}
                                  onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'taskby' } })}
                                >
                                  <AlertOctagon size={16} />
                                </button>
                              )}
                            </>
                          );
                        })()}
                        {["pending", "in_progress", "reopened", "paused"].includes(item.status) && !item.assigner_paused && (
                          <button
                            className="action-icon-btn"
                            title="Put On Hold"
                            disabled={holdingTaskId === item.id}
                            onClick={() => { setPauseModalTaskId(item.id); setPauseModalOpen(true); }}
                            style={{ color: "#7C3AED", cursor: holdingTaskId === item.id ? "not-allowed" : "pointer" }}
                          >
                            <Lock size={16} />
                          </button>
                        )}
                        {item.assigner_paused && (
                          <button
                            className="action-icon-btn"
                            title="Resume"
                            disabled={resumingTaskId === item.id}
                            onClick={() => handleAssignerResume(item.id)}
                            style={{ color: "#059669", cursor: resumingTaskId === item.id ? "not-allowed" : "pointer" }}
                          >
                            <Lock size={16} />
                          </button>
                        )}
                      </ActionPopover>
                    </div>
                  </div>
                );
              }}
            </SortableTableWrapper>
          </div>
        )}

        {!showAllItems && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            itemsPerPage={itemsPerPage}
            onItemsPerPageChange={(val) => { setItemsPerPage(val); setPage(1); }}
          />
        )}
      </div>

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          onClose={(refresh) => { setEditingTask(null); if (refresh) fetchTasks(); }}
        />
      )}

      <PauseReasonModal
        isOpen={pauseModalOpen}
        onClose={() => { setPauseModalOpen(false); setPauseModalTaskId(null); }}
        onConfirm={async (data) => { await handleAssignerPause(pauseModalTaskId, data); setPauseModalOpen(false); setPauseModalTaskId(null); }}
        isAssigner
      />

      <AddNoteModal
        isOpen={noteModal.open}
        onClose={() => setNoteModal({ open: false, itemId: null })}
        itemType="task"
        itemId={noteModal.itemId}
        onSaved={fetchTasks}
      />

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

      <DeleteRecurrenceModal
        isOpen={!!deleteRecurrenceTask}
        onClose={() => setDeleteRecurrenceTask(null)}
        task={deleteRecurrenceTask}
        onSuccess={fetchTasks}
      />

      <DynamicWidgetSection storageKey="pms_taskby_widgets" sectionTitle="Subtasks Widgets" />
    </DashboardLayout>
  );
};

export default Taskby;