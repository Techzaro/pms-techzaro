import React, { useState, useEffect } from "react";
import UserSelectDropdown from "./UserSelectDropdown";
import { authToken } from "../utils/auth";
import API_URL from "../config/api";

export default function ProjectMembersModal({ isOpen, onClose, project, onSuccess }) {
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [assignedUsers, setAssignedUsers] = useState([]);
  const [viewOnlyUsers, setViewOnlyUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !project) return;

    // Pre-fill state
    const currentTeams = Array.isArray(project.team_ids)
      ? project.team_ids.map(Number)
      : project.team_id
      ? [Number(project.team_id)]
      : [];
    setSelectedTeamIds(currentTeams);

    const currentAssigned = Array.isArray(project.assigned_users)
      ? project.assigned_users.map(Number)
      : (project.members || []).map((m) => Number(m.id));
    setAssignedUsers(currentAssigned);

    const currentViewOnly = Array.isArray(project.view_only_users)
      ? project.view_only_users.map(Number)
      : [];
    setViewOnlyUsers(currentViewOnly);

    // Fetch teams and users
    const token = authToken();
    const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/teams`, { headers })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setTeams(data.data);
        } else if (Array.isArray(data)) {
          setTeams(data);
        }
      })
      .catch(() => {});

    fetch(`${API_URL}/users`, { headers })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setUsers(data.data);
        } else if (Array.isArray(data)) {
          setUsers(data);
        }
      })
      .catch(() => {});
  }, [isOpen, project]);

  if (!isOpen || !project) return null;

  const toggleTeam = (teamId) => {
    const numericId = Number(teamId);
    setSelectedTeamIds((prev) =>
      prev.includes(numericId)
        ? prev.filter((id) => id !== numericId)
        : [...prev, numericId]
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const token = authToken();
      const payload = {
        team_ids: selectedTeamIds,
        assigned_users: assignedUsers,
        view_only_users: viewOnlyUsers,
      };

      const res = await fetch(`${API_URL}/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.message || "Failed to update project members");
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || "An error occurred while saving project members.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cp-overlay" onClick={onClose}>
      <div className="cp-modal" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
        <div className="cp-header">
          <h2>Manage Project Members</h2>
          <button type="button" className="cp-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSave} className="cp-body">
          {error && <div style={{ color: "#ef4444", marginBottom: 12, fontSize: 13 }}>{error}</div>}

          {/* Teams Selection */}
          <div className="cp-field">
            <label>Assigned Teams</label>
            {teams.length === 0 ? (
              <div style={{ fontSize: 12, color: "#888" }}>No teams available</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {teams.map((t) => {
                  const isSelected = selectedTeamIds.includes(Number(t.id));
                  return (
                    <label
                      key={t.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: isSelected ? "1px solid #3b82f6" : "1px solid #e5e7eb",
                        background: isSelected ? "#eff6ff" : "#fff",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTeam(t.id)}
                      />
                      <span>{t.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Assigned Members */}
          <div className="cp-field" style={{ marginTop: 16 }}>
            <label>Assigned Members (Full Access)</label>
            <UserSelectDropdown
              users={users}
              selectedIds={assignedUsers}
              onChange={setAssignedUsers}
              placeholder="Select project members..."
            />
          </div>

          {/* View-Only Users */}
          <div className="cp-field" style={{ marginTop: 16 }}>
            <label>View-Only Users</label>
            <UserSelectDropdown
              users={users}
              selectedIds={viewOnlyUsers}
              onChange={setViewOnlyUsers}
              placeholder="Select view-only users..."
            />
          </div>

          <div className="flex justify-end gap-3 mt-4 border-t pt-4" style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", gap: 12, paddingTop: 16, borderTop: "1px solid var(--border-color, #e5e7eb)" }}>
            <button
              type="button"
              className="px-4 py-2 rounded-md bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium text-sm transition-colors"
              style={{ padding: "8px 16px", borderRadius: 6, background: "var(--bg-secondary, #e5e7eb)", color: "var(--text-dark, #374151)", border: "none", cursor: "pointer", fontWeight: 500 }}
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-md bg-primary hover:bg-primary-dark text-white font-medium text-sm transition-colors"
              style={{ padding: "8px 16px", borderRadius: 6, background: "var(--color-primary, #3b82f6)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 500 }}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Members"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
