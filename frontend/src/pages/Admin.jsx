/**
 * Admin.jsx — Admin/Manager Dashboard Page
 *
 * Main dashboard component for admin and manager roles. Displays:
 * - Welcome greeting with user name
 * - Summary cards (active projects, tasks due today, approved/pending tasks)
 * - Today's tasks workload with assignee avatars
 * - Active projects carousel with progress bars
 * - Today's activity feed (actions performed by the current user)
 * - Expandable past activity section
 *
 * Fetches data from /dashboard API and uses real-time relative time updates.
 * Summary cards are clickable and navigate to filtered list views.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import "../components/layout/DashboardLayout.css";
import { getUser, getCurrentRole, rolePath, normalizeRole, authToken, getTenantSlug } from "../utils/auth";
import { getActivityDestination, getActivityFrom } from "../utils/navigation";
import API_URL from "../config/api";
import { timeAgo, formatDateTime } from "../utils/formatDateTime";
import { useApiQuery } from "../hooks/useApi";
import { useQueryClient } from "@tanstack/react-query";
import { useRelativeTime } from "../hooks/useRelativeTime";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import { usePersonalization } from "../context/PersonalizationContext";
import CalendarEventsWidget, { CalendarWidget, EventsWidget, KnowledgeBaseWidget } from "../components/CalendarEventsWidget";
import DynamicWidgetSection from "../components/DynamicWidgetSection";
import { X, Plus, RotateCcw, GripVertical, Pin, Trash2, ArrowUpRight } from "lucide-react";
import { usePinnedTasks, togglePinTask } from "../utils/pinnedTasks";
import { IoPerson, IoPeople } from "react-icons/io5";
import "./Admin.css";

const ALL_DASHBOARD_WIDGETS = [
  { id: "summary_cards", title: "Summary Metric Cards", icon: "📊", desc: "Key performance indicator cards at the top of the dashboard." },
  { id: "pinned_tasks", title: "Pinned Tasks & Reminders", icon: "📌", desc: "Tasks pinned directly to your dashboard for quick access." },
  { id: "today_tasks", title: "Today's Tasks & Workload", icon: "📋", desc: "Carousel list of tasks assigned or due today." },
  { id: "active_projects", title: "Active Projects Slider", icon: "🚀", desc: "Active project cards slider with progress status." },
  { id: "activity_feed", title: "Today's Activity Feed", icon: "⚡", desc: "Real-time timeline feed of recent system actions." },
  { id: "calendar_events", title: "Calendar & Upcoming Events", icon: "📅", desc: "Mini monthly calendar & list of upcoming schedule." },
  { id: "knowledge_base", title: "Knowledge Base", icon: "📖", desc: "Recently added & updated documentation and SOPs." },
];

const DEFAULT_DASHBOARD_LAYOUT = ["summary_cards", "pinned_tasks", "today_tasks", "active_projects", "activity_feed", "calendar", "events", "knowledge_base"];

/** Extracts up to 2 initials from a name string (e.g. "John Doe" → "JD") */
const getInitials = (name) => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** Formats a date string to exact time (e.g. "4:15 PM") */
const formatExactTime = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
};

/**
 * Returns an interpolated RGB color transitioning from grey (0%) to indigo (100%)
 * using an ease-in-out curve for smooth progress bar visual.
 */
const getProgressColor = (percent) => {
  const grey = [107, 114, 128];
  const blue = [79, 70, 229];
  const t = Math.min(percent, 100) / 100;
  const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const r = Math.round(grey[0] + (blue[0] - grey[0]) * eased);
  const g = Math.round(grey[1] + (blue[1] - grey[1]) * eased);
  const b = Math.round(grey[2] + (blue[2] - grey[2]) * eased);
  return `rgb(${r}, ${g}, ${b})`;
};

/** Returns a human-readable role label, defaulting to "User" if no role provided */
const getRoleLabel = (role) => {
  return role ? normalizeRole(role) : "User";
};

/**
 * SummaryCard — Displays a single summary metric (e.g. Active Projects, Tasks Due Today).
 * Clicking a card with a filter navigates to the corresponding filtered list view.
 */
const SummaryCard = memo(function SummaryCard({ card, onClick }) {
  const { t } = useTranslation();
  const isClickable = Boolean(card.filter);
  return (
    <div
      className="summary-card"
      onClick={isClickable ? () => onClick(card) : undefined}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (isClickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick(card);
        }
      }}
      style={{
        background: "var(--bg-card)",
        borderRadius: "16px",
        padding: "20px",
        boxShadow: "var(--shadow-sm)",
        display: "flex",
        flexDirection: "column",
        gap: "18px",
        cursor: isClickable ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{
          width: "56px", height: "56px", borderRadius: "14px",
          background: card.bgColor, display: "flex", alignItems: "center",
          justifyContent: "center",
        }}>
          <img src={card.icon} alt={card.title} style={{ width: "26px", height: "26px" }} />
        </div>
        <div>
          <h4
            style={{
              margin: 0,
              fontSize: "15px",
              color: isClickable ? "var(--color-blue)" : "var(--text-secondary)",
              textUnderlineOffset: "2px",
            }}
          >
            {t(card.title, { defaultValue: card.title })}
          </h4>
          <div style={{ marginTop: "5px", fontSize: "36px", fontWeight: "700", color: card.valueColor }}>
            {card.value}
          </div>
        </div>
      </div>
    </div>
  );
});

/**
 * WorkloadItem — Renders a single task in today's workload list.
 * Shows task time, title, assignee role labels, assignee avatars, and priority status.
 * Clicking an avatar navigates to the task or project details page.
 */
const AVATAR_COLORS = [
  { bg: "var(--color-primary-bg)", text: "var(--color-primary)" },
  { bg: "var(--color-danger-bg)", text: "var(--color-danger)" },
  { bg: "var(--color-success-bg)", text: "var(--color-success)" },
  { bg: "var(--color-warning-bg)", text: "var(--color-warning)" },
  { bg: "var(--color-primary-bg)", text: "var(--color-primary)" },
  { bg: "var(--color-danger-bg)", text: "var(--color-danger)" },
];

