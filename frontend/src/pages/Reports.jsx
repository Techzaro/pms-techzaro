import DashboardLayout from "../components/layout/DashboardLayout";
import { useState } from "react";
import "./Reports.css";

const summaryCards = [
  {
    title: "Total Assigned",
    value: 78,
    label: "All tasks assigned",
    icon: "assigned",
    color: "#6366f1",
    bgColor: "#eef2ff",
  },
  {
    title: "Completed",
    value: 40,
    label: "51% completion rate",
    icon: "completed",
    color: "#10b981",
    bgColor: "#ecfdf5",
  },
  {
    title: "Pending",
    value: 18,
    label: "Tasks in progress",
    icon: "pending",
    color: "#f59e0b",
    bgColor: "#fffbeb",
  },
  {
    title: "Overdue",
    value: 8,
    label: "Require attention",
    icon: "overdue",
    color: "#ef4444",
    bgColor: "#fef2f2",
  },
];

const teamMembers = [
  {
    initials: "LI",
    name: "Lorem ipsum",
    role: "Member",
    assigned: 22,
    completed: 16,
    pending: 6,
    tasks: ["ecommerce project", "check", "+1 more"],
    avatarColor: "#6366f1",
  },
  {
    initials: "LI",
    name: "Lorem ipsum",
    role: "Member",
    assigned: 24,
    completed: 22,
    pending: 2,
    tasks: ["ecommerce project", "check", "+1 more"],
    avatarColor: "#10b981",
  },
  {
    initials: "LI",
    name: "Lorem ipsum",
    role: "Member",
    assigned: 2,
    completed: 42,
    pending: 22,
    tasks: ["ecommerce project", "check", "+1 more"],
    avatarColor: "#f59e0b",
  },
  {
    initials: "LI",
    name: "Lorem ipsum",
    role: "Member",
    assigned: 23,
    completed: 7,
    pending: 22,
    tasks: ["ecommerce project", "check", "+1 more"],
    avatarColor: "#ef4444",
  },
];

function Reports() {
  const [timeFilter, setTimeFilter] = useState("All Time");

  return (
    <DashboardLayout>
      <div className="reports-page">

        {/* HEADER */}
        <div className="reports-header">
          <div>
            <h1>Team Performance Report</h1>
            <p>Track progress, tasks, and performance across your team</p>
          </div>
          <div className="reports-header-actions">
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className="reports-filter"
            >
              <option>All Time</option>
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
              <option>This Month</option>
            </select>
            <button className="reports-export-btn">
              Export Report
              <span>↓</span>
            </button>
          </div>
        </div>

        {/* SUMMARY CARDS */}
        <div className="reports-summary">
          {summaryCards.map((card) => (
            <div key={card.title} className="summary-card">
              <div className="summary-card-top">
                <span className={`summary-icon summary-icon-${card.icon}`} />
                <span className="summary-title">{card.title}</span>
              </div>
              <div className="summary-value" style={{ color: card.color }}>
                {card.value}
              </div>
              <p className="summary-label">{card.label}</p>
            </div>
          ))}
        </div>

        {/* TABLE */}
        <div className="reports-table">
          <div className="table-header">
            <span>Team Member</span>
            <span>Assigned</span>
            <span>Completed</span>
            <span>Pending</span>
            <span>Tasks</span>
            <span>Action</span>
          </div>

          {teamMembers.map((member, idx) => (
            <div key={idx} className="table-row">
              <div className="table-member">
                <div
                  className="member-avatar"
                  style={{ color: member.avatarColor, background: member.avatarColor + "18" }}
                >
                  {member.initials}
                </div>
                <div>
                  <div className="member-name">{member.name}</div>
                  <div className="member-role">{member.role}</div>
                </div>
              </div>

              <div className="table-badge badge-blue">{member.assigned}</div>
              <div className="table-badge badge-green">{member.completed}</div>
              <div className="table-badge badge-yellow">{member.pending}</div>

              <div className="table-tasks">
                {member.tasks.map((task, i) => (
                  <div key={i} className="task-item">
                    <span className="task-dot" />
                    {task}
                  </div>
                ))}
              </div>

              <button className="table-action-btn">
                View Profile
                <span>→</span>
              </button>
            </div>
          ))}
        </div>

      </div>
    </DashboardLayout>
  );
}

export default Reports;
