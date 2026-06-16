import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { useState, useEffect } from "react";
import { GoDotFill } from "react-icons/go";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { authToken, rolePath } from "../utils/auth";
import API_URL from "../config/api";
import AssignerViewModal from "../components/AssignerViewModal";
import { formatDateTime } from "../utils/formatDateTime";
import "../pages/Deliveries.css";
import "../pages/Task.css";

const STATUS_COLORS = {
  pending: "#FEF3C7",
  submitted: "#DBEAFE",
  approved: "#DCFCE7",
  rejected: "#FEE2E2",
  reopened: "#FEF3C7",
};

const STATUS_TEXT_COLORS = {
  pending: "#92400E",
  submitted: "#1E40AF",
  approved: "#166534",
  rejected: "#991B1B",
  reopened: "#92400E",
};

function DeliveriesByYou() {
  const [deliverables, setDeliverables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [viewModal, setViewModal] = useState({ open: false, deliverable: null });

  const fetchDeliverables = () => {
    setLoading(true);
    const token = authToken();
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (statusFilter) params.append("status", statusFilter);
    if (timeFilter) params.append("time_filter", timeFilter);

    fetch(`${API_URL}/deliverables/assigned-by-me?${params.toString()}`, {
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
  }, [search, statusFilter, timeFilter]);

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
      approved: "Approved",
      rejected: "Rejected",
      reopened: "Reopened",
    };
    return map[status] || status;
  };

  const handleActionSuccess = (updatedDeliverable) => {
    setDeliverables((prev) =>
      prev.map((d) => (d.id === updatedDeliverable.id ? { ...d, ...updatedDeliverable } : d))
    );
  };

  const breadcrumbs = [
    { label: "Deliverables", path: rolePath("deliveries") },
    { label: "Assigned By You" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="projects-page">
        <div className="projects-header">
          <div>
            <h1>Deliverables Assigned By You</h1>
            <p>Deliverables assigned to others from tasks and projects you created</p>
          </div>
          <div className="header-actions">
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} className="reports-filter">
              <option value="">All Time</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="180">Last 6 Months</option>
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
          <p className={`Reopened ${statusFilter === "reopened" ? "active" : ""}`} onClick={() => setStatusFilter("reopened")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Reopened
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
          <div className="deliveries-table-header">
            <div>Deliverable</div>
            <div>Task</div>
            <div>Assigned To</div>
            <div>Status</div>
            <div>Due Date</div>
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
                <div className="deliveries-table-row" key={item.id}>
                  <div className="user-box">
                    <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                      {getInitials(item.title)}
                    </div>
                    <div>
                      <div className="user-name">{item.title}</div>
                    </div>
                  </div>
                   <div>
                     <div className="task-title">{item.task?.title || item.project?.title || "-"}</div>
                   </div>
                  <div className="user-box">
                    <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                      {getInitials(item.assignee?.name)}
                    </div>
                    <div>
                      <div className="user-name">{item.assignee?.name || "Unassigned"}</div>
                      <div className="user-role">{item.assignee?.role ? item.assignee.role.replace("_", " ") : ""}</div>
                    </div>
                  </div>
                  <div>
                    <span className="badge" style={{ background: STATUS_COLORS[item.status] || "#F3F4F6", color: STATUS_TEXT_COLORS[item.status] || "#374151", padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 600 }}>
                      <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.status] || "#374151" }}></span>
                      {formatStatus(item.status)}
                    </span>
                  </div>
                  <div className="date-box">
                    <div style={{ whiteSpace: "pre-line" }}>{formatDate(item.due_date)}</div>
                  </div>
                  <div className="action-btns">
                    <button className="action-icon-btn action-view" title="View" onClick={() => setViewModal({ open: true, deliverable: item })}>
                      <IoEyeOutline />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <AssignerViewModal
        key={`avm-${viewModal.deliverable?.id || "none"}`}
        isOpen={viewModal.open}
        onClose={() => setViewModal({ open: false, deliverable: null })}
        deliverable={viewModal.deliverable}
        onActionSuccess={handleActionSuccess}
      />
    </DashboardLayout>
  );
}

export default DeliveriesByYou;
