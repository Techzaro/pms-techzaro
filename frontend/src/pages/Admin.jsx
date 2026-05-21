/**
 * Admin page component.
 * Rendered when the user navigates to /admin or related route.
 */

import { useEffect, useState } from "react";
import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";
import RightSidebar from "../components/layout/RightSidebar";
import "../components/layout/DashboardLayout.css";

/**
 * Perform the admin.
 */

/**
 * Admin dashboard page.
 */
function Admin() {
  const [greeting, setGreeting] = useState("Welcome");
  const [rightOpen, setRightOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const handler = (e) => setModalOpen(e.detail.open);
    window.addEventListener("modal-state", handler);
    return () => window.removeEventListener("modal-state", handler);
  }, []);

  useEffect(() => {
    const name = localStorage.getItem("name") || "User";
    const role = localStorage.getItem("role") || "Member";
    const hasVisited = localStorage.getItem("adminVisited");

    if (!hasVisited) {
      setGreeting(`Welcome, ${name}`);
      localStorage.setItem("adminVisited", "true");
    } else {
      setGreeting(`Welcome, ${name}`);
    }
  }, []);

  const summaryCards = [
    { title: "Active Projects", value: "24", label: "12% from last week", badgeColor: "summary-badge-blue", icon: "/Vector-5.svg" },
    { title: "Tasks Due", value: "12", label: "8% from yesterday", badgeColor: "summary-badge-yellow", icon: "/Vector-1%20(3).svg" },
    { title: "Completed", value: "86", label: "15% from yesterday", badgeColor: "summary-badge-green", icon: "/Vector-2.svg" },
    { title: "Pending", value: "5", label: "3% from last week", badgeColor: "summary-badge-red", icon: "/Vector-3.svg" },
  ];

  const todayWorkload = [
    { time: "10:00 AM", title: "Lorem ipsum", member: "Member", status: "High Priority", avatars: 4 },
    { time: "11:30 AM", title: "Lorem ipsum", member: "Member", status: "Medium Priority", avatars: 4 },
    { time: "2:00 PM", title: "Lorem ipsum", member: "Member", status: "Low Priority", avatars: 2 },
    { time: "4:00 PM", title: "Lorem ipsum", member: "Member", status: "Medium Priority", avatars: 4 },
  ];

  const activeProjects = [
    { name: "Car System", client: "Do Drive", progress: 65, deadline: "30 Oct 2026" },
    { name: "Car System", client: "Do Drive", progress: 65, deadline: "30 Oct 2026" },
    { name: "Car System", client: "Do Drive", progress: 65, deadline: "30 Oct 2026" },
  ];

  const recentActivities = [
    { title: "Ahmad completed the task 'Navbar Design' in Website Redesign", time: "2m ago" },
    { title: "Sarah uploaded 5 new files to CRM System", time: "15m ago" },
    { title: "API Integration moved to Review by Abdullah", time: "1h ago" },
    { title: "You created a new task 'Database Optimization'", time: "2h ago" },
  ];

  return (
    <div className="dashboard-page">

      {/* TOP HEADER */}
      <Header />

      {/* SIDEBAR + CONTENT */}
      <div className="main-layout">

        {/* LEFT SIDEBAR */}
        <Sidebar />

        {/* RIGHT CONTENT */}
        <div className="dashboard-content">

          <div className="welcome-box">
            <h1>{greeting}</h1>
            <p>{localStorage.getItem("role") || "Member"}</p>
            <p>Manage your projects, tasks and team activities.</p>
          </div>

          <div className="summary-cards">
            {summaryCards.map((card) => (
              <div key={card.title} className="summary-card">
                <span className={`summary-badge ${card.badgeColor}`}>{card.title}</span>
                <img src={card.icon} alt={card.title} style={{ width: 28, height: 28, marginBottom: 10, marginTop: 4 }} />
                <div className="summary-card-value">{card.value}</div>
                <p>{card.label}</p>
              </div>
            ))}
          </div>

          <div className="dashboard-sections">
            <div className="section-card workload-card">
              <div className="section-header">
                <div>
                  <h3>Today’s Workload</h3>
                  <p>See today’s tasks and priorities at a glance.</p>
                </div>
                <button className="view-link">View All Tasks</button>
              </div>

              <div className="workload-list">
                {todayWorkload.map((item) => (
                  <div key={item.title + item.time} className="workload-item">
                    <div className="workload-time">
                      <span className="workload-step" />
                      {item.time}
                    </div>
                    <div className="workload-detail">
                      <h4>{item.title}</h4>
                      <p>{item.member}</p>
                    </div>
                    <div className="workload-avatars">
                      {Array.from({ length: item.avatars }).map((_, idx) => (
                        <span key={idx} />
                      ))}
                    </div>
                    <span className={`priority-pill ${item.status.toLowerCase().replace(/\s+/g, "-")}`}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="section-card projects-card">
              <div className="section-header">
                <div>
                  <h3>Active Projects</h3>
                  <p>Track ongoing work and project completion.</p>
                </div>
                <button className="view-link">View All Projects</button>
              </div>

              <div className="projects-grid">
                {activeProjects.map((project, index) => (
                  <div key={`${project.name}-${index}`} className="project-card">
                    <div className="project-card-top">
                      <img src="/Vector-5.svg" alt="Project icon" className="project-card-icon" />
                      <div>
                        <h4>{project.name}</h4>
                        <p>Client: {project.client}</p>
                      </div>
                    </div>

                    <div className="project-progress">
                      <div className="project-progress-meta">
                        <span>{project.progress}%</span>
                        <span>{project.deadline}</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${project.progress}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="section-card activity-card">
              <div className="section-header">
                <div>
                  <h3>Recent Activity</h3>
                  <p>Latest updates from team and projects.</p>
                </div>
              </div>
              <div className="activity-list">
                {recentActivities.map((activity) => (
                  <div key={activity.title} className="activity-item">
                    <div className="activity-dot" />
                    <div className="activity-content">
                      <p>{activity.title}</p>
                      <span>{activity.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

        <RightSidebar isOpen={rightOpen} onClose={() => setRightOpen(false)} />
      </div>

      {!modalOpen && (
        <button
          className={`right-toggle${rightOpen ? " right-toggle--open" : ""}`}
          onClick={() => setRightOpen((prev) => !prev)}
          aria-label="Toggle right sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {rightOpen ? (
              <path d="M7 4L13 10L7 16" />
            ) : (
              <path d="M13 4L7 10L13 16" />
            )}
          </svg>
        </button>
      )}
    </div>
  );
}

export default Admin;