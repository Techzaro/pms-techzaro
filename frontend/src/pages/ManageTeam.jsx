import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Crown } from "lucide-react";
import { MdAdd, MdPersonAdd, MdDelete, MdEdit, MdPeople } from "react-icons/md";
import DashboardLayout from "../components/layout/DashboardLayout";
import "./ManageTeam.css";

function ManageTeam() {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [teamName, setTeamName] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedMember, setSelectedMember] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
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
    const token = localStorage.getItem("token");
    if (!token) return;

    setLoading(true);
    try {
      const response = await fetch("http://127.0.0.1:8000/api/team-users", {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      const usersList = Array.isArray(data) ? data : [];
      setUsers(usersList);
      if (usersList.length > 0) {
        setSelectedMember(usersList[0].id.toString());
      }
    } catch (error) {
      console.error("Failed to load users", error);
      setUsers([]);
      showMessage("Unable to load users from the database.", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchTeams = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const response = await fetch("http://127.0.0.1:8000/api/teams", {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      const teamList = Array.isArray(data) ? data : [];
      setTeams(teamList);
      if (teamList.length > 0) {
        setSelectedTeamId(teamList[0].id.toString());
      }
    } catch (error) {
      console.error("Failed to load teams", error);
    }
  };

  const handleCreateTeam = async () => {
    if (!teamName.trim()) {
      showMessage("Please enter a team name.", "error");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch("http://127.0.0.1:8000/api/teams", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: teamName.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Could not create team.");
      }
      setTeamName("");
      await fetchTeams();
      showMessage("Team created successfully.");
    } catch (error) {
      console.error(error);
      showMessage(error.message || "Team creation failed.", "error");
    }
  };

  const handleSetLeader = async (teamId, memberId) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`http://127.0.0.1:8000/api/teams/${teamId}/leader`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ leader_id: memberId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Could not update team leader.");
      }
      await fetchTeams();
      showMessage("New Leader Appointed!");
    } catch (error) {
      console.error(error);
      showMessage(error.message || "Failed to set team leader.", "error");
    }
  };

  const handleAssignMember = async () => {
    if (!selectedTeamId) {
      showMessage("Please select a team.", "error");
      return;
    }

    if (!selectedMember) {
      showMessage("Please select a user.", "error");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`http://127.0.0.1:8000/api/teams/${selectedTeamId}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: Number(selectedMember) }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Could not add member.");
      }
      await fetchTeams();
      showMessage("Member added to team.");
    } catch (error) {
      console.error(error);
      showMessage(error.message || "Failed to add member.", "error");
    }
  };

  const handleRemoveMember = async (teamId, memberId) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`http://127.0.0.1:8000/api/teams/${teamId}/members/${memberId}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Could not remove member.");
      }
      await fetchTeams();
      showMessage("Member removed from team.");
    } catch (error) {
      console.error(error);
      showMessage(error.message || "Failed to remove member.", "error");
    }
  };

  const handleDeleteTeam = async (teamId) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`http://127.0.0.1:8000/api/teams/${teamId}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Could not delete team.");
      }
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

  return (
    <DashboardLayout>
      <div className="manage-team-page">
        <div className="manage-team-header">
          <div>
            <h1>Team Management</h1>
          </div>
        </div>

        {message && (
          <div className={`message-box ${messageType === "error" ? "message-error" : "message-success"}`}>
            {message}
          </div>
        )}

        <div className="team-grid">
          <div className="team-sidecards">
            <div className="team-card create-team-card">
              <h2>Create New Team</h2>
              <p>Add a team with a name only. After you add members in the team card, click the crown next to someone to make them leader.</p>

              <div className="form-row">
                <label>Team Name</label>
                <input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Enter Team Name"
                />
              </div>

              <button type="button" className="primary-button" onClick={handleCreateTeam}>
                <MdAdd size={20} /> Add Team
              </button>
            </div>

            <div className="team-card assign-member-card">
              <h2>Assign Member</h2>
              <p>Choose a team and add a team member to it.</p>

              <div className="form-row">
                <label>Select Team</label>
                <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)}>
                  {teams.length === 0 ? (
                    <option>No teams available</option>
                  ) : (
                    teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="form-row">
                <label>Select User</label>
                <select value={selectedMember} onChange={(e) => setSelectedMember(e.target.value)} disabled={loading}>
                  {loading ? (
                    <option>Loading users...</option>
                  ) : users.length === 0 ? (
                    <option>No users available</option>
                  ) : (
                    users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <button className="primary-button" onClick={handleAssignMember}>
                <MdPersonAdd size={20} /> Add to Team
              </button>
            </div>
          </div>

          <div className="team-list">
            {teams.length === 0 ? (
              <div className="team-card team-preview">
                <p>No teams created yet. Create a team to get started.</p>
              </div>
            ) : (
              teams.map((team) => (
                <div key={team.id} className="team-card team-preview">
                  <div className="team-preview-header">
                    <div className="team-title">
                      <MdPeople size={22} />
                      <h3>{team.name}</h3>
                    </div>
                    <div className="team-actions">
                      <button className="icon-button" title="Edit Team">
                        <MdEdit />
                      </button>
                      <button className="icon-button" onClick={() => handleDeleteTeam(team.id)} title="Delete Team">
                        <MdDelete />
                      </button>
                    </div>
                  </div>

                  <div className="team-members-box">
                    <span>TEAM MEMBERS</span>
                    <p className="member-leader-hint">
                      Crown icon: click to set team leader. Filled crown shows the current leader.
                    </p>
                    <div className="member-list">
                      {team.members.length === 0 ? (
                        <p className="no-members-note">No members yet. Use &quot;Assign Member&quot; on the left, then choose a leader here.</p>
                      ) : (
                        team.members.map((member) => {
                          const isLeader = Number(team.leader_id) === Number(member.id);
                          return (
                            <div key={member.id} className={`team-member-chip ${isLeader ? "team-member-chip-leader" : ""}`}>
                              <button
                                type="button"
                                className={`leader-crown-btn ${isLeader ? "is-leader" : ""}`}
                                onClick={() => handleSetLeader(team.id, member.id)}
                                title={isLeader ? "Team leader" : "Make team leader"}
                                aria-label={isLeader ? `${member.name} is team leader` : `Make ${member.name} team leader`}
                              >
                                <Crown size={18} strokeWidth={isLeader ? 2.25 : 1.75} />
                              </button>
                              <strong>{member.name}</strong>
                              <button type="button" className="remove-member-btn" onClick={() => handleRemoveMember(team.id, member.id)} aria-label={`Remove ${member.name}`}>
                                &times;
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <button className="project-button" onClick={() => handleProjectForTeam(team.id)}>
                    Create Project for this Team
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default ManageTeam;
