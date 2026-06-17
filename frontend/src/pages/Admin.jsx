/**
 * Admin / Dashboard page component.
 */

import { useCallback, useEffect, useState } from "react";
import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";
import "../components/layout/DashboardLayout.css";
import { authToken, getUser, getCurrentRole } from "../utils/auth";
import API_URL from "../config/api";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import "./Admin.css";

function Admin() {
  const [greeting, setGreeting] = useState("Welcome");
  const [modalOpen, setModalOpen] = useState(false);
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
          {/* TODAY WORKLOAD */}
          <div className="workload-card">
            <div className="workload-card-header">
              <h3>Today's Workload</h3>
              <button className="workload-view-btn">View All Tasks</button>
            </div>

            <div className="workload-list">
              {todayWorkload.map((item, index) => (
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
              ))}
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

          {/* RECENT ACTIVITY */}
          <div
            style={{
              background: "#fff",
              borderRadius: "20px",
              padding: "24px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
            }}
          >
            {/* HEADER */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "20px",
                  fontWeight: "600",
                }}
              >
                Today's Workload
              </h3>

              <span
                style={{
                  fontSize: "14px",
                  color: "#6366F1",
                  fontWeight: "500",
                  cursor: "pointer",
                }}
              >
                View All Tasks
              </span>
            </div>

            {recentActivities.map((activity, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 0",
                  borderBottom:
                    index !== recentActivities.length - 1
                      ? "1px solid #F3F4F6"
                      : "none",
                }}
              >
                {/* LEFT SIDE */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                  }}
                >
                  {/* ICON */}
                  <div
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "12px",
                      background:
                        activity.type === "completed"
                          ? "#EEF2FF"
                          : activity.type === "upload"
                            ? "#ECFDF3"
                            : activity.type === "review"
                              ? "#FFF7ED"
                              : "#EFF6FF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <img
                      src={
                        activity.type === "completed"
                          ? "/blue-tick.svg"
                          : activity.type === "upload"
                            ? "/arrowup.svg"
                            : activity.type === "review"
                              ? "/orange-eye.svg"
                              : "/plus.svg"
                      }
                      alt="icon"
                      style={{
                        width: "20px",
                        height: "20px",
                      }}
                    />
                  </div>

                  {/* TEXT */}
                  <p
                    style={{
                      margin: 0,
                      fontSize: "15px",
                      color: "#374151",
                      fontWeight: "500",
                    }}
                  >
                    {activity.title}
                  </p>
                </div>

                {/* TIME */}
                <span
                  style={{
                    color: "#9CA3AF",
                    fontSize: "13px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {activity.time}
                </span>
              </div>
            ))}
          </div>
        </div>

         <div className="calender-sidebar">

          {/* TODAY AGENDA */}
          <div className="task-card">
            <h3>
              Today <span className="today-date">• June 17, 2026</span>
            </h3>

            <div className="agenda-list">
              <div className="agenda-item">
                <span className="agenda-dot" />
                <div className="agenda-content">
                  <div className="agenda-top">
                    <h4>10:00 AM</h4>
                    <span>30 min</span>
                  </div>
                  <p>Design Sync</p>
                </div>
              </div>

              <div className="agenda-item">
                <span className="agenda-dot" />
                <div className="agenda-content">
                  <div className="agenda-top">
                    <h4>01:00 PM</h4>
                    <span>1 hr</span>
                  </div>
                  <p>Client Meeting</p>
                </div>
              </div>

              <div className="agenda-item">
                <span className="agenda-dot" />
                <div className="agenda-content">
                  <div className="agenda-top">
                    <h4>03:30 PM</h4>
                    <span>1 hr</span>
                  </div>
                  <p>Project Review</p>
                </div>
              </div>
            </div>

            <div className="card-link">View Today’s Agenda</div>
          </div>
<br/>

          {/* UPCOMING DEADLINES */}
          <div className="task-card">
            <p style={{fontWeight:"bold",fontSize:"20px"}}>Upcoming Deadlines</p>

            <div className="deadline-list">
              <div className="deadline-item">
                <div>
                  <h4>API Integration Review</h4>
                  <div className="dealine-date" style={{display:"flex",alignItems:"center",gap:"70px"}}>
                  <p>CRM System</p>
                <span className="deadline-date red-text">May 19, 2026</span>
                  </div>
                </div>
              </div>

              <div className="deadline-item">
                <div>
                  <h4>Homepage Final Design</h4>
                  <div  className="dealine-date" style={{display:"flex",alignItems:"center",gap:"40px"}}>
                  <p>Website Redesign</p>
                <span className="deadline-date orange-text">May 24, 2026</span>
                  </div>
                </div>
              </div>

              <div className="deadline-item">
                <div>
                  <h4>Mobile App Testing</h4>
                  <div  className="dealine-date" style={{display:"flex",alignItems:"center",gap:"80px"}}>
                  <p>Mobile App</p>
                <span className="deadline-date orange-text">May 18, 2026</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="card-link">View All Deadlines</div>
          </div>

        </div>

      </div>

    </div>
  );
}

export default Admin;