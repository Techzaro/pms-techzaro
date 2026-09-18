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
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";
import { ArrowUpRight, CheckCircle2, Lock, Pause, Play, StickyNote, ChevronDown, XCircle, RotateCcw, AlertOctagon, Sliders, Trash2, Users } from "lucide-react";
import { publish } from "../utils/eventBus";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage, toast } from "../utils/notify";
import CreateTaskModal from "../components/CreateTaskModal";
import SubmitTaskModal from "../components/SubmitTaskModal";
import SubmitDeliverableModal from "../components/SubmitDeliverableModal"; // Added missing import
import SelfDeliverableViewModal from "../components/SelfDeliverableViewModal"; // Added missing import
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
import TransferTaskDialog from "../components/TransferTaskDialog";
import TaskNotesPopover from "../components/TaskNotesPopover";
import AddNoteModal from "../components/AddNoteModal";
import TaskMultiStatusBadges from "../components/TaskMultiStatusBadges";
import TaskFilterBar from "../components/TaskFilterBar";
import BulkActionsToolbar from "../components/BulkActionsToolbar";
import API_URL from "../config/api";
import { authToken, getUser, rolePath } from "../utils/auth";
import { renderDynamicDates } from "../utils/tableDateUtils";
import { formatDateTimeInline } from "../utils/formatDateTime";
import { getUpdatedSinceThreshold, matchStatusFilter, mutateStatusCounts, decrementStatusCount, incrementStatusCount } from "../utils/filterUtils";
import { isDelegationRejectedByMe, isDelegationRevokedFromMe, isDeliverableItem } from "../utils/delegationUtils";
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

