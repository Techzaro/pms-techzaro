/**
 * Tasks page component — "Tasks Assigned To You".
 *
 * Displays tasks that have been assigned to the current user
 * by others.  Provides search with debounce, status filtering, time-range
 * filtering, drag-and-drop reordering and pagination.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { GoDotFill } from "react-icons/go";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";
import CreateTaskModal from "../components/CreateTaskModal";
import SubmitTaskModal from "../components/SubmitTaskModal";
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import Pagination from "../components/Pagination";
import API_URL from "../config/api";
import { authToken, getUser, rolePath } from "../utils/auth";
import { formatDateTimeInline } from "../utils/formatDateTime";
import "../pages/Task.css";

const STATUS_COLORS = {
  pending: "#FEF3C7",
  in_progress: "#DBEAFE",
  submitted: "#DBEAFE",
  reopened: "#EDE9FE",
  approved: "#DCFCE7",
  rejected: "#FEE2E2",
};

const STATUS_TEXT_COLORS = {
  pending: "#92400E",
  in_progress: "#1E40AF",
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

/** Main Tasks page — renders tasks assigned to the current user by others. */
function Tasks() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [orderedItems, setOrderedItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const currentUser = getUser();
  const [statusFilter, setStatusFilter] = useState(() => {
    const status = searchParams.get("status");
    if (status) return status;
    return "";
  });
  const [timeFilter, setTimeFilter] = useState("");
  const [submitTaskModal, setSubmitTaskModal] = useState({ open: false, task: null });

  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /** Fetch tasks assigned to the current user from the API. */
  const fetchTasks = () => {
    setLoading(true);
    const token = authToken();
    const params = new URLSearchParams();
    if (debouncedSearch) params.append("search", debouncedSearch);
    if (statusFilter) params.append("status", statusFilter);

    fetch(`${API_URL}/my-tasks?${params.toString()}`, {
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
  }, [debouncedSearch, statusFilter]);

  useRefreshOnEvent(['task:created', 'task:updated', 'task:deleted'], fetchTasks);

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  const handleTaskListReorder = useCallback((reordered) => {
    setOrderedItems(reordered);
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

  useEffect(() => {
    const nextFilter = searchParams.get("status") || "";
    setStatusFilter((current) => {
      if (nextFilter === "due_today" || current === "due_today" || nextFilter !== current) {
        return nextFilter;
      }
      return current;
    });
  }, [searchParams]);

  const selectStatusFilter = (filter) => {
    setStatusFilter(filter);
    setShowAll(!filter);
    setPage(1);
    if (filter) {
      setSearchParams({ status: filter });
    } else {
      setSearchParams({});
    }
  };

  const handleModalClose = (refresh) => {
    setShowTaskModal(false);
    if (refresh) fetchTasks();
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
      submitted: "Submitted",
      reopened: "Reopened",
      approved: "Approved",
      rejected: "Rejected",
    };
    return map[status] || status;
  };

  const handleTaskSubmitSuccess = (updatedTask) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === updatedTask.id
          ? { ...item, ...updatedTask }
          : item
      )
    );
  };



  const baseItems = orderedItems.length ? orderedItems : items;
  const pendingStatuses = ["pending", "in_progress", "In Progress", "In-progress", "planned", "Planning", "Planned", "submitted", "reopened", "rejected"];
  const filteredItems = statusFilter && statusFilter !== "due_today"
    ? items.filter((item) => {
        if (statusFilter === "pending") {
          return pendingStatuses.includes(item.status);
        }
        return item.status === statusFilter;
      })
    : baseItems;

  const taskIdList = filteredItems.map((i) => i.id);

  const totalPages = showAll ? 1 : Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = showAll ? filteredItems : filteredItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const breadcrumbs = [
    { label: "Tasks", path: rolePath("tasks") },
    { label: "Assigned To You" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="Task">
        <div className="task-text">
          <h3>Tasks Assigned To You</h3>
          <p>Manage and track your tasks and projects</p>
          <div className="task-count-badge" style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
            <span style={{ background: "#dedfe0", color: "#4338CA", padding: "4px 12px", borderRadius: "20px", fontSize: "15px", fontWeight: 600 }}>
              Total: {totalCount} items
            </span>
            <span style={{ background: "#d6d6d6", color: "#166534", padding: "4px 12px", borderRadius: "20px", fontSize: "15px", fontWeight: 600 }}>
              Tasks: {filteredItems.length}
            </span>
          </div>
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

          <button
            className="export task-btn--mobile"
            onClick={() => setShowTaskModal(true)}
            style={{ whiteSpace: "nowrap" }}
          >
            + Task
          </button>
        </div>
      </div>

      {showTaskModal && (
        <CreateTaskModal onClose={handleModalClose} />
      )}

      {/* STATUS FILTERS */}
      <div className="task-progress">
        <p className={`All ${!statusFilter ? "active" : ""}`} onClick={() => selectStatusFilter("")} style={{ cursor: "pointer" }}>All</p>
        <p className={`DueToday ${statusFilter === "due_today" ? "active" : ""}`} onClick={() => selectStatusFilter("due_today")} style={{ cursor: "pointer" }}>
          <GoDotFill color="#EF4444" /> Due Today
        </p>
        <p className={`Pending ${statusFilter === "pending" ? "active" : ""}`} onClick={() => selectStatusFilter("pending")} style={{ cursor: "pointer" }}>
          <GoDotFill /> Pending
        </p>
        <p className={`Submitted ${statusFilter === "submitted" ? "active" : ""}`} onClick={() => selectStatusFilter("submitted")} style={{ cursor: "pointer" }}>
          <GoDotFill /> Submitted
        </p>
        <p className={`Reopened ${statusFilter === "reopened" ? "active" : ""}`} onClick={() => selectStatusFilter("reopened")} style={{ cursor: "pointer" }}>
          <GoDotFill /> Reopened
        </p>
        <p className={`Approved ${statusFilter === "approved" ? "active" : ""}`} onClick={() => selectStatusFilter("approved")} style={{ cursor: "pointer" }}>
          <GoDotFill /> Approved
        </p>
        <p className={`Rejected ${statusFilter === "rejected" ? "active" : ""}`} onClick={() => selectStatusFilter("rejected")} style={{ cursor: "pointer" }}>
          <GoDotFill /> Rejected
        </p>
      </div>

      {/* SEARCH BAR */}
      <div className="tasks-search-bar">
        <IoSearchOutline fontSize={"20px"} />
        <input
          type="text"
          placeholder="Search by task name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* TABLE */}
      <div className="container">
        <div className="table-header1">
          <div></div>
          <div>Assigned by</div>
          <div className="task-name-column">Task Name</div>
          <div className="status-column">Status</div>
          <div>Progress</div>
          <div className="priority-column">Priority</div>
          <div className="date-column">Start & Due Date</div>
          <div>Action</div>
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No items found</div>
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

              const assigner = item.assigner;
              return (
                <div className="taskby-row" key={item.sortableId}>
                  <DragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} />
                  <div className="col-assigned-to">
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div className="avatar" style={{ background: colors.bg, color: colors.text }}>{getInitials(assigner?.name)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="user-name">{assigner?.name || "System"}</div>
                        <div className="user-role">{assigner?.role || ""}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="col-task-name">
                    <div className="task-title">{item.title}</div>
                    {item.project && (
                      <Link to={rolePath(`projects/project-details/${item.project.id}`)} onClick={(e) => e.stopPropagation()} style={{ fontSize: "11px", color: "#2563eb", textDecoration: "none", marginTop: "2px", display: "inline-block" }}>
                        {item.project.title}
                      </Link>
                    )}
                  </div>
                  
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
                  
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
                      {item.deliverables_progress || 0}%
                    </div>
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${item.deliverables_progress || 0}%` }}></div>
                    </div>
                    <div style={{ fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.approved_deliverables || 0}/{item.total_deliverables || 0} subtasks
                    </div>
                  </div>
                  
                  <div className="col-priority">
                    <span className="badge" style={{ background: PRIORITY_COLORS[item.priority] || "#F3F4F6", color: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}>
                      <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}></span>
                      {item.priority}
                    </span>
                  </div>
                  
                  <div className="col-due-date">
                    <div className="date-box">
                      <div style={{ whiteSpace: "pre-line" }}>
                        {(() => {
                          const myPivotStart = item.assignees?.find(a => parseInt(a.id, 10) === parseInt(currentUser?.id, 10))?.pivot?.start_date;
                          return formatDate(myPivotStart || item.start_date);
                        })()}
                        {"\n"}
                        {(() => {
                          const myPivot = item.assignees?.find(a => parseInt(a.id, 10) === parseInt(currentUser?.id, 10))?.pivot?.due_date;
                          return formatDate(myPivot || item.end_date);
                        })()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="col-action">
                    <div className="action-btns">
                      <button className="action-icon-btn action-view" title="View" onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'tasks' } })}><IoEyeOutline /></button>
                      {(() => {
                        const myPivotStatus = item.assignees?.find(a => parseInt(a.id, 10) === parseInt(currentUser?.id, 10))?.pivot?.status;
                        const canSubmit = (item.status === "in_progress" || item.status === "reopened") && myPivotStatus !== "submitted";
                        return canSubmit && (
                        <div style={{ position: "relative", display: "inline-flex" }}>
                          <button 
                            className="action-icon-btn action-submit" 
                            title={item.pending_deliverables_count > 0 ? "Submit all subtasks first" : "Submit Task"} 
                            disabled={item.pending_deliverables_count > 0} 
                            onClick={() => !item.pending_deliverables_count && setSubmitTaskModal({ open: true, task: item })} 
                            style={item.pending_deliverables_count > 0 ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                          >
                            <LuSend />
                          </button>
                        </div>
                        );
                      })()}
                    </div>
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

      <SubmitTaskModal
        key={`tasks-submit-${submitTaskModal.task?.id || "none"}`}
        isOpen={submitTaskModal.open}
        onClose={() => setSubmitTaskModal({ open: false, task: null })}
        task={submitTaskModal.task}
        onSubmitSuccess={handleTaskSubmitSuccess}
      />

    </DashboardLayout>
  );
}

export default Tasks;