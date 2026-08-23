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

    // Pre-populate users from project if available
    const existingUsers = [
      ...(Array.isArray(project.members) ? project.members : []),
      ...(Array.isArray(project.view_only_users) ? project.view_only_users : []),
      ...(project.creator ? [project.creator] : []),
    ];
    if (existingUsers.length > 0) {
      setUsers((prev) => (prev.length === 0 ? existingUsers : prev));
    }

    // Fetch teams and users
    const token = authToken();
    const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/teams`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : (data.data || data.teams || []);
        if (Array.isArray(list) && list.length > 0) {
          setTeams(list);
        }
      })
      .catch(() => {});

    fetch(`${API_URL}/team-users`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : (data.users || data.data || []);
        if (Array.isArray(list) && list.length > 0) {
          setUsers(list);
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
        team_ids: (selectedTeamIds || []).map((t) => Number(typeof t === "object" ? t.id : t)).filter((id) => !isNaN(id) && id > 0),
        assigned_users: (assignedUsers || []).map((u) => Number(typeof u === "object" ? u.id : u)).filter((id) => !isNaN(id) && id > 0),
        view_only_users: (viewOnlyUsers || []).map((u) => Number(typeof u === "object" ? u.id : u)).filter((id) => !isNaN(id) && id > 0),
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
        const errorMsg = data.errors ? Object.values(data.errors).flat().join(". ") : data.message;
        throw new Error(errorMsg || "Failed to update project members");
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

        <form onSubmit={handleSave} className="cp-body" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {error && <div style={{ color: "#ef4444", padding: "8px 12px", background: "#fef2f2", borderRadius: "6px", fontSize: 13, border: "1px solid #fecaca" }}>{error}</div>}

          {/* Teams Selection */}
          <div className="cp-field" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-dark, #1f2937)" }}>Assigned Teams</label>
            {teams.length === 0 ? (
              <div style={{ fontSize: 13, color: "#888", fontStyle: "italic" }}>No teams available</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
                {teams.map((t) => {
                  const isSelected = selectedTeamIds.includes(Number(t.id));
                  return (
                    <label
                      key={t.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 14px",
                        borderRadius: 20,
                        border: isSelected ? "1px solid var(--color-primary, #3b82f6)" : "1px solid var(--border-color, #e5e7eb)",
                        background: isSelected ? "var(--color-primary-bg, #eff6ff)" : "var(--bg-card, #fff)",
                        color: isSelected ? "var(--color-primary, #2563eb)" : "var(--text-dark, #374151)",
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: isSelected ? 600 : 500,
                        transition: "all 0.15s ease",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTeam(t.id)}
                        style={{ accentColor: "var(--color-primary, #3b82f6)" }}
                      />
                      <span>{t.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Assigned Members */}
          <div className="cp-field" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-dark, #1f2937)" }}>Assigned Members (Full Access)</label>
            <UserSelectDropdown
              users={users}
              selectedIds={assignedUsers}
              onChange={setAssignedUsers}
              placeholder="Select project members..."
            />
          </div>

          {/* View-Only Users */}
          <div className="cp-field" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-dark, #1f2937)" }}>View-Only Users</label>
            <UserSelectDropdown
              users={users}
              selectedIds={viewOnlyUsers}
              onChange={setViewOnlyUsers}
              placeholder="Select view-only users..."
            />
          </div>

          <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, paddingTop: 16, borderTop: "1px solid var(--border-color, #e5e7eb)" }}>
            <button
              type="button"
              style={{ padding: "8px 18px", borderRadius: 6, background: "var(--bg-secondary, #f3f4f6)", color: "var(--text-dark, #374151)", border: "1px solid var(--border-color, #e5e7eb)", cursor: "pointer", fontWeight: 500, fontSize: 14 }}
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{ padding: "8px 20px", borderRadius: 6, background: "var(--color-primary, #3b82f6)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
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
