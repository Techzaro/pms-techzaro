import { useState } from "react";
import { useParams } from "react-router-dom";
import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";
import MemberExportReport from "./MemberExportReport";
import "../components/layout/DashboardLayout.css";
import "../pages/UserPerformance.css";
import { getUser } from "../utils/auth";
import "../pages/Calender.css";

const summaryCards = [
  {
    title: "Total Assigned",
    value: 78,
    label: "All tasks assigned",
    icon: "/Vector-5.svg",
    color: "#6366f1",
    bgColor: "#eef2ff",
  },
  {
    title: "Completed",
    value: 40,
    label: "51% completion rate",
    icon: "/Vector-2.svg",
    color: "#10b981",
    bgColor: "#ecfdf5",
  },
  {
    title: "Pending",
    value: 18,
    label: "Tasks in progress",
    icon: "/Vector-1 (3).svg",
    color: "#f59e0b",
    bgColor: "#fffbeb",
  },
  {
    title: "Overdue",
    value: 8,
    label: "Require attention",
    icon: "/Vector-3.svg",
    color: "#ef4444",
    bgColor: "#fef2f2",
  },
];

const taskFilters = [
  { label: "All", count: 42 },
  { label: "Pending", count: 10 },
  { label: "In Review", count: 4 },
  { label: "Completed", count: 28 },
  { label: "Overdue", count: 4 },
];

const tasks = [
  {
    name: "Implement authentication flow",
    project: "Ecommerce Website",
    status: "In Progress",
    priority: "High",
  },
  {
    name: "Design system update",
    project: "Website Redesign",
    status: "Completed",
    priority: "Medium",
  },
  {
    name: "API endpoint optimization",
    project: "CRM System",
    status: "Pending",
    priority: "High",
  },
  {
    name: "Mobile responsive fixes",
    project: "Mobile App",
    status: "In Progress",
    priority: "Low",
  },
  {
    name: "Database migration script",
    project: "Ecommerce Website",
    status: "Completed",
    priority: "High",
  },
];

