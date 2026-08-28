import { useState, useEffect, useRef } from "react";
import { X, Globe, User, Lock, Users, ChevronDown, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { authToken } from "../utils/auth";
import API_URL from "../config/api";
import { showSuccessMessage } from "../utils/notify";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";

export default function AddAccessModal({ isOpen, onClose, projectId, taskId, projectName, onSuccess, files = [], credential }) {
  const { t } = useTranslation();
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
  useEscapeKey(isOpen, handleClose);

  const [websiteName, setWebsiteName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [assignedUserIds, setAssignedUserIds] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [aamSearch, setAamSearch] = useState("");
  const [aamHighlightedIndex, setAamHighlightedIndex] = useState(0);
  const dropdownRef = useRef(null);
  const aamListRef = useRef(null);
  const aamInputRef = useRef(null);
  const [pendingRemoveUser, setPendingRemoveUser] = useState(null);

  const isEdit = !!credential;

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      if (credential) {
        setWebsiteName(credential.website_name || "");
        setUsername(credential.username || "");
        setPassword(credential.password || "");
        setAssignedUserIds((credential.assigned_users || []).map((u) => u.id));
      } else {
        resetForm();
      }
    }
  }, [isOpen, credential]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const resetForm = () => {
    setWebsiteName("");
    setUsername("");
    setPassword("");
    setAssignedUserIds([]);
    setError(null);
    setDropdownOpen(false);
    setAamSearch("");
    setAamHighlightedIndex(0);
  };

  const fetchUsers = async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/team-users`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setUsers(data.users || data || []);
    } catch (err) {
      console.error("Fetch users error:", err);
      setUsers([]);
    }
  };

  const toggleUser = (userId) => {
    setIsDirty(true);
    setAssignedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const aamFilteredUsers = users.filter((u) => {
    if (!aamSearch.trim()) return true;
    const q = aamSearch.toLowerCase();
    return u.name?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q) || u.department?.toLowerCase().includes(q);
  });

  useEffect(() => {
    setAamHighlightedIndex(0);
  }, [aamSearch, dropdownOpen]);

  useEffect(() => {
    if (dropdownOpen && aamListRef.current) {
      const el = aamListRef.current.children[aamHighlightedIndex];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [aamHighlightedIndex, dropdownOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim() || assignedUserIds.length === 0) {
      setError("Please fill all required fields and assign at least one user.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = authToken();
      const isEdit = !!credential;
      let endpoint;
      if (isEdit) {
        endpoint = taskId
          ? `${API_URL}/tasks/${taskId}/access-credentials/${credential.id}`
          : `${API_URL}/projects/${projectId}/access-credentials/${credential.id}`;
      } else {
        endpoint = taskId
          ? `${API_URL}/tasks/${taskId}/access-credentials`
          : `${API_URL}/projects/${projectId}/access-credentials`;
      }
      const res = await fetch(endpoint, {
        method: isEdit ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          website_name: websiteName.trim(),
          username: username.trim(),
          password: password,
          assigned_user_ids: assignedUserIds,
        }),
        _notifHandled: true,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `Failed to ${isEdit ? "update" : "create"} access credential`);

      onSuccess?.();
      showSuccessMessage("Access credential", isEdit ? "updated" : "created");
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="aam-modal" onClick={(e) => e.stopPropagation()}>
        <div className="aam-header">
          <h3>{isEdit ? t("Edit Access Credential", { defaultValue: "Edit Access Credential" }) : t("Add Access Credential", { defaultValue: "Add Access Credential" })}</h3>
          <span className="aam-project-name">{projectName}</span>
          <button className="aam-close" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="aam-body">
          {error && <div className="aam-error">{error}</div>}

          <div className="aam-field">
            <label>
              <Globe size={14} /> {t("Website Name", { defaultValue: "Website Name" })}
            </label>
            <input
              type="text"
              placeholder={t("Enter website name or URL", { defaultValue: "Enter website name or URL" })}
              value={websiteName}
              onChange={(e) => { setIsDirty(true); setWebsiteName(e.target.value); }}
            />
          </div>

          <div className="aam-field">
            <label>
              <User size={14} /> {t("Username / Email", { defaultValue: "Username / Email" })} *
            </label>
            <input
              type="text"
              placeholder={t("Enter username or email", { defaultValue: "Enter username or email" })}
              value={username}
              onChange={(e) => { setIsDirty(true); setUsername(e.target.value); }}
              required
            />
          </div>

          <div className="aam-field">
            <label>
              <Lock size={14} /> {t("Password", { defaultValue: "Password" })} *
            </label>
            <div className="aam-password-wrap">
              <input
                type="password"
                placeholder={t("Enter password", { defaultValue: "Enter password" })}
                value={password}
                onChange={(e) => { setIsDirty(true); setPassword(e.target.value); }}
                required
              />
            </div>
          </div>

          <div className="aam-field">
            <label>
              <Users size={14} /> {t("Assign To")} *
            </label>
            <p className="aam-hint">{t("Select users who can see this credential", { defaultValue: "Select users who can see this credential" })}</p>
            <div className="aam-multiselect" ref={dropdownRef}>
              <div className={`aam-multiselect-trigger aam-combo-trigger ${dropdownOpen ? "aam-multiselect-trigger--open" : ""}`} onClick={() => { if (!dropdownOpen) { setDropdownOpen(true); } }}>
                {assignedUserIds.length > 0 && (
                  <span className="aam-combo-count">{assignedUserIds.length} {t("selected")}</span>
                )}
                {assignedUserIds.length === 0 && !dropdownOpen && (
                  <span className="aam-combo-placeholder">{t("Select users", { defaultValue: "Select users" })}</span>
                )}
                {dropdownOpen && (
                  <input
                    type="text"
                    className="aam-combo-input"
                    placeholder={t("Search by user name...", { defaultValue: "Search by user name..." })}
                    value={aamSearch}
                    onChange={(e) => { setAamSearch(e.target.value); }}
                    onFocus={() => setDropdownOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") { setAamSearch(""); setDropdownOpen(false); setAamHighlightedIndex(0); }
                      else if (e.key === "ArrowDown") { e.preventDefault(); setAamHighlightedIndex((prev) => (prev < aamFilteredUsers.length + 1 ? prev + 1 : 0)); }
                      else if (e.key === "ArrowUp") { e.preventDefault(); setAamHighlightedIndex((prev) => (prev > 0 ? prev - 1 : aamFilteredUsers.length + 1)); }
                      else if (e.key === "Enter") {
                        e.preventDefault();
                        if (aamHighlightedIndex === 0) {
                          setIsDirty(true);
                          if (assignedUserIds.length === users.length) { setAssignedUserIds([]); } else { setAssignedUserIds(users.map((u) => u.id)); }
                        } else if (aamFilteredUsers[aamHighlightedIndex - 1]) {
                          setIsDirty(true);
                          toggleUser(aamFilteredUsers[aamHighlightedIndex - 1].id);
                        }
                      }
                    }}
                    ref={aamInputRef}
                    autoFocus
                  />
                )}
                <ChevronDown
                  size={16}
                  className={`aam-multiselect-arrow ${dropdownOpen ? "aam-multiselect-arrow--open" : ""}`}
                  onClick={(e) => { e.stopPropagation(); setDropdownOpen(!dropdownOpen); }}
                />
              </div>
              {dropdownOpen && (
                <div className="aam-multiselect-dropdown">
                  <div className="aam-multiselect-search">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    <input
                      type="text"
                      placeholder={t("Search by name, role, department...", { defaultValue: "Search by name, role, department..." })}
                      value={aamSearch}
                      onChange={(e) => setAamSearch(e.target.value)}
                      autoFocus
                    />
                    {aamSearch && <button type="button" className="aam-multiselect-search-clear" onClick={() => setAamSearch("")}>✕</button>}
                  </div>
                  <div ref={aamListRef}>
                    <label className={`aam-multiselect-option ${aamHighlightedIndex === 0 ? "aam-multiselect-option--highlighted" : ""}`} onClick={(e) => e.stopPropagation()} onMouseEnter={() => setAamHighlightedIndex(0)}>
                      <input
                        type="checkbox"
                        checked={assignedUserIds.length === users.length && users.length > 0}
                        onChange={() => {
                          setIsDirty(true);
                          if (assignedUserIds.length === users.length) {
                            setAssignedUserIds([]);
                          } else {
                            setAssignedUserIds(users.map((u) => u.id));
                          }
                        }}
                      />
                      <span className="aam-multiselect-label">{t("Select All")}</span>
                    </label>
                    <div className="aam-multiselect-divider" />
                    {aamFilteredUsers
                      .map((u, idx) => (
                      <label key={u.id} className={`aam-multiselect-option ${aamHighlightedIndex === idx + 1 ? "aam-multiselect-option--highlighted" : ""}`} onClick={(e) => e.stopPropagation()} onMouseEnter={() => setAamHighlightedIndex(idx + 1)}>
                        <input
                          type="checkbox"
                          checked={assignedUserIds.includes(u.id)}
                          onChange={() => { setIsDirty(true); toggleUser(u.id); }}
                        />
                        <span className="aam-multiselect-check">
                          {assignedUserIds.includes(u.id) && <Check size={12} />}
                        </span>
                        <div className="aam-multiselect-info">
                          <span className="aam-multiselect-label">{u.name}</span>
                          <div className="aam-multiselect-badges">
                            {u.role && <span className="aam-multiselect-role">{u.role.replace("_", " ")}</span>}
                            {u.department && <span className="aam-multiselect-dept">{u.department}</span>}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {assignedUserIds.length > 0 && (
              <div className="aam-selected-tags">
                {assignedUserIds.map((id) => {
                  const u = users.find((usr) => usr.id === id);
                  if (!u) return null;
                  if (pendingRemoveUser === id) {
                    return (
                      <span key={id} className="aam-tag aam-tag--confirm">
                        <span className="aam-tag-confirm-msg">{t("Remove {{name}}?", { name: u.name, defaultValue: `Remove ${u.name}?` })}</span>
                        <button type="button" className="aam-tag-confirm-yes" onClick={() => { toggleUser(id); setPendingRemoveUser(null); }}>{t("Yes", { defaultValue: "Yes" })}</button>
                        <button type="button" className="aam-tag-confirm-no" onClick={() => setPendingRemoveUser(null)}>{t("No", { defaultValue: "No" })}</button>
                      </span>
                    );
                  }
                  return (
                    <span key={id} className="aam-tag">
                      {u.name}
                      <button type="button" onClick={() => setPendingRemoveUser(id)}>
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="aam-footer">
            <button type="button" className="aam-btn aam-btn-cancel" onClick={handleClose}>
              {t("Cancel")}
            </button>
            <button type="submit" className="aam-btn aam-btn-save" disabled={loading}>
              {loading ? (isEdit ? t("Updating...", { defaultValue: "Updating..." }) : t("Saving...", { defaultValue: "Saving..." })) : (isEdit ? t("Update Credential", { defaultValue: "Update Credential" }) : t("Save Credential", { defaultValue: "Save Credential" }))}
            </button>
          </div>
        </form>
      </div>
      {ConfirmDialog}
    </div>
  );
}
