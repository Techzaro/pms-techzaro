/**
 * DeliveriesByYou.jsx — Subtasks Assigned By You Page
 *
 * Lists all subtasks that the current user has assigned to others.
 * Features identical to Deliveries.jsx but from the assigner's perspective:
 * - Status filter tabs, search, time filter, sortable table, pagination
 * - View modal to review submissions (approve/reject actions)
 * - Deep-linking support via ?selectedDeliverable= param
 */
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
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import Pagination from "../components/Pagination";
import "../pages/Deliveries.css";
import "../pages/Task.css";

/** Background colors for status badges */
const STATUS_COLORS = {
  pending: "#FEF3C7",
  submitted: "#DBEAFE",
  approved: "#DCFCE7",
  rejected: "#FEE2E2",
  reopened: "#FEF3C7",
};

/** Text colors for status badges */
const STATUS_TEXT_COLORS = {
  pending: "#92400E",
  submitted: "#1E40AF",
  approved: "#166534",
  rejected: "#991B1B",
  reopened: "#92400E",
};

/**
 * DeliveriesByYou — Lists subtasks assigned by the current user to others.
 * Allows viewing submissions and performing approve/reject actions.
 */
function DeliveriesByYou() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [subtasks, setSubtasks] = useState([]);
  const [orderedSubtasks, setOrderedSubtasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => {
    const status = searchParams.get("status");
    if (status) return status;
    return "";
  });
  const [timeFilter, setTimeFilter] = useState("");
  const [viewModal, setViewModal] = useState({ open: false, subtask: null });
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const ITEMS_PER_PAGE = 10;

  // Fetch subtasks assigned by the current user from API
  const fetchSubtasks = () => {
    setLoading(true);
    const token = authToken();
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (statusFilter) params.append("status", statusFilter);
    if (timeFilter) params.append("time_filter", timeFilter);

    fetch(`${API_URL}/deliverables/assigned-by-me?${params.toString()}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => {
        const items = data?.data;
        setSubtasks(Array.isArray(items) ? items : (Array.isArray(items?.data) ? items.data : []));
      })
      .catch(() => setSubtasks([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSubtasks();
  }, [search, statusFilter, timeFilter]);

  useRefreshOnEvent(['deliverable:updated', 'deliverable:created', 'deliverable:deleted'], fetchSubtasks);

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
          setViewModal({ open: true, subtask: data.deliverable });
        }
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    const status = searchParams.get("status") || "";
    setStatusFilter(status);
  }, [searchParams]);

  useEffect(() => {
    setOrderedSubtasks(subtasks);
  }, [subtasks]);

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

  const handleSubtaskReorder = useCallback((reordered) => {
    setOrderedSubtasks(reordered);
    const payload = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
    const token = authToken();
    fetch(`${API_URL}/deliverables/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items: payload }),
      _notifHandled: true,
    }).catch(() => { });
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

  // Update local state after approve/reject action from the AssignerViewModal
  const handleActionSuccess = (updatedSubtask) => {
    setSubtasks((prev) =>
      prev.map((d) => (d.id === updatedSubtask.id ? { ...d, ...updatedSubtask } : d))
    );
  };

  const displayItems = orderedSubtasks.length ? orderedSubtasks : subtasks;

  const totalPages = showAll ? 1 : Math.ceil(displayItems.length / ITEMS_PER_PAGE);
  const paginatedItems = showAll ? displayItems : displayItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const breadcrumbs = [
    { label: "Subtasks", path: rolePath("deliveries") },
    { label: "Assigned By You" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="projects-page">
        <div className="projects-header">
          <div>
            <h1>Subtasks Assigned By You</h1>
            <p>Subtasks assigned to others from tasks and projects you created</p>
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
          <input type="text" placeholder="Search by subtask name" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="container">
          {/* Header - Div based */}
          <div className="deliveries-table-header">
            <div></div>
            <div>Subtask</div>
            <div>Task</div>
            <div>Assigned To</div>
            <div>Status</div>
            <div>Date</div>
            <div>Action</div>
          </div>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
          ) : displayItems.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No subtasks found</div>
          ) : (
            <div className="sortable-table-container">
              <SortableTableWrapper items={paginatedItems} onReorder={handleSubtaskReorder} as="div" handleOnly>
              {(item, index, dndProps) => {
                const colors = getRandomColors(item.id);
                return (
                  <div className="deliveries-table-row" key={`subtask-${item.id}-${index}`}>
                    <DragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} />
                    <div>
                      <div className="user-box">
                        <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                          {getInitials(item.title)}
                        </div>
                        <div>
                          <div className="user-name">{item.title}</div>
                          {/* OWNERSHIP INFO */}
                          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "2px" }}>
                            {item.approvedBy && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", background: "#DCFCE7", color: "#166534", padding: "1px 6px", borderRadius: "10px", fontSize: "10px", fontWeight: 500 }}>
                                Approved: {item.approvedBy.name}
                              </span>
                            )}
                            {item.rejectedBy && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", background: "#FEE2E2", color: "#991B1B", padding: "1px 6px", borderRadius: "10px", fontSize: "10px", fontWeight: 500 }}>
                                Rejected: {item.rejectedBy.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="task-title">{item.task?.title || item.project?.title || "-"}</div>
                    </div>
                    <div>
                      <div className="user-box">
                        <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                          {getInitials(item.assignee?.name)}
                        </div>
                        <div>
                          <div className="user-name">{item.assignee?.name || "Unassigned"}</div>
                          <div className="user-role">{item.assignee?.role ? item.assignee.role.replace("_", " ") : ""}</div>
                        </div>
                      </div>
                    </div>
                    <div>
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
                    </div>
                    <div>
                      <div className="date-box">
                        <div style={{ whiteSpace: "pre-line" }}>{formatDate(item.start_date)}{"\n"}{formatDate(item.due_date)}</div>
                      </div>
                    </div>
                    <div>
                      <div className="action-btns">
                        <button
                          className="action-icon-btn action-view"
                          title="View"
                          onClick={() => setViewModal({ open: true, subtask: item })}
                        >
                          <IoEyeOutline />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }}
              </SortableTableWrapper>
            </div>
          )}
        </div>
      </div>

      {!showAll && totalPages > 1 && (
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      <AssignerViewModal
        key={`avm-${viewModal.subtask?.id || "none"}`}
        isOpen={viewModal.open}
        onClose={() => setViewModal({ open: false, subtask: null })}
        deliverable={viewModal.subtask}
        onActionSuccess={handleActionSuccess}
      />
    </DashboardLayout>
  );
}

export default DeliveriesByYou;