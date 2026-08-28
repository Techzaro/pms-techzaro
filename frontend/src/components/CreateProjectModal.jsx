/**
 * CreateProjectModal.jsx
 * Full-featured modal form for creating a new project.
 * Includes fields for title, description, category, team assignment, milestones,
 * subtasks, attachments (files & links), client info, and priority.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useDraftGuard from "../hooks/useDraftGuard";
import useAutoSave from "../hooks/useAutoSave";
import AutoSaveIndicator from "./AutoSaveIndicator";
import draftService from "../services/draftService";
import UserSelectDropdown from "./UserSelectDropdown";
import CustomSelect from "./CustomSelect";
import LoadingButton from "./LoadingButton";
import ConfirmModal from "./ConfirmModal";

import { formatDateTime, toUTCIso, getNowDatetimeLocal } from "../utils/formatDateTime";
import { publish } from "../utils/eventBus";
import { notify, showSuccessMessage } from "../utils/notify";
import { useSubmit } from "../hooks/useSubmit";
import { useTranslation } from "react-i18next";
import RichTextEditor from "./RichTextEditor";
import "./layout/CreateProjectModal.css";

const CreateProjectModal = ({ onClose, restoreDraftId = null, initialTeamId = null }) => {
  const { t } = useTranslation();
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

  const [loading, setLoading] = useState(false);
  const { submitting, run } = useSubmit();
  const [formErrors, setFormErrors] = useState({});
  const [teams, setTeams] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [guests, setGuests] = useState([]);
  const [draftId, setDraftId] = useState(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    end_date: "",
    team_id: initialTeamId ? String(initialTeamId) : "",
    team_ids: initialTeamId ? [Number(initialTeamId)] : [],
    assigned_users: [],
    followers: [],
    guest_ids: [],
    priority: "Medium",
    status: "Planning",
    budget: "",
    client_name: "",
    team_roles: [],
  });
  const [categoriesList, setCategoriesList] = useState([]);
  const [categoryInput, setCategoryInput] = useState("");
  const [catSearch, setCatSearch] = useState("");
  const [catDeleteOpen, setCatDeleteOpen] = useState(false);
  const [pendingCatDelete, setPendingCatDelete] = useState("");
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [pendingRemoveItem, setPendingRemoveItem] = useState({ type: "", index: -1 });
  const [deletedCategories, setDeletedCategories] = useState(() => {
    try { return JSON.parse(localStorage.getItem("deleted_categories") || "[]"); } catch { return []; }
  });
  const [existingCategories, setExistingCategories] = useState([]);
  const [categoryCustomMode, setCategoryCustomMode] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef(null);
  const [catHighlightedIndex, setCatHighlightedIndex] = useState(0);
  const catListRef = useRef(null);

  const [teamRolesOpen, setTeamRolesOpen] = useState(false);
  const [teamRolesSearch, setTeamRolesSearch] = useState("");
  const teamRolesRef = useRef(null);
  const [teamHighlightedIndex, setTeamHighlightedIndex] = useState(0);
  const teamListRef = useRef(null);

  const [milestones, setMilestones] = useState([]);
  const [phaseName, setPhaseName] = useState("");
  const [phaseDate, setPhaseDate] = useState("");
  const [phaseDropdownOpen, setPhaseDropdownOpen] = useState(false);
  const [phaseSearch, setPhaseSearch] = useState("");
  const phaseDropdownRef = useRef(null);
  const [savedMilestones, setSavedMilestones] = useState(() => {
    try { return JSON.parse(localStorage.getItem("persisted_milestones") || "[]"); } catch { return []; }
  });

  const [pendingFiles, setPendingFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  const [linkTitleInput, setLinkTitleInput] = useState("");
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);
  const [editingLink, setEditingLink] = useState(null);
  const [editLinkForm, setEditLinkForm] = useState({ title: "", url: "" });
  const [editingFile, setEditingFile] = useState(null);
  const [editFileForm, setEditFileForm] = useState({ title: "" });
  const [editFileNewFile, setEditFileNewFile] = useState(null);

  const autoSaveData = useMemo(() => ({
    ...form,
    categoriesList,
    milestones,
    pendingFiles: pendingFiles.map(f => f.name || f.customName),
    links,
  }), [form, categoriesList, milestones, pendingFiles, links]);

  const { lastSaved, isSaving, draftId: autoSaveDraftId } = useAutoSave({
    draftId,
    formData: autoSaveData,
    moduleType: "project",
    enabled: isDirty,
  });

  useEffect(() => {
    if (autoSaveDraftId && autoSaveDraftId !== draftId) {
      setDraftId(autoSaveDraftId);
    }
  }, [autoSaveDraftId]);

  const handleSaveDraft = async () => {
    try {
      const payload = {
        module_type: "project",
        title: form.title || "Untitled Project Draft",
        draft_data: { ...form, categoriesList, milestones, pendingFiles: pendingFiles.map(f => f.name || f.customName), links },
        project_id: null,
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

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (teamRolesRef.current && !teamRolesRef.current.contains(e.target)) {
        setTeamRolesOpen(false);
        setTeamRolesSearch("");
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
    setCatHighlightedIndex(0);
  }, [catSearch, categoryDropdownOpen]);

  useEffect(() => {
    if (categoryDropdownOpen && catListRef.current) {
      const el = catListRef.current.children[catHighlightedIndex];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [catHighlightedIndex, categoryDropdownOpen]);

  useEffect(() => {
    setTeamHighlightedIndex(0);
  }, [teamRolesSearch, teamRolesOpen]);

  useEffect(() => {
    if (teamRolesOpen && teamListRef.current) {
      const el = teamListRef.current.children[teamHighlightedIndex];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [teamHighlightedIndex, teamRolesOpen]);

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

      fetch(`${API_URL}/guest-users`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          setGuests(data.users || []);
        })
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
          team_id: d.team_id || "",
          team_ids: d.team_ids || [],
          assigned_users: d.assigned_users || [],
          guest_ids: d.guest_ids || [],
          priority: d.priority || "Medium",
          status: d.status || "Planning",
          budget: d.budget || "",
          team_roles: d.team_roles || [],
        });
        if (d.categoriesList) setCategoriesList(d.categoriesList);
        if (d.milestones) setMilestones(d.milestones);
        if (d.links) setLinks(d.links);
        setDraftId(restoreDraftId);
      } catch (err) {
        console.error("Failed to restore draft:", err);
      }
    };

    loadDraft();
  }, [restoreDraftId]);

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
    markDirty();
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
    markDirty();
    setForm((prev) => ({ ...prev, assigned_users: ids }));
  };

  const handleAddPhase = () => {
    if (!phaseName.trim() || !phaseDate) return;
    const formattedDt = toUTCIso(phaseDate);
    markDirty();
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
    markDirty();
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePhaseKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddPhase(); }
  };

  const handleAddCategory = () => {
    if (!categoryInput.trim()) return;
    const newCat = categoryInput.trim();
    markDirty();
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
    markDirty();
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
    setRemoveConfirmOpen(false);
    setPendingRemoveItem({ type: "", index: -1 });
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
    markDirty();
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
    markDirty();
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
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
   * Uploads pending file attachments and links to the newly created project.
   * Runs sequentially; failures are silently caught per-item.
   * @param {number} projectId - ID of the created project
   * @param {string} token - Auth token
   */
  const uploadAttachments = async (projectId, token) => {
    try {
      const filePromises = (pendingFiles || []).map((item) => {
        const rawFile = item instanceof File ? item : (item?.file instanceof File ? item.file : item?.file);
        if (!rawFile) return Promise.resolve();
        const fd = new FormData();
        fd.append("file", rawFile);
        const customName = item.customName || item.name || rawFile.name || "";
        if (customName) {
          fd.append("name", customName);
        }
        return fetch(`${API_URL}/projects/${projectId}/files`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          body: fd,
          _notifHandled: true,
        }).then(res => res.json().catch(() => ({})).then(d => {
          if (d.file_skipped) notify.warning(d.message || "File could not be uploaded due to storage limit.");
          return d;
        })).catch((e) => console.error("File upload error:", e));
      });

      const linkPromises = (links || []).map((link) => {
        const url = (link.url || "").trim();
        if (!url) return Promise.resolve();
        const fullUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        return fetch(`${API_URL}/projects/${projectId}/links`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ url: fullUrl, name: link.customName || link.name || fullUrl }),
          _notifHandled: true,
        }).catch((e) => console.error("Link upload error:", e));
      });

      await Promise.all([...filePromises, ...linkPromises]);
    } catch (err) {
      console.error("Upload attachments error:", err);
    }
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

        // Build the request payload from form state
        const body = {
          title: form.title.trim(),
          description: form.description || null,
          end_date: form.end_date ? toUTCIso(form.end_date) : null,
          project_deadline: form.end_date ? toUTCIso(form.end_date) : null,
          category: categoriesList.length > 0 ? JSON.stringify(categoriesList) : null,
          team_id: form.team_id ? parseInt(form.team_id) : null,
          team_ids: form.team_ids,
          assigned_users: form.assigned_users.length > 0 ? form.assigned_users : [],
          followers: form.followers || [],
          guest_ids: form.guest_ids.length > 0 ? form.guest_ids : [],
          client_name: form.client_name.trim() || null,
          priority: form.priority,
          status: form.status,
          budget: form.budget ? parseFloat(form.budget) : null,
          milestones: milestones.map((m) => ({
            title: m.title,
            due_date: m.due_date ? toUTCIso(m.due_date) : null,
            milestone_deadline: m.due_date ? toUTCIso(m.due_date) : null,
            status: m.status || "planned",
          })),
          team_roles: form.team_roles,
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
        if (restoreDraftId) draftService.delete(restoreDraftId).catch(() => {});
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
              <h2>{t("Create Project")}</h2>
              <p>{t("Add project details and assign it to team members.", { defaultValue: "Add project details and assign it to team members." })}</p>
            </div>
            <AutoSaveIndicator isSaving={isSaving} lastSaved={lastSaved} />
          </div>
          <div className="cp-header-actions">
            <button className="cp-save-draft-btn" onClick={handleSaveDraft} type="button" disabled={!form.title.trim()}>
              {t("Save Draft", { defaultValue: "Save Draft" })}
            </button>
            <LoadingButton className="cp-create-btn" onClick={handleSubmit} loading={submitting}>
              {t("+ Create Project", { defaultValue: "+ Create Project" })}
            </LoadingButton>
            <button className="cp-close-btn" onClick={handleClose}>✕</button>
          </div>
        </div>

        {/* BODY */}
        <form onSubmit={handleSubmit} className="cp-body">

          {/* LEFT */}
          <div className="cp-left">

            <div className="cp-field">
              <label>{t("Project Name")} <span>*</span></label>
              <input
                type="text"
                name="title"
                placeholder={t("Enter project name...", { defaultValue: "Enter project name..." })}
                value={form.title}
                onChange={handleChange}
                className={formErrors.title ? "field-error" : ""}
              />
              {formErrors.title && <span className="field-error-text">{formErrors.title}</span>}
            </div>

            <div className="cp-field">
              <label>{t("Description", { defaultValue: "Description" })}</label>
              <RichTextEditor
                value={form.description}
                onChange={(val) => { markDirty(); setForm((prev) => ({ ...prev, description: val })); }}
                placeholder={t("Enter project description...", { defaultValue: "Enter project description..." })}
              />
            </div>

            {/* PROJECT DEADLINE */}
            <div className="cp-field">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <label style={{ margin: 0 }}>{t("Project Deadline (Optional)", { defaultValue: "Project Deadline (Optional)" })}</label>
                {form.end_date && (
                  <button
                    type="button"
                    style={{ background: "none", border: "none", color: "#ef4444", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}
                    onClick={() => { markDirty(); setForm((prev) => ({ ...prev, end_date: "" })); }}
                  >
                    {t("Clear Deadline ✕", { defaultValue: "Clear Deadline ✕" })}
                  </button>
                )}
              </div>
              <input
                type="datetime-local"
                name="end_date"
                value={form.end_date || ""}
                onChange={(e) => { markDirty(); setForm((prev) => ({ ...prev, end_date: e.target.value })); }}
              />
            </div>

            {/* PROJECT MILESTONES */}
            <div className="cp-card">
              <div className="cp-card-top">
                <span>{t("Project Milestones", { defaultValue: "Project Milestones" })}</span>
              </div>

              <div className="cp-deadline-grid">
                <div className="cp-field" ref={phaseDropdownRef}>
                  <label style={{ fontSize: "13px" }}>{t("Phase", { defaultValue: "Phase" })}</label>
                  <input
                    type="text"
                    placeholder={t("Enter phase name", { defaultValue: "Enter phase name" })}
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
                        <div className="cp-dropdown-item" style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                          {t('Type and press Enter to add "{{phaseSearch}}"', { defaultValue: `Type and press Enter to add "${phaseSearch}"`, phaseSearch })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="cp-field">
                  <label style={{ fontSize: "13px" }}>{t("Due Date & Time (Optional)", { defaultValue: "Due Date & Time (Optional)" })}</label>
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
                disabled={!phaseName.trim()}
              >
                {t("+ Add Phase", { defaultValue: "+ Add Phase" })}
              </button>

              {milestones.length > 0 && (
                <div className="cp-phase-list">
                  {milestones.map((m, index) => (
                    <div key={index} className="cp-phase-item">
                      <div className="cp-phase-item-dot" />
                      <div className="cp-phase-item-info">
                        <div className="cp-phase-item-title">{m.title}</div>
                        <div className="cp-phase-item-date">{m.due_date ? formatDateDisplay(m.due_date) : t("No Date", { defaultValue: "No Date" })}</div>
                      </div>
                      {m.due_date && (
                        <button
                          type="button"
                          title={t("Clear Milestone Date", { defaultValue: "Clear Milestone Date" })}
                          style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "12px", marginRight: "8px", fontWeight: 600 }}
                          onClick={() => {
                            markDirty();
                            setMilestones((prev) => prev.map((item, idx) => idx === index ? { ...item, due_date: "" } : item));
                          }}
                        >
                          {t("Clear Date", { defaultValue: "Clear Date" })}
                        </button>
                      )}
                      <button
                        type="button"
                        className="cp-phase-item-remove"
                        onClick={() => { setPendingRemoveItem({ type: "milestone", index }); setRemoveConfirmOpen(true); }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {milestones.length > 0 && (
                <div className="cp-deadline-summary">
                  <span>{t("Final Deadline:", { defaultValue: "Final Deadline:" })}</span>
                  <strong>{formatDateDisplay(milestones[milestones.length - 1].due_date)}</strong>
                </div>
              )}
            </div>

            {/* ATTACHMENTS */}
            <div className="cp-field">
              <label>{t("Links & Attachment", { defaultValue: "Links & Attachment" })}</label>

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
                  <p className="cp-drop-text">{t("Drag & drop files here", { defaultValue: "Drag & drop files here" })}</p>
                </div>
                <span className="cp-drop-browse">{t("or browse", { defaultValue: "or browse" })}</span>
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
                      <span className="cp-attachment-drag" title={t("Drag to reorder", { defaultValue: "Drag to reorder" })}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                      </span>
                      <span className="cp-attachment-icon">📄</span>
                      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                        <span className="cp-attachment-name" style={{ fontWeight: 600, fontSize: "13px" }}>{file.customName || file.name}</span>
                        <span className="cp-attachment-size">{(file.size / 1024).toFixed(1)} KB</span>
                      </div>
                      <div className="cp-attachment-actions">
                        <button type="button" className="cp-action-btn cp-action-btn-edit" title={t("Edit Name", { defaultValue: "Edit Name" })} onClick={() => {
                          setEditingFile({ type: "pending", index, currentName: file.customName || file.name });
                          setEditFileForm({ title: file.customName || file.name.replace(/\.[^.]+$/, "") });
                          setEditFileNewFile(null);
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

              <div className="cp-or-divider">
                <span className="cp-or-line"></span>
                <span className="cp-or-text">{t("OR", { defaultValue: "OR" })}</span>
                <span className="cp-or-line"></span>
              </div>

              <div className="cp-link-input-row" style={{ flexDirection: "column", gap: "8px" }}>
                <input
                  type="text"
                  placeholder={t("Link title (e.g. Figma Design, Drive Folder)", { defaultValue: "Link title (e.g. Figma Design, Drive Folder)" })}
                  value={linkTitleInput}
                  onChange={(e) => { markDirty(); setLinkTitleInput(e.target.value); }}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    placeholder={t("Paste link (Drive, Figma, Website, etc.)", { defaultValue: "Paste link (Drive, Figma, Website, etc.)" })}
                    value={linkInput}
                    onChange={(e) => { markDirty(); setLinkInput(e.target.value); }}
                    onKeyDown={handleLinkKeyDown}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="cp-link-add-btn"
                    onClick={handleAddLink}
                    disabled={!linkInput.trim()}
                  >
                    {t("Add Link", { defaultValue: "Add Link" })}
                  </button>
                </div>
              </div>

              {/* Added links */}
              {links.length > 0 && (
                <div className="cp-attachments-list">
                  {links.map((link, index) => (
                    <div key={index} className="cp-attachment-item">
                      <span className="cp-attachment-drag" title={t("Drag to reorder", { defaultValue: "Drag to reorder" })}>
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

          </div>

          {/* RIGHT */}
          <div className="cp-right">

            {/* PRIORITY */}
            <div className="cp-field">
              <label>{t("Priority")}</label>
              <CustomSelect
                name="priority"
                value={form.priority}
                onChange={(val) => handleChange({ target: { name: "priority", value: val } })}
                options={[
                  { value: "Medium", label: t("Medium") },
                  { value: "Low", label: t("Low") },
                  { value: "High", label: t("High") },
                ]}
              />
            </div>

            {/* STATUS */}
            <div className="cp-field">
              <label>{t("Status")}</label>
              <CustomSelect
                name="status"
                value={form.status}
                onChange={(val) => handleChange({ target: { name: "status", value: val } })}
                options={[
                  { value: "Planning", label: t("Planning", { defaultValue: "Planning" }) },
                  { value: "In-progress", label: t("In Progress") },
                  { value: "Pause", label: t("Pause", { defaultValue: "Pause" }) },
                  { value: "Completed", label: t("Completed") },
                ]}
              />
            </div>

            {/* CATEGORY */}
            <div className="cp-field">
              <label>{t("Category", { defaultValue: "Category" })}</label>
              {categoryCustomMode ? (
                <div className="custom-input-container">
                  <input
                    type="text"
                    placeholder={t("Enter custom category", { defaultValue: "Enter custom category" })}
                    value={categoryInput}
                    onChange={(e) => { markDirty(); setCategoryInput(e.target.value); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); handleAddCategory(); }
                      if (e.key === "Escape") { setCategoryCustomMode(false); setCategoryInput(""); }
                    }}
                    autoFocus
                  />
                  <button type="button" className="custom-input-revert" onClick={() => { setCategoryCustomMode(false); setCategoryInput(""); }} title={t("Back to list", { defaultValue: "Back to list" })}>&times;</button>
                </div>
              ) : (
                <div className="cp-category-dropdown" ref={categoryDropdownRef}>
                  <div className="cp-category-trigger cp-combo-trigger" onClick={() => { setCategoryDropdownOpen(true); }}>
                    {categoriesList.length > 0 && (
                      <span className="cp-combo-count">{categoriesList.length} {t("selected")}</span>
                    )}
                    {categoriesList.length === 0 && !categoryDropdownOpen && (
                      <span className="cp-combo-placeholder">{t("Select category", { defaultValue: "Select category" })}</span>
                    )}
                    {categoryDropdownOpen && (
                      <input
                        type="text"
                        className="cp-combo-input"
                        placeholder={t("Search by category name...", { defaultValue: "Search by category name..." })}
                        value={catSearch}
                        onChange={(e) => { setCatSearch(e.target.value); }}
                        onFocus={() => setCategoryDropdownOpen(true)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") { setCatSearch(""); setCategoryDropdownOpen(false); }
                          else if (e.key === "ArrowDown") {
                            e.preventDefault();
                            const filteredLen = existingCategories.filter((c) => !categoriesList.includes(c)).filter((c) => !catSearch.trim() || c.toLowerCase().includes(catSearch.toLowerCase())).length;
                            setCatHighlightedIndex((prev) => (prev < filteredLen ? prev + 1 : 0));
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            const filteredLen = existingCategories.filter((c) => !categoriesList.includes(c)).filter((c) => !catSearch.trim() || c.toLowerCase().includes(catSearch.toLowerCase())).length;
                            setCatHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredLen));
                          } else if (e.key === "Enter") {
                            e.preventDefault();
                            const filteredCats = existingCategories.filter((c) => !categoriesList.includes(c)).filter((c) => !catSearch.trim() || c.toLowerCase().includes(catSearch.toLowerCase()));
                            if (catHighlightedIndex < filteredCats.length) {
                              const cat = filteredCats[catHighlightedIndex];
                              if (cat && !categoriesList.includes(cat)) {
                                markDirty();
                                setCategoriesList((prev) => [...prev, cat]);
                              }
                            } else {
                              setCategoryCustomMode(true);
                              setCategoryDropdownOpen(false);
                              setCategoryInput("");
                            }
                          }
                        }}
                        autoFocus
                      />
                    )}
                    <svg className={`cp-dropdown-arrow ${categoryDropdownOpen ? "open" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" onClick={(e) => { e.stopPropagation(); setCategoryDropdownOpen((prev) => !prev); }}><polyline points="6 9 12 15 18 9" /></svg>
                  </div>
                  {categoryDropdownOpen && (
                    <div className="cp-dropdown-menu" ref={catListRef}>
                      {existingCategories
                        .filter((c) => !categoriesList.includes(c))
                        .filter((c) => !catSearch.trim() || c.toLowerCase().includes(catSearch.toLowerCase()))
                        .map((cat, idx) => (
                        <div key={cat} className={`cp-dropdown-item cp-dropdown-item-row ${catHighlightedIndex === idx ? "cp-dropdown-item--highlighted" : ""}`} onMouseEnter={() => setCatHighlightedIndex(idx)}>
                          <label className="cp-dropdown-item-check">
                            <input
                              type="checkbox"
                              checked={categoriesList.includes(cat)}
                              onChange={() => {
                                if (!categoriesList.includes(cat)) {
                                  markDirty();
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
                            title={t("Delete category", { defaultValue: "Delete category" })}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <div
                        className={`cp-dropdown-item cp-dropdown-custom ${catHighlightedIndex === existingCategories.filter((c) => !categoriesList.includes(c)).filter((c) => !catSearch.trim() || c.toLowerCase().includes(catSearch.toLowerCase())).length ? "cp-dropdown-item--highlighted" : ""}`}
                        onMouseEnter={() => setCatHighlightedIndex(existingCategories.filter((c) => !categoriesList.includes(c)).filter((c) => !catSearch.trim() || c.toLowerCase().includes(catSearch.toLowerCase())).length)}
                        onClick={() => { setCategoryCustomMode(true); setCategoryDropdownOpen(false); setCategoryInput(""); }}
                      >
                        {t("Custom / Type Here", { defaultValue: "Custom / Type Here" })}
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

            {/* TEAMS & MEMBERS */}
            {initialTeamId ? (
              <div className="cp-field">
                <label>{t("Assigned Team", { defaultValue: "Assigned Team" })}</label>
                <div style={{ padding: "12px 16px", borderRadius: "12px", background: "var(--bg-card-alt)", border: "1px solid var(--border-color)", color: "var(--text-heading)", fontWeight: 600, fontSize: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>🔒 {t("Auto-assigned to", { defaultValue: "Auto-assigned to" })} {teams.find(t => Number(t.id) === Number(initialTeamId))?.name || `Team #${initialTeamId}`}</span>
                </div>
              </div>
            ) : (
              <>
                <div className="cp-field">
                  <label>{t("Teams (Optional)", { defaultValue: "Teams (Optional)" })}</label>
                  <div className="cp-dropdown-wrap cp-combo-trigger" ref={teamRolesRef} onClick={() => { if (!teamRolesOpen) { setTeamRolesOpen(true); setTeamRolesSearch(""); } }}>
                    {form.team_ids.length > 0 && (
                      <span className="cp-combo-count">{form.team_ids.length} {t("selected")}</span>
                    )}
                    {form.team_ids.length === 0 && !teamRolesOpen && (
                      <span className="cp-combo-placeholder">{t("Select Teams", { defaultValue: "Select Teams" })}</span>
                    )}
                    {teamRolesOpen && (
                      <input
                        type="text"
                        className="cp-combo-input"
                        placeholder={t("Search by team name...", { defaultValue: "Search by team name..." })}
                        value={teamRolesSearch}
                        onChange={(e) => setTeamRolesSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") { setTeamRolesSearch(""); setTeamRolesOpen(false); }
                          else if (e.key === "ArrowDown") {
                            e.preventDefault();
                            const filteredLen = teams.filter((t) => !teamRolesSearch.trim() || t.name.toLowerCase().includes(teamRolesSearch.toLowerCase())).length;
                            setTeamHighlightedIndex((prev) => (prev < filteredLen - 1 ? prev + 1 : 0));
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            const filteredLen = teams.filter((t) => !teamRolesSearch.trim() || t.name.toLowerCase().includes(teamRolesSearch.toLowerCase())).length;
                            setTeamHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredLen - 1));
                          } else if (e.key === "Enter") {
                            e.preventDefault();
                            const filteredTeams = teams.filter((t) => !teamRolesSearch.trim() || t.name.toLowerCase().includes(teamRolesSearch.toLowerCase()));
                            const team = filteredTeams[teamHighlightedIndex];
                            if (team) {
                              markDirty();
                              setForm((prev) => ({
                                ...prev,
                                team_ids: prev.team_ids.includes(team.id)
                                  ? prev.team_ids.filter((id) => id !== team.id)
                                  : [...prev.team_ids, team.id],
                              }));
                            }
                          }
                        }}
                        autoFocus
                      />
                    )}
                    <svg className={`cp-dropdown-arrow ${teamRolesOpen ? "open" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" onClick={(e) => { e.stopPropagation(); if (teamRolesOpen) { setTeamRolesOpen(false); setTeamRolesSearch(""); } else { setTeamRolesOpen(true); setTeamRolesSearch(""); } }}><polyline points="6 9 12 15 18 9" /></svg>
                    {teamRolesOpen && (
                      <div className="cp-dropdown-menu" ref={teamListRef} onClick={(e) => e.stopPropagation()}>
                        {teams.filter((t) => !teamRolesSearch.trim() || t.name.toLowerCase().includes(teamRolesSearch.toLowerCase())).map((team, idx) => (
                          <label key={team.id} className={`cp-dropdown-item ${teamHighlightedIndex === idx ? "cp-dropdown-item--highlighted" : ""}`} onMouseEnter={() => setTeamHighlightedIndex(idx)}>
                            <input
                              type="checkbox"
                              checked={form.team_ids.includes(team.id)}
                              onChange={() => {
                                markDirty();
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
                  <label>{t("Team Members (Optional)", { defaultValue: "Team Members (Optional)" })}</label>
                  <UserSelectDropdown
                    users={displayUsers}
                    selectedIds={form.assigned_users}
                    onChange={handleAssignedUsersChange}
                    placeholder={t("Click to select members", { defaultValue: "Click to select members" })}
                    viewOnly={!!form.team_id}
                  />
                </div>
              </>
            )}

            <div className="cp-field">
              <label>{t("Guests (Optional)", { defaultValue: "Guests (Optional)" })}</label>
              <UserSelectDropdown
                users={guests}
                selectedIds={form.guest_ids}
                onChange={(ids) => { markDirty(); setForm(prev => ({ ...prev, guest_ids: ids })); }}
                placeholder={t("Click to select guests", { defaultValue: "Click to select guests" })}
              />
            </div>

            <div className="cp-field">
              <label>{t("Followers (Optional)", { defaultValue: "Followers (Optional)" })}</label>
              <UserSelectDropdown
                users={allUsers.filter(u => !form.assigned_users.includes(u.id))}
                selectedIds={form.followers || []}
                onChange={(ids) => { markDirty(); setForm(prev => ({ ...prev, followers: ids })); }}
                placeholder={t("Click to select followers", { defaultValue: "Click to select followers" })}
              />
            </div>

            {/* CLIENT INFO */}
            <div className="cp-card">
              <div className="cp-card-top">
                <span>{t("Client Info", { defaultValue: "Client Info" })}</span>
              </div>
              <div className="cp-field">
                <label style={{ fontSize: "13px" }}>{t("Client Name", { defaultValue: "Client Name" })}</label>
                <input type="text" name="client_name" placeholder={t("Enter client name", { defaultValue: "Enter client name" })} value={form.client_name} onChange={handleChange} />
              </div>
              <div className="cp-field">
                <label style={{ fontSize: "13px" }}>{t("Budget", { defaultValue: "Budget" })}</label>
                <input type="number" name="budget" placeholder={t("Budget amount (PKR)", { defaultValue: "Budget amount (PKR)" })} min="0" step="0.01" value={form.budget} onChange={handleChange} />
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
        title={t("Confirm Deletion", { defaultValue: "Confirm Deletion" })}
        message={t('Are you sure you want to delete "{{cat}}"? This action cannot be undone.', { defaultValue: `Are you sure you want to delete "${pendingCatDelete}"? This action cannot be undone.`, cat: pendingCatDelete })}
        confirmText={t("Delete")}
        cancelText={t("Cancel")}
        danger
      />
      <ConfirmModal
        isOpen={removeConfirmOpen}
        onClose={() => { setRemoveConfirmOpen(false); setPendingRemoveItem({ type: "", index: -1 }); }}
        onConfirm={confirmRemoveItem}
        title={t("Remove Item", { defaultValue: "Remove Item" })}
        message={t("Are you sure you want to remove this item? This action cannot be undone.", { defaultValue: "Are you sure you want to remove this item? This action cannot be undone." })}
        confirmText={t("Remove", { defaultValue: "Remove" })}
        cancelText={t("Cancel")}
        danger
      />

      {/* Edit Link Modal */}
      {editingLink && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 10003, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }} onClick={() => setEditingLink(null)}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: "24px 28px", width: 400, maxWidth: "90vw", boxShadow: "0 25px 60px rgba(0,0,0,0.25)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "var(--text-heading)" }}>{t("Edit File / Link", { defaultValue: "Edit File / Link" })}</h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6b7280" }}>{t("Rename or update the URL below.", { defaultValue: "Rename or update the URL below." })}</p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-dark)", marginBottom: 6 }}>{t("Title", { defaultValue: "Title" })}</label>
              <input
                type="text"
                value={editLinkForm.title}
                onChange={(e) => setEditLinkForm((p) => ({ ...p, title: e.target.value }))}
                style={{ width: "100%", padding: "10px 12px", border: "var(--border-color)", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", color: "var(--text-heading)" }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-dark)", marginBottom: 6 }}>{t("URL", { defaultValue: "URL" })}</label>
              <input
                type="url"
                value={editLinkForm.url}
                onChange={(e) => setEditLinkForm((p) => ({ ...p, url: e.target.value }))}
                style={{ width: "100%", padding: "10px 12px", border: "var(--border-color)", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", color: "var(--text-heading)" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => setEditingLink(null)} style={{ padding: "9px 20px", borderRadius: 8, border: "var(--border-color)", background: "var(--bg-card)", color: "var(--text-dark)", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={(e) => e.target.style.background = "var(--bg-hover)"} onMouseLeave={(e) => e.target.style.background = "var(--bg-card)"}>{t("Cancel")}</button>
              <button type="button" onClick={() => {
                if (editingLink.type === "pending") {
                  setLinks((p) => {
                    const updated = [...p];
                    updated[editingLink.index] = { ...updated[editingLink.index], customName: editLinkForm.title, url: editLinkForm.url };
                    return updated;
                  });
                }
                setEditingLink(null);
              }} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={(e) => e.target.style.background = "var(--color-primary)"} onMouseLeave={(e) => e.target.style.background = "var(--color-primary)"}>{t("Save", { defaultValue: "Save" })}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit File Modal */}
      {editingFile && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 10003, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }} onClick={() => { setEditingFile(null); setEditFileNewFile(null); }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: "24px 28px", width: 420, maxWidth: "90vw", boxShadow: "0 25px 60px rgba(0,0,0,0.25)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "var(--text-heading)" }}>{t("Edit File", { defaultValue: "Edit File" })}</h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6b7280" }}>{t("Rename or replace this file.", { defaultValue: "Rename or replace this file." })}</p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-dark)", marginBottom: 6 }}>{t("Title", { defaultValue: "Title" })}</label>
              <input
                type="text"
                value={editFileForm.title}
                onChange={(e) => setEditFileForm({ title: e.target.value })}
                autoFocus
                style={{ width: "100%", padding: "10px 12px", border: "var(--border-color)", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", color: "var(--text-heading)" }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-dark)", marginBottom: 6 }}>{t("File", { defaultValue: "File" })}</label>
              {editFileNewFile ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)", borderRadius: 8 }}>
                  <span style={{ fontSize: 14 }}>📄</span>
                  <span style={{ flex: 1, fontSize: 13, color: "#166534", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{editFileNewFile.name}</span>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>{(editFileNewFile.size / 1024).toFixed(1)} KB</span>
                  <button type="button" onClick={() => setEditFileNewFile(null)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 14, fontWeight: 700, padding: 0 }}>✕</button>
                </div>
              ) : (
                <label style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", padding: "10px 12px", border: "1px dashed var(--border-color)", borderRadius: 8, background: "var(--bg-hover)", color: "#6b7280", fontSize: 13, cursor: "pointer", textAlign: "center" }}>
                  {t("Click to select a file", { defaultValue: "Click to select a file" })}
                  <input
                    type="file"
                    style={{ display: "none" }}
                    onChange={(e) => { if (e.target.files.length > 0) { const f = e.target.files[0]; setEditFileNewFile(f); if (!editFileForm.title) setEditFileForm({ title: f.name.replace(/\.[^.]+$/, "") }); } e.target.value = ""; }}
                  />
                </label>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => { setEditingFile(null); setEditFileNewFile(null); }} style={{ padding: "9px 20px", borderRadius: 8, border: "var(--border-color)", background: "var(--bg-card)", color: "var(--text-dark)", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={(e) => e.target.style.background = "var(--bg-hover)"} onMouseLeave={(e) => e.target.style.background = "var(--bg-card)"}>{t("Cancel")}</button>
              <button type="button" onClick={() => {
                setPendingFiles((p) => {
                  const updated = [...p];
                  updated[editingFile.index] = { ...updated[editingFile.index], customName: editFileForm.title, ...(editFileNewFile ? { file: editFileNewFile, name: editFileNewFile.name, size: editFileNewFile.size } : {}) };
                  return updated;
                });
                setEditingFile(null);
                setEditFileNewFile(null);
              }} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={(e) => e.target.style.background = "var(--color-primary)"} onMouseLeave={(e) => e.target.style.background = "var(--color-primary)"}>{t("Save", { defaultValue: "Save" })}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {ConfirmDialog}
    </>
  );
};

export default CreateProjectModal;
