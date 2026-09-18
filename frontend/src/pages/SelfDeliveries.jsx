/**
 * SelfDeliveries page component.
 *
 * Lists subtasks that the current user has assigned to themselves.
 * Provides search, status filtering (draft, submitted, rework required,
 * approved), time-range filtering, drag-and-drop reordering and pagination.
 * Submit and view actions open modals for the selected subtask.
 */

import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import DraggableStatusBadges from "../components/DraggableStatusBadges";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { GoDotFill } from "react-icons/go";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";
import {
  ArrowUpRight,
  Pause,
  Play,
  Lock,
  StickyNote,
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertOctagon,
  Users,
  Pencil,
  Trash2,
} from "lucide-react";
import { authToken, getUser, rolePath } from "../utils/auth";
import { renderDynamicDates } from "../utils/tableDateUtils";
import { isDelegationRejectedByMe, isDelegationRevokedFromMe } from "../utils/delegationUtils";
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import SmartDragHandle from "../components/SmartDragHandle";
import Pagination from "../components/Pagination";
import ActionPopover from "../components/ActionPopover";
import AddNoteModal from "../components/AddNoteModal";
import API_URL from "../config/api";
import { publish } from "../utils/eventBus";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage } from "../utils/notify";
import SubmitDeliverableModal from "../components/SubmitDeliverableModal";
import CreateDeliverableModel from "../components/layout/CreateDeliverableModel";
import TaskMultiStatusBadges from "../components/TaskMultiStatusBadges";
import TaskFilterBar from "../components/TaskFilterBar";
import ConfirmModal from "../components/ConfirmModal";
import DeclineModal from "../components/DeclineModal";
import PauseReasonModal from "../components/PauseReasonModal";
import ReopenDialog from "../components/ReopenDialog";
import AbandonModal from "../components/AbandonModal";
import MarkTaskCompletedModal from "../components/MarkTaskCompletedModal";
import TransferTaskDialog from "../components/TransferTaskDialog";
import { formatDateTimeInline } from "../utils/formatDateTime";
import { getUpdatedSinceThreshold, matchStatusFilter } from "../utils/filterUtils";
import "../components/ActionPopover.css";
import "../pages/Deliveries.css";
import "../pages/Task.css";

const STATUS_COLORS = {
  pending: "#FEF3C7",
  in_progress: "#DBEAFE",
  paused: "#FFEDD5",
  submitted: "#DBEAFE",
  reopened: "#EDE9FE",
  approved: "#DCFCE7",
  rejected: "#FEE2E2",
  rework_required: "#FEF3C7",
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
  rework_required: "#92400E",
  abandon_requested: "#92400E",
  abandoned: "#991B1B",
};