const WorkloadItem = memo(function WorkloadItem({ item, navigate, getInitials, rolePath, cardWidth, getProgressColor, PROJECTS_PER_VIEW, GAP, currentRole, dashboardMode }) {
  const { t } = useTranslation();
  const isManager = currentRole === "admin" || currentRole === "manager";
  const assignees = item.assignees || [];
  const isMyDashboard = dashboardMode === "my";
  const currentUser = getUser();

  const handleCardClick = (e) => {
    const from = getActivityFrom(item);
    const dest = getActivityDestination(item);
    navigate(`${dest}${dest.includes("?") ? "&" : "?"}from=${from}`, { state: { from } });
  };

  const handleAvatarClick = (e, user) => {
    e.stopPropagation();
    if (item.module === "project") {
      navigate(rolePath(`projects/project-details/${item.entity_id}`), { state: { from: "taskby" } });
    } else {
      const from = getActivityFrom(item);
      navigate(rolePath(`tasks/task-details/${item.entity_id}`), { state: { from } });
    }
  };

  // My Dashboard: show only the assigner/creator's avatar + time from MY pivot due_date
  // User Dashboard: show all assignees' avatars, no time
  const displayUsers = isMyDashboard
    ? (item.assigner ? [item.assigner] : (item.creator ? [item.creator] : []))
    : assignees;

  // Get the due time from the CURRENT USER's pivot (the deadline given to me)
  const myPivotDueDate = isMyDashboard
    ? (assignees.find(a => a.id === currentUser?.id)?.pivot?.due_date || null)
    : null;

  return (
    <div className="dash-task-card" style={{
      minWidth: cardWidth > 0 ? `${cardWidth}px` : `calc((100% - ${(PROJECTS_PER_VIEW - 1) * GAP}px) / ${PROJECTS_PER_VIEW})`,
      flex: cardWidth > 0 ? `0 0 ${cardWidth}px` : `0 0 calc((100% - ${(PROJECTS_PER_VIEW - 1) * GAP}px) / ${PROJECTS_PER_VIEW})`,
    }} onClick={handleCardClick}>
      <div className="dash-task-card-header">
        <h3>{item.title}</h3>
      </div>

      <div className="dash-progress-section">
        <div className="dash-progress-top">
          <span>{t("Progress", { defaultValue: "Progress" })}</span>
          <span>0%</span>
        </div>
        <div className="dash-progress-bar">
          <div
            className="dash-progress-fill"
            style={{
              width: "0%",
              minWidth: "100%",
              background: "var(--border-medium)",
            }}
          ></div>
        </div>
      </div>

      {displayUsers.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
          {displayUsers.map((u) => {
            const colorIdx = (u.id || 0) % AVATAR_COLORS.length;
            const colors = AVATAR_COLORS[colorIdx];
            // My Dashboard: show time from the current user's pivot due_date
            // User Dashboard: no time shown
            const dueTime = isMyDashboard && myPivotDueDate
              ? new Date(myPivotDueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : null;
            return (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <div
                  onClick={isMyDashboard ? undefined : (e) => handleAvatarClick(e, u)}
                  title={u.name}
                  style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: colors.bg, color: colors.text,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "10px", fontWeight: 700, cursor: isMyDashboard ? "default" : "pointer",
                    border: "2px solid var(--bg-card)", flexShrink: 0,
                  }}
                >
                  {getInitials(u.name)}
                </div>
                {dueTime && (
                  <span style={{ fontSize: "11px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                    {dueTime}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
});

/** Status badge colors matching the Projects list page */
const STATUS_COLORS = {
  pending: "var(--color-warning-bg)",
  in_progress: "var(--color-blue-bg)",
  paused: "var(--color-warning-bg)",
  submitted: "var(--color-blue-bg)",
  reopened: "var(--color-primary-bg)",
  approved: "var(--color-success-bg)",
  rejected: "var(--color-danger-bg)",
  Planning: "var(--color-blue-bg)",
  "In-progress": "var(--color-warning-bg)",
  In_progress: "var(--color-warning-bg)",
  Pause: "var(--color-danger-bg)",
  Completed: "var(--color-success-bg)",
};

const STATUS_TEXT_COLORS = {
  pending: "var(--color-warning)",
  in_progress: "var(--color-blue)",
  paused: "var(--color-warning)",
  submitted: "var(--color-blue)",
  reopened: "var(--color-primary)",
  approved: "var(--color-success)",
  rejected: "var(--color-danger)",
  Planning: "var(--color-blue)",
  "In-progress": "var(--color-warning)",
  In_progress: "var(--color-warning)",
  Pause: "var(--color-danger)",
  Completed: "var(--color-success)",
};

/**
 * ProjectCard — Displays a single active project in the carousel.
 * Uses the same card design as the Projects list page for visual consistency.
 */
const ProjectCard = memo(function ProjectCard({ project, cardWidth, navigate, getProgressColor, rolePath, PROJECTS_PER_VIEW, GAP }) {
  const { t } = useTranslation();
  const statusKey = project.status || 'In_progress';
  return (
    <div className="dash-project-card" style={{
      minWidth: cardWidth > 0 ? `${cardWidth}px` : `calc((100% - ${(PROJECTS_PER_VIEW - 1) * GAP}px) / ${PROJECTS_PER_VIEW})`,
      flex: cardWidth > 0 ? `0 0 ${cardWidth}px` : `0 0 calc((100% - ${(PROJECTS_PER_VIEW - 1) * GAP}px) / ${PROJECTS_PER_VIEW})`,
      cursor: "pointer",
    }}
    onClick={() => navigate(rolePath(`projects/project-details/${project.id}`))}
    >
      {/* HEADER */}
      <div className="dash-project-card-header">
        <h3>{project.title || project.name}</h3>
      </div>

      {/* PROGRESS */}
      <div className="dash-progress-section">
        <div className="dash-progress-top">
          <span>{t("Progress", { defaultValue: "Progress" })}</span>
          <span>{project.progress}%</span>
        </div>
        <div className="dash-progress-bar">
          <div
            className="dash-progress-fill"
            style={{
              width: `${project.progress}%`,
              minWidth: project.progress === 0 ? "100%" : "0",
              background: project.progress === 0 ? "var(--border-medium)" : getProgressColor(project.progress),
            }}
          ></div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="dash-card-footer">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            className="status-badge"
            style={{
              backgroundColor: STATUS_COLORS[project.status] || "var(--color-primary-bg-hover)",
              color: STATUS_TEXT_COLORS[project.status] || "var(--text-dark)",
            }}
          >
            {t(project.status || "Planning", { defaultValue: project.status || "Planning" })}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500 }}>
              📅 {project.start_date ? new Date(project.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-"}
            </span>
            <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500 }}>
              📅 {project.end_date ? new Date(project.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : t("No deadline", { defaultValue: "No deadline" })}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
});

/**
 * Admin — Main dashboard page component.
 * Renders welcome box, summary cards, today's tasks, active projects carousel,
 * and activity feeds (today's activity + expandable past activity).
 */
function Admin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isWidgetEnabled } = usePersonalization();
  const [greeting, setGreeting] = useState("Welcome");
  const [modalOpen, setModalOpen] = useState(false);
  const currentRole = getCurrentRole() || "member";
  const isAdminManager = currentRole === "admin" || currentRole === "manager";

  const isWidgetActive = (id) => isWidgetEnabled("dashboard", id);

  // Dashboard mode toggle: "my" = My Dashboard, "user" = User Dashboard
  const [dashboardMode, setDashboardMode] = useState(() => isAdminManager ? "user" : "my");

  const DEFAULT_SECTION_ORDER = ["summary_cards", "today_tasks", "active_projects", "activity_feed", "custom_widgets"];

  const [dashboardSectionOrder, setDashboardSectionOrder] = useState(() => {
    try {
      const saved = localStorage.getItem("pms_admin_dashboard_global_section_order");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const missing = DEFAULT_SECTION_ORDER.filter(s => !parsed.includes(s));
          return [...parsed, ...missing];
        }
      }
    } catch {}
    return DEFAULT_SECTION_ORDER;
  });

  useEffect(() => {
    try {
      localStorage.setItem("pms_admin_dashboard_global_section_order", JSON.stringify(dashboardSectionOrder));
    } catch {}
  }, [dashboardSectionOrder]);

  const [draggedSecIndex, setDraggedSecIndex] = useState(null);
  const [dragOverSecIndex, setDragOverSecIndex] = useState(null);

  const handleSecDragStart = (e, index) => {
    setDraggedSecIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleSecDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverSecIndex !== index) {
      setDragOverSecIndex(index);
    }
  };

  const handleSecDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedSecIndex === null || draggedSecIndex === targetIndex) {
      setDraggedSecIndex(null);
      setDragOverSecIndex(null);
      return;
    }
    setDashboardSectionOrder((prev) => {
      const updated = [...prev];
      const [removed] = updated.splice(draggedSecIndex, 1);
      updated.splice(targetIndex, 0, removed);
      return updated;
    });
    setDraggedSecIndex(null);
    setDragOverSecIndex(null);
  };

  // Track which activity items have been viewed (persisted in sessionStorage)
  const [viewedActivities, setViewedActivities] = useState(() => {
    try {
      const stored = sessionStorage.getItem("viewedActivities");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  /** Mark an activity as viewed and persist to sessionStorage */
  const markActivityViewed = (id) => {
    if (!id || viewedActivities.includes(id)) return;
    setViewedActivities((prev) => {
      const next = [...prev, id];
      try { sessionStorage.setItem("viewedActivities", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // For all roles: My Dashboard = incoming (mode=my), User Dashboard = outgoing (mode=user)
  const apiMode = dashboardMode;

  const queryClient = useQueryClient();

  // Fetch dashboard summary data (active projects, tasks due today, etc.)
  const tenantSlug = getTenantSlug();
  const { data: dashboard, isLoading, refetch: refetchDashboard } = useApiQuery(
    ["dashboard", tenantSlug, apiMode],
    "/dashboard",
    { mode: apiMode },
    { staleTime: 120000, refetchOnMount: false, refetchOnWindowFocus: false, refetchInterval: false }
  );

  // Auto-refresh dashboard when tasks, projects, or subtasks change
  useAutoRefresh(() => {
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    refetchDashboard();
  }, {
    events: ["task:created", "task:updated", "task:deleted", "project:created", "project:updated", "project:deleted", "deliverable:updated", "data:changed"],
  });

  // Listen for modal open/close events from child components
  useEffect(() => {
    const handler = (e) => setModalOpen(e.detail.open);
    window.addEventListener("modal-state", handler);
    // Set greeting with current user's name
    const stored = getUser();
    const name = stored?.name || "User";
    setGreeting(t("Welcome, {{name}}", { name, defaultValue: `Welcome, ${name}` }));
    return () => window.removeEventListener("modal-state", handler);
  }, [t]);

  // Tick every second to update relative time displays (e.g. "5 min ago")
  const tick = useRelativeTime();
  const [pinnedTasks] = usePinnedTasks();

  // Extract summary data from dashboard response
  const summaryData = dashboard?.summary || {};

  // Build summary card configs from API data
  const summaryCards = useMemo(() => [
    { title: "Active Projects", value: String(summaryData.active_projects ?? 0), icon: "/Vector-5.svg", valueColor: "var(--color-blue)", bgColor: "var(--color-blue-bg)", filter: "active-projects" },
    { title: "In Progress Tasks", value: String(summaryData.in_progress_tasks ?? summaryData.in_progress ?? 0), icon: "/Vector-3.svg", valueColor: "#2563EB", bgColor: "#EFF6FF", filter: "in-progress-tasks" },
    { title: "Tasks Due Today", value: String(summaryData.tasks_due_today ?? 0), icon: "/Vector-1%20(3).svg", valueColor: "var(--color-danger)", bgColor: "var(--color-danger-bg)", filter: "tasks-due-today" },
    { title: "Approved Tasks", value: String(summaryData.approved_tasks ?? 0), icon: "/Vector-2.svg", valueColor: "var(--color-success)", bgColor: "var(--color-success-bg)", filter: "approved-tasks" },
    { title: "Pending Tasks", value: String(summaryData.pending_tasks ?? 0), icon: "/Vector-3.svg", valueColor: "var(--color-warning)", bgColor: "var(--color-warning-bg)", filter: "pending-tasks" },
  ], [summaryData.active_projects, summaryData.in_progress_tasks, summaryData.in_progress, summaryData.tasks_due_today, summaryData.approved_tasks, summaryData.pending_tasks]);

  // Navigate to filtered list when a summary card is clicked
  // For all roles: "my" = incoming (tasks), "user" = outgoing (taskby)
  const handleSummaryCardClick = useCallback((card) => {
    if (card.filter === "active-projects") {
      navigate(`${rolePath("projects")}?status=active`);
    } else {
      const isOutgoing = dashboardMode === "user";
      const basePath = rolePath(isOutgoing ? "taskby" : "tasks");
      if (card.filter === "in-progress-tasks") navigate(`${basePath}?status=in_progress`);
      else if (card.filter === "tasks-due-today") navigate(`${basePath}?filter=due_today`);
      else if (card.filter === "approved-tasks") navigate(`${basePath}?status=approved`);
      else if (card.filter === "pending-tasks") navigate(`${basePath}?status=pending`);
    }
  }, [navigate, dashboardMode]);

  // Transform raw today's workload data into display-ready format with role labels
  // Deduplicate by entity_id — if the same task is returned multiple times (e.g. from pivot
  // expansion), keep the first occurrence with all assignees merged.
  const todayWorkload = useMemo(() => {
    const raw = (dashboard?.todayWorkload || []).map((w) => {
      const assignees = w.assignees || w.assigned_users || [];
      const uniqueRoles = [...new Set(assignees.map((a) => a.role).filter(Boolean))];
      const roleLabel = uniqueRoles
        .map((r) => getRoleLabel(r))
        .sort((a, b) => (a === "Team Lead" ? -1 : b === "Team Lead" ? 1 : 0))
        .join(", ");
      return {
        id: w.id, entity_id: w.entity_id || w.id, module: w.module || "task",
        time: w.end_date ? new Date(w.end_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '\u2014',
        title: w.title || w.name || 'Untitled', roleLabel, assignees,
        status: w.priority ? w.priority + ' Priority' : (w.status || '\u2014'),
        end_date: w.end_date || null,
        priority: w.priority || 'Medium',
        assigned_by: w.assigned_by || null,
        assigner: w.assigner || null,
        creator: w.creator || null,
      };
    });
    // Deduplicate by title — if multiple tasks share the same title, show one card
    // with all unique assignees merged together
    const map = new Map();
    for (const item of raw) {
      const key = item.title.trim().toLowerCase();
      if (map.has(key)) {
        const existing = map.get(key);
        const existingIds = new Set(existing.assignees.map(a => a.id));
        for (const a of item.assignees) {
          if (!existingIds.has(a.id)) {
            existing.assignees.push(a);
            existingIds.add(a.id);
          }
        }
      } else {
        map.set(key, { ...item, assignees: [...item.assignees] });
      }
    }
    return Array.from(map.values());
  }, [dashboard?.todayWorkload]);

  // Normalize active projects data from API response
  const activeProjects = useMemo(() =>
    (dashboard?.activeProjects || []).map((p) => ({
      id: p.id, name: p.name, title: p.title || p.name, client: p.client || '\u2014',
      description: p.description || '',
      progress: Number(p.progress || p.progress_percent) || 0,       deadline: p.deadline || p.due_date || '\u2014',
      start_date: p.start_date || null,
      end_date: p.active_deadline || p.end_date || p.deadline || p.due_date || null,
      status: p.status || 'In_progress',
      team: p.team || '\u2014', assigned_users: p.assigned_users || [],
    })),
    [dashboard?.activeProjects]
  );

  // Filter today's activity to only show actions performed by the current user
  const completedToday = useMemo(() =>
    (dashboard?.completedToday || [])
      .filter((item) => item.is_actor)
      .map((item) => ({
        id: item.id,
        entity_id: item.entity_id,
        module: item.module,
        action: item.action,
        title: item.title,
        actor_name: item.actor_name,
        actor_role: item.actor_role,
        is_actor: item.is_actor,
        submitted_by_name: item.submitted_by_name,
        submitted_by_role: item.submitted_by_role,
        comment: item.comment,
        time_ago: item.time_ago || '—',
        created_at: item.created_at,
        assigned_by: item.assigned_by || null,
        assignees: item.assignees || [],
      })),
    [dashboard?.completedToday]
  );

  // Icon/color config for each activity action type (created, assigned, submitted, etc.)
  const activityActionConfig = {
    created:      { icon: "★", color: "var(--color-blue-text)", bg: "var(--color-blue-light)" },
    assigned:     { icon: "→", color: "var(--color-primary-light)", bg: "var(--color-primary-bg)" },
    submitted:   { icon: "✓", color: "var(--color-success)", bg: "var(--color-success-bg)" },
    resubmitted: { icon: "↻", color: "var(--color-blue-text)", bg: "var(--color-blue-light)" },
    approved:    { icon: "✓", color: "var(--color-success)", bg: "var(--color-success-bg)" },
    rejected:    { icon: "✕", color: "var(--color-danger)", bg: "var(--color-danger-bg)" },
    reopened:    { icon: "↻", color: "var(--color-warning)", bg: "var(--color-warning-bg)" },
    rework:      { icon: "↻", color: "var(--color-warning)", bg: "var(--color-warning-bg)" },
    completed:       { icon: "✓", color: "var(--color-success)", bg: "var(--color-success-bg)" },
    status_updated:  { icon: "⚡", color: "var(--color-primary-light)", bg: "var(--color-primary-bg)" },
    field_changed:   { icon: "✎", color: "var(--text-secondary)", bg: "var(--bg-hover)" },
    deleted:         { icon: "✕", color: "var(--color-danger)", bg: "var(--color-danger-bg)" },
    leader_changed:  { icon: "★", color: "var(--color-warning)", bg: "var(--color-warning-bg)" },
    member_added:    { icon: "+", color: "var(--color-success)", bg: "var(--color-success-bg)" },
    member_removed:  { icon: "−", color: "var(--color-danger)", bg: "var(--color-danger-bg)" },
    access_granted:  { icon: "🔓", color: "var(--color-success)", bg: "var(--color-success-bg)" },
    access_removed:  { icon: "🔒", color: "var(--color-danger)", bg: "var(--color-danger-bg)" },
  };

  /** Returns a human-readable label for the activity module (task, project, subtask) */
  const getModuleLabel = (module) => {
    if (module === "task") return t("Task", { defaultValue: "Task" });
    if (module === "project") return t("Project", { defaultValue: "Project" });
    if (module === "deliverable") return t("Subtask", { defaultValue: "Subtask" });
    if (module === "user") return t("User", { defaultValue: "User" });
    if (module === "team") return t("Team", { defaultValue: "Team" });
    return module;
  };

  /**
   * Builds a JSX message describing an activity item.
   * e.g. "You created Task "Login Page" — Assigned to you"
   * For team activities, uses the backend description if available.
   */
  const getActivityMessage = (item) => {
    // For team activities, use the backend-provided description (personalized per user)
    if (item.module === "team" && item.description) {
      return <>{item.description}</>;
    }

    const moduleLabel = getModuleLabel(item.module);
    const titleSpan = <span style={{ fontWeight: 600 }}>"{item.title}"</span>;
    const actorLabel = item.is_actor ? t("You", { defaultValue: "You" }) : item.actor_name;

    const verbMap = {
      created: t("created", { defaultValue: "created" }),
      assigned: t("assigned", { defaultValue: "assigned" }),
      submitted: t("submitted", { defaultValue: "submitted" }),
      resubmitted: t("resubmitted", { defaultValue: "resubmitted" }),
      approved: t("approved", { defaultValue: "approved" }),
      rejected: t("declined", { defaultValue: "declined" }),
      reopened: t("reopened", { defaultValue: "reopened" }),
      rework: t("reopened", { defaultValue: "reopened" }),
      completed: t("completed", { defaultValue: "completed" }),
      status_updated: t("updated status of", { defaultValue: "updated status of" }),
      field_changed: t("updated", { defaultValue: "updated" }),
      updated: t("updated", { defaultValue: "updated" }),
      resigned: t("resigned", { defaultValue: "resigned" }),
      deleted: t("deleted", { defaultValue: "deleted" }),
      leader_changed: t("changed team lead for", { defaultValue: "changed team lead for" }),
      member_added: t("added member(s) to", { defaultValue: "added member(s) to" }),
      member_removed: t("removed member(s) from", { defaultValue: "removed member(s) from" }),
      access_granted: t("granted access on", { defaultValue: "granted access on" }),
      access_removed: t("removed access from", { defaultValue: "removed access from" }),
    };
    const verb = verbMap[item.action] || t("updated", { defaultValue: "updated" });

    let suffix = null;
    if (item.comment) {
      // For 'assigned' action, replace assignee name with "you" when viewing as assignee
      if (item.action === "assigned" && !item.is_actor) {
        const match = item.comment.match(/^Assigned to (.+)$/);
        if (match) {
          suffix = <> — {t("Assigned to you", { defaultValue: "Assigned to you" })}</>;
        } else {
          suffix = <> — {item.comment}</>;
        }
      } else {
        suffix = <> — {item.comment}</>;
      }
    } else if (item.submitted_by_name && ["approved", "rejected", "reopened", "rework"].includes(item.action)) {
      suffix = <> {t("submitted by {{name}}", { name: item.submitted_by_name, defaultValue: `submitted by ${item.submitted_by_name}` })}</>;
    }

    return <>{actorLabel} {verb} {moduleLabel} {titleSpan}{suffix}</>;
  };

  // Project carousel state management
  const [projectSlide, setProjectSlide] = useState(0);
  const [taskSlide, setTaskSlide] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const PROJECTS_PER_VIEW = isMobile ? 1 : 3;
  const sliderRef = useRef(null);
  const taskSliderRef = useRef(null);
  const [cardWidth, setCardWidth] = useState(0);
  const [taskCardWidth, setTaskCardWidth] = useState(0);
  const totalProjectSlides = Math.max(0, activeProjects.length - PROJECTS_PER_VIEW);
  const totalTaskSlides = Math.max(0, todayWorkload.length - PROJECTS_PER_VIEW);
  const GAP = isMobile ? 0 : 20;

  // Update mobile breakpoint on window resize
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Measure slider container width and compute individual card width for the carousel
  useEffect(() => {
    const measure = () => {
      if (sliderRef.current) {
        const containerWidth = sliderRef.current.offsetWidth;
        const cw = (containerWidth - (PROJECTS_PER_VIEW - 1) * GAP) / PROJECTS_PER_VIEW;
        setCardWidth(cw);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeProjects.length, PROJECTS_PER_VIEW, GAP]);

  // Measure task slider container width
  useEffect(() => {
    const measure = () => {
      if (taskSliderRef.current) {
        const containerWidth = taskSliderRef.current.offsetWidth;
        const cw = (containerWidth - (PROJECTS_PER_VIEW - 1) * GAP) / PROJECTS_PER_VIEW;
        setTaskCardWidth(cw);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [todayWorkload.length, PROJECTS_PER_VIEW, GAP]);

  return (
    <DashboardLayout hideRightSidebar={true}>
          <Breadcrumb items={[{ label: t("Dashboard", { defaultValue: "Dashboard" }) }]} />
          <div className="welcome-box" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h1>{greeting}</h1>
              <p>{dashboardMode === "my"
                ? t("Viewing tasks assigned to you.", { defaultValue: "Viewing tasks assigned to you." })
                : t("Viewing tasks you assigned to others.", { defaultValue: "Viewing tasks you assigned to others." })}</p>
            </div>
            {/* Dashboard Mode Toggle */}
            <div className="dashboard-toggle-pill" style={{ flexShrink: 0 }}>
              <button
                onClick={() => setDashboardMode("my")}
                className={`dashboard-toggle-btn${dashboardMode === "my" ? " active" : ""}`}
                title={t("My Dashboard", { defaultValue: "My Dashboard" })}
              >
                <IoPerson size={20} />
              </button>
              <button
                onClick={() => setDashboardMode("user")}
                className={`dashboard-toggle-btn${dashboardMode === "user" ? " active" : ""}`}
                title={t("User Dashboard", { defaultValue: "User Dashboard" })}
              >
                <IoPeople size={20} />
              </button>
            </div>
          </div>

          {dashboardSectionOrder.map((secKey, index) => {
            const isDragOver = dragOverSecIndex === index;
            const isDragging = draggedSecIndex === index;

            const sectionWrapperStyle = {
              marginBottom: "30px",
              borderRadius: "20px",
              border: isDragOver ? "2px dashed #4f46e5" : "none",
              opacity: isDragging ? 0.4 : 1,
              transition: "border 0.15s ease, opacity 0.15s ease",
              position: "relative"
            };

            const DragGripHeader = ({ title }) => (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  draggable={true}
                  onDragStart={(e) => handleSecDragStart(e, index)}
                  onDragEnd={() => { setDraggedSecIndex(null); setDragOverSecIndex(null); }}
                  title={t("Drag handle to reorder section on dashboard canvas", { defaultValue: "Drag handle to reorder section on dashboard canvas" })}
                  style={{
                    cursor: "grab",
                    color: "var(--text-secondary, #94a3b8)",
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "4px 2px"
                  }}
                >
                  <GripVertical size={20} />
                </span>
                <h3 style={{ margin: 0, fontSize: "22px", fontWeight: "700", color: "var(--text-heading)" }}>{title}</h3>
              </div>
            );

            if (secKey === "summary_cards") {
              if (!isWidgetEnabled("dashboard", "summary_cards")) return null;
              return (
                <div
                  key="summary_cards"
                  draggable={false}
                  onDragOver={(e) => handleSecDragOver(e, index)}
                  onDrop={(e) => handleSecDrop(e, index)}
                  style={sectionWrapperStyle}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                    <span
                      draggable={true}
                      onDragStart={(e) => handleSecDragStart(e, index)}
                      onDragEnd={() => { setDraggedSecIndex(null); setDragOverSecIndex(null); }}
                      title={t("Drag handle to reorder section on dashboard canvas", { defaultValue: "Drag handle to reorder section on dashboard canvas" })}
                      style={{ cursor: "grab", color: "var(--text-secondary, #94a3b8)", display: "inline-flex", alignItems: "center" }}
                    >
                      <GripVertical size={20} />
                    </span>
                    <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-secondary)" }}>{t("Metrics Overview", { defaultValue: "Metrics Overview" })}</span>
                  </div>
                  <div
                    className="summary-cards-grid"
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(100px, 1fr))",
                      gap: isMobile ? "10px" : "20px",
                    }}
                  >
                    {summaryCards.map((card) => (
                      <SummaryCard key={card.title} card={card} onClick={handleSummaryCardClick} />
                    ))}
                  </div>
                </div>
              );
            }

            if (secKey === "pinned_tasks") {
              if (!isWidgetActive("pinned_tasks")) return null;
              return (
                <div
                  key="pinned_tasks"
                  draggable={false}
                  onDragOver={(e) => handleSecDragOver(e, index)}
                  onDrop={(e) => handleSecDrop(e, index)}
                  style={sectionWrapperStyle}
                >
                  <div className="pinned-tasks-section" style={{ background: "var(--bg-card, #ffffff)", borderRadius: "20px", padding: "24px", boxShadow: "var(--shadow-sm, 0 4px 14px rgba(0,0,0,0.03))", position: "relative" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <DragGripHeader title={`${t("Pinned Tasks", { defaultValue: "Pinned Tasks" })} (${pinnedTasks.length})`} />
                      <button
                        className="workload-view-btn"
                        onClick={() => navigate(rolePath("tasks"))}
                        style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "13px", color: "var(--color-primary, #4f46e5)", background: "transparent", border: "none", cursor: "pointer", fontWeight: 600 }}
                      >
                        {t("All Tasks", { defaultValue: "All Tasks" })} <ArrowUpRight size={14} />
                      </button>
                    </div>

                    {pinnedTasks.length === 0 ? (
                      <div style={{ padding: "24px 16px", textAlign: "center", background: "var(--bg-card-subtle, #f8fafc)", borderRadius: "14px", border: "1px dashed var(--border-color, #e2e8f0)" }}>
                        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#eef2ff", color: "#4f46e5", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" }}>
                          <Pin size={20} />
                        </div>
                        <h4 style={{ margin: "0 0 4px 0", fontSize: "15px", fontWeight: 700, color: "var(--text-heading)" }}>{t("No tasks pinned yet", { defaultValue: "No tasks pinned yet" })}</h4>
                        <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>
                          {t("Pin any task from Task Details or Task Lists to keep it pinned to your dashboard.", { defaultValue: "Pin any task from Task Details or Task Lists to keep it pinned to your dashboard." })}
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "14px" }}>
                        {pinnedTasks.map((tVal) => (
                          <div
                            key={tVal.id}
                            style={{
                              background: "var(--bg-card-subtle, #f8fafc)",
                              border: "1px solid var(--border-color, #e2e8f0)",
                              borderRadius: "14px",
                              padding: "14px 16px",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                              gap: "10px",
                              transition: "transform 0.15s ease, box-shadow 0.15s ease",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                              <div>
                                <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                                  #{tVal.id} {tVal.project_title ? `• ${tVal.project_title}` : ""}
                                </span>
                                <h4
                                  onClick={() => navigate(rolePath(`tasks/task-details/${tVal.id}`))}
                                  style={{ margin: "4px 0 0 0", fontSize: "14px", fontWeight: 700, color: "var(--text-heading)", cursor: "pointer", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                                  title={tVal.title}
                                >
                                  {tVal.title}
                                </h4>
                              </div>
                              <button
                                onClick={() => togglePinTask(tVal)}
                                title={t("Unpin from Dashboard", { defaultValue: "Unpin from Dashboard" })}
                                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", padding: "2px", borderRadius: "4px" }}
                              >
                                <X size={16} />
                              </button>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", paddingTop: "8px", borderTop: "1px solid var(--border-color, #e2e8f0)" }}>
                              <span style={{ padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, textTransform: "capitalize", background: tVal.status === "approved" ? "#DCFCE7" : tVal.status === "submitted" ? "#FEF3C7" : "#EFF6FF", color: tVal.status === "approved" ? "#15803D" : tVal.status === "submitted" ? "#B45309" : "#1D4ED8" }}>
                                {t(tVal.status?.replace("_", " ") || "pending", { defaultValue: tVal.status?.replace("_", " ") || "pending" })}
                              </span>
                              {tVal.end_date && (
                                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                  {t("Due: {{date}}", { date: new Date(tVal.end_date).toLocaleDateString(), defaultValue: `Due: ${new Date(tVal.end_date).toLocaleDateString()}` })}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            if (secKey === "today_tasks") {
              if (!isWidgetEnabled("dashboard", "today_tasks")) return null;
              return (
                <div
                  key="today_tasks"
                  draggable={false}
                  onDragOver={(e) => handleSecDragOver(e, index)}
                  onDrop={(e) => handleSecDrop(e, index)}
                  style={sectionWrapperStyle}
                >
                  <div className="workload-card" style={{ marginBottom: 0 }}>
                    <div className="workload-card-header">
                      <DragGripHeader title={t("Today's Tasks", { defaultValue: "Today's Tasks" })} />
                      <button className="workload-view-btn" onClick={() => {
                        const isOutgoing = dashboardMode === "user";
                        navigate(rolePath(isOutgoing ? "taskby" : "tasks"));
                      }}>{t("View All Tasks", { defaultValue: "View All Tasks" })}</button>
                    </div>
                    {todayWorkload.length === 0 ? (
                      <p style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", padding: "16px 0" }}>{t("No tasks due today", { defaultValue: "No tasks due today" })}</p>
                    ) : (
                      <>
                        <div ref={taskSliderRef} style={{ overflow: "hidden" }}>
                          <div style={{
                            display: "flex", gap: `${GAP}px`, transition: "transform 0.3s ease",
                            transform: `translateX(-${taskSlide * (taskCardWidth + GAP)}px)`,
                          }}>
                            {todayWorkload.map((item, idx) => (
                              <WorkloadItem
                                key={`${item.id}-${idx}`}
                                item={item}
                                navigate={navigate}
                                getInitials={getInitials}
                                rolePath={rolePath}
                                cardWidth={taskCardWidth}
                                getProgressColor={getProgressColor}
                                PROJECTS_PER_VIEW={PROJECTS_PER_VIEW}
                                GAP={GAP}
                                currentRole={currentRole}
                                dashboardMode={dashboardMode}
                              />
                            ))}
                          </div>
                        </div>
                        {todayWorkload.length > PROJECTS_PER_VIEW && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px", marginTop: "20px" }}>
                            <button
                              onClick={() => setTaskSlide((s) => Math.max(0, s - 1))}
                              disabled={taskSlide === 0}
                              style={{
                                background: "transparent", border: "none",
                                color: taskSlide === 0 ? "var(--border-medium)" : "var(--text-dark)",
                                cursor: taskSlide === 0 ? "default" : "pointer",
                                fontSize: "24px", fontWeight: 700, padding: "4px 8px", lineHeight: 1,
                              }}
                            >
                              &lt;
                            </button>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              {Array.from({ length: totalTaskSlides + 1 }).map((_, i) => (
                                <button
                                  key={i}
                                  onClick={() => setTaskSlide(i)}
                                  style={{
                                    width: i === taskSlide ? "28px" : "10px", height: "10px",
                                    borderRadius: "5px", border: "none",
                                    background: i === taskSlide ? "var(--text-dark)" : "var(--border-medium)",
                                    cursor: "pointer", transition: "all 0.2s", padding: 0,
                                  }}
                                />
                              ))}
                            </div>
                            <button
                              onClick={() => setTaskSlide((s) => Math.min(totalTaskSlides, s + 1))}
                              disabled={taskSlide >= totalTaskSlides}
                              style={{
                                background: "transparent", border: "none",
                                color: taskSlide >= totalTaskSlides ? "var(--border-medium)" : "var(--text-dark)",
                                cursor: taskSlide >= totalTaskSlides ? "default" : "pointer",
                                fontSize: "24px", fontWeight: 700, padding: "4px 8px", lineHeight: 1,
                              }}
                            >
                              &gt;
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            }

            if (secKey === "active_projects") {
              const showExtra = isAdminManager ? dashboardMode === "user" : dashboardMode === "my";
              if (!showExtra || !isWidgetEnabled("dashboard", "active_projects")) return null;
              return (
                <div
                  key="active_projects"
                  draggable={false}
                  onDragOver={(e) => handleSecDragOver(e, index)}
                  onDrop={(e) => handleSecDrop(e, index)}
                  style={sectionWrapperStyle}
                >
                  <div className="active-projects-section" style={{
                    background: "var(--bg-card)", borderRadius: "20px", padding: "24px",
                    boxShadow: "var(--shadow-sm)", marginBottom: 0, overflow: "hidden"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                      <DragGripHeader title={t("Active Projects", { defaultValue: "Active Projects" })} />
                      <button
                        className="workload-view-btn"
                        onClick={() => navigate(`${rolePath("projects")}?filter=active`)}
                      >
                        {t("View All Projects", { defaultValue: "View All Projects" })}
                      </button>
                    </div>
                    {activeProjects.length === 0 ? (
                      <p style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", padding: "16px 0" }}>{t("No active projects", { defaultValue: "No active projects" })}</p>
                    ) : (
                      <>
                        <div ref={sliderRef} style={{ overflow: "hidden" }}>
                          <div style={{
                            display: "flex", gap: `${GAP}px`, transition: "transform 0.3s ease",
                            transform: `translateX(-${projectSlide * (cardWidth + GAP)}px)`,
                          }}>
                            {activeProjects.map((project, idx) => (
                              <ProjectCard
                                key={project.id || idx}
                                project={project}
                                cardWidth={cardWidth}
                                navigate={navigate}
                                getProgressColor={getProgressColor}
                                rolePath={rolePath}
                                PROJECTS_PER_VIEW={PROJECTS_PER_VIEW}
                                GAP={GAP}
                              />
                            ))}
                          </div>
                        </div>
                        {activeProjects.length > PROJECTS_PER_VIEW && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px", marginTop: "24px" }}>
                            <button
                              onClick={() => setProjectSlide((s) => Math.max(0, s - 1))}
                              disabled={projectSlide === 0}
                              style={{
                                background: "transparent", border: "none",
                                color: projectSlide === 0 ? "var(--border-medium)" : "var(--text-dark)",
                                cursor: projectSlide === 0 ? "default" : "pointer",
                                fontSize: "24px", fontWeight: 700, padding: "4px 8px", lineHeight: 1,
                              }}
                            >
                              &lt;
                            </button>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              {Array.from({ length: totalProjectSlides + 1 }).map((_, i) => (
                                <button
                                  key={i}
                                  onClick={() => setProjectSlide(i)}
                                  style={{
                                    width: i === projectSlide ? "28px" : "10px", height: "10px",
                                    borderRadius: "5px", border: "none",
                                    background: i === projectSlide ? "var(--text-dark)" : "var(--border-medium)",
                                    cursor: "pointer", transition: "all 0.2s", padding: 0,
                                  }}
                                />
                              ))}
                            </div>
                            <button
                              onClick={() => setProjectSlide((s) => Math.min(totalProjectSlides, s + 1))}
                              disabled={projectSlide >= totalProjectSlides}
                              style={{
                                background: "transparent", border: "none",
                                color: projectSlide >= totalProjectSlides ? "var(--border-medium)" : "var(--text-dark)",
                                cursor: projectSlide >= totalProjectSlides ? "default" : "pointer",
                                fontSize: "24px", fontWeight: 700, padding: "4px 8px", lineHeight: 1,
                              }}
                            >
                              &gt;
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            }

            if (secKey === "activity_feed") {
              const showExtra = isAdminManager ? dashboardMode === "user" : dashboardMode === "my";
              if (!showExtra || !isWidgetActive("activity_feed")) return null;
              return (
                <div
                  key="activity_feed"
                  draggable={false}
                  onDragOver={(e) => handleSecDragOver(e, index)}
                  onDrop={(e) => handleSecDrop(e, index)}
                  style={sectionWrapperStyle}
                >
                  <div className="today-activity-section" style={{ background: "var(--bg-card)", borderRadius: "20px", padding: "24px", boxShadow: "var(--shadow-sm)", marginBottom: 0, position: "relative" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                      <DragGripHeader title={t("Today's Activity", { defaultValue: "Today's Activity" })} />
                      <div>
                        <button
                          onClick={() => navigate(rolePath("history"))}
                          style={{ background: "transparent", border: "none", color: "var(--color-primary)", fontWeight: "600", cursor: "pointer", fontSize: "14px" }}
                        >
                          {t("My Activities", { defaultValue: "My Activities" })}
                        </button>
                      </div>
                    </div>
                    {completedToday.length === 0 ? (
                      <p style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", padding: "16px 0" }}>{t("No activity today", { defaultValue: "No activity today" })}</p>
                    ) : (
                      completedToday.map((item, idx) => {
                        const cfg = activityActionConfig[item.action] || activityActionConfig.submitted;
                        const isViewed = viewedActivities.includes(item.id);
                        return (
                          <div
                            key={item.id || idx}
                            className={`activity-item ${isViewed ? "activity-item--read" : "activity-item--unread"}`}
                            onClick={() => {
                              markActivityViewed(item.id);
                              const from = getActivityFrom(item);
                              const dest = getActivityDestination(item);
                              navigate(`${dest}${dest.includes("?") ? "&" : "?"}from=${from}`, { state: { from } });
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1, minWidth: 0 }}>
                              <div className="activity-icon-circle" style={{
                                width: "40px", height: "40px", borderRadius: "50%",
                                background: cfg.bg, display: "flex", alignItems: "center",
                                justifyItems: "center", flexShrink: 0,
                              }}>
                                <span style={{ fontSize: "16px", color: cfg.color }}>{cfg.icon}</span>
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <p className="activity-text" style={{ margin: 0, fontSize: "14px", lineHeight: "1.4" }}>
                                  {getActivityMessage(item)}
                                </p>
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, marginLeft: "12px" }}>
                              <div
                                title={item.actor_name}
                                style={{
                                  width: "28px", height: "28px", borderRadius: "50%",
                                  background: "var(--text-primary)", color: "#fff",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: "10px", fontWeight: 600, cursor: "pointer",
                                  border: "2px solid var(--bg-card)",
                                }}
                              >
                                {getInitials(item.actor_name)}
                              </div>
                              <span className="activity-time" style={{ fontSize: "13px", whiteSpace: "nowrap" }}>
                                {timeAgo(item.created_at)}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            }

            if (secKey === "knowledge_base") {
              if (!isWidgetEnabled("dashboard", "knowledge_base")) return null;
              return (
                <div
                  key="knowledge_base"
                  draggable={false}
                  onDragOver={(e) => handleSecDragOver(e, index)}
                  onDrop={(e) => handleSecDrop(e, index)}
                  style={sectionWrapperStyle}
                >
                  <div className="workload-card" style={{ marginBottom: 0, padding: "16px" }}>
                    <DragGripHeader title={t("Knowledge Base & Documentation", { defaultValue: "Knowledge Base & Documentation" })} />
                    <KnowledgeBaseWidget />
                  </div>
                </div>
              );
            }

            if (secKey === "events") {
              if (!isWidgetEnabled("dashboard", "events")) return null;
              return (
                <div
                  key="events"
                  draggable={false}
                  onDragOver={(e) => handleSecDragOver(e, index)}
                  onDrop={(e) => handleSecDrop(e, index)}
                  style={sectionWrapperStyle}
                >
                  <div className="workload-card" style={{ marginBottom: 0, padding: "16px" }}>
                    <DragGripHeader title={t("Upcoming Events & Schedule", { defaultValue: "Upcoming Events & Schedule" })} />
                    <EventsWidget />
                  </div>
                </div>
              );
            }

            if (secKey === "custom_widgets") {
              return (
                <div
                  key="custom_widgets"
                  draggable={false}
                  onDragOver={(e) => handleSecDragOver(e, index)}
                  onDrop={(e) => handleSecDrop(e, index)}
                  style={sectionWrapperStyle}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                    <span
                      draggable={true}
                      onDragStart={(e) => handleSecDragStart(e, index)}
                      onDragEnd={() => { setDraggedSecIndex(null); setDragOverSecIndex(null); }}
                      title={t("Drag handle to reorder section on dashboard canvas", { defaultValue: "Drag handle to reorder section on dashboard canvas" })}
                      style={{ cursor: "grab", color: "var(--text-secondary, #94a3b8)", display: "inline-flex", alignItems: "center" }}
                    >
                      <GripVertical size={20} />
                    </span>
                    <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-secondary)" }}>{t("Custom Widgets & Notes", { defaultValue: "Custom Widgets & Notes" })}</span>
                  </div>
                  <DynamicWidgetSection storageKey="pms_dashboard_widgets" sectionTitle={t("Dashboard Widgets", { defaultValue: "Dashboard Widgets" })} />
                </div>
              );
            }

            return null;
          })}

    </DashboardLayout>
  );
}

export default memo(Admin);
