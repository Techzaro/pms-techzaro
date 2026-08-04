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
import { useState, useEffect, useCallback, useRef } from "react";
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
  const ITEMS_PER_PAGE = 10;

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

    fetch(`${API_URL}/deliverables?${params.toString()}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => {
        const items = data?.data;
        setSubtasks(Array.isArray(items) ? items : (Array.isArray(items?.data) ? items.data : []));
      })
      .catch(() => setSubtasks([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSubtasks();
  }, [debouncedSearch, timeFilter]);

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
        notify.error(data.message || "Failed to acknowledge.");
      }
    } catch {
      notify.error("Failed to acknowledge.");
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
        notify.error(data.message || "Failed to pause.");
      }
    } catch {
      notify.error("Failed to pause.");
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

  const displayItems = orderedSubtasks.length ? orderedSubtasks : subtasks;
  const currentUser = getUser();
  const canCreateSubtask = currentUser && ["admin", "manager", "team_lead"].includes(currentUser.role);

  const pendingStatuses = ["pending", "planned", "Planning", "Planned"];
  const inProgressStatuses = ["in_progress", "In Progress", "In-progress"];

  const allCount = displayItems.length;
  const dueTodayCount = displayItems.filter((i) => { const d = i.due_date ? new Date(i.due_date) : null; return d && d.toDateString() === new Date().toDateString(); }).length;
  const pendingCount = displayItems.filter((i) => pendingStatuses.includes(i.status)).length;
  const inProgressCount = displayItems.filter((i) => inProgressStatuses.includes(i.status)).length;
  const pausedCount = displayItems.filter((i) => i.status === "paused").length;
  const submittedCount = displayItems.filter((i) => i.status === "submitted").length;
  const reopenedCount = displayItems.filter((i) => i.status === "reopened").length;
  const transferredCount = displayItems.filter((i) => i.delegation_chain && i.delegation_chain.length > 0).length;
  const approvedCount = displayItems.filter((i) => i.status === "approved").length;
  const rejectedCount = displayItems.filter((i) => i.status === "rejected").length;
  const abandonedCount = displayItems.filter((i) => i.status === "abandoned" || i.status === "abandon_requested").length;

  const searchFilteredItems = debouncedSearch
    ? displayItems.filter((item) => {
        const q = debouncedSearch.toLowerCase();
        const titleMatch = (item.title || "").toLowerCase().includes(q);
        const assigneeMatch = (item.assignee?.name || "").toLowerCase().includes(q);
        return titleMatch || assigneeMatch;
      })
    : displayItems;
  const filteredItems = statusFilter && statusFilter !== "due_today"
    ? searchFilteredItems.filter((item) => {
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
      })
    : searchFilteredItems;

  const subtaskIds = filteredItems.map((item) => item.id);

  const totalPages = showAll ? 1 : Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = showAll ? filteredItems : filteredItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const breadcrumbs = [
    { label: "Subtasks", path: rolePath("deliveries") },
    { label: "Assigned To You" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="projects-page">
        <div className="projects-header">
          <div>
            <h1>Subtasks Assigned To You</h1>
            <p>Manage and track your subtasks</p>
          </div>
          <div className="header-actions">
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} className="reports-filter">
              <option value="">All Time</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="180">Last 6 Months</option>
            </select>
          </div>
        </div>

        <div className="task-progress">
          <p className={`DueToday ${statusFilter === "due_today" ? "active" : ""}`} onClick={() => selectStatusFilter("due_today")} style={{ cursor: "pointer" }}>
            <GoDotFill color="#EF4444" /> Due Today ({dueTodayCount})
          </p>
          <p className={`Pending ${statusFilter === "pending" ? "active" : ""}`} onClick={() => selectStatusFilter("pending")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Pending ({pendingCount})
          </p>
          <p className={`InProgress ${statusFilter === "in_progress" ? "active" : ""}`} onClick={() => selectStatusFilter("in_progress")} style={{ cursor: "pointer" }}>
            <GoDotFill /> In Progress ({inProgressCount})
          </p>
          <p className={`Paused ${statusFilter === "paused" ? "active" : ""}`} onClick={() => selectStatusFilter("paused")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Paused ({pausedCount})
          </p>
          <p className={`Submitted ${statusFilter === "submitted" ? "active" : ""}`} onClick={() => selectStatusFilter("submitted")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Submitted ({submittedCount})
          </p>
          <p className={`Reopened ${statusFilter === "reopened" ? "active" : ""}`} onClick={() => selectStatusFilter("reopened")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Reopened ({reopenedCount})
          </p>
          <p className={`Transferred ${statusFilter === "transferred" ? "active" : ""}`} onClick={() => selectStatusFilter("transferred")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Transferred ({transferredCount})
          </p>
          <p className={`Approved ${statusFilter === "approved" ? "active" : ""}`} onClick={() => selectStatusFilter("approved")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Approved ({approvedCount})
          </p>
          <p className={`Rejected ${statusFilter === "rejected" ? "active" : ""}`} onClick={() => selectStatusFilter("rejected")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Declined ({rejectedCount})
          </p>
          <p className={`Abandoned ${statusFilter === "abandoned" ? "active" : ""}`} onClick={() => selectStatusFilter("abandoned")} style={{ cursor: "pointer" }}>
            <GoDotFill color="#DC2626" /> Abandoned ({abandonedCount})
          </p>
          <p className={`All ${!statusFilter ? "active" : ""}`} onClick={() => selectStatusFilter("")} style={{ cursor: "pointer" }}>All ({allCount})</p>
        </div>

        <div className="delivery-serach-bar">
          <IoSearchOutline fontSize={"20px"} />
          <input type="text" placeholder="Search by subtask name or assignee" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="container">
          <div className="deliveries-table-header">
            <div>ID</div>
            <div>Assigned By</div>
            <div>Subtask</div>
            <div>Task</div>
            <div>Status</div>
            <div>Start & Due Date</div>
            <div>Action</div>
          </div>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No subtasks found</div>
          ) : (
            <SortableTableWrapper items={paginatedItems} onReorder={handleSubtaskReorder} as="div" handleOnly>
              {(item, idx, dndProps) => {
                const colors = getRandomColors(item.id);
                const hasChain = item.delegation_chain && item.delegation_chain.length > 0;
                const displayName = item.transferred_by_name || item.creator?.name || "-";
                const displayRole = item.transferred_by_name ? "Transferred" : (item.creator?.role ? item.creator.role.replace("_", " ") : "");
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
                        <div className="user-name">{item.title}</div>
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
                    <div>
                      <span className="badge" style={{ background: STATUS_COLORS[item.status] || "#F3F4F6", color: STATUS_TEXT_COLORS[item.status] || "#374151", padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 600 }}>
                        <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.status] || "#374151" }}></span>
                        {formatStatus(item.status)}
                      </span>
                      {item.status === "approved" && item.approvedBy && (
                        <div style={{ fontSize: "10px", color: "#166534", marginTop: "2px" }}>by {item.approvedBy.name}</div>
                      )}
                      {item.status === "rejected" && item.rejectedBy && (
                        <div style={{ fontSize: "10px", color: "#991B1B", marginTop: "2px" }}>by {item.rejectedBy.name}</div>
                      )}
                      {item.status === "reopened" && item.reopenedBy && (
                        <div style={{ fontSize: "10px", color: "#92400E", marginTop: "2px" }}>by {item.reopenedBy.name}</div>
                      )}
                    </div>
                    <div className="date-box">
                      <div style={{ whiteSpace: "pre-line" }}>{formatDateTimeInline(item.start_date)}{"\n"}{formatDateTimeInline(item.due_date)}</div>
                    </div>
                    <ActionPopover
                      trigger={
                        <button className="action-icon-btn action-view action-trigger-lg" title="Actions">
                          <IoEyeOutline size={20} />
                        </button>
                      }
                      onTriggerClick={() => navigate(rolePath(`deliveries/deliverable-details/${item.id}`), { state: { from: "deliveries", subtaskIds } })}
                    >
                      {(() => {
                        if (item.is_transferor) return (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "#EFF6FF", color: "#1D4ED8", fontSize: "11px", fontWeight: 600 }}>
                            Transferred
                          </span>
                        );
                        return (
                      <>
                      <button className="action-icon-btn action-note" title="Add Note" onClick={() => setNoteModal({ open: true, itemId: item.id })}><StickyNote size={14} /></button>
                      {item.status === "pending" && (
                        <button className="action-icon-btn action-submit" title="Acknowledge" disabled={actingId === item.id} onClick={() => handleAcknowledge(item.id)}>
                          <CheckCircle2 size={16} />
                        </button>
                      )}
                      {item.status === "in_progress" && !item.assigner_paused && canUserPauseResume(item, currentUser) && (
                        <button className="action-icon-btn action-submit" title="Pause" disabled={actingId === item.id} onClick={() => handlePause(item.id)} style={{ color: "#D97706" }}>
                          <Pause size={16} />
                        </button>
                      )}
                      {item.status === "paused" && !item.assigner_paused && canUserPauseResume(item, currentUser) && (
                        <button className="action-icon-btn action-submit" title="Resume" disabled={actingId === item.id} onClick={() => handleResume(item.id)} style={{ color: "#059669" }}>
                          <Play size={16} />
                        </button>
                      )}
                      {item.assigner_paused && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "#FEF3C7", color: "#92400E", fontSize: "11px", fontWeight: 600, border: "1px solid #F59E0B" }}>
                          <Lock size={12} />
                          On Hold
                        </span>
                      )}
                      {(item.status === "pending" || item.status === "rejected" || item.status === "reopened") && (
                        <button
                          className="action-icon-btn action-submit"
                          title={item.task?.status === "paused" ? "Parent task is paused. Resume the task first." : item.task?.assigner_paused ? "Parent task is on hold by assigner." : "Submit Subtask"}
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
                          title="Transfer Subtask"
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
                );
              }}
            </SortableTableWrapper>
          )}
        </div>
      </div>

      {!showAll && totalPages > 1 && (
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
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
