import DashboardLayout from "../components/layout/DashboardLayout";
import { useState, useEffect } from "react";
import { GoDotFill } from "react-icons/go";
import { useNavigate } from "react-router-dom";
import { IoSearchOutline, IoEyeOutline, IoCheckmarkCircle } from "react-icons/io5";
import CreateDeliverableModel from "../components/layout/CreateDeliverableModel";
import { rolePath, authToken } from "../utils/auth";
import API_URL from "../config/api";
import "../pages/Deliveries.css";

const STATUS_COLORS = {
  deliverable: "#EDE9FE",
  delivered: "#DCFCE7",
};

const STATUS_TEXT_COLORS = {
  deliverable: "#5B21B6",
  delivered: "#166534",
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
  const [showModal, setShowModal] = useState(false);
  const [deliverables, setDeliverables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [confirmDeliverable, setConfirmDeliverable] = useState(null);

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
      deliverable: "Deliverable",
      delivered: "Delivered",
    };
    return map[status] || status;
  };

  const handleMarkDelivered = async () => {
    if (!confirmDeliverable) return;
    const token = authToken();
    try {
      const res = await fetch(`${API_URL}/deliverables/${confirmDeliverable.id}/delivered`, {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        setConfirmDeliverable(null);
        fetchDeliverables();
      } else {
        const data = await res.json();
        alert(data.message || "Failed to update status");
      }
    } catch {
      alert("An error occurred");
    }
  };

  const isDelivered = (item) => item.status === "delivered";

  return (
    <DashboardLayout>

      <div className="projects-page">

        <div className="projects-header">

          <div>
            <h1>Deliverables</h1>
            <p>Manage and track your deliverables</p>
          </div>

          <div className="header-actions">

            <div className="all-time">
              <select name="" id="">
                <option value="">All Time</option>
                <option value="">Month</option>
                <option value="">Week</option>
                <option value="">Day</option>
              </select>

            </div>

            <button
              className="create-btn"
              onClick={() => setShowModal(true)}
            >
              + Create Deliverable
            </button>

          </div>

        </div>

        <div className="task-progress">
          <p className={`All ${!statusFilter ? "active" : ""}`} onClick={() => setStatusFilter("")} style={{ cursor: "pointer" }}>All</p>
          <p className={`Deliverable ${statusFilter === "deliverable" ? "active" : ""}`} onClick={() => setStatusFilter("deliverable")} style={{ cursor: "pointer" }}>
            <GoDotFill color="#8B5CF6" />
            Deliverable
          </p>
          <p className={`Delivered ${statusFilter === "delivered" ? "active" : ""}`} onClick={() => setStatusFilter("delivered")} style={{ cursor: "pointer" }}>
            <GoDotFill color="#22C55E" />
            Delivered
          </p>
        </div>

        <div className="delivery-serach-bar">
          <IoSearchOutline fontSize={"20px"} />
          <input type="text" placeholder="Search by deliverable name" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="container">

          <div className="table-header">
            <div>Assigned by</div>
            <div className="task-name-column" style={{ paddingLeft: "40px" }}>Task Name</div>
            <div className="status-column" style={{ paddingRight: "25px" }}>Status</div>
            <div className="priority-column" style={{ paddingRight: "8px" }}>Priority</div>
            <div className="date-column" style={{ paddingRight: "30px" }}>  Date</div>
            <div>Action</div>
          </div>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
          ) : deliverables.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No deliverables found</div>
          ) : (
            deliverables.map((item) => {
              const colors = getRandomColors(item.id);
              const creator = item.creator || {};
              const delivered = isDelivered(item);

              return (
                <div className="table-row" key={item.id}>

                  <div className="user-box">
                    <div
                      className="avatar"
                      style={{
                        background: colors.bg,
                        color: colors.text,
                      }}
                    >
                      {getInitials(creator.name)}
                    </div>
                    <div>
                      <div className="user-name">{creator.name || "System"}</div>
                      <div className="user-role">{creator.role || ""}</div>
                    </div>
                  </div>

                  <div>
                    <div className="task-title" style={{ paddingLeft: "40px" }}>{item.title}</div>
                  </div>

                  <div>
                    <span className="badge" style={{ background: STATUS_COLORS[item.status] || "#F3F4F6", color: STATUS_TEXT_COLORS[item.status] || "#374151", padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 600 }}>
                      <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.status] || "#374151" }}></span>
                      {formatStatus(item.status)}
                    </span>
                  </div>

                  <div>
                    <span className="badge" style={{ background: PRIORITY_COLORS[item.priority] || "#F3F4F6", color: PRIORITY_TEXT_COLORS[item.priority] || "#374151", padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 600 }}>
                      <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}></span>
                      {item.priority}
                    </span>
                  </div>

                  <div className="date-box">
                    <div>{formatDate(item.due_date)}</div>
                  </div>

                  <div className="action-btns" >
                    <button
                      className="action-icon-btn action-view"
                      title="View"
                      onClick={() =>
                        navigate(rolePath(`deliveries/deliverable-details/${item.id}`))
                      }
                    >
                      <IoEyeOutline />
                    </button>

                    <button
                      className={`action-icon-btn ${delivered ? 'action-completed' : 'action-complete'}`}
                      title={delivered ? "Delivered" : "Mark as Delivered"}
                      onClick={() => !delivered && setConfirmDeliverable(item)}
                      disabled={delivered}
                    >
                      <IoCheckmarkCircle />
                    </button>
                  </div>

                </div>
              );
            })
          )}

        </div>

      </div>

      {showModal && (
        <CreateDeliverableModel
          onClose={() => { setShowModal(false); fetchDeliverables(); }}
        />
      )}

      {confirmDeliverable && (
        <div className="modal-overlay" onClick={() => setConfirmDeliverable(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Mark as Delivered</h3>
            <p style={{ marginBottom: '15px', color: '#374151' }}>
              Are you sure you want to mark <strong>{confirmDeliverable.title}</strong> as delivered?
            </p>
            <div className="modal-buttons">
              <button className="cancel-btn" onClick={() => setConfirmDeliverable(null)}>Cancel</button>
              <button className="confirm-btn" onClick={handleMarkDelivered}>Yes, Mark Delivered</button>
            </div>
          </div>
        </div>
      )}

    </DashboardLayout>
  );
}

export default Deliveries;
