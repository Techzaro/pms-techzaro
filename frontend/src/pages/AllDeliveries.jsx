/**
 * AllDeliveries.jsx — All Sub-Tasks Page
 *
 * Read-only view of all deliverables within the user's visibility scope.
 * Mirrors the AllTasks page pattern exactly.
 *
 * Displays deliverables based on role-based visibility:
 * - Admin: All deliverables in the company
 * - Manager: Deliverables within managed teams
 * - Team Lead: Deliverables within their team
 * - Member: Deliverables they are directly involved in
 *
 * This page is strictly read-only — no edit, submit, or workflow actions.
 */
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import DraggableStatusBadges from "../components/DraggableStatusBadges";
import { GoDotFill } from "react-icons/go";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { ArrowUpRight, StickyNote } from "lucide-react";
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import SmartDragHandle from "../components/SmartDragHandle";
import Pagination from "../components/Pagination";
import ActionPopover from "../components/ActionPopover";
import AddNoteModal from "../components/AddNoteModal";
import TaskMultiStatusBadges from "../components/TaskMultiStatusBadges";
import TaskFilterBar from "../components/TaskFilterBar";
import API_URL from "../config/api";
import { authToken, getUser, rolePath } from "../utils/auth";
import { renderDynamicDates } from "../utils/tableDateUtils";
import { formatDateOnly } from "../utils/formatDateTime";
import "../components/ActionPopover.css";
import "../pages/Deliveries.css";

const STATUS_COLORS = {
  pending: "#FEF3C7",
  in_progress: "#DBEAFE",
  paused: "#FEF3C7",
  submitted: "#DBEAFE",
  reopened: "#EDE9FE",
  approved: "#DCFCE7",
  rejected: "#FEE2E2",
  abandon_requested: "#FEF3C7",
  abandoned: "#FEE2E2",
};

