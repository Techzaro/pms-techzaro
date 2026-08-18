/**
 * DeliveriesByYou.jsx — Subtasks Assigned By You Page
 *
 * Lists all subtasks that the current user has assigned to others.
 * Features identical to Deliveries.jsx but from the assigner's perspective:
 * - Status filter tabs, search, time filter, sortable table, pagination
 * - View modal to review submissions (approve/reject actions)
 * - Deep-linking support via ?selectedDeliverable= param
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import DraggableStatusBadges from "../components/DraggableStatusBadges";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { GoDotFill } from "react-icons/go";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { ArrowUpRight, StickyNote, Pause, Play, Pencil, Trash2, Lock, CheckCircle2, XCircle } from "lucide-react";
import { authToken, getUser, rolePath } from "../utils/auth";
import API_URL from "../config/api";
import { publish } from "../utils/eventBus";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage } from "../utils/notify";
import ConfirmModal from "../components/ConfirmModal";
import CreateDeliverableModel from "../components/layout/CreateDeliverableModel";
import { formatDateTimeInline } from "../utils/formatDateTime";
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import { renderDynamicDates } from "../utils/tableDateUtils";
import SmartDragHandle from "../components/SmartDragHandle";
import Pagination from "../components/Pagination";
import ActionPopover from "../components/ActionPopover";
import AddNoteModal from "../components/AddNoteModal";
import TaskMultiStatusBadges from "../components/TaskMultiStatusBadges";
import "../components/ActionPopover.css";
import "../pages/Deliveries.css";
import "../pages/Task.css";

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
 * DeliveriesByYou — Lists subtasks assigned by the current user to others.
 * Allows viewing submissions and performing approve/reject actions.
 */
