/**
 * All Tasks page component — Read-only view of all tasks within the user's visibility scope.
 *
 * Displays tasks based on role-based visibility:
 * - Admin: All tasks in the company
 * - Manager: Tasks within managed teams
 * - Team Lead: Tasks within their team
 * - Member: Tasks they are directly involved in
 *
 * This page is strictly read-only — no edit, submit, or workflow actions.
 */

import { useState, useEffect, useCallback } from "react";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { GoDotFill } from "react-icons/go";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { StickyNote } from "lucide-react";
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import SmartDragHandle from "../components/SmartDragHandle";
import Pagination from "../components/Pagination";
import ActionPopover from "../components/ActionPopover";
import TaskNotesPopover from "../components/TaskNotesPopover";
import AddNoteModal from "../components/AddNoteModal";
import API_URL from "../config/api";
import { authToken, getUser, rolePath } from "../utils/auth";
import { formatDateTimeInline, formatDateOnly } from "../utils/formatDateTime";
import "../components/ActionPopover.css";
import "../pages/Task.css";

const STATUS_COLORS = {
  pending: "#FEF3C7",
  in_progress: "#DBEAFE",
  paused: "#FEF3C7",
  submitted: "#DBEAFE",
  reopened: "#EDE9FE",
  approved: "#DCFCE7",
  rejected: "#FEE2E2",
};

