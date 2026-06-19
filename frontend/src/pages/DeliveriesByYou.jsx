import React, { useState, useEffect, useCallback } from "react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import { useSearchParams } from "react-router-dom";
import { GoDotFill } from "react-icons/go";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { authToken, rolePath } from "../utils/auth";
import API_URL from "../config/api";
import AssignerViewModal from "../components/AssignerViewModal";
import { formatDateTime } from "../utils/formatDateTime";
import SortableTableWrapper from "../components/SortableTableWrapper";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [deliverables, setDeliverables] = useState([]);
  const [orderedDeliverables, setOrderedDeliverables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => {
    const status = searchParams.get("status");
    if (status) return status;
    return "";
  });
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

  useRefreshOnEvent(['deliverable:updated', 'deliverable:created', 'deliverable:deleted'], fetchDeliverables);

  useEffect(() => {
    const selectedId = searchParams.get("selectedDeliverable");
    if (!selectedId) return;

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("selectedDeliverable");
      return next;
    }, { replace: true });

    const token = authToken();
    fetch(`${API_URL}/deliverables/${selectedId}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.deliverable) {
          setViewModal({ open: true, deliverable: data.deliverable });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const status = searchParams.get("status") || "";
    setStatusFilter(status);
  }, [searchParams]);

  useEffect(() => {
    setOrderedDeliverables(deliverables);
  }, [deliverables]);

  const selectStatusFilter = (filter) => {
    setStatusFilter(filter);
    if (filter) {
      setSearchParams({ status: filter });
    } else {
      setSearchParams({});
    }
  };

  const handleDeliverableReorder = useCallback((reordered) => {
    setOrderedDeliverables(reordered);
    const payload = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
    const token = authToken();
    fetch(`${API_URL}/deliverables/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items: payload }),
    }).catch(() => {});
  }, []);

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

  const displayItems = orderedDeliverables.length ? orderedDeliverables : deliverables;

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
          <p className={`All ${!statusFilter ? "active" : ""}`} onClick={() => selectStatusFilter("")} style={{ cursor: "pointer" }}>All</p>
          <p className={`DueToday ${statusFilter === "due_today" ? "active" : ""}`} onClick={() => selectStatusFilter("due_today")} style={{ cursor: "pointer" }}>
            <GoDotFill color="#EF4444" /> Deliverables Due Today
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

        <div className="delivery-serach-bar">
          <IoSearchOutline fontSize={"20px"} />
          <input type="text" placeholder="Search by deliverable name" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="container">
          {/* Header Table */}
          <table className="deliveries-table">
            <thead>
              <tr className="deliveries-table-header">
                <th>Deliverable</th>
                <th>Task</th>
                <th className="assigned" style={{paddingLeft:"60px"}}>Assigned To</th>
                <th>Status</th>
                <th>Due Date</th>
                <th>Action</th>
              </tr>
            </thead>
          </table>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
          ) : displayItems.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No deliverables found</div>
          ) : (
            <div className="sortable-table-container">
              <table className="deliveries-table">
                <tbody>
                  <SortableTableWrapper 
                    items={displayItems.map((item, index) => ({
                      ...item,
                      sortableId: `deliverable-${item.id}-${index}`
                    }))} 
                    onReorder={handleDeliverableReorder} 
                    idKey="sortableId"
                    as="tr"
                  >
                    {(item, idx) => {
                      const colors = getRandomColors(item.id);
                      const uniqueKey = `deliverable-${item.id}-${idx}`;
                      return (
                        <React.Fragment key={uniqueKey}>
                          <td>
                            <div className="user-box">
                              <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                                {getInitials(item.title)}
                              </div>
                              <div>
                                <div className="user-name">{item.title}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="task-title">{item.task?.title || item.project?.title || "-"}</div>
                          </td>
                          <td style={{paddingLeft:"50px"}}>
                            <div className="user-box">
                              <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                                {getInitials(item.assignee?.name)}
                              </div>
                              <div>
                                <div className="user-name">{item.assignee?.name || "Unassigned"}</div>
                                <div className="user-role">{item.assignee?.role ? item.assignee.role.replace("_", " ") : ""}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="badge" style={{ 
                              background: STATUS_COLORS[item.status] || "#F3F4F6", 
                              color: STATUS_TEXT_COLORS[item.status] || "#374151", 
                              padding: "4px 10px", 
                              borderRadius: "999px", 
                              fontSize: "12px", 
                              fontWeight: 600 
                            }}>
                              <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.status] || "#374151" }}></span>
                              {formatStatus(item.status)}
                            </span>
                          </td>
                          <td>
                            <div className="date-box">
                              <div style={{ whiteSpace: "pre-line" }}>{formatDate(item.due_date)}</div>
                            </div>
                          </td>
                          <td>
                            <div className="action-btns">
                              <button 
                                className="action-icon-btn action-view" 
                                title="View" 
                                onClick={() => setViewModal({ open: true, deliverable: item })}
                              >
                                <IoEyeOutline />
                              </button>
                            </div>
                          </td>
                        </React.Fragment>
                      );
                    }}
                  </SortableTableWrapper>
                </tbody>
              </table>
            </div>
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