function UserPerformance() {
  const { userId } = useParams();
  const [activeChartTab, setActiveChartTab] = useState("Monthly");
  const [activeTaskTab, setActiveTaskTab] = useState("Tasks");
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);

  const stored = getUser();
  const userName = stored?.name || "Umar Naseer";
  const userRole = stored?.role || "Frontend Developer";
  const isMember = userRole === "member";

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.project.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      activeFilter === "All" || task.status === activeFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="dashboard-page">
      <Header />

      <div className="main-layout">
        <Sidebar />

        <div className="dashboard-content">
          <div className="up-layout">

            {/* LEFT SIDE - MAIN CONTENT */}
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
                    <h1>{userName}</h1>
                    <p className="up-role">{userRole}</p>
                    <span className="up-team">Development Team</span>
                  </div>
                </div>
                <div className="up-profile-actions">
                  <button
                    className="up-export-btn"
                    onClick={() => setShowExportModal(true)}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 2v8M4 6l4 4 4-4M2 14h12" />
                    </svg>
                    Export Report
                  </button>
                  {!isMember && (
                    <button className="up-assign-btn">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v12M2 8h12" />
                      </svg>
                      Assign Task
                    </button>
                  )}
                </div>
              </div>

              {/* SUMMARY CARDS */}
              <div className="up-summary">
                {summaryCards.map((card) => (
                  <div key={card.title} className="up-summary-card">
                    <div className="up-summary-top">
                      <span
                        className="up-summary-icon"
                        style={{ background: card.bgColor }}
                      >
                        <img
                          src={card.icon}
                          alt={card.title}
                          style={{ width: 20, height: 20 }}
                        />
                      </span>
                      <span className="up-summary-title">{card.title}</span>
                    </div>
                    <div
                      className="up-summary-value"
                      style={{ color: card.color }}
                    >
                      {card.value}
                    </div>
                    <p className="up-summary-label">{card.label}</p>
                  </div>
                ))}
              </div>

              {/* TASK DONE CHART */}
              <div className="up-chart-card">
                <div className="up-chart-header">
                  <h2>Task Done</h2>
                  <div className="up-chart-tabs">
                    {["Daily", "Weekly", "Monthly"].map((tab) => (
                      <button
                        key={tab}
                        className={activeChartTab === tab ? "active" : ""}
                        onClick={() => setActiveChartTab(tab)}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="up-chart-area">
                  <div className="up-chart-y-axis">
                    {[400, 300, 200, 100, 0].map((val) => (
                      <span key={val}>{val}</span>
                    ))}
                  </div>
                  <div className="up-chart-content">
                    <div
                      className="up-chart-grid-line"
                      style={{ bottom: "25%" }}
                    ></div>
                    <div
                      className="up-chart-grid-line"
                      style={{ bottom: "50%" }}
                    ></div>
                    <div
                      className="up-chart-grid-line"
                      style={{ bottom: "75%" }}
                    ></div>
                    <div className="up-chart-bars">
                      {[
                        65, 85, 120, 180, 280, 350, 380, 320, 260, 150, 100,
                        80,
                      ].map((h, i) => (
                        <div key={i} className="up-chart-bar-wrapper">
                          <div
                            className="up-chart-bar"
                            style={{ height: `${(h / 400) * 100}%` }}
                          ></div>
                          <span className="up-chart-bar-label">
                            {
                              [
                                "May",
                                "Jun",
                                "Jul",
                                "Aug",
                                "Sep",
                                "Oct",
                                "Nov",
                                "Dec",
                                "Jan",
                                "Feb",
                                "Mar",
                                "Apr",
                              ][i]
                            }
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="up-chart-line-overlay">
                      <svg
                        viewBox="0 0 600 200"
                        preserveAspectRatio="none"
                        style={{ width: "100%", height: "100%" }}
                      >
                        <defs>
                          <linearGradient
                            id="lineGradient"
                            x1="0%"
                            y1="0%"
                            x2="100%"
                            y2="0%"
                          >
                            <stop offset="0%" stopColor="#6366f1" />
                            <stop offset="100%" stopColor="#6366f1" />
                          </linearGradient>
                        </defs>
                        <path
                          d="M0,150 C30,140 60,100 90,80 C120,60 150,40 180,30 C210,20 240,25 270,35 C300,45 330,60 360,75 C390,90 420,110 450,130 C480,150 510,160 540,170 C570,180 600,185 600,185"
                          fill="none"
                          stroke="url(#lineGradient)"
                          strokeWidth="2.5"
                        />
                        <circle cx="90" cy="80" r="4" fill="#6366f1" />
                        <circle cx="180" cy="30" r="4" fill="#6366f1" />
                        <circle cx="350" cy="75" r="4" fill="#6366f1" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* TASKS TABLE SECTION */}
              <div className="up-table-section">
                <div className="up-table-tabs">
                  {["Tasks", "Projects", "Activity"].map((tab) => (
                    <button
                      key={tab}
                      className={activeTaskTab === tab ? "active" : ""}
                      onClick={() => setActiveTaskTab(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="up-table-filters">
                  <div className="up-filter-tabs">
                    {taskFilters.map((filter) => (
                      <button
                        key={filter.label}
                        className={activeFilter === filter.label ? "active" : ""}
                        onClick={() => setActiveFilter(filter.label)}
                      >
                        {filter.label} ({filter.count})
                      </button>
                    ))}
                  </div>
                  <div className="up-search">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 18 18"
                      fill="none"
                      stroke="#9ca3af"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="8" cy="8" r="6" />
                      <path d="M13 13l4 4" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search tasks..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                <div className="up-table-wrapper">
                  <div className="up-table">
                    <div className="up-table-header">
                      <span className="up-th-task">Task</span>
                      <span className="up-th-project">Project</span>
                      <span className="up-th-status">Status</span>
                      <span className="up-th-priority">Priority</span>
                    </div>

                    {filteredTasks.map((task, idx) => (
                      <div key={idx} className="up-table-row">
                        <div className="up-td-task">{task.name}</div>
                        <div className="up-td-project">{task.project}</div>
                        <div className="up-td-status">
                          <span
                            className={`up-status-badge ${task.status
                              .toLowerCase()
                              .replace(" ", "-")}`}
                          >
                            {task.status}
                          </span>
                        </div>
                        <div className="up-td-priority">
                          <span
                            className={`up-priority-badge ${task.priority.toLowerCase()}`}
                          >
                            {task.priority}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>

        {/* RIGHT SIDEBAR - SAME AS DASHBOARD */}
        <div className="calender-sidebar">

          {/* TODAY'S EVENTS */}
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

            <div className="card-link">View Today's Agenda</div>
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

      <MemberExportReport isOpen={showExportModal} onClose={() => setShowExportModal(false)} />
    </div>
  );
}

export default UserPerformance;
