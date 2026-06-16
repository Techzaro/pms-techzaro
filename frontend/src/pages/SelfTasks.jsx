import { useState, useEffect } from "react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { CiCalendar } from "react-icons/ci";
import { IoIosArrowDown } from "react-icons/io";
import { GoDotFill } from "react-icons/go";
import { useNavigate } from "react-router-dom";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import CreateTaskModal from "../components/CreateTaskModal";
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

const SelfTasks = () => {
  const navigate = useNavigate();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");

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

    fetch(`${API_URL}/self-tasks?${params.toString()}`, {
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

  const handleModalClose = (refresh) => {
    setShowTaskModal(false);
    if (refresh) fetchTasks();
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


  const filteredItems = statusFilter
    ? items.filter((item) => {
        if (item.item_type === "project") {
          const workflowStatuses = ["submitted","approved","rejected","reopened"];
          const displayStatus = workflowStatuses.includes(item.status) ? item.status : "pending";
          return displayStatus === statusFilter;
        }
        return item.status === statusFilter;
      })
    : items;

  const taskIdList = filteredItems.filter((i) => i.item_type !== "project").map((i) => i.id);

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
          <p>Tasks and projects you assigned to yourself</p>
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
        <div className="table-header-compact">
          <div>Task Name</div>
          <div>Type</div>
          <div>Status</div>
          <div>Progress</div>
          <div>Priority</div>
          <div>Due Date</div>
          <div>Action</div>
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No items found</div>
        ) : (
          filteredItems.map((item) => {
            const isProject = item.item_type === "project";

            if (isProject) {
              return (
                <div className="taskby-row-compact" key={`project-${item.id}`}>
                  <div>
                    <div className="task-title">{item.title}</div>
                  </div>
                  <div>
                    <span className="badge" style={{ background: "#eef2ff", color: "#4f46e5" }}>
                      Project
                    </span>
                  </div>
                  <div>
                    <span className="badge" style={{ background: STATUS_COLORS[item.status] || (item.status !== "Planned" && item.status !== "in_progress" ? "#F3F4F6" : "#FEF3C7"), color: STATUS_TEXT_COLORS[item.status] || (item.status !== "Planned" && item.status !== "in_progress" ? "#374151" : "#92400E") }}>
                      <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.status] || (item.status !== "Planned" && item.status !== "in_progress" ? "#374151" : "#92400E") }}></span>
                      {["submitted","approved","rejected","reopened"].includes(item.status) ? formatStatus(item.status) : "Pending"}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>{calculateProgress(item)}%</div>
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${calculateProgress(item)}%` }}></div>
                    </div>
                    <div style={{ fontSize: "11px", color: "#6b7280" }}>{item.completed_tasks || 0}/{item.total_tasks || 0} tasks</div>
                  </div>
                  <div>
                    <span className="badge" style={{ background: PRIORITY_COLORS[item.priority] || "#F3F4F6", color: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}>
                      <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}></span>
                      {item.priority}
                    </span>
                  </div>
                  <div className="date-box">
                    <div>{formatDate(item.start_date)}</div>
                    <div style={{ whiteSpace: "pre-line" }}>{formatDate(item.end_date)}</div>
                  </div>
                  <div className="action-btns">
                    <button className="action-icon-btn action-view" title="View" onClick={() => navigate(rolePath(`projects/project-details/${item.id}`), { state: { from: 'self-tasks' } })}>
                      <IoEyeOutline />
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div className="taskby-row-compact" key={`task-${item.id}`}>
                <div>
                  <div className="task-title">{item.title}</div>
                </div>
                <div>
                  <span className="badge" style={{ background: "#f0fdf4", color: "#16a34a" }}>
                    Task
                  </span>
                </div>
                <div>
                  <span className="badge" style={{ background: STATUS_COLORS[item.status] || "#F3F4F6", color: STATUS_TEXT_COLORS[item.status] || "#374151" }}>
                    <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.status] || "#374151" }}></span>
                    {formatStatus(item.status)}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>{item.deliverables_progress || 0}%</div>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${item.deliverables_progress || 0}%` }}></div>
                  </div>
                  <div style={{ fontSize: "11px", color: "#6b7280" }}>{item.approved_deliverables || 0}/{item.total_deliverables || 0} Deliverables Approved</div>
                </div>
                <div>
                  <span className="badge" style={{ background: PRIORITY_COLORS[item.priority] || "#F3F4F6", color: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}>
                    <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}></span>
                    {item.priority}
                  </span>
                </div>
                <div className="date-box">
                  <div>{formatDate(item.start_date)}</div>
                  <div style={{ whiteSpace: "pre-line" }}>{formatDate(item.end_date)}</div>
                </div>
                <div className="action-btns">
                  <button className="action-icon-btn action-view" title="View" onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'self-tasks' } })}>
                    <IoEyeOutline />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </DashboardLayout>
  );
};

export default SelfTasks;
