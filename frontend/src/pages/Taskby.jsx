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
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IoSearchOutline, IoEyeOutline, IoCheckmarkCircle } from "react-icons/io5";
import { ArrowUpRight, Lock, Pencil, StickyNote, Trash2, Sliders, CheckCircle2, XCircle, RotateCcw, AlertOctagon, Pause, Play, Users } from "lucide-react";
import CreateTaskModal from "../components/CreateTaskModal";
import EditTaskModal from "../components/EditTaskModal";
import DeleteRecurrenceModal from "../components/DeleteRecurrenceModal";
import PauseReasonModal from "../components/PauseReasonModal";
import SortableTableWrapper from "../components/SortableTableWrapper";
import SmartDragHandle from "../components/SmartDragHandle";
import Pagination from "../components/Pagination";
import ActionPopover from "../components/ActionPopover";
import TaskReopenDialog from "../components/TaskReopenDialog";
import AbandonModal from "../components/AbandonModal";
import MarkTaskCompletedModal from "../components/MarkTaskCompletedModal";
import TransferTaskDialog from "../components/TransferTaskDialog";
import TaskNotesPopover from "../components/TaskNotesPopover";
import AddNoteModal from "../components/AddNoteModal";
import ConfirmModal from "../components/ConfirmModal";
import DeclineModal from "../components/DeclineModal";
import TaskFilterBar from "../components/TaskFilterBar";
import DynamicWidgetSection from "../components/DynamicWidgetSection";
import DraggableStatusBadges from "../components/DraggableStatusBadges";
import TaskMultiStatusBadges, { getEffectiveStatus } from "../components/TaskMultiStatusBadges";
import TaskAssigneeCell from "../components/TaskAssigneeCell";
import API_URL from "../config/api";
import { authToken, rolePath, getUser } from "../utils/auth";
import { renderDynamicDates } from "../utils/tableDateUtils";
import { formatDateTimeInline } from "../utils/formatDateTime";
import { getUpdatedSinceThreshold } from "../utils/filterUtils";
import { isDelegationRejectedByMe, isDelegationRevokedFromMe, isDeliverableItem } from "../utils/delegationUtils";
import { showSuccessMessage, toast } from "../utils/notify";
import { useNotification } from "../context/NotificationContext";
import "../components/ActionPopover.css";
import "../pages/Task.css";

