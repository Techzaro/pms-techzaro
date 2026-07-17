/**
 * Deliveries.jsx — Subtasks Assigned To You Page
 *
 * Lists all subtasks assigned to the current user with:
 * - Status filter tabs (Due Today, Pending, Submitted, Reopened, Approved, Rejected)
 * - Search by subtask name
 * - Time filter (All Time, Last 7/30 Days, Last 6 Months)
 * - Sortable table with drag-and-drop reordering
 * - Pagination
 * - Submit/View modals for subtask actions
 * - Deep-linking support via ?selectedDeliverable= param
 */
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { useState, useEffect, useCallback } from "react";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import { Link, useSearchParams } from "react-router-dom";
import { GoDotFill } from "react-icons/go";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";
import { authToken, rolePath } from "../utils/auth";
import API_URL from "../config/api";
import SubmitDeliverableModal from "../components/SubmitDeliverableModal";
import ViewDeliverableModal from "../components/ViewDeliverableModal";
import { formatDateTimeInline } from "../utils/formatDateTime";
import "../pages/Deliveries.css";
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import Pagination from "../components/Pagination";

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
 * Deliveries — Lists subtasks assigned to the current user.
 * Supports filtering, searching, pagination, sortable reordering, and submit/view modals.
 */
function Deliveries() {
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
  const [submitModal, setSubmitModal] = useState({ open: false, subtask: null });
  const [viewModal, setViewModal] = useState({ open: false, subtask: null });
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const ITEMS_PER_PAGE = 10;

  // Fetch subtasks from API with search and status filters
  const fetchSubtasks = () => {
    setLoading(true);
    const token = authToken();
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (statusFilter) params.append("status", statusFilter);

    fetch(`${API_URL}/deliverables?${params.toString()}`, {
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

  // Deep linking: auto-open submit/view modal when ?selectedDeliverable= is in URL
  useEffect(() => {
    const selectedId = searchParams.get("selectedDeliverable");
    if (!selectedId) return;

    // Remove the param from URL without navigation
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("selectedDeliverable");
      return next;
    }, { replace: true });

    // Fetch the specific subtask and open appropriate modal
    const token = authToken();
    fetch(`${API_URL}/deliverables/${selectedId}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.deliverable) {
          const d = data.deliverable;
          if (d.status === "pending" || d.status === "rejected" || d.status === "reopened") {
            setSubmitModal({ open: true, subtask: d });
          } else {
            setViewModal({ open: true, subtask: d });
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

  // Handle drag-and-drop reorder and persist sort order to API
  const handleSubtaskReorder = useCallback((reordered) => {
    setOrderedSubtasks(reordered);
    const payload = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
    const token = authToken();
    fetch(`${API_URL}/deliverables/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items: payload }),
      _notifHandled: true,
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
    return formatDateTimeInline(dateStr);
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

  // Update local state after successful submission to reflect new status
  const handleSubmissionSuccess = (updatedSubtask) => {
    setSubtasks((prev) =>
      prev.map((d) =>
        d.id === updatedSubtask.id
          ? { ...d, status: "submitted", has_submitted: true }
          : d
      )
    );
  };

  const displayItems = orderedSubtasks.length ? orderedSubtasks : subtasks;

  const totalPages = showAll ? 1 : Math.ceil(displayItems.length / ITEMS_PER_PAGE);
  const paginatedItems = showAll ? displayItems : displayItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const breadcrumbs = [
    { label: "Subtasks", path: rolePath("deliveries") },
    { label: "Assigned To You" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="projects-page">
        <div className="projects-header">
          <div>
            <h1>Subtasks Assigned To You</h1>
            <p>Manage and track your subtasks</p>
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
          <div className="deliveries-table-header">
            <div></div>
            <div>Assigned By</div>
            <div>Subtask</div>
            <div>Task</div>
            <div>Status</div>
            <div>Start & Due Date</div>
            <div>Action</div>
          </div>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
          ) : displayItems.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No subtasks found</div>
          ) : (
            <SortableTableWrapper items={paginatedItems} onReorder={handleSubtaskReorder} as="div" handleOnly>
              {(item, idx, dndProps) => {
                const colors = getRandomColors(item.id);
                return (
                  <div className="deliveries-table-row" key={item.id}>
                    <DragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} />
                    <div className="user-box">
                      <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                        {getInitials(item.creator?.name)}
                      </div>
                      <div>
                        <div className="user-name">{item.creator?.name || "-"}</div>
                        <div className="user-role">{item.creator?.role ? item.creator.role.replace("_", " ") : ""}</div>
                      </div>
                    </div>
                    <div className="user-box">
                      <div className="avatar" style={{ background: colors.bg, color: colors.text }}>
                        {getInitials(item.title)}
                      </div>
                      <div>
                        <div className="user-name">{item.title}</div>
                        {item.project && (
                          <Link to={rolePath(`projects/project-details/${item.project.id}`)} onClick={(e) => e.stopPropagation()} style={{ fontSize: "11px", color: "#2563eb", textDecoration: "none", marginTop: "2px", display: "inline-block" }}>
                            {item.project.title}
                          </Link>
                        )}
                      </div>
                    </div>
                     <div>
                       <div className="task-title">{item.task?.title || item.project?.title || "-"}</div>
                       {(item.project || item.task?.project) && item.task?.title && (
                         <Link to={rolePath(`projects/project-details/${(item.project || item.task.project).id}`)} onClick={(e) => e.stopPropagation()} style={{ fontSize: "11px", color: "#2563eb", textDecoration: "none", marginTop: "2px", display: "inline-block" }}>
                           {(item.project || item.task.project).title}
                         </Link>
                       )}
                     </div>
                    <div>
                      <span className="badge" style={{ background: STATUS_COLORS[item.status] || "#F3F4F6", color: STATUS_TEXT_COLORS[item.status] || "#374151", padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 600 }}>
                        <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.status] || "#374151" }}></span>
                        {formatStatus(item.status)}
                      </span>
                      {item.status === "approved" && item.approvedBy && (
                        <div style={{ fontSize: "10px", color: "#166534", marginTop: "2px" }}>by {item.approvedBy.name}</div>
                      )}
                      {item.status === "rejected" && item.rejectedBy && (
                        <div style={{ fontSize: "10px", color: "#991B1B", marginTop: "2px" }}>by {item.rejectedBy.name}</div>
                      )}
                      {item.status === "reopened" && item.reopenedBy && (
                        <div style={{ fontSize: "10px", color: "#92400E", marginTop: "2px" }}>by {item.reopenedBy.name}</div>
                      )}
                    </div>
                    <div className="date-box">
                      <div style={{ whiteSpace: "pre-line" }}>{formatDateTimeInline(item.start_date)}{"\n"}{formatDateTimeInline(item.due_date)}</div>
                    </div>
                    <div className="action-btns">
                      {(item.status === "pending" || item.status === "rejected" || item.status === "reopened") ? (
                        <button className="action-icon-btn action-submit" title="Submit Subtask" onClick={() => setSubmitModal({ open: true, subtask: item })}>
                          <LuSend />
                        </button>
                      ) : (
                        <button className="action-icon-btn action-view" title="View Submission" onClick={() => setViewModal({ open: true, subtask: item })}>
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
        key={`submit-${submitModal.subtask?.id || "none"}`}
        isOpen={submitModal.open}
        onClose={() => setSubmitModal({ open: false, subtask: null })}
        deliverable={submitModal.subtask}
        onSubmitSuccess={handleSubmissionSuccess}
      />

      <ViewDeliverableModal
        key={`view-${viewModal.subtask?.id || "none"}`}
        isOpen={viewModal.open}
        onClose={() => setViewModal({ open: false, subtask: null })}
        deliverable={viewModal.subtask}
        onSubmitSuccess={handleSubmissionSuccess}
      />
    </DashboardLayout>
  );
}

export default Deliveries;
