import { useState, useEffect } from "react";
import DashboardLayout from "../components/layout/DashboardLayout";
import { CiCalendar } from "react-icons/ci";
import { IoIosArrowDown } from "react-icons/io";
import { GoDotFill } from "react-icons/go";
import { useNavigate } from "react-router-dom";
import { IoSearchOutline } from "react-icons/io5";
import CreateTaskModal from "../components/CreateTaskModal";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import "../pages/Task.css";

const STATUS_COLORS = {
  pending: "#F59E0B",
  in_progress: "#3B82F6",
  review: "#8B5CF6",
  completed: "#22C55E",
  done: "#22C55E",
  failed: "#EF4444",
  abandoned: "#6B7280",
};

const PRIORITY_COLORS = {
  High: "#EF4444",
  Medium: "#F59E0B",
  Low: "#22C55E",
};

function Tasks() {
  const navigate = useNavigate();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const fetchTasks = () => {
    setLoading(true);
    const token = authToken();
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (statusFilter) params.append("status", statusFilter);

    fetch(`${API_URL}/my-tasks?${params.toString()}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
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
  }, [search, statusFilter]);

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

  return (
    <DashboardLayout>
      <div className="Task">
        <div className="task-text">
          <h3>Tasks Assigned To You</h3>
          <p>Manage and track your tasks and projects</p>
        </div>

        <div className="task-btns">
          <div className="all-time">
            <CiCalendar />
            <span>All Time</span>
            <IoIosArrowDown />
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
        <div className="table-header">
          <div>Assigned by</div>
          <div>Name</div>
          <div>Type</div>
          <div>Status</div>
          <div>Priority</div>
          <div>Date</div>
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
                <div className="table-row" key={`project-${item.id}`}>
                  <div className="user-box">
                    <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                      {getInitials(item.creator?.name)}
                    </div>
                    <div>
                      <div className="user-name">{item.creator?.name || "System"}</div>
                      <div className="user-role">{item.creator?.role || ""}</div>
                    </div>
                  </div>
                  <div>
                    <div className="task-title">{item.title}</div>
                  </div>
                  <div>
                    <span className="badge" style={{ background: "#eef2ff", color: "#4f46e5", padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 600 }}>
                      Project
                    </span>
                  </div>
                  <div>
                    <span className="badge status-badge">
                      <span className="dot" style={{ background: STATUS_COLORS[item.status] || "#6B7280" }}></span>
                      {projectStatus}
                    </span>
                  </div>
                  <div>
                    <span className="badge priority-badge">
                      <span className="dot" style={{ background: PRIORITY_COLORS[item.priority] || "#F59E0B" }}></span>
                      {item.priority}
                    </span>
                  </div>
                  <div className="date-box">
                    <div>{formatDate(item.start_date)}</div>
                    <div>{formatDate(item.end_date)}</div>
                  </div>
                  <div>
                    <button className="view-btn" onClick={() => navigate(`/projects/${item.id}`)}>
                      View
                    </button>
                  </div>
                </div>
              );
            }

            const assigner = item.assigner;
            return (
              <div className="table-row" key={`task-${item.id}`}>
                <div className="user-box">
                  <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                    {getInitials(assigner?.name)}
                  </div>
                  <div>
                    <div className="user-name">{assigner?.name || "System"}</div>
                    <div className="user-role">{assigner?.role || ""}</div>
                  </div>
                </div>
                <div>
                  <div className="task-title">{item.title}</div>
                </div>
                <div>
                  <span className="badge" style={{ background: "#f0fdf4", color: "#16a34a", padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 600 }}>
                    Task
                  </span>
                </div>
                <div>
                  <span className="badge status-badge">
                    <span className="dot" style={{ background: STATUS_COLORS[item.status] || "#6B7280" }}></span>
                    {formatStatus(item.status)}
                  </span>
                </div>
                <div>
                  <span className="badge priority-badge">
                    <span className="dot" style={{ background: PRIORITY_COLORS[item.priority] || "#F59E0B" }}></span>
                    {item.priority}
                  </span>
                </div>
                <div className="date-box">
                  <div>{formatDate(item.start_date)}</div>
                  <div>{formatDate(item.end_date)}</div>
                </div>
                <div>
                  <button className="view-btn" onClick={() => navigate(`/details/${item.id}`)}>
                    View
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </DashboardLayout>
  );
}

export default Tasks;
