/**
 * CreateTeamModal.jsx
 * Modal component for creating a new team or editing an existing team.
 * Supports auto-saving drafts, resuming drafts in-place, leader assignment,
 * and saving drafts without strict frontend validations.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { MdExpandMore } from "react-icons/md";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useDraftGuard from "../hooks/useDraftGuard";
import useAutoSave from "../hooks/useAutoSave";
import AutoSaveIndicator from "./AutoSaveIndicator";
import LoadingButton from "./LoadingButton";
import RichTextEditor from "./RichTextEditor";
import { publish } from "../utils/eventBus";
import { notify, showSuccessMessage } from "../utils/notify";
import { useSubmit } from "../hooks/useSubmit";
import "../pages/ManageTeam.css";

const CreateTeamModal = ({
  isOpen = true,
  onClose,
  onSuccess,
  restoreDraftId = null,
  draftData = null,
  editingTeam = null,
  users: initialUsers = [],
}) => {
  const { t } = useTranslation();
  const { submitting, run } = useSubmit();

  const [users, setUsers] = useState(initialUsers);
  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [selectedLeaderId, setSelectedLeaderId] = useState(null);
  const [activeDraftId, setActiveDraftId] = useState(restoreDraftId);

  const [isMemberDropdownOpen, setIsMemberDropdownOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberHighlightedIndex, setMemberHighlightedIndex] = useState(0);
  const memberListRef = useRef(null);

  // Fetch users if not provided
  useEffect(() => {
    if (initialUsers && initialUsers.length > 0) {
      setUsers(initialUsers);
      return;
    }
    const fetchUsers = async () => {
      try {
        const token = authToken();
        if (!token) return;
        const res = await fetch(`${API_URL}/users?per_page=1000`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          skipLoader: true,
        });
        if (!res.ok) return;
        const data = await res.json();
        const userList = Array.isArray(data) ? data : (data?.data || data?.users || []);
        setUsers(userList);
      } catch {}
    };
    fetchUsers();
  }, [initialUsers]);

  // Initialize draft data or editing team
  useEffect(() => {
    if (draftData) {
      setActiveDraftId(restoreDraftId);
      setTeamName(draftData.name || draftData.title || "");
      setTeamDescription(draftData.description || "");

      let memberIds = [];
      if (Array.isArray(draftData.member_ids)) {
        memberIds = draftData.member_ids.map(Number);
      } else if (Array.isArray(draftData.members)) {
        memberIds = draftData.members.map((m) => (typeof m === "object" ? Number(m.id) : Number(m)));
      }
      setSelectedMemberIds(memberIds);

      const leaderId = draftData.leader_id || draftData.team_lead_id || null;
      setSelectedLeaderId(leaderId ? Number(leaderId) : null);
    } else if (editingTeam) {
      setTeamName(editingTeam.name || "");
      setTeamDescription(editingTeam.description || "");

      let memberIds = [];
      if (Array.isArray(editingTeam.members)) {
        memberIds = editingTeam.members.map((m) => (typeof m === "object" ? Number(m.id) : Number(m)));
      } else if (Array.isArray(editingTeam.member_ids)) {
        memberIds = editingTeam.member_ids.map(Number);
      }
      setSelectedMemberIds(memberIds);

      const leaderId = editingTeam.leader_id || (editingTeam.leader ? editingTeam.leader.id : null);
      setSelectedLeaderId(leaderId ? Number(leaderId) : null);
    }
  }, [draftData, restoreDraftId, editingTeam]);

  // Draft Guard and Dirty tracking
  const draftSaveRef = useRef(null);
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useDraftGuard(onClose, {
    draftSaveHandler: () => draftSaveRef.current?.(),
    hasDraftFeature: true,
  });

  useEscapeKey(isOpen, handleClose);

  const userInteractedRef = useRef(false);
  useEffect(() => {
    const markInteracted = () => { userInteractedRef.current = true; };
    window.addEventListener("keydown", markInteracted, { once: true, capture: true });
    window.addEventListener("mousedown", markInteracted, { once: true, capture: true });
    return () => {
      window.removeEventListener("keydown", markInteracted, { capture: true });
      window.removeEventListener("mousedown", markInteracted, { capture: true });
    };
  }, []);

  const markDirty = useCallback(() => {
    if (userInteractedRef.current) setIsDirty(true);
  }, [setIsDirty]);

  // Build draft payload for auto-save
  const buildDraftBody = useCallback(() => ({
    name: teamName,
    title: teamName || "Untitled Team Draft",
    description: teamDescription,
    member_ids: selectedMemberIds,
    leader_id: selectedLeaderId,
    team_lead_id: selectedLeaderId,
    original_record_id: editingTeam?.id || null,
  }), [teamName, teamDescription, selectedMemberIds, selectedLeaderId, editingTeam]);

  const { lastSaved, isSaving, saveNow } = useAutoSave({
    draftId: activeDraftId,
    formData: buildDraftBody(),
    moduleType: "team",
    enabled: isDirty,
  });

  // Member selection helpers
  const toggleMemberSelection = (userId) => {
    markDirty();
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleSelectAllMembers = () => {
    markDirty();
    if (selectedMemberIds.length === users.length) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(users.map((u) => u.id));
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!memberSearch.trim()) return true;
    const q = memberSearch.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q) ||
      u.department?.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    setMemberHighlightedIndex(0);
  }, [isMemberDropdownOpen, memberSearch]);

  useEffect(() => {
    if (isMemberDropdownOpen && memberListRef.current) {
      const el = memberListRef.current.children[memberHighlightedIndex];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [memberHighlightedIndex, isMemberDropdownOpen]);

  // Submission handler
  const handleSubmit = async (e, options = {}) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    const isDraft = typeof options === "object" && options !== null && options.isDraft === true;

    // Strict validation ONLY when publishing / not saving draft
    if (!isDraft) {
      if (!teamName.trim()) {
        notify.error(t("Team Name is required.", { defaultValue: "Team Name is required." }));
        return;
      }
      if (!selectedMemberIds || selectedMemberIds.length === 0) {
        notify.error(t("At least one team member is required.", { defaultValue: "At least one team member is required." }));
        return;
      }
      if (selectedLeaderId && !selectedMemberIds.includes(Number(selectedLeaderId))) {
        notify.error(t("Team leader must be one of the team members.", { defaultValue: "Team leader must be one of the team members." }));
        return;
      }
    }

    const payload = {
      name: teamName.trim() || (isDraft ? (editingTeam?.name || "Untitled Team Draft") : ""),
      description: teamDescription,
      member_ids: selectedMemberIds,
      leader_id: selectedLeaderId,
      team_lead_id: selectedLeaderId,
    };

    if (isDraft) {
      payload.is_draft = true;
      payload.status = "draft";
      if (activeDraftId) payload.draft_id = activeDraftId;
    }

    await run(async () => {
      const token = authToken();
      const isEdit = !!editingTeam?.id;
      const url = isEdit ? `${API_URL}/teams/${editingTeam.id}` : `${API_URL}/teams`;
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify(payload),
        _notifHandled: true,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || (isEdit ? t("Failed to update team", { defaultValue: "Failed to update team" }) : t("Failed to create team", { defaultValue: "Failed to create team" })));
      }

      if (data.is_draft || isDraft) {
        notify.success(t("Draft saved successfully", { defaultValue: "Draft saved successfully" }));
        publish("data:changed", { type: "draft", action: isEdit ? "updated" : "created" });
        publish("drafts:changed");
        if (onClose) onClose();
        return;
      }

      showSuccessMessage("Team", isEdit ? "updated" : "created");
      publish("data:changed", { type: "team", action: isEdit ? "updated" : "created" });
      publish("drafts:changed");
      if (onSuccess) onSuccess(data.team || data);
      else if (onClose) onClose();
    });
  };

  const handleSaveDraft = useCallback(async () => {
    if (typeof saveNow === "function") {
      draftSaveRef.current = saveNow;
      await saveNow();
    }
    await handleSubmit(null, { isDraft: true });
  }, [saveNow, handleSubmit]);

  if (!isOpen) return null;

  return (
    <>
      {createPortal(
        <div className="mt-modal-overlay" onClick={handleClose}>
          <div className="mt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mt-modal-header">
              <div>
                <h2>{editingTeam ? t("Edit Team", { defaultValue: "Edit Team" }) : t("Add New Team", { defaultValue: "Add New Team" })}</h2>
                <p className="mt-modal-sub">
                  {editingTeam
                    ? t("Update team name, description and members", { defaultValue: "Update team name, description and members" })
                    : t("Create a new team and add members", { defaultValue: "Create a new team and add members" })}
                </p>
              </div>
              <div className="mt-header-actions" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <AutoSaveIndicator isSaving={isSaving} lastSaved={lastSaved} />
                <button className="mt-modal-close" onClick={handleClose}>
                  &#10005;
                </button>
              </div>
            </div>

            <form style={{ width: "100%" }} className="mt-modal-form" onSubmit={(e) => handleSubmit(e, { isDraft: false })}>
              <div style={{ width: "100%", marginBottom: "20px" }}>
                <label className="mt-field-label">
                  {t("Team Name", { defaultValue: "Team Name" })} <span className="text-danger" style={{ color: "#ef4444" }}>*</span>
                </label>
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
                  onChange={(e) => {
                    markDirty();
                    setTeamName(e.target.value);
                  }}
                  placeholder={t("Enter Team Name", { defaultValue: "Enter Team Name" })}
                />
              </div>

              <div style={{ width: "100%", marginBottom: "20px" }}>
                <label className="mt-field-label">{t("Description", { defaultValue: "Description" })}</label>
                <RichTextEditor
                  value={teamDescription}
                  onChange={(val) => {
                    markDirty();
                    setTeamDescription(val);
                  }}
                  placeholder={t("Enter team description (optional)", { defaultValue: "Enter team description (optional)" })}
                />
              </div>

              <div style={{ width: "100%", marginBottom: "20px" }}>
                <label className="mt-field-label">
                  {t("Select Members", { defaultValue: "Select Members" })} <span className="text-danger" style={{ color: "#ef4444" }}>*</span>
                </label>
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
                  onClick={() => {
                    if (!isMemberDropdownOpen) {
                      setIsMemberDropdownOpen(true);
                      setMemberSearch("");
                    }
                  }}
                >
                  {selectedMemberIds.length > 0 && (
                    <span className="mt-combo-count">{t("{{count}} selected", { count: selectedMemberIds.length })}</span>
                  )}
                  {selectedMemberIds.length === 0 && !isMemberDropdownOpen && (
                    <span className="mt-combo-placeholder">{t("Click to select members", { defaultValue: "Click to select members" })}</span>
                  )}
                  {isMemberDropdownOpen && (
                    <input
                      type="text"
                      className="mt-combo-input"
                      placeholder={t("Search by member name, role, or department...", { defaultValue: "Search by member name, role, or department..." })}
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      onFocus={() => setIsMemberDropdownOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setMemberSearch("");
                          setIsMemberDropdownOpen(false);
                          setMemberHighlightedIndex(0);
                        } else if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setMemberHighlightedIndex((p) => (p < filteredUsers.length ? p + 1 : 0));
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setMemberHighlightedIndex((p) => (p > 0 ? p - 1 : filteredUsers.length));
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          if (memberHighlightedIndex === 0) {
                            toggleSelectAllMembers();
                          } else if (filteredUsers[memberHighlightedIndex - 1]) {
                            toggleMemberSelection(filteredUsers[memberHighlightedIndex - 1].id);
                          }
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
                      marginLeft: "auto",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMemberDropdownOpen(!isMemberDropdownOpen);
                      setMemberSearch("");
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
                        {t("Select All", { defaultValue: "Select All" })}
                      </label>
                      {selectedMemberIds.length > 0 && (
                        <span className="mt-dropdown-count">{t("{{count}} selected", { count: selectedMemberIds.length })}</span>
                      )}
                    </div>
                    <div className="mt-dropdown-items" ref={memberListRef}>
                      {users.length === 0 ? (
                        <p className="mt-dropdown-empty">{t("No users available.", { defaultValue: "No users available." })}</p>
                      ) : (
                        <>
                          <div
                            className={`mt-dropdown-item ${memberHighlightedIndex === 0 ? "mt-dropdown-item--highlighted" : ""}`}
                            onMouseEnter={() => setMemberHighlightedIndex(0)}
                            style={{ cursor: "pointer" }}
                          >
                            <label className="mt-dropdown-item" style={{ margin: 0 }}>
                              <input
                                type="checkbox"
                                checked={users.length > 0 && selectedMemberIds.length === users.length}
                                onChange={toggleSelectAllMembers}
                              />
                              {t("Select All", { defaultValue: "Select All" })}
                            </label>
                          </div>
                          {filteredUsers.map((user, idx) => (
                            <label
                              key={user.id}
                              className={`mt-dropdown-item ${memberHighlightedIndex === idx + 1 ? "mt-dropdown-item--highlighted" : ""}`}
                              onMouseEnter={() => setMemberHighlightedIndex(idx + 1)}
                            >
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
                  <label className="mt-field-label">{t("Select Team Lead (Optional)", { defaultValue: "Select Team Lead (Optional)" })}</label>
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
                    onChange={(e) => {
                      markDirty();
                      setSelectedLeaderId(e.target.value ? Number(e.target.value) : null);
                    }}
                  >
                    <option value="">{t("No leader selected", { defaultValue: "No leader selected" })}</option>
                    {users
                      .filter((u) => selectedMemberIds.includes(u.id))
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role === "teamlead" ? t("Team Lead", { defaultValue: "Team Lead" }) : u.role})
                          {u.department ? ` - ${u.department}` : ""}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className="mt-modal-actions">
                <button type="button" className="mt-btn-cancel" onClick={handleClose}>
                  {t("Cancel", { defaultValue: "Cancel" })}
                </button>
                <button
                  type="button"
                  className="mt-btn-cancel"
                  style={{ border: "1px solid var(--border-color)", background: "var(--bg-hover)", color: "var(--text-primary)" }}
                  onClick={handleSaveDraft}
                  disabled={submitting}
                >
                  {t("Save as Draft", { defaultValue: "Save as Draft" })}
                </button>
                <LoadingButton type="submit" className="mt-btn-primary" loading={submitting}>
                  {editingTeam ? t("Update Team", { defaultValue: "Update Team" }) : t("Create Team", { defaultValue: "Create Team" })}
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      {ConfirmDialog}
    </>
  );
};

export default CreateTeamModal;
