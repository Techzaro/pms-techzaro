/**
 * Reports page component.
 *
 * Displays summary cards (total assigned, approved, pending, overdue) and a
 * user-performance table for admins/managers.  Team leads see their own
 * summary by default but can switch to a team-members view via the URL.
 * Time-period filtering and an "Export Report" action (opens
 * CompanyEmployeeReport modal) are available to privileged roles.
 */

import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import DonutChart from "../components/DonutChart";
import PriorityBarChart from "../components/PriorityBarChart";
import { useState, useCallback, memo, useMemo, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { IoSearchOutline } from "react-icons/io5";
import CompanyEmployeeReport from "./CompanyEmployeeReport";
import TeamExportReport from "./TeamExportReport";
import { getUser, rolePath } from "../utils/auth";
import { useApiQuery } from "../hooks/useApi";
import { useQueryClient } from "@tanstack/react-query";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import { MdGroup } from "react-icons/md";
import Pagination from "../components/Pagination";
import "../components/Charts.css";
import "./Reports.css";

/** Map human-readable period labels to API query parameters. */
const PERIOD_MAP = {
  "All Time": "all",
  "Last 7 Days": "week",
  "Last 30 Days": "month",
  "Month": "month",
  "Last 6 Months": "month",
  "3 Months": "3months",
  "Custom Date Range": "custom",
};

/** Palette used to generate deterministic avatar colours from user names. */
const AVATAR_COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

/** Extract up to 2 uppercase initials from a full name. */
function getInitials(name) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

/** Deterministic avatar colour derived from a name hash. */
function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const ROLE_LABEL = { admin: "Admin", manager: "Manager", team_lead: "Team Lead", member: "Member", guest: "Guest" };

const CARD_META = {
    total_assigned: {
    title: "Total Assigned",
    icon: "/Vector-5.svg",
    valueColor: "var(--color-primary-light)",
    bgColor: "var(--color-primary-bg)",
    filter: "all",
  },
  approved: {
    title: "Approved",
    icon: "/Vector-2.svg",
    valueColor: "var(--color-success)",
    bgColor: "var(--color-success-bg)",
    filter: "approved",
  },
  pending: {
    title: "Pending",
    icon: "/Vector-1 (3).svg",
    valueColor: "var(--color-warning)",
    bgColor: "var(--color-warning-bg)",
    filter: "pending",
  },
  overdue: {
    title: "Overdue",
    icon: "/Vector-3.svg",
    valueColor: "var(--color-danger)",
    bgColor: "var(--color-danger-bg)",
    filter: "overdue",
  },
};

/** Memoised summary card used for the KPI row at the top of the reports page. */
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
        cursor: card.filter ? "pointer" : "default",
      }}
    >
      <div className="summary-card-top">
        <div className="summary-icon" style={{ background: card.bgColor }}>
          <img src={card.icon} alt={card.title} />
        </div>
        <div>
          <h4 className="summary-title" style={{
            color: card.filter ? "var(--color-primary)" : "var(--text-muted)",
          }}>
            {card.title}
          </h4>
          <div className="summary-value" style={{ color: card.valueColor }}>
            {card.value}
          </div>
        </div>
      </div>
    </div>
  );
});

