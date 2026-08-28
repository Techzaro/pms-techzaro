/**
 * UserPerformance page component.
 *
 * Shows detailed performance metrics for a single user (or the current user
 * when the route uses "me").  Displays summary cards, task status breakdown
 * with bar chart, a weekly workload chart and a sortable task table
 * with search and status filtering.  Admins/managers can export a PDF report
 * and assign new tasks from this page.
 */

import { useState, useMemo, memo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import DraggableStatusBadges from "../components/DraggableStatusBadges";
import MemberExportReport from "./MemberExportReport";
import CreateTaskModal from "../components/CreateTaskModal";
import DonutChart from "../components/DonutChart";
import PriorityBarChart from "../components/PriorityBarChart";
import "../components/layout/DashboardLayout.css";
import "../components/Charts.css";
import "../pages/UserPerformance.css";
import "../pages/Task.css";
import { useApiQuery } from "../hooks/useApi";
import { useAutoRefresh } from "../utils/useAutoRefresh";
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
    valueColor: "var(--color-primary-light)",
    bgColor: "var(--color-primary-bg)",
  },
  approved: {
    title: "Approved",
    icon: "/Vector-2.svg",
    valueColor: "var(--color-success)",
    bgColor: "var(--color-success-bg)",
  },
  pending: {
    title: "Pending",
    icon: "/Vector-1 (3).svg",
    valueColor: "var(--color-warning)",
    bgColor: "var(--color-warning-bg)",
  },
  overdue: {
    title: "Overdue",
    icon: "/Vector-3.svg",
    valueColor: "var(--color-danger)",
    bgColor: "var(--color-danger-bg)",
  },
};

/** Memoised summary card used for the KPI row on the user performance page. */
const SummaryCard = memo(function SummaryCard({ card }) {
  const { t } = useTranslation();
  return (
    <div className="up-summary-card">
      <div className="up-summary-top">
        <div className="up-summary-icon" style={{ background: card.bgColor }}>
          <img src={card.icon} alt={t(card.title, { defaultValue: card.title })} />
        </div>
        <div>
          <h4 className="up-summary-title">{t(card.title, { defaultValue: card.title })}</h4>
          <div className="up-summary-value" style={{ color: card.valueColor }}>
            {card.value}
          </div>
        </div>
      </div>
    </div>
  );
});

const ROLE_LABEL = { admin: "Admin", manager: "Manager", team_lead: "Team Lead", member: "Member", guest: "Guest" };

const STATUS_COLORS = {
  pending: "var(--color-warning-bg)",
  in_progress: "var(--color-blue-bg)",
  paused: "var(--color-warning-bg)",
  submitted: "var(--color-blue-bg)",
  reopened: "var(--color-primary-bg)",
  approved: "var(--color-success-bg)",
  rejected: "var(--color-danger-bg)",
};

const STATUS_TEXT_COLORS = {
  pending: "var(--color-warning)",
  in_progress: "var(--color-blue)",
  paused: "var(--color-warning)",
  submitted: "var(--color-blue)",
  reopened: "var(--color-primary)",
  approved: "var(--color-success)",
  rejected: "var(--color-danger)",
};

const PRIORITY_COLORS = {
  High: "var(--color-danger-bg)",
  Medium: "var(--color-warning-bg)",
  Low: "var(--color-success-bg)",
};

const PRIORITY_TEXT_COLORS = {
  High: "var(--color-danger)",
  Medium: "var(--color-warning)",
  Low: "var(--color-success)",
};

/**
 * Main UserPerformance component — renders summary cards, charts and a
 * task table for the selected user.
 */
