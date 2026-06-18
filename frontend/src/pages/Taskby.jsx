import { useState, useEffect, useRef, useCallback } from "react";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { CiCalendar } from "react-icons/ci";
import { IoIosArrowDown } from "react-icons/io";
import { GoDotFill } from "react-icons/go";
import { useNavigate } from "react-router-dom";
import { IoSearchOutline, IoEyeOutline, IoCheckmarkCircle } from "react-icons/io5";
import CreateTaskModal from "../components/CreateTaskModal";
import SortableTableWrapper from "../components/SortableTableWrapper";
import API_URL from "../config/api";
import { authToken, rolePath } from "../utils/auth";
import { formatDateOnly } from "../utils/formatDateTime";
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

const Taskby = () => {
  const navigate = useNavigate();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [orderedItems, setOrderedItems] = useState([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

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
      }).catch(() => {});
    }
  }, []);

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
    return formatDateOnly(dateStr);
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
    const total = item.total_tasks ?? 0;
    const completed = item.completed_tasks ?? 0;
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  };

  const baseItems = orderedItems.length ? orderedItems : items;
  const filteredItems = statusFilter
    ? baseItems.filter((item) => {
        if (item.item_type === "project") {
          const workflowStatuses = ["submitted","approved","rejected","reopened"];
          const displayStatus = workflowStatuses.includes(item.status) ? item.status : "pending";
          return displayStatus === statusFilter;
        }
        return item.status === statusFilter;
      })
    : baseItems;

  const taskIdList = filteredItems.filter((i) => i.item_type !== "project").map((i) => i.id);

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
        <p className={`All ${!statusFilter ? "active" : ""}`} onClick={() => setStatusFilter("")} style={{ cursor: "pointer" }}>All</p>
        <p className={`Pending ${statusFilter === "pending" ? "active" : ""}`} onClick={() => setStatusFilter("pending")} style={{ cursor: "pointer" }}>
          <GoDotFill color={STATUS_COLORS.pending} /> Pending
        </p>
        <p className={`Submitted ${statusFilter === "submitted" ? "active" : ""}`} onClick={() => setStatusFilter("submitted")} style={{ cursor: "pointer" }}>
          <GoDotFill color={STATUS_COLORS.submitted} /> Submitted
        </p>
        <p className={`Reopened ${statusFilter === "reopened" ? "active" : ""}`} onClick={() => setStatusFilter("reopened")} style={{ cursor: "pointer" }}>
          <GoDotFill color={STATUS_COLORS.reopened} /> Reopened
        </p>
        <p className={`Approved ${statusFilter === "approved" ? "active" : ""}`} onClick={() => setStatusFilter("approved")} style={{ cursor: "pointer" }}>
          <GoDotFill color={STATUS_COLORS.approved} /> Approved
        </p>
        <p className={`Rejected ${statusFilter === "rejected" ? "active" : ""}`} onClick={() => setStatusFilter("rejected")} style={{ cursor: "pointer" }}>
          <GoDotFill color={STATUS_COLORS.rejected} /> Rejected
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
        <div className="table-header1">
          <div>Assigned to</div>
          <div className="task-name-column">Task Name</div>
          <div>Type</div>
          <div className="status-column">Status</div>
          <div>Progress</div>
          <div className="priority-column">Priority</div>
          <div>Due Date</div>
          <div>Action</div>
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No items found</div>
        ) : (
          <SortableTableWrapper 
            items={filteredItems.map((i) => ({ ...i, sortableId: `${i.item_type}-${i.id}` }))} 
            onReorder={(reordered) => handleTaskReorder(reordered)} 
            idKey="sortableId"
          >
            {(item, idx) => {
              const isProject = item.item_type === "project";
              const colors = getRandomColors(item.id);

              if (isProject) {
                const primaryUser = item.assigned_user;
                return (
                  <div className="taskby-row" key={item.sortableId}>
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
                        {["submitted","approved","rejected","reopened"].includes(item.status) ? formatStatus(item.status) : "Pending"}
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
                      <div style={{ 
                        fontSize: "11px", 
                        color: "#6b7280",
                        marginTop: "4px"
                      }}>
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
                        <div>{formatDate(item.start_date)}</div>
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
                      </div>
                    </div>
                  </div>
                );
              }

              const assignees = item.assignees || [];
              const primaryAssignee = assignees[0];
              return (
                <div className="taskby-row" key={item.sortableId}>
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
                    <div style={{ 
                      fontSize: "11px", 
                      color: "#6b7280",
                      marginTop: "4px"
                    }}>
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
                      <div>{formatDate(item.start_date)}</div>
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
                    </div>
                  </div>
                </div>
              );
            }}
          </SortableTableWrapper>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Taskby;