/** Main Self Subtasks page — fetches and renders the user's own subtasks. */
function SelfDeliveries() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const notify = useNotification();
  const [subtasks, setSubtasks] = useState([]);
  const [orderedSubtasks, setOrderedSubtasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => {
    const status = searchParams.get("status");
    if (status) return status;
    return "";
  });
  const [timeFilter, setTimeFilter] = useState("");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [advancedFilters, setAdvancedFilters] = useState({
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
  const [submitModal, setSubmitModal] = useState({ open: false, subtask: null });
  const [noteModal, setNoteModal] = useState({ open: false, itemId: null });
  const [transferDialog, setTransferDialog] = useState({ open: false, subtask: null });
  const [editingSubtask, setEditingSubtask] = useState(null);
  const [reopenSubtask, setReopenSubtask] = useState(null);
  const [declineSubtask, setDeclineSubtask] = useState(null);
  const [declineSubtaskLoading, setDeclineSubtaskLoading] = useState(false);
  const [abandonSubtask, setAbandonSubtask] = useState(null);
  const [abandonSubtaskLoading, setAbandonSubtaskLoading] = useState(false);
  const [markCompletedSubtask, setMarkCompletedSubtask] = useState(null);
  const [assignerPauseSubtask, setAssignerPauseSubtask] = useState(null);
  const [deleteSubtaskTargetId, setDeleteSubtaskTargetId] = useState(null);
  const [deleteSubtaskConfirmOpen, setDeleteSubtaskConfirmOpen] = useState(false);
  const [resumeConfirmOpen, setResumeConfirmOpen] = useState(false);
  const [resumeSubtaskItem, setResumeSubtaskItem] = useState(null);
  const [startTimerConfirmOpen, setStartTimerConfirmOpen] = useState(false);
  const [startTimerSubtaskItem, setStartTimerSubtaskItem] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [page, setPage] = useState(() => {
    const p = searchParams.get("page");
    return p ? Math.max(1, parseInt(p, 10) || 1) : 1;
  });
  const [showAll, setShowAll] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [actingType, setActingType] = useState(null);
  const [perPage, setPerPage] = useState(10);
  const ITEMS_PER_PAGE = perPage;

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

  useEffect(() => {
    setOrderedSubtasks(subtasks);
  }, [subtasks]);

  useEffect(() => {
    const status = searchParams.get("status") || "";
    setStatusFilter(status);
  }, [searchParams]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /** Fetch self-assigned subtasks from the API with current filters. */
  const fetchSubtasks = () => {
    setLoading(true);
    const token = authToken();
    const params = new URLSearchParams();
    if (debouncedSearch) params.append("search", debouncedSearch);
    if (timeFilter && timeFilter !== "custom") {
      params.append("time_filter", timeFilter);
    } else if (timeFilter === "custom") {
      params.append("time_filter", "custom");
      if (customStartDate) params.append("start_date", customStartDate);
      if (customEndDate) params.append("end_date", customEndDate);
    }
    if (advancedFilters.user_id && advancedFilters.user_id.length > 0) {
      params.append("user_id", Array.isArray(advancedFilters.user_id) ? advancedFilters.user_id.join(",") : advancedFilters.user_id);
    }
    if (advancedFilters.project_id && advancedFilters.project_id.length > 0) {
      params.append("project_id", Array.isArray(advancedFilters.project_id) ? advancedFilters.project_id.join(",") : advancedFilters.project_id);
    }
    const statusVal = advancedFilters.statuses?.length ? advancedFilters.statuses : advancedFilters.status;
    if (statusVal && statusVal.length > 0) {
      const stArr = Array.isArray(statusVal) ? statusVal : [statusVal];
      stArr.forEach((st) => params.append("statuses[]", st));
      params.append("status", stArr.join(","));
    }
    if (advancedFilters.priority && advancedFilters.priority.length > 0) {
      params.append("priority", Array.isArray(advancedFilters.priority) ? advancedFilters.priority.join(",") : advancedFilters.priority);
    }
    if (advancedFilters.due_states && advancedFilters.due_states.length > 0) {
      params.append("due_states", Array.isArray(advancedFilters.due_states) ? advancedFilters.due_states.join(",") : advancedFilters.due_states);
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

    fetch(`${API_URL}/self-deliverables?${params.toString()}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => {
        let raw = data?.data;
        if (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray(raw.data)) {
          raw = raw.data;
        }
        if (!Array.isArray(raw)) {
          raw = Array.isArray(data?.deliverables) ? data.deliverables : (Array.isArray(data) ? data : []);
        }
        setSubtasks(raw);
      })
      .catch(() => setSubtasks([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSubtasks();
  }, [debouncedSearch, timeFilter, advancedFilters]);

  useAutoRefresh(fetchSubtasks, { events: ['deliverable:updated', 'deliverable:created', 'deliverable:deleted', 'data:changed'] });

  const selectStatusFilter = (filter) => {
    if (filter === statusFilter && filter === "") {
      setShowAll(!showAll);
    } else {
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

  const handleSubtaskReorder = useCallback((reordered) => {
    setOrderedSubtasks(reordered);
    const token = authToken();
    const payload = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
    fetch(`${API_URL}/deliverables/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items: payload }),
      _notifHandled: true,
    }).catch(() => {});
  }, []);

  const handlePause = async (itemId) => {
    setActingId(itemId);
    setActingType("pause");
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${itemId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: "other" }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setSubtasks((prev) => prev.map((d) => d.id === itemId ? { ...d, status: "paused", ...data.deliverable } : d));
        fetchSubtasks();
        publish('deliverable:updated', { id: itemId, status: 'paused' });
        publish('data:changed', { type: 'deliverable', action: 'updated' });
        showSuccessMessage("Subtask", "paused");
      } else {
        notify.error(data.message || t("Failed to pause.", { defaultValue: "Failed to pause." }));
      }
    } catch {
      notify.error(t("Failed to pause.", { defaultValue: "Failed to pause." }));
    } finally {
      setActingId(null);
      setActingType(null);
    }
  };

  const handleResume = async (itemId) => {
    setActingId(itemId);
    setActingType("resume");
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${itemId}/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setSubtasks((prev) => prev.map((d) => d.id === itemId ? { ...d, status: "in_progress", assigner_paused: false, ...data.deliverable } : d));
        fetchSubtasks();
        publish('deliverable:updated', { id: itemId, status: 'in_progress' });
        publish('data:changed', { type: 'deliverable', action: 'updated' });
        showSuccessMessage("Subtask", "resumed");
      } else {
        notify.error(data.message || t("Failed to resume.", { defaultValue: "Failed to resume." }));
      }
    } catch {
      notify.error(t("Failed to resume.", { defaultValue: "Failed to resume." }));
    } finally {
      setActingId(null);
      setActingType(null);
    }
  };

  const handleAcknowledge = async (itemId) => {
    setActingId(itemId);
    setActingType("acknowledge");
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${itemId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setSubtasks((prev) => Array.isArray(prev) ? prev.map((d) => d.id === itemId ? { ...d, status: "in_progress", ...data.deliverable } : d) : []);
        fetchSubtasks();
        publish('deliverable:updated', { id: itemId, status: 'in_progress' });
        publish('data:changed', { type: 'deliverable', action: 'updated' });
        showSuccessMessage("Subtask", "acknowledged");
      } else {
        notify.error(data.message || t("Failed to acknowledge.", { defaultValue: "Failed to acknowledge." }));
      }
    } catch {
      notify.error(t("Failed to acknowledge.", { defaultValue: "Failed to acknowledge." }));
    } finally {
      setActingId(null);
      setActingType(null);
    }
  };

  const handleStartTimer = async (itemId) => {
    setActingId(itemId);
    setActingType("start-timer");
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${itemId}/start-timer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setSubtasks((prev) => Array.isArray(prev) ? prev.map((d) => d.id === itemId ? { ...d, status: "in_progress", timer_state: "running", timer: { ...(d.timer || {}), state: "running" }, ...data.deliverable } : d) : []);
        fetchSubtasks();
        publish('deliverable:updated', { id: itemId, status: 'in_progress' });
        publish('data:changed', { type: 'deliverable', action: 'updated' });
        showSuccessMessage("Subtask", "timer started");
      } else {
        notify.error(data.message || t("Failed to start timer.", { defaultValue: "Failed to start timer." }));
      }
    } catch {
      notify.error(t("Failed to start timer.", { defaultValue: "Failed to start timer." }));
    } finally {
      setActingId(null);
      setActingType(null);
    }
  };

  const handleApprove = async (itemId) => {
    setActingId(itemId);
    setActingType("approve");
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${itemId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setSubtasks((prev) => Array.isArray(prev) ? prev.map((d) => d.id === itemId ? { ...d, status: "approved", ...data.deliverable } : d) : []);
        fetchSubtasks();
        publish('deliverable:updated', { id: itemId, status: 'approved' });
        publish('data:changed', { type: 'deliverable', action: 'updated' });
        showSuccessMessage("Subtask", "approved");
      } else {
        notify.error(data.message || t("Failed to approve.", { defaultValue: "Failed to approve." }));
      }
    } catch {
      notify.error(t("Failed to approve.", { defaultValue: "Failed to approve." }));
    } finally {
      setActingId(null);
      setActingType(null);
    }
  };

  const handleReject = async (itemId, comment) => {
    setActingId(itemId);
    setActingType("reject");
    setDeclineSubtaskLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${itemId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ comment }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setSubtasks((prev) => Array.isArray(prev) ? prev.map((d) => d.id === itemId ? { ...d, status: "declined", ...data.deliverable } : d) : []);
        fetchSubtasks();
        publish('deliverable:updated', { id: itemId, status: 'declined' });
        publish('data:changed', { type: 'deliverable', action: 'updated' });
        showSuccessMessage("Subtask", "declined");
        setDeclineSubtask(null);
      } else {
        notify.error(data.message || t("Failed to decline.", { defaultValue: "Failed to decline." }));
      }
    } catch {
      notify.error(t("Failed to decline.", { defaultValue: "Failed to decline." }));
    } finally {
      setActingId(null);
      setActingType(null);
      setDeclineSubtaskLoading(false);
    }
  };

  const handleAssignerPauseSubmit = async (data) => {
    if (!assignerPauseSubtask?.id) return;
    const subtaskId = assignerPauseSubtask.id;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${subtaskId}/assigner-pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: data.reason_detail || data.reason }),
        _notifHandled: true,
      });
      const resData = await res.json();
      if (res.ok) {
        const updated = resData.deliverable || resData.subtask || resData;
        setSubtasks((prev) => Array.isArray(prev) ? prev.map((d) => d.id === subtaskId ? { ...d, assigner_paused: true, ...updated } : d) : []);
        fetchSubtasks();
        publish('deliverable:updated', updated);
        publish('data:changed', { type: 'deliverable', action: 'updated' });
        showSuccessMessage("Subtask", "paused");
        setAssignerPauseSubtask(null);
      } else {
        notify.error(resData.message || t("Failed to pause subtask.", { defaultValue: "Failed to pause subtask." }));
      }
    } catch {
      notify.error(t("Failed to pause subtask.", { defaultValue: "Failed to pause subtask." }));
    }
  };

  const handleAssignerResume = async (subtaskId) => {
    setActingId(subtaskId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${subtaskId}/assigner-resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        const updated = data.deliverable || data.subtask || data;
        setSubtasks((prev) => Array.isArray(prev) ? prev.map((d) => d.id === subtaskId ? { ...d, assigner_paused: false, ...updated } : d) : []);
        fetchSubtasks();
        publish('deliverable:updated', updated);
        publish('data:changed', { type: 'deliverable', action: 'updated' });
        showSuccessMessage("Subtask", "resumed");
      } else {
        notify.error(data.message || t("Failed to resume subtask.", { defaultValue: "Failed to resume subtask." }));
      }
    } catch {
      notify.error(t("Failed to resume subtask.", { defaultValue: "Failed to resume subtask." }));
    } finally {
      setActingId(null);
    }
  };

  const handleConfirmResume = async () => {
    if (!resumeSubtaskItem) return;
    const item = resumeSubtaskItem;
    setResumeConfirmOpen(false);
    setResumeSubtaskItem(null);
    if (item.assigner_paused) {
      await handleAssignerResume(item.id);
    } else {
      await handleResume(item.id);
    }
  };

  const handleAbandon = async (reason) => {
    if (!abandonSubtask?.id) return;
    setAbandonSubtaskLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${abandonSubtask.id}/abandon`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        const updated = data.deliverable || data;
        setSubtasks((prev) => Array.isArray(prev) ? prev.map((d) => d.id === abandonSubtask.id ? { ...d, ...updated } : d) : []);
        fetchSubtasks();
        publish('deliverable:updated', updated);
        publish('data:changed', { type: 'deliverable', action: 'updated' });
        showSuccessMessage("Subtask", "abandoned");
        setAbandonSubtask(null);
      } else {
        notify.error(data.message || t("Failed to abandon subtask.", { defaultValue: "Failed to abandon subtask." }));
      }
    } catch {
      notify.error(t("An error occurred. Please try again.", { defaultValue: "An error occurred. Please try again." }));
    } finally {
      setAbandonSubtaskLoading(false);
    }
  };

  const handleDelete = (itemId) => {
    setDeleteSubtaskTargetId(itemId);
    setDeleteSubtaskConfirmOpen(true);
  };

  const confirmDelete = async () => {
    const subtaskId = deleteSubtaskTargetId;
    setDeleteSubtaskConfirmOpen(false);
    setDeleteSubtaskTargetId(null);
    setActingId(subtaskId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${subtaskId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      if (res.ok) {
        setSubtasks((prev) => Array.isArray(prev) ? prev.filter((d) => d.id !== subtaskId) : []);
        fetchSubtasks();
        publish('deliverable:deleted', { id: subtaskId });
        publish('data:changed', { type: 'deliverable', action: 'deleted' });
        showSuccessMessage("Subtask", "deleted");
      } else {
        const data = await res.json();
        notify.error(data.message || t("Failed to delete subtask.", { defaultValue: "Failed to delete subtask." }));
      }
    } catch {
      notify.error(t("Failed to delete subtask.", { defaultValue: "Failed to delete subtask." }));
    } finally {
      setActingId(null);
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
      rework_required: "Rework Required",
      abandon_requested: "Abandon Requested",
      abandoned: "Abandoned",
    };
    const label = map[status] || status;
    return t(label, { defaultValue: label });
  };

  const handleSubtaskUpdate = (updatedSubtask) => {
    setSubtasks((prev) =>
      Array.isArray(prev)
        ? prev.map((d) => (d.id === updatedSubtask.id ? { ...d, ...updatedSubtask } : d))
        : []
    );
  };

  const handleSubmissionSuccess = (updatedSubtask) => {
    setSubtasks((prev) =>
      Array.isArray(prev)
        ? prev.map((d) =>
            d.id === updatedSubtask.id
              ? { ...d, status: "submitted", has_submitted: true, ...updatedSubtask }
              : d
          )
        : []
    );
  };

  const safeSubtasks = Array.isArray(subtasks) ? subtasks : [];
  const safeOrderedSubtasks = Array.isArray(orderedSubtasks) ? orderedSubtasks : [];
  const displayItems = safeOrderedSubtasks.length ? safeOrderedSubtasks : safeSubtasks;
  const currentUser = getUser();
  const canCreateSubtask = currentUser && ["admin", "manager", "team_lead"].includes(currentUser.role);

  const pendingStatuses = ["pending", "planned", "Planning", "Planned"];
  const inProgressStatuses = ["in_progress", "In Progress", "In-progress"];

  const allCount = displayItems.length;
  const dueTodayCount = displayItems.filter((i) => {
    if (!i || !i.due_date) return false;
    const d = new Date(i.due_date);
    return !isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
  }).length;
  const pendingCount = displayItems.filter((i) => i && pendingStatuses.includes(i.status)).length;
  const inProgressCount = displayItems.filter((i) => i && inProgressStatuses.includes(i.status)).length;
  const pausedCount = displayItems.filter((i) => i && i.status === "paused").length;
  const submittedCount = displayItems.filter((i) => i && i.status === "submitted").length;
  const reopenedCount = displayItems.filter((i) => i && i.status === "reopened").length;
  const transferredCount = displayItems.filter((i) => i && Array.isArray(i.delegation_chain) && i.delegation_chain.length > 0).length;
  const approvedCount = displayItems.filter((i) => i && i.status === "approved").length;
  const rejectedCount = displayItems.filter((i) => i && i.status === "rejected").length;
  const reworkRequiredCount = displayItems.filter((i) => i && i.status === "rework_required").length;

  const searchFilteredItems = useMemo(() => {
    let list = displayItems;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((item) => {
        if (!item) return false;
        const titleMatch = (item.title || "").toLowerCase().includes(q);
        const assigneeMatch = (item.assignee?.name || "").toLowerCase().includes(q);
        const taskMatch = (item.task?.title || "").toLowerCase().includes(q);
        const projectMatch = (item.project?.title || item.task?.project?.title || "").toLowerCase().includes(q);
        return titleMatch || assigneeMatch || taskMatch || projectMatch;
      });
    }
    if (advancedFilters.user_id && advancedFilters.user_id.length > 0) {
      const uids = (Array.isArray(advancedFilters.user_id) ? advancedFilters.user_id : [advancedFilters.user_id]).map(Number);
      list = list.filter((item) => {
        if (!item) return false;
        const aid = Number(item.assigned_to || item.assignee?.id);
        const cid = Number(item.created_by || item.creator?.id);
        return uids.includes(aid) || uids.includes(cid);
      });
    }
    if (advancedFilters.project_id && advancedFilters.project_id.length > 0) {
      const pids = (Array.isArray(advancedFilters.project_id) ? advancedFilters.project_id : [advancedFilters.project_id]).map(Number);
      list = list.filter((item) => {
        if (!item) return false;
        const pid = Number(item.project_id || item.project?.id || item.task?.project_id || item.task?.project?.id);
        return pids.includes(pid);
      });
    }
    const selectedStatuses = Array.isArray(advancedFilters.statuses) && advancedFilters.statuses.length > 0
      ? advancedFilters.statuses
      : (Array.isArray(advancedFilters.status) && advancedFilters.status.length > 0 ? advancedFilters.status : []);

    if (selectedStatuses.length > 0) {
      list = list.filter((item) => matchStatusFilter(item?.status, selectedStatuses));
    }
    if (advancedFilters.priority && advancedFilters.priority.length > 0) {
      const prios = (Array.isArray(advancedFilters.priority) ? advancedFilters.priority : [advancedFilters.priority]).map((p) => String(p).toLowerCase());
      list = list.filter((item) => {
        if (!item) return false;
        const itemPrio = String(item.priority || "medium").toLowerCase();
        return prios.includes(itemPrio);
      });
    }
    if (advancedFilters.start_date) {
      list = list.filter((item) => {
        if (!item || !item.start_date) return false;
        return new Date(item.start_date) >= new Date(advancedFilters.start_date);
      });
    }
    if (advancedFilters.end_date) {
      list = list.filter((item) => {
        if (!item || (!item.end_date && !item.due_date)) return false;
        const d = new Date(item.end_date || item.due_date);
        return d <= new Date(advancedFilters.end_date);
      });
    }
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
  }, [displayItems, debouncedSearch, advancedFilters]);

  const filteredItems = statusFilter && statusFilter !== "due_today"
    ? searchFilteredItems.filter((item) => {
        if (!item) return false;
        if (statusFilter === "pending") {
          return pendingStatuses.includes(item.status);
        }
        if (statusFilter === "transferred") {
          return Array.isArray(item.delegation_chain) && item.delegation_chain.length > 0;
        }
        return item.status === statusFilter;
      })
    : searchFilteredItems;

  const safeFilteredItems = Array.isArray(filteredItems) ? filteredItems : [];
  const subtaskIds = safeFilteredItems.map((item) => item.id);

  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(safeFilteredItems.length / (ITEMS_PER_PAGE || 10)));
  const paginatedItems = showAll ? safeFilteredItems : safeFilteredItems.slice((page - 1) * (ITEMS_PER_PAGE || 10), page * (ITEMS_PER_PAGE || 10));

  const breadcrumbs = [
    { label: t("Subtasks", { defaultValue: "Subtasks" }), path: rolePath("deliveries") },
    { label: t("Self Subtasks", { defaultValue: "Self Subtasks" }) },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="projects-page">
        <div className="projects-header">
          <div>
            <h1>{t("Self Subtasks", { defaultValue: "Self Subtasks" })}</h1>
            <p>{t("Subtasks assigned to yourself", { defaultValue: "Subtasks assigned to yourself" })}</p>
          </div>
          <div className="header-actions" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            {canCreateSubtask && (
              <button className="add-btn" onClick={() => setShowCreateModal(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                {t("+ Create Subtask", { defaultValue: "+ Create Subtask" })}
              </button>
            )}
            <select value={timeFilter} onChange={(e) => { setTimeFilter(e.target.value); handlePageChange(1); }} className="reports-filter">
              <option value="">{t("All Time", { defaultValue: "All Time" })}</option>
              <option value="today">{t("Today", { defaultValue: "Today" })}</option>
              <option value="7">{t("Last 7 Days", { defaultValue: "Last 7 Days" })}</option>
              <option value="30">{t("Last 30 Days", { defaultValue: "Last 30 Days" })}</option>
              <option value="180">{t("Last 6 Months", { defaultValue: "Last 6 Months" })}</option>
              <option value="custom">{t("Custom Date", { defaultValue: "Custom Date" })}</option>
            </select>
            {timeFilter === "custom" && (
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => { setCustomStartDate(e.target.value); handlePageChange(1); }}
                  style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color, #cbd5e1)", fontSize: "13px" }}
                />
                <span style={{ fontSize: "12px", color: "#64748b" }}>{t("to", { defaultValue: "to" })}</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => { setCustomEndDate(e.target.value); handlePageChange(1); }}
                  style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color, #cbd5e1)", fontSize: "13px" }}
                />
              </div>
            )}
          </div>
        </div>

        <DraggableStatusBadges
          badges={[
            { id: "due_today", label: t("Due Today", { defaultValue: "Due Today" }), count: dueTodayCount, className: "DueToday", dotColor: "#EF4444" },
            { id: "pending", label: t("Pending", { defaultValue: "Pending" }), count: pendingCount, className: "Pending" },
            { id: "in_progress", label: t("In Progress", { defaultValue: "In Progress" }), count: inProgressCount, className: "InProgress" },
            { id: "paused", label: t("Paused", { defaultValue: "Paused" }), count: pausedCount, className: "Paused" },
            { id: "submitted", label: t("Submitted", { defaultValue: "Submitted" }), count: submittedCount, className: "Submitted" },
            { id: "reopened", label: t("Reopened", { defaultValue: "Reopened" }), count: reopenedCount, className: "Reopened" },
            { id: "transferred", label: t("Transferred", { defaultValue: "Transferred" }), count: transferredCount, className: "Transferred" },
            { id: "approved", label: t("Completed", { defaultValue: "Completed" }), count: approvedCount, className: "Approved" },
            { id: "rejected", label: t("Declined", { defaultValue: "Declined" }), count: rejectedCount, className: "Rejected" },
            { id: "rework_required", label: t("Rework Required", { defaultValue: "Rework Required" }), count: reworkRequiredCount, className: "Reopened" },
            { id: "", label: t("All", { defaultValue: "All" }), count: allCount, className: "All" },
          ]}
          activeStatus={statusFilter}
          onSelectStatus={selectStatusFilter}
          storageKey="pms_self_deliveries_status_order"
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
              status: appliedFilters?.statuses || appliedFilters?.status || [],
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
          <div className="deliveries-table-header self-deliveries-grid">
            <div>{t("ID", { defaultValue: "ID" })}</div>
            <div>{t("Subtask", { defaultValue: "Subtask" })}</div>
            <div>{t("Related Task/Project", { defaultValue: "Related Task/Project" })}</div>
            <div>{t("Status", { defaultValue: "Status" })}</div>
            <div>{t("Start & Due Date", { defaultValue: "Start & Due Date" })}</div>
            <div style={{ textAlign: "center" }}>{t("Action", { defaultValue: "Action" })}</div>
          </div>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>{t("Loading...", { defaultValue: "Loading..." })}</div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>{t("No subtasks found", { defaultValue: "No subtasks found" })}</div>
          ) : (
            <SortableTableWrapper items={paginatedItems} onReorder={handleSubtaskReorder} idKey="id" as="div" handleOnly>
              {(item, idx, dndProps) => {
                const colors = getRandomColors(item.id);
                const canSubmit = item.status === "pending" || item.status === "rework_required";

                const isRejectedByMe = isDelegationRejectedByMe(item, currentUser);
                const isRevokedFromMe = isDelegationRevokedFromMe(item, currentUser);
                const isInactiveForMe = isRejectedByMe || isRevokedFromMe;
                const hasRejectedDelegation = Array.isArray(item.delegation_chain) && item.delegation_chain.some((d) => String(d.status).toLowerCase() === "rejected");
                const hasRevokedDelegation = Array.isArray(item.delegation_chain) && item.delegation_chain.some((d) => String(d.status).toLowerCase() === "revoked");

                return (
                  <div className={`deliveries-table-row self-deliveries-grid ${isInactiveForMe ? "delegation-rejected-row" : ""}`} key={item.id} style={isInactiveForMe ? { opacity: 0.88 } : undefined}>
                    <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} id={item.id} businessId={item.business_id} color="#16a34a" />
                    <div className="user-box">
                      <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                        {getInitials(item.title)}
                      </div>
                      <div>
                        <div className="user-name" title={item.title} style={{ maxWidth: "250px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: isInactiveForMe ? 0.75 : 1 }}>
                          {item.delegation_chain && item.delegation_chain.length > 0 && !isInactiveForMe && !hasRejectedDelegation && !hasRevokedDelegation && (
                            <ArrowUpRight size={14} style={{ color: "#6B7280", flexShrink: 0, marginRight: 4 }} />
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
                                  marginRight: 4,
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
                                  marginRight: 4,
                                  cursor: "help",
                                }}
                              >
                                <XCircle size={11} />
                                {t("Transfer Revoked", { defaultValue: "Transfer Revoked" })}
                              </span>
                            );
                          })()}
                          {item.title}
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="task-title" title={item.task?.title || "-"} style={{ maxWidth: "250px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.task?.title || "-"}</div>
                      {(item.project || item.task?.project) && item.task?.title && (
                        <Link to={rolePath(`projects/project-details/${(item.project || item.task.project).id}`)} onClick={(e) => e.stopPropagation()} style={{ fontSize: "11px", color: "#2563eb", textDecoration: "none", marginTop: "2px", display: "inline-block", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={(item.project || item.task.project).title}>
                          {(item.project || item.task.project).title}
                        </Link>
                      )}
                    </div>
                    <div className="col-status">
                      <TaskMultiStatusBadges item={item} />
                    </div>
                  <div className="date-box">
                    {renderDynamicDates(item, currentUser)}
                  </div>
                    <div className="col-action" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
                      <ActionPopover
                        trigger={
                          <button className="action-icon-btn action-view action-trigger-lg" title={t("Actions", { defaultValue: "Actions" })}>
                            <IoEyeOutline size={20} />
                          </button>
                        }
                        onTriggerClick={() => {
                          const currentSearch = location.search || (page > 1 ? `?page=${page}` : "");
                          const returnUrl = `${location.pathname}${currentSearch}`;
                          navigate(rolePath(`deliveries/deliverable-details/${item.id}`), { state: { from: "self-deliveries", subtaskIds, page, returnUrl } });
                        }}
                      >
                        {(() => {
                          const sStatus = (item.status || "").toLowerCase();
                          const isSubtaskCreator = Boolean(
                            item.is_creator === true ||
                            (currentUser && (
                              parseInt(item.created_by, 10) === parseInt(currentUser.id, 10) ||
                              parseInt(item.assigned_by, 10) === parseInt(currentUser.id, 10) ||
                              parseInt(item.user_id, 10) === parseInt(currentUser.id, 10) ||
                              parseInt(item.creator_id, 10) === parseInt(currentUser.id, 10)
                            ))
                          );
                          const isSubtaskAssignee = Boolean(
                            item.is_assignee ??
                            (currentUser && (
                              (item.assignees || []).some((a) => parseInt(a.id, 10) === parseInt(currentUser.id, 10)) ||
                              (item.assigned_to && parseInt(item.assigned_to, 10) === parseInt(currentUser.id, 10))
                            ))
                          );
                          const isSubtaskCurrentOwner = Boolean(
                            item.is_current_owner ??
                            (item.current_owner && currentUser && parseInt(item.current_owner, 10) === parseInt(currentUser.id, 10)) ??
                            isSubtaskAssignee
                          );
                          const isSubtaskFollower = (item.followers || []).some((f) => parseInt(f.id, 10) === parseInt(currentUser?.id, 10));
                          const isSubtaskOnlyFollower = isSubtaskFollower && !["admin", "manager", "super_admin"].includes(currentUser?.role) && !isSubtaskCreator && !isSubtaskAssignee;
                          const isSubtaskTransferor = item.is_transferor ?? false;
                          const subtaskTransferorHasApproved = item.transferor_has_approved ?? false;
                          const isSubtaskTransferorApproval = (isSubtaskTransferor || item.is_transferor) && !subtaskTransferorHasApproved && (item.submission_stage === "awaiting_checkpoint" || item.can_submit_to_next || ["submitted", "submitted_late"].includes(sStatus));
                          const isSubtaskAssignerOrCreator = isSubtaskCreator || ["admin", "manager", "super_admin"].includes(currentUser?.role) || (currentUser && (
                            parseInt(item.assigned_by, 10) === parseInt(currentUser.id, 10) ||
                            parseInt(item.created_by, 10) === parseInt(currentUser.id, 10) ||
                            parseInt(item.creator_id, 10) === parseInt(currentUser.id, 10) ||
                            parseInt(item.user_id, 10) === parseInt(currentUser.id, 10)
                          ));

                          const canSubtaskEdit = !isSubtaskOnlyFollower && isSubtaskAssignerOrCreator && !["approved", "completed", "submitted", "submitted_late", "abandoned"].includes(sStatus);
                          const canSubtaskDelete = !isSubtaskOnlyFollower && isSubtaskAssignerOrCreator;
                          const canSubtaskApprove = !isSubtaskOnlyFollower && (isSubtaskTransferorApproval || ((isSubtaskAssignerOrCreator || item.can_approve === true || item.is_next_approver) && (!item.is_transferred || subtaskTransferorHasApproved || item.submission_stage === "awaiting_creator" || !item.has_delegation_chain)));
                          const canSubtaskDecline = !isSubtaskOnlyFollower && (isSubtaskTransferorApproval || canSubtaskApprove || item.can_decline_submission || isSubtaskAssignerOrCreator) && ["submitted", "submitted_late"].includes(sStatus);
                          const canSubtaskReopen = !isSubtaskOnlyFollower && ((isSubtaskAssignerOrCreator || item.can_decline_submission || isSubtaskTransferorApproval || canSubtaskApprove) && ["completed", "declined", "abandoned", "approved", "submitted", "submitted_late", "rejected"].includes(sStatus));
                          const canSubtaskAbandon = !isSubtaskOnlyFollower && (isSubtaskAssignee || isSubtaskCurrentOwner || isSubtaskAssignerOrCreator) && !["abandoned", "approved", "completed", "submitted", "submitted_late"].includes(sStatus);
                          const canSubtaskMarkCompleted = !isSubtaskOnlyFollower && isSubtaskAssignerOrCreator && ["pending", "in_progress", "in-progress", "reopened", "paused", "acknowledged"].includes(sStatus);
                          const canSubtaskTransfer = !isSubtaskOnlyFollower && (item.can_delegate === true || (item.allow_transfer !== false && (isSubtaskAssignee || isSubtaskCurrentOwner) && !isSubtaskTransferor)) && !["approved", "rejected", "pending", "submitted"].includes(sStatus) && !item.active_outgoing_delegation && !isSubtaskTransferor;

                          const isSubtaskAssignerLocked = !!item.assigner_paused;
                          const canSubtaskAssignerPause = !isSubtaskOnlyFollower && isSubtaskAssignerOrCreator && !isSubtaskAssignerLocked && ["pending", "in_progress", "reopened", "paused", "submitted"].includes(sStatus);
                          const canSubtaskAssignerResume = !isSubtaskOnlyFollower && isSubtaskAssignerOrCreator && isSubtaskAssignerLocked;
                          const canSubtaskAcknowledge = !isSubtaskOnlyFollower && (isSubtaskAssignee || isSubtaskCurrentOwner) && sStatus === "pending" && !isSubtaskAssignerLocked && !isSubtaskTransferor;
                          const canSubtaskStartTimer = !isSubtaskOnlyFollower && (isSubtaskAssignee || isSubtaskCurrentOwner) && ["in_progress", "in-progress", "reopened", "acknowledged"].includes(sStatus) && (!item.timer_state || item.timer_state === "idle" || !item.timer?.state || item.timer?.state === "idle") && !isSubtaskAssignerLocked && !isSubtaskTransferor && sStatus !== "paused" && item.timer_state !== "running" && item.timer?.state !== "running";
                          const canSubtaskTimerPause = !isSubtaskOnlyFollower && (isSubtaskAssignee || isSubtaskCurrentOwner) && ["in_progress", "submitted"].includes(sStatus) && (item.timer_state === "running" || item.timer?.state === "running") && !isSubtaskAssignerLocked;
                          const canSubtaskTimerResume = !isSubtaskOnlyFollower && (isSubtaskAssignee || isSubtaskCurrentOwner) && (sStatus === "paused" || item.timer_state === "paused" || item.timer?.state === "paused") && !isSubtaskAssignerLocked;
                          const canSubtaskSubmit = !isSubtaskOnlyFollower && (item.can_submit === true || (isSubtaskAssignee && ["in_progress", "reopened", "paused", "rejected", "rework_required"].includes(sStatus))) && !isSubtaskAssignerLocked && !isSubtaskTransferor;

                          return (
                            <>
                              <button className="action-icon-btn action-note" title={t("Add Note", { defaultValue: "Add Note" })} onClick={() => setNoteModal({ open: true, itemId: item.id })}>
                                <StickyNote size={14} />
                              </button>
                              {canSubtaskEdit && (
                                <button className="action-icon-btn action-edit" title={t("Edit Subtask", { defaultValue: "Edit Subtask" })} onClick={() => setEditingSubtask(item)}>
                                  <Pencil size={16} />
                                </button>
                              )}
                              {canSubtaskDelete && (
                                <button className="action-icon-btn action-delete" title={t("Delete Subtask", { defaultValue: "Delete Subtask" })} disabled={actingId === item.id} onClick={() => handleDelete(item.id)}>
                                  <Trash2 size={16} />
                                </button>
                              )}
                              {canSubtaskApprove && (["submitted", "submitted_late", "reopened"].includes(sStatus)) && (
                                <button className="action-icon-btn action-submit" title={t("Approve", { defaultValue: "Approve" })} disabled={actingId === item.id} onClick={() => handleApprove(item.id)} style={{ color: "#16A34A" }}>
                                  <CheckCircle2 size={16} />
                                </button>
                              )}
                              {canSubtaskDecline && (
                                <button className="action-icon-btn action-submit" title={t("Decline", { defaultValue: "Decline" })} disabled={actingId === item.id} onClick={() => setDeclineSubtask(item)} style={{ color: "#DC2626" }}>
                                  <XCircle size={16} />
                                </button>
                              )}
                              {canSubtaskReopen && (
                                <button className="action-icon-btn" title={t("Reopen Subtask", { defaultValue: "Reopen Subtask" })} onClick={() => setReopenSubtask(item)} style={{ color: "#2563EB" }}>
                                  <RotateCcw size={16} />
                                </button>
                              )}
                              {canSubtaskAbandon && (
                                <button className="action-icon-btn" title={["admin", "manager"].includes(currentUser?.role) ? t("Abandon Subtask", { defaultValue: "Abandon Subtask" }) : t("Request Abandon", { defaultValue: "Request Abandon" })} onClick={() => setAbandonSubtask(item)} style={{ color: "#F59E0B" }}>
                                  <AlertOctagon size={16} />
                                </button>
                              )}
                              {canSubtaskMarkCompleted && (
                                <button className="action-icon-btn" title={t("Mark as Completed", { defaultValue: "Mark as Completed" })} onClick={() => setMarkCompletedSubtask(item)} style={{ color: "#059669" }}>
                                  <CheckCircle2 size={16} />
                                </button>
                              )}
                              {canSubtaskTransfer && (
                                <button className="action-icon-btn" title={t("Transfer Subtask", { defaultValue: "Transfer Subtask" })} onClick={() => setTransferDialog({ open: true, subtask: item })} style={{ color: "#2563EB" }}>
                                  <Users size={16} />
                                </button>
                              )}
                              {isSubtaskTransferor && (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "#EFF6FF", color: "#1D4ED8", fontSize: "11px", fontWeight: 600 }}>
                                  {t("Transferred", { defaultValue: "Transferred" })}
                                </span>
                              )}
                              {isSubtaskAssignerLocked && !isSubtaskAssignerOrCreator && (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "#FEF3C7", color: "#92400E", fontSize: "11px", fontWeight: 600, border: "1px solid #F59E0B" }}>
                                  <Lock size={12} />
                                  {t("Paused by Assigner", { defaultValue: "Paused by Assigner" })}
                                </span>
                              )}
                              {canSubtaskAssignerPause && (
                                <button
                                  className="action-icon-btn"
                                  title={t("Pause", { defaultValue: "Pause" })}
                                  disabled={actingId === item.id}
                                  onClick={() => setAssignerPauseSubtask(item)}
                                  style={{ color: "#7C3AED", cursor: actingId === item.id ? "not-allowed" : "pointer" }}
                                >
                                  <Lock size={16} />
                                </button>
                              )}
                              {canSubtaskAssignerResume && (
                                <button
                                  className="action-icon-btn"
                                  title={t("Resume", { defaultValue: "Resume" })}
                                  disabled={actingId === item.id}
                                  onClick={() => {
                                    setResumeSubtaskItem(item);
                                    setResumeConfirmOpen(true);
                                  }}
                                  style={{ color: "#059669", cursor: actingId === item.id ? "not-allowed" : "pointer" }}
                                >
                                  <Play size={16} />
                                </button>
                              )}
                              {canSubtaskAcknowledge && (
                                <button className="action-icon-btn action-submit" title={t("Acknowledge", { defaultValue: "Acknowledge" })} disabled={actingId === item.id} onClick={() => handleAcknowledge(item.id)} style={{ color: "#2563EB" }}>
                                  <CheckCircle2 size={16} />
                                </button>
                              )}
                              {canSubtaskStartTimer && (
                                <button
                                  className="action-icon-btn action-submit"
                                  title={t("Start Subtask Timer", { defaultValue: "Start Subtask Timer" })}
                                  disabled={actingId === item.id}
                                  onClick={() => {
                                    setStartTimerSubtaskItem(item);
                                    setStartTimerConfirmOpen(true);
                                  }}
                                  style={{ color: "#2563EB", cursor: actingId === item.id ? "not-allowed" : "pointer" }}
                                >
                                  <Play size={16} />
                                </button>
                              )}
                              {canSubtaskTimerPause && (
                                <button className="action-icon-btn action-submit" title={t("Pause", { defaultValue: "Pause" })} disabled={actingId === item.id} onClick={() => handlePause(item.id)} style={{ color: "#D97706" }}>
                                  <Pause size={16} />
                                </button>
                              )}
                              {canSubtaskTimerResume && (
                                <button
                                  className="action-icon-btn action-submit"
                                  title={t("Resume", { defaultValue: "Resume" })}
                                  disabled={actingId === item.id}
                                  onClick={() => {
                                    setResumeSubtaskItem(item);
                                    setResumeConfirmOpen(true);
                                  }}
                                  style={{ color: "#059669" }}
                                >
                                  <Play size={16} />
                                </button>
                              )}
                              {canSubtaskSubmit && (
                                <button
                                  className="action-icon-btn action-submit"
                                  title={item.task?.status === "paused" ? t("Parent task is paused. Resume the task first.", { defaultValue: "Parent task is paused. Resume the task first." }) : isSubtaskAssignerLocked ? t("Parent task is paused by assigner.", { defaultValue: "Parent task is paused by assigner." }) : ["rework_required", "rejected", "reopened"].includes(sStatus) ? t("Resubmit Subtask", { defaultValue: "Resubmit Subtask" }) : t("Submit Subtask", { defaultValue: "Submit Subtask" })}
                                  disabled={item.task?.status === "paused" || isSubtaskAssignerLocked}
                                  onClick={() => setSubmitModal({ open: true, subtask: item })}
                                  style={item.task?.status === "paused" || isSubtaskAssignerLocked ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                                >
                                  <LuSend size={16} />
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
          )}
        </div>
      </div>

      {!showAll && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          itemsPerPage={perPage}
          onItemsPerPageChange={(val) => { setPerPage(val); handlePageChange(1); }}
        />
      )}

      <SubmitDeliverableModal
        key={`submit-${submitModal.subtask?.id || "none"}`}
        isOpen={submitModal.open}
        onClose={() => setSubmitModal({ open: false, subtask: null })}
        deliverable={submitModal.subtask}
        onSubmitSuccess={handleSubmissionSuccess}
      />

      <AddNoteModal
        isOpen={noteModal.open}
        onClose={() => setNoteModal({ open: false, itemId: null })}
        itemType="deliverable"
        itemId={noteModal.itemId}
        onSaved={fetchSubtasks}
      />

      {showCreateModal && (
        <CreateDeliverableModel
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchSubtasks(); }}
        />
      )}

      {transferDialog.open && (
        <TransferTaskDialog
          isOpen={transferDialog.open}
          onClose={() => setTransferDialog({ open: false, subtask: null })}
          task={transferDialog.subtask}
          entityType="deliverable"
          onTransferSuccess={() => { setTransferDialog({ open: false, subtask: null }); fetchSubtasks(); showSuccessMessage("Subtask", "transferred"); }}
        />
      )}

      {editingSubtask && (
        <CreateDeliverableModel
          projectId={editingSubtask.project_id || null}
          taskId={editingSubtask.task_id || null}
          taskTitle={editingSubtask.task?.title || null}
          editMode={true}
          editData={editingSubtask}
          onClose={(refresh) => {
            setEditingSubtask(null);
            if (refresh) fetchSubtasks();
          }}
          onUpdated={() => {
            setEditingSubtask(null);
            fetchSubtasks();
          }}
        />
      )}

      {reopenSubtask && (
        <ReopenDialog
          isOpen={!!reopenSubtask}
          onClose={() => setReopenSubtask(null)}
          subtask={reopenSubtask}
          onReopenSuccess={(updated) => {
            setReopenSubtask(null);
            setSubtasks((prev) => Array.isArray(prev) ? prev.map((d) => d.id === reopenSubtask.id ? { ...d, ...updated } : d) : []);
            publish('deliverable:updated', updated);
            publish('data:changed', { type: 'deliverable', action: 'updated' });
            showSuccessMessage("Subtask", "reopened");
          }}
        />
      )}

      {abandonSubtask && (
        <AbandonModal
          isOpen={!!abandonSubtask}
          onClose={() => setAbandonSubtask(null)}
          title={t("Abandon Subtask", { defaultValue: "Abandon Subtask" })}
          subtitle={abandonSubtask?.title}
          actionLabel={t("Abandon Subtask", { defaultValue: "Abandon Subtask" })}
          onSubmit={handleAbandon}
          loading={abandonSubtaskLoading}
        />
      )}

      {markCompletedSubtask && (
        <MarkTaskCompletedModal
          isOpen={!!markCompletedSubtask}
          onClose={() => setMarkCompletedSubtask(null)}
          task={markCompletedSubtask}
          entityType="deliverable"
          onCompleteSuccess={(updated) => {
            setMarkCompletedSubtask(null);
            setSubtasks((prev) => Array.isArray(prev) ? prev.map((d) => d.id === markCompletedSubtask.id ? { ...d, ...updated } : d) : []);
            publish('deliverable:updated', updated);
            publish('data:changed', { type: 'deliverable', action: 'updated' });
            showSuccessMessage("Subtask", "completed");
          }}
        />
      )}

      {assignerPauseSubtask && (
        <PauseReasonModal
          isOpen={!!assignerPauseSubtask}
          onClose={() => setAssignerPauseSubtask(null)}
          onConfirm={handleAssignerPauseSubmit}
          isAssigner
        />
      )}

      {declineSubtask && (
        <DeclineModal
          isOpen={!!declineSubtask}
          onClose={() => setDeclineSubtask(null)}
          title={t("Decline Subtask", { defaultValue: "Decline Subtask" })}
          subtitle={declineSubtask?.title}
          actionLabel={t("Decline Subtask", { defaultValue: "Decline Subtask" })}
          placeholder={t("Please enter a reason for declining this subtask...", { defaultValue: "Please enter a reason for declining this subtask..." })}
          onSubmit={(comment) => handleReject(declineSubtask.id, comment)}
          loading={declineSubtaskLoading}
        />
      )}

      <ConfirmModal
        isOpen={deleteSubtaskConfirmOpen}
        onClose={() => { setDeleteSubtaskConfirmOpen(false); setDeleteSubtaskTargetId(null); }}
        onConfirm={confirmDelete}
        title={t("Delete Subtask", { defaultValue: "Delete Subtask" })}
        message={t("Are you sure you want to delete this subtask? This action cannot be undone.", { defaultValue: "Are you sure you want to delete this subtask? This action cannot be undone." })}
        confirmText={t("Delete", { defaultValue: "Delete" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        danger
      />

      <ConfirmModal
        isOpen={startTimerConfirmOpen}
        onClose={() => {
          setStartTimerConfirmOpen(false);
          setStartTimerSubtaskItem(null);
        }}
        onConfirm={async () => {
          if (!startTimerSubtaskItem) return;
          await handleStartTimer(startTimerSubtaskItem.id);
          setStartTimerConfirmOpen(false);
          setStartTimerSubtaskItem(null);
        }}
        title={t("Start Subtask Timer", { defaultValue: "Start Subtask Timer" })}
        message={t("Are you sure you want to start the timer for this subtask?", { defaultValue: "Are you sure you want to start the timer for this subtask?" })}
        confirmText={t("Start Timer", { defaultValue: "Start Timer" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        confirmColor="#2563EB"
      />

      <ConfirmModal
        isOpen={resumeConfirmOpen}
        onClose={() => {
          setResumeConfirmOpen(false);
          setResumeSubtaskItem(null);
        }}
        onConfirm={handleConfirmResume}
        title={t("Resume Subtask", { defaultValue: "Resume Subtask" })}
        message={t("Are you sure you want to resume this subtask?", { defaultValue: "Are you sure you want to resume this subtask?" })}
        confirmText={t("Resume", { defaultValue: "Resume" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        confirmColor="#16A34A"
      />
    </DashboardLayout>
  );
}

export default SelfDeliveries;

