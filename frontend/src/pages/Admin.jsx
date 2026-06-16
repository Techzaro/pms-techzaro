/**
 * Admin page component.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";
import "../components/layout/DashboardLayout.css";
import { getUser, getCurrentRole } from "../utils/auth";
import { useUnifiedSummary } from "../hooks/useUnifiedSummary";
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

  useEffect(() => {
    const handler = (e) => setModalOpen(e.detail.open);
    window.addEventListener("modal-state", handler);
    return () => window.removeEventListener("modal-state", handler);
  }, []);

  useEffect(() => {
    const stored = getUser();
    const name = stored?.name || "User";
    const hasVisited = localStorage.getItem("adminVisited");

    if (!hasVisited) {
      setGreeting(`Welcome, ${name}`);
      localStorage.setItem("adminVisited", "true");
    } else {
      setGreeting(`Welcome, ${name}`);
    }
  }, []);

  /* SUMMARY CARDS */
  const summaryCards = [
    {
      title: "Active Projects",
      value: "24",
      label: "12% from last week",
      icon: "/Vector-5.svg",
      valueColor: "#2563EB",
      trendColor: "#22C55E",
      bgColor: "#EEF2FF",
    },
    {
      title: "Tasks Due",
      value: "12",
      label: "8% from yesterday",
      icon: "/Vector-1%20(3).svg",
      valueColor: "#EF4444",
      trendColor: "#22C55E",
      bgColor: "#FEF2F2",
    },
    {
      title: "Completed",
      value: "86",
      label: "15% from yesterday",
      icon: "/Vector-2.svg",
      valueColor: "#22C55E",
      trendColor: "#22C55E",
      bgColor: "#ECFDF5",
    },
    {
      title: "Pending",
      value: "5",
      label: "3% from last week",
      icon: "/Vector-3.svg",
      valueColor: "#F59E0B",
      trendColor: "#EF4444",
      bgColor: "#FEF3C7",
    },
  ];

  /* TODAY WORKLOAD */
  const todayWorkload = [
    {
      time: "10:00 AM",
      title: "Lorem ipsum",
      member: "Member",
      status: "High Priority",
      avatars: 4,
    },
    {
      time: "10:30 AM",
      title: "Lorem ipsum",
      member: "Member",
      status: "Medium Priority",
      avatars: 4,
    },
    {
      time: "10:00 AM",
      title: "Lorem ipsum",
      member: "Member",
      status: "Low Priority",
      avatars: 2,
    },
    {
      time: "10:00 AM",
      title: "Lorem ipsum",
      member: "Member",
      status: "Medium Priority",
      avatars: 4,
    },
  ];

  /* ACTIVE PROJECTS */
  const activeProjects = [
    {
      name: "Car System",
      client: "Do Drive",
      progress: 65,
      deadline: "30 Oct 2026",
    },
    {
      name: "CRM Dashboard",
      client: "Tech Corp",
      progress: 80,
      deadline: "15 Nov 2026",
    },
    {
      name: "Mobile App",
      client: "Appify",
      progress: 45,
      deadline: "20 Dec 2026",
    },
  ];

  /* RECENT ACTIVITY */
  const recentActivities = [
    {
      type: "completed",
      title:
        'Ahmad completed the task "Navbar Design" in Website Redesign',
      time: "2m ago",
    },
    {
      type: "upload",
      title:
        "Sarah uploaded 5 new files to CRM System",
      time: "15m ago",
    },
    {
      type: "review",
      title:
        "API Integration moved to Review by Abdullah",
      time: "1h ago",
    },
    {
      type: "create",
      title:
        'You created a new task "Database Optimization"',
      time: "2h ago",
    },
  ];

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
                <p
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    color: card.trendColor,
                    fontWeight: "500",
                  }}
                >
                  ↑ {card.label}
                </p>
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