const STATUS_COLORS = {
  pending: "#FEF3C7",
  in_progress: "#DBEAFE",
  paused: "#FFEDD5",
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
  paused: "#C2410C",
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
  const location = useLocation();
  const notify = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState(null);
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
const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [orderedItems, setOrderedItems] = useState([]);
  const [page, setPage] = useState(() => {
    const p = searchParams.get("page");
    return p ? Math.max(1, parseInt(p, 10) || 1) : 1;
  });
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const p = searchParams.get("page");
    const parsed = p ? Math.max(1, parseInt(p, 10) || 1) : 1;
    setPage((prev) => (prev !== parsed ? parsed : prev));
  }, [searchParams]);

  const handlePageChange = useCallback((newPage) => {
    setPage(newPage);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newPage > 1) {
        next.set("page", String(newPage));
      } else {
        next.delete("page");
      }
      return next;
    });
  }, [setSearchParams]);

  const [editingTask, setEditingTask] = useState(null);
  const [holdingTaskId, setHoldingTaskId] = useState(null);
  const [resumingTaskId, setResumingTaskId] = useState(null);
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [pauseModalTaskId, setPauseModalTaskId] = useState(null);
  const [resumeModalOpen, setResumeModalOpen] = useState(false);
  const [resumeModalTask, setResumeModalTask] = useState(null);
  const [noteModal, setNoteModal] = useState({ open: false, itemId: null });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [approveTaskId, setApproveTaskId] = useState(null);
  const [declineConfirmOpen, setDeclineConfirmOpen] = useState(false);
  const [declineTaskItem, setDeclineTaskItem] = useState(null);
  const [declineTaskLoading, setDeclineTaskLoading] = useState(false);
  const [deleteRecurrenceTask, setDeleteRecurrenceTask] = useState(null);
  const [reopenTask, setReopenTask] = useState(null);
  const [abandonTask, setAbandonTask] = useState(null);
  const [markCompletedTask, setMarkCompletedTask] = useState(null);
  const [abandoning, setAbandoning] = useState(false);
  const [transferDialog, setTransferDialog] = useState({ open: false, task: null });

  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [advancedFilters, setAdvancedFilters] = useState({
    user_id: [],
    project_id: [],
    statuses: [],
    status: [],
    states: [],
    due_states: [],
    priority: [],
    created_by: [],
    follower_id: [],
    start_date: "",
    end_date: "",
    due_date_from: "",
    due_date_to: "",
    updated_since: "",
    updated_since_value: "",
    updated_since_unit: "hours",
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
    handlePageChange(1);
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
      setLoading(true);
      setItems([]);
      setStatusFilter(filter);
      setShowAll(false);
      setPage(1);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (filter) {
          next.set("status", filter);
        } else {
          next.delete("status");
        }
        next.delete("page");
        return next;
      });
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
      setItems([]);
      const token = authToken();
      const params = new URLSearchParams();
      if (timeFilter && timeFilter !== "custom") {
        params.append("time_filter", timeFilter);
      } else if (timeFilter === "custom") {
        params.append("time_filter", "custom");
        if (customStartDate) params.append("start_date", customStartDate);
        if (customEndDate) params.append("end_date", customEndDate);
      }
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

      const prioList = Array.isArray(advancedFilters.priority) ? advancedFilters.priority : [];
      if (prioList.length > 0) {
        prioList.forEach((pr) => params.append("priority[]", pr));
        params.append("priority", prioList.join(","));
      }

      const creatorList = Array.isArray(advancedFilters.created_by) ? advancedFilters.created_by : [];
      if (creatorList.length > 0) {
        creatorList.forEach((cr) => params.append("created_by[]", cr));
        params.append("created_by", creatorList.join(","));
      }

      const followerList = Array.isArray(advancedFilters.follower_id) ? advancedFilters.follower_id : [];
      if (followerList.length > 0) {
        followerList.forEach((fl) => params.append("follower_id[]", fl));
        params.append("follower_id", followerList.join(","));
      }

      if (advancedFilters.start_date) params.append("start_date", advancedFilters.start_date);
      if (advancedFilters.end_date) params.append("end_date", advancedFilters.end_date);
      if (advancedFilters.due_date_from) params.append("due_date_from", advancedFilters.due_date_from);
      if (advancedFilters.due_date_to) params.append("due_date_to", advancedFilters.due_date_to);
      if (advancedFilters.updated_since) {
        params.append("updated_since", advancedFilters.updated_since);
        if (advancedFilters.updated_since === "custom") {
          if (advancedFilters.updated_since_value) params.append("updated_since_value", advancedFilters.updated_since_value);
          if (advancedFilters.updated_since_unit) params.append("updated_since_unit", advancedFilters.updated_since_unit);
        }
      }
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
          if (data?.counts) {
            setCounts(data.counts);
          }
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
  }, [timeFilter, customStartDate, customEndDate, debouncedSearch, statusFilter, advancedFilters, sortBy, sortDirection]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks, page]);

  useAutoRefresh(() => { fetchTasks(); }, {
    events: ['task:created', 'task:updated', 'task:deleted', 'data:changed'],
  });

  const baseItems = items;
  const pendingStatuses = useMemo(() => ["pending", "planned", "planning", "draft", "todo", "to_do", "new", "not_started", "unassigned", "Pending", "Planned", "Planning", "Draft", "Todo", "To_Do", "New", "Not_Started", "Unassigned"], []);
  const inProgressStatuses = useMemo(() => ["in_progress", "In Progress", "In-progress", "in-progress", "reopened", "Reopened", "doing", "working", "underway", "acknowledged"], []);
  const completedStatuses = useMemo(() => ["completed", "approved", "done", "finished", "Completed", "Approved", "Done", "Finished"], []);
  const pausedStatuses = useMemo(() => ["paused", "Paused", "pause", "Pause", "hold", "on_hold", "On Hold"], []);
  const submittedStatuses = useMemo(() => ["submitted", "Submitted", "review", "in_review", "under_review", "submitted_late"], []);
  const declinedStatuses = useMemo(() => ["declined", "rejected", "failed", "Declined", "Rejected", "Failed"], []);
  const abandonedStatuses = useMemo(() => ["abandoned", "abandon_requested", "cancelled", "canceled", "Abandoned", "Abandon Requested"], []);

  const fallbackCounts = useMemo(() => {
    const todayStr = new Date().toDateString();
    return {
      all: baseItems.length,
      dueToday: baseItems.filter((i) => { const d = i.end_date ? new Date(i.end_date) : null; return d && d.toDateString() === todayStr; }).length,
      pending: baseItems.filter((i) => pendingStatuses.includes(getEffectiveStatus(i))).length,
      inProgress: baseItems.filter((i) => inProgressStatuses.includes(getEffectiveStatus(i))).length,
      paused: baseItems.filter((i) => pausedStatuses.includes(getEffectiveStatus(i))).length,
      submitted: baseItems.filter((i) => submittedStatuses.includes(getEffectiveStatus(i))).length,
      reopened: baseItems.filter((i) => i.status === "reopened" || i.is_reopened).length,
      transferred: baseItems.filter((i) => i.delegation_chain && i.delegation_chain.length > 0).length,
      completed: baseItems.filter((i) => completedStatuses.includes(getEffectiveStatus(i))).length,
      declined: baseItems.filter((i) => declinedStatuses.includes(getEffectiveStatus(i))).length,
      abandoned: baseItems.filter((i) => abandonedStatuses.includes(getEffectiveStatus(i))).length,
    };
  }, [baseItems, pendingStatuses, inProgressStatuses, pausedStatuses, submittedStatuses, completedStatuses, declinedStatuses, abandonedStatuses]);

  const allCount = counts?.all ?? fallbackCounts.all;
  const dueTodayCount = (counts?.due_today ?? counts?.dueToday) ?? fallbackCounts.dueToday;
  const pendingCount = counts?.pending ?? fallbackCounts.pending;
  const inProgressCount = (counts?.in_progress ?? counts?.inProgress) ?? fallbackCounts.inProgress;
  const pausedCount = counts?.paused ?? fallbackCounts.paused;
  const submittedCount = counts?.submitted ?? fallbackCounts.submitted;
  const reopenedCount = counts?.reopened ?? fallbackCounts.reopened;
  const transferredCount = counts?.transferred ?? fallbackCounts.transferred;
  const completedCount = (counts?.completed ?? counts?.approved) ?? fallbackCounts.completed;
  const approvedCount = completedCount;
  const declinedCount = (counts?.declined ?? counts?.rejected) ?? fallbackCounts.declined;
  const rejectedCount = declinedCount;
  const abandonedCount = counts?.abandoned ?? fallbackCounts.abandoned;

  const filteredItems = useMemo(() => {
    let list = baseItems;
    const selectedPriorities = Array.isArray(advancedFilters.priority) && advancedFilters.priority.length > 0
      ? advancedFilters.priority
      : (Array.isArray(advancedFilters.priorities) && advancedFilters.priorities.length > 0 ? advancedFilters.priorities : []);

    if (selectedPriorities.length > 0) {
      const prioLower = selectedPriorities.map((p) => String(p).toLowerCase());
      list = list.filter((item) => {
        if (!item) return false;
        const itemPrio = String(item.priority || "medium").toLowerCase();
        return prioLower.includes(itemPrio);
      });
    }

    if (statusFilter) {
      const sf = String(statusFilter).toLowerCase();
      if (sf === "due_today") {
        list = list.filter((item) => {
          const dateVal = item.end_date || item.due_date || item.start_date;
          if (!dateVal) return false;
          const d = new Date(dateVal);
          const now = new Date();
          const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
          const isCompleted = completedStatuses.includes(getEffectiveStatus(item));
          return isToday && !isCompleted;
        });
      } else if (sf === "pending") {
        list = list.filter((item) => pendingStatuses.includes(getEffectiveStatus(item)));
      } else if (sf === "in_progress") {
        list = list.filter((item) => inProgressStatuses.includes(getEffectiveStatus(item)));
      } else if (sf === "submitted") {
        list = list.filter((item) => submittedStatuses.includes(getEffectiveStatus(item)));
      } else if (sf === "completed" || sf === "approved") {
        list = list.filter((item) => completedStatuses.includes(getEffectiveStatus(item)));
      } else if (sf === "paused") {
        list = list.filter((item) => pausedStatuses.includes(getEffectiveStatus(item)));
      } else if (sf === "declined" || sf === "rejected") {
        list = list.filter((item) => declinedStatuses.includes(getEffectiveStatus(item)));
      } else if (sf === "abandoned") {
        list = list.filter((item) => abandonedStatuses.includes(getEffectiveStatus(item)));
      } else if (sf === "transferred") {
        list = list.filter((item) => item.delegation_chain && item.delegation_chain.length > 0);
      } else {
        list = list.filter((item) => String(getEffectiveStatus(item)).toLowerCase() === sf);
      }
    }

    // Updated Since filtering
    const updatedSinceThreshold = getUpdatedSinceThreshold(
      advancedFilters.updated_since,
      advancedFilters.updated_since_value,
      advancedFilters.updated_since_unit
    );
    if (updatedSinceThreshold) {
      const thresholdTime = updatedSinceThreshold.getTime();
      list = list.filter((item) => {
        if (!item?.updated_at) return false;
        const itemUpdated = new Date(item.updated_at).getTime();
        return !isNaN(itemUpdated) && itemUpdated >= thresholdTime;
      });
    }

    return list;
  }, [baseItems, statusFilter, advancedFilters.priority, advancedFilters.priorities, advancedFilters.updated_since, advancedFilters.updated_since_value, advancedFilters.updated_since_unit, pendingStatuses, inProgressStatuses, submittedStatuses, completedStatuses, pausedStatuses, declinedStatuses, abandonedStatuses]);

  const taskIdList = filteredItems.map((i) => i.id);

  const showAllItems = showAll;
  const totalPages = showAllItems ? 1 : Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = showAllItems ? filteredItems : filteredItems.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const breadcrumbs = [
    { label: t("Tasks", { defaultValue: "Tasks" }), path: rolePath("tasks") },
    { label: t("Assigned By You", { defaultValue: "Assigned By You" }) },
  ];

  const handleDelete = (e, taskOrId) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    const item = typeof taskOrId === 'object' && taskOrId !== null ? taskOrId : (items.find(i => String(i.id) === String(taskOrId)) || taskOrId);
    setDeleteTargetId(item);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    const target = deleteTargetId;
    setDeleteConfirmOpen(false);
    setDeleteTargetId(null);
    if (!target) return;
    const taskId = typeof target === 'object' ? target.id : target;
    const isDeliverable = typeof target === 'object' ? isDeliverableItem(target) : false;
    try {
      const token = authToken();
      const endpoint = isDeliverable ? `${API_URL}/deliverables/${taskId}` : `${API_URL}/tasks/${taskId}`;
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
        _notifHandled: true,
      });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => String(item.id) !== String(taskId)));
        fetchTasks();
        if (isDeliverable) {
          publish('deliverable:deleted', { id: taskId });
          publish('data:changed', { type: 'deliverable', action: 'deleted' });
          toast.success(t("Subtask deleted successfully", { defaultValue: "Subtask deleted successfully" }));
        } else {
          publish('task:deleted', { id: taskId });
          publish('data:changed', { type: 'task', action: 'deleted' });
          toast.success(t("Task deleted successfully", { defaultValue: "Task deleted successfully" }));
        }
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || t("Failed to delete.", { defaultValue: "Failed to delete." }));
      }
    } catch {
      toast.error(t("Failed to delete.", { defaultValue: "Failed to delete." }));
    }
  };

  const handleAssignerPause = async (taskOrId, data) => {
    const item = typeof taskOrId === 'object' && taskOrId !== null ? taskOrId : (items.find(i => String(i.id) === String(taskOrId)) || null);
    const taskId = item ? item.id : taskOrId;
    const isDeliverable = isDeliverableItem(item);
    try {
      setHoldingTaskId(taskId);
      const token = authToken();
      const endpoint = isDeliverable ? `${API_URL}/deliverables/${taskId}/pause` : `${API_URL}/tasks/${taskId}/assigner-pause`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ reason: data?.reason_detail || data?.reason || "other", reason_detail: data?.reason_detail || "Paused by assigner" }),
        _notifHandled: true,
      });
      const resData = await res.json().catch(() => ({}));
      if (res.ok) {
        const updatedObj = resData.deliverable || resData.task || {};
        setItems((prev) =>
          prev.map((item) =>
            item.id === taskId ? { ...item, status: "paused", assigner_paused: true, ...updatedObj } : item
          )
        );
        fetchTasks();
        if (isDeliverable) {
          publish('deliverable:updated', { id: taskId, status: 'paused', ...updatedObj });
          publish('data:changed', { type: 'deliverable', action: 'updated' });
          showSuccessMessage(t("Subtask", { defaultValue: "Subtask" }), t("paused", { defaultValue: "paused" }));
        } else {
          publish('task:updated', { id: taskId, status: 'paused', ...updatedObj });
          publish('data:changed', { type: 'task', action: 'updated' });
          showSuccessMessage(t("Task", { defaultValue: "Task" }), t("paused", { defaultValue: "paused" }));
        }
      } else {
        notify.error(resData?.message || t("Failed to pause.", { defaultValue: "Failed to pause." }));
      }
    } catch {
      notify.error(t("Failed to pause.", { defaultValue: "Failed to pause." }));
    } finally {
      setHoldingTaskId(null);
    }
  };

  const handleAssignerResume = async (taskOrId) => {
    const item = typeof taskOrId === 'object' && taskOrId !== null ? taskOrId : (items.find(i => String(i.id) === String(taskOrId)) || null);
    const taskId = item ? item.id : taskOrId;
    const isDeliverable = isDeliverableItem(item);
    try {
      setResumingTaskId(taskId);
      const token = authToken();
      const endpoint = isDeliverable ? `${API_URL}/deliverables/${taskId}/resume` : `${API_URL}/tasks/${taskId}/assigner-resume`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
        _notifHandled: true,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const updatedObj = data.deliverable || data.task || {};
        setItems((prev) =>
          prev.map((item) =>
            item.id === taskId ? { ...item, status: "in_progress", assigner_paused: false, ...updatedObj } : item
          )
        );
        fetchTasks();
        if (isDeliverable) {
          publish('deliverable:updated', { id: taskId, status: 'in_progress', ...updatedObj });
          publish('data:changed', { type: 'deliverable', action: 'updated' });
          showSuccessMessage(t("Subtask", { defaultValue: "Subtask" }), t("resumed", { defaultValue: "resumed" }));
        } else {
          publish('task:updated', { id: taskId, status: 'in_progress', ...updatedObj });
          publish('data:changed', { type: 'task', action: 'updated' });
          showSuccessMessage(t("Task", { defaultValue: "Task" }), t("resumed", { defaultValue: "resumed" }));
        }
      } else {
        notify.error(data?.message || t("Failed to resume.", { defaultValue: "Failed to resume." }));
      }
    } catch {
      notify.error(t("Failed to resume.", { defaultValue: "Failed to resume." }));
    } finally {
      setResumingTaskId(null);
    }
  };

  const handleDirectApprove = async (e, taskOrId) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    const item = typeof taskOrId === 'object' && taskOrId !== null ? taskOrId : (items.find(i => String(i.id) === String(taskOrId)) || null);
    const actualTaskId = item ? item.id : taskOrId;
    const isDeliverable = isDeliverableItem(item);
    const endpoint = isDeliverable ? `${API_URL}/deliverables/${actualTaskId}/approve` : `${API_URL}/tasks/${actualTaskId}/approve`;

    try {
      const token = authToken();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
        _notifHandled: true,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const updatedObj = data.deliverable || data.task || {};
        setItems((prev) =>
          prev.map((item) =>
            item.id === actualTaskId ? { ...item, status: "approved", ...updatedObj } : item
          )
        );
        fetchTasks();
        if (isDeliverable) {
          publish('deliverable:updated', { id: actualTaskId, status: 'approved', ...updatedObj });
          publish('data:changed', { type: 'deliverable', action: 'updated' });
          showSuccessMessage(t("Subtask", { defaultValue: "Subtask" }), t("approved", { defaultValue: "approved" }));
        } else {
          publish('task:updated', { id: actualTaskId, status: 'approved', ...updatedObj });
          publish('data:changed', { type: 'task', action: 'updated' });
          showSuccessMessage(t("Task", { defaultValue: "Task" }), t("approved", { defaultValue: "approved" }));
        }
      } else {
        notify.error(data.message || t("Failed to approve.", { defaultValue: "Failed to approve." }));
      }
    } catch {
      notify.error(t("An error occurred while approving.", { defaultValue: "An error occurred while approving." }));
    }
  };

  const handleDirectDecline = async (e, task, comment) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    const taskId = task.id;
    const isDeliverable = isDeliverableItem(task);
    setDeclineTaskLoading(true);
    try {
      const token = authToken();
      const endpoint = isDeliverable ? `${API_URL}/deliverables/${taskId}/reject` : `${API_URL}/tasks/${taskId}/reject`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ comment }),
        _notifHandled: true,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const updatedObj = data.deliverable || data.task || {};
        setItems((prev) =>
          prev.map((item) =>
            item.id === taskId ? { ...item, status: "declined", ...updatedObj } : item
          )
        );
        fetchTasks();
        if (isDeliverable) {
          publish('deliverable:updated', { id: taskId, status: 'declined', ...updatedObj });
          publish('data:changed', { type: 'deliverable', action: 'updated' });
          showSuccessMessage(t("Subtask", { defaultValue: "Subtask" }), t("declined", { defaultValue: "declined" }));
        } else {
          publish('task:updated', { id: taskId, status: 'declined', ...updatedObj });
          publish('data:changed', { type: 'task', action: 'updated' });
          showSuccessMessage(t("Task", { defaultValue: "Task" }), t("declined", { defaultValue: "declined" }));
        }
        setDeclineTaskItem(null);
      } else {
        notify.error(data.message || t("Failed to decline.", { defaultValue: "Failed to decline." }));
      }
    } catch {
      notify.error(t("An error occurred while declining.", { defaultValue: "An error occurred while declining." }));
    } finally {
      setDeclineTaskLoading(false);
    }
  };

  const confirmDirectApprove = async () => {
    if (!approveTaskId) return;
    const itemOrId = approveTaskId;
    setApproveConfirmOpen(false);
    setApproveTaskId(null);
    await handleDirectApprove(null, itemOrId);
  };

  const handleDirectAbandonSubmit = async (reason) => {
    if (!abandonTask) return;
    setAbandoning(true);
    const taskId = abandonTask.id;
    const isDeliverable = isDeliverableItem(abandonTask);
    const isUserAdminOrManager = ["admin", "manager"].includes(currentUser?.role);
    const endpoint = isDeliverable 
      ? `${API_URL}/deliverables/${taskId}/abandon`
      : (isUserAdminOrManager ? `${API_URL}/tasks/${taskId}/abandon` : `${API_URL}/tasks/${taskId}/request-abandon`);

    try {
      const token = authToken();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ reason }),
        _notifHandled: true,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const updatedObj = data.deliverable || data.task || {};
        setItems((prev) =>
          prev.map((item) =>
            item.id === taskId ? { ...item, status: "abandoned", ...updatedObj } : item
          )
        );
        fetchTasks();
        if (isDeliverable) {
          publish('deliverable:updated', { id: taskId, status: 'abandoned', ...updatedObj });
          publish('data:changed', { type: 'deliverable', action: 'updated' });
          showSuccessMessage(t("Subtask", { defaultValue: "Subtask" }), t("abandoned", { defaultValue: "abandoned" }));
        } else {
          publish('task:updated', { id: taskId, status: 'abandoned', ...updatedObj });
          publish('data:changed', { type: 'task', action: 'updated' });
          showSuccessMessage(t("Task", { defaultValue: "Task" }), isUserAdminOrManager ? t("abandoned", { defaultValue: "abandoned" }) : t("abandon requested", { defaultValue: "abandon requested" }));
        }
        setAbandonTask(null);
      } else {
        notify.error(data.message || t("Failed to abandon.", { defaultValue: "Failed to abandon." }));
      }
    } catch {
      notify.error(t("Failed to abandon.", { defaultValue: "Failed to abandon." }));
    } finally {
      setAbandoning(false);
    }
  };

  const handleDirectReopenSuccess = (updatedTask) => {
    if (!updatedTask && !reopenTask) return;
    const taskItem = updatedTask || reopenTask;
    const taskId = taskItem?.id;
    const isDeliverable = isDeliverableItem(taskItem);
    setItems((prev) =>
      prev.map((item) =>
        item.id === taskId ? { ...item, status: "pending", ...(updatedTask || {}) } : item
      )
    );
    fetchTasks();
    if (isDeliverable) {
      publish('deliverable:updated', { id: taskId, status: 'pending', ...(updatedTask || {}) });
      publish('data:changed', { type: 'deliverable', action: 'updated' });
      showSuccessMessage(t("Subtask", { defaultValue: "Subtask" }), t("reopened", { defaultValue: "reopened" }));
    } else {
      publish('task:updated', { id: taskId, status: 'pending', ...(updatedTask || {}) });
      publish('data:changed', { type: 'task', action: 'updated' });
      showSuccessMessage(t("Task", { defaultValue: "Task" }), t("reopened", { defaultValue: "reopened" }));
    }
    setReopenTask(null);
  };

  const handleDirectCompleteSuccess = (updatedTask) => {
    if (!updatedTask && !markCompletedTask) return;
    const taskItem = updatedTask || markCompletedTask;
    const taskId = taskItem?.id;
    const isDeliverable = isDeliverableItem(taskItem);
    setItems((prev) =>
      prev.map((item) =>
        item.id === taskId ? { ...item, status: "completed", ...(updatedTask || {}) } : item
      )
    );
    fetchTasks();
    if (isDeliverable) {
      publish('deliverable:updated', { id: taskId, status: 'completed', ...(updatedTask || {}) });
      publish('data:changed', { type: 'deliverable', action: 'updated' });
      showSuccessMessage(t("Subtask", { defaultValue: "Subtask" }), t("marked as completed", { defaultValue: "marked as completed" }));
    } else {
      publish('task:updated', { id: taskId, status: 'completed', ...(updatedTask || {}) });
      publish('data:changed', { type: 'task', action: 'updated' });
      showSuccessMessage(t("Task", { defaultValue: "Task" }), t("marked as completed", { defaultValue: "marked as completed" }));
    }
    setMarkCompletedTask(null);
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
          <div className="all-time" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={timeFilter} onChange={(e) => { setTimeFilter(e.target.value); handlePageChange(1); }}>
              <option value="">{t("All Time", { defaultValue: "All Time" })}</option>
              <option value="today">{t("Today", { defaultValue: "Today" })}</option>
              <option value="7">{t("Last 7 Days", { defaultValue: "Last 7 Days" })}</option>
              <option value="30">{t("Last 30 Days", { defaultValue: "Last 30 Days" })}</option>
              <option value="180">{t("Last 6 Months", { defaultValue: "Last 6 Months" })}</option>
              <option value="custom">{t("Custom Date", { defaultValue: "Custom Date" })}</option>
            </select>
            {timeFilter === "custom" && (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => { setCustomStartDate(e.target.value); handlePageChange(1); }}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '13px' }}
                />
                <span style={{ fontSize: '12px', color: '#64748b' }}>{t("to", { defaultValue: "to" })}</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => { setCustomEndDate(e.target.value); handlePageChange(1); }}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '13px' }}
                />
              </div>
            )}
          </div>
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
          { id: "completed", label: t("Completed", { defaultValue: "Completed" }), count: completedCount, className: "Approved" },
          { id: "paused", label: t("Paused", { defaultValue: "Paused" }), count: pausedCount, className: "Paused" },
          { id: "declined", label: t("Declined", { defaultValue: "Declined" }), count: declinedCount, className: "Rejected" },
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
        onSearchChange={(val) => {
          setSearch(val);
          handlePageChange(1);
        }}
        filters={advancedFilters}
        activeStatus={statusFilter}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSortChange={(col, dir) => {
          setSortBy(col);
          setSortDirection(dir || "desc");
          handlePageChange(1);
        }}
        onFilterChange={(key, val) => {
          setAdvancedFilters((prev) => {
            const updated = { ...prev, [key]: val };
            if (key === "priority" || key === "priorities") {
              updated.priority = val;
              updated.priorities = val;
            }
            return updated;
          });
          handlePageChange(1);
        }}
        onApplyFilters={(appliedFilters, appliedSort) => {
          setStatusFilter("");
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete("page");
            next.delete("status");
            return next;
          });
          setAdvancedFilters((prev) => ({
            ...prev,
            statuses: appliedFilters?.statuses || appliedFilters?.status || [],
            states: appliedFilters?.states || [],
            due_states: appliedFilters?.due_states || [],
            priority: appliedFilters?.priority || appliedFilters?.priorities || [],
            user_id: appliedFilters?.user_id || appliedFilters?.assigned_to || [],
            project_id: appliedFilters?.project_id || [],
            created_by: appliedFilters?.created_by || [],
            follower_id: appliedFilters?.follower_id || [],
            start_date: appliedFilters?.start_date || "",
            end_date: appliedFilters?.end_date || "",
            due_date_from: appliedFilters?.due_date_from || "",
            due_date_to: appliedFilters?.due_date_to || "",
            updated_since: appliedFilters?.updated_since || "",
            updated_since_value: appliedFilters?.updated_since_value || "",
            updated_since_unit: appliedFilters?.updated_since_unit || "hours",
          }));
          if (appliedSort && appliedSort.sort_by) {
            setSortBy(appliedSort.sort_by);
            setSortDirection(appliedSort.sort_direction || "desc");
          }
          setPage(1);
        }}
        onReset={() => {
          setSearch("");
          setStatusFilter("");
          setSearchParams({});
          setCustomStartDate("");
          setCustomEndDate("");
          setAdvancedFilters({
            user_id: [],
            project_id: [],
            status: [],
            statuses: [],
            states: [],
            due_states: [],
            priority: [],
            created_by: [],
            follower_id: [],
            start_date: "",
            end_date: "",
            due_date_from: "",
            due_date_to: "",
            updated_since: "",
            updated_since_value: "",
            updated_since_unit: "hours",
          });
          setPage(1);
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
          <div>{t("Personal Notes", { defaultValue: "Personal Notes" })}</div>
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

                const isRejectedByMe = isDelegationRejectedByMe(item, currentUser);
                const isRevokedFromMe = isDelegationRevokedFromMe(item, currentUser);
                const isInactiveForMe = isRejectedByMe || isRevokedFromMe;
                const hasRejectedDelegation = Array.isArray(item.delegation_chain) && item.delegation_chain.some((d) => String(d.status).toLowerCase() === "rejected");
                const hasRevokedDelegation = Array.isArray(item.delegation_chain) && item.delegation_chain.some((d) => String(d.status).toLowerCase() === "revoked");

                return (
                  <div className={`taskby-row ${isInactiveForMe ? "delegation-rejected-row" : ""}`} key={uniqueKey} style={isInactiveForMe ? { opacity: 0.88 } : undefined}>
                    <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} id={item.id} businessId={item.business_id} />
                    <div className="col-assigned-to">
                      <TaskAssigneeCell
                        assignees={item.assignees}
                        assignee={item.assignee}
                        isDirectToOa={Boolean(item.has_direct_to_oa_delegation && item.current_owner_name && item.current_owner_id)}
                        currentOwnerName={item.current_owner_name}
                        delegatorName={item.delegator_name}
                        isTransferee={Boolean(item.is_transferee)}
                      />
                    </div>

                    <div className="col-task-name">
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        {item.item_type === "subtask" && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", background: "#EEF2FF", color: "#4F46E5", border: "1px solid #C7D2FE", borderRadius: "4px", padding: "1px 5px", fontSize: "10px", fontWeight: 700, lineHeight: "14px", flexShrink: 0 }}>
                            ↳ {t("Subtask", { defaultValue: "Subtask" })}
                          </span>
                        )}
                        {item.delegation_chain && item.delegation_chain.length > 0 && !isInactiveForMe && !hasRejectedDelegation && !hasRevokedDelegation && (
                          <ArrowUpRight size={14} style={{ color: "#6B7280", flexShrink: 0 }} />
                        )}
                        {(() => {
                          if (!isRejectedByMe && !hasRejectedDelegation) return null;
                          return (
                            <span
                              className="badge"
                              title={isRejectedByMe ? t("Transfer Rejected by You", { defaultValue: "Transfer Rejected by You" }) : t("Transfer Rejected", { defaultValue: "Transfer Rejected" })}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "1px 6px",
                                borderRadius: "4px",
                                backgroundColor: "#FEE2E2",
                                color: "#DC2626",
                                fontSize: "10px",
                                fontWeight: 700,
                                lineHeight: "14px",
                                border: "1px solid #FCA5A5",
                                flexShrink: 0,
                                cursor: "help",
                              }}
                            >
                              <XCircle size={11} />
                              {isRejectedByMe ? t("Transfer Rejected", { defaultValue: "Transfer Rejected" }) : t("Transfer Rejected", { defaultValue: "Transfer Rejected" })}
                            </span>
                          );
                        })()}
                        {(() => {
                          if (!isRevokedFromMe && !hasRevokedDelegation) return null;
                          return (
                            <span
                              className="badge"
                              title={isRevokedFromMe ? t("Transfer Revoked by Assigner", { defaultValue: "Transfer Revoked by Assigner" }) : t("Transfer Revoked", { defaultValue: "Transfer Revoked" })}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "1px 6px",
                                borderRadius: "4px",
                                backgroundColor: "#FEF3C7",
                                color: "#B45309",
                                fontSize: "10px",
                                fontWeight: 700,
                                lineHeight: "14px",
                                border: "1px solid #FCD34D",
                                flexShrink: 0,
                                cursor: "help",
                              }}
                            >
                              <XCircle size={11} />
                              {t("Transfer Revoked", { defaultValue: "Transfer Revoked" })}
                            </span>
                          );
                        })()}
                        <div className="task-title" title={item.title} style={{ maxWidth: "250px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: isInactiveForMe ? 0.75 : 1 }}>{item.title}</div>
                        {item.is_shared && (
                          <span style={{ fontSize: "10px", fontWeight: 700, color: "#4F46E5", background: "#EEF2FF", padding: "2px 8px", borderRadius: "12px", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "3px", border: "1px solid #C7D2FE" }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                            {t("Shared", { defaultValue: "Shared" })}
                          </span>
                        )}
                      </div>
                      {item.item_type === "subtask" && item.parent_task && (
                        <div style={{ fontSize: "11px", color: "#6366f1", marginTop: "2px", display: "flex", alignItems: "center", gap: "4px" }}>
                          <span title={item.parent_task.title} style={{ maxWidth: "250px", display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            ↳ {t("Parent", { defaultValue: "Parent" })}: <strong>{item.parent_task.business_id ? `[${item.parent_task.business_id}] ` : ""}{item.parent_task.title}</strong>
                          </span>
                        </div>
                      )}
                      {item.project && (
                        <Link to={rolePath(`projects/project-details/${item.project.id}`)} onClick={(e) => e.stopPropagation()} style={{ fontSize: "11px", color: "#2563eb", textDecoration: "none", marginTop: "2px", display: "inline-block", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.project.title}>
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

                    <div className="col-notes">
                      <TaskNotesPopover taskId={item.id} itemType={item.item_type === "subtask" ? "deliverable" : "task"} />
                    </div>

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
                        title={isDeliverableItem(item) ? t("View Subtask", { defaultValue: "View Subtask" }) : t("View Task", { defaultValue: "View Task" })}
                        onClick={() => {
                          const isDeliv = isDeliverableItem(item);
                          const currentSearch = location.search || (page > 1 ? `?page=${page}` : "");
                          const returnUrl = `${location.pathname}${currentSearch}`;
                          if (isDeliv) {
                            navigate(rolePath(`deliveries/deliverable-details/${item.id}`), { state: { deliverableIds: taskIdList, from: 'taskby', page, returnUrl } });
                          } else {
                            const targetId = item.id;
                            navigate(rolePath(`tasks/task-details/${targetId}`), { state: { taskIds: taskIdList, from: 'taskby', page, returnUrl } });
                          }
                        }}
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
                          const sStatus = (item.status || "").toLowerCase();
                          const isUserAdminOrManager = ["admin", "manager", "super_admin"].includes(currentUser?.role);
                          const isCreator = Boolean(
                            currentUser && (
                              parseInt(item.created_by, 10) === parseInt(currentUser.id, 10) ||
                              parseInt(item.assigned_by, 10) === parseInt(currentUser.id, 10) ||
                              parseInt(item.creator_id, 10) === parseInt(currentUser.id, 10) ||
                              parseInt(item.user_id, 10) === parseInt(currentUser.id, 10)
                            )
                          );
                          const isAssignee = Boolean(
                            item.is_assignee ??
                            (currentUser && (
                              (item.assignees || []).some((a) => parseInt(a.id, 10) === parseInt(currentUser.id, 10)) ||
                              (item.assigned_to && parseInt(item.assigned_to, 10) === parseInt(currentUser.id, 10))
                            ))
                          );
                          const isCurrentOwner = Boolean(
                            item.is_current_owner ??
                            (item.current_owner && currentUser && parseInt(item.current_owner, 10) === parseInt(currentUser.id, 10)) ??
                            isAssignee
                          );
                          const isFollower = (item.followers || []).some((f) => parseInt(f.id, 10) === parseInt(currentUser?.id, 10));
                          const isOnlyFollower = isFollower && !isUserAdminOrManager && !isCreator && !isAssignee;
                          const isTransferor = item.is_transferor ?? false;
                          const transferorHasApproved = item.transferor_has_approved ?? false;
                          const isTransferorApproval = (isTransferor || item.is_transferor) && !transferorHasApproved && (item.submission_stage === "awaiting_checkpoint" || item.can_submit_to_next || ["submitted", "submitted_late"].includes(sStatus));
                          const isAssignerOrCreator = isCreator || isUserAdminOrManager;

                          const isRecurrence = item.task_type === "recurring" || !!item.recurrence_settings;
                          const recEnd = item.recurrence_end_date || item.end_date;
                          const isRecurrenceActive = isRecurrence ? (!recEnd || new Date(recEnd) > new Date()) : true;

                          const canEdit = !item.is_shared && !isOnlyFollower && isAssignerOrCreator && !["approved", "completed", "submitted", "submitted_late", "abandoned"].includes(sStatus) && (!isRecurrence || isRecurrenceActive);
                          const canDelete = !item.is_shared && !isOnlyFollower && isAssignerOrCreator && (!isRecurrence || isRecurrenceActive);
                          const canApprove = !isOnlyFollower && (isTransferorApproval || ((isAssignerOrCreator || item.can_approve === true || item.is_next_approver) && (!item.is_transferred || transferorHasApproved || item.submission_stage === "awaiting_creator" || !item.has_delegation_chain))) && ["submitted", "submitted_late", "reopened", "in_review", "under_review", "ready_for_review", "awaiting_approval"].includes(sStatus);
                          const canDecline = !isOnlyFollower && (isTransferorApproval || canApprove || item.can_decline_submission || isAssignerOrCreator) && ["submitted", "submitted_late", "in_review", "under_review", "ready_for_review", "awaiting_approval"].includes(sStatus);
                          const canReopen = !isOnlyFollower && (isAssignerOrCreator || item.can_decline_submission || isTransferorApproval || canApprove) && ["completed", "declined", "abandoned", "approved", "submitted", "submitted_late", "rejected"].includes(sStatus);
                          const canAbandon = !isOnlyFollower && (isAssignee || isCurrentOwner || isAssignerOrCreator) && !["abandoned", "approved", "completed"].includes(sStatus);
                          const canMarkCompleted = !isOnlyFollower && isAssignerOrCreator && ["pending", "in_progress", "in-progress", "reopened", "paused", "acknowledged"].includes(sStatus);
                          const canTransfer = !item.is_shared && !isOnlyFollower && (item.can_delegate === true || (item.allow_transfer !== false && (isAssignee || isCurrentOwner || isAssignerOrCreator) && !isTransferor)) && !["approved", "rejected", "pending", "submitted", "submitted_late", "abandoned", "completed"].includes(sStatus) && item.my_status !== "submitted" && !item.active_outgoing_delegation && !item.pending_delegation;
                          const canAssignerPause = !isOnlyFollower && isAssignerOrCreator && !item.assigner_paused && ["pending", "in_progress", "in-progress", "reopened", "paused", "submitted", "transferred"].includes(sStatus) && sStatus !== "paused";
                          const canAssignerResume = !isOnlyFollower && isAssignerOrCreator && Boolean(item.assigner_paused);

                          return (
                            <>
                              {canEdit && (
                                <button
                                  className="action-icon-btn action-edit"
                                  title={isDeliverableItem(item) ? t("Edit Subtask", { defaultValue: "Edit Subtask" }) : t("Edit", { defaultValue: "Edit" })}
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
                              {canDelete && (
                                <button
                                  className="action-icon-btn action-delete"
                                  title={isDeliverableItem(item) ? t("Delete Subtask", { defaultValue: "Delete Subtask" }) : t("Delete", { defaultValue: "Delete" })}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    if (isRecurrence) {
                                      setDeleteRecurrenceTask(item);
                                    } else {
                                      handleDelete(e, item);
                                    }
                                  }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                              {canApprove && (
                                <button
                                  className="action-icon-btn"
                                  title={isDeliverableItem(item) ? t("Approve Subtask", { defaultValue: "Approve Subtask" }) : t("Approve Task", { defaultValue: "Approve Task" })}
                                  style={{ color: "#16A34A" }}
                                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); setApproveTaskId(item); setApproveConfirmOpen(true); }}
                                >
                                  <CheckCircle2 size={16} />
                                </button>
                              )}
                              {canDecline && (
                                <button
                                  className="action-icon-btn"
                                  title={isDeliverableItem(item) ? t("Decline Subtask", { defaultValue: "Decline Subtask" }) : t("Decline Task", { defaultValue: "Decline Task" })}
                                  style={{ color: "#DC2626" }}
                                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); setDeclineTaskItem(item); }}
                                >
                                  <XCircle size={16} />
                                </button>
                              )}
                              {canReopen && (
                                <button
                                  className="action-icon-btn"
                                  title={isDeliverableItem(item) ? t("Reopen Subtask", { defaultValue: "Reopen Subtask" }) : t("Reopen Task", { defaultValue: "Reopen Task" })}
                                  style={{ color: "#2563EB" }}
                                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); setReopenTask(item); }}
                                >
                                  <RotateCcw size={16} />
                                </button>
                              )}
                              {canAbandon && (
                                <button
                                  className="action-icon-btn"
                                  title={isUserAdminOrManager ? (isDeliverableItem(item) ? t("Abandon Subtask", { defaultValue: "Abandon Subtask" }) : t("Abandon Task", { defaultValue: "Abandon Task" })) : t("Request Abandon", { defaultValue: "Request Abandon" })}
                                  style={{ color: "#F59E0B" }}
                                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); setAbandonTask(item); }}
                                >
                                  <AlertOctagon size={16} />
                                </button>
                              )}
                              {canMarkCompleted && (
                                <button
                                  className="action-icon-btn"
                                  title={t("Mark as Completed", { defaultValue: "Mark as Completed" })}
                                  style={{ color: "#059669" }}
                                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); setMarkCompletedTask(item); }}
                                >
                                  <IoCheckmarkCircle size={16} />
                                </button>
                              )}
                              {canTransfer && (
                                <button
                                  className="action-icon-btn"
                                  title={isDeliverableItem(item) ? t("Transfer Subtask", { defaultValue: "Transfer Subtask" }) : t("Transfer Task", { defaultValue: "Transfer Task" })}
                                  onClick={(e) => { e.stopPropagation(); setTransferDialog({ open: true, task: item }); }}
                                  style={{ color: "#2563EB", cursor: "pointer" }}
                                >
                                  <Users size={16} />
                                </button>
                              )}
                              {canAssignerPause && (
                                <button
                                  className="action-icon-btn"
                                  title={isDeliverableItem(item) ? t("Pause Subtask", { defaultValue: "Pause Subtask" }) : t("Pause", { defaultValue: "Pause" })}
                                  disabled={holdingTaskId === item.id}
                                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); setPauseModalTaskId(item); setPauseModalOpen(true); }}
                                  style={{ color: "#7C3AED", cursor: holdingTaskId === item.id ? "not-allowed" : "pointer" }}
                                >
                                  <Pause size={16} />
                                </button>
                              )}
                              {canAssignerResume && (
                                <button
                                  className="action-icon-btn"
                                  title={isDeliverableItem(item) ? t("Resume Subtask", { defaultValue: "Resume Subtask" }) : t("Resume", { defaultValue: "Resume" })}
                                  disabled={resumingTaskId === item.id}
                                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); setResumeModalTask(item); setResumeModalOpen(true); }}
                                  style={{ color: "#059669", cursor: resumingTaskId === item.id ? "not-allowed" : "pointer" }}
                                >
                                  <Play size={16} />
                                </button>
                              )}
                            </>
                          );
                        })()}
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
            onPageChange={handlePageChange}
            itemsPerPage={itemsPerPage}
            onItemsPerPageChange={(val) => { setItemsPerPage(val); handlePageChange(1); }}
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

      <ConfirmModal
        isOpen={resumeModalOpen}
        onClose={() => { setResumeModalOpen(false); setResumeModalTask(null); }}
        onConfirm={async () => {
          if (!resumeModalTask) return;
          await handleAssignerResume(resumeModalTask.id);
          setResumeModalOpen(false);
          setResumeModalTask(null);
        }}
        title={t("Resume Task", { defaultValue: "Resume Task" })}
        message={t("Are you sure you want to resume this task?", { defaultValue: "Are you sure you want to resume this task?" })}
        confirmText={t("Resume", { defaultValue: "Resume" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        confirmColor="#059669"
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

      <ConfirmModal
        isOpen={approveConfirmOpen}
        onClose={() => { setApproveConfirmOpen(false); setApproveTaskId(null); }}
        onConfirm={confirmDirectApprove}
        title={t("Approve Task", { defaultValue: "Approve Task" })}
        message={t("Are you sure you want to approve this task?", { defaultValue: "Are you sure you want to approve this task?" })}
        confirmText={t("Approve", { defaultValue: "Approve" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        confirmColor="#16A34A"
      />

      {declineTaskItem && (
        <DeclineModal
          isOpen={!!declineTaskItem}
          onClose={() => setDeclineTaskItem(null)}
          title={t("Decline Task", { defaultValue: "Decline Task" })}
          subtitle={declineTaskItem?.title}
          actionLabel={t("Decline Task", { defaultValue: "Decline Task" })}
          placeholder={t("Please enter a reason for declining this task...", { defaultValue: "Please enter a reason for declining this task..." })}
          onSubmit={(comment) => handleDirectDecline(null, declineTaskItem, comment)}
          loading={declineTaskLoading}
        />
      )}

      <DeleteRecurrenceModal
        isOpen={!!deleteRecurrenceTask}
        onClose={() => setDeleteRecurrenceTask(null)}
        task={deleteRecurrenceTask}
        onSuccess={fetchTasks}
      />

      {reopenTask && (
        <TaskReopenDialog
          isOpen={!!reopenTask}
          onClose={() => setReopenTask(null)}
          task={reopenTask}
          onReopenSuccess={handleDirectReopenSuccess}
        />
      )}

      {abandonTask && (
        <AbandonModal
          isOpen={!!abandonTask}
          onClose={() => setAbandonTask(null)}
          title={["admin", "manager"].includes(currentUser?.role) ? t("Abandon Task", { defaultValue: "Abandon Task" }) : t("Request Abandon", { defaultValue: "Request Abandon" })}
          subtitle={t("Provide justification for abandoning this task.", { defaultValue: "Provide justification for abandoning this task." })}
          actionLabel={["admin", "manager"].includes(currentUser?.role) ? t("Abandon", { defaultValue: "Abandon" }) : t("Submit Request", { defaultValue: "Submit Request" })}
          onSubmit={handleDirectAbandonSubmit}
          loading={abandoning}
        />
      )}

      {markCompletedTask && (
        <MarkTaskCompletedModal
          isOpen={!!markCompletedTask}
          onClose={() => setMarkCompletedTask(null)}
          task={markCompletedTask}
          entityType="task"
          onCompleteSuccess={handleDirectCompleteSuccess}
        />
      )}

      {transferDialog.open && transferDialog.task && (
        <TransferTaskDialog
          isOpen={transferDialog.open}
          onClose={() => setTransferDialog({ open: false, task: null })}
          task={transferDialog.task}
          onTransferSuccess={() => {
            setTransferDialog({ open: false, task: null });
            fetchTasks();
            showSuccessMessage(t("Task", { defaultValue: "Task" }), t("transferred", { defaultValue: "transferred" }));
          }}
        />
      )}

      <DynamicWidgetSection storageKey="pms_taskby_widgets" sectionTitle={t("Subtasks Widgets", { defaultValue: "Subtasks Widgets" })} />
    </DashboardLayout>
  );
};

export default Taskby;