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
import { useAutoRefresh } from "../utils/useAutoRefresh";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { GoDotFill } from "react-icons/go";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { StickyNote } from "lucide-react";
import { authToken, getUser, rolePath } from "../utils/auth";
import API_URL from "../config/api";
import CreateDeliverableModel from "../components/layout/CreateDeliverableModel";
import { formatDateTimeInline } from "../utils/formatDateTime";
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import SmartDragHandle from "../components/SmartDragHandle";
import Pagination from "../components/Pagination";
import ActionPopover from "../components/ActionPopover";
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
};

/**
 * DeliveriesByYou — Lists subtasks assigned by the current user to others.
 * Allows viewing submissions and performing approve/reject actions.
 */
function DeliveriesByYou() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
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
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const ITEMS_PER_PAGE = 10;

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
    if (debouncedSearch) params.append("search", debouncedSearch);
    if (statusFilter) params.append("status", statusFilter);
    if (timeFilter) params.append("time_filter", timeFilter);

    fetch(`${API_URL}/deliverables/assigned-by-me?${params.toString()}`, {
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
  }, [debouncedSearch, statusFilter, timeFilter]);

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
          navigate(rolePath(`deliveries/deliverable-details/${data.deliverable.id}`), { state: { from: "deliveries-by-you" } });
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
    };
    return map[status] || status;
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
  const approvedCount = displayItems.filter((i) => i.status === "approved").length;
  const rejectedCount = displayItems.filter((i) => i.status === "rejected").length;

  const filteredItems = statusFilter && statusFilter !== "due_today"
    ? displayItems.filter((item) => {
        if (statusFilter === "pending") {
          return pendingStatuses.includes(item.status);
        }
        return item.status === statusFilter;
      })
    : displayItems;

  const totalPages = showAll ? 1 : Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = showAll ? filteredItems : filteredItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

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

        <div className="task-progress">
          <p className={`All ${!statusFilter ? "active" : ""}`} onClick={() => selectStatusFilter("")} style={{ cursor: "pointer" }}>All ({allCount})</p>
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
          <p className={`Approved ${statusFilter === "approved" ? "active" : ""}`} onClick={() => selectStatusFilter("approved")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Approved ({approvedCount})
          </p>
          <p className={`Rejected ${statusFilter === "rejected" ? "active" : ""}`} onClick={() => selectStatusFilter("rejected")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Declined ({rejectedCount})
          </p>
        </div>

        <div className="delivery-serach-bar">
          <IoSearchOutline fontSize={"20px"} />
          <input type="text" placeholder="Search by subtask name" value={search} onChange={(e) => setSearch(e.target.value)} />
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
            <div>Action</div>
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
                return (
                  <div className="deliveries-table-row" key={`subtask-${item.id}-${index}`}>
                    <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} businessId={item.business_id} color="#16a34a" />
                    <div>
                      <div className="user-box">
                        <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                          {getInitials(item.assignee?.name)}
                        </div>
                        <div>
                          <div className="user-name">{item.assignee?.name || "Unassigned"}</div>
                          <div className="user-role">{item.assignee?.role ? item.assignee.role.replace("_", " ") : ""}</div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="user-box">
                        <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                          {getInitials(item.title)}
                        </div>
                        <div>
                          <div className="user-name">{item.title}</div>
                          {item.project && (
                            <Link to={rolePath(`projects/project-details/${item.project.id}`)} onClick={(e) => e.stopPropagation()} style={{ fontSize: "11px", color: "#2563eb", textDecoration: "none", marginTop: "2px", display: "inline-block" }}>
                              {item.project.title}
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="task-title">{item.task?.title || item.project?.title || "-"}</div>
                      {(item.project || item.task?.project) && item.task?.title && (
                        <Link to={rolePath(`projects/project-details/${(item.project || item.task.project).id}`)} onClick={(e) => e.stopPropagation()} style={{ fontSize: "11px", color: "#2563eb", textDecoration: "none", marginTop: "2px", display: "inline-block" }}>
                          {(item.project || item.task.project).title}
                        </Link>
                      )}
                    </div>
                    <div>
                      <span className="badge" style={{
                        background: STATUS_COLORS[item.status] || "#F3F4F6",
                        color: STATUS_TEXT_COLORS[item.status] || "#374151",
                        padding: "4px 10px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 600
                      }}>
                        <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.status] || "#374151" }}></span>
                        {formatStatus(item.status)}
                      </span>
                    </div>
                    <div>
                      <div className="date-box">
                        <div style={{ whiteSpace: "pre-line" }}>{formatDateTimeInline(item.start_date)}{"\n"}{formatDateTimeInline(item.due_date)}</div>
                      </div>
                    </div>
                    <div>
                      <ActionPopover
                        trigger={
                          <button className="action-icon-btn action-view action-trigger-lg" title="Actions">
                            <IoEyeOutline size={20} />
                          </button>
                        }
                      >
                        <button
                          className="action-icon-btn action-view"
                          title="View"
                          onClick={() => navigate(rolePath(`deliveries/deliverable-details/${item.id}`), { state: { from: "deliveries-by-you" } })}
                        >
                          <IoEyeOutline size={16} />
                        </button>
                        <button className="action-icon-btn action-note" title="Add Note" onClick={() => setNoteModal({ open: true, itemId: item.id })}><StickyNote size={14} /></button>
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

      {!showAll && totalPages > 1 && (
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      {showCreateModal && (
        <CreateDeliverableModel
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchSubtasks(); }}
        />
      )}
    </DashboardLayout>
  );
}

export default DeliveriesByYou;