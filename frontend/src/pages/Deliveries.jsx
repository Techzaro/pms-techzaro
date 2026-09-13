/**
 * Deliveries.jsx — Subtasks Assigned To You Page
 *
 * Lists all subtasks assigned to the current user with:
 * - Status filter tabs (Due Today, Pending, Submitted, Reopened, Approved, Rejected)
 * - Search by subtask name
 * - Time filter (All Time, Last 7/30 Days, Last 6 Months)
 * - Sortable table with drag-and-drop reordering
 * - Pagination
 * - Submit/View modals for subtask actions
 * - Deep-linking support via ?selectedDeliverable= param
 */
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import DraggableStatusBadges from "../components/DraggableStatusBadges";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import { Link, useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { GoDotFill } from "react-icons/go";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";
import {
  StickyNote,
  Pause,
  Play,
  CheckCircle2,
  Lock,
  Users,
  ArrowUpRight,
  AlertOctagon,
  RotateCcw,
  Pencil,
  Trash2,
  XCircle,
} from "lucide-react";
import { authToken, getUser, rolePath } from "../utils/auth";
import API_URL from "../config/api";
import { publish } from "../utils/eventBus";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage } from "../utils/notify";
import SubmitDeliverableModal from "../components/SubmitDeliverableModal";
import ViewDeliverableModal from "../components/ViewDeliverableModal";
import ActionPopover from "../components/ActionPopover";
import AddNoteModal from "../components/AddNoteModal";
import TransferTaskDialog from "../components/TransferTaskDialog";
import CreateDeliverableModel from "../components/layout/CreateDeliverableModel";
import TaskMultiStatusBadges from "../components/TaskMultiStatusBadges";
import TaskFilterBar from "../components/TaskFilterBar";
import ConfirmModal from "../components/ConfirmModal";
import PauseReasonModal from "../components/PauseReasonModal";
import ReopenDialog from "../components/ReopenDialog";
import AbandonModal from "../components/AbandonModal";
import MarkTaskCompletedModal from "../components/MarkTaskCompletedModal";
import { formatDateTimeInline } from "../utils/formatDateTime";
import { getUpdatedSinceThreshold } from "../utils/filterUtils";
import "../components/ActionPopover.css";
import "../pages/Deliveries.css";

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
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import SmartDragHandle from "../components/SmartDragHandle";
import Pagination from "../components/Pagination";
import { renderDynamicDates } from "../utils/tableDateUtils";

/** Background colors for status badges */
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

/** Text colors for status badges */
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

/**
 * Deliveries — Lists subtasks assigned to the current user.
 * Supports filtering, searching, pagination, sortable reordering, and submit/view modals.
 */
