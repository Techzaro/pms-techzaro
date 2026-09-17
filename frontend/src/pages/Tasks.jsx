/**
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
import { useTranslation } from "react-i18next";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";
import { CheckCircle2, Lock, Pause, Play, StickyNote, Users, ArrowUpRight, ChevronDown, XCircle, RotateCcw, AlertOctagon, Sliders, Pin, Trash2 } from "lucide-react";
import { usePinnedTasks, togglePinTask, isTaskPinned } from "../utils/pinnedTasks";
import { showSuccessMessage, toast, notify } from "../utils/notify";
import { publish } from "../utils/eventBus";
import CreateTaskModal from "../components/CreateTaskModal";
import EditTaskModal from "../components/EditTaskModal";
import SubmitTaskModal from "../components/SubmitTaskModal";
import ConfirmModal from "../components/ConfirmModal";
import DeclineModal from "../components/DeclineModal";
import PauseReasonModal from "../components/PauseReasonModal";
import SortableTableWrapper from "../components/SortableTableWrapper";
import SmartDragHandle from "../components/SmartDragHandle";
import Pagination from "../components/Pagination";
import ActionPopover from "../components/ActionPopover";
import TaskReopenDialog from "../components/TaskReopenDialog";
import AbandonModal from "../components/AbandonModal";
import MarkTaskCompletedModal from "../components/MarkTaskCompletedModal";
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
import { getUpdatedSinceThreshold } from "../utils/filterUtils";
import { isDelegationRejectedByMe, isDelegationRevokedFromMe, isDeliverableItem } from "../utils/delegationUtils";
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { isWidgetEnabled } = usePersonalization();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [items, setItems] = useState([]);
  const [apiCounts, setApiCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [submitTaskModal, setSubmitTaskModal] = useState({ open: false, task: null });
  const [restoreDraftId, setRestoreDraftId] = useState(null);
  const [draftDataPayload, setDraftDataPayload] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [noteModal, setNoteModal] = useState({ open: false, itemId: null });
  const [transferDialog, setTransferDialog] = useState({ open: false, task: null });
  const [pinnedTasks] = usePinnedTasks();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [pauseModalTaskId, setPauseModalTaskId] = useState(null);
  const [resumeConfirmOpen, setResumeConfirmOpen] = useState(false);
  const [resumeTaskItem, setResumeTaskItem] = useState(null);
  const [startTimerConfirmOpen, setStartTimerConfirmOpen] = useState(false);
  const [startTimerTaskItem, setStartTimerTaskItem] = useState(null);
  const [acknowledgeConfirmOpen, setAcknowledgeConfirmOpen] = useState(false);
  const [acknowledgeTaskItem, setAcknowledgeTaskItem] = useState(null);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [approveTaskId, setApproveTaskId] = useState(null);
  const [declineConfirmOpen, setDeclineConfirmOpen] = useState(false);
  const [declineTaskItem, setDeclineTaskItem] = useState(null);
  const [reopenTask, setReopenTask] = useState(null);
  const [abandonTask, setAbandonTask] = useState(null);
  const [markCompletedTask, setMarkCompletedTask] = useState(null);
  const [abandoning, setAbandoning] = useState(false);

  const [page, setPage] = useState(() => {
    const p = searchParams.get("page");
    return p ? Math.max(1, parseInt(p, 10) || 1) : 1;
  });
  const [showAll, setShowAll] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [orderedItems, setOrderedItems] = useState([]);

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

  const [sortBy, setSortBy] = useState("");
  const [sortDirection, setSortDirection] = useState("desc");

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

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDirection("asc");
    }
    handlePageChange(1);
  };

  const handleReorder = (newItems) => {
    setItems(newItems);
  };

  const handleTaskListReorder = useCallback((reordered) => {
    setOrderedItems(reordered);
    setItems(reordered);
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

  const selectStatusFilter = (status) => {
    setStatusFilter(status);
    setPage(1);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (status) {
        next.set("status", status);
      } else {
        next.delete("status");
      }
      next.delete("page");
      return next;
    });
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

  /** Fetch tasks assigned to the current user from the API. */
  const fetchTasks = useCallback(() => {
    try {
      setLoading(true);
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

      fetch(`${API_URL}/my-tasks?${params.toString()}`, {
        headers: { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
        skipLoader: true,
      })
        .then((res) => (res.ok ? res.json() : { data: [] }))
        .then((data) => {
          setItems(Array.isArray(data?.data) ? data.data : []);
          setTotalCount(typeof data?.total === "number" ? data.total : Array.isArray(data?.data) ? data.data.length : 0);
          if (data?.counts) {
            setApiCounts(data.counts);
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

// Handle draft restoration from DraftCenter
  useEffect(() => {
    const draftId = location.state?.openDraft;
    if (!draftId) return;

    const origId = location.state?.originalRecordId || location.state?.draft?.original_record_id;
    const directDraftData = location.state?.draftData;

    window.history.replaceState({}, document.title);

    if (origId) {
      setRestoreDraftId(draftId);
      setDraftDataPayload(directDraftData || null);

      const existingTask = items.find((t) => String(t.id) === String(origId));
      if (existingTask) {
        setEditingTask(existingTask);
        setShowEditModal(true);
      } else {
        const token = authToken();
        fetch(`${API_URL}/tasks/${origId}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        })
          .then((r) => r.json())
          .then((data) => {
            const t = data?.data || data?.task || data;
            setEditingTask(t || { id: origId, title: directDraftData?.title || "" });
            setShowEditModal(true);
          })
          .catch(() => {
            setEditingTask({ id: origId, title: directDraftData?.title || "" });
            setShowEditModal(true);
          });
      }
    } else {
      setRestoreDraftId(draftId);
      setDraftDataPayload(directDraftData || null);
      setShowTaskModal(true);
    }
  }, [location.state, items]);

  useAutoRefresh(() => { fetchTasks(); }, {
    events: ['task:created', 'task:updated', 'task:deleted', 'data:changed', 'sharing:changed'],
  });

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  const baseItems = orderedItems.length ? orderedItems : items;
  const pendingStatuses = useMemo(() => ["pending", "planned", "planning", "Pending", "Planned", "Planning"], []);
  const inProgressStatuses = useMemo(() => ["in_progress", "In Progress", "In-progress", "reopened", "Reopened", "doing"], []);
  const completedStatuses = useMemo(() => ["completed", "approved", "done", "Completed", "Approved", "Done"], []);
  const pausedStatuses = useMemo(() => ["paused", "Paused", "hold", "on_hold"], []);
  const submittedStatuses = useMemo(() => ["submitted", "Submitted", "review", "in_review", "under_review"], []);
  const declinedStatuses = useMemo(() => ["declined", "rejected", "failed", "Declined", "Rejected", "Failed"], []);
  const abandonedStatuses = useMemo(() => ["abandoned", "abandon_requested", "Abandoned", "Abandon Requested"], []);

  // Single-pass status counts instead of 11 separate .filter() iterations
  const taskStatusCounts = useMemo(() => {
    const counts = { all: 0, dueToday: 0, pending: 0, inProgress: 0, paused: 0, submitted: 0, reopened: 0, transferred: 0, completed: 0, approved: 0, declined: 0, rejected: 0, abandoned: 0 };
    const todayStr = new Date().toDateString();
    for (const i of baseItems) {
      counts.all++;
      const d = i.end_date ? new Date(i.end_date) : null;
      if (d && d.toDateString() === todayStr) counts.dueToday++;
      if (pendingStatuses.includes(i.status)) counts.pending++;
      if (inProgressStatuses.includes(i.status)) counts.inProgress++;
      if (pausedStatuses.includes(i.status)) counts.paused++;
      if (submittedStatuses.includes(i.status)) counts.submitted++;
      if (i.status === "reopened") counts.reopened++;
      if (i.delegation_chain && i.delegation_chain.length > 0) counts.transferred++;
      if (completedStatuses.includes(i.status)) counts.completed++;
      if (declinedStatuses.includes(i.status)) counts.declined++;
      if (abandonedStatuses.includes(i.status)) counts.abandoned++;
    }
    counts.approved = counts.completed;
    counts.rejected = counts.declined;
    return counts;
  }, [baseItems, pendingStatuses, inProgressStatuses, completedStatuses, pausedStatuses, submittedStatuses, declinedStatuses, abandonedStatuses]);

  const allCount = apiCounts?.all ?? taskStatusCounts.all;
  const dueTodayCount = (apiCounts?.due_today ?? apiCounts?.dueToday) ?? taskStatusCounts.dueToday;
  const pendingCount = apiCounts?.pending ?? taskStatusCounts.pending;
  const inProgressCount = (apiCounts?.in_progress ?? apiCounts?.inProgress) ?? taskStatusCounts.inProgress;
  const pausedCount = apiCounts?.paused ?? taskStatusCounts.paused;
  const submittedCount = apiCounts?.submitted ?? taskStatusCounts.submitted;
  const reopenedCount = apiCounts?.reopened ?? taskStatusCounts.reopened;
  const transferredCount = apiCounts?.transferred ?? taskStatusCounts.transferred;
  const completedCount = (apiCounts?.completed ?? apiCounts?.approved) ?? taskStatusCounts.completed;
  const approvedCount = completedCount;
  const declinedCount = (apiCounts?.declined ?? apiCounts?.rejected) ?? taskStatusCounts.declined;
  const rejectedCount = declinedCount;
  const abandonedCount = apiCounts?.abandoned ?? taskStatusCounts.abandoned;
  const searchFilteredItems = useMemo(() => {
    return baseItems;
  }, [baseItems]);

  const filteredItems = useMemo(() => {
    let list = searchFilteredItems;
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
      list = list.filter((item) => {
        const sf = String(statusFilter).toLowerCase();
        if (sf === "due_today") {
          const dateVal = item.end_date || item.due_date || item.start_date;
          if (!dateVal) return false;
          const d = new Date(dateVal);
          const now = new Date();
          const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
          const isCompleted = completedStatuses.includes(item.status);
          return isToday && !isCompleted;
        }
        if (sf === "pending") {
          return pendingStatuses.includes(item.status);
        }
        if (sf === "in_progress") {
          return inProgressStatuses.includes(item.status);
        }
        if (sf === "submitted") {
          return submittedStatuses.includes(item.status);
        }
        if (sf === "completed" || sf === "approved") {
          return completedStatuses.includes(item.status);
        }
        if (sf === "paused") {
          return pausedStatuses.includes(item.status);
        }
        if (sf === "declined" || sf === "rejected") {
          return declinedStatuses.includes(item.status);
        }
        if (sf === "abandoned") {
          return abandonedStatuses.includes(item.status);
        }
        if (sf === "transferred") {
          return item.delegation_chain && item.delegation_chain.length > 0;
        }
        return (item.status || "").toLowerCase() === sf;
      });
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
  }, [searchFilteredItems, statusFilter, advancedFilters.priority, advancedFilters.priorities, advancedFilters.updated_since, advancedFilters.updated_since_value, advancedFilters.updated_since_unit, completedStatuses, pendingStatuses, inProgressStatuses, submittedStatuses, pausedStatuses, declinedStatuses, abandonedStatuses]);

  const taskIdList = useMemo(() => filteredItems.map((i) => i.id), [filteredItems]);

  const totalPages = showAll ? 1 : Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = showAll ? filteredItems : filteredItems.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const breadcrumbs = [
    { label: t("Tasks", { defaultValue: "Tasks" }), path: rolePath("tasks") },
    { label: t("Assigned To You", { defaultValue: "Assigned To You" }) },
  ];

  const handleTaskSubmitSuccess = (taskOrId, updatedTask) => {
    const updated = typeof taskOrId === "object" && taskOrId !== null ? taskOrId : (updatedTask || {});
    const targetId = typeof taskOrId === "object" && taskOrId !== null ? (taskOrId.id || submitTaskModal.task?.id) : (taskOrId || submitTaskModal.task?.id);
    const item = items.find((i) => i.id === targetId);
    const isDeliverable = isDeliverableItem(item) || isDeliverableItem(submitTaskModal.task) || isDeliverableItem(updated);
    setItems((prev) =>
      prev.map((i) =>
        i.id === targetId
          ? { ...i, ...updated, status: updated.status || i.status || "submitted" }
          : i
      )
    );
    publish(isDeliverable ? 'deliverable:updated' : 'task:updated', { id: targetId, ...(updated || {}) });
    publish('data:changed', { type: isDeliverable ? 'deliverable' : 'task', action: 'updated' });
    setSubmitTaskModal({ open: false, task: null });
  };

  const handleDirectApprove = async (e, taskOrId) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    const item = typeof taskOrId === 'object' && taskOrId !== null ? taskOrId : items.find((i) => i.id === taskOrId);
    const taskId = item ? item.id : taskOrId;
    const isDeliverable = isDeliverableItem(item);
    const endpoint = isDeliverable ? `${API_URL}/deliverables/${taskId}/approve` : `${API_URL}/tasks/${taskId}/approve`;
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
          prev.map((i) =>
            i.id === taskId ? { ...i, status: "approved", ...updatedObj } : i
          )
        );
        fetchTasks();
        publish(isDeliverable ? 'deliverable:updated' : 'task:updated', { id: taskId, status: 'approved', ...updatedObj });
        publish('data:changed', { type: isDeliverable ? 'deliverable' : 'task', action: 'updated' });
        showSuccessMessage(isDeliverable ? t("Subtask", { defaultValue: "Subtask" }) : t("Task", { defaultValue: "Task" }), t("approved", { defaultValue: "approved" }));
      } else {
        notify.error(data.message || (isDeliverable ? t("Failed to approve subtask.", { defaultValue: "Failed to approve subtask." }) : t("Failed to approve task.", { defaultValue: "Failed to approve task." })));
      }
    } catch {
      notify.error(isDeliverable ? t("An error occurred while approving subtask.", { defaultValue: "An error occurred while approving subtask." }) : t("An error occurred while approving task.", { defaultValue: "An error occurred while approving task." }));
    }
  };

  const handleDirectDecline = async (e, taskOrId, comment) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    const item = typeof taskOrId === 'object' && taskOrId !== null ? taskOrId : items.find((i) => i.id === taskOrId);
    const taskId = item ? item.id : taskOrId;
    const isDeliverable = isDeliverableItem(item);
    const endpoint = isDeliverable ? `${API_URL}/deliverables/${taskId}/reject` : `${API_URL}/tasks/${taskId}/reject`;
    setDeclineTaskLoading(true);
    try {
      const token = authToken();
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
          prev.map((i) =>
            i.id === taskId ? { ...i, status: "declined", ...updatedObj } : i
          )
        );
        fetchTasks();
        publish(isDeliverable ? 'deliverable:updated' : 'task:updated', { id: taskId, status: 'declined', ...updatedObj });
        publish('data:changed', { type: isDeliverable ? 'deliverable' : 'task', action: 'updated' });
        showSuccessMessage(isDeliverable ? t("Subtask", { defaultValue: "Subtask" }) : t("Task", { defaultValue: "Task" }), t("declined", { defaultValue: "declined" }));
        setDeclineTaskItem(null);
      } else {
        notify.error(data.message || (isDeliverable ? t("Failed to decline subtask.", { defaultValue: "Failed to decline subtask." }) : t("Failed to decline task.", { defaultValue: "Failed to decline task." })));
      }
    } catch {
      notify.error(isDeliverable ? t("An error occurred while declining subtask.", { defaultValue: "An error occurred while declining subtask." }) : t("An error occurred while declining task.", { defaultValue: "An error occurred while declining task." }));
    } finally {
      setDeclineTaskLoading(false);
    }
  };

  const confirmDirectApprove = async () => {
    if (!approveTaskId) return;
    const id = approveTaskId;
    setApproveConfirmOpen(false);
    setApproveTaskId(null);
    await handleDirectApprove(null, id);
  };

  const handleDirectAbandonSubmit = async (reason) => {
    if (!abandonTask) return;
    setAbandoning(true);
    const item = abandonTask;
    const taskId = item.id;
    const isDeliverable = isDeliverableItem(item);
    const isUserAdminOrManager = ["admin", "manager"].includes(currentUser?.role);
    const endpoint = isDeliverable
      ? (isUserAdminOrManager ? `${API_URL}/deliverables/${taskId}/abandon` : `${API_URL}/deliverables/${taskId}/request-abandon`)
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
          prev.map((i) =>
            i.id === taskId ? { ...i, status: "abandoned", ...updatedObj } : i
          )
        );
        fetchTasks();
        publish(isDeliverable ? 'deliverable:updated' : 'task:updated', { id: taskId, status: 'abandoned', ...updatedObj });
        publish('data:changed', { type: isDeliverable ? 'deliverable' : 'task', action: 'updated' });
        showSuccessMessage(isDeliverable ? t("Subtask", { defaultValue: "Subtask" }) : t("Task", { defaultValue: "Task" }), isUserAdminOrManager ? t("abandoned", { defaultValue: "abandoned" }) : t("abandon requested", { defaultValue: "abandon requested" }));
        setAbandonTask(null);
      } else {
        notify.error(data.message || (isDeliverable ? t("Failed to abandon subtask.", { defaultValue: "Failed to abandon subtask." }) : t("Failed to abandon task.", { defaultValue: "Failed to abandon task." })));
      }
    } catch {
      notify.error(isDeliverable ? t("Failed to abandon subtask.", { defaultValue: "Failed to abandon subtask." }) : t("Failed to abandon task.", { defaultValue: "Failed to abandon task." }));
    } finally {
      setAbandoning(false);
    }
  };

  const handleDirectReopenSuccess = (updatedTask) => {
    if (!updatedTask && !reopenTask) return;
    const item = updatedTask || reopenTask;
    const taskId = item?.id;
    const isDeliverable = isDeliverableItem(item);
    setItems((prev) =>
      prev.map((i) =>
        i.id === taskId ? { ...i, status: "pending", ...(updatedTask || {}) } : i
      )
    );
    fetchTasks();
    publish(isDeliverable ? 'deliverable:updated' : 'task:updated', { id: taskId, status: 'pending', ...(updatedTask || {}) });
    publish('data:changed', { type: isDeliverable ? 'deliverable' : 'task', action: 'updated' });
    showSuccessMessage(isDeliverable ? t("Subtask", { defaultValue: "Subtask" }) : t("Task", { defaultValue: "Task" }), t("reopened", { defaultValue: "reopened" }));
    setReopenTask(null);
  };

  const handleDirectCompleteSuccess = (updatedTask) => {
    if (!updatedTask && !markCompletedTask) return;
    const item = updatedTask || markCompletedTask;
    const taskId = item?.id;
    const isDeliverable = isDeliverableItem(item);
    setItems((prev) =>
      prev.map((i) =>
        i.id === taskId ? { ...i, status: "completed", ...(updatedTask || {}) } : i
      )
    );
    fetchTasks();
    publish(isDeliverable ? 'deliverable:updated' : 'task:updated', { id: taskId, status: 'completed', ...(updatedTask || {}) });
    publish('data:changed', { type: isDeliverable ? 'deliverable' : 'task', action: 'updated' });
    showSuccessMessage(isDeliverable ? t("Subtask", { defaultValue: "Subtask" }) : t("Task", { defaultValue: "Task" }), t("marked as completed", { defaultValue: "marked as completed" }));
    setMarkCompletedTask(null);
  };

  const handleAcknowledge = async (e, taskOrId) => {
    const item = typeof taskOrId === 'object' && taskOrId !== null ? taskOrId : (typeof e === 'object' && e?.id ? e : items.find(i => i.id === taskOrId));
    const actualTaskId = item ? item.id : ((e && typeof e === 'object' && e.stopPropagation) ? taskOrId : (e || taskOrId));
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    const isDeliverable = isDeliverableItem(item);
    const endpoint = isDeliverable ? `${API_URL}/deliverables/${actualTaskId}/acknowledge` : `${API_URL}/tasks/${actualTaskId}/acknowledge`;

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
          prev.map((i) =>
            i.id === actualTaskId ? { ...i, status: "in_progress", ...updatedObj } : i
          )
        );
        fetchTasks();
        if (isDeliverable) {
          publish('deliverable:updated', { id: actualTaskId, status: 'in_progress', ...updatedObj });
          publish('data:changed', { type: 'deliverable', action: 'updated' });
          showSuccessMessage(t("Subtask", { defaultValue: "Subtask" }), t("acknowledged", { defaultValue: "acknowledged" }));
        } else {
          publish('task:updated', { id: actualTaskId, status: 'in_progress', ...updatedObj });
          publish('data:changed', { type: 'task', action: 'updated' });
          showSuccessMessage(t("Task", { defaultValue: "Task" }), t("acknowledged", { defaultValue: "acknowledged" }));
        }
      } else {
        const errorMsg = data?.message || data?.error || (data?.errors ? Object.values(data.errors).flat().join(", ") : null) || (isDeliverable ? t("Failed to acknowledge subtask.", { defaultValue: "Failed to acknowledge subtask." }) : t("Failed to acknowledge task.", { defaultValue: "Failed to acknowledge task." }));
        if (notify?.error) {
          notify.error(errorMsg);
        }
      }
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || (isDeliverable ? t("Failed to acknowledge subtask.", { defaultValue: "Failed to acknowledge subtask." }) : t("Failed to acknowledge task.", { defaultValue: "Failed to acknowledge task." }));
      if (notify?.error) {
        notify.error(errorMsg);
      }
    }
  };

  const handleStartTimer = async (e, taskOrId) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    const item = typeof taskOrId === 'object' && taskOrId !== null ? taskOrId : items.find((i) => i.id === taskOrId);
    const taskId = item ? item.id : taskOrId;
    const isDeliverable = isDeliverableItem(item);
    const endpoint = isDeliverable ? `${API_URL}/deliverables/${taskId}/start-timer` : `${API_URL}/tasks/${taskId}/start-timer`;
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
          prev.map((i) =>
            i.id === taskId ? { ...i, status: "in_progress", timer_state: "running", timer: { ...(i.timer || {}), state: "running" }, ...updatedObj } : i
          )
        );
        fetchTasks();
        publish(isDeliverable ? 'deliverable:updated' : 'task:updated', { id: taskId, status: 'in_progress', ...updatedObj });
        publish('data:changed', { type: isDeliverable ? 'deliverable' : 'task', action: 'updated' });
        showSuccessMessage(isDeliverable ? t("Subtask", { defaultValue: "Subtask" }) : t("Task", { defaultValue: "Task" }), t("timer started", { defaultValue: "timer started" }));
      } else {
        const errorMsg = data?.message || data?.error || (data?.errors ? Object.values(data.errors).flat().join(", ") : null) || (isDeliverable ? t("Failed to start subtask timer.", { defaultValue: "Failed to start subtask timer." }) : t("Failed to start task timer.", { defaultValue: "Failed to start task timer." }));
        notify.error(errorMsg);
      }
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || (isDeliverable ? t("Failed to start subtask timer.", { defaultValue: "Failed to start subtask timer." }) : t("Failed to start task timer.", { defaultValue: "Failed to start task timer." }));
      notify.error(errorMsg);
    }
  };

  const handleContinue = async (e, taskOrId) => {
    const item = typeof taskOrId === 'object' && taskOrId !== null ? taskOrId : items.find((i) => i.id === taskOrId);
    const actualTaskId = item ? item.id : ((e && typeof e === 'object' && e.stopPropagation) ? taskOrId : (e || taskOrId));
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    const isDeliverable = isDeliverableItem(item);
    const endpoint = isDeliverable ? `${API_URL}/deliverables/${actualTaskId}/resume` : `${API_URL}/tasks/${actualTaskId}/continue`;
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
          prev.map((i) =>
            i.id === actualTaskId ? { ...i, status: "in_progress", assigner_paused: false, ...updatedObj } : i
          )
        );
        fetchTasks();
        publish(isDeliverable ? 'deliverable:updated' : 'task:updated', { id: actualTaskId, status: 'in_progress', ...updatedObj });
        publish('data:changed', { type: isDeliverable ? 'deliverable' : 'task', action: 'updated' });
        showSuccessMessage(isDeliverable ? t("Subtask", { defaultValue: "Subtask" }) : t("Task", { defaultValue: "Task" }), t("resumed", { defaultValue: "resumed" }));
      } else {
        const errorMsg = data?.message || data?.error || (data?.errors ? Object.values(data.errors).flat().join(", ") : null) || (isDeliverable ? t("Failed to continue subtask.", { defaultValue: "Failed to continue subtask." }) : t("Failed to continue task.", { defaultValue: "Failed to continue task." }));
        notify.error(errorMsg);
      }
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || (isDeliverable ? t("Failed to continue subtask.", { defaultValue: "Failed to continue subtask." }) : t("Failed to continue task.", { defaultValue: "Failed to continue task." }));
      notify.error(errorMsg);
    }
  };

  const handlePause = async (taskOrId, data = {}) => {
    const item = typeof taskOrId === 'object' && taskOrId !== null ? taskOrId : items.find((i) => i.id === taskOrId);
    const taskId = item ? item.id : taskOrId;
    const isDeliverable = isDeliverableItem(item);
    const endpoint = isDeliverable ? `${API_URL}/deliverables/${taskId}/pause` : `${API_URL}/tasks/${taskId}/pause`;
    try {
      const token = authToken();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ reason: data.reason || "other", reason_detail: data.reason_detail || (isDeliverable ? "Paused from subtask list" : "Paused from task list") }),
        _notifHandled: true,
      });
      const resData = await res.json().catch(() => ({}));
      if (res.ok) {
        const updatedObj = resData.deliverable || resData.task || {};
        setItems((prev) =>
          prev.map((i) =>
            i.id === taskId ? { ...i, status: "paused", ...updatedObj } : i
          )
        );
        fetchTasks();
        publish(isDeliverable ? 'deliverable:updated' : 'task:updated', { id: taskId, status: 'paused', ...updatedObj });
        publish('data:changed', { type: isDeliverable ? 'deliverable' : 'task', action: 'updated' });
        showSuccessMessage(isDeliverable ? t("Subtask", { defaultValue: "Subtask" }) : t("Task", { defaultValue: "Task" }), t("paused", { defaultValue: "paused" }));
      } else {
        notify.error(resData?.message || resData?.error || (isDeliverable ? t("Failed to pause subtask.", { defaultValue: "Failed to pause subtask." }) : t("Failed to pause task.", { defaultValue: "Failed to pause task." })));
      }
    } catch (err) {
      notify.error(isDeliverable ? t("Failed to pause subtask.", { defaultValue: "Failed to pause subtask." }) : t("Failed to pause task.", { defaultValue: "Failed to pause task." }));
    }
  };

  const handleDelete = (e, taskOrId) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    const item = typeof taskOrId === 'object' && taskOrId !== null ? taskOrId : items.find((i) => i.id === taskOrId);
    setDeleteTargetId(item?.id || taskOrId);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    const taskId = deleteTargetId;
    setDeleteConfirmOpen(false);
    setDeleteTargetId(null);
    if (!taskId) return;
    const item = items.find((i) => i.id === taskId);
    const isDeliverable = isDeliverableItem(item);
    const endpoint = isDeliverable ? `${API_URL}/deliverables/${taskId}` : `${API_URL}/tasks/${taskId}`;
    try {
      const token = authToken();
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
        _notifHandled: true,
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => String(i.id) !== String(taskId)));
        setOrderedItems((prev) => prev.filter((i) => String(i.id) !== String(taskId)));
        fetchTasks();
        publish(isDeliverable ? 'deliverable:deleted' : 'task:deleted', { id: taskId });
        publish('data:changed', { type: isDeliverable ? 'deliverable' : 'task', action: 'deleted' });
        toast.success(isDeliverable ? t("Subtask deleted successfully", { defaultValue: "Subtask deleted successfully" }) : t("Task deleted successfully", { defaultValue: "Task deleted successfully" }));
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || (isDeliverable ? t("Failed to delete subtask.", { defaultValue: "Failed to delete subtask." }) : t("Failed to delete task.", { defaultValue: "Failed to delete task." })));
      }
    } catch {
      toast.error(isDeliverable ? t("Failed to delete subtask.", { defaultValue: "Failed to delete subtask." }) : t("Failed to delete task.", { defaultValue: "Failed to delete task." }));
    }
  };

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="Task">
        <div className="task-text">
          <h3>{t("Tasks Assigned To You", { defaultValue: "Tasks Assigned To You" })}</h3>
          <p>{t("Manage and track your tasks and projects", { defaultValue: "Manage and track your tasks and projects" })}</p>
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
        <CreateTaskModal
          restoreDraftId={restoreDraftId}
          draftData={draftDataPayload}
          onClose={(refresh) => {
            setShowTaskModal(false);
            setRestoreDraftId(null);
            setDraftDataPayload(null);
            if (refresh) fetchTasks();
          }}
        />
      )}

      {showEditModal && editingTask && (
        <EditTaskModal
          task={editingTask}
          restoreDraftId={restoreDraftId}
          draftData={draftDataPayload}
          onClose={(refresh) => {
            setShowEditModal(false);
            setEditingTask(null);
            setRestoreDraftId(null);
            setDraftDataPayload(null);
            if (refresh) fetchTasks();
          }}
        />
      )}

      {isWidgetEnabled("tasks", "stats_cards") && (
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
          storageKey="pms_tasks_status_order"
          containerClassName="task-progress"
        />
      )}

      {/* DEDICATED ACTION BAR & FILTERS */}
      {isWidgetEnabled("tasks", "filter_bar") && (
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
      )}

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
          <SortableTableWrapper 
            items={paginatedItems.map((i) => ({ ...i, sortableId: `task-${i.id}` }))} 
            onReorder={(reordered) => handleTaskListReorder(reordered)} 
            idKey="sortableId"
            as="div"
            handleOnly
          >
            {(item, idx, dndProps) => {
              const colors = getRandomColors(item.id);

              const isRejected = isDelegationRejectedByMe(item, currentUser);
              const isRevoked = isDelegationRevokedFromMe(item, currentUser);
              const isInactive = isRejected || isRevoked;
              const hasChain = item.delegation_chain && item.delegation_chain.length > 0;
              const assigner = item.assigner;
              const displayName = item.transferred_by_name || assigner?.name || "System";
              const displayRole = item.transferred_by_name ? t("Transferred", { defaultValue: "Transferred" }) : (assigner?.role ? t(assigner.role, { defaultValue: assigner.role }) : "");
              return (
                <div className={`taskby-row ${isInactive ? "delegation-rejected-row" : ""}`} key={item.sortableId} style={isInactive ? { opacity: 0.88 } : undefined}>
                  <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} id={item.id} businessId={item.business_id} />
                  <div className="col-assigned-to">
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div className="avatar" style={{ background: colors.bg, color: colors.text }}>{getInitials(displayName)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="user-name">{item.is_shared ? (item.shared_by_user?.name || displayName) : displayName}</div>
                        <div className="user-role">{item.is_shared ? t("Shared", { defaultValue: "Shared" }) : displayRole}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="col-task-name">
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      {item.item_type === "subtask" && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", background: "#EEF2FF", color: "#4F46E5", border: "1px solid #C7D2FE", borderRadius: "4px", padding: "1px 5px", fontSize: "10px", fontWeight: 700, lineHeight: "14px", flexShrink: 0 }}>
                          ↳ {t("Subtask", { defaultValue: "Subtask" })}
                        </span>
                      )}
                      {hasChain && !isInactive && <ArrowUpRight size={14} style={{ color: "#6B7280", flexShrink: 0 }} />}
                      {isRejected && (
                        <span
                          className="badge"
                          title={t("Transfer Rejected by You", { defaultValue: "Transfer Rejected by You" })}
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
                          {t("Transfer Rejected", { defaultValue: "Transfer Rejected" })}
                        </span>
                      )}
                      {isRevoked && (
                        <span
                          className="badge"
                          title={t("Transfer Revoked by Assigner", { defaultValue: "Transfer Revoked by Assigner" })}
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
                      )}
                      <div className="task-title" title={item.title} style={{ maxWidth: "250px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: isInactive ? 0.75 : 1 }}>{item.title}</div>
                      {item.is_shared && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", background: "#EEF2FF", color: "#4F46E5", padding: "1px 6px", borderRadius: "10px", fontSize: "10px", fontWeight: 600, flexShrink: 0 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
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
                      <Link to={rolePath(`projects/project-details/${item.project.id}`)} onClick={(e) => e.stopPropagation()} style={{ fontSize: "11px", color: "#6B7280", textDecoration: "none", marginTop: "2px", display: "inline-block", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.project.title}>
                        {item.project.title}
                      </Link>
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
                        const isDeliverable = isDeliverableItem(item);
                        const currentSearch = location.search || (page > 1 ? `?page=${page}` : "");
                        const returnUrl = `${location.pathname}${currentSearch}`;
                        if (isDeliverable) {
                          navigate(rolePath(`deliveries/deliverable-details/${item.id}`), { state: { from: 'tasks', page, returnUrl } });
                        } else {
                          navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'tasks', page, returnUrl } });
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
                      <button
                        className="action-icon-btn"
                        title={isTaskPinned(item.id) ? t("Unpin from Dashboard", { defaultValue: "Unpin from Dashboard" }) : t("Pin to Dashboard", { defaultValue: "Pin to Dashboard" })}
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); togglePinTask(item); }}
                      >
                        <Pin size={14} style={{ color: isTaskPinned(item.id) ? "#4f46e5" : "var(--text-secondary)", fill: isTaskPinned(item.id) ? "#4f46e5" : "none" }} />
                      </button>
                      {(() => {
                        if (item.is_shared) return null;
                        const isUserAdminOrManager = ["admin", "manager"].includes(currentUser?.role);
                        const canUserApprove = isUserAdminOrManager || item.created_by === currentUser?.id || item.is_next_approver;
                        return (
                          <>
                            {canUserApprove && (item.status === "submitted" || item.status === "reopened") && (
                              <button
                                className="action-icon-btn"
                                title={isDeliverableItem(item) ? t("Approve Subtask", { defaultValue: "Approve Subtask" }) : t("Approve Task", { defaultValue: "Approve Task" })}
                                style={{ color: "#16A34A", fontWeight: "bold" }}
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setApproveTaskId(item); setApproveConfirmOpen(true); }}
                              >
                                <CheckCircle2 size={16} />
                              </button>
                            )}
                            {canUserApprove && (item.status === "submitted" || item.status === "reopened") && (
                              <button
                                className="action-icon-btn"
                                title={isDeliverableItem(item) ? t("Decline Subtask", { defaultValue: "Decline Subtask" }) : t("Decline Task", { defaultValue: "Decline Task" })}
                                style={{ color: "#DC2626" }}
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setDeclineTaskItem(item); }}
                              >
                                <XCircle size={16} />
                              </button>
                            )}
                            {canUserApprove && (item.status === "approved" || item.status === "submitted" || item.status === "reopened" || item.status === "abandoned") && (
                              <button
                                className="action-icon-btn"
                                title={isDeliverableItem(item) ? t("Reopen Subtask", { defaultValue: "Reopen Subtask" }) : t("Reopen Task", { defaultValue: "Reopen Task" })}
                                style={{ color: "#2563EB" }}
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setReopenTask(item); }}
                              >
                                <RotateCcw size={16} />
                              </button>
                            )}
                            {item.status !== "abandoned" && (
                              <button
                                className="action-icon-btn"
                                title={isUserAdminOrManager ? (isDeliverableItem(item) ? t("Abandon Subtask", { defaultValue: "Abandon Subtask" }) : t("Abandon Task", { defaultValue: "Abandon Task" })) : t("Request Abandon", { defaultValue: "Request Abandon" })}
                                style={{ color: "#F59E0B" }}
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setAbandonTask(item); }}
                              >
                                <AlertOctagon size={16} />
                              </button>
                            )}
                            {canUserApprove && (item.status === "pending" || item.status === "in-progress" || item.status === "in_progress" || item.status?.toLowerCase() === "pending" || item.status?.toLowerCase() === "in-progress" || item.status?.toLowerCase() === "in_progress") && (
                              <button
                                className="action-icon-btn"
                                title={t("Mark as Completed", { defaultValue: "Mark as Completed" })}
                                style={{ color: "#059669" }}
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setMarkCompletedTask(item); }}
                              >
                                <CheckCircle2 size={16} />
                              </button>
                            )}
                          </>
                        );
                      })()}
                      {(() => {
                        if (item.is_shared) return null;
                        if (item.is_transferor) {
                          return (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "#EFF6FF", color: "#1D4ED8", fontSize: "11px", fontWeight: 600 }}>
                              {t("Transferred", { defaultValue: "Transferred" })}
                            </span>
                          );
                        }
                        const myPivotStatus = item.assignees?.find(a => parseInt(a.id, 10) === parseInt(currentUser?.id, 10))?.pivot?.status;
                        if (item.assigner_paused) {
                          return (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "#FEF3C7", color: "#92400E", fontSize: "11px", fontWeight: 600, border: "1px solid #F59E0B" }}>
                              <Lock size={12} />
                              {t("Paused by Assigner", { defaultValue: "Paused by Assigner" })}
                            </span>
                          );
                        }
                        const sStatus = (item.status || "").toLowerCase();
                        const isPaused = (sStatus === "paused" || item.timer?.state === "paused" || item.timer_state === "paused");
                        const isTimerRunning = (item.timer?.state === "running" || item.timer_state === "running");
                        const canTrack = canUserPauseResume(item, currentUser) && !item.assigner_paused;
                        const isTerminal = ["approved", "completed", "rejected", "declined", "abandoned"].includes(sStatus);

                        const canAcknowledge = item.status === "pending";
                        const canStartTimer = canTrack && !isTerminal && !isPaused && !isTimerRunning && ["in_progress", "in-progress", "reopened", "acknowledged"].includes(sStatus);
                        const canPause = canTrack && !isTerminal && !isPaused && isTimerRunning && ["in_progress", "in-progress", "submitted"].includes(sStatus);
                        const canResume = canTrack && !isTerminal && isPaused;
                        const canSubmit = !isTerminal && (sStatus === "in_progress" || sStatus === "reopened" || sStatus === "acknowledged") && myPivotStatus !== "submitted";

                        return (
                          <>
                            {canAcknowledge && (
                              <button
                                className="action-icon-btn action-submit"
                                title={isDeliverableItem(item) ? t("Acknowledge Subtask", { defaultValue: "Acknowledge Subtask" }) : t("Acknowledge Task", { defaultValue: "Acknowledge Task" })}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setAcknowledgeTaskItem(item);
                                  setAcknowledgeConfirmOpen(true);
                                }}
                                style={{ color: "#2563EB" }}
                              >
                                <CheckCircle2 size={16} />
                              </button>
                            )}

                            {canStartTimer && (
                              <button
                                className="action-icon-btn action-submit"
                                title={isDeliverableItem(item) ? t("Start Subtask Timer", { defaultValue: "Start Subtask Timer" }) : t("Start Task Timer", { defaultValue: "Start Task Timer" })}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setStartTimerTaskItem(item);
                                  setStartTimerConfirmOpen(true);
                                }}
                                style={{ color: "#2563EB" }}
                              >
                                <Play size={16} />
                              </button>
                            )}

                            {canPause && (
                              <button
                                className="action-icon-btn action-submit"
                                title={isDeliverableItem(item) ? t("Pause Subtask", { defaultValue: "Pause Subtask" }) : t("Pause Task", { defaultValue: "Pause Task" })}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setPauseModalTaskId(item);
                                  setPauseModalOpen(true);
                                }}
                                style={{ color: "#D97706" }}
                              >
                                <Pause size={16} />
                              </button>
                            )}

                            {canResume && (
                              <button
                                className="action-icon-btn action-submit"
                                title={isDeliverableItem(item) ? t("Resume Subtask", { defaultValue: "Resume Subtask" }) : t("Resume Task", { defaultValue: "Resume Task" })}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setResumeTaskItem(item);
                                  setResumeConfirmOpen(true);
                                }}
                                style={{ color: "#059669" }}
                              >
                                <Play size={16} />
                              </button>
                            )}

                            {canSubmit && (
                              <div style={{ position: "relative", display: "inline-flex" }}>
                                <button
                                  className="action-icon-btn action-submit"
                                  title={!isDeliverableItem(item) && item.pending_deliverables_count > 0 ? t("Submit all subtasks first", { defaultValue: "Submit all subtasks first" }) : item.status === "paused" || item.assigner_paused ? t("Task is paused. Resume first.", { defaultValue: "Task is paused. Resume first." }) : (isDeliverableItem(item) ? t("Submit Subtask", { defaultValue: "Submit Subtask" }) : t("Submit Task", { defaultValue: "Submit Task" }))}
                                  disabled={(!isDeliverableItem(item) && item.pending_deliverables_count > 0) || item.status === "paused" || item.assigner_paused}
                                  onClick={(e) => { e.stopPropagation(); (isDeliverableItem(item) || !item.pending_deliverables_count) && item.status !== "paused" && !item.assigner_paused && setSubmitTaskModal({ open: true, task: item }); }}
                                  style={(!isDeliverableItem(item) && item.pending_deliverables_count > 0) || item.status === "paused" || item.assigner_paused ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                                >
                                  <LuSend size={16} />
                                </button>
                              </div>
                            )}
                          </>
                        );
                      })()}
                      {(() => {
                        if (item.is_shared) return null;
                        const canDelete = ["admin", "manager", "super_admin"].includes(currentUser?.role) || (item.created_by && Number(item.created_by) === Number(currentUser?.id)) || (item.assigned_by && Number(item.assigned_by) === Number(currentUser?.id));
                        if (!canDelete) return null;
                        return (
                          <button
                            className="action-icon-btn action-delete"
                            title={isDeliverableItem(item) ? t("Delete Subtask", { defaultValue: "Delete Subtask" }) : t("Delete Task", { defaultValue: "Delete Task" })}
                            onClick={(e) => handleDelete(e, item)}
                          >
                            <Trash2 size={16} />
                          </button>
                        );
                      })()}
                      {!["approved", "rejected", "pending", "submitted"].includes(item.status) && !item.is_transferor && (
                        <button
                          className="action-icon-btn"
                          title={isDeliverableItem(item) ? t("Transfer Subtask", { defaultValue: "Transfer Subtask" }) : t("Transfer Task", { defaultValue: "Transfer Task" })}
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
          onPageChange={handlePageChange}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={(val) => { setItemsPerPage(val); handlePageChange(1); }}
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

      <PauseReasonModal
        isOpen={pauseModalOpen}
        onClose={() => { setPauseModalOpen(false); setPauseModalTaskId(null); }}
        onConfirm={async (data) => {
          await handlePause(pauseModalTaskId, data);
          setPauseModalOpen(false);
          setPauseModalTaskId(null);
        }}
      />

      <ConfirmModal
        isOpen={startTimerConfirmOpen}
        onClose={() => { setStartTimerConfirmOpen(false); setStartTimerTaskItem(null); }}
        onConfirm={async () => {
          if (!startTimerTaskItem) return;
          await handleStartTimer(null, startTimerTaskItem);
          setStartTimerConfirmOpen(false);
          setStartTimerTaskItem(null);
        }}
        title={isDeliverableItem(startTimerTaskItem) ? t("Start Subtask Timer", { defaultValue: "Start Subtask Timer" }) : t("Start Task Timer", { defaultValue: "Start Task Timer" })}
        message={isDeliverableItem(startTimerTaskItem) ? t("Are you sure you want to start the timer for this subtask?", { defaultValue: "Are you sure you want to start the timer for this subtask?" }) : t("Are you sure you want to start the timer for this task?", { defaultValue: "Are you sure you want to start the timer for this task?" })}
        confirmText={t("Start Timer", { defaultValue: "Start Timer" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        confirmColor="#2563EB"
      />

      <ConfirmModal
        isOpen={resumeConfirmOpen}
        onClose={() => { setResumeConfirmOpen(false); setResumeTaskItem(null); }}
        onConfirm={async () => {
          if (!resumeTaskItem) return;
          await handleContinue(null, resumeTaskItem.id);
          setResumeConfirmOpen(false);
          setResumeTaskItem(null);
        }}
        title={isDeliverableItem(resumeTaskItem) ? t("Resume Subtask", { defaultValue: "Resume Subtask" }) : t("Resume Task", { defaultValue: "Resume Task" })}
        message={isDeliverableItem(resumeTaskItem) ? t("Are you sure you want to resume this subtask?", { defaultValue: "Are you sure you want to resume this subtask?" }) : t("Are you sure you want to resume this task?", { defaultValue: "Are you sure you want to resume this task?" })}
        confirmText={t("Resume", { defaultValue: "Resume" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        confirmColor="#059669"
      />

      <ConfirmModal
        isOpen={acknowledgeConfirmOpen}
        onClose={() => { setAcknowledgeConfirmOpen(false); setAcknowledgeTaskItem(null); }}
        onConfirm={async () => {
          if (!acknowledgeTaskItem) return;
          await handleAcknowledge(null, acknowledgeTaskItem);
          setAcknowledgeConfirmOpen(false);
          setAcknowledgeTaskItem(null);
        }}
        title={t("Acknowledge", { defaultValue: "Acknowledge" })}
        message={t("Are you sure you want to acknowledge this task?", { defaultValue: "Are you sure you want to acknowledge this task?" })}
        confirmText={t("Acknowledge", { defaultValue: "Acknowledge" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        confirmColor="#2563EB"
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
          onTransferSuccess={() => { setTransferDialog({ open: false, task: null }); fetchTasks(); showSuccessMessage(t("Task", { defaultValue: "Task" }), t("transferred", { defaultValue: "transferred" })); }}
        />
      )}

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

      <DynamicWidgetSection storageKey="pms_tasks_widgets" sectionTitle={t("Tasks Widgets", { defaultValue: "Tasks Widgets" })} />
    </DashboardLayout>
  );
}

export default Tasks;