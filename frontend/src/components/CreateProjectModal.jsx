/**
 * CreateProjectModal.jsx
 * Full-featured modal form for creating a new project.
 * Includes fields for title, description, category, team assignment, milestones,
 * goals, deliverables, attachments (files & links), client info, and priority.
 */

import { useEffect, useRef, useState } from "react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import UserSelectDropdown from "./UserSelectDropdown";
import CustomSelect from "./CustomSelect";
import CustomDateTimePicker from "./CustomDateTimePicker";
import { formatDateTime, toUTCIso } from "../utils/formatDateTime";
import { publish } from "../utils/eventBus";
import { notify } from "../utils/notify";
import "./layout/CreateProjectModal.css";

const PRESET_PHASES = [
  "Planned",
  "In Progress",
  "Paused",
  "Completed",
];

const TEAM_ROLES = ["Solution", "Tech", "Developer"];

/**
 * Modal form for creating a new project with all associated metadata.
 * @param {Function} onClose - Callback to close the modal; receives boolean (true if created)
 */
const CreateProjectModal = ({ onClose }) => {
  const [loading, setLoading] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [teams, setTeams] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    team_id: "",
    assigned_users: [],
    priority: "Medium",
    client_name: "",
    budget: "",
    team_roles: [],
  });

  const [teamRolesOpen, setTeamRolesOpen] = useState(false);
  const teamRolesRef = useRef(null);

  const [milestones, setMilestones] = useState([]);
  const [phaseName, setPhaseName] = useState("");
  const [phaseDate, setPhaseDate] = useState("");
  const [phaseDropdownOpen, setPhaseDropdownOpen] = useState(false);
  const phaseDropdownRef = useRef(null);

  const [goalsList, setGoalsList] = useState([]);
  const [goalInput, setGoalInput] = useState("");

  const [pendingFiles, setPendingFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  const [deliverablesProj, setDeliverablesProj] = useState([]);
  const [deliverableProjInput, setDeliverableProjInput] = useState({ title: "", due_datetime: "" });
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: true } }));
    return () => window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: false } }));
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (teamRolesRef.current && !teamRolesRef.current.contains(e.target)) {
        setTeamRolesOpen(false);
      }
      if (phaseDropdownRef.current && !phaseDropdownRef.current.contains(e.target)) {
        setPhaseDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const token = authToken();

    fetch(`${API_URL}/teams`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setTeams(Array.isArray(data) ? data : []))
      .catch(() => {});

    fetch(`${API_URL}/team-users`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : { users: [] }))
      .then((data) => setAllUsers(Array.isArray(data) ? data : (data.users || [])))
      .catch(() => {});
  }, []);

  const displayUsers = (() => {
    if (form.team_id) {
      const selectedTeam = teams.find((t) => String(t.id) === String(form.team_id));
      if (selectedTeam && selectedTeam.members && selectedTeam.members.length > 0) {
        return selectedTeam.members;
      }
    }
    return allUsers;
  })();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "team_id") {
        next.assigned_users = [];
      }
      return next;
    });
    if (formErrors[name]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleAssignedUsersChange = (ids) => {
    setForm((prev) => ({ ...prev, assigned_users: ids }));
  };

  const handleAddPhase = () => {
    if (!phaseName.trim() || !phaseDate) return;
    const formattedDt = toUTCIso(phaseDate);
    setMilestones((prev) => [...prev, { title: phaseName.trim(), due_date: formattedDt, status: "planned" }]);
    setPhaseName("");
    setPhaseDate("");
  };

  const handleRemovePhase = (index) => {
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePhaseKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddPhase(); }
  };

  const handleAddGoal = () => {
    if (!goalInput.trim()) return;
    setGoalsList((prev) => [...prev, { text: goalInput.trim(), done: false }]);
    setGoalInput("");
  };

  const handleRemoveGoal = (index) => {
    setGoalsList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGoalKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddGoal(); }
  };

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return "";
    return formatDateTime(dateStr).replace("\n", " ");
  };

  const handleFiles = (fileList) => {
    const newFiles = Array.from(fileList);
    setPendingFiles((prev) => [...prev, ...newFiles]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropRef.current?.classList.remove("cp-drop-active");
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropRef.current?.classList.add("cp-drop-active");
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropRef.current?.classList.remove("cp-drop-active");
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

  const handleAddDeliverableProj = () => {
    if (!deliverableProjInput.title.trim()) return;
    const dt = deliverableProjInput.due_datetime;
    const dueDate = toUTCIso(dt);
    setDeliverablesProj((prev) => [...prev, { title: deliverableProjInput.title.trim(), due_date: dueDate }]);
    setDeliverableProjInput({ title: "", due_datetime: "" });
  };

  const handleRemoveDeliverableProj = (index) => {
    setDeliverablesProj((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDeliverableProjKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddDeliverableProj(); }
  };

  /**
   * Uploads pending file attachments and links to the newly created project.
   * Runs sequentially; failures are silently caught per-item.
   * @param {number} projectId - ID of the created project
   * @param {string} token - Auth token
   */
  const uploadAttachments = async (projectId, token) => {
    // Upload each file as multipart/form-data
    for (const file of pendingFiles) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        await fetch(`${API_URL}/projects/${projectId}/files`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          body: fd,
        });
      } catch {}
    }

    // Upload each link as JSON
    for (const link of links) {
      try {
        await fetch(`${API_URL}/projects/${projectId}/links`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(link),
        });
      } catch {}
    }
  };

  /**
   * Validates required form fields. Sets formErrors state and returns validity.
   * @returns {boolean} True if form is valid
   */
  const validateForm = () => {
    const errors = {};
    if (!form.title.trim()) {
      errors.title = "Project Name is required.";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /**
   * Handles form submission: validates, creates project via API,
   * uploads attachments, and publishes events on success.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      const token = authToken();

      // Use the last milestone's due date as the project end date
      const lastMilestone = milestones.length > 0 ? milestones[milestones.length - 1] : null;
      const computedEndDate = lastMilestone ? lastMilestone.due_date : null;

      // Build the request payload from form state
      const body = {
        title: form.title.trim(),
        description: form.description || null,
        category: form.category || null,
        goals_checklist: goalsList.length > 0 ? goalsList : [],
        team_id: form.team_id ? parseInt(form.team_id) : null,
        assigned_users: form.assigned_users.length > 0 ? form.assigned_users : [],
        priority: form.priority,
        end_date: computedEndDate,
        client_name: form.client_name || null,
        budget: form.budget ? parseFloat(form.budget) : null,
        milestones: milestones.length > 0 ? milestones : [],
        team_roles: form.team_roles,
        deliverables: deliverablesProj.length > 0 ? deliverablesProj.map(d => ({ title: d.title, due_date: d.due_date || null })) : undefined,
      };

      const response = await fetch(`${API_URL}/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        _notifHandled: true,
      });

      const data = await response.json();

      if (!response.ok) {
        const msg = data.message || "Failed to create project";
        const errors = data.errors ? Object.values(data.errors).flat().join(". ") : "";
        throw new Error(errors || msg);
      }

      const projectId = data.project?.id;
      if (projectId && (pendingFiles.length > 0 || links.length > 0)) {
        await uploadAttachments(projectId, token);
      }

      publish('project:created', data.project || data);
      publish('data:changed', { type: 'project', action: 'created' });
      onClose(true);
    } catch (err) {
      notify.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cp-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) {
        onClose(false);
      }
    }}>
      <div className="cp-modal" onClick={(e) => e.stopPropagation()}>

        {/* HEADER */}
        <div className="cp-header">
          <div className="cp-header-left">
            <div className="cp-icon-box">📁</div>
            <div>
              <h2>Create New Project</h2>
              <p>Add project details and assign it to team members.</p>
            </div>
          </div>
          <button className="cp-close-btn" onClick={() => onClose(false)}>✕</button>
        </div>

        {/* BODY */}
        <form onSubmit={handleSubmit} className="cp-body">

          {/* LEFT */}
          <div className="cp-left">

            <div className="cp-field">
              <label>Project Name <span>*</span></label>
              <input
                type="text"
                name="title"
                placeholder="Enter project name..."
                value={form.title}
                onChange={handleChange}
                className={formErrors.title ? "field-error" : ""}
              />
              {formErrors.title && <span className="field-error-text">{formErrors.title}</span>}
            </div>

            <div className="cp-field">
              <label>Description</label>
              <textarea
                name="description"
                placeholder="Enter project description..."
                value={form.description}
                onChange={handleChange}
              ></textarea>
            </div>

            <div className="cp-grid-2">
              <div className="cp-field">
                <label>Category (Optional)</label>
                <CustomSelect
                  name="category"
                  value={form.category}
                  onChange={(val) => handleChange({ target: { name: "category", value: val } })}
                  placeholder="Select category"
                  options={[
                    { value: "", label: "Select category" },
                    { value: "Web Development", label: "Web Development" },
                    { value: "Mobile App", label: "Mobile App" },
                    { value: "UI/UX Design", label: "UI/UX Design" },
                  ]}
                />
              </div>

              <div className="cp-field">
                <label>Project Goals</label>
                <div className="cp-goals-input-row">
                  <input
                    type="text"
                    placeholder="Enter a goal"
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    onKeyDown={handleGoalKeyDown}
                  />
                  <button
                    type="button"
                    className="cp-goals-add-btn"
                    onClick={handleAddGoal}
                    disabled={!goalInput.trim()}
                  >
                    Add
                  </button>
                </div>

                {goalsList.length > 0 && (
                  <div className="cp-goals-list">
                    {goalsList.map((g, index) => (
                      <div key={index} className="cp-goals-item">
                        <span className="cp-goals-item-text">{g.text}</span>
                        <button
                          type="button"
                          className="cp-goals-item-remove"
                          onClick={() => handleRemoveGoal(index)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="cp-grid-2">
              <div className="cp-field">
                <label>Team (Optional)</label>
                <div className="cp-dropdown-wrap" ref={teamRolesRef}>
                  <button
                    type="button"
                    className="cp-dropdown-trigger"
                    onClick={() => setTeamRolesOpen((prev) => !prev)}
                  >
                    <span className={form.team_roles.length === 0 ? "cp-dropdown-placeholder" : ""}>
                      {form.team_roles.length === 0
                        ? "Select Team"
                        : form.team_roles.join(", ")}
                    </span>
                    <svg className={`cp-dropdown-arrow ${teamRolesOpen ? "open" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  {teamRolesOpen && (
                    <div className="cp-dropdown-menu">
                      {TEAM_ROLES.map((role) => (
                        <label key={role} className="cp-dropdown-item">
                          <input
                            type="checkbox"
                            checked={form.team_roles.includes(role)}
                            onChange={() => {
                              setForm((prev) => ({
                                ...prev,
                                team_roles: prev.team_roles.includes(role)
                                  ? prev.team_roles.filter((r) => r !== role)
                                  : [...prev.team_roles, role],
                              }));
                            }}
                          />
                          <span>{role}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="cp-field">
                <label>Team Members (Optional)</label>
                <UserSelectDropdown
                  users={displayUsers}
                  selectedIds={form.assigned_users}
                  onChange={handleAssignedUsersChange}
                  placeholder="Click to select members"
                  viewOnly={!!form.team_id}
                />
              </div>
            </div>

            {/* ATTACHMENTS */}
            <div className="cp-field">
              <label>Attachments</label>

              <div
                className="cp-drop-zone"
                ref={dropRef}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="cp-drop-content">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p className="cp-drop-text">Drag & drop files here</p>
                </div>
                <span className="cp-drop-browse">or browse</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => { if (e.target.files.length > 0) handleFiles(e.target.files); e.target.value = ""; }}
                />
              </div>

              {/* Pending files */}
              {pendingFiles.length > 0 && (
                <div className="cp-attachments-list">
                  {pendingFiles.map((file, index) => (
                    <div key={index} className="cp-attachment-item">
                      <span className="cp-attachment-icon">📄</span>
                      <span className="cp-attachment-name">{file.name}</span>
                      <span className="cp-attachment-size">{(file.size / 1024).toFixed(1)} KB</span>
                      <button type="button" className="cp-attachment-remove" onClick={() => handleRemoveFile(index)}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="cp-or-divider">
                <span className="cp-or-line"></span>
                <span className="cp-or-text">OR</span>
                <span className="cp-or-line"></span>
              </div>

              <div className="cp-link-input-row">
                <input
                  type="text"
                  placeholder="Paste link (Drive, Figma, Website, etc.)"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  onKeyDown={handleLinkKeyDown}
                />
                <button
                  type="button"
                  className="cp-link-add-btn"
                  onClick={handleAddLink}
                  disabled={!linkInput.trim()}
                >
                  Add Link
                </button>
              </div>

              {/* Added links */}
              {links.length > 0 && (
                <div className="cp-attachments-list">
                  {links.map((link, index) => (
                    <div key={index} className="cp-attachment-item">
                      <span className="cp-attachment-icon">🔗</span>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="cp-attachment-name cp-attachment-link">
                        {link.url.length > 45 ? link.url.substring(0, 45) + "..." : link.url}
                      </a>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="cp-attachment-open">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                      <button type="button" className="cp-attachment-remove" onClick={() => handleRemoveLink(index)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* RIGHT */}
          <div className="cp-right">

            {/* PRIORITY */}
            <div className="cp-card">
              <div className="cp-card-top">
                <span>Priority</span>
              </div>
              <CustomSelect
                name="priority"
                value={form.priority}
                onChange={(val) => handleChange({ target: { name: "priority", value: val } })}
                options={[
                  { value: "Medium", label: "Medium" },
                  { value: "Low", label: "Low" },
                  { value: "High", label: "High" },
                ]}
              />
            </div>

            {/* DEADLINES - PHASE SYSTEM */}
            <div className="cp-card">
              <div className="cp-card-top">
                <span>Deadlines</span>
              </div>

              <div className="cp-deadline-grid">
                <div className="cp-field">
                  <label style={{ fontSize: "13px" }}>Phase</label>
                  <input
                    type="text"
                    placeholder="Enter phase name"
                    value={phaseName}
                    onChange={(e) => {
                      setPhaseName(e.target.value);
                      setPhaseDropdownOpen(false);
                    }}
                    onFocus={() => { if (!phaseName) setPhaseDropdownOpen(true); }}
                    onKeyDown={handlePhaseKeyDown}
                  />
                  {phaseDropdownOpen && (
                    <div className="cp-dropdown-menu" style={{ position: "relative", top: "4px", boxShadow: "0 8px 24px rgba(0,0,0,0.1)" }}>
                      {PRESET_PHASES.map((p) => (
                        <div
                          key={p}
                          className="cp-dropdown-item"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setPhaseName(p);
                            setPhaseDropdownOpen(false);
                          }}
                        >
                          {p}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="cp-field">
                  <label style={{ fontSize: "13px" }}>Due Date & Time</label>
                  <CustomDateTimePicker
                    value={phaseDate}
                    onChange={setPhaseDate}
                    min={new Date().toISOString()}
                  />
                </div>
              </div>

              <button
                type="button"
                className="cp-add-phase-btn"
                onClick={handleAddPhase}
                disabled={!phaseName.trim() || !phaseDate}
              >
                + Add Phase
              </button>

              {milestones.length > 0 && (
                <div className="cp-phase-list">
                  {milestones.map((m, index) => (
                    <div key={index} className="cp-phase-item">
                      <div className="cp-phase-item-dot" />
                      <div className="cp-phase-item-info">
                        <div className="cp-phase-item-title">{m.title}</div>
                        <div className="cp-phase-item-date">{formatDateDisplay(m.due_date)}</div>
                      </div>
                      <button
                        type="button"
                        className="cp-phase-item-remove"
                        onClick={() => handleRemovePhase(index)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {milestones.length > 0 && (
                <div className="cp-deadline-summary">
                  <span>Final Deadline:</span>
                  <strong>{formatDateDisplay(milestones[milestones.length - 1].due_date)}</strong>
                </div>
              )}
            </div>

            {/* DELIVERABLES */}
            <div className="cp-card">
              <div className="cp-card-top">
                <span>Deliverables (Optional)</span>
              </div>

              <div className="cp-deadline-grid">
                <div className="cp-field">
                  <label style={{ fontSize: "13px" }}>Deliverable Name</label>
                  <input
                    type="text"
                    placeholder="Enter deliverable name"
                    value={deliverableProjInput.title}
                    onChange={(e) => setDeliverableProjInput((prev) => ({ ...prev, title: e.target.value }))}
                    onKeyDown={handleDeliverableProjKeyDown}
                  />
                </div>
                <div className="cp-field">
                  <label style={{ fontSize: "13px" }}>Due Date & Time</label>
                  <CustomDateTimePicker
                    value={deliverableProjInput.due_datetime}
                    onChange={(val) => setDeliverableProjInput((prev) => ({ ...prev, due_datetime: val }))}
                    min={new Date().toISOString()}
                  />
                </div>
              </div>

              <button
                type="button"
                className="cp-add-phase-btn"
                onClick={handleAddDeliverableProj}
                disabled={!deliverableProjInput.title.trim()}
              >
                + Add Deliverable
              </button>

              {deliverablesProj.length > 0 && (
                <div className="cp-phase-list">
                  {deliverablesProj.map((d, index) => (
                    <div key={index} className="cp-phase-item">
                      <div className="cp-phase-item-dot" style={{ background: "#8b5cf6" }} />
                      <div className="cp-phase-item-info">
                        <div className="cp-phase-item-title">{d.title}</div>
                        <div className="cp-phase-item-date">{d.due_date ? formatDateTime(d.due_date).replace("\n", " ") : "No due date"}</div>
                      </div>
                      <button
                        type="button"
                        className="cp-phase-item-remove"
                        onClick={() => handleRemoveDeliverableProj(index)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CLIENT INFO */}
            <div className="cp-card">
              <div className="cp-card-top">
                <span>Client Info</span>
              </div>
              <div className="cp-field" style={{ marginBottom: "12px" }}>
                <label style={{ fontSize: "13px" }}>Client Name</label>
                <input type="text" name="client_name" placeholder="Client name" value={form.client_name} onChange={handleChange} />
              </div>
              <div className="cp-field">
                <label style={{ fontSize: "13px" }}>Budget</label>
                <input type="number" name="budget" placeholder="Budget amount" min="0" step="0.01" value={form.budget} onChange={handleChange} />
              </div>
            </div>

          </div>

        </form>

        {/* FOOTER */}
        <div className="cp-footer">
          <button className="cp-cancel-btn" onClick={() => onClose(false)} disabled={loading}>Cancel</button>
          <button className="cp-create-btn" onClick={handleSubmit} disabled={loading}>
            {loading ? "Creating..." : "+ Create Project"}
          </button>
        </div>

      </div>
    </div>
  );
};

export default CreateProjectModal;