function UserPerformance() {
  const { t } = useTranslation();
  const { userId: urlUserId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [showExportModal, setShowExportModal] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);

  // Filter & task table states (initialized before useApiQuery to prevent TDZ crash)
  const [timeFilter, setTimeFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [items, setItems] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [orderedItems, setOrderedItems] = useState([]);

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
    ["user-performance", userId, timeFilter, customStart, customEnd],
    `/reports/user/${userId}`,
    { period: timeFilter, time_filter: timeFilter, start_date: customStart, end_date: customEnd, startDate: customStart, endDate: customEnd },
    { staleTime: 60000, refetchOnMount: true }
  );

  const summary = data?.summary || {};
  const statusBreakdown = useMemo(() => data?.status_breakdown || {}, [data?.status_breakdown]);
  const userInfo = data?.user || {};
  const totalTasks = statusBreakdown.total || 0;

  const breakdownItems = useMemo(() => {
    if (totalTasks === 0) return [];
    return [
      { label: t("Completed", { defaultValue: "Completed" }), count: statusBreakdown.completed || 0, color: "var(--color-green-text)" },
      { label: t("Pending", { defaultValue: "Pending" }), count: statusBreakdown.pending || 0, color: "var(--color-orange-text)" },
      { label: t("In Review", { defaultValue: "In Review" }), count: statusBreakdown.in_review || 0, color: "var(--color-blue-text)" },
      { label: t("Overdue", { defaultValue: "Overdue" }), count: statusBreakdown.overdue || 0, color: "var(--color-danger)" },
    ].map((item) => ({
      ...item,
      percent: totalTasks > 0 ? Math.round((item.count / totalTasks) * 1000) / 10 : 0,
    }));
  }, [statusBreakdown, totalTasks, t]);

  // Priority breakdown data
  const priorityBreakdown = useMemo(() => data?.priority_distribution || {}, [data?.priority_distribution]);
  const priorityItems = useMemo(() => {
    const high = priorityBreakdown.high || 0;
    const medium = priorityBreakdown.medium || 0;
    const low = priorityBreakdown.low || 0;
    const total = high + medium + low;
    return {
      bars: [
        { label: t("High", { defaultValue: "High" }), count: high, color: "var(--color-danger)" },
        { label: t("Medium", { defaultValue: "Medium" }), count: medium, color: "var(--color-orange-text)" },
        { label: t("Low", { defaultValue: "Low" }), count: low, color: "var(--color-green-text)" },
      ],
      total,
    };
  }, [priorityBreakdown, t]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /** Fetch tasks for the target user from the API. */
  const fetchTasks = useCallback(() => {
    if (!userId) return;
    setTasksLoading(true);
    const token = authToken();
    const params = new URLSearchParams();
    if (debouncedSearch) params.append("search", debouncedSearch);
    if (statusFilter) params.append("status", statusFilter);
    if (timeFilter) params.append("time_filter", timeFilter);
    if (timeFilter === "custom") {
      if (customStart) params.append("start_date", customStart);
      if (customEnd) params.append("end_date", customEnd);
    }

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
  }, [userId, debouncedSearch, statusFilter, timeFilter, customStart, customEnd]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useAutoRefresh(fetchTasks, { events: ['task:created', 'task:updated', 'task:deleted', 'data:changed'] });

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  const selectStatusFilter = (filter) => {
    setStatusFilter(filter);
  };

  const baseItems = orderedItems.length ? orderedItems : items;
  const pendingStatuses = ["pending", "in_progress", "paused", "In Progress", "In-progress", "planned", "Planning", "Planned", "submitted", "reopened", "rejected"];

  const filteredItems = baseItems.filter((item) => {
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      const titleMatch = (item.title || "").toLowerCase().includes(term);
      const statusMatch = (item.status || "").toLowerCase().includes(term);
      const priorityMatch = (item.priority || "").toLowerCase().includes(term);
      const businessIdMatch = (item.business_id || "").toLowerCase().includes(term);
      if (!titleMatch && !statusMatch && !priorityMatch && !businessIdMatch) {
        return false;
      }
    }
    if (statusFilter === "due_today") {
      const dateVal = item.end_date || item.due_date || item.start_date;
      if (!dateVal) return false;
      const d = new Date(dateVal);
      const now = new Date();
      const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      const isCompleted = ["approved", "completed", "done"].includes((item.status || "").toLowerCase());
      return isToday && !isCompleted;
    }
    if (statusFilter) {
      if (statusFilter === "pending") {
        return pendingStatuses.includes(item.status);
      }
      return item.status === statusFilter;
    }
    return true;
  });

  const taskIdList = filteredItems.map((i) => i.id);

  const formatDate = (dateStr) => formatDateTime(dateStr);

  const formatStatus = (status) => {
    const map = {
      pending: t("Pending", { defaultValue: "Pending" }),
      in_progress: t("In Progress", { defaultValue: "In Progress" }),
      paused: t("Paused", { defaultValue: "Paused" }),
      submitted: t("Submitted", { defaultValue: "Submitted" }),
      reopened: t("Reopened", { defaultValue: "Reopened" }),
      approved: t("Approved", { defaultValue: "Approved" }),
      rejected: t("Declined", { defaultValue: "Declined" }),
    };
    return map[status] || status;
  };

  return (
    <DashboardLayout>
      <Breadcrumb items={[
        { label: t("Reports", { defaultValue: "Reports" }), path: "/reports" },
        ...(location.state?.fromTeam ? [{ label: location.state.fromTeam, path: rolePath(`reports/team-members/${location.state.teamId}`) }] : []),
        { label: isOwnPage ? t("My Performance", { defaultValue: "My Performance" }) : t("User Performance", { defaultValue: "User Performance" }) },
      ]} />
      <div className="up-layout">
        <div className="up-main">

          {/* USER PROFILE HEADER */}
          <div className="up-profile-header">
            <div className="up-profile-info">
              <div className="up-avatar">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="20" r="10" fill="var(--text-muted)" />
                  <path d="M6 46c0-9.941 8.059-18 18-18s18 8.059 18 18" fill="var(--text-muted)" />
                </svg>
              </div>
              <div>
                <h1>{isLoading ? t("Loading...", { defaultValue: "Loading..." }) : userInfo.name || "\u2014"}</h1>
                <p className="up-role">{ROLE_LABEL[userInfo.role] ? t(ROLE_LABEL[userInfo.role], { defaultValue: ROLE_LABEL[userInfo.role] }) : userInfo.role || "\u2014"}</p>
              </div>
            </div>
            <div className="up-profile-actions">
              <button className="up-export-btn" onClick={() => setShowExportModal(true)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v8M4 6l4 4 4-4M2 14h12" />
                </svg>
                {isOwnPage ? t("Export My Report", { defaultValue: "Export My Report" }) : t("Export Report", { defaultValue: "Export Report" })}
              </button>
              {canAssignTask && !isOwnPage && (
                <button className="up-export-btn" onClick={() => setShowCreateTask(true)}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3v10M3 8h10" />
                  </svg>
                  {t("Assign Task", { defaultValue: "Assign Task" })}
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
                <h3>{t("Task Status Breakdown", { defaultValue: "Task Status Breakdown" })}</h3>
              </div>
              <div className="up-donut-section">
                <DonutChart
                  segments={breakdownItems}
                  size={160}
                  strokeWidth={28}
                  totalLabel={t("Total Tasks", { defaultValue: "Total Tasks" })}
                />
              </div>
            </div>

            {/* Priority Distribution - Horizontal Bar Chart */}
            <div className="up-chart-card">
              <div className="up-chart-header">
                <h3>{t("Priority Distribution", { defaultValue: "Priority Distribution" })}</h3>
              </div>
              <div className="up-priority-section">
                <PriorityBarChart
                  bars={priorityItems.bars}
                  totalLabel={t("Total Tasks", { defaultValue: "Total Tasks" })}
                />
              </div>
            </div>
          </div>

          {/* TASKS TABLE - EXACT SAME AS TASKBY */}
          <div style={{ marginTop: "32px" }}>
            <div className="task-text">
              <h3>{t("Tasks", { defaultValue: "Tasks" })}</h3>
              <p>{t("All tasks assigned to {{name}}", { name: isOwnPage ? t("me", { defaultValue: "me" }) : (userInfo.name || t("this user", { defaultValue: "this user" })), defaultValue: `All tasks assigned to ${isOwnPage ? "me" : (userInfo.name || "this user")}` })}</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px", flexWrap: "wrap", gap: "8px" }}>
                <div className="task-count-badge" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ background: "var(--color-primary-bg)", color: "var(--color-primary)", padding: "4px 12px", borderRadius: "20px", fontSize: "15px", fontWeight: 600 }}>
                    {t("Total: {{count}} items", { count: totalCount, defaultValue: `Total: ${totalCount} items` })}
                  </span>
                  <span style={{ background: "var(--color-success-bg)", color: "var(--color-success)", padding: "4px 12px", borderRadius: "20px", fontSize: "15px", fontWeight: 600 }}>
                    {t("Tasks: {{count}}", { count: filteredItems.length, defaultValue: `Tasks: ${filteredItems.length}` })}
                  </span>
                </div>
                <div className="all-time" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
                    <option value="all">{t("All Time", { defaultValue: "All Time" })}</option>
                    <option value="7">{t("Last 7 Days", { defaultValue: "Last 7 Days" })}</option>
                    <option value="30">{t("Last 30 Days", { defaultValue: "Last 30 Days" })}</option>
                    <option value="90">{t("Last 3 Months", { defaultValue: "Last 3 Months" })}</option>
                    <option value="180">{t("Last 6 Months", { defaultValue: "Last 6 Months" })}</option>
                    <option value="custom">{t("Custom Date Range", { defaultValue: "Custom Date Range" })}</option>
                  </select>
                  {timeFilter === "custom" && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{t("From:", { defaultValue: "From:" })}</span>
                      <input
                        type="date"
                        value={customStart}
                        max={customEnd || undefined}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCustomStart(v);
                          if (customEnd && v > customEnd) setCustomEnd(v);
                        }}
                        style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "13px" }}
                      />
                      <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{t("To:", { defaultValue: "To:" })}</span>
                      <input
                        type="date"
                        value={customEnd}
                        min={customStart || undefined}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCustomEnd(v);
                          if (customStart && v < customStart) setCustomStart(v);
                        }}
                        style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "13px" }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DraggableStatusBadges
            badges={[
              { id: "", label: t("All", { defaultValue: "All" }), className: "All" },
              { id: "due_today", label: t("Due Today", { defaultValue: "Due Today" }), className: "DueToday", dotColor: "#EF4444" },
              { id: "pending", label: t("Pending", { defaultValue: "Pending" }), className: "Pending" },
              { id: "submitted", label: t("Submitted", { defaultValue: "Submitted" }), className: "Submitted" },
              { id: "reopened", label: t("Reopened", { defaultValue: "Reopened" }), className: "Reopened" },
              { id: "approved", label: t("Approved", { defaultValue: "Approved" }), className: "Approved" },
              { id: "rejected", label: t("Declined", { defaultValue: "Declined" }), className: "Rejected" },
            ]}
            activeStatus={statusFilter}
            onSelectStatus={selectStatusFilter}
            storageKey="pms_user_performance_status_order"
            containerClassName="task-progress"
          />

          <div className="tasks-search-bar">
            <IoSearchOutline fontSize={"20px"} />
            <input
              type="text"
              placeholder={t("Search by task name, status, or priority...", { defaultValue: "Search by task name, status, or priority..." })}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="container">
            <div className="up-table-header">
              <div>{t("Task Name", { defaultValue: "Task Name" })}</div>
              <div>{t("Status", { defaultValue: "Status" })}</div>
              <div>{t("Progress", { defaultValue: "Progress" })}</div>
              <div>{t("Priority", { defaultValue: "Priority" })}</div>
              <div>{t("Due Date", { defaultValue: "Due Date" })}</div>
              <div>{t("Action", { defaultValue: "Action" })}</div>
            </div>

            {tasksLoading ? (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>{t("Loading...", { defaultValue: "Loading..." })}</div>
            ) : filteredItems.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>{t("No items found", { defaultValue: "No items found" })}</div>
            ) : (
              <div className="sortable-table-container">
                {filteredItems.map((item, idx) => {
                  const uniqueKey = `task-${item.id}-${idx}`;

                  return (
                    <div className="up-table-row" key={uniqueKey}>
                      <div className="col-task-name">
                        <div className="task-title">{item.title}</div>
                      </div>

                      <div className="col-status">
                        <span className="badge" style={{ background: STATUS_COLORS[item.status] || "var(--bg-hover)", color: STATUS_TEXT_COLORS[item.status] || "var(--text-dark)" }}>
                          <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.status] || "var(--text-dark)" }}></span>
                          {formatStatus(item.status)}
                        </span>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-dark)" }}>
                          {item.deliverables_progress || 0}%
                        </div>
                        <div className="progress-bar-track">
                          <div className="progress-bar-fill" style={{ width: `${item.deliverables_progress || 0}%` }}></div>
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {t("{{approved}}/{{total}} subtasks", { approved: item.approved_deliverables || 0, total: item.total_deliverables || 0, defaultValue: `${item.approved_deliverables || 0}/${item.total_deliverables || 0} subtasks` })}
                        </div>
                      </div>

                      <div className="col-priority">
                        <span className="badge" style={{ background: PRIORITY_COLORS[item.priority] || "var(--bg-hover)", color: PRIORITY_TEXT_COLORS[item.priority] || "var(--text-dark)" }}>
                          <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[item.priority] || "var(--text-dark)" }}></span>
                          {item.priority ? t(item.priority, { defaultValue: item.priority }) : ""}
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
                            title={t("View", { defaultValue: "View" })}
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
              <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>{t("Loading...", { defaultValue: "Loading..." })}</div>
            ) : filteredItems.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>{t("No items found", { defaultValue: "No items found" })}</div>
            ) : (
              filteredItems.map((item, idx) => {
                const uniqueKey = `card-task-${item.id}-${idx}`;

                return (
                  <div className="up-task-card" key={uniqueKey}>
                    <div className="up-task-card-header">
                      <div className="up-task-card-title">{item.title}</div>
                      <div className="up-task-card-type">
                        <span className="badge" style={{
                           background: "var(--color-success-bg)",
                           color: "var(--color-success)"
                        }}>
                          {t("Task", { defaultValue: "Task" })}
                        </span>
                      </div>
                    </div>

                    <div className="up-task-card-details">
                      <div className="up-task-card-detail">
                        <span className="up-task-card-detail-label">{t("Status", { defaultValue: "Status" })}</span>
                        <span className="badge" style={{
                          background: STATUS_COLORS[item.status] || "var(--bg-hover)",
                          color: STATUS_TEXT_COLORS[item.status] || "var(--text-dark)"
                        }}>
                          {formatStatus(item.status)}
                        </span>
                      </div>
                      <div className="up-task-card-detail">
                        <span className="up-task-card-detail-label">{t("Priority", { defaultValue: "Priority" })}</span>
                        <span className="badge" style={{
                          background: PRIORITY_COLORS[item.priority] || "var(--bg-hover)",
                          color: PRIORITY_TEXT_COLORS[item.priority] || "var(--text-dark)"
                        }}>
                          {item.priority ? t(item.priority, { defaultValue: item.priority }) : ""}
                        </span>
                      </div>
                    </div>

                    <div className="up-task-card-progress">
                      <div className="up-task-card-progress-info">
                        <span className="up-task-card-progress-text">
                          {item.deliverables_progress || 0}%
                        </span>
                        <span className="up-task-card-progress-detail">
                          {t("{{approved}}/{{total}} subtasks", { approved: item.approved_deliverables || 0, total: item.total_deliverables || 0, defaultValue: `${item.approved_deliverables || 0}/${item.total_deliverables || 0} subtasks` })}
                        </span>
                      </div>
                      <div className="progress-bar-track">
                        <div className="progress-bar-fill" style={{
                          width: `${item.deliverables_progress || 0}%`
                        }}></div>
                      </div>
                    </div>

                    <div className="up-task-card-actions">
                      <button
                        className="action-icon-btn action-view"
                        title={t("View", { defaultValue: "View" })}
                        onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), {
                          state: { taskIds: taskIdList, from: 'user-performance' }
                        })}
                      >
                        <IoEyeOutline /> {t("View", { defaultValue: "View" })}
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
