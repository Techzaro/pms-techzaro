/**
 * EditTaskModal.jsx
 * Modal form for editing an existing task's details.
 * Supports updating title, description, priority, dates, assignees, and deliverables.
 * Includes special handling for self-assigned tasks.
 */

import { useState, useEffect, useRef, useMemo } from "react";
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

const REPEAT_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom" },
];

const VARIABLES = [
  { token: "{{number}}", desc: "Global counter (1, 2, 3...)" },
  { token: "{{day}}", desc: "Day number (1, 2, 3...)" },
  { token: "{{date}}", desc: "Date (15 Jul 2026)" },
  { token: "{{week}}", desc: "Week number (28, 29...)" },
  { token: "{{month}}", desc: "Month name (July)" },
  { token: "{{year}}", desc: "Year (2026)" },
];

function parseVariables(text, dayNumber, dateStr, globalNumber) {
  const d = new Date(dateStr);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const fullMonths = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const weekNum = Math.ceil((d.getDate() + new Date(d.getFullYear(), d.getMonth(), 1).getDay()) / 7);
  return text
    .replace(/\{\{number\}\}/g, globalNumber ?? dayNumber)
    .replace(/\{\{day\}\}/g, dayNumber)
    .replace(/\{\{date\}\}/g, `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`)
    .replace(/\{\{week\}\}/g, weekNum)
    .replace(/\{\{month\}\}/g, fullMonths[d.getMonth()])
    .replace(/\{\{year\}\}/g, d.getFullYear());
}