/** Main Reports page — fetches summary data and renders KPI cards + user table. */
function Reports() {
  const [timeFilter, setTimeFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCompanyReport, setShowCompanyReport] = useState(false);
  const [showTeamExportModal, setShowTeamExportModal] = useState(false);
  const [teamSearch, setTeamSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");

  const period = timeFilter || "all";
  const queryClient = useQueryClient();
  const stored = getUser();
  const currentRole = stored?.role || "member";
  const isAdminOrManager = currentRole === "admin" || currentRole === "manager";
  const isTeamLead = currentRole === "team_lead" || currentRole === "teamlead";

  // Determine view based on URL path
  const location = useLocation();
  const isTeamMembersView = location.pathname.includes("team-members-report");
  
  // For team_lead, determine view based on URL
  const view = isTeamLead ? (isTeamMembersView ? "team" : "self") : "self";

  const { data: summary, isLoading } = useApiQuery(
    ["report-summary-cards", period, customStart, customEnd, view],
    "/reports/summary-cards",
    { period, time_filter: period, startDate: customStart, endDate: customEnd, view },
    { staleTime: 60000, refetchOnMount: true }
  );

  const { data: userTableData, isLoading: isTableLoading } = useApiQuery(
    ["report-user-table", period, customStart, customEnd],
    "/reports/user-performance-table",
    { period, time_filter: period, startDate: customStart, endDate: customEnd },
    { staleTime: 60000, refetchOnMount: true, enabled: isAdminOrManager || isTeamMembersView }
  );

  const { data: teamsData, isLoading: isTeamsLoading } = useApiQuery(
    ["report-teams-overview"],
    "/reports/teams-overview",
    null,
    { staleTime: 60000, refetchOnMount: true, enabled: isAdminOrManager }
  );

  const teams = Array.isArray(teamsData) ? teamsData : [];

  const filteredTeams = useMemo(() => {
    if (!teamSearch.trim()) return teams;
    const q = teamSearch.toLowerCase();
    return teams.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.leader?.name?.toLowerCase().includes(q)
    );
  }, [teams, teamSearch]);

  const filteredUsers = useMemo(() => {
    const list = userTableData || [];
    if (!userSearch.trim()) return list;
    const q = userSearch.toLowerCase();
    return list.filter(
      (u) =>
        u.name?.toLowerCase().includes(q) ||
        (ROLE_LABEL[u.role] || u.role || "").toLowerCase().includes(q)
    );
  }, [userTableData, userSearch]);

  const [userPage, setUserPage] = useState(1);
  const [userItemsPerPage, setUserItemsPerPage] = useState(10);
  const userTotalPages = Math.max(1, Math.ceil((filteredUsers || []).length / userItemsPerPage));
  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * userItemsPerPage;
    return (filteredUsers || []).slice(start, start + userItemsPerPage);
  }, [filteredUsers, userPage, userItemsPerPage]);

  // Status breakdown for donut chart — API returns flat summary fields
  const totalTasks = summary?.total_assigned || 0;

  const statusItems = useMemo(() => {
    return [
      { label: "Completed", count: summary?.approved || 0, color: "var(--color-green-text)" },
      { label: "Pending", count: summary?.pending || 0, color: "var(--color-orange-text)" },
      { label: "In Review", count: summary?.in_review || 0, color: "var(--color-blue-text)" },
      { label: "Overdue", count: summary?.overdue || 0, color: "var(--color-danger)" },
    ];
  }, [summary?.approved, summary?.pending, summary?.in_review, summary?.overdue]);

  // Priority breakdown for bar chart — API returns flat summary fields
  const priorityItems = useMemo(() => {
    return [
      { label: "High", count: summary?.high_priority || 0, color: "var(--color-danger)" },
      { label: "Medium", count: summary?.medium_priority || 0, color: "var(--color-orange-text)" },
      { label: "Low", count: summary?.low_priority || 0, color: "var(--color-green-text)" },
    ];
  }, [summary?.high_priority, summary?.medium_priority, summary?.low_priority]);

  const refetchSummary = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["report-summary-cards"] });
    queryClient.invalidateQueries({ queryKey: ["report-user-table"] });
  }, [queryClient]);

  useAutoRefresh(refetchSummary, { events: ["task:created", "task:updated", "task:deleted", "task:approved", "task:rejected", "task:reopened", "data:changed"] });

  const navigate = useNavigate();

  const [teamSlide, setTeamSlide] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const TEAMS_PER_VIEW = isMobile ? 1 : 3;
  const sliderRef = useRef(null);
  const [cardWidth, setCardWidth] = useState(0);
  const totalTeamSlides = Math.max(0, filteredTeams.length - TEAMS_PER_VIEW);
  const GAP = isMobile ? 0 : 20;

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const measure = () => {
      if (sliderRef.current) {
        const containerWidth = sliderRef.current.offsetWidth;
        const cw = (containerWidth - (TEAMS_PER_VIEW - 1) * GAP) / TEAMS_PER_VIEW;
        setCardWidth(cw);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [teams.length, TEAMS_PER_VIEW, GAP]);

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

  // Determine if we should show the user table
  const showUserTable = isAdminOrManager || isTeamMembersView;

  const breadcrumbs = [
    { label: "Reports" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="reports-page">

        {/* REPORT HEADER */}
        <div className="reports-header">
          <div>
            <h1>{isTeamMembersView ? "Team Members Performance" : "Performance Report"}</h1>
            <p>{isTeamMembersView ? "Track progress and performance of your team members" : "Track progress, tasks, and performance across your team"}</p>
          </div>
          <div className="reports-header-actions" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className="reports-filter"
            >
              <option value="all">All Time</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 3 Months</option>
              <option value="180">Last 6 Months</option>
              <option value="custom">Custom Date Range</option>
            </select>
            {timeFilter === "custom" && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>From:</span>
                <input
                  type="date"
                  value={customStart}
                  max={customEnd || undefined}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustomStart(v);
                    if (customEnd && v > customEnd) setCustomEnd(v);
                  }}
                  className="reports-filter"
                  style={{ padding: "4px 8px" }}
                />
                <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>To:</span>
                <input
                  type="date"
                  value={customEnd}
                  min={customStart || undefined}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustomEnd(v);
                    if (customStart && v < customStart) setCustomStart(v);
                  }}
                  className="reports-filter"
                  style={{ padding: "4px 8px" }}
                />
              </div>
            )}
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
        <div className="summary-cards-grid">
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

        {/* CHARTS ROW - Task Status Breakdown & Priority Distribution */}
        <div className="reports-charts-row">
          {/* Task Status Breakdown - Donut Chart */}
          <div className="reports-chart-card">
            <div className="reports-chart-header">
              <h3>Task Status Breakdown</h3>
            </div>
            <div className="reports-donut-section">
              {isLoading ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
              ) : (
                <DonutChart
                  segments={statusItems}
                  size={160}
                  strokeWidth={28}
                  totalLabel="Total Tasks"
                />
              )}
            </div>
          </div>

          {/* Priority Distribution - Horizontal Bar Chart */}
          <div className="reports-chart-card">
            <div className="reports-chart-header">
              <h3>Priority Distribution</h3>
            </div>
            <div className="reports-priority-section">
              {isLoading ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
              ) : (
                <PriorityBarChart
                  bars={priorityItems}
                  totalLabel="Total Tasks"
                />
              )}
            </div>
          </div>
        </div>

        {/* TEAMS CARDS - Admin/Manager only */}
        {isAdminOrManager && teams.length > 0 && (
          <div className="teams-carousel-section">
            <div className="teams-carousel-header">
              <h3>Teams Overview</h3>
              <div className="reports-section-search">
                <IoSearchOutline size={16} />
                <input
                  type="text"
                  placeholder="Search by team name or leader..."
                  value={teamSearch}
                  onChange={(e) => { setTeamSearch(e.target.value); setTeamSlide(0); }}
                />
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  onClick={() => setShowTeamExportModal(true)}
                  className="reports-export-btn"
                  style={{ background: "#4f46e5", borderColor: "#4f46e5", height: "36px", padding: "0 14px", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  Export Team Report <span>↓</span>
                </button>
                <button
                  onClick={() => navigate(rolePath("manage-team"))}
                  className="teams-view-all-btn"
                >
                  View All Teams
                </button>
              </div>
            </div>
            {isTeamsLoading ? (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
            ) : (
              <>
                <div ref={sliderRef} style={{ overflow: "hidden" }}>
                  <div style={{
                    display: "flex", gap: `${GAP}px`, transition: "transform 0.3s ease",
                    transform: `translateX(-${teamSlide * (cardWidth + GAP)}px)`,
                  }}>
                    {filteredTeams.map((team, index) => (
                      <div
                        key={team.id || index}
                        className="team-report-card"
                        style={{
                          minWidth: cardWidth > 0 ? `${cardWidth}px` : `calc((100% - ${(TEAMS_PER_VIEW - 1) * GAP}px) / ${TEAMS_PER_VIEW})`,
                          flex: cardWidth > 0 ? `0 0 ${cardWidth}px` : `0 0 calc((100% - ${(TEAMS_PER_VIEW - 1) * GAP}px) / ${TEAMS_PER_VIEW})`,
                        }}
                      >
                        <div className="team-card-top">
                          <div className="team-card-icon">
                            <MdGroup size={24} />
                          </div>
                          <div className="team-card-info">
                            <h4
                              className="team-card-name"
                              onClick={() => navigate(rolePath(`reports/team-members/${team.id}`))}
                            >
                              {team.name}
                            </h4>
                            <p className="team-card-leader">
                              {team.leader ? `Lead: ${team.leader.name}` : "No leader"}
                            </p>
                          </div>
                        </div>

                        <div className="team-card-stats">
                          <div className="team-card-stat">
                            <span className="team-card-stat-value">{team.member_count}</span>
                            <span className="team-card-stat-label">Members</span>
                          </div>
                          <div className="team-card-stat">
                            <span className="team-card-stat-value" style={{ color: "var(--color-primary-light)" }}>{team.assigned}</span>
                            <span className="team-card-stat-label">Tasks</span>
                          </div>
                          <div className="team-card-stat">
                            <span className="team-card-stat-value" style={{ color: "var(--color-success)" }}>{team.completed}</span>
                            <span className="team-card-stat-label">Done</span>
                          </div>
                          <div className="team-card-stat">
                            <span className="team-card-stat-value" style={{ color: "var(--color-danger)" }}>{team.overdue}</span>
                            <span className="team-card-stat-label">Overdue</span>
                          </div>
                        </div>

                        <div className="team-card-progress">
                          <div className="team-card-progress-header">
                            <span>Completion</span>
                            <span>{team.completion_rate}%</span>
                          </div>
                          <div className="team-card-progress-bar">
                            <div
                              className="team-card-progress-fill"
                              style={{ width: `${team.completion_rate}%` }}
                            />
                          </div>
                        </div>

                        <button
                          className="team-card-action-btn"
                          onClick={() => navigate(rolePath(`reports/team-members/${team.id}`))}
                        >
                          View Members
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 3L9 7L5 11" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                {filteredTeams.length > TEAMS_PER_VIEW && (
                  <div className="team-carousel-nav">
                    <button
                      onClick={() => setTeamSlide((s) => Math.max(0, s - 1))}
                      disabled={teamSlide === 0}
                      className="carousel-nav-btn"
                      style={{ color: teamSlide === 0 ? "var(--border-medium)" : "var(--text-dark)", cursor: teamSlide === 0 ? "default" : "pointer" }}
                    >
                      &lt;
                    </button>
                    <div className="carousel-dots">
                      {Array.from({ length: totalTeamSlides + 1 }).map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setTeamSlide(i)}
                          className="carousel-dot"
                          style={{
                            width: i === teamSlide ? "28px" : "10px",
                            background: i === teamSlide ? "var(--text-dark)" : "var(--border-medium)",
                          }}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => setTeamSlide((s) => Math.min(totalTeamSlides, s + 1))}
                      disabled={teamSlide >= totalTeamSlides}
                      className="carousel-nav-btn"
                      style={{ color: teamSlide >= totalTeamSlides ? "var(--border-medium)" : "var(--text-dark)", cursor: teamSlide >= totalTeamSlides ? "default" : "pointer" }}
                    >
                      &gt;
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* TABLE - Admin, Manager & Team Lead (on team members view) */}
        {showUserTable && (
          <>
            <div className="reports-table-section-header">
              <h3>User Performance</h3>
              <div className="reports-section-search">
                <IoSearchOutline size={16} />
                <input
                  type="text"
                  placeholder="Search by user name or role..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>
            </div>
            {/* Desktop Table */}
            <div className="reports-table-wrapper">
              <div className="reports-table">
                <div className="table-header">
                  <span className="th-member">User</span>
                  <span className="th-stat">Assigned</span>
                  <span className="th-stat">Approved</span>
                  <span className="th-stat">Pending</span>
                  <span className="th-tasks">Overdue</span>
                  <span className="th-action">Action</span>
                </div>

                {isTableLoading ? (
                  <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
                ) : (paginatedUsers || []).length === 0 ? (
                  <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)" }}>No data available</div>
                ) : (
                  (paginatedUsers || []).map((member) => (
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

            {/* Mobile Card Layout */}
            <div className="reports-table-cards">
              {isTableLoading ? (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
              ) : (paginatedUsers || []).length === 0 ? (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)" }}>No data available</div>
              ) : (
                (paginatedUsers || []).map((member) => (
                  <div key={member.id} className="report-member-card">
                    <div className="report-member-card-header">
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
                    <div className="report-member-stats">
                      <div className="report-member-stat">
                        <span className="report-member-stat-label">Assigned</span>
                        <span className="stat-badge assigned">{member.assigned}</span>
                      </div>
                      <div className="report-member-stat">
                        <span className="report-member-stat-label">Approved</span>
                        <span className="stat-badge completed">{member.completed}</span>
                      </div>
                      <div className="report-member-stat">
                        <span className="report-member-stat-label">Pending</span>
                        <span className="stat-badge pending">{member.pending}</span>
                      </div>
                      <div className="report-member-stat">
                        <span className="report-member-stat-label">Overdue</span>
                        <span className="stat-badge overdue">{member.overdue}</span>
                      </div>
                    </div>
                    <div className="report-member-card-actions">
                      <button
                        className="table-action-btn"
                        onClick={() => navigate(rolePath(`reports/user-performance/${member.id}`))}
                      >
                        View Profile
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 3L9 7L5 11" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <Pagination
              currentPage={userPage}
              totalPages={userTotalPages}
              onPageChange={setUserPage}
              itemsPerPage={userItemsPerPage}
              onItemsPerPageChange={(newVal) => { setUserItemsPerPage(newVal); setUserPage(1); }}
            />
          </>
        )}

      </div>

      <CompanyEmployeeReport isOpen={showCompanyReport} onClose={() => setShowCompanyReport(false)} />
      <TeamExportReport isOpen={showTeamExportModal} onClose={() => setShowTeamExportModal(false)} team={{ id: "all", name: "All Teams" }} />
    </DashboardLayout>
  );
}

export default Reports;
