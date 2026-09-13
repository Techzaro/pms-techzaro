import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import UserSelectDropdown from "./UserSelectDropdown";
import { authToken } from "../utils/auth";
import API_URL from "../config/api";

export default function ProjectMembersModal({ isOpen, onClose, project, onSuccess }) {
  const { t } = useTranslation();
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [assignedUsers, setAssignedUsers] = useState([]);
  const [viewOnlyUsers, setViewOnlyUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [originalMembersInfo, setOriginalMembersInfo] = useState([]);

  const isShared = project && (String(project.id || "").startsWith("shared_") || project.is_shared === true);
  const sharedResourceId = isShared ? String(project.shared_resource_id || project.id).replace("shared_", "") : null;
  const isCollaborate = isShared && project?.shared_permission === "collaborate";

  useEffect(() => {
    if (!isOpen || !project) return;

    const token = authToken();
    const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };

    if (isShared && isCollaborate) {
      setUsers([]);
      setAssignedUsers([]);
      setOriginalMembersInfo([]);

      fetch(`${API_URL}/sharing/resources/${sharedResourceId}/members`, { headers })
        .then((res) => (res.ok ? res.json() : { members: [], shared_members: [] }))
        .then((d) => {
          const originalMembers = Array.isArray(d?.members) ? d.members : [];
          const sharedMembers = Array.isArray(d?.shared_members) ? d.shared_members : [];
          setOriginalMembersInfo(originalMembers);
          setAssignedUsers(sharedMembers.map((m) => m.id));
          setUsers(sharedMembers.map((u) => ({
            ...u,
            _originalId: u.id,
            _source: "added",
          })));
        })
        .catch(() => {});

      fetch(`${API_URL}/team-users`, { headers })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          const list = Array.isArray(data) ? data : (data.users || data.data || []);
          if (Array.isArray(list) && list.length > 0) {
            setUsers((prev) => {
              const existingIds = new Set(prev.map((u) => String(u.id)));
              const newUsers = list.filter((u) => !existingIds.has(String(u.id)));
              return [...prev, ...newUsers];
            });
          }
        })
        .catch(() => {});
    } else {
      // Local project: pre-fill state
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

      const existingUsers = [
        ...(Array.isArray(project.members) ? project.members : []),
        ...(Array.isArray(project.view_only_users) ? project.view_only_users : []),
        ...(project.creator ? [project.creator] : []),
      ];
      if (existingUsers.length > 0) {
        setUsers((prev) => (prev.length === 0 ? existingUsers : prev));
      }

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
    }
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
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      };

      if (isShared && isCollaborate) {
        const userIds = assignedUsers
          .map((u) => {
            if (typeof u === "object") return u._originalId || u.id;
            return parseInt(String(u), 10);
          })
          .filter((id) => !isNaN(id) && id > 0);

        const res = await fetch(`${API_URL}/sharing/resources/${sharedResourceId}/members`, {
          method: "POST",
          headers,
          body: JSON.stringify({ user_ids: userIds }),
        });

        const data = await res.json();
        if (!res.ok || data.success === false) {
          throw new Error(data.message || t("Failed to update members", { defaultValue: "Failed to update members" }));
        }
        // If added > 0 or all were skipped (already members), it's a success
        if (data.added === 0 && (!data.errors || data.errors.length === 0)) {
          // Either all skipped (already members) or no new members — still success
        } else if (data.added === 0 && data.errors && data.errors.length > 0) {
          setError(data.errors.join(". "));
          setSaving(false);
          return;
        }
      } else if (isShared && !isCollaborate) {
        // Shared project without collaborate permission — cannot update members
        throw new Error(t("You don't have permission to edit members on this shared project.", { defaultValue: "You don't have permission to edit members on this shared project." }));
      } else {
        // Local project
        const payload = {
          team_ids: (selectedTeamIds || []).map((t) => Number(typeof t === "object" ? t.id : t)).filter((id) => !isNaN(id) && id > 0),
          assigned_users: (assignedUsers || []).map((u) => Number(typeof u === "object" ? u.id : u)).filter((id) => !isNaN(id) && id > 0),
          view_only_users: (viewOnlyUsers || []).map((u) => Number(typeof u === "object" ? u.id : u)).filter((id) => !isNaN(id) && id > 0),
        };

        const res = await fetch(`${API_URL}/projects/${project.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok || data.success === false) {
          const errorMsg = data.errors ? Object.values(data.errors).flat().join(". ") : data.message;
          throw new Error(errorMsg || t("Failed to update project members", { defaultValue: "Failed to update project members" }));
        }
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || t("An error occurred while saving project members.", { defaultValue: "An error occurred while saving project members." }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cp-overlay" onClick={onClose}>
      <div className="cp-modal" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
        <div className="cp-header">
          <h2>{isShared && isCollaborate
            ? t("Manage Shared Project Members", { defaultValue: "Manage Shared Project Members" })
            : t("Manage Project Members", { defaultValue: "Manage Project Members" })
          }</h2>
          <button type="button" className="cp-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSave} className="cp-body" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {error && <div style={{ color: "#ef4444", padding: "8px 12px", background: "#fef2f2", borderRadius: "6px", fontSize: 13, border: "1px solid #fecaca" }}>{error}</div>}

          {isShared && isCollaborate && (
            <div style={{ fontSize: 13, color: "#6b7280", padding: "8px 12px", background: "#f0f9ff", borderRadius: "6px", border: "1px solid #bae6fd" }}>
              {t("Add your organization's users as members. They will be able to be assigned tasks in this shared project.", { defaultValue: "Add your organization's users as members. They will be able to be assigned tasks in this shared project." })}
            </div>
          )}

          {isShared && isCollaborate && originalMembersInfo.length > 0 && (
            <div style={{ fontSize: 13, color: "#374151", padding: "8px 12px", background: "#f9fafb", borderRadius: "6px", border: "1px solid #e5e7eb" }}>
              <span style={{ fontWeight: 600 }}>{t("Original Members", { defaultValue: "Original Members" })}: </span>
              {originalMembersInfo.map((m, i) => (
                <span key={m.id}>
                  {m.name}{i < originalMembersInfo.length - 1 ? ", " : ""}
                </span>
              ))}
              <span style={{ color: "#9ca3af", marginLeft: 4 }}>({t("read-only", { defaultValue: "read-only" })})</span>
            </div>
          )}

          {/* Teams Selection - only for local projects */}
          {!isShared && (
            <div className="cp-field" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-dark, #1f2937)" }}>{t("Assigned Teams", { defaultValue: "Assigned Teams" })}</label>
              {teams.length === 0 ? (
                <div style={{ fontSize: 13, color: "#888", fontStyle: "italic" }}>{t("No teams available", { defaultValue: "No teams available" })}</div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
                  {teams.map((tItem) => {
                    const isSelected = selectedTeamIds.includes(Number(tItem.id));
                    return (
                      <label
                        key={tItem.id}
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
                          onChange={() => toggleTeam(tItem.id)}
                          style={{ accentColor: "var(--color-primary, #3b82f6)" }}
                        />
                        <span>{tItem.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Assigned Members */}
          <div className="cp-field" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-dark, #1f2937)" }}>
              {isShared && isCollaborate
                ? t("Add Members From Your Organization", { defaultValue: "Add Members From Your Organization" })
                : t("Assigned Members (Full Access)", { defaultValue: "Assigned Members (Full Access)" })
              }
            </label>
            <UserSelectDropdown
              users={users}
              selectedIds={assignedUsers}
              onChange={setAssignedUsers}
              placeholder={t("Select project members...", { defaultValue: "Select project members..." })}
              onBeforeRemove={isShared && isCollaborate ? true : undefined}
              autoOpen={isShared && isCollaborate}
            />
          </div>

          {/* View-Only Users - only for local projects */}
          {!isShared && (
            <div className="cp-field" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-dark, #1f2937)" }}>{t("View-Only Users", { defaultValue: "View-Only Users" })}</label>
              <UserSelectDropdown
                users={users}
                selectedIds={viewOnlyUsers}
                onChange={setViewOnlyUsers}
                placeholder={t("Select view-only users...", { defaultValue: "Select view-only users..." })}
              />
            </div>
          )}

          <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, paddingTop: 16, borderTop: "1px solid var(--border-color, #e5e7eb)" }}>
            <button
              type="button"
              style={{ padding: "8px 18px", borderRadius: 6, background: "var(--bg-secondary, #f3f4f6)", color: "var(--text-dark, #374151)", border: "1px solid var(--border-color, #e5e7eb)", cursor: "pointer", fontWeight: 500, fontSize: 14 }}
              onClick={onClose}
              disabled={saving}
            >
              {t("Cancel")}
            </button>
            {(!isShared || isCollaborate) && (
              <button
                type="submit"
                style={{ padding: "8px 20px", borderRadius: 6, background: "var(--color-primary, #3b82f6)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
                disabled={saving}
              >
                {saving ? t("Saving...", { defaultValue: "Saving..." }) : t("Save Members", { defaultValue: "Save Members" })}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