const STATUS_TEXT_COLORS = {
  pending: "#92400E",
  in_progress: "#1E40AF",
  paused: "#92400E",
  submitted: "#1E40AF",
  reopened: "#5B21B6",
  approved: "#166534",
  rejected: "#991B1B",
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

/** Main AllTasks page — read-only view of tasks within the user's scope. */
function AllTasks() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const currentUser = getUser();
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

  /** Fetch all tasks from the API with role-based visibility. */
  const fetchTasks = () => {
    setLoading(true);
    const token = authToken();
    const params = new URLSearchParams();
    if (debouncedSearch) params.append("search", debouncedSearch);
    if (statusFilter) params.append("status", statusFilter);
    if (timeFilter) params.append("time_filter", timeFilter);

    fetch(`${API_URL}/all-tasks?${params.toString()}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => {
        setItems(data?.data || []);
        setTotalCount(data?.total ?? 0);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTasks();
  }, [debouncedSearch, statusFilter, timeFilter]);

  useAutoRefresh(fetchTasks, {
    events: ['task:created', 'task:updated', 'task:deleted', 'data:changed'],
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

  const baseItems = orderedItems.length ? orderedItems : items;
  const pendingStatuses = ["pending", "planned", "Planning", "Planned"];
  const inProgressStatuses = ["in_progress", "In Progress", "In-progress"];

  const allCount = baseItems.length;
  const dueTodayCount = baseItems.filter((i) => { const d = i.end_date ? new Date(i.end_date) : null; return d && d.toDateString() === new Date().toDateString(); }).length;
  const pendingCount = baseItems.filter((i) => pendingStatuses.includes(i.status)).length;
  const inProgressCount = baseItems.filter((i) => inProgressStatuses.includes(i.status)).length;
  const pausedCount = baseItems.filter((i) => i.status === "paused").length;
  const submittedCount = baseItems.filter((i) => i.status === "submitted").length;
  const reopenedCount = baseItems.filter((i) => i.status === "reopened").length;
  const approvedCount = baseItems.filter((i) => i.status === "approved").length;
  const rejectedCount = baseItems.filter((i) => i.status === "rejected").length;

  const filteredItems = baseItems.filter((item) => {
    if (statusFilter === "due_today") {
      return true;
    }
    if (statusFilter) {
      if (statusFilter === "pending") {
        return pendingStatuses.includes(item.status);
      }
      return item.status === statusFilter;
    }
    return true;
  });

  const taskIdList = filteredItems.map((i) => i.id);

  const totalPages = showAll ? 1 : Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = showAll ? filteredItems : filteredItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const breadcrumbs = [
    { label: "Tasks", path: rolePath("tasks") },
    { label: "All Tasks" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="Task">
        <div className="task-text">
          <h3>All Tasks</h3>
          <p>Monitor and track tasks across your scope</p>
        </div>

        <div className="task-btns">
          <div className="all-time">
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
              <option value="">All Time</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="180">Last 6 Months</option>
            </select>
          </div>
        </div>
      </div>

      {/* STATUS FILTERS */}
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

      {/* SEARCH BAR */}
      <div className="tasks-search-bar">
        <IoSearchOutline fontSize={"20px"} />
        <input
          type="text"
          placeholder="Search by task name, assigned to, assigned by, or project"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* TABLE */}
      <div className="container">
        <div className="all-tasks-header">
          <div style={{ fontSize: 12, fontWeight: 600 }}>ID</div>
          <div>Assigned To</div>
          <div>Assigned By</div>
          <div>Task Name</div>
          <div>Status</div>
          <div>Progress</div>
          <div>Priority</div>
          <div>Start & Due Date</div>
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
              const assigneeColors = getRandomColors(item.assignees?.[0]?.id || item.id);
              const assignerColors = getRandomColors((item.assigner?.id || 0) + 100);
              const uniqueKey = `all-task-${item.id}-${idx}`;

              const primaryAssignee = item.assignees?.[0];
              const assigner = item.assigner;

              return (
                <div className="all-tasks-row" key={uniqueKey}>
                  <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} businessId={item.business_id} />

                  {/* Assigned To */}
                  <div className="col-assigned-to">
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div className="avatar" style={{ background: assigneeColors.bg, color: assigneeColors.text }}>
                        {getInitials(primaryAssignee?.name)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="user-name">{primaryAssignee?.name || "Unassigned"}</div>
                        <div className="user-role">{primaryAssignee?.role || ""}</div>
                      </div>
                    </div>
                  </div>

                  {/* Assigned By */}
                  <div className="col-assigned-to">
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div className="avatar" style={{ background: assignerColors.bg, color: assignerColors.text }}>
                        {getInitials(assigner?.name)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="user-name">{assigner?.name || "System"}</div>
                        <div className="user-role">{assigner?.role || ""}</div>
                      </div>
                    </div>
                  </div>

                  {/* Task Name */}
                  <div className="col-task-name">
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div className="task-title">{item.title}</div>
                      <TaskNotesPopover taskId={item.id} itemType="task" />
                    </div>
                    {item.project && (
                      <Link to={rolePath(`projects/project-details/${item.project.id}`)} onClick={(e) => e.stopPropagation()} style={{ fontSize: "11px", color: "#2563eb", textDecoration: "none", marginTop: "2px", display: "inline-block" }}>
                        {item.project.title}
                      </Link>
                    )}
                  </div>

                  {/* Status */}
                  <div className="col-status">
                    <span className="badge" style={{ background: STATUS_COLORS[item.status] || "#F3F4F6", color: STATUS_TEXT_COLORS[item.status] || "#374151" }}>
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

                  {/* Progress */}
                  <div className="col-progress">
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "2px" }}>
                      {item.deliverables_progress || 0}%
                    </div>
                    <div className="progress-bar-track" style={{ width: "80px" }}>
                      <div className="progress-bar-fill" style={{ width: `${item.deliverables_progress || 0}%` }}></div>
                    </div>
                    <div style={{ fontSize: "11px", color: "#6b7280", whiteSpace: "nowrap" }}>
                      {item.approved_deliverables || 0}/{item.total_deliverables || 0}
                    </div>
                  </div>

                  {/* Priority */}
                  <div className="col-priority">
                    <span className="badge" style={{ background: PRIORITY_COLORS[item.priority] || "#F3F4F6", color: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}>
                      <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}></span>
                      {item.priority}
                    </span>
                  </div>

                  {/* Start & Due Date */}
                  <div className="col-due-date">
                    <div className="date-box">
                      <div>
                        <span style={{ fontSize: "11px", color: "#9ca3af", fontWeight: 500 }}>Start: </span>
                        {formatDateOnly(item.assignees?.find(a => parseInt(a.id, 10) === parseInt(currentUser?.id, 10))?.pivot?.start_date || item.start_date)}
                      </div>
                      <div>
                        <span style={{ fontSize: "11px", color: "#9ca3af", fontWeight: 500 }}>Due: </span>
                        {formatDateOnly(item.assignees?.find(a => parseInt(a.id, 10) === parseInt(currentUser?.id, 10))?.pivot?.due_date || item.end_date)}
                      </div>
                    </div>
                  </div>

                  {/* Action — View only */}
                  <div className="col-action">
                      <ActionPopover
                        trigger={
                          <button className="action-icon-btn action-view action-trigger-lg" title="Actions">
                            <IoEyeOutline size={20} />
                          </button>
                        }
                        onTriggerClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'all-tasks', readOnly: true } })}
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

      {!showAll && totalPages > 1 && (
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      <AddNoteModal
        isOpen={noteModal.open}
        onClose={() => setNoteModal({ open: false, itemId: null })}
        itemType="task"
        itemId={noteModal.itemId}
        onSaved={fetchTasks}
      />
    </DashboardLayout>
  );
}

export default AllTasks;
