/**
 * UserPerformance page component.
 *
 * Shows detailed performance metrics for a single user (or the current user
 * when the route uses "me").  Displays summary cards, task status breakdown
 * with bar chart, a weekly workload chart and a sortable task/project table
 * with search and status filtering.  Admins/managers can export a PDF report
 * and assign new tasks from this page.
 */

import { useState, useMemo, memo, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import MemberExportReport from "./MemberExportReport";
import CreateTaskModal from "../components/CreateTaskModal";
import DonutChart from "../components/DonutChart";
import PriorityBarChart from "../components/PriorityBarChart";
import "../components/layout/DashboardLayout.css";
import "../components/Charts.css";
import "../pages/UserPerformance.css";
import "../pages/Task.css";
import { useApiQuery } from "../hooks/useApi";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import { getUser, rolePath, authToken } from "../utils/auth";
import { formatDateTime } from "../utils/formatDateTime";
import API_URL from "../config/api";
import { GoDotFill } from "react-icons/go";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";

/** Configuration for the four summary KPI cards shown at the top. */
const CARD_META = {
  total_assigned: {
    title: "Total Assigned",
    icon: "/Vector-5.svg",
    valueColor: "#6366f1",
    bgColor: "#EEF2FF",
  },
  approved: {
    title: "Approved",
    icon: "/Vector-2.svg",
    valueColor: "#22C55E",
    bgColor: "#ECFDF5",
  },
  pending: {
    title: "Pending",
    icon: "/Vector-1 (3).svg",
    valueColor: "#F59E0B",
    bgColor: "#FEF3C7",
  },
  overdue: {
    title: "Overdue",
    icon: "/Vector-3.svg",
    valueColor: "#EF4444",
    bgColor: "#FEF2F2",
  },
};

/** Memoised summary card used for the KPI row on the user performance page. */
const SummaryCard = memo(function SummaryCard({ card }) {
  return (
    <div className="up-summary-card">
      <div className="up-summary-top">
        <div className="up-summary-icon" style={{ background: card.bgColor }}>
          <img src={card.icon} alt={card.title} />
        </div>
        <div>
          <h4 className="up-summary-title">{card.title}</h4>
          <div className="up-summary-value" style={{ color: card.valueColor }}>
            {card.value}
          </div>
        </div>
      </div>
    </div>
  );
});

const ROLE_LABEL = { admin: "Admin", manager: "Manager", team_lead: "Team Lead", member: "Member" };

const STATUS_COLORS = {
  pending: "#FEF3C7",
  submitted: "#DBEAFE",
  reopened: "#EDE9FE",
  approved: "#DCFCE7",
  rejected: "#FEE2E2",
};

const STATUS_TEXT_COLORS = {
  pending: "#92400E",
  submitted: "#1E40AF",
  reopened: "#5B21B6",
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

/**
 * Main UserPerformance component — renders summary cards, charts and a
 * task table for the selected user.
 */
function UserPerformance() {
  const { userId: urlUserId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [showExportModal, setShowExportModal] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);

  const stored = getUser();
  const currentRole = stored?.role || "member";
  const isAdminOrManager = currentRole === "admin" || currentRole === "manager";
  const isTeamLead = currentRole === "team_lead" || currentRole === "teamlead";
  const canAssignTask = isAdminOrManager || isTeamLead;

  // Resolve "me" to actual user ID
  const userId = useMemo(() => {
    if (urlUserId === "me") {
      return stored?.id || urlUserId;
    }
    return urlUserId;
  }, [urlUserId, stored]);

  // Check if user is viewing their own page
  const isOwnPage = useMemo(() => {
    return urlUserId === "me" || String(stored?.id) === String(userId);
  }, [urlUserId, stored, userId]);

  const { data, isLoading } = useApiQuery(
    ["user-performance", userId],
    `/reports/user/${userId}`,
    null,
    { staleTime: 60000, refetchOnMount: true }
  );

  const summary = data?.summary || {};
  const statusBreakdown = useMemo(() => data?.status_breakdown || {}, [data?.status_breakdown]);
  const userInfo = data?.user || {};
  const totalTasks = statusBreakdown.total || 0;

  const breakdownItems = useMemo(() => {
    if (totalTasks === 0) return [];
    return [
      { label: "Completed", count: statusBreakdown.completed || 0, color: "#10b981" },
      { label: "Pending", count: statusBreakdown.pending || 0, color: "#f59e0b" },
      { label: "In Review", count: statusBreakdown.in_review || 0, color: "#6366f1" },
      { label: "Overdue", count: statusBreakdown.overdue || 0, color: "#ef4444" },
    ].map((item) => ({
      ...item,
      percent: totalTasks > 0 ? Math.round((item.count / totalTasks) * 1000) / 10 : 0,
    }));
  }, [statusBreakdown, totalTasks]);

  // Priority breakdown data
  const priorityBreakdown = useMemo(() => data?.priority_distribution || {}, [data?.priority_distribution]);
  const priorityItems = useMemo(() => {
    const high = priorityBreakdown.high || 0;
    const medium = priorityBreakdown.medium || 0;
    const low = priorityBreakdown.low || 0;
    const total = high + medium + low;
    return {
      bars: [
        { label: "High", count: high, color: "#ef4444" },
        { label: "Medium", count: medium, color: "#f59e0b" },
        { label: "Low", count: low, color: "#10b981" },
      ],
      total,
    };
  }, [priorityBreakdown]);

  // --- TASKS SECTION STATE ---
  const [items, setItems] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [orderedItems, setOrderedItems] = useState([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /** Fetch tasks/projects for the target user from the API. */
  const fetchTasks = useCallback(() => {
    if (!userId) return;
    setTasksLoading(true);
    const token = authToken();
    const params = new URLSearchParams();
    if (debouncedSearch) params.append("search", debouncedSearch);
    if (statusFilter) params.append("status", statusFilter);
    if (timeFilter) params.append("time_filter", timeFilter);

    fetch(`${API_URL}/user-tasks/${userId}?${params.toString()}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => {
        setItems(data?.data || []);
        setTotalCount(data?.total ?? 0);
      })
      .catch(() => setItems([]))
      .finally(() => setTasksLoading(false));
  }, [userId, debouncedSearch, statusFilter, timeFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useRefreshOnEvent(['task:created', 'task:updated', 'task:deleted'], fetchTasks);

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  const selectStatusFilter = (filter) => {
    setStatusFilter(filter);
  };

  const baseItems = orderedItems.length ? orderedItems : items;
  const pendingStatuses = ["pending", "in_progress", "In Progress", "Planned", "submitted", "reopened", "rejected"];

  const filteredItems = baseItems.filter((item) => {
    if (statusFilter === "due_today") {
      return true;
    }
    if (statusFilter) {
      if (item.item_type === "project") {
        if (statusFilter === "pending") {
          return pendingStatuses.includes(item.status);
        }
        const workflowStatuses = ["submitted", "approved", "rejected", "reopened"];
        const displayStatus = workflowStatuses.includes(item.status) ? item.status : "pending";
        return displayStatus === statusFilter;
      }
      if (statusFilter === "pending") {
        return pendingStatuses.includes(item.status);
      }
      return item.status === statusFilter;
    }
    return true;
  });

  const taskIdList = filteredItems.filter((i) => i.item_type !== "project").map((i) => i.id);

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

  const formatDate = (dateStr) => formatDateTime(dateStr);

  const formatStatus = (status) => {
    const map = {
      pending: "Pending",
      submitted: "Submitted",
      reopened: "Reopened",
      approved: "Approved",
      rejected: "Rejected",
    };
    return map[status] || status;
  };

  const calculateProgress = (item) => {
    const total = item.total_tasks ?? 0;
    const completed = item.completed_tasks ?? 0;
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  };

  return (
    <DashboardLayout>
      <Breadcrumb items={[
        { label: "Reports", path: "/reports" },
        ...(location.state?.fromTeam ? [{ label: location.state.fromTeam, path: rolePath(`reports/team-members/${location.state.teamId}`) }] : []),
        { label: isOwnPage ? "My Performance" : "User Performance" },
      ]} />
      <div className="up-layout">
        <div className="up-main">

          {/* USER PROFILE HEADER */}
          <div className="up-profile-header">
            <div className="up-profile-info">
              <div className="up-avatar">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="20" r="10" fill="#9ca3af" />
                  <path d="M6 46c0-9.941 8.059-18 18-18s18 8.059 18 18" fill="#9ca3af" />
                </svg>
              </div>
              <div>
                <h1>{isLoading ? "Loading..." : userInfo.name || "\u2014"}</h1>
                <p className="up-role">{ROLE_LABEL[userInfo.role] || userInfo.role || "\u2014"}</p>
              </div>
            </div>
            <div className="up-profile-actions">
              <button className="up-export-btn" onClick={() => setShowExportModal(true)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v8M4 6l4 4 4-4M2 14h12" />
                </svg>
                {isOwnPage ? "Export My Report" : "Export Report"}
              </button>
              {canAssignTask && !isOwnPage && (
                <button className="up-export-btn" onClick={() => setShowCreateTask(true)}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3v10M3 8h10" />
                  </svg>
                  Assign Task
                </button>
              )}
            </div>
          </div>

          {/* SUMMARY CARDS */}
          <div className="up-summary">
            {["total_assigned", "approved", "pending", "overdue"].map((key) => {
              const meta = CARD_META[key];
              return (
                <SummaryCard
                  key={meta.title}
                  card={{
                    ...meta,
                    value: isLoading ? "\u2014" : String(summary[key] ?? 0),
                  }}
                />
              );
            })}
          </div>

          {/* CHARTS ROW - Task Status Breakdown & Priority Distribution */}
          <div className="up-charts-row">
            {/* Task Status Breakdown - Donut Chart */}
            <div className="up-chart-card">
              <div className="up-chart-header">
                <h3>Task Status Breakdown</h3>
              </div>
              <div className="up-donut-section">
                <DonutChart
                  segments={breakdownItems}
                  size={160}
                  strokeWidth={28}
                  totalLabel="Total Tasks"
                />
              </div>
            </div>

            {/* Priority Distribution - Horizontal Bar Chart */}
            <div className="up-chart-card">
              <div className="up-chart-header">
                <h3>Priority Distribution</h3>
              </div>
              <div className="up-priority-section">
                <PriorityBarChart
                  bars={priorityItems.bars}
                  totalLabel="Total Tasks"
                />
              </div>
            </div>
          </div>

          {/* TASKS TABLE - EXACT SAME AS TASKBY */}
          <div style={{ marginTop: "32px" }}>
            <div className="task-text">
              <h3>Tasks</h3>
              <p>All tasks and projects assigned to {isOwnPage ? "me" : (userInfo.name || "this user")}</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px", flexWrap: "wrap", gap: "8px" }}>
                <div className="task-count-badge" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ background: "#dedfe0", color: "#4338CA", padding: "4px 12px", borderRadius: "20px", fontSize: "15px", fontWeight: 600 }}>
                    Total: {totalCount} items
                  </span>
                  <span style={{ background: "#d6d6d6", color: "#166534", padding: "4px 12px", borderRadius: "20px", fontSize: "15px", fontWeight: 600 }}>
                    Tasks: {filteredItems.filter(i => i.item_type !== "project").length}
                  </span>
                  <span style={{ background: "#d4d4d4", color: "#4338CA", padding: "4px 12px", borderRadius: "20px", fontSize: "15px", fontWeight: 600 }}>
                    Projects: {filteredItems.filter(i => i.item_type === "project").length}
                  </span>
                </div>
                <div className="all-time">
                  <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
                    <option value="">All Time</option>
                    <option value="7">Last 7 Days</option>
                    <option value="30">Last 30 Days</option>
                    <option value="180">Last 6 Months</option>
                  </select>
                </div>
              </div>
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

          <div className="tasks-search-bar">
            <IoSearchOutline fontSize={"20px"} />
            <input
              type="text"
              placeholder="Search by task or project name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="container">
            <div className="table-header-compact">
              <div className="task-name-column">Task Name</div>
              <div>Type</div>
              <div className="status-column">Status</div>
              <div>Progress</div>
              <div className="priority-column">Priority</div>
              <div className="date-column">Due Date</div>
              <div>Action</div>
            </div>

            {tasksLoading ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
            ) : filteredItems.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No items found</div>
            ) : (
              <div className="sortable-table-container">
                {filteredItems.map((item, idx) => {
                  const isProject = item.item_type === "project";
                  const colors = getRandomColors(item.id);
                  const uniqueKey = `${item.item_type}-${item.id}-${idx}`;

                  if (isProject) {
                    return (
                      <div className="taskby-row-compact" key={uniqueKey}>
                        <div className="col-task-name">
                          <div className="task-title">{item.title}</div>
                        </div>

                        <div className="col-type">
                          <span className="badge" style={{ background: "#eef2ff", color: "#4f46e5" }}>Project</span>
                        </div>

                        <div className="col-status">
                          <span className="badge" style={{ background: STATUS_COLORS[item.status] || "#F3F4F6", color: STATUS_TEXT_COLORS[item.status] || "#374151" }}>
                            <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.status] || "#374151" }}></span>
                            {["submitted", "approved", "rejected", "reopened"].includes(item.status) ? formatStatus(item.status) : "Pending"}
                          </span>
                        </div>

                        <div className="col-progress">
                          <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", marginBottom: "4px" }}>
                            <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
                              {calculateProgress(item)}%
                            </span>
                          </div>
                          <div className="progress-bar-track">
                            <div className="progress-bar-fill" style={{ width: `${calculateProgress(item)}%` }}></div>
                          </div>
                          <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>
                            {item.completed_tasks || 0}/{item.total_tasks || 0} tasks
                          </div>
                        </div>

                        <div className="col-priority">
                          <span className="badge" style={{ background: PRIORITY_COLORS[item.priority] || "#F3F4F6", color: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}>
                            <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}></span>
                            {item.priority}
                          </span>
                        </div>

                        <div className="col-due-date">
                          <div className="date-box">
                            <div>{formatDate(item.start_date)}</div>
                            <div style={{ whiteSpace: "pre-line" }}>{formatDate(item.end_date)}</div>
                          </div>
                        </div>

                        <div className="col-action">
                          <div className="action-btns">
                            <button
                              className="action-icon-btn action-view"
                              title="View"
                              onClick={() => navigate(rolePath(`projects/project-details/${item.id}`))}
                            >
                              <IoEyeOutline />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const assignees = item.assignees || [];
                  const primaryAssignee = assignees[0];
                  return (
                    <div className="taskby-row-compact" key={uniqueKey}>
                      <div className="col-task-name">
                        <div className="task-title">{item.title}</div>
                      </div>

                      <div className="col-type">
                        <span className="badge" style={{ background: "#f0fdf4", color: "#16a34a" }}>Task</span>
                      </div>

                      <div className="col-status">
                        <span className="badge" style={{ background: STATUS_COLORS[item.status] || "#F3F4F6", color: STATUS_TEXT_COLORS[item.status] || "#374151" }}>
                          <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.status] || "#374151" }}></span>
                          {formatStatus(item.status)}
                        </span>
                      </div>

                      <div className="col-progress">
                        <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
                            {item.deliverables_progress || 0}%
                          </span>
                        </div>
                        <div className="progress-bar-track">
                          <div className="progress-bar-fill" style={{ width: `${item.deliverables_progress || 0}%` }}></div>
                        </div>
                        <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>
                          {item.approved_deliverables || 0}/{item.total_deliverables || 0} Deliverables Approved
                        </div>
                      </div>

                      <div className="col-priority">
                        <span className="badge" style={{ background: PRIORITY_COLORS[item.priority] || "#F3F4F6", color: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}>
                          <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}></span>
                          {item.priority}
                        </span>
                      </div>

                      <div className="col-due-date">
                        <div className="date-box">
                          <div style={{ whiteSpace: "pre-line" }}>{formatDate(item.end_date)}</div>
                        </div>
                      </div>

                      <div className="col-action">
                        <div className="action-btns">
                          <button
                            className="action-icon-btn action-view"
                            title="View"
                            onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'user-performance' } })}
                          >
                            <IoEyeOutline />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Mobile Task Cards */}
          <div className="up-task-cards">
            {tasksLoading ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
            ) : filteredItems.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No items found</div>
            ) : (
              filteredItems.map((item, idx) => {
                const isProject = item.item_type === "project";
                const uniqueKey = `card-${item.item_type}-${item.id}-${idx}`;

                return (
                  <div className="up-task-card" key={uniqueKey}>
                    <div className="up-task-card-header">
                      <div className="up-task-card-title">{item.title}</div>
                      <div className="up-task-card-type">
                        <span className="badge" style={{
                          background: isProject ? "#eef2ff" : "#f0fdf4",
                          color: isProject ? "#4f46e5" : "#16a34a"
                        }}>
                          {isProject ? "Project" : "Task"}
                        </span>
                      </div>
                    </div>

                    <div className="up-task-card-details">
                      <div className="up-task-card-detail">
                        <span className="up-task-card-detail-label">Status</span>
                        <span className="badge" style={{
                          background: STATUS_COLORS[item.status] || "#F3F4F6",
                          color: STATUS_TEXT_COLORS[item.status] || "#374151"
                        }}>
                          {["submitted", "approved", "rejected", "reopened"].includes(item.status)
                            ? formatStatus(item.status)
                            : isProject ? "Pending" : formatStatus(item.status)}
                        </span>
                      </div>
                      <div className="up-task-card-detail">
                        <span className="up-task-card-detail-label">Priority</span>
                        <span className="badge" style={{
                          background: PRIORITY_COLORS[item.priority] || "#F3F4F6",
                          color: PRIORITY_TEXT_COLORS[item.priority] || "#374151"
                        }}>
                          {item.priority}
                        </span>
                      </div>
                    </div>

                    <div className="up-task-card-progress">
                      <div className="up-task-card-progress-info">
                        <span className="up-task-card-progress-text">
                          {isProject ? calculateProgress(item) : (item.deliverables_progress || 0)}%
                        </span>
                        <span className="up-task-card-progress-detail">
                          {isProject
                            ? `${item.completed_tasks || 0}/${item.total_tasks || 0} tasks`
                            : `${item.approved_deliverables || 0}/${item.total_deliverables || 0} deliverables`}
                        </span>
                      </div>
                      <div className="progress-bar-track">
                        <div className="progress-bar-fill" style={{
                          width: `${isProject ? calculateProgress(item) : (item.deliverables_progress || 0)}%`
                        }}></div>
                      </div>
                    </div>

                    <div className="up-task-card-actions">
                      <button
                        className="action-icon-btn action-view"
                        title="View"
                        onClick={() => navigate(rolePath(isProject
                          ? `projects/project-details/${item.id}`
                          : `tasks/task-details/${item.id}`), {
                          state: isProject ? undefined : { taskIds: taskIdList, from: 'user-performance' }
                        })}
                      >
                        <IoEyeOutline /> View
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>
      </div>

      <MemberExportReport
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        isOwnPage={isOwnPage}
        userData={{
          user: userInfo,
          summary,
          status_breakdown: statusBreakdown,
          status_distribution: data?.status_distribution || {},
          priority_distribution: data?.priority_distribution || {},
          tasks: items,
          projects: data?.projects || [],
          deliverables: data?.deliverables || [],
          deliverable_summary: data?.deliverable_summary || {},
        }}
      />
      {showCreateTask && <CreateTaskModal onClose={() => setShowCreateTask(false)} />}
    </DashboardLayout>
  );
}

export default UserPerformance;
