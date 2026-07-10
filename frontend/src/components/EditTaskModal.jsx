/**
 * EditTaskModal.jsx
 * Modal form for editing an existing task's details.
 * Supports updating title, description, priority, dates, assignees, and deliverables.
 * Includes special handling for self-assigned tasks.
 */

import { useState, useEffect, useRef } from "react";
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
 * Modal form for editing an existing task.
 * @param {Object} task - The task object to edit (pre-populates form fields)
 * @param {Function} onClose - Callback to close modal; receives boolean (true if saved)
 */
export default function EditTaskModal({ task, onClose }) {
  useEscapeKey(true, onClose);
  const [container, setContainer] = useState(null);

  useEffect(() => {
    setContainer(document.body);
  }, []);

  const currentUser = getUser();

  const [form, setForm] = useState({
    title: task.title || "",
    description: task.description || "",
    priority: task.priority || "Medium",
    start_date: task.start_date ? toDatetimeLocal(task.start_date) : "",
    end_date: task.end_date ? toDatetimeLocal(task.end_date) : "",
  });
  const [allUsers, setAllUsers] = useState([]);
  const [displayUsers, setDisplayUsers] = useState([]);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState(
    task.assignees?.map((a) => a.id) || []
  );
  const [dueDates, setDueDates] = useState(() => {
    const initial = {};
    if (task.assignees) {
      task.assignees.forEach((a) => {
        if (a.pivot?.due_date) initial[a.id] = a.pivot.due_date.slice(0, 16);
      });
    }
    return initial;
  });
  const [deliverables, setDeliverables] = useState([]);
  const [deliverableInput, setDeliverableInput] = useState({ title: "", due_datetime: "" });
  const [pendingFiles, setPendingFiles] = useState([]);
  const [existingFiles, setExistingFiles] = useState(task.files || []);
  const [links, setLinks] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  const [linkTitleInput, setLinkTitleInput] = useState("");
  const { submitting, run } = useSubmit();
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [pendingRemoveItem, setPendingRemoveItem] = useState({ type: "", index: -1, id: "" });

  // Determine if this is a self-assigned task (created by current user and assigned only to themselves)
  const isSelfTask = currentUser && parseInt(task.assigned_by, 10) === parseInt(currentUser.id, 10) && selectedAssigneeIds.length === 1 && selectedAssigneeIds[0] === parseInt(currentUser.id, 10);

  useEffect(() => {
    const token = authToken();
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
      .catch(() => {});
  }, []);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAssignedToChange = (ids) => {
    setSelectedAssigneeIds(ids);
    setDueDates((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (!ids.includes(Number(k))) delete next[k];
      });
      return next;
    });
  };

  const handleDueDateChange = (userId, value) => {
    setDueDates((prev) => ({ ...prev, [userId]: value }));
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

  const confirmRemoveItem = () => {
    const { type, index, id } = pendingRemoveItem;
    if (type === "existing-file" || type === "existing-link") {
      handleDeleteExistingFile(id);
    } else if (type === "pending-file") {
      handleRemoveFile(index);
    } else if (type === "pending-link") {
      handleRemoveLink(index);
    } else if (type === "deliverable") {
      handleRemoveDeliverable(index);
    }
    setRemoveConfirmOpen(false);
    setPendingRemoveItem({ type: "", index: -1, id: "" });
  };

  const handleDeliverableKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddDeliverable(); }
  };

  const handleFiles = (fileList) => {
    setPendingFiles((prev) => [...prev, ...Array.from(fileList).map((f) => ({ file: f, name: f.name, size: f.size, renaming: false }))]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropRef.current?.classList.remove("cp-drop-active");
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
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

  const handleDeleteExistingFile = async (fileId) => {
    try {
      const token = authToken();
      await fetch(`${API_URL}/tasks/${task.id}/files/${fileId}`, {
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
   * Uploads pending file attachments and links to the task.
   */
  const uploadAttachments = async () => {
    const token = authToken();
    await Promise.all([
      ...pendingFiles.map((file) => {
        const fd = new FormData();
        fd.append("file", file.file);
        fd.append("name", file.customName || file.name);
        return fetch(`${API_URL}/tasks/${task.id}/files`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          body: fd,
          _notifHandled: true,
        }).catch(() => {});
      }),
      ...links.map((link) => {
        return fetch(`${API_URL}/tasks/${task.id}/links`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ url: link.url, name: link.customName || link.name }),
          _notifHandled: true,
        }).catch(() => {});
      }),
    ]);
  };

  /**
   * Handles form submission: updates the task via PUT request and publishes events on success.
   */
  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    await run(async () => {
      try {
        const body = {
          ...form,
          start_date: toUTCIso(form.start_date),
          end_date: toUTCIso(form.end_date),
          assigned_to: selectedAssigneeIds,
          due_dates: Object.keys(dueDates).length > 0 ? dueDates : undefined,
          existing_file_names: existingFiles.reduce((acc, f) => {
            if (f.customName && f.customName !== f.name) {
              acc.push({ id: f.id, name: f.customName });
            }
            return acc;
          }, []),
        };
        if (deliverables.length > 0) {
          body.deliverables = deliverables.map((d) => ({ title: d.title, due_date: d.due_date || null }));
        }
        const res = await fetch(`${API_URL}/tasks/${task.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${authToken()}`,
          },
          body: JSON.stringify(body),
          _notifHandled: true,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to update task");
        await uploadAttachments();
        showSuccessMessage("Task", "updated");
        publish('task:updated', data.task || data);
        publish('data:changed', { type: 'task', action: 'updated' });
        onClose(true);
      } catch (err) {
        notify.error(err.message);
      }
    });
  };

  if (!container) return null;

  return createPortal(
    <>
    <div className="task-overlay">
      <div className="task-modal" onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="task-header">
          <div className="task-header-left">
            <div className="task-icon">✎</div>
            <div>
              <h2>{isSelfTask ? "Edit Self Task" : "Edit Task"}</h2>
              <p>Update task details</p>
            </div>
          </div>
          <div className="task-header-actions">
            <LoadingButton className="task-create-btn" onClick={handleSubmit} loading={submitting}>
              Save Changes
            </LoadingButton>
            <button className="task-close-btn" onClick={() => onClose(false)}>✕</button>
          </div>
        </div>

        {/* BODY */}
        <form onSubmit={handleSubmit} className="task-body">

          {/* LEFT SIDE */}
          <div className="task-left">

            <div className="task-grid-2">
              <div className="task-field">
                <label>Project</label>
                <div className="task-project-name">{task.project?.title || "—"}</div>
              </div>
              <div className="task-field">
                <label>Assign To {!isSelfTask && <span>*</span>}</label>
                {isSelfTask ? (
                  <div className="task-project-name">
                    {task.assignees?.map((a) => a.name).join(", ") || "—"}
                  </div>
                ) : (
                  <UserSelectDropdown
                    users={displayUsers}
                    selectedIds={selectedAssigneeIds}
                    onChange={handleAssignedToChange}
                    showDueDate={true}
                    dueDates={dueDates}
                    onDueDateChange={handleDueDateChange}
                    placeholder="Click to select members"
                  />
                )}
              </div>
            </div>

            <div className="task-field">
              <label>Task Name <span>*</span></label>
              <input
                type="text"
                name="title"
                placeholder="Enter task name"
                value={form.title}
                onChange={handleChange}
              />
            </div>

            <div className="task-field">
              <label>Description</label>
              <textarea
                name="description"
                placeholder="Enter task description"
                value={form.description}
                onChange={handleChange}
              />
            </div>

            {Array.isArray(task.requirements) && task.requirements.length > 0 && (
              <div className="task-field">
                <label>Requirements</label>
                <div className="cp-goals-list">
                  {task.requirements.map((req, idx) => (
                    <div key={idx} className="cp-goals-item">
                      <span className="cp-goals-item-text">{req}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ATTACHMENTS */}
            <div className="task-field">
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
                          <span className="cp-attachment-icon">📄</span>
                          {file.renaming ? (
                            <>
                              <input
                                autoFocus
                                type="text"
                                value={file.customName || ""}
                                onChange={(e) => {
                                  setExistingFiles((p) => p.map((f) => f.id === file.id ? { ...f, customName: e.target.value } : f));
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    setExistingFiles((p) => p.map((f) => f.id === file.id ? { ...f, renaming: false } : f));
                                  }
                                }}
                                style={{ flex: 1, border: "1px solid #93c5fd", borderRadius: 4, padding: "2px 6px", fontSize: 13, outline: "none" }}
                              />
                              <button type="button" onClick={() => {
                                setExistingFiles((p) => p.map((f) => f.id === file.id ? { ...f, renaming: false } : f));
                              }} style={{ background: "#16a34a", border: "none", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, borderRadius: 4, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} title="Save name">&#10003;</button>
                            </>
                          ) : (
                            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="cp-attachment-name cp-attachment-link">
                              {file.customName || file.name}
                            </a>
                          )}
                          {!file.renaming && (
                            <div style={{ display: "flex", gap: 10, flexShrink: 0, marginLeft: 8, alignItems: "center" }}>
                              <button type="button" onClick={() => {
                                setExistingFiles((p) => p.map((f) => f.id === file.id ? { ...f, renaming: true, customName: f.customName || f.name.replace(/\.[^.]+$/, "") } : f));
                              }} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Rename</button>
                              <button type="button" className="cp-attachment-remove" onClick={() => { setPendingRemoveItem({ type: "existing-file", index: -1, id: file.id }); setRemoveConfirmOpen(true); }}>✕</button>
                            </div>
                          )}
                          {file.renaming && (
                            <button type="button" onClick={() => { setPendingRemoveItem({ type: "existing-file", index: -1, id: file.id }); setRemoveConfirmOpen(true); }} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1, flexShrink: 0 }} title="Remove">&#10005;</button>
                          )}
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
                          <button type="button" className="cp-attachment-remove" onClick={() => { setPendingRemoveItem({ type: "pending-file", index, id: "" }); setRemoveConfirmOpen(true); }}>✕</button>
                        </div>
                      )}
                      {file.renaming && (
                        <button type="button" onClick={() => { setPendingRemoveItem({ type: "pending-file", index, id: "" }); setRemoveConfirmOpen(true); }} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1, flexShrink: 0 }} title="Remove">&#10005;</button>
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

              {(() => {
                const existingLinks = existingFiles.filter(
                  (f) => f.url && f.url.startsWith("http") && !f.url.includes("/storage/")
                );
                return existingLinks.length > 0 && (
                  <div className="cp-attachments-list" style={{ marginTop: "8px" }}>
                    {existingLinks.map((file) => (
                      <div key={file.id} className="cp-attachment-item">
                        <span className="cp-attachment-icon">🔗</span>
                        {file.renaming ? (
                          <>
                            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                              <input
                                autoFocus
                                type="text"
                                value={file.customName || ""}
                                onChange={(e) => {
                                  setExistingFiles((p) => p.map((f) => f.id === file.id ? { ...f, customName: e.target.value } : f));
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    setExistingFiles((p) => p.map((f) => f.id === file.id ? { ...f, renaming: false } : f));
                                  }
                                }}
                                style={{ flex: 1, border: "1px solid #93c5fd", borderRadius: 4, padding: "2px 6px", fontSize: 13, outline: "none" }}
                              />
                              <a href={file.url} target="_blank" rel="noopener noreferrer" className="cp-attachment-link" style={{ fontSize: "12px", color: "#6366f1", marginTop: 2 }}>
                                {file.url.length > 45 ? file.url.substring(0, 45) + "..." : file.url}
                              </a>
                            </div>
                            <button type="button" onClick={() => {
                              setExistingFiles((p) => p.map((f) => f.id === file.id ? { ...f, renaming: false } : f));
                            }} style={{ background: "#16a34a", border: "none", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, borderRadius: 4, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} title="Save name">&#10003;</button>
                          </>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                            <span className="cp-attachment-name" style={{ fontWeight: 600, fontSize: "13px" }}>{(file.customName || file.name).length > 45 ? (file.customName || file.name).substring(0, 45) + "..." : (file.customName || file.name)}</span>
                            <a href={file.url} target="_blank" rel="noopener noreferrer" className="cp-attachment-link" style={{ fontSize: "12px", color: "#6366f1" }}>
                              {file.url.length > 45 ? file.url.substring(0, 45) + "..." : file.url}
                            </a>
                          </div>
                        )}
                        {!file.renaming && (
                          <div style={{ display: "flex", gap: 10, flexShrink: 0, alignItems: "center" }}>
                            <button type="button" onClick={() => {
                              setExistingFiles((p) => p.map((f) => f.id === file.id ? { ...f, renaming: true, customName: f.customName || f.name } : f));
                            }} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Rename</button>
                            <button type="button" className="cp-attachment-remove" onClick={() => { setPendingRemoveItem({ type: "existing-link", index: -1, id: file.id }); setRemoveConfirmOpen(true); }}>✕</button>
                          </div>
                        )}
                        {file.renaming && (
                          <button type="button" onClick={() => { setPendingRemoveItem({ type: "existing-link", index: -1, id: file.id }); setRemoveConfirmOpen(true); }} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1, flexShrink: 0 }} title="Remove">&#10005;</button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}

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
                          <button type="button" className="cp-attachment-remove" onClick={() => { setPendingRemoveItem({ type: "pending-link", index, id: "" }); setRemoveConfirmOpen(true); }}>✕</button>
                        </div>
                      )}
                      {link.renaming && (
                        <button type="button" onClick={() => { setPendingRemoveItem({ type: "pending-link", index, id: "" }); setRemoveConfirmOpen(true); }} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1, flexShrink: 0 }} title="Remove">&#10005;</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* RIGHT SIDE */}
          <div className="task-right">

            <div className="task-card">
              <label>Priority <span style={{ color: "#ef4444" }}>*</span></label>
              <CustomSelect
                name="priority"
                value={form.priority}
                onChange={(val) => setForm((prev) => ({ ...prev, priority: val }))}
                options={[
                  { value: "Medium", label: "Medium" },
                  { value: "Low", label: "Low" },
                  { value: "High", label: "High" },
                ]}
              />
            </div>

            <div className="task-card">
              <div className="task-card-top"><span>Dates</span></div>
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
                    min={getNowDatetimeLocal()}
                  />
                </div>
              </div>
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
                       <button type="button" className="task-phase-item-remove" onClick={() => { setPendingRemoveItem({ type: "deliverable", index, id: "" }); setRemoveConfirmOpen(true); }}>✕</button>
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
      onClose={() => { setRemoveConfirmOpen(false); setPendingRemoveItem({ type: "", index: -1, id: "" }); }}
      onConfirm={confirmRemoveItem}
      title="Remove Item"
      message="Are you sure you want to remove this item? This action cannot be undone."
      confirmText="Remove"
      cancelText="Cancel"
      danger
    />
    </>,
    container
  );
}
