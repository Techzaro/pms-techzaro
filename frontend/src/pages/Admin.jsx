/**
 * Admin / Dashboard page component.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";
import "../components/layout/DashboardLayout.css";
import { authToken, getUser, getCurrentRole, rolePath } from "../utils/auth";
import { useUnifiedSummary } from "../hooks/useUnifiedSummary";
import API_URL from "../config/api";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import "./Admin.css";


const TYPE_COLORS = {
  Meeting: { bg: "#eef2ff", text: "#6366f1", dot: "#6366f1" },
  Training: { bg: "#eff6ff", text: "#3b82f6", dot: "#3b82f6" },
  Workshop: { bg: "#f5f3ff", text: "#8b5cf6", dot: "#8b5cf6" },
  "Client Meeting": { bg: "#fffbeb", text: "#f59e0b", dot: "#f59e0b" },
  "Company Event": { bg: "#ecfdf5", text: "#22c55e", dot: "#22c55e" },
  Holiday: { bg: "#fef2f2", text: "#ef4444", dot: "#ef4444" },
  Interview: { bg: "#fdf2f8", text: "#ec4899", dot: "#ec4899" },
  "Project Milestone": { bg: "#f0fdfa", text: "#14b8a6", dot: "#14b8a6" },
  "Internship Activity": { bg: "#ecfeff", text: "#06b6d4", dot: "#06b6d4" },
  Other: { bg: "#f3f4f6", text: "#6b7280", dot: "#6b7280" },
  task: { bg: "#eff6ff", text: "#3b82f6", dot: "#3b82f6" },
  project: { bg: "#f5f3ff", text: "#8b5cf6", dot: "#8b5cf6" },
  deliverable: { bg: "#f0fdf4", text: "#16a34a", dot: "#16a34a" },
};

const TYPE_LABELS = {
  Meeting: "Meeting",
  Training: "Training",
  Workshop: "Workshop",
  "Client Meeting": "Client Meeting",
  "Company Event": "Company Event",
  Holiday: "Holiday",
  Interview: "Interview",
  "Project Milestone": "Project Milestone",
  "Internship Activity": "Internship Activity",
  Other: "Other",
  task: "Task",
  project: "Project",
  deliverable: "Deliverable",
};

const formatDisplayDate = (d) => {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

function Admin() {
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState("Welcome");
  const [modalOpen, setModalOpen] = useState(false);
  const currentRole = getCurrentRole() || "member";
  const currentUser = getUser();
  const [myTasks, setMyTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const { today: todayEvents, upcoming: upcomingEvents } = useUnifiedSummary();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handler = (e) => setModalOpen(e.detail.open);
    window.addEventListener("modal-state", handler);
    return () => window.removeEventListener("modal-state", handler);
  }, []);

  useEffect(() => {
    const stored = getUser();
    const name = stored?.name || "User";
    setGreeting(`Welcome, ${name}`);
  }, []);

  const fetchDashboard = useCallback(async () => {
    const token = authToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/dashboard`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDashboard(await res.json());
    } catch (e) {
      console.error("Dashboard fetch error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch user's tasks and all projects to compute user-scoped widgets
  const fetchUserData = useCallback(async () => {
    const token = authToken();
    if (!token) return;
    try {
      const [tasksRes, projectsRes] = await Promise.all([
        fetch(`${API_URL}/my-tasks`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/projects`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } }),
      ]);

      if (tasksRes.ok) {
        const t = await tasksRes.json();
        setMyTasks(Array.isArray(t) ? t : (t.data || []));
      }

      if (projectsRes.ok) {
        const p = await projectsRes.json();
        setProjects(Array.isArray(p) ? p : (p.data || []));
      }
    } catch (e) {
      console.error("User data fetch error", e);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);
  useRefreshOnEvent(['data:changed'], fetchDashboard);
  useEffect(() => { fetchUserData(); }, [fetchUserData]);
  useRefreshOnEvent(['data:changed'], fetchUserData);

  // Use real backend data for summary cards
  const summaryData = dashboard?.summary || {};

  const summaryCards = [
    { title: "Active Projects", value: String(summaryData.active_projects ?? 0), icon: "/Vector-5.svg", valueColor: "#2563EB", bgColor: "#EEF2FF", filter: "active-projects" },
    { title: "Tasks Due Today", value: String(summaryData.tasks_due_today ?? 0), icon: "/Vector-1%20(3).svg", valueColor: "#EF4444", bgColor: "#FEF2F2", filter: "tasks-due-today" },
    { title: "Approved Tasks", value: String(summaryData.approved_tasks ?? 0), icon: "/Vector-2.svg", valueColor: "#22C55E", bgColor: "#ECFDF5", filter: "approved-tasks" },
    { title: "Pending Tasks", value: String(summaryData.pending_tasks ?? 0), icon: "/Vector-3.svg", valueColor: "#F59E0B", bgColor: "#FEF3C7", filter: "pending-tasks" },
  ];

  const openActiveProjects = () => {
    navigate(`${rolePath("projects")}?filter=active`);
  };

  const openTasksDueToday = () => {
    const isAdminOrManager = currentRole === "admin" || currentRole === "manager";
    navigate(`${rolePath(isAdminOrManager ? "taskby" : "tasks")}?status=due_today`);
  };

  const openApprovedTasks = () => {
    const isAdminOrManager = currentRole === "admin" || currentRole === "manager";
    navigate(`${rolePath(isAdminOrManager ? "taskby" : "tasks")}?status=approved`);
  };

  const openPendingTasks = () => {
    const isAdminOrManager = currentRole === "admin" || currentRole === "manager";
    navigate(`${rolePath(isAdminOrManager ? "taskby" : "tasks")}?status=pending`);
  };

  const handleSummaryCardClick = (card) => {
    if (card.filter === "active-projects") openActiveProjects();
    if (card.filter === "tasks-due-today") openTasksDueToday();
    if (card.filter === "approved-tasks") openApprovedTasks();
    if (card.filter === "pending-tasks") openPendingTasks();
  };

  const getInitials = (name) => {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

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

  const getRoleLabel = (role) => {
    if (role === "member") return "Member";
    if (role === "team_lead") return "Team Lead";
    return role ? role.charAt(0).toUpperCase() + role.slice(1) : "User";
  };

  const todayWorkload = (dashboard?.todayWorkload || []).map((w) => {
    const assignees = w.assignees || w.assigned_users || [];
    const uniqueRoles = [...new Set(assignees.map((a) => a.role).filter(Boolean))];
    const roleLabel = uniqueRoles
      .map((r) => getRoleLabel(r))
      .sort((a, b) => (a === "Team Lead" ? -1 : b === "Team Lead" ? 1 : 0))
      .join(", ");
    return {
      id: w.id,
      entity_id: w.entity_id || w.id,
      module: w.module || w.item_type || "task",
      time: w.end_date ? new Date(w.end_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
      title: w.title || w.name || 'Untitled',
      roleLabel,
      assignees,
      status: w.priority ? w.priority + ' Priority' : (w.status || '—'),
    };
  });

  const completedToday = (dashboard?.completedToday || []).map((item) => ({
    id: item.id,
    entity_id: item.entity_id,
    module: item.module,
    action: item.action,
    title: item.title,
    actor_name: item.actor_name,
    actor_role: item.actor_role,
    is_actor: item.is_actor,
    time_ago: item.time_ago || '—',
    created_at: item.created_at,
  }));

  const activityActionConfig = {
    submitted:   { icon: "✓", color: "#22C55E", bg: "#ECFDF5" },
    resubmitted: { icon: "↻", color: "#3B82F6", bg: "#EFF6FF" },
    approved:    { icon: "✓", color: "#22C55E", bg: "#ECFDF5" },
    rejected:    { icon: "✕", color: "#EF4444", bg: "#FEF2F2" },
    reopened:    { icon: "↻", color: "#F59E0B", bg: "#FFFBEB" },
    rework:      { icon: "↻", color: "#F59E0B", bg: "#FFFBEB" },
  };

  const getModuleLabel = (module) => {
    if (module === "task") return "Task";
    if (module === "project") return "Project";
    if (module === "deliverable") return "Deliverable";
    return module;
  };

  const getActivityMessage = (item) => {
    const moduleLabel = getModuleLabel(item.module);
    const titleSpan = <span style={{ fontWeight: 600 }}>"{item.title}"</span>;

    // Team Lead / Member view
    if (currentRole === "member" || currentRole === "team_lead") {
      if (item.is_actor) {
        switch (item.action) {
          case "submitted":
          case "resubmitted":
            return <>{item.action === "resubmitted" ? "You resubmitted" : "You submitted"} {moduleLabel} {titleSpan}</>;
          case "approved":
            return <>You approved {moduleLabel} {titleSpan}</>;
          case "rejected":
            return <>You rejected {moduleLabel} {titleSpan}</>;
          case "reopened":
          case "rework":
            return <>You reopened {moduleLabel} {titleSpan}</>;
          default:
            return <>You updated {moduleLabel} {titleSpan}</>;
        }
      }
      // Someone else acted on user's item
      const actorLabel = item.actor_role === "admin" ? "Admin" : item.actor_role === "manager" ? "Manager" : item.actor_name;
      switch (item.action) {
        case "approved":
          return <>{actorLabel} approved your {moduleLabel} {titleSpan}</>;
        case "rejected":
          return <>{actorLabel} rejected your {moduleLabel} {titleSpan}</>;
        case "reopened":
        case "rework":
          return <>{actorLabel} reopened your {moduleLabel} {titleSpan}</>;
        default:
          return <>{item.actor_name} performed an action on {moduleLabel} {titleSpan}</>;
      }
    }

    // Admin / Manager view
    if (item.is_actor) {
      switch (item.action) {
        case "submitted":
        case "resubmitted":
          return <>{item.action === "resubmitted" ? "You resubmitted" : "You submitted"} {moduleLabel} {titleSpan}</>;
        case "approved":
          return <>You approved {moduleLabel} {titleSpan}</>;
        case "rejected":
          return <>You rejected {moduleLabel} {titleSpan}</>;
        case "reopened":
        case "rework":
          return <>You reopened {moduleLabel} {titleSpan}</>;
        default:
          return <>You updated {moduleLabel} {titleSpan}</>;
      }
    }
    // Someone else acted
    const getActorLabel = (role, name) => {
      if (role === "admin") return currentRole === "manager" ? "Admin" : `Admin ${name}`;
      if (role === "manager") return `Manager ${name}`;
      return name;
    };
    const actorLabel = getActorLabel(item.actor_role, item.actor_name);
    switch (item.action) {
      case "submitted":
      case "resubmitted":
        return <>{actorLabel} {item.action === "resubmitted" ? "resubmitted" : "submitted"} {moduleLabel} {titleSpan}</>;
      case "approved":
        return <>{actorLabel} approved {moduleLabel} {titleSpan}</>;
      case "rejected":
        return <>{actorLabel} rejected {moduleLabel} {titleSpan}</>;
      case "reopened":
      case "rework":
        return <>{actorLabel} reopened {moduleLabel} {titleSpan}</>;
      default:
        return <>{actorLabel} performed an action on {moduleLabel} {titleSpan}</>;
    }
  };

  const activeProjects = (dashboard?.activeProjects || []).map((p) => ({
    id: p.id,
    name: p.name,
    client: p.client || '—',
    progress: p.progress || p.progress_percent || 0,
    deadline: p.deadline || p.due_date || '—',
    team: p.team || '—',
    assigned_users: p.assigned_users || [],
  }));

  const [projectSlide, setProjectSlide] = useState(0);
  const PROJECTS_PER_VIEW = 3;
  const sliderRef = useRef(null);
  const [cardWidth, setCardWidth] = useState(0);
  const totalProjectSlides = Math.max(0, activeProjects.length - PROJECTS_PER_VIEW);
  const GAP = 20;

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
  }, [activeProjects.length]);

  const recentActivities = (dashboard?.recentActivity || []).map((a) => ({
    type: 'activity',
    title: a.summary || a.user_name + ' in ' + a.project_title || '',
    time: a.created_at ? new Date(a.created_at).toLocaleString() : '—',
  }));

  return (
    <div className="dashboard-page">
      {/* HEADER */}
      <Header />

      <div className="main-layout">
        {/* SIDEBAR */}
        <Sidebar />

        {/* MAIN CONTENT */}
        <div className="dashboard-content">
          {/* WELCOME */}
          <div className="welcome-box">
            <h1>{greeting}</h1>


            <p>
              Manage your projects, tasks and team
              activities.
            </p>
          </div>

          {/* SUMMARY CARDS */}
          <div
            className="summary-cards-grid"
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(100px, 1fr))",
              gap: "20px",
            }}
          >
            {summaryCards.map((card) => (
              <div
                key={card.title}
                style={{
                  background: "#fff",
                  borderRadius: "16px",
                  padding: "20px",
                  boxShadow:
                    "0 2px 10px rgba(0,0,0,0.05)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "18px",
                }}
              >
                {/* TOP */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                  }}
                >
                  {/* ICON */}
                  <div
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "14px",
                      background: card.bgColor,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <img
                      src={card.icon}
                      alt={card.title}
                      style={{
                        width: "26px",
                        height: "26px",
                      }}
                    />
                  </div>

                  {/* TEXT */}
                  <div>
                    <h4
                      onClick={card.filter ? () => handleSummaryCardClick(card) : undefined}
                      role={card.filter ? "button" : undefined}
                      tabIndex={card.filter ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (card.filter && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          handleSummaryCardClick(card);
                        }
                      }}
                      style={{
                        margin: 0,
                        fontSize: "15px",
                        color: card.filter ? "#2563EB" : "#6b7280",
                        cursor: card.filter ? "pointer" : "default",
                        textDecoration: card.filter ? "underline" : "none",
                        textUnderlineOffset: "2px",
                      }}
                    >
                      {card.title}
                    </h4>

                    <div
                      style={{
                        marginTop: "5px",
                        fontSize: "36px",
                        fontWeight: "700",
                        color: card.valueColor,
                      }}
                    >
                      {card.value}
                    </div>
                  </div>
                </div>

                {/* BOTTOM */}
                <div style={{ height: "4px" }} />
              </div>
            ))}
          </div>
