/**
 * CreateSubtaskModal - Enterprise-grade modal for creating a new subtask (deliverable).
 * Mirrors CreateTaskModal structure with all task-like fields.
 * Supports stacked modal behavior (opens above Task modal).
 * Supports Save, Save & Add Another, Save & Close workflows.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import useDraftGuard from "../../hooks/useDraftGuard";
import useAutoSave from "../../hooks/useAutoSave";
import AutoSaveIndicator from "../AutoSaveIndicator";
import draftService from "../../services/draftService";
import { useSubmit } from "../../hooks/useSubmit";
import { useTranslation } from "react-i18next";
import { authToken, getUser } from "../../utils/auth";
import { publish } from "../../utils/eventBus";
import { notify, showSuccessMessage } from "../../utils/notify";
import { getNowDatetimeLocal } from "../../utils/formatDateTime";
import API_URL from "../../config/api";
import useProjectContext from "../../hooks/useProjectContext";
import CustomSelect from "../CustomSelect";
import UserSelectDropdown from "../UserSelectDropdown";
import RichTextEditor from "../RichTextEditor";
import LoadingButton from "../LoadingButton";
import "../layout/CreateTaskModal.css";

const PRIORITY_OPTIONS = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
];

const CreateSubtaskModal = ({
  onClose,
  projectId: initialProjectId = null,
  taskId: initialTaskId = null,
  onCreated = null,
  restoreDraftId = null,
  editMode = false,
  editData = null,
}) => {
  const { t } = useTranslation();
  const draftSaveRef = useRef(null);
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useDraftGuard(onClose, {
    draftSaveHandler: () => draftSaveRef.current?.(),
    hasDraftFeature: true,
  });
  const { submitting, run } = useSubmit();
  useEscapeKey(true, handleClose);

  const userInteractedRef = useRef(false);
  useEffect(() => {
    const markInteracted = () => { userInteractedRef.current = true; };
    window.addEventListener("keydown", markInteracted, { once: true, capture: true });
    window.addEventListener("mousedown", markInteracted, { once: true, capture: true });
    return () => {
      window.removeEventListener("keydown", markInteracted, { capture: true });
      window.removeEventListener("mousedown", markInteracted, { capture: true });
    };
  }, []);
  const markDirty = useCallback(() => { if (userInteractedRef.current) setIsDirty(true); }, [setIsDirty]);

  const token = authToken();
  const dropRef = useRef(null);
  const fileInputRef = useRef(null);
  const [draftId, setDraftId] = useState(null);

  const [formErrors, setFormErrors] = useState({});
  const [form, setForm] = useState(() => {
    const user = getUser();
    const defaultTransfer = editData?.allow_transfer !== undefined
      ? (editData.allow_transfer ? "allow" : "disallow")
      : ((user?.role === "admin" || user?.role === "manager") ? "allow" : "disallow");
    return {
      title: editData?.title || "",
      description: editData?.description || "",
      project_id: editData?.project_id || initialProjectId || "",
      task_id: editData?.task_id || initialTaskId || "",
      assigned_to: editData?.assignees?.map(a => a.id || a) || (editData?.assigned_to ? [editData.assigned_to] : []),
      followers: editData?.followers?.map(f => f.id || f) || [],
      priority: editData?.priority || "Medium",
      start_date: editData?.start_date ? editData.start_date.slice(0, 16) : "",
      due_date: editData?.due_date ? editData.due_date.slice(0, 16) : "",
      allow_transfer: defaultTransfer,
    };
  });

  const [pendingFiles, setPendingFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  const [linkTitleInput, setLinkTitleInput] = useState("");
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [pendingRemoveItem, setPendingRemoveItem] = useState({ type: "", index: -1 });

  const autoSaveData = useMemo(() => ({
    ...form,
    links: links.map(l => ({ url: l.url, name: l.customName || l.name })),
  }), [form, links]);

  const { lastSaved, isSaving, draftId: autoSaveDraftId, clearTimer } = useAutoSave({
    draftId,
    formData: autoSaveData,
    moduleType: "deliverable",
    enabled: isDirty,
    project_id: form.project_id || initialProjectId,
    parent_id: form.task_id || initialTaskId,
  });

  // Centralized project context: cached members, tasks, allUsers
  const { projects, allUsers, projectMembers, projectTasks } = useProjectContext(form.project_id || null);

  // Determine which users to show: project members when project selected, else all users
  const displayUsers = useMemo(() => {
    if (!form.project_id) return allUsers;
    return projectMembers.length ? projectMembers : allUsers;
  }, [form.project_id, projectMembers, allUsers]);

  // Determine which tasks to show: project tasks when project selected, else all tasks (fetched globally)
  const [allTasks, setAllTasks] = useState([]);
  const displayTasks = useMemo(() => {
    if (!form.project_id) return allTasks;
    return projectTasks;
  }, [form.project_id, projectTasks, allTasks]);

  useEffect(() => {
    if (autoSaveDraftId && autoSaveDraftId !== draftId) {
      setDraftId(autoSaveDraftId);
    }
  }, [autoSaveDraftId]);

  // Restore draft data when opened from DraftCenter
  useEffect(() => {
    if (!restoreDraftId) return;
    const loadDraft = async () => {
      try {
        const data = await draftService.get(restoreDraftId);
        const draft = data?.data;
        if (!draft?.draft_data) return;
        const d = draft.draft_data;
        setForm({
          title: d.title || "",
          description: d.description || "",
          project_id: d.project_id || initialProjectId || "",
          task_id: d.task_id || initialTaskId || "",
          assigned_to: d.assigned_to || [],
          priority: d.priority || "Medium",
          start_date: d.start_date || "",
          due_date: d.due_date || "",
          allow_transfer: d.allow_transfer ?? "allow",
        });
        if (d.links) setLinks(d.links.map(l => ({ url: l.url, customName: l.name || "", name: l.name || "" })));
        setDraftId(restoreDraftId);
      } catch (err) {
        console.error("Failed to restore draft:", err);
      }
    };
    loadDraft();
  }, [restoreDraftId]);

  // When no project selected, fetch all tasks for the parent task dropdown
  useEffect(() => {
    if (form.project_id || !token) { return; }
    fetch(`${API_URL}/all-tasks`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      skipLoader: true,
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { setAllTasks(Array.isArray(d) ? d : (d.tasks || d.data || [])); })
      .catch(() => {});
  }, [form.project_id, token]);

  // When project changes, clear task_id if it doesn't belong to the new project
  useEffect(() => {
    if (!form.project_id || !form.task_id || !projectTasks.length) return;
    if (!projectTasks.some((t) => String(t.id) === String(form.task_id))) {
      setForm((prev) => ({ ...prev, task_id: "" }));
    }
  }, [form.project_id, form.task_id, projectTasks]);

  // Track selected task's end_date for due_date validation
  const selectedTaskEndDate = useMemo(() => {
    if (!form.task_id || !displayTasks.length) return null;
    const task = displayTasks.find((t) => String(t.id) === String(form.task_id));
    return task?.end_date || null;
  }, [form.task_id, displayTasks]);

  // Clear due_date if it exceeds the new task's end_date
  useEffect(() => {
    if (!selectedTaskEndDate || !form.due_date) return;
    if (new Date(form.due_date) > new Date(selectedTaskEndDate)) {
      setForm((prev) => ({ ...prev, due_date: "" }));
    }
  }, [selectedTaskEndDate, form.due_date]);

  const handleSaveDraft = async () => {
    try {
      const payload = {
        module_type: "deliverable",
        title: form.title || "Untitled Subtask Draft",
        draft_data: { ...form, links: links.map(l => ({ url: l.url, name: l.customName || l.name })) },
        project_id: form.project_id || initialProjectId,
        parent_id: form.task_id || initialTaskId,
      };
      if (draftId) {
        await draftService.update(draftId, { title: payload.title, draft_data: payload.draft_data }, { skipNotify: true });
      } else {
        const data = await draftService.create(payload, { skipNotify: true });
        if (data?.data?.id) setDraftId(data.data.id);
      }
      setIsDirty(false);
    } catch (err) {
      console.error("Save draft failed:", err);
    }
  };

  useEffect(() => {
    draftSaveRef.current = handleSaveDraft;
  });

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: true } }));
    return () => window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: false } }));
  }, []);

  const updateForm = useCallback((field, value) => {
    setForm((p) => {
      if (p[field] !== value) markDirty();
      return { ...p, [field]: value };
    });
    setFormErrors((p) => ({ ...p, [field]: undefined }));
  }, [setIsDirty]);

  const validateForm = useCallback(() => {
    const errors = {};
    if (!form.title.trim()) errors.title = "Subtask title is required";
    if (!form.task_id) errors.task_id = "Parent task is required";
    if (!form.assigned_to || form.assigned_to.length === 0) errors.assigned_to = "Please select at least one person to assign this subtask to.";
    if (form.due_date && selectedTaskEndDate && new Date(form.due_date) > new Date(selectedTaskEndDate)) {
      errors.due_date = `Subtask deadline cannot exceed the task deadline (${new Date(selectedTaskEndDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}).`;
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [form, selectedTaskEndDate]);

  const buildBody = useCallback(() => ({
    title: form.title.trim(),
    description: form.description || null,
    project_id: form.project_id || null,
    task_id: form.task_id || null,
    priority: form.priority,
    start_date: form.start_date || null,
    due_date: form.due_date || null,
    assignees: form.assigned_to.length > 0 ? form.assigned_to : null,
    assigned_to: form.assigned_to.length > 0 ? form.assigned_to[0] : null,
    followers: form.followers || [],
    allow_transfer: form.allow_transfer === "allow",
  }), [form]);

  const uploadAttachments = useCallback(async (deliverableId) => {
    if (pendingFiles.length === 0 && links.length === 0) return;
    await Promise.all([
      ...pendingFiles.map((fileObj) => {
        const fd = new FormData();
        fd.append("file", fileObj.file);
        if (fileObj.customName) fd.append("name", fileObj.customName);
        return fetch(`${API_URL}/deliverables/${deliverableId}/files`, {
          method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
        }).then(res => res.json().catch(() => ({})).then(d => {
          if (d.file_skipped) notify.warning(d.message || "File could not be uploaded due to storage limit.");
          return d;
        }));
      }),
      ...links.map((link) => {
        return fetch(`${API_URL}/deliverables/${deliverableId}/links`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ url: link.url, name: link.customName || null }),
        });
      }),
    ]);
  }, [pendingFiles, links, token]);

  const doSubmit = useCallback(async () => {
    if (!validateForm()) return;
    clearTimer();
    setIsDirty(false);
    const body = buildBody();

    try {
      await run(async () => {
        const url = editMode
          ? `${API_URL}/deliverables/${editData.id}`
          : (form.project_id ? `${API_URL}/projects/${form.project_id}/deliverables` : `${API_URL}/deliverables`);
        const response = await fetch(url, {
          method: editMode ? "PUT" : "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
          _notifHandled: true,
        });
        const data = await response.json();
        if (!response.ok) {
          const msg = data.message || (editMode ? "Failed to update subtask" : "Failed to create subtask");
          const errors = data.errors ? Object.values(data.errors).flat().join(". ") : "";
          throw new Error(errors || msg);
        }
        const subtask = data.deliverable;
        if (subtask?.id) await uploadAttachments(subtask.id);
        if (!editMode && restoreDraftId) {
          draftService.delete(restoreDraftId).catch(() => {});
        }
        showSuccessMessage("Subtask", editMode ? "updated" : "created");
        publish("data:changed", { type: "deliverable", action: editMode ? "updated" : "created" });
        if (onCreated) onCreated(subtask);
        onClose(true);
      });
    } catch (err) {
      if (err?.message) {
        notify.error(err.message);
      }
    }
  }, [validateForm, buildBody, form.project_id, token, run, uploadAttachments, onCreated, onClose, draftId, clearTimer, setIsDirty, editMode, editData]);

  const handleFiles = useCallback((fileList) => {
    const newFiles = Array.from(fileList).map((f) => ({ file: f, name: f.name, customName: f.name.replace(/\.[^.]+$/, ""), size: f.size }));
    setPendingFiles((prev) => [...prev, ...newFiles]);
    markDirty();
  }, [markDirty]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); e.stopPropagation(); }, []);

  const addLink = useCallback(() => {
    if (!linkInput.trim()) return;
    let url = linkInput.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const customName = linkTitleInput.trim() || url;
    setLinks((prev) => [...prev, { url, customName, name: customName }]);
    setLinkInput("");
    setLinkTitleInput("");
    markDirty();
  }, [linkInput, linkTitleInput, markDirty]);

  const handleLinkKeyDown = useCallback((e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }, [addLink]);

  const handleRemoveConfirm = useCallback(() => {
    if (pendingRemoveItem.type === "file") setPendingFiles((prev) => prev.filter((_, i) => i !== pendingRemoveItem.index));
    else if (pendingRemoveItem.type === "link") setLinks((prev) => prev.filter((_, i) => i !== pendingRemoveItem.index));
    setRemoveConfirmOpen(false);
    markDirty();
  }, [pendingRemoveItem, markDirty]);

  const taskOptions = useMemo(() => displayTasks.map((t) => ({ value: t.id, label: `${t.business_id ? t.business_id + " — " : ""}${t.title}` })), [displayTasks]);

  return createPortal(
    <div className="task-overlay" style={{ zIndex: 10002 }}>
      <div className="task-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="task-header">
          <div className="task-header-left">
            <div className="task-icon">{editMode ? "✏️" : "⊕"}</div>
            <div>
              <h2>{editMode ? t("Edit Subtask", { defaultValue: "Edit Subtask" }) : t("Create Subtask", { defaultValue: "Create Subtask" })}</h2>
              <p>{editMode ? t("Update subtask details below.", { defaultValue: "Update subtask details below." }) : t("Add subtask details below.", { defaultValue: "Add subtask details below." })}</p>
            </div>
            {!editMode && <AutoSaveIndicator isSaving={isSaving} lastSaved={lastSaved} />}
          </div>
          <div className="task-header-actions">
            <button className="task-save-draft-btn" onClick={handleSaveDraft} type="button" disabled={!form.title.trim()}>
              {t("Save Draft", { defaultValue: "Save Draft" })}
            </button>
            <LoadingButton className="task-create-btn" onClick={() => doSubmit()} loading={submitting}>
              {editMode ? t("Update Subtask", { defaultValue: "Update Subtask" }) : t("⊕ Create Subtask", { defaultValue: "⊕ Create Subtask" })}
            </LoadingButton>
            <button className="task-close-btn" onClick={handleClose}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="task-body">
          {/* Left column */}
          <div className="task-left">
            {/* Project + Parent Task */}
            <div className="task-grid-2">
              <div className="task-field">
                <label>{t("Projects (Optional)", { defaultValue: "Projects (Optional)" })}</label>
                <CustomSelect
                  value={form.project_id}
                  onChange={(val) => { updateForm("project_id", val); updateForm("task_id", ""); updateForm("assigned_to", []); }}
                  placeholder={t("Select project", { defaultValue: "Select project" })}
                  options={projects.map((p) => ({ value: p.id, label: `${p.business_id ? p.business_id + " — " : ""}${p.title}` }))}
                  isDisabled={!!initialProjectId}
                />
                {formErrors.project_id && <small style={{ color: "#dc2626" }}>{formErrors.project_id}</small>}
              </div>
              <div className="task-field">
                <label>{t("Parent Task", { defaultValue: "Parent Task" })} <span>*</span></label>
                <CustomSelect
                  value={form.task_id}
                  onChange={(val) => {
                    updateForm("task_id", val);
                    if (val && !form.project_id) {
                      const task = displayTasks.find((t) => String(t.id) === String(val));
                      if (task?.project_id) updateForm("project_id", task.project_id);
                    }
                  }}
                  placeholder={form.project_id ? t("Select task from project", { defaultValue: "Select task from project" }) : t("Select a task", { defaultValue: "Select a task" })}
                  options={taskOptions}
                  isDisabled={!!initialTaskId}
                />
                {formErrors.task_id && <small style={{ color: "#dc2626" }}>{formErrors.task_id}</small>}
              </div>
            </div>

            {/* Title */}
            <div className="task-field">
              <label>{t("Subtask Title", { defaultValue: "Subtask Title" })} <span>*</span></label>
              <input type="text" className={formErrors.title ? "field-error" : ""} value={form.title} onChange={(e) => updateForm("title", e.target.value)} placeholder={t("Enter subtask title", { defaultValue: "Enter subtask title" })} />
              {formErrors.title && <span className="field-error-text">{formErrors.title}</span>}
            </div>

            {/* Description */}
            <div className="task-field">
              <label>{t("Description", { defaultValue: "Description" })}</label>
              <RichTextEditor value={form.description} onChange={(val) => updateForm("description", val)} placeholder={t("Enter subtask description...", { defaultValue: "Enter subtask description..." })} />
            </div>

            {/* Links & Attachment */}
            <div className="task-field">
              <label>{t("Links & Attachment", { defaultValue: "Links & Attachment" })}</label>
              <div className="task-drop-zone" ref={dropRef} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onClick={() => fileInputRef.current?.click()}>
                <div className="task-drop-content">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p className="task-drop-text">{t("Drag & drop files here", { defaultValue: "Drag & drop files here" })}</p>
                </div>
                <span className="task-drop-browse">{t("or browse", { defaultValue: "or browse" })}</span>
                <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(e) => { if (e.target.files.length > 0) handleFiles(e.target.files); e.target.value = ""; }} />
              </div>

              {pendingFiles.length > 0 && (
                <div className="cp-attachments-list">
                  {pendingFiles.map((file, index) => (
                    <div key={index} className="cp-attachment-item">
                      <span className="cp-attachment-drag" title={t("Drag to reorder", { defaultValue: "Drag to reorder" })}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                      </span>
                      <span className="task-attachment-icon">📄</span>
                      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                        <span className="task-attachment-name" style={{ fontWeight: 600, fontSize: "13px" }}>{file.customName || file.name}</span>
                        <span className="task-attachment-size">{(file.size / 1024).toFixed(1)} KB</span>
                      </div>
                      <div className="cp-attachment-actions">
                        <button type="button" className="cp-action-btn cp-action-btn-edit" title={t("Edit Name", { defaultValue: "Edit Name" })} onClick={() => {
                          const newName = prompt("Rename file:", file.customName || file.name);
                          if (newName && newName.trim()) {
                            setPendingFiles((prev) => prev.map((f, i) => i === index ? { ...f, customName: newName.trim() } : f));
                          }
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                        </button>
                        <button type="button" className="cp-action-btn cp-action-btn-delete" title={t("Delete File", { defaultValue: "Delete File" })} onClick={() => { setPendingRemoveItem({ type: "file", index }); setRemoveConfirmOpen(true); }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="task-or-divider"><span className="task-or-line"></span><span className="task-or-text">{t("OR", { defaultValue: "OR" })}</span><span className="task-or-line"></span></div>

              <div className="task-link-input-row" style={{ flexDirection: "column", gap: "8px" }}>
                <input type="text" placeholder={t("Link title (e.g. Figma Design, Drive Folder)", { defaultValue: "Link title (e.g. Figma Design, Drive Folder)" })} value={linkTitleInput} onChange={(e) => { setLinkTitleInput(e.target.value); markDirty(); }} />
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input type="text" placeholder={t("Paste link (Drive, Figma, Website, etc.)", { defaultValue: "Paste link (Drive, Figma, Website, etc.)" })} value={linkInput} onChange={(e) => { setLinkInput(e.target.value); markDirty(); }} onKeyDown={handleLinkKeyDown} style={{ flex: 1 }} />
                  <button type="button" className="task-link-add-btn" onClick={addLink} disabled={!linkInput.trim()}>{t("Add Link", { defaultValue: "Add Link" })}</button>
                </div>
              </div>
            </div>

            {links.length > 0 && (
              <div className="cp-attachments-list">
                {links.map((link, index) => (
                  <div key={index} className="cp-attachment-item">
                    <span className="cp-attachment-drag" title={t("Drag to reorder", { defaultValue: "Drag to reorder" })}>
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
                      <button type="button" className="cp-action-btn cp-action-btn-edit" title={t("Edit Link", { defaultValue: "Edit Link" })} onClick={() => {
                        const newTitle = prompt("Link title:", link.customName || link.name);
                        if (newTitle !== null) {
                          setLinks((prev) => prev.map((l, i) => i === index ? { ...l, customName: newTitle.trim() || link.name } : l));
                        }
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                      </button>
                      <button type="button" className="cp-action-btn cp-action-btn-delete" title={t("Delete Link", { defaultValue: "Delete Link" })} onClick={() => { setPendingRemoveItem({ type: "link", index }); setRemoveConfirmOpen(true); }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="task-right">
            {/* Assignee */}
            <div className="task-card">
              <div className="task-card-top"><span>{t("Assign To")} <span>*</span></span></div>
              <UserSelectDropdown
                users={displayUsers}
                selectedIds={form.assigned_to}
                onChange={(ids) => updateForm("assigned_to", ids)}
                placeholder={t("Click to select members", { defaultValue: "Click to select members" })}
                error={!!formErrors.assigned_to}
              />
              {formErrors.assigned_to && <span className="field-error-text" style={{ color: "#EF4444", fontSize: "12px", marginTop: "4px", display: "block" }}>{formErrors.assigned_to}</span>}
            </div>

            {/* Followers */}
            <div className="task-card">
              <div className="task-card-top"><span>{t("Followers (Optional)", { defaultValue: "Followers" })}</span></div>
              <UserSelectDropdown
                users={displayUsers.filter(u => !form.assigned_to.includes(u.id))}
                selectedIds={form.followers || []}
                onChange={(ids) => updateForm("followers", ids)}
                placeholder={t("Select followers (optional)", { defaultValue: "Select followers (optional)" })}
              />
            </div>

            {/* Priority */}
            <div className="task-card">
              <div className="task-card-top"><span>{t("Priority")} <span>*</span></span></div>
              <CustomSelect
                value={form.priority}
                onChange={(val) => updateForm("priority", val)}
                options={[
                  { value: "Low", label: t("Low") },
                  { value: "Medium", label: t("Medium") },
                  { value: "High", label: t("High") },
                ]}
              />
            </div>

            {/* Transfer To */}
            <div className="task-card">
              <div className="task-card-top"><span>{t("Transfer To", { defaultValue: "Transfer To" })}</span></div>
              <CustomSelect
                value={form.allow_transfer}
                onChange={(val) => updateForm("allow_transfer", val)}
                options={[{ value: "allow", label: t("Allow", { defaultValue: "Allow" }) }, { value: "disallow", label: t("Disallow", { defaultValue: "Disallow" }) }]}
              />
              <small style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, display: "block" }}>
                {t("Whether assignees can transfer this subtask to others", { defaultValue: "Whether assignees can transfer this subtask to others" })}
              </small>
            </div>

            {/* Dates */}
            <div className="task-card task-card--bordered">
              <div className="task-card-top"><span>{t("Dates", { defaultValue: "Dates" })}</span></div>
              <div className="task-deadline-grid">
                <div>
                  <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>{t("Start", { defaultValue: "Start" })}</label>
                  <input type="datetime-local" value={form.start_date} onChange={(e) => updateForm("start_date", e.target.value)} min={getNowDatetimeLocal()} />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>{t("End", { defaultValue: "End" })}</label>
                  <input
                    type="datetime-local"
                    value={form.due_date}
                    onChange={(e) => updateForm("due_date", e.target.value)}
                    min={form.start_date || getNowDatetimeLocal()}
                    max={selectedTaskEndDate || undefined}
                  />
                  {formErrors.due_date && <small style={{ color: "#dc2626", fontSize: 12, marginTop: 4, display: "block" }}>{formErrors.due_date}</small>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Remove confirmation */}
      {removeConfirmOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10010, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }} onClick={() => setRemoveConfirmOpen(false)}>
          <div style={{ background: "var(--bg-card)", borderRadius: 16, padding: 28, maxWidth: 400, width: "90%", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t("Are you sure you want to remove this item?", { defaultValue: "Are you sure you want to remove this item?" })}</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={() => setRemoveConfirmOpen(false)} style={{ padding: "10px 20px", border: "1px solid var(--border-color)", borderRadius: 10, background: "var(--bg-card)", cursor: "pointer", fontWeight: 600 }}>{t("Cancel")}</button>
              <button onClick={handleRemoveConfirm} style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: "#dc2626", color: "#fff", cursor: "pointer", fontWeight: 600 }}>{t("Remove", { defaultValue: "Remove" })}</button>
            </div>
          </div>
        </div>
      )}

      {ConfirmDialog}
    </div>,
    document.body
  );
};

export default CreateSubtaskModal;
