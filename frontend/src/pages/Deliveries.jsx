import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { useState, useEffect } from "react";
import { GoDotFill } from "react-icons/go";
import { useNavigate } from "react-router-dom";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { authToken, rolePath } from "../utils/auth";
import API_URL from "../config/api";
import "../pages/Deliveries.css";

const STATUS_COLORS = {
  pending: "#FEF3C7",
  submitted: "#DBEAFE",
  approved: "#DCFCE7",
  rejected: "#FEE2E2",
};

const STATUS_TEXT_COLORS = {
  pending: "#92400E",
  submitted: "#1E40AF",
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

function Deliveries() {
  const navigate = useNavigate();
  const [deliverables, setDeliverables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");

  const fetchDeliverables = () => {
    setLoading(true);
    const token = authToken();
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (statusFilter) params.append("status", statusFilter);

    fetch(`${API_URL}/deliverables?${params.toString()}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => {
        setDeliverables(data?.data || data || []);
      })
      .catch(() => setDeliverables([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDeliverables();
  }, [search, statusFilter]);

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
      submitted: "Submitted",
      approved: "Approved",
      rejected: "Rejected",
    };
    return map[status] || status;
  };

  const breadcrumbs = [
    { label: "Deliverables", path: rolePath("deliveries") },
    { label: "Assigned To You" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="projects-page">
        <div className="projects-header">
          <div>
            <h1>Deliverables</h1>
            <p>Manage and track your deliverables</p>
          </div>
          <div className="header-actions">
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} className="reports-filter">
              <option>All Time</option>
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
              <option>Last 6 Months</option>
            </select>
          </div>
        </div>

        <div className="task-progress">
          <p className={`All ${!statusFilter ? "active" : ""}`} onClick={() => setStatusFilter("")} style={{ cursor: "pointer" }}>All</p>
          <p className={`Pending ${statusFilter === "pending" ? "active" : ""}`} onClick={() => setStatusFilter("pending")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Pending
          </p>
          <p className={`Submitted ${statusFilter === "submitted" ? "active" : ""}`} onClick={() => setStatusFilter("submitted")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Submitted
          </p>
          <p className={`Approved ${statusFilter === "approved" ? "active" : ""}`} onClick={() => setStatusFilter("approved")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Approved
          </p>
          <p className={`Rejected ${statusFilter === "rejected" ? "active" : ""}`} onClick={() => setStatusFilter("rejected")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Rejected
          </p>
        </div>

        <div className="delivery-serach-bar">
          <IoSearchOutline fontSize={"20px"} />
          <input type="text" placeholder="Search by deliverable name" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="container">
          <div className="table-header">
            <div>Deliverable</div>
            <div className="task-name-column" style={{ paddingLeft: "40px" }}>Task</div>
            <div>Assign By</div>
            <div className="status-column" style={{ paddingRight: "25px" }}>Status</div>
            <div className="date-column" style={{ paddingRight: "30px" }}>Due Date</div>
            <div>Action</div>
          </div>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
          ) : deliverables.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No deliverables found</div>
          ) : (
            deliverables.map((item) => {
              const colors = getRandomColors(item.id);
              return (
                <div className="table-row" key={item.id}>
                  <div className="user-box">
                    <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                      {getInitials(item.title)}
                    </div>
                    <div>
                      <div className="user-name">{item.title}</div>
                    </div>
                  </div>
                   <div>
                     <div className="task-title" style={{ paddingLeft: "40px" }}>{item.task?.title || item.project?.title || "-"}</div>
                   </div>
                  <div className="user-box">
                    <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                      {getInitials(item.creator?.name)}
                    </div>
                    <div>
                      <div className="user-name">{item.creator?.name || "-"}</div>
                      <div className="user-role">{item.creator?.role ? item.creator.role.replace("_", " ") : ""}</div>
                    </div>
                  </div>
                  <div>
                    <span className="badge" style={{ background: STATUS_COLORS[item.status] || "#F3F4F6", color: STATUS_TEXT_COLORS[item.status] || "#374151", padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 600 }}>
                      <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.status] || "#374151" }}></span>
                      {formatStatus(item.status)}
                    </span>
                  </div>
                  <div className="date-box">
                    <div>{formatDate(item.due_date)}</div>
                  </div>
                  <div className="action-btns">
                    <button className="action-icon-btn action-view" title="View" onClick={() => navigate(rolePath(`deliveries/deliverable-details/${item.id}`), { state: { from: 'deliveries' } })}>
                      <IoEyeOutline />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default Deliveries;
