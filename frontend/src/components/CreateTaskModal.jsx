
import { useEffect, useRef, useState } from "react";
import API_URL from "../config/api";
import { authToken, getUser } from "../utils/auth";
import UserSelectDropdown from "./UserSelectDropdown";
import "./layout/CreateTaskModal.css";

const PRESET_PHASES = [
  "Planning",
  "Design",
  "Development",
  "Testing",
  "Review",
  "Completion",
];

const CreateTaskModal = ({ onClose, projectId = null, projectName = "" }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
  });

  const [milestones, setMilestones] = useState([]);
  const [phaseName, setPhaseName] = useState("");
  const [phaseDate, setPhaseDate] = useState("");
  const [requirementsList, setRequirementsList] = useState([]);
  const [reqInput, setReqInput] = useState("");

  const [pendingFiles, setPendingFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

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
              .then((res) => (res.ok ? res.json() : []))
              .then((data) => {
                const users = ensureCurrentUser(Array.isArray(data) ? data : []);
                setAllUsers(users);
                setDisplayUsers(users);
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
    } else {
      fetch(`${API_URL}/projects`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          const list = data?.data || data;
          setProjects(Array.isArray(list) ? list : []);
        })
        .catch(() => {});

      fetch(`${API_URL}/team-users`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          const users = Array.isArray(data) ? data : [];
          setAllUsers(users);
          setDisplayUsers(users);
        })
        .catch(() => {});
    }
  }, [projectId]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "project_id") {
      setForm((prev) => ({ ...prev, project_id: value, assigned_to: [] }));

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

  const handleAddPhase = () => {
    if (!phaseName.trim() || !phaseDate) return;
    setMilestones((prev) => [...prev, { title: phaseName.trim(), due_date: phaseDate, status: "planned" }]);
    setPhaseName("");
    setPhaseDate("");
  };

  const handleRemovePhase = (index) => {
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePhaseKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddPhase(); }
  };

  const handleAddRequirement = () => {
    if (!reqInput.trim()) return;
    setRequirementsList((prev) => [...prev, reqInput.trim()]);
    setReqInput("");
  };

  const handleRemoveRequirement = (index) => {
    setRequirementsList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleReqKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddRequirement(); }
  };

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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

  const uploadAttachments = async (taskId, token) => {
    for (const file of pendingFiles) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        await fetch(`${API_URL}/tasks/${taskId}/files`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          body: fd,
        });
      } catch {}
    }

    for (const link of links) {
      try {
        await fetch(`${API_URL}/tasks/${taskId}/links`, {
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

  const validateForm = () => {
    const errors = {};
    if (!form.title.trim()) errors.title = "Task Name is required.";
    if (!projectId && !form.project_id) errors.project_id = "Select a project.";
    if (!form.assigned_to || form.assigned_to.length === 0) errors.assigned_to = "Select at least one user.";
    if (!form.priority) errors.priority = "Priority is required.";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setError("");

    if (!validateForm()) {
      console.log("CreateTaskModal: form validation failed");
      return;
    }

    setLoading(true);

    try {
      const token = authToken();
      console.log("CreateTaskModal: token ok, building body");

      const firstMilestone = milestones.length > 0 ? milestones[0] : null;
      const lastMilestone = milestones.length > 0 ? milestones[milestones.length - 1] : null;
      const computedStartDate = firstMilestone ? firstMilestone.due_date : null;
      const computedEndDate = lastMilestone ? lastMilestone.due_date : null;

      const body = {
        title: form.title.trim(),
        description: form.description || null,
        requirements: requirementsList.length > 0 ? requirementsList : null,
        start_date: computedStartDate,
        end_date: computedEndDate,
        assigned_to: form.assigned_to,
        priority: form.priority,
      };

      const url = `${API_URL}/projects/${projectId || form.project_id}/tasks`;
      console.log("CreateTaskModal: posting to", url, body);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      console.log("CreateTaskModal: response status", response.status);
      const data = await response.json();
      console.log("CreateTaskModal: response body", data);

      if (!response.ok) {
        const msg = data.message || "Failed to create task";
        const errors = data.errors ? Object.values(data.errors).flat().join(". ") : "";
        throw new Error(errors || msg);
      }

      const taskIds = data.tasks?.map(t => t.id) || (data.task?.id ? [data.task.id] : []);
      if (taskIds.length > 0 && (pendingFiles.length > 0 || links.length > 0)) {
        await Promise.all(taskIds.map(id => uploadAttachments(id, token)));
      }

      onClose(true);
    } catch (err) {
      console.error("CreateTaskModal: error", err);
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
              <h2>Create New Task</h2>
              <p>Add task details and assign it to team members.</p>
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

              {!projectId ? (
                <div className="task-field">
                  <label>Projects</label>
                  <select
                    name="project_id"
                    value={form.project_id}
                    onChange={handleChange}
                  >
                    <option value="">Select project</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.title}</option>
                    ))}
                  </select>
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
                        onClick={() => handleRemoveRequirement(index)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
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

            {/* DEADLINES - PHASE SYSTEM */}
            <div className="task-card">
              <div className="task-card-top">
                <span>Deadlines</span>
              </div>

              <div className="task-deadline-grid">
                <div className="task-field">
                  <label style={{ fontSize: "13px" }}>Phase</label>
                  <input
                    type="text"
                    placeholder="Enter phase name"
                    value={phaseName}
                    onChange={(e) => setPhaseName(e.target.value)}
                    onKeyDown={handlePhaseKeyDown}
                    list="task-phase-presets"
                  />
                  <datalist id="task-phase-presets">
                    {PRESET_PHASES.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>
                <div className="task-field">
                  <label style={{ fontSize: "13px" }}>Due Date</label>
                  <input
                    type="date"
                    value={phaseDate}
                    onChange={(e) => setPhaseDate(e.target.value)}
                    onKeyDown={handlePhaseKeyDown}
                  />
                </div>
              </div>

              <button
                type="button"
                className="task-add-phase-btn"
                onClick={handleAddPhase}
                disabled={!phaseName.trim() || !phaseDate}
              >
                + Add Phase
              </button>

              {milestones.length > 0 && (
                <div className="task-phase-list">
                  {milestones.map((m, index) => (
                    <div key={index} className="task-phase-item">
                      <div className="task-phase-item-dot" />
                      <div className="task-phase-item-info">
                        <div className="task-phase-item-title">{m.title}</div>
                        <div className="task-phase-item-date">{formatDateDisplay(m.due_date)}</div>
                      </div>
                      <button
                        type="button"
                        className="task-phase-item-remove"
                        onClick={() => handleRemovePhase(index)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {milestones.length > 0 && (
                <div className="task-deadline-summary">
                  <span>Final Deadline:</span>
                  <strong>{formatDateDisplay(milestones[milestones.length - 1].due_date)}</strong>
                </div>
              )}
            </div>

          </div>

        {error && <div className="task-error-banner">{error}</div>}

        {/* FOOTER */}
        <div className="task-footer">
          <button
            type="button"
            className="task-cancel-btn"
            onClick={() => onClose(false)}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="task-create-btn"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Creating..." : "+ Create Task"}
          </button>
        </div>

        </form>

      </div>
    </div>
  );
};

export default CreateTaskModal;
