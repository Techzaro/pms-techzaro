import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import API_URL from "../config/api";
import { authToken, getUser } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useDraftGuard from "../hooks/useDraftGuard";
import useAutoSave from "../hooks/useAutoSave";
import AutoSaveIndicator from "./AutoSaveIndicator";
import draftService from "../services/draftService";
import UserSelectDropdown from "./UserSelectDropdown";
import CustomSelect from "./CustomSelect";
import MultiSelectDropdown from "./MultiSelectDropdown";
import LoadingButton from "./LoadingButton";
import ConfirmModal from "./ConfirmModal";

import { formatDateTime, toDatetimeLocal, toUTCIso, getNowDatetimeLocal } from "../utils/formatDateTime";
import { convertToLocal, convertToUTC, formatLocalTime, getTimezoneOffsetDisplay, formatWorkingHoursSummary } from "../utils/timezoneUtils";
import { Clock } from "lucide-react";
import { publish } from "../utils/eventBus";
import { notify, showSuccessMessage } from "../utils/notify";
import { useSubmit } from "../hooks/useSubmit";
import { useTranslation } from "react-i18next";
import RichTextEditor from "./RichTextEditor";
import CreateSubtaskModal from "./layout/CreateDeliverableModel";
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
    totalSubtasks: globalCounter + remainingTemplatesTotal,
    hasMore: totalPeriods > showPeriods,
    remainingPeriods: totalPeriods - showPeriods,
  };
}

