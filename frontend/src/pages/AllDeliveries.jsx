/**
 * AllDeliveries.jsx — All Sub-Tasks Page
 *
 * Read-only view of all deliverables within the user's visibility scope.
 * Mirrors the AllTasks page pattern exactly.
 *
 * Displays deliverables based on role-based visibility:
 * - Admin: All deliverables in the company
 * - Manager: Deliverables within managed teams
 * - Team Lead: Deliverables within their team
 * - Member: Deliverables they are directly involved in
 *
 * This page is strictly read-only — no edit, submit, or workflow actions.
 */
import { useState, useEffect, useMemo } from "react";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import DraggableStatusBadges from "../components/DraggableStatusBadges";
import { GoDotFill } from "react-icons/go";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { ArrowUpRight, StickyNote } from "lucide-react";
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import SmartDragHandle from "../components/SmartDragHandle";
import Pagination from "../components/Pagination";
import ActionPopover from "../components/ActionPopover";
import AddNoteModal from "../components/AddNoteModal";
import TaskMultiStatusBadges from "../components/TaskMultiStatusBadges";
import API_URL from "../config/api";
import { authToken, getUser, rolePath } from "../utils/auth";
import { renderDynamicDates } from "../utils/tableDateUtils";
import { formatDateOnly } from "../utils/formatDateTime";
import "../components/ActionPopover.css";
import "../pages/Deliveries.css";

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