function getNextWorkingDay(date, skipWeekends) {
  if (!skipWeekends) return new Date(date);
  const d = new Date(date);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

function getPeriodDate(start, repeat, periodNumber, skipWeekends) {
  const d = new Date(start);
  if (repeat === "daily" || repeat === "custom") {
    d.setDate(start.getDate() + periodNumber - 1);
    return getNextWorkingDay(d, skipWeekends);
  } else if (repeat === "weekly") {
    d.setDate(start.getDate() + (periodNumber - 1) * 7);
    return d;
  } else if (repeat === "monthly") {
    d.setMonth(start.getMonth() + periodNumber - 1);
    return d;
  }
  d.setDate(start.getDate() + periodNumber - 1);
  return d;
}

function calculateTotalPeriods(startDate, endDate, repeat) {
  if (!startDate || !endDate) return repeat === "daily" ? 30 : repeat === "weekly" ? 4 : 3;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end - start;
  const diffDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
  if (repeat === "weekly") return Math.max(1, Math.ceil(diffDays / 7));
  if (repeat === "monthly") return Math.max(1, Math.ceil(diffDays / 30));
  return diffDays;
}

function generatePreview(templates, settings, startDate, endDate) {
  const repeat = settings.repeat || "daily";
  const skipWeekends = settings.skip_weekends || false;
  const start = startDate ? new Date(startDate) : new Date();
  const totalPeriods = calculateTotalPeriods(startDate, endDate, repeat);
  const showPeriods = Math.min(totalPeriods, 5);
  let globalCounter = 0;
  const previewPeriods = [];
  for (let p = 1; p <= showPeriods; p++) {
    const date = getPeriodDate(start, repeat, p, skipWeekends);
    const dateStr = date.toISOString().split("T")[0];
    const items = [];
    templates.forEach((t) => {
      const qty = parseInt(t.quantity) || 1;
      if (t.combined) {
        globalCounter++;
        const title = parseVariables(t.title, p, dateStr, globalCounter);
        items.push({ number: globalCounter, title: `${qty} \u00d7 ${title} (combined)`, description: t.description ? parseVariables(t.description, p, dateStr, globalCounter) : null, count: qty });
      } else {
        for (let i = 0; i < qty; i++) {
          globalCounter++;
          items.push({ number: globalCounter, title: parseVariables(t.title, p, dateStr, globalCounter), description: t.description ? parseVariables(t.description, p, dateStr, globalCounter) : null });
        }
      }
    });
    previewPeriods.push({ period: p, date: dateStr, label: `Day ${p}`, items, count: items.length });
  }
  const remainingTemplatesTotal = (totalPeriods - showPeriods) * templates.reduce((s, t) => s + (parseInt(t.quantity) || 1), 0);
  return {
    previewPeriods, totalPeriods,
    totalDeliverables: globalCounter + remainingTemplatesTotal,
    hasMore: totalPeriods > showPeriods,
    remainingPeriods: totalPeriods - showPeriods,
  };
}

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
    task_type: task.task_type || "standard",
    start_date: task.start_date ? toDatetimeLocal(task.start_date) : "",
    end_date: task.end_date ? toDatetimeLocal(task.end_date) : "",
  });
  const [recurrenceSettings, setRecurrenceSettings] = useState({
    repeat: task.recurrence_settings?.repeat || "daily",
    skip_weekends: task.recurrence_settings?.skip_weekends || false,
  });
  const [recurringTemplates, setRecurringTemplates] = useState(() => {
    if (task.deliverable_templates && task.deliverable_templates.length > 0) {
      return task.deliverable_templates.map((t) => ({ title: t.title, description: t.description || "", quantity: t.quantity || 1, combined: t.combined || false }));
    }
    return task.task_type === "recurring" ? [{ title: "", description: "", quantity: 1, combined: false }] : [];
  });
  const [showVariablesHint, setShowVariablesHint] = useState(false);

  const preview = useMemo(() => {
    if (form.task_type !== "recurring") return null;
    const validTemplates = recurringTemplates.filter((t) => t.title.trim());
    if (validTemplates.length === 0) return null;
    return generatePreview(validTemplates, recurrenceSettings, form.start_date, form.end_date);
  }, [form.task_type, form.start_date, form.end_date, recurrenceSettings, recurringTemplates]);
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

  const handleRecurringSettingChange = (field, value) => setRecurrenceSettings((prev) => ({ ...prev, [field]: value }));

  const handleAddTemplate = () => setRecurringTemplates((prev) => [...prev, { title: "", description: "", quantity: 1, combined: false }]);
  const handleRemoveTemplate = (index) => setRecurringTemplates((prev) => prev.filter((_, i) => i !== index));
  const handleTemplateChange = (index, field, value) => setRecurringTemplates((prev) => {
    const next = [...prev];
    next[index] = { ...next[index], [field]: value };
    return next;
  });

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
    } else if (type === "template") {
      handleRemoveTemplate(index);
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
        let body;
        let url;
        const token = authToken();

        if (form.task_type === "recurring") {
          const validTemplates = recurringTemplates.filter((t) => t.title.trim());
          body = {
            recurrence_settings: {
              repeat: recurrenceSettings.repeat,
              skip_weekends: recurrenceSettings.skip_weekends || false,
            },
            deliverable_templates: validTemplates.length > 0 ? validTemplates.map((t) => ({ title: t.title.trim(), description: t.description || null, quantity: t.quantity || 1, combined: t.combined || false })) : undefined,
            regenerate: true,
          };
          url = `${API_URL}/tasks/${task.id}/update-recurring`;
        } else {
          body = {
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
          url = `${API_URL}/tasks/${task.id}`;
        }

        const res = await fetch(url, {
          method: form.task_type === "recurring" ? "POST" : "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
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

            {/* TASK TYPE */}
            <div className="task-card">
              <label>Task Type</label>
              <CustomSelect name="task_type" value={form.task_type}
                onChange={(val) => {
                  setForm((prev) => ({ ...prev, task_type: val }));
                  if (val === "recurring" && recurringTemplates.length === 0) {
                    setRecurringTemplates([{ title: "", description: "", quantity: 1, combined: false }]);
                  }
                }}
                options={[{ value: "standard", label: "Standard" }, { value: "recurring", label: "Recurring" }]} />
            </div>

            {form.task_type === "recurring" && (
              <>
                <div className="task-card">
                  <div className="task-card-top"><span>Recurrence Settings</span></div>
                  <div className="task-field" style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>Repeat</label>
                    <CustomSelect name="repeat" value={recurrenceSettings.repeat}
                      onChange={(val) => handleRecurringSettingChange("repeat", val)}
                      options={REPEAT_OPTIONS} />
                  </div>
                  {(recurrenceSettings.repeat === "daily" || recurrenceSettings.repeat === "custom") && (
                    <div className="task-field" style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 13, color: "#6b7280", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input type="checkbox" checked={recurrenceSettings.skip_weekends}
                          onChange={(e) => handleRecurringSettingChange("skip_weekends", e.target.checked)}
                          style={{ width: 16, height: 16, accentColor: "#6366f1" }} />
                        Skip weekends (Sat/Sun)
                      </label>
                    </div>
                  )}
                  <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
                    Deliverables auto-distribute between <strong>Start Date</strong> and <strong>Due Date</strong>.
                  </p>
                </div>

                <div className="task-card">
                  <div className="task-card-top">
                    <span>Deliverable Templates</span>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button type="button" className="task-icon-btn" title="Available variables" onClick={() => setShowVariablesHint(!showVariablesHint)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      </button>
                      <button type="button" className="task-add-phase-btn" onClick={handleAddTemplate} style={{ padding: "3px 10px", fontSize: 12 }}>+ Add</button>
                    </div>
                  </div>

                  {showVariablesHint && (
                    <div style={{ background: "#f0f4ff", border: "1px solid #c7d2fe", borderRadius: 6, padding: "8px 10px", marginBottom: 10, fontSize: 12, color: "#4338ca" }}>
                      <strong>Variables:</strong> Use these in titles/descriptions
                      <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
                        {VARIABLES.map((v) => (
                          <span key={v.token} style={{ cursor: "pointer" }} onClick={() => setShowVariablesHint(false)}
                            title={v.desc}><code style={{ background: "#e0e7ff", padding: "1px 5px", borderRadius: 3 }}>{v.token}</code> — {v.desc}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {recurringTemplates.map((tmpl, index) => (
                    <div key={index} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, marginBottom: 8, background: "#fafafa" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", minWidth: 40 }}>#{index + 1}</span>
                        <input type="text" placeholder="Template title (use {{day}}, {{date}}...)" value={tmpl.title}
                          onChange={(e) => handleTemplateChange(index, "title", e.target.value)}
                          style={{ flex: 1, fontSize: 13, padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4 }} />
                        <div style={{ display: "flex", alignItems: "center", gap: 4, border: "1px solid #d1d5db", borderRadius: 4, padding: "2px 6px", background: "#fff" }}>
                          <span style={{ fontSize: 11, color: "#6b7280" }}>Qty:</span>
                          <input type="number" min="1" max="100" value={tmpl.quantity}
                            onChange={(e) => handleTemplateChange(index, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
                            style={{ width: 40, fontSize: 12, border: "none", outline: "none", textAlign: "center" }} />
                        </div>
                        <button type="button" className="task-phase-item-remove" onClick={() => { setPendingRemoveItem({ type: "template", index, id: "" }); setRemoveConfirmOpen(true); }} style={{ fontSize: 14 }}>✕</button>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="text" placeholder="Description (optional)" value={tmpl.description}
                          onChange={(e) => handleTemplateChange(index, "description", e.target.value)}
                          style={{ flex: 1, fontSize: 12, padding: "5px 8px", border: "1px solid #e5e7eb", borderRadius: 4, color: "#6b7280" }} />
                        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>
                          <input type="checkbox" checked={tmpl.combined}
                            onChange={(e) => handleTemplateChange(index, "combined", e.target.checked)}
                            style={{ width: 14, height: 14, accentColor: "#6366f1" }} />
                          Combined
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                {preview && (
                  <div className="task-card" style={{ border: "1px solid #c7d2fe", background: "#f8faff" }}>
                    <div className="task-card-top">
                      <span>Recurring Preview</span>
                      <span style={{ fontSize: 12, color: "#6366f1", fontWeight: 600 }}>{preview.totalDeliverables} Total</span>
                    </div>
                    <div style={{ maxHeight: 220, overflowY: "auto" }}>
                      {preview.previewPeriods.map((pd) => (
                        <div key={pd.period} style={{ marginBottom: 8, padding: "6px 0", borderBottom: "1px solid #eef2ff" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#4338ca", marginBottom: 4 }}>{pd.label} — {pd.date}</div>
                          {pd.items.map((item, i) => (
                            <div key={i} style={{ fontSize: 12, color: "#374151", paddingLeft: 16, display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366f1", display: "inline-block", flexShrink: 0 }}></span>
                              #{item.number} {item.title}
                              {item.count > 1 && <span style={{ color: "#6366f1", fontWeight: 600, fontSize: 11 }}>(qty {item.count})</span>}
                              {item.description && <span style={{ color: "#9ca3af" }}>— {item.description}</span>}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                    {preview.hasMore && (
                      <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 4 }}>
                        ... and {preview.remainingPeriods} more days · {preview.totalPeriods} days total
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

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
