import { useState, useEffect } from "react";
import { MdAdd, MdPersonAdd } from "react-icons/md";
import "./TeamManagementModal.css";

function TeamManagementModal({ isOpen, onClose, onTeamCreated, teams, users, loading }) {
  const [activeTab, setActiveTab] = useState("create");
  const [teamName, setTeamName] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedMember, setSelectedMember] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  useEffect(() => {
    if (teams.length > 0) {
      setSelectedTeamId(teams[0].id.toString());
    }
  }, [teams]);

  useEffect(() => {
    if (users.length > 0) {
      setSelectedMember(users[0].id.toString());
    }
  }, [users]);

  const showMessage = (text, type = "success") => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 4000);
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
      showMessage("Team created successfully.");
      if (onTeamCreated) onTeamCreated();
    } catch (error) {
      console.error(error);
      showMessage(error.message || "Team creation failed.", "error");
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
      showMessage("Member added to team.");
      if (onTeamCreated) onTeamCreated();
    } catch (error) {
      console.error(error);
      showMessage(error.message || "Failed to add member.", "error");
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-overlay" onClick={onClose}></div>
      <div className="team-modal">
        <div className="modal-header">
          <h2>Team Management</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-tabs">
          <button
            className={`tab-btn ${activeTab === "create" ? "active" : ""}`}
            onClick={() => setActiveTab("create")}
          >
            Create Team
          </button>
          <button
            className={`tab-btn ${activeTab === "assign" ? "active" : ""}`}
            onClick={() => setActiveTab("assign")}
          >
            Assign Member
          </button>
        </div>

        {message && (
          <div className={`modal-message ${messageType === "error" ? "message-error" : "message-success"}`}>
            {message}
          </div>
        )}

        <div className="modal-content">
          {activeTab === "create" && (
            <div className="tab-content">
              <p>Add a team with a name only. After you add members in the team card, click the crown next to someone to make them leader.</p>

              <div className="form-row">
                <label>Team Name</label>
                <input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Enter Team Name"
                />
              </div>

              <button type="button" className="modal-primary-button" onClick={handleCreateTeam}>
                <MdAdd size={20} /> Add Team
              </button>
            </div>
          )}

          {activeTab === "assign" && (
            <div className="tab-content">
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

              <button className="modal-primary-button" onClick={handleAssignMember}>
                <MdPersonAdd size={20} /> Add to Team
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default TeamManagementModal;
