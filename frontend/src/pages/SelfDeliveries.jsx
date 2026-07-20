/**
 * SelfDeliveries page component.
 *
 * Lists subtasks that the current user has assigned to themselves.
 * Provides search, status filtering (draft, submitted, rework required,
 * approved), time-range filtering, drag-and-drop reordering and pagination.
 * Submit and view actions open modals for the selected subtask.
 */

import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { useState, useEffect, useCallback } from "react";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import { Link, useSearchParams } from "react-router-dom";
import { GoDotFill } from "react-icons/go";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";
import { StickyNote } from "lucide-react";
import { authToken, rolePath } from "../utils/auth";
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import Pagination from "../components/Pagination";
import ActionPopover from "../components/ActionPopover";
import AddNoteModal from "../components/AddNoteModal";
import API_URL from "../config/api";
import SubmitDeliverableModal from "../components/SubmitDeliverableModal";
import SelfDeliverableViewModal from "../components/SelfDeliverableViewModal";
import { formatDateTimeInline } from "../utils/formatDateTime";
import "../components/ActionPopover.css";
import "../pages/Deliveries.css";
import "../pages/Task.css";

const STATUS_COLORS = {
  pending: "#F3F4F6",
  submitted: "#DBEAFE",
  approved: "#DCFCE7",
  rework_required: "#FEF3C7",
};

const STATUS_TEXT_COLORS = {
  pending: "#374151",
  submitted: "#1E40AF",
  approved: "#166534",
  rework_required: "#92400E",
};

