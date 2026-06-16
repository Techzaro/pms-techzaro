import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ExportReport from "./ExportReport";
import { getUser, rolePath } from "../utils/auth";
import "./Reports.css";

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
  const [showExportModal, setShowExportModal] = useState(false);
  const stored = getUser();
  const userName = stored?.name || "Lorem Ipsum";
  const userRole = stored?.role || "Member";
  const navigate = useNavigate();

  const breadcrumbs = [
    { label: "Reports" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="reports-page">

        {/* WELCOME HEADER */}
       

        {/* REPORT HEADER */}
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
              <option>Last 6 Months</option>
            </select>
            <button
              className="reports-export-btn"
              onClick={() => setShowExportModal(true)}
            >
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
                <span className={`summary-icon`} style={{ background: card.bgColor }}>
                  <img src={card.icon} alt={card.title} style={{ width: 20, height: 20 }} />
                </span>
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
        <div className="reports-table-wrapper">
          <div className="reports-table">
            <div className="table-header">
              <span className="th-member">Team Member</span>
              <span className="th-stat">Assigned</span>
              <span className="th-stat">Completed</span>
              <span className="th-stat">Pending</span>
              <span className="th-tasks">Tasks</span>
              <span className="th-action">Action</span>
            </div>

            {teamMembers.map((member, idx) => (
              <div key={idx} className="table-row">
                <div className="table-member">
                  <div
                    className="member-avatar"
                    style={{ background: member.avatarColor, color: "#fff" }}
                  >
                    {member.initials}
                  </div>
                  <div className="member-info">
                    <div className="member-name">{member.name}</div>
                    <div className="member-role">{member.role}</div>
                  </div>
                </div>

                <div className="stat-cell">
                  <span className="stat-badge assigned">{member.assigned}</span>
                </div>
                <div className="stat-cell">
                  <span className="stat-badge completed">{member.completed}</span>
                </div>
                <div className="stat-cell">
                  <span className="stat-badge pending">{member.pending}</span>
                </div>

                <div className="table-tasks">
                  {member.tasks.map((task, i) => (
                    <div key={i} className="task-badge">
                      <span className="task-badge-dot" />
                      {task}
                    </div>
                  ))}
                </div>

                <div className="action-cell">
                  <button
                    className="table-action-btn"
                    onClick={() => navigate(rolePath(`reports/user-performance/${idx}`))}
                  >
                    Profile
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 3L9 7L5 11" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      <ExportReport isOpen={showExportModal} onClose={() => setShowExportModal(false)} />
    </DashboardLayout>
  );
}

export default Reports;