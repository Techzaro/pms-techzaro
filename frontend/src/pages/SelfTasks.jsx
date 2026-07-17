/**
 * SelfTasks page component.
 *
 * Displays tasks that the current user assigned to themselves.
 * Includes search with debounce, status filtering, time-range filtering,
 * drag-and-drop reordering and pagination.  Modals are available for
 * creating new tasks and submitting subtasks.
 */

import { useState, useEffect, useCallback } from "react";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { GoDotFill } from "react-icons/go";
import { Link, useNavigate } from "react-router-dom";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";
import CreateTaskModal from "../components/CreateTaskModal";
import SubmitTaskModal from "../components/SubmitTaskModal";
import SubmitDeliverableModal from "../components/SubmitDeliverableModal"; // Added missing import
import SelfDeliverableViewModal from "../components/SelfDeliverableViewModal"; // Added missing import
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import Pagination from "../components/Pagination";
import API_URL from "../config/api";
import { authToken, getUser, rolePath } from "../utils/auth";
import { formatDateTimeInline } from "../utils/formatDateTime";
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

/** Main Self Tasks page — renders tasks assigned by the current user to themselves. */
const SelfTasks = () => {
  const navigate = useNavigate();
  const currentUser = getUser();
  
  // State declarations
  const [showTaskModal, setShowTaskModal] = useState({ open: false, projectId: null, id: null }); // Fixed to object
  const [showSubtaskSubmitModal, setShowSubtaskSubmitModal] = useState({ open: false, subtask: null }); // Added missing state
  const [submitTaskModal, setSubmitTaskModal] = useState({ open: false, task: null });
  const [viewModal, setViewModal] = useState({ open: false, subtask: null }); // Added missing state
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [orderedItems, setOrderedItems] = useState([]);
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const ITEMS_PER_PAGE = 10;

  const selectStatusFilter = (filter) => {
    setStatusFilter(filter);
    setShowAll(!filter);
    setPage(1);
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /** Fetch self-assigned tasks/projects from the API with current filters. */
  const fetchTasks = () => {
    setLoading(true);
    const token = authToken();
    const params = new URLSearchParams();
    if (debouncedSearch) params.append("search", debouncedSearch);
    if (statusFilter) params.append("status", statusFilter);
    if (timeFilter) params.append("time_filter", timeFilter);

    fetch(`${API_URL}/self-tasks?${params.toString()}`, {
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
    pollInterval: 30000,
  });

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  const handleTaskReorder = useCallback((reordered) => {
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

  const handleModalClose = (refresh) => {
    setShowTaskModal({ open: false, projectId: null, id: null });
    if (refresh) fetchTasks();
  };

  const handleTaskCreated = () => {
    fetchTasks();
  };

  const handleSubtaskSubmitSuccess = () => {
    fetchTasks();
  };

  const handleTaskSubmitSuccess = () => {
    fetchTasks();
  };

  const handleSubtaskUpdate = () => {
    fetchTasks();
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
  const pendingStatuses = ["pending", "in_progress", "paused", "In Progress", "In-progress", "planned", "Planning", "Planned", "submitted", "reopened", "rejected"];
  const filteredItems = statusFilter && statusFilter !== "due_today"
    ? baseItems.filter((item) => {
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
    { label: "Self Tasks" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="Task">
        <div className="task-text">
          <h3>Self Tasks</h3>
          <p>Tasks you assigned to yourself</p>
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
            onClick={() => setShowTaskModal({ open: true, projectId: null, id: Date.now() })}
            style={{ whiteSpace: "nowrap" }}
          >
            + Task
          </button>
        </div>
      </div>

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
          <GoDotFill /> Declined
        </p>
      </div>

      <div className="tasks-search-bar">
        <IoSearchOutline fontSize={"20px"} />
        <input
          type="text"
          placeholder="Search by task name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="container">
        <div className="table-header-compact">
          <div></div>
          <div>Task Name</div>
          <div>Status</div>
          <div>Progress</div>
          <div>Priority</div>
          <div>Start & Due Date</div>
          <div>Action</div>
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No items found</div>
        ) : (
          <SortableTableWrapper 
            as="div" 
            items={paginatedItems.map((i) => ({ ...i, sortableId: `task-${i.id}` }))} 
            onReorder={(reordered) => handleTaskReorder(reordered)} 
            idKey="sortableId"
            handleOnly
          >
            {(item, idx, dndProps) => {
              return (
                <div className="taskby-row-compact" key={item.sortableId}>
                  <DragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} />
                  <div>
                    <div className="task-title">{item.title}</div>
                    {item.project && (
                      <Link to={rolePath(`projects/project-details/${item.project.id}`)} onClick={(e) => e.stopPropagation()} style={{ fontSize: "11px", color: "#2563eb", textDecoration: "none", marginTop: "2px", display: "inline-block" }}>
                        {item.project.title}
                      </Link>
                    )}
                  </div>
                  <div>
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
                    <div className="progress-bar-track"><div className="progress-bar-fill" style={{ width: `${item.deliverables_progress || 0}%` }}></div></div>
                    <div style={{ fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.approved_deliverables || 0}/{item.total_deliverables || 0} subtasks
                    </div>
                  </div>
                  <div>
                    <span className="badge" style={{ background: PRIORITY_COLORS[item.priority] || "#F3F4F6", color: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}>
                      <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}></span>
                      {item.priority}
                    </span>
                  </div>
                  <div className="date-box">
                    <div style={{ whiteSpace: "pre-line" }}>{formatDate(item.start_date)}{"\n"}{formatDate(item.end_date)}</div>
                  </div>
                  <div className="action-btns">
                    <button className="action-icon-btn action-view" title="View" onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'self-tasks' } })}><IoEyeOutline /></button>
                    {(() => {
                      const myPivotStatus = item.assignees?.find(a => parseInt(a.id, 10) === parseInt(currentUser?.id, 10))?.pivot?.status;
                      const canSubmit = (item.status === "in_progress" || item.status === "reopened" || item.status === "paused") && myPivotStatus !== "submitted";
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
              );
            }}
          </SortableTableWrapper>
        )}
      </div>

      {!showAll && totalPages > 1 && (
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      )}

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
    </DashboardLayout>
  );
};

export default SelfTasks;