/** Main AllDeliveries page — read-only view of deliverables within the user's scope. */
function AllDeliveries() {
  const currentUser = getUser();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState(() => {
    const status = searchParams.get("status");
    if (status) return status;
    return "";
  });
  const [timeFilter, setTimeFilter] = useState("");
  const [orderedItems, setOrderedItems] = useState([]);
  const [noteModal, setNoteModal] = useState({ open: false, itemId: null });

  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /** Fetch all deliverables from the API with role-based visibility. */
  const fetchDeliverables = () => {
    setLoading(true);
    const token = authToken();
    const params = new URLSearchParams();
    if (timeFilter) params.append("time_filter", timeFilter);

    fetch(`${API_URL}/all-deliverables?${params.toString()}`, {
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
        setItems(raw);
        setTotalCount(data?.total ?? raw.length);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDeliverables();
  }, [debouncedSearch, timeFilter]);

  useAutoRefresh(fetchDeliverables, {
    events: ['deliverable:created', 'deliverable:updated', 'deliverable:deleted', 'data:changed'],
  });

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  useEffect(() => {
    const status = searchParams.get("status") || "";
    setStatusFilter(status);
  }, [searchParams]);

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

  const baseItems = orderedItems.length ? orderedItems : items;

  const pendingStatuses = ["pending", "planned", "Planning", "Planned"];
  const inProgressStatuses = ["in_progress", "In Progress", "In-progress"];

  const safeBaseItems = Array.isArray(baseItems) ? baseItems : [];

  const allCount = useMemo(() => safeBaseItems.length, [safeBaseItems]);
  const dueTodayCount = useMemo(() => safeBaseItems.filter((i) => {
    if (!i || !i.due_date) return false;
    const d = new Date(i.due_date);
    return !isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
  }).length, [safeBaseItems]);
  const pendingCount = useMemo(() => safeBaseItems.filter((i) => i && pendingStatuses.includes(i.status)).length, [safeBaseItems]);
  const inProgressCount = useMemo(() => safeBaseItems.filter((i) => i && inProgressStatuses.includes(i.status)).length, [safeBaseItems]);
  const pausedCount = useMemo(() => safeBaseItems.filter((i) => i && i.status === "paused").length, [safeBaseItems]);
  const submittedCount = useMemo(() => safeBaseItems.filter((i) => i && i.status === "submitted").length, [safeBaseItems]);
  const reopenedCount = useMemo(() => safeBaseItems.filter((i) => i && i.status === "reopened").length, [safeBaseItems]);
  const transferredCount = useMemo(() => safeBaseItems.filter((i) => i && Array.isArray(i.delegation_chain) && i.delegation_chain.length > 0).length, [safeBaseItems]);
  const approvedCount = useMemo(() => safeBaseItems.filter((i) => i && i.status === "approved").length, [safeBaseItems]);
  const rejectedCount = useMemo(() => safeBaseItems.filter((i) => i && i.status === "rejected").length, [safeBaseItems]);
  const abandonedCount = useMemo(() => safeBaseItems.filter((i) => i && (i.status === "abandoned" || i.status === "abandon_requested")).length, [safeBaseItems]);

  const searchFilteredItems = useMemo(() => debouncedSearch
    ? safeBaseItems.filter((item) => {
        if (!item) return false;
        const q = debouncedSearch.toLowerCase();
        const titleMatch = (item.title || "").toLowerCase().includes(q);
        const assigneeMatch = (item.assignee?.name || "").toLowerCase().includes(q);
        const creatorMatch = (item.creator?.name || "").toLowerCase().includes(q);
        return titleMatch || assigneeMatch || creatorMatch;
      })
    : safeBaseItems, [safeBaseItems, debouncedSearch]);
  const filteredItems = useMemo(() => statusFilter && statusFilter !== "due_today"
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
    : searchFilteredItems, [searchFilteredItems, statusFilter]);

  const deliverableIdList = filteredItems.map((i) => i.id);

  const totalPages = showAll ? 1 : Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = showAll ? filteredItems : filteredItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const breadcrumbs = [
    { label: "Subtasks", path: rolePath("deliveries") },
    { label: "All Sub-Tasks" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="projects-page">
        <div className="projects-header">
          <div>
            <h1>All Sub-Tasks</h1>
            <p>Monitor and track subtasks across your scope</p>
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

        {/* STATUS FILTERS */}
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
          storageKey="pms_all_deliveries_status_order"
          containerClassName="task-progress"
        />

        {/* SEARCH BAR */}
        <div className="delivery-serach-bar">
          <IoSearchOutline fontSize={"20px"} />
          <input
            type="text"
            placeholder="Search by subtask name, assigned to, assigned by, parent task, or project"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* TABLE */}
        <div className="container">
          <div className="all-subtasks-header">
            <div>ID</div>
            <div>Assigned To</div>
            <div>Assigned By</div>
            <div>Sub-Task Name</div>
            <div>Parent Task</div>
            <div>Priority</div>
            <div>Status</div>
            <div>Due Date</div>
            <div>Progress</div>
            <div style={{ textAlign: "center" }}>Action</div>
          </div>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No items found</div>
          ) : (
            <SortableTableWrapper
              items={paginatedItems.map((i, index) => ({
                ...i,
                sortableId: `${i.id}-${index}`
              }))}
              onReorder={() => {}}
              idKey="sortableId"
              as="div"
              handleOnly
            >
              {(item, idx, dndProps) => {
                const assigneeColors = getRandomColors(item.assignee?.id || item.id);
                const creatorColors = getRandomColors((item.creator?.id || 0) + 100);
                const uniqueKey = `all-subtask-${item.id}-${idx}`;

                return (
                  <div className="all-subtasks-row" key={uniqueKey}>
                    <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} id={item.id} businessId={item.business_id} color="#16a34a" />

                    {/* Assigned To */}
                    <div className="col-assigned-to">
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div className="avatar" style={{ background: assigneeColors.bg, color: assigneeColors.text }}>
                          {getInitials(item.assignee?.name)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="user-name">{item.assignee?.name || "Unassigned"}</div>
                          <div className="user-role">{item.assignee?.role || ""}</div>
                        </div>
                      </div>
                    </div>

                    {/* Assigned By (Creator) */}
                    <div className="col-assigned-by">
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div className="avatar" style={{ background: creatorColors.bg, color: creatorColors.text }}>
                          {getInitials(item.creator?.name)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="user-name">{item.creator?.name || "System"}</div>
                          <div className="user-role">{item.creator?.role || ""}</div>
                        </div>
                      </div>
                    </div>

                    {/* Sub-Task Name */}
                    <div className="col-subtask-name">
                      {item.delegation_chain && item.delegation_chain.length > 0 && <ArrowUpRight size={14} style={{ color: "#6B7280", flexShrink: 0 }} />}
                      <div className="task-title">{item.title}</div>
                    </div>

                    {/* Parent Task */}
                    <div className="col-parent-task">
                      <div>
                        <div className="task-title">{item.task?.title || "-"}</div>
                      </div>
                    </div>

                    {/* Priority */}
                    <div className="col-priority">
                      <span className="badge" style={{ background: PRIORITY_COLORS[item.priority] || "#F3F4F6", color: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}>
                        <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}></span>
                        {item.priority}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="col-status">
                      <TaskMultiStatusBadges item={item} />
                    </div>

                    {/* Due Date */}
                    <div className="col-due-date">
                      <div className="date-box">
                        {renderDynamicDates(item, currentUser)}
                      </div>
                    </div>

                    {/* Progress (Submission Status) */}
                    <div className="col-progress">
                      <span className="badge" style={{
                        background: STATUS_COLORS[item.submission_status] || "#F3F4F6",
                        color: STATUS_TEXT_COLORS[item.submission_status] || "#374151",
                        fontSize: "11px",
                      }}>
                        <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.submission_status] || "#374151" }}></span>
                        {formatStatus(item.submission_status)}
                      </span>
                    </div>

                    {/* Action — View only */}
                    <div className="col-action" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
                      <ActionPopover
                        trigger={
                          <button className="action-icon-btn action-view action-trigger-lg" title="Actions">
                            <IoEyeOutline size={20} />
                          </button>
                        }
                        onTriggerClick={() => navigate(rolePath(`deliveries/deliverable-details/${item.id}`), { state: { subtaskIds: deliverableIdList, from: 'all-deliverables', readOnly: true } })}
                      >
                        <button
                          className="action-icon-btn action-note"
                          title="Add Note"
                          onClick={() => setNoteModal({ open: true, itemId: item.id })}
                        >
                          <StickyNote size={16} />
                        </button>
                      </ActionPopover>
                    </div>
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

      <AddNoteModal
        isOpen={noteModal.open}
        onClose={() => setNoteModal({ open: false, itemId: null })}
        itemType="deliverable"
        itemId={noteModal.itemId}
        onSaved={fetchDeliverables}
      />
    </DashboardLayout>
  );
}

export default AllDeliveries;
