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
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import "../components/layout/DashboardLayout.css";
import { getUser, getCurrentRole, rolePath, normalizeRole, authToken } from "../utils/auth";
import { getActivityDestination, getActivityFrom } from "../utils/navigation";
import API_URL from "../config/api";
import { timeAgo, formatDateTime } from "../utils/formatDateTime";
import { useApiQuery } from "../hooks/useApi";
import { useRelativeTime } from "../hooks/useRelativeTime";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import { IoPerson, IoPeople } from "react-icons/io5";
import "./Admin.css";

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
  return (
    <div className="summary-card" style={{
      background: "var(--bg-card)", borderRadius: "16px", padding: "20px",
      boxShadow: "var(--shadow-sm)", display: "flex",
      flexDirection: "column", gap: "18px",
    }}>
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
            onClick={card.filter ? () => onClick(card) : undefined}
            role={card.filter ? "button" : undefined}
            tabIndex={card.filter ? 0 : undefined}
            onKeyDown={(e) => {
              if (card.filter && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onClick(card);
              }
            }}
            style={{
              margin: 0, fontSize: "15px",               color: card.filter ? "#2563EB" : "var(--text-secondary)",
              cursor: card.filter ? "pointer" : "default", textUnderlineOffset: "2px",
            }}
          >
            {card.title}
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
  { bg: "#E0E7FF", text: "#4338CA" },
  { bg: "#FEE2E2", text: "#B91C1C" },
  { bg: "#DCFCE7", text: "#22C55E" },
  { bg: "#FEF3C7", text: "#D97706" },
  { bg: "#EDE9FE", text: "#7C3AED" },
  { bg: "#FCE7F3", text: "#DB2777" },
];

