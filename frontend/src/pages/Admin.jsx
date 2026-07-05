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
import { getUser, getCurrentRole, rolePath, normalizeRole } from "../utils/auth";
import { getActivityDestination, getActivityFrom } from "../utils/navigation";
import { timeAgo, formatDateTime } from "../utils/formatDateTime";
import { useApiQuery } from "../hooks/useApi";
import { useRelativeTime } from "../hooks/useRelativeTime";
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
      background: "#fff", borderRadius: "16px", padding: "20px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.05)", display: "flex",
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
              margin: 0, fontSize: "15px", color: card.filter ? "#2563EB" : "#6b7280",
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
const WorkloadItem = memo(function WorkloadItem({ item, index, total, navigate, getInitials, rolePath }) {
  return (
    <div className="workload-item" style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 0", borderBottom: index < total - 1 ? "1px solid #F3F4F6" : "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "220px" }}>
        <span className="workload-time" style={{ minWidth: "60px", fontSize: "13px", color: "#6b7280" }}>{item.time}</span>
        <span className="workload-dot" />
        <div>
          <p className="workload-title" style={{ margin: 0, fontWeight: 600, fontSize: "14px" }}>{item.title}</p>
          <span className="workload-member" style={{ fontSize: "12px", color: "#9ca3af" }}>{item.roleLabel}</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, justifyContent: "center" }}>
        {item.assignees.slice(0, 4).map((a, ai) => (
        <div
          key={ai}
          onClick={() => {
            const from = getActivityFrom(item);
            const dest = getActivityDestination(item);
            navigate(`${dest}${dest.includes("?") ? "&" : "?"}from=${from}`, { state: { from } });
          }}
          title={a.name || a.email}
            style={{
              width: "30px", height: "30px", borderRadius: "50%", background: "#1a1a1a",
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "11px", fontWeight: 600, cursor: "pointer", border: "2px solid #fff",
              marginLeft: ai > 0 ? "-8px" : "0",
            }}
          >
            {getInitials(a.name || a.email)}
          </div>
        ))}
        {item.assignees.length > 4 && (
          <span style={{ fontSize: "11px", color: "#9ca3af", marginLeft: "-4px" }}>+{item.assignees.length - 4}</span>
        )}
      </div>
      <span
        data-priority={item.status}
        style={{ fontSize: "11px", whiteSpace: "nowrap", minWidth: "100px", textAlign: "right" }}
      >
        {item.status}
      </span>
    </div>
  );
});

/**
 * ProjectCard — Displays a single active project in the carousel.
 * Shows project name, client, progress bar, assigned user avatars, and deadline.
 * Supports responsive sizing via cardWidth prop for the slider layout.
 */