function DeliveriesByYou() {
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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [noteModal, setNoteModal] = useState({ open: false, itemId: null });
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

  // Fetch subtasks assigned by the current user from API
  const fetchSubtasks = () => {
    setLoading(true);
    const token = authToken();
    const params = new URLSearchParams();
    if (timeFilter) params.append("time_filter", timeFilter);

    fetch(`${API_URL}/deliverables/assigned-by-me?${params.toString()}`, {
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
  }, [debouncedSearch, timeFilter]);

  useAutoRefresh(fetchSubtasks, { events: ['deliverable:updated', 'deliverable:created', 'deliverable:deleted', 'data:changed'] });

  useEffect(() => {
    const selectedId = searchParams.get("selectedDeliverable");
    if (!selectedId) return;

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("selectedDeliverable");
      return next;
    }, { replace: true });

    const token = authToken();
    fetch(`${API_URL}/deliverables/${selectedId}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.deliverable) {
          navigate(rolePath(`deliveries/deliverable-details/${data.deliverable.id}`), { state: { from: "deliveries-by-you", subtaskIds } });
        }
      })
      .catch(() => { });
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

  const handleSubtaskReorder = useCallback((reordered) => {
    setOrderedSubtasks(reordered);
    const payload = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
    const token = authToken();
    fetch(`${API_URL}/deliverables/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items: payload }),
      _notifHandled: true,
    }).catch(() => { });
  }, []);

  const handleDelete = (itemId) => {
    setDeleteTargetId(itemId);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    const itemId = deleteTargetId;
    setDeleteConfirmOpen(false);
    setDeleteTargetId(null);
    setActingId(itemId);
    setActingType("delete");
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${itemId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      if (res.ok) {
        setSubtasks((prev) => prev.filter((d) => d.id !== itemId));
        publish('deliverable:deleted', { id: itemId });
        publish('data:changed', { type: 'deliverable', action: 'deleted' });
        showSuccessMessage("Subtask", "deleted");
      } else {
        const data = await res.json();
        notify.error(data.message || "Failed to delete.");
      }
    } catch {
      notify.error("Failed to delete.");
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
        notify.error(data.message || "Failed to approve.");
      }
    } catch {
      notify.error("Failed to approve.");
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
        body: JSON.stringify({ comment: "Declined from list" }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setSubtasks((prev) => prev.map((d) => d.id === itemId ? { ...d, status: "rejected", ...data.deliverable } : d));
        publish('deliverable:updated', { id: itemId, status: 'rejected' });
        publish('data:changed', { type: 'deliverable', action: 'updated' });
        showSuccessMessage("Subtask", "declined");
      } else {
        notify.error(data.message || "Failed to decline.");
      }
    } catch {
      notify.error("Failed to decline.");
    } finally {
      setActingId(null);
      setActingType(null);
    }
  };

  const handleAssignerPause = async (itemId) => {
    setActingId(itemId);
    setActingType("assigner_pause");
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${itemId}/assigner-pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: "other" }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setSubtasks((prev) => prev.map((d) => d.id === itemId ? { ...d, assigner_paused: true, ...data.deliverable } : d));
        publish('deliverable:updated', { id: itemId });
        publish('data:changed', { type: 'deliverable', action: 'updated' });
        showSuccessMessage("Subtask", "placed on hold");
      } else {
        notify.error(data.message || "Failed to place on hold.");
      }
    } catch {
      notify.error("Failed to place on hold.");
    } finally {
      setActingId(null);
      setActingType(null);
    }
  };

  const handleAssignerResume = async (itemId) => {
    setActingId(itemId);
    setActingType("assigner_resume");
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${itemId}/assigner-resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setSubtasks((prev) => prev.map((d) => d.id === itemId ? { ...d, assigner_paused: false, ...data.deliverable } : d));
        publish('deliverable:updated', { id: itemId });
        publish('data:changed', { type: 'deliverable', action: 'updated' });
        showSuccessMessage("Subtask", "resumed");
      } else {
        notify.error(data.message || "Failed to resume.");
      }
    } catch {
      notify.error("Failed to resume.");
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
    return map[status] || status;
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
  const abandonedCount = displayItems.filter((i) => i && (i.status === "abandoned" || i.status === "abandon_requested")).length;

  const searchFilteredItems = debouncedSearch
    ? displayItems.filter((item) => {
        if (!item) return false;
        const q = debouncedSearch.toLowerCase();
        const titleMatch = (item.title || "").toLowerCase().includes(q);
        const assigneeMatch = (item.assignee?.name || "").toLowerCase().includes(q);
        return titleMatch || assigneeMatch;
      })
    : displayItems;
  const filteredItems = statusFilter && statusFilter !== "due_today"
    ? searchFilteredItems.filter((item) => {
        if (!item) return false;
        if (statusFilter === "pending") {
          return pendingStatuses.includes(item.status);
        }
        if (statusFilter === "transferred") {
          return Array.isArray(item.delegation_chain) && item.delegation_chain.length > 0;
        }
        if (statusFilter === "abandoned") {
          return item.status === "abandoned" || item.status === "abandon_requested";
        }
        return item.status === statusFilter;
      })
    : searchFilteredItems;

  const safeFilteredItems = Array.isArray(filteredItems) ? filteredItems : [];
  const subtaskIds = safeFilteredItems.map((item) => item.id);

  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(safeFilteredItems.length / (ITEMS_PER_PAGE || 10)));
  const paginatedItems = showAll ? safeFilteredItems : safeFilteredItems.slice((page - 1) * (ITEMS_PER_PAGE || 10), page * (ITEMS_PER_PAGE || 10));

  const breadcrumbs = [
    { label: "Subtasks", path: rolePath("deliveries") },
    { label: "Assigned By You" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="projects-page">
        <div className="projects-header">
          <div>
            <h1>Subtasks Assigned By You</h1>
            <p>Subtasks assigned to others from tasks and projects you created</p>
          </div>
          <div className="header-actions">
            {canCreateSubtask && (
              <button className="add-btn" onClick={() => setShowCreateModal(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                + Create Subtask
              </button>
            )}
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} className="reports-filter">
              <option value="">All Time</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="180">Last 6 Months</option>
            </select>
          </div>
        </div>

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
          storageKey="pms_deliveries_by_you_status_order"
          containerClassName="task-progress"
        />

        <div className="delivery-serach-bar">
          <IoSearchOutline fontSize={"20px"} />
          <input type="text" placeholder="Search by subtask name or assignee" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="container">
          {/* Header - Div based */}
          <div className="deliveries-table-header">
            <div>ID</div>
            <div>Assigned To</div>
            <div>Subtask</div>
            <div>Task</div>
            <div>Status</div>
            <div>Start & Due Date</div>
            <div style={{ textAlign: "center" }}>Action</div>
          </div>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No subtasks found</div>
          ) : (
            <div className="sortable-table-container">
              <SortableTableWrapper items={paginatedItems} onReorder={handleSubtaskReorder} as="div" handleOnly>
              {(item, index, dndProps) => {
                const colors = getRandomColors(item.id);
                const isDirectToOa = item.has_direct_to_oa_delegation && item.current_owner_name && item.current_owner_id;
                const primaryAssignee = isDirectToOa ? { name: item.current_owner_name } : item.assignee;
                return (
                  <div className="deliveries-table-row" key={`subtask-${item.id}-${index}`}>
                    <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} id={item.id} businessId={item.business_id} color="#16a34a" />
                    <div>
                      <div className="user-box">
                        <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                          {getInitials(primaryAssignee?.name)}
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <div className="user-name">{primaryAssignee?.name || "Unassigned"}</div>
                            {item.is_transferee && (
                              <span style={{ fontSize: "10px", fontWeight: 600, color: "#6B7280", background: "#F3F4F6", padding: "1px 6px", borderRadius: "4px", border: "1px solid #D1D5DB" }}>Transferee</span>
                            )}
                          </div>
                          <div className="user-role">{primaryAssignee?.role ? primaryAssignee.role.replace("_", " ") : ""}</div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="user-box">
                        <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                          {getInitials(item.title)}
                        </div>
                        <div>
                          <div className="user-name">{item.delegation_chain && item.delegation_chain.length > 0 && <ArrowUpRight size={14} style={{ color: "#6B7280", flexShrink: 0 }} />} {item.title}</div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="task-title">{item.task?.title || "-"}</div>
                      {(item.project || item.task?.project) && item.task?.title && (
                        <Link to={rolePath(`projects/project-details/${(item.project || item.task.project).id}`)} onClick={(e) => e.stopPropagation()} style={{ fontSize: "11px", color: "#2563eb", textDecoration: "none", marginTop: "2px", display: "inline-block" }}>
                          {(item.project || item.task.project).title}
                        </Link>
                      )}
                    </div>
                    <div className="col-status">
                      <TaskMultiStatusBadges item={item} />
                    </div>
                    <div>
                      <div className="date-box">
                        {renderDynamicDates(item, currentUser)}
                      </div>
                    </div>
                    <div className="col-action" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
                      <ActionPopover
                        trigger={
                          <button className="action-icon-btn action-view action-trigger-lg" title="Actions">
                            <IoEyeOutline size={20} />
                          </button>
                        }
                        onTriggerClick={() => navigate(rolePath(`deliveries/deliverable-details/${item.id}`), { state: { from: "deliveries-by-you", subtaskIds } })}
                      >
                        <button className="action-icon-btn action-note" title="Add Note" onClick={() => setNoteModal({ open: true, itemId: item.id })}><StickyNote size={14} /></button>
                        {item.status?.toLowerCase() !== "approved" && (
                          <button
                            className="action-icon-btn action-edit"
                            title="Edit Subtask"
                            onClick={() => { setEditItem(item); setShowEditModal(true); }}
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                        {item.status?.toLowerCase() !== "approved" && (
                          <button
                            className="action-icon-btn action-delete"
                            title="Delete Subtask"
                            disabled={actingId === item.id}
                            onClick={() => handleDelete(item.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                        {item.status === "submitted" && (
                          <button className="action-icon-btn action-submit" title="Approve" disabled={actingId === item.id} onClick={() => handleApprove(item.id)} style={{ color: "#16A34A" }}>
                            <CheckCircle2 size={16} />
                          </button>
                        )}
                        {item.status === "submitted" && (
                          <button className="action-icon-btn action-submit" title="Decline" disabled={actingId === item.id} onClick={() => handleReject(item.id)} style={{ color: "#DC2626" }}>
                            <XCircle size={16} />
                          </button>
                        )}
                        {["pending", "in_progress", "reopened", "paused"].includes(item.status) && !item.assigner_paused && (
                          <button
                            className="action-icon-btn"
                            title="Put On Hold"
                            disabled={actingId === item.id}
                            onClick={() => handleAssignerPause(item.id)}
                            style={{ color: "#7C3AED", cursor: actingId === item.id ? "not-allowed" : "pointer" }}
                          >
                            <Lock size={16} />
                          </button>
                        )}
                        {item.assigner_paused && (
                          <button
                            className="action-icon-btn"
                            title="Resume"
                            disabled={actingId === item.id}
                            onClick={() => handleAssignerResume(item.id)}
                            style={{ color: "#059669", cursor: actingId === item.id ? "not-allowed" : "pointer" }}
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

      {showCreateModal && (
        <CreateDeliverableModel
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchSubtasks(); }}
        />
      )}

      {showEditModal && editItem && (
        <CreateDeliverableModel
          onClose={(refresh) => { setShowEditModal(false); setEditItem(null); if (refresh) fetchSubtasks(); }}
          projectId={editItem.project_id}
          taskId={editItem.task_id}
          editMode={true}
          editData={editItem}
        />
      )}

      <AddNoteModal
        isOpen={noteModal.open}
        onClose={() => setNoteModal({ open: false, itemId: null })}
        itemType="deliverable"
        itemId={noteModal.itemId}
        onSaved={fetchSubtasks}
      />

      <ConfirmModal
        isOpen={deleteConfirmOpen}
        onClose={() => { setDeleteConfirmOpen(false); setDeleteTargetId(null); }}
        onConfirm={confirmDelete}
        title="Delete Subtask"
        message="Are you sure you want to delete this subtask? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger
      />
    </DashboardLayout>
  );
}

export default DeliveriesByYou;