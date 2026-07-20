/**
 * Taskby page component — "Tasks Assigned By You".
 *
 * Lists tasks that the current user (typically admin, manager or team lead)
 * has assigned to other team members. Provides search with debounce, status
 * filtering, time-range filtering, drag-and-drop reordering, pagination
 * and a modal for creating new tasks.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { CiCalendar } from "react-icons/ci";
import { IoIosArrowDown } from "react-icons/io";
import { GoDotFill } from "react-icons/go";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { IoSearchOutline, IoEyeOutline, IoCheckmarkCircle } from "react-icons/io5";
import { Lock, Pencil } from "lucide-react";
import CreateTaskModal from "../components/CreateTaskModal";
import EditTaskModal from "../components/EditTaskModal";
import PauseReasonModal from "../components/PauseReasonModal";
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import Pagination from "../components/Pagination";
import API_URL from "../config/api";
import { authToken, rolePath, getUser } from "../utils/auth";
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

/** Main Taskby page — renders tasks assigned by the current user. */
const Taskby = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showTaskModal, setShowTaskModal] = useState(false);
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
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [holdingTaskId, setHoldingTaskId] = useState(null);
  const [resumingTaskId, setResumingTaskId] = useState(null);
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [pauseModalTaskId, setPauseModalTaskId] = useState(null);

  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /** Fetch tasks assigned by the current user from the API. */
  const fetchTasks = () => {
    setLoading(true);
    const token = authToken();
    const params = new URLSearchParams();
    if (debouncedSearch) params.append("search", debouncedSearch);
    if (statusFilter) params.append("status", statusFilter);
    if (timeFilter) params.append("time_filter", timeFilter);

    fetch(`${API_URL}/assigned-tasks?${params.toString()}`, {
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
      }).catch(() => { });
    }
  }, []);

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

  const handleModalClose = (refresh) => {
    setShowTaskModal(false);
    if (refresh) fetchTasks();
  };

  const handleAssignerPause = async (taskId, { reason, reason_detail } = {}) => {
    setHoldingTaskId(taskId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/assigner-pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: reason_detail || reason }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setItems((prev) => prev.map((item) => item.id === taskId ? { ...item, assigner_paused: true, ...data.task } : item));
        showSuccessMessage("Task", "placed on hold");
      } else {
        alert(data.message || "Failed to place task on hold.");
      }
    } catch {
      alert("Failed to place task on hold.");
    }
    setHoldingTaskId(null);
  };

  const handleAssignerResume = async (taskId) => {
    setResumingTaskId(taskId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/assigner-resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setItems((prev) => prev.map((item) => item.id === taskId ? { ...item, assigner_paused: false, ...data.task } : item));
        showSuccessMessage("Task", "resumed by assigner");
      } else {
        alert(data.message || "Failed to resume task.");
      }
    } catch {
      alert("Failed to resume task.");
    }
    setResumingTaskId(null);
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

  const showAllItems = showAll;
  const totalPages = showAllItems ? 1 : Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = showAllItems ? filteredItems : filteredItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const breadcrumbs = [
    { label: "Tasks", path: rolePath("tasks") },
    { label: "Assigned By You" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="Task">
        <div className="task-text">
          <h3>Tasks Assigned By You</h3>
          <p>Manage and track tasks you assigned</p>
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
        {/* Header Table */}


        <div className="table-header1">
          <div></div>
          <div>Assigned To</div>
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
          <div className="sortable-table-container">
            <SortableTableWrapper
              items={paginatedItems.map((i, index) => ({
                ...i,
                sortableId: `${i.id}-${index}`
              }))}
              onReorder={(reordered) => handleTaskReorder(reordered)}
              idKey="sortableId"
              as="div"
              handleOnly
            >
              {(item, idx, dndProps) => {
                const colors = getRandomColors(item.id);
                const uniqueKey = `task-${item.id}-${idx}`;

                const assignees = item.assignees || [];
                const primaryAssignee = assignees[0];
                return (
                  <div className="taskby-row" key={uniqueKey}>
                    <DragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} />
                    <div className="col-assigned-to">
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                          {getInitials(primaryAssignee?.name)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="user-name">{primaryAssignee?.name || "Unassigned"}</div>
                          <div className="user-role">{primaryAssignee?.role || ""}</div>
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
                      {item.assigner_paused && (
                        <span className="badge" style={{ background: "#FEF3C7", color: "#92400E", marginTop: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <Lock size={11} />
                          On Hold
                        </span>
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
                          {item.assignees?.[0]?.pivot?.start_date
                            ? formatDate(item.assignees[0].pivot.start_date)
                            : formatDate(item.start_date)}
                          {"\n"}
                          {item.assignees?.[0]?.pivot?.due_date
                            ? formatDate(item.assignees[0].pivot.due_date)
                            : formatDate(item.end_date)}
                        </div>
                      </div>
                    </div>

                    <div className="col-action">
                      <div className="action-btns">
                        <button
                          className="action-icon-btn action-view"
                          title="View"
                          onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'taskby' } })}
                        >
                          <IoEyeOutline />
                        </button>
                        {item.status?.toLowerCase() !== "approved" && (
                          <button
                            className="action-icon-btn action-edit"
                            title="Edit Task"
                            onClick={async () => {
                              try {
                                const token = authToken();
                                const res = await fetch(`${API_URL}/tasks/${item.id}`, {
                                  headers: { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
                                });
                                if (res.ok) {
                                  const data = await res.json();
                                  setEditingTask(data.task || item);
                                } else {
                                  setEditingTask(item);
                                }
                              } catch {
                                setEditingTask(item);
                              }
                            }}
                          >
                            <Pencil size={20} />
                          </button>
                        )}
                        {["pending", "in_progress", "reopened", "paused"].includes(item.status) && !item.assigner_paused && (
                          <button
                            className="action-icon-btn"
                            title="Put On Hold"
                            disabled={holdingTaskId === item.id}
                            onClick={() => { setPauseModalTaskId(item.id); setPauseModalOpen(true); }}
                            style={{ color: "#7C3AED", cursor: holdingTaskId === item.id ? "not-allowed" : "pointer" }}
                          >
                            <Lock size={18} />
                          </button>
                        )}
                        {item.assigner_paused && (
                          <button
                            className="action-icon-btn"
                            title="Resume"
                            disabled={resumingTaskId === item.id}
                            onClick={() => handleAssignerResume(item.id)}
                            style={{ color: "#059669", cursor: resumingTaskId === item.id ? "not-allowed" : "pointer" }}
                          >
                            <Lock size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }}
            </SortableTableWrapper>
          </div>
        )}

        {!showAllItems && totalPages > 1 && (
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        )}
      </div>

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          onClose={(refresh) => { setEditingTask(null); if (refresh) fetchTasks(); }}
        />
      )}

      <PauseReasonModal
        isOpen={pauseModalOpen}
        onClose={() => { setPauseModalOpen(false); setPauseModalTaskId(null); }}
        onConfirm={async (data) => { await handleAssignerPause(pauseModalTaskId, data); setPauseModalOpen(false); setPauseModalTaskId(null); }}
        isAssigner
      />

    </DashboardLayout>
  );
};

export default Taskby;