<br />
          {/* TODAY'S TASKS */}
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
                <div key={index} className="workload-item" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: index < todayWorkload.length - 1 ? "1px solid #F3F4F6" : "none" }}>
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
                          if (item.module === "project") {
                            navigate(rolePath(`projects/project-details/${item.entity_id}`), { state: { from: "admin" } });
                          } else {
                            navigate(rolePath(`tasks/task-details/${item.entity_id}`), { state: { from: "admin" } });
                          }
                        }}
                        title={a.name || a.email}
                        style={{
                          width: "30px",
                          height: "30px",
                          borderRadius: "50%",
                          background: "#1a1a1a",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer",
                          border: "2px solid #fff",
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
                    className="workload-priority"
                    data-priority={item.status}
                    style={{ fontSize: "11px", whiteSpace: "nowrap", minWidth: "100px", textAlign: "right" }}
                  >
                    {item.status}
                  </span>
                </div>
              )))}
            </div>
          </div>

          {/* ACTIVE PROJECTS */}
          <div
            style={{
              background: "#fff",
              borderRadius: "20px",
              padding: "24px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
              marginBottom: "30px",
              overflow: "hidden",
            }}
          >
            {/* HEADER */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "24px",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "22px", fontWeight: "700" }}>
                Active Projects
              </h3>

              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <button
                  onClick={openActiveProjects}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#6366F1",
                    fontWeight: "600",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  View All Projects
                </button>
              </div>
            </div>

            {/* PROJECTS SLIDER */}
            {activeProjects.length === 0 ? (
              <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "16px 0" }}>No active projects</p>
            ) : (
              <>
                {/* Outer wrapper — clips overflow */}
                <div ref={sliderRef} style={{ overflow: "hidden" }}>
                  {/* Inner track — shifts left/right */}
                  <div
                    style={{
                      display: "flex",
                      gap: `${GAP}px`,
                      transition: "transform 0.3s ease",
                      transform: `translateX(-${projectSlide * (cardWidth + GAP)}px)`,
                    }}
                  >
                    {activeProjects.map((project, index) => (
                      <div
                        key={project.id || index}
                        className="project-card"
                        style={{
                          minWidth: cardWidth > 0 ? `${cardWidth}px` : `calc((100% - ${(PROJECTS_PER_VIEW - 1) * GAP}px) / ${PROJECTS_PER_VIEW})`,
                          flex: cardWidth > 0 ? `0 0 ${cardWidth}px` : `0 0 calc((100% - ${(PROJECTS_PER_VIEW - 1) * GAP}px) / ${PROJECTS_PER_VIEW})`,
                          transition: "box-shadow 0.2s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)"; }}
                      >
                      {/* TOP */}
                      <div style={{ display: "flex", gap: "14px", marginBottom: "18px" }}>
                        <div
                          style={{
                            width: "58px",
                            height: "58px",
                            borderRadius: "14px",
                            background: "#FEF3C7",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <img src="/Vector-5.svg" alt="icon" style={{ width: "24px" }} />
                        </div>

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <h4
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(rolePath(`projects/project-details/${project.id}`), { state: { from: "admin" } });
                            }}
                            style={{
                              margin: 0,
                              fontSize: "18px",
                              fontWeight: 600,
                              color: "#374151",
                              cursor: "pointer",
                              wordBreak: "break-word",
                              lineHeight: "1.3",
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

                      {/* PROGRESS */}
                      <div style={{ marginBottom: "18px", marginLeft: "-18px", marginRight: "-18px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", fontSize: "13px", fontWeight: 600, color: "#6b7280", paddingLeft: "18px", paddingRight: "18px" }}>
                          <span>Progress</span>
                          <span>{project.progress}%</span>
                        </div>
                        <div style={{ width: "100%", height: "8px", background: "#d1d5db", borderRadius: "999px", overflow: "hidden" }}>
                          <div
                            style={{
                              height: "100%",
                              borderRadius: "999px",
                              transition: "width 0.4s ease, background 0.4s ease",
                              width: `${project.progress}%`,
                              minWidth: project.progress === 0 ? "100%" : "0",
                              background: project.progress === 0 ? "#d1d5db" : getProgressColor(project.progress),
                            }}
                          />
                        </div>
                      </div>

                      {/* BOTTOM */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        {/* AVATARS */}
                        <div style={{ display: "flex" }}>
                          {(project.assigned_users || []).slice(0, 3).map((u, ai) => (
                            <div
                              key={u.id || ai}
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "50%",
                                background: "#111",
                                color: "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "11px",
                                fontWeight: 600,
                                border: "2px solid #fff",
                                marginLeft: ai > 0 ? "-10px" : "0",
                              }}
                              title={u.name}
                            >
                              {getInitials(u.name)}
                            </div>
                          ))}
                          {(project.assigned_users || []).length > 3 && (
                            <div
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "50%",
                                background: "#E5E7EB",
                                color: "#374151",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "11px",
                                fontWeight: 600,
                                border: "2px solid #fff",
                                marginLeft: "-10px",
                              }}
                            >
                              +{project.assigned_users.length - 3}
                            </div>
                          )}
                        </div>

                        {/* DATE */}
                        <div style={{ color: "#9CA3AF", fontSize: "14px" }}>
                          📅 {project.deadline}
                        </div>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>

                {/* NAVIGATION: arrows + dots */}
                {activeProjects.length > PROJECTS_PER_VIEW && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px", marginTop: "24px" }}>
                    {/* Left Arrow */}
                    <button
                      onClick={() => setProjectSlide((s) => Math.max(0, s - 1))}
                      disabled={projectSlide === 0}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: projectSlide === 0 ? "#CBD5E1" : "#1E293B",
                        cursor: projectSlide === 0 ? "default" : "pointer",
                        fontSize: "24px",
                        fontWeight: 700,
                        padding: "4px 8px",
                        lineHeight: 1,
                      }}
                    >
                      &lt;
                    </button>

                    {/* Dots */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {Array.from({ length: totalProjectSlides + 1 }).map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setProjectSlide(i)}
                          style={{
                            width: i === projectSlide ? "28px" : "10px",
                            height: "10px",
                            borderRadius: "5px",
                            border: "none",
                            background: i === projectSlide ? "#1E293B" : "#CBD5E1",
                            cursor: "pointer",
                            transition: "all 0.2s",
                            padding: 0,
                          }}
                        />
                      ))}
                    </div>

                    {/* Right Arrow */}
                    <button
                      onClick={() => setProjectSlide((s) => Math.min(totalProjectSlides, s + 1))}
                      disabled={projectSlide >= totalProjectSlides}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: projectSlide >= totalProjectSlides ? "#CBD5E1" : "#1E293B",
                        cursor: projectSlide >= totalProjectSlides ? "default" : "pointer",
                        fontSize: "24px",
                        fontWeight: 700,
                        padding: "4px 8px",
                        lineHeight: 1,
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
          <div style={{ background: "#fff", borderRadius: "20px", padding: "24px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", marginBottom: "30px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "600" }}>Today's Activity</h3>
              <button
                onClick={() => navigate(rolePath("tasks"))}
                style={{ background: "transparent", border: "none", color: "#6366F1", fontWeight: "600", cursor: "pointer", fontSize: "14px" }}
              >
                View All Tasks
              </button>
            </div>
            {completedToday.length === 0 ? (
              <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "16px 0" }}>No activity today</p>
            ) : (
              completedToday.map((item, index) => {
                const cfg = activityActionConfig[item.action] || activityActionConfig.submitted;
                return (
                  <div
                    key={item.id || index}
                    onClick={() => {
                      if (item.module === "task") {
                        const taskId = item.entity_id || String(item.id).replace("task_event_", "").replace("task_sub_", "");
                        navigate(rolePath(`tasks/task-details/${taskId}`), { state: { from: "admin" } });
                      } else if (item.module === "project") {
                        const projectId = item.entity_id || String(item.id).replace("project_event_", "");
                        navigate(rolePath(`projects/project-details/${projectId}`), { state: { from: "admin" } });
                      } else {
                        const dlvId = item.entity_id || String(item.id).replace("dlv_event_", "").replace("dlv_sub_", "");
                        navigate(rolePath(`deliveries/deliverable-details/${dlvId}`), { state: { from: "admin" } });
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "14px 0",
                      borderBottom: index < completedToday.length - 1 ? "1px solid #F3F4F6" : "none",
                      cursor: "pointer",
                      borderRadius: "8px",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#F9FAFB"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1, minWidth: 0 }}>
                      {/* Icon */}
                      <div style={{
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

                      {/* Message */}
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: "14px", color: "#374151", lineHeight: "1.4" }}>
                          {getActivityMessage(item)}
                        </p>
                      </div>
                    </div>

                    {/* Actor Avatar + Time */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, marginLeft: "12px" }}>
                      {/* Actor Avatar */}
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

                      {/* Time */}
                      <span style={{ color: "#9CA3AF", fontSize: "13px", whiteSpace: "nowrap" }}>
                        {item.time_ago}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

         
        </div>

         <div className="calender-sidebar">

          {/* TODAY AGENDA */}
          <div className="task-card">
            <h3>
              Today <span className="today-date">• {formatDisplayDate(new Date())}</span>
            </h3>

            <div className="agenda-list">
              {todayEvents.length === 0 ? (
                <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "16px 0" }}>
                  No events today
                </p>
              ) : (
                todayEvents.map((ev) => {
                  const colors = TYPE_COLORS[ev.type] || { bg: "#eef2ff", text: "#6366f1", dot: "#6366f1" };
                  const time = ev.all_day ? "All Day" : new Date(ev.start_date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                  return (
                    <div className="agenda-item" key={ev.id}>
                      <span className="agenda-dot" style={{ background: colors.dot }} />
                      <div className="agenda-content">
                        <div className="agenda-top">
                          <h4>{time}</h4>
                          <span>{TYPE_LABELS[ev.type] || ev.type}</span>
                        </div>
                        <p>{ev.title}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>
<br/>

          {/* UPCOMING DEADLINES */}
          <div className="task-card">
            <p style={{fontWeight:"bold",fontSize:"20px", margin: 0}}>Upcoming Deadlines</p>
            <br />

            <div className="deadline-list">
              {upcomingEvents.length === 0 ? (
                <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "16px 0" }}>
                  No upcoming events
                </p>
              ) : (
                upcomingEvents.slice(0, 5).map((ev) => {
                  const colors = TYPE_COLORS[ev.type] || { bg: "#eef2ff", text: "#6366f1", dot: "#6366f1" };
                  const parts = (ev.start_date || ev.date || "").split("T")[0].split(" ")[0].split("-");
                  const evDate = new Date(+parts[0], +parts[1] - 1, +parts[2]).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  return (
                    <div className="deadline-item" key={ev.id}>
                      <div>
                        <h4>{ev.title}</h4>
                        <div className="dealine-date" style={{ display: "flex", alignItems: "center", gap: 40 }}>
                          <p>{TYPE_LABELS[ev.type] || ev.type}</p>
                          <span className="deadline-date" style={{ color: colors.dot }}>{evDate}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          
          </div>

        </div>

      </div>

    </div>
  );
}

export default Admin;
