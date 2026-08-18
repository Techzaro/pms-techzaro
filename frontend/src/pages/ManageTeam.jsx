/**
 * ManageTeam.jsx — Team Management Page
 *
 * Admin/manager page for creating, editing, and managing teams.
 * Features:
 * - Create new teams with name, description, and member selection
 * - Edit existing teams (update name, description, members)
 * - Delete teams with confirmation
 * - Add/remove members from teams
 * - Set team leader (requires team_lead role)
 * - Create project for a specific team
 * - Search and sort teams
 * - Paginated team list
 *
 * Access restricted to admin and manager roles.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Crown } from "lucide-react";
import TeamExportReport from "./TeamExportReport";
import {
  MdAdd,
  MdDelete,
  MdEdit,
  MdPeople,
  MdSearch,
  MdExpandMore,
  MdGroup,
  MdPersonAdd,
  MdCreateNewFolder,
  MdCalendarToday,
} from "react-icons/md";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import ConfirmModal from "../components/ConfirmModal";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import { authToken, getCurrentRole, rolePath } from "../utils/auth";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import API_URL from "../config/api";
import Pagination from "../components/Pagination";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage } from "../utils/notify";
import { useSubmit } from "../hooks/useSubmit";
import LoadingButton from "../components/LoadingButton";
import RichTextEditor from "../components/RichTextEditor";
import "./ManageTeam.css";

/** Color palette for user avatar backgrounds */
const AVATAR_COLORS = [
  "#f59e0b",
  "#3b82f6",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
];

function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Extracts up to 2 initials from a name */
function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Returns a deterministic avatar color based on the name hash */
function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * ManageTeam — Main team management page component.
 * Handles CRUD operations for teams, member management, and leader assignment.
 */
