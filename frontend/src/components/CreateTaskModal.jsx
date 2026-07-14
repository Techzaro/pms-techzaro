import { useEffect, useRef, useState, useMemo, useCallback } from "react";
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
        items.push({
          number: globalCounter,
          title: `${qty} \u00d7 ${title} (combined)`,
          description: t.description ? parseVariables(t.description, p, dateStr, globalCounter) : null,
          count: qty,
        });
      } else {
        for (let i = 0; i < qty; i++) {
          globalCounter++;
          items.push({
            number: globalCounter,
            title: parseVariables(t.title, p, dateStr, globalCounter),
            description: t.description ? parseVariables(t.description, p, dateStr, globalCounter) : null,
          });
        }
      }
    });

    previewPeriods.push({
      period: p, date: dateStr,
      label: `Day ${p}`, items, count: items.length,
    });
  }

  const remainingTemplatesTotal = (totalPeriods - showPeriods) * templates.reduce((s, t) => s + (parseInt(t.quantity) || 1), 0);

  return {
    previewPeriods,
    totalPeriods,
    totalDeliverables: globalCounter + remainingTemplatesTotal,
    hasMore: totalPeriods > showPeriods,
    remainingPeriods: totalPeriods - showPeriods,
  };
}

const CreateTaskModal = ({ onClose, projectId = null, projectName = "" }) => {
  useEscapeKey(true, onClose);

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
    task_type: "standard",
    start_date: "",
    end_date: "",
  });

  const [recurrenceSettings, setRecurrenceSettings] = useState({
    repeat: "daily",
    skip_weekends: false,
  });

  const [recurringTemplates, setRecurringTemplates] = useState([
    { title: "", description: "", quantity: 1, combined: false },
  ]);

  const [deliverables, setDeliverables] = useState([]);
  const [deliverableInput, setDeliverableInput] = useState({ title: "", due_datetime: "" });
  const [openDeliverableDropdown, setOpenDeliverableDropdown] = useState(null);

  const [dueDates, setDueDates] = useState({});
  const [requirementsList, setRequirementsList] = useState([]);
  const [reqInput, setReqInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  const [linkTitleInput, setLinkTitleInput] = useState("");
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [pendingRemoveItem, setPendingRemoveItem] = useState({ type: "", index: -1 });
  const [editingLink, setEditingLink] = useState(null);
  const [editLinkForm, setEditLinkForm] = useState({ title: "", url: "" });
  const [editingFile, setEditingFile] = useState(null);
  const [editFileForm, setEditFileForm] = useState({ title: "" });
  const [editFileNewFile, setEditFileNewFile] = useState(null);
  const [editFileDeleted, setEditFileDeleted] = useState(false);
  const [editFileDeleteConfirm, setEditFileDeleteConfirm] = useState(false);
  const [showVariablesHint, setShowVariablesHint] = useState(false);

  const preview = useMemo(() => {
    if (form.task_type !== "recurring") return null;
    const validTemplates = recurringTemplates.filter((t) => t.title.trim());
    if (validTemplates.length === 0) return null;
    return generatePreview(validTemplates, recurrenceSettings, form.start_date, form.end_date);
  }, [form.task_type, recurringTemplates, recurrenceSettings, form.start_date, form.end_date]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: true } }));
    return () => window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: false } }));
  }, []);

  useEffect(() => {
    if (openDeliverableDropdown === null) return;
    const handleClick = () => setOpenDeliverableDropdown(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [openDeliverableDropdown]);

  useEffect(() => {
    const token = authToken();
    const currentUser = getUser();
    const ensureCurrentUser = (users) => {
      if (!currentUser) return users;
      return users.some((u) => u.id === currentUser.id) ? users : [{ id: currentUser.id, name: currentUser.name, email: currentUser.email, role: currentUser.role }, ...users];
    };
    if (projectId) {
      fetch(`${API_URL}/projects/${projectId}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      }).then((res) => (res.ok ? res.json() : null)).then((data) => {
        const project = data?.project;
        if (project?.team?.members?.length) setDisplayUsers(ensureCurrentUser(project.team.members));
        else if (project?.members?.length) setDisplayUsers(ensureCurrentUser(project.members));
        else fetch(`${API_URL}/team-users`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, skipLoader: true })
          .then((r) => (r.ok ? r.json() : { users: [] })).then((d) => { const u = ensureCurrentUser(Array.isArray(d) ? d : (d.users || [])); setAllUsers(u); setDisplayUsers(u); }).catch(() => {});
      }).catch(() => {});
    } else {
      Promise.all([
        fetch(`${API_URL}/projects`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, skipLoader: true })
          .then((r) => (r.ok ? r.json() : [])).then((d) => { const l = d?.data || d; setProjects(Array.isArray(l) ? l : []); }).catch(() => {}),
        fetch(`${API_URL}/team-users`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, skipLoader: true })
          .then((r) => (r.ok ? r.json() : { users: [] })).then((d) => { const u = Array.isArray(d) ? d : (d.users || []); setAllUsers(u); setDisplayUsers(u); }).catch(() => {}),
      ]);
    }
  }, [projectId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "project_id") {
      setForm((prev) => ({ ...prev, project_id: value, assigned_to: [] }));
      if (value) {
        const token = authToken();
        fetch(`${API_URL}/projects/${value}`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, skipLoader: true })
          .then((r) => (r.ok ? r.json() : null)).then((d) => { setDisplayUsers(d?.project?.team?.members?.length ? d.project.team.members : allUsers); }).catch(() => setDisplayUsers(allUsers));
      } else setDisplayUsers(allUsers);
    } else setForm((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors((prev) => { const n = { ...prev }; delete n[name]; return n; });
  };

  const handleAssignedToChange = (ids) => {
    setForm((prev) => ({ ...prev, assigned_to: ids }));
    setDueDates((prev) => { const n = { ...prev }; Object.keys(n).forEach((k) => { if (!ids.includes(Number(k))) delete n[k]; }); return n; });
    if (formErrors.assigned_to) setFormErrors((prev) => { const n = { ...prev }; delete n.assigned_to; return n; });
  };

  const handleDueDateChange = (userId, value) => setDueDates((prev) => ({ ...prev, [userId]: value }));

  const handleAddRequirement = () => { if (!reqInput.trim()) return; setRequirementsList((prev) => [...prev, reqInput.trim()]); setReqInput(""); };
  const handleRemoveRequirement = (index) => setRequirementsList((prev) => prev.filter((_, i) => i !== index));
  const handleReqKeyDown = (e) => { if (e.key === "Enter") { e.preventDefault(); handleAddRequirement(); } };

  const handleRecurringSettingChange = (field, value) => setRecurrenceSettings((prev) => ({ ...prev, [field]: value }));

  const handleAddTemplate = () => setRecurringTemplates((prev) => [...prev, { title: "", description: "", quantity: 1, combined: false }]);
  const handleRemoveTemplate = (index) => setRecurringTemplates((prev) => prev.filter((_, i) => i !== index));
  const handleTemplateChange = (index, field, value) => setRecurringTemplates((prev) => {
    const next = [...prev];
    next[index] = { ...next[index], [field]: value };
    return next;
  });
  const moveTemplate = useCallback((from, to) => {
    if (to < 0 || to >= recurringTemplates.length) return;
    setRecurringTemplates((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, [recurringTemplates.length]);

  const handleAddDeliverable = () => {
    if (!deliverableInput.title.trim()) return;
    const dt = deliverableInput.due_datetime;
    const dueDate = toUTCIso(dt);
    setDeliverables((prev) => [...prev, { title: deliverableInput.title.trim(), due_date: dueDate, assigned_to: null }]);
    setDeliverableInput({ title: "", due_datetime: "" });
  };
  const handleRemoveDeliverable = (index) => setDeliverables((prev) => prev.filter((_, i) => i !== index));
  const handleDeliverableKeyDown = (e) => { if (e.key === "Enter") { e.preventDefault(); handleAddDeliverable(); } };
  const handleDeliverableAssignee = (index, userId) => {
    setDeliverables((prev) => prev.map((d, i) => i === index ? { ...d, assigned_to: userId || null } : d));
    setOpenDeliverableDropdown(null);
  };

  const confirmRemoveItem = () => {
    const { type, index } = pendingRemoveItem;
    if (type === "file") handleRemoveFile(index);
    else if (type === "link") handleRemoveLink(index);
    else if (type === "requirement") handleRemoveRequirement(index);
    else if (type === "template") handleRemoveTemplate(index);
    else if (type === "deliverable") handleRemoveDeliverable(index);
    setRemoveConfirmOpen(false);
    setPendingRemoveItem({ type: "", index: -1 });
  };

  const handleFiles = (fileList) => {
    const newFiles = Array.from(fileList);
    setPendingFiles((prev) => [...prev, ...newFiles.map((f) => ({ file: f, name: f.name, size: f.size, renaming: false }))]);
  };
  const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); dropRef.current?.classList.remove("task-drop-active"); if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files); };
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); dropRef.current?.classList.add("task-drop-active"); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); dropRef.current?.classList.remove("task-drop-active"); };
  const handleRemoveFile = (index) => setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  const handleAddLink = () => {
    if (!linkInput.trim()) return;
    let url = linkInput.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const name = linkTitleInput.trim() || url;
    setLinks((prev) => [...prev, { url, name, renaming: false }]);
    setLinkInput(""); setLinkTitleInput("");
  };
  const handleRemoveLink = (index) => setLinks((prev) => prev.filter((_, i) => i !== index));
  const handleLinkKeyDown = (e) => { if (e.key === "Enter") { e.preventDefault(); handleAddLink(); } };

  const uploadAttachments = async (taskId, token) => {
    await Promise.all([
      ...pendingFiles.map((file) => {
        const fd = new FormData();
        fd.append("file", file.file);
        fd.append("name", file.customName || file.name);
        return fetch(`${API_URL}/tasks/${taskId}/files`, { method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, body: fd, _notifHandled: true }).catch(() => {});
      }),
      ...links.map((link) => fetch(`${API_URL}/tasks/${taskId}/links`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ url: link.url, name: link.customName || link.name }), _notifHandled: true }).catch(() => {})),
    ]);
  };

  const validateForm = () => {
    const errors = {};
    if (!form.title.trim()) errors.title = "Task Name is required.";
    if (!form.assigned_to || form.assigned_to.length === 0) errors.assigned_to = "Select at least one user.";
    if (!form.priority) errors.priority = "Priority is required.";
    if (form.task_type === "recurring") {
      const validTemplates = recurringTemplates.filter((t) => t.title.trim());
      if (validTemplates.length === 0) errors.recurring_templates = "Add at least one deliverable template.";
      if (!form.start_date) errors.start_date = "Start date is required for recurring tasks.";
      if (!form.end_date) errors.end_date = "End date (due date) is required for recurring tasks.";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!validateForm()) return;
    await run(async () => {
      try {
        const token = authToken();
        const validTemplates = recurringTemplates.filter((t) => t.title.trim());
        const settings = form.task_type === "recurring" ? {
          repeat: recurrenceSettings.repeat,
          skip_weekends: recurrenceSettings.skip_weekends || false,
        } : undefined;

        const body = {
          title: form.title.trim(),
          description: form.description || null,
          requirements: requirementsList.length > 0 ? requirementsList : null,
          start_date: toUTCIso(form.start_date),
          end_date: toUTCIso(form.end_date),
          assigned_to: form.assigned_to,
          due_dates: Object.keys(dueDates).length > 0 ? dueDates : undefined,
          priority: form.priority,
          task_type: form.task_type,
          recurrence_settings: settings,
          deliverable_templates: validTemplates.length > 0 ? validTemplates.map((t) => ({ title: t.title.trim(), description: t.description || null, quantity: t.quantity || 1, combined: t.combined || false })) : undefined,
          deliverables: deliverables.length > 0 ? deliverables.map((d) => ({ title: d.title, due_date: d.due_date || null, assigned_to: d.assigned_to || null })) : undefined,
        };

        const pid = projectId || form.project_id;
        const url = pid ? `${API_URL}/projects/${pid}/tasks` : `${API_URL}/tasks`;

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
          _notifHandled: true,
        });

        const data = await response.json();
        if (!response.ok) {
          const msg = data.message || "Failed to create task";
          const errors = data.errors ? Object.values(data.errors).flat().join(". ") : "";
          throw new Error(errors || msg);
        }

        const taskIds = data.tasks?.map((t) => t.id) || (data.task?.id ? [data.task.id] : []);
        if (taskIds.length > 0 && (pendingFiles.length > 0 || links.length > 0)) {
          await Promise.all(taskIds.map((id) => uploadAttachments(id, token)));
        }

        showSuccessMessage("Task", "created");
        publish("task:created", data.task || data);
        publish("data:changed", { type: "task", action: "created" });
        onClose(true);
      } catch (err) {
        notify.error(err.message);
      }
    });
  };

  const templateErrors = formErrors.recurring_templates && recurringTemplates.filter((t) => t.title.trim()).length === 0;

  return createPortal(
    <>
      <div className="task-overlay">
        <div className="task-modal" onClick={(e) => e.stopPropagation()}>
          {/* HEADER */}
          <div className="task-header">
            <div className="task-header-left">
              <div className="task-icon">⊕</div>
              <div>
                <h2>Create New Task</h2>
                <p>Add task details and assign it to team members.</p>
              </div>
            </div>
            <div className="task-header-actions">
              <LoadingButton className="task-create-btn" onClick={handleSubmit} loading={submitting}>+ Create Task</LoadingButton>
              <button className="task-close-btn" onClick={() => onClose(false)}>✕</button>
            </div>
          </div>

          {/* BODY */}
          <form onSubmit={handleSubmit} className="task-body">
            <div className="task-left">
              <div className="task-grid-2">
                {!projectId ? (
                  <div className="task-field">
                    <label>Projects</label>
                    <CustomSelect name="project_id" value={form.project_id} onChange={(val) => handleChange({ target: { name: "project_id", value: val } })}
                      placeholder="Select project" options={[{ value: "", label: "Select project" }, ...projects.map((p) => ({ value: p.id, label: p.title }))]} />
                  </div>
                ) : (
                  <div className="task-field">
                    <label>Project</label>
                    <div className="task-project-name">{projectName || "Current Project"}</div>
                  </div>
                )}
                <div className="task-field">
                  <label>Assign To <span>*</span></label>
                  <UserSelectDropdown users={displayUsers} selectedIds={form.assigned_to} onChange={handleAssignedToChange}
                    showDueDate={true} dueDates={dueDates} onDueDateChange={handleDueDateChange} placeholder="Click to select members" error={!!formErrors.assigned_to} />
                  {formErrors.assigned_to && <span className="field-error-text">{formErrors.assigned_to}</span>}
                </div>
              </div>

              <div className="task-field">
                <label>Task Name <span>*</span></label>
                <input type="text" name="title" placeholder="Enter task name.." value={form.title} onChange={handleChange} className={formErrors.title ? "field-error" : ""} />
                {formErrors.title && <span className="field-error-text">{formErrors.title}</span>}
              </div>

              <div className="task-field">
                <label>Description</label>
                <textarea name="description" placeholder="Enter task description.." value={form.description} onChange={handleChange}></textarea>
              </div>

              {/* LINKS & ATTACHMENTS */}
              <div className="task-field">
                <label>Links & Attachment</label>
                <div className="task-drop-zone" ref={dropRef} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onClick={() => fileInputRef.current?.click()}>
                  <div className="task-drop-content">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <p className="task-drop-text">Drag & drop files here</p>
                  </div>
                  <span className="task-drop-browse">or browse</span>
                  <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(e) => { if (e.target.files.length > 0) handleFiles(e.target.files); e.target.value = ""; }} />
                </div>

                {pendingFiles.length > 0 && (
                  <div className="cp-attachments-list">
                    {pendingFiles.map((file, index) => (
                      <div key={index} className="cp-attachment-item">
                        <span className="cp-attachment-drag" title="Drag to reorder">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                        </span>
                        <span className="task-attachment-icon">📄</span>
                        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                          <span className="task-attachment-name" style={{ fontWeight: 600, fontSize: "13px" }}>{file.customName || file.name}</span>
                          <span className="task-attachment-size">{(file.size / 1024).toFixed(1)} KB</span>
                        </div>
                        <div className="cp-attachment-actions">
                          <button type="button" className="cp-action-btn cp-action-btn-edit" title="Edit Name" onClick={() => {
                            setEditingFile({ type: "pending", index, currentName: file.customName || file.name });
                            setEditFileForm({ title: file.customName || file.name.replace(/\.[^.]+$/, "") });
                            setEditFileNewFile(null);
                            setEditFileDeleted(false);
                            setEditFileDeleteConfirm(false);
                          }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                          </button>
                          <button type="button" className="cp-action-btn cp-action-btn-delete" title="Delete File" onClick={() => { setPendingRemoveItem({ type: "file", index }); setRemoveConfirmOpen(true); }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="task-or-divider"><span className="task-or-line"></span><span className="task-or-text">OR</span><span className="task-or-line"></span></div>

                <div className="task-link-input-row" style={{ flexDirection: "column", gap: "8px" }}>
                  <input type="text" placeholder="Link title (e.g. Figma Design, Drive Folder)" value={linkTitleInput} onChange={(e) => setLinkTitleInput(e.target.value)} />
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input type="text" placeholder="Paste link (Drive, Figma, Website, etc.)" value={linkInput} onChange={(e) => setLinkInput(e.target.value)} onKeyDown={handleLinkKeyDown} style={{ flex: 1 }} />
                    <button type="button" className="task-link-add-btn" onClick={handleAddLink} disabled={!linkInput.trim()}>Add Link</button>
                  </div>
                </div>
              </div>

              {links.length > 0 && (
                <div className="cp-attachments-list">
                  {links.map((link, index) => (
                    <div key={index} className="cp-attachment-item">
                      <span className="cp-attachment-drag" title="Drag to reorder">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                      </span>
                      <span className="task-attachment-icon">🔗</span>
                      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                        <span className="task-attachment-name" style={{ fontWeight: 600, fontSize: "13px" }}>{link.customName || link.name}</span>
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="task-attachment-link" style={{ fontSize: "12px", color: "#6366f1" }}>
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
                        <button type="button" className="cp-action-btn cp-action-btn-delete" title="Delete Link" onClick={() => { setPendingRemoveItem({ type: "link", index }); setRemoveConfirmOpen(true); }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>

            {/* RIGHT SIDE */}
            <div className="task-right">
              {/* PRIORITY */}
              <div className="task-card">
                <label>Priority <span style={{ color: "#ef4444" }}>*</span></label>
                <CustomSelect name="priority" value={form.priority}
                  onChange={(val) => handleChange({ target: { name: "priority", value: val } })}
                  options={[{ value: "Medium", label: "Medium" }, { value: "Low", label: "Low" }, { value: "High", label: "High" }]} />
                {formErrors.priority && <span className="field-error-text">{formErrors.priority}</span>}
              </div>

              {/* DUE DATE & TIME */}
              <div className="task-card">
                <div className="task-card-top"><span>Due Date & Time</span></div>
                <div className="task-deadline-grid">
                  <div>
                    <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>Start</label>
                    <input type="datetime-local" value={form.start_date} onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))} min={getNowDatetimeLocal()} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>End</label>
                    <input type="datetime-local" value={form.end_date} onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))} min={form.start_date || getNowDatetimeLocal()} />
                  </div>
                </div>
              </div>

              {/* TASK TYPE */}
              <div className="task-card">
                <label>Task Type</label>
                <CustomSelect name="task_type" value={form.task_type}
                  onChange={(val) => handleChange({ target: { name: "task_type", value: val } })}
                  options={[{ value: "standard", label: "Standard" }, { value: "recurring", label: "Recurring" }]} />
              </div>

              {/* RECURRING SETTINGS */}
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

                    {/* Skip Weekends Toggle */}
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

                  {/* DELIVERABLE TEMPLATES */}
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
                    {templateErrors && <span className="field-error-text" style={{ marginBottom: 6, display: "block" }}>{formErrors.recurring_templates}</span>}

                    {showVariablesHint && (
                      <div style={{ background: "#f0f4ff", border: "1px solid #c7d2fe", borderRadius: 6, padding: "8px 10px", marginBottom: 10, fontSize: 12, color: "#4338ca" }}>
                        <strong>Variables:</strong> Use these in titles/descriptions
                        <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
                          {VARIABLES.map((v) => (
                            <span key={v.token} style={{ cursor: "pointer" }} onClick={() => { setShowVariablesHint(false); }}
                              title={v.desc}><code style={{ background: "#e0e7ff", padding: "1px 5px", borderRadius: 3 }}>{v.token}</code> — {v.desc}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {recurringTemplates.map((tmpl, index) => (
                      <div key={index} className="task-template-item" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, marginBottom: 8, background: "#fafafa" }}>
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
                          <button type="button" className="task-phase-item-remove" onClick={() => { setPendingRemoveItem({ type: "template", index }); setRemoveConfirmOpen(true); }} style={{ fontSize: 14 }}>✕</button>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
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

                    {recurringTemplates.length === 0 && (
                      <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", padding: 16 }}>
                        No templates yet. Click + Add to create your first deliverable template.
                      </p>
                    )}
                  </div>

                  {/* PREVIEW */}
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

              {/* MANUAL DELIVERABLES */}
              <div className="task-card">
                <div className="task-card-top"><span>Deliverables</span></div>
                <div className="task-deadline-grid">
                  <div>
                    <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>Deliverable Name</label>
                    <input type="text" placeholder="Enter deliverable name" value={deliverableInput.title}
                      onChange={(e) => setDeliverableInput((prev) => ({ ...prev, title: e.target.value }))}
                      onKeyDown={handleDeliverableKeyDown} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>Due Date & Time</label>
                    <input type="datetime-local" value={deliverableInput.due_datetime}
                      min={getNowDatetimeLocal()}
                      max={form.end_date || undefined}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (form.end_date && val && val > form.end_date) {
                          setDeliverableInput((prev) => ({ ...prev, due_datetime: form.end_date }));
                        } else {
                          setDeliverableInput((prev) => ({ ...prev, due_datetime: val }));
                        }
                      }} />
                    {form.end_date && (
                      <span style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, display: "block" }}>Max: {new Date(form.end_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    )}
                  </div>
                </div>
                <button type="button" className="task-add-phase-btn" onClick={handleAddDeliverable}
                  disabled={!deliverableInput.title.trim()} style={{ marginTop: 8 }}>+ Add Deliverable</button>

                {deliverables.length > 0 && (
                  <div className="task-phase-list" style={{ marginTop: 10 }}>
                    {deliverables.map((d, index) => {
                      const assignedUser = d.assigned_to ? displayUsers.find(u => String(u.id) === String(d.assigned_to)) : null;
                      const isDropdownOpen = openDeliverableDropdown === index;
                      return (
                        <div key={index} className="task-phase-item" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f3f4f6", position: "relative" }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#7c3aed", display: "inline-block", flexShrink: 0 }}></span>
                          <span style={{ flex: 1, fontSize: 13, color: "#374151" }}>{d.title}</span>
                          <span style={{ fontSize: 11, color: "#6b7280" }}>{d.due_date ? new Date(d.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "No due date"}</span>
                          <div style={{ position: "relative" }}>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setOpenDeliverableDropdown(isDropdownOpen ? null : index); }}
                              style={{
                                fontSize: 11, cursor: "pointer", padding: "3px 8px", borderRadius: 4, border: "1px solid #e5e7eb",
                                background: assignedUser ? "#eef2ff" : "#f9fafb", color: assignedUser ? "#6366f1" : "#6b7280",
                                fontWeight: 500, whiteSpace: "nowrap",
                              }}
                            >
                              {assignedUser ? assignedUser.name : "Assign"}
                            </button>
                            {isDropdownOpen && (
                              <div onClick={(e) => e.stopPropagation()} style={{
                                position: "absolute", bottom: "100%", right: 0, zIndex: 100,
                                background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
                                boxShadow: "0 4px 12px rgba(0,0,0,0.1)", minWidth: 150, padding: "4px 0", marginBottom: 4,
                              }}>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleDeliverableAssignee(index, null); }}
                                  style={{
                                    display: "block", width: "100%", textAlign: "left", padding: "6px 12px",
                                    fontSize: 12, cursor: "pointer", background: !assignedUser ? "#f3f4f6" : "transparent",
                                    border: "none", color: "#374151",
                                  }}
                                >
                                  All assignees
                                </button>
                                {displayUsers.filter(u => form.assigned_to.includes(u.id)).map((u) => (
                                  <button
                                    key={u.id}
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleDeliverableAssignee(index, u.id); }}
                                    style={{
                                      display: "block", width: "100%", textAlign: "left", padding: "6px 12px",
                                      fontSize: 12, cursor: "pointer",
                                      background: String(d.assigned_to) === String(u.id) ? "#f3f4f6" : "transparent",
                                      border: "none", color: "#374151",
                                    }}
                                  >
                                    {u.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button type="button" className="task-phase-item-remove" onClick={() => { setPendingRemoveItem({ type: "deliverable", index }); setRemoveConfirmOpen(true); }} style={{ fontSize: 14 }}>✕</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* REQUIREMENTS */}
              <div className="task-field">
                <label>Requirements</label>
                <div className="cp-goals-input-row">
                  <input type="text" placeholder="Enter a requirement" value={reqInput} onChange={(e) => setReqInput(e.target.value)} onKeyDown={handleReqKeyDown} />
                  <button type="button" className="cp-goals-add-btn" onClick={handleAddRequirement} disabled={!reqInput.trim()}>Add</button>
                </div>
                {requirementsList.length > 0 && (
                  <div className="cp-goals-list">
                    {requirementsList.map((req, index) => (
                      <div key={index} className="cp-goals-item">
                        <span className="cp-goals-item-text">{req}</span>
                        <button type="button" className="cp-goals-item-remove" onClick={() => { setPendingRemoveItem({ type: "requirement", index }); setRemoveConfirmOpen(true); }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
      <ConfirmModal isOpen={removeConfirmOpen} onClose={() => { setRemoveConfirmOpen(false); setPendingRemoveItem({ type: "", index: -1 }); }}
        onConfirm={confirmRemoveItem} title="Remove Item" message="Are you sure you want to remove this item? This action cannot be undone."
        confirmText="Remove" cancelText="Cancel" danger />

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
                if (editingLink.type === "pending") {
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
              {!editFileDeleted && !editFileNewFile ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                  <span style={{ fontSize: 14 }}>📄</span>
                  <span style={{ flex: 1, fontSize: 13, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{editingFile.currentName || "Current file"}</span>
                  <button type="button" onClick={() => setEditFileDeleteConfirm(true)} style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} title="Delete file">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
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
                    onChange={(e) => { if (e.target.files.length > 0) { const f = e.target.files[0]; setEditFileNewFile(f); if (!editFileForm.title) setEditFileForm({ title: f.name.replace(/\.[^.]+$/, "") }); } e.target.value = ""; }}
                  />
                </label>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => { setEditingFile(null); setEditFileNewFile(null); setEditFileDeleted(false); setEditFileDeleteConfirm(false); }} style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={(e) => e.target.style.background = "#f9fafb"} onMouseLeave={(e) => e.target.style.background = "#fff"}>Cancel</button>
              <button type="button" onClick={() => {
                if (editFileDeleted && !editFileNewFile) {
                  setPendingFiles((p) => p.filter((_, i) => i !== editingFile.index));
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

      {/* Edit File Delete Confirm */}
      {editFileDeleteConfirm && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 10004, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }} onClick={() => setEditFileDeleteConfirm(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: "24px 28px", width: 380, maxWidth: "90vw", boxShadow: "0 25px 60px rgba(0,0,0,0.25)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#111827" }}>Delete File</h3>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#6b7280" }}>Are you sure you want to delete this file? You can upload a new file after.</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => setEditFileDeleteConfirm(false)} style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={(e) => e.target.style.background = "#f9fafb"} onMouseLeave={(e) => e.target.style.background = "#fff"}>Cancel</button>
              <button type="button" onClick={() => { setEditFileDeleted(true); setEditFileDeleteConfirm(false); }} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={(e) => e.target.style.background = "#dc2626"} onMouseLeave={(e) => e.target.style.background = "#ef4444"}>Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>,
    document.body
  );
};

export default CreateTaskModal;
