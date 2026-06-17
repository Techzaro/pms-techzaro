/**
 * Admin / Dashboard page component.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";
import "../components/layout/DashboardLayout.css";
import { authToken, getUser, getCurrentRole } from "../utils/auth";
import { useUnifiedSummary } from "../hooks/useUnifiedSummary";
import API_URL from "../config/api";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import "./Admin.css";

const TYPE_COLORS = {
  meeting: { bg: "#eef2ff", text: "#6366f1", dot: "#6366f1" },
  task: { bg: "#eff6ff", text: "#3b82f6", dot: "#3b82f6" },
  other: { bg: "#fff7ed", text: "#f59e0b", dot: "#f59e0b" },
  deadline: { bg: "#fef2f2", text: "#ef4444", dot: "#ef4444" },
  personal: { bg: "#ecfdf5", text: "#22c55e", dot: "#22c55e" },
  project: { bg: "#f5f3ff", text: "#8b5cf6", dot: "#8b5cf6" },
  deliverable: { bg: "#f0fdf4", text: "#16a34a", dot: "#16a34a" },
};

const TYPE_LABELS = {
  meeting: "Meeting",
  task: "Task",
  other: "Review",
  deadline: "Deadline",
  personal: "Personal",
  project: "Project",
  deliverable: "Deliverable",
};

const formatDisplayDate = (d) => {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

function Admin() {
  const [greeting, setGreeting] = useState("Welcome");
  const [modalOpen, setModalOpen] = useState(false);
  const currentRole = getCurrentRole() || "member";
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

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);
  useRefreshOnEvent(['data:changed'], fetchDashboard);

  const summaryCards = dashboard?.summary ? [
    { title: "Active Projects", value: String(dashboard.summary.active_projects ?? 0), icon: "/Vector-5.svg", valueColor: "#2563EB", bgColor: "#EEF2FF" },
    { title: "Tasks Due Today", value: String(dashboard.summary.tasks_due_today ?? 0), icon: "/Vector-1%20(3).svg", valueColor: "#EF4444", bgColor: "#FEF2F2" },
    { title: "Completed Tasks", value: String(dashboard.summary.completed_tasks ?? 0), icon: "/Vector-2.svg", valueColor: "#22C55E", bgColor: "#ECFDF5" },
    { title: "Pending Tasks", value: String(dashboard.summary.pending_tasks ?? 0), icon: "/Vector-3.svg", valueColor: "#F59E0B", bgColor: "#FEF3C7" },
  ] : [];

  const todayWorkload = (dashboard?.todayWorkload || []).map((w) => ({
    time: w.end_date ? new Date(w.end_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
    title: w.title,
    member: w.assignees?.map((a) => a.name).join(', ') || '—',
    status: w.priority ? w.priority + ' Priority' : '—',
  }));

  const completedToday = (dashboard?.completedToday || []).map((c) => ({
    title: c.title,
    project: c.project || '—',
    time: c.completed_at || '—',
  }));

  const activeProjects = (dashboard?.activeProjects || []).map((p) => ({
    name: p.name,
    client: p.client || '—',
    progress: p.progress || 0,
    deadline: p.deadline || '—',
  }));

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
              {getCurrentRole() || "Member"}
            </p>

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
                      style={{
                        margin: 0,
                        fontSize: "15px",
                        color: "#6b7280",
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
              <button className="workload-view-btn">View All Tasks</button>
            </div>

            <div className="workload-list">
              {todayWorkload.length === 0 ? (
                <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "16px 0" }}>No tasks due today</p>
              ) : (
                todayWorkload.map((item, index) => (
                <div key={index} className="workload-item">
                  <div className="workload-item-left">
                    <span className="workload-time">{item.time}</span>
                    <span className="workload-dot" />
                    <div>
                      <p className="workload-title">{item.title}</p>
                      <span className="workload-member">{item.member}</span>
                    </div>
                  </div>
                  <span
                    className="workload-priority"
                    data-priority={item.status}
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
              boxShadow:
                "0 2px 10px rgba(0,0,0,0.05)",
              marginBottom: "30px",
            }}
          >
            {/* HEADER */}
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                alignItems: "center",
                marginBottom: "24px",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "22px",
                  fontWeight: "700",
                }}
              >
                Active Projects
              </h3>

              <button
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#6366F1",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                View All Projects
              </button>
            </div>

            {/* PROJECTS GRID */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "20px",
              }}
            >
              {activeProjects.map(
                (project, index) => (
                  <div
                    key={index}
                    style={{
                      background: "#fff",
                      borderRadius: "18px",
                      padding: "18px",
                      border:
                        "1px solid #F1F5F9",
                      boxShadow:
                        "0 2px 8px rgba(0,0,0,0.04)",
                    }}
                  >
                    {/* TOP */}
                    <div
                      style={{
                        display: "flex",
                        gap: "14px",
                        marginBottom:
                          "18px",
                      }}
                    >
                      <div
                        style={{
                          width: "58px",
                          height: "58px",
                          borderRadius:
                            "14px",
                          background:
                            "#FEF3C7",
                          display: "flex",
                          alignItems:
                            "center",
                          justifyContent:
                            "center",
                        }}
                      >
                        <img
                          src="/Vector-5.svg"
                          alt="icon"
                          style={{
                            width:
                              "24px",
                          }}
                        />
                      </div>

                      <div>
                        <h4
                          style={{
                            margin: 0,
                            fontSize:
                              "20px",
                          }}
                        >
                          {project.name}
                        </h4>

                        <p
                          style={{
                            marginTop:
                              "5px",
                            color:
                              "#9CA3AF",
                          }}
                        >
                          Client:{" "}
                          {
                            project.client
                          }
                        </p>
                      </div>
                    </div>

                    {/* PROGRESS */}
                    <div
                      style={{
                        marginBottom:
                          "18px",
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          justifyContent:
                            "space-between",
                          marginBottom:
                            "8px",
                        }}
                      >
                        <span>
                          Progress
                        </span>

                        <span>
                          {
                            project.progress
                          }
                          %
                        </span>
                      </div>

                      <div
                        style={{
                          width:
                            "100%",
                          height:
                            "8px",
                          background:
                            "#F3F4F6",
                          borderRadius:
                            "20px",
                        }}
                      >
                        <div
                          style={{
                            width: `${project.progress}%`,
                            height:
                              "100%",
                            background:
                              "#F59E0B",
                            borderRadius:
                              "20px",
                          }}
                        />
                      </div>
                    </div>

                    {/* BOTTOM */}
                    <div
                      style={{
                        display:
                          "flex",
                        justifyContent:
                          "space-between",
                        alignItems:
                          "center",
                      }}
                    >
                      {/* AVATARS */}
                      <div
                        style={{
                          display:
                            "flex",
                        }}
                      >
                        {[1, 2].map(
                          (item) => (
                            <div
                              key={item}
                              style={{
                                width:
                                  "32px",
                                height:
                                  "32px",
                                borderRadius:
                                  "50%",
                                background:
                                  "#111",
                                border:
                                  "2px solid #fff",
                                marginLeft:
                                  item !==
                                    1
                                    ? "-10px"
                                    : "0",
                              }}
                            />
                          )
                        )}
                      </div>

                      {/* DATE */}
                      <div
                        style={{
                          color:
                            "#9CA3AF",
                          fontSize:
                            "14px",
                        }}
                      >
                        📅{" "}
                        {
                          project.deadline
                        }
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          {/* COMPLETED TODAY */}
          <div style={{ background: "#fff", borderRadius: "20px", padding: "24px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", marginBottom: "30px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "600" }}>Completed Today</h3>
            </div>
            {completedToday.length === 0 ? (
              <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "16px 0" }}>No tasks completed today</p>
            ) : (
              completedToday.map((item, index) => (
                <div key={index} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: index !== completedToday.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: "#ECFDF3", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "18px" }}>✓</span>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: "15px", color: "#374151", fontWeight: "500" }}>{item.title}</p>
                      <span style={{ fontSize: "12px", color: "#9ca3af" }}>{item.project}</span>
                    </div>
                  </div>
                  <span style={{ color: "#9CA3AF", fontSize: "13px", whiteSpace: "nowrap" }}>{item.time}</span>
                </div>
              ))
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
                  const colors = TYPE_COLORS[ev.type] || TYPE_COLORS.meeting;
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
                  const colors = TYPE_COLORS[ev.type] || TYPE_COLORS.meeting;
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