const ProjectCard = memo(function ProjectCard({ project, cardWidth, navigate, getInitials, getProgressColor, rolePath, PROJECTS_PER_VIEW, GAP }) {
  return (
    <div className="project-card" style={{
      minWidth: cardWidth > 0 ? `${cardWidth}px` : `calc((100% - ${(PROJECTS_PER_VIEW - 1) * GAP}px) / ${PROJECTS_PER_VIEW})`,
      flex: cardWidth > 0 ? `0 0 ${cardWidth}px` : `0 0 calc((100% - ${(PROJECTS_PER_VIEW - 1) * GAP}px) / ${PROJECTS_PER_VIEW})`,
      transition: "box-shadow 0.2s",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)"; }}
    >
      <div style={{ display: "flex", gap: "14px", marginBottom: "18px" }}>
        <div style={{
          width: "58px", height: "58px", borderRadius: "14px", background: "#FEF3C7",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <img src="/Vector-5.svg" alt="icon" style={{ width: "24px" }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h4
            onClick={(e) => {
              e.stopPropagation();
              navigate(rolePath(`projects/project-details/${project.id}`), { state: { from: "admin" } });
            }}
            style={{
              margin: 0, fontSize: "18px", fontWeight: 600, color: "#374151",
              cursor: "pointer", wordBreak: "break-word", lineHeight: "1.3",
            }}
          >
            {(() => {
              const words = (project.name || '').split(' ');
              if (words.length <= 2) return project.name;
              return (
                <>
                  {words.slice(0, 2).join(' ')}
                  <br />
                  {words.slice(2).join(' ')}
                </>
              );
            })()}
          </h4>
          <p style={{ marginTop: "5px", color: "#9CA3AF", fontSize: "14px" }}>
            Client: {project.client}
          </p>
        </div>
      </div>
      <div style={{ marginBottom: "18px", width: "100%", boxSizing: "border-box" }}>
        <div style={{
          display: "flex", justifyContent: "space-between", marginBottom: "10px",
          fontSize: "13px", fontWeight: 600, color: "#6b7280",
        }}>
          <span>Progress</span>
          <span>{project.progress}%</span>
        </div>
        <div style={{ width: "100%", height: "8px", background: "#d1d5db", borderRadius: "999px", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: "999px", transition: "width 0.4s ease, background 0.4s ease",
            width: `${project.progress}%`, minWidth: project.progress === 0 ? "100%" : "0",
            background: project.progress === 0 ? "#d1d5db" : getProgressColor(project.progress),
          }} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex" }}>
          {(project.assigned_users || []).slice(0, 3).map((u, ai) => (
            <div
              key={u.id || ai}
              style={{
                width: "32px", height: "32px", borderRadius: "50%", background: "#111",
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "11px", fontWeight: 600, border: "2px solid #fff",
                marginLeft: ai > 0 ? "-10px" : "0",
              }}
              title={u.name}
            >
              {getInitials(u.name)}
            </div>
          ))}
          {(project.assigned_users || []).length > 3 && (
            <div style={{
              width: "32px", height: "32px", borderRadius: "50%", background: "#E5E7EB",
              color: "#374151", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "11px", fontWeight: 600, border: "2px solid #fff", marginLeft: "-10px",
            }}>
              +{project.assigned_users.length - 3}
            </div>
          )}
        </div>
        <div style={{ color: "#9CA3AF", fontSize: "14px" }}>
          {project.deadline}
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

  // Fetch dashboard summary data (active projects, tasks due today, etc.)
  const { data: dashboard, isLoading } = useApiQuery(
    "dashboard",
    "/dashboard",
    null,
    { staleTime: 120000, refetchOnMount: false, refetchOnWindowFocus: false, refetchInterval: false }
  );

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
  const handleSummaryCardClick = useCallback((card) => {
    if (card.filter === "active-projects") {
      navigate(`${rolePath("projects")}?filter=active`);
    } else {
      const isAdminOrManager = currentRole === "admin" || currentRole === "manager";
      const basePath = rolePath(isAdminOrManager ? "taskby" : "tasks");
      if (card.filter === "tasks-due-today") navigate(`${basePath}?status=due_today`);
      else if (card.filter === "approved-tasks") navigate(`${basePath}?status=approved`);
      else if (card.filter === "pending-tasks") navigate(`${basePath}?status=pending`);
    }
  }, [navigate, currentRole]);

  // Transform raw today's workload data into display-ready format with role labels
  const todayWorkload = useMemo(() =>
    (dashboard?.todayWorkload || []).map((w) => {
      const assignees = w.assignees || w.assigned_users || [];
      const uniqueRoles = [...new Set(assignees.map((a) => a.role).filter(Boolean))];
      const roleLabel = uniqueRoles
        .map((r) => getRoleLabel(r))
        .sort((a, b) => (a === "Team Lead" ? -1 : b === "Team Lead" ? 1 : 0))
        .join(", ");
      return {
        id: w.id, entity_id: w.entity_id || w.id, module: w.module || w.item_type || "task",
        time: w.end_date ? new Date(w.end_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '\u2014',
        title: w.title || w.name || 'Untitled', roleLabel, assignees,
        status: w.priority ? w.priority + ' Priority' : (w.status || '\u2014'),
      };
    }),
    [dashboard?.todayWorkload]
  );

  // Normalize active projects data from API response
  const activeProjects = useMemo(() =>
    (dashboard?.activeProjects || []).map((p) => ({
      id: p.id, name: p.name, client: p.client || '\u2014',
      progress: p.progress || p.progress_percent || 0, deadline: p.deadline || p.due_date || '\u2014',
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

  /** Returns a human-readable label for the activity module (task, project, deliverable) */
  const getModuleLabel = (module) => {
    if (module === "task") return "Task";
    if (module === "project") return "Project";
    if (module === "deliverable") return "Deliverable";
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
      rejected: "rejected",
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
  const [cardWidth, setCardWidth] = useState(0);
  const totalProjectSlides = Math.max(0, activeProjects.length - PROJECTS_PER_VIEW);
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

  return (
    <DashboardLayout>
          <Breadcrumb items={[{ label: "Dashboard" }]} />
          <div className="welcome-box">
            <h1>{greeting}</h1>
            <p>Manage your projects, tasks and team activities.</p>
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
              <h3>Today's Tasks</h3>
              <button className="workload-view-btn" onClick={() => navigate(rolePath("tasks/taskby"))}>View All Tasks</button>
            </div>
            <div className="workload-list">
              {todayWorkload.length === 0 ? (
                <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "16px 0" }}>No tasks due today</p>
              ) : (
                todayWorkload.map((item, index) => (
                  <WorkloadItem
                    key={`${item.id}-${index}`}
                    item={item}
                    index={index}
                    total={todayWorkload.length}
                    navigate={navigate}
                    getInitials={getInitials}
                    rolePath={rolePath}
                  />
                ))
              )}
            </div>
          </div>
          <div className="active-projects-section" style={{
            background: "#fff", borderRadius: "20px", padding: "24px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.05)", marginBottom: "30px", overflow: "hidden",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h3 style={{ margin: 0, fontSize: "22px", fontWeight: "700" }}>Active Projects</h3>
              <button
                onClick={() => navigate(`${rolePath("projects")}?filter=active`)}
                style={{ background: "transparent", border: "none", color: "#6366F1", fontWeight: "600", cursor: "pointer", fontSize: "14px" }}
              >
                View All Projects
              </button>
            </div>
            {activeProjects.length === 0 ? (
              <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "16px 0" }}>No active projects</p>
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
                        getInitials={getInitials}
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

          {/* TODAY'S ACTIVITY */}
          <div className="today-activity-section" style={{ background: "#fff", borderRadius: "20px", padding: "24px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", marginBottom: "30px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "600" }}>Today's Activity</h3>
              <button
                onClick={() => setPastActivityOpen(!pastActivityOpen)}
                style={{ background: "transparent", border: "none", color: "#6366F1", fontWeight: "600", cursor: "pointer", fontSize: "14px" }}
              >
                {pastActivityOpen ? "Hide Past" : "Past Activities"}
              </button>
            </div>
            {completedToday.length === 0 ? (
              <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "16px 0" }}>No activity today</p>
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
            <div className="past-activity-section" style={{ background: "#fff", borderRadius: "20px", padding: "24px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", marginBottom: "30px" }}>
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
                <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "16px 0" }}>Loading past activities...</p>
              ) : (pastActivityData?.data || []).length === 0 ? (
                <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "16px 0" }}>No past activities</p>
              ) : (
                (pastActivityData?.data || []).map((group, gi) => (
                  <div key={group.date} style={{ marginBottom: gi < (pastActivityData?.data || []).length - 1 ? "24px" : "0" }}>
                    <h4 style={{ margin: "0 0 12px 0", fontSize: "15px", fontWeight: "600", color: "#374151", borderBottom: "1px solid #F3F4F6", paddingBottom: "8px" }}>
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
    </DashboardLayout>
  );
}

export default memo(Admin);
