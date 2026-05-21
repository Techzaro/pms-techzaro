/**
 * ManageTeam page component.
 * Rendered when the user navigates to /manageteam or related route.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Crown } from "lucide-react";
import { MdAdd, MdDelete, MdEdit, MdPeople } from "react-icons/md";
import DashboardLayout from "../components/layout/DashboardLayout";
import "./ManageTeam.css";

function ManageTeam() {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  // TEAM MODAL
  const [isModalOpen, setIsModalOpen] = useState(false);

  // USER MODAL
  const [isAddModalOpen, setIsAddModalOpen] =
    useState(false);

  const [addMemberTeamId, setAddMemberTeamId] = useState(null);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: isAddModalOpen } }));
  }, [isAddModalOpen]);

  const [newUser, setNewUser] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "member",
  });

  const navigate = useNavigate();

  useEffect(() => {
    fetchUsers();
    fetchTeams();
  }, []);

  // MESSAGE
  const showMessage = (
    text,
    type = "success"
  ) => {
    setMessage(text);
    setMessageType(type);

    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 4000);
  };

  // FETCH USERS
  const fetchUsers = async () => {
    const token = localStorage.getItem("token");

    if (!token) return;

    setLoading(true);

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/api/team-users",
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      const usersList = Array.isArray(data)
        ? data
        : [];

      setUsers(usersList);
    } catch (error) {
      console.error(
        "Failed to load users",
        error
      );

      setUsers([]);

      showMessage(
        "Unable to load users.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  // FETCH TEAMS
  const fetchTeams = async () => {
    const token = localStorage.getItem("token");

    if (!token) return;

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/api/teams",
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      const teamList = Array.isArray(data)
        ? data
        : [];

      setTeams(teamList);
    } catch (error) {
      console.error(
        "Failed to load teams",
        error
      );
    }
  };

  // SET TEAM LEADER
  const handleSetLeader = async (
    teamId,
    memberId
  ) => {
    try {
      const token = localStorage.getItem("token");

      const response = await fetch(
        `http://127.0.0.1:8000/api/teams/${teamId}/leader`,
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            leader_id: memberId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
          "Could not update team leader."
        );
      }

      await fetchTeams();

      showMessage("New Leader Appointed!");
    } catch (error) {
      console.error(error);

      showMessage(
        error.message ||
        "Failed to set team leader.",
        "error"
      );
    }
  };

  // REMOVE MEMBER
  const handleRemoveMember = async (
    teamId,
    memberId
  ) => {
    try {
      const token = localStorage.getItem("token");

      const response = await fetch(
        `http://127.0.0.1:8000/api/teams/${teamId}/members/${memberId}`,
        {
          method: "DELETE",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
          "Could not remove member."
        );
      }

      await fetchTeams();

      showMessage(
        "Member removed from team."
      );
    } catch (error) {
      console.error(error);

      showMessage(
        error.message ||
        "Failed to remove member.",
        "error"
      );
    }
  };

  // DELETE TEAM
  const handleDeleteTeam = async (
    teamId
  ) => {
    try {
      const token = localStorage.getItem("token");

      const response = await fetch(
        `http://127.0.0.1:8000/api/teams/${teamId}`,
        {
          method: "DELETE",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
          "Could not delete team."
        );
      }

      await fetchTeams();

      showMessage(
        "Team deleted successfully."
      );
    } catch (error) {
      console.error(error);

      showMessage(
        error.message ||
        "Failed to delete team.",
        "error"
      );
    }
  };

  // CREATE PROJECT
  const handleProjectForTeam = (
    teamId
  ) => {
    navigate(
      `/create-project?teamId=${teamId}`
    );
  };

  // OPEN / CLOSE USER MODAL
  const closeModal = () => {
    setIsAddModalOpen(false);
    setAddMemberTeamId(null);

    setNewUser({
      fullName: "",
      email: "",
      password: "",
      role: "member",
    });
  };

  const openAddMemberModal = (teamId) => {
    setAddMemberTeamId(teamId);
    setIsAddModalOpen(true);
  };

  // INPUT CHANGE
  const handleChange = (e) => {
    setNewUser({
      ...newUser,
      [e.target.name]: e.target.value,
    });
  };

  // CREATE USER
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const token = localStorage.getItem("token");

      const response = await fetch(
        "http://127.0.0.1:8000/api/register",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: newUser.fullName,
            email: newUser.email,
            password: newUser.password,
            role: newUser.role,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
          "Failed to create user"
        );
      }

      showMessage(
        "User created successfully"
      );

      fetchUsers();

      closeModal();
    } catch (error) {
      console.error(error);

      showMessage(
        error.message ||
        "Failed to create user",
        "error"
      );
    }
  };

  return (
    <DashboardLayout>
      <div className="manage-team-page">

        {/* HEADER */}

        <div className="manage-team-header">
          <div>
            <h1>Team Management</h1>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
            }}
          >
            <button
              className="create-team-header-btn"
              onClick={() =>
                setIsAddModalOpen(true)
              }
            >
              <MdAdd size={20} />
              Create Team
            </button>
          </div>
        </div>

        {/* MESSAGE */}

        {message && (
          <div
            className={`message-box ${messageType === "error"
                ? "message-error"
                : "message-success"
              }`}
          >
            {message}
          </div>
        )}

        {/* TEAM LIST */}

        <div className="team-list-simple">
          {teams.length === 0 ? (
            <div className="team-card team-preview empty-state">
              <p>
                No teams created yet.
              </p>
            </div>
          ) : (
            teams.map((team) => (
              <div
                key={team.id}
                className="team-card team-preview"
              >
                <div className="team-preview-header">
                  <div className="team-title">
                    <MdPeople size={22} />
                    <h3>{team.name}</h3>
                  </div>

                  <div className="team-actions">
                    <button
                      className="icon-button"
                      title="Edit Team"
                    >
                      <MdEdit />
                    </button>

                    <button
                      className="icon-button"
                      onClick={() =>
                        handleDeleteTeam(
                          team.id
                        )
                      }
                      title="Delete Team"
                    >
                      <MdDelete />
                    </button>
                  </div>
                </div>

                {/* MEMBERS */}

                <div className="team-members-box">
                  <span>
                    TEAM MEMBERS
                  </span>

                  <div className="member-list">
                    {team.members.length ===
                      0 ? (
                      <p className="no-members-note">
                        No members yet.
                      </p>
                    ) : (
                      team.members.map(
                        (member) => {
                          const isLeader =
                            Number(
                              team.leader_id
                            ) ===
                            Number(
                              member.id
                            );

                          return (
                            <div
                              key={
                                member.id
                              }
                              className={`team-member-chip ${isLeader
                                  ? "team-member-chip-leader"
                                  : ""
                                }`}
                            >
                              <button
                                type="button"
                                className={`leader-crown-btn ${isLeader
                                    ? "is-leader"
                                    : ""
                                  }`}
                                onClick={() =>
                                  handleSetLeader(
                                    team.id,
                                    member.id
                                  )
                                }
                              >
                                <Crown
                                  size={18}
                                />
                              </button>

                              <strong>
                                {
                                  member.name
                                }
                              </strong>

                              <button
                                type="button"
                                className="remove-member-btn"
                                onClick={() =>
                                  handleRemoveMember(
                                    team.id,
                                    member.id
                                  )
                                }
                              >
                                &times;
                              </button>
                            </div>
                          );
                        }
                      )
                    )}
                  </div>
                </div>

                <div className="team-card-actions">
                  <button
                    className="add-member-button"
                    onClick={() =>
                      openAddMemberModal(team.id)
                    }
                  >
                    <MdAdd size={18} />
                    Add Member
                  </button>

                  <button
                    className="project-button"
                    onClick={() =>
                      handleProjectForTeam(
                        team.id
                      )
                    }
                  >
                    Create Project
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ADD USER MODAL */}

        {isAddModalOpen && (
          <div className="user-modal-overlay">
            <div className="user-modal-content">

              <div className="user-modal-header">

                <div>
                  <h2>{addMemberTeamId ? "Add Member" : "Add New Team"}</h2>

                  <p className="modal-subtitle">
                    {addMemberTeamId ? "Add a member to this team" : ""}
                  </p>
                </div>

              </div>

              <form
                className="user-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (addMemberTeamId) {
                    showMessage("Member added successfully");
                    closeModal();
                  } else {
                    handleSubmit(e);
                  }
                }}
              >

                {addMemberTeamId ? (
                  <div className="user-form-grid">
                    <div className="form-row">
                      <label>Select User</label>
                      <select
                        name="role"
                        value={newUser.role}
                        onChange={handleChange}
                      >
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="user-form-grid">
                      <div className="form-row">
                        <label>Team Name</label>
                        <input
                          type="text"
                          name="fullName"
                          value={newUser.fullName}
                          onChange={handleChange}
                          placeholder="Enter Team Name"
                        />
                      </div>
                    </div>

                    <div className="user-form-grid">
                      <div className="form-row">
                        <div className="form-row">
                          <label>Select Team</label>
                          <select
                            name="role"
                            value={newUser.role}
                            onChange={handleChange}
                          >
                            <option value="admin">Admin </option>
                            <option value="manager">Manager </option>
                            <option value="team_lead">Team Lead </option>
                            <option value="member"> Member </option>
                          </select>
                        </div>
                        <div className="form-row">
                          <label>Select User</label>
                          <select
                            name="role"
                            value={newUser.role}
                            onChange={handleChange}
                          >
                            <option value="admin">Admin </option>
                            <option value="manager">Manager </option>
                            <option value="team_lead">Team Lead </option>
                            <option value="member"> Member </option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="user-form-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={closeModal}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="primary-button"
                  >
                    {addMemberTeamId ? "Add Member" : "Create User"}
                  </button>
                </div>

              </form>

            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}

export default ManageTeam;