const STATUS_TEXT_COLORS = {
  pending: "#92400E",
  in_progress: "#1E40AF",
  paused: "#92400E",
  submitted: "#1E40AF",
  reopened: "#5B21B6",
  approved: "#166534",
  rejected: "#991B1B",
  abandon_requested: "#92400E",
  abandoned: "#991B1B",
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

/** Main AllDeliveries page — read-only view of deliverables within the user's scope. */
function AllDeliveries() {
  const { t } = useTranslation();
  const currentUser = getUser();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState(() => {
    const status = searchParams.get("status");
    if (status) return status;
    return "";
  });
  const [timeFilter, setTimeFilter] = useState("");
  const [advancedFilters, setAdvancedFilters] = useState({
    user_id: [],
    project_id: [],
    status: [],
    start_date: "",
    end_date: "",
  });
  const [orderedItems, setOrderedItems] = useState([]);
  const [noteModal, setNoteModal] = useState({ open: false, itemId: null });

  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /** Fetch all deliverables from the API with role-based visibility. */
  const fetchDeliverables = () => {
    setLoading(true);
    const token = authToken();
    const params = new URLSearchParams();
    if (debouncedSearch) params.append("search", debouncedSearch);
    if (timeFilter) params.append("time_filter", timeFilter);
    if (advancedFilters.user_id && advancedFilters.user_id.length > 0) {
      params.append("user_id", Array.isArray(advancedFilters.user_id) ? advancedFilters.user_id.join(",") : advancedFilters.user_id);
    }
    if (advancedFilters.project_id && advancedFilters.project_id.length > 0) {
      params.append("project_id", Array.isArray(advancedFilters.project_id) ? advancedFilters.project_id.join(",") : advancedFilters.project_id);
    }
    if (advancedFilters.status && advancedFilters.status.length > 0) {
      params.append("status", Array.isArray(advancedFilters.status) ? advancedFilters.status.join(",") : advancedFilters.status);
    }
    if (advancedFilters.start_date) params.append("start_date", advancedFilters.start_date);
    if (advancedFilters.end_date) params.append("end_date", advancedFilters.end_date);

    fetch(`${API_URL}/all-deliverables?${params.toString()}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => {
        let raw = data?.data;
        if (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray(raw.data)) {
          raw = raw.data;
        }
        if (!Array.isArray(raw)) {
          raw = Array.isArray(data?.deliverables) ? data.deliverables : (Array.isArray(data) ? data : []);
        }
        setItems(raw);
        setTotalCount(data?.total ?? raw.length);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDeliverables();
  }, [debouncedSearch, timeFilter, advancedFilters]);

  useAutoRefresh(fetchDeliverables, {
    events: ['deliverable:created', 'deliverable:updated', 'deliverable:deleted', 'data:changed'],
  });

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  useEffect(() => {
    const status = searchParams.get("status") || "";
    setStatusFilter(status);
  }, [searchParams]);

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

  const formatStatus = (status) => {
    const map = {
      pending: "Pending",
      in_progress: "In Progress",
      paused: "Paused",
      submitted: "Submitted",
      reopened: "Reopened",
      approved: "Approved",
      rejected: "Declined",
      abandon_requested: "Abandon Requested",
      abandoned: "Abandoned",
    };
    const label = map[status] || status;
    return t(label, { defaultValue: label });
  };

  const baseItems = orderedItems.length ? orderedItems : items;

  const pendingStatuses = ["pending", "planned", "Planning", "Planned"];
  const inProgressStatuses = ["in_progress", "In Progress", "In-progress"];

  const safeBaseItems = Array.isArray(baseItems) ? baseItems : [];

  const allCount = useMemo(() => safeBaseItems.length, [safeBaseItems]);
  const dueTodayCount = useMemo(() => safeBaseItems.filter((i) => {
    if (!i || !i.due_date) return false;
    const d = new Date(i.due_date);
    return !isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
  }).length, [safeBaseItems]);
  const pendingCount = useMemo(() => safeBaseItems.filter((i) => i && pendingStatuses.includes(i.status)).length, [safeBaseItems]);
  const inProgressCount = useMemo(() => safeBaseItems.filter((i) => i && inProgressStatuses.includes(i.status)).length, [safeBaseItems]);
  const pausedCount = useMemo(() => safeBaseItems.filter((i) => i && i.status === "paused").length, [safeBaseItems]);
  const submittedCount = useMemo(() => safeBaseItems.filter((i) => i && i.status === "submitted").length, [safeBaseItems]);
  const reopenedCount = useMemo(() => safeBaseItems.filter((i) => i && i.status === "reopened").length, [safeBaseItems]);
  const transferredCount = useMemo(() => safeBaseItems.filter((i) => i && Array.isArray(i.delegation_chain) && i.delegation_chain.length > 0).length, [safeBaseItems]);
  const approvedCount = useMemo(() => safeBaseItems.filter((i) => i && i.status === "approved").length, [safeBaseItems]);
  const rejectedCount = useMemo(() => safeBaseItems.filter((i) => i && i.status === "rejected").length, [safeBaseItems]);
  const abandonedCount = useMemo(() => safeBaseItems.filter((i) => i && (i.status === "abandoned" || i.status === "abandon_requested")).length, [safeBaseItems]);

  const searchFilteredItems = useMemo(() => {
    let list = safeBaseItems;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((item) => {
        if (!item) return false;
        const titleMatch = (item.title || "").toLowerCase().includes(q);
        const assigneeMatch = (item.assignee?.name || "").toLowerCase().includes(q);
        const creatorMatch = (item.creator?.name || "").toLowerCase().includes(q);
        const taskMatch = (item.task?.title || "").toLowerCase().includes(q);
        const projectMatch = (item.project?.title || item.task?.project?.title || "").toLowerCase().includes(q);
        return titleMatch || assigneeMatch || creatorMatch || taskMatch || projectMatch;
      });
    }
    if (advancedFilters.user_id && advancedFilters.user_id.length > 0) {
      const uids = (Array.isArray(advancedFilters.user_id) ? advancedFilters.user_id : [advancedFilters.user_id]).map(Number);
      list = list.filter((item) => {
        if (!item) return false;
        const aid = Number(item.assigned_to || item.assignee?.id);
        const cid = Number(item.created_by || item.creator?.id);
        return uids.includes(aid) || uids.includes(cid);
      });
    }
    if (advancedFilters.project_id && advancedFilters.project_id.length > 0) {
      const pids = (Array.isArray(advancedFilters.project_id) ? advancedFilters.project_id : [advancedFilters.project_id]).map(Number);
      list = list.filter((item) => {
        if (!item) return false;
        const pid = Number(item.project_id || item.project?.id || item.task?.project_id || item.task?.project?.id);
        return pids.includes(pid);
      });
    }
    if (advancedFilters.status && advancedFilters.status.length > 0) {
      const sts = Array.isArray(advancedFilters.status) ? advancedFilters.status : [advancedFilters.status];
      list = list.filter((item) => {
        if (!item) return false;
        return sts.some((st) => {
          if (st === "due_today") {
            const d = item.due_date || item.end_date || item.start_date ? new Date(item.due_date || item.end_date || item.start_date) : null;
            const isToday = d && !isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
            const isDone = ["approved", "completed", "done"].includes((item.status || "").toLowerCase());
            return isToday && !isDone;
          }
          if (st === "pending") return ["pending", "planned", "Planning", "Planned"].includes(item.status);
          if (st === "in_progress") return ["in_progress", "In Progress", "in-progress"].includes(item.status);
          if (st === "paused") return ["paused", "pause", "Pause"].includes(item.status);
          if (st === "transferred") return Array.isArray(item.delegation_chain) && item.delegation_chain.length > 0;
          if (st === "rejected" || st === "declined") return item.status === "rejected" || item.status === "declined";
          if (st === "abandoned") return item.status === "abandoned" || item.status === "abandon_requested";
          if (st === "approved") return item.status === "approved" || item.status === "completed";
          return item.status === st;
        });
      });
    }
    if (advancedFilters.start_date) {
      list = list.filter((item) => {
        if (!item || !item.start_date) return false;
        return new Date(item.start_date) >= new Date(advancedFilters.start_date);
      });
    }
    if (advancedFilters.end_date) {
      list = list.filter((item) => {
        if (!item || (!item.end_date && !item.due_date)) return false;
        const d = new Date(item.end_date || item.due_date);
        return d <= new Date(advancedFilters.end_date);
      });
    }
    return list;
  }, [safeBaseItems, debouncedSearch, advancedFilters]);

  const filteredItems = useMemo(() => statusFilter && statusFilter !== "due_today"
    ? searchFilteredItems.filter((item) => {
        if (!item) return false;
        if (statusFilter === "pending") {
          return pendingStatuses.includes(item.status);
        }
        if (statusFilter === "transferred") {
          return Array.isArray(item.delegation_chain) && item.delegation_chain.length > 0;
        }
        if (statusFilter === "abandoned") {
          return item.status === "abandoned" || item.status === "abandon_requested";
        }
        return item.status === statusFilter;
      })
    : searchFilteredItems, [searchFilteredItems, statusFilter]);

  const deliverableIdList = filteredItems.map((i) => i.id);

  const totalPages = showAll ? 1 : Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = showAll ? filteredItems : filteredItems.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const breadcrumbs = [
    { label: t("Subtasks", { defaultValue: "Subtasks" }), path: rolePath("deliveries") },
    { label: t("All Sub-Tasks", { defaultValue: "All Sub-Tasks" }) },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="projects-page">
        <div className="projects-header">
          <div>
            <h1>{t("All Sub-Tasks", { defaultValue: "All Sub-Tasks" })}</h1>
            <p>{t("Monitor and track subtasks across your scope", { defaultValue: "Monitor and track subtasks across your scope" })}</p>
          </div>
          <div className="header-actions">
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} className="reports-filter">
              <option value="">{t("All Time", { defaultValue: "All Time" })}</option>
              <option value="7">{t("Last 7 Days", { defaultValue: "Last 7 Days" })}</option>
              <option value="30">{t("Last 30 Days", { defaultValue: "Last 30 Days" })}</option>
              <option value="180">{t("Last 6 Months", { defaultValue: "Last 6 Months" })}</option>
            </select>
          </div>
        </div>

        {/* STATUS FILTERS */}
        <DraggableStatusBadges
          badges={[
            { id: "due_today", label: t("Due Today", { defaultValue: "Due Today" }), count: dueTodayCount, className: "DueToday", dotColor: "#EF4444" },
            { id: "pending", label: t("Pending", { defaultValue: "Pending" }), count: pendingCount, className: "Pending" },
            { id: "in_progress", label: t("In Progress", { defaultValue: "In Progress" }), count: inProgressCount, className: "InProgress" },
            { id: "paused", label: t("Paused", { defaultValue: "Paused" }), count: pausedCount, className: "Paused" },
            { id: "submitted", label: t("Submitted", { defaultValue: "Submitted" }), count: submittedCount, className: "Submitted" },
            { id: "reopened", label: t("Reopened", { defaultValue: "Reopened" }), count: reopenedCount, className: "Reopened" },
            { id: "transferred", label: t("Transferred", { defaultValue: "Transferred" }), count: transferredCount, className: "Transferred" },
            { id: "approved", label: t("Completed", { defaultValue: "Completed" }), count: approvedCount, className: "Approved" },
            { id: "rejected", label: t("Declined", { defaultValue: "Declined" }), count: rejectedCount, className: "Rejected" },
            { id: "abandoned", label: t("Abandoned", { defaultValue: "Abandoned" }), count: abandonedCount, className: "Abandoned", dotColor: "#DC2626" },
            { id: "", label: t("All", { defaultValue: "All" }), count: allCount, className: "All" },
          ]}
          activeStatus={statusFilter}
          onSelectStatus={selectStatusFilter}
          storageKey="pms_all_deliveries_status_order"
          containerClassName="task-progress"
        />

        {/* DEDICATED ACTION BAR & FILTERS */}
        <TaskFilterBar
          search={search}
          onSearchChange={setSearch}
          filters={advancedFilters}
          onFilterChange={(key, val) => setAdvancedFilters((prev) => ({ ...prev, [key]: val }))}
          onReset={() => {
            setSearch("");
            setAdvancedFilters({ user_id: [], project_id: [], status: [], start_date: "", end_date: "" });
          }}
        />

        {/* TABLE */}
        <div className="container">
          <div className="all-subtasks-header">
            <div>{t("ID", { defaultValue: "ID" })}</div>
            <div>{t("Assigned To", { defaultValue: "Assigned To" })}</div>
            <div>{t("Assigned By", { defaultValue: "Assigned By" })}</div>
            <div>{t("Sub-Task Name", { defaultValue: "Sub-Task Name" })}</div>
            <div>{t("Parent Task", { defaultValue: "Parent Task" })}</div>
            <div>{t("Priority", { defaultValue: "Priority" })}</div>
            <div>{t("Status", { defaultValue: "Status" })}</div>
            <div>{t("Due Date", { defaultValue: "Due Date" })}</div>
            <div>{t("Progress", { defaultValue: "Progress" })}</div>
            <div style={{ textAlign: "center" }}>{t("Action", { defaultValue: "Action" })}</div>
          </div>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>{t("Loading...", { defaultValue: "Loading..." })}</div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>{t("No items found", { defaultValue: "No items found" })}</div>
          ) : (
            <SortableTableWrapper
              items={paginatedItems.map((i, index) => ({
                ...i,
                sortableId: `${i.id}-${index}`
              }))}
              onReorder={() => {}}
              idKey="sortableId"
              as="div"
              handleOnly
            >
              {(item, idx, dndProps) => {
                const assigneeColors = getRandomColors(item.assignee?.id || item.id);
                const creatorColors = getRandomColors((item.creator?.id || 0) + 100);
                const uniqueKey = `all-subtask-${item.id}-${idx}`;

                return (
                  <div className="all-subtasks-row" key={uniqueKey}>
                    <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} id={item.id} businessId={item.business_id} color="#16a34a" />

                    {/* Assigned To */}
                    <div className="col-assigned-to">
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div className="avatar" style={{ background: assigneeColors.bg, color: assigneeColors.text }}>
                          {getInitials(item.assignee?.name)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="user-name">{item.assignee?.name || t("Unassigned", { defaultValue: "Unassigned" })}</div>
                          <div className="user-role">{item.assignee?.role || ""}</div>
                        </div>
                      </div>
                    </div>

                    {/* Assigned By (Creator) */}
                    <div className="col-assigned-by">
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div className="avatar" style={{ background: creatorColors.bg, color: creatorColors.text }}>
                          {getInitials(item.creator?.name)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="user-name">{item.creator?.name || t("System", { defaultValue: "System" })}</div>
                          <div className="user-role">{item.creator?.role || ""}</div>
                        </div>
                      </div>
                    </div>

                    {/* Sub-Task Name */}
                    <div className="col-subtask-name">
                      {item.delegation_chain && item.delegation_chain.length > 0 && <ArrowUpRight size={14} style={{ color: "#6B7280", flexShrink: 0 }} />}
                      <div className="task-title">{item.title}</div>
                    </div>

                    {/* Parent Task */}
                    <div className="col-parent-task">
                      <div>
                        <div className="task-title">{item.task?.title || "-"}</div>
                      </div>
                    </div>

                    {/* Priority */}
                    <div className="col-priority">
                      <span className="badge" style={{ background: PRIORITY_COLORS[item.priority] || "#F3F4F6", color: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}>
                        <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}></span>
                        {t(item.priority, { defaultValue: item.priority })}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="col-status">
                      <TaskMultiStatusBadges item={item} />
                    </div>

                    {/* Due Date */}
                    <div className="col-due-date">
                      <div className="date-box">
                        {renderDynamicDates(item, currentUser)}
                      </div>
                    </div>

                    {/* Progress (Submission Status) */}
                    <div className="col-progress">
                      <span className="badge" style={{
                        background: STATUS_COLORS[item.submission_status] || "#F3F4F6",
                        color: STATUS_TEXT_COLORS[item.submission_status] || "#374151",
                        fontSize: "11px",
                      }}>
                        <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.submission_status] || "#374151" }}></span>
                        {formatStatus(item.submission_status)}
                      </span>
                    </div>

                    {/* Action — View only */}
                    <div className="col-action" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
                      <ActionPopover
                        trigger={
                          <button className="action-icon-btn action-view action-trigger-lg" title={t("Actions", { defaultValue: "Actions" })}>
                            <IoEyeOutline size={20} />
                          </button>
                        }
                        onTriggerClick={() => navigate(rolePath(`deliveries/deliverable-details/${item.id}`), { state: { subtaskIds: deliverableIdList, from: 'all-deliverables', readOnly: true } })}
                      >
                        <button
                          className="action-icon-btn action-note"
                          title={t("Add Note", { defaultValue: "Add Note" })}
                          onClick={() => setNoteModal({ open: true, itemId: item.id })}
                        >
                          <StickyNote size={16} />
                        </button>
                      </ActionPopover>
                    </div>
                  </div>
                );
              }}
            </SortableTableWrapper>
          )}
        </div>
      </div>

      {!showAll && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={(val) => { setItemsPerPage(val); setPage(1); }}
        />
      )}

      <AddNoteModal
        isOpen={noteModal.open}
        onClose={() => setNoteModal({ open: false, itemId: null })}
        itemType="deliverable"
        itemId={noteModal.itemId}
        onSaved={fetchDeliverables}
      />
    </DashboardLayout>
  );
}

export default AllDeliveries;

