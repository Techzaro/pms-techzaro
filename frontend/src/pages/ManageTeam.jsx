/**
 * ManageTeam page component.
 * Rendered when the user navigates to /manageteam or related route.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Crown } from "lucide-react";
import { MdAdd, MdDelete, MdEdit, MdPeople } from "react-icons/md";
import DashboardLayout from "../components/layout/DashboardLayout";
// import TeamManagementModal from "../components/TeamManagementModal";
import "./ManageTeam.css";

/**
 * Perform the manage team.
 */

/**
 * Page to manage teams and team members.
 */
function ManageTeam() {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUsers();
    fetchTeams();
  }, []);

  /**
   * Display a temporary message banner to the user.
   */

  /**
   * Display a temporary status message to the user.
   */
  const showMessage = (text, type = "success") => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 4000);
  };

  /**
   * Perform the fetch users.
   */

  /**
   * Fetch the list of users from the backend for assignment.
   */
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
    } catch (error) {
      console.error("Failed to load users", error);
      setUsers([]);
      showMessage("Unable to load users from the database.", "error");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Perform the fetch teams.
   */

  /**
   * Fetch the list of teams from the backend for project assignment.
   */
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
    } catch (error) {
      console.error("Failed to load teams", error);
    }
  };



  /**
   * Perform the handle set leader.
   */

  /**
   * Handle handle set leader.
   */
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



  /**
   * Perform the handle remove member.
   */

  /**
   * Handle handle remove member.
   */
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

  /**
   * Perform the handle delete team.
   */

  /**
   * Handle handle delete team.
   */
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

  /**
   * Perform the handle project for team.
   */

  /**
   * Handle handle project for team.
   */
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
          <button className="create-team-header-btn" onClick={() => setIsModalOpen(true)}>
            <MdAdd size={20} /> Create Team
          </button>
        </div>

        {message && (
          <div className={`message-box ${messageType === "error" ? "message-error" : "message-success"}`}>
            {message}
          </div>
        )}

        <div className="team-list-simple">
          {teams.length === 0 ? (
            <div className="team-card team-preview empty-state">
              <p>No teams created yet. Click "Create Team" to get started.</p>
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
                      <p className="no-members-note">No members yet. Use "Create Team" button and assign members.</p>
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

      {/* TeamManagementModal - To be implemented with FigmaCreateProjectModal or custom component */}
      {/* <TeamManagementModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onTeamCreated={() => {
          setIsModalOpen(false);
          fetchTeams();
        }}
        teams={teams}
        users={users}
        loading={loading}
      /> */}
    </DashboardLayout>
  );
}

export default ManageTeam;