function Deliveries() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
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
  const [viewModal, setViewModal] = useState({ open: false, subtask: null });
  const [noteModal, setNoteModal] = useState({ open: false, itemId: null });
  const [transferDialog, setTransferDialog] = useState({ open: false, subtask: null });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [restoreDraftId, setRestoreDraftId] = useState(null);
  const [draftDataPayload, setDraftDataPayload] = useState(null);
  const [editingSubtask, setEditingSubtask] = useState(null);
  const [reopenSubtask, setReopenSubtask] = useState(null);
  const [abandonSubtask, setAbandonSubtask] = useState(null);
  const [abandonSubtaskLoading, setAbandonSubtaskLoading] = useState(false);
  const [markCompletedSubtask, setMarkCompletedSubtask] = useState(null);
  const [assignerPauseSubtask, setAssignerPauseSubtask] = useState(null);
  const [deleteSubtaskTargetId, setDeleteSubtaskTargetId] = useState(null);
  const [deleteSubtaskConfirmOpen, setDeleteSubtaskConfirmOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [actingType, setActingType] = useState(null);
  const [perPage, setPerPage] = useState(10);
  const ITEMS_PER_PAGE = perPage;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch subtasks from API with search and status filters
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
      params.append("status", Array.isArray(statusVal) ? statusVal.join(",") : statusVal);
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

    fetch(`${API_URL}/deliverables?${params.toString()}`, {
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

      const existingSubtask = (orderedItems.length ? orderedItems : items).find((s) => String(s.id) === String(origId));
      if (existingSubtask) {
        setEditingSubtask(existingSubtask);
      } else {
        const token = authToken();
        fetch(`${API_URL}/deliverables/${origId}`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        })
          .then((r) => r.json())
          .then((data) => {
            const s = data?.data || data?.deliverable || data;
            setEditingSubtask(s || { id: origId, title: directDraftData?.title || "" });
          })
          .catch(() => {
            setEditingSubtask({ id: origId, title: directDraftData?.title || "" });
          });
      }
    } else {
      setRestoreDraftId(draftId);
      setDraftDataPayload(directDraftData || null);
      setShowCreateModal(true);
    }
  }, [location.state, items, orderedItems]);

  // Deep linking: auto-open submit/view modal when ?selectedDeliverable= is in URL
  useEffect(() => {
    const selectedId = searchParams.get("selectedDeliverable");
    if (!selectedId) return;

    // Remove the param from URL without navigation
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("selectedDeliverable");
      return next;
    }, { replace: true });

    // Fetch the specific subtask and open appropriate modal
    const token = authToken();
    fetch(`${API_URL}/deliverables/${selectedId}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.deliverable) {
          const d = data.deliverable;
          if (d.status === "pending" || d.status === "rejected" || d.status === "reopened") {
            setSubmitModal({ open: true, subtask: d });
          } else {
            navigate(rolePath(`deliveries/deliverable-details/${d.id}`), { state: { from: "deliveries", subtaskIds } });
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const status = searchParams.get("status") || "";
    setStatusFilter(status);
  }, [searchParams]);

  useEffect(() => {
    setOrderedSubtasks(subtasks);
  }, [subtasks]);

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

  // Handle drag-and-drop reorder and persist sort order to API
  const handleSubtaskReorder = useCallback((reordered) => {
    setOrderedSubtasks(reordered);
    const payload = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
    const token = authToken();
    fetch(`${API_URL}/deliverables/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items: payload }),
      _notifHandled: true,
    }).catch(() => {});
  }, []);

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
        setSubtasks((prev) => prev.map((d) => d.id === itemId ? { ...d, status: "in_progress", ...data.deliverable } : d));
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
        setSubtasks((prev) => prev.map((d) => d.id === itemId ? { ...d, status: "in_progress", ...data.deliverable } : d));
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
        setSubtasks((prev) => prev.map((d) => d.id === itemId ? { ...d, status: "in_progress", ...data.deliverable } : d));
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
        setSubtasks((prev) => prev.map((d) => d.id === itemId ? { ...d, status: "approved", ...data.deliverable } : d));
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

  const handleReject = async (itemId) => {
    setActingId(itemId);
    setActingType("reject");
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${itemId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setSubtasks((prev) => prev.map((d) => d.id === itemId ? { ...d, status: "rejected", ...data.deliverable } : d));
        publish('deliverable:updated', { id: itemId, status: 'rejected' });
        publish('data:changed', { type: 'deliverable', action: 'updated' });
        showSuccessMessage("Subtask", "declined");
      } else {
        notify.error(data.message || t("Failed to decline.", { defaultValue: "Failed to decline." }));
      }
    } catch {
      notify.error(t("Failed to decline.", { defaultValue: "Failed to decline." }));
    } finally {
      setActingId(null);
      setActingType(null);
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
        setSubtasks((prev) => prev.map((d) => d.id === subtaskId ? { ...d, assigner_paused: true, ...updated } : d));
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
        setSubtasks((prev) => prev.map((d) => d.id === subtaskId ? { ...d, assigner_paused: false, ...updated } : d));
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
        setSubtasks((prev) => prev.map((d) => d.id === abandonSubtask.id ? { ...d, ...updated } : d));
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
        setSubtasks((prev) => prev.filter((d) => d.id !== subtaskId));
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
      abandon_requested: "Abandon Requested",
      abandoned: "Abandoned",
    };
    const label = map[status] || status;
    return t(label, { defaultValue: label });
  };

  // Update local state after successful submission to reflect new status
  const handleSubmissionSuccess = (updatedSubtask) => {
    setSubtasks((prev) =>
      prev.map((d) =>
        d.id === updatedSubtask.id
          ? { ...d, status: "submitted", has_submitted: true }
          : d
      )
    );
  };

  const safeSubtasks = Array.isArray(subtasks) ? subtasks : [];
  const safeOrderedSubtasks = Array.isArray(orderedSubtasks) ? orderedSubtasks : [];
  const displayItems = safeOrderedSubtasks.length ? safeOrderedSubtasks : safeSubtasks;
  const currentUser = getUser();
  const canCreateSubtask = currentUser && ["admin", "manager", "team_lead"].includes(currentUser.role);

  const pendingStatuses = ["pending", "planned", "planning", "Pending", "Planned", "Planning"];
  const inProgressStatuses = ["in_progress", "In Progress", "In-progress", "reopened", "Reopened", "doing"];
  const completedStatuses = ["completed", "approved", "done", "Completed", "Approved", "Done"];
  const pausedStatuses = ["paused", "Paused", "hold", "on_hold"];
  const submittedStatuses = ["submitted", "Submitted", "review", "in_review", "under_review"];
  const declinedStatuses = ["declined", "rejected", "failed", "Declined", "Rejected", "Failed"];
  const abandonedStatuses = ["abandoned", "abandon_requested", "Abandoned", "Abandon Requested"];

  const allCount = displayItems.length;
  const dueTodayCount = displayItems.filter((i) => {
    if (!i || !i.due_date) return false;
    const d = new Date(i.due_date);
    return !isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
  }).length;
  const pendingCount = displayItems.filter((i) => i && pendingStatuses.includes(i.status)).length;
  const inProgressCount = displayItems.filter((i) => i && inProgressStatuses.includes(i.status)).length;
  const pausedCount = displayItems.filter((i) => i && pausedStatuses.includes(i.status)).length;
  const submittedCount = displayItems.filter((i) => i && submittedStatuses.includes(i.status)).length;
  const reopenedCount = displayItems.filter((i) => i && i.status === "reopened").length;
  const transferredCount = displayItems.filter((i) => i && Array.isArray(i.delegation_chain) && i.delegation_chain.length > 0).length;
  const completedCount = displayItems.filter((i) => i && completedStatuses.includes(i.status)).length;
  const approvedCount = completedCount;
  const declinedCount = displayItems.filter((i) => i && declinedStatuses.includes(i.status)).length;
  const rejectedCount = declinedCount;
  const abandonedCount = displayItems.filter((i) => i && abandonedStatuses.includes(i.status)).length;

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
    if (advancedFilters.status && advancedFilters.status.length > 0) {
      const sts = Array.isArray(advancedFilters.status) ? advancedFilters.status : [advancedFilters.status];
      list = list.filter((item) => {
        if (!item) return false;
        return sts.some((st) => {
          if (st === "due_today") {
            const d = item.due_date || item.end_date || item.start_date ? new Date(item.due_date || item.end_date || item.start_date) : null;
            const isToday = d && !isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
            const isDone = completedStatuses.includes(item.status);
            return isToday && !isDone;
          }
          if (st === "pending") return pendingStatuses.includes(item.status);
          if (st === "in_progress") return inProgressStatuses.includes(item.status);
          if (st === "paused") return pausedStatuses.includes(item.status);
          if (st === "transferred") return Array.isArray(item.delegation_chain) && item.delegation_chain.length > 0;
          if (st === "rejected" || st === "declined") return declinedStatuses.includes(item.status);
          if (st === "abandoned") return abandonedStatuses.includes(item.status);
          if (st === "approved" || st === "completed") return completedStatuses.includes(item.status);
          return item.status === st;
        });
      });
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
        const sf = String(statusFilter).toLowerCase();
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
          return Array.isArray(item.delegation_chain) && item.delegation_chain.length > 0;
        }
        return String(item.status).toLowerCase() === sf;
      })
    : searchFilteredItems;

  const safeFilteredItems = Array.isArray(filteredItems) ? filteredItems : [];
  const subtaskIds = safeFilteredItems.map((item) => item.id);

  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(safeFilteredItems.length / (ITEMS_PER_PAGE || 10)));
  const paginatedItems = showAll ? safeFilteredItems : safeFilteredItems.slice((page - 1) * (ITEMS_PER_PAGE || 10), page * (ITEMS_PER_PAGE || 10));

  const breadcrumbs = [
    { label: t("Subtasks", { defaultValue: "Subtasks" }), path: rolePath("deliveries") },
    { label: t("Assigned To You", { defaultValue: "Assigned To You" }) },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="projects-page">
        <div className="projects-header">
          <div>
            <h1>{t("Subtasks Assigned To You", { defaultValue: "Subtasks Assigned To You" })}</h1>
            <p>{t("Manage and track your subtasks", { defaultValue: "Manage and track your subtasks" })}</p>
          </div>
          <div className="header-actions" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} className="reports-filter">
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
                  onChange={(e) => { setCustomStartDate(e.target.value); setPage(1); }}
                  style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color, #cbd5e1)", fontSize: "13px" }}
                />
                <span style={{ fontSize: "12px", color: "#64748b" }}>{t("to", { defaultValue: "to" })}</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => { setCustomEndDate(e.target.value); setPage(1); }}
                  style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color, #cbd5e1)", fontSize: "13px" }}
                />
              </div>
            )}
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
          storageKey="pms_deliveries_status_order"
          containerClassName="task-progress"
        />

        {/* DEDICATED ACTION BAR & FILTERS */}
        <TaskFilterBar
          search={search}
          onSearchChange={setSearch}
          filters={advancedFilters}
          activeStatus={statusFilter}
          onFilterChange={(key, val) => {
            setAdvancedFilters((prev) => {
              const updated = { ...prev, [key]: val };
              if (key === "priority" || key === "priorities") {
                updated.priority = val;
                updated.priorities = val;
              }
              return updated;
            });
            setPage(1);
          }}
          onApplyFilters={(appliedFilters, appliedSort) => {
            setStatusFilter("");
            setSearchParams({});
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
          <div className="deliveries-table-header">
            <div>{t("ID", { defaultValue: "ID" })}</div>
            <div>{t("Assigned By", { defaultValue: "Assigned By" })}</div>
            <div>{t("Subtask", { defaultValue: "Subtask" })}</div>
            <div>{t("Task", { defaultValue: "Task" })}</div>
            <div>{t("Status", { defaultValue: "Status" })}</div>
            <div>{t("Start & Due Date", { defaultValue: "Start & Due Date" })}</div>
            <div style={{ textAlign: "center" }}>{t("Action", { defaultValue: "Action" })}</div>
          </div>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>{t("Loading...", { defaultValue: "Loading..." })}</div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>{t("No subtasks found", { defaultValue: "No subtasks found" })}</div>
          ) : (
            <SortableTableWrapper items={paginatedItems} onReorder={handleSubtaskReorder} as="div" handleOnly>
              {(item, idx, dndProps) => {
                const colors = getRandomColors(item.id);
                const hasChain = item.delegation_chain && item.delegation_chain.length > 0;
                const displayName = item.transferred_by_name || item.creator?.name || "-";
                const displayRole = item.transferred_by_name ? t("Transferred", { defaultValue: "Transferred" }) : (item.creator?.role ? item.creator.role.replace("_", " ") : "");
                return (
                  <div className="deliveries-table-row" key={item.id}>
                    <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} id={item.id} businessId={item.business_id} color="#16a34a" />
                    <div className="user-box">
                      <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                        {getInitials(displayName)}
                      </div>
                      <div>
                        <div className="user-name">{displayName}</div>
                        <div className="user-role">{displayRole}</div>
                      </div>
                    </div>
                    <div className="user-box">
                      {hasChain && <ArrowUpRight size={14} style={{ color: "#6B7280", flexShrink: 0, marginRight: 4 }} />}
                      <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                        {getInitials(item.title)}
                      </div>
                      <div>
                        <div className="user-name" title={item.title} style={{ maxWidth: "250px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</div>
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
                        onTriggerClick={() => navigate(rolePath(`deliveries/deliverable-details/${item.id}`), { state: { from: "deliveries", subtaskIds } })}
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
                          const canSubtaskStartTimer = !isSubtaskOnlyFollower && (isSubtaskAssignee || isSubtaskCurrentOwner) && ["in_progress", "in-progress", "reopened"].includes(sStatus) && (!item.timer_state || item.timer_state === "idle" || !item.timer?.state || item.timer?.state === "idle") && !isSubtaskAssignerLocked && !isSubtaskTransferor;
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
                                <button className="action-icon-btn action-submit" title={t("Decline", { defaultValue: "Decline" })} disabled={actingId === item.id} onClick={() => handleReject(item.id)} style={{ color: "#DC2626" }}>
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
                                  onClick={() => handleAssignerResume(item.id)}
                                  style={{ color: "#059669", cursor: actingId === item.id ? "not-allowed" : "pointer" }}
                                >
                                  <Lock size={16} />
                                </button>
                              )}
                              {canSubtaskAcknowledge && (
                                <button className="action-icon-btn action-submit" title={t("Acknowledge", { defaultValue: "Acknowledge" })} disabled={actingId === item.id} onClick={() => handleAcknowledge(item.id)} style={{ color: "#2563EB" }}>
                                  <CheckCircle2 size={16} />
                                </button>
                              )}
                              {canSubtaskStartTimer && (
                                <button className="action-icon-btn action-submit" title={t("Start Timer", { defaultValue: "Start Timer" })} disabled={actingId === item.id} onClick={() => handleStartTimer(item.id)} style={{ color: "#2563eb" }}>
                                  <Play size={16} />
                                </button>
                              )}
                              {canSubtaskTimerPause && (
                                <button className="action-icon-btn action-submit" title={t("Pause", { defaultValue: "Pause" })} disabled={actingId === item.id} onClick={() => handlePause(item.id)} style={{ color: "#D97706" }}>
                                  <Pause size={16} />
                                </button>
                              )}
                              {canSubtaskTimerResume && (
                                <button className="action-icon-btn action-submit" title={t("Resume", { defaultValue: "Resume" })} disabled={actingId === item.id} onClick={() => handleResume(item.id)} style={{ color: "#059669" }}>
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
          onPageChange={setPage}
          itemsPerPage={perPage}
          onItemsPerPageChange={(val) => { setPerPage(val); setPage(1); }}
        />
      )}

      <SubmitDeliverableModal
        key={`submit-${submitModal.subtask?.id || "none"}`}
        isOpen={submitModal.open}
        onClose={() => setSubmitModal({ open: false, subtask: null })}
        deliverable={submitModal.subtask}
        onSubmitSuccess={handleSubmissionSuccess}
      />

      {showCreateModal && (
        <CreateDeliverableModel
          isOpen={showCreateModal}
          restoreDraftId={restoreDraftId}
          draftData={draftDataPayload}
          onClose={() => { setShowCreateModal(false); setRestoreDraftId(null); setDraftDataPayload(null); }}
          onCreated={() => { setShowCreateModal(false); setRestoreDraftId(null); setDraftDataPayload(null); fetchSubtasks(); }}
        />
      )}

      <AddNoteModal
        isOpen={noteModal.open}
        onClose={() => setNoteModal({ open: false, itemId: null })}
        itemType="deliverable"
        itemId={noteModal.itemId}
        onSaved={fetchSubtasks}
      />

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
          restoreDraftId={restoreDraftId}
          draftData={draftDataPayload}
          onClose={(refresh) => {
            setEditingSubtask(null);
            setRestoreDraftId(null);
            setDraftDataPayload(null);
            if (refresh) fetchSubtasks();
          }}
          onUpdated={() => {
            setEditingSubtask(null);
            setRestoreDraftId(null);
            setDraftDataPayload(null);
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
            setSubtasks((prev) => prev.map((d) => d.id === reopenSubtask.id ? { ...d, ...updated } : d));
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
            setSubtasks((prev) => prev.map((d) => d.id === markCompletedSubtask.id ? { ...d, ...updated } : d));
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
    </DashboardLayout>
  );
}

export default Deliveries;

