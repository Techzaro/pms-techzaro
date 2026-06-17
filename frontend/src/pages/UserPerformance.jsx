import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";
import Breadcrumb from "../components/Breadcrumb";
import MemberExportReport from "./MemberExportReport";
import "../components/layout/DashboardLayout.css";
import "../pages/UserPerformance.css";
import { getUser, getCurrentRole } from "../utils/auth";
import { useUnifiedSummary } from "../hooks/useUnifiedSummary";
import "../pages/Calender.css";

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
  const currentRole = getCurrentRole() || "member";
  const { today: todayEvents, upcoming: upcomingEvents } = useUnifiedSummary();

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
          <Breadcrumb items={[
            { label: "Reports", path: "/reports" },
            { label: "User Performance" },
          ]} />
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

              {/* TASK STATUS BREAKDOWN & WORKLOAD */}
              <div className="up-charts-row">
                {/* Task Status Breakdown */}
                <div className="up-chart-card">
                  <div className="up-chart-header">
                    <h3>Task Status Breakdown</h3>
                    <select className="up-chart-select">
                      <option>All Time</option>
                      <option>This Month</option>
                      <option>This Week</option>
                    </select>
                  </div>
                  <p className="up-chart-subtitle">42 Total Task</p>
                  <div className="up-breakdown-list">
                    {[
                      { label: "Completed", percent: 52.1, color: "#10b981" },
                      { label: "Pending", percent: 22.8, color: "#f59e0b" },
                      { label: "In Review", percent: 13.9, color: "#6366f1" },
                      { label: "Overdue", percent: 11.2, color: "#ef4444" },
                    ].map((item) => (
                      <div key={item.label} className="up-breakdown-item">
                        <div className="up-breakdown-label">
                          <span className="up-breakdown-dot" style={{ background: item.color }}></span>
                          <span>{item.label}</span>
                        </div>
                        <div className="up-breakdown-bar-wrapper">
                          <div className="up-breakdown-bar">
                            <div className="up-breakdown-bar-fill" style={{ width: item.percent + "%", background: item.color }}></div>
                          </div>
                          <span className="up-breakdown-percent">{item.percent}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Workload & Capacity */}
                <div className="up-chart-card">
                  <div className="up-chart-header">
                    <h3>Workload & Capacity</h3>
                    <select className="up-chart-select">
                      <option>This Week</option>
                      <option>Last Week</option>
                      <option>This Month</option>
                    </select>
                  </div>
                  <div className="up-workload-chart">
                    <div className="up-workload-y-axis">
                      <span>100%</span>
                      <span>75%</span>
                      <span>50%</span>
                      <span>25%</span>
                      <span>0%</span>
                    </div>
                    <div className="up-workload-bars">
                      {[
                        { day: "Mon", percent: 60 },
                        { day: "Tue", percent: 75 },
                        { day: "Wed", percent: 100 },
                        { day: "Thu", percent: 85 },
                        { day: "Fri", percent: 95 },
                        { day: "Sat", percent: 40 },
                        { day: "Sun", percent: 80 },
                      ].map((item) => (
                        <div key={item.day} className="up-workload-bar-col">
                          <div className="up-workload-bar-track">
                            <div
                              className="up-workload-bar-fill"
                              style={{
                                height: item.percent + "%",
                                background: item.percent >= 90 ? "linear-gradient(180deg, #6366f1, #818cf8)" : item.percent >= 70 ? "linear-gradient(180deg, #6366f1, #a5b4fc)" : "linear-gradient(180deg, #6366f1, #c7d2fe)",
                              }}
                            ></div>
                          </div>
                          <span className="up-workload-day">{item.day}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* TASK DONE CHART */}
          

              {/* TASKS TABLE SECTION */}
              <div className="up-table-section">
                <div className="up-table-tabs">
                  {["Tasks", "Projects"].map((tab) => (
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

            <Link to={`/${currentRole}/calender`} className="card-link" style={{ textDecoration: "none" }}>
              View Today's Agenda
            </Link>
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

            <Link to={`/${currentRole}/calender`} className="card-link" style={{ textDecoration: "none" }}>
              View All Deadlines
            </Link>
          </div>

        </div>

      </div>

      <MemberExportReport isOpen={showExportModal} onClose={() => setShowExportModal(false)} />
    </div>
  );
}

export default UserPerformance;
