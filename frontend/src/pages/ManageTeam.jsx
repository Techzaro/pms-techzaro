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
import { authToken } from "../utils/auth";
import API_URL from "../config/api";
import "./ManageTeam.css";

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

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function ManageTeam() {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState("newest");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [addMemberTeamId, setAddMemberTeamId] = useState(null);

  const [teamName, setTeamName] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);

  const [selectedUserIds, setSelectedUserIds] = useState([]);

  const [isMemberDropdownOpen, setIsMemberDropdownOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    fetchUsers();
    fetchTeams();
  }, []);

  const showMessage = (text, type = "success") => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 4000);
  };

  const fetchUsers = async () => {
    const token = authToken();
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/team-users`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load users", error);
      setUsers([]);
      showMessage("Unable to load users.", "error");
    } finally {
      setLoading(false);
    }
  };

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

  const handleSetLeader = async (teamId, memberId) => {
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
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not update team leader.");
      await fetchTeams();
      showMessage("New Leader Appointed!");
    } catch (error) {
      console.error(error);
      showMessage(error.message || "Failed to set team leader.", "error");
    }
  };

  const handleRemoveMember = async (teamId, memberId) => {
    try {
      const token = authToken();
      const response = await fetch(`${API_URL}/teams/${teamId}/members/${memberId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not remove member.");
      await fetchTeams();
      showMessage("Member removed from team.");
    } catch (error) {
      console.error(error);
      showMessage(error.message || "Failed to remove member.", "error");
    }
  };

  const handleDeleteTeam = async (teamId) => {
    try {
      const token = authToken();
      const response = await fetch(`${API_URL}/teams/${teamId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not delete team.");
      await fetchTeams();
      showMessage("Team deleted successfully.");
    } catch (error) {
      console.error(error);
      showMessage(error.message || "Failed to delete team.", "error");
    }
  };

  const handleProjectForTeam = (teamId) => {
    navigate(`/create-project?teamId=${teamId}`);
  };

  const openCreateTeamModal = () => {
    setAddMemberTeamId(null);
    setTeamName("");
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
    setTeamName("");
    setSelectedMemberIds([]);
    setSelectedUserIds([]);
    setIsMemberDropdownOpen(false);
    setIsUserDropdownOpen(false);
  };

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
        body: JSON.stringify({ name: teamName, member_ids: selectedMemberIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to create team");
      showMessage("Team created successfully");
      fetchTeams();
      closeModal();
    } catch (error) {
      console.error(error);
      showMessage(error.message || "Failed to create team", "error");
    }
  };

  const handleAddMembers = async (e) => {
    e.preventDefault();
    if (selectedUserIds.length === 0) {
      showMessage("Please select at least one user.", "error");
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
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to add members");
      showMessage(data.message || "Members added successfully");
      fetchTeams();
      closeModal();
    } catch (error) {
      console.error(error);
      showMessage(error.message || "Failed to add members", "error");
    }
  };

  const currentTeamMembers = addMemberTeamId
    ? teams.find((t) => t.id === addMemberTeamId)?.members || []
    : [];
  const availableUsersForTeam = users.filter(
    (u) => !currentTeamMembers.some((m) => m.id === u.id)
  );

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

  return (
    <DashboardLayout>
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

        {/* MESSAGE */}
        {message && (
          <div className={`mt-message ${messageType === "error" ? "mt-msg-error" : "mt-msg-success"}`}>
            {message}
          </div>
        )}

        {/* SEARCH & SORT */}
        <div className="mt-toolbar">
          <div className="mt-search-box">
            <MdSearch size={20} className="mt-search-icon" />
            <input
              type="text"
              placeholder="Search teams.."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
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
          {filteredTeams.length === 0 ? (
            <div className="mt-card mt-empty">
              <MdGroup size={48} className="mt-empty-icon" />
              <p>No teams created yet.</p>
            </div>
          ) : (
            filteredTeams.map((team) => {
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
                      <button className="mt-icon-btn mt-icon-edit" title="Edit Team">
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

                  {/* Team Lead */}
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

        {/* MODAL */}
        {isModalOpen && (
          <div className="mt-modal-overlay">
            <div className="mt-modal">
              <div className="mt-modal-header">
                <div>
                  <h2>{addMemberTeamId ? "Add Member" : "Add New Team"}</h2>
                  <p className="mt-modal-sub">
                    {addMemberTeamId
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
                <form style={{ width: "100%" }} className="mt-modal-form" onSubmit={handleCreateTeam}>
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
                      Create Team
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default ManageTeam;
