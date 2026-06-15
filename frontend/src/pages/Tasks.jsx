import { useState, useEffect, useRef } from "react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { CiCalendar } from "react-icons/ci";
import { IoIosArrowDown } from "react-icons/io";
import { GoDotFill } from "react-icons/go";
import { useNavigate } from "react-router-dom";
import { IoSearchOutline, IoEyeOutline, IoCheckmarkCircle } from "react-icons/io5";
import CreateTaskModal from "../components/CreateTaskModal";
import ConfirmCompleteModal from "../components/ConfirmCompleteModal";
import API_URL from "../config/api";
import { authToken, rolePath } from "../utils/auth";
import "../pages/Task.css";

const STATUS_COLORS = {
  pending: "#FEF3C7",
  in_progress: "#DBEAFE",
  review: "#EDE9FE",
  completed: "#DCFCE7",
  done: "#DCFCE7",
  failed: "#FEE2E2",
  abandoned: "#F3F4F6",
};

const STATUS_TEXT_COLORS = {
  pending: "#92400E",
  in_progress: "#1E40AF",
  review: "#5B21B6",
  completed: "#166534",
  done: "#166534",
  failed: "#991B1B",
  abandoned: "#374151",
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

function Tasks() {
  const navigate = useNavigate();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [confirmTask, setConfirmTask] = useState(null);

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

    fetch(`${API_URL}/my-tasks?${params.toString()}`, {
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
  }, [debouncedSearch, statusFilter]);

  const handleModalClose = (refresh) => {
    setShowTaskModal(false);
    if (refresh) fetchTasks();
  };

  const handleCompleteTask = (item) => {
    const token = authToken();
    console.log("handleCompleteTask: item", item);

    if (item._isProject) {
      const url = `${API_URL}/projects/${item.id}/complete`;
      console.log("handleCompleteTask: completing project", url);
      fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        skipLoader: true,
      })
        .then((res) => {
          console.log("handleCompleteTask: project response", res.status);
          if (!res.ok) return res.json().then(d => { throw new Error(d.message || "Failed"); });
          return res.json();
        })
        .then((data) => {
          console.log("handleCompleteTask: project success", data);
          setConfirmTask(null);
          setItems(prev => prev.map(p =>
            p.item_type === "project" && p.id === data.project?.id
              ? { ...p, ...data.project, item_type: p.item_type }
              : p
          ));
        })
        .catch((err) => {
          console.error("handleCompleteTask: project error", err);
          alert(err.message || "Failed to complete project");
          setConfirmTask(null);
        });
    } else {
      const url = `${API_URL}/tasks/${item.id}/complete`;
      console.log("handleCompleteTask: completing task", url);
      fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        skipLoader: true,
      })
        .then((res) => {
          console.log("handleCompleteTask: task response", res.status);
          if (!res.ok) return res.json().then(d => { throw new Error(d.message || "Failed"); });
          return res.json();
        })
        .then((data) => {
          console.log("handleCompleteTask: task success", data);
          setConfirmTask(null);
          setItems(prev => prev.map(t =>
            t.item_type !== "project" && t.id === data.task?.id
              ? { ...t, ...data.task, item_type: t.item_type }
              : t
          ));
        })
        .catch((err) => {
          console.error("handleCompleteTask: task error", err);
          alert(err.message || "Failed to complete task");
          setConfirmTask(null);
        });
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
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const formatStatus = (status) => {
    const map = {
      pending: "Pending",
      in_progress: "In Progress",
      review: "Review",
      completed: "Completed",
      done: "Done",
      failed: "Failed",
      abandoned: "Abandoned",
    };
    return map[status] || status;
  };

  const calculateProgress = (item) => {
    const total = item.total_tasks ?? 0;
    const completed = item.completed_tasks ?? 0;
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  };

  const calculateProjectStatus = (item) => {
    if (item.status === "completed" || item.status === "done") return "Completed";
    const progress = calculateProgress(item);
    const endDate = item.end_date ? new Date(item.end_date) : null;
    const now = new Date();
    if (progress === 100) return "Completed";
    if (endDate && now > endDate) return "Failed";
    return "In Progress";
  };

  const filteredItems = statusFilter
    ? items.filter((item) => {
        if (item.item_type === "project") {
          return calculateProjectStatus(item).toLowerCase().replace(/\s+/g, "_") === statusFilter;
        }
        return item.status === statusFilter;
      })
    : items;

  const taskIdList = filteredItems.filter((i) => i.item_type !== "project").map((i) => i.id);

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
        <p className={`All ${!statusFilter ? "active" : ""}`} onClick={() => setStatusFilter("")} style={{ cursor: "pointer" }}>All</p>
        <p className={`Pending ${statusFilter === "pending" ? "active" : ""}`} onClick={() => setStatusFilter("pending")} style={{ cursor: "pointer" }}>
          <GoDotFill color={STATUS_COLORS.pending} /> Pending
        </p>
        <p className={`Progress ${statusFilter === "in_progress" ? "active" : ""}`} onClick={() => setStatusFilter("in_progress")} style={{ cursor: "pointer" }}>
          <GoDotFill color={STATUS_COLORS.in_progress} /> In Progress
        </p>
        <p className={`Completed ${statusFilter === "completed" ? "active" : ""}`} onClick={() => setStatusFilter("completed")} style={{ cursor: "pointer" }}>
          <GoDotFill color={STATUS_COLORS.completed} /> Completed
        </p>
        <p className={`Failed ${statusFilter === "failed" ? "active" : ""}`} onClick={() => setStatusFilter("failed")} style={{ cursor: "pointer" }}>
          <GoDotFill color={STATUS_COLORS.failed} /> Failed
        </p>
        <p className={`Aban ${statusFilter === "abandoned" ? "active" : ""}`} onClick={() => setStatusFilter("abandoned")} style={{ cursor: "pointer" }}>
          <GoDotFill color={STATUS_COLORS.abandoned} /> Abandoned
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
          <div>Assigned by</div>
          <div className="task-name-column" >Task Name</div>
          <div>Type</div>
          <div className="status-column" >Status</div>
          <div>Progress</div>
          <div className="priority-column" >Priority</div>
          <div className="date-column">  Date</div>
          <div>Action</div>
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No items found</div>
        ) : (
          filteredItems.map((item) => {
            const isProject = item.item_type === "project";
            const colors = getRandomColors(item.id);

            if (isProject) {
              const projectStatus = calculateProjectStatus(item);
              return (
                <div className="taskby-row" key={`project-${item.id}`}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                      {getInitials(item.creator?.name)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="user-name">{item.creator?.name || "System"}</div>
                      <div className="user-role">{item.creator?.role || ""}</div>
                    </div>
                  </div>
                  <div>
                    <div className="task-title">{item.title}</div>
                  </div>
                  <div>
                    <span className="badge" style={{ background: "#eef2ff", color: "#4f46e5", backgroundColor:"#e0eaf0" }}>
                      Project
                    </span>
                  </div>
                  <div>
                    <span className="badge" style={{ background: STATUS_COLORS[item.status] || "#F3F4F6", color: STATUS_TEXT_COLORS[item.status] || "#374151" }}>
                      <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.status] || "#374151" }}></span>
                      {projectStatus}
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
                    <div>{formatDate(item.end_date)}</div>
                  </div>
                  <div className="action-btns">
                    <button className="action-icon-btn action-view" title="View" onClick={() => navigate(rolePath(`projects/project-details/${item.id}`), { state: { from: 'tasks' } })}>
                      <IoEyeOutline />
                    </button>
                    {item.status !== "completed" && item.status !== "done" ? (
                      <button className="action-icon-btn action-complete" title="Complete Project" onClick={() => setConfirmTask({ ...item, _isProject: true })}>
                        <IoCheckmarkCircle />
                      </button>
                    ) : (
                      <button className="action-icon-btn action-completed" title="Completed">
                        <IoCheckmarkCircle />
                      </button>
                    )}
                  </div>
                </div>
              );
            }

            const assigner = item.assigner;
            return (
              <div className="taskby-row" key={`task-${item.id}`}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                    {getInitials(assigner?.name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="user-name">{assigner?.name || "System"}</div>
                    <div className="user-role">{assigner?.role || ""}</div>
                  </div>
                </div>
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
                  <div>{formatDate(item.end_date)}</div>
                </div>
                <div className="action-btns">
                  <button className="action-icon-btn action-view" title="View" onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'tasks' } })}>
                    <IoEyeOutline />
                  </button>
                  {item.status !== "completed" && item.status !== "done" ? (
                    <button className="action-icon-btn action-complete" title="Complete Task" onClick={() => setConfirmTask(item)}>
                      <IoCheckmarkCircle />
                    </button>
                  ) : (
                    <button className="action-icon-btn action-completed" title="Completed">
                      <IoCheckmarkCircle />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {confirmTask && (
        <ConfirmCompleteModal
          taskTitle={confirmTask.title}
          isProject={confirmTask._isProject}
          onConfirm={() => handleCompleteTask(confirmTask)}
          onCancel={() => setConfirmTask(null)}
        />
      )}
    </DashboardLayout>
  );
}

export default Tasks;
