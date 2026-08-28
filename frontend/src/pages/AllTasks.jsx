/**
 * All Tasks page component — Read-only view of all tasks within the user's visibility scope.
 *
 * Displays tasks based on role-based visibility:
/**
 * All Tasks page component — Read-only view of all tasks within the user's visibility scope.
 *
 * Displays tasks based on role-based visibility:
 * - Admin: All tasks in the company
 * - Manager: Tasks within managed teams
 * - Team Lead: Tasks within their team
 * - Member: Tasks they are directly involved in
 *
 * This page is strictly read-only — no edit, submit, or workflow actions.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import DraggableStatusBadges from "../components/DraggableStatusBadges";
import { GoDotFill } from "react-icons/go";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { ArrowUpRight, StickyNote, Sliders } from "lucide-react";
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import SmartDragHandle from "../components/SmartDragHandle";
import Pagination from "../components/Pagination";
import ActionPopover from "../components/ActionPopover";
import TaskNotesPopover from "../components/TaskNotesPopover";
import AddNoteModal from "../components/AddNoteModal";
import TaskMultiStatusBadges from "../components/TaskMultiStatusBadges";
import TaskFilterBar from "../components/TaskFilterBar";
import API_URL from "../config/api";
import { authToken, getUser, rolePath } from "../utils/auth";
import { renderDynamicDates } from "../utils/tableDateUtils";
import { formatDateTimeInline, formatDateOnly } from "../utils/formatDateTime";
import "../components/ActionPopover.css";
import "../pages/Task.css";

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

/** Main AllTasks page — read-only view of tasks within the user's scope. */
function AllTasks() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const currentUser = getUser();
  const [statusFilter, setStatusFilter] = useState(() => {
    const filterParam = searchParams.get("filter");
    if (filterParam === "due_today") return "due_today";
    const status = searchParams.get("status");
    if (status) return status;
    return filterParam || "";
  });
  const [timeFilter, setTimeFilter] = useState("");
  const [orderedItems, setOrderedItems] = useState([]);
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortBy, setSortBy] = useState("");
  const [sortDirection, setSortDirection] = useState("desc");
  const [noteModal, setNoteModal] = useState({ open: false, itemId: null });

  const [advancedFilters, setAdvancedFilters] = useState({
    user_id: [],
    project_id: [],
    statuses: [],
    status: [],
    states: [],
    due_states: [],
    start_date: "",
    end_date: "",
  });

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDirection("asc");
    }
    setPage(1);
  };

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

  const getInitials = useCallback((name) => {
    if (!name) return "??";
    return name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase();
  }, []);

  const getRandomColors = useCallback((id) => {
    const colors = [
      { bg: "#E0E7FF", text: "#4338CA" },
      { bg: "#FEE2E2", text: "#B91C1C" },
      { bg: "#DCFCE7", text: "#22C55E" },
      { bg: "#FEF3C7", text: "#D97706" },
      { bg: "#EDE9FE", text: "#7C3AED" },
      { bg: "#FCE7F3", text: "#DB2777" },
    ];
    return colors[(id || 0) % colors.length];
  }, []);

  const formatDate = (dateStr) => {
    return formatDateTimeInline(dateStr);
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
    return map[status] || status;
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /** Fetch all tasks from the API with role-based visibility. */
  const fetchTasks = useCallback(() => {
    try {
      setLoading(true);
      const token = authToken();
      const params = new URLSearchParams();
      if (timeFilter) params.append("time_filter", timeFilter);
      if (debouncedSearch) params.append("search", debouncedSearch);

      const stList = Array.isArray(advancedFilters.statuses)
        ? advancedFilters.statuses
        : Array.isArray(advancedFilters.status)
        ? advancedFilters.status
        : [];
      if (stList.length > 0) {
        stList.forEach((st) => params.append("statuses[]", st));
        params.append("statuses", stList.join(","));
      }

      const statesList = Array.isArray(advancedFilters.states) ? advancedFilters.states : [];
      if (statesList.length > 0) {
        statesList.forEach((st) => params.append("states[]", st));
        params.append("states", statesList.join(","));
      }

      const dueList = Array.isArray(advancedFilters.due_states) ? advancedFilters.due_states : [];
      if (dueList.length > 0) {
        dueList.forEach((st) => params.append("due_states[]", st));
        params.append("due_states", dueList.join(","));
      }

      const uList = Array.isArray(advancedFilters.user_id) ? advancedFilters.user_id : [];
      if (uList.length > 0) {
        params.append("user_id", uList.join(","));
      }

      const pList = Array.isArray(advancedFilters.project_id) ? advancedFilters.project_id : [];
      if (pList.length > 0) {
        params.append("project_id", pList.join(","));
      }

      if (advancedFilters.start_date) params.append("start_date", advancedFilters.start_date);
      if (advancedFilters.end_date) params.append("end_date", advancedFilters.end_date);
      if (sortBy) {
        params.append("sort_by", sortBy);
        params.append("sort_direction", sortDirection);
        params.append("sort_dir", sortDirection);
        params.append("sort_order", sortDirection);
      }

      fetch(`${API_URL}/all-tasks?${params.toString()}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      })
        .then((res) => (res.ok ? res.json() : { data: [] }))
        .then((data) => {
          setItems(Array.isArray(data?.data) ? data.data : []);
          setTotalCount(typeof data?.total === "number" ? data.total : Array.isArray(data?.data) ? data.data.length : 0);
        })
        .catch((err) => {
          console.warn("Failed to fetch tasks:", err);
          setItems([]);
        })
        .finally(() => setLoading(false));
    } catch (err) {
      console.error("fetchTasks exception:", err);
      setLoading(false);
      setItems([]);
    }
  }, [debouncedSearch, timeFilter, statusFilter, advancedFilters, sortBy, sortDirection]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks, page]);

  useAutoRefresh(fetchTasks, {
    events: ['task:created', 'task:updated', 'task:deleted', 'data:changed'],
  });

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  useEffect(() => {
    const filterParam = searchParams.get("filter");
    const statusParam = searchParams.get("status");
    const nextFilter = filterParam === "due_today" ? "due_today" : (statusParam || filterParam || "");
    setStatusFilter(nextFilter);
  }, [searchParams]);

  const baseItems = orderedItems.length ? orderedItems : items;
  const pendingStatuses = ["pending", "planned", "Planning", "Planned"];
  const inProgressStatuses = ["in_progress", "In Progress", "In-progress", "reopened", "Reopened"];

  const allCount = useMemo(() => baseItems.length, [baseItems]);
  const dueTodayCount = useMemo(() => baseItems.filter((i) => { const d = i.end_date ? new Date(i.end_date) : null; return d && d.toDateString() === new Date().toDateString(); }).length, [baseItems]);
  const pendingCount = useMemo(() => baseItems.filter((i) => pendingStatuses.includes(i.status)).length, [baseItems]);
  const inProgressCount = useMemo(() => baseItems.filter((i) => inProgressStatuses.includes(i.status)).length, [baseItems]);
  const pausedCount = useMemo(() => baseItems.filter((i) => i.status === "paused").length, [baseItems]);
  const submittedCount = useMemo(() => baseItems.filter((i) => i.status === "submitted").length, [baseItems]);
  const reopenedCount = useMemo(() => baseItems.filter((i) => i.status === "reopened").length, [baseItems]);
  const transferredCount = useMemo(() => baseItems.filter((i) => i.delegation_chain && i.delegation_chain.length > 0).length, [baseItems]);
  const approvedCount = useMemo(() => baseItems.filter((i) => i.status === "approved").length, [baseItems]);
  const rejectedCount = useMemo(() => baseItems.filter((i) => i.status === "rejected").length, [baseItems]);
  const abandonedCount = useMemo(() => baseItems.filter((i) => i.status === "abandoned" || i.status === "abandon_requested").length, [baseItems]);

  const filteredItems = useMemo(() => {
    let list = baseItems;
    if (statusFilter) {
      const sf = String(statusFilter).toLowerCase();
      if (sf === "due_today") {
        list = list.filter((item) => {
          const dateVal = item.end_date || item.due_date || item.start_date;
          if (!dateVal) return false;
          const d = new Date(dateVal);
          const now = new Date();
          const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
          const isCompleted = ["approved", "completed", "done"].includes((item.status || "").toLowerCase());
          return isToday && !isCompleted;
        });
      } else if (sf === "pending") {
        list = list.filter((item) => pendingStatuses.includes(item.status));
      } else if (sf === "in_progress") {
        list = list.filter((item) => inProgressStatuses.includes(item.status));
      } else if (sf === "rejected" || sf === "declined") {
        list = list.filter((item) => item.status === "rejected" || item.status === "declined");
      } else if (sf === "abandoned") {
        list = list.filter((item) => item.status === "abandoned" || item.status === "abandon_requested");
      } else {
        list = list.filter((item) => String(item.status).toLowerCase() === sf);
      }
    }
    return list;
  }, [baseItems, statusFilter]);

  const taskIdList = filteredItems.map((i) => i.id);

  const totalPages = showAll ? 1 : Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = showAll ? filteredItems : filteredItems.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const breadcrumbs = [
    { label: t("Tasks", { defaultValue: "Tasks" }), path: rolePath("tasks") },
    { label: t("All Tasks", { defaultValue: "All Tasks" }) },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="Task">
        <div className="task-text">
          <h3>{t("All Tasks", { defaultValue: "All Tasks" })}</h3>
          <p>{t("Monitor and track tasks across your scope", { defaultValue: "Monitor and track tasks across your scope" })}</p>
        </div>

        <div className="task-btns">
          <div className="all-time">
            <select value={timeFilter} onChange={(e) => { setTimeFilter(e.target.value); setPage(1); }}>
              <option value="">{t("All Time", { defaultValue: "All Time" })}</option>
              <option value="today">{t("Today", { defaultValue: "Today" })}</option>
              <option value="7">{t("Last 7 Days", { defaultValue: "Last 7 Days" })}</option>
              <option value="30">{t("Last 30 Days", { defaultValue: "Last 30 Days" })}</option>
              <option value="180">{t("Last 6 Months", { defaultValue: "Last 6 Months" })}</option>
            </select>
          </div>
        </div>
      </div>

      <DraggableStatusBadges
        badges={[
          { id: "", label: t("All", { defaultValue: "All" }), count: allCount, className: "All" },
          { id: "pending", label: t("Pending", { defaultValue: "Pending" }), count: pendingCount, className: "Pending" },
          { id: "in_progress", label: t("In Progress", { defaultValue: "In Progress" }), count: inProgressCount, className: "InProgress" },
          { id: "submitted", label: t("Submitted", { defaultValue: "Submitted" }), count: submittedCount, className: "Submitted" },
          { id: "approved", label: t("Approved", { defaultValue: "Approved" }), count: approvedCount, className: "Approved" },
          { id: "paused", label: t("Paused", { defaultValue: "Paused" }), count: pausedCount, className: "Paused" },
          { id: "rejected", label: t("Declined", { defaultValue: "Declined" }), count: rejectedCount, className: "Rejected" },
          { id: "abandoned", label: t("Abandoned", { defaultValue: "Abandoned" }), count: abandonedCount, className: "Abandoned", dotColor: "#DC2626" },
        ]}
        activeStatus={statusFilter}
        onSelectStatus={selectStatusFilter}
        storageKey="pms_all_tasks_status_order"
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
        <div className="all-tasks-header">
          <div style={{ fontSize: 12, fontWeight: 600 }}>{t("ID", { defaultValue: "ID" })}</div>
          <div style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("assigned_to")}>
            {t("Assigned To", { defaultValue: "Assigned To" })}
          </div>
          <div style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("assigned_by")}>
            {t("Assigned By", { defaultValue: "Assigned By" })}
          </div>
          <div style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("title")}>
            {t("Task Name", { defaultValue: "Task Name" })}
          </div>
          <div style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("status")}>
            {t("Status", { defaultValue: "Status" })}
          </div>
          <div>{t("Progress", { defaultValue: "Progress" })}</div>
          <div style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("priority")}>
            {t("Priority", { defaultValue: "Priority" })}
          </div>
          <div style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("due_date")}>
            {t("Start & Due Date", { defaultValue: "Start & Due Date" })}
          </div>
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
              const assigneeColors = getRandomColors(item.assignees?.[0]?.id || item.id);
              const assignerColors = getRandomColors((item.assigner?.id || 0) + 100);
              const uniqueKey = `all-task-${item.id}-${idx}`;

              const primaryAssignee = item.assignees?.[0];
              const assigner = item.assigner;

              return (
                <div className="all-tasks-row" key={uniqueKey}>
                  <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} id={item.id} businessId={item.business_id} />

                  {/* Assigned To */}
                  <div className="col-assigned-to">
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div className="avatar" style={{ background: assigneeColors.bg, color: assigneeColors.text }}>
                        {getInitials(primaryAssignee?.name)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="user-name">{primaryAssignee?.name || t("Unassigned", { defaultValue: "Unassigned" })}</div>
                        <div className="user-role">{primaryAssignee?.role ? t(primaryAssignee.role, { defaultValue: primaryAssignee.role }) : ""}</div>
                      </div>
                    </div>
                  </div>

                  {/* Assigned By */}
                  <div className="col-assigned-to">
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div className="avatar" style={{ background: assignerColors.bg, color: assignerColors.text }}>
                        {getInitials(assigner?.name)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="user-name">{assigner?.name || t("System", { defaultValue: "System" })}</div>
                        <div className="user-role">{assigner?.role ? t(assigner.role, { defaultValue: assigner.role }) : ""}</div>
                      </div>
                    </div>
                  </div>

                  {/* Task Name */}
                  <div className="col-task-name">
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {item.delegation_chain && item.delegation_chain.length > 0 && <ArrowUpRight size={14} style={{ color: "#6B7280", flexShrink: 0 }} />}
                      <div className="task-title">{item.title}</div>
                      <TaskNotesPopover taskId={item.id} itemType="task" />
                    </div>
                    {item.project && (
                      <Link to={rolePath(`projects/project-details/${item.project.id}`)} onClick={(e) => e.stopPropagation()} style={{ fontSize: "11px", color: "#2563eb", textDecoration: "none", marginTop: "2px", display: "inline-block" }}>
                        {item.project.title}
                      </Link>
                    )}
                  </div>

                  {/* Status */}
                  <div className="col-status">
                    <TaskMultiStatusBadges item={item} />
                  </div>

                  {/* Progress */}
                  {(() => {
                    const isTerminal = ["completed", "approved", "submitted", "submitted_late", "done"].includes((item.status || "").toLowerCase());
                    const prog = isTerminal ? 100 : (item.deliverables_progress || 0);
                    return (
                      <div className="col-progress">
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "2px" }}>
                          {prog}%
                        </div>
                        <div className="progress-bar-track" style={{ width: "80px" }}>
                          <div className="progress-bar-fill" style={{ width: `${prog}%` }}></div>
                        </div>
                        <div style={{ fontSize: "11px", color: "#6b7280", whiteSpace: "nowrap" }}>
                          {item.approved_deliverables || 0}/{item.total_deliverables || 0}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Priority */}
                  <div className="col-priority">
                    <span className="badge" style={{ background: PRIORITY_COLORS[item.priority] || "#F3F4F6", color: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}>
                      <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}></span>
                      {t(item.priority || "Medium", { defaultValue: item.priority || "Medium" })}
                    </span>
                  </div>

                  {/* Start & Due Date */}
                  <div className="col-due-date">
                    <div className="date-box">
                      {renderDynamicDates(item, currentUser)}
                    </div>
                  </div>

                  {/* Action — View only */}
                  <div className="col-action" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      className="action-icon-btn action-view action-trigger-lg"
                      title={t("View Task", { defaultValue: "View Task" })}
                      onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'all-tasks', readOnly: true } })}
                    >
                      <IoEyeOutline size={20} />
                    </button>
                    <ActionPopover
                      trigger={
                        <button className="action-icon-btn action-manage action-trigger-lg" title={t("Status Actions", { defaultValue: "Status Actions" })} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "4px", borderRadius: "6px", background: "var(--bg-hover, #f3f4f6)", color: "var(--text-primary, #374151)", border: "1px solid var(--border-color, #e5e7eb)", cursor: "pointer" }}>
                          <Sliders size={18} />
                        </button>
                      }
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
        itemType="task"
        itemId={noteModal.itemId}
        onSaved={fetchTasks}
      />
    </DashboardLayout>
  );
}

export default AllTasks;
