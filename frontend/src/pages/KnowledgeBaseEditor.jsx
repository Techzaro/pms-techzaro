import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import CreatableSelect from "react-select/creatable";
import DOMPurify from "dompurify";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import CustomSelect from "../components/CustomSelect";
import ConfirmModal from "../components/ConfirmModal";
import ShareKnowledgeModal from "../components/ShareKnowledgeModal";
import UnifiedActivityFeed from "../components/UnifiedActivityFeed";
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
  Activity,
  Printer,
  Undo2,
  Redo2,
  Paintbrush,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Palette,
  Pipette,
  Download,
  Eye,
  Edit,
  BookOpen,
  Star,
  Copy,
  Archive,
  Share2,
} from "lucide-react";

// Register Font Whitelist for Quill
const Quill = ReactQuill?.Quill;
if (Quill) {
  const Font = Quill.import("formats/font");
  Font.whitelist = ["arial", "courier", "garamond", "tahoma", "times-new-roman", "verdana"];
  Quill.register(Font, true);
}

const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, 4, 5, 6, false] }],
    [{ font: ["arial", "courier", "garamond", "tahoma", "times-new-roman", "verdana"] }, { size: ["small", false, "large", "huge"] }],
    ["bold", "italic", "underline", "strike"],
    [{ color: [] }, { background: [] }],
    [{ script: "sub" }, { script: "super" }],
    [{ align: [] }],
    [{ list: "ordered" }, { list: "bullet" }, { list: "check" }],
    [{ indent: "-1" }, { indent: "+1" }],
    ["blockquote", "code-block"],
    ["link", "image", "video"],
    ["clean"],
  ],
  history: {
    delay: 500,
    maxStack: 100,
    userOnly: true,
  },
};

const quillFormats = [
  "header",
  "font",
  "size",
  "bold",
  "italic",
  "underline",
  "strike",
  "color",
  "background",
  "script",
  "align",
  "list",
  "indent",
  "blockquote",
  "code-block",
  "link",
  "image",
  "video",
];

