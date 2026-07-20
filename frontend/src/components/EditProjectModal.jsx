/**
 * EditProjectModal.jsx
 * Modal form for editing an existing project's details.
 * Pre-populates fields from the project object and supports updating
 * milestones, subtasks, attachments, and team assignments.
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
import { formatDateTime, toDatetimeLocal, toUTCIso, getNowDatetimeLocal } from "../utils/formatDateTime";
import { publish } from "../utils/eventBus";
import { notify, showSuccessMessage } from "../utils/notify";
import { useSubmit } from "../hooks/useSubmit";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import RichTextEditor from "./RichTextEditor";
import "./layout/CreateProjectModal.css";

const EditProjectModal = ({ project, onClose }) => {
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
  useEscapeKey(true, handleClose);

  const [loading, setLoading] = useState(false);
  const { submitting, run } = useSubmit();
  const [formErrors, setFormErrors] = useState({});
  const [teams, setTeams] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  const [form, setForm] = useState({
    title: project?.title || "",
    description: project?.description || "",
    team_id: project?.team_id || "",
    team_ids: project?.team_ids || [],
    assigned_users: project?.assigned_users || [],
    priority: project?.priority || "Medium",
    status: project?.status || "Planning",
    client_name: project?.client_name || "",
    budget: project?.budget || "",

  });

  const [categoriesList, setCategoriesList] = useState(() => {
    if (project?.category) {
      try {
        const parsed = JSON.parse(project.category);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return [project.category];
      }
    }
    return [];
  });
  const [categoryInput, setCategoryInput] = useState("");
  const [catSearch, setCatSearch] = useState("");
  const [existingCategories, setExistingCategories] = useState([]);
  const [categoryCustomMode, setCategoryCustomMode] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef(null);
  const [teamRolesOpen, setTeamRolesOpen] = useState(false);
  const [teamRolesSearch, setTeamRolesSearch] = useState("");
  const teamRolesRef = useRef(null);
  const [catDeleteOpen, setCatDeleteOpen] = useState(false);
  const [pendingCatDelete, setPendingCatDelete] = useState("");
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [pendingRemoveItem, setPendingRemoveItem] = useState({ type: "", index: -1, id: "" });
  const [deletedCategories, setDeletedCategories] = useState(() => {
    try { return JSON.parse(localStorage.getItem("deleted_categories") || "[]"); } catch { return []; }
  });

  const [milestones, setMilestones] = useState(() => {
    if (project?.milestones && project.milestones.length > 0) {
      return project.milestones.map((m) => ({
        title: m.title,
        due_date: m.due_date ? toDatetimeLocal(m.due_date) : "",
        status: m.status || "planned",
      }));
    }
    return [];
  });
  const [phaseName, setPhaseName] = useState("");
  const [phaseDate, setPhaseDate] = useState("");
  const [phaseDropdownOpen, setPhaseDropdownOpen] = useState(false);
  const [phaseSearch, setPhaseSearch] = useState("");
  const phaseDropdownRef = useRef(null);
  const [savedMilestones, setSavedMilestones] = useState(() => {
    try { return JSON.parse(localStorage.getItem("persisted_milestones") || "[]"); } catch { return []; }
  });

  const [existingFiles, setExistingFiles] = useState(project?.files || []);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  const [linkTitleInput, setLinkTitleInput] = useState("");
  const [editingLink, setEditingLink] = useState(null); // { type: 'existing'|'pending', index, id, title, url }
  const [editLinkForm, setEditLinkForm] = useState({ title: "", url: "" });
  const [editingFile, setEditingFile] = useState(null); // { type: 'existing'|'pending', index, id }
  const [editFileForm, setEditFileForm] = useState({ title: "" });
  const [editFileNewFile, setEditFileNewFile] = useState(null);
  const [editFileDeleted, setEditFileDeleted] = useState(false);
  const [editFileDeleteConfirm, setEditFileDeleteConfirm] = useState(false);
  const editFileInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: true } }));
    return () => window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: false } }));
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target)) {
        setCategoryDropdownOpen(false);
      }
      if (teamRolesRef.current && !teamRolesRef.current.contains(e.target)) {
        setTeamRolesOpen(false);
        setTeamRolesSearch("");
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
          setExistingCategories([...cats].sort());
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
    setIsDirty(true);
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
    setIsDirty(true);
    setForm((prev) => ({ ...prev, assigned_users: ids }));
  };

  const handleAddPhase = () => {
    if (!phaseName.trim() || !phaseDate) return;
    const formattedDt = toUTCIso(phaseDate);
    setIsDirty(true);
    setMilestones((prev) => [...prev, { title: phaseName.trim(), due_date: formattedDt, status: "planned" }]);
    const name = phaseName.trim();
    setPhaseName("");
    setPhaseDate("");
    setPhaseDropdownOpen(false);
    setPhaseSearch("");
    if (name && !savedMilestones.includes(name)) {
      const updated = [...savedMilestones, name].sort();
      setSavedMilestones(updated);
      localStorage.setItem("persisted_milestones", JSON.stringify(updated));
    }
  };

  const handleRemovePhase = (index) => {
    setIsDirty(true);
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  };

  const confirmRemoveItem = () => {
    const { type, index, id } = pendingRemoveItem;
    if (type === "existing-file" || type === "existing-link") {
      handleDeleteExistingFile(id);
    } else if (type === "pending-file") {
      handleRemoveFile(index);
    } else if (type === "pending-link") {
      handleRemoveLink(index);
    } else if (type === "category") {
      handleRemoveCategory(index);
    } else if (type === "phase") {
      handleRemovePhase(index);
    }
    setRemoveConfirmOpen(false);
    setPendingRemoveItem({ type: "", index: -1, id: "" });
  };

  const handlePhaseKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddPhase(); }
  };

  const handleAddCategory = () => {
    if (!categoryInput.trim()) return;
    const newCat = categoryInput.trim();
    setIsDirty(true);
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
    setIsDirty(true);
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

  const handleCategoryKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddCategory(); }
  };

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return "";
    return formatDateTime(dateStr).replace("\n", " ");
  };

  const handleFiles = (fileList) => {
    const newFiles = Array.from(fileList);
    setIsDirty(true);
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
    setIsDirty(true);
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDeleteExistingFile = async (fileId) => {
    try {
      const token = authToken();
      await fetch(`${API_URL}/projects/${project.id}/files/${fileId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      setExistingFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch {}
  };

  const handleAddLink = () => {
    if (!linkInput.trim()) return;
    let url = linkInput.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const name = linkTitleInput.trim() || url;
    setIsDirty(true);
    setLinks((prev) => [...prev, { url, name, renaming: false }]);
    setLinkInput("");
    setLinkTitleInput("");
  };

  const handleRemoveLink = (index) => {
    setIsDirty(true);
    setLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLinkKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddLink(); }
  };

  const uploadAttachments = async (projId, token) => {
    await Promise.all([
      ...pendingFiles.map((file) => {
        const fd = new FormData();
        fd.append("file", file.file);
        fd.append("name", file.customName || file.name);
        return fetch(`${API_URL}/projects/${projId}/files`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          body: fd,
          _notifHandled: true,
        }).catch(() => {});
      }),
      ...links.map((link) => {
        return fetch(`${API_URL}/projects/${projId}/links`, {
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
   * Handles form submission: validates, updates project via PUT request,
   * uploads new attachments, and publishes events on success.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    await run(async () => {
      try {
        const token = authToken();

        // Build the update payload from form state
        const body = {
          title: form.title.trim(),
          description: form.description || null,
          category: categoriesList.length > 0 ? JSON.stringify(categoriesList) : null,
          team_id: form.team_id ? parseInt(form.team_id) : null,
          team_ids: form.team_ids,
          assigned_users: form.assigned_users.length > 0 ? form.assigned_users : [],
          priority: form.priority,
          status: form.status,
          client_name: form.client_name || null,
          budget: form.budget ? parseFloat(form.budget) : null,
          milestones: milestones.length > 0 ? milestones : [],
          existing_file_names: existingFiles.reduce((acc, f) => {
            if (f.customName && f.customName !== f.name) {
              acc.push({ id: f.id, name: f.customName });
            }
            return acc;
          }, []),
        };

        const response = await fetch(`${API_URL}/projects/${project.id}`, {
          method: "PUT",
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
          const msg = data.message || "Failed to update project";
          const errors = data.errors ? Object.values(data.errors).flat().join(". ") : "";
          throw new Error(errors || msg);
        }

        if (pendingFiles.length > 0 || links.length > 0) {
          await uploadAttachments(project.id, token);
        }

        showSuccessMessage("Project", "updated");
        publish('project:updated', data.project || data);
        publish('data:changed', { type: 'project', action: 'updated' });
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
              <h2>Edit Project</h2>
              <p>Update project details and settings.</p>
            </div>
          </div>
          <div className="cp-header-actions">
            <LoadingButton className="cp-create-btn" onClick={handleSubmit} loading={submitting}>
              Save Changes
            </LoadingButton>
            <button className="cp-close-btn" onClick={handleClose}>✕</button>
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
              <RichTextEditor
                value={form.description}
                onChange={(val) => { setIsDirty(true); setForm((prev) => ({ ...prev, description: val })); }}
                placeholder="Enter project description..."
              />
            </div>

            {/* PROJECT MILESTONES */}
            <div className="cp-card">
              <div className="cp-card-top">
                <span>Project Milestones</span>
              </div>

              <div className="cp-deadline-grid">
                <div className="cp-field" ref={phaseDropdownRef}>
                  <label style={{ fontSize: "13px" }}>Phase</label>
                  <input
                    type="text"
                    placeholder="Enter phase name"
                    value={phaseName}
                    onChange={(e) => {
                      setPhaseName(e.target.value);
                      setPhaseDropdownOpen(true);
                      setPhaseSearch(e.target.value);
                    }}
                    onFocus={() => { setPhaseDropdownOpen(true); setPhaseSearch(phaseName); }}
                    onKeyDown={handlePhaseKeyDown}
                  />
                  {phaseDropdownOpen && (
                    <div className="cp-dropdown-menu" style={{ position: "relative", top: "4px", boxShadow: "0 8px 24px rgba(0,0,0,0.1)", maxHeight: "200px", overflowY: "auto" }}>
                      {savedMilestones
                        .filter((p) => !phaseSearch.trim() || p.toLowerCase().includes(phaseSearch.toLowerCase()))
                        .map((p) => (
                        <div
                          key={p}
                          className="cp-dropdown-item"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setPhaseName(p);
                            setPhaseDropdownOpen(false);
                            setPhaseSearch("");
                          }}
                        >
                          {p}
                        </div>
                      ))}
                      {savedMilestones.filter((p) => !phaseSearch.trim() || p.toLowerCase().includes(phaseSearch.toLowerCase())).length === 0 && phaseSearch.trim() && (
                        <div className="cp-dropdown-item" style={{ color: "#9ca3af", fontStyle: "italic" }}>
                          Type and press Enter to add "{phaseSearch}"
                        </div>
                      )}
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
                        onClick={() => { setPendingRemoveItem({ type: "phase", index, id: "" }); setRemoveConfirmOpen(true); }}
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

              {(() => {
                const existingAttachments = existingFiles.filter(
                  (f) => !(f.url && f.url.startsWith("http") && !f.url.includes("/storage/"))
                );
                return existingAttachments.length > 0 && (
                  <div className="cp-attachments-list">
                    {existingAttachments.map((file) => {
                      const fileUrl = file.url
                        ? (file.url.startsWith("http") ? file.url : API_URL.replace(/\/api\/?$/, "") + file.url)
                        : "#";
                      return (
                        <div key={file.id} className="cp-attachment-item">
                          <span className="cp-attachment-drag" title="Drag to reorder">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                          </span>
                          <span className="cp-attachment-icon">📄</span>
                          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="cp-attachment-name cp-attachment-link" style={{ fontWeight: 600, fontSize: "13px" }}>
                              {file.customName || file.name}
                            </a>
                          </div>
                          <div className="cp-attachment-actions">
                            <button type="button" className="cp-action-btn cp-action-btn-edit" title="Edit Name" onClick={() => {
                              setEditingFile({ type: "existing", id: file.id, currentName: file.customName || file.name });
                              setEditFileForm({ title: file.customName || file.name.replace(/\.[^.]+$/, "") });
                              setEditFileNewFile(null);
                              setEditFileDeleted(false);
                            }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                            </button>
                            <button type="button" className="cp-action-btn cp-action-btn-delete" title="Delete File" onClick={() => { setPendingRemoveItem({ type: "existing-file", index: -1, id: file.id }); setRemoveConfirmOpen(true); }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {pendingFiles.length > 0 && (
                <div className="cp-attachments-list">
                  {pendingFiles.map((file, index) => (
                    <div key={index} className="cp-attachment-item">
                      <span className="cp-attachment-drag" title="Drag to reorder">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                      </span>
                      <span className="cp-attachment-icon">📄</span>
                      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                        <span className="cp-attachment-name" style={{ fontWeight: 600, fontSize: "13px" }}>{file.customName || file.name}</span>
                        <span className="cp-attachment-size">{(file.size / 1024).toFixed(1)} KB</span>
                      </div>
                      <div className="cp-attachment-actions">
                        <button type="button" className="cp-action-btn cp-action-btn-edit" title="Edit Name" onClick={() => {
                          setEditingFile({ type: "pending", index, currentName: file.customName || file.name });
                          setEditFileForm({ title: file.customName || file.name.replace(/\.[^.]+$/, "") });
                          setEditFileNewFile(null);
                          setEditFileDeleted(false);
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                        </button>
                        <button type="button" className="cp-action-btn cp-action-btn-delete" title="Delete File" onClick={() => { setPendingRemoveItem({ type: "pending-file", index }); setRemoveConfirmOpen(true); }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </div>
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
                  onChange={(e) => { setIsDirty(true); setLinkTitleInput(e.target.value); }}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    placeholder="Paste link (Drive, Figma, Website, etc.)"
                    value={linkInput}
                    onChange={(e) => { setIsDirty(true); setLinkInput(e.target.value); }}
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

              {(() => {
                const existingLinks = existingFiles.filter(
                  (f) => f.url && f.url.startsWith("http") && !f.url.includes("/storage/")
                );
                return existingLinks.length > 0 && (
                  <div className="cp-attachments-list" style={{ marginTop: "8px" }}>
                    {existingLinks.map((file) => (
                      <div key={file.id} className="cp-attachment-item">
                        <span className="cp-attachment-drag" title="Drag to reorder">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                        </span>
                        <span className="cp-attachment-icon">🔗</span>
                        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                          <span className="cp-attachment-name" style={{ fontWeight: 600, fontSize: "13px" }}>{(file.customName || file.name).length > 45 ? (file.customName || file.name).substring(0, 45) + "..." : (file.customName || file.name)}</span>
                          <a href={file.url} target="_blank" rel="noopener noreferrer" className="cp-attachment-link" style={{ fontSize: "12px", color: "#6366f1" }}>
                            {file.url.length > 45 ? file.url.substring(0, 45) + "..." : file.url}
                          </a>
                        </div>
                        <div className="cp-attachment-actions">
                          <button type="button" className="cp-action-btn cp-action-btn-edit" title="Edit Link" onClick={() => {
                            setEditingLink({ type: "existing", index: -1, id: file.id });
                            setEditLinkForm({ title: file.customName || file.name, url: file.url });
                          }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                          </button>
                          <button type="button" className="cp-action-btn cp-action-btn-delete" title="Delete Link" onClick={() => { setPendingRemoveItem({ type: "existing-link", index: -1, id: file.id }); setRemoveConfirmOpen(true); }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {links.length > 0 && (
                <div className="cp-attachments-list">
                  {links.map((link, index) => (
                    <div key={index} className="cp-attachment-item">
                      <span className="cp-attachment-drag" title="Drag to reorder">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                      </span>
                      <span className="cp-attachment-icon">🔗</span>
                      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                        <span className="cp-attachment-name" style={{ fontWeight: 600, fontSize: "13px" }}>{link.customName || link.name}</span>
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="cp-attachment-link" style={{ fontSize: "12px", color: "#6366f1" }}>
                          {link.url.length > 45 ? link.url.substring(0, 45) + "..." : link.url}
                        </a>
                      </div>
                      <div className="cp-attachment-actions">
                        <button type="button" className="cp-action-btn cp-action-btn-edit" title="Edit Link" onClick={() => {
                          setEditingLink({ type: "pending", index });
                          setEditLinkForm({ title: link.customName || link.name, url: link.url });
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                        </button>
                        <button type="button" className="cp-action-btn cp-action-btn-delete" title="Delete Link" onClick={() => { setPendingRemoveItem({ type: "pending-link", index }); setRemoveConfirmOpen(true); }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </div>
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
                    onChange={(e) => { setIsDirty(true); setCategoryInput(e.target.value); }}
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
                  <div className="cp-category-trigger cp-combo-trigger" onClick={() => { setCategoryDropdownOpen(true); }}>
                    {categoriesList.length > 0 && (
                      <span className="cp-combo-count">{categoriesList.length} selected</span>
                    )}
                    {categoriesList.length === 0 && !categoryDropdownOpen && (
                      <span className="cp-combo-placeholder">Select category</span>
                    )}
                    {categoryDropdownOpen && (
                      <input
                        type="text"
                        className="cp-combo-input"
                        placeholder="Search categories..."
                        value={catSearch}
                        onChange={(e) => { setCatSearch(e.target.value); }}
                        onFocus={() => setCategoryDropdownOpen(true)}
                        onKeyDown={(e) => { if (e.key === "Escape") { setCatSearch(""); setCategoryDropdownOpen(false); } }}
                        autoFocus
                      />
                    )}
                    <svg className={`cp-dropdown-arrow ${categoryDropdownOpen ? "open" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" onClick={(e) => { e.stopPropagation(); setCategoryDropdownOpen((prev) => !prev); }}><polyline points="6 9 12 15 18 9" /></svg>
                  </div>
                  {categoryDropdownOpen && (
                    <div className="cp-dropdown-menu">
                      {existingCategories
                        .filter((c) => !categoriesList.includes(c))
                        .filter((c) => !catSearch.trim() || c.toLowerCase().includes(catSearch.toLowerCase()))
                        .map((cat) => (
                        <div key={cat} className="cp-dropdown-item cp-dropdown-item-row">
                          <label className="cp-dropdown-item-check">
                            <input
                              type="checkbox"
                              checked={categoriesList.includes(cat)}
                              onChange={() => {
                                if (!categoriesList.includes(cat)) {
                                  setIsDirty(true);
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
                        onClick={() => { setPendingRemoveItem({ type: "category", index, id: "" }); setRemoveConfirmOpen(true); }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* TEAMS & MEMBERS */}
            <div className="cp-field">
              <label>Teams (Optional)</label>
              <div className="cp-dropdown-wrap cp-combo-trigger" ref={teamRolesRef} onClick={() => { if (!teamRolesOpen) { setTeamRolesOpen(true); setTeamRolesSearch(""); } }}>
                {form.team_ids.length > 0 && (
                  <span className="cp-combo-count">{form.team_ids.length} selected</span>
                )}
                {form.team_ids.length === 0 && !teamRolesOpen && (
                  <span className="cp-combo-placeholder">Select Teams</span>
                )}
                {teamRolesOpen && (
                  <input
                    type="text"
                    className="cp-combo-input"
                    placeholder="Search teams..."
                    value={teamRolesSearch}
                    onChange={(e) => setTeamRolesSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") { setTeamRolesSearch(""); setTeamRolesOpen(false); } }}
                    autoFocus
                  />
                )}
                <svg className={`cp-dropdown-arrow ${teamRolesOpen ? "open" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" onClick={(e) => { e.stopPropagation(); if (teamRolesOpen) { setTeamRolesOpen(false); setTeamRolesSearch(""); } else { setTeamRolesOpen(true); setTeamRolesSearch(""); } }}><polyline points="6 9 12 15 18 9" /></svg>
                {teamRolesOpen && (
                  <div className="cp-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                    {teams.filter((t) => !teamRolesSearch.trim() || t.name.toLowerCase().includes(teamRolesSearch.toLowerCase())).map((team) => (
                      <label key={team.id} className="cp-dropdown-item">
                        <input
                          type="checkbox"
                          checked={form.team_ids.includes(team.id)}
                          onChange={() => {
                            setIsDirty(true);
                            setForm((prev) => ({
                              ...prev,
                              team_ids: prev.team_ids.includes(team.id)
                                ? prev.team_ids.filter((id) => id !== team.id)
                                : [...prev.team_ids, team.id],
                            }));
                          }}
                        />
                        <span>{team.name}</span>
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
              />
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
        isOpen={removeConfirmOpen}
        onClose={() => { setRemoveConfirmOpen(false); setPendingRemoveItem({ type: "", index: -1, id: "" }); }}
        onConfirm={confirmRemoveItem}
        title="Remove Item"
        message="Are you sure you want to remove this item? This action cannot be undone."
        confirmText="Remove"
        cancelText="Cancel"
        danger
      />

      {/* Edit Link Modal */}
      {editingLink && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 10003, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }} onClick={() => setEditingLink(null)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: "24px 28px", width: 400, maxWidth: "90vw", boxShadow: "0 25px 60px rgba(0,0,0,0.25)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#111827" }}>Edit File / Link</h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6b7280" }}>Rename or update the URL below.</p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Title</label>
              <input
                type="text"
                value={editLinkForm.title}
                onChange={(e) => setEditLinkForm((p) => ({ ...p, title: e.target.value }))}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", color: "#111827" }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>URL</label>
              <input
                type="url"
                value={editLinkForm.url}
                onChange={(e) => setEditLinkForm((p) => ({ ...p, url: e.target.value }))}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", color: "#111827" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => setEditingLink(null)} style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={(e) => e.target.style.background = "#f9fafb"} onMouseLeave={(e) => e.target.style.background = "#fff"}>Cancel</button>
              <button type="button" onClick={() => {
                if (editingLink.type === "existing") {
                  setExistingFiles((p) => p.map((f) => f.id === editingLink.id ? { ...f, customName: editLinkForm.title, url: editLinkForm.url } : f));
                } else {
                  setLinks((p) => {
                    const updated = [...p];
                    updated[editingLink.index] = { ...updated[editingLink.index], customName: editLinkForm.title, url: editLinkForm.url };
                    return updated;
                  });
                }
                setEditingLink(null);
              }} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={(e) => e.target.style.background = "#4f46e5"} onMouseLeave={(e) => e.target.style.background = "#6366f1"}>Save</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit File Modal */}
      {editingFile && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 10003, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }} onClick={() => { setEditingFile(null); setEditFileNewFile(null); setEditFileDeleted(false); setEditFileDeleteConfirm(false); }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: "24px 28px", width: 420, maxWidth: "90vw", boxShadow: "0 25px 60px rgba(0,0,0,0.25)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#111827" }}>Edit File</h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6b7280" }}>Rename or replace this file.</p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Title</label>
              <input
                type="text"
                value={editFileForm.title}
                onChange={(e) => setEditFileForm({ title: e.target.value })}
                autoFocus
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", color: "#111827" }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>File</label>
              {editingFile.type === "existing" && !editFileDeleted && !editFileNewFile ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                  <span style={{ fontSize: 14 }}>📄</span>
                  <span style={{ flex: 1, fontSize: 13, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{editingFile.currentName || "Current file"}</span>
                  <button type="button" onClick={() => setEditFileDeleteConfirm(true)} className="cp-action-btn cp-action-btn-delete" title="Delete current file" style={{ width: 24, height: 24 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              ) : editFileNewFile ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
                  <span style={{ fontSize: 14 }}>📄</span>
                  <span style={{ flex: 1, fontSize: 13, color: "#166534", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{editFileNewFile.name}</span>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>{(editFileNewFile.size / 1024).toFixed(1)} KB</span>
                  <button type="button" onClick={() => { setEditFileNewFile(null); setEditFileDeleted(false); }} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 14, fontWeight: 700, padding: 0 }}>✕</button>
                </div>
              ) : (
                <label style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", padding: "10px 12px", border: "1px dashed #d1d5db", borderRadius: 8, background: "#f9fafb", color: "#6b7280", fontSize: 13, cursor: "pointer", textAlign: "center" }}>
                  Click to select a file
                  <input
                    type="file"
                    style={{ display: "none" }}
                    onChange={(e) => { if (e.target.files.length > 0) { const f = e.target.files[0]; setEditFileNewFile(f); setEditFileDeleted(false); if (!editFileForm.title) setEditFileForm({ title: f.name.replace(/\.[^.]+$/, "") }); } e.target.value = ""; }}
                  />
                </label>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => { setEditingFile(null); setEditFileNewFile(null); setEditFileDeleted(false); setEditFileDeleteConfirm(false); }} style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={(e) => e.target.style.background = "#f9fafb"} onMouseLeave={(e) => e.target.style.background = "#fff"}>Cancel</button>
              <button type="button" onClick={async () => {
                const token = authToken();
                if (editingFile.type === "existing") {
                  if (editFileDeleted && !editFileNewFile) {
                    try {
                      await fetch(`${API_URL}/projects/${project.id}/files/${editingFile.id}`, {
                        method: "DELETE",
                        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
                        _notifHandled: true,
                      });
                    } catch (_) {}
                    setExistingFiles((p) => p.filter((f) => f.id !== editingFile.id));
                    window.dispatchEvent(new CustomEvent('project-file-refresh'));
                  } else if (editFileNewFile) {
                    try {
                      await fetch(`${API_URL}/projects/${project.id}/files/${editingFile.id}`, {
                        method: "DELETE",
                        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
                        _notifHandled: true,
                      });
                    } catch (_) {}
                    const fd = new FormData();
                    fd.append("file", editFileNewFile);
                    fd.append("name", editFileForm.title || editFileNewFile.name);
                    try {
                      const res = await fetch(`${API_URL}/projects/${project.id}/files`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
                        body: fd,
                        _notifHandled: true,
                      });
                      const data = await res.json();
                      if (data.file) {
                        setExistingFiles((p) => p.map((f) => f.id === editingFile.id ? { ...data.file, customName: editFileForm.title } : f));
                      } else {
                        setExistingFiles((p) => p.map((f) => f.id === editingFile.id ? { ...f, customName: editFileForm.title, name: editFileForm.title } : f));
                      }
                    } catch (_) {
                      setExistingFiles((p) => p.map((f) => f.id === editingFile.id ? { ...f, customName: editFileForm.title, name: editFileForm.title } : f));
                    }
                    window.dispatchEvent(new CustomEvent('project-file-refresh'));
                  } else {
                    setExistingFiles((p) => p.map((f) => f.id === editingFile.id ? { ...f, customName: editFileForm.title } : f));
                  }
                } else {
                  setPendingFiles((p) => {
                    const updated = [...p];
                    updated[editingFile.index] = { ...updated[editingFile.index], customName: editFileForm.title, ...(editFileNewFile ? { file: editFileNewFile, name: editFileNewFile.name, size: editFileNewFile.size } : {}) };
                    return updated;
                  });
                }
                setEditingFile(null);
                setEditFileNewFile(null);
                setEditFileDeleted(false);
                setEditFileDeleteConfirm(false);
              }} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={(e) => e.target.style.background = "#4f46e5"} onMouseLeave={(e) => e.target.style.background = "#6366f1"}>Save</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit File Delete Confirmation */}
      <ConfirmModal
        isOpen={editFileDeleteConfirm}
        onClose={() => setEditFileDeleteConfirm(false)}
        onConfirm={() => { setEditFileDeleteConfirm(false); setEditFileDeleted(true); setEditFileNewFile(null); }}
        title="Delete File"
        message="Are you sure you want to delete this file? You can upload a new file after."
        confirmText="Delete"
        cancelText="Cancel"
        danger
      />

      {ConfirmDialog}
    </>
  );
};

export default EditProjectModal;
