import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { IoSearchOutline } from "react-icons/io5";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import TeamExportReport from "./TeamExportReport";
import DonutChart from "../components/DonutChart";
import PriorityBarChart from "../components/PriorityBarChart";
import { getUser, rolePath } from "../utils/auth";
import { useApiQuery } from "../hooks/useApi";
import "../pages/UserPerformance.css";
import "../components/Charts.css";

const ROLE_LABEL = { admin: "Admin", manager: "Manager", team_lead: "Team Lead", member: "Member", guest: "Guest" };

function TeamMembersReport() {
  const { t } = useTranslation();
  const { teamId } = useParams();
  const navigate = useNavigate();
  const stored = getUser();
  const currentRole = stored?.role || "member";
  const isAdminOrManager = currentRole === "admin" || currentRole === "manager";
  const isTeamLead = currentRole === "team_lead" || currentRole === "teamlead";
  const canExport = isAdminOrManager || isTeamLead;

  const [showExportModal, setShowExportModal] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");

  const { data: teamsData, isLoading } = useApiQuery(
    ["report-teams-overview"],
    "/reports/teams-overview",
    null,
    { staleTime: 60000, refetchOnMount: true }
  );

  const team = Array.isArray(teamsData) ? teamsData.find((tItem) => String(tItem.id) === String(teamId)) : null;
  const members = team?.members || [];

  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const q = memberSearch.toLowerCase();
    return members.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        (ROLE_LABEL[m.role] || m.role || "").toLowerCase().includes(q)
    );
  }, [members, memberSearch]);

  const totalAssigned = useMemo(() => members.reduce((s, m) => s + (m.assigned || 0), 0), [members]);
  const totalCompleted = useMemo(() => members.reduce((s, m) => s + (m.completed || 0), 0), [members]);
  const totalPending = useMemo(() => members.reduce((s, m) => s + (m.pending || 0), 0), [members]);
  const totalOverdue = useMemo(() => members.reduce((s, m) => s + (m.overdue || 0), 0), [members]);

  const statusBreakdown = team?.status_breakdown || {};
  const priorityDistribution = team?.priority_distribution || {};

  const breakdownItems = useMemo(() => {
    const total = totalAssigned || 1;
    return [
      { label: t("Completed", { defaultValue: "Completed" }), count: statusBreakdown.completed || 0, color: "#10b981" },
      { label: t("Pending", { defaultValue: "Pending" }), count: statusBreakdown.pending || 0, color: "#f59e0b" },
      { label: t("In Review", { defaultValue: "In Review" }), count: (statusBreakdown.submitted || 0) + (statusBreakdown.reopened || 0), color: "var(--color-primary)" },
      { label: t("Overdue", { defaultValue: "Overdue" }), count: statusBreakdown.overdue || totalOverdue, color: "#ef4444" },
    ].map((item) => ({
      ...item,
      percent: total > 0 ? Math.round((item.count / total) * 1000) / 10 : 0,
    }));
  }, [statusBreakdown, totalAssigned, totalOverdue, t]);

  const priorityItems = useMemo(() => {
    const high = priorityDistribution.high || 0;
    const medium = priorityDistribution.medium || 0;
    const low = priorityDistribution.low || 0;
    const total = high + medium + low;
    return {
      bars: [
        { label: t("High", { defaultValue: "High" }), count: high, color: "#ef4444" },
        { label: t("Medium", { defaultValue: "Medium" }), count: medium, color: "#f59e0b" },
        { label: t("Low", { defaultValue: "Low" }), count: low, color: "#10b981" },
      ],
      total,
    };
  }, [priorityDistribution, t]);

  const breadcrumbs = [
    { label: t("Reports", { defaultValue: "Reports" }), path: rolePath("reports") },
    { label: team?.name || t("Team Members", { defaultValue: "Team Members" }) },
  ];

  const cardMeta = [
    { key: "assigned", title: t("Total Assigned", { defaultValue: "Total Assigned" }), value: totalAssigned, icon: "/Vector-5.svg", valueColor: "#6366f1", bgColor: "#EEF2FF", sub: t("All tasks assigned", { defaultValue: "All tasks assigned" }) },
    { key: "completed", title: t("Completed", { defaultValue: "Completed" }), value: totalCompleted, icon: "/Vector-2.svg", valueColor: "#22C55E", bgColor: "#ECFDF5", sub: t("Tasks completed", { defaultValue: "Tasks completed" }) },
    { key: "pending", title: t("Pending", { defaultValue: "Pending" }), value: totalPending, icon: "/Vector-1 (3).svg", valueColor: "#F59E0B", bgColor: "#FEF3C7", sub: t("In progress", { defaultValue: "In progress" }) },
    { key: "overdue", title: t("Overdue", { defaultValue: "Overdue" }), value: totalOverdue, icon: "/Vector-3.svg", valueColor: "#EF4444", bgColor: "#FEF2F2", sub: t("Require attention", { defaultValue: "Require attention" }) },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="up-layout">
        <div className="up-main">

          {/* TEAM PROFILE HEADER */}
          <div className="up-profile-header" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div className="up-avatar" style={{ background: "var(--color-primary-bg)", flexShrink: 0 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: "var(--text-heading)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isLoading ? t("Loading...", { defaultValue: "Loading..." }) : team?.name || t("Team", { defaultValue: "Team" })}</h1>
              {canExport && (
                <button
                  className="up-export-btn"
                  style={{
                    flexShrink: 0,
                    background: "var(--color-primary, #4f46e5)",
                    color: "#ffffff",
                    fontWeight: 700,
                    padding: "10px 18px",
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 2px 8px rgba(79, 70, 229, 0.25)",
                    cursor: "pointer"
                  }}
                  onClick={() => setShowExportModal(true)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v8M4 6l4 4 4-4M2 14h12" />
                  </svg>
                  {t("Export Team Report", { defaultValue: "Export Team Report" })}
                </button>
              )}
            </div>
            <p className="up-role" style={{ margin: 0, paddingLeft: 80,fontSize: 16, fontWeight: 800 }}>{t("{{count}} members", { count: members.length, defaultValue: `${members.length} members` })}{team?.leader ? ` \u2022 ${t("Lead: {{name}}", { name: team.leader.name, defaultValue: `Lead: ${team.leader.name}` })}` : ""}</p>
            {team?.description && (
              <div style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", margin: 0, paddingLeft: 80 }} className="rte-display" dangerouslySetInnerHTML={{ __html: team.description }} />
            )}
          </div>

          {/* SUMMARY CARDS */}
          <div className="up-summary">
            {cardMeta.map((c) => (
              <div key={c.key} className="up-summary-card">
                <div className="up-summary-top">
                  <div className="up-summary-icon" style={{ background: c.bgColor }}>
                    <img src={c.icon} alt="" />
                  </div>
                  <div>
                    <p className="up-summary-title">{c.title}</p>
                    <div className="up-summary-value" style={{ color: c.valueColor }}>{c.value}</div>
                    <p className="up-summary-label">{c.sub}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* CHARTS ROW - Task Status Breakdown & Priority Distribution */}
          <div className="up-charts-row">
            {/* Task Status Breakdown - Donut Chart */}
            <div className="up-chart-card">
              <div className="up-chart-header">
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-heading)" }}>{t("Task Status Breakdown", { defaultValue: "Task Status Breakdown" })}</h3>
              </div>
              <div className="up-donut-section">
                <DonutChart
                  segments={breakdownItems}
                  size={160}
                  strokeWidth={28}
                  totalLabel={t("Total Tasks", { defaultValue: "Total Tasks" })}
                />
              </div>
            </div>

            {/* Priority Distribution - Horizontal Bar Chart */}
            <div className="up-chart-card">
              <div className="up-chart-header">
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-heading)" }}>{t("Priority Distribution", { defaultValue: "Priority Distribution" })}</h3>
              </div>
              <div className="up-priority-section">
                <PriorityBarChart
                  bars={priorityItems.bars}
                  totalLabel={t("Total Tasks", { defaultValue: "Total Tasks" })}
                />
              </div>
            </div>
          </div>

          {/* MEMBERS TABLE */}
          <div className="up-chart-card" style={{ marginTop: 0 }}>
            <div className="up-chart-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-heading)" }}>{t("Member Performance", { defaultValue: "Member Performance" })}</h3>
              <div className="reports-section-search">
                <IoSearchOutline size={16} />
                <input
                  type="text"
                  placeholder={t("Search by member name or role...", { defaultValue: "Search by member name or role..." })}
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
              </div>
            </div>

            {isLoading ? (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>{t("Loading...", { defaultValue: "Loading..." })}</div>
            ) : filteredMembers.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>{memberSearch ? t("No matching members found.", { defaultValue: "No matching members found." }) : t("No members in this team.", { defaultValue: "No members in this team." })}</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border-color)" }}>
                      <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)", fontSize: 13 }}>#</th>
                      <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)", fontSize: 13 }}>{t("Member", { defaultValue: "Member" })}</th>
                      <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)", fontSize: 13 }}>{t("Role", { defaultValue: "Role" })}</th>
                      <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, color: "var(--text-secondary)", fontSize: 13 }}>{t("Assigned", { defaultValue: "Assigned" })}</th>
                      <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, color: "var(--text-secondary)", fontSize: 13 }}>{t("Completed", { defaultValue: "Completed" })}</th>
                      <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, color: "var(--text-secondary)", fontSize: 13 }}>{t("Pending", { defaultValue: "Pending" })}</th>
                      <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, color: "var(--text-secondary)", fontSize: 13 }}>{t("Overdue", { defaultValue: "Overdue" })}</th>
                      <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, color: "var(--text-secondary)", fontSize: 13 }}>{t("Rate", { defaultValue: "Rate" })}</th>
                      <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, color: "var(--text-secondary)", fontSize: 13 }}>{t("Action", { defaultValue: "Action" })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.map((member, idx) => {
                      const rate = member.assigned > 0 ? Math.round((member.completed / member.assigned) * 100) : 0;
                      const rateColor = rate >= 80 ? "#22c55e" : rate >= 50 ? "#f59e0b" : "#ef4444";
                      return (
                        <tr key={member.id} style={{ borderBottom: "1px solid var(--border-light)", background: idx % 2 ? "var(--bg-hover)" : "var(--bg-card)" }}>
                          <td style={{ padding: "14px 16px", color: "var(--text-secondary)" }}>{idx + 1}</td>
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <div style={{
                                width: 36, height: 36, borderRadius: "50%",
                                background: ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"][idx % 7],
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0
                              }}>
                                {member.name ? member.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) : "?"}
                              </div>
                              <span style={{ fontWeight: 600, color: "var(--text-heading)" }}>{member.name}</span>
                            </div>
                          </td>
                          <td style={{ padding: "14px 16px", color: "var(--text-secondary)" }}>{ROLE_LABEL[member.role] ? t(ROLE_LABEL[member.role], { defaultValue: ROLE_LABEL[member.role] }) : member.role}</td>
                          <td style={{ padding: "14px 16px", textAlign: "center", fontWeight: 600, color: "var(--color-primary)" }}>{member.assigned ?? 0}</td>
                          <td style={{ padding: "14px 16px", textAlign: "center", fontWeight: 600, color: "#22c55e" }}>{member.completed ?? 0}</td>
                          <td style={{ padding: "14px 16px", textAlign: "center", fontWeight: 600, color: "#f59e0b" }}>{member.pending ?? 0}</td>
                          <td style={{ padding: "14px 16px", textAlign: "center", fontWeight: 600, color: "#ef4444" }}>{member.overdue ?? 0}</td>
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                              <div style={{ width: 60, height: 6, borderRadius: 3, background: "var(--border-color)", overflow: "hidden" }}>
                                <div style={{ width: `${rate}%`, height: "100%", borderRadius: 3, background: rateColor }}></div>
                              </div>
                              <span style={{ fontWeight: 600, fontSize: 13, color: rateColor, minWidth: 32 }}>{rate}%</span>
                            </div>
                          </td>
                          <td style={{ padding: "14px 16px", textAlign: "center" }}>
                            <button
                              style={{
                                padding: "6px 14px", border: "1px solid var(--border-color)", borderRadius: 8,
                                background: "var(--bg-card)", color: "var(--color-primary)", fontWeight: 600, fontSize: 13,
                                cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4
                              }}
                              onClick={() => navigate(rolePath(`reports/user-performance/${member.id}`), {
                                state: { fromTeam: team?.name, teamId: team?.id }
                              })}
                            >
                              {t("Profile", { defaultValue: "Profile" })}
                              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 3L9 7L5 11" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>

      <TeamExportReport
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        team={team || { id: "all", name: t("Team Members", { defaultValue: "Team Members" }) }}
      />
    </DashboardLayout>
  );
}

export default TeamMembersReport;