/** Main Self Tasks page — renders tasks assigned by the current user to themselves. */
const SelfTasks = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [declineTaskItem, setDeclineTaskItem] = useState(null);
  const [declineTaskLoading, setDeclineTaskLoading] = useState(false);
  const [reopenTask, setReopenTask] = useState(null);
  const [abandonTask, setAbandonTask] = useState(null);
  const [markCompletedTask, setMarkCompletedTask] = useState(null);
  const [abandoning, setAbandoning] = useState(false);
  const [transferDialog, setTransferDialog] = useState({ open: false, task: null });
  const [items, setItems] = useState([]);
  const [apiCounts, setApiCounts] = useState(null);
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
  const [orderedItems, setOrderedItems] = useState([]);
  const [page, setPage] = useState(() => {
    const p = searchParams.get("page");
    return p ? Math.max(1, parseInt(p, 10) || 1) : 1;
  });
  const [showAll, setShowAll] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  const handleToggleBulkMode = useCallback(() => {
    setIsBulkMode((prev) => {
      if (prev) {
        setSelectedItems([]);
      }
      return !prev;
    });
  }, []);

  const handleToggleSelectItem = useCallback((id) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const handleBulkComplete = useCallback(() => {
    toast.info(t("Bulk action: Mark as completed triggered for {{count}} tasks.", { count: selectedItems.length, defaultValue: `Bulk action: Mark as completed triggered for ${selectedItems.length} tasks.` }));
    console.log("Bulk complete tasks:", selectedItems);
  }, [selectedItems, t]);

  const handleBulkDelete = useCallback(() => {
    toast.info(t("Bulk action: Delete triggered for {{count}} tasks.", { count: selectedItems.length, defaultValue: `Bulk action: Delete triggered for ${selectedItems.length} tasks.` }));
    console.log("Bulk delete tasks:", selectedItems);
  }, [selectedItems, t]);

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

  const selectStatusFilter = (filter) => {
    if (filter === statusFilter && filter === "") {
      setShowAll(!showAll);
    } else {
      setStatusFilter(filter);
      setShowAll(false);
      setPage(1);
      setAdvancedFilters((prev) => ({
        ...prev,
        statuses: [],
        status: [],
      }));
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (filter) {
          next.set("status", filter);
        } else {
          next.delete("status");
        }
        next.delete("statuses");
        next.delete("page");
        return next;
      });
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
    const item = items.find((i) => i.id === taskId);
    setItems((prev) =>
      prev.map((i) =>
        i.id === taskId
          ? { ...i, status: "submitted", ...updatedTask }
          : i
      )
    );
    setApiCounts((prev) => mutateStatusCounts(prev, item?.status, "submitted"));
    fetchTasks();
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

  const handleAcknowledge = async (e, taskOrId) => {
    const item = typeof taskOrId === 'object' && taskOrId !== null ? taskOrId : (typeof e === 'object' && e?.id ? e : null);
    const actualTaskId = item ? item.id : ((e && typeof e === 'object' && e.stopPropagation) ? taskOrId : (e || taskOrId));
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    const isDeliverable = Boolean(
      item?.entity_type === 'deliverable' ||
      item?.is_subtask ||
      item?.deliverable_number ||
      item?.subtask_number ||
      (item?.task_id && !item?.task_number)
    );
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
          prev.map((item) =>
            item.id === actualTaskId ? { ...item, status: "in_progress", ...updatedObj } : item
          )
        );
        setApiCounts((prev) => mutateStatusCounts(prev, item?.status, "in_progress"));
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

  const handleStartTimer = async (e, taskOrId) => {
    const item = typeof taskOrId === 'object' && taskOrId !== null ? taskOrId : (typeof e === 'object' && e?.id ? e : null);
    const actualTaskId = item ? item.id : ((e && typeof e === 'object' && e.stopPropagation) ? taskOrId : (e || taskOrId));
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    const isDeliverable = isDeliverableItem(item);
    const endpoint = isDeliverable ? `${API_URL}/deliverables/${actualTaskId}/start-timer` : `${API_URL}/tasks/${actualTaskId}/start-timer`;

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
            item.id === actualTaskId ? { ...item, status: "in_progress", timer_state: "running", timer: { ...(item.timer || {}), state: "running" }, ...updatedObj } : item
          )
        );
        setApiCounts((prev) => mutateStatusCounts(prev, item?.status, "in_progress"));
        fetchTasks();
        if (isDeliverable) {
          publish('deliverable:updated', { id: actualTaskId, status: 'in_progress', ...updatedObj });
          publish('data:changed', { type: 'deliverable', action: 'updated' });
          showSuccessMessage(t("Subtask", { defaultValue: "Subtask" }), t("timer started", { defaultValue: "timer started" }));
        } else {
          publish('task:updated', { id: actualTaskId, status: 'in_progress', ...updatedObj });
          publish('data:changed', { type: 'task', action: 'updated' });
          showSuccessMessage(t("Task", { defaultValue: "Task" }), t("timer started", { defaultValue: "timer started" }));
        }
      } else {
        const errorMsg = data?.message || data?.error || (data?.errors ? Object.values(data.errors).flat().join(", ") : null) || t("Failed to start timer.", { defaultValue: "Failed to start timer." });
        notify.error(errorMsg);
      }
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || t("Failed to start timer.", { defaultValue: "Failed to start timer." });
      notify.error(errorMsg);
    }
  };

  const handleContinue = async (e, taskOrId) => {
    const item = typeof taskOrId === 'object' && taskOrId !== null ? taskOrId : (typeof e === 'object' && e?.id ? e : null);
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
          prev.map((item) =>
            item.id === actualTaskId ? { ...item, status: "in_progress", assigner_paused: false, ...updatedObj } : item
          )
        );
        setApiCounts((prev) => mutateStatusCounts(prev, item?.status || "paused", "in_progress"));
        fetchTasks();
        if (isDeliverable) {
          publish('deliverable:updated', { id: actualTaskId, status: 'in_progress', ...updatedObj });
          publish('data:changed', { type: 'deliverable', action: 'updated' });
          showSuccessMessage(t("Subtask", { defaultValue: "Subtask" }), t("resumed", { defaultValue: "resumed" }));
        } else {
          publish('task:updated', { id: actualTaskId, status: 'in_progress', ...updatedObj });
          publish('data:changed', { type: 'task', action: 'updated' });
          showSuccessMessage(t("Task", { defaultValue: "Task" }), t("resumed", { defaultValue: "resumed" }));
        }
      } else {
        const errorMsg = data?.message || data?.error || (data?.errors ? Object.values(data.errors).flat().join(", ") : null) || t("Failed to continue task.", { defaultValue: "Failed to continue task." });
        notify.error(errorMsg);
      }
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || t("Failed to continue task.", { defaultValue: "Failed to continue task." });
      notify.error(errorMsg);
    }
  };

  const handlePause = async (taskOrId, data = {}) => {
    const item = typeof taskOrId === 'object' && taskOrId !== null ? taskOrId : (items.find(i => String(i.id) === String(taskOrId)) || null);
    const actualTaskId = item ? item.id : taskOrId;
    const isDeliverable = isDeliverableItem(item);
    const endpoint = isDeliverable ? `${API_URL}/deliverables/${actualTaskId}/pause` : `${API_URL}/tasks/${actualTaskId}/pause`;

    try {
      const token = authToken();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ reason: data.reason || "other", reason_detail: data.reason_detail || "Paused from task list" }),
        _notifHandled: true,
      });
      const resData = await res.json().catch(() => ({}));
      if (res.ok) {
        const updatedObj = resData.deliverable || resData.task || {};
        setItems((prev) =>
          prev.map((item) =>
            item.id === actualTaskId ? { ...item, status: "paused", ...updatedObj } : item
          )
        );
        setApiCounts((prev) => mutateStatusCounts(prev, item?.status || "pending", "paused"));
        fetchTasks();
        if (isDeliverable) {
          publish('deliverable:updated', { id: actualTaskId, status: 'paused', ...updatedObj });
          publish('data:changed', { type: 'deliverable', action: 'updated' });
          showSuccessMessage(t("Subtask", { defaultValue: "Subtask" }), t("paused", { defaultValue: "paused" }));
        } else {
          publish('task:updated', { id: actualTaskId, status: 'paused', ...updatedObj });
          publish('data:changed', { type: 'task', action: 'updated' });
          showSuccessMessage(t("Task", { defaultValue: "Task" }), t("paused", { defaultValue: "paused" }));
        }
      } else {
        notify.error(resData?.message || resData?.error || t("Failed to pause.", { defaultValue: "Failed to pause." }));
      }
    } catch {
      notify.error(t("Failed to pause.", { defaultValue: "Failed to pause." }));
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
        setApiCounts((prev) => mutateStatusCounts(prev, item?.status, "completed"));
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
            item.id === taskId ? { ...item, status: "rejected", ...updatedObj } : item
          )
        );
        setApiCounts((prev) => mutateStatusCounts(prev, task?.status, "declined"));
        fetchTasks();
        if (isDeliverable) {
          publish('deliverable:updated', { id: taskId, status: 'rejected', ...updatedObj });
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
        setApiCounts((prev) => mutateStatusCounts(prev, abandonTask?.status, "abandoned"));
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
        item.id === taskId ? { ...item, status: "reopened", ...(updatedTask || {}) } : item
      )
    );
    setApiCounts((prev) => mutateStatusCounts(prev, taskItem?.status, "reopened"));
    fetchTasks();
    if (isDeliverable) {
      publish('deliverable:updated', { id: taskId, status: 'reopened', ...(updatedTask || {}) });
      publish('data:changed', { type: 'deliverable', action: 'updated' });
      showSuccessMessage(t("Subtask", { defaultValue: "Subtask" }), t("reopened", { defaultValue: "reopened" }));
    } else {
      publish('task:updated', { id: taskId, status: 'reopened', ...(updatedTask || {}) });
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
    setApiCounts((prev) => mutateStatusCounts(prev, taskItem?.status, "completed"));
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
    const item = items.find((i) => i.id === taskId);
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
        setOrderedItems((prev) => prev.filter((item) => String(item.id) !== String(taskId)));
        setApiCounts((prev) => decrementStatusCount(prev, item?.status));
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

      const rawCreator = advancedFilters.created_by || advancedFilters.creator_ids || advancedFilters.assigned_by || [];
      const creatorList = (Array.isArray(rawCreator) ? rawCreator : [rawCreator]).map(Number).filter(Boolean);
      if (creatorList.length > 0) {
        creatorList.forEach((cr) => {
          params.append("created_by[]", cr);
          params.append("creator_ids[]", cr);
          params.append("assigned_by[]", cr);
        });
        params.append("created_by", creatorList.join(","));
        params.append("creator_ids", creatorList.join(","));
        params.append("assigned_by", creatorList.join(","));
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

      fetch(`${API_URL}/self-tasks?${params.toString()}`, {
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

  useAutoRefresh(fetchTasks, {
    events: ['task:created', 'task:updated', 'task:deleted', 'data:changed'],
  });

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  const baseItems = orderedItems.length ? orderedItems : items;

  const getItemStatus = useCallback((item) => {
    if (!item) return "pending";
    if (item?.assigner_paused) return "paused";
    return item?.status || "pending";
  }, []);

  const preStatusFilteredItems = useMemo(() => {
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
  }, [baseItems, advancedFilters.priority, advancedFilters.priorities, advancedFilters.updated_since, advancedFilters.updated_since_value, advancedFilters.updated_since_unit]);

  // Single-pass status counts
  const clientCounts = useMemo(() => {
    const counts = {
      all: 0,
      dueToday: 0,
      due_today: 0,
      pending: 0,
      inProgress: 0,
      in_progress: 0,
      paused: 0,
      submitted: 0,
      completed: 0,
      approved: 0,
      declined: 0,
      rejected: 0,
      abandoned: 0,
      reopened: 0,
      transferred: 0,
    };
    const now = new Date();
    const todayY = now.getFullYear();
    const todayM = now.getMonth();
    const todayD = now.getDate();

    for (let idx = 0; idx < preStatusFilteredItems.length; idx++) {
      const item = preStatusFilteredItems[idx];
      if (!item) continue;
      counts.all++;

      const st = getItemStatus(item);

      if (matchStatusFilter(st, ["pending"])) counts.pending++;
      if (matchStatusFilter(st, ["in_progress"])) {
        counts.inProgress++;
        counts.in_progress++;
      }
      if (matchStatusFilter(st, ["paused"])) counts.paused++;
      if (matchStatusFilter(st, ["submitted"])) counts.submitted++;
      if (matchStatusFilter(st, ["completed"])) {
        counts.completed++;
        counts.approved++;
      }
      if (matchStatusFilter(st, ["declined"])) {
        counts.declined++;
        counts.rejected++;
      }
      if (matchStatusFilter(st, ["abandoned"])) counts.abandoned++;
      if (matchStatusFilter(st, ["reopened"]) || item.is_reopened || item.reopened_at) counts.reopened++;
      if (item.delegation_chain && item.delegation_chain.length > 0) counts.transferred++;

      const dateVal = item.end_date || item.due_date || item.start_date;
      if (dateVal) {
        const d = new Date(dateVal);
        if (d.getFullYear() === todayY && d.getMonth() === todayM && d.getDate() === todayD) {
          if (!matchStatusFilter(st, ["completed", "abandoned"])) {
            counts.dueToday++;
            counts.due_today++;
          }
        }
      }
    }
    return counts;
  }, [preStatusFilteredItems, getItemStatus]);

  const allCount = apiCounts?.all ?? clientCounts.all;
  const pendingCount = apiCounts?.pending ?? clientCounts.pending;
  const inProgressCount = (apiCounts?.in_progress ?? apiCounts?.inProgress) ?? clientCounts.inProgress;
  const pausedCount = apiCounts?.paused ?? clientCounts.paused;
  const submittedCount = apiCounts?.submitted ?? clientCounts.submitted;
  const completedCount = (apiCounts?.completed ?? apiCounts?.approved) ?? clientCounts.completed;
  const approvedCount = completedCount;
  const declinedCount = (apiCounts?.declined ?? apiCounts?.rejected) ?? clientCounts.declined;
  const rejectedCount = declinedCount;
  const abandonedCount = apiCounts?.abandoned ?? clientCounts.abandoned;
  const reopenedCount = apiCounts?.reopened ?? clientCounts.reopened;
  const dueTodayCount = (apiCounts?.due_today ?? apiCounts?.dueToday) ?? clientCounts.dueToday;
  const transferredCount = apiCounts?.transferred ?? clientCounts.transferred;

  const filteredItems = useMemo(() => {
    let list = preStatusFilteredItems;

    const selectedStatuses = Array.isArray(advancedFilters.statuses) && advancedFilters.statuses.length > 0
      ? advancedFilters.statuses
      : (Array.isArray(advancedFilters.status) && advancedFilters.status.length > 0 ? advancedFilters.status : []);

    // If top status badge is actively selected, it takes precedence and overrides dropdown checkboxes
    if (statusFilter && statusFilter !== "") {
      const sf = String(statusFilter).toLowerCase();
      if (sf === "due_today") {
        list = list.filter((item) => {
          const dateVal = item.end_date || item.due_date || item.start_date;
          if (!dateVal) return false;
          const d = new Date(dateVal);
          const now = new Date();
          const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
          const isCompletedOrAbandoned = matchStatusFilter(getItemStatus(item), ["completed", "abandoned"]);
          return isToday && !isCompletedOrAbandoned;
        });
      } else if (sf === "transferred") {
        list = list.filter((item) => item?.delegation_chain && item.delegation_chain.length > 0);
      } else {
        list = list.filter((item) => matchStatusFilter(getItemStatus(item), [sf]));
      }
    } else if (selectedStatuses.length > 0) {
      list = list.filter((item) => matchStatusFilter(getItemStatus(item), selectedStatuses));
    }

    return list;
  }, [preStatusFilteredItems, statusFilter, advancedFilters.statuses, advancedFilters.status, getItemStatus]);

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
          { id: "completed", label: t("Completed", { defaultValue: "Completed" }), count: completedCount, className: "Approved" },
          { id: "paused", label: t("Paused", { defaultValue: "Paused" }), count: pausedCount, className: "Paused" },
          { id: "declined", label: t("Declined", { defaultValue: "Declined" }), count: declinedCount, className: "Rejected" },
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
            if (key === "statuses" || key === "status") {
              updated.statuses = val;
              updated.status = val;
              if (Array.isArray(val) && val.length > 0) {
                setStatusFilter("");
              }
            }
            if (key === "created_by" || key === "creator_ids" || key === "assigned_by") {
              const cleaned = (Array.isArray(val) ? val : [val]).map(Number).filter(Boolean);
              updated.created_by = cleaned;
              updated.creator_ids = cleaned;
              updated.assigned_by = cleaned;
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
          const appliedCreator = (appliedFilters?.created_by || appliedFilters?.creator_ids || appliedFilters?.assigned_by || []).map(Number).filter(Boolean);
          setAdvancedFilters((prev) => ({
            ...prev,
            statuses: appliedFilters?.statuses || appliedFilters?.status || [],
            states: appliedFilters?.states || [],
            due_states: appliedFilters?.due_states || [],
            priority: appliedFilters?.priority || appliedFilters?.priorities || [],
            user_id: appliedFilters?.user_id || appliedFilters?.assigned_to || [],
            project_id: appliedFilters?.project_id || [],
            created_by: appliedCreator,
            creator_ids: appliedCreator,
            assigned_by: appliedCreator,
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
        isBulkMode={isBulkMode}
        onToggleBulkMode={handleToggleBulkMode}
      />

      <div className="container">
        <div className={`table-header-compact ${isBulkMode ? "bulk-mode" : ""}`}>
          {isBulkMode && (
            <div className="col-bulk-check">
              <input
                type="checkbox"
                checked={paginatedItems.length > 0 && paginatedItems.every((i) => selectedItems.includes(i.id))}
                ref={(el) => {
                  if (el) {
                    const hasSome = paginatedItems.some((i) => selectedItems.includes(i.id));
                    const hasAll = paginatedItems.length > 0 && paginatedItems.every((i) => selectedItems.includes(i.id));
                    el.indeterminate = hasSome && !hasAll;
                  }
                }}
                onChange={() => {
                  const pageIds = paginatedItems.map((i) => i.id);
                  const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedItems.includes(id));
                  if (allSelected) {
                    setSelectedItems((prev) => prev.filter((id) => !pageIds.includes(id)));
                  } else {
                    setSelectedItems((prev) => Array.from(new Set([...prev, ...pageIds])));
                  }
                }}
                aria-label={t("Select All", { defaultValue: "Select All" })}
              />
            </div>
          )}
          <div style={{ fontSize: 12, fontWeight: 600 }}>{t("ID", { defaultValue: "ID" })}</div>
          <div style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("title")}>
            {t("Task Name", { defaultValue: "Task Name" })}
          </div>
          <div style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("status")}>
            {t("Status", { defaultValue: "Status" })}
          </div>
          <div>{t("Personal Notes", { defaultValue: "Personal Notes" })}</div>
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
              const isRejectedByMe = isDelegationRejectedByMe(item, currentUser);
              const isRevokedFromMe = isDelegationRevokedFromMe(item, currentUser);
              const isInactiveForMe = isRejectedByMe || isRevokedFromMe;
              const hasRejectedDelegation = Array.isArray(item.delegation_chain) && item.delegation_chain.some((d) => String(d.status).toLowerCase() === "rejected");
              const hasRevokedDelegation = Array.isArray(item.delegation_chain) && item.delegation_chain.some((d) => String(d.status).toLowerCase() === "revoked");

              return (
                <div
                  className={`taskby-row-compact ${isBulkMode ? "bulk-mode" : ""} ${isInactiveForMe ? "delegation-rejected-row" : ""} ${selectedItems.includes(item.id) ? "row-selected" : ""}`}
                  key={item.sortableId}
                  style={isInactiveForMe ? { opacity: 0.88 } : undefined}
                >
                  {isBulkMode && (
                    <div className="col-bulk-check" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleToggleSelectItem(item.id);
                        }}
                        aria-label={`Select task ${item.id}`}
                      />
                    </div>
                  )}
                  <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} id={item.id} businessId={item.business_id} />
                  <div>
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
                            {t("Transfer Rejected", { defaultValue: "Transfer Rejected" })}
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
                  </div>
                  <div className="col-status">
                    <TaskMultiStatusBadges item={item} />
                  </div>
                  <div className="col-notes">
                    <TaskNotesPopover taskId={item.id} itemType={item.item_type === "subtask" ? "deliverable" : "task"} />
                  </div>
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
                      title={isDeliverableItem(item) ? t("View Subtask", { defaultValue: "View Subtask" }) : t("View Task", { defaultValue: "View Task" })}
                      onClick={() => {
                        const isDeliv = isDeliverableItem(item);
                        const currentSearch = location.search || (page > 1 ? `?page=${page}` : "");
                        const returnUrl = `${location.pathname}${currentSearch}`;
                        if (isDeliv) {
                          navigate(rolePath(`deliveries/deliverable-details/${item.id}`), { state: { deliverableIds: taskIdList, from: 'self-tasks', page, returnUrl } });
                        } else {
                          const targetId = item.id;
                          navigate(rolePath(`tasks/task-details/${targetId}`), { state: { taskIds: taskIdList, from: 'self-tasks', page, returnUrl } });
                        }
                      }}
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
                                title={isDeliverableItem(item) ? t("Approve Subtask", { defaultValue: "Approve Subtask" }) : t("Approve Task", { defaultValue: "Approve Task" })}
                                style={{ color: "#16A34A" }}
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
                        const canTrack = !item.assigner_paused;
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
                                  title={!isDeliverableItem(item) && item.pending_deliverables_count > 0 ? t("Submit all subtasks first", { defaultValue: "Submit all subtasks first" }) : (isDeliverableItem(item) ? t("Submit Subtask", { defaultValue: "Submit Subtask" }) : t("Submit Task", { defaultValue: "Submit Task" }))} 
                                  disabled={!isDeliverableItem(item) && item.pending_deliverables_count > 0} 
                                  onClick={(e) => { e.stopPropagation(); (isDeliverableItem(item) || !item.pending_deliverables_count) && setSubmitTaskModal({ open: true, task: item }); }} 
                                  style={!isDeliverableItem(item) && item.pending_deliverables_count > 0 ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                                >
                                  <LuSend size={16} />
                                </button>
                              </div>
                            )}
                          </>
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
                      <button
                        className="action-icon-btn action-delete"
                        title={isDeliverableItem(item) ? t("Delete Subtask", { defaultValue: "Delete Subtask" }) : t("Delete Task", { defaultValue: "Delete Task" })}
                        onClick={(e) => handleDelete(e, item)}
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

      {transferDialog.open && (
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

      {isBulkMode && (
        <BulkActionsToolbar
          selectedCount={selectedItems.length}
          activeTab={statusFilter || "All"}
          onComplete={handleBulkComplete}
          onDelete={handleBulkDelete}
          onDeselectAll={() => setSelectedItems([])}
          onCancel={() => {
            setIsBulkMode(false);
            setSelectedItems([]);
          }}
        />
      )}
    </DashboardLayout>
  );
};

export default SelfTasks;