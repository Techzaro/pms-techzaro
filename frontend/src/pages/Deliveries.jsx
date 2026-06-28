import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { useState, useEffect, useCallback } from "react";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import { useSearchParams } from "react-router-dom";
import { GoDotFill } from "react-icons/go";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";
import { authToken, rolePath } from "../utils/auth";
import API_URL from "../config/api";
import SubmitDeliverableModal from "../components/SubmitDeliverableModal";
import ViewDeliverableModal from "../components/ViewDeliverableModal";
import { formatDateTime } from "../utils/formatDateTime";
import "../pages/Deliveries.css";
import SortableTableWrapper from "../components/SortableTableWrapper";
import Pagination from "../components/Pagination";

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

function Deliveries() {
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
  const [submitModal, setSubmitModal] = useState({ open: false, deliverable: null });
  const [viewModal, setViewModal] = useState({ open: false, deliverable: null });
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const ITEMS_PER_PAGE = 10;

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
        const items = data?.data;
        setDeliverables(Array.isArray(items) ? items : (Array.isArray(items?.data) ? items.data : []));
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
          const d = data.deliverable;
          if (d.status === "pending" || d.status === "rejected" || d.status === "reopened") {
            setSubmitModal({ open: true, deliverable: d });
          } else {
            setViewModal({ open: true, deliverable: d });
          }
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
    setShowAll(!filter);
    setPage(1);
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

  const handleSubmissionSuccess = (updatedDeliverable) => {
    setDeliverables((prev) =>
      prev.map((d) =>
        d.id === updatedDeliverable.id
          ? { ...d, status: "submitted", has_submitted: true }
          : d
      )
    );
  };

  const displayItems = orderedDeliverables.length ? orderedDeliverables : deliverables;

  const totalPages = showAll ? 1 : Math.ceil(displayItems.length / ITEMS_PER_PAGE);
  const paginatedItems = showAll ? displayItems : displayItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

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
            <h1>Deliverables Assigned To You</h1>
            <p>Manage and track your deliverables</p>
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

        <div className="delivery-serach-bar">
          <IoSearchOutline fontSize={"20px"} />
          <input type="text" placeholder="Search by deliverable name" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="container">
          <div className="deliveries-table-header">
            <div>Deliverable</div>
            <div>Task</div>
            <div>Assigned By</div>
            <div>Status</div>
            <div>Due Date</div>
            <div>Action</div>
          </div>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
          ) : displayItems.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No deliverables found</div>
          ) : (
            <SortableTableWrapper items={paginatedItems} onReorder={handleDeliverableReorder} as="div">
              {(item, idx) => {
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
                      <div style={{ whiteSpace: "pre-line" }}>{formatDate(item.due_date)}</div>
                    </div>
                    <div className="action-btns">
                      {(item.status === "pending" || item.status === "rejected" || item.status === "reopened") ? (
                        <button className="action-icon-btn action-submit" title="Submit Deliverable" onClick={() => setSubmitModal({ open: true, deliverable: item })}>
                          <LuSend />
                        </button>
                      ) : (
                        <button className="action-icon-btn action-view" title="View Submission" onClick={() => setViewModal({ open: true, deliverable: item })}>
                          <IoEyeOutline />
                        </button>
                      )}
                    </div>
                  </div>
                );
              }}
            </SortableTableWrapper>
          )}
        </div>
      </div>

      {!showAll && totalPages > 1 && (
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      <SubmitDeliverableModal
        key={`submit-${submitModal.deliverable?.id || "none"}`}
        isOpen={submitModal.open}
        onClose={() => setSubmitModal({ open: false, deliverable: null })}
        deliverable={submitModal.deliverable}
        onSubmitSuccess={handleSubmissionSuccess}
      />

      <ViewDeliverableModal
        key={`view-${viewModal.deliverable?.id || "none"}`}
        isOpen={viewModal.open}
        onClose={() => setViewModal({ open: false, deliverable: null })}
        deliverable={viewModal.deliverable}
        onSubmitSuccess={handleSubmissionSuccess}
      />
    </DashboardLayout>
  );
}

export default Deliveries;
