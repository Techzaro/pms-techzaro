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
import { MdPeople, MdCalendarToday, MdGroup, MdEmail, MdInfoOutline } from "react-icons/md";
import { Crown } from "lucide-react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { authToken, rolePath } from "../utils/auth";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
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
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);

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
  useRefreshOnEvent(["team_created", "team_updated", "team_deleted", "team_leader_changed", "team_member_added", "team_member_removed"], fetchTeams);

  const breadcrumbs = [
    { label: "Dashboard", path: rolePath("dashboard") },
    { label: "Team" },
  ];

  return (
    <DashboardLayout>
      <div className="mt-page">
        <Breadcrumb items={breadcrumbs} />

        <div className="mt-header">
          <div className="mt-header-left">
            <h1 className="mt-title">My Team</h1>
            <p className="mt-subtitle">View your assigned team information</p>
          </div>
        </div>

        {loading ? (
          <div className="mt-card" style={{ padding: 40, textAlign: "center" }}>
            <p style={{ color: "#94a3b8", margin: 0 }}>Loading team information...</p>
          </div>
        ) : teams.length === 0 ? (
          <div className="mt-card mt-empty">
            <MdInfoOutline size={48} className="mt-empty-icon" />
            <p>You are not currently assigned to any team.</p>
            <p style={{ fontSize: 14, color: "#94a3b8", marginTop: 8 }}>
              Please contact your Manager or Administrator for more information.
            </p>
          </div>
        ) : (
          <div className="mt-team-list">
            {teams.map((team) => (
              <TeamCard key={team.id} team={team} currentUserId={null} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function TeamCard({ team }) {
  const leader = team.leader;
  const members = team.members || [];
  const memberCount = members.length;

  return (
    <div className="mt-card">
      {/* Card Top */}
      <div className="mt-card-top">
        <div className="mt-card-identity">
          <div className="mt-team-icon">
            <MdPeople size={22} />
          </div>
          <div>
            <h2 className="mt-team-name">{team.name}</h2>
            <span className="mt-member-count">{memberCount} member{memberCount !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>

      {/* Description */}
      {team.description && (
        <div className="mt-section">
          <span className="mt-section-label">Description</span>
          <p className="mt-team-desc">{team.description}</p>
        </div>
      )}

      {/* Info Row: Lead + Created Date */}
      <div className="mt-info-row">
        <div className="mt-section">
          <span className="mt-section-label">Team Lead</span>
          {leader ? (
            <div className="mt-lead-chip">
              <Crown size={16} className="mt-crown-icon" />
              <span>{leader.name}</span>
            </div>
          ) : (
            <p className="mt-no-data">Not assigned</p>
          )}
        </div>
        <div className="mt-section">
          <span className="mt-section-label">Created</span>
          <div className="mt-date-chip">
            <MdCalendarToday size={16} style={{ color: "#64748b", flexShrink: 0 }} />
            <span>{formatDate(team.created_at)}</span>
          </div>
        </div>
      </div>

      {/* Members Section */}
      <div className="mt-section">
        <span className="mt-section-label">Team Members</span>
        {memberCount === 0 ? (
          <p className="mt-no-data">No members assigned</p>
        ) : (
          <div className="mt-members-grid">
            {members.map((member) => {
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
                      {isLeader && (
                        <span className="mt-lead-badge">
                          <Crown size={12} />
                          Team Lead
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-member-details">
                    {member.designation && (
                      <span className="mt-member-detail">
                        <span className="mt-detail-label">Role:</span> {member.designation}
                      </span>
                    )}
                    {member.department && (
                      <span className="mt-member-detail">
                        <span className="mt-detail-label">Dept:</span> {member.department}
                      </span>
                    )}
                    {member.email && (
                      <span className="mt-member-detail mt-member-email">
                        <MdEmail size={14} />
                        {member.email}
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
