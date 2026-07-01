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
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Crown } from "lucide-react";
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
} from "react-icons/md";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import ConfirmModal from "../components/ConfirmModal";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { authToken, getCurrentRole, rolePath } from "../utils/auth";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import API_URL from "../config/api";
import Pagination from "../components/Pagination";
import { useNotification } from "../context/NotificationContext";
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

  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [sortOption, setSortOption] = useState("newest");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [addMemberTeamId, setAddMemberTeamId] = useState(null);

  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);

  const [selectedUserIds, setSelectedUserIds] = useState([]);

  const [isMemberDropdownOpen, setIsMemberDropdownOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  const [deleteTeamConfirmOpen, setDeleteTeamConfirmOpen] = useState(false);
  const [deleteTeamId, setDeleteTeamId] = useState(null);
  const [leaderConfirmOpen, setLeaderConfirmOpen] = useState(false);
  const [leaderConfirmData, setLeaderConfirmData] = useState({ teamId: null, memberId: null, memberName: "" });
  const [removeMemberConfirmOpen, setRemoveMemberConfirmOpen] = useState(false);
  const [removeMemberData, setRemoveMemberData] = useState({ teamId: null, memberId: null, memberName: "" });
  const [editTeamId, setEditTeamId] = useState(null);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const navigate = useNavigate();

  // ✅ Define fetchUsers first
  // Fetch all users for member selection dropdowns
  const fetchUsers = async () => {
    const token = authToken();
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/team-users`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
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
      const response = await fetch(`${API_URL}/teams`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
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
    fetchUsers();
    fetchTeams();
  }, []);

  // Auto-refresh teams when data changes elsewhere in the app
  useRefreshOnEvent(["data:changed"], fetchTeams);

  // ... rest of the functions (handleSetLeader, handleRemoveMember, etc.)
  useRefreshOnEvent(["data:changed"], fetchTeams);

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
    try {
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
      notify.success("New Leader Appointed!");
    } catch (error) {
      console.error(error);
      notify.error(error.message || "Failed to set team leader.");
    }
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
    try {
      const token = authToken();
      const response = await fetch(`${API_URL}/teams/${teamId}/members/${memberId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not remove member.");
      await fetchTeams();
      notify.success("Member removed from team.");
    } catch (error) {
      console.error(error);
      notify.error(error.message || "Failed to remove member.");
    }
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
    try {
      const token = authToken();
      const response = await fetch(`${API_URL}/teams/${teamId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not delete team.");
      await fetchTeams();
      notify.success("Team deleted successfully.");
    } catch (error) {
      console.error(error);
      notify.error(error.message || "Failed to delete team.");
    }
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
    setSelectedUserIds([]);
    setIsMemberDropdownOpen(false);
    setIsUserDropdownOpen(false);
  };

  useEscapeKey(isModalOpen, closeModal);

  const toggleMemberSelection = (userId) => {
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
  const handleCreateTeam = async (e) => {
    e.preventDefault();
    try {
      const token = authToken();
      const response = await fetch(`${API_URL}/teams`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: teamName, description: teamDescription, member_ids: selectedMemberIds }),
        _notifHandled: true,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to create team");
      notify.success("Team created successfully");
      fetchTeams();
      closeModal();
    } catch (error) {
      console.error(error);
      notify.error(error.message || "Failed to create team");
    }
  };

  // Add selected users to an existing team
  const handleAddMembers = async (e) => {
    e.preventDefault();
    if (selectedUserIds.length === 0) {
      notify.error("Please select at least one user.");
      return;
    }
    try {
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
      notify.success(data.message || "Members added successfully");
      fetchTeams();
      closeModal();
    } catch (error) {
      console.error(error);
      notify.error(error.message || "Failed to add members");
    }
  };

  const openEditTeamModal = (team) => {
    setEditTeamId(team.id);
    setTeamName(team.name);
    setTeamDescription(team.description || "");
    setSelectedMemberIds(team.members.map((m) => m.id));
    setAddMemberTeamId(null);
    setIsMemberDropdownOpen(false);
    setIsUserDropdownOpen(false);
    setIsModalOpen(true);
  };

  // Update an existing team's name, description, and member list
  const handleUpdateTeam = async (e) => {
    e.preventDefault();
    try {
      const token = authToken();
      const response = await fetch(`${API_URL}/teams/${editTeamId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: teamName, description: teamDescription, member_ids: selectedMemberIds }),
        _notifHandled: true,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to update team");
      notify.success("Team updated successfully");
      fetchTeams();
      closeModal();
    } catch (error) {
      console.error(error);
      notify.error(error.message || "Failed to update team");
    }
  };

  // Compute available users for adding to a team (exclude current members)
  const currentTeamMembers = addMemberTeamId
    ? teams.find((t) => t.id === addMemberTeamId)?.members || []
    : [];
  const availableUsersForTeam = users.filter(
    (u) => !currentTeamMembers.some((m) => m.id === u.id)
  );

  // Apply search filter and sorting to teams list
  const filteredTeams = teams
    .filter((t) => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
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

  const breadcrumbs = [
    { label: "Teams" },
  ];

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
              placeholder="Search teams.."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            />
          </div>
          <select className="reports-filter" value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
            <option value="">All Time</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="180">Last 6 Months</option>
          </select>
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
                      <h3 className="mt-team-name">{team.name}</h3>
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
                        <p className="mt-team-desc">{team.description}</p>
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
                                onClick={() => handleRemoveMember(team.id, member.id)}
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
        {isModalOpen && (
          <div className="mt-modal-overlay">
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
                <button className="mt-modal-close" onClick={closeModal}>
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
                        border: "1px solid #d1d5db",
                        borderRadius: "12px",
                        padding: "0 14px",
                        fontSize: "14px",
                        background: "#f9fafb",
                        cursor: "pointer",
                        boxSizing: "border-box",
                      }}
                      onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                    >
                      <span style={{ color: selectedUserIds.length === 0 ? "#9ca3af" : "#111827" }}>
                        {selectedUserIds.length === 0
                          ? "Click to select users"
                          : `${selectedUserIds.length} user(s) selected`}
                      </span>
                      <MdExpandMore
                        size={20}
                        style={{
                          transform: isUserDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "0.2s",
                          color: "#6b7280",
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
                        <div className="mt-dropdown-items">
                          {availableUsersForTeam.length === 0 ? (
                            <p className="mt-dropdown-empty">All users are already members of this team.</p>
                          ) : (
                            availableUsersForTeam.map((user) => (
                              <label key={user.id} className="mt-dropdown-item">
                                <input
                                  type="checkbox"
                                  checked={selectedUserIds.includes(user.id)}
                                  onChange={() => toggleUserSelection(user.id)}
                                />
                                <span className="mt-dropdown-name">{user.name}</span>
                                {user.role && <span className="mt-dropdown-role">{user.role}</span>}
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="mt-modal-actions">
                    <button type="button" className="mt-btn-cancel" onClick={closeModal}>
                      Cancel
                    </button>
                    <button type="submit" className="mt-btn-primary" disabled={selectedUserIds.length === 0}>
                      Add Member{selectedUserIds.length > 1 ? "s" : ""}
                    </button>
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
                        border: "1px solid #d1d5db",
                        borderRadius: "12px",
                        padding: "0 14px",
                        fontSize: "14px",
                        background: "#f9fafb",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                      type="text"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder="Enter Team Name"
                      required
                    />
                  </div>

                  <div style={{ width: "100%", marginBottom: "20px" }}>
                    <label className="mt-field-label">Description</label>
                    <textarea
                      style={{
                        width: "100%",
                        minHeight: "80px",
                        border: "1px solid #d1d5db",
                        borderRadius: "12px",
                        padding: "12px 14px",
                        fontSize: "14px",
                        background: "#f9fafb",
                        outline: "none",
                        boxSizing: "border-box",
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                      value={teamDescription}
                      onChange={(e) => setTeamDescription(e.target.value)}
                      placeholder="Enter team description (optional)"
                    />
                  </div>

                  <div style={{ width: "100%", marginBottom: "20px" }}>
                    <label className="mt-field-label">Select Members</label>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        width: "100%",
                        height: "52px",
                        border: "1px solid #d1d5db",
                        borderRadius: "12px",
                        padding: "0 14px",
                        fontSize: "14px",
                        background: "#f9fafb",
                        cursor: "pointer",
                        boxSizing: "border-box",
                      }}
                      onClick={() => setIsMemberDropdownOpen(!isMemberDropdownOpen)}
                    >
                      <span style={{ color: selectedMemberIds.length === 0 ? "#9ca3af" : "#111827" }}>
                        {selectedMemberIds.length === 0
                          ? "Click to select members"
                          : `${selectedMemberIds.length} member(s) selected`}
                      </span>
                      <MdExpandMore
                        size={20}
                        style={{
                          transform: isMemberDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "0.2s",
                          color: "#6b7280",
                        }}
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
                        <div className="mt-dropdown-items">
                          {users.length === 0 ? (
                            <p className="mt-dropdown-empty">No users available.</p>
                          ) : (
                            users.map((user) => (
                              <label key={user.id} className="mt-dropdown-item">
                                <input
                                  type="checkbox"
                                  checked={selectedMemberIds.includes(user.id)}
                                  onChange={() => toggleMemberSelection(user.id)}
                                />
                                <span className="mt-dropdown-name">{user.name}</span>
                                {user.role && <span className="mt-dropdown-role">{user.role}</span>}
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-modal-actions">
                    <button type="button" className="mt-btn-cancel" onClick={closeModal}>
                      Cancel
                    </button>
                    <button type="submit" className="mt-btn-primary">
                      {editTeamId ? "Update Team" : "Create Team"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
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