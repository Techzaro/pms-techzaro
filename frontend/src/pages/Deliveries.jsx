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
import { StickyNote, Pause, Play, CheckCircle2, Lock, Users, ArrowUpRight } from "lucide-react";
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
import { formatDateTimeInline } from "../utils/formatDateTime";
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
  const [advancedFilters, setAdvancedFilters] = useState({
    user_id: [],
    project_id: [],
    status: [],
    start_date: "",
    end_date: "",
  });
  const [submitModal, setSubmitModal] = useState({ open: false, subtask: null });
  const [viewModal, setViewModal] = useState({ open: false, subtask: null });
  const [noteModal, setNoteModal] = useState({ open: false, itemId: null });
  const [transferDialog, setTransferDialog] = useState({ open: false, subtask: null });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [restoreDraftId, setRestoreDraftId] = useState(null);
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
    window.history.replaceState({}, document.title);
    setRestoreDraftId(draftId);
    setShowCreateModal(true);
  }, [location.state]);

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
          <div className="header-actions">
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} className="reports-filter">
              <option value="">{t("All Time", { defaultValue: "All Time" })}</option>
              <option value="7">{t("Last 7 Days", { defaultValue: "Last 7 Days" })}</option>
              <option value="30">{t("Last 30 Days", { defaultValue: "Last 30 Days" })}</option>
              <option value="180">{t("Last 6 Months", { defaultValue: "Last 6 Months" })}</option>
            </select>
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
            setAdvancedFilters((prev) => ({ ...prev, [key]: val }));
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
            }));
            setPage(1);
          }}
          onReset={() => {
            setSearch("");
            setStatusFilter("");
            setSearchParams({});
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
                          if (item.is_transferor) return (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "#EFF6FF", color: "#1D4ED8", fontSize: "11px", fontWeight: 600 }}>
                              {t("Transferred", { defaultValue: "Transferred" })}
                            </span>
                          );
                          return (
                        <>
                        <button className="action-icon-btn action-note" title={t("Add Note", { defaultValue: "Add Note" })} onClick={() => setNoteModal({ open: true, itemId: item.id })}><StickyNote size={14} /></button>
                        {item.status === "pending" && (
                          <button className="action-icon-btn action-submit" title={t("Acknowledge", { defaultValue: "Acknowledge" })} disabled={actingId === item.id} onClick={() => handleAcknowledge(item.id)}>
                            <CheckCircle2 size={16} />
                          </button>
                        )}
                        {["in_progress", "reopened"].includes(item.status) && (!item.timer_state || item.timer_state === "idle") && !item.assigner_paused && canUserPauseResume(item, currentUser) && (
                          <button className="action-icon-btn action-submit" title={t("Start Timer", { defaultValue: "Start Timer" })} disabled={actingId === item.id} onClick={() => handleStartTimer(item.id)} style={{ color: "#2563eb" }}>
                            <Play size={16} />
                          </button>
                        )}
                        {["in_progress", "submitted"].includes(item.status) && item.timer_state === "running" && !item.assigner_paused && canUserPauseResume(item, currentUser) && (
                          <button className="action-icon-btn action-submit" title={t("Pause", { defaultValue: "Pause" })} disabled={actingId === item.id} onClick={() => handlePause(item.id)} style={{ color: "#D97706" }}>
                            <Pause size={16} />
                          </button>
                        )}
                        {(item.status === "paused" || item.timer_state === "paused") && !item.assigner_paused && canUserPauseResume(item, currentUser) && (
                          <button className="action-icon-btn action-submit" title={t("Resume", { defaultValue: "Resume" })} disabled={actingId === item.id} onClick={() => handleResume(item.id)} style={{ color: "#059669" }}>
                            <Play size={16} />
                          </button>
                        )}
                        {item.assigner_paused && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "#FEF3C7", color: "#92400E", fontSize: "11px", fontWeight: 600, border: "1px solid #F59E0B" }}>
                            <Lock size={12} />
                            {t("Paused by Assigner", { defaultValue: "Paused by Assigner" })}
                          </span>
                        )}
                        {(item.status === "in_progress" || item.status === "rejected" || item.status === "reopened") && (
                          <button
                            className="action-icon-btn action-submit"
                            title={item.task?.status === "paused" ? t("Parent task is paused. Resume the task first.", { defaultValue: "Parent task is paused. Resume the task first." }) : item.task?.assigner_paused ? t("Parent task is paused by assigner.", { defaultValue: "Parent task is paused by assigner." }) : t("Submit Subtask", { defaultValue: "Submit Subtask" })}
                            disabled={item.task?.status === "paused" || item.task?.assigner_paused}
                            onClick={() => setSubmitModal({ open: true, subtask: item })}
                            style={item.task?.status === "paused" || item.task?.assigner_paused ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                          >
                            <LuSend size={16} />
                          </button>
                        )}
                        {!["approved", "rejected", "pending", "submitted"].includes(item.status) && !item.is_transferor && (
                          <button
                            className="action-icon-btn"
                            title={t("Transfer Subtask", { defaultValue: "Transfer Subtask" })}
                            onClick={() => setTransferDialog({ open: true, subtask: item })}
                            style={{ color: "#2563EB", cursor: "pointer" }}
                          >
                            <Users size={16} />
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
          onClose={() => { setShowCreateModal(false); setRestoreDraftId(null); }}
          onCreated={() => { setShowCreateModal(false); setRestoreDraftId(null); fetchSubtasks(); }}
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
          onTransferSuccess={() => { setTransferDialog({ open: false, subtask: null }); fetchSubtasks(); showSuccessMessage("Subtask", "transferred"); }}
        />
      )}
    </DashboardLayout>
  );
}

export default Deliveries;

