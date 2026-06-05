
import { useEffect, useRef, useState } from "react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import "./layout/CreateTaskModal.css";

const CreateSubtaskModal = ({ parentId, projectId, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formErrors, setFormErrors] = useState({});
  const [allUsers, setAllUsers] = useState([]);

  const [form, setForm] = useState({
    title: "",
    description: "",
    assigned_to: [],
    priority: "Medium",
  });

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [pendingFiles, setPendingFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const assignRef = useRef(null);
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: true } }));
    return () => window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: false } }));
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (assignRef.current && !assignRef.current.contains(e.target)) {
        setAssignOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const token = authToken();
    fetch(`${API_URL}/team-users`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const users = Array.isArray(data) ? data : [];
        setAllUsers(users);
      })
      .catch(() => {});
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));

    if (formErrors[name]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const toggleUser = (userId) => {
    setForm((prev) => {
      const selected = prev.assigned_to.includes(userId)
        ? prev.assigned_to.filter((id) => id !== userId)
        : [...prev.assigned_to, userId];
      return { ...prev, assigned_to: selected };
    });
    if (formErrors.assigned_to) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next.assigned_to;
        return next;
      });
    }
  };

  const handleFiles = (fileList) => {
    const newFiles = Array.from(fileList);
    setPendingFiles((prev) => [...prev, ...newFiles]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropRef.current?.classList.remove("task-drop-active");
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropRef.current?.classList.add("task-drop-active");
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropRef.current?.classList.remove("task-drop-active");
  };

  const handleRemoveFile = (index) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddLink = () => {
    if (!linkInput.trim()) return;
    let url = linkInput.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    setLinks((prev) => [...prev, { url, name: url }]);
    setLinkInput("");
  };

  const handleRemoveLink = (index) => {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLinkKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddLink(); }
  };

  const validateForm = () => {
    const errors = {};
    if (!form.title.trim()) errors.title = "Subtask Name is required.";
    if (!form.assigned_to || form.assigned_to.length === 0) errors.assigned_to = "Select at least one user.";
    if (!form.priority) errors.priority = "Priority is required.";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!validateForm()) return;

    setLoading(true);

    try {
      const token = authToken();

      const body = {
        title: form.title.trim(),
        description: form.description || null,
        start_date: startDate || null,
        end_date: endDate || null,
        assigned_to: form.assigned_to,
        priority: form.priority,
      };

      const response = await fetch(`${API_URL}/tasks/${parentId}/subtasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        const msg = data.message || "Failed to create subtask";
        const errors = data.errors ? Object.values(data.errors).flat().join(". ") : "";
        throw new Error(errors || msg);
      }

      onClose(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="task-overlay">
      <div className="task-modal">

        {/* HEADER */}
        <div className="task-header">
          <div className="task-header-left">
            <div className="task-icon">
              ⊕
            </div>
            <div>
              <h2>Create Subtask</h2>
              <p>Add subtask details and assign it to team members.</p>
            </div>
          </div>
          <button className="task-close-btn" onClick={() => onClose(false)}>
            ✕
          </button>
        </div>

        {/* BODY */}
        <form onSubmit={handleSubmit} className="task-body">

          {/* LEFT SIDE */}
          <div className="task-left">

            <div className="task-grid-2">

              <div className="task-field">
                <label>
                  Subtask Name <span>*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  placeholder="Enter subtask name"
                  value={form.title}
                  onChange={handleChange}
                  className={formErrors.title ? "field-error" : ""}
                />
                {formErrors.title && <span className="field-error-text">{formErrors.title}</span>}
              </div>

              <div className="task-field">
                <label>
                  Assign To <span>*</span>
                </label>
                <div className="task-checkbox-dropdown" ref={assignRef}>
                  <button
                    type="button"
                    className={`task-checkbox-trigger ${assignOpen ? "task-checkbox-trigger--open" : ""} ${formErrors.assigned_to ? "field-error" : ""}`}
                    onClick={() => setAssignOpen(!assignOpen)}
                  >
                    <span>
                      {form.assigned_to.length === 0
                        ? "Select user(s)"
                        : `${form.assigned_to.length} user(s) selected`}
                    </span>
                    <span className={`task-checkbox-arrow ${assignOpen ? "open" : ""}`}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </button>

                  {assignOpen && (
                    <div className="task-checkbox-list task-checkbox-list--open">
                      {allUsers.length === 0 ? (
                        <div className="task-checkbox-empty">No users available</div>
                      ) : (
                        allUsers.map((user) => (
                          <label key={user.id} className="task-checkbox-item">
                            <input
                              type="checkbox"
                              checked={form.assigned_to.includes(user.id)}
                              onChange={() => toggleUser(user.id)}
                            />
                            <span>{user.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {formErrors.assigned_to && <span className="field-error-text">{formErrors.assigned_to}</span>}
              </div>

            </div>

            <div className="task-field">
              <label>Description</label>
              <textarea
                name="description"
                placeholder="Enter subtask description.."
                value={form.description}
                onChange={handleChange}
              ></textarea>
            </div>

            {/* ATTACHMENTS */}
            <div className="task-field">
              <label>Attachments</label>

              <div
                className="task-drop-zone"
                ref={dropRef}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="task-drop-content">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p className="task-drop-text">Drag & drop files here</p>
                </div>
                <span className="task-drop-browse">or browse</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => { if (e.target.files.length > 0) handleFiles(e.target.files); e.target.value = ""; }}
                />
              </div>

              {pendingFiles.length > 0 && (
                <div className="task-attachments-list">
                  {pendingFiles.map((file, index) => (
                    <div key={index} className="task-attachment-item">
                      <span className="task-attachment-icon">📄</span>
                      <span className="task-attachment-name">{file.name}</span>
                      <span className="task-attachment-size">{(file.size / 1024).toFixed(1)} KB</span>
                      <button type="button" className="task-attachment-remove" onClick={() => handleRemoveFile(index)}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="task-or-divider">
                <span className="task-or-line"></span>
                <span className="task-or-text">OR</span>
                <span className="task-or-line"></span>
              </div>

              <div className="task-link-input-row">
                <input
                  type="text"
                  placeholder="Paste link (Drive, Figma, Website, etc.)"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  onKeyDown={handleLinkKeyDown}
                />
                <button
                  type="button"
                  className="task-link-add-btn"
                  onClick={handleAddLink}
                  disabled={!linkInput.trim()}
                >
                  Add Link
                </button>
              </div>

              {links.length > 0 && (
                <div className="task-attachments-list">
                  {links.map((link, index) => (
                    <div key={index} className="task-attachment-item">
                      <span className="task-attachment-icon">🔗</span>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="task-attachment-name task-attachment-link">
                        {link.url.length > 45 ? link.url.substring(0, 45) + "..." : link.url}
                      </a>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="task-attachment-open">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                      <button type="button" className="task-attachment-remove" onClick={() => handleRemoveLink(index)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* RIGHT SIDE */}
          <div className="task-right">

            {/* PRIORITY */}
            <div className="task-card">
              <label>Priority <span style={{ color: "#ef4444" }}>*</span></label>
              <select
                name="priority"
                value={form.priority}
                onChange={handleChange}
                className={formErrors.priority ? "field-error" : ""}
              >
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
                <option value="High">High</option>
              </select>
              {formErrors.priority && <span className="field-error-text">{formErrors.priority}</span>}
            </div>

            {/* DATES */}
            <div className="task-card">
              <label>Dates</label>
              <div className="task-date-grid">
                <div>
                  <span>Start Date</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <span>Due Date</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

          </div>

        </form>

        {error && <div className="task-error-banner">{error}</div>}

        {/* FOOTER */}
        <div className="task-footer">
          <div></div>
          <div className="task-footer-btns">
            <button
              className="task-cancel-btn"
              onClick={() => onClose(false)}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              className="task-create-btn"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "Creating..." : "+ Create Subtask"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default CreateSubtaskModal;
