/**
 * EditTaskModal.jsx
 * Modal form for editing an existing task's details.
 * Supports updating title, description, priority, dates, assignees, and subtasks.
 * Includes special handling for self-assigned tasks.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import API_URL from "../config/api";
import { authToken, getUser } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import draftService from "../services/draftService";
import UserSelectDropdown from "./UserSelectDropdown";
import CustomSelect from "./CustomSelect";
import MultiSelectDropdown from "./MultiSelectDropdown";
import LoadingButton from "./LoadingButton";
import ConfirmModal from "./ConfirmModal";
import { formatDateTime, toDatetimeLocal, toUTCIso, getNowDatetimeLocal } from "../utils/formatDateTime";
import { convertToLocal, convertToUTC, getTimezoneOffsetDisplay, formatWorkingHoursSummary } from "../utils/timezoneUtils";
import { Clock } from "lucide-react";
import { publish } from "../utils/eventBus";
import { notify, showSuccessMessage } from "../utils/notify";
import { useSubmit } from "../hooks/useSubmit";
import useDraftGuard from "../hooks/useDraftGuard";
import useAutoSave from "../hooks/useAutoSave";
import AutoSaveIndicator from "./AutoSaveIndicator";
import RichTextEditor from "./RichTextEditor";
import CreateSubtaskModal from "./layout/CreateDeliverableModel";
import "./layout/CreateTaskModal.css";

function isExternalLink(url) {
  if (!url || !url.startsWith("http")) return false;
  if (url.includes("/storage/")) return false;
  if (url.includes(".s3.") || url.includes("s3.amazonaws.com")) return false;
  return true;
}

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
    totalSubtasks: globalCounter + remainingTemplatesTotal,
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
  const draftSaveRef = useRef(null);
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useDraftGuard(onClose, {
    draftSaveHandler: () => draftSaveRef.current?.(),
    hasDraftFeature: true,
  });
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
  const [container, setContainer] = useState(null);
  const [draftId, setDraftId] = useState(null);

  useEffect(() => {
    setContainer(document.body);
  }, []);

  const currentUser = getUser();

  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState({
    title: task.title || "",
    description: task.description || "",
    priority: task.priority || "Medium",
    task_type: task.task_type || "standard",
    project_id: task.project?.id ? [task.project.id] : [],
    start_date: task.start_date ? toDatetimeLocal(task.start_date) : "",
    end_date: task.end_date ? toDatetimeLocal(task.end_date) : "",
    allow_transfer: task.allow_transfer !== false ? "allow" : "disallow",
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
  const [selectedFollowerIds, setSelectedFollowerIds] = useState(
    task.followers?.map((f) => f.id || f) || []
  );
  const [requirementsList, setRequirementsList] = useState(task.requirements || []);
  const [reqInput, setReqInput] = useState("");
  const [subtasks, setSubtasks] = useState(task.deliverables || []);
  const [subtaskInput, setSubtaskInput] = useState({ title: "", start_datetime: "", due_datetime: "" });
  const [openSubtaskDropdown, setOpenSubtaskDropdown] = useState(null);
  const [subtaskAssigneeHighlightedIndex, setSubtaskAssigneeHighlightedIndex] = useState(-1);
  const subtaskAssigneeListRef = useRef(null);
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
  const [editingLink, setEditingLink] = useState(null);
  const [editLinkForm, setEditLinkForm] = useState({ title: "", url: "" });
  const [editingFile, setEditingFile] = useState(null);
  const [editFileForm, setEditFileForm] = useState({ title: "" });
  const [editFileNewFile, setEditFileNewFile] = useState(null);
  const [editFileDeleted, setEditFileDeleted] = useState(false);
  const [editFileDeleteConfirm, setEditFileDeleteConfirm] = useState(false);
  const [openSubtaskCreator, setOpenSubtaskCreator] = useState(false);

  const { lastSaved, isSaving, draftId: autoSaveDraftId } = useAutoSave({
    draftId,
    formData: form,
    moduleType: "task",
    enabled: isDirty,
    project_id: form.project_id || task?.project_id,
  });

  useEffect(() => {
    if (autoSaveDraftId && autoSaveDraftId !== draftId) {
      setDraftId(autoSaveDraftId);
    }
  }, [autoSaveDraftId]);

  const handleSaveDraft = async () => {
    try {
      const payload = {
        module_type: "task",
        original_record_id: task?.id,
        title: form.title || "Untitled Task Draft",
        draft_data: { ...form, subtasks: subtasks },
        project_id: form.project_id || task?.project_id,
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

  // Determine if this is a self-assigned task (created by current user and assigned only to themselves)
  const isSelfTask = currentUser && parseInt(task.assigned_by, 10) === parseInt(currentUser.id, 10) && selectedAssigneeIds.length === 1 && selectedAssigneeIds[0] === parseInt(currentUser.id, 10);

  useEffect(() => {
    const token = authToken();
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
  }, []);

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

  useEffect(() => {
    const token = authToken();
    if (!form.project_id || form.project_id.length === 0) {
      if (allUsers.length) setDisplayUsers(allUsers);
      return;
    }
    const currentUser = getUser();
    Promise.all(
      form.project_id.map((pid) =>
        fetch(`${API_URL}/projects/${pid}/members`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          skipLoader: true,
        })
          .then((res) => (res.ok ? res.json() : [])).catch(() => [])
      )
    ).then((results) => {
      const memberSets = results.map((members) => {
        const map = new Map();
        (Array.isArray(members) ? members : []).forEach((u) => map.set(u.id, u));
        return map;
      });
      let users;
      if (memberSets.length === 1) {
        users = Array.from(memberSets[0].values());
      } else {
        const smallest = memberSets.reduce((a, b) => a.size <= b.size ? a : b);
        users = [];
        smallest.forEach((u, id) => {
          if (memberSets.every((s) => s.has(id))) users.push(u);
        });
      }
      if (currentUser && !users.some((u) => u.id === currentUser.id)) {
        users = [{ id: currentUser.id, name: currentUser.name, email: currentUser.email, role: currentUser.role, department: currentUser.department }, ...users];
      }
      setDisplayUsers(users.length ? users : allUsers);
    }).catch(() => { if (allUsers.length) setDisplayUsers(allUsers); });
  }, [form.project_id, allUsers]);

  useEffect(() => {
    if (openSubtaskDropdown === null) return;
    const handleClick = () => setOpenSubtaskDropdown(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [openSubtaskDropdown]);

  useEffect(() => {
    setSubtaskAssigneeHighlightedIndex(-1);
  }, [openSubtaskDropdown]);

  useEffect(() => {
    if (subtaskAssigneeHighlightedIndex < 0 || !subtaskAssigneeListRef.current) return;
    const items = subtaskAssigneeListRef.current.children;
    if (items[subtaskAssigneeHighlightedIndex]) {
      items[subtaskAssigneeHighlightedIndex].scrollIntoView({ block: "nearest" });
    }
  }, [subtaskAssigneeHighlightedIndex]);

  const handleChange = (e) => {
    markDirty();
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleRecurringSettingChange = (field, value) => { markDirty(); setRecurrenceSettings((prev) => ({ ...prev, [field]: value })); };

  const handleAddTemplate = () => { markDirty(); setRecurringTemplates((prev) => [...prev, { title: "", description: "", quantity: 1, combined: false }]); };
  const handleRemoveTemplate = (index) => { markDirty(); setRecurringTemplates((prev) => prev.filter((_, i) => i !== index)); };
  const handleTemplateChange = (index, field, value) => { markDirty(); setRecurringTemplates((prev) => {
    const next = [...prev];
    next[index] = { ...next[index], [field]: value };
    return next;
  }); };

  const handleAssignedToChange = (ids) => {
    setSelectedAssigneeIds((prev) => { if (JSON.stringify(prev) !== JSON.stringify(ids)) markDirty(); return ids; });
  };

  const handleAddRequirement = () => {
    if (!reqInput.trim()) return;
    markDirty();
    setRequirementsList((prev) => [...prev, reqInput.trim()]);
    setReqInput("");
  };

  const handleRemoveRequirement = (index) => {
    markDirty();
    setRequirementsList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleReqKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddRequirement(); }
  };

  const handleAddSubtask = () => {
    if (!subtaskInput.title.trim()) return;
    const startDate = subtaskInput.start_datetime ? toUTCIso(subtaskInput.start_datetime) : null;
    const dueDate = subtaskInput.due_datetime ? toUTCIso(subtaskInput.due_datetime) : null;
    markDirty();
    setSubtasks((prev) => [...prev, { title: subtaskInput.title.trim(), start_date: startDate, due_date: dueDate, assigned_to: null }]);
    setSubtaskInput({ title: "", start_datetime: "", due_datetime: "" });
  };

  const handleRemoveSubtask = (index) => {
    markDirty();
    setSubtasks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubtaskAssignee = (index, userId) => {
    setSubtasks((prev) => prev.map((d, i) => i === index ? { ...d, assigned_to: userId || null } : d));
    setOpenSubtaskDropdown(null);
  };

  const handleSubtaskDropdownKeyDown = (e, idx) => {
    if (openSubtaskDropdown !== idx) return;
    const filteredUsers = displayUsers.filter(u => selectedAssigneeIds.includes(u.id));
    const itemCount = 1 + filteredUsers.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSubtaskAssigneeHighlightedIndex((prev) => (prev < itemCount - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSubtaskAssigneeHighlightedIndex((prev) => (prev > 0 ? prev - 1 : itemCount - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (subtaskAssigneeHighlightedIndex === 0) {
        handleSubtaskAssignee(idx, null);
      } else if (subtaskAssigneeHighlightedIndex > 0 && filteredUsers[subtaskAssigneeHighlightedIndex - 1]) {
        handleSubtaskAssignee(idx, filteredUsers[subtaskAssigneeHighlightedIndex - 1].id);
      }
    }
  };

  const confirmRemoveItem = () => {
    const { type, index, id } = pendingRemoveItem;
    if (type === "existing-file" || type === "existing-link") {
      handleDeleteExistingFile(id);
    } else if (type === "pending-file") {
      handleRemoveFile(index);
    } else if (type === "pending-link") {
      handleRemoveLink(index);
    } else if (type === "subtask") {
      handleRemoveSubtask(index);
    } else if (type === "requirement") {
      handleRemoveRequirement(index);
    } else if (type === "template") {
      handleRemoveTemplate(index);
    }
    setRemoveConfirmOpen(false);
    setPendingRemoveItem({ type: "", index: -1, id: "" });
  };

  const handleSubtaskKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddSubtask(); }
  };

  const handleFiles = (fileList) => {
    console.log("[EditTaskModal] handleFiles called with", fileList.length, "files");
    const arr = Array.from(fileList);
    console.log("[EditTaskModal] file names:", arr.map(f => f.name));
    markDirty();
    setPendingFiles((prev) => {
      const next = [...prev, ...arr.map((f) => ({ file: f, name: f.name, size: f.size, renaming: false }))];
      console.log("[EditTaskModal] pendingFiles updated, new length:", next.length);
      return next;
    });
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
    markDirty();
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
    markDirty();
    setLinks((prev) => [...prev, { url, name, renaming: false }]);
    setLinkInput("");
    setLinkTitleInput("");
  };

  const handleRemoveLink = (index) => {
    markDirty();
    setLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLinkKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddLink(); }
  };

  /**
   * Uploads pending file attachments and links to the task.
   * Throws if any uploads fail so the caller can handle the error.
   */
  const uploadAttachments = async () => {
    const token = authToken();
    const errors = [];

    if (pendingFiles.length === 0 && links.length === 0) return;

    const [fileResults, linkResults] = await Promise.all([
      Promise.allSettled(
        pendingFiles.map((file) => {
          const fd = new FormData();
          fd.append("file", file.file);
          fd.append("name", file.customName || file.name);
          return fetch(`${API_URL}/tasks/${task.id}/files`, {
            method: "POST",
            headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
            body: fd,
            _notifHandled: true,
          }).then(async (res) => {
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "File upload failed");
            return data;
          });
        })
      ),
      Promise.allSettled(
        links.map((link) => {
          return fetch(`${API_URL}/tasks/${task.id}/links`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ url: link.url, name: link.customName || link.name }),
            _notifHandled: true,
          }).then(async (res) => {
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Link add failed");
            return data;
          });
        })
      ),
    ]);

    fileResults.forEach((result, i) => {
      if (result.status === "rejected") {
        errors.push(`File "${pendingFiles[i].name}": ${result.reason?.message || "upload failed"}`);
      }
    });

    linkResults.forEach((result, i) => {
      if (result.status === "rejected") {
        errors.push(`Link "${links[i].name}": ${result.reason?.message || "add failed"}`);
      }
    });

    if (errors.length > 0) {
      throw new Error(`Attachments failed: ${errors.join("; ")}`);
    }
  };

  /**
   * Handles form submission: updates the task via PUT request and publishes events on success.
   */
  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!form.project_id || (Array.isArray(form.project_id) && form.project_id.length === 0)) {
      notify.error("Project selection is required.");
      return;
    }
    if (form.task_type !== "recurring" && (!selectedAssigneeIds || selectedAssigneeIds.length === 0)) {
      notify.error("Please select a person to assign this task to.");
      return;
    }
    // Validate start date is not later than due date
    if (form.start_date && form.end_date) {
      const taskStart = new Date(form.start_date);
      const taskEnd = new Date(form.end_date);
      if (taskStart > taskEnd) {
        notify.error("Start date cannot be later than the due date.");
        return;
      }
    }
    // Validate deadline against project deadline
    if (form.end_date && task.project?.end_date) {
      const taskEnd = new Date(form.end_date);
      const projEnd = new Date(task.project.end_date);
      if (taskEnd > projEnd) {
        notify.error("Task deadline cannot exceed the project deadline.");
        return;
      }
    }
    await run(async () => {
      try {
        let body;
        let url;
        const token = authToken();

        if (form.task_type === "recurring") {
          const recStart = form.recurrence_start_date || form.start_date;
          const recEnd = form.recurrence_end_date || form.end_date;
          if (recStart && recEnd && new Date(recEnd) < new Date(recStart)) {
            notify.error("Recurrence End date cannot be before Start date.");
            return;
          }
          const validTemplates = recurringTemplates.filter((t) => t.title.trim());
          body = {
            recurrence_settings: {
              repeat: recurrenceSettings.repeat,
              skip_weekends: recurrenceSettings.skip_weekends || false,
            },
            recurrence_start_date: toUTCIso(recStart),
            recurrence_end_date: toUTCIso(recEnd),
            deliverable_templates: validTemplates.length > 0 ? validTemplates.map((t) => ({ title: t.title.trim(), description: t.description || null, quantity: t.quantity || 1, combined: t.combined || false })) : undefined,
            regenerate: true,
          };
          url = `${API_URL}/tasks/${task.id}/update-recurring`;
        } else {
          body = {
            ...form,
            requirements: requirementsList,
            allow_transfer: form.allow_transfer === "allow",
            project_id: form.project_id?.[0] || null,
            start_date: toUTCIso(form.start_date),
            end_date: toUTCIso(form.end_date),
            assigned_to: selectedAssigneeIds,
            followers: selectedFollowerIds,
            existing_file_names: existingFiles.reduce((acc, f) => {
              const nameChanged = f.customName && f.customName !== f.name;
              const urlChanged = f.customUrl && f.customUrl !== f.url;
              if (nameChanged || urlChanged) {
                const entry = { id: f.id };
                if (nameChanged) entry.name = f.customName;
                if (urlChanged) entry.url = f.customUrl;
                acc.push(entry);
              }
              return acc;
            }, []),
          };
          if (subtasks.length > 0) {
            body.deliverables = subtasks.map((d) => ({ id: d.id || null, title: d.title, start_date: d.start_date || null, due_date: d.due_date || null, assigned_to: d.assigned_to || null }));
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

  const modalContent = createPortal(
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
            <AutoSaveIndicator isSaving={isSaving} lastSaved={lastSaved} />
          </div>
          <div className="task-header-actions">
            <button className="task-save-draft-btn" onClick={handleSaveDraft} type="button">
              Save Draft
            </button>
            <LoadingButton className="task-create-btn" onClick={handleSubmit} loading={submitting}>
              Save Changes
            </LoadingButton>
            <button className="task-close-btn" onClick={handleClose}>✕</button>
          </div>
        </div>

        {/* BODY */}
        <form onSubmit={handleSubmit} className="task-body">

          {/* LEFT SIDE */}
          <div className="task-left">

            <div className="task-grid-2">
              <div className="task-field">
                <label>Project <span style={{ color: "#ef4444" }}>*</span></label>
                <MultiSelectDropdown
                  name="project_id"
                  value={form.project_id}
                  onChange={(val) => { setForm((prev) => ({ ...prev, project_id: val })); setSelectedAssigneeIds([]); markDirty(); }}
                  placeholder="Select projects"
                  searchPlaceholder="Search projects..."
                  options={projects.map((p) => ({ value: p.id, label: p.title }))}
                />
              </div>
              <div className="task-field">
                <label>Assign To <span>*</span></label>
                {isSelfTask ? (
                  <div className="task-project-name">
                    {task.assignees?.map((a) => a.name).join(", ") || "—"}
                  </div>
                ) : (
                  <UserSelectDropdown
                    users={displayUsers}
                    selectedIds={selectedAssigneeIds}
                    onChange={handleAssignedToChange}
                    placeholder="Click to select members"
                  />
                )}

                {/* Assignee Timezone, Current Time & Working Hours (SRS Sec 13 & 17) */}
                {!isSelfTask && selectedAssigneeIds && selectedAssigneeIds.length > 0 && (
                  <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    {displayUsers
                      .filter((u) => selectedAssigneeIds.includes(u.id))
                      .map((u) => {
                        const tz = u.timezone || "UTC";
                        const uTime = convertToLocal(new Date().toISOString(), tz, "hh:mm A");
                        const workingHoursStr = formatWorkingHoursSummary(u.working_hours, tz);
                        return (
                          <div
                            key={u.id}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "3px",
                              fontSize: "12px",
                              color: "var(--text-secondary, #4b5563)",
                              background: "var(--bg-hover, #f8fafc)",
                              padding: "6px 10px",
                              borderRadius: "6px",
                              border: "1px solid var(--border-light, #e2e8f0)",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                              <Clock size={13} style={{ color: "var(--color-primary, #4f46e5)", flexShrink: 0 }} />
                              <span>
                                <strong>{u.name}</strong>'s Time:{" "}
                                <span style={{ color: "var(--color-primary, #4f46e5)", fontWeight: 600 }}>{uTime}</span> ({tz})
                              </span>
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-secondary)", paddingLeft: "19px" }}>
                              🕒 Working Hours: <span style={{ fontWeight: 500, color: "var(--text-primary, #1e293b)" }}>{workingHoursStr}</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>

            <div className="task-field">
              <label>Followers (Optional)</label>
              <UserSelectDropdown
                users={displayUsers.filter((u) => !selectedAssigneeIds.includes(u.id))}
                selectedIds={selectedFollowerIds}
                onChange={(ids) => { setSelectedFollowerIds(ids); markDirty(); }}
                placeholder="Click to select followers"
              />
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
              <RichTextEditor
                value={form.description}
                onChange={(val) => { const clean = (s) => (s || "").replace(/<[^>]*>/g, "").trim(); setForm((prev) => ({ ...prev, description: val })); markDirty(); }}
                placeholder="Enter task description..."
              />
            </div>

            {/* ATTACHMENTS */}
            <div className="task-field">
              <label>Links & Attachment</label>

              <div
                className="cp-drop-zone"
                ref={dropRef}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => { console.log("[EditTaskModal] drop zone clicked, fileInputRef:", fileInputRef.current); fileInputRef.current?.click(); }}
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
                  onChange={(e) => { console.log("[EditTaskModal] file input onChange, files:", e.target.files.length); if (e.target.files.length > 0) handleFiles(e.target.files); e.target.value = ""; }}
                />
              </div>

              {(() => {
                const existingAttachments = existingFiles.filter(
                  (f) => !isExternalLink(f.url)
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
                        <button type="button" className="cp-action-btn cp-action-btn-delete" title="Delete File" onClick={() => { setPendingRemoveItem({ type: "pending-file", index, id: "" }); setRemoveConfirmOpen(true); }}>
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
                  onChange={(e) => { setLinkTitleInput(e.target.value); markDirty(); }}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    placeholder="Paste link (Drive, Figma, Website, etc.)"
                    value={linkInput}
                    onChange={(e) => { setLinkInput(e.target.value); markDirty(); }}
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
                  (f) => isExternalLink(f.url)
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
                        <button type="button" className="cp-action-btn cp-action-btn-delete" title="Delete Link" onClick={() => { setPendingRemoveItem({ type: "pending-link", index, id: "" }); setRemoveConfirmOpen(true); }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* RIGHT SIDE */}
          <div className="task-right">

            <div className="task-field">
              <label>Priority <span style={{ color: "#ef4444" }}>*</span></label>
              <CustomSelect
                name="priority"
                value={form.priority}
                onChange={(val) => { setForm((prev) => ({ ...prev, priority: val })); markDirty(); }}
                options={[
                  { value: "Medium", label: "Medium" },
                  { value: "Low", label: "Low" },
                  { value: "High", label: "High" },
                ]}
              />
            </div>

            <div className="task-field">
              <label>Requirements</label>
              <div className="cp-goals-input-row">
                <input
                  type="text"
                  placeholder="Enter a requirement"
                  value={reqInput}
                  onChange={(e) => { setReqInput(e.target.value); markDirty(); }}
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
                        onClick={() => { setPendingRemoveItem({ type: "requirement", index, id: "" }); setRemoveConfirmOpen(true); }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* DATES */}
            <div className="task-card task-card--bordered">
              <div className="task-card-top"><span>Dates</span></div>
              <div className="task-deadline-grid">
                <div>
                  <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>Start</label>
                    <input type="datetime-local" value={form.start_date}
                      onChange={(e) => { setForm((prev) => ({ ...prev, start_date: e.target.value })); markDirty(); }}
                    min={getNowDatetimeLocal()} />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>End</label>
                    <input type="datetime-local" value={form.end_date}
                      onChange={(e) => { setForm((prev) => ({ ...prev, end_date: e.target.value })); markDirty(); }}
                    min={getNowDatetimeLocal()}
                    max={task.project?.end_date ? toDatetimeLocal(task.project.end_date) : undefined} />
                  {task.project?.end_date && <span style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, display: "block" }}>Max: {new Date(task.project.end_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
                </div>
              </div>

              {/* Assignee Deadline Conversion (SRS Sec 13 & 17) */}
              {form.end_date && !isSelfTask && selectedAssigneeIds && selectedAssigneeIds.length > 0 && (
                <div style={{ marginTop: "10px", padding: "8px 10px", background: "var(--color-primary-bg, rgba(79, 70, 229, 0.08))", border: "1px solid var(--color-primary, #4f46e5)", borderRadius: "8px", fontSize: "12px" }}>
                  <div style={{ fontWeight: 600, color: "var(--color-primary, #4f46e5)", marginBottom: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Clock size={13} /> Assignee Deadline Equivalent
                  </div>
                  {displayUsers
                    .filter((u) => selectedAssigneeIds.includes(u.id))
                    .map((u) => {
                      const tz = u.timezone || "UTC";
                      const assigneeDeadline = convertToLocal(convertToUTC(form.end_date), tz, "DD/MM/YYYY, hh:mm A");
                      return (
                        <div key={u.id} style={{ color: "var(--text-primary, #1e293b)", fontSize: "11px", marginTop: "2px" }}>
                          • <strong>{u.name}</strong>: {assigneeDeadline} ({tz})
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* TASK TYPE */}
            <div className="task-card">
              <label>Task Type</label>
              <CustomSelect name="task_type" value={form.task_type}
                onChange={(val) => {
                  setForm((prev) => ({ ...prev, task_type: val })); markDirty();
                  if (val === "recurring" && recurringTemplates.length === 0) {
                    setRecurringTemplates([{ title: "", description: "", quantity: 1, combined: false }]);
                  }
                }}
                options={[{ value: "standard", label: "Standard" }, { value: "recurring", label: "Recurring" }]} />
            </div>

            <div className="task-card">
              <label>Transfer To</label>
              <CustomSelect name="allow_transfer" value={form.allow_transfer}
                onChange={(val) => { setForm((prev) => ({ ...prev, allow_transfer: val })); markDirty(); }}
                options={[{ value: "allow", label: "Allow" }, { value: "disallow", label: "Disallow" }]} />
              <small style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, display: "block" }}>
                Whether assignees can transfer this task to others
              </small>
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

                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>Dates</label>
                    <div className="task-deadline-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Start</label>
                        <input
                          type="datetime-local"
                          value={form.recurrence_start_date || form.start_date || ""}
                          onChange={(e) => { setForm((prev) => ({ ...prev, recurrence_start_date: e.target.value })); markDirty(); }}
                          min={getNowDatetimeLocal()}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>End</label>
                        <input
                          type="datetime-local"
                          value={form.recurrence_end_date || form.end_date || ""}
                          onChange={(e) => { setForm((prev) => ({ ...prev, recurrence_end_date: e.target.value })); markDirty(); }}
                          min={form.recurrence_start_date || form.start_date || getNowDatetimeLocal()}
                        />
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
                    Subtasks auto-distribute between <strong>Start Date</strong> and <strong>Due Date</strong>.
                  </p>
                </div>

                <div className="task-card">
                  <div className="task-card-top">
                    <span>Subtask Templates</span>
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
              </>
            )}

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

  return (
    <>
      {modalContent}

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
                <>
                  {editingFile.type === "pending" && pendingFiles[editingFile.index] && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 14 }}>📄</span>
                      <span style={{ flex: 1, fontSize: 13, color: "#3730a3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pendingFiles[editingFile.index].name}</span>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>{(pendingFiles[editingFile.index].size / 1024).toFixed(1)} KB</span>
                    </div>
                  )}
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", padding: "10px 12px", border: "1px dashed #d1d5db", borderRadius: 8, background: "#f9fafb", color: "#6b7280", fontSize: 13, cursor: "pointer", textAlign: "center" }}>
                    {editingFile.type === "pending" ? "Click to replace with a new file" : "Click to select a file"}
                    <input
                      type="file"
                      style={{ display: "none" }}
                      onChange={(e) => { if (e.target.files.length > 0) { const f = e.target.files[0]; setEditFileNewFile(f); setEditFileDeleted(false); if (!editFileForm.title) setEditFileForm({ title: f.name.replace(/\.[^.]+$/, "") }); } e.target.value = ""; }}
                    />
                  </label>
                </>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => { setEditingFile(null); setEditFileNewFile(null); setEditFileDeleted(false); setEditFileDeleteConfirm(false); }} style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={(e) => e.target.style.background = "#f9fafb"} onMouseLeave={(e) => e.target.style.background = "#fff"}>Cancel</button>
              <button type="button" onClick={async () => {
                if (editingFile.type === "existing") {
                  if (editFileDeleted && !editFileNewFile) {
                    const token = authToken();
                    try {
                      await fetch(`${API_URL}/tasks/${task.id}/files/${editingFile.id}`, {
                        method: "DELETE",
                        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
                        _notifHandled: true,
                      });
                    } catch (_) {}
                    setExistingFiles((p) => p.filter((f) => f.id !== editingFile.id));
                  } else if (editFileNewFile) {
                    const token = authToken();
                    try {
                      await fetch(`${API_URL}/tasks/${task.id}/files/${editingFile.id}`, {
                        method: "DELETE",
                        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
                        _notifHandled: true,
                      });
                    } catch (_) {}
                    const fd = new FormData();
                    fd.append("file", editFileNewFile);
                    fd.append("name", editFileForm.title || editFileNewFile.name);
                    try {
                      const res = await fetch(`${API_URL}/tasks/${task.id}/files`, {
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
      {openSubtaskCreator && (
        <CreateSubtaskModal
          onClose={() => setOpenSubtaskCreator(false)}
          projectId={task.project_id || null}
          taskId={task.id || null}
          taskTitle={task.title || null}
          onCreated={() => setOpenSubtaskCreator(false)}
        />
      )}
    </>
  );
}
