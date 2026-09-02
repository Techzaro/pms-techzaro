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
import { publish } from "../utils/eventBus";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { CiCalendar } from "react-icons/ci";
import { IoIosArrowDown } from "react-icons/io";
import { GoDotFill } from "react-icons/go";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { showSuccessMessage, notify, toast } from "../utils/notify";
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
  const { t } = useTranslation();
  const currentUser = getUser();
  const navigate = useNavigate();
  const notify = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [items, setItems] = useState([]);
  const [sharedTasks, setSharedTasks] = useState([]);
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

  const handleTaskReorder = (newItems) => {
    setItems(newItems);
  };

  const handleModalClose = (refresh) => {
    setShowTaskModal(false);
    if (refresh) fetchTasks();
  };

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

  const getInitials = useCallback((name) => {
    if (!name) return "??";
    return name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase();
  }, []);

  const getRandomColors = useCallback((id) => {
    const colors = [
      { bg: "#E0E7FF", text: "#4338CA" },
      { bg: "#FEE2E2", text: "#B91C1C" },
      { bg: "#DCFCE7", text: "#22C55E" },
      { bg: "#FEF3C7", text: "#D97706" },
      { bg: "#EDE9FE", text: "#7C3AED" },
      { bg: "#FCE7F3", text: "#DB2777" },
    ];
    const num = typeof id === "string" ? parseInt(id.replace(/\D/g, ""), 10) || 0 : id || 0;
    return colors[num % colors.length];
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /** Fetch tasks assigned by the current user from the API. */
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

      fetch(`${API_URL}/assigned-tasks?${params.toString()}`, {
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

  const fetchSharedTasks = useCallback(async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/sharing/shared-resources?type=task`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSharedTasks(Array.isArray(data?.data) ? data.data : []);
    } catch (err) {
      console.error("Failed to fetch shared tasks:", err);
    }
  }, []);

  useEffect(() => {
    fetchSharedTasks();
  }, [fetchSharedTasks]);

  useEffect(() => {
    const merged = [
      ...items,
      ...sharedTasks.filter((st) => !items.some((i) => String(i.id) === String(st.id))),
    ];
    setOrderedItems(merged);
  }, [items, sharedTasks]);

  useAutoRefresh(() => { fetchTasks(); fetchSharedTasks(); }, {
    events: ['task:created', 'task:updated', 'task:deleted', 'data:changed', 'sharing:changed'],
  });

  const baseItems = orderedItems.length ? orderedItems : items;
  const pendingStatuses = ["pending", "planned", "Planning", "Planned"];
  const inProgressStatuses = ["in_progress", "In Progress", "In-progress", "reopened", "Reopened"];

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

  const filteredItems = useMemo(() => {
    let list = baseItems;
    if (statusFilter) {
      const sf = String(statusFilter).toLowerCase();
      if (sf === "due_today") {
        list = list.filter((item) => {
          const dateVal = item.end_date || item.due_date || item.start_date;
          if (!dateVal) return false;
          const d = new Date(dateVal);
          const now = new Date();
          const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
          const isCompleted = ["approved", "completed", "done"].includes((item.status || "").toLowerCase());
          return isToday && !isCompleted;
        });
      } else if (sf === "pending") {
        list = list.filter((item) => pendingStatuses.includes(item.status));
      } else if (sf === "in_progress") {
        list = list.filter((item) => inProgressStatuses.includes(item.status));
      } else if (sf === "rejected" || sf === "declined") {
        list = list.filter((item) => item.status === "rejected" || item.status === "declined");
      } else if (sf === "abandoned") {
        list = list.filter((item) => item.status === "abandoned" || item.status === "abandon_requested");
      } else {
        list = list.filter((item) => String(item.status).toLowerCase() === sf);
      }
    }
    return list;
  }, [baseItems, statusFilter]);

  const taskIdList = filteredItems.map((i) => i.id);

  const showAllItems = showAll;
  const totalPages = showAllItems ? 1 : Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = showAllItems ? filteredItems : filteredItems.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const breadcrumbs = [
    { label: t("Tasks", { defaultValue: "Tasks" }), path: rolePath("tasks") },
    { label: t("Assigned By You", { defaultValue: "Assigned By You" }) },
  ];

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

  const handleAssignerPause = async (taskId, data) => {
    try {
      setHoldingTaskId(taskId);
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/assigner-pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ reason: data?.reason_detail || data?.reason || "other" }),
        _notifHandled: true,
      });
      const resData = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === taskId ? { ...item, status: "paused", assigner_paused: true, ...(resData.task || {}) } : item
          )
        );
        publish('task:updated', { id: taskId, status: 'paused' });
        publish('data:changed', { type: 'task', action: 'updated' });
        showSuccessMessage(t("Task", { defaultValue: "Task" }), t("paused", { defaultValue: "paused" }));
      } else {
        notify.error(resData?.message || t("Failed to pause task.", { defaultValue: "Failed to pause task." }));
      }
    } catch {
      notify.error(t("Failed to pause task.", { defaultValue: "Failed to pause task." }));
    } finally {
      setHoldingTaskId(null);
    }
  };

  const handleAssignerResume = async (taskId) => {
    try {
      setResumingTaskId(taskId);
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/assigner-resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
        _notifHandled: true,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === taskId ? { ...item, status: "in_progress", assigner_paused: false, ...(data.task || {}) } : item
          )
        );
        publish('task:updated', { id: taskId, status: 'in_progress' });
        publish('data:changed', { type: 'task', action: 'updated' });
        showSuccessMessage(t("Task", { defaultValue: "Task" }), t("resumed", { defaultValue: "resumed" }));
      } else {
        notify.error(data?.message || t("Failed to resume task.", { defaultValue: "Failed to resume task." }));
      }
    } catch {
      notify.error(t("Failed to resume task.", { defaultValue: "Failed to resume task." }));
    } finally {
      setResumingTaskId(null);
    }
  };

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="Task">
        <div className="task-text">
          <h3>{t("Tasks Assigned By You", { defaultValue: "Tasks Assigned By You" })}</h3>
          <p>{t("Manage and track tasks you assigned", { defaultValue: "Manage and track tasks you assigned" })}</p>
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
            onClick={() => setShowTaskModal(true)}
            style={{ whiteSpace: "nowrap" }}
          >
            {t("+ Task", { defaultValue: "+ Task" })}
          </button>
        </div>
      </div>

      {showTaskModal && (
        <CreateTaskModal onClose={handleModalClose} />
      )}

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
          <div style={{ fontSize: 12, fontWeight: 600 }}>{t("ID", { defaultValue: "ID" })}</div>
          <div style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("assigned_to")}>
            {t("Assigned To", { defaultValue: "Assigned To" })}
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
            {t("Start & Due Date", { defaultValue: "Start & Due Date" })}
          </div>
          <div>{t("Action", { defaultValue: "Action" })}</div>
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>{t("Loading...", { defaultValue: "Loading..." })}</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>{t("No items found", { defaultValue: "No items found" })}</div>
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
                            <div className="user-name">{primaryAssignee?.name || t("Unassigned", { defaultValue: "Unassigned" })}</div>
                            {item.is_transferee && (
                              <span style={{ fontSize: "10px", fontWeight: 600, color: "#6B7280", background: "#F3F4F6", padding: "1px 6px", borderRadius: "4px", border: "1px solid #D1D5DB" }}>{t("Transferee", { defaultValue: "Transferee" })}</span>
                            )}
                          </div>
                          <div className="user-role">{primaryAssignee?.role ? t(primaryAssignee.role, { defaultValue: primaryAssignee.role }) : ""}</div>
                          {isDirectToOa && item.delegator_name && (
                            <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
                              {t("via {{name}}", { name: item.delegator_name, defaultValue: `via ${item.delegator_name}` })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="col-task-name">
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {item.delegation_chain && item.delegation_chain.length > 0 && <ArrowUpRight size={14} style={{ color: "#6B7280", flexShrink: 0 }} />}
                        <div className="task-title">{item.title}</div>
                        {item.is_shared && (
                          <span style={{ fontSize: "10px", fontWeight: 700, color: "#4F46E5", background: "#EEF2FF", padding: "2px 8px", borderRadius: "12px", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "3px", border: "1px solid #C7D2FE" }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                            {t("Shared", { defaultValue: "Shared" })}
                          </span>
                        )}
                        <TaskNotesPopover taskId={item.id} itemType="task" />
                      </div>
                      {item.project && (
                        <Link to={rolePath(`projects/project-details/${item.project.id}`)} onClick={(e) => e.stopPropagation()} style={{ fontSize: "11px", color: "#2563eb", textDecoration: "none", marginTop: "2px", display: "inline-block" }}>
                          {item.project.title}
                        </Link>
                      )}
                      {item.is_shared && item.shared_by_user && (
                        <div style={{ fontSize: "11px", color: "#6B7280", marginTop: "2px" }}>
                          {t("Shared by {{name}}", { name: item.shared_by_user.name, defaultValue: `Shared by ${item.shared_by_user.name}` })}
                        </div>
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
                        onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'taskby' } })}
                      >
                        <IoEyeOutline size={18} />
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
                                  title={t("Edit", { defaultValue: "Edit" })}
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
                              <button
                                className="action-icon-btn action-delete"
                                title={t("Delete", { defaultValue: "Delete" })}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  if (isRecurrence) {
                                    setDeleteRecurrenceTask(item);
                                  } else {
                                    handleDelete(e, item.id);
                                  }
                                }}
                              >
                                <Trash2 size={16} />
                              </button>
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
                                  title={t("Approve Task", { defaultValue: "Approve Task" })}
                                  style={{ color: "#16A34A" }}
                                  onClick={(e) => { e.stopPropagation(); navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'taskby' } }); }}
                                >
                                  <CheckCircle2 size={16} />
                                </button>
                              )}
                              {canUserApprove && (item.status === "submitted" || item.status === "reopened") && (
                                <button
                                  className="action-icon-btn"
                                  title={t("Decline Task", { defaultValue: "Decline Task" })}
                                  style={{ color: "#DC2626" }}
                                  onClick={(e) => { e.stopPropagation(); navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'taskby' } }); }}
                                >
                                  <XCircle size={16} />
                                </button>
                              )}
                              {canUserApprove && (item.status === "approved" || item.status === "submitted" || item.status === "reopened" || item.status === "abandoned") && (
                                <button
                                  className="action-icon-btn"
                                  title={t("Reopen Task", { defaultValue: "Reopen Task" })}
                                  style={{ color: "#2563EB" }}
                                  onClick={(e) => { e.stopPropagation(); navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'taskby' } }); }}
                                >
                                  <RotateCcw size={16} />
                                </button>
                              )}
                              {item.status !== "abandoned" && (
                                <button
                                  className="action-icon-btn"
                                  title={isUserAdminOrManager ? t("Abandon Task", { defaultValue: "Abandon Task" }) : t("Request Abandon", { defaultValue: "Request Abandon" })}
                                  style={{ color: "#F59E0B" }}
                                  onClick={(e) => { e.stopPropagation(); navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'taskby' } }); }}
                                >
                                  <AlertOctagon size={16} />
                                </button>
                              )}
                            </>
                          );
                        })()}
                        {["pending", "in_progress", "reopened", "paused", "submitted"].includes(item.status?.toLowerCase()) && !item.assigner_paused && (
                          <button
                            className="action-icon-btn"
                            title={t("Pause", { defaultValue: "Pause" })}
                            disabled={holdingTaskId === item.id}
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setPauseModalTaskId(item.id); setPauseModalOpen(true); }}
                            style={{ color: "#7C3AED", cursor: holdingTaskId === item.id ? "not-allowed" : "pointer" }}
                          >
                            <Lock size={16} />
                          </button>
                        )}
                        {item.assigner_paused && (
                          <button
                            className="action-icon-btn"
                            title={t("Resume", { defaultValue: "Resume" })}
                            disabled={resumingTaskId === item.id}
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleAssignerResume(item.id); }}
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
        title={t("Confirm Deletion", { defaultValue: "Confirm Deletion" })}
        message={t("Are you sure you want to delete this task? This action cannot be undone.", { defaultValue: "Are you sure you want to delete this task? This action cannot be undone." })}
        confirmText={t("Delete", { defaultValue: "Delete" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        danger
      />

      <DeleteRecurrenceModal
        isOpen={!!deleteRecurrenceTask}
        onClose={() => setDeleteRecurrenceTask(null)}
        task={deleteRecurrenceTask}
        onSuccess={fetchTasks}
      />

      <DynamicWidgetSection storageKey="pms_taskby_widgets" sectionTitle={t("Subtasks Widgets", { defaultValue: "Subtasks Widgets" })} />
    </DashboardLayout>
  );
};

export default Taskby;