const WorkloadItem = memo(function WorkloadItem({ item, navigate, getInitials, rolePath, cardWidth, getProgressColor, PROJECTS_PER_VIEW, GAP, currentRole, dashboardMode }) {
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
          <span>Progress</span>
          <span>0%</span>
        </div>
        <div className="dash-progress-bar">
          <div
            className="dash-progress-fill"
            style={{
              width: "0%",
              minWidth: "100%",
              background: "#d1d5db",
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
                    border: "2px solid #fff", flexShrink: 0,
                  }}
                >
                  {getInitials(u.name)}
                </div>
                {dueTime && (
                  <span style={{ fontSize: "11px", color: "#6b7280", whiteSpace: "nowrap" }}>
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
  pending: "#FEF3C7",
  in_progress: "#DBEAFE",
  paused: "#FEF3C7",
  submitted: "#DBEAFE",
  reopened: "#EDE9FE",
  approved: "#DCFCE7",
  rejected: "#FEE2E2",
  Planning: "#DBEAFE",
  "In-progress": "#FEF3C7",
  In_progress: "#FEF3C7",
  Pause: "#FEE2E2",
  Completed: "#DCFCE7",
};

const STATUS_TEXT_COLORS = {
  pending: "#92400E",
  in_progress: "#1E40AF",
  paused: "#92400E",
  submitted: "#1E40AF",
  reopened: "#5B21B6",
  approved: "#166534",
  rejected: "#991B1B",
  Planning: "#1E40AF",
  "In-progress": "#92400E",
  In_progress: "#92400E",
  Pause: "#991B1B",
  Completed: "#166534",
};

/**
 * ProjectCard — Displays a single active project in the carousel.
 * Uses the same card design as the Projects list page for visual consistency.
 */
const ProjectCard = memo(function ProjectCard({ project, cardWidth, navigate, getProgressColor, rolePath, PROJECTS_PER_VIEW, GAP }) {
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
          <span>Progress</span>
          <span>{project.progress}%</span>
        </div>
        <div className="dash-progress-bar">
          <div
            className="dash-progress-fill"
            style={{
              width: `${project.progress}%`,
              minWidth: project.progress === 0 ? "100%" : "0",
              background: project.progress === 0 ? "#d1d5db" : getProgressColor(project.progress),
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
              backgroundColor: STATUS_COLORS[project.status] || "#e0e7ff",
              color: STATUS_TEXT_COLORS[project.status] || "#374151",
            }}
          >
            {project.status || "Planning"}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontSize: "13px", color: "#6B7280", fontWeight: 500 }}>
              📅 {project.start_date ? new Date(project.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-"}
            </span>
            <span style={{ fontSize: "13px", color: "#6B7280", fontWeight: 500 }}>
              📅 {project.end_date ? new Date(project.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "No deadline"}
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
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState("Welcome");
  const [modalOpen, setModalOpen] = useState(false);
  const currentRole = getCurrentRole() || "member";
  const isAdminManager = currentRole === "admin" || currentRole === "manager";

  // Dashboard mode toggle: "my" = My Dashboard, "user" = User Dashboard
  const [dashboardMode, setDashboardMode] = useState(() => isAdminManager ? "user" : "my");

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

  // Fetch dashboard summary data (active projects, tasks due today, etc.)
  const { data: dashboard, isLoading, refetch: refetchDashboard } = useApiQuery(
    ["dashboard", apiMode],
    "/dashboard",
    { mode: apiMode },
    { staleTime: 120000, refetchOnMount: false, refetchOnWindowFocus: false, refetchInterval: false }
  );

  // Auto-refresh dashboard when tasks, projects, or subtasks change
  useAutoRefresh(() => refetchDashboard(), {
    events: ["task:created", "task:updated", "task:deleted", "project:created", "project:updated", "project:deleted", "deliverable:updated", "data:changed"],
  });

  // Listen for modal open/close events from child components
  useEffect(() => {
    const handler = (e) => setModalOpen(e.detail.open);
    window.addEventListener("modal-state", handler);
    // Set greeting with current user's name
    const stored = getUser();
    const name = stored?.name || "User";
    setGreeting(`Welcome, ${name}`);
    return () => window.removeEventListener("modal-state", handler);
  }, []);

  // Tick every second to update relative time displays (e.g. "5 min ago")
  const tick = useRelativeTime();

  // Extract summary data from dashboard response
  const summaryData = dashboard?.summary || {};

  // Build summary card configs from API data
  const summaryCards = useMemo(() => [
    { title: "Active Projects", value: String(summaryData.active_projects ?? 0), icon: "/Vector-5.svg", valueColor: "#2563EB", bgColor: "#EEF2FF", filter: "active-projects" },
    { title: "Tasks Due Today", value: String(summaryData.tasks_due_today ?? 0), icon: "/Vector-1%20(3).svg", valueColor: "#EF4444", bgColor: "#FEF2F2", filter: "tasks-due-today" },
    { title: "Approved Tasks", value: String(summaryData.approved_tasks ?? 0), icon: "/Vector-2.svg", valueColor: "#22C55E", bgColor: "#ECFDF5", filter: "approved-tasks" },
    { title: "Pending Tasks", value: String(summaryData.pending_tasks ?? 0), icon: "/Vector-3.svg", valueColor: "#F59E0B", bgColor: "#FEF3C7", filter: "pending-tasks" },
  ], [summaryData.active_projects, summaryData.tasks_due_today, summaryData.approved_tasks, summaryData.pending_tasks]);

  // Navigate to filtered list when a summary card is clicked
  // For all roles: "my" = incoming (tasks), "user" = outgoing (taskby)
  const handleSummaryCardClick = useCallback((card) => {
    if (card.filter === "active-projects") {
      navigate(`${rolePath("projects")}?filter=active`);
    } else {
      const isOutgoing = dashboardMode === "user";
      const basePath = rolePath(isOutgoing ? "taskby" : "tasks");
      if (card.filter === "tasks-due-today") navigate(`${basePath}?status=due_today`);
      else if (card.filter === "approved-tasks") navigate(`${basePath}?status=approved`);
      else if (card.filter === "pending-tasks") navigate(`${basePath}?status=pending`);
    }
  }, [navigate, currentRole, dashboardMode, isAdminManager]);

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
    created:      { icon: "★", color: "#3B82F6", bg: "#EFF6FF" },
    assigned:     { icon: "→", color: "#8B5CF6", bg: "#F5F3FF" },
    submitted:   { icon: "✓", color: "#22C55E", bg: "#ECFDF5" },
    resubmitted: { icon: "↻", color: "#3B82F6", bg: "#EFF6FF" },
    approved:    { icon: "✓", color: "#22C55E", bg: "#ECFDF5" },
    rejected:    { icon: "✕", color: "#EF4444", bg: "#FEF2F2" },
    reopened:    { icon: "↻", color: "#F59E0B", bg: "#FFFBEB" },
    rework:      { icon: "↻", color: "#F59E0B", bg: "#FFFBEB" },
    completed:       { icon: "✓", color: "#22C55E", bg: "#ECFDF5" },
    status_updated:  { icon: "⚡", color: "#8B5CF6", bg: "#F5F3FF" },
    field_changed:   { icon: "✎", color: "#6B7280", bg: "#F3F4F6" },
    deleted:         { icon: "✕", color: "#EF4444", bg: "#FEF2F2" },
    leader_changed:  { icon: "★", color: "#F59E0B", bg: "#FFFBEB" },
    member_added:    { icon: "+", color: "#22C55E", bg: "#ECFDF5" },
    member_removed:  { icon: "−", color: "#EF4444", bg: "#FEF2F2" },
    access_granted:  { icon: "🔓", color: "#22C55E", bg: "#ECFDF5" },
    access_removed:  { icon: "🔒", color: "#EF4444", bg: "#FEF2F2" },
  };

  /** Returns a human-readable label for the activity module (task, project, subtask) */
  const getModuleLabel = (module) => {
    if (module === "task") return "Task";
    if (module === "project") return "Project";
    if (module === "deliverable") return "Subtask";
    if (module === "user") return "User";
    if (module === "team") return "Team";
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
    const actorLabel = item.is_actor ? "You" : item.actor_name;

    const verbMap = {
      created: "created",
      assigned: "assigned",
      submitted: "submitted",
      resubmitted: "resubmitted",
      approved: "approved",
      rejected: "declined",
      reopened: "reopened",
      rework: "reopened",
      completed: "completed",
      status_updated: "updated status of",
      field_changed: "updated",
      updated: "updated",
      resigned: "resigned",
      deleted: "deleted",
      leader_changed: "changed team lead for",
      member_added: "added member(s) to",
      member_removed: "removed member(s) from",
      access_granted: "granted access on",
      access_removed: "removed access from",
    };
    const verb = verbMap[item.action] || "updated";

    let suffix = null;
    if (item.comment) {
      // For 'assigned' action, replace assignee name with "you" when viewing as assignee
      if (item.action === "assigned" && !item.is_actor) {
        const match = item.comment.match(/^Assigned to (.+)$/);
        if (match) {
          suffix = <> — Assigned to you</>;
        } else {
          suffix = <> — {item.comment}</>;
        }
      } else {
        suffix = <> — {item.comment}</>;
      }
    } else if (item.submitted_by_name && ["approved", "rejected", "reopened", "rework"].includes(item.action)) {
      suffix = <> submitted by {item.submitted_by_name}</>;
    }

    return <>{actorLabel} {verb} {moduleLabel} {titleSpan}{suffix}</>;
  };

  // Project carousel state management
  const [projectSlide, setProjectSlide] = useState(0);
  const [taskSlide, setTaskSlide] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [pastActivityOpen, setPastActivityOpen] = useState(false);
  // Fetch past activity data only when the section is expanded
  const { data: pastActivityData, isLoading: pastLoading } = useApiQuery(
    ["activities", "past"],
    "/activities/past",
    null,
    { enabled: pastActivityOpen, staleTime: 300000 }
  );
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
    <DashboardLayout>
          <Breadcrumb items={[{ label: "Dashboard" }]} />
          <div className="welcome-box" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h1>{greeting}</h1>
              <p>{dashboardMode === "my"
                ? "Viewing tasks assigned to you."
                : "Viewing tasks you assigned to others."}</p>
            </div>
            {/* Dashboard Mode Toggle */}
            <div className="dashboard-toggle-pill" style={{ flexShrink: 0 }}>
              <button
                onClick={() => setDashboardMode("my")}
                className={`dashboard-toggle-btn${dashboardMode === "my" ? " active" : ""}`}
                title="My Dashboard"
              >
                <IoPerson size={20} />
              </button>
              <button
                onClick={() => setDashboardMode("user")}
                className={`dashboard-toggle-btn${dashboardMode === "user" ? " active" : ""}`}
                title="User Dashboard"
              >
                <IoPeople size={20} />
              </button>
            </div>
          </div>
          <div className="summary-cards-grid"
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
          <br />
          <div className="workload-card">
            <div className="workload-card-header">
              <h3 style={{fontSize: "22px", fontWeight: "700"}}>Today's Tasks</h3>
              <button className="workload-view-btn" onClick={() => {
                const isOutgoing = dashboardMode === "user";
                navigate(rolePath(isOutgoing ? "taskby" : "tasks"));
              }}>View All Tasks</button>
            </div>
            {todayWorkload.length === 0 ? (
              <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "16px 0" }}>No tasks due today</p>
            ) : (
              <>
                <div ref={taskSliderRef} style={{ overflow: "hidden" }}>
                  <div style={{
                    display: "flex", gap: `${GAP}px`, transition: "transform 0.3s ease",
                    transform: `translateX(-${taskSlide * (taskCardWidth + GAP)}px)`,
                  }}>
                    {todayWorkload.map((item, index) => (
                      <WorkloadItem
                        key={`${item.id}-${index}`}
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
                        color: taskSlide === 0 ? "#CBD5E1" : "#1E293B",
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
                            background: i === taskSlide ? "#1E293B" : "#CBD5E1",
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
                        color: taskSlide >= totalTaskSlides ? "#CBD5E1" : "#1E293B",
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
          {/* Only show extra sections in the default mode for each role */}
          {/* admin/manager: show on "user" mode; teamlead/member: show on "my" mode */}
          {(isAdminManager ? dashboardMode === "user" : dashboardMode === "my") && (<>
          <div className="active-projects-section" style={{
            background: "var(--bg-card)", borderRadius: "20px", padding: "24px",
            boxShadow: "var(--shadow-sm)", marginBottom: "30px", overflow: "hidden",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h3 style={{ margin: 0, fontSize: "22px", fontWeight: "700" }}>Active Projects</h3>
              <button
                className="workload-view-btn"
                onClick={() => navigate(`${rolePath("projects")}?filter=active`)}
              >
                View All Projects
              </button>
            </div>
            {activeProjects.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", padding: "16px 0" }}>No active projects</p>
            ) : (
              <>
                <div ref={sliderRef} style={{ overflow: "hidden" }}>
                  <div style={{
                    display: "flex", gap: `${GAP}px`, transition: "transform 0.3s ease",
                    transform: `translateX(-${projectSlide * (cardWidth + GAP)}px)`,
                  }}>
                    {activeProjects.map((project, index) => (
                      <ProjectCard
                        key={project.id || index}
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
                        color: projectSlide === 0 ? "#CBD5E1" : "#1E293B",
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
                            background: i === projectSlide ? "#1E293B" : "#CBD5E1",
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
                        color: projectSlide >= totalProjectSlides ? "#CBD5E1" : "#1E293B",
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
          </>)}

          {/* TODAY'S ACTIVITY */}
          {(isAdminManager ? dashboardMode === "user" : dashboardMode === "my") && (<>
          <div className="today-activity-section" style={{ background: "var(--bg-card)", borderRadius: "20px", padding: "24px", boxShadow: "var(--shadow-sm)", marginBottom: "30px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0,fontSize: "22px", fontWeight: "700"}}>Today's Activity</h3>
              <button
                onClick={() => setPastActivityOpen(!pastActivityOpen)}
                style={{ background: "transparent", border: "none", color: "#6366F1", fontWeight: "600", cursor: "pointer", fontSize: "14px" }}
              >
                {pastActivityOpen ? "Hide Past" : "Past Activities"}
              </button>
            </div>
            {completedToday.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", padding: "16px 0" }}>No activity today</p>
            ) : (
              completedToday.map((item, index) => {
                const cfg = activityActionConfig[item.action] || activityActionConfig.submitted;
                const isViewed = viewedActivities.includes(item.id);
                return (
                  <div
                    key={item.id || index}
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
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: cfg.bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
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
                          width: "28px",
                          height: "28px",
                          borderRadius: "50%",
                          background: "#1a1a1a",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "10px",
                          fontWeight: 600,
                          cursor: "pointer",
                          border: "2px solid #fff",
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

          {/* PAST ACTIVITY (expandable) */}
          {pastActivityOpen && (
            <div className="past-activity-section" style={{ background: "var(--bg-card)", borderRadius: "20px", padding: "24px", boxShadow: "var(--shadow-sm)", marginBottom: "30px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "600" }}>Past Activity</h3>
                <button
                  onClick={() => setPastActivityOpen(false)}
                  style={{ background: "transparent", border: "none", color: "#6366F1", fontWeight: "600", cursor: "pointer", fontSize: "14px" }}
                >
                  Collapse
                </button>
              </div>
              {pastLoading ? (
                <p style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", padding: "16px 0" }}>Loading past activities...</p>
              ) : (pastActivityData?.data || []).length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", padding: "16px 0" }}>No past activities</p>
              ) : (
                (pastActivityData?.data || []).map((group, gi) => (
                  <div key={group.date} style={{ marginBottom: gi < (pastActivityData?.data || []).length - 1 ? "24px" : "0" }}>
                    <h4 style={{ margin: "0 0 12px 0", fontSize: "15px", fontWeight: "600", color: "var(--text-dark)", borderBottom: "1px solid var(--border-light)", paddingBottom: "8px" }}>
                      {group.label}
                    </h4>
                    {group.activities.map((item, index) => {
                      const cfg = activityActionConfig[item.action] || activityActionConfig.submitted;
                      const isViewed = viewedActivities.includes(item.id);
                      return (
                        <div
                          key={item.id || index}
                          className={`activity-item ${isViewed ? "activity-item--read" : "activity-item--unread"}`}
                          onClick={() => {
                            markActivityViewed(item.id);
                            const from = getActivityFrom(item);
                            const dest = getActivityDestination(item);
                            navigate(`${dest}${dest.includes("?") ? "&" : "?"}from=${from}`, { state: { from } });
                          }}
                        >
                          <div className="activity-icon-circle" style={{
                            width: "36px", height: "36px", borderRadius: "50%",
                            background: cfg.bg, display: "flex", alignItems: "center",
                            justifyContent: "center", flexShrink: 0,
                          }}>
                            <span style={{ fontSize: "14px", color: cfg.color }}>{cfg.icon}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="activity-text" style={{ margin: 0, fontSize: "14px", lineHeight: "1.4" }}>
                              {getActivityMessage(item)}
                            </p>
                          </div>
                          <span className="activity-time" style={{ fontSize: "13px", whiteSpace: "nowrap" }}>
                            {formatExactTime(item.created_at)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          )}
          </>)}

    </DashboardLayout>
  );
}

export default memo(Admin);
