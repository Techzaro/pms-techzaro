/**
 * CreateTaskModal.jsx
 * Modal form for creating a new task within a project or standalone.
 * Supports multi-user assignment, requirements, deliverables, attachments,
 * and date ranges. Fetches project-specific team members when a project is preselected.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import API_URL from "../config/api";
import { authToken, getUser } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import UserSelectDropdown from "./UserSelectDropdown";
import CustomSelect from "./CustomSelect";
import LoadingButton from "./LoadingButton";
import ConfirmModal from "./ConfirmModal";

import { formatDateTime, toDatetimeLocal, toUTCIso, getNowDatetimeLocal } from "../utils/formatDateTime";
import { publish } from "../utils/eventBus";
import { notify, showSuccessMessage } from "../utils/notify";
import { useSubmit } from "../hooks/useSubmit";
import "./layout/CreateTaskModal.css";

/**
 * Modal form for creating a new task.
 * @param {Function} onClose - Callback to close modal; receives boolean (true if created)
 * @param {number|null} projectId - Pre-selected project ID (hides project dropdown)
 * @param {string} [projectName=""] - Display name of the pre-selected project
 */
const CreateTaskModal = ({ onClose, projectId = null, projectName = "" }) => {
  useEscapeKey(true, onClose);

  const [loading, setLoading] = useState(false);
  const { submitting, run } = useSubmit();
  const [formErrors, setFormErrors] = useState({});
  const [projects, setProjects] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [displayUsers, setDisplayUsers] = useState([]);

  const [form, setForm] = useState({
    project_id: projectId || "",
    assigned_to: [],
    title: "",
    description: "",
    priority: "Medium",
    start_date: "",
    end_date: "",
  });

  const [requirementsList, setRequirementsList] = useState([]);
  const [reqInput, setReqInput] = useState("");
  const [deliverables, setDeliverables] = useState([]);
  const [deliverableInput, setDeliverableInput] = useState({ title: "", due_datetime: "" });

  const [pendingFiles, setPendingFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  const [linkTitleInput, setLinkTitleInput] = useState("");
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [pendingRemoveItem, setPendingRemoveItem] = useState({ type: "", index: -1 });

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: true } }));
    return () => window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: false } }));
  }, []);

  useEffect(() => {
    const token = authToken();
    const currentUser = getUser();

    const ensureCurrentUser = (users) => {
      if (!currentUser) return users;
      const exists = users.some((u) => u.id === currentUser.id);
      if (!exists) {
        return [{ id: currentUser.id, name: currentUser.name, email: currentUser.email, role: currentUser.role }, ...users];
      }
      return users;
    };

    if (projectId) {
      fetch(`${API_URL}/projects/${projectId}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const project = data?.project;
          if (project?.team?.members && project.team.members.length > 0) {
            setDisplayUsers(ensureCurrentUser(project.team.members));
          } else if (project?.members && project.members.length > 0) {
            setDisplayUsers(ensureCurrentUser(project.members));
          } else {
            fetch(`${API_URL}/team-users`, {
              headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
              skipLoader: true,
            })
              .then((res) => (res.ok ? res.json() : { users: [] }))
              .then((data) => {
                const users = ensureCurrentUser(Array.isArray(data) ? data : (data.users || []));
                setAllUsers(users);
                setDisplayUsers(users);
              })
              .catch(() => { });
          }
        })
        .catch(() => { });
    } else {
      Promise.all([
        fetch(`${API_URL}/projects`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          skipLoader: true,
        })
          .then((res) => (res.ok ? res.json() : []))
          .then((data) => {
            const list = data?.data || data;
            setProjects(Array.isArray(list) ? list : []);
          })
          .catch(() => { }),

        fetch(`${API_URL}/team-users`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          skipLoader: true,
        })
          .then((res) => (res.ok ? res.json() : { users: [] }))
          .then((data) => {
            const users = Array.isArray(data) ? data : (data.users || []);
            setAllUsers(users);
            setDisplayUsers(users);
          })
          .catch(() => { }),
      ]);
    }
  }, [projectId]);

  /**
   * Handles input changes. Special-cases project_id to refresh the
   * display user list based on the selected project's team members.
   */
  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "project_id") {
      // Reset assigned users when project changes
      setForm((prev) => ({ ...prev, project_id: value, assigned_to: [] }));

      // Fetch project-specific team members for the user dropdown
      if (value) {
        const token = authToken();
        fetch(`${API_URL}/projects/${value}`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          skipLoader: true,
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            const project = data?.project;
            if (project?.team?.members && project.team.members.length > 0) {
              setDisplayUsers(project.team.members);
            } else {
              setDisplayUsers(allUsers);
            }
          })
          .catch(() => {
            setDisplayUsers(allUsers);
          });
      } else {
        setDisplayUsers(allUsers);
      }
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }

    if (formErrors[name]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleAssignedToChange = (ids) => {
    setForm((prev) => ({ ...prev, assigned_to: ids }));
    if (formErrors.assigned_to) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next.assigned_to;
        return next;
      });
    }
  };

  const handleAddRequirement = () => {
    if (!reqInput.trim()) return;
    setRequirementsList((prev) => [...prev, reqInput.trim()]);
    setReqInput("");
  };

  const handleRemoveRequirement = (index) => {
    setRequirementsList((prev) => prev.filter((_, i) => i !== index));
  };

  const confirmRemoveItem = () => {
    const { type, index } = pendingRemoveItem;
    if (type === "file") handleRemoveFile(index);
    else if (type === "link") handleRemoveLink(index);
    else if (type === "requirement") handleRemoveRequirement(index);
    else if (type === "deliverable") handleRemoveDeliverable(index);
    setRemoveConfirmOpen(false);
    setPendingRemoveItem({ type: "", index: -1 });
  };

  const handleReqKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddRequirement(); }
  };

  const handleAddDeliverable = () => {
    if (!deliverableInput.title.trim()) return;
    const dt = deliverableInput.due_datetime;
    const dueDate = toUTCIso(dt);
    setDeliverables((prev) => [...prev, { title: deliverableInput.title.trim(), due_date: dueDate }]);
    setDeliverableInput({ title: "", due_datetime: "" });
  };

  const handleRemoveDeliverable = (index) => {
    setDeliverables((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDeliverableKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddDeliverable(); }
  };


  const handleFiles = (fileList) => {
    const newFiles = Array.from(fileList);
    setPendingFiles((prev) => [...prev, ...newFiles.map((f) => ({ file: f, name: f.name, size: f.size, renaming: false }))]);
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

  /**
   * Uploads pending file attachments and links to the newly created task.
   * @param {number} taskId - ID of the created task
   * @param {string} token - Auth token
   */
  const uploadAttachments = async (taskId, token) => {
    await Promise.all([
      ...pendingFiles.map((file) => {
        const fd = new FormData();
        fd.append("file", file.file);
        fd.append("name", file.customName || file.name);
        return fetch(`${API_URL}/tasks/${taskId}/files`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          body: fd,
          _notifHandled: true,
        }).catch(() => {});
      }),
      ...links.map((link) => {
        return fetch(`${API_URL}/tasks/${taskId}/links`, {
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
   * Validates required form fields (title, assigned_to, priority).
   * @returns {boolean} True if form is valid
   */
  const validateForm = () => {
    const errors = {};
    if (!form.title.trim()) errors.title = "Task Name is required.";
    if (!form.assigned_to || form.assigned_to.length === 0) errors.assigned_to = "Select at least one user.";
    if (!form.priority) errors.priority = "Priority is required.";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /**
   * Handles form submission: validates, creates task via API,
   * uploads attachments in parallel, and publishes events on success.
   */
  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();

    if (!validateForm()) {
      return;
    }

    await run(async () => {
      try {
        const token = authToken();

        const body = {
          title: form.title.trim(),
          description: form.description || null,
          requirements: requirementsList.length > 0 ? requirementsList : null,
          start_date: toUTCIso(form.start_date),
          end_date: toUTCIso(form.end_date),
          assigned_to: form.assigned_to,
          priority: form.priority,
          deliverables: deliverables.length > 0 ? deliverables.map(d => ({ title: d.title, due_date: d.due_date || null })) : undefined,
        };

        const pid = projectId || form.project_id;
        const url = pid ? `${API_URL}/projects/${pid}/tasks` : `${API_URL}/tasks`;

        const response = await fetch(url, {
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
          const msg = data.message || "Failed to create task";
          const errors = data.errors ? Object.values(data.errors).flat().join(". ") : "";
          throw new Error(errors || msg);
        }

        const taskIds = data.tasks?.map(t => t.id) || (data.task?.id ? [data.task.id] : []);
        if (taskIds.length > 0 && (pendingFiles.length > 0 || links.length > 0)) {
          await Promise.all(taskIds.map(id => uploadAttachments(id, token)));
        }

        showSuccessMessage("Task", "created");
        publish('task:created', data.task || data);
        publish('data:changed', { type: 'task', action: 'created' });
        onClose(true);
      } catch (err) {
        notify.error(err.message);
      }
    });
  };

  return createPortal(
    <>
    <div className="task-overlay">
      <div className="task-modal" onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="task-header">
          <div className="task-header-left">
            <div className="task-icon">
              ⊕
            </div>
            <div>
              <h2>Create New Task</h2>
              <p>Add task details and assign it to team members.</p>
            </div>
          </div>
          <div className="task-header-actions">
            <LoadingButton
              className="task-create-btn"
              onClick={handleSubmit}
              loading={submitting}
            >
              + Create Task
            </LoadingButton>
            <button className="task-close-btn" onClick={() => onClose(false)}>
              ✕
            </button>
          </div>
        </div>

        {/* BODY */}
        <form onSubmit={handleSubmit} className="task-body">

          {/* LEFT SIDE */}
          <div className="task-left">

            <div className="task-grid-2">

              {!projectId ? (
                <div className="task-field">
                  <label>Projects</label>
                  <CustomSelect
                    name="project_id"
                    value={form.project_id}
                    onChange={(val) => handleChange({ target: { name: "project_id", value: val } })}
                    placeholder="Select project"
                    options={[
                      { value: "", label: "Select project" },
                      ...projects.map((project) => ({ value: project.id, label: project.title })),
                    ]}
                  />
                </div>
              ) : (
                <div className="task-field">
                  <label>Project</label>
                  <div className="task-project-name">{projectName || "Current Project"}</div>
                </div>
              )}

              <div className="task-field">
                <label>
                  Assign To <span>*</span>
                </label>
                <UserSelectDropdown
                  users={displayUsers}
                  selectedIds={form.assigned_to}
                  onChange={handleAssignedToChange}
                  placeholder="Click to select members"
                  error={!!formErrors.assigned_to}
                />
                {formErrors.assigned_to && <span className="field-error-text">{formErrors.assigned_to}</span>}
              </div>

            </div>

            <div className="task-field">
              <label>
                Task Name <span>*</span>
              </label>
              <input
                type="text"
                name="title"
                placeholder="Enter task name.."
                value={form.title}
                onChange={handleChange}
                className={formErrors.title ? "field-error" : ""}
              />
              {formErrors.title && <span className="field-error-text">{formErrors.title}</span>}
            </div>

            <div className="task-field">
              <label>Description</label>
              <textarea
                name="description"
                placeholder="Enter task description.."
                value={form.description}
                onChange={handleChange}
              ></textarea>
            </div>


            {/* ATTACHMENTS */}
            <div className="task-field">
              <label>Links & Attachment</label>

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
                          <span className="task-attachment-name">{file.customName || file.name}</span>
                          <span className="task-attachment-size">{(file.size / 1024).toFixed(1)} KB</span>
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
                          <button type="button" className="task-attachment-remove" onClick={() => { setPendingRemoveItem({ type: "file", index }); setRemoveConfirmOpen(true); }}>✕</button>
                        </div>
                      )}
                      {file.renaming && (
                        <button type="button" onClick={() => { setPendingRemoveItem({ type: "file", index }); setRemoveConfirmOpen(true); }} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1, flexShrink: 0 }} title="Remove">&#10005;</button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="task-or-divider">
                <span className="task-or-line"></span>
                <span className="task-or-text">OR</span>
                <span className="task-or-line"></span>
              </div>

              <div className="task-link-input-row" style={{ flexDirection: "column", gap: "8px" }}>
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
                    className="task-link-add-btn"
                    onClick={handleAddLink}
                    disabled={!linkInput.trim()}
                  >
                    Add Link
                  </button>
                </div>
              </div>

              {links.length > 0 && (
                <div className="task-attachments-list">
                  {links.map((link, index) => (
                    <div key={index} className="task-attachment-item">
                      <span className="task-attachment-icon">🔗</span>
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
                            <a href={link.url} target="_blank" rel="noopener noreferrer" className="task-attachment-link" style={{ fontSize: "12px", color: "#6366f1", marginTop: 2 }}>
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
                          <span className="task-attachment-name" style={{ fontWeight: 600, fontSize: "13px" }}>{link.customName || link.name}</span>
                          <a href={link.url} target="_blank" rel="noopener noreferrer" className="task-attachment-link" style={{ fontSize: "12px", color: "#6366f1" }}>
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
                          <button type="button" className="task-attachment-remove" onClick={() => { setPendingRemoveItem({ type: "link", index }); setRemoveConfirmOpen(true); }}>✕</button>
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

          {/* RIGHT SIDE */}
          <div className="task-right">

            {/* PRIORITY */}
            <div className="task-card">
              <label>Priority <span style={{ color: "#ef4444" }}>*</span></label>
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
              {formErrors.priority && <span className="field-error-text">{formErrors.priority}</span>}
            </div>

            <div className="task-card">
              <div className="task-card-top"><span>Due Date & Time</span></div>
              <div className="task-deadline-grid">
                <div>
                  <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>Start</label>
                  <input
                    type="datetime-local"
                    value={form.start_date}
                    onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                    min={getNowDatetimeLocal()}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>End</label>
                  <input
                    type="datetime-local"
                    value={form.end_date}
                    onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                    min={form.start_date || getNowDatetimeLocal()}
                  />
                </div>
              </div>
            </div>

            <div className="task-field">
              <label>Requirements</label>
              <div className="cp-goals-input-row">
                <input
                  type="text"
                  placeholder="Enter a requirement"
                  value={reqInput}
                  onChange={(e) => setReqInput(e.target.value)}
                  onKeyDown={handleReqKeyDown}
                />
                <button
                  type="button"
                  className="cp-goals-add-btn"
                  onClick={handleAddRequirement}
                  disabled={!reqInput.trim()}
                >
                  Add
                </button>
              </div>

              {requirementsList.length > 0 && (
                <div className="cp-goals-list">
                  {requirementsList.map((req, index) => (
                    <div key={index} className="cp-goals-item">
                      <span className="cp-goals-item-text">{req}</span>
                      <button
                        type="button"
                        className="cp-goals-item-remove"
                        onClick={() => { setPendingRemoveItem({ type: "requirement", index }); setRemoveConfirmOpen(true); }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* DELIVERABLES */}
            <div className="task-card">
              <div className="task-card-top">
                <span>Deliverables</span>
              </div>

              <div className="task-deadline-grid">
                <div className="task-field">
                  <label style={{ fontSize: "13px" }}>Deliverable Name</label>
                  <input
                    type="text"
                    placeholder="Enter deliverable name"
                    value={deliverableInput.title}
                    onChange={(e) => setDeliverableInput((prev) => ({ ...prev, title: e.target.value }))}
                    onKeyDown={handleDeliverableKeyDown}
                  />
                </div>
                <div className="task-field">
                  <label style={{ fontSize: "13px" }}>Due Date & Time</label>
                  <input
                    type="datetime-local"
                    value={deliverableInput.due_datetime}
                    onChange={(e) => setDeliverableInput((prev) => ({ ...prev, due_datetime: e.target.value }))}
                    min={getNowDatetimeLocal()}
                  />
                </div>
              </div>

              <button
                type="button"
                className="task-add-phase-btn"
                onClick={handleAddDeliverable}
                disabled={!deliverableInput.title.trim()}
              >
                + Add Deliverable
              </button>

              {deliverables.length > 0 && (
                <div className="task-phase-list">
                  {deliverables.map((d, index) => (
                    <div key={index} className="task-phase-item">
                      <div className="task-phase-item-dot" style={{ background: "#8b5cf6" }} />
                      <div className="task-phase-item-info">
                        <div className="task-phase-item-title">{d.title}</div>
                        <div className="task-phase-item-date">{d.due_date ? formatDateTime(d.due_date).replace("\n", " ") : "No due date"}</div>
                      </div>
                      <button
                        type="button"
                        className="task-phase-item-remove"
                        onClick={() => { setPendingRemoveItem({ type: "deliverable", index }); setRemoveConfirmOpen(true); }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
        
          </div>







        </form>

      </div>
    </div>
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
    </>,
    document.body
  );
};

export default CreateTaskModal;