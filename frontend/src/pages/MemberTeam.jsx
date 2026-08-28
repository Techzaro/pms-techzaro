/**
 * MemberTeam.jsx — Read-Only Team View for Members
 *
 * Displays the team(s) the authenticated user belongs to.
 * Features:
 * - Team name, description, lead, creation date, member count
 * - Team members list with role badges (Team Lead highlighted)
 * - Empty state when not assigned to any team
 * - Auto-refreshes via real-time events
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MdPeople, MdCalendarToday, MdGroup, MdEmail, MdInfoOutline, MdSearch } from "react-icons/md";
import { Crown, Clock } from "lucide-react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { authToken, rolePath, getUser } from "../utils/auth";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import TeamWorkingHoursModal from "../components/TeamWorkingHoursModal";
import API_URL from "../config/api";
import "./MemberTeam.css";

const AVATAR_COLORS = [
  "#f59e0b", "#3b82f6", "#10b981", "#ef4444",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

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

function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function MemberTeam() {
  const { t } = useTranslation();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [workingHoursModalOpen, setWorkingHoursModalOpen] = useState(false);
  const [selectedTeamForHours, setSelectedTeamForHours] = useState(null);

  const fetchTeams = async () => {
    const token = authToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/my-team`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTeams(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTeams(); }, []);
  useAutoRefresh(fetchTeams, { events: ["team_created", "team_updated", "team_deleted", "team_leader_changed", "team_member_added", "team_member_removed", "data:changed"] });

  const breadcrumbs = [
    { label: t("Dashboard", { defaultValue: "Dashboard" }), path: rolePath("dashboard") },
    { label: t("Teams", { defaultValue: "Teams" }) },
  ];

  return (
    <DashboardLayout>
      <div className="mt-page">
        <Breadcrumb items={breadcrumbs} />

        <div className="mt-header">
          <div className="mt-header-left">
            <h1 className="mt-title">{t("My Team", { defaultValue: "My Team" })}</h1>
            <p className="mt-subtitle">{t("View your assigned team information", { defaultValue: "View your assigned team information" })}</p>
          </div>
          {!loading && teams.length > 0 && (
            <div className="mt-search-bar">
              <MdSearch size={16} className="mt-search-icon" />
              <input
                type="text"
                className="mt-search-input"
                placeholder={t("Search by member name or email...", { defaultValue: "Search by member name or email..." })}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
        </div>

        {loading ? (
          <div className="mt-card" style={{ padding: 40, textAlign: "center" }}>
            <p style={{ color: "#94a3b8", margin: 0 }}>{t("Loading team information...", { defaultValue: "Loading team information..." })}</p>
          </div>
        ) : teams.length === 0 ? (
          <div className="mt-card mt-empty">
            <MdInfoOutline size={48} className="mt-empty-icon" />
            <p>{t("You are not currently assigned to any team.", { defaultValue: "You are not currently assigned to any team." })}</p>
            <p style={{ fontSize: 14, color: "#94a3b8", marginTop: 8 }}>
              {t("Please contact your Manager or Administrator for more information.", { defaultValue: "Please contact your Manager or Administrator for more information." })}
            </p>
          </div>
        ) : (
          <div className="mt-team-list">
            {teams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                search={search}
                onOpenHours={(t) => {
                  setSelectedTeamForHours(t);
                  setWorkingHoursModalOpen(true);
                }}
              />
            )).filter(Boolean)}
          </div>
        )}
      </div>

      <TeamWorkingHoursModal
        isOpen={workingHoursModalOpen}
        onClose={() => {
          setWorkingHoursModalOpen(false);
          setSelectedTeamForHours(null);
        }}
        team={selectedTeamForHours}
        onSaved={() => fetchTeams()}
      />
    </DashboardLayout>
  );
}

function TeamCard({ team, search, onOpenHours }) {
  const { t } = useTranslation();
  const leader = team.leader;
  const members = team.members || [];
  const q = (search || "").toLowerCase().trim();
  const authUser = getUser();
  const isTeamLead = leader && Number(leader.id) === Number(authUser?.id);

  const teamNameMatch = q && team.name.toLowerCase().includes(q);

  const memberNameMatch = q && members.some((m) => {
    const haystack = [m.name, m.professional_email].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(q);
  });

  if (q && !teamNameMatch && !memberNameMatch) return null;

  const filteredMembers = q
    ? members.filter((m) => {
        const haystack = [m.name, m.professional_email].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(q);
      })
    : members;

  const displayMembers = q
    ? (teamNameMatch ? members : filteredMembers)
    : members;

  const sortedMembers = [...displayMembers].sort((a, b) => {
    const aIsLeader = leader && Number(a.id) === Number(leader.id);
    const bIsLeader = leader && Number(b.id) === Number(leader.id);
    if (aIsLeader && !bIsLeader) return -1;
    if (!aIsLeader && bIsLeader) return 1;
    return 0;
  });

  if (q && sortedMembers.length === 0) return null;

  return (
    <div className="mt-card">
      {/* Card Top */}
      <div className="mt-card-top">
        <div className="mt-card-identity">
          <MdPeople size={22} className="mt-team-icon-inline" />
          <div>
            <h2 className="mt-team-name">{team.name}</h2>
            <span className="mt-member-count">{t("{{current}} of {{total}} members", { current: q ? sortedMembers.length : members.length, total: members.length, defaultValue: `${q ? sortedMembers.length : members.length} of ${members.length} members` })}</span>
          </div>
        </div>

        {isTeamLead && (
          <button
            type="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 14px",
              borderRadius: "8px",
              background: "var(--color-primary-bg, rgba(79, 70, 229, 0.1))",
              color: "var(--color-primary, #4f46e5)",
              border: "1px solid var(--color-primary, #4f46e5)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              marginLeft: "auto",
            }}
            onClick={() => onOpenHours && onOpenHours(team)}
          >
            <Clock size={14} />
            {t("Set Working Hours", { defaultValue: "Set Working Hours" })}
          </button>
        )}
      </div>

      {/* Description */}
      {team.description && (
        <div className="mt-section">
          <span className="mt-section-label">{t("Description", { defaultValue: "Description" })}</span>
          <div className="mt-team-desc rte-display" dangerouslySetInnerHTML={{ __html: team.description }} />
        </div>
      )}

      {/* Info Row: Lead + Created Date */}
      <div className="mt-info-row">
        <div className="mt-info-inline">
          <span className="mt-info-label">{t("Team Lead", { defaultValue: "Team Lead" })}</span>
          {leader ? (
            <>
              <Crown size={16} className="mt-crown-icon" />
              <span className="mt-info-value">{leader.name}</span>
            </>
          ) : (
            <span className="mt-info-value mt-no-data">{t("Not assigned", { defaultValue: "Not assigned" })}</span>
          )}
          <span className="mt-info-sep">|</span>
          <span className="mt-info-label">{t("Created", { defaultValue: "Created" })}</span>
          <MdCalendarToday size={16} style={{ color: "#64748b", flexShrink: 0 }} />
          <span className="mt-info-value">{formatDate(team.created_at)}</span>
        </div>
      </div>

      {/* Members Section */}
      <div className="mt-section">
        <span className="mt-section-label">{t("Team Members", { defaultValue: "Team Members" })}</span>
        {sortedMembers.length === 0 ? (
          <p className="mt-no-data">{q ? t("No members match your search", { defaultValue: "No members match your search" }) : t("No members assigned", { defaultValue: "No members assigned" })}</p>
        ) : (
          <div className="mt-members-grid">
            {sortedMembers.map((member) => {
              const isLeader = leader && Number(member.id) === Number(leader.id);
              return (
                <div key={member.id} className={`mt-member-card ${isLeader ? "mt-member-card--leader" : ""}`}>
                  <div className="mt-member-card-header">
                    <div
                      className="mt-avatar"
                      style={{ background: getAvatarColor(member.name) }}
                    >
                      {getInitials(member.name)}
                    </div>
                    <div className="mt-member-info">
                      <span className="mt-member-name">{member.name}</span>
                      {isLeader ? (
                        <span className="mt-lead-badge">
                          <Crown size={12} />
                          {t("Team Lead", { defaultValue: "Team Lead" })}
                        </span>
                      ) : member.role ? (
                        <span className="mt-role-badge">{member.role.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-member-details">
                    {isLeader ? (
                      <span className="mt-member-detail">
                        <span className="mt-detail-label">{t("Designation:", { defaultValue: "Designation:" })}</span> {t("Team Lead", { defaultValue: "Team Lead" })}
                      </span>
                    ) : member.designation ? (
                      <span className="mt-member-detail">
                        <span className="mt-detail-label">{t("Designation:", { defaultValue: "Designation:" })}</span> {member.designation}
                      </span>
                    ) : null}
                    {member.department && (
                      <span className="mt-member-detail">
                        <span className="mt-detail-label">{t("Dept:", { defaultValue: "Dept:" })}</span> {member.department}
                      </span>
                    )}
                    {member.professional_email && (
                      <span className="mt-member-detail mt-member-email">
                        <MdEmail size={14} />
                        {member.professional_email}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default MemberTeam;