export default function KnowledgeBaseEditor() {
  const { t } = useTranslation();
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const notify = useNotification();
  const user = getUser();
  const quillRef = useRef(null);
  const textColorInputRef = useRef(null);
  const textBgInputRef = useRef(null);

  const isEditRoute = Boolean(id) && (location.pathname.includes("/edit/") || location.pathname.endsWith("/edit"));
  const isViewMode = Boolean(id) && !isEditRoute;
  const isEditMode = Boolean(id) && isEditRoute;

  const [loading, setLoading] = useState(Boolean(id));
  const [savingStatus, setSavingStatus] = useState("saved"); // 'saved' | 'saving' | 'unsaved' | 'error'
  const [lastSavedTime, setLastSavedTime] = useState(null);

  // Active tab: 'editor' / 'details' | 'activity'
  const [activeTab, setActiveTab] = useState(isViewMode ? "details" : "editor");

  // Advanced Editor Tools State
  const [zoomLevel, setZoomLevel] = useState(100);
  const [copiedFormat, setCopiedFormat] = useState(null);
  const [customTextColor, setCustomTextColor] = useState("#000000");
  const [customBgColor, setCustomBgColor] = useState("#ffff00");

  // Document Core Form State
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selectedCategoryOption, setSelectedCategoryOption] = useState(null);
  const categoryId = selectedCategoryOption ? selectedCategoryOption.value : "";
  const [visibilityLevel, setVisibilityLevel] = useState("organization");
  const [projectId, setProjectId] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [status, setStatus] = useState("published");
  const [isPinned, setIsPinned] = useState(false);
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [referenceLink, setReferenceLink] = useState("");
  const [rawArticle, setRawArticle] = useState(null);

  // Category Creation Loading State
  const [savingNewCat, setSavingNewCat] = useState(false);

  // Actions & Favorites State
  const [isFavorited, setIsFavorited] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Attachment State
  const [file, setFile] = useState(null);
  const [existingFilePath, setExistingFilePath] = useState(null);
  const [existingFileName, setExistingFileName] = useState(null);
  const [deleteExistingFile, setDeleteExistingFile] = useState(false);
  const [downloadingAttachment, setDownloadingAttachment] = useState(false);

  const handleDownloadAttachment = async () => {
    if (!id && !existingFilePath) return;
    try {
      setDownloadingAttachment(true);
      const token = authToken();
      const endpoint = id
        ? `${API_URL}/knowledge-base/${id}/download`
        : `${API_URL}/storage/${existingFilePath}`;

      const res = await fetch(endpoint, {
        headers: {
          Accept: "application/json, */*",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        skipLoader: true,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        notify.error(err?.message || t("Failed to download attachment.", { defaultValue: "Failed to download attachment." }));
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = existingFileName || (existingFilePath ? existingFilePath.split("/").pop() : "document-attachment");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      notify.success(t("Download completed.", { defaultValue: "Download completed." }));
    } catch (e) {
      console.error("Download failed", e);
      notify.error(t("Download failed.", { defaultValue: "Download failed." }));
    } finally {
      setDownloadingAttachment(false);
    }
  };

  // Dynamic Options (Always fetched from API, strictly initial [])
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
        const catData = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
        setCategories(catData);
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
      .then((d) => setUsersList(Array.isArray(d) ? d : d.data || d.users || []))
      .catch(() => {});

    // Pre-fill projectId if passed via navigation state
    if (location.state?.projectId) {
      setProjectId(String(location.state.projectId));
    }
  }, [location.state]);

  // 2. Fetch Document Data if editing or viewing
  useEffect(() => {
    if (!id) {
      setLoading(false);
      initialLoadRef.current = false;
      return;
    }

    const token = authToken();
    if (!token) return;

    setLoading(true);
    fetch(`${API_URL}/knowledge-base/${id}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
      .then((r) => r.json())
      .then((res) => {
        const data = res?.data || res?.article || res;
        if (data && data.id) {
          setRawArticle(data);
          setTitle(data.title || "");
          setContent(data.content || "");
          if (data.category_id || data.category) {
            const catIdVal = String(data.category_id || data.category);
            const catName = data.categoryRelation?.name || data.category_name || catIdVal;
            setSelectedCategoryOption({ value: catIdVal, label: catName });
          }
          setVisibilityLevel(data.visibility_level || "organization");
          setProjectId(data.project_id ? String(data.project_id) : "");
          setSelectedTeamIds(Array.isArray(data.team_ids) ? data.team_ids : []);
          setSelectedUserIds(Array.isArray(data.user_ids) ? data.user_ids : []);
          setStatus(data.status || "published");
          setIsPinned(Boolean(data.is_pinned));
          setIsFavorited(Boolean(data.is_favorited));
          setTags(Array.isArray(data.tags) ? data.tags : typeof data.tags === "string" ? JSON.parse(data.tags || "[]") : []);
          setReferenceLink(data.reference_link || "");
          setExistingFilePath(data.file_path || null);
          setExistingFileName(data.file_name || null);
          currentDocIdRef.current = data.id;
          setSavingStatus("saved");
          setLastSavedTime(new Date());
        } else {
          notify.error(t("Document not found.", { defaultValue: "Document not found." }));
          navigate(rolePath("knowledge-base"));
        }
      })
      .catch((err) => {
        console.error("Error loading article:", err);
        notify.error(t("Failed to load knowledge base document.", { defaultValue: "Failed to load knowledge base document." }));
      })
      .finally(() => {
        setLoading(false);
        setTimeout(() => {
          initialLoadRef.current = false;
        }, 500);
      });
  }, [id]);

  // Resolve pending category stub once categories load
  useEffect(() => {
    if (!selectedCategoryOption?.__pending || categories.length === 0) return;
    const match = categories.find((c) => String(c.id) === selectedCategoryOption.value);
    if (match) {
      setSelectedCategoryOption({ value: String(match.id), label: match.name });
    }
  }, [categories, selectedCategoryOption]);

  // Category Creation (via CreatableSelect)
  const handleCreateCategory = async (inputValue) => {
    const name = (inputValue || "").trim();
    if (!name) return;

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
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok && (data?.data?.id || data?.category?.id)) {
        const newCat = data.data || data.category;
        setCategories((prev) => [...prev, newCat]);
        setSelectedCategoryOption({ value: String(newCat.id), label: newCat.name });
        notify.success(t("Category created successfully", { defaultValue: "Category created successfully" }));
      } else {
        notify.error(data?.message || t("Failed to create category", { defaultValue: "Failed to create category" }));
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
        if (selectedCategoryOption?.value || categoryId) {
          const numCat = Number(selectedCategoryOption?.value || categoryId);
          if (!isNaN(numCat) && numCat > 0) {
            fd.append("category_id", String(numCat));
          }
        }
        fd.append("visibility_level", visibilityLevel);
        if (projectId) fd.append("project_id", projectId);
        fd.append("status", overrideStatus || status);
        fd.append("is_pinned", isPinned ? "1" : "0");

        // Format tags, team_ids, and user_ids as PHP-compatible FormData arrays to satisfy Laravel validator
        if (Array.isArray(tags) && tags.length > 0) {
          tags.forEach((tag) => {
            if (tag) fd.append("tags[]", tag);
          });
        }
        if (referenceLink) {
          fd.append("reference_link", referenceLink.trim());
        }

        if (Array.isArray(selectedTeamIds) && selectedTeamIds.length > 0) {
          selectedTeamIds.forEach((tId) => {
            if (tId) fd.append("team_ids[]", tId);
          });
        }
        if (Array.isArray(selectedUserIds) && selectedUserIds.length > 0) {
          selectedUserIds.forEach((uId) => {
            if (uId) fd.append("user_ids[]", uId);
          });
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

          const savedDocId = data.data?.id || activeId;
          const finalStatus = overrideStatus || status;
          const actionType = isManual
            ? (finalStatus === "published" ? (activeId ? "Edited" : "Published") : "Edited")
            : "Edited";

          // Activity Logging: Knowledge Base Document
          if (isManual) {
            fetch(`${API_URL}/activity-logs`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                module: "knowledge_base",
                action: actionType,
                entity_id: savedDocId ? Number(savedDocId) : null,
                entity_type: "knowledge_base",
                title: `${actionType} Document: ${title.trim()}`,
                description: `<p>Document <strong>${title.trim()}</strong> was ${actionType.toLowerCase()} by <strong>${user?.name || "User"}</strong></p>`,
              }),
            }).catch(() => {});
          }

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

        // Activity Logging: Version Restored
        fetch(`${API_URL}/activity-logs`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            module: "knowledge_base",
            action: "Edited",
            entity_id: Number(activeId),
            entity_type: "knowledge_base",
            title: `Restored Version: ${data.data?.title || title || "Document"}`,
            description: `<p>Document version restored by <strong>${user?.name || "User"}</strong></p>`,
          }),
        }).catch(() => {});
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

  // Editor Actions (Undo, Redo, Print, Format Painter)
  const handleUndo = () => {
    const editor = quillRef.current?.getEditor();
    if (editor?.history) editor.history.undo();
  };

  const handleRedo = () => {
    const editor = quillRef.current?.getEditor();
    if (editor?.history) editor.history.redo();
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>${title || "Document"}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #0f172a; line-height: 1.6; }
            h1 { margin-bottom: 20px; font-size: 24px; }
            img { max-width: 100%; height: auto; }
            pre { background: #f1f5f9; padding: 12px; border-radius: 6px; }
          </style>
        </head>
        <body>
          <h1>${title || "Untitled Document"}</h1>
          <div>${content || ""}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const handleFormatPainter = () => {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;
    const range = editor.getSelection();
    if (range && range.length > 0) {
      if (!copiedFormat) {
        const format = editor.getFormat(range);
        setCopiedFormat(format);
        notify.info(t("Format copied! Select target text and click Format Painter again to apply.", { defaultValue: "Format copied! Select target text and click Format Painter again to apply." }));
      } else {
        Object.keys(copiedFormat).forEach((key) => {
          editor.format(key, copiedFormat[key]);
        });
        setCopiedFormat(null);
        notify.success(t("Format applied!", { defaultValue: "Format applied!" }));
      }
    } else {
      notify.warning(t("Please select text to copy or apply format.", { defaultValue: "Please select text to copy or apply format." }));
    }
  };

  const applyCustomColor = (type, colorValue) => {
    const editor = quillRef.current?.getEditor();
    if (editor) {
      editor.format(type, colorValue);
    }
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
          {t("Loading document...", { defaultValue: "Loading document..." })}
        </div>
      </DashboardLayout>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // VIEW MODE: DEDICATED READ-ONLY VIEW WITH DETAILS | ACTIVITY TABS
  // ══════════════════════════════════════════════════════════════
  if (isViewMode) {
    const canEdit =
      rawArticle?.user_permissions?.can_edit ??
      (rawArticle?.created_by === user?.id || ["admin", "manager"].includes(user?.role));
    const canArchive = rawArticle?.user_permissions?.can_archive ?? canEdit;
    const canRestore = rawArticle?.user_permissions?.can_restore ?? canEdit;
    const canDuplicate = rawArticle?.user_permissions?.can_duplicate ?? user?.role !== "guest";
    const canShare = rawArticle?.user_permissions?.can_share ?? true;
    const categoryName = rawArticle?.categoryRelation?.name || rawArticle?.category || "";

    const handleToggleFavoriteInView = async () => {
      try {
        const token = authToken();
        setIsFavorited((prev) => !prev);
        const res = await fetch(`${API_URL}/knowledge-base/${id}/favorite`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        const data = await res.json();
        if (res.ok && data.success) {
          notify.success(
            data.is_favorited
              ? t("Added to favorites!", { defaultValue: "Added to favorites!" })
              : t("Removed from favorites.", { defaultValue: "Removed from favorites." })
          );
        } else {
          setIsFavorited((prev) => !prev);
          notify.error(data.message || t("Failed to update favorite status.", { defaultValue: "Failed to update favorite status." }));
        }
      } catch (err) {
        setIsFavorited((prev) => !prev);
        notify.error(t("Error updating favorite status.", { defaultValue: "Error updating favorite status." }));
      }
    };

    const handleDuplicateInView = async () => {
      setActionLoading(true);
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/knowledge-base/${id}/duplicate`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        const data = await res.json();
        if (res.ok && data.success && data.data?.id) {
          notify.success(t("Article duplicated successfully as draft!", { defaultValue: "Article duplicated successfully as draft!" }));
          navigate(rolePath(`knowledge-base/${data.data.id}`));
        } else {
          notify.error(data.message || t("Failed to duplicate article.", { defaultValue: "Failed to duplicate article." }));
        }
      } catch (err) {
        notify.error(t("Error duplicating article.", { defaultValue: "Error duplicating article." }));
      } finally {
        setActionLoading(false);
      }
    };

    const handleArchiveInView = async () => {
      setActionLoading(true);
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/knowledge-base/${id}/archive`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        const data = await res.json();
        if (res.ok && data.success) {
          notify.success(t("Article archived successfully.", { defaultValue: "Article archived successfully." }));
          setStatus("archived");
        } else {
          notify.error(data.message || t("Failed to archive article.", { defaultValue: "Failed to archive article." }));
        }
      } catch (err) {
        notify.error(t("Error archiving article.", { defaultValue: "Error archiving article." }));
      } finally {
        setActionLoading(false);
        setArchiveConfirmOpen(false);
      }
    };

    const handleRestoreInView = async () => {
      setActionLoading(true);
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/knowledge-base/${id}/restore`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        const data = await res.json();
        if (res.ok && data.success) {
          notify.success(t("Article restored successfully.", { defaultValue: "Article restored successfully." }));
          setStatus("published");
        } else {
          notify.error(data.message || t("Failed to restore article.", { defaultValue: "Failed to restore article." }));
        }
      } catch (err) {
        notify.error(t("Error restoring article.", { defaultValue: "Error restoring article." }));
      } finally {
        setActionLoading(false);
        setRestoreConfirmOpen(false);
      }
    };

    return (
      <DashboardLayout>
        <Breadcrumb
          items={[
            { label: t("Knowledge Base", { defaultValue: "Knowledge Base" }), path: rolePath("knowledge-base") },
            { label: title || t("Document Details", { defaultValue: "Document Details" }) },
          ]}
        />

        <div className="kb-editor-wrapper" style={{ paddingBottom: "60px" }}>
          {/* VIEW HEADER */}
          <div className="kb-editor-header">
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => navigate(rolePath("knowledge-base"))}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: "13px", fontWeight: 600 }}
              >
                <ArrowLeft size={16} /> {t("Back to List", { defaultValue: "Back to List" })}
              </button>
              <span style={{ width: "1px", height: "18px", background: "var(--border-color)" }} />
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#2563eb", background: "#eff6ff", padding: "3px 10px", borderRadius: "6px" }}>
                {categoryName}
              </span>
              {isPinned && <span style={{ fontSize: "11px", fontWeight: 600, color: "#d97706", background: "#fef3c7", padding: "3px 10px", borderRadius: "6px", display: "inline-flex", alignItems: "center", gap: "4px" }}><Pin size={11} /> {t("Pinned", { defaultValue: "Pinned" })}</span>}
              {status === "archived" && (
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#dc2626", background: "#fef2f2", padding: "3px 10px", borderRadius: "6px" }}>
                  {t("Archived", { defaultValue: "Archived" })}
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              {/* FAVORITE STAR BUTTON */}
              <button
                type="button"
                className={`kb-fav-star-btn ${isFavorited ? "active" : ""}`}
                onClick={handleToggleFavoriteInView}
                title={isFavorited ? t("Remove from favorites", { defaultValue: "Remove from favorites" }) : t("Add to favorites", { defaultValue: "Add to favorites" })}
                style={{ padding: "6px" }}
              >
                <Star size={18} />
              </button>

              {/* DUPLICATE BUTTON */}
              {canDuplicate && (
                <button
                  type="button"
                  onClick={handleDuplicateInView}
                  disabled={actionLoading}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-hover)", color: "var(--text-primary)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                  title={t("Duplicate Article", { defaultValue: "Duplicate Article" })}
                >
                  <Copy size={14} color="#6366f1" /> {t("Duplicate", { defaultValue: "Duplicate" })}
                </button>
              )}

              {/* SHARE BUTTON */}
              {canShare && (
                <button
                  type="button"
                  onClick={() => setShareModalOpen(true)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-hover)", color: "var(--text-primary)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                  title={t("Share Article Internally", { defaultValue: "Share Article Internally" })}
                >
                  <Share2 size={14} color="#2563eb" /> {t("Share", { defaultValue: "Share" })}
                </button>
              )}

              {/* ARCHIVE / RESTORE BUTTON */}
              {status !== "archived" && canArchive && (
                <button
                  type="button"
                  onClick={() => setArchiveConfirmOpen(true)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-hover)", color: "var(--text-primary)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                  title={t("Archive Article", { defaultValue: "Archive Article" })}
                >
                  <Archive size={14} color="#d97706" /> {t("Archive", { defaultValue: "Archive" })}
                </button>
              )}
              {status === "archived" && canRestore && (
                <button
                  type="button"
                  onClick={() => setRestoreConfirmOpen(true)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 12px", borderRadius: "6px", border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#15803d", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                  title={t("Restore Article", { defaultValue: "Restore Article" })}
                >
                  <RotateCcw size={14} color="#16a34a" /> {t("Restore", { defaultValue: "Restore" })}
                </button>
              )}

              {/* PRINT BUTTON */}
              <button
                type="button"
                onClick={handlePrint}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-hover)", color: "var(--text-primary)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
              >
                <Printer size={14} /> {t("Print", { defaultValue: "Print" })}
              </button>

              {/* EDIT BUTTON */}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => navigate(rolePath(`knowledge-base/edit/${id}`))}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 16px", borderRadius: "6px", border: "none", background: "#2563eb", color: "#ffffff", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                >
                  <Edit size={14} /> {t("Edit Document", { defaultValue: "Edit Document" })}
                </button>
              )}
            </div>
          </div>

          {/* SHARE MODAL IN VIEW */}
          <ShareKnowledgeModal
            isOpen={shareModalOpen}
            onClose={() => setShareModalOpen(false)}
            article={rawArticle || { id, title, category: categoryName }}
          />

          {/* ARCHIVE CONFIRMATION MODAL IN VIEW */}
          <ConfirmModal
            isOpen={archiveConfirmOpen}
            onClose={() => setArchiveConfirmOpen(false)}
            onConfirm={handleArchiveInView}
            title={t("Archive Knowledge Article", { defaultValue: "Archive Knowledge Article" })}
            message={t("Are you sure you want to archive this article? It will be hidden from the active list.", { defaultValue: "Are you sure you want to archive this article? It will be hidden from the active list." })}
            confirmText={t("Archive", { defaultValue: "Archive" })}
            cancelText={t("Cancel", { defaultValue: "Cancel" })}
          />

          {/* RESTORE CONFIRMATION MODAL IN VIEW */}
          <ConfirmModal
            isOpen={restoreConfirmOpen}
            onClose={() => setRestoreConfirmOpen(false)}
            onConfirm={handleRestoreInView}
            title={t("Restore Knowledge Article", { defaultValue: "Restore Knowledge Article" })}
            message={t("Restore this article back to published status?", { defaultValue: "Restore this article back to published status?" })}
            confirmText={t("Restore", { defaultValue: "Restore" })}
            cancelText={t("Cancel", { defaultValue: "Cancel" })}
          />

          {/* VIEW TABS (Details | Activity) */}
          <div style={{ display: "flex", gap: "4px", padding: "0 24px", borderBottom: "1px solid var(--border-color)", background: "var(--bg-card)" }}>
            {[
              { id: "details", label: t("Document Details", { defaultValue: "Document Details" }), icon: <BookOpen size={14} /> },
              { id: "activity", label: t("Activity", { defaultValue: "Activity" }), icon: <Activity size={14} /> },
            ].map(({ id: tabId, label, icon }) => (
              <button
                key={tabId}
                type="button"
                onClick={() => setActiveTab(tabId)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "12px 18px",
                  border: "none",
                  borderBottom: activeTab === tabId ? "2px solid #2563eb" : "2px solid transparent",
                  marginBottom: "-1px",
                  background: "transparent",
                  color: activeTab === tabId ? "#2563eb" : "var(--text-secondary)",
                  fontWeight: activeTab === tabId ? 700 : 500,
                  fontSize: "13px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          {/* TAB 1: DETAILS */}
          {activeTab === "details" && (
            <div style={{ padding: "32px 48px", maxWidth: "900px", margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
              <h1 style={{ fontSize: "28px", fontWeight: 800, margin: "0 0 12px", color: "var(--text-primary)" }}>
                {title || t("Untitled Document", { defaultValue: "Untitled Document" })}
              </h1>

              <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "12px", color: "var(--text-muted)", marginBottom: "28px", paddingBottom: "14px", borderBottom: "1px solid var(--border-color)" }}>
                <span>{t("Author:", { defaultValue: "Author:" })} <strong>{rawArticle?.creator?.name || t("System", { defaultValue: "System" })}</strong></span>
                <span>•</span>
                <span>{t("Updated:", { defaultValue: "Updated:" })} {new Date(rawArticle?.updated_at || rawArticle?.created_at || Date.now()).toLocaleDateString()}</span>
                {rawArticle?.views_count > 0 && (
                  <>
                    <span>•</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><Eye size={13} /> {rawArticle.views_count} {t("views", { defaultValue: "views" })}</span>
                  </>
                )}
              </div>

              {/* RENDERED HTML CONTENT */}
              <div
                className="kb-rendered-html"
                style={{ fontSize: "15px", lineHeight: "1.8", color: "var(--text-primary)", minHeight: "200px" }}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content || `<p><em>${t("No content provided.", { defaultValue: "No content provided." })}</em></p>`) }}
              />

              {/* TAGS */}
              {Array.isArray(tags) && tags.length > 0 && (
                <div style={{ marginTop: "32px", paddingTop: "18px", borderTop: "1px solid var(--border-color)", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {tags.map((tItem, idx) => (
                    <span key={idx} className="kb-tag-pill" style={{ fontSize: "12px", padding: "3px 10px" }}>#{tItem}</span>
                  ))}
                </div>
              )}

              {/* ATTACHMENT DOWNLOAD */}
              {existingFilePath && (
                <div style={{ marginTop: "24px", padding: "14px 18px", background: "var(--bg-hover)", borderRadius: "8px", border: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
                    <Paperclip color="#2563eb" size={18} />
                    <span style={{ fontWeight: 600 }}>{existingFileName || existingFilePath.split("/").pop()}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadAttachment}
                    disabled={downloadingAttachment}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 16px", borderRadius: "6px", background: "#2563eb", color: "#ffffff", fontSize: "12px", fontWeight: 600, border: "none", cursor: downloadingAttachment ? "not-allowed" : "pointer", opacity: downloadingAttachment ? 0.7 : 1 }}
                  >
                    <Download size={14} /> {downloadingAttachment ? t("Downloading...", { defaultValue: "Downloading..." }) : t("Download File", { defaultValue: "Download File" })}
                  </button>
                </div>
              )}

              {/* REFERENCE LINK */}
              {referenceLink && (
                <div style={{ marginTop: "16px", padding: "14px 18px", background: "var(--bg-hover)", borderRadius: "8px", border: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", minWidth: 0, flex: 1, marginRight: "12px" }}>
                    <ExternalLink color="#2563eb" size={18} style={{ flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>{t("Reference Link", { defaultValue: "Reference Link" })}</div>
                      <a href={referenceLink} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 500, wordBreak: "break-all" }}>
                        {referenceLink}
                      </a>
                    </div>
                  </div>
                  <a href={referenceLink} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 16px", borderRadius: "6px", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", fontSize: "12px", fontWeight: 600, textDecoration: "none", flexShrink: 0 }}>
                    {t("Open Link", { defaultValue: "Open Link" })} <ExternalLink size={13} />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ACTIVITY */}
          {activeTab === "activity" && (
            <div style={{ padding: "24px", flex: 1, overflowY: "auto", background: "var(--bg-card)", minHeight: "500px" }}>
              <UnifiedActivityFeed module="knowledge_base" entityId={id} />
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // EDIT / CREATE MODE
  // ══════════════════════════════════════════════════════════════
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

            {/* AUTOSAVE TIMESTAMP INDICATOR NEXT TO PUBLISH BUTTON */}
            {lastSavedTime && (
              <span className="text-muted small me-3" style={{ fontSize: "12px", color: "var(--text-muted)", marginRight: "8px" }}>
                {t("Autosaved at {{time}}", {
                  time: lastSavedTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
                  defaultValue: `Autosaved at ${lastSavedTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`,
                })}
              </span>
            )}

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

        {/* TAB BAR (Editor | Activity) */}
        {isEditMode && (
          <div style={{ display: "flex", gap: "4px", padding: "0 24px", borderBottom: "1px solid var(--border-color)", background: "var(--bg-card)" }}>
            {[
              { id: "editor", label: t("Document Editor", { defaultValue: "Document Editor" }), icon: <Save size={14} /> },
              { id: "activity", label: t("Activity", { defaultValue: "Activity" }), icon: <Activity size={14} /> },
            ].map(({ id: tabId, label, icon }) => (
              <button
                key={tabId}
                type="button"
                onClick={() => setActiveTab(tabId)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 16px",
                  border: "none",
                  borderBottom: activeTab === tabId ? "2px solid #2563eb" : "2px solid transparent",
                  marginBottom: "-1px",
                  background: "transparent",
                  color: activeTab === tabId ? "#2563eb" : "var(--text-secondary)",
                  fontWeight: activeTab === tabId ? 700 : 500,
                  fontSize: "13px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        )}

        {/* ACTIVITY TAB CONTENT */}
        {activeTab === "activity" && (
          <div style={{ padding: "24px", flex: 1, overflowY: "auto", background: "var(--bg-card)", minHeight: "500px" }}>
            <UnifiedActivityFeed module="knowledge_base" entityId={id} />
          </div>
        )}

        {/* EDITOR MAIN WORKSPACE */}
        {activeTab === "editor" && (
          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            {/* CORE CANVAS (TITLE & RICH TEXT) */}
            <div className="kb-editor-canvas">
              {/* ADVANCED TOOLBAR ACTION STRIP */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  padding: "8px 12px",
                  background: "var(--bg-hover, #f8fafc)",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #e2e8f0)",
                  marginBottom: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleUndo}
                    title={t("Undo (Ctrl+Z)", { defaultValue: "Undo (Ctrl+Z)" })}
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "5px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--text-primary)" }}
                  >
                    <Undo2 size={13} /> {t("Undo", { defaultValue: "Undo" })}
                  </button>
                  <button
                    type="button"
                    onClick={handleRedo}
                    title={t("Redo (Ctrl+Y)", { defaultValue: "Redo (Ctrl+Y)" })}
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "5px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--text-primary)" }}
                  >
                    <Redo2 size={13} /> {t("Redo", { defaultValue: "Redo" })}
                  </button>
                  <span style={{ width: "1px", height: "16px", background: "var(--border-color)", margin: "0 2px" }} />
                  <button
                    type="button"
                    onClick={handleFormatPainter}
                    title={t("Format Painter", { defaultValue: "Format Painter" })}
                    style={{ background: copiedFormat ? "#eff6ff" : "var(--bg-card)", border: `1px solid ${copiedFormat ? "#2563eb" : "var(--border-color)"}`, color: copiedFormat ? "#2563eb" : "var(--text-primary)", borderRadius: "6px", padding: "5px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px" }}
                  >
                    <Paintbrush size={13} /> {t("Format Painter", { defaultValue: "Format Painter" })}
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    title={t("Print Document", { defaultValue: "Print Document" })}
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "5px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--text-primary)" }}
                  >
                    <Printer size={13} /> {t("Print", { defaultValue: "Print" })}
                  </button>

                  <span style={{ width: "1px", height: "16px", background: "var(--border-color)", margin: "0 2px" }} />

                  {/* Custom Text Color Picker */}
                  <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => textColorInputRef.current?.click()}
                      title={t("Custom Text Color", { defaultValue: "Custom Text Color" })}
                      style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "5px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-primary)" }}
                    >
                      <Palette size={13} style={{ color: customTextColor }} />
                      <span style={{ fontSize: "11px", fontWeight: 600 }}>{customTextColor.toUpperCase()}</span>
                    </button>
                    <input
                      ref={textColorInputRef}
                      type="color"
                      value={customTextColor}
                      onChange={(e) => {
                        setCustomTextColor(e.target.value);
                        applyCustomColor("color", e.target.value);
                      }}
                      style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
                    />
                  </div>

                  {/* Custom Background Color Picker */}
                  <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => textBgInputRef.current?.click()}
                      title={t("Custom Highlight Color", { defaultValue: "Custom Highlight Color" })}
                      style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "5px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-primary)" }}
                    >
                      <Pipette size={13} style={{ color: customBgColor }} />
                      <span style={{ fontSize: "11px", fontWeight: 600 }}>BG: {customBgColor.toUpperCase()}</span>
                    </button>
                    <input
                      ref={textBgInputRef}
                      type="color"
                      value={customBgColor}
                      onChange={(e) => {
                        setCustomBgColor(e.target.value);
                        applyCustomColor("background", e.target.value);
                      }}
                      style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
                    />
                  </div>
                </div>

                {/* Zoom Controls */}
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--text-secondary)" }}>
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.max(z - 10, 50))}
                    title={t("Zoom Out", { defaultValue: "Zoom Out" })}
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "4px 6px", cursor: "pointer", color: "var(--text-primary)" }}
                  >
                    <ZoomOut size={13} />
                  </button>
                  <span style={{ minWidth: "40px", textAlign: "center", fontWeight: 600, fontSize: "11px" }}>{zoomLevel}%</span>
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.min(z + 10, 180))}
                    title={t("Zoom In", { defaultValue: "Zoom In" })}
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "4px 6px", cursor: "pointer", color: "var(--text-primary)" }}
                  >
                    <ZoomIn size={13} />
                  </button>
                  {zoomLevel !== 100 && (
                    <button
                      type="button"
                      onClick={() => setZoomLevel(100)}
                      title={t("Reset Zoom", { defaultValue: "Reset Zoom" })}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#2563eb", fontSize: "11px", fontWeight: 600, padding: "2px 4px" }}
                    >
                      {t("Reset", { defaultValue: "Reset" })}
                    </button>
                  )}
                </div>
              </div>

              <input
                type="text"
                className="kb-editor-title-input"
                placeholder={t("Untitled Document...", { defaultValue: "Untitled Document..." })}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />

              <div style={{ zoom: `${zoomLevel}%`, transformOrigin: "top left", transition: "zoom 0.15s ease" }}>
                <ReactQuill
                  ref={quillRef}
                  theme="snow"
                  value={content}
                  onChange={setContent}
                  modules={quillModules}
                  formats={quillFormats}
                  placeholder={t("Start writing rich documentation, guidelines, code snippets, or SOPs...", { defaultValue: "Start writing rich documentation, guidelines, code snippets, or SOPs..." })}
                />
              </div>
            </div>

            {/* RIGHT SETTINGS SIDEBAR */}
            <div style={{ width: "300px", borderLeft: "1px solid var(--border-color)", padding: "24px 20px", display: "flex", flexDirection: "column", gap: "20px", background: "var(--bg-card)" }}>
              <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.5px" }}>
                {t("Document Settings", { defaultValue: "Document Settings" })}
              </h4>

              {/* CATEGORY (CreatableSelect) */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                  {t("Category", { defaultValue: "Category" })} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <CreatableSelect
                  isClearable
                  isDisabled={savingNewCat}
                  isLoading={savingNewCat}
                  onChange={(option) => setSelectedCategoryOption(option || null)}
                  onCreateOption={handleCreateCategory}
                  options={categoryOptions}
                  value={selectedCategoryOption}
                  placeholder={t("Select or type to create…", { defaultValue: "Select or type to create…" })}
                  formatCreateLabel={(inputValue) => `➕ ${t('Create "{{name}}"', { name: inputValue, defaultValue: `Create "${inputValue}"` })}`}
                  styles={{
                    control: (base, state) => ({
                      ...base,
                      minHeight: "38px",
                      borderRadius: "6px",
                      border: `1px solid ${state.isFocused ? "#2563eb" : "var(--border-color, #cbd5e1)"}`,
                      boxShadow: state.isFocused ? "0 0 0 2px rgba(37,99,235,0.15)" : "none",
                      background: "var(--bg-card, #ffffff)",
                      color: "var(--text-primary, #0f172a)",
                      fontSize: "12px",
                      cursor: "text",
                    }),
                    menu: (base) => ({
                      ...base,
                      borderRadius: "6px",
                      border: "1px solid var(--border-color, #e2e8f0)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                      zIndex: 9999,
                    }),
                    option: (base, state) => ({
                      ...base,
                      fontSize: "12px",
                      background: state.isSelected ? "#2563eb" : state.isFocused ? "#eff6ff" : "transparent",
                      color: state.isSelected ? "#fff" : "var(--text-primary, #0f172a)",
                      cursor: "pointer",
                    }),
                    singleValue: (base) => ({ ...base, color: "var(--text-primary, #0f172a)", fontSize: "12px" }),
                    placeholder: (base) => ({ ...base, color: "var(--text-muted, #94a3b8)", fontSize: "12px" }),
                    input: (base) => ({ ...base, color: "var(--text-primary, #0f172a)" }),
                  }}
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
        )}
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