/** Main Self Subtasks page — fetches and renders the user's own subtasks. */
function SelfDeliveries() {
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
  const [noteModal, setNoteModal] = useState({ open: false, itemId: null });
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setOrderedSubtasks(subtasks);
  }, [subtasks]);

  useEffect(() => {
    const status = searchParams.get("status") || "";
    setStatusFilter(status);
  }, [searchParams]);

  /** Fetch self-assigned subtasks from the API with current filters. */
  const fetchSubtasks = () => {
    setLoading(true);
    const token = authToken();
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (statusFilter) params.append("status", statusFilter);
    if (timeFilter) params.append("time_filter", timeFilter);

    fetch(`${API_URL}/self-deliverables?${params.toString()}`, {
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

  useAutoRefresh(fetchSubtasks, { events: ['deliverable:updated', 'deliverable:created', 'deliverable:deleted', 'data:changed'] });

  const selectStatusFilter = (filter) => {
    if (filter === statusFilter && filter === "") {
      setShowAll(!showAll);
    } else {
      setStatusFilter(filter);
      setShowAll(false);
      setPage(1);
      if (filter) {
        setSearchParams({ status: filter });
      } else {
        setSearchParams({});
      }
    }
  };

  const handleSubtaskReorder = useCallback((reordered) => {
    setOrderedSubtasks(reordered);
    const token = authToken();
    const payload = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
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
      pending: "Draft",
      submitted: "Submitted",
      approved: "Approved",
      rework_required: "Rework Required",
    };
    return map[status] || status;
  };

  const handleSubtaskUpdate = (updatedSubtask) => {
    setSubtasks((prev) =>
      prev.map((d) =>
        d.id === updatedSubtask.id ? { ...d, ...updatedSubtask } : d
      )
    );
  };

  const displayItems = orderedSubtasks.length ? orderedSubtasks : subtasks;

  const allCount = displayItems.length;
  const dueTodayCount = displayItems.filter((i) => { const d = i.due_date ? new Date(i.due_date) : null; return d && d.toDateString() === new Date().toDateString(); }).length;
  const pendingCount = displayItems.filter((i) => i.status === "pending").length;
  const submittedCount = displayItems.filter((i) => i.status === "submitted").length;
  const reworkRequiredCount = displayItems.filter((i) => i.status === "rework_required").length;
  const approvedCount = displayItems.filter((i) => i.status === "approved").length;

  const totalPages = showAll ? 1 : Math.ceil(displayItems.length / ITEMS_PER_PAGE);
  const paginatedItems = showAll ? displayItems : displayItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const breadcrumbs = [
    { label: "Subtasks", path: rolePath("deliveries") },
    { label: "Self Subtasks" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="projects-page">
        <div className="projects-header">
          <div>
            <h1>Self Subtasks</h1>
            <p>Subtasks assigned to yourself</p>
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
          <p className={`All ${!statusFilter ? "active" : ""}`} onClick={() => selectStatusFilter("")} style={{ cursor: "pointer" }}>All ({allCount})</p>
          <p className={`DueToday ${statusFilter === "due_today" ? "active" : ""}`} onClick={() => selectStatusFilter("due_today")} style={{ cursor: "pointer" }}>
            <GoDotFill color="#EF4444" /> Due Today ({dueTodayCount})
          </p>
          <p className={`Pending ${statusFilter === "pending" ? "active" : ""}`} onClick={() => selectStatusFilter("pending")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Draft ({pendingCount})
          </p>
          <p className={`Submitted ${statusFilter === "submitted" ? "active" : ""}`} onClick={() => selectStatusFilter("submitted")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Submitted ({submittedCount})
          </p>
          <p className={`Reopened ${statusFilter === "rework_required" ? "active" : ""}`} onClick={() => selectStatusFilter("rework_required")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Rework Required ({reworkRequiredCount})
          </p>
          <p className={`Approved ${statusFilter === "approved" ? "active" : ""}`} onClick={() => selectStatusFilter("approved")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Approved ({approvedCount})
          </p>
        </div>

        <div className="delivery-serach-bar">
          <IoSearchOutline fontSize={"20px"} />
          <input type="text" placeholder="Search by subtask name" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="container">
          <div className="deliveries-table-header self-deliveries-grid">
            <div></div>
            <div>Subtask</div>
            <div>Related Task/Project</div>
            <div>Status</div>
            <div>Start & Due Date</div>
            <div>Action</div>
          </div>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
          ) : subtasks.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No subtasks found</div>
          ) : (
            <SortableTableWrapper items={paginatedItems} onReorder={handleSubtaskReorder} idKey="id" as="div" handleOnly>
              {(item, idx, dndProps) => {
                const colors = getRandomColors(item.id);
                const canSubmit = item.status === "pending" || item.status === "rework_required";
                const canView = item.status === "submitted" || item.status === "approved";
                return (
                  <div className="deliveries-table-row self-deliveries-grid">
                    <DragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} />
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
                    <div style={{ whiteSpace: "pre-line" }}>{formatDate(item.start_date)}{"\n"}{formatDate(item.due_date)}</div>
                  </div>
                    <ActionPopover
                      trigger={
                        <button className="action-icon-btn action-view action-trigger-lg" title="Actions">
                          <IoEyeOutline size={20} />
                        </button>
                      }
                    >
                      <button className="action-icon-btn action-note" title="Add Note" onClick={() => setNoteModal({ open: true, itemId: item.id })}><StickyNote size={14} /></button>
                      {canSubmit ? (
                        <button
                          className="action-icon-btn action-submit"
                          title={item.status === "rework_required" ? "Resubmit Subtask" : "Submit Subtask"}
                          onClick={() => setSubmitModal({ open: true, subtask: item })}
                        >
                          <LuSend size={16} />
                        </button>
                      ) : canView ? (
                        <button
                          className="action-icon-btn action-view"
                          title="View Subtask"
                          onClick={() => setViewModal({ open: true, subtask: item })}
                        >
                          <IoEyeOutline size={16} />
                        </button>
                      ) : null}
                    </ActionPopover>
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
        onSubmitSuccess={handleSubtaskUpdate}
      />

      <SelfDeliverableViewModal
        key={`view-${viewModal.subtask?.id || "none"}`}
        isOpen={viewModal.open}
        onClose={() => setViewModal({ open: false, subtask: null })}
        deliverable={viewModal.subtask}
        onActionSuccess={handleSubtaskUpdate}
        onResubmit={(subtask) => setSubmitModal({ open: true, subtask })}
      />

      <AddNoteModal
        isOpen={noteModal.open}
        onClose={() => setNoteModal({ open: false, itemId: null })}
        itemType="deliverable"
        itemId={noteModal.itemId}
        onSaved={fetchSubtasks}
      />
    </DashboardLayout>
  );
}

export default SelfDeliveries;