const CreateTaskModal = ({ onClose, projectId = null, projectName = "", restoreDraftId = null, prefillData = null, onTaskCreated = null }) => {
  const { t } = useTranslation();
  const draftSaveRef = useRef(null);
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useDraftGuard(onClose, {
    draftSaveHandler: () => draftSaveRef.current?.(),
    hasDraftFeature: true,
  });
  useEscapeKey(true, handleClose);

  const { submitting, run } = useSubmit();
  const [formErrors, setFormErrors] = useState({});
  const [projects, setProjects] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [displayUsers, setDisplayUsers] = useState([]);
  const [projectEndDate, setProjectEndDate] = useState(null);
  const [draftId, setDraftId] = useState(null);

  const [form, setForm] = useState(() => {
    const user = getUser();
    const defaultTransfer = (user?.role === "admin" || user?.role === "manager") ? "allow" : "disallow";
    return {
      project_id: projectId ? [projectId] : [],
      assigned_to: [],
      followers: [],
      title: "",
      description: "",
      priority: "Medium",
      task_type: "standard",
      start_date: "",
      end_date: "",
      allow_transfer: defaultTransfer,
    };
  });

  const [recurrenceSettings, setRecurrenceSettings] = useState({
    repeat: "daily",
    skip_weekends: false,
  });

  const [recurringTemplates, setRecurringTemplates] = useState([
    { title: "", description: "", quantity: 1, combined: false },
  ]);

  const [subtasks, setSubtasks] = useState([]);
  const [subtaskInput, setSubtaskInput] = useState({ title: "", start_datetime: "", due_datetime: "" });
  const [openSubtaskDropdown, setOpenSubtaskDropdown] = useState(null);
  const [subtaskAssigneeHighlightedIndex, setSubtaskAssigneeHighlightedIndex] = useState(-1);
  const subtaskAssigneeListRef = useRef(null);

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
  const [openSubtaskCreator, setOpenSubtaskCreator] = useState(false);
  const [editFileDeleteConfirm, setEditFileDeleteConfirm] = useState(false);
  const [showVariablesHint, setShowVariablesHint] = useState(false);

  const autoSaveData = useMemo(() => ({
    ...form,
    deliverables: subtasks,
    recurringTemplates,
    requirementsList,
    links: links.map(l => ({ url: l.url, name: l.name || l.customName })),
  }), [form, subtasks, recurringTemplates, requirementsList, links]);

  const { lastSaved, isSaving, draftId: autoSaveDraftId } = useAutoSave({
    draftId,
    formData: autoSaveData,
    moduleType: "task",
    enabled: isDirty,
    project_id: form.project_id?.[0] || projectId,
  });

  useEffect(() => {
    if (autoSaveDraftId && autoSaveDraftId !== draftId) {
      setDraftId(autoSaveDraftId);
    }
  }, [autoSaveDraftId]);

  // Support prefillData from Templates
  useEffect(() => {
    if (!prefillData) return;
    setForm((prev) => ({
      ...prev,
      title: prefillData.title || prev.title,
      description: prefillData.description || prev.description,
      priority: prefillData.priority || prev.priority,
      task_type: prefillData.task_type || prev.task_type,
      project_id: prefillData.project_id || prev.project_id,
    }));
    if (prefillData.subtasks && Array.isArray(prefillData.subtasks)) {
      setSubtasks(prefillData.subtasks.map((s) => ({ title: typeof s === "string" ? s : s.title, start_date: null, due_date: null, assigned_to: null })));
    }
    if (prefillData.requirements && Array.isArray(prefillData.requirements)) {
      setRequirementsList(prefillData.requirements);
    }
  }, [prefillData]);

  // Restore draft data when opened from DraftCenter
  useEffect(() => {
    if (!restoreDraftId) return;

    const loadDraft = async () => {
      try {
        const data = await draftService.get(restoreDraftId);
        const draft = data?.data;
        if (!draft?.draft_data) return;

        const d = draft.draft_data;
        const restoredProjectId = d.project_id || projectId;
        setForm({
          project_id: Array.isArray(restoredProjectId) ? restoredProjectId : restoredProjectId ? [restoredProjectId] : [],
          assigned_to: d.assigned_to || [],
          title: d.title || "",
          description: d.description || "",
          priority: d.priority || "Medium",
          task_type: d.task_type || "standard",
          start_date: d.start_date || "",
          end_date: d.end_date || "",
          allow_transfer: d.allow_transfer ?? "allow",
        });
        if (d.requirementsList) setRequirementsList(d.requirementsList);
        if (d.deliverables) setSubtasks(d.deliverables);
        if (d.recurringTemplates) setRecurringTemplates(d.recurringTemplates);
        if (d.links) setLinks(d.links.map(l => ({ url: l.url, name: l.name || "", renaming: false })));
        setDraftId(restoreDraftId);
      } catch (err) {
        console.error("Failed to restore draft:", err);
      }
    };

    loadDraft();
  }, [restoreDraftId]);

  const handleSaveDraft = async () => {
    try {
      const payload = {
        module_type: "task",
        title: form.title || "Untitled Task Draft",
        draft_data: { ...form, deliverables: subtasks, recurringTemplates: recurringTemplates, requirementsList, links: links.map(l => ({ url: l.url, name: l.name || l.customName })) },
        project_id: form.project_id?.[0] || projectId,
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

  useEffect(() => {
    const token = authToken();
    const currentUser = getUser();
    const ensureCurrentUser = (users) => {
      if (!currentUser) return users;
      return users.some((u) => u.id === currentUser.id) ? users : [{ id: currentUser.id, name: currentUser.name, email: currentUser.email, role: currentUser.role, department: currentUser.department }, ...users];
    };

    if (projectId) {
      // Fetch project members from lightweight endpoint + project end_date
      Promise.all([
        fetch(`${API_URL}/projects/${projectId}/members`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, skipLoader: true })
          .then((r) => (r.ok ? r.json() : [])).then((d) => { setDisplayUsers(ensureCurrentUser(Array.isArray(d) ? d : [])); }).catch(() => {}),
        fetch(`${API_URL}/projects/${projectId}`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, skipLoader: true })
          .then((r) => (r.ok ? r.json() : null)).then((data) => { if (data?.project?.end_date) setProjectEndDate(data.project.end_date); }).catch(() => {}),
      ]);
    } else {
      Promise.all([
        fetch(`${API_URL}/projects`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, skipLoader: true })
          .then((r) => (r.ok ? r.json() : [])).then((d) => { const l = d?.data || d; setProjects(Array.isArray(l) ? l : []); }).catch(() => {}),
        fetch(`${API_URL}/team-users`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, skipLoader: true })
          .then((r) => (r.ok ? r.json() : { users: [] })).then((d) => { const u = ensureCurrentUser(Array.isArray(d) ? d : (d.users || [])); setAllUsers(u); setDisplayUsers(u); }).catch(() => {}),
      ]);
    }
  }, [projectId]);

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
  const markDirty = useCallback(() => { if (userInteractedRef.current) setIsDirty(true); }, []);

  const fetchMembersForProjects = useCallback((projectIds) => {
    const token = authToken();
    const currentUser = getUser();
    if (!projectIds || projectIds.length === 0) {
      setDisplayUsers(allUsers);
      return;
    }
    Promise.all(
      projectIds.map((pid) =>
        fetch(`${API_URL}/projects/${pid}/members`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, skipLoader: true })
          .then((r) => (r.ok ? r.json() : [])).catch(() => [])
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
      setDisplayUsers(users);
    }).catch(() => setDisplayUsers(allUsers));
  }, [allUsers]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "project_id") {
      setForm((prev) => ({ ...prev, project_id: value, assigned_to: [] }));
      fetchMembersForProjects(value);
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
    markDirty();
    if (formErrors[name]) setFormErrors((prev) => { const n = { ...prev }; delete n[name]; return n; });
  };

  const handleAssignedToChange = (ids) => {
    setForm((prev) => ({ ...prev, assigned_to: ids }));
    markDirty();
    if (formErrors.assigned_to) setFormErrors((prev) => { const n = { ...prev }; delete n.assigned_to; return n; });
  };

  const handleFollowersChange = (ids) => {
    setForm((prev) => ({ ...prev, followers: ids }));
    markDirty();
  };

  const handleAddRequirement = () => { if (!reqInput.trim()) return; markDirty(); setRequirementsList((prev) => [...prev, reqInput.trim()]); setReqInput(""); };
  const handleRemoveRequirement = (index) => { markDirty(); setRequirementsList((prev) => prev.filter((_, i) => i !== index)); };
  const handleReqKeyDown = (e) => { if (e.key === "Enter") { e.preventDefault(); handleAddRequirement(); } };

  const handleRecurringSettingChange = (field, value) => { markDirty(); setRecurrenceSettings((prev) => ({ ...prev, [field]: value })); };

  const handleAddTemplate = () => { markDirty(); setRecurringTemplates((prev) => [...prev, { title: "", description: "", quantity: 1, combined: false }]); };
  const handleRemoveTemplate = (index) => { markDirty(); setRecurringTemplates((prev) => prev.filter((_, i) => i !== index)); };
  const handleTemplateChange = (index, field, value) => { markDirty(); setRecurringTemplates((prev) => {
    const next = [...prev];
    next[index] = { ...next[index], [field]: value };
    return next;
  }); };
  const moveTemplate = useCallback((from, to) => {
    if (to < 0 || to >= recurringTemplates.length) return;
    setRecurringTemplates((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, [recurringTemplates.length]);

  const handleAddSubtask = () => {
    if (!subtaskInput.title.trim()) return;
    const startDate = subtaskInput.start_datetime ? toUTCIso(subtaskInput.start_datetime) : null;
    const dueDate = subtaskInput.due_datetime ? toUTCIso(subtaskInput.due_datetime) : null;
    markDirty();
    setSubtasks((prev) => [...prev, { title: subtaskInput.title.trim(), start_date: startDate, due_date: dueDate, assigned_to: null }]);
    setSubtaskInput({ title: "", start_datetime: "", due_datetime: "" });
  };
  const handleRemoveSubtask = (index) => { markDirty(); setSubtasks((prev) => prev.filter((_, i) => i !== index)); };
  const handleSubtaskKeyDown = (e) => { if (e.key === "Enter") { e.preventDefault(); handleAddSubtask(); } };
  const handleSubtaskAssignee = (index, userId) => {
    setSubtasks((prev) => prev.map((d, i) => i === index ? { ...d, assigned_to: userId || null } : d));
    setOpenSubtaskDropdown(null);
  };

  const handleSubtaskDropdownKeyDown = (e, idx) => {
    if (openSubtaskDropdown !== idx) return;
    const filteredUsers = displayUsers.filter(u => form.assigned_to.includes(u.id));
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
    const { type, index } = pendingRemoveItem;
    if (type === "file") handleRemoveFile(index);
    else if (type === "link") handleRemoveLink(index);
    else if (type === "requirement") handleRemoveRequirement(index);
    else if (type === "template") handleRemoveTemplate(index);
    else if (type === "subtask") handleRemoveSubtask(index);
    setRemoveConfirmOpen(false);
    setPendingRemoveItem({ type: "", index: -1 });
  };

  const handleFiles = (fileList) => {
    const newFiles = Array.from(fileList);
    markDirty();
    setPendingFiles((prev) => [...prev, ...newFiles.map((f) => ({ file: f, name: f.name, size: f.size, renaming: false }))]);
  };
  const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); dropRef.current?.classList.remove("task-drop-active"); if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files); };
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); dropRef.current?.classList.add("task-drop-active"); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); dropRef.current?.classList.remove("task-drop-active"); };
  const handleRemoveFile = (index) => { markDirty(); setPendingFiles((prev) => prev.filter((_, i) => i !== index)); };
  const handleAddLink = () => {
    if (!linkInput.trim()) return;
    let url = linkInput.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const name = linkTitleInput.trim() || url;
    markDirty();
    setLinks((prev) => [...prev, { url, name, renaming: false }]);
    setLinkInput(""); setLinkTitleInput("");
  };
  const handleRemoveLink = (index) => { markDirty(); setLinks((prev) => prev.filter((_, i) => i !== index)); };
  const handleLinkKeyDown = (e) => { if (e.key === "Enter") { e.preventDefault(); handleAddLink(); } };

  const uploadAttachments = async (taskId, token) => {
    await Promise.all([
      ...pendingFiles.map((file) => {
        const fd = new FormData();
        fd.append("file", file.file);
        fd.append("name", file.customName || file.name);
        return fetch(`${API_URL}/tasks/${taskId}/files`, { method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, body: fd, _notifHandled: true })
          .then(res => res.json().catch(() => ({})).then(d => {
            if (d.file_skipped) notify.warning(d.message || "File could not be uploaded due to storage limit.");
            return d;
          }))
          .catch(() => {});
      }),
      ...links.map((link) => fetch(`${API_URL}/tasks/${taskId}/links`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ url: link.url, name: link.customName || link.name }), _notifHandled: true }).catch(() => {})),
    ]);
  };

  const validateForm = () => {
    const errors = {};
    if (!form.title.trim()) errors.title = "Task Name is required.";
    if (!projectId && (!form.project_id || (Array.isArray(form.project_id) && form.project_id.length === 0))) {
      errors.project_id = "Project selection is required.";
    }
    if (!form.assigned_to || form.assigned_to.length === 0) errors.assigned_to = "Select at least one user.";
    if (!form.priority) errors.priority = "Priority is required.";

    const recStart = form.recurrence_start_date || form.start_date;
    const recEnd = form.recurrence_end_date || form.end_date;

    if (recStart && recEnd && new Date(recStart) > new Date(recEnd)) {
      errors.start_date = "Start date cannot be later than the due date.";
      errors.end_date = "Due date cannot be earlier than the start date.";
    }

    if (form.task_type === "recurring") {
      const validTemplates = recurringTemplates.filter((t) => t.title.trim());
      if (validTemplates.length === 0) errors.recurring_templates = "Add at least one subtask template.";
      if (!recStart) errors.start_date = "Start date is required for recurring tasks.";
      if (!recEnd) errors.end_date = "End date (due date) is required for recurring tasks.";
      if (recStart && recEnd && new Date(recEnd) < new Date(recStart)) {
        errors.recurrence_end_date = "Recurrence End date cannot be before Start date.";
      }
    }
    if (recEnd && projectEndDate) {
      const taskEnd = new Date(recEnd);
      const projEnd = new Date(projectEndDate);
      if (taskEnd > projEnd) {
        errors.end_date = "Task deadline cannot exceed the project deadline.";
      }
    }
    setFormErrors(errors);
    const errorKeys = Object.keys(errors);
    if (errorKeys.length > 0) {
      notify.error(errors[errorKeys[0]]);
      return false;
    }
    return true;
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

        const startDateVal = form.recurrence_start_date || form.start_date;
        const endDateVal = form.recurrence_end_date || form.end_date;

        const body = {
          title: form.title.trim(),
          description: form.description || null,
          requirements: requirementsList.length > 0 ? requirementsList : null,
          start_date: toUTCIso(startDateVal),
          end_date: toUTCIso(endDateVal),
          assigned_to: form.assigned_to,
          priority: form.priority,
          task_type: form.task_type,
          recurrence_settings: settings,
          recurrence_start_date: form.task_type === "recurring" ? toUTCIso(startDateVal) : undefined,
          recurrence_end_date: form.task_type === "recurring" ? toUTCIso(endDateVal) : undefined,
          deliverable_templates: validTemplates.length > 0 ? validTemplates.map((t) => ({ title: t.title.trim(), description: t.description || null, quantity: t.quantity || 1, combined: t.combined || false })) : undefined,
          deliverables: subtasks.length > 0 ? subtasks.map((d) => ({ title: d.title, start_date: d.start_date || null, due_date: d.due_date || null, assigned_to: d.assigned_to || null })) : undefined,
          allow_transfer: form.allow_transfer === "allow",
          followers: form.followers || [],
        };

        const projectIds = projectId ? [projectId] : form.project_id;
        const allTaskIds = [];

        if (projectIds && projectIds.length > 0) {
          const results = await Promise.all(
            projectIds.map((pid) =>
              fetch(`${API_URL}/projects/${pid}/tasks`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
                _notifHandled: true,
              }).then(async (r) => {
                const data = await r.json();
                if (!r.ok) {
                  const msg = data.message || "Failed to create task";
                  const errors = data.errors ? Object.values(data.errors).flat().join(". ") : "";
                  throw new Error(errors || msg);
                }
                return data;
              })
            )
          );
          results.forEach((data) => {
            const ids = data.tasks?.map((t) => t.id) || (data.task?.id ? [data.task.id] : []);
            allTaskIds.push(...ids);
          });
        } else {
          const response = await fetch(`${API_URL}/tasks`, {
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
          const ids = data.tasks?.map((t) => t.id) || (data.task?.id ? [data.task.id] : []);
          allTaskIds.push(...ids);
        }

        if (allTaskIds.length > 0 && (pendingFiles.length > 0 || links.length > 0)) {
          await Promise.all(allTaskIds.map((id) => uploadAttachments(id, token)));
        }

        showSuccessMessage("Task", "created");
        publish("task:created", {});
        publish("data:changed", { type: "task", action: "created" });
        if (restoreDraftId) draftService.delete(restoreDraftId).catch(() => {});
        if (onTaskCreated) onTaskCreated();
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
                <h2>{t("Create Task")}</h2>
                <p>{t("Add task details and assign it to team members.", { defaultValue: "Add task details and assign it to team members." })}</p>
              </div>
              <AutoSaveIndicator isSaving={isSaving} lastSaved={lastSaved} />
            </div>
            <div className="task-header-actions">
              <button className="task-save-draft-btn" onClick={handleSaveDraft} type="button" disabled={!form.title.trim()}>
                {t("Save Draft", { defaultValue: "Save Draft" })}
              </button>
              <LoadingButton className="task-create-btn" onClick={handleSubmit} loading={submitting}>{t("+ Create Task", { defaultValue: "+ Create Task" })}</LoadingButton>
              <button className="task-close-btn" onClick={handleClose}>✕</button>
            </div>
          </div>

          {/* BODY */}
          <form onSubmit={handleSubmit} className="task-body">
            <div className="task-left">
              <div className="task-grid-2">
                {!projectId ? (
                  <div className="task-field">
                    <label>{t("Projects")} <span style={{ color: "#ef4444" }}>*</span></label>
                    <MultiSelectDropdown name="project_id" value={form.project_id} onChange={(val) => handleChange({ target: { name: "project_id", value: val } })}
                      placeholder={t("Select projects", { defaultValue: "Select projects" })} searchPlaceholder={t("Search projects...")} options={projects.map((p) => ({ value: p.id, label: p.title }))} />
                    {formErrors.project_id && <span className="field-error-text">{formErrors.project_id}</span>}
                  </div>
                ) : (
                  <div className="task-field">
                    <label>{t("Project", { defaultValue: "Project" })} <span style={{ color: "#ef4444" }}>*</span></label>
                    <div className="task-project-name">{projectName || t("Current Project", { defaultValue: "Current Project" })}</div>
                  </div>
                )}
                <div className="task-field">
                  <label>{t("Assign To", { defaultValue: "Assign To" })} <span>*</span></label>
                  <UserSelectDropdown users={displayUsers} selectedIds={form.assigned_to} onChange={handleAssignedToChange}
                    placeholder={t("Click to select members", { defaultValue: "Click to select members" })} error={!!formErrors.assigned_to} />
                  {formErrors.assigned_to && <span className="field-error-text">{formErrors.assigned_to}</span>}

                  {/* Assignee Timezone, Current Time & Working Hours (SRS Sec 13 & 17) */}
                  {form.assigned_to && form.assigned_to.length > 0 && (
                    <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                      {displayUsers
                        .filter((u) => form.assigned_to.includes(u.id))
                        .map((u) => {
                          const tz = u.timezone || "UTC";
                          const uTime = formatLocalTime(new Date().toISOString(), tz);
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
                                  <strong>{u.name}</strong>'s {t("Time", { defaultValue: "Time" })}:{" "}
                                  <span style={{ color: "var(--color-primary, #4f46e5)", fontWeight: 600 }}>{uTime}</span> ({tz})
                                </span>
                              </div>
                              <div style={{ fontSize: "11px", color: "var(--text-secondary)", paddingLeft: "19px" }}>
                                🕒 {t("Working Hours", { defaultValue: "Working Hours" })}: <span style={{ fontWeight: 500, color: "var(--text-primary, #1e293b)" }}>{workingHoursStr}</span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>

              <div className="task-field">
                <label>{t("Followers (Optional)", { defaultValue: "Followers (Optional)" })}</label>
                <UserSelectDropdown
                  users={displayUsers.filter((u) => !form.assigned_to.includes(u.id))}
                  selectedIds={form.followers || []}
                  onChange={handleFollowersChange}
                  placeholder={t("Click to select followers", { defaultValue: "Click to select followers" })}
                />
              </div>

              <div className="task-field">
                <label>{t("Task Name")} <span>*</span></label>
                <input type="text" name="title" placeholder={t("Enter task name..", { defaultValue: "Enter task name.." })} value={form.title} onChange={handleChange} className={formErrors.title ? "field-error" : ""} />
                {formErrors.title && <span className="field-error-text">{formErrors.title}</span>}
              </div>

              <div className="task-field">
                <label>{t("Description", { defaultValue: "Description" })}</label>
                <RichTextEditor
                  value={form.description}
                  onChange={(val) => { const clean = (s) => (s || "").replace(/<[^>]*>/g, "").trim(); setForm((prev) => ({ ...prev, description: val })); markDirty(); }}
                  placeholder={t("Enter task description...", { defaultValue: "Enter task description..." })}
                />
              </div>

              {/* LINKS & ATTACHMENTS */}
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
                            setEditingFile({ type: "pending", index, currentName: file.customName || file.name });
                            setEditFileForm({ title: file.customName || file.name.replace(/\.[^.]+$/, "") });
                            setEditFileNewFile(null);
                            setEditFileDeleted(false);
                            setEditFileDeleteConfirm(false);
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
                    <button type="button" className="task-link-add-btn" onClick={handleAddLink} disabled={!linkInput.trim()}>{t("Add Link", { defaultValue: "Add Link" })}</button>
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
                          setEditingLink({ type: "pending", index });
                          setEditLinkForm({ title: link.customName || link.name, url: link.url });
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

            {/* RIGHT SIDE */}
            <div className="task-right">

              <div className="task-field">
                <label>{t("Priority")} <span style={{ color: "#ef4444" }}>*</span></label>
                <CustomSelect name="priority" value={form.priority}
                  onChange={(val) => { setForm((prev) => ({ ...prev, priority: val })); markDirty(); }}
                  options={[
                    { value: "Medium", label: t("Medium") },
                    { value: "Low", label: t("Low") },
                    { value: "High", label: t("High") },
                  ]} />
              </div>

              <div className="task-field">
                <label>{t("Requirements", { defaultValue: "Requirements" })}</label>
                <div className="cp-goals-input-row">
                  <input type="text" placeholder={t("Enter a requirement", { defaultValue: "Enter a requirement" })} value={reqInput} onChange={(e) => { setReqInput(e.target.value); markDirty(); }} onKeyDown={handleReqKeyDown} />
                  <button type="button" className="cp-goals-add-btn" onClick={handleAddRequirement} disabled={!reqInput.trim()}>{t("Add", { defaultValue: "Add" })}</button>
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

              <div className="task-card task-card--bordered">
                <div className="task-card-top"><span>{t("Dates", { defaultValue: "Dates" })}</span></div>
                <div className="task-deadline-grid">
                  <div>
                    <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>{t("Start", { defaultValue: "Start" })}</label>
                    <input type="datetime-local" value={form.start_date || form.recurrence_start_date || ""}
                      onChange={(e) => { setForm((prev) => ({ ...prev, start_date: e.target.value, recurrence_start_date: e.target.value })); markDirty(); }}
                      min={getNowDatetimeLocal()} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>{t("End", { defaultValue: "End" })}</label>
                    <input type="datetime-local" value={form.end_date || form.recurrence_end_date || ""}
                      onChange={(e) => { setForm((prev) => ({ ...prev, end_date: e.target.value, recurrence_end_date: e.target.value })); markDirty(); }}
                      min={getNowDatetimeLocal()}
                      max={projectEndDate ? toDatetimeLocal(projectEndDate) : undefined} />
                    {projectEndDate && <span style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, display: "block" }}>{t("Max", { defaultValue: "Max" })}: {new Date(projectEndDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
                  </div>
                </div>

                {/* Assignee Deadline Conversion (SRS Sec 13 & 17) */}
                {(form.end_date || form.recurrence_end_date) && form.assigned_to && form.assigned_to.length > 0 && (
                  <div style={{ marginTop: "10px", padding: "8px 10px", background: "var(--color-primary-bg, rgba(79, 70, 229, 0.08))", border: "1px solid var(--color-primary, #4f46e5)", borderRadius: "8px", fontSize: "12px" }}>
                    <div style={{ fontWeight: 600, color: "var(--color-primary, #4f46e5)", marginBottom: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                      <Clock size={13} /> {t("Assignee Deadline Equivalent", { defaultValue: "Assignee Deadline Equivalent" })}
                    </div>
                    {displayUsers
                      .filter((u) => form.assigned_to.includes(u.id))
                      .map((u) => {
                        const tz = u.timezone || "UTC";
                        const targetDate = form.end_date || form.recurrence_end_date;
                        const assigneeDeadline = convertToLocal(convertToUTC(targetDate), tz);
                        return (
                          <div key={u.id} style={{ color: "var(--text-primary, #1e293b)", fontSize: "11px", marginTop: "2px" }}>
                            • <strong>{u.name}</strong>: {assigneeDeadline} ({tz})
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              <div className="task-card">
                <label>{t("Task Type", { defaultValue: "Task Type" })}</label>
                <CustomSelect name="task_type" value={form.task_type}
                  onChange={(val) => {
                    setForm((prev) => ({ ...prev, task_type: val })); markDirty();
                    if (val === "recurring") {
                      if (recurringTemplates.length === 0 || !recurringTemplates.some((t) => t.title.trim())) {
                        setRecurringTemplates([{ title: "{{number}} - Task Deliverable", description: "", quantity: 1, combined: false }]);
                      }
                    }
                  }}
                  options={[{ value: "standard", label: t("Standard", { defaultValue: "Standard" }) }, { value: "recurring", label: t("Recurring", { defaultValue: "Recurring" }) }]} />
              </div>

              <div className="task-card">
                <label>{t("Transfer To", { defaultValue: "Transfer To" })}</label>
                <CustomSelect name="allow_transfer" value={form.allow_transfer ?? "allow"}
                  onChange={(val) => { setForm((prev) => ({ ...prev, allow_transfer: val })); markDirty(); }}
                  options={[{ value: "allow", label: t("Allow", { defaultValue: "Allow" }) }, { value: "disallow", label: t("Disallow", { defaultValue: "Disallow" }) }]} />
                <small style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, display: "block" }}>
                  {t("Whether assignees can transfer this task to others", { defaultValue: "Whether assignees can transfer this task to others" })}
                </small>
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

                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
                      <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>Dates</label>
                      <div className="task-deadline-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Start</label>
                          <input
                            type="datetime-local"
                            value={form.recurrence_start_date || form.start_date || ""}
                            onChange={(e) => { setForm((prev) => ({ ...prev, recurrence_start_date: e.target.value, start_date: e.target.value })); markDirty(); }}
                            min={getNowDatetimeLocal()}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>End</label>
                          <input
                            type="datetime-local"
                            value={form.recurrence_end_date || form.end_date || ""}
                            onChange={(e) => { setForm((prev) => ({ ...prev, recurrence_end_date: e.target.value, end_date: e.target.value })); markDirty(); }}
                            min={form.recurrence_start_date || form.start_date || getNowDatetimeLocal()}
                          />
                          {formErrors.recurrence_end_date && (
                            <span style={{ fontSize: 11, color: "#ef4444", marginTop: 2, display: "block" }}>{formErrors.recurrence_end_date}</span>
                          )}
                        </div>
                      </div>
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
                      Subtasks auto-distribute between <strong>Start Date</strong> and <strong>Due Date</strong>.
                    </p>
                  </div>

                  <div className="task-card">
                    <div className="task-card-top">
                      <span>Subtask Templates</span>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button type="button" className="task-icon-btn" title={t("Available variables", { defaultValue: "Available variables" })} onClick={() => setShowVariablesHint(!showVariablesHint)}>
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
                          <input type="text" placeholder={t("Description (optional)", { defaultValue: "Description (optional)" })} value={tmpl.description}
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
                        No templates yet. Click + Add to create your first subtask template.
                      </p>
                    )}
                  </div>
                </>
              )}

              {subtasks.length > 0 && (
                <div className="task-card task-card--bordered">
                  <div className="task-card-top">
                    <span>Subtasks</span>
                  </div>
                  <div className="task-phase-list">
                    {subtasks.map((d, index) => {
                      const assignedUser = d.assigned_to ? displayUsers.find(u => String(u.id) === String(d.assigned_to)) : null;
                      const isDropdownOpen = openSubtaskDropdown === index;
                      return (
                      <div key={index} className="task-phase-item" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f3f4f6", position: "relative" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#8b5cf6", display: "inline-block", flexShrink: 0 }}></span>
                        <span style={{ flex: 1, fontSize: 13, color: "#111827" }}>{d.title}</span>
                        <span style={{ fontSize: 11, color: "#6b7280", whiteSpace: "pre-line" }}>
                          {d.start_date ? formatDateTime(d.start_date).replace("\n", " ") : ""}
                          {d.start_date && d.due_date ? "\n" : ""}
                          {d.due_date ? formatDateTime(d.due_date).replace("\n", " ") : "No due date"}
                        </span>
                        <div style={{ position: "relative" }}>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setOpenSubtaskDropdown(isDropdownOpen ? null : index); }}
                            onKeyDown={(e) => handleSubtaskDropdownKeyDown(e, index)}
                            style={{
                              fontSize: 11, cursor: "pointer", padding: "3px 8px", borderRadius: 4, border: "1px solid #e5e7eb",
                              background: assignedUser ? "#eef2ff" : "#f9fafb", color: assignedUser ? "#6366f1" : "#6b7280",
                              fontWeight: 500, whiteSpace: "nowrap",
                            }}
                          >
                            {assignedUser ? assignedUser.name : "Assign"}
                          </button>
                          {isDropdownOpen && (
                            <div onClick={(e) => e.stopPropagation()} ref={subtaskAssigneeListRef} style={{
                              position: "absolute", bottom: "100%", right: 0, zIndex: 100,
                              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
                              boxShadow: "0 4px 12px rgba(0,0,0,0.1)", minWidth: 150, padding: "4px 0", marginBottom: 4,
                            }}>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleSubtaskAssignee(index, null); }}
                                onMouseEnter={() => setSubtaskAssigneeHighlightedIndex(0)}
                                style={{
                                  display: "block", width: "100%", textAlign: "left", padding: "6px 12px",
                                  fontSize: 12, cursor: "pointer",
                                  background: subtaskAssigneeHighlightedIndex === 0 ? "#eef2ff" : (!assignedUser ? "#f3f4f6" : "transparent"),
                                  border: "none", color: "#374151",
                                }}
                              >
                                All assignees
                              </button>
                              {displayUsers.filter(u => form.assigned_to.includes(u.id)).map((u, uIdx) => (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleSubtaskAssignee(index, u.id); }}
                                  onMouseEnter={() => setSubtaskAssigneeHighlightedIndex(uIdx + 1)}
                                  style={{
                                    display: "block", width: "100%", textAlign: "left", padding: "6px 12px",
                                    fontSize: 12, cursor: "pointer",
                                    background: subtaskAssigneeHighlightedIndex === uIdx + 1 ? "#eef2ff" : (String(d.assigned_to) === String(u.id) ? "#f3f4f6" : "transparent"),
                                    border: "none", color: "#374151",
                                  }}
                                >
                                  <span>{u.name}</span>
                                  {u.role && <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 6 }}>({u.role.replace("_", " ")})</span>}
                                  {u.department && <span style={{ fontSize: 10, fontWeight: 500, color: "#6366f1", background: "#eef2ff", padding: "1px 5px", borderRadius: 4, marginLeft: 4 }}>{u.department}</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button type="button" className="task-phase-item-remove" onClick={() => { setPendingRemoveItem({ type: "subtask", index }); setRemoveConfirmOpen(true); }} style={{ fontSize: 14 }}>✕</button>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </form>
        </div>
      </div>
      <ConfirmModal isOpen={removeConfirmOpen} onClose={() => { setRemoveConfirmOpen(false); setPendingRemoveItem({ type: "", index: -1 }); }}
        onConfirm={confirmRemoveItem} title={t("Remove Item", { defaultValue: "Remove Item" })} message="Are you sure you want to remove this item? This action cannot be undone."
        confirmText="Remove" cancelText="Cancel" danger />

      {/* Edit Link Modal */}
      {editingLink && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 10003, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }} onClick={() => setEditingLink(null)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: "24px 28px", width: 400, maxWidth: "90vw", boxShadow: "0 25px 60px rgba(0,0,0,0.25)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#111827" }}>{t("Edit File / Link", { defaultValue: "Edit File / Link" })}</h3>
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
            <h3 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#111827" }}>{t("Edit File", { defaultValue: "Edit File" })}</h3>
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
                  <button type="button" onClick={() => setEditFileDeleteConfirm(true)} style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} title={t("Delete file", { defaultValue: "Delete file" })}>
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
            <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#111827" }}>{t("Delete File", { defaultValue: "Delete File" })}</h3>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#6b7280" }}>Are you sure you want to delete this file? You can upload a new file after.</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => setEditFileDeleteConfirm(false)} style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={(e) => e.target.style.background = "#f9fafb"} onMouseLeave={(e) => e.target.style.background = "#fff"}>Cancel</button>
              <button type="button" onClick={() => { setEditFileDeleted(true); setEditFileDeleteConfirm(false); }} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={(e) => e.target.style.background = "#dc2626"} onMouseLeave={(e) => e.target.style.background = "#ef4444"}>Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {ConfirmDialog}
      {openSubtaskCreator && (
        <CreateSubtaskModal
          onClose={() => setOpenSubtaskCreator(false)}
          projectId={form.project_id?.[0] || null}
          onCreated={() => setOpenSubtaskCreator(false)}
        />
      )}
    </>,
    document.body
  );
};

export default CreateTaskModal;
