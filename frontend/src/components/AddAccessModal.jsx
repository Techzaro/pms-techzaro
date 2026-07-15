import { useState, useEffect, useRef } from "react";
import { X, Globe, User, Lock, Users, ChevronDown, Check } from "lucide-react";
import { authToken } from "../utils/auth";
import API_URL from "../config/api";
import { showSuccessMessage } from "../utils/notify";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";

export default function AddAccessModal({ isOpen, onClose, projectId, taskId, projectName, onSuccess, files = [], credential }) {
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
  const dropdownRef = useRef(null);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!websiteName.trim() || !username.trim() || !password.trim() || assignedUserIds.length === 0) {
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
          <h3>{isEdit ? "Edit Access Credential" : "Add Access Credential"}</h3>
          <span className="aam-project-name">{projectName}</span>
          <button className="aam-close" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="aam-body">
          {error && <div className="aam-error">{error}</div>}

          <div className="aam-field">
            <label>
              <Globe size={14} /> Website Name *
            </label>
            <select
              className="aam-select"
              value={websiteName}
              onChange={(e) => { setIsDirty(true); setWebsiteName(e.target.value); }}
              required
            >
              <option value="">Select website</option>
              {files
                .filter((f) => f.url && /^https?:\/\//i.test(f.url))
                .map((f) => (
                  <option key={f.id} value={f.name}>
                    {f.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="aam-field">
            <label>
              <User size={14} /> Username / Email *
            </label>
            <input
              type="text"
              placeholder="Enter username or email"
              value={username}
              onChange={(e) => { setIsDirty(true); setUsername(e.target.value); }}
              required
            />
          </div>

          <div className="aam-field">
            <label>
              <Lock size={14} /> Password *
            </label>
            <div className="aam-password-wrap">
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => { setIsDirty(true); setPassword(e.target.value); }}
                required
              />
            </div>
          </div>

          <div className="aam-field">
            <label>
              <Users size={14} /> Assign To *
            </label>
            <p className="aam-hint">Select users who can see this credential</p>
            <div className="aam-multiselect" ref={dropdownRef}>
              <button
                type="button"
                className={`aam-multiselect-trigger ${dropdownOpen ? "aam-multiselect-trigger--open" : ""}`}
                onClick={() => setDropdownOpen(!dropdownOpen)}
              >
                <span className="aam-multiselect-value">
                  {assignedUserIds.length === 0
                    ? "Select users"
                    : assignedUserIds.length === 1
                    ? users.find((u) => u.id === assignedUserIds[0])?.name || "1 user selected"
                    : `${assignedUserIds.length} users selected`}
                </span>
                <ChevronDown size={16} className={`aam-multiselect-arrow ${dropdownOpen ? "aam-multiselect-arrow--open" : ""}`} />
              </button>
              {dropdownOpen && (
                <div className="aam-multiselect-dropdown">
                  <label className="aam-multiselect-option" onClick={(e) => e.stopPropagation()}>
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
                    <span className="aam-multiselect-label">Select All</span>
                  </label>
                  <div className="aam-multiselect-divider" />
                  {users.map((u) => (
                    <label key={u.id} className="aam-multiselect-option" onClick={(e) => e.stopPropagation()}>
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
                        <span className="aam-tag-confirm-msg">Remove {u.name}?</span>
                        <button type="button" className="aam-tag-confirm-yes" onClick={() => { toggleUser(id); setPendingRemoveUser(null); }}>Yes</button>
                        <button type="button" className="aam-tag-confirm-no" onClick={() => setPendingRemoveUser(null)}>No</button>
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
              Cancel
            </button>
            <button type="submit" className="aam-btn aam-btn-save" disabled={loading}>
              {loading ? (isEdit ? "Updating..." : "Saving...") : (isEdit ? "Update Credential" : "Save Credential")}
            </button>
          </div>
        </form>
      </div>
      {ConfirmDialog}
    </div>
  );
}
