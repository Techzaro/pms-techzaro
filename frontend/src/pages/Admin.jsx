/**
 * Admin page component.
 */

import { useEffect, useState } from "react";
import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";
import "../components/layout/DashboardLayout.css";

function Admin() {
  const [greeting, setGreeting] = useState("Welcome");
  const [rightOpen, setRightOpen] = useState(false);

  useEffect(() => {
    const name = localStorage.getItem("name") || "User";
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
              {localStorage.getItem("role") ||
                "Member"}
            </p>

            <p>
              Manage your projects, tasks and team
              activities.
            </p>
          </div>

          {/* SUMMARY CARDS */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(100px, 1fr))",
              gap: "20px",
              marginBottom: "30px",
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

          {/* TODAY WORKLOAD */}
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
                  color: "#111827",
                }}
              >
                Today’s Workload
              </h3>

              <button
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#6366F1",
                  fontWeight: "600",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                View All Tasks
              </button>
            </div>

            {/* WORKLOAD LIST */}
            <div
              style={{
                border: "1px solid #F1F5F9",
                borderRadius: "18px",
                overflow: "hidden",
              }}
            >
              {todayWorkload.map((item, index) => (
                <div
                  key={index}
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "120px 1fr 150px 170px",
                    alignItems: "center",
                    padding: "20px",
                    borderBottom:
                      index !==
                        todayWorkload.length - 1
                        ? "1px solid #F3F4F6"
                        : "none",
                  }}
                >
                  {/* TIME */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                    }}
                  >
                    <span
                      style={{
                        color: "#9CA3AF",
                        fontSize: "14px",
                        minWidth: "70px",
                      }}
                    >
                      {item.time}
                    </span>

                    <div
                      style={{
                        width: "12px",
                        height: "12px",
                        borderRadius: "50%",
                        background: "#4F46E5",
                        boxShadow:
                          "0 0 0 4px rgba(79,70,229,0.15)",
                      }}
                    />
                  </div>

                  {/* TASK DETAIL */}
                  <div>
                    <h4
                      style={{
                        margin: 0,
                        fontSize: "17px",
                        fontWeight: "700",
                        color: "#111827",
                      }}
                    >
                      {item.title}
                    </h4>

                    <p
                      style={{
                        margin: "5px 0 0",
                        fontSize: "14px",
                        color: "#9CA3AF",
                      }}
                    >
                      {item.member}
                    </p>
                  </div>

                  {/* AVATARS */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {Array.from({
                      length: item.avatars,
                    }).map((_, idx) => (
                      <div
                        key={idx}
                        style={{
                          width: "34px",
                          height: "34px",
                          borderRadius: "50%",
                          background: "#111",
                          border:
                            "2px solid #fff",
                          marginLeft:
                            idx !== 0
                              ? "-10px"
                              : "0",
                        }}
                      />
                    ))}
                  </div>

                  {/* PRIORITY */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "flex-end",
                    }}
                  >
                    <span
                      style={{
                        padding:
                          "10px 16px",
                        borderRadius:
                          "10px",
                        fontSize: "13px",
                        fontWeight: "600",
                        background:
                          item.status ===
                            "High Priority"
                            ? "#FEE2E2"
                            : item.status ===
                              "Medium Priority"
                              ? "#FEF3C7"
                              : "#F3F4F6",

                        color:
                          item.status ===
                            "High Priority"
                            ? "#EF4444"
                            : item.status ===
                              "Medium Priority"
                              ? "#D97706"
                              : "#6B7280",
                      }}
                    >
                      {item.status}
                    </span>
                  </div>
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

      {/* TOGGLE BUTTON */}
      <button
        className="right-toggle"
        onClick={() =>
          setRightOpen((prev) => !prev)
        }
      >
        ➜
      </button>
    </div>
  );
}

export default Admin;