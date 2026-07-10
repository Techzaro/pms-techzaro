/**
 * Taskby page component — "Tasks Assigned By You".
 *
 * Lists tasks and projects that the current user (typically admin, manager
 * or team lead) has assigned to other team members.  Provides search with
 * debounce, status filtering, time-range filtering, drag-and-drop reordering,
 * pagination and a modal for creating new tasks.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { CiCalendar } from "react-icons/ci";
import { IoIosArrowDown } from "react-icons/io";
import { GoDotFill } from "react-icons/go";
import { useNavigate, useSearchParams } from "react-router-dom";
import { IoSearchOutline, IoEyeOutline, IoCheckmarkCircle } from "react-icons/io5";
import { Pencil } from "lucide-react";
import CreateTaskModal from "../components/CreateTaskModal";
import EditTaskModal from "../components/EditTaskModal";
import EditProjectModal from "../components/EditProjectModal";
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import Pagination from "../components/Pagination";
import API_URL from "../config/api";
import { authToken, rolePath } from "../utils/auth";
import { formatDateOnly, formatDateTime } from "../utils/formatDateTime";
import "../pages/Task.css";

const STATUS_COLORS = {
  pending: "#FEF3C7",
  submitted: "#DBEAFE",
  reopened: "#EDE9FE",
  approved: "#DCFCE7",
  rejected: "#FEE2E2",
};

const STATUS_TEXT_COLORS = {
  pending: "#92400E",
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

/** Main Taskby page — renders tasks/projects assigned by the current user. */
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
  const [editingProject, setEditingProject] = useState(null);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /** Fetch tasks/projects assigned by the current user from the API. */
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

  useRefreshOnEvent(['task:created', 'task:updated', 'task:deleted'], fetchTasks);

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  useEffect(() => {
    const status = searchParams.get("status") || "";
    setStatusFilter(status);
  }, [searchParams]);

  const handleTaskReorder = useCallback((reordered) => {
    setOrderedItems(reordered);
    const taskItems = reordered.filter((i) => i.item_type !== 'project');
    if (taskItems.length) {
      const payload = taskItems.map((item, idx) => ({ id: item.id, sort_order: idx }));
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
    return formatDateTime(dateStr);
  };

  const formatStatus = (status) => {
    const map = {
      pending: "Pending",
      submitted: "Submitted",
      reopened: "Reopened",
      approved: "Approved",
      rejected: "Rejected",
    };
    return map[status] || status;
  };

  const calculateProgress = (item) => {
    const total = Number(item.total_tasks ?? 0) || 0;
    const completed = Number(item.completed_tasks ?? 0) || 0;
    if (!total) return 0;
    return Math.round((completed / total) * 100) || 0;
  };

  const baseItems = orderedItems.length ? orderedItems : items;
  const pendingStatuses = ["pending", "in_progress", "In Progress", "In-progress", "planned", "Planning", "Planned", "submitted", "reopened", "rejected"];

  const filteredItems = baseItems.filter((item) => {
    if (statusFilter === "due_today") {
      return true;
    }
    if (statusFilter) {
      if (item.item_type === "project") {
        if (statusFilter === "pending") {
          return pendingStatuses.includes(item.status);
        }
        const workflowStatuses = ["submitted", "approved", "rejected", "reopened"];
        const displayStatus = workflowStatuses.includes(item.status) ? item.status : "pending";
        return displayStatus === statusFilter;
      }
      if (statusFilter === "pending") {
        return pendingStatuses.includes(item.status);
      }
      return item.status === statusFilter;
    }
    return true;
  });

  const taskIdList = filteredItems.filter((i) => i.item_type !== "project").map((i) => i.id);

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
          <p>Manage and track tasks and projects you assigned</p>
          <div className="task-count-badge" style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
            <span style={{ background: "#dedfe0", color: "#4338CA", padding: "4px 12px", borderRadius: "20px", fontSize: "15px", fontWeight: 600 }}>
              Total: {totalCount} items
            </span>
            <span style={{ background: "#d6d6d6", color: "#166534", padding: "4px 12px", borderRadius: "20px", fontSize: "15px", fontWeight: 600 }}>
              Tasks: {filteredItems.filter(i => i.item_type !== "project").length}
            </span>
            <span style={{ background: "#d4d4d4", color: "#4338CA", padding: "4px 12px", borderRadius: "20px", fontSize: "15px", fontWeight: 600 }}>
              Projects: {filteredItems.filter(i => i.item_type === "project").length}
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

      <div className="tasks-search-bar">
        <IoSearchOutline fontSize={"20px"} />
        <input
          type="text"
          placeholder="Search by task or project name"
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
          <div>Type</div>
          <div className="status-column">Status</div>
          <div>Progress</div>
          <div className="priority-column">Priority</div>
          <div className="date-column">Due Date</div>
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
                sortableId: `${i.item_type}-${i.id}-${index}`
              }))}
              onReorder={(reordered) => handleTaskReorder(reordered)}
              idKey="sortableId"
              as="div"
              handleOnly
            >
              {(item, idx, dndProps) => {
                const isProject = item.item_type === "project";
                const colors = getRandomColors(item.id);
                const uniqueKey = `${item.item_type}-${item.id}-${idx}`;

                if (isProject) {
                  const primaryUser = item.assigned_user;
                  return (
                    <div className="taskby-row" key={uniqueKey}>
                      <DragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} />
                      <div className="col-assigned-to">
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                            {getInitials(primaryUser?.name)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div className="user-name">{primaryUser?.name || "Unassigned"}</div>
                            <div className="user-role">{primaryUser?.role || ""}</div>
                          </div>
                        </div>
                      </div>

                      <div className="col-task-name">
                        <div className="task-title">{item.title}</div>
                      </div>

                      <div className="col-type">
                        <span className="badge" style={{ background: "#eef2ff", color: "#4f46e5" }}>Project</span>
                      </div>

                      <div className="col-status">
                        <span className="badge" style={{ background: STATUS_COLORS[item.status] || "#F3F4F6", color: STATUS_TEXT_COLORS[item.status] || "#374151" }}>
                          <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.status] || "#374151" }}></span>
                          {["submitted", "approved", "rejected", "reopened"].includes(item.status) ? formatStatus(item.status) : "Pending"}
                        </span>
                      </div>

                      <div className="col-progress">
                        <div style={{
                          display: "flex",
                          justifyContent: "flex-start",
                          alignItems: "center",
                          marginBottom: "4px"
                        }}>
                          <span style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "#374151"
                          }}>
                            {calculateProgress(item)}%
                          </span>
                        </div>
                        <div className="progress-bar-track">
                          <div className="progress-bar-fill" style={{ width: `${calculateProgress(item)}%` }}></div>
                        </div>
                        <div className="deliverables-approved-text">
                          {item.completed_tasks || 0}/{item.total_tasks || 0} tasks
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
                          <div style={{ whiteSpace: "pre-line" }}>{formatDate(item.end_date)}</div>
                        </div>
                      </div>

                      <div className="col-action">
                        <div className="action-btns">
                          <button
                            className="action-icon-btn action-view"
                            title="View"
                            onClick={() => navigate(rolePath(`projects/project-details/${item.id}`), { state: { from: 'taskby' } })}
                          >
                            <IoEyeOutline />
                          </button>
                          {item.status?.toLowerCase() !== "approved" && (
                            <button
                              className="action-icon-btn action-edit"
                              title="Edit Project"
                              onClick={async () => {
                                try {
                                  const token = authToken();
                                  const res = await fetch(`${API_URL}/projects/${item.id}`, {
                                    headers: { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
                                  });
                                  if (res.ok) {
                                    const data = await res.json();
                                    setEditingProject(data.project || item);
                                  } else {
                                    setEditingProject(item);
                                  }
                                } catch {
                                  setEditingProject(item);
                                }
                              }}
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

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
                    </div>

                    <div className="col-type">
                      <span className="badge" style={{ background: "#f0fdf4", color: "#16a34a" }}>Task</span>
                    </div>

                    <div className="col-status">
                      <span className="badge" style={{ background: STATUS_COLORS[item.status] || "#F3F4F6", color: STATUS_TEXT_COLORS[item.status] || "#374151" }}>
                        <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.status] || "#374151" }}></span>
                        {formatStatus(item.status)}
                      </span>
                    </div>

                    <div className="col-progress">
                      <div style={{
                        display: "flex",
                        justifyContent: "flex-start",
                        alignItems: "center",
                        marginBottom: "4px"
                      }}>
                        <span style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "#374151"
                        }}>
                          {item.deliverables_progress || 0}%
                        </span>
                      </div>
                      <div className="progress-bar-track">
                        <div className="progress-bar-fill" style={{ width: `${item.deliverables_progress || 0}%` }}></div>
                      </div>
                      <div className="deliverables-approved-text">
                        {item.approved_deliverables || 0}/{item.total_deliverables || 0} Deliverables Approved
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
                        <div style={{ whiteSpace: "pre-line" }}>{formatDate(item.end_date)}</div>
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
                            <Pencil size={16} />
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

      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={(refresh) => { setEditingProject(null); if (refresh) fetchTasks(); }}
        />
      )}
    </DashboardLayout>
  );
};

export default Taskby;