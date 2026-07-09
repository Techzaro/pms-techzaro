/**
 * CreateProjectModal.jsx
 * Full-featured modal form for creating a new project.
 * Includes fields for title, description, category, team assignment, milestones,
 * goals, deliverables, attachments (files & links), client info, and priority.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import UserSelectDropdown from "./UserSelectDropdown";
import CustomSelect from "./CustomSelect";
import LoadingButton from "./LoadingButton";
import ConfirmModal from "./ConfirmModal";

import { formatDateTime, toUTCIso, getNowDatetimeLocal } from "../utils/formatDateTime";
import { publish } from "../utils/eventBus";
import { notify, showSuccessMessage } from "../utils/notify";
import { useSubmit } from "../hooks/useSubmit";
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
  useEscapeKey(true, onClose);

  const [loading, setLoading] = useState(false);
  const { submitting, run } = useSubmit();
  const [formErrors, setFormErrors] = useState({});
  const [teams, setTeams] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  const [form, setForm] = useState({
    title: "",
    description: "",
    team_id: "",
    assigned_users: [],
    priority: "Medium",
    status: "Planning",
    client_name: "",
    budget: "",
    team_roles: [],
  });

  const [categoriesList, setCategoriesList] = useState([]);
  const [categoryInput, setCategoryInput] = useState("");
  const [catDeleteOpen, setCatDeleteOpen] = useState(false);
  const [pendingCatDelete, setPendingCatDelete] = useState("");
  const [goalDeleteOpen, setGoalDeleteOpen] = useState(false);
  const [pendingGoalIndex, setPendingGoalIndex] = useState(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [pendingRemoveItem, setPendingRemoveItem] = useState({ type: "", index: -1 });
  const [deletedCategories, setDeletedCategories] = useState(() => {
    try { return JSON.parse(localStorage.getItem("deleted_categories") || "[]"); } catch { return []; }
  });
  const [existingCategories, setExistingCategories] = useState([]);
  const [categoryCustomMode, setCategoryCustomMode] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef(null);

  const [teamRolesOpen, setTeamRolesOpen] = useState(false);
  const teamRolesRef = useRef(null);

  const [milestones, setMilestones] = useState([]);
  const [phaseName, setPhaseName] = useState("");
  const [phaseDate, setPhaseDate] = useState("");
  const [phaseDropdownOpen, setPhaseDropdownOpen] = useState(false);
  const phaseDropdownRef = useRef(null);

  const [goalsList, setGoalsList] = useState([]);
  const [goalInput, setGoalInput] = useState("");
  const [goalDateTime, setGoalDateTime] = useState("");
  const goalDateTimeRef = useRef(null);

  const [pendingFiles, setPendingFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  const [linkTitleInput, setLinkTitleInput] = useState("");
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
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target)) {
        setCategoryDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const token = authToken();

    Promise.all([
      fetch(`${API_URL}/teams`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setTeams(Array.isArray(data) ? data : []))
        .catch(() => {}),

      fetch(`${API_URL}/team-users`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      })
        .then((res) => (res.ok ? res.json() : { users: [] }))
        .then((data) => setAllUsers(Array.isArray(data) ? data : (data.users || [])))
        .catch(() => {}),

      fetch(`${API_URL}/projects`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          const projects = Array.isArray(data) ? data : (data.projects || []);
          const cats = new Set();
          projects.forEach((p) => {
            if (p.category) {
              try {
                const parsed = JSON.parse(p.category);
                if (Array.isArray(parsed)) parsed.forEach((c) => cats.add(c));
                else cats.add(p.category);
              } catch {
                cats.add(p.category);
              }
            }
          });
          // Also load persisted categories from localStorage
          try {
            const stored = JSON.parse(localStorage.getItem("persisted_categories") || "[]");
            if (Array.isArray(stored)) stored.forEach((c) => cats.add(c));
          } catch {}
          const deleted = (() => { try { return JSON.parse(localStorage.getItem("deleted_categories") || "[]"); } catch { return []; } })();
          const filtered = [...cats].filter((c) => !deleted.includes(c));
          // Save merged list back to localStorage
          localStorage.setItem("persisted_categories", JSON.stringify(filtered.sort()));
          setExistingCategories(filtered.sort());
        })
        .catch(() => {}),
    ]);
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
    setGoalsList((prev) => [...prev, { text: goalInput.trim(), done: false, due_datetime: goalDateTime || null }]);
    setGoalInput("");
    setGoalDateTime("");
  };

  const handleRemoveGoal = (index) => {
    setPendingGoalIndex(index);
    setGoalDeleteOpen(true);
  };

  const confirmDeleteGoal = () => {
    setGoalsList((prev) => prev.filter((_, i) => i !== pendingGoalIndex));
    setGoalDeleteOpen(false);
    setPendingGoalIndex(null);
  };

  const handleAddCategory = () => {
    if (!categoryInput.trim()) return;
    const newCat = categoryInput.trim();
    if (!categoriesList.includes(newCat)) {
      setCategoriesList((prev) => [...prev, newCat]);
    }
    if (!existingCategories.includes(newCat)) {
      const updated = [...existingCategories, newCat].sort();
      setExistingCategories(updated);
      localStorage.setItem("persisted_categories", JSON.stringify(updated));
    }
    setCategoryInput("");
    setCategoryCustomMode(false);
  };

  const handleRemoveCategory = (index) => {
    setCategoriesList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDeleteCategoryPermanent = (cat) => {
    setPendingCatDelete(cat);
    setCatDeleteOpen(true);
  };

  const confirmDeleteCategory = () => {
    const cat = pendingCatDelete;
    setDeletedCategories((prev) => {
      const next = [...prev, cat];
      localStorage.setItem("deleted_categories", JSON.stringify(next));
      return next;
    });
    setExistingCategories((prev) => {
      const updated = prev.filter((c) => c !== cat);
      localStorage.setItem("persisted_categories", JSON.stringify(updated));
      return updated;
    });
    setCategoriesList((prev) => prev.filter((c) => c !== cat));
    setCatDeleteOpen(false);
    setPendingCatDelete("");
  };

  const confirmRemoveItem = () => {
    const { type, index } = pendingRemoveItem;
    if (type === "file") handleRemoveFile(index);
    else if (type === "link") handleRemoveLink(index);
    else if (type === "category") handleRemoveCategory(index);
    else if (type === "phase") handleRemovePhase(index);
    else if (type === "deliverable") handleRemoveDeliverableProj(index);
    setRemoveConfirmOpen(false);
    setPendingRemoveItem({ type: "", index: -1 });
  };

  const handleCategoryKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddCategory(); }
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
    setPendingFiles((prev) => [...prev, ...newFiles.map((f) => ({ file: f, name: f.name, size: f.size, renaming: false }))]);
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
    const name = linkTitleInput.trim() || url;
    setLinks((prev) => [...prev, { url, name, renaming: false }]);
    setLinkInput("");
    setLinkTitleInput("");
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
    await Promise.all([
      ...pendingFiles.map((file) => {
        const fd = new FormData();
        fd.append("file", file.file);
        fd.append("name", file.customName || file.name);
        return fetch(`${API_URL}/projects/${projectId}/files`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          body: fd,
          _notifHandled: true,
        }).catch(() => {});
      }),
      ...links.map((link) => {
        return fetch(`${API_URL}/projects/${projectId}/links`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ url: link.url, name: link.customName || link.name }),
          _notifHandled: true,
        }).catch(() => {});
      }),
    ]);
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

    await run(async () => {
      try {
        const token = authToken();

        // Use the last milestone's due date as the project end date
        const lastMilestone = milestones.length > 0 ? milestones[milestones.length - 1] : null;
        const computedEndDate = lastMilestone ? lastMilestone.due_date : null;

        // Build the request payload from form state
        const body = {
          title: form.title.trim(),
          description: form.description || null,
          category: categoriesList.length > 0 ? JSON.stringify(categoriesList) : null,
          goals_checklist: goalsList.length > 0 ? goalsList : [],
          team_id: form.team_id ? parseInt(form.team_id) : null,
          assigned_users: form.assigned_users.length > 0 ? form.assigned_users : [],
          priority: form.priority,
          status: form.status,
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

        showSuccessMessage("Project", "created");
        publish('project:created', data.project || data);
        publish('data:changed', { type: 'project', action: 'created' });
        onClose(true);
      } catch (err) {
        notify.error(err.message);
      }
    });
  };

  const modalContent = createPortal(
    <div className="cp-overlay">
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
          <div className="cp-header-actions">
            <LoadingButton className="cp-create-btn" onClick={handleSubmit} loading={submitting}>
              + Create Project
            </LoadingButton>
            <button className="cp-close-btn" onClick={() => onClose(false)}>✕</button>
          </div>
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
                  <input
                    type="datetime-local"
                    ref={goalDateTimeRef}
                    value={goalDateTime}
                    onChange={(e) => setGoalDateTime(e.target.value)}
                    className="cp-goals-datetime-input"
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
                        {g.due_datetime && (
                          <span className="cp-goals-item-datetime">
                            📅 {new Date(g.due_datetime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} {new Date(g.due_datetime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
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
              <label>Links & Attachment</label>

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
                      {file.renaming ? (
                        <>
                          <input
                            autoFocus
                            type="text"
                            value={file.customName || ""}
                            onChange={(e) => {
                              setPendingFiles((p) => {
                                const updated = [...p];
                                updated[index] = { ...updated[index], customName: e.target.value };
                                return updated;
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                setPendingFiles((p) => {
                                  const updated = [...p];
                                  updated[index] = { ...updated[index], renaming: false };
                                  return updated;
                                });
                              }
                            }}
                            style={{ flex: 1, border: "1px solid #93c5fd", borderRadius: 4, padding: "2px 6px", fontSize: 13, outline: "none" }}
                          />
                          <button type="button" onClick={() => {
                            setPendingFiles((p) => {
                              const updated = [...p];
                              updated[index] = { ...updated[index], renaming: false };
                              return updated;
                            });
                          }} style={{ background: "#16a34a", border: "none", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, borderRadius: 4, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} title="Save name">&#10003;</button>
                        </>
                      ) : (
                        <>
                          <span className="cp-attachment-name">{file.customName || file.name}</span>
                          <span className="cp-attachment-size">{(file.size / 1024).toFixed(1)} KB</span>
                        </>
                      )}
                      {!file.renaming && (
                        <div style={{ display: "flex", gap: 10, flexShrink: 0, marginLeft: 8, alignItems: "center" }}>
                          <button type="button" onClick={() => {
                            setPendingFiles((p) => {
                              const updated = [...p];
                              updated[index] = { ...updated[index], renaming: true, customName: file.customName || file.name.replace(/\.[^.]+$/, "") };
                              return updated;
                            });
                          }} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Rename</button>
                          <button type="button" className="cp-attachment-remove" onClick={() => { setPendingRemoveItem({ type: "file", index }); setRemoveConfirmOpen(true); }}>✕</button>
                        </div>
                      )}
                      {file.renaming && (
                        <button type="button" onClick={() => { setPendingRemoveItem({ type: "file", index }); setRemoveConfirmOpen(true); }} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1, flexShrink: 0 }} title="Remove">&#10005;</button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="cp-or-divider">
                <span className="cp-or-line"></span>
                <span className="cp-or-text">OR</span>
                <span className="cp-or-line"></span>
              </div>

              <div className="cp-link-input-row" style={{ flexDirection: "column", gap: "8px" }}>
                <input
                  type="text"
                  placeholder="Link title (e.g. Figma Design, Drive Folder)"
                  value={linkTitleInput}
                  onChange={(e) => setLinkTitleInput(e.target.value)}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    placeholder="Paste link (Drive, Figma, Website, etc.)"
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    onKeyDown={handleLinkKeyDown}
                    style={{ flex: 1 }}
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
              </div>

              {/* Added links */}
              {links.length > 0 && (
                <div className="cp-attachments-list">
                  {links.map((link, index) => (
                    <div key={index} className="cp-attachment-item">
                      <span className="cp-attachment-icon">🔗</span>
                      {link.renaming ? (
                        <>
                          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                            <input
                              autoFocus
                              type="text"
                              value={link.customName || ""}
                              onChange={(e) => {
                                setLinks((p) => {
                                  const updated = [...p];
                                  updated[index] = { ...updated[index], customName: e.target.value };
                                  return updated;
                                });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  setLinks((p) => {
                                    const updated = [...p];
                                    updated[index] = { ...updated[index], renaming: false };
                                    return updated;
                                  });
                                }
                              }}
                              style={{ flex: 1, border: "1px solid #93c5fd", borderRadius: 4, padding: "2px 6px", fontSize: 13, outline: "none" }}
                            />
                            <a href={link.url} target="_blank" rel="noopener noreferrer" className="cp-attachment-link" style={{ fontSize: "12px", color: "#6366f1", marginTop: 2 }}>
                              {link.url.length > 45 ? link.url.substring(0, 45) + "..." : link.url}
                            </a>
                          </div>
                          <button type="button" onClick={() => {
                            setLinks((p) => {
                              const updated = [...p];
                              updated[index] = { ...updated[index], renaming: false };
                              return updated;
                            });
                          }} style={{ background: "#16a34a", border: "none", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, borderRadius: 4, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} title="Save name">&#10003;</button>
                        </>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                          <span className="cp-attachment-name" style={{ fontWeight: 600, fontSize: "13px" }}>{link.customName || link.name}</span>
                          <a href={link.url} target="_blank" rel="noopener noreferrer" className="cp-attachment-link" style={{ fontSize: "12px", color: "#6366f1" }}>
                            {link.url.length > 45 ? link.url.substring(0, 45) + "..." : link.url}
                          </a>
                        </div>
                      )}
                      {!link.renaming && (
                        <div style={{ display: "flex", gap: 10, flexShrink: 0, alignItems: "center" }}>
                          <button type="button" onClick={() => {
                            setLinks((p) => {
                              const updated = [...p];
                              updated[index] = { ...updated[index], renaming: true, customName: link.customName || link.name };
                              return updated;
                            });
                          }} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Rename</button>
                          <button type="button" className="cp-attachment-remove" onClick={() => { setPendingRemoveItem({ type: "link", index }); setRemoveConfirmOpen(true); }}>✕</button>
                        </div>
                      )}
                      {link.renaming && (
                        <button type="button" onClick={() => { setPendingRemoveItem({ type: "link", index }); setRemoveConfirmOpen(true); }} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1, flexShrink: 0 }} title="Remove">&#10005;</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT */}
          <div className="cp-right">

            {/* PRIORITY */}
            <div className="cp-field">
              <label>Priority</label>
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

            {/* STATUS */}
            <div className="cp-field">
              <label>Status</label>
              <CustomSelect
                name="status"
                value={form.status}
                onChange={(val) => handleChange({ target: { name: "status", value: val } })}
                options={[
                  { value: "Planning", label: "Planning" },
                  { value: "In-progress", label: "In-progress" },
                  { value: "Pause", label: "Pause" },
                  { value: "Completed", label: "Completed" },
                ]}
              />
            </div>

            {/* CATEGORY */}
            <div className="cp-field">
              <label>Category</label>
              {categoryCustomMode ? (
                <div className="custom-input-container">
                  <input
                    type="text"
                    placeholder="Enter custom category"
                    value={categoryInput}
                    onChange={(e) => setCategoryInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); handleAddCategory(); }
                      if (e.key === "Escape") { setCategoryCustomMode(false); setCategoryInput(""); }
                    }}
                    autoFocus
                  />
                  <button type="button" className="custom-input-revert" onClick={() => { setCategoryCustomMode(false); setCategoryInput(""); }} title="Back to list">&times;</button>
                </div>
              ) : (
                <div className="cp-category-dropdown" ref={categoryDropdownRef}>
                  <div className="cp-category-trigger" onClick={() => setCategoryDropdownOpen((prev) => !prev)}>
                    <span className={categoriesList.length === 0 ? "cp-dropdown-placeholder" : ""}>
                      {categoriesList.length === 0
                        ? "Select category"
                        : `${categoriesList.length} selected`}
                    </span>
                    <svg className={`cp-dropdown-arrow ${categoryDropdownOpen ? "open" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                  </div>
                  {categoryDropdownOpen && (
                    <div className="cp-dropdown-menu">
                      {existingCategories.filter((c) => !categoriesList.includes(c)).map((cat) => (
                        <div key={cat} className="cp-dropdown-item cp-dropdown-item-row">
                          <label className="cp-dropdown-item-check">
                            <input
                              type="checkbox"
                              checked={categoriesList.includes(cat)}
                              onChange={() => {
                                if (!categoriesList.includes(cat)) {
                                  setCategoriesList((prev) => [...prev, cat]);
                                }
                              }}
                            />
                            <span>{cat}</span>
                          </label>
                          <button
                            type="button"
                            className="cp-dropdown-item-delete"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteCategoryPermanent(cat); }}
                            title="Delete category"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <div
                        className="cp-dropdown-item cp-dropdown-custom"
                        onClick={() => { setCategoryCustomMode(true); setCategoryDropdownOpen(false); setCategoryInput(""); }}
                      >
                        Custom / Type Here
                      </div>
                    </div>
                  )}
                </div>
              )}
              {categoriesList.length > 0 && (
                <div className="cp-goals-list">
                  {categoriesList.map((cat, index) => (
                    <div key={index} className="cp-goals-item">
                      <span className="cp-goals-item-text">{cat}</span>
                      <button
                        type="button"
                        className="cp-goals-item-remove"
                        onClick={() => { setPendingRemoveItem({ type: "category", index }); setRemoveConfirmOpen(true); }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
                  <input
                    type="datetime-local"
                    value={phaseDate}
                    onChange={(e) => setPhaseDate(e.target.value)}
                    min={getNowDatetimeLocal()}
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
                        onClick={() => { setPendingRemoveItem({ type: "phase", index }); setRemoveConfirmOpen(true); }}
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
                  <input
                    type="datetime-local"
                    value={deliverableProjInput.due_datetime}
                    onChange={(e) => setDeliverableProjInput((prev) => ({ ...prev, due_datetime: e.target.value }))}
                    min={getNowDatetimeLocal()}
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
                        onClick={() => { setPendingRemoveItem({ type: "deliverable", index }); setRemoveConfirmOpen(true); }}
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
                <input type="number" name="budget" placeholder="Budget amount (PKR)" min="0" step="0.01" value={form.budget} onChange={handleChange} />
              </div>
            </div>

          </div>

        </form>

      </div>
    </div>,
    document.body
  );

  return (
    <>
      {modalContent}
      <ConfirmModal
        isOpen={catDeleteOpen}
        onClose={() => { setCatDeleteOpen(false); setPendingCatDelete(""); }}
        onConfirm={confirmDeleteCategory}
        title="Confirm Deletion"
        message={`Are you sure you want to delete "${pendingCatDelete}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        danger
      />
      <ConfirmModal
        isOpen={goalDeleteOpen}
        onClose={() => { setGoalDeleteOpen(false); setPendingGoalIndex(null); }}
        onConfirm={confirmDeleteGoal}
        title="Delete Goal"
        message="Are you sure you want to delete this goal? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger
      />
      <ConfirmModal
        isOpen={removeConfirmOpen}
        onClose={() => { setRemoveConfirmOpen(false); setPendingRemoveItem({ type: "", index: -1 }); }}
        onConfirm={confirmRemoveItem}
        title="Remove Item"
        message="Are you sure you want to remove this item? This action cannot be undone."
        confirmText="Remove"
        cancelText="Cancel"
        danger
      />
    </>
  );
};

export default CreateProjectModal;
