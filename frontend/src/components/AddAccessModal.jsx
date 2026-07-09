import { useState, useEffect, useRef } from "react";
import { X, Globe, User, Lock, Users, Eye, EyeOff, ChevronDown, Check } from "lucide-react";
import { authToken } from "../utils/auth";
import API_URL from "../config/api";

export default function AddAccessModal({ isOpen, onClose, projectId, projectName, onSuccess, files = [] }) {
  const [websiteName, setWebsiteName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [assignedUserIds, setAssignedUserIds] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      resetForm();
    }
  }, [isOpen]);

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
    setShowPassword(false);
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
      const res = await fetch(`${API_URL}/projects/${projectId}/access-credentials`, {
        method: "POST",
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
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create access credential");

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="aam-modal" onClick={(e) => e.stopPropagation()}>
        <div className="aam-header">
          <h3>Add Access Credential</h3>
          <span className="aam-project-name">{projectName}</span>
          <button className="aam-close" onClick={onClose}>
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
              onChange={(e) => setWebsiteName(e.target.value)}
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
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="aam-field">
            <label>
              <Lock size={14} /> Password *
            </label>
            <div className="aam-password-wrap">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="aam-toggle-pw"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
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
                        onChange={() => toggleUser(u.id)}
                      />
                      <span className="aam-multiselect-check">
                        {assignedUserIds.includes(u.id) && <Check size={12} />}
                      </span>
                      <span className="aam-multiselect-label">{u.name}</span>
                      <span className="aam-multiselect-role">({u.role?.replace("_", " ")})</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {assignedUserIds.length > 0 && (
              <div className="aam-selected-tags">
                {assignedUserIds.map((id) => {
                  const u = users.find((usr) => usr.id === id);
                  return u ? (
                    <span key={id} className="aam-tag">
                      {u.name}
                      <button type="button" onClick={() => toggleUser(id)}>
                        <X size={12} />
                      </button>
                    </span>
                  ) : null;
                })}
              </div>
            )}
          </div>

          <div className="aam-footer">
            <button type="button" className="aam-btn aam-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="aam-btn aam-btn-save" disabled={loading}>
              {loading ? "Saving..." : "Save Credential"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
