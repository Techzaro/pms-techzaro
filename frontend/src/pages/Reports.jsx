import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { useState, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import CompanyEmployeeReport from "./CompanyEmployeeReport";
import { getUser, rolePath } from "../utils/auth";
import { useApiQuery } from "../hooks/useApi";
import { useQueryClient } from "@tanstack/react-query";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import "./Reports.css";

const PERIOD_MAP = {
  "All Time": "all",
  "Last 7 Days": "week",
  "Last 30 Days": "month",
  "Last 6 Months": "month",
};

const AVATAR_COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

function getInitials(name) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const ROLE_LABEL = { admin: "Admin", manager: "Manager", team_lead: "Team Lead", member: "Member" };

const CARD_META = {
    total_assigned: {
    title: "Total Assigned",
    icon: "/Vector-5.svg",
    valueColor: "#6366f1",
    bgColor: "#EEF2FF",
    filter: "all",
  },
  approved: {
    title: "Approved",
    icon: "/Vector-2.svg",
    valueColor: "#22C55E",
    bgColor: "#ECFDF5",
    filter: "approved",
  },
  pending: {
    title: "Pending",
    icon: "/Vector-1 (3).svg",
    valueColor: "#F59E0B",
    bgColor: "#FEF3C7",
    filter: "pending",
  },
  overdue: {
    title: "Overdue",
    icon: "/Vector-3.svg",
    valueColor: "#EF4444",
    bgColor: "#FEF2F2",
    filter: "overdue",
  },
};

const SummaryCard = memo(function SummaryCard({ card, onClick }) {
  return (
    <div
      className="summary-card"
      onClick={card.filter ? () => onClick(card) : undefined}
      role={card.filter ? "button" : undefined}
      tabIndex={card.filter ? 0 : undefined}
      onKeyDown={(e) => {
        if (card.filter && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick(card);
        }
      }}
      style={{
        background: "#fff", borderRadius: "16px", padding: "20px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.05)", display: "flex",
        flexDirection: "column", gap: "18px",
        cursor: card.filter ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{
          width: "56px", height: "56px", borderRadius: "14px",
          background: card.bgColor, display: "flex", alignItems: "center",
          justifyContent: "center",
        }}>
          <img src={card.icon} alt={card.title} style={{ width: "26px", height: "26px" }} />
        </div>
        <div>
          <h4 style={{
            margin: 0, fontSize: "15px",
            color: card.filter ? "#2563EB" : "#6b7280",
            cursor: card.filter ? "pointer" : "default",
          }}>
            {card.title}
          </h4>
          <div style={{ marginTop: "5px", fontSize: "36px", fontWeight: "700", color: card.valueColor }}>
            {card.value}
          </div>
        </div>
      </div>
    </div>
  );
});

function Reports() {
  const [timeFilter, setTimeFilter] = useState("All Time");
  const [showCompanyReport, setShowCompanyReport] = useState(false);

  const period = PERIOD_MAP[timeFilter] || "all";
  const queryClient = useQueryClient();
  const stored = getUser();
  const currentRole = stored?.role || "member";
  const isAdminOrManager = currentRole === "admin" || currentRole === "manager";

  const { data: summary, isLoading } = useApiQuery(
    ["report-summary-cards", period],
    "/reports/summary-cards",
    { period },
    { staleTime: 0, refetchOnMount: true, refetchInterval: 30000 }
  );

  const { data: userTableData, isLoading: isTableLoading } = useApiQuery(
    ["report-user-table", period],
    "/reports/user-performance-table",
    { period },
    { staleTime: 0, refetchOnMount: true, refetchInterval: 30000, enabled: isAdminOrManager }
  );

  const refetchSummary = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["report-summary-cards"] });
    queryClient.invalidateQueries({ queryKey: ["report-user-table"] });
  }, [queryClient]);

  useRefreshOnEvent(["task:created", "task:updated", "task:deleted", "task:approved", "task:rejected", "task:reopened", "data:changed"], refetchSummary);

  const navigate = useNavigate();

  const handleSummaryCardClick = useCallback((card) => {
    if (!card.filter) return;
    const basePath = rolePath(isAdminOrManager ? "taskby" : "tasks");
    const statusMap = {
      all: "",
      approved: "?status=approved",
      pending: "?status=pending",
      overdue: "?status=overdue",
    };
    const qs = statusMap[card.filter] ?? "";
    navigate(`${basePath}${qs}`);
  }, [navigate, isAdminOrManager]);

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
            <h1>Performance Report</h1>
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
            {isAdminOrManager && (
              <button
                className="reports-export-btn"
                onClick={() => setShowCompanyReport(true)}
              >
                Export Report
                <span>↓</span>
              </button>
            )}
          </div>
        </div>

        {/* SUMMARY CARDS */}
        <div className="summary-cards-grid" style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
          gap: "20px",
          marginBottom: "32px",
        }}>
          {["total_assigned", "approved", "pending", "overdue"].map((key) => {
            const meta = CARD_META[key];
            return (
              <SummaryCard
                key={meta.title}
                card={{
                  ...meta,
                  value: isLoading ? "\u2014" : String(summary?.[key] ?? 0),
                }}
                onClick={handleSummaryCardClick}
              />
            );
          })}
        </div>

        {/* TABLE - Admin & Manager only */}
        {isAdminOrManager && (
          <div className="reports-table-wrapper">
            <div className="reports-table">
              <div className="table-header">
                <span className="th-member">User</span>
                <span className="th-stat">Assigned</span>
                <span className="th-stat">Completed</span>
                <span className="th-stat">Pending</span>
                <span className="th-tasks">Overdue</span>
                <span className="th-action">Action</span>
              </div>

              {isTableLoading ? (
                <div style={{ padding: "24px", textAlign: "center", color: "#9ca3af" }}>Loading...</div>
              ) : (userTableData || []).length === 0 ? (
                <div style={{ padding: "24px", textAlign: "center", color: "#9ca3af" }}>No data available</div>
              ) : (
                (userTableData || []).map((member) => (
                  <div key={member.id} className="table-row">
                    <div className="table-member">
                      <div
                        className="member-avatar"
                        style={{ background: getAvatarColor(member.name), color: "#fff" }}
                      >
                        {getInitials(member.name)}
                      </div>
                      <div className="member-info">
                        <div className="member-name">{member.name}</div>
                        <div className="member-role">{ROLE_LABEL[member.role] || member.role}</div>
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
                    <div className="stat-cell">
                      <span className="stat-badge overdue">{member.overdue}</span>
                    </div>

                    <div className="action-cell">
                      <button
                        className="table-action-btn"
                        onClick={() => navigate(rolePath(`reports/user-performance/${member.id}`))}
                      >
                        Profile
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 3L9 7L5 11" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </div>

      <CompanyEmployeeReport isOpen={showCompanyReport} onClose={() => setShowCompanyReport(false)} />
    </DashboardLayout>
  );
}

export default Reports;