import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { components } from "react-select";
import CreatableSelect from "react-select/creatable";
import DOMPurify from "dompurify";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import CustomSelect from "../components/CustomSelect";
import MultiSelectDropdown from "../components/MultiSelectDropdown";
import ConfirmModal from "../components/ConfirmModal";
import ShareKnowledgeModal from "../components/ShareKnowledgeModal";
import UnifiedActivityFeed from "../components/UnifiedActivityFeed";
import AttachResourceModal from "../components/AttachResourceModal";
import API_URL from "../config/api";
import draftService from "../services/draftService";
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
  Link2,
  Upload,
  FileText,
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
  const fileInputRef = useRef(null);

  const isEditRoute = Boolean(id) && (location.pathname.includes("/edit/") || location.pathname.endsWith("/edit"));
  const isViewMode = Boolean(id) && !isEditRoute;
  const isEditMode = Boolean(id) && isEditRoute;

  const [loading, setLoading] = useState(Boolean(id));
  const [savingStatus, setSavingStatus] = useState("saved"); // 'saved' | 'saving' | 'unsaved' | 'error'
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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
  const [selectedProjectIds, setSelectedProjectIds] = useState(
    location.state?.projectId ? [String(location.state.projectId)] : []
  );
  const projectId = selectedProjectIds[0] ? String(selectedProjectIds[0]) : "";
  const setProjectId = (val) => {
    if (Array.isArray(val)) {
      setSelectedProjectIds(val.map(String));
    } else if (val) {
      setSelectedProjectIds([String(val)]);
    } else {
      setSelectedProjectIds([]);
    }
  };
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [status, setStatus] = useState("published");
  const [isPinned, setIsPinned] = useState(false);
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  // Reference Links State (Multiple)
  const [referenceLinks, setReferenceLinks] = useState([""]);
  const [rawArticle, setRawArticle] = useState(null);

  // Category Creation Loading State
  const [savingNewCat, setSavingNewCat] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [isCategoryDeleteModalOpen, setIsCategoryDeleteModalOpen] = useState(false);

  // Actions & Favorites State
  const [isFavorited, setIsFavorited] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Attachments State (Multiple)
  const [files, setFiles] = useState([]); // newly staged File objects
  const [existingFiles, setExistingFiles] = useState([]); // [{ file_path, file_name, file_size }]
  const [deletedFiles, setDeletedFiles] = useState([]); // [file_path]
  const [downloadingPath, setDownloadingPath] = useState(null);

  const parseReferenceLinks = (d) => {
    if (Array.isArray(d?.reference_links) && d.reference_links.length > 0) {
      return d.reference_links;
    }
    if (Array.isArray(d?.reference_links_list) && d.reference_links_list.length > 0) {
      return d.reference_links_list;
    }
    if (d?.reference_link) {
      try {
        const parsed = JSON.parse(d.reference_link);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
      return [d.reference_link];
    }
    return [""];
  };

  const parseAttachments = (d) => {
    if (Array.isArray(d?.attachments) && d.attachments.length > 0) {
      return d.attachments;
    }
    if (Array.isArray(d?.attachments_list) && d.attachments_list.length > 0) {
      return d.attachments_list;
    }
    if (d?.file_path) {
      return [{ file_path: d.file_path, file_name: d.file_name || d.file_path.split("/").pop() }];
    }
    return [];
  };

  const isUserActive = (u) => {
    if (!u) return false;
    if (u.active === false || u.active === 0 || u.active === "0") return false;
    if (u.is_active === false || u.is_active === 0 || u.is_active === "0") return false;
    if (typeof u.status === "string") {
      const s = u.status.toLowerCase().trim();
      if (["inactive", "resigned", "terminated", "deleted", "disabled"].includes(s)) return false;
    }
    return true;
  };

  const handleDownloadFile = async (filePath, fileName) => {
    if (!id && !filePath) return;
    try {
      setDownloadingPath(filePath || "primary");
      const token = authToken();
      const endpoint = id
        ? `${API_URL}/knowledge-base/${id}/download?file_path=${encodeURIComponent(filePath || "")}`
        : `${API_URL}/storage/${filePath}`;

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
      link.download = fileName || (filePath ? filePath.split("/").pop() : "document-attachment");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      notify.success(t("Download completed.", { defaultValue: "Download completed." }));
    } catch (e) {
      console.error("Download failed", e);
      notify.error(t("Download failed.", { defaultValue: "Download failed." }));
    } finally {
      setDownloadingPath(null);
    }
  };

  const handleFilesChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selected]);
      e.target.value = "";
    }
  };

  const handleRemoveNewFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveExistingFile = (filePath) => {
    if (!filePath) return;
    setDeletedFiles((prev) => [...prev, filePath]);
    setExistingFiles((prev) => prev.filter((f) => f.file_path !== filePath));
  };

  const handleLinkChange = (index, value) => {
    setReferenceLinks((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleAddLinkRow = () => {
    setReferenceLinks((prev) => [...prev, ""]);
  };

  const handleRemoveLinkRow = (index) => {
    setReferenceLinks((prev) => {
      if (prev.length <= 1) return [""];
      return prev.filter((_, i) => i !== index);
    });
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
  const lastSavedDataRef = useRef(null);
  const isSavingRef = useRef(false);

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
      setSelectedProjectIds([String(location.state.projectId)]);
    }
  }, [location.state]);

  const applyDraftData = useCallback((d) => {
    if (!d) return;
    if (d.title !== undefined) setTitle(d.title || "");
    if (d.content !== undefined) setContent(d.content || "");
    if (d.category_id || d.category) {
      const catVal = String(d.category_id || d.category);
      const catName = d.category_name || d.categoryRelation?.name || catVal;
      setSelectedCategoryOption({ value: catVal, label: catName });
    }
    if (d.visibility_level !== undefined) setVisibilityLevel(d.visibility_level || "organization");
    if (d.project_ids !== undefined || d.project_id !== undefined) {
      const pRaw = d.project_ids || (d.project_id ? [d.project_id] : []);
      setSelectedProjectIds(Array.isArray(pRaw) ? pRaw.map(String) : (pRaw ? [String(pRaw)] : []));
    }
    if (d.team_ids !== undefined) setSelectedTeamIds(Array.isArray(d.team_ids) ? d.team_ids : []);
    if (d.user_ids !== undefined) setSelectedUserIds(Array.isArray(d.user_ids) ? d.user_ids : []);
    if (d.status !== undefined) setStatus(d.status || "published");
    if (d.is_pinned !== undefined) setIsPinned(Boolean(d.is_pinned));
    if (d.tags !== undefined) {
      setTags(Array.isArray(d.tags) ? d.tags : typeof d.tags === "string" ? JSON.parse(d.tags || "[]") : []);
    }
    setReferenceLinks(parseReferenceLinks(d));
    setExistingFiles(parseAttachments(d));
  }, []);

  // Handle draft restoration from DraftCenter for create mode
  useEffect(() => {
    if (id) return; // For edit mode, draft is overlaid after article fetch
    const draftId = location.state?.openDraft;
    const directDraftData = location.state?.draftData;

    if (!draftId && !directDraftData) return;

    window.history.replaceState({}, document.title);

    if (directDraftData) {
      applyDraftData(directDraftData);
      return;
    }

    if (draftId) {
      draftService.get(draftId)
        .then((res) => {
          const draftObj = res?.data || res;
          if (draftObj?.draft_data) {
            applyDraftData(draftObj.draft_data);
          }
        })
        .catch((err) => {
          console.error("Failed to restore KB draft:", err);
        });
    }
  }, [location.state, id, applyDraftData]);

  // 2. Fetch Document Data if editing or viewing
  useEffect(() => {
    if (!id) {
      setLoading(false);
      const initialProjects = location.state?.projectId ? [String(location.state.projectId)] : [];
      const initialSnap = JSON.stringify({
        title: "",
        content: "",
        category: "",
        visibilityLevel: "organization",
        selectedProjectIds: initialProjects,
        status: "published",
        isPinned: false,
        tags: [],
        referenceLinks: [],
        selectedTeamIds: [],
        selectedUserIds: [],
        deletedFiles: [],
        newFilesCount: 0,
      });
      lastSavedDataRef.current = initialSnap;
      setHasUnsavedChanges(false);
      setSavingStatus("saved");
      setTimeout(() => {
        initialLoadRef.current = false;
      }, 500);
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
          const fetchedProjects = data.project_ids
            ? (Array.isArray(data.project_ids) ? data.project_ids.map(String) : [String(data.project_ids)])
            : (Array.isArray(data.projects) && data.projects.length > 0
                ? data.projects.map((p) => String(p.id))
                : (data.project_id ? [String(data.project_id)] : []));
          const loadedTeamIds = Array.isArray(data.team_ids) && data.team_ids.length > 0
            ? data.team_ids.map(Number)
            : (Array.isArray(data.visibilities)
                ? data.visibilities.filter((v) => v.team_id).map((v) => Number(v.team_id))
                : []);
          setSelectedTeamIds(loadedTeamIds);

          const loadedUserIds = Array.isArray(data.user_ids) && data.user_ids.length > 0
            ? data.user_ids.map(Number)
            : (Array.isArray(data.visibilities)
                ? data.visibilities.filter((v) => v.user_id).map((v) => Number(v.user_id))
                : []);
          setSelectedUserIds(loadedUserIds);

          setStatus(data.status || "published");
          setIsPinned(Boolean(data.is_pinned));
          setIsFavorited(Boolean(data.is_favorited));
          const loadedTags = Array.isArray(data.tags) ? data.tags : typeof data.tags === "string" ? JSON.parse(data.tags || "[]") : [];
          setTags(loadedTags);
          const loadedLinks = parseReferenceLinks(data);
          setReferenceLinks(loadedLinks);
          setExistingFiles(parseAttachments(data));
          setFiles([]);
          setDeletedFiles([]);
          currentDocIdRef.current = data.id;

          const initialSnap = JSON.stringify({
            title: (data.title || "").trim(),
            content: data.content || "",
            category: String(data.category_id || data.category || ""),
            visibilityLevel: data.visibility_level || "organization",
            selectedProjectIds: fetchedProjects,
            status: data.status || "published",
            isPinned: Boolean(data.is_pinned),
            tags: loadedTags,
            referenceLinks: loadedLinks.map((l) => (typeof l === "string" ? l.trim() : "")).filter(Boolean),
            selectedTeamIds: loadedTeamIds,
            selectedUserIds: loadedUserIds,
            deletedFiles: [],
            newFilesCount: 0,
          });
          lastSavedDataRef.current = initialSnap;
          setHasUnsavedChanges(false);
          setSavingStatus("saved");
          setLastSavedTime(new Date());

          // Overlay draft data if opened with draft state
          const directDraft = location.state?.draftData;
          const draftId = location.state?.openDraft;
          if (directDraft) {
            applyDraftData(directDraft);
          } else if (draftId) {
            draftService.get(draftId).then((resDraft) => {
              if (resDraft?.data?.draft_data) applyDraftData(resDraft.data.draft_data);
            }).catch(() => {});
          }
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

  // Category Deletion via ConfirmModal
  const confirmDeleteCategory = async () => {
    if (!categoryToDelete?.value) return;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/kb-categories/${categoryToDelete.value}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCategories((prev) => prev.filter((c) => String(c.id) !== String(categoryToDelete.value)));
        if (selectedCategoryOption?.value === String(categoryToDelete.value)) {
          setSelectedCategoryOption(null);
        }
        notify.success(t("Category deleted successfully", { defaultValue: "Category deleted successfully" }));
      } else {
        notify.error(data?.message || t("Failed to delete category", { defaultValue: "Failed to delete category" }));
      }
    } catch (err) {
      console.error("Delete category error:", err);
      notify.error(t("Network error while deleting category", { defaultValue: "Network error while deleting category" }));
    } finally {
      setIsCategoryDeleteModalOpen(false);
      setCategoryToDelete(null);
    }
  };

  // 3. Compute normalized JSON snapshot of editor form state for deep comparison
  const computeSnapshot = useCallback(() => {
    const validLinks = Array.isArray(referenceLinks)
      ? referenceLinks.map((l) => (typeof l === "string" ? l.trim() : "")).filter(Boolean)
      : [];
    return JSON.stringify({
      title: (title || "").trim(),
      content: content || "",
      category: String(selectedCategoryOption?.value || categoryId || ""),
      visibilityLevel: visibilityLevel || "organization",
      selectedProjectIds: Array.isArray(selectedProjectIds) ? selectedProjectIds.map(String) : [],
      status: status || "published",
      isPinned: Boolean(isPinned),
      tags: Array.isArray(tags) ? tags : [],
      referenceLinks: validLinks,
      selectedTeamIds: Array.isArray(selectedTeamIds) ? selectedTeamIds : [],
      selectedUserIds: Array.isArray(selectedUserIds) ? selectedUserIds : [],
      deletedFiles: Array.isArray(deletedFiles) ? deletedFiles : [],
      newFilesCount: Array.isArray(files) ? files.length : 0,
    });
  }, [
    title,
    content,
    selectedCategoryOption,
    categoryId,
    visibilityLevel,
    selectedProjectIds,
    status,
    isPinned,
    tags,
    referenceLinks,
    selectedTeamIds,
    selectedUserIds,
    deletedFiles,
    files,
  ]);

  // 4. Track unsaved changes via deep comparison snapshot
  useEffect(() => {
    if (initialLoadRef.current || loading) return;
    if (lastSavedDataRef.current === null) return;
    const currentDataStr = computeSnapshot();
    const isDirty = currentDataStr !== lastSavedDataRef.current;
    setHasUnsavedChanges(isDirty);
    if (isDirty) {
      setSavingStatus("unsaved");
    } else if (savingStatus !== "saving") {
      setSavingStatus("saved");
    }
  }, [computeSnapshot, loading]);

  // 5. Save / Update Article Function
  const saveArticle = useCallback(
    async (isManual = false, overrideStatus = null) => {
      if (!title.trim()) {
        if (isManual) notify.error(t("Document title is required.", { defaultValue: "Document title is required." }));
        return;
      }

      if (isSavingRef.current) return;
      isSavingRef.current = true;
      setSavingStatus("saving");

      try {
        const token = authToken();
        const fd = new FormData();
        fd.append("title", title.trim());
        fd.append("content", content || "");
        if (selectedCategoryOption?.value || categoryId) {
          const catVal = selectedCategoryOption?.value || categoryId;
          const numCat = Number(catVal);
          if (!isNaN(numCat) && numCat > 0) {
            fd.append("category_id", String(numCat));
            if (selectedCategoryOption?.label) {
              fd.append("category", selectedCategoryOption.label);
            }
          } else if (typeof catVal === "string" && catVal.trim()) {
            fd.append("category", catVal.trim());
          }
        }
        fd.append("visibility_level", visibilityLevel);
        if (selectedProjectIds && selectedProjectIds.length > 0) {
          fd.append("project_id", String(selectedProjectIds[0]));
          selectedProjectIds.forEach((pId) => {
            if (pId) fd.append("project_ids[]", String(pId));
          });
        }
        fd.append("status", overrideStatus || status);
        fd.append("is_pinned", isPinned ? "1" : "0");

        // Format tags, team_ids, and user_ids as PHP-compatible FormData arrays to satisfy Laravel validator
        if (Array.isArray(tags) && tags.length > 0) {
          tags.forEach((tag) => {
            if (tag) fd.append("tags[]", tag);
          });
        }

        // Multiple Reference Links
        const validLinks = referenceLinks
          .map((l) => (typeof l === "string" ? l.trim() : ""))
          .filter(Boolean);

        if (validLinks.length > 0) {
          validLinks.forEach((link) => {
            fd.append("reference_links[]", link);
          });
          fd.append("reference_link", validLinks[0]);
        } else {
          fd.append("reference_link", "");
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

        // Deleted existing attachments
        if (Array.isArray(deletedFiles) && deletedFiles.length > 0) {
          deletedFiles.forEach((dPath) => {
            fd.append("deleted_files[]", dPath);
          });
        }

        // Newly selected files
        if (Array.isArray(files) && files.length > 0) {
          files.forEach((f) => {
            fd.append("files[]", f);
          });
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

          const savedItem = data.data;
          let updatedLinks = validLinks;
          if (savedItem) {
            setExistingFiles(parseAttachments(savedItem));
            setFiles([]);
            setDeletedFiles([]);
            if (savedItem.reference_links || savedItem.reference_link) {
              const parsedL = parseReferenceLinks(savedItem);
              setReferenceLinks(parsedL);
              updatedLinks = parsedL.map((l) => (typeof l === "string" ? l.trim() : "")).filter(Boolean);
            }
          }

          // Reset snapshot so isDirty check knows current state is clean
          const finalStatus = overrideStatus || status;
          const newSnapshot = JSON.stringify({
            title: title.trim(),
            content: content || "",
            category: String(selectedCategoryOption?.value || categoryId || ""),
            visibilityLevel: visibilityLevel || "organization",
            selectedProjectIds: Array.isArray(selectedProjectIds) ? selectedProjectIds.map(String) : [],
            status: finalStatus || "published",
            isPinned: Boolean(isPinned),
            tags: Array.isArray(tags) ? tags : [],
            referenceLinks: updatedLinks,
            selectedTeamIds: Array.isArray(selectedTeamIds) ? selectedTeamIds : [],
            selectedUserIds: Array.isArray(selectedUserIds) ? selectedUserIds : [],
            deletedFiles: [],
            newFilesCount: 0,
          });
          lastSavedDataRef.current = newSnapshot;
          setHasUnsavedChanges(false);

          const savedDocId = data.data?.id || activeId;
          const actionType = isManual
            ? (finalStatus === "published" ? (activeId ? "Edited" : "Published") : "Edited")
            : "Edited";

          // Activity Logging: Knowledge Base Document (only on manual save)
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
            if (location.state?.taskId) {
              fetch(`${API_URL}/tasks/${location.state.taskId}/knowledge-bases`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({ knowledge_base_id: data.data.id }),
              }).catch(() => {});
            }
            if (selectedProjectIds.length > 0) {
              selectedProjectIds.forEach((pId) => {
                fetch(`${API_URL}/projects/${pId}/knowledge-bases`, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                  },
                  body: JSON.stringify({ knowledge_base_id: data.data.id }),
                }).catch(() => {});
              });
            } else if (location.state?.projectId) {
              fetch(`${API_URL}/projects/${location.state.projectId}/knowledge-bases`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({ knowledge_base_id: data.data.id }),
              }).catch(() => {});
            }
            // Update URL without full reload
            window.history.replaceState(null, "", rolePath(`knowledge-base/edit/${data.data.id}`));
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
      } finally {
        isSavingRef.current = false;
      }
    },
    [title, content, categoryId, selectedCategoryOption, visibilityLevel, selectedProjectIds, status, isPinned, tags, selectedTeamIds, selectedUserIds, referenceLinks, deletedFiles, files, t, notify, user, location.state]
  );

  // 6. Debounced Autosave (Triggers 2s after typing stops if document exists and has unsaved changes)
  useEffect(() => {
    if (initialLoadRef.current || loading) return;
    if (!hasUnsavedChanges) return;
    if (!title.trim()) return;
    if (!currentDocIdRef.current) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      saveArticle(false);
    }, 2000);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [hasUnsavedChanges, title, saveArticle, loading]);

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
          const restoredTitle = data.data.title || "";
          const restoredContent = data.data.content || "";
          setTitle(restoredTitle);
          setContent(restoredContent);

          const restoredSnapshot = JSON.stringify({
            title: restoredTitle.trim(),
            content: restoredContent,
            category: String(selectedCategoryOption?.value || categoryId || ""),
            visibilityLevel: visibilityLevel || "organization",
            selectedProjectIds: Array.isArray(selectedProjectIds) ? selectedProjectIds.map(String) : [],
            status: status || "published",
            isPinned: Boolean(isPinned),
            tags: Array.isArray(tags) ? tags : [],
            referenceLinks: Array.isArray(referenceLinks)
              ? referenceLinks.map((l) => (typeof l === "string" ? l.trim() : "")).filter(Boolean)
              : [],
            selectedTeamIds: Array.isArray(selectedTeamIds) ? selectedTeamIds : [],
            selectedUserIds: Array.isArray(selectedUserIds) ? selectedUserIds : [],
            deletedFiles: [],
            newFilesCount: Array.isArray(files) ? files.length : 0,
          });
          lastSavedDataRef.current = restoredSnapshot;
          setHasUnsavedChanges(false);
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

  const CustomOption = (props) => {
    const { data, isSelected } = props;
    const isCreatable = data.__isNew__;

    return (
      <components.Option {...props}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {props.children}
          </span>
          {!isCreatable && data.value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setCategoryToDelete(data);
                setIsCategoryDeleteModalOpen(true);
              }}
              title={t("Delete Category", { defaultValue: "Delete Category" })}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "2px 4px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: isSelected ? "#ffffff" : "#ef4444",
                borderRadius: "4px",
                marginLeft: "8px",
                flexShrink: 0,
                opacity: 0.85,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.85")}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </components.Option>
    );
  };

  const visibilityOptions = [
    { value: "organization", label: t("Organization (Everyone in Company)", { defaultValue: "Organization (Everyone in Company)" }) },
    { value: "department_team", label: t("Department Team (My Department)", { defaultValue: "Department Team (My Department)" }) },
    { value: "project_team", label: t("Project Team (Target Project Members)", { defaultValue: "Project Team (Target Project Members)" }) },
    { value: "team", label: t("Team (Specific Team Members)", { defaultValue: "Team (Specific Team Members)" }) },
    { value: "custom", label: t("Custom (Select Specific Users & Teams)", { defaultValue: "Custom (Select Specific Users & Teams)" }) },
    { value: "private", label: t("Private (Only Me)", { defaultValue: "Private (Only Me)" }) },
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

              {/* ATTACH TO PROJECT / TASK BUTTON */}
              <button
                type="button"
                onClick={() => setAttachModalOpen(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-hover)", color: "var(--text-primary)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                title={t("Attach to Project / Task", { defaultValue: "Attach to Project / Task" })}
              >
                <Link2 size={14} color="#2563eb" /> {t("Attach", { defaultValue: "Attach" })}
              </button>

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

          {/* ATTACH RESOURCE MODAL IN VIEW */}
          <AttachResourceModal
            isOpen={attachModalOpen}
            onClose={() => setAttachModalOpen(false)}
            resource={{
              type: "knowledge_base",
              id: id,
              title: title || rawArticle?.title,
              project_id: projectId || rawArticle?.project_id || rawArticle?.projectId || rawArticle?.project?.id,
              task_id: rawArticle?.task_id || rawArticle?.taskId || rawArticle?.task?.id,
              project: rawArticle?.project,
              task: rawArticle?.task,
              projects: rawArticle?.projects,
              tasks: rawArticle?.tasks,
              ...rawArticle,
            }}
            onSuccess={() => {
              notify.success(t("Document attached successfully!", { defaultValue: "Document attached successfully!" }));
            }}
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

              {/* ATTACHMENTS DOWNLOAD SECTION (MULTIPLE) */}
              {existingFiles.length > 0 && (
                <div style={{ marginTop: "28px" }}>
                  <h4 style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px", letterSpacing: "0.5px" }}>
                    <Paperclip size={14} color="#2563eb" /> {t("Attachments ({{count}})", { count: existingFiles.length, defaultValue: `Attachments (${existingFiles.length})` })}
                  </h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "10px" }}>
                    {existingFiles.map((ef, idx) => (
                      <div
                        key={ef.file_path || idx}
                        style={{
                          padding: "12px 16px",
                          background: "var(--bg-hover)",
                          borderRadius: "8px",
                          border: "1px solid var(--border-color)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "10px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", overflow: "hidden", minWidth: 0 }}>
                          <Paperclip color="#2563eb" size={18} style={{ flexShrink: 0 }} />
                          <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ef.file_name || ef.file_path}>
                            {ef.file_name || ef.file_path.split("/").pop()}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownloadFile(ef.file_path, ef.file_name)}
                          disabled={downloadingPath === ef.file_path}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 14px",
                            borderRadius: "6px",
                            background: "#2563eb",
                            color: "#ffffff",
                            fontSize: "12px",
                            fontWeight: 600,
                            border: "none",
                            cursor: downloadingPath === ef.file_path ? "not-allowed" : "pointer",
                            opacity: downloadingPath === ef.file_path ? 0.7 : 1,
                            flexShrink: 0,
                          }}
                        >
                          <Download size={13} /> {downloadingPath === ef.file_path ? t("Downloading...", { defaultValue: "Downloading..." }) : t("Download", { defaultValue: "Download" })}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* REFERENCE LINKS SECTION (MULTIPLE) */}
              {referenceLinks.filter((l) => typeof l === "string" && l.trim().length > 0).length > 0 && (
                <div style={{ marginTop: "24px" }}>
                  <h4 style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px", letterSpacing: "0.5px" }}>
                    <ExternalLink size={14} color="#2563eb" /> {t("Reference Links ({{count}})", { count: referenceLinks.filter((l) => typeof l === "string" && l.trim().length > 0).length, defaultValue: `Reference Links (${referenceLinks.filter((l) => typeof l === "string" && l.trim().length > 0).length})` })}
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {referenceLinks.filter((l) => typeof l === "string" && l.trim().length > 0).map((link, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: "12px 16px",
                          background: "var(--bg-hover)",
                          borderRadius: "8px",
                          border: "1px solid var(--border-color)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "12px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", minWidth: 0, flex: 1 }}>
                          <ExternalLink color="#2563eb" size={16} style={{ flexShrink: 0 }} />
                          <a
                            href={link.startsWith("http") ? link : `https://${link}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#2563eb", textDecoration: "none", fontWeight: 500, wordBreak: "break-all", overflow: "hidden", textOverflow: "ellipsis" }}
                          >
                            {link}
                          </a>
                        </div>
                        <a
                          href={link.startsWith("http") ? link : `https://${link}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 14px",
                            borderRadius: "6px",
                            background: "#eff6ff",
                            color: "#1d4ed8",
                            border: "1px solid #bfdbfe",
                            fontSize: "12px",
                            fontWeight: 600,
                            textDecoration: "none",
                            flexShrink: 0,
                          }}
                        >
                          {t("Open Link", { defaultValue: "Open Link" })} <ExternalLink size={12} />
                        </a>
                      </div>
                    ))}
                  </div>
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
              <div className="kb-advanced-action-strip">
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

              <div className="kb-quill-wrapper quill-editor-wrapper" style={{ zoom: `${zoomLevel}%`, transformOrigin: "top left", transition: "zoom 0.15s ease" }}>
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
            <div className="kb-editor-sidebar">
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
                  components={{ Option: CustomOption }}
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

            {/* DYNAMIC SECONDARY: TARGET PROJECT (MultiSelectDropdown with checkboxes) */}
            {visibilityLevel === "project_team" && (
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                  {t("Target Project", { defaultValue: "Target Project" })} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <MultiSelectDropdown
                  value={selectedProjectIds}
                  onChange={(vals) => {
                    const ids = Array.isArray(vals) ? vals.map(String) : [];
                    setSelectedProjectIds(ids);
                  }}
                  options={projects.map((p) => ({
                    value: String(p.id),
                    label: (p.title || "Project") + (p.business_id ? ` (${p.business_id})` : ""),
                  }))}
                  placeholder={t("Select Target Projects...", { defaultValue: "Select Target Projects..." })}
                  searchPlaceholder={t("Search projects...", { defaultValue: "Search projects..." })}
                  showChips={true}
                />
              </div>
            )}

            {/* DYNAMIC SECONDARY: TARGET TEAM (MultiSelectDropdown with checkboxes) */}
            {visibilityLevel === "team" && (
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                  {t("Target Team", { defaultValue: "Target Team" })} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <MultiSelectDropdown
                  value={selectedTeamIds}
                  onChange={(vals) => setSelectedTeamIds(vals.map(Number))}
                  options={teams.map((tItem) => ({ value: tItem.id, label: tItem.name }))}
                  placeholder={t("Select Target Teams...", { defaultValue: "Select Target Teams..." })}
                  searchPlaceholder={t("Search teams...", { defaultValue: "Search teams..." })}
                  showChips={true}
                />
              </div>
            )}

            {/* DYNAMIC SECONDARY: CUSTOM (TEAMS & USERS) */}
            {visibilityLevel === "custom" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                    {t("Visible Teams", { defaultValue: "Visible Teams" })}
                  </label>
                  <MultiSelectDropdown
                    value={selectedTeamIds}
                    onChange={(vals) => setSelectedTeamIds(vals.map(Number))}
                    options={teams.map((tItem) => ({ value: tItem.id, label: tItem.name }))}
                    placeholder={t("Select Teams...", { defaultValue: "Select Teams..." })}
                    searchPlaceholder={t("Search teams...", { defaultValue: "Search teams..." })}
                    showChips={true}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                    {t("Visible Users", { defaultValue: "Visible Users" })}
                  </label>
                  <MultiSelectDropdown
                    value={selectedUserIds}
                    onChange={(vals) => setSelectedUserIds(vals.map(Number))}
                    options={usersList
                      .filter((u) => isUserActive(u) || selectedUserIds.includes(Number(u.id)) || selectedUserIds.includes(String(u.id)))
                      .map((u) => ({
                        value: u.id,
                        label: `${u.name}${u.role ? ` (${u.role})` : ""}`,
                      }))}
                    placeholder={t("Select Users...", { defaultValue: "Select Users..." })}
                    searchPlaceholder={t("Search users...", { defaultValue: "Search users..." })}
                    showChips={true}
                  />
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

            {/* MULTIPLE ATTACHMENTS */}
            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px", margin: 0 }}>
                  <Paperclip size={13} color="#2563eb" /> {t("Attachments", { defaultValue: "Attachments" })}
                  {(existingFiles.length + files.length) > 0 && (
                    <span style={{ fontSize: "11px", fontWeight: 700, background: "#eff6ff", color: "#2563eb", padding: "1px 6px", borderRadius: "10px" }}>
                      {existingFiles.length + files.length}
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#2563eb",
                    fontSize: "11px",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                    padding: "2px 4px",
                  }}
                >
                  <Plus size={12} /> {t("Add Files", { defaultValue: "Add Files" })}
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFilesChange}
                style={{ display: "none" }}
              />

              {/* Existing & New Files List */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "8px" }}>
                {/* Existing files */}
                {existingFiles.map((att, idx) => {
                  const fname = att.file_name || (att.file_path ? att.file_path.split("/").pop() : `File #${idx + 1}`);
                  const isDownloading = downloadingPath === att.file_path;
                  return (
                    <div
                      key={`existing-${att.file_path || idx}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "7px 10px",
                        background: "var(--bg-hover)",
                        borderRadius: "6px",
                        border: "1px solid var(--border-color)",
                        gap: "8px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flex: 1 }}>
                        <FileText size={14} color="#64748b" style={{ flexShrink: 0 }} />
                        <span
                          title={fname}
                          style={{
                            fontSize: "12px",
                            fontWeight: 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: "var(--text-primary)",
                          }}
                        >
                          {fname}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => handleDownloadFile(att.file_path, fname)}
                          disabled={isDownloading}
                          title={t("Download", { defaultValue: "Download" })}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#2563eb",
                            padding: "2px",
                            display: "inline-flex",
                          }}
                        >
                          {isDownloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveExistingFile(att.file_path)}
                          title={t("Remove file", { defaultValue: "Remove file" })}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#ef4444",
                            padding: "2px",
                            display: "inline-flex",
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Newly staged files */}
                {files.map((fileObj, idx) => (
                  <div
                    key={`new-${fileObj.name}-${idx}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "7px 10px",
                      background: "#f0fdf4",
                      borderRadius: "6px",
                      border: "1px solid #bbf7d0",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flex: 1 }}>
                      <FileText size={14} color="#16a34a" style={{ flexShrink: 0 }} />
                      <span
                        title={fileObj.name}
                        style={{
                          fontSize: "12px",
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: "#166534",
                        }}
                      >
                        {fileObj.name}
                      </span>
                      <span style={{ fontSize: "10px", color: "#15803d", background: "#dcfce7", padding: "1px 4px", borderRadius: "3px", flexShrink: 0 }}>
                        {fileObj.size ? `${(fileObj.size / 1024).toFixed(0)} KB` : "NEW"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveNewFile(idx)}
                      title={t("Remove file", { defaultValue: "Remove file" })}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#ef4444",
                        padding: "2px",
                        display: "inline-flex",
                        flexShrink: 0,
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Upload Trigger Area */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px dashed var(--border-color)",
                  background: "var(--bg-hover)",
                  color: "var(--text-secondary)",
                  fontSize: "12px",
                  fontWeight: 500,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                <Upload size={13} /> {t("Upload Files...", { defaultValue: "Upload Files..." })}
              </button>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "4px" }}>
                {t("Supported formats: PDF, Word, Excel, Images, ZIP (Multiple allowed)", { defaultValue: "Supported formats: PDF, Word, Excel, Images, ZIP (Multiple allowed)" })}
              </span>
            </div>

            {/* MULTIPLE REFERENCE / EXTERNAL LINKS */}
            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px", margin: 0 }}>
                  <ExternalLink size={13} color="#2563eb" /> {t("Reference Links", { defaultValue: "Reference Links" })}
                  {referenceLinks.filter((l) => l && l.trim()).length > 0 && (
                    <span style={{ fontSize: "11px", fontWeight: 700, background: "#eff6ff", color: "#2563eb", padding: "1px 6px", borderRadius: "10px" }}>
                      {referenceLinks.filter((l) => l && l.trim()).length}
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={handleAddLinkRow}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#2563eb",
                    fontSize: "11px",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                    padding: "2px 4px",
                  }}
                >
                  <Plus size={12} /> {t("Add Link", { defaultValue: "Add Link" })}
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {referenceLinks.map((linkVal, idx) => {
                  const isValidUrl = Boolean(linkVal && (linkVal.startsWith("http://") || linkVal.startsWith("https://")));
                  return (
                    <div key={`ref-link-${idx}`} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <input
                        type="url"
                        placeholder="https://..."
                        value={linkVal}
                        onChange={(e) => handleLinkChange(idx, e.target.value)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: "7px 9px",
                          borderRadius: "6px",
                          border: "1px solid var(--border-color)",
                          background: "var(--bg-card)",
                          color: "var(--text-primary)",
                          fontSize: "12px",
                          outline: "none",
                        }}
                      />
                      {isValidUrl && (
                        <a
                          href={linkVal}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t("Open Link", { defaultValue: "Open Link" })}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "6px",
                            borderRadius: "6px",
                            border: "1px solid var(--border-color)",
                            background: "var(--bg-hover)",
                            color: "#2563eb",
                            textDecoration: "none",
                            flexShrink: 0,
                          }}
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveLinkRow(idx)}
                        title={t("Remove Link", { defaultValue: "Remove Link" })}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "6px",
                          borderRadius: "6px",
                          border: "1px solid var(--border-color)",
                          background: "var(--bg-hover)",
                          color: referenceLinks.length > 1 ? "#ef4444" : "var(--text-muted)",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>

              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "6px" }}>
                {t("External specs, Figma designs, Google Docs, or Jira tickets.", { defaultValue: "External specs, Figma designs, Google Docs, or Jira tickets." })}
              </span>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* VERSION HISTORY MODAL */}
      {versionsModalOpen && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => setVersionsModalOpen(false)}>
          <div style={{ background: "var(--bg-card)", borderRadius: "12px", width: "100%", maxWidth: "600px", maxHeight: "85vh", display: "flex", flexDirection: "column", border: "1px solid var(--border-color)", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }} onClick={(e) => e.stopPropagation()}>
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
        </div>,
        document.body
      )}

      {/* CATEGORY DELETE CONFIRM MODAL */}
      <ConfirmModal
        isOpen={isCategoryDeleteModalOpen}
        onClose={() => {
          setIsCategoryDeleteModalOpen(false);
          setCategoryToDelete(null);
        }}
        onConfirm={confirmDeleteCategory}
        title={t("Delete Category", { defaultValue: "Delete Category" })}
        message={t('Are you sure you want to delete category "{{name}}"?', {
          name: categoryToDelete?.label || "",
          defaultValue: `Are you sure you want to delete category "${categoryToDelete?.label || ""}"?`,
        })}
        confirmText={t("Delete", { defaultValue: "Delete" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        danger={true}
      />
    </DashboardLayout>
  );
}