function ManageTeam() {
  const notify = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();

  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortOption, setSortOption] = useState("newest");
  const [selectedTeamFilter, setSelectedTeamFilter] = useState(searchParams.get("selectedTeam") || "");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [addMemberTeamId, setAddMemberTeamId] = useState(null);

  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [selectedLeaderId, setSelectedLeaderId] = useState(null);

  const [selectedUserIds, setSelectedUserIds] = useState([]);

  const [isMemberDropdownOpen, setIsMemberDropdownOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [mtMemberSearch, setMtMemberSearch] = useState("");
  const [mtUserSearch, setMtUserSearch] = useState("");
  const [memberHighlightedIndex, setMemberHighlightedIndex] = useState(0);
  const [userHighlightedIndex, setUserHighlightedIndex] = useState(0);
  const mtMemberListRef = useRef(null);
  const mtUserListRef = useRef(null);

  const [deleteTeamConfirmOpen, setDeleteTeamConfirmOpen] = useState(false);
  const [showTeamExportModal, setShowTeamExportModal] = useState(false);
  const [deleteTeamId, setDeleteTeamId] = useState(null);
  const [leaderConfirmOpen, setLeaderConfirmOpen] = useState(false);
  const [leaderConfirmData, setLeaderConfirmData] = useState({ teamId: null, memberId: null, memberName: "" });
  const [removeMemberConfirmOpen, setRemoveMemberConfirmOpen] = useState(false);
  const [removeMemberData, setRemoveMemberData] = useState({ teamId: null, memberId: null, memberName: "" });
  const [editTeamId, setEditTeamId] = useState(null);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const navigate = useNavigate();
  const { submitting, run } = useSubmit();

  // ✅ Define fetchUsers first
  // Fetch all users for member selection dropdowns
  const fetchUsers = async () => {
    const token = authToken();
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/team-users`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
        _notifHandled: true,
      });
      const data = await response.json();
      setUsers(Array.isArray(data) ? data : (data.users || []));
    } catch (error) {
      console.error("Failed to load users", error);
      setUsers([]);
      notify.error("Unable to load users.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Define fetchTeams BEFORE the useEffect that uses it
  // Fetch all teams with their members and leader info
  const fetchTeams = async () => {
    const token = authToken();
    if (!token) return;
    try {
      let url = `${API_URL}/teams`;
      const queryParams = [];
      if (timeFilter && timeFilter !== "custom") {
        queryParams.push(`days=${timeFilter}`);
      } else if (timeFilter === "custom" && startDate && endDate) {
        queryParams.push(`start_date=${startDate}`, `end_date=${endDate}`);
      }
      if (queryParams.length > 0) {
        url += `?${queryParams.join("&")}`;
      }
      const response = await fetch(url, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      const data = await response.json();
      setTeams(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load teams", error);
    }
  };

  // ✅ Now useEffect can safely call fetchTeams and fetchUsers
  // Verify user has admin/manager role, then fetch initial data
  useEffect(() => {
    const role = getCurrentRole();
    const token = authToken();
    if (!token || (role !== "admin" && role !== "manager")) {
      navigate("/");
      return;
    }
    Promise.all([fetchUsers(), fetchTeams()]);
  }, []);

  // Auto-refresh teams when data changes elsewhere in the app
  useAutoRefresh(fetchTeams, { events: ["data:changed"] });

  // Sync selectedTeam from URL search params
  useEffect(() => {
    const teamId = searchParams.get("selectedTeam");
    if (teamId) {
      setSelectedTeamFilter(teamId);
    }
  }, [searchParams]);

  useEffect(() => { setMemberHighlightedIndex(0); }, [isMemberDropdownOpen, mtMemberSearch]);
  useEffect(() => { setUserHighlightedIndex(0); }, [isUserDropdownOpen, mtUserSearch]);
  useEffect(() => {
    if (isMemberDropdownOpen && mtMemberListRef.current) {
      const el = mtMemberListRef.current.children[memberHighlightedIndex];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [memberHighlightedIndex, isMemberDropdownOpen]);
  useEffect(() => {
    if (isUserDropdownOpen && mtUserListRef.current) {
      const el = mtUserListRef.current.children[userHighlightedIndex];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [userHighlightedIndex, isUserDropdownOpen]);

  // ... rest of the functions (handleSetLeader, handleRemoveMember, etc.)

  const handleSetLeader = async (teamId, memberId) => {
    const member = teams.flatMap(t => t.members).find(m => Number(m.id) === Number(memberId));

    const memberRole = member?.role === 'teamlead' ? 'team_lead' : member?.role;
    if (memberRole !== 'team_lead') {
      notify.error(`"${member?.name || 'This user'}" cannot be assigned as Team Lead. First update this user's role to "Team Lead" from Edit User, then you can assign them as Team Lead.`);
      return;
    }

    setLeaderConfirmData({ teamId, memberId, memberName: member?.name || "this member" });
    setLeaderConfirmOpen(true);
  };

  // Confirm and execute leader assignment via API
  const confirmSetLeader = async () => {
    const { teamId, memberId } = leaderConfirmData;
    setLeaderConfirmOpen(false);
    setLeaderConfirmData({ teamId: null, memberId: null, memberName: "" });
    await run(async () => {
      const token = authToken();
      const response = await fetch(`${API_URL}/teams/${teamId}/leader`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ leader_id: memberId }),
        _notifHandled: true,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not update team leader.");
      await fetchTeams();
      showSuccessMessage("Team leader", "updated");
    });
  };

  // Remove a member from a team after confirmation
  const handleRemoveMember = async (teamId, memberId) => {
    const member = teams.flatMap(t => t.members).find(m => Number(m.id) === Number(memberId));
    setRemoveMemberData({ teamId, memberId, memberName: member?.name || "this member" });
    setRemoveMemberConfirmOpen(true);
  };

  // Confirm and execute member removal via API
  const confirmRemoveMember = async () => {
    const { teamId, memberId } = removeMemberData;
    setRemoveMemberConfirmOpen(false);
    setRemoveMemberData({ teamId: null, memberId: null, memberName: "" });
    await run(async () => {
      const token = authToken();
      const response = await fetch(`${API_URL}/teams/${teamId}/members/${memberId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not remove member.");
      await fetchTeams();
      showSuccessMessage("Member", "removed from team");
    });
  };

  // Delete a team after confirmation
  const handleDeleteTeam = async (teamId) => {
    setDeleteTeamId(teamId);
    setDeleteTeamConfirmOpen(true);
  };

  // Confirm and execute team deletion via API
  const confirmDeleteTeam = async () => {
    const teamId = deleteTeamId;
    setDeleteTeamConfirmOpen(false);
    setDeleteTeamId(null);
    await run(async () => {
      const token = authToken();
      const response = await fetch(`${API_URL}/teams/${teamId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not delete team.");
      await fetchTeams();
      showSuccessMessage("Team", "deleted");
    });
  };

  const handleProjectForTeam = (teamId) => {
    navigate(rolePath(`create-project?teamId=${teamId}`));
  };

  const openCreateTeamModal = () => {
    setAddMemberTeamId(null);
    setEditTeamId(null);
    setTeamName("");
    setTeamDescription("");
    setSelectedMemberIds([]);
    setSelectedLeaderId(null);
    setIsMemberDropdownOpen(false);
    setIsUserDropdownOpen(false);
    setIsModalOpen(true);
  };

  const openAddMemberModal = (teamId) => {
    setAddMemberTeamId(teamId);
    setSelectedUserIds([]);
    setIsMemberDropdownOpen(false);
    setIsUserDropdownOpen(false);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setAddMemberTeamId(null);
    setEditTeamId(null);
    setTeamName("");
    setTeamDescription("");
    setSelectedMemberIds([]);
    setSelectedLeaderId(null);
    setSelectedUserIds([]);
    setIsMemberDropdownOpen(false);
    setIsUserDropdownOpen(false);
  };

  const { isDirty: teamIsDirty, setIsDirty: setTeamIsDirty, handleClose: handleTeamClose, ConfirmDialog: TeamConfirmDialog } = useConfirmOnClose(closeModal);
  useEscapeKey(isModalOpen, handleTeamClose);

  const toggleMemberSelection = (userId) => {
    setTeamIsDirty(true);
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleUserSelection = (userId) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleSelectAllMembers = () => {
    setTeamIsDirty(true);
    if (selectedMemberIds.length === users.length) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(users.map((u) => u.id));
    }
  };

  const toggleSelectAllUsers = (teamMembers) => {
    const availableUsers = users.filter((u) => !teamMembers.some((m) => m.id === u.id));
    if (selectedUserIds.length === availableUsers.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(availableUsers.map((u) => u.id));
    }
  };

  // Create a new team with name, description, and selected members
  const handleCreateTeam = async (e, isDraft = false) => {
    if (e) e.preventDefault();
    if (!selectedMemberIds || selectedMemberIds.length === 0) {
      notify.error("At least one team member is required.");
      return;
    }
    await run(async () => {
      const token = authToken();
      const response = await fetch(`${API_URL}/teams`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: teamName,
          description: teamDescription,
          member_ids: selectedMemberIds,
          leader_id: selectedLeaderId,
          team_lead_id: selectedLeaderId,
          status: isDraft ? "draft" : "active",
          is_draft: isDraft,
        }),
        _notifHandled: true,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to create team");
      showSuccessMessage("Team", isDraft ? "saved as draft" : "created");
      fetchTeams();
      closeModal();
    });
  };

  // Add selected users to an existing team
  const handleAddMembers = async (e) => {
    e.preventDefault();
    if (selectedUserIds.length === 0) {
      notify.error("Please select at least one user.");
      return;
    }
    await run(async () => {
      const token = authToken();
      const response = await fetch(`${API_URL}/teams/${addMemberTeamId}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_ids: selectedUserIds }),
        _notifHandled: true,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to add members");
      showSuccessMessage("Members", "added to team");
      fetchTeams();
      closeModal();
    });
  };

  const openEditTeamModal = (team) => {
    setEditTeamId(team.id);
    setTeamName(team.name);
    setTeamDescription(team.description || "");
    setSelectedMemberIds(team.members.map((m) => m.id));
    setSelectedLeaderId(team.leader_id || null);
    setAddMemberTeamId(null);
    setIsMemberDropdownOpen(false);
    setIsUserDropdownOpen(false);
    setIsModalOpen(true);
  };

  // Update an existing team's name, description, leader, and member list
  const handleUpdateTeam = async (e) => {
    e.preventDefault();
    if (!selectedMemberIds || selectedMemberIds.length === 0) {
      notify.error("At least one team member is required.");
      return;
    }
    await run(async () => {
      const token = authToken();
      const response = await fetch(`${API_URL}/teams/${editTeamId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: teamName, description: teamDescription, member_ids: selectedMemberIds, leader_id: selectedLeaderId, team_lead_id: selectedLeaderId }),
        _notifHandled: true,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to update team");
      showSuccessMessage("Team", "updated");
      fetchTeams();
      closeModal();
    });
  };

  // Compute available users for adding to a team (exclude current members)
  const currentTeamMembers = addMemberTeamId
    ? teams.find((t) => t.id === addMemberTeamId)?.members || []
    : [];
  const availableUsersForTeam = users.filter(
    (u) => !currentTeamMembers.some((m) => m.id === u.id)
  );

  // Apply search filter, team filter, and sorting to teams list
  const filteredTeams = teams
    .filter((t) => {
      const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTeam = !selectedTeamFilter || String(t.id) === String(selectedTeamFilter);
      return matchesSearch && matchesTeam;
    })
    .sort((a, b) => {
      if (sortOption === "newest") return new Date(b.created_at) - new Date(a.created_at);
      if (sortOption === "oldest") return new Date(a.created_at) - new Date(b.created_at);
      if (sortOption === "name-asc") return a.name.localeCompare(b.name);
      if (sortOption === "name-desc") return b.name.localeCompare(a.name);
      if (sortOption === "members") return b.members.length - a.members.length;
      return 0;
    });

  const totalTeamPages = Math.ceil(filteredTeams.length / ITEMS_PER_PAGE);
  const paginatedTeams = filteredTeams.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const selectedTeamName = useMemo(() => {
    if (!selectedTeamFilter) return "";
    const found = teams.find((t) => String(t.id) === String(selectedTeamFilter));
    return found?.name || "";
  }, [selectedTeamFilter, teams]);

  const breadcrumbs = selectedTeamName
    ? [
        { label: "Teams", onClick: () => { setSelectedTeamFilter(""); setSearchParams({}); } },
        { label: selectedTeamName },
      ]
    : [{ label: "Teams" }];

  return (
    <>
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="mt-page">
        {/* HEADER */}
        <div className="mt-header">
          <div className="mt-header-left">
            <h1 className="mt-title">Team Management</h1>
            <p className="mt-subtitle">Organize your workforce into teams.</p>
          </div>
          <button className="mt-create-btn" onClick={openCreateTeamModal}>
            <MdAdd size={20} />
            Create Team
          </button>
        </div>

        {/* SEARCH & SORT */}
        <div className="mt-toolbar">
          <div className="mt-search-box">
            <MdSearch size={20} className="mt-search-icon" />
            <input
              type="text"
              placeholder="Search by team name..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            />
          </div>
          {selectedTeamFilter && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                onClick={() => { setSelectedTeamFilter(""); setSearchParams({}); setPage(1); }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  padding: "6px 14px", borderRadius: "8px", border: "1px solid var(--border-color)",
                  background: "var(--bg-hover)", color: "var(--text-dark)", fontSize: "13px", fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                All Teams
              </button>
              <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                Filtered: <strong style={{ color: "var(--text-heading)" }}>{selectedTeamName}</strong>
              </span>
            </div>
          )}
          <select className="reports-filter" value={timeFilter} onChange={(e) => { setTimeFilter(e.target.value); setPage(1); }}>
            <option value="">All Time</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="180">Last 6 Months</option>
            <option value="custom">Custom Range</option>
          </select>
          {timeFilter === "custom" && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                style={{ padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--border-color)", fontSize: "13px", background: "var(--bg-card)", color: "var(--text-primary)" }}
              />
              <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                style={{ padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--border-color)", fontSize: "13px", background: "var(--bg-card)", color: "var(--text-primary)" }}
              />
            </div>
          )}
          <div className="mt-sort-box">
            <span>Sort by</span>
            <MdExpandMore size={18} />
            <select value={sortOption} onChange={(e) => setSortOption(e.target.value)}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
            </select>
          </div>
        </div>

        {/* TEAM LIST */}
        <div className="mt-team-list">
          {paginatedTeams.length === 0 ? (
            <div className="mt-card mt-empty">
              <MdGroup size={48} className="mt-empty-icon" />
              <p>No teams created yet.</p>
            </div>
          ) : (
            paginatedTeams.map((team) => {
              const leader = team.leader_id
                ? team.members.find((m) => Number(m.id) === Number(team.leader_id))
                : null;

              return (
                <div key={team.id} className="mt-card">
                  {/* Card Header */}
                  <div className="mt-card-top">
                    <div className="mt-card-identity">
                      <div className="mt-team-icon">
                        <MdGroup size={24} />
                      </div>
                      <div>
                        <h3 className="mt-team-name">{team.name}</h3>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                          <MdCalendarToday size={13} style={{ color: "var(--color-primary)" }} />
                          Created {formatDate(team.created_at)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-card-actions">
                      <button className="mt-icon-btn mt-icon-edit" title="Edit Team" onClick={() => openEditTeamModal(team)}>
                        <MdEdit size={18} />
                      </button>
                      <button
                        className="mt-icon-btn mt-icon-delete"
                        onClick={() => handleDeleteTeam(team.id)}
                        title="Delete Team"
                      >
                        <MdDelete size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Team Lead & Description Row */}
                  <div className="mt-lead-desc-row">
                    <div className="mt-section">
                      <span className="mt-section-label">TEAM LEAD</span>
                      {leader ? (
                        <div className="mt-lead-chip">
                          <Crown size={16} className="mt-crown-icon" />
                          <span>{leader.name}</span>
                        </div>
                      ) : (
                        <p className="mt-no-data">No leader assigned</p>
                      )}
                    </div>
                    {team.description && (
                      <div className="mt-section" >
                        <span className="mt-section-label">DESCRIPTION</span>
                        <div className="mt-team-desc rte-display" dangerouslySetInnerHTML={{ __html: team.description }} />
                      </div>
                    )}
                  </div>

                  {/* Team Members */}
                  <div className="mt-section">
                    <span className="mt-section-label">TEAM MEMBERS</span>
                    <div className="mt-members-row">
                      {team.members.length === 0 ? (
                        <p className="mt-no-data">No members yet.</p>
                      ) : (
                        team.members.map((member) => {
                          const isLeader = Number(team.leader_id) === Number(member.id);
                          return (
                            <div key={member.id} className={`mt-member-chip ${isLeader ? "mt-member-chip-leader" : ""}`}>
                              <div
                                className="mt-avatar"
                                style={{ background: getAvatarColor(member.name) }}
                              >
                                {getInitials(member.name)}
                              </div>
                              <span className="mt-member-name">{member.name}</span>
                              <button
                                className={`mt-crown-btn ${isLeader ? "mt-crown-active" : ""}`}
                                title={isLeader ? "Current Leader" : "Set as Leader"}
                                onClick={() => handleSetLeader(team.id, member.id)}
                              >
                                <Crown size={16} />
                              </button>
                              <button
                                className="mt-chip-remove"
                                title="Remove member"
                                onClick={() => { setRemoveMemberData({ teamId: team.id, memberId: member.id, memberName: member.name || member.username || "this member" }); setRemoveMemberConfirmOpen(true); }}
                              >
                                &times;
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="mt-card-footer">
                    <button
                      className="mt-add-member-btn"
                      onClick={() => openAddMemberModal(team.id)}
                    >
                      <MdPersonAdd size={18} />
                      Add Member
                    </button>
                    <button
                      className="mt-project-btn"
                      onClick={() => handleProjectForTeam(team.id)}
                    >
                      <MdCreateNewFolder size={18} />
                      Create Project for this Team
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {totalTeamPages > 1 && (
          <Pagination currentPage={page} totalPages={totalTeamPages} onPageChange={setPage} />
        )}

        {/* MODAL */}
        {isModalOpen && createPortal(
          <div className="mt-modal-overlay" onClick={handleTeamClose}>
            <div className="mt-modal" onClick={(e) => e.stopPropagation()}>
              <div className="mt-modal-header">
                <div>
                  <h2>{editTeamId ? "Edit Team" : addMemberTeamId ? "Add Member" : "Add New Team"}</h2>
                  <p className="mt-modal-sub">
                    {editTeamId
                      ? "Update team name, description and members"
                      : addMemberTeamId
                      ? "Select users to add to this team"
                      : "Create a new team and add members"}
                  </p>
                </div>
                <button className="mt-modal-close" onClick={handleTeamClose}>
                  &#10005;
                </button>
              </div>

              {addMemberTeamId ? (
                <form style={{ width: "100%" }} className="mt-modal-form" onSubmit={handleAddMembers}>
                  <div style={{ width: "100%", marginBottom: "20px" }}>
                    <label className="mt-field-label">Select Users</label>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        width: "100%",
                        height: "52px",
                        border: "1px solid var(--border-color)",
                        borderRadius: "12px",
                        padding: "0 14px",
                        fontSize: "14px",
                        background: "var(--bg-hover)",
                        cursor: "pointer",
                        boxSizing: "border-box",
                      }}
                      onClick={() => { setIsUserDropdownOpen(!isUserDropdownOpen); }}
                    >
                      {selectedUserIds.length > 0 && (
                        <span className="mt-combo-count">{selectedUserIds.length} selected</span>
                      )}
                      {selectedUserIds.length === 0 && !isUserDropdownOpen && (
                        <span className="mt-combo-placeholder">Click to select users</span>
                      )}
                      {isUserDropdownOpen && (
                        <input
                          type="text"
                          className="mt-combo-input"
                          placeholder="Search by user name, role, or department..."
                          value={mtUserSearch}
                          onChange={(e) => { setMtUserSearch(e.target.value); }}
                          onFocus={() => setIsUserDropdownOpen(true)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") { setMtUserSearch(""); setIsUserDropdownOpen(false); setUserHighlightedIndex(0); }
                            else if (e.key === "ArrowDown") { e.preventDefault(); setUserHighlightedIndex((p) => (p < availableUsersForTeam.filter((u) => !mtUserSearch.trim() || u.name?.toLowerCase().includes(mtUserSearch.toLowerCase()) || u.role?.toLowerCase().includes(mtUserSearch.toLowerCase()) || u.department?.toLowerCase().includes(mtUserSearch.toLowerCase())).length ? p + 1 : 0)); }
                            else if (e.key === "ArrowUp") { e.preventDefault(); setUserHighlightedIndex((p) => (p > 0 ? p - 1 : availableUsersForTeam.filter((u) => !mtUserSearch.trim() || u.name?.toLowerCase().includes(mtUserSearch.toLowerCase()) || u.role?.toLowerCase().includes(mtUserSearch.toLowerCase()) || u.department?.toLowerCase().includes(mtUserSearch.toLowerCase())).length)); }
                            else if (e.key === "Enter") {
                              e.preventDefault();
                              const filtered = availableUsersForTeam.filter((u) => !mtUserSearch.trim() || u.name?.toLowerCase().includes(mtUserSearch.toLowerCase()) || u.role?.toLowerCase().includes(mtUserSearch.toLowerCase()) || u.department?.toLowerCase().includes(mtUserSearch.toLowerCase()));
                              if (userHighlightedIndex === 0) { toggleSelectAllUsers(currentTeamMembers); }
                              else if (filtered[userHighlightedIndex - 1]) { toggleUserSelection(filtered[userHighlightedIndex - 1].id); }
                            }
                          }}
                          autoFocus
                        />
                      )}
                      <MdExpandMore
                        size={20}
                        style={{
                          transform: isUserDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "0.2s",
                          color: "var(--text-secondary)",
                        }}
                      />
                    </div>
                    {isUserDropdownOpen && (
                      <div className="mt-dropdown-list">
                        <div className="mt-dropdown-header">
                          <label className="mt-dropdown-selectall">
                            <input
                              type="checkbox"
                              checked={
                                availableUsersForTeam.length > 0 &&
                                selectedUserIds.length === availableUsersForTeam.length
                              }
                              onChange={() => toggleSelectAllUsers(currentTeamMembers)}
                            />
                            Select All
                          </label>
                          {selectedUserIds.length > 0 && (
                            <span className="mt-dropdown-count">{selectedUserIds.length} selected</span>
                          )}
                        </div>
                        <div className="mt-dropdown-items" ref={mtUserListRef}>
                          {availableUsersForTeam.length === 0 ? (
                            <p className="mt-dropdown-empty">All users are already members of this team.</p>
                          ) : (
                            <>
                              <div className={`mt-dropdown-item ${userHighlightedIndex === 0 ? "mt-dropdown-item--highlighted" : ""}`} onMouseEnter={() => setUserHighlightedIndex(0)} style={{ cursor: "pointer" }}>
                                <label className="mt-dropdown-item" style={{ margin: 0 }}>
                                  <input
                                    type="checkbox"
                                    checked={
                                      availableUsersForTeam.length > 0 &&
                                      selectedUserIds.length === availableUsersForTeam.length
                                    }
                                    onChange={() => toggleSelectAllUsers(currentTeamMembers)}
                                  />
                                  Select All
                                </label>
                              </div>
                              {availableUsersForTeam
                                .filter((user) => {
                                  if (!mtUserSearch.trim()) return true;
                                  const q = mtUserSearch.toLowerCase();
                                  return user.name?.toLowerCase().includes(q) || user.role?.toLowerCase().includes(q) || user.department?.toLowerCase().includes(q);
                                })
                                .map((user, idx) => (
                                <label key={user.id} className={`mt-dropdown-item ${userHighlightedIndex === idx + 1 ? "mt-dropdown-item--highlighted" : ""}`} onMouseEnter={() => setUserHighlightedIndex(idx + 1)}>
                                  <input
                                    type="checkbox"
                                    checked={selectedUserIds.includes(user.id)}
                                    onChange={() => toggleUserSelection(user.id)}
                                  />
                                  <div className="mt-dropdown-info">
                                    <span className="mt-dropdown-name">{user.name}</span>
                                    <div className="mt-dropdown-badges">
                                      {user.role && <span className="mt-dropdown-role">{user.role}</span>}
                                      {user.department && <span className="mt-dropdown-dept">{user.department}</span>}
                                    </div>
                                  </div>
                                </label>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="mt-modal-actions">
                    <button type="button" className="mt-btn-cancel" onClick={handleTeamClose}>
                      Cancel
                    </button>
                    <LoadingButton type="submit" className="mt-btn-primary" loading={submitting} disabled={selectedUserIds.length === 0}>
                      Add Member{selectedUserIds.length > 1 ? "s" : ""}
                    </LoadingButton>
                  </div>
                </form>
              ) : (
                <form style={{ width: "100%" }} className="mt-modal-form" onSubmit={editTeamId ? handleUpdateTeam : handleCreateTeam}>
                  <div style={{ width: "100%", marginBottom: "20px" }}>
                    <label className="mt-field-label">Team Name</label>
                    <input
                      style={{
                        width: "100%",
                        height: "52px",
                        border: "1px solid var(--border-color)",
                        borderRadius: "12px",
                        padding: "0 14px",
                        fontSize: "14px",
                        background: "var(--bg-hover)",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                      type="text"
                      value={teamName}
                      onChange={(e) => { setTeamIsDirty(true); setTeamName(e.target.value); }}
                      placeholder="Enter Team Name"
                      required
                    />
                  </div>

                  <div style={{ width: "100%", marginBottom: "20px" }}>
                    <label className="mt-field-label">Description</label>
                    <RichTextEditor
                      value={teamDescription}
                      onChange={(val) => { setTeamIsDirty(true); setTeamDescription(val); }}
                      placeholder="Enter team description (optional)"
                    />
                  </div>

                  <div style={{ width: "100%", marginBottom: "20px" }}>
                    <label className="mt-field-label">Select Members</label>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        width: "100%",
                        height: "44px",
                        border: isMemberDropdownOpen ? "1px solid #6366f1" : "1px solid #d1d5db",
                        borderRadius: "10px",
                        padding: "0 12px",
                        fontSize: "14px",
                        background: "var(--bg-card)",
                        cursor: "pointer",
                        boxSizing: "border-box",
                        gap: "8px",
                        boxShadow: isMemberDropdownOpen ? "0 0 0 3px rgba(99, 102, 241, 0.1)" : "none",
                        transition: "border-color 0.2s, box-shadow 0.2s",
                      }}
                      onClick={() => { if (!isMemberDropdownOpen) { setIsMemberDropdownOpen(true); setMtMemberSearch(""); } }}
                    >
                      {selectedMemberIds.length > 0 && (
                        <span className="mt-combo-count">{selectedMemberIds.length} selected</span>
                      )}
                      {selectedMemberIds.length === 0 && !isMemberDropdownOpen && (
                        <span className="mt-combo-placeholder">Click to select members</span>
                      )}
                      {isMemberDropdownOpen && (
                        <input
                          type="text"
                          className="mt-combo-input"
                          placeholder="Search by member name, role, or department..."
                          value={mtMemberSearch}
                          onChange={(e) => { setMtMemberSearch(e.target.value); }}
                          onFocus={() => setIsMemberDropdownOpen(true)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") { setMtMemberSearch(""); setIsMemberDropdownOpen(false); setMemberHighlightedIndex(0); }
                            else if (e.key === "ArrowDown") { e.preventDefault(); setMemberHighlightedIndex((p) => (p < users.filter((u) => !mtMemberSearch.trim() || u.name?.toLowerCase().includes(mtMemberSearch.toLowerCase()) || u.role?.toLowerCase().includes(mtMemberSearch.toLowerCase()) || u.department?.toLowerCase().includes(mtMemberSearch.toLowerCase())).length ? p + 1 : 0)); }
                            else if (e.key === "ArrowUp") { e.preventDefault(); setMemberHighlightedIndex((p) => (p > 0 ? p - 1 : users.filter((u) => !mtMemberSearch.trim() || u.name?.toLowerCase().includes(mtMemberSearch.toLowerCase()) || u.role?.toLowerCase().includes(mtMemberSearch.toLowerCase()) || u.department?.toLowerCase().includes(mtMemberSearch.toLowerCase())).length)); }
                            else if (e.key === "Enter") {
                              e.preventDefault();
                              const filtered = users.filter((u) => !mtMemberSearch.trim() || u.name?.toLowerCase().includes(mtMemberSearch.toLowerCase()) || u.role?.toLowerCase().includes(mtMemberSearch.toLowerCase()) || u.department?.toLowerCase().includes(mtMemberSearch.toLowerCase()));
                              if (memberHighlightedIndex === 0) { toggleSelectAllMembers(); }
                              else if (filtered[memberHighlightedIndex - 1]) { toggleMemberSelection(filtered[memberHighlightedIndex - 1].id); }
                            }
                          }}
                          autoFocus
                        />
                      )}
                      <MdExpandMore
                        size={20}
                        style={{
                          transform: isMemberDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "0.2s",
                          color: "var(--text-secondary)",
                          cursor: "pointer",
                        }}
                        onClick={(e) => { e.stopPropagation(); if (isMemberDropdownOpen) { setIsMemberDropdownOpen(false); setMtMemberSearch(""); } else { setIsMemberDropdownOpen(true); setMtMemberSearch(""); } }}
                      />
                    </div>
                    {isMemberDropdownOpen && (
                      <div className="mt-dropdown-list">
                        <div className="mt-dropdown-header">
                          <label className="mt-dropdown-selectall">
                            <input
                              type="checkbox"
                              checked={users.length > 0 && selectedMemberIds.length === users.length}
                              onChange={toggleSelectAllMembers}
                            />
                            Select All
                          </label>
                          {selectedMemberIds.length > 0 && (
                            <span className="mt-dropdown-count">{selectedMemberIds.length} selected</span>
                          )}
                        </div>
                        <div className="mt-dropdown-items" ref={mtMemberListRef}>
                          {users.length === 0 ? (
                            <p className="mt-dropdown-empty">No users available.</p>
                          ) : (
                            <>
                              <div className={`mt-dropdown-item ${memberHighlightedIndex === 0 ? "mt-dropdown-item--highlighted" : ""}`} onMouseEnter={() => setMemberHighlightedIndex(0)} style={{ cursor: "pointer" }}>
                                <label className="mt-dropdown-item" style={{ margin: 0 }}>
                                  <input
                                    type="checkbox"
                                    checked={users.length > 0 && selectedMemberIds.length === users.length}
                                    onChange={toggleSelectAllMembers}
                                  />
                                  Select All
                                </label>
                              </div>
                              {users
                                .filter((user) => {
                                  if (!mtMemberSearch.trim()) return true;
                                  const q = mtMemberSearch.toLowerCase();
                                  return user.name?.toLowerCase().includes(q) || user.role?.toLowerCase().includes(q) || user.department?.toLowerCase().includes(q);
                                })
                                .map((user, idx) => (
                                <label key={user.id} className={`mt-dropdown-item ${memberHighlightedIndex === idx + 1 ? "mt-dropdown-item--highlighted" : ""}`} onMouseEnter={() => setMemberHighlightedIndex(idx + 1)}>
                                  <input
                                    type="checkbox"
                                    checked={selectedMemberIds.includes(user.id)}
                                    onChange={() => toggleMemberSelection(user.id)}
                                  />
                                  <div className="mt-dropdown-info">
                                    <span className="mt-dropdown-name">{user.name}</span>
                                    <div className="mt-dropdown-badges">
                                      {user.role && <span className="mt-dropdown-role">{user.role}</span>}
                                      {user.department && <span className="mt-dropdown-dept">{user.department}</span>}
                                    </div>
                                  </div>
                                </label>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedMemberIds.length > 0 && (
                    <div style={{ width: "100%", marginBottom: "20px" }}>
                      <label className="mt-field-label">Select Team Lead (Optional)</label>
                      <select
                        style={{
                          width: "100%",
                          height: "52px",
                          border: "1px solid var(--border-color)",
                          borderRadius: "12px",
                          padding: "0 14px",
                          fontSize: "14px",
                          background: "var(--bg-hover)",
                          outline: "none",
                          boxSizing: "border-box",
                          cursor: "pointer",
                        }}
                        value={selectedLeaderId || ""}
                        onChange={(e) => { setTeamIsDirty(true); setSelectedLeaderId(e.target.value ? Number(e.target.value) : null); }}
                      >
                        <option value="">No leader selected</option>
                        {users
                          .filter((u) => selectedMemberIds.includes(u.id))
                          .map((u) => (
                            <option key={u.id} value={u.id}>{u.name} ({u.role === "teamlead" ? "Team Lead" : u.role}){u.department ? ` - ${u.department}` : ""}</option>
                          ))}
                      </select>
                    </div>
                  )}

                  <div className="mt-modal-actions">
                    <button type="button" className="mt-btn-cancel" onClick={handleTeamClose}>
                      Cancel
                    </button>
                    {!editTeamId && (
                      <button
                        type="button"
                        className="mt-btn-cancel"
                        style={{ border: "1px solid var(--border-color)", background: "var(--bg-hover)", color: "var(--text-primary)" }}
                        onClick={(e) => handleCreateTeam(e, true)}
                        disabled={submitting}
                      >
                        Save as Draft
                      </button>
                    )}
                    <LoadingButton type="submit" className="mt-btn-primary" loading={submitting}>
                      {editTeamId ? "Update Team" : "Create Team"}
                    </LoadingButton>
                  </div>
                </form>
              )}
            </div>
          </div>,
          document.body
        )}
        {TeamConfirmDialog}
      </div>
    </DashboardLayout>

    <ConfirmModal
      isOpen={deleteTeamConfirmOpen}
      onClose={() => { setDeleteTeamConfirmOpen(false); setDeleteTeamId(null); }}
      onConfirm={confirmDeleteTeam}
      title="Delete Team"
      message="Are you sure you want to delete this team? All associated team data may be affected. This action cannot be undone."
      confirmText="Delete Team"
      cancelText="Cancel"
      danger
    />

    <ConfirmModal
      isOpen={leaderConfirmOpen}
      onClose={() => { setLeaderConfirmOpen(false); setLeaderConfirmData({ teamId: null, memberId: null, memberName: "" }); }}
      onConfirm={confirmSetLeader}
      title="Confirm Team Assignment"
      message={`Are you sure you want to assign ${leaderConfirmData.memberName} as Team Lead? This will update team responsibilities and permissions.`}
      confirmText="Confirm"
      cancelText="Cancel"
    />

    <ConfirmModal
      isOpen={removeMemberConfirmOpen}
      onClose={() => { setRemoveMemberConfirmOpen(false); setRemoveMemberData({ teamId: null, memberId: null, memberName: "" }); }}
      onConfirm={confirmRemoveMember}
      title="Remove Member"
      message={`Are you sure you want to remove ${removeMemberData.memberName} from this team? This action cannot be undone.`}
      confirmText="Remove"
      cancelText="Cancel"
      danger
    />
    </>
  );
}

export default ManageTeam;