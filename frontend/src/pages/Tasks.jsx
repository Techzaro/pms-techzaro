/**
 * Tasks page component — "Tasks Assigned To You".
 *
 * Displays tasks and projects that have been assigned to the current user
 * by others.  Provides search with debounce, status filtering, time-range
 * filtering, drag-and-drop reordering and pagination.  Submit actions open
 * modals for task or project submission.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { GoDotFill } from "react-icons/go";
import { useNavigate, useSearchParams } from "react-router-dom";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";
import CreateTaskModal from "../components/CreateTaskModal";
import SubmitTaskModal from "../components/SubmitTaskModal";
import SubmitProjectModal from "../components/SubmitProjectModal";
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import Pagination from "../components/Pagination";
import API_URL from "../config/api";
import { authToken, getUser, rolePath } from "../utils/auth";
import { formatDateTime } from "../utils/formatDateTime";
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

/** Main Tasks page — renders tasks/projects assigned to the current user by others. */
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
  const [submitProjectModal, setSubmitProjectModal] = useState({ open: false, project: null });
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

  useRefreshOnEvent(['task:created', 'task:updated', 'task:deleted', 'project:updated'], fetchTasks);

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  const handleTaskListReorder = useCallback((reordered) => {
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

  const handleTaskSubmitSuccess = (updatedTask) => {
    setItems((prev) =>
      prev.map((item) =>
        item.item_type !== "project" && item.id === updatedTask.id
          ? { ...item, ...updatedTask, item_type: item.item_type }
          : item
      )
    );
  };

  const handleProjectSubmitSuccess = (updatedProject) => {
    setItems((prev) =>
      prev.map((item) =>
        item.item_type === "project" && item.id === updatedProject.id
          ? { ...item, ...updatedProject, item_type: "project" }
          : item
      )
    );
    fetchTasks();
  };

  const calculateProgress = (item) => {
    const total = Number(item.total_tasks ?? 0) || 0;
    const completed = Number(item.completed_tasks ?? 0) || 0;
    if (!total) return 0;
    return Math.round((completed / total) * 100) || 0;
  };



  const baseItems = orderedItems.length ? orderedItems : items;
  const pendingStatuses = ["pending", "in_progress", "In Progress", "In-progress", "planned", "Planning", "Planned", "submitted", "reopened", "rejected"];
  const filteredItems = statusFilter && statusFilter !== "due_today"
    ? items.filter((item) => {
        if (item.item_type === "project") {
          if (statusFilter === "pending") {
            return pendingStatuses.includes(item.status);
          }
          const workflowStatuses = ["submitted","approved","rejected","reopened"];
          const displayStatus = workflowStatuses.includes(item.status) ? item.status : "pending";
          return displayStatus === statusFilter;
        }
        if (statusFilter === "pending") {
          return pendingStatuses.includes(item.status);
        }
        return item.status === statusFilter;
      })
    : baseItems;

  const taskIdList = filteredItems.filter((i) => i.item_type !== "project").map((i) => i.id);

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
          placeholder="Search by task or project name"
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
          <SortableTableWrapper 
            items={paginatedItems.map((i) => ({ ...i, sortableId: `${i.item_type}-${i.id}` }))} 
            onReorder={(reordered) => handleTaskListReorder(reordered)} 
            idKey="sortableId"
            as="div"
            handleOnly
          >
            {(item, idx, dndProps) => {
              const isProject = item.item_type === "project";
              const colors = getRandomColors(item.id);

              if (isProject) {
                return (
                  <div className="taskby-row" key={item.sortableId}>
                    <DragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} />
                    <div className="col-assigned-to">
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                          {getInitials(item.creator?.name)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="user-name">{item.creator?.name || "System"}</div>
                          <div className="user-role">{item.creator?.role || ""}</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="col-task-name">
                      <div className="task-title">{item.title}</div>
                    </div>
                    
                    <div className="col-type">
                      <span className="badge" style={{ background: "#eef2ff", color: "#4f46e5", backgroundColor: "#e0eaf0" }}>Project</span>
                    </div>
                    
                    <div className="col-status">
                      <span className="badge" style={{ background: STATUS_COLORS[item.my_submission_status || item.status] || "#F3F4F6", color: STATUS_TEXT_COLORS[item.my_submission_status || item.status] || "#374151" }}>
                        <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.my_submission_status || item.status] || "#374151" }}></span>
                        {["submitted","approved","rejected","reopened"].includes(item.my_submission_status || item.status) ? formatStatus(item.my_submission_status || item.status) : "Pending"}
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
                        <div style={{ whiteSpace: "pre-line" }}>
                          {(() => {
                            const myDueDate = currentUser ? item.user_due_dates?.[currentUser.id] : null;
                            return formatDate(myDueDate || item.end_date);
                          })()}
                        </div>
                      </div>
                    </div>
                    
                    <div className="col-action">
                      <div className="action-btns">
                        <button className="action-icon-btn action-view" title="View" onClick={() => navigate(rolePath(`projects/project-details/${item.id}`), { state: { from: 'tasks' } })}><IoEyeOutline /></button>
                        {item.can_submit && (
                          <div style={{ position: "relative", display: "inline-flex" }}>
                            <button 
                              className="action-icon-btn action-submit" 
                              title="Submit Project" 
                              onClick={() => setSubmitProjectModal({ open: true, project: item })} 
                            >
                              <LuSend />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

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
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${item.deliverables_progress || 0}%` }}></div>
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
                        const canSubmit = (item.status === "pending" || item.status === "reopened") && myPivotStatus !== "submitted";
                        return canSubmit && (
                        <div style={{ position: "relative", display: "inline-flex" }}>
                          <button 
                            className="action-icon-btn action-submit" 
                            title={item.pending_deliverables_count > 0 ? "Submit all deliverables first" : "Submit Task"} 
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

      <SubmitProjectModal
        key={`tasks-project-submit-${submitProjectModal.project?.id || "none"}`}
        isOpen={submitProjectModal.open}
        onClose={() => setSubmitProjectModal({ open: false, project: null })}
        project={submitProjectModal.project}
        onSubmitSuccess={handleProjectSubmitSuccess}
      />
    </DashboardLayout>
  );
}

export default Tasks;