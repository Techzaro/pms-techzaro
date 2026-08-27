import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import CustomSelect from "../components/CustomSelect";
import API_URL from "../config/api";
import { authToken, rolePath, getUser } from "../utils/auth";
import { useNotification } from "../context/NotificationContext";
import "./KnowledgeBase.css";
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  Clock,
  History,
  X,
  Plus,
  Paperclip,
  Trash2,
  Pin,
  Globe,
  Lock,
  Users,
  Building,
  RotateCcw,
  ExternalLink,
  Loader2,
} from "lucide-react";

const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ color: [] }, { background: [] }],
    [{ list: "ordered" }, { list: "bullet" }],
    ["blockquote", "code-block"],
    ["link"],
    ["clean"],
  ],
};

const quillFormats = [
  "header",
  "bold",
  "italic",
  "underline",
  "strike",
  "color",
  "background",
  "list",
  "blockquote",
  "code-block",
  "link",
];

export default function KnowledgeBaseEditor() {
  const { t } = useTranslation();
  const { id } = useParams();
  const location = useLocation();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();
  const notify = useNotification();
  const user = getUser();

  const [loading, setLoading] = useState(isEditMode);
  const [savingStatus, setSavingStatus] = useState("saved"); // 'saved' | 'saving' | 'unsaved' | 'error'
  const [lastSavedTime, setLastSavedTime] = useState(null);

  // Document Core Form State
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [visibilityLevel, setVisibilityLevel] = useState("organization");
  const [projectId, setProjectId] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [status, setStatus] = useState("published");
  const [isPinned, setIsPinned] = useState(false);
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [referenceLink, setReferenceLink] = useState("");

  // Inline Category Creation State
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [savingNewCat, setSavingNewCat] = useState(false);

  // Attachment State
  const [file, setFile] = useState(null);
  const [existingFilePath, setExistingFilePath] = useState(null);
  const [existingFileName, setExistingFileName] = useState(null);
  const [deleteExistingFile, setDeleteExistingFile] = useState(false);

  // Dynamic Options (Always fetched from API)
  const [categories, setCategories] = useState([]);
  const [projects, setProjects] = useState([]);
  const [teams, setTeams] = useState([]);
  const [usersList, setUsersList] = useState([]);

  // Version History State
  const [versionsModalOpen, setVersionsModalOpen] = useState(false);
  const [versionsList, setVersionsList] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState(null);

  // Refs for debounced autosave
  const autosaveTimerRef = useRef(null);
  const initialLoadRef = useRef(true);
  const currentDocIdRef = useRef(id || null);

  // 1. Fetch Dynamic Dropdowns (Categories, Projects, Teams, Users)
  useEffect(() => {
    const token = authToken();
    if (!token) return;

    // Categories
    fetch(`${API_URL}/kb-categories`, { headers: { Authorization: `Bearer ${token}` }, skipLoader: true })
      .then((r) => r.json())
      .then((d) => {
        const catData = Array.isArray(d.data) ? d.data : [];
        setCategories(catData);
        if (!isEditMode && catData.length > 0 && !categoryId) {
          setCategoryId(String(catData[0].id));
        }
      })
      .catch(() => {});

    // Projects
    fetch(`${API_URL}/projects`, { headers: { Authorization: `Bearer ${token}` }, skipLoader: true })
      .then((r) => r.json())
      .then((d) => setProjects(Array.isArray(d) ? d : d.data || []))
      .catch(() => {});

    // Teams
    fetch(`${API_URL}/teams`, { headers: { Authorization: `Bearer ${token}` }, skipLoader: true })
      .then((r) => r.json())
      .then((d) => setTeams(Array.isArray(d) ? d : d.data || []))
      .catch(() => {});

    // Users
    fetch(`${API_URL}/users`, { headers: { Authorization: `Bearer ${token}` }, skipLoader: true })
      .then((r) => r.json())
      .then((d) => setUsersList(Array.isArray(d) ? d : d.data || []))
      .catch(() => {});

    // Pre-fill projectId if passed via navigation state
    if (!isEditMode && location.state?.projectId) {
      setProjectId(String(location.state.projectId));
      setVisibilityLevel("project_team");
    }
  }, [isEditMode, location.state]);

  // 2. Fetch Existing Article if Editing
  useEffect(() => {
    if (!isEditMode) {
      initialLoadRef.current = false;
      return;
    }

    const token = authToken();
    setLoading(true);

    fetch(`${API_URL}/knowledge-base/${id}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      skipLoader: true,
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) {
          const item = d.data;
          setTitle(item.title || "");
          setContent(item.content || "");
          setCategoryId(item.category_id ? String(item.category_id) : "");
          setVisibilityLevel(item.visibility_level || "organization");
          setProjectId(item.project_id ? String(item.project_id) : "");
          setStatus(item.status || "published");
          setIsPinned(Boolean(item.is_pinned));
          setTags(Array.isArray(item.tags) ? item.tags : []);
          setExistingFilePath(item.file_path);
          setExistingFileName(item.file_name);
          setReferenceLink(item.reference_link || "");

          // Extract visibilities
          if (Array.isArray(item.visibilities)) {
            const tIds = item.visibilities.filter((v) => v.team_id).map((v) => v.team_id);
            const uIds = item.visibilities.filter((v) => v.user_id).map((v) => v.user_id);
            setSelectedTeamIds(tIds);
            setSelectedUserIds(uIds);
          }

          setSavingStatus("saved");
          setLastSavedTime(new Date());
        } else {
          notify.error(t("Article not found.", { defaultValue: "Article not found." }));
          navigate(rolePath("knowledge-base"));
        }
      })
      .catch(() => {
        notify.error(t("Failed to load article.", { defaultValue: "Failed to load article." }));
      })
      .finally(() => {
        setLoading(false);
        setTimeout(() => {
          initialLoadRef.current = false;
        }, 500);
      });
  }, [id, isEditMode]);

  // Inline Category Creation
  const handleCreateCategory = async (e) => {
    if (e) e.preventDefault();
    if (!newCatName.trim()) return;

    try {
      setSavingNewCat(true);
      const token = authToken();
      const res = await fetch(`${API_URL}/kb-categories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ name: newCatName.trim() }),
      });
      const data = await res.json();
      if (res.ok && (data?.data?.id || data?.category?.id)) {
        const newCat = data.data || data.category;
        setCategories((prev) => [...prev, newCat]);
        setCategoryId(String(newCat.id));
        setNewCatName("");
        setShowNewCatInput(false);
        notify.success(t("Category created successfully", { defaultValue: "Category created successfully" }));
      } else {
        notify.error(data.message || t("Failed to create category", { defaultValue: "Failed to create category" }));
      }
    } catch (err) {
      console.error("Create category error:", err);
      notify.error(t("Network error while creating category", { defaultValue: "Network error while creating category" }));
    } finally {
      setSavingNewCat(false);
    }
  };

  // 3. Save / Update Article Function
  const saveArticle = useCallback(
    async (isManual = false, overrideStatus = null) => {
      if (!title.trim()) {
        if (isManual) notify.error(t("Document title is required.", { defaultValue: "Document title is required." }));
        return;
      }

      setSavingStatus("saving");
      try {
        const token = authToken();
        const fd = new FormData();
        fd.append("title", title.trim());
        fd.append("content", content || "");
        if (categoryId) fd.append("category_id", categoryId);
        fd.append("visibility_level", visibilityLevel);
        if (projectId) fd.append("project_id", projectId);
        fd.append("status", overrideStatus || status);
        fd.append("is_pinned", isPinned ? "1" : "0");
        fd.append("tags", JSON.stringify(tags));
        if (referenceLink) {
          fd.append("reference_link", referenceLink.trim());
        }

        if (selectedTeamIds.length > 0) {
          fd.append("team_ids", JSON.stringify(selectedTeamIds));
        }
        if (selectedUserIds.length > 0) {
          fd.append("user_ids", JSON.stringify(selectedUserIds));
        }

        if (deleteExistingFile) {
          fd.append("delete_file", "1");
        }
        if (file) {
          fd.append("file", file);
        }

        const activeId = currentDocIdRef.current;
        const url = activeId ? `${API_URL}/knowledge-base/${activeId}` : `${API_URL}/knowledge-base`;
        if (activeId) {
          fd.append("_method", "PUT");
        }

        const res = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          body: fd,
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setSavingStatus("saved");
          setLastSavedTime(new Date());

          if (!activeId && data.data?.id) {
            currentDocIdRef.current = data.data.id;
            // Update URL without full reload
            window.history.replaceState(null, "", rolePath(`knowledge-base/edit/${data.data.id}`));
          }

          if (data.data?.file_path) {
            setExistingFilePath(data.data.file_path);
            setExistingFileName(data.data.file_name);
            setFile(null);
            setDeleteExistingFile(false);
          }

          if (isManual) {
            notify.success(activeId ? t("Article updated successfully!", { defaultValue: "Article updated successfully!" }) : t("Article created successfully!", { defaultValue: "Article created successfully!" }));
          }
        } else {
          setSavingStatus("error");
          if (isManual) notify.error(data.message || t("Failed to save article.", { defaultValue: "Failed to save article." }));
        }
      } catch (e) {
        setSavingStatus("error");
        if (isManual) notify.error(t("An error occurred while saving.", { defaultValue: "An error occurred while saving." }));
      }
    },
    [title, content, categoryId, visibilityLevel, projectId, status, isPinned, tags, selectedTeamIds, selectedUserIds, deleteExistingFile, file]
  );

  // 4. Debounced Autosave (Triggers 2s after typing stops if document exists)
  useEffect(() => {
    if (initialLoadRef.current) return;
    if (!title.trim()) return;

    setSavingStatus("unsaved");

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      if (currentDocIdRef.current) {
        saveArticle(false);
      }
    }, 2000);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [title, content, categoryId, visibilityLevel, projectId, isPinned, tags, saveArticle]);

  // 5. Version History Fetching
  const fetchVersions = async () => {
    const activeId = currentDocIdRef.current;
    if (!activeId) return;

    setLoadingVersions(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/knowledge-base/${activeId}/versions`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        skipLoader: true,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setVersionsList(Array.isArray(data.data) ? data.data : []);
      }
    } catch (e) {
      notify.error(t("Failed to load versions history.", { defaultValue: "Failed to load versions history." }));
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleRestoreVersion = async (vId) => {
    const activeId = currentDocIdRef.current;
    if (!activeId) return;

    setRestoringVersionId(vId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/knowledge-base/${activeId}/versions/${vId}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify.success(t("Version restored successfully!", { defaultValue: "Version restored successfully!" }));
        if (data.data) {
          setTitle(data.data.title || "");
          setContent(data.data.content || "");
        }
        setVersionsModalOpen(false);
        setSavingStatus("saved");
      } else {
        notify.error(data.message || t("Failed to restore version.", { defaultValue: "Failed to restore version." }));
      }
    } catch (e) {
      notify.error(t("Error restoring version.", { defaultValue: "Error restoring version." }));
    } finally {
      setRestoringVersionId(null);
    }
  };

  // Tag Handlers
  const handleAddTag = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const trimmed = tagInput.trim().replace(/^#/, "");
      if (trimmed && !tags.includes(trimmed)) {
        setTags([...tags, trimmed]);
      }
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter((tItem) => tItem !== tagToRemove));
  };

  const categoryOptions = categories.map((c) => ({
    value: String(c.id),
    label: c.name,
  }));

  const visibilityOptions = [
    { value: "organization", label: t("Organization (Everyone in Company)", { defaultValue: "Organization (Everyone in Company)" }) },
    { value: "department_team", label: t("Department Team (My Department)", { defaultValue: "Department Team (My Department)" }) },
    { value: "project_team", label: t("Project Team (Target Project Members)", { defaultValue: "Project Team (Target Project Members)" }) },
    { value: "team", label: t("Team (Specific Team Members)", { defaultValue: "Team (Specific Team Members)" }) },
    { value: "custom", label: t("Custom (Select Specific Users & Teams)", { defaultValue: "Custom (Select Specific Users & Teams)" }) },
    { value: "private", label: t("Private (Only Me)", { defaultValue: "Private (Only Me)" }) },
  ];

  const projectOptions = [
    { value: "", label: t("Select Target Project...", { defaultValue: "Select Target Project..." }) },
    ...projects.map((p) => ({ value: String(p.id), label: p.title })),
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ textAlign: "center", padding: "100px 0", color: "var(--text-secondary)" }}>
          <Loader2 className="animate-spin" size={36} style={{ margin: "0 auto 12px" }} />
          {t("Loading document editor...", { defaultValue: "Loading document editor..." })}
        </div>
      </DashboardLayout>
    );
  }

  const breadcrumbs = [
    { label: t("Knowledge Base", { defaultValue: "Knowledge Base" }), path: rolePath("knowledge-base") },
    { label: isEditMode ? t("Edit Document", { defaultValue: "Edit Document" }) : t("New Document", { defaultValue: "New Document" }) },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />

      <div className="kb-editor-wrapper">
        {/* TOP BAR: AUTOSAVE INDICATOR & ACTIONS */}
        <div className="kb-editor-header">
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <button
              onClick={() => navigate(rolePath("knowledge-base"))}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: "13px", fontWeight: 600 }}
            >
              <ArrowLeft size={16} /> {t("Back to List", { defaultValue: "Back to List" })}
            </button>

            <span style={{ width: "1px", height: "18px", background: "var(--border-color)" }} />

            {/* REAL-TIME AUTOSAVE STATUS INDICATOR */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-muted)" }}>
              {savingStatus === "saving" && (
                <>
                  <Loader2 className="animate-spin" size={14} color="#2563eb" />
                  <span style={{ color: "#2563eb", fontWeight: 500 }}>{t("Saving...", { defaultValue: "Saving..." })}</span>
                </>
              )}
              {savingStatus === "saved" && (
                <>
                  <CheckCircle2 size={14} color="#10b981" />
                  <span style={{ color: "#10b981", fontWeight: 500 }}>
                    {lastSavedTime ? t("Saved at {{time}}", { time: lastSavedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), defaultValue: `Saved at ${lastSavedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` }) : t("All changes saved", { defaultValue: "All changes saved" })}
                  </span>
                </>
              )}
              {savingStatus === "unsaved" && (
                <>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f59e0b" }} />
                  <span style={{ color: "#d97706" }}>{t("Unsaved changes...", { defaultValue: "Unsaved changes..." })}</span>
                </>
              )}
              {savingStatus === "error" && (
                <span style={{ color: "#ef4444", fontWeight: 600 }}>{t("Failed to autosave", { defaultValue: "Failed to autosave" })}</span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* VERSIONS BUTTON */}
            {isEditMode && (
              <button
                type="button"
                onClick={() => {
                  setVersionsModalOpen(true);
                  fetchVersions();
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-hover)",
                  color: "var(--text-primary)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <History size={14} /> {t("Version History", { defaultValue: "Version History" })}
              </button>
            )}

            {/* STATUS SELECTOR */}
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-card)",
                fontSize: "12px",
                fontWeight: 600,
                color: status === "published" ? "#10b981" : "#f59e0b",
              }}
            >
              <option value="published">{t("Status: Published", { defaultValue: "Status: Published" })}</option>
              <option value="draft">{t("Status: Draft", { defaultValue: "Status: Draft" })}</option>
              <option value="archived">{t("Status: Archived", { defaultValue: "Status: Archived" })}</option>
            </select>

            {/* MANUAL SAVE & PUBLISH BUTTON */}
            <button
              type="button"
              onClick={() => saveArticle(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 16px",
                borderRadius: "6px",
                background: "#2563eb",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              <Save size={14} /> {isEditMode ? t("Save Changes", { defaultValue: "Save Changes" }) : t("Publish Document", { defaultValue: "Publish Document" })}
            </button>
          </div>
        </div>

        {/* EDITOR MAIN WORKSPACE */}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* CORE CANVAS (TITLE & RICH TEXT) */}
          <div className="kb-editor-canvas">
            <input
              type="text"
              className="kb-editor-title-input"
              placeholder={t("Untitled Document...", { defaultValue: "Untitled Document..." })}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />

            <ReactQuill
              theme="snow"
              value={content}
              onChange={setContent}
              modules={quillModules}
              formats={quillFormats}
              placeholder={t("Start writing rich documentation, guidelines, code snippets, or SOPs...", { defaultValue: "Start writing rich documentation, guidelines, code snippets, or SOPs..." })}
            />
          </div>

          {/* RIGHT SETTINGS SIDEBAR */}
          <div style={{ width: "300px", borderLeft: "1px solid var(--border-color)", padding: "24px 20px", display: "flex", flexDirection: "column", gap: "20px", background: "var(--bg-card)" }}>
            <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.5px" }}>
              {t("Document Settings", { defaultValue: "Document Settings" })}
            </h4>

            {/* CATEGORY (Dynamic from API) */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, margin: 0 }}>
                  {t("Category", { defaultValue: "Category" })} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowNewCatInput((prev) => !prev)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#2563eb",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "2px",
                  }}
                >
                  <Plus size={12} /> {showNewCatInput ? t("Cancel", { defaultValue: "Cancel" }) : t("Add New", { defaultValue: "Add New" })}
                </button>
              </div>

              {showNewCatInput && (
                <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                  <input
                    type="text"
                    placeholder={t("New category name...", { defaultValue: "New category name..." })}
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid var(--border-color)",
                      fontSize: "12px",
                      background: "var(--bg-card)",
                      color: "var(--text-primary)",
                      outline: "none",
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateCategory(e);
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleCreateCategory}
                    disabled={savingNewCat || !newCatName.trim()}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "6px",
                      background: "#2563eb",
                      color: "#fff",
                      border: "none",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: savingNewCat || !newCatName.trim() ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {savingNewCat ? "..." : t("Save", { defaultValue: "Save" })}
                  </button>
                </div>
              )}

              <CustomSelect
                name="category_id"
                value={categoryId}
                onChange={(val) => setCategoryId(val)}
                options={categoryOptions}
              />
            </div>

            {/* VISIBILITY LEVEL */}
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                {t("Visibility Setting", { defaultValue: "Visibility Setting" })} <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <CustomSelect
                name="visibility_level"
                value={visibilityLevel}
                onChange={(val) => setVisibilityLevel(val)}
                options={visibilityOptions}
              />
            </div>

            {/* DYNAMIC SECONDARY: TARGET PROJECT */}
            {visibilityLevel === "project_team" && (
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                  {t("Target Project", { defaultValue: "Target Project" })} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <CustomSelect
                  name="project_id"
                  value={projectId}
                  onChange={(val) => setProjectId(val)}
                  options={projectOptions}
                />
              </div>
            )}

            {/* DYNAMIC SECONDARY: TARGET TEAM */}
            {visibilityLevel === "team" && (
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                  {t("Target Team", { defaultValue: "Target Team" })} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <select
                  value={selectedTeamIds[0] || ""}
                  onChange={(e) => setSelectedTeamIds(e.target.value ? [Number(e.target.value)] : [])}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px", color: "var(--text-primary)" }}
                >
                  <option value="">{t("Select Team...", { defaultValue: "Select Team..." })}</option>
                  {teams.map((tItem) => (
                    <option key={tItem.id} value={tItem.id}>{tItem.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* DYNAMIC SECONDARY: CUSTOM (TEAMS & USERS) */}
            {visibilityLevel === "custom" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    {t("Visible Teams", { defaultValue: "Visible Teams" })}
                  </label>
                  <select
                    multiple
                    value={selectedTeamIds.map(String)}
                    onChange={(e) => {
                      const vals = Array.from(e.target.selectedOptions, (op) => Number(op.value));
                      setSelectedTeamIds(vals);
                    }}
                    style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px", height: "80px" }}
                  >
                    {teams.map((tItem) => (
                      <option key={tItem.id} value={tItem.id}>{tItem.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    {t("Visible Users", { defaultValue: "Visible Users" })}
                  </label>
                  <select
                    multiple
                    value={selectedUserIds.map(String)}
                    onChange={(e) => {
                      const vals = Array.from(e.target.selectedOptions, (op) => Number(op.value));
                      setSelectedUserIds(vals);
                    }}
                    style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px", height: "80px" }}
                  >
                    {usersList.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* TAGS INPUT */}
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>{t("Tags", { defaultValue: "Tags" })}</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "6px 8px", border: "1px solid var(--border-color)", borderRadius: "6px", background: "var(--bg-card)" }}>
                {tags.map((tag) => (
                  <span key={tag} className="kb-tag-pill" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    #{tag}
                    <button type="button" onClick={() => handleRemoveTag(tag)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 0 }}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  placeholder={t("Type tag & press Enter...", { defaultValue: "Type tag & press Enter..." })}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  style={{ border: "none", outline: "none", fontSize: "12px", background: "transparent", color: "var(--text-primary)", flex: 1, minWidth: "80px" }}
                />
              </div>
            </div>

            {/* PIN TO TOP CHECKBOX */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="checkbox"
                id="pinDoc"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                style={{ width: "16px", height: "16px", cursor: "pointer" }}
              />
              <label htmlFor="pinDoc" style={{ fontSize: "13px", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                <Pin size={14} color="#f59e0b" /> {t("Pin to Top of Category", { defaultValue: "Pin to Top of Category" })}
              </label>
            </div>

            {/* FILE ATTACHMENT */}
            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "16px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                {t("Attachment File", { defaultValue: "Attachment File" })}
              </label>
              {file || (existingFilePath && !deleteExistingFile) ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "var(--bg-hover)", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                  <span style={{ fontSize: "12px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "160px" }}>
                    {file ? file.name : (existingFileName || existingFilePath.split("/").pop())}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      if (existingFilePath) setDeleteExistingFile(true);
                    }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : (
                <input
                  type="file"
                  onChange={(e) => {
                    if (e.target.files[0]) {
                      setFile(e.target.files[0]);
                      setDeleteExistingFile(false);
                    }
                  }}
                  style={{ fontSize: "12px", width: "100%" }}
                />
              )}
            </div>

            {/* REFERENCE / EXTERNAL LINK */}
            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "16px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <ExternalLink size={13} color="#2563eb" /> {t("Reference / External Link", { defaultValue: "Reference / External Link" })}
              </label>
              <input
                type="url"
                placeholder="https://docs.google.com/..."
                value={referenceLink}
                onChange={(e) => setReferenceLink(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-card)",
                  color: "var(--text-primary)",
                  fontSize: "12px",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "4px" }}>
                {t("External specs, shared documents, or Figma links.", { defaultValue: "External specs, shared documents, or Figma links." })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* VERSION HISTORY MODAL */}
      {versionsModalOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: "12px", width: "100%", maxWidth: "600px", maxHeight: "85vh", display: "flex", flexDirection: "column", border: "1px solid var(--border-color)", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                <History size={18} color="#2563eb" /> {t("Document Version History", { defaultValue: "Document Version History" })}
              </h3>
              <button onClick={() => setVersionsModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
              {loadingVersions ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-secondary)" }}>
                  {t("Loading version logs...", { defaultValue: "Loading version logs..." })}
                </div>
              ) : versionsList.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-secondary)" }}>
                  {t("No historical versions found for this article.", { defaultValue: "No historical versions found for this article." })}
                </div>
              ) : (
                versionsList.map((ver) => (
                  <div
                    key={ver.id}
                    style={{
                      padding: "14px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      background: "var(--bg-hover)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: "4px" }}>
                          {t("Version {{number}}", { number: ver.version_number, defaultValue: `Version ${ver.version_number}` })}
                        </span>
                        <span style={{ fontSize: "13px", fontWeight: 600 }}>{ver.title}</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                        {t("Saved by {{user}} on {{time}}", { user: ver.creator?.name || t("User", { defaultValue: "User" }), time: new Date(ver.created_at).toLocaleString(), defaultValue: `Saved by ${ver.creator?.name || "User"} on ${new Date(ver.created_at).toLocaleString()}` })}
                        {ver.change_summary && <span> &bull; {ver.change_summary}</span>}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={restoringVersionId === ver.id}
                      onClick={() => handleRestoreVersion(ver.id)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: "1px solid #bfdbfe",
                        background: "#eff6ff",
                        color: "#1d4ed8",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: restoringVersionId === ver.id ? "not-allowed" : "pointer",
                      }}
                    >
                      <RotateCcw size={13} /> {restoringVersionId === ver.id ? t("Restoring...", { defaultValue: "Restoring..." }) : t("Restore", { defaultValue: "Restore" })}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setVersionsModalOpen(false)}
                style={{ padding: "7px 16px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-hover)", color: "var(--text-primary)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              >
                {t("Close", { defaultValue: "Close" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
