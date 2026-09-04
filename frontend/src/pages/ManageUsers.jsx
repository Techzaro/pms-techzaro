/**
 * ManageUsers.jsx — User Management Page
 *
 * Admin/manager page for managing all system users.
 * Features:
 * - Add new users with full profile (personal info, employment, salary, bank, documents)
 * - Edit existing users
 * - Resign users (marks as inactive)
 * - View user profiles
 * - Drag-and-drop user reordering with sort order persistence
 * - Search by name/email, filter by role/status/time, sort ascending/descending
 * - Paginated user table
 * - Comprehensive form validation for all fields
 * - File upload support for employment documents
 *
 * Access restricted to admin and manager roles.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { MdVisibility, MdEdit, MdDelete } from "react-icons/md";
import { Check, Trash2, SlidersVertical, Download } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { IoSearchOutline } from "react-icons/io5";
import { CiCirclePlus } from "react-icons/ci";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import ConfirmModal from "../components/ConfirmModal";
import ResignationConfirmModal from "../components/ResignationConfirmModal";
import API_URL from "../config/api";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import useDraftGuard from "../hooks/useDraftGuard";
import useAutoSave from "../hooks/useAutoSave";
import AutoSaveIndicator from "../components/AutoSaveIndicator";
import { authToken, getCurrentRole, getUser, setUser, rolePath, normalizeRole } from "../utils/auth";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import { publish } from "../utils/eventBus";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage } from "../utils/notify";
import { usePlanLimits } from "../hooks/useOrgSubscription";
import Pagination from "../components/Pagination";
import { useSubmit } from "../hooks/useSubmit";
import LoadingButton from "../components/LoadingButton";
import CompanyDocuments from "../components/CompanyDocuments";
import MultiSelectDropdown from "../components/MultiSelectDropdown";
import "./ManageUsers.css";

/** Formats CNIC number with dashes: XXXXX-XXXXXXX-X */
const formatCNIC = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return digits.slice(0, 5) + "-" + digits.slice(5);
  return digits.slice(0, 5) + "-" + digits.slice(5, 12) + "-" + digits.slice(12);
};

/** Formats phone number with dashes: 03XX-XXXXXXX */
const formatPhone = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 4) return digits;
  return digits.slice(0, 4) + "-" + digits.slice(4);
};

/** Removes dashes from formatted value for API submission */
const stripDashes = (value) => value.replace(/-/g, "");

/**
 * ManageUsers — Main user management page component.
 * Handles CRUD operations for users, role assignment, resignation, and profile viewing.
 */
function ManageUsers() {
const { t } = useTranslation();
const { canCreateUser, maxUsers, currentUsers, usersRemaining, getLimitMessage, foundingAdminId } = usePlanLimits();
  const notify = useNotification();
  const [users, setUsers] = useState([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showProfPassword, setShowProfPassword] = useState(false);
  const [desgDropdownOpen, setDesgDropdownOpen] = useState(false);
  const [deptDropdownOpen, setDeptDropdownOpen] = useState(false);
  const [desgHighlightedIndex, setDesgHighlightedIndex] = useState(-1);
  const [deptHighlightedIndex, setDeptHighlightedIndex] = useState(-1);
  const desgDropdownRef = useRef(null);
  const deptDropdownRef = useRef(null);
  const desgOptionsRef = useRef(null);
  const deptOptionsRef = useRef(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState({ type: "", value: "" });
  const [avatarRemoveConfirmOpen, setAvatarRemoveConfirmOpen] = useState(false);
  const [requestDeletionConfirmOpen, setRequestDeletionConfirmOpen] = useState(false);
  const [adminDeleteConfirmOpen, setAdminDeleteConfirmOpen] = useState(false);
  const [pendingDeletionUser, setPendingDeletionUser] = useState(null);
  const [deleteGuestConfirmOpen, setDeleteGuestConfirmOpen] = useState(false);
  const [pendingDeleteGuest, setPendingDeleteGuest] = useState(null);
  const [projectInvolvement, setProjectInvolvement] = useState(null);
  const [reassignConfirmOpen, setReassignConfirmOpen] = useState(false);
  const [reassignNow, setReassignNow] = useState(false);
  const [reassignSelectOpen, setReassignSelectOpen] = useState(false);
  const [selectedReassignUser, setSelectedReassignUser] = useState(null);
  const [projectsList, setProjectsList] = useState([]);
  const [newUser, setNewUser] = useState({
    fullName: "",
    fatherName: "",
    idCardNumber: "",
    presentAddress: "",
    permanentAddress: "",
    phoneNumber: "",
    emergencyContactName: "",
    emergencyContactRelation: "",
    emergencyContactPhone: "",
    email: "",
    personalEmail: "",
    professionalEmail: "",
    professionalEmailPassword: "",
    department: "",
    departmentCustom: "",
    designation: "",
    designationCustom: "",
    hiredFor: "",
    employeeCode: "",
    jobStartedDate: "",
    jobEndedDate: "",
    role: "member",
    project_ids: [],
    grossSalary: "",
    appliedVia: "",
    bankName: "",
    bankAccountNumber: "",
    bankAccountTitle: "",
    employmentContract: null,
    offerLetter: null,
    techxaroRegulations: null,
    otherDocument: [],
    avatar: null,
    passwordType: "auto",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState(null);
  const { submitting, run } = useSubmit();
  const [addErrors, setAddErrors] = useState({});
  const ALL_COLUMNS = useMemo(() => [
    { key: "user", label: t("User (Name & Email)", { defaultValue: "User (Name & Email)" }) },
    { key: "role", label: t("Role", { defaultValue: "Role" }) },
    { key: "status", label: t("Status", { defaultValue: "Status" }) },
    { key: "phone_number", label: t("Phone Number", { defaultValue: "Phone Number" }) },
    { key: "father_name", label: t("Father Name", { defaultValue: "Father Name" }) },
    { key: "id_card_number", label: t("CNIC / ID Card", { defaultValue: "CNIC / ID Card" }) },
    { key: "department", label: t("Department", { defaultValue: "Department" }) },
    { key: "designation", label: t("Designation", { defaultValue: "Designation" }) },
    { key: "employee_code", label: t("Employee Code", { defaultValue: "Employee Code" }) },
    { key: "bank_name", label: t("Bank Name", { defaultValue: "Bank Name" }) },
    { key: "bank_account_number", label: t("Bank Account No", { defaultValue: "Bank Account No" }) },
    { key: "bank_account_title", label: t("Bank Account Title", { defaultValue: "Bank Account Title" }) },
    { key: "present_address", label: t("Address", { defaultValue: "Address" }) },
  ], [t]);


  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState(["user", "role", "status"]);
  const [resignConfirmOpen, setResignConfirmOpen] = useState(false);
  const [resignUserId, setResignUserId] = useState(null);
  const [resignUser, setResignUser] = useState(null);
  const [resignImpact, setResignImpact] = useState(null);
  const [resignImpactLoading, setResignImpactLoading] = useState(false);
  const [removeDocConfirmOpen, setRemoveDocConfirmOpen] = useState(false);
  const [pendingRemoveDoc, setPendingRemoveDoc] = useState({ source: "", index: -1, type: "", api: "", label: "" });
  const [existingOtherDocs, setExistingOtherDocs] = useState([]);
  const [editDocItem, setEditDocItem] = useState(null);
  const [editDocForm, setEditDocForm] = useState({ title: "" });
  const [editDocNewFile, setEditDocNewFile] = useState(null);
  const [editDocDeleted, setEditDocDeleted] = useState(false);
  const [editDocDeleteConfirm, setEditDocDeleteConfirm] = useState(false);
  const [companyDocsOpen, setCompanyDocsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Tab management: employees vs guests
  const [activeTab, setActiveTab] = useState("employees");

  // Guest management state
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState(null);
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const [guestSearch, setGuestSearch] = useState("");
  const [guestPage, setGuestPage] = useState(1);
  const [guestConfirmModal, setGuestConfirmModal] = useState({ open: false, type: "", guest: null });
  const [newGuest, setNewGuest] = useState({ name: "", personal_email: "", phone_number: "", company_name: "", avatar: null, _existingAvatar: null });
  const [guestErrors, setGuestErrors] = useState({});

  const [localUsers, setLocalUsers] = useState([]);
  const [activeDragId, setActiveDragId] = useState(null);
  const [emailMode, setEmailMode] = useState("single");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const localUsersRef = useRef(localUsers);
  localUsersRef.current = localUsers;

  const [currentUserId, setCurrentUserId] = useState(() => {
    const user = getUser();
    return user?.id ? Number(user.id) : null;
  });
  const [currentUserRole, setCurrentUserRole] = useState(
    getCurrentRole() || ""
  );

  // Dynamic departments and designations from users data + localStorage persistence
  const [deletedDesignations, setDeletedDesignations] = useState(() => {
    try { return JSON.parse(localStorage.getItem("deleted_designations") || "[]"); } catch { return []; }
  });
  const [deletedDepartments, setDeletedDepartments] = useState(() => {
    try { return JSON.parse(localStorage.getItem("deleted_departments") || "[]"); } catch { return []; }
  });

  const departments = [
    ...new Set([
      ...users.filter(Boolean).map((u) => u.department).filter(Boolean),
      ...(() => {
        try { return JSON.parse(localStorage.getItem("persisted_departments") || "[]"); } catch { return []; }
      })(),
    ]),
  ].filter((d) => !deletedDepartments.includes(d));
  const designations = [
    ...new Set([
      ...users.filter(Boolean).map((u) => u.designation).filter(Boolean),
      ...(() => {
        try { return JSON.parse(localStorage.getItem("persisted_designations") || "[]"); } catch { return []; }
      })(),
    ]),
  ].filter((d) => !deletedDesignations.includes(d));

  const ResignIcon = ({ className = "" }) => (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 7.5h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="6" y="9" width="12" height="6" rx="1" fill="currentColor" />
    </svg>
  );

  const StatusBadge = ({ active, mustChangePassword, status }) => {
    let label, className;
    const st = status ? status.toLowerCase() : "";
    if (st === "resigned") {
      label = t("Resigned", { defaultValue: "Resigned" });
      className = "status-resigned";
    } else if (st === "inactive" || (!active && mustChangePassword)) {
      label = t("Inactive", { defaultValue: "Inactive" });
      className = "status-inactive";
    } else if (st === "active" || active) {
      label = t("Active", { defaultValue: "Active" });
      className = "status-active";
    } else {
      label = active ? t("Active", { defaultValue: "Active" }) : t("Inactive", { defaultValue: "Inactive" });
      className = active ? "status-active" : "status-inactive";
    }
    return <span className={`status-badge ${className}`}>{label}</span>;
  };

  /** Returns auth headers for API requests */
  const authHeaders = () => {
    const token = authToken();
    return {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    };
  };

  // Fetch all users from API and normalize active status
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/users`, {
        headers: { Accept: "application/json", ...authHeaders() },
        skipLoader: true,
        _notifHandled: true,
      });
      if (!res.ok) throw new Error("Unable to load users");
      const data = await res.json();
      const usersData = (Array.isArray(data.users ?? data) ? (data.users ?? data) : []).filter(Boolean).map((user) => ({
        ...user,
        active: user.active !== false,
      }));
      setUsers(usersData);
    } catch (error) {
      console.error(error);
      notify.error(t("Unable to load users. Please login again if required.", { defaultValue: "Unable to load users. Please login again if required." }));
    } finally {
      setLoading(false);
    }
  };

  // Fetch current user data to ensure local session info is up-to-date
  const fetchCurrentUser = async () => {
    try {
      const token = authToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/user`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.id) {
        setCurrentUserId(data.id);
        setCurrentUserRole(data.role || "");
        const role = getCurrentRole();
        setUser(role, data);
      }
    } catch {
      // ignore
    }
  };

  const fetchProjects = async () => {
    try {
      const token = authToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/projects`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.projects || []);
      setProjectsList(list);
    } catch {
      // ignore
    }
  };

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const role = getCurrentRole();
    const token = authToken();
    if (!token || (role !== "admin" && role !== "manager")) {
      navigate(rolePath("dashboard"));
      return;
    }
    const user = getUser();
    setCurrentUserId(user?.id ? Number(user.id) : null);
    setCurrentUserRole(role);
    if (!user?.id) {
      fetchCurrentUser();
    }
    fetchUsers();
  }, [navigate]);

  useAutoRefresh(fetchUsers, { events: ["data:changed"] });

  useEffect(() => {
    setLocalUsers(users);
  }, [users]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    const editGuestId = searchParams.get("editGuest");
    if (tab === "guests") {
      setActiveTab("guests");
    }
    if (editGuestId && localUsers.length > 0) {
      const guest = localUsers.find((u) => String(u.id) === String(editGuestId) && u.role === "guest");
      if (guest) {
        openGuestModal(guest);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, localUsers]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (desgDropdownRef.current && !desgDropdownRef.current.contains(e.target)) {
        setDesgDropdownOpen(false);
      }
      if (deptDropdownRef.current && !deptDropdownRef.current.contains(e.target)) {
        setDeptDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => { setDesgHighlightedIndex(-1); }, [desgDropdownOpen]);
  useEffect(() => { setDeptHighlightedIndex(-1); }, [deptDropdownOpen]);

  useEffect(() => {
    if (desgHighlightedIndex >= 0 && desgOptionsRef.current) {
      const items = desgOptionsRef.current.children;
      if (items[desgHighlightedIndex]) items[desgHighlightedIndex].scrollIntoView({ block: "nearest" });
    }
  }, [desgHighlightedIndex]);

  useEffect(() => {
    if (deptHighlightedIndex >= 0 && deptOptionsRef.current) {
      const items = deptOptionsRef.current.children;
      if (items[deptHighlightedIndex]) items[deptHighlightedIndex].scrollIntoView({ block: "nearest" });
    }
  }, [deptHighlightedIndex]);

  // Drag-and-drop handlers for user row reordering
  const handleDragStart = useCallback((event) => {
    setActiveDragId(event.active.id);
  }, []);

  // Reorder users locally and persist new sort order to API
  const handleDragEnd = useCallback((event) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const items = localUsersRef.current;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(items, oldIndex, newIndex);
    setLocalUsers(reordered);
    const payload = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
    fetch(`${API_URL}/users/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ items: payload }),
      _notifHandled: true,
    }).catch(() => {});
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
  }, []);

  const openModal = () => {
    setEditingUser(null);
    setAddErrors({});
    setShowProfPassword(false);
    setExistingOtherDocs([]);
    setNewUser({
      fullName: "",
      fatherName: "",
      idCardNumber: "",
      presentAddress: "",
      permanentAddress: "",
      phoneNumber: "",
      emergencyContactName: "",
      emergencyContactRelation: "",
      emergencyContactPhone: "",
      email: "",
      personalEmail: "",
      professionalEmail: "",
      professionalEmailPassword: "",
      department: "",
      departmentCustom: "",
      designation: "",
      designationCustom: "",
      hiredFor: "",
      employeeCode: "",
      jobStartedDate: "",
      jobEndedDate: "",
      role: "member",
      project_ids: [],
      grossSalary: "",
      appliedVia: "",
      bankName: "",
      bankAccountNumber: "",
      bankAccountTitle: "",
      employmentContract: null,
      offerLetter: null,
      techxaroRegulations: null,
      otherDocument: [],
      passwordType: "auto",
      password: "",
    });
    setAddErrors({});
    setIsAddModalOpen(true);
  };

  const openEditModal = async (user) => {
    setEditingUser(user);
    setAddErrors({});

    let fullUser = user;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/users/${user.id}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) fullUser = data.user;
      }
    } catch {}

    const deptVal = fullUser.department || "";
    const isCustomDept = !departments.includes(deptVal) && deptVal !== "";
    const desgVal = fullUser.designation || "";
    const isCustomDesg = !designations.includes(desgVal) && desgVal !== "";

    setEditingUser(fullUser);
    setEmailMode(fullUser.email_mode || "single");
    setNewUser({
      fullName: fullUser.name || "",
      fatherName: fullUser.father_name || "",
      idCardNumber: formatCNIC(fullUser.id_card_number || ""),
      presentAddress: fullUser.present_address || fullUser.address || "",
      permanentAddress: fullUser.permanent_address || "",
      phoneNumber: formatPhone(fullUser.phone_number || fullUser.contact_no || ""),
      emergencyContactName: fullUser.emergency_contact_name || "",
      emergencyContactRelation: fullUser.emergency_contact_relation || "",
      emergencyContactPhone: formatPhone(fullUser.emergency_contact_phone || ""),
      email: fullUser.email || "",
      personalEmail: fullUser.personal_email || "",
      professionalEmail: fullUser.professional_email || "",
      professionalEmailPassword: fullUser.professional_email_password || "",
      department: isCustomDept ? "__custom__" : deptVal,
      departmentCustom: isCustomDept ? deptVal : "",
      designation: isCustomDesg ? "__custom__" : desgVal,
      designationCustom: isCustomDesg ? desgVal : "",
      hiredFor: fullUser.hired_for || "",
      employeeCode: fullUser.employee_code || "",
      jobStartedDate: fullUser.job_started_date ? fullUser.job_started_date.substring(0, 10) : "",
      jobEndedDate: fullUser.job_ended_date ? fullUser.job_ended_date.substring(0, 10) : "",
      role: fullUser.role || "member",
      status: fullUser.status || (fullUser.active !== false ? "Active" : "Inactive"),
      grossSalary: fullUser.gross_salary || "",
      appliedVia: fullUser.applied_via || "",
      bankName: fullUser.bank_name || "",
      bankAccountNumber: fullUser.bank_account_number || "",
      bankAccountTitle: fullUser.bank_account_title || "",
      employmentContract: null,
      offerLetter: null,
      techxaroRegulations: null,
      otherDocument: [],
      avatar: null,
      _existingAvatar: fullUser.avatar || null,
      remove_avatar: false,
    });
    // Initialize existing other docs with rename state
    const docs = typeof fullUser.other_document === "string" ? (() => { try { return JSON.parse(fullUser.other_document); } catch { return []; } })() : (fullUser.other_document || []);
    setExistingOtherDocs((Array.isArray(docs) ? docs : []).filter(d => d).map((doc) => {
      const docPath = typeof doc === "string" ? doc : (doc && doc.path ? doc.path : null);
      if (!docPath) return null;
      const docName = typeof doc === "object" && doc.name ? doc.name : docPath.split("/").pop().replace(/^other_document_\d+_\d+_/, "").replace(/\.[^.]+$/, "");
      return { path: docPath, name: docName, renaming: false };
    }).filter(Boolean));
    setIsAddModalOpen(true);
  };

  const closeModal = () => {
    setIsAddModalOpen(false);
    setEditingUser(null);
    setAddErrors({});
    setExistingOtherDocs([]);
    setNewUser({
      fullName: "",
      fatherName: "",
      idCardNumber: "",
      presentAddress: "",
      permanentAddress: "",
      phoneNumber: "",
      emergencyContactName: "",
      emergencyContactRelation: "",
      emergencyContactPhone: "",
      email: "",
      personalEmail: "",
      professionalEmail: "",
      professionalEmailPassword: "",
      department: "",
      departmentCustom: "",
      designation: "",
      designationCustom: "",
      hiredFor: "",
      employeeCode: "",
      jobStartedDate: "",
      jobEndedDate: "",
      role: "member",
      project_ids: [],
      status: "Active",
      grossSalary: "",
      appliedVia: "",
      bankName: "",
      bankAccountNumber: "",
      bankAccountTitle: "",
      employmentContract: null,
      offerLetter: null,
      techxaroRegulations: null,
      otherDocument: [],
      avatar: null,
      _existingAvatar: null,
      remove_avatar: false,
      passwordType: "auto",
      password: "",
    });
  };

  const draftSaveRef = useRef(null);
  const { isDirty: addIsDirty, setIsDirty: setAddIsDirty, handleClose: handleAddClose, ConfirmDialog: AddConfirmDialog } = useDraftGuard(closeModal, {
    draftSaveHandler: () => draftSaveRef.current?.(),
    hasDraftFeature: true,
  });

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
  const markDirty = useCallback(() => { if (userInteractedRef.current) setAddIsDirty(true); }, [setAddIsDirty]);

  const buildDraftBody = useCallback(() => ({
    full_name: newUser.fullName,
    father_name: newUser.fatherName,
    email: newUser.email,
    phone_number: newUser.phoneNumber,
    role: newUser.role,
    designation: newUser.designation === "__custom__" ? newUser.designationCustom : newUser.designation,
    department: newUser.department === "__custom__" ? newUser.departmentCustom : newUser.department,
    id_card_number: newUser.idCardNumber,
    gender: newUser.gender,
    date_of_birth: newUser.dateOfBirth,
    address: newUser.address,
  }), [newUser]);

  const { lastSaved: userLastSaved, isSaving: userSaving, saveNow: userSaveNow } = useAutoSave({
    draftId: null,
    formData: buildDraftBody(),
    moduleType: "user",
    enabled: addIsDirty,
  });

  // ── Guest Management Functions ──
  const openGuestModal = (guest = null) => {
    setGuestErrors({});
    setGuestIsDirty(false);
    if (guest) {
      setEditingGuest(guest);
      setNewGuest({
        name: guest.name || "",
        personal_email: guest.personal_email || guest.email || "",
        phone_number: guest.phone_number || guest.contact_no || "",
        company_name: guest.company_name || "",
        avatar: null,
        _existingAvatar: guest.avatar || null,
      });
    } else {
      setEditingGuest(null);
      setNewGuest({ name: "", personal_email: "", phone_number: "", company_name: "", avatar: null, _existingAvatar: null });
    }
    setIsGuestModalOpen(true);
  };

  const closeGuestModal = () => {
    setIsGuestModalOpen(false);
    setEditingGuest(null);
    setNewGuest({ name: "", personal_email: "", phone_number: "", company_name: "", avatar: null, _existingAvatar: null });
    setGuestErrors({});
  };

  const { isDirty: guestIsDirty, setIsDirty: setGuestIsDirty, handleClose: handleGuestClose, ConfirmDialog: GuestConfirmDialog } = useConfirmOnClose(closeGuestModal);
  useEscapeKey(isGuestModalOpen, handleGuestClose);

  const validateGuestForm = () => {
    const errors = {};
    if (!newGuest.name.trim()) errors.name = t("Client Name is required.", { defaultValue: "Client Name is required." });
    if (!newGuest.personal_email.trim()) {
      errors.personal_email = t("Email is required.", { defaultValue: "Email is required." });
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newGuest.personal_email.trim())) {
      errors.personal_email = t("Please enter a valid email address.", { defaultValue: "Please enter a valid email address." });
    }
    return errors;
  };

  const handleGuestSubmit = async (e) => {
    e.preventDefault();
    const errors = validateGuestForm();
    setGuestErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setGuestSubmitting(true);
    try {
      const token = authToken();
      const isEdit = !!editingGuest;
      const url = isEdit ? `${API_URL}/guests/${editingGuest.id}` : `${API_URL}/guests`;

      const formData = new FormData();
      formData.append("name", newGuest.name.trim());
      formData.append("personal_email", newGuest.personal_email.trim());
      if (newGuest.phone_number.trim()) formData.append("phone_number", newGuest.phone_number.trim());
      if (newGuest.company_name.trim()) formData.append("company_name", newGuest.company_name.trim());

      if (newGuest.avatar) {
        formData.append("avatar", newGuest.avatar);
      }

      if (isEdit && !newGuest.avatar && !newGuest._existingAvatar && editingGuest.avatar) {
        formData.append("avatar_remove", "1");
      }

      if (isEdit) {
        formData.append("_method", "PUT");
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: formData,
        _notifHandled: true,
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.errors) {
          const mapped = {};
          Object.entries(data.errors).forEach(([key, msgs]) => {
            mapped[key] = Array.isArray(msgs) ? msgs[0] : msgs;
          });
          setGuestErrors(mapped);
        }
        notify.error(data.message || (isEdit ? t("Failed to update guest", { defaultValue: "Failed to update guest" }) : t("Failed to create guest", { defaultValue: "Failed to create guest" })));
        return;
      }

      if (isEdit) {
        setUsers((prev) => prev.map((u) => u.id === editingGuest.id ? { ...u, ...data.user } : u));
        showSuccessMessage("Guest", "updated");
      } else {
        setUsers((prev) => [data.user, ...prev]);
        if (data.emailSent !== false) {
          notify.success(t("Guest created. Invitation email sent.", { defaultValue: "Guest created. Invitation email sent." }));
        } else {
          notify.success(t("Guest created successfully.", { defaultValue: "Guest created successfully." }));
        }
      }
      publish("data:changed", { type: "guest", action: isEdit ? "updated" : "created" });
      closeGuestModal();
    } catch (err) {
      notify.error(err.message || t("An error occurred", { defaultValue: "An error occurred" }));
    } finally {
      setGuestSubmitting(false);
    }
  };

  const handleGuestAction = async (type, guest) => {
    const token = authToken();
    if (!token) return;

    setGuestConfirmModal({ open: false, type: "", guest: null });

    try {
      let url, method, body;
      if (type === "resend-invitation") {
        url = `${API_URL}/guests/${guest.id}/resend-invitation`;
        method = "POST";
        body = {};
      } else if (type === "reset-password") {
        url = `${API_URL}/guests/${guest.id}/reset-password`;
        method = "POST";
        body = {};
      } else if (type === "toggle-status") {
        url = `${API_URL}/guests/${guest.id}/toggle-status`;
        method = "PUT";
        body = {};
      } else if (type === "resign") {
        url = `${API_URL}/guests/${guest.id}/resign`;
        method = "PUT";
        body = {};
      } else if (type === "delete") {
        url = `${API_URL}/users/${guest.id}`;
        method = "DELETE";
        body = {};
      } else {
        return;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        _notifHandled: true,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Action failed");

      if (type === "delete") {
        setUsers((prev) => prev.filter((u) => u.id !== guest.id));
        showSuccessMessage("Guest", "deleted");
      } else if (type === "toggle-status") {
        setUsers((prev) => prev.map((u) => u.id === guest.id ? { ...u, active: data.user.active } : u));
        showSuccessMessage("Guest", data.user.active ? "activated" : "deactivated");
      } else if (type === "resign") {
        setUsers((prev) => prev.map((u) => u.id === guest.id ? { ...u, active: false, must_change_password: false } : u));
        showSuccessMessage("Guest", "resigned");
      } else {
        showSuccessMessage("Guest", type === "resend-invitation" ? "invitation resent" : "password reset");
        if (data.email_sent === false) notify.error(t("Email sending failed. Guest not found or invalid email.", { defaultValue: "Email sending failed. Guest not found or invalid email." }));
      }
      publish("data:changed", { type: "guest", action: type });
    } catch (err) {
      notify.error(err.message);
    }
  };
  useEscapeKey(isAddModalOpen, handleAddClose);

  // Validates the add/edit user form and returns errors object
  const validateAddForm = () => {
    const errors = {};
    if (!newUser.fullName.trim()) {
      errors.fullName = t("Full Name is required.", { defaultValue: "Full Name is required." });
    } else if (!/^[a-zA-Z\s]+$/.test(newUser.fullName.trim())) {
      errors.fullName = t("Full Name must contain only letters and spaces.", { defaultValue: "Full Name must contain only letters and spaces." });
    }
    if (!newUser.fatherName.trim()) {
      errors.fatherName = t("Father Name is required.", { defaultValue: "Father Name is required." });
    } else if (!/^[a-zA-Z\s]+$/.test(newUser.fatherName.trim())) {
      errors.fatherName = t("Father Name must contain only letters and spaces.", { defaultValue: "Father Name must contain only letters and spaces." });
    }
    if (!newUser.idCardNumber.trim()) {
      errors.idCardNumber = t("ID Card Number is required.", { defaultValue: "ID Card Number is required." });
    } else if (!/^\d{5}-\d{7}-\d$/.test(newUser.idCardNumber.trim())) {
      errors.idCardNumber = t("CNIC must be in format XXXXX-XXXXXXX-X (13 digits).", { defaultValue: "CNIC must be in format XXXXX-XXXXXXX-X (13 digits)." });
    }
    if (!newUser.presentAddress.trim()) errors.presentAddress = t("Present Address is required.", { defaultValue: "Present Address is required." });
    if (!newUser.phoneNumber.trim()) {
      errors.phoneNumber = t("Phone Number is required.", { defaultValue: "Phone Number is required." });
    } else if (!/^0\d{3}-\d{7}$/.test(newUser.phoneNumber.trim())) {
      errors.phoneNumber = t("Phone Number must be in format 03XX-XXXXXXX.", { defaultValue: "Phone Number must be in format 03XX-XXXXXXX." });
    }
    if (newUser.emergencyContactPhone.trim() && !/^0\d{3}-\d{7}$/.test(newUser.emergencyContactPhone.trim())) {
      errors.emergencyContactPhone = t("Emergency Phone must be in format 03XX-XXXXXXX.", { defaultValue: "Emergency Phone must be in format 03XX-XXXXXXX." });
    }
    if (!newUser.personalEmail.trim()) {
      errors.personalEmail = emailMode === "single" ? t("Email Address is required.", { defaultValue: "Email Address is required." }) : t("Personal Email Address is required.", { defaultValue: "Personal Email Address is required." });
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.personalEmail.trim())) {
      errors.personalEmail = t("Please enter a valid email address.", { defaultValue: "Please enter a valid email address." });
    }
    if (emailMode === "two_emails") {
      if (!newUser.professionalEmail.trim()) {
        errors.professionalEmail = t("Professional / ERP Email Address is required.", { defaultValue: "Professional / ERP Email Address is required." });
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.professionalEmail.trim())) {
        errors.professionalEmail = t("Please enter a valid professional email address.", { defaultValue: "Please enter a valid professional email address." });
      }
      // Validate emails are different
      if (newUser.personalEmail.trim() && newUser.professionalEmail.trim() &&
          newUser.personalEmail.trim().toLowerCase() === newUser.professionalEmail.trim().toLowerCase()) {
        errors.professionalEmail = t("Personal and Professional email addresses must be different.", { defaultValue: "Personal and Professional email addresses must be different." });
      }
      const isExistingProEmail = editingUser && newUser.professionalEmail.trim() === (editingUser.professional_email || "").trim();
      if (newUser.professionalEmail.trim() && !newUser.professionalEmailPassword.trim() && !isExistingProEmail) {
        errors.professionalEmailPassword = t("Password is required when professional email is provided.", { defaultValue: "Password is required when professional email is provided." });
      }
    }
    if (!newUser.department) {
      errors.department = t("Department is required.", { defaultValue: "Department is required." });
    } else if (newUser.department === "__custom__" && !newUser.departmentCustom.trim()) {
      errors.departmentCustom = t("Custom Department is required.", { defaultValue: "Custom Department is required." });
    }
    if (!newUser.designation) {
      errors.designation = t("Designation is required.", { defaultValue: "Designation is required." });
    } else if (newUser.designation === "__custom__" && !newUser.designationCustom.trim()) {
      errors.designationCustom = t("Custom Designation is required.", { defaultValue: "Custom Designation is required." });
    }
if (!newUser.employeeCode.trim()) errors.employeeCode = t("Employee Code is required.", { defaultValue: "Employee Code is required." });
    if (!newUser.jobStartedDate) errors.jobStartedDate = t("Job Start Date is required.", { defaultValue: "Job Start Date is required." });
    if (newUser.grossSalary && newUser.grossSalary.length > 1000) {
      errors.grossSalary = t("Gross Salary must be 1000 characters or less.", { defaultValue: "Gross Salary must be 1000 characters or less." });
    }
    if (newUser.bankAccountNumber.trim() && !/^[\d\s\-a-zA-Z]+$/.test(newUser.bankAccountNumber.trim())) {
      errors.bankAccountNumber = t("Bank Account Number must contain only digits, letters, spaces, or dashes.", { defaultValue: "Bank Account Number must contain only digits, letters, spaces, or dashes." });
    }
    return errors;
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    let formattedValue = value;
    if (name === "idCardNumber") formattedValue = formatCNIC(value);
    if (name === "phoneNumber" || name === "emergencyContactPhone") formattedValue = formatPhone(value);
    setNewUser((prev) => ({ ...prev, [name]: formattedValue }));
    markDirty();
    if (addErrors[name]) {
      setAddErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleCustomRevert = (field) => {
    const customField = field === "department" ? "departmentCustom" : "designationCustom";
    setNewUser((prev) => ({ ...prev, [field]: "", [customField]: "" }));
  };

  const deleteDesignation = (val) => {
    setPendingDelete({ type: "designation", value: val });
    setConfirmDeleteOpen(true);
  };

  const deleteDepartment = (val) => {
    setPendingDelete({ type: "department", value: val });
    setConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = () => {
    const { type, value } = pendingDelete;
    if (type === "designation") {
      setDeletedDesignations((prev) => {
        const next = [...prev, value];
        localStorage.setItem("deleted_designations", JSON.stringify(next));
        return next;
      });
      if (newUser.designation === value) {
        setNewUser((prev) => ({ ...prev, designation: "", designationCustom: "" }));
      }
    } else if (type === "department") {
      setDeletedDepartments((prev) => {
        const next = [...prev, value];
        localStorage.setItem("deleted_departments", JSON.stringify(next));
        return next;
      });
      if (newUser.department === value) {
        setNewUser((prev) => ({ ...prev, department: "", departmentCustom: "" }));
      }
    }
    setConfirmDeleteOpen(false);
    setPendingDelete({ type: "", value: "" });
  };

  const handleUpdateUser = async (user) => {
    if (!user.active) {
      notify.error(t("Resigned users cannot be updated.", { defaultValue: "Resigned users cannot be updated." }));
      return;
    }
    setSavingUserId(user.id);
    try {
      const res = await fetch(`${API_URL}/users/${user.id}`, {
        method: "PUT",
        headers: { Accept: "application/json", ...authHeaders() },
        body: JSON.stringify({ role: user.role }),
        _notifHandled: true,
      });
      if (!res.ok) throw new Error("Unable to update user");
      const data = await res.json();
      setUsers((prev) =>
        prev.map((item) =>
          item.id === user.id
            ? { ...item, role: data.user.role, active: data.user.active }
            : item
        )
      );
      showSuccessMessage("User role", "updated");
      publish('data:changed', { type: 'user', action: 'updated' });
    } catch (error) {
      console.error(error);
      notify.error(t("Failed to update user role.", { defaultValue: "Failed to update user role." }));
    } finally {
      setSavingUserId(null);
    }
  };

  // Mark a user as resigned (inactive) after confirmation
  const handleResignUser = async (userId) => {
    const user = users.find(u => u.id === userId);
    setResignUser(user);
    setResignUserId(userId);
    setResignImpact(null);
    setResignImpactLoading(true);
    setResignConfirmOpen(true);
    try {
      const res = await fetch(`${API_URL}/users/${userId}/resignation-impact`, {
        headers: { Accept: "application/json", ...authHeaders() },
      });
      const data = await res.json();
      if (data.success) setResignImpact(data.impact);
    } catch (err) {
      notify.error(t("Failed to load impact analysis", { defaultValue: "Failed to load impact analysis" }));
      setResignConfirmOpen(false);
    } finally {
      setResignImpactLoading(false);
    }
  };

  // Confirm and execute user resignation via API
  const confirmResignUser = async (data) => {
    setResignConfirmOpen(false);
    setResignUserId(null);
    setResignUser(null);
    setResignImpact(null);

    if (data?.user) {
      setUsers((prev) =>
        prev.map((item) =>
          item.id === data.user.id ? { ...item, active: false, status: "Resigned" } : item
        )
      );
    }
    showSuccessMessage("User", "resigned");
    publish('data:changed', { type: 'user', action: 'resigned' });
  };

  const handleActivateUser = async (user) => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active: true, status: "Active" }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to activate user");
      showSuccessMessage("User", "activated");
      setLocalUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, active: true, status: "Active" } : u));
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, active: true, status: "Active" } : u));
    } catch (err) {
      notify.error(err.message || t("Failed to activate user", { defaultValue: "Failed to activate user" }));
    }
  };

  const handleRequestDeletion = (user) => {
    setPendingDeletionUser(user);
    setRequestDeletionConfirmOpen(true);
  };

  const confirmRequestDeletion = async () => {
    if (!pendingDeletionUser) return;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/users/${pendingDeletionUser.id}/request-deletion`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to request user deletion");
      showSuccessMessage("User deletion request", "submitted to Admin");
      setLocalUsers((prev) => prev.map((u) => u.id === pendingDeletionUser.id ? { ...u, deletion_requested: true } : u));
      setUsers((prev) => prev.map((u) => u.id === pendingDeletionUser.id ? { ...u, deletion_requested: true } : u));
    } catch (err) {
      notify.error(err.message || t("Failed to submit deletion request", { defaultValue: "Failed to submit deletion request" }));
    } finally {
      setRequestDeletionConfirmOpen(false);
      setPendingDeletionUser(null);
    }
  };

  const handleAdminDeleteUser = async (user) => {
    setPendingDeletionUser(user);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/users/${user.id}/project-involvement`, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.has_involvement) {
        setProjectInvolvement(data);
        setReassignConfirmOpen(true);
      } else {
        setAdminDeleteConfirmOpen(true);
      }
    } catch (err) {
      setAdminDeleteConfirmOpen(true);
    }
  };

  const handleReassignChoice = (assignNow) => {
    setReassignNow(assignNow);
    setReassignConfirmOpen(false);
    if (assignNow) {
      setReassignSelectOpen(true);
    } else {
      setAdminDeleteConfirmOpen(true);
    }
  };

  const handleConfirmReassign = async () => {
    if (!selectedReassignUser || !pendingDeletionUser) return;
    try {
      const token = authToken();
      await fetch(`${API_URL}/users/${pendingDeletionUser.id}/reassign-projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ new_user_id: selectedReassignUser.id }),
      });
    } catch (err) {
      // proceed with deletion even if reassign fails
    }
    setReassignSelectOpen(false);
    setSelectedReassignUser(null);
    setAdminDeleteConfirmOpen(true);
  };

  const confirmAdminDeleteUser = async () => {
    if (!pendingDeletionUser) return;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/users/${pendingDeletionUser.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to delete user");
      showSuccessMessage("User", "deleted");
      setLocalUsers((prev) => prev.filter((u) => u.id !== pendingDeletionUser.id));
      setUsers((prev) => prev.filter((u) => u.id !== pendingDeletionUser.id));
    } catch (err) {
      notify.error(err.message || t("Failed to delete user", { defaultValue: "Failed to delete user" }));
    } finally {
      setAdminDeleteConfirmOpen(false);
      setPendingDeletionUser(null);
      setProjectInvolvement(null);
    }
  };

  const handleDeleteGuest = (guest) => {
    setPendingDeleteGuest(guest);
    setDeleteGuestConfirmOpen(true);
  };

  const confirmDeleteGuest = async () => {
    if (!pendingDeleteGuest) return;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/guests/${pendingDeleteGuest.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to delete guest");
      showSuccessMessage("Guest", "deleted");
      setLocalUsers((prev) => prev.filter((u) => u.id !== pendingDeleteGuest.id));
      setUsers((prev) => prev.filter((u) => u.id !== pendingDeleteGuest.id));
    } catch (err) {
      notify.error(err.message || t("Failed to delete guest", { defaultValue: "Failed to delete guest" }));
    } finally {
      setDeleteGuestConfirmOpen(false);
      setPendingDeleteGuest(null);
    }
  };

  const getInitials = (name) => {
    return name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0].toUpperCase())
      .join("");
  };

  const renderUserRow = (user) => {
    const isSelf = currentUserId === user.id;
    const isTargetProtected = user.role === "admin" || user.role === "manager";
    const isResigned = user.status === "Resigned" || user.status === "resigned";
    const canModifyUser =
      !isResigned && !isSelf && !(currentUserRole === "manager" && isTargetProtected);

    return (
      <tr key={user.id} className={isResigned ? "resigned-row" : ""}>
        <td style={{ width: "40%", textAlign: "left" }}>
          <div className="user-info">
            <span className="user-avatar">
              {user.avatar ? (
                <img src={`${API_URL.replace('/api', '')}/storage/${user.avatar}`} alt={user.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                getInitials(user.name)
              )}
            </span>
            <div className="user-details">
              <span className="user-name">{user.name}</span>
              <span className="user-email">{user.professional_email || "—"}</span>
            </div>
          </div>
        </td>
        <td style={{ width: "20%" }}>
          <span className={`role-badge role-${user.role}`}>
            {normalizeRole(user.role)}
          </span>
        </td>
        <td style={{ width: "20%" }}>
          <StatusBadge active={user.active} mustChangePassword={user.must_change_password} status={user.status} />
        </td>
        <td style={{ width: "20%" }}>
          <div className="action-buttons">
            <button
              className="btn-view"
              onClick={() => navigate(rolePath(`manage-users/user-profile/${user.id}`))}
              aria-label={t("View user profile", { defaultValue: "View user profile" })}
            >
              <MdVisibility size={24} />
            </button>
            <button
              className="btn-view"
              onClick={() => openEditModal(user)}
              disabled={!canModifyUser}
              aria-label={t("Edit user", { defaultValue: "Edit user" })}
            >
              <MdEdit size={20} />
            </button>
            {user.active === false && user.status !== "Resigned" && user.status !== "resigned" && (
              <button className="btn-view" style={{ color: "#10b981" }} onClick={() => handleActivateUser(user)} title={t("Activate User", { defaultValue: "Activate User" })}>
                <Check size={18} />
              </button>
            )}
            {currentUserRole === "manager" && !isSelf && !isTargetProtected && (
              <button
                className="btn-view"
                style={{ color: user.deletion_requested ? "#f59e0b" : "#ef4444" }}
                onClick={() => handleRequestDeletion(user)}
                title={user.deletion_requested ? t("Deletion Requested", { defaultValue: "Deletion Requested" }) : t("Request Deletion", { defaultValue: "Request Deletion" })}
                disabled={user.deletion_requested}
              >
                <Trash2 size={18} />
              </button>
            )}
            {currentUserRole === "admin" && !isSelf && (
              <button
                className="btn-view"
style={{ color: foundingAdminId && user.id === foundingAdminId ? "#9ca3af" : "#ef4444" }}
                    onClick={() => {
                      if (foundingAdminId && user.id === foundingAdminId) return;
                      handleAdminDeleteUser(user);
                    }}
                    disabled={foundingAdminId && user.id === foundingAdminId}
                    title={foundingAdminId && user.id === foundingAdminId ? "Founding admin cannot be deleted" : (user.deletion_requested ? t("Approve & Delete User", { defaultValue: "Approve & Delete User" }) : t("Delete User", { defaultValue: "Delete User" }))}
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  // Apply search, role, and status filters to users list (employees only)
  const filteredUsers = localUsers.filter(Boolean).filter((user) => {
    if (user.role === "guest") return false;
    const matchesSearch =
      (user.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.professional_email || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "" || user.role === roleFilter;
    const matchesStatus =
      statusFilter === "" ||
      (statusFilter === "active" && user.active !== false && user.status !== "Resigned" && user.status !== "resigned") ||
      (statusFilter === "inactive" && user.active === false && user.status !== "Resigned" && user.status !== "resigned") ||
      (statusFilter === "resigned" && (user.status === "Resigned" || user.status === "resigned"));
    return matchesSearch && matchesRole && matchesStatus;
  });

  const sortedUsers = sortOrder
    ? [...filteredUsers].sort((a, b) =>
        sortOrder === "asc" ? (a.name || "").localeCompare(b.name || "") : (b.name || "").localeCompare(a.name || "")
      )
    : filteredUsers;

  const showAllUsers = false;
  const totalUserPages = Math.ceil(sortedUsers.length / ITEMS_PER_PAGE);
  const paginatedUsers = sortedUsers.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const activeDragUser = activeDragId ? users.find((u) => u.id === activeDragId) : null;

  /**
   * SortableUserRow — A draggable user row for the users table.
   * Wraps the standard row with @dnd-kit sortable functionality.
   */
  function SortableUserRow({ user, isActive, canModifyUser, isSelf, isTargetProtected, selectedColumns = ["user", "role", "status"] }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: user.id });
    const rowStyle = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.4 : 1,
    };
    const isResigned = user.status === "Resigned" || user.status === "resigned";
    return (
      <tr ref={setNodeRef} className={isResigned ? "resigned-row" : ""} style={rowStyle} {...listeners} {...attributes}>
        {selectedColumns.includes("user") && (
          <td style={{ textAlign: "left" }}>
            <div className="user-info">
              <span className="user-avatar">
                {user.avatar ? (
                  <img src={user.avatar.startsWith('http') ? user.avatar : `${API_URL.replace('/api', '')}/storage/${user.avatar}`} alt={user.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  getInitials(user.name)
                )}
              </span>
              <div className="user-details">
                <span className="user-name">{user.name}</span>
                <span className="user-email">{user.professional_email || user.email || user.personal_email || "—"}</span>
              </div>
            </div>
          </td>
        )}
        {selectedColumns.includes("role") && (
          <td>
            <span className={`role-badge role-${user.role}`}>
              {normalizeRole(user.role)}
            </span>
          </td>
        )}
        {selectedColumns.includes("status") && (
          <td><StatusBadge active={user.active} mustChangePassword={user.must_change_password} status={user.status} /></td>
        )}
        {selectedColumns.includes("phone_number") && <td><span style={{ fontSize: 13, color: "var(--text-dark)" }}>{user.phone_number || user.contact_no || "—"}</span></td>}
        {selectedColumns.includes("father_name") && <td><span style={{ fontSize: 13, color: "var(--text-dark)" }}>{user.father_name || "—"}</span></td>}
        {selectedColumns.includes("id_card_number") && <td><span style={{ fontSize: 13, color: "var(--text-dark)" }}>{user.id_card_number || "—"}</span></td>}
        {selectedColumns.includes("department") && <td><span style={{ fontSize: 13, color: "var(--text-dark)" }}>{user.department || "—"}</span></td>}
        {selectedColumns.includes("designation") && <td><span style={{ fontSize: 13, color: "var(--text-dark)" }}>{user.designation || "—"}</span></td>}
        {selectedColumns.includes("employee_code") && <td><span style={{ fontSize: 13, color: "var(--text-dark)" }}>{user.employee_code || "—"}</span></td>}
        {selectedColumns.includes("bank_name") && <td><span style={{ fontSize: 13, color: "var(--text-dark)" }}>{user.bank_name || "—"}</span></td>}
        {selectedColumns.includes("bank_account_number") && <td><span style={{ fontSize: 13, color: "var(--text-dark)" }}>{user.bank_account_number || "—"}</span></td>}
        {selectedColumns.includes("bank_account_title") && <td><span style={{ fontSize: 13, color: "var(--text-dark)" }}>{user.bank_account_title || "—"}</span></td>}
        {selectedColumns.includes("present_address") && <td><span style={{ fontSize: 13, color: "var(--text-dark)" }}>{user.present_address || "—"}</span></td>}
        <td>
          <div className="action-buttons">
            <button className="btn-view" onClick={() => navigate(rolePath(`manage-users/user-profile/${user.id}`))} aria-label={t("View user profile", { defaultValue: "View user profile" })}><MdVisibility size={24} /></button>
            <button className="btn-view" onClick={() => openEditModal(user)} disabled={!canModifyUser} aria-label={t("Edit user", { defaultValue: "Edit user" })}><MdEdit size={20} /></button>
            {user.active === false && user.status !== "Resigned" && user.status !== "resigned" && (
              <button className="btn-view" style={{ color: "#10b981" }} onClick={() => handleActivateUser(user)} title={t("Activate User", { defaultValue: "Activate User" })}>
                <Check size={18} />
              </button>
            )}
            {currentUserRole === "manager" && !isSelf && !isTargetProtected && (
              <button
                className="btn-view"
                style={{ color: user.deletion_requested ? "#f59e0b" : "#ef4444" }}
                onClick={() => handleRequestDeletion(user)}
                title={user.deletion_requested ? t("Deletion Requested", { defaultValue: "Deletion Requested" }) : t("Request Deletion", { defaultValue: "Request Deletion" })}
                disabled={user.deletion_requested}
              >
                <Trash2 size={18} />
              </button>
            )}
            {currentUserRole === "admin" && !isSelf && (
              <button
                className="btn-view"
style={{ color: foundingAdminId && user.id === foundingAdminId ? "#9ca3af" : "#ef4444" }}
                    onClick={() => {
                      if (foundingAdminId && user.id === foundingAdminId) return;
                      handleAdminDeleteUser(user);
                    }}
                    disabled={foundingAdminId && user.id === foundingAdminId}
                    title={foundingAdminId && user.id === foundingAdminId ? "Founding admin cannot be deleted" : (user.deletion_requested ? t("Approve & Delete User", { defaultValue: "Approve & Delete User" }) : t("Delete User", { defaultValue: "Delete User" }))}
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }


  const scrollToFirstError = (errors) => {
    const fieldOrder = [
      "fullName", "fatherName", "idCardNumber", "phoneNumber",
      "presentAddress", "emergencyContactPhone",
      "personalEmail", "professionalEmail", "professionalEmailPassword",
      "designation", "designationCustom", "department", "departmentCustom",
      "employeeCode", "jobStartedDate", "grossSalary", "bankAccountNumber",
    ];
    setTimeout(() => {
      const modalBody = document.querySelector(".user-modal-content");
      for (const key of fieldOrder) {
        if (errors[key]) {
          const el = document.getElementById(key);
          if (el) {
            if (modalBody) {
              el.scrollIntoView({ block: "center", behavior: "smooth" });
            }
            el.focus();
            break;
          }
        }
      }
    }, 100);
  };

  // ── Edit Document Handlers (same as EditProjectModal) ──
  const openEditDocModal = (type, index, currentName, existingFileName, source) => {
    setEditDocItem({ type, index, currentName, existingFileName, source });
    setEditDocForm({ title: currentName || "" });
    setEditDocNewFile(null);
    setEditDocDeleted(false);
    setEditDocDeleteConfirm(false);
  };

  const handleSaveEditDoc = async () => {
    if (!editDocItem) return;
    const { type, index, source } = editDocItem;
    const isSingleDoc = type !== "other_document";
    const isPending = source === "pending";

    // Pending files: only update local state (no API)
    if (isPending) {
      if (editDocDeleted) {
        if (isSingleDoc) {
          setNewUser((p) => ({ ...p, [type === "employment_contract" ? "employmentContract" : type === "offer_letter" ? "offerLetter" : "techxaroRegulations"]: null }));
        } else {
          setNewUser((p) => ({ ...p, otherDocument: p.otherDocument.filter((_, i) => i !== index) }));
        }
      } else if (editDocNewFile) {
        if (isSingleDoc) {
          setNewUser((p) => ({ ...p, [type === "employment_contract" ? "employmentContract" : type === "offer_letter" ? "offerLetter" : "techxaroRegulations"]: editDocNewFile }));
        } else {
          setNewUser((p) => {
            const updated = [...p.otherDocument];
            updated[index] = { ...updated[index], file: editDocNewFile, customName: editDocForm.title || editDocNewFile.name.replace(/\.[^.]+$/, "") };
            return { ...p, otherDocument: updated };
          });
        }
      } else {
        // Rename only
        if (isSingleDoc) {
          // Single doc — no local rename needed
        } else {
          setNewUser((p) => {
            const updated = [...p.otherDocument];
            updated[index] = { ...updated[index], customName: editDocForm.title };
            return { ...p, otherDocument: updated };
          });
        }
      }
      setEditDocItem(null);
      setEditDocForm({ title: "" });
      setEditDocNewFile(null);
      setEditDocDeleted(false);
      setEditDocDeleteConfirm(false);
      return;
    }

    // Existing files: API calls
    const token = authToken();
    if (!token) return;

    try {
      if (editDocDeleted && !editDocNewFile) {
        // DELETE the document
        const body = { type };
        if (!isSingleDoc) body.index = index;
        const res = await fetch(`${API_URL}/users/${editingUser.id}/document`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || t("Failed to delete document", { defaultValue: "Failed to delete document" }));
        if (data.user) {
          setEditingUser((prev) => ({ ...prev, ...data.user }));
          if (isSingleDoc) {
            setNewUser((prev) => ({ ...prev, [type === "employment_contract" ? "employmentContract" : type === "offer_letter" ? "offerLetter" : "techxaroRegulations"]: null }));
          } else {
            setExistingOtherDocs(data.user.other_document || []);
          }
        }
        notify.success(t("Document deleted successfully", { defaultValue: "Document deleted successfully" }));
      } else if (editDocNewFile) {
        // REPLACE the document
        const formData = new FormData();
        formData.append("doc_type", type);
        if (!isSingleDoc) formData.append("doc_index", index);
        if (editDocForm.title.trim()) formData.append("doc_name", editDocForm.title.trim());
        formData.append("doc_file", editDocNewFile);
        const res = await fetch(`${API_URL}/users/${editingUser.id}/document/replace`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || t("Failed to replace document", { defaultValue: "Failed to replace document" }));
        if (data.user) {
          setEditingUser((prev) => ({ ...prev, ...data.user }));
          if (!isSingleDoc) {
            setExistingOtherDocs(data.user.other_document || []);
          }
        }
        notify.success(t("Document replaced successfully", { defaultValue: "Document replaced successfully" }));
      } else {
        // RENAME only
        if (isSingleDoc) {
          // Single doc rename — no backend API for this, just update local label
        } else {
          const res = await fetch(`${API_URL}/users/${editingUser.id}/document/rename`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ type, index, name: editDocForm.title.trim() }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || t("Failed to rename document", { defaultValue: "Failed to rename document" }));
          if (data.user) {
            setEditingUser((prev) => ({ ...prev, ...data.user }));
            setExistingOtherDocs(data.user.other_document || []);
          }
        }
        notify.success(t("Document renamed successfully", { defaultValue: "Document renamed successfully" }));
      }
    } catch (err) {
      notify.error(err.message);
    } finally {
      setEditDocItem(null);
      setEditDocForm({ title: "" });
      setEditDocNewFile(null);
      setEditDocDeleted(false);
      setEditDocDeleteConfirm(false);
    }
  };

  const handleDeleteDoc = async (type, index) => {
    if (!editingUser) return;
    const token = authToken();
    if (!token) return;

    try {
      const body = { type };
      if (type === "other_document") body.index = index;

      const res = await fetch(`${API_URL}/users/${editingUser.id}/document`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("Failed to delete document", { defaultValue: "Failed to delete document" }));
      if (data.user) {
        setEditingUser((prev) => ({ ...prev, ...data.user }));
        if (type === "other_document") {
          setExistingOtherDocs(data.user.other_document || []);
        } else {
          setNewUser((prev) => ({ ...prev, [type === "employment_contract" ? "employmentContract" : type === "offer_letter" ? "offerLetter" : "techxaroRegulations"]: null }));
        }
      }
      notify.success(t("Document deleted successfully", { defaultValue: "Document deleted successfully" }));
    } catch (err) {
      notify.error(err.message);
    }
  };

  // Submit new user or update existing user via API with FormData (supports file uploads)
  const handleSubmit = async (event, options = {}) => {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    const isDraft = typeof options === "object" && options !== null && options.isDraft === true;

    if (!isDraft) {
      const errors = validateAddForm();
      setAddErrors(errors);
      if (Object.keys(errors).length > 0) {
        scrollToFirstError(errors);
        return;
      }
    }

    const finalDepartment =
      newUser.department === "__custom__" ? newUser.departmentCustom : newUser.department;
    const finalDesignation =
      newUser.designation === "__custom__" ? newUser.designationCustom : newUser.designation;

    // Persist custom department/designation to localStorage so they survive user deletion
    if (finalDepartment && !departments.includes(finalDepartment)) {
      const stored = JSON.parse(localStorage.getItem("persisted_departments") || "[]");
      if (!stored.includes(finalDepartment)) {
        stored.push(finalDepartment);
        localStorage.setItem("persisted_departments", JSON.stringify(stored.sort()));
      }
    }
    if (finalDesignation && !designations.includes(finalDesignation)) {
      const stored = JSON.parse(localStorage.getItem("persisted_designations") || "[]");
      if (!stored.includes(finalDesignation)) {
        stored.push(finalDesignation);
        localStorage.setItem("persisted_designations", JSON.stringify(stored.sort()));
      }
    }

    const formData = new FormData();
    formData.append("name", (newUser.fullName || "").trim() || "Draft User");
    formData.append("email_mode", emailMode);
    if (emailMode === "single") {
      formData.append("email", (newUser.personalEmail || "").trim());
      formData.append("personal_email", newUser.personalEmail || "");
    } else {
      formData.append("email", (newUser.professionalEmail || newUser.personalEmail || "").trim());
      formData.append("personal_email", newUser.personalEmail || "");
    }
    formData.append("father_name", newUser.fatherName);
    formData.append("id_card_number", newUser.idCardNumber);
    formData.append("present_address", newUser.presentAddress);
    formData.append("permanent_address", newUser.permanentAddress);
    formData.append("phone_number", newUser.phoneNumber);
    formData.append("emergency_contact_name", newUser.emergencyContactName);
    formData.append("emergency_contact_relation", newUser.emergencyContactRelation);
    formData.append("emergency_contact_phone", newUser.emergencyContactPhone);
    formData.append("professional_email", newUser.professionalEmail || "");
    if (!editingUser || newUser.professionalEmailPassword) {
      formData.append("professional_email_password", newUser.professionalEmailPassword || "");
    }
    if (!editingUser) {
      formData.append("password_type", newUser.passwordType || "auto");
      if (newUser.passwordType === "manual" && newUser.password) {
        formData.append("password", newUser.password);
      }
    }
    formData.append("department", finalDepartment || "");
    formData.append("designation", finalDesignation || "");
    formData.append("hired_for", newUser.hiredFor);
    formData.append("employee_code", newUser.employeeCode);
    formData.append("job_started_date", newUser.jobStartedDate);
    formData.append("job_ended_date", newUser.jobEndedDate);
    formData.append("role", newUser.role || "member");
    const selectedStatus = isDraft ? "Draft" : (newUser.status || (newUser.active !== false ? "Active" : "Inactive"));
    formData.append("status", selectedStatus);
    formData.append("active", selectedStatus === "Active" ? "1" : "0");
    formData.append("gross_salary", newUser.grossSalary);
    formData.append("applied_via", newUser.appliedVia);
    formData.append("bank_name", newUser.bankName);
    formData.append("bank_account_number", newUser.bankAccountNumber);
    formData.append("bank_account_title", newUser.bankAccountTitle);

    if (newUser.project_ids && newUser.project_ids.length > 0) {
      newUser.project_ids.forEach((pid) => {
        formData.append("project_ids[]", pid);
      });
    }

    const fileFields = [
      "employmentContract", "offerLetter", "techxaroRegulations",
    ];
    const fileApiNames = [
      "employment_contract", "offer_letter", "techxaro_regulations",
    ];
    fileFields.forEach((field, i) => {
      if (newUser[field]) formData.append(fileApiNames[i], newUser[field]);
    });

    // otherDocument supports multiple files
    if (newUser.otherDocument && newUser.otherDocument.length > 0) {
      newUser.otherDocument.forEach((item) => {
        formData.append("other_document[]", item.file);
        formData.append("other_document_names[]", item.customName || item.file.name.replace(/\.[^.]+$/, ""));
      });
    }

    // Send existing docs changes (renames and removals) when editing
    if (editingUser && editingUser.other_document) {
      const originalDocs = typeof editingUser.other_document === "string" ? (() => { try { return JSON.parse(editingUser.other_document); } catch { return []; } })() : (editingUser.other_document || []);
      const safeOriginals = (Array.isArray(originalDocs) ? originalDocs : []).map(d => {
        if (typeof d === "string") return { path: d, name: null };
        if (d && d.path) return d;
        return null;
      }).filter(Boolean);
      if (existingOtherDocs.length !== safeOriginals.length || existingOtherDocs.some((doc, i) => {
        const orig = safeOriginals[i];
        if (!orig || !doc) return true;
        return doc.path !== orig.path || doc.name !== (orig.name || null);
      })) {
        formData.append("existing_other_docs", JSON.stringify(existingOtherDocs));
      }
    }

    // Avatar upload and removal
    if (newUser.avatar) {
      formData.append("avatar", newUser.avatar);
    } else if (newUser.remove_avatar || (editingUser && editingUser.avatar && !newUser._existingAvatar)) {
      formData.append("remove_avatar", "true");
      formData.append("avatar_remove", "1");
    }

    await run(async () => {
      const token = authToken();
      const isEdit = !!editingUser;
      const url = isEdit ? `${API_URL}/users/${editingUser.id}` : `${API_URL}/users`;

      if (isEdit) {
        formData.append('_method', 'PUT');
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: formData,
        _notifHandled: true,
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.errors) {
          const fieldMap = {
            email: "personalEmail", full_name: "fullName",
            personal_email: "personalEmail",
            father_name: "fatherName", id_card_number: "idCardNumber", phone_number: "phoneNumber",
            present_address: "presentAddress", permanent_address: "permanentAddress",
            emergency_contact_name: "emergencyContactName", emergency_contact_relation: "emergencyContactRelation",
            emergency_contact_phone: "emergencyContactPhone", department: "department", designation: "designation",
            hired_for: "hiredFor", employee_code: "employeeCode", role: "role",
            gross_salary: "grossSalary", job_started_date: "jobStartedDate", job_ended_date: "jobEndedDate",
            applied_via: "appliedVia", bank_name: "bankName", bank_account_number: "bankAccountNumber",
            bank_account_title: "bankAccountTitle", password: "password",
          };
          const mapped = {};
          Object.entries(data.errors).forEach(([key, msgs]) => {
            mapped[fieldMap[key] || key] = Array.isArray(msgs) ? msgs[0] : msgs;
          });
          setAddErrors(mapped);
          scrollToFirstError(mapped);
        }
        notify.error(data.message || (isEdit ? t("Unable to update user", { defaultValue: "Unable to update user" }) : t("Unable to create user", { defaultValue: "Unable to create user" })));
        return;
      }

      setAddErrors({});
      if (isEdit) {
        setUsers((prev) => prev.map((item) => item.id === editingUser.id ? { ...item, ...data.user } : item));
        showSuccessMessage("User", "updated");
        publish('data:changed', { type: 'user', action: 'updated' });
      } else {
        setUsers((prev) => [data.user, ...prev]);
        showSuccessMessage("User", "created");
        publish('data:changed', { type: 'user', action: 'created' });
      }
      closeModal();
    });
  };

  const handleSaveDraft = useCallback(async () => {
    if (typeof userSaveNow === "function") {
      draftSaveRef.current = userSaveNow;
      await userSaveNow();
    }
    await handleSubmit(null, { isDraft: true });
  }, [userSaveNow, handleSubmit]);

  const breadcrumbs = [
    { label: t("Users", { defaultValue: "Users" }) },
  ];

  // Guest list derived from users
  const guests = localUsers.filter(Boolean).filter((u) => u.role === "guest");
  const filteredGuests = guests.filter((g) => {
    const q = guestSearch.toLowerCase();
    return (
      (g.name || "").toLowerCase().includes(q) ||
      (g.email || g.professional_email || g.personal_email || "").toLowerCase().includes(q) ||
      (g.company_name || "").toLowerCase().includes(q)
    );
  });
  const sortedGuests = [...filteredGuests].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const guestTotalPages = Math.ceil(sortedGuests.length / ITEMS_PER_PAGE);
  const paginatedGuests = sortedGuests.slice((guestPage - 1) * ITEMS_PER_PAGE, guestPage * ITEMS_PER_PAGE);

  const getGuestInitials = (name) => {
    return (name || "").split(" ").filter(Boolean).map((w) => w[0].toUpperCase()).join("");
  };

  const getGuestStatus = (g) => {
    if (g.active === false && g.must_change_password === false) return { label: t("Resigned", { defaultValue: "Resigned" }), className: "status-resigned" };
    if (g.active === false) return { label: t("Inactive", { defaultValue: "Inactive" }), className: "status-inactive" };
    return { label: t("Active", { defaultValue: "Active" }), className: "status-active" };
  };

  const formatDateShort = (d) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); } catch { return "—"; }
  };

  const handleExportPDF = () => {
    const activeHeaderCols = ALL_COLUMNS.filter((col) => selectedColumns.includes(col.key));
    if (activeHeaderCols.length === 0) {
      notify.error(t("Please select at least one column to export.", { defaultValue: "Please select at least one column to export." }));
      return;
    }

    const doc = new jsPDF({
      orientation: activeHeaderCols.length > 5 ? "landscape" : "portrait",
    });

    doc.setFontSize(16);
    doc.text("System Users Custom Export Report", 14, 18);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(
      `Generated on: ${new Date().toLocaleDateString()} | Active Columns (${activeHeaderCols.length}): ${activeHeaderCols.map(c => c.label).join(", ")}`,
      14,
      25
    );

    const tableColumn = activeHeaderCols.map((col) => col.label);

    const targetUsers = activeTab === "guests" ? paginatedGuests : paginatedUsers;
    const tableRows = targetUsers.map((u) => {
      return activeHeaderCols.map((col) => {
        switch (col.key) {
          case "user":
            return `${u.name || u.fullName || "—"}\n(${u.email || u.personal_email || u.professional_email || "—"})`;
          case "role":
            return (u.role || "member").replace("_", " ").toUpperCase();
          case "status":
            return u.status || (u.active !== false ? "Active" : "Resigned");
          case "phone_number":
            return u.phone_number || u.contact_no || "—";
          case "father_name":
            return u.father_name || "—";
          case "id_card_number":
            return u.id_card_number || "—";
          case "department":
            return u.department || "—";
          case "designation":
            return u.designation || "—";
          case "employee_code":
            return u.employee_code || "—";
          case "bank_name":
            return u.bank_name || "—";
          case "bank_account_number":
            return u.bank_account_number || "—";
          case "bank_account_title":
            return u.bank_account_title || "—";
          case "present_address":
            return u.present_address || "—";
          default:
            return u[col.key] || "—";
        }
      });
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 30,
      theme: "grid",
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 8, cellPadding: 3 },
    });

    doc.save(`users_custom_report_${new Date().toISOString().slice(0, 10)}.pdf`);
    notify.success(t("Exported {{count}} columns for {{usersCount}} users to PDF!", { count: activeHeaderCols.length, usersCount: targetUsers.length, defaultValue: `Exported ${activeHeaderCols.length} columns for ${targetUsers.length} users to PDF!` }));
  };

  return (
    <>
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="manage-users-page">
        <div className="manage-users-header">
          <div>
            <h1>{t("User Management", { defaultValue: "User Management" })}</h1>
            <p>{t("Manage team members, clients (guests), roles and access permissions.", { defaultValue: "Manage team members, clients (guests), roles and access permissions." })}</p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {activeTab === "employees" && (
              <button className="primary-button add-user-button" onClick={() => setCompanyDocsOpen(true)} style={{ background: "var(--color-success-bg)", color: "var(--color-success)", border: "1px solid var(--color-success)" }}>
                {t("Company Documents", { defaultValue: "Company Documents" })}
              </button>
            )}
            {activeTab === "employees" ? (
              <button
                className="primary-button add-user-button"
                onClick={openModal}
                disabled={!canCreateUser}
                title={!canCreateUser ? getLimitMessage('user') : t("Add User", { defaultValue: "Add User" })}
                style={!canCreateUser ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
              >
                <CiCirclePlus fontSize={"21px"} /> {t("Add User", { defaultValue: "Add User" })}
              </button>
            ) : (
              <button className="primary-button add-user-button" onClick={() => openGuestModal()}>
                <CiCirclePlus fontSize={"21px"} /> {t("Add Guest", { defaultValue: "Add Guest" })}
              </button>
            )}
            {!canCreateUser && activeTab === "employees" && (
              <span style={{ fontSize: '12px', color: 'var(--color-warning, #f59e0b)', maxWidth: '200px', lineHeight: 1.3 }}>
                {getLimitMessage('user')}
              </span>
            )}
            <button
              type="button"
              className="primary-button"
              onClick={handleExportPDF}
              style={{
                background: "#ffffff",
                color: "#334155",
                border: "1px solid #cbd5e1",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Download size={16} />
              {t("Export PDF", { defaultValue: "Export PDF" })}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => setShowFilters(!showFilters)}
              style={{
                background: showFilters ? "#4338ca" : "#ffffff",
                color: showFilters ? "#ffffff" : "#334155",
                border: "1px solid #cbd5e1",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <SlidersVertical size={16} />
              {t("Filters", { defaultValue: "Filters" })} {(roleFilter || statusFilter || searchQuery || timeFilter || selectedColumns.length !== 3) ? "•" : ""}
            </button>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="manage-users-tabs">
          <button className={`tab-button ${activeTab === "employees" ? "tab-active" : ""}`} onClick={() => { setActiveTab("employees"); setPage(1); }}>
            <span className="tab-icon">👤</span> {t("Team Members", { defaultValue: "Team Members" })}
            <span className="tab-count">{localUsers.filter((u) => u.role !== "guest").length || ""}</span>
          </button>
          <button className={`tab-button ${activeTab === "guests" ? "tab-active" : ""}`} onClick={() => { setActiveTab("guests"); setGuestPage(1); }}>
            <span className="tab-icon">👥</span> {t("Guests", { defaultValue: "Guests" })}
            <span className="tab-count">{guests.length || ""}</span>
          </button>
        </div>

        {/* ═══════════ EMPLOYEES TAB ═══════════ */}
        {activeTab === "employees" && (
        <>
        {showFilters && (
          <div className="bar" style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px", padding: "16px", background: "var(--bg-card, #ffffff)", border: "1px solid var(--border-color, #e2e8f0)", borderRadius: "12px" }}>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", width: "100%" }}>
              <div className="search-bar" style={{ flex: 1, minWidth: "220px" }}>
                <IoSearchOutline fontSize={"25px"} />
                <input type="text" placeholder={t("Search by name, email, or info...", { defaultValue: "Search by name, email, or info..." })} value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} />
              </div>
              <select className="bar-role" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
                <option value="">{t("All Roles", { defaultValue: "All Roles" })}</option>
                <option value="admin">{t("Admin", { defaultValue: "Admin" })}</option>
                <option value="manager">{t("Manager", { defaultValue: "Manager" })}</option>
                <option value="team_lead">{t("Team Lead", { defaultValue: "Team Lead" })}</option>
                <option value="member">{t("Member", { defaultValue: "Member" })}</option>
                <option value="guest">{t("Guest", { defaultValue: "Guest" })}</option>
              </select>
              <select className="bar-status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                <option value="">{t("All Statuses", { defaultValue: "All Statuses" })}</option>
                <option value="active">{t("Active", { defaultValue: "Active" })}</option>
                <option value="inactive">{t("Inactive", { defaultValue: "Inactive" })}</option>
                <option value="resigned">{t("Resigned", { defaultValue: "Resigned" })}</option>
              </select>
              <select className="reports-filter" value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
                <option value="">{t("All Time", { defaultValue: "All Time" })}</option>
                <option value="7">{t("Last 7 Days", { defaultValue: "Last 7 Days" })}</option>
                <option value="30">{t("Last 30 Days", { defaultValue: "Last 30 Days" })}</option>
                <option value="180">{t("Last 6 Months", { defaultValue: "Last 6 Months" })}</option>
              </select>
              <select className="bar-sort" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                <option value="">{t("Sort By", { defaultValue: "Sort By" })}</option>
                <option value="asc">{t("Ascending", { defaultValue: "Ascending" })}</option>
                <option value="desc">{t("Descending", { defaultValue: "Descending" })}</option>
              </select>
              {(roleFilter || statusFilter || searchQuery || timeFilter || sortOrder) && (
                <button
                  type="button"
                  onClick={() => { setRoleFilter(""); setStatusFilter(""); setSearchQuery(""); setTimeFilter(""); setSortOrder(""); setPage(1); }}
                  style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#ffffff", color: "#dc2626", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                >
                  {t("Clear Filters", { defaultValue: "Clear Filters" })}
                </button>
              )}
            </div>

            {/* Column Selector Box */}
            <div style={{ paddingTop: "12px", borderTop: "1px solid var(--border-color, #f1f5f9)", width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {t("Select Fields / Columns to Display & Export:", { defaultValue: "Select Fields / Columns to Display & Export:" })}
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setSelectedColumns(ALL_COLUMNS.map(c => c.key))}
                    style={{ fontSize: "11px", color: "#4f46e5", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                  >
                    {t("Select All ({{count}})", { count: ALL_COLUMNS.length, defaultValue: `Select All (${ALL_COLUMNS.length})` })}
                  </button>
                  <span style={{ color: "#cbd5e1" }}>|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedColumns(["user", "role", "status"])}
                    style={{ fontSize: "11px", color: "#64748b", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                  >
                    {t("Reset Default", { defaultValue: "Reset Default" })}
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px" }}>
                {ALL_COLUMNS.map((col) => {
                  const isChecked = selectedColumns.includes(col.key);
                  return (
                    <label key={col.key} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: isChecked ? "#0f172a" : "#64748b", fontWeight: isChecked ? 600 : 400, cursor: "pointer", userSelect: "none" }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            if (selectedColumns.length > 1) {
                              setSelectedColumns(selectedColumns.filter((k) => k !== col.key));
                            }
                          } else {
                            setSelectedColumns([...selectedColumns, col.key]);
                          }
                        }}
                        style={{ cursor: "pointer", accentColor: "#4f46e5" }}
                      />
                      {col.label}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="manage-users-table-card">
          <div className="table-card-header">
            <h2>{t("Existing Users", { defaultValue: "Existing Users" })}</h2>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
            <table className="manage-user-table">
              <thead>
                <tr>
                  {selectedColumns.includes("user") && <th>{t("User", { defaultValue: "User" })}</th>}
                  {selectedColumns.includes("role") && <th>{t("Role", { defaultValue: "Role" })}</th>}
                  {selectedColumns.includes("status") && <th>{t("Status", { defaultValue: "Status" })}</th>}
                  {selectedColumns.includes("phone_number") && <th>{t("Phone Number", { defaultValue: "Phone Number" })}</th>}
                  {selectedColumns.includes("father_name") && <th>{t("Father Name", { defaultValue: "Father Name" })}</th>}
                  {selectedColumns.includes("id_card_number") && <th>{t("CNIC / ID Card", { defaultValue: "CNIC / ID Card" })}</th>}
                  {selectedColumns.includes("department") && <th>{t("Department", { defaultValue: "Department" })}</th>}
                  {selectedColumns.includes("designation") && <th>{t("Designation", { defaultValue: "Designation" })}</th>}
                  {selectedColumns.includes("employee_code") && <th>{t("Employee Code", { defaultValue: "Employee Code" })}</th>}
                  {selectedColumns.includes("bank_name") && <th>{t("Bank Name", { defaultValue: "Bank Name" })}</th>}
                  {selectedColumns.includes("bank_account_number") && <th>{t("Bank Account No", { defaultValue: "Bank Account No" })}</th>}
                  {selectedColumns.includes("present_address") && <th>{t("Address", { defaultValue: "Address" })}</th>}
                  <th style={{ width: "120px" }}>{t("Action", { defaultValue: "Action" })}</th>
                </tr>
              </thead>
              <SortableContext items={paginatedUsers.filter(Boolean).map((u) => u.id)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={selectedColumns.length + 1} className="loading-row">{t("Loading users...", { defaultValue: "Loading users..." })}</td>
                    </tr>
                  ) : localUsers.length ? (
                      paginatedUsers.length ? (
                        paginatedUsers.filter(Boolean).map((user) => {
                        const isSelf = currentUserId === user.id;
                        const isTargetProtected = user.role === "admin" || user.role === "manager";
                        const isResigned = user.status === "Resigned" || user.status === "resigned";
                        const canModifyUser = !isResigned && !isSelf && !(currentUserRole === "manager" && isTargetProtected);
                        return (
                          <SortableUserRow key={user.id} user={user} isActive={user.active !== false} canModifyUser={canModifyUser} isSelf={isSelf} isTargetProtected={isTargetProtected} selectedColumns={selectedColumns} />
                        );
                      })
                    ) : (
                      <tr><td colSpan={selectedColumns.length + 1} className="empty-row">{t("No users match your search or filters.", { defaultValue: "No users match your search or filters." })}</td></tr>
                    )
                  ) : (
                    <tr><td colSpan={selectedColumns.length + 1} className="empty-row">{t("No users found yet.", { defaultValue: "No users found yet." })}</td></tr>
                  )}
                </tbody>
              </SortableContext>
            </table>
            <DragOverlay>
              {activeDragUser ? (
                <div className="drag-overlay-item" style={{ padding: '10px 16px' }}>
                  <strong>{activeDragUser.name}</strong> &mdash; {activeDragUser.email}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        {totalUserPages > 1 && (
          <Pagination currentPage={page} totalPages={totalUserPages} onPageChange={setPage} />
        )}
        </>
        )}

        {/* ═══════════ GUESTS TAB ═══════════ */}
        {activeTab === "guests" && (
        <>
        <div className="bar">
          <div className="search-bar">
            <IoSearchOutline fontSize={"25px"} />
            <input type="text" placeholder={t("Search by guest name, email, or company...", { defaultValue: "Search by guest name, email, or company..." })} value={guestSearch} onChange={(e) => { setGuestSearch(e.target.value); setGuestPage(1); }} />
          </div>
        </div>

        <div className="manage-users-table-card">
          <div className="table-card-header">
            <h2>{t("Existing Guests", { defaultValue: "Existing Guests" })}</h2>
          </div>
          <table className="manage-user-table">
            <thead>
              <tr>
                {selectedColumns.includes("user") && <th>{t("Client", { defaultValue: "Client" })}</th>}
                {selectedColumns.includes("role") && <th>{t("Role", { defaultValue: "Role" })}</th>}
                {selectedColumns.includes("status") && <th>{t("Status", { defaultValue: "Status" })}</th>}
                {selectedColumns.includes("phone_number") && <th>{t("Phone Number", { defaultValue: "Phone Number" })}</th>}
                {selectedColumns.includes("father_name") && <th>{t("Father Name", { defaultValue: "Father Name" })}</th>}
                {selectedColumns.includes("id_card_number") && <th>{t("CNIC / ID Card", { defaultValue: "CNIC / ID Card" })}</th>}
                {selectedColumns.includes("department") && <th>{t("Department", { defaultValue: "Department" })}</th>}
                {selectedColumns.includes("designation") && <th>{t("Designation", { defaultValue: "Designation" })}</th>}
                {selectedColumns.includes("employee_code") && <th>{t("Employee Code", { defaultValue: "Employee Code" })}</th>}
                {selectedColumns.includes("bank_name") && <th>{t("Bank Name", { defaultValue: "Bank Name" })}</th>}
                {selectedColumns.includes("bank_account_number") && <th>{t("Bank Account No", { defaultValue: "Bank Account No" })}</th>}
                {selectedColumns.includes("present_address") && <th>{t("Address", { defaultValue: "Address" })}</th>}
                <th style={{ width: "120px" }}>{t("Actions", { defaultValue: "Actions" })}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={selectedColumns.length + 1} className="loading-row">{t("Loading guests...", { defaultValue: "Loading guests..." })}</td></tr>
              ) : paginatedGuests.length > 0 ? (
                paginatedGuests.map((g) => {
                  const st = getGuestStatus(g);
                  return (
                    <tr key={g.id} className={g.active === false ? "resigned-row" : ""}>
                      {selectedColumns.includes("user") && (
                        <td style={{ textAlign: "left" }}>
                          <div className="user-info">
                            <span className="user-avatar">{g.avatar ? <img src={g.avatar.startsWith('http') ? g.avatar : `${API_URL.replace('/api', '')}/storage/${g.avatar}`} alt={g.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : getGuestInitials(g.name)}</span>
                            <div className="user-details">
                              <span className="user-name">{g.name}</span>
                              <span className="user-email">{g.personal_email || g.email || "—"}</span>
                            </div>
                          </div>
                        </td>
                      )}
                      {selectedColumns.includes("role") && <td><span className="role-badge role-guest">{t("Guest", { defaultValue: "Guest" })}</span></td>}
                      {selectedColumns.includes("status") && <td><span className={`status-badge ${st.className}`}>{st.label}</span></td>}
                      {selectedColumns.includes("phone_number") && <td><span style={{ fontSize: 14, color: "var(--text-dark)" }}>{g.phone_number || g.contact_no || "—"}</span></td>}
                      {selectedColumns.includes("father_name") && <td><span style={{ fontSize: 14, color: "var(--text-dark)" }}>{g.father_name || "—"}</span></td>}
                      {selectedColumns.includes("id_card_number") && <td><span style={{ fontSize: 14, color: "var(--text-dark)" }}>{g.id_card_number || "—"}</span></td>}
                      {selectedColumns.includes("department") && <td><span style={{ fontSize: 14, color: "var(--text-dark)" }}>{g.department || "—"}</span></td>}
                      {selectedColumns.includes("designation") && <td><span style={{ fontSize: 14, color: "var(--text-dark)" }}>{g.designation || "—"}</span></td>}
                      {selectedColumns.includes("employee_code") && <td><span style={{ fontSize: 14, color: "var(--text-dark)" }}>{g.employee_code || "—"}</span></td>}
                      {selectedColumns.includes("bank_name") && <td><span style={{ fontSize: 14, color: "var(--text-dark)" }}>{g.bank_name || "—"}</span></td>}
                      {selectedColumns.includes("bank_account_number") && <td><span style={{ fontSize: 14, color: "var(--text-dark)" }}>{g.bank_account_number || "—"}</span></td>}
                      {selectedColumns.includes("present_address") && <td><span style={{ fontSize: 14, color: "var(--text-dark)" }}>{g.present_address || "—"}</span></td>}
                      <td>
                        <div className="action-buttons">
                          <button className="btn-view" title={t("View Profile", { defaultValue: "View Profile" })} onClick={() => navigate(rolePath(`manage-users/user-profile/${g.id}`))} aria-label={t("View guest profile", { defaultValue: "View guest profile" })}>
                            <MdVisibility size={24} />
                          </button>
                          <button className="btn-view" title={t("Edit", { defaultValue: "Edit" })} onClick={() => openGuestModal(g)} aria-label={t("Edit guest", { defaultValue: "Edit guest" })}>
                            <MdEdit size={20} />
                          </button>
                          <button className="btn-view" style={{ color: "#ef4444" }} title={t("Delete Guest", { defaultValue: "Delete Guest" })} onClick={() => handleDeleteGuest(g)} aria-label={t("Delete guest", { defaultValue: "Delete guest" })}>
                            <MdDelete size={20} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan={selectedColumns.length + 1} className="empty-row">
                  {guestSearch ? t("No guests match your search.", { defaultValue: "No guests match your search." }) : t("No guests yet. Click \"Add Guest\" to invite a guest.", { defaultValue: "No guests yet. Click \"Add Guest\" to invite a guest." })}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {guestTotalPages > 1 && (
          <Pagination currentPage={guestPage} totalPages={guestTotalPages} onPageChange={setGuestPage} />
        )}
        </>
        )}

        {/* ===================== ADD USER MODAL ===================== */}
        {isAddModalOpen && createPortal(
          <div className="user-modal-overlay">
            <div
              className="user-modal-content"
              style={{ maxWidth: "1100px", width: "100%" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="user-modal-header">
                <div className="user-header-left">
                  <div className="user-icon-box">👤</div>
                  <div>
                    <h2>{editingUser ? t("Edit User", { defaultValue: "Edit User" }) : t("Add New User", { defaultValue: "Add New User" })}</h2>
                    <p className="modal-subtitle">
                      {editingUser ? t("Update user information and documents.", { defaultValue: "Update user information and documents." }) : t("Register a new user and automatically send login credentials via email.", { defaultValue: "Register a new user and automatically send login credentials via email." })}
                    </p>
                  </div>
                  <AutoSaveIndicator isSaving={userSaving} lastSaved={userLastSaved} />
                </div>
                <div className="user-header-actions">
                  <button type="button" className="task-save-draft-btn" onClick={handleSaveDraft} disabled={!newUser.fullName.trim() && !newUser.email.trim()}>
                    {t("Save Draft", { defaultValue: "Save Draft" })}
                  </button>
                  <LoadingButton type="button" className="primary-button" loading={submitting} onClick={handleSubmit}>
                    {submitting ? (editingUser ? t("Updating User...", { defaultValue: "Updating User..." }) : t("Creating User...", { defaultValue: "Creating User..." })) : (editingUser ? t("Update User", { defaultValue: "Update User" }) : t("Create User", { defaultValue: "Create User" }))}
                  </LoadingButton>
                  <button className="user-modal-close" onClick={handleAddClose}>
                    &#10005;
                  </button>
                </div>
              </div>

              <form id="user-modal-form" className="user-form" onSubmit={handleSubmit} style={{ pointerEvents: submitting ? 'none' : 'auto', opacity: submitting ? 0.7 : 1 }}>
                {/* ===== Profile Photo + Personal Information Row ===== */}
                <div className="personal-info-top-row">
                  <div className="personal-info-fields">
                    <h3 className="form-section-title">{t("Personal Information", { defaultValue: "Personal Information" })}</h3>
                    <div className="user-form-grid">
                      <div className="form-row">
                        <label htmlFor="fullName">{t("Employee Full Name *", { defaultValue: "Employee Full Name *" })}</label>
                        <input type="text" id="fullName" name="fullName" value={newUser.fullName} onChange={handleChange} placeholder={t("Enter full name", { defaultValue: "Enter full name" })} className={addErrors.fullName ? "field-error" : ""} />
                        {addErrors.fullName && <span className="field-error-text">{addErrors.fullName}</span>}
                      </div>
                      <div className="form-row">
                        <label htmlFor="fatherName">{t("Father Name *", { defaultValue: "Father Name *" })}</label>
                        <input type="text" id="fatherName" name="fatherName" value={newUser.fatherName} onChange={handleChange} placeholder={t("Enter father name", { defaultValue: "Enter father name" })} className={addErrors.fatherName ? "field-error" : ""} />
                        {addErrors.fatherName && <span className="field-error-text">{addErrors.fatherName}</span>}
                      </div>
                      <div className="form-row">
                        <label htmlFor="idCardNumber">{t("ID Card Number *", { defaultValue: "ID Card Number *" })}</label>
                        <input type="text" id="idCardNumber" name="idCardNumber" value={newUser.idCardNumber} onChange={handleChange} placeholder="XXXXX-XXXXXXX-X" maxLength={15} className={addErrors.idCardNumber ? "field-error" : ""} />
                        {addErrors.idCardNumber && <span className="field-error-text">{addErrors.idCardNumber}</span>}
                      </div>
                      <div className="form-row">
                        <label htmlFor="phoneNumber">{t("Phone Number *", { defaultValue: "Phone Number *" })}</label>
                        <input type="text" id="phoneNumber" name="phoneNumber" value={newUser.phoneNumber} onChange={handleChange} placeholder={t("03XX-XXXXXXX", { defaultValue: "03XX-XXXXXXX" })} maxLength={12} className={addErrors.phoneNumber ? "field-error" : ""} />
                        {addErrors.phoneNumber && <span className="field-error-text">{addErrors.phoneNumber}</span>}
                      </div>
                    </div>
                  </div>

                  {/* ===== Profile Photo ===== */}
                  <div className="avatar-upload-section">
                    <label className="avatar-upload-label">{t("Profile Photo", { defaultValue: "Profile Photo" })}</label>
                    <div className="avatar-upload-row">
                      <div className="avatar-preview" onClick={() => document.getElementById('avatar-input').click()}>
                        {newUser.avatar ? (
                          <img src={URL.createObjectURL(newUser.avatar)} alt="Avatar preview" />
                        ) : newUser._existingAvatar ? (
                          <img src={`${API_URL.replace('/api', '')}/storage/${newUser._existingAvatar}`} alt="Avatar preview" />
                        ) : (
                          <>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                            <span className="avatar-upload-hint">{t("Click to upload", { defaultValue: "Click to upload" })}</span>
                          </>
                        )}
                      </div>
                      <input id="avatar-input" type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files[0]; if (file) { setNewUser((prev) => ({ ...prev, avatar: file })); markDirty(); } }} />
                      {(newUser.avatar || newUser._existingAvatar) && (
                        <button type="button" className="avatar-remove-btn" onClick={() => setAvatarRemoveConfirmOpen(true)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          {t("Remove", { defaultValue: "Remove" })}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* ===== Address ===== */}
                <h3 className="form-section-title">{t("Address", { defaultValue: "Address" })}</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="presentAddress">{t("Present Address *", { defaultValue: "Present Address *" })}</label>
                    <input type="text" id="presentAddress" name="presentAddress" value={newUser.presentAddress} onChange={handleChange} placeholder={t("Enter present address", { defaultValue: "Enter present address" })} className={addErrors.presentAddress ? "field-error" : ""} />
                    {addErrors.presentAddress && <span className="field-error-text">{addErrors.presentAddress}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="permanentAddress">{t("Permanent Address", { defaultValue: "Permanent Address" })}</label>
                    <input type="text" id="permanentAddress" name="permanentAddress" value={newUser.permanentAddress} onChange={handleChange} placeholder={t("Enter permanent address", { defaultValue: "Enter permanent address" })} />
                  </div>
                </div>

                {/* ===== Emergency Contact ===== */}
                <h3 className="form-section-title">{t("Emergency Contact", { defaultValue: "Emergency Contact" })}</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="emergencyContactName">{t("Name", { defaultValue: "Name" })}</label>
                    <input type="text" id="emergencyContactName" name="emergencyContactName" value={newUser.emergencyContactName} onChange={handleChange} placeholder={t("Emergency contact name", { defaultValue: "Emergency contact name" })} />
                  </div>
                  <div className="form-row">
                    <label htmlFor="emergencyContactRelation">{t("Relation", { defaultValue: "Relation" })}</label>
                    <input type="text" id="emergencyContactRelation" name="emergencyContactRelation" value={newUser.emergencyContactRelation} onChange={handleChange} placeholder={t("e.g. Father, Mother, Spouse", { defaultValue: "e.g. Father, Mother, Spouse" })} />
                  </div>
                  <div className="form-row">
                    <label htmlFor="emergencyContactPhone">{t("Phone", { defaultValue: "Phone" })}</label>
                    <input type="text" id="emergencyContactPhone" name="emergencyContactPhone" value={newUser.emergencyContactPhone} onChange={handleChange} placeholder={t("03XX-XXXXXXX", { defaultValue: "03XX-XXXXXXX" })} maxLength={12} className={addErrors.emergencyContactPhone ? "field-error" : ""} />
                    {addErrors.emergencyContactPhone && <span className="field-error-text">{addErrors.emergencyContactPhone}</span>}
                  </div>
                </div>

                {/* ===== Email Configuration + Password Generation ===== */}
                {!editingUser && emailMode === "single" ? (
                  <div className="email-password-side-by-side">
                    <div>
                      <h3 className="form-section-title">{t("Email Configuration", { defaultValue: "Email Configuration" })}</h3>
                      <div className="user-form-grid" style={{ gridTemplateColumns: "1fr" }}>
                        <div className="form-row">
                          <label>{t("Email Mode", { defaultValue: "Email Mode" })}</label>
                          <div style={{ display: "flex", gap: "24px", marginTop: "8px", alignItems: "center" }}>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: "normal", fontSize: "14px", whiteSpace: "nowrap" }}>
                              <input type="radio" name="emailMode" value="single" checked={emailMode === "single"} onChange={() => { setEmailMode("single"); setNewUser((prev) => ({ ...prev, professionalEmail: "", professionalEmailPassword: "" })); markDirty(); }} />
                              {t("Single Email", { defaultValue: "Single Email" })}
                            </label>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: "normal", fontSize: "14px", whiteSpace: "nowrap" }}>
                              <input type="radio" name="emailMode" value="two_emails" checked={emailMode === "two_emails"} onChange={() => { setEmailMode("two_emails"); markDirty(); }} />
                              {t("Two Emails", { defaultValue: "Two Emails" })}
                            </label>
                          </div>
                          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "6px" }}>
                            {t("Single email for login, notifications, and all communication.", { defaultValue: "Single email for login, notifications, and all communication." })}
                          </p>
                        </div>
                        <div className="form-row">
                          <label htmlFor="personalEmail">{t("Email Address *", { defaultValue: "Email Address *" })}</label>
                          <input type="email" id="personalEmail" name="personalEmail" value={newUser.personalEmail} onChange={(e) => { const val = e.target.value; setNewUser((prev) => ({ ...prev, personalEmail: val })); markDirty(); }} placeholder={t("Enter email address", { defaultValue: "Enter email address" })} className={addErrors.personalEmail ? "field-error" : ""} />
                          {addErrors.personalEmail && <span className="field-error-text">{addErrors.personalEmail}</span>}
                        </div>
                      </div>
                    </div>
                    <div>
                      <h3 className="form-section-title">{t("Password Generation", { defaultValue: "Password Generation" })}</h3>
                      <div className="user-form-grid" style={{ gridTemplateColumns: "1fr" }}>
                        <div className="form-row">
                          <label>{t("Account Password Mode", { defaultValue: "Account Password Mode" })}</label>
                          <div style={{ display: "flex", gap: "24px", marginTop: "8px", alignItems: "center" }}>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: "normal", fontSize: "14px", whiteSpace: "nowrap" }}>
                              <input type="radio" name="passwordType" value="auto" checked={newUser.passwordType !== "manual"} onChange={() => { setNewUser((prev) => ({ ...prev, passwordType: "auto" })); markDirty(); }} />
                              {t("Auto-generated password", { defaultValue: "Auto-generated password" })}
                            </label>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: "normal", fontSize: "14px", whiteSpace: "nowrap" }}>
                              <input type="radio" name="passwordType" value="manual" checked={newUser.passwordType === "manual"} onChange={() => { setNewUser((prev) => ({ ...prev, passwordType: "manual" })); markDirty(); }} />
                              {t("Manually generated password", { defaultValue: "Manually generated password" })}
                            </label>
                          </div>
                        </div>
                        {newUser.passwordType === "manual" && (
                          <div className="form-row">
                            <label htmlFor="userPassword">{t("Initial Account Password *", { defaultValue: "Initial Account Password *" })}</label>
                            <input type="text" id="userPassword" name="password" value={newUser.password || ""} onChange={handleChange} placeholder={t("Enter initial password (min 6 characters)", { defaultValue: "Enter initial password (min 6 characters)" })} className={addErrors.password ? "field-error" : ""} />
                            {addErrors.password && <span className="field-error-text">{addErrors.password}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* ===== Email Accounts (stacked - two emails mode or editing) ===== */}
                    <h3 className="form-section-title">{t("Email Configuration", { defaultValue: "Email Configuration" })}</h3>
                    <div className="user-form-grid">
                      {!editingUser && (
                        <div className="form-row" style={{ gridColumn: "1 / -1" }}>
                          <label>{t("Email Mode", { defaultValue: "Email Mode" })}</label>
                          <div style={{ display: "flex", gap: "24px", marginTop: "8px", alignItems: "center" }}>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: "normal", fontSize: "14px", whiteSpace: "nowrap" }}>
                              <input type="radio" name="emailMode" value="single" checked={emailMode === "single"} onChange={() => { setEmailMode("single"); setNewUser((prev) => ({ ...prev, professionalEmail: "", professionalEmailPassword: "" })); markDirty(); }} />
                              {t("Single Email", { defaultValue: "Single Email" })}
                            </label>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: "normal", fontSize: "14px", whiteSpace: "nowrap" }}>
                              <input type="radio" name="emailMode" value="two_emails" checked={emailMode === "two_emails"} onChange={() => { setEmailMode("two_emails"); markDirty(); }} />
                              {t("Two Emails", { defaultValue: "Two Emails" })}
                            </label>
                          </div>
                          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "6px" }}>
                            {t("Separate personal (information) and professional (ERP authentication) emails.", { defaultValue: "Separate personal (information) and professional (ERP authentication) emails." })}
                          </p>
                        </div>
                      )}
                      <div className="form-row">
                        <label htmlFor="personalEmail">{t("Information / Personal Email *", { defaultValue: "Information / Personal Email *" })}</label>
                        <input type="email" id="personalEmail" name="personalEmail" value={newUser.personalEmail} onChange={handleChange} placeholder={t("Enter personal email address", { defaultValue: "Enter personal email address" })} className={addErrors.personalEmail ? "field-error" : ""} />
                        {addErrors.personalEmail && <span className="field-error-text">{addErrors.personalEmail}</span>}
                      </div>
                      <div className="form-row">
                        <label htmlFor="professionalEmail">{t("ERP / Professional Email *", { defaultValue: "ERP / Professional Email *" })}</label>
                        <input type="email" id="professionalEmail" name="professionalEmail" value={newUser.professionalEmail} onChange={handleChange} placeholder={t("Enter professional email address", { defaultValue: "Enter professional email address" })} className={addErrors.professionalEmail ? "field-error" : ""} />
                        {addErrors.professionalEmail && <span className="field-error-text">{addErrors.professionalEmail}</span>}
                      </div>
                      <div className="form-row">
                        <label htmlFor="professionalEmailPassword">{t("Password of Professional Email", { defaultValue: "Password of Professional Email" })} {editingUser ? "" : "*"}</label>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input type={showProfPassword ? "text" : "password"} id="professionalEmailPassword" name="professionalEmailPassword" value={newUser.professionalEmailPassword} onChange={handleChange} placeholder={editingUser ? t("Leave blank to keep current", { defaultValue: "Leave blank to keep current" }) : t("Enter professional email password", { defaultValue: "Enter professional email password" })} className={addErrors.professionalEmailPassword ? "field-error" : ""} style={{ flex: 1 }} />
                          {editingUser && newUser.professionalEmailPassword && (
                            <button type="button" onClick={() => setShowProfPassword(!showProfPassword)} style={{ background: "none", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "6px 10px", cursor: "pointer", fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                              {showProfPassword ? t("Hide", { defaultValue: "Hide" }) : t("Show", { defaultValue: "Show" })}
                            </button>
                          )}
                        </div>
                        {addErrors.professionalEmailPassword && <span className="field-error-text">{addErrors.professionalEmailPassword}</span>}
                      </div>
                      {editingUser && (
                        <div className="form-row">
                          <label htmlFor="userStatus">{t("Account Status *", { defaultValue: "Account Status *" })}</label>
                          <select
                            id="userStatus"
                            name="userStatus"
                            className="user-field-input"
                            value={newUser.status || (newUser.active !== false ? "Active" : "Inactive")}
                            onChange={(e) => { setNewUser((prev) => ({ ...prev, status: e.target.value })); markDirty(); }}
                            style={{
                              width: "100%",
                              height: "44px",
                              border: "1px solid var(--border-color)",
                              borderRadius: "10px",
                              padding: "0 12px",
                              fontSize: "14px",
                              background: "var(--bg-card)",
                              color: "var(--text-dark)",
                            }}
                          >
                            <option value="Active">{t("Active", { defaultValue: "Active" })}</option>
                            <option value="Inactive">{t("Inactive", { defaultValue: "Inactive" })}</option>
                            <option value="Resigned">{t("Resigned", { defaultValue: "Resigned" })}</option>
                          </select>
                        </div>
                      )}
                    </div>

                    {/* ===== Password Generation (stacked below) ===== */}
                    {!editingUser && (
                      <>
                        <h3 className="form-section-title">{t("Password Generation", { defaultValue: "Password Generation" })}</h3>
                        <div className="user-form-grid">
                          <div className="form-row" style={{ gridColumn: "1 / -1" }}>
                            <label>{t("Account Password Mode", { defaultValue: "Account Password Mode" })}</label>
                            <div style={{ display: "flex", gap: "24px", marginTop: "8px", alignItems: "center" }}>
                              <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: "normal", fontSize: "14px", whiteSpace: "nowrap" }}>
                                <input type="radio" name="passwordType" value="auto" checked={newUser.passwordType !== "manual"} onChange={() => { setNewUser((prev) => ({ ...prev, passwordType: "auto" })); markDirty(); }} />
                                {t("Auto-generated password", { defaultValue: "Auto-generated password" })}
                              </label>
                              <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: "normal", fontSize: "14px", whiteSpace: "nowrap" }}>
                                <input type="radio" name="passwordType" value="manual" checked={newUser.passwordType === "manual"} onChange={() => { setNewUser((prev) => ({ ...prev, passwordType: "manual" })); markDirty(); }} />
                                {t("Manually generated password", { defaultValue: "Manually generated password" })}
                              </label>
                            </div>
                          </div>
                          {newUser.passwordType === "manual" && (
                            <div className="form-row">
                              <label htmlFor="userPassword">{t("Initial Account Password *", { defaultValue: "Initial Account Password *" })}</label>
                              <input type="text" id="userPassword" name="password" value={newUser.password || ""} onChange={handleChange} placeholder={t("Enter initial password (min 6 characters)", { defaultValue: "Enter initial password (min 6 characters)" })} className={addErrors.password ? "field-error" : ""} />
                              {addErrors.password && <span className="field-error-text">{addErrors.password}</span>}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* ===== Employment Details ===== */}
                <h3 className="form-section-title">{t("Employment Details", { defaultValue: "Employment Details" })}</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="designation">{t("Designation / Role *", { defaultValue: "Designation / Role *" })}</label>
                    {newUser.designation === "__custom__" ? (
                      <div className="custom-input-container">
                        <input type="text" id="designationCustom" name="designationCustom" value={newUser.designationCustom} onChange={handleChange} placeholder={t("Enter custom designation", { defaultValue: "Enter custom designation" })} autoFocus className={addErrors.designationCustom ? "field-error" : ""} />
                        <button type="button" className="custom-input-revert" onClick={() => handleCustomRevert("designation")} title={t("Back to list", { defaultValue: "Back to list" })}>&times;</button>
                      </div>
                    ) : (
                      <div className="category-dropdown-container" ref={desgDropdownRef}>
                        <button type="button" className="category-dropdown-trigger" onClick={() => setDesgDropdownOpen((o) => !o)} onKeyDown={(e) => {
                          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                            e.preventDefault();
                            if (!desgDropdownOpen) { setDesgDropdownOpen(true); return; }
                            const total = designations.length + 2;
                            if (e.key === "ArrowDown") setDesgHighlightedIndex((i) => (i < total - 1 ? i + 1 : 0));
                            else setDesgHighlightedIndex((i) => (i > 0 ? i - 1 : total - 1));

                          } else if (e.key === "Enter" && desgDropdownOpen && desgHighlightedIndex >= 0) {
                            e.preventDefault();
                            if (desgHighlightedIndex === 0) {
                              setNewUser((prev) => ({ ...prev, designation: "" }));
                            } else if (desgHighlightedIndex <= designations.length) {
                              setNewUser((prev) => ({ ...prev, designation: designations[desgHighlightedIndex - 1] }));
                            } else {
                              setNewUser((prev) => ({ ...prev, designation: "__custom__" }));
                            }
                            setDesgDropdownOpen(false);
                          } else if (e.key === "Escape" && desgDropdownOpen) {
                            e.preventDefault();
                            setDesgDropdownOpen(false);
                          }
                        }} style={addErrors.designation ? { border: "1px solid var(--color-danger)" } : {}}>
                          {newUser.designation || t("Select Designation", { defaultValue: "Select Designation" })} <span className={`category-dropdown-arrow ${desgDropdownOpen ? "open" : ""}`}>&#9662;</span>
                        </button>
                        {desgDropdownOpen && (
                          <div className="category-dropdown-options" ref={desgOptionsRef}>
                            <div className={`category-dropdown-option ${desgHighlightedIndex === 0 ? "category-dropdown-option--highlighted" : ""}`} onClick={() => { setNewUser((prev) => ({ ...prev, designation: "" })); setDesgDropdownOpen(false); }} onMouseEnter={() => setDesgHighlightedIndex(0)} style={{ fontWeight: !newUser.designation ? "600" : "400", background: !newUser.designation ? "var(--color-primary-bg)" : "transparent" }}>
                              {t("Select Designation", { defaultValue: "Select Designation" })}
                            </div>
                            {designations.map((d, idx) => (
                              <div key={d} className={`category-dropdown-option ${desgHighlightedIndex === idx + 1 ? "category-dropdown-option--highlighted" : ""}`} onClick={() => { setNewUser((prev) => ({ ...prev, designation: d })); setDesgDropdownOpen(false); }} onMouseEnter={() => setDesgHighlightedIndex(idx + 1)} style={{ fontWeight: newUser.designation === d ? "600" : "400", background: newUser.designation === d ? "var(--color-primary-bg)" : "transparent" }}>
                                {d}
                                <span className="category-option-delete" onClick={(e) => { e.stopPropagation(); deleteDesignation(d); }} title={t("Delete", { defaultValue: "Delete" })}>&times;</span>
                              </div>
                            ))}
                            <div className={`category-dropdown-option category-dropdown-custom ${desgHighlightedIndex === designations.length + 1 ? "category-dropdown-option--highlighted" : ""}`} onClick={() => { setNewUser((prev) => ({ ...prev, designation: "__custom__" })); setDesgDropdownOpen(false); }} onMouseEnter={() => setDesgHighlightedIndex(designations.length + 1)}>{t("Custom / Type Here", { defaultValue: "Custom / Type Here" })}</div>
                          </div>
                        )}
                      </div>
                    )}
                    {addErrors.designation && <span className="field-error-text">{addErrors.designation}</span>}
                    {addErrors.designationCustom && <span className="field-error-text">{addErrors.designationCustom}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="department">{t("Department *", { defaultValue: "Department *" })}</label>
                    {newUser.department === "__custom__" ? (
                      <div className="custom-input-container">
                        <input type="text" id="departmentCustom" name="departmentCustom" value={newUser.departmentCustom} onChange={handleChange} placeholder={t("Enter custom department", { defaultValue: "Enter custom department" })} autoFocus className={addErrors.departmentCustom ? "field-error" : ""} />
                        <button type="button" className="custom-input-revert" onClick={() => handleCustomRevert("department")} title={t("Back to list", { defaultValue: "Back to list" })}>&times;</button>
                      </div>
                    ) : (
                      <div className="category-dropdown-container" ref={deptDropdownRef}>
                        <button type="button" className="category-dropdown-trigger" onClick={() => setDeptDropdownOpen((o) => !o)} onKeyDown={(e) => {
                          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                            e.preventDefault();
                            if (!deptDropdownOpen) { setDeptDropdownOpen(true); return; }
                            const total = departments.length + 2;
                            if (e.key === "ArrowDown") setDeptHighlightedIndex((i) => (i < total - 1 ? i + 1 : 0));
                            else setDeptHighlightedIndex((i) => (i > 0 ? i - 1 : total - 1));
                          } else if (e.key === "Enter" && deptDropdownOpen && deptHighlightedIndex >= 0) {
                            e.preventDefault();
                            if (deptHighlightedIndex === 0) {
                              setNewUser((prev) => ({ ...prev, department: "" }));
                            } else if (deptHighlightedIndex <= departments.length) {
                              setNewUser((prev) => ({ ...prev, department: departments[deptHighlightedIndex - 1] }));
                            } else {
                              setNewUser((prev) => ({ ...prev, department: "__custom__" }));
                            }
                            setDeptDropdownOpen(false);
                          } else if (e.key === "Escape" && deptDropdownOpen) {
                            e.preventDefault();
                            setDeptDropdownOpen(false);
                          }
                        }} style={addErrors.department ? { border: "1px solid var(--color-danger)" } : {}}>
                          {newUser.department || t("Select Department", { defaultValue: "Select Department" })} <span className={`category-dropdown-arrow ${deptDropdownOpen ? "open" : ""}`}>&#9662;</span>
                        </button>
                        {deptDropdownOpen && (
                          <div className="category-dropdown-options" ref={deptOptionsRef}>
                            <div className={`category-dropdown-option ${deptHighlightedIndex === 0 ? "category-dropdown-option--highlighted" : ""}`} onClick={() => { setNewUser((prev) => ({ ...prev, department: "" })); setDeptDropdownOpen(false); }} onMouseEnter={() => setDeptHighlightedIndex(0)} style={{ fontWeight: !newUser.department ? "600" : "400", background: !newUser.department ? "var(--color-primary-bg)" : "transparent" }}>
                              {t("Select Department", { defaultValue: "Select Department" })}
                            </div>
                            {departments.map((d, idx) => (
                              <div key={d} className={`category-dropdown-option ${deptHighlightedIndex === idx + 1 ? "category-dropdown-option--highlighted" : ""}`} onClick={() => { setNewUser((prev) => ({ ...prev, department: d })); setDeptDropdownOpen(false); }} onMouseEnter={() => setDeptHighlightedIndex(idx + 1)} style={{ fontWeight: newUser.department === d ? "600" : "400", background: newUser.department === d ? "var(--color-primary-bg)" : "transparent" }}>
                                {d}
                                <span className="category-option-delete" onClick={(e) => { e.stopPropagation(); deleteDepartment(d); }} title={t("Delete", { defaultValue: "Delete" })}>&times;</span>
                              </div>
                            ))}
                            <div className={`category-dropdown-option category-dropdown-custom ${deptHighlightedIndex === departments.length + 1 ? "category-dropdown-option--highlighted" : ""}`} onClick={() => { setNewUser((prev) => ({ ...prev, department: "__custom__" })); setDeptDropdownOpen(false); }} onMouseEnter={() => setDeptHighlightedIndex(departments.length + 1)}>{t("Custom / Type Here", { defaultValue: "Custom / Type Here" })}</div>
                          </div>
                        )}
                      </div>
                    )}
                    {addErrors.department && <span className="field-error-text">{addErrors.department}</span>}
                    {addErrors.departmentCustom && <span className="field-error-text">{addErrors.departmentCustom}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="hiredFor">{t("Hired For", { defaultValue: "Hired For" })}</label>
                    <input type="text" id="hiredFor" name="hiredFor" value={newUser.hiredFor} onChange={handleChange} placeholder={t("e.g. Full-time, Part-time, Contract", { defaultValue: "e.g. Full-time, Part-time, Contract" })} />
                  </div>
                  <div className="form-row">
                    <label htmlFor="employeeCode">{t("Employee Code *", { defaultValue: "Employee Code *" })}</label>
                    <input type="text" id="employeeCode" name="employeeCode" value={newUser.employeeCode} onChange={handleChange} placeholder={t("Enter employee code", { defaultValue: "Enter employee code" })} className={addErrors.employeeCode ? "field-error" : ""} />
                    {addErrors.employeeCode && <span className="field-error-text">{addErrors.employeeCode}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="role">{t("System Role", { defaultValue: "System Role" })}</label>
                    <select id="role" name="role" value={newUser.role} onChange={handleChange}>
                      <option value="team_lead">{t("Team Lead", { defaultValue: "Team Lead" })}</option>
                      <option value="member">{t("Member", { defaultValue: "Member" })}</option>
                      <option value="guest">{t("Guest", { defaultValue: "Guest" })}</option>
                      {getCurrentRole() === "admin" && (
                        <>
                          <option value="admin">{t("Admin", { defaultValue: "Admin" })}</option>
                          <option value="manager">{t("Manager", { defaultValue: "Manager" })}</option>
                        </>
                      )}
                    </select>
                  </div>
                  <div className="form-row">
                    <label htmlFor="jobStartedDate">{t("Job Started Date *", { defaultValue: "Job Started Date *" })}</label>
                    <input type="date" id="jobStartedDate" name="jobStartedDate" value={newUser.jobStartedDate} onChange={handleChange} className={addErrors.jobStartedDate ? "field-error" : ""} />
                    {addErrors.jobStartedDate && <span className="field-error-text">{addErrors.jobStartedDate}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="jobEndedDate">{t("Job Ended Date", { defaultValue: "Job Ended Date" })}</label>
                    <input type="date" id="jobEndedDate" name="jobEndedDate" value={newUser.jobEndedDate} onChange={handleChange} />
                  </div>
                  <div className="form-row">
                    <label htmlFor="appliedVia">{t("Applied Via", { defaultValue: "Applied Via" })}</label>
                    <input type="text" id="appliedVia" name="appliedVia" value={newUser.appliedVia} onChange={handleChange} placeholder={t("e.g. Website, Referral, LinkedIn", { defaultValue: "e.g. Website, Referral, LinkedIn" })} />
                  </div>
                  <div className="form-row" style={{ gridColumn: "1 / -1" }}>
                    <label>{t("Projects", { defaultValue: "Projects" })}</label>
                    <MultiSelectDropdown
                      value={newUser.project_ids || []}
                      onChange={(val) => {
                        setNewUser((prev) => ({ ...prev, project_ids: val }));
                        markDirty();
                      }}
                      options={projectsList.map((p) => ({
                        value: p.id,
                        label: p.title + (p.business_id ? ` (${p.business_id})` : ""),
                      }))}
                      placeholder={t("Select projects to assign...", { defaultValue: "Select projects to assign..." })}
                      searchPlaceholder={t("Search projects...", { defaultValue: "Search projects..." })}
                    />
                  </div>
                </div>

                {/* ===== Salary & Bank ===== */}
                <h3 className="form-section-title">{t("Salary & Bank Details", { defaultValue: "Salary & Bank Details" })}</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="grossSalary">{t("Gross Salary", { defaultValue: "Gross Salary" })}</label>
                    <input type="text" id="grossSalary" name="grossSalary" value={newUser.grossSalary} onChange={handleChange} placeholder={t("e.g. 50000 or Negotiable", { defaultValue: "e.g. 50000 or Negotiable" })} className={addErrors.grossSalary ? "field-error" : ""} />
                    {addErrors.grossSalary && <span className="field-error-text">{addErrors.grossSalary}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="bankName">{t("Bank Name", { defaultValue: "Bank Name" })}</label>
                    <input type="text" id="bankName" name="bankName" value={newUser.bankName} onChange={handleChange} placeholder={t("Enter bank name", { defaultValue: "Enter bank name" })} />
                  </div>
                  <div className="form-row">
                    <label htmlFor="bankAccountNumber">{t("Bank Account Number", { defaultValue: "Bank Account Number" })}</label>
                    <input type="text" id="bankAccountNumber" name="bankAccountNumber" value={newUser.bankAccountNumber} onChange={handleChange} placeholder={t("Enter account number", { defaultValue: "Enter account number" })} className={addErrors.bankAccountNumber ? "field-error" : ""} />
                    {addErrors.bankAccountNumber && <span className="field-error-text">{addErrors.bankAccountNumber}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="bankAccountTitle">{t("Bank Account Title", { defaultValue: "Bank Account Title" })}</label>
                    <input type="text" id="bankAccountTitle" name="bankAccountTitle" value={newUser.bankAccountTitle} onChange={handleChange} placeholder={t("Enter account title", { defaultValue: "Enter account title" })} />
                  </div>
                </div>

                {/* ===== Documents ===== */}
                <h3 className="form-section-title">{t("Documents", { defaultValue: "Documents" })}</h3>
                <div className="user-form-grid">
                  {[
                    { label: t("Employment Contract", { defaultValue: "Employment Contract" }), key: "employmentContract", api: "employment_contract" },
                    { label: t("Offer Letter", { defaultValue: "Offer Letter" }), key: "offerLetter", api: "offer_letter" },
                    { label: t("Techxaro Regulations", { defaultValue: "Techxaro Regulations" }), key: "techxaroRegulations", api: "techxaro_regulations" },
                  ].map(({ label, key, api }) => {
                    const hasNewFile = newUser[key] instanceof File;
                    const hasExistingFile = editingUser && editingUser[api] && !hasNewFile;
                    const fileName = hasNewFile
                      ? newUser[key].name
                      : hasExistingFile
                        ? (typeof editingUser[api] === "string" ? editingUser[api].split("/").pop() : "")
                        : "";
                    const fileSize = hasNewFile ? newUser[key].size : 0;
                    const formatSize = (bytes) => {
                      if (!bytes) return "";
                      if (bytes < 1024) return bytes + " B";
                      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
                      return (bytes / 1048576).toFixed(1) + " MB";
                    };
                    return (
                      <div className="form-row" key={key}>
                        <label htmlFor={key}>{label}</label>
                        {(hasNewFile || hasExistingFile) ? (
                          <div className="mu-attachment-item">
                            <span className="mu-attachment-icon">📄</span>
                            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                              <span className="mu-attachment-name" title={fileName}>{fileName}</span>
                              {hasNewFile && <span className="mu-attachment-size">{formatSize(fileSize)}</span>}
                            </div>
                            <div className="mu-attachment-actions">
                              {hasNewFile && (
                                <>
                                  <button type="button" className="mu-action-btn mu-action-btn-edit" title={t("Edit", { defaultValue: "Edit" })} onClick={() => openEditDocModal(api, -1, label, fileName, "pending")}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                                  </button>
                                  <button type="button" className="mu-action-btn mu-action-btn-delete" title={t("Remove", { defaultValue: "Remove" })} onClick={() => { setPendingRemoveDoc({ type: "fixed", api, index: -1, label }); setRemoveDocConfirmOpen(true); }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                  </button>
                                </>
                              )}
                              {hasExistingFile && (
                                <>
                                  <button type="button" className="mu-action-btn mu-action-btn-edit" title={t("Edit", { defaultValue: "Edit" })} onClick={() => openEditDocModal(api, -1, label, fileName, "existing")}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                                  </button>
                                  <button type="button" className="mu-action-btn mu-action-btn-delete" title={t("Delete", { defaultValue: "Delete" })} onClick={() => { setPendingRemoveDoc({ type: "fixed", api, index: -1, label }); setRemoveDocConfirmOpen(true); }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ) : null}
                        <input
                          type="file"
                          id={key}
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          onChange={(e) => {
                            const f = e.target.files[0];
                            if (f && !["application/pdf","image/jpeg","image/png","image/webp"].includes(f.type)) {
                              notify.error(t("Only PDF and image files are allowed.", { defaultValue: "Only PDF and image files are allowed." }));
                              e.target.value = "";
                              return;
                            }
                            setNewUser((p) => ({ ...p, [key]: f || null }));
                            markDirty();
                          }}
                        />
                      </div>
                    );
                  })}

                  {/* Other Document — right after Previous Salary Slip */}
                  <div className="form-row">
                    <label htmlFor="otherDocument">{t("Other Document", { defaultValue: "Other Document" })}</label>
                    <input
                      type="file"
                      id="otherDocument"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg,.tiff,.tif"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        const valid = [];
                        for (const f of files) {
                          if (!["application/pdf","image/jpeg","image/png","image/webp","image/gif","image/bmp","image/svg+xml","image/tiff"].includes(f.type)) {
                            notify.error(t('"{{name}}" is not a supported file type. Skipped.', { name: f.name, defaultValue: `"${f.name}" is not a supported file type. Skipped.` }));
                            continue;
                          }
                          valid.push(f);
                        }
                        if (valid.length > 0) {
                          setNewUser((p) => ({
                            ...p,
                            otherDocument: [
                              ...p.otherDocument,
                              ...valid.map((f) => ({ file: f, customName: f.name.replace(/\.[^.]+$/, ""), renaming: false })),
                            ],
                           }));
                          markDirty();
                        }
                        e.target.value = "";
                      }}
                    />
                    {newUser.otherDocument.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {newUser.otherDocument.filter(item => item && item.file).map((item, i) => (
                          <div key={i} className="mu-attachment-item">
                            <span className="mu-attachment-icon">📄</span>
                            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                              <span className="mu-attachment-name" title={item.customName || item.file.name}>{item.customName || item.file.name}</span>
                              <span className="mu-attachment-size">{item.file.size < 1024 ? item.file.size + " B" : item.file.size < 1048576 ? (item.file.size / 1024).toFixed(1) + " KB" : (item.file.size / 1048576).toFixed(1) + " MB"}</span>
                            </div>
                            <div className="mu-attachment-actions">
                              <button type="button" className="mu-action-btn mu-action-btn-edit" title={t("Edit", { defaultValue: "Edit" })} onClick={() => openEditDocModal("other_document", i, item.customName, item.file.name, "pending")}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                              </button>
                              <button type="button" className="mu-action-btn mu-action-btn-delete" title={t("Delete", { defaultValue: "Delete" })} onClick={() => { setPendingRemoveDoc({ source: "new", index: i }); setRemoveDocConfirmOpen(true); }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {editingUser && existingOtherDocs.length > 0 && newUser.otherDocument.length === 0 && (
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {existingOtherDocs.filter(doc => doc && doc.path).map((doc, i) => (
                          <div key={i} className="mu-attachment-item">
                            <span className="mu-attachment-icon">📄</span>
                            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                              <span className="mu-attachment-name" title={doc.name || `Document ${i + 1}`}>{doc.name || `Document ${i + 1}`}</span>
                            </div>
                            <div className="mu-attachment-actions">
                              <button type="button" className="mu-action-btn mu-action-btn-edit" title={t("Edit", { defaultValue: "Edit" })} onClick={() => openEditDocModal("other_document", i, doc.name, doc.name, "existing")}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                              </button>
                              <button type="button" className="mu-action-btn mu-action-btn-delete" title={t("Delete", { defaultValue: "Delete" })} onClick={() => { setPendingRemoveDoc({ source: "existing", index: i }); setRemoveDocConfirmOpen(true); }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {editingUser && existingOtherDocs.length === 0 && newUser.otherDocument.length === 0 && (
                      <div style={{ marginTop: 4, fontSize: 13, color: "var(--text-muted)" }}>
                        {t("No documents uploaded", { defaultValue: "No documents uploaded" })}
                      </div>
                    )}
                  </div>


                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

        {AddConfirmDialog}

      </div>
    </DashboardLayout>

    <ResignationConfirmModal
      isOpen={resignConfirmOpen}
      onClose={() => { setResignConfirmOpen(false); setResignUserId(null); setResignUser(null); setResignImpact(null); }}
      onConfirm={confirmResignUser}
      user={resignUser}
      impact={resignImpact}
      loading={resignImpactLoading}
    />

    <ConfirmModal
      isOpen={confirmDeleteOpen}
      onClose={() => { setConfirmDeleteOpen(false); setPendingDelete({ type: "", value: "" }); }}
      onConfirm={handleConfirmDelete}
      title={t("Confirm Deletion", { defaultValue: "Confirm Deletion" })}
      message={t('Are you sure you want to delete "{{value}}"? This action cannot be undone.', { value: pendingDelete.value, defaultValue: `Are you sure you want to delete "${pendingDelete.value}"? This action cannot be undone.` })}
      confirmText={t("Delete", { defaultValue: "Delete" })}
      cancelText={t("Cancel", { defaultValue: "Cancel" })}
      danger
    />

    <ConfirmModal
      isOpen={removeDocConfirmOpen}
      onClose={() => { setRemoveDocConfirmOpen(false); setPendingRemoveDoc({ source: "", index: -1, type: "", api: "", label: "" }); }}
      onConfirm={async () => {
        if (pendingRemoveDoc.type === "fixed") {
          if (editingUser) {
            const token = authToken();
            if (token) {
              try {
                const res = await fetch(`${API_URL}/users/${editingUser.id}/document`, {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ type: pendingRemoveDoc.api }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || t("Failed to delete document", { defaultValue: "Failed to delete document" }));
                if (data.user) setEditingUser((prev) => ({ ...prev, ...data.user }));
                notify.success(t("Document deleted successfully", { defaultValue: "Document deleted successfully" }));
              } catch (err) { notify.error(err.message); }
            }
          } else {
            const stateKey = pendingRemoveDoc.api === "employment_contract" ? "employmentContract" : pendingRemoveDoc.api === "offer_letter" ? "offerLetter" : "techxaroRegulations";
            setNewUser((p) => ({ ...p, [stateKey]: null }));
          }
        } else if (pendingRemoveDoc.source === "existing" && editingUser) {
          const token = authToken();
          if (token) {
            try {
              const res = await fetch(`${API_URL}/users/${editingUser.id}/document`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ type: "other_document", index: pendingRemoveDoc.index }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.message || t("Failed to delete document", { defaultValue: "Failed to delete document" }));
              if (data.user) {
                setEditingUser((prev) => ({ ...prev, ...data.user }));
                setExistingOtherDocs(data.user.other_document || []);
              }
              notify.success(t("Document deleted successfully", { defaultValue: "Document deleted successfully" }));
            } catch (err) { notify.error(err.message); }
          }
        } else if (pendingRemoveDoc.source === "new") {
          setNewUser((p) => ({ ...p, otherDocument: p.otherDocument.filter((_, idx) => idx !== pendingRemoveDoc.index) }));
        }
        setRemoveDocConfirmOpen(false);
        setPendingRemoveDoc({ source: "", index: -1, type: "", api: "", label: "" });
      }}
      title={t("Remove Document", { defaultValue: "Remove Document" })}
      message={t("Are you sure you want to remove this document?", { defaultValue: "Are you sure you want to remove this document?" })}
      confirmText={t("Remove", { defaultValue: "Remove" })}
      cancelText={t("Cancel", { defaultValue: "Cancel" })}
      danger
    />

    <ConfirmModal
      isOpen={avatarRemoveConfirmOpen}
      onClose={() => setAvatarRemoveConfirmOpen(false)}
      onConfirm={() => { setNewUser((prev) => ({ ...prev, avatar: null, _existingAvatar: null, remove_avatar: true })); markDirty(); setAvatarRemoveConfirmOpen(false); }}
      title={t("Remove Photo", { defaultValue: "Remove Photo" })}
      message={t("Are you sure you want to remove this profile photo?", { defaultValue: "Are you sure you want to remove this profile photo?" })}
      confirmText={t("Remove", { defaultValue: "Remove" })}
      cancelText={t("Cancel", { defaultValue: "Cancel" })}
      danger
    />

    {/* Edit Document Modal — same as EditProjectModal edit file popup */}
    {editDocItem && (
      <div style={{ position: "fixed", inset: 0, zIndex: 10003, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }} onClick={() => { setEditDocItem(null); setEditDocNewFile(null); setEditDocDeleted(false); setEditDocDeleteConfirm(false); }}>
        <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: "24px 28px", width: 420, maxWidth: "90vw", boxShadow: "var(--shadow-xl)" }} onClick={(e) => e.stopPropagation()}>
          <h3 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "var(--text-heading)" }}>{t("Edit File", { defaultValue: "Edit File" })}</h3>
          <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--text-secondary)" }}>{t("Rename or replace this file.", { defaultValue: "Rename or replace this file." })}</p>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-dark)", marginBottom: 6 }}>{t("Title", { defaultValue: "Title" })}</label>
            <input type="text" value={editDocForm.title}
              onChange={(e) => setEditDocForm({ title: e.target.value })} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveEditDoc(); }}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border-color)", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", color: "var(--text-heading)" }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-dark)", marginBottom: 6 }}>{t("File", { defaultValue: "File" })}</label>
            {editDocItem.existingFileName && !editDocDeleted && !editDocNewFile ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--bg-card-alt)", border: "1px solid var(--border-color)", borderRadius: 8 }}>
                <span style={{ fontSize: 14 }}>📄</span>
                <span style={{ flex: 1, fontSize: 13, color: "var(--text-dark)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{editDocItem.existingFileName}</span>
                <button type="button" onClick={() => setEditDocDeleteConfirm(true)} className="mu-action-btn mu-action-btn-delete" title={t("Delete current file", { defaultValue: "Delete current file" })} style={{ width: 24, height: 24 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              </div>
            ) : editDocNewFile ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--color-success-bg)", border: "1px solid var(--color-success)", borderRadius: 8 }}>
                <span style={{ fontSize: 14 }}>📄</span>
                <span style={{ flex: 1, fontSize: 13, color: "var(--color-success)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{editDocNewFile.name}</span>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{(editDocNewFile.size / 1024).toFixed(1)} KB</span>
                <button type="button" onClick={() => { setEditDocNewFile(null); setEditDocDeleted(false); }} style={{ background: "none", border: "none", color: "var(--color-danger)", cursor: "pointer", fontSize: 14, fontWeight: 700, padding: 0 }}>✕</button>
              </div>
            ) : (
              <label style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", padding: "10px 12px", border: "1px dashed var(--border-color)", borderRadius: 8, background: "var(--bg-card-alt)", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer", textAlign: "center" }}>
                {t("Click to select a file", { defaultValue: "Click to select a file" })}
                <input type="file" style={{ display: "none" }}
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.bmp,.svg,.tiff,.tif"
                  onChange={(e) => { if (e.target.files.length > 0) { const f = e.target.files[0]; setEditDocNewFile(f); setEditDocDeleted(false); if (!editDocForm.title) setEditDocForm({ title: f.name.replace(/\.[^.]+$/, "") }); } e.target.value = ""; }} />
              </label>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={() => { setEditDocItem(null); setEditDocNewFile(null); setEditDocDeleted(false); setEditDocDeleteConfirm(false); }}
              style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid var(--border-medium)", background: "var(--bg-card)", color: "var(--text-dark)", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={(e) => e.target.style.background = "var(--bg-card-alt)"} onMouseLeave={(e) => e.target.style.background = "var(--bg-card)"}>{t("Cancel", { defaultValue: "Cancel" })}</button>
            <button type="button" onClick={handleSaveEditDoc}
              style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={(e) => e.target.style.background = "var(--color-primary-dark)"} onMouseLeave={(e) => e.target.style.background = "var(--color-primary)"}>{t("Save", { defaultValue: "Save" })}</button>
          </div>
        </div>
      </div>
    )}

    {/* Edit File Delete Confirmation (nested) */}
    <ConfirmModal
      isOpen={editDocDeleteConfirm}
      onClose={() => setEditDocDeleteConfirm(false)}
      onConfirm={() => { setEditDocDeleteConfirm(false); setEditDocDeleted(true); setEditDocNewFile(null); }}
      title={t("Delete File", { defaultValue: "Delete File" })}
      message={t("Are you sure you want to delete this file? You can upload a new file after.", { defaultValue: "Are you sure you want to delete this file? You can upload a new file after." })}
      confirmText={t("Delete", { defaultValue: "Delete" })}
      cancelText={t("Cancel", { defaultValue: "Cancel" })}
      danger
    />

    <CompanyDocuments
      isOpen={companyDocsOpen}
      onClose={() => setCompanyDocsOpen(false)}
    />

    {/* ===================== GUEST MODAL ===================== */}
    {isGuestModalOpen && createPortal(
      <div className="user-modal-overlay" onClick={handleGuestClose}>
        <div className="user-modal-content" style={{ maxWidth: "560px", width: "100%" }} onClick={(e) => e.stopPropagation()}>
          <div className="user-modal-header">
            <div className="user-header-left">
              <div className="user-icon-box">👥</div>
              <div>
                <h2>{editingGuest ? t("Edit Guest", { defaultValue: "Edit Guest" }) : t("Add New Guest", { defaultValue: "Add New Guest" })}</h2>
              </div>
            </div>
            <div className="user-header-actions">
              <LoadingButton type="button" className="primary-button" loading={guestSubmitting} onClick={handleGuestSubmit}>
                {guestSubmitting ? (editingGuest ? t("Updating...", { defaultValue: "Updating..." }) : t("Creating...", { defaultValue: "Creating..." })) : (editingGuest ? t("Update Guest", { defaultValue: "Update Guest" }) : t("Create Guest", { defaultValue: "Create Guest" }))}
              </LoadingButton>
              <button className="user-modal-close" onClick={handleGuestClose}>&#10005;</button>
            </div>
          </div>
          <form className="user-form" onSubmit={handleGuestSubmit} style={{ pointerEvents: guestSubmitting ? "none" : "auto", opacity: guestSubmitting ? 0.7 : 1 }}>
            {/* ===== Profile Photo ===== */}
            <div className="avatar-upload-section">
              <label className="avatar-upload-label">{t("Profile Photo", { defaultValue: "Profile Photo" })}</label>
              <div className="avatar-upload-row">
                <div className="avatar-preview" onClick={() => document.getElementById('guest-avatar-input').click()}>
                  {newGuest.avatar ? (
                    <img src={URL.createObjectURL(newGuest.avatar)} alt="Avatar preview" />
                  ) : newGuest._existingAvatar ? (
                    <img src={`${API_URL.replace('/api', '')}/storage/${newGuest._existingAvatar}`} alt="Avatar preview" />
                  ) : (
                    <>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <span className="avatar-upload-hint">{t("Click to upload", { defaultValue: "Click to upload" })}</span>
                    </>
                  )}
                </div>
                <input id="guest-avatar-input" type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files[0]; if (file) { setNewGuest((prev) => ({ ...prev, avatar: file })); setGuestIsDirty(true); } }} />
                {(newGuest.avatar || newGuest._existingAvatar) && (
                  <button type="button" className="avatar-remove-btn" onClick={() => setNewGuest((prev) => ({ ...prev, avatar: null, _existingAvatar: null }))}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    {t("Remove", { defaultValue: "Remove" })}
                  </button>
                )}
              </div>
            </div>

            <h3 className="form-section-title">{t("Guest Information", { defaultValue: "Guest Information" })}</h3>
            <div className="user-form-grid">
              <div className="form-row">
                <label htmlFor="guest-name">{t("Guest Name *", { defaultValue: "Guest Name *" })}</label>
                <input type="text" id="guest-name" value={newGuest.name} onChange={(e) => { setNewGuest((p) => ({ ...p, name: e.target.value })); setGuestIsDirty(true); if (guestErrors.name) setGuestErrors((p) => { const n = { ...p }; delete n.name; return n; }); }} placeholder={t("Enter guest / company name", { defaultValue: "Enter guest / company name" })} className={guestErrors.name ? "field-error" : ""} />
                {guestErrors.name && <span className="field-error-text">{guestErrors.name}</span>}
              </div>
              <div className="form-row">
                <label htmlFor="guest-email">{t("Personal Email *", { defaultValue: "Personal Email *" })}</label>
                <input type="email" id="guest-email" value={newGuest.personal_email} onChange={(e) => { setNewGuest((p) => ({ ...p, personal_email: e.target.value })); setGuestIsDirty(true); if (guestErrors.personal_email) setGuestErrors((p) => { const n = { ...p }; delete n.personal_email; return n; }); }} placeholder={t("guest@example.com", { defaultValue: "guest@example.com" })} className={guestErrors.personal_email ? "field-error" : ""} />
                {guestErrors.personal_email && <span className="field-error-text">{guestErrors.personal_email}</span>}
              </div>
              <div className="form-row">
                <label htmlFor="guest-phone">{t("Phone Number", { defaultValue: "Phone Number" })}</label>
                <input type="text" id="guest-phone" value={newGuest.phone_number} onChange={(e) => { setNewGuest((p) => ({ ...p, phone_number: e.target.value })); setGuestIsDirty(true); }} placeholder={t("03XX-XXXXXXX", { defaultValue: "03XX-XXXXXXX" })} />
              </div>
              <div className="form-row">
                <label htmlFor="guest-company">{t("Company Name", { defaultValue: "Company Name" })}</label>
                <input type="text" id="guest-company" value={newGuest.company_name} onChange={(e) => { setNewGuest((p) => ({ ...p, company_name: e.target.value })); setGuestIsDirty(true); }} placeholder={t("Enter company name (optional)", { defaultValue: "Enter company name (optional)" })} />
              </div>
            </div>
          </form>
        </div>
      </div>,
      document.body
    )}

    {GuestConfirmDialog}

    {/* Guest Action Confirmation Modal */}
    <ConfirmModal
      isOpen={guestConfirmModal.open}
      onClose={() => setGuestConfirmModal({ open: false, type: "", guest: null })}
      onConfirm={() => handleGuestAction(guestConfirmModal.type, guestConfirmModal.guest)}
      title={
        guestConfirmModal.type === "resend-invitation" ? t("Resend Invitation", { defaultValue: "Resend Invitation" }) :
        guestConfirmModal.type === "reset-password" ? t("Reset Password", { defaultValue: "Reset Password" }) :
        guestConfirmModal.type === "toggle-status" ? (guestConfirmModal.guest?.active !== false ? t("Deactivate Guest", { defaultValue: "Deactivate Guest" }) : t("Activate Guest", { defaultValue: "Activate Guest" })) :
        guestConfirmModal.type === "resign" ? t("Resign Guest", { defaultValue: "Resign Guest" }) :
        t("Delete Guest", { defaultValue: "Delete Guest" })
      }
      message={
        guestConfirmModal.type === "resend-invitation"
          ? t("A new password will be generated and sent to {{email}}. Continue?", { email: guestConfirmModal.guest?.personal_email || t("the guest", { defaultValue: "the guest" }), defaultValue: `A new password will be generated and sent to ${guestConfirmModal.guest?.personal_email || "the guest"}. Continue?` })
          : guestConfirmModal.type === "reset-password"
          ? t("A new password will be generated and sent to {{email}}. The old password will stop working. Continue?", { email: guestConfirmModal.guest?.personal_email || t("the guest", { defaultValue: "the guest" }), defaultValue: `A new password will be generated and sent to ${guestConfirmModal.guest?.personal_email || "the guest"}. The old password will stop working. Continue?` })
          : guestConfirmModal.type === "toggle-status"
          ? (guestConfirmModal.guest?.active !== false ? t("Are you sure you want to deactivate {{name}}?", { name: guestConfirmModal.guest?.name, defaultValue: `Are you sure you want to deactivate ${guestConfirmModal.guest?.name}?` }) : t("Are you sure you want to activate {{name}}?", { name: guestConfirmModal.guest?.name, defaultValue: `Are you sure you want to activate ${guestConfirmModal.guest?.name}?` }))
          : guestConfirmModal.type === "resign"
          ? t("Are you sure you want to resign {{name}}? They will no longer be able to access the portal.", { name: guestConfirmModal.guest?.name, defaultValue: `Are you sure you want to resign ${guestConfirmModal.guest?.name}? They will no longer be able to access the portal.` })
          : t('Are you sure you want to delete "{{name}}"? This action cannot be undone.', { name: guestConfirmModal.guest?.name, defaultValue: `Are you sure you want to delete "${guestConfirmModal.guest?.name}"? This action cannot be undone.` })
      }
      confirmText={
        guestConfirmModal.type === "resend-invitation" ? t("Resend", { defaultValue: "Resend" }) :
        guestConfirmModal.type === "reset-password" ? t("Reset", { defaultValue: "Reset" }) :
        guestConfirmModal.type === "toggle-status" ? (guestConfirmModal.guest?.active !== false ? t("Deactivate", { defaultValue: "Deactivate" }) : t("Activate", { defaultValue: "Activate" })) :
        guestConfirmModal.type === "resign" ? t("Resign", { defaultValue: "Resign" }) :
        t("Delete", { defaultValue: "Delete" })
      }
      cancelText={t("Cancel", { defaultValue: "Cancel" })}
      danger={guestConfirmModal.type === "delete" || guestConfirmModal.type === "toggle-status" || guestConfirmModal.type === "resign"}
    />

    <ConfirmModal
      isOpen={requestDeletionConfirmOpen}
      onClose={() => { setRequestDeletionConfirmOpen(false); setPendingDeletionUser(null); }}
      onConfirm={confirmRequestDeletion}
      title={t("Request User Deletion", { defaultValue: "Request User Deletion" })}
      message={t('Are you sure you want to request deletion of user "{{name}}"? An Administrator will be notified to review and approve.', { name: pendingDeletionUser?.name, defaultValue: `Are you sure you want to request deletion of user "${pendingDeletionUser?.name}"? An Administrator will be notified to review and approve.` })}
      confirmText={t("Request Deletion", { defaultValue: "Request Deletion" })}
      cancelText={t("Cancel", { defaultValue: "Cancel" })}
      danger
    />

    <ConfirmModal
      isOpen={adminDeleteConfirmOpen}
      onClose={() => { setAdminDeleteConfirmOpen(false); setPendingDeletionUser(null); }}
      onConfirm={confirmAdminDeleteUser}
      title={t("Delete User Account", { defaultValue: "Delete User Account" })}
      message={t('Are you sure you want to permanently delete user "{{name}}"? All associated files and settings will be permanently removed.', { name: pendingDeletionUser?.name, defaultValue: `Are you sure you want to permanently delete user "${pendingDeletionUser?.name}"? All associated files and settings will be permanently removed.` })}
      confirmText={t("Delete User", { defaultValue: "Delete User" })}
      cancelText={t("Cancel", { defaultValue: "Cancel" })}
      danger
    />

    <ConfirmModal
      isOpen={deleteGuestConfirmOpen}
      onClose={() => { setDeleteGuestConfirmOpen(false); setPendingDeleteGuest(null); }}
      onConfirm={confirmDeleteGuest}
      title={t("Delete Guest Account", { defaultValue: "Delete Guest Account" })}
      message={t('Are you sure you want to delete guest "{{name}}"? This action cannot be undone.', { name: pendingDeleteGuest?.name, defaultValue: `Are you sure you want to delete guest "${pendingDeleteGuest?.name}"? This action cannot be undone.` })}
      confirmText={t("Delete Guest", { defaultValue: "Delete Guest" })}
      cancelText={t("Cancel", { defaultValue: "Cancel" })}
      danger
    />

    {/* Project Involvement Reassign Choice Modal */}
    {reassignConfirmOpen && createPortal(
      <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}>
        <div style={{ background: "var(--bg-card, #fff)", borderRadius: 16, padding: "28px 32px", width: 480, maxWidth: "90vw", boxShadow: "0 25px 60px rgba(0,0,0,0.25)" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "var(--text-heading, #111827)" }}>
            {t("User is Project Manager", { defaultValue: "User is Project Manager" })}
          </h3>
          <p style={{ margin: "0 0 8px", fontSize: 14, color: "#6b7280", lineHeight: 1.5 }}>
            {t('User "{{name}}" is involved in the following projects:', { name: pendingDeletionUser?.name, defaultValue: `User "${pendingDeletionUser?.name}" is involved in the following projects:` })}
          </p>
          <div style={{ maxHeight: 120, overflowY: "auto", marginBottom: 16, padding: "8px 12px", background: "#f9fafb", borderRadius: 8, fontSize: 13 }}>
            {projectInvolvement?.created?.length > 0 && (
              <div><strong>{t("Created:", { defaultValue: "Created:" })}</strong> {Object.values(projectInvolvement.created).join(", ")}</div>
            )}
            {projectInvolvement?.assigned?.length > 0 && (
              <div><strong>{t("Assigned:", { defaultValue: "Assigned:" })}</strong> {Object.values(projectInvolvement.assigned).join(", ")}</div>
            )}
            {projectInvolvement?.guest?.length > 0 && (
              <div><strong>{t("Guest:", { defaultValue: "Guest:" })}</strong> {Object.values(projectInvolvement.guest).join(", ")}</div>
            )}
          </div>
          <p style={{ margin: "0 0 20px", fontSize: 14, color: "#374151", fontWeight: 500 }}>
            {t("Do you want to reassign their projects to another user now?", { defaultValue: "Do you want to reassign their projects to another user now?" })}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button
              onClick={() => handleReassignChoice(false)}
              style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#e5e7eb", color: "#374151", cursor: "pointer", fontWeight: 600, fontSize: 14 }}
            >
              {t("Later", { defaultValue: "Later" })}
            </button>
            <button
              onClick={() => handleReassignChoice(true)}
              style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "var(--color-primary, #2563eb)", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 }}
            >
              {t("Reassign Now", { defaultValue: "Reassign Now" })}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* Reassign User Select Modal */}
    {reassignSelectOpen && createPortal(
      <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}>
        <div style={{ background: "var(--bg-card, #fff)", borderRadius: 16, padding: "28px 32px", width: 480, maxWidth: "90vw", boxShadow: "0 25px 60px rgba(0,0,0,0.25)" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "var(--text-heading, #111827)" }}>
            {t("Select New Manager", { defaultValue: "Select New Manager" })}
          </h3>
          <p style={{ margin: "0 0 16px", fontSize: 14, color: "#6b7280" }}>
            {t("Choose a user to take over the projects:", { defaultValue: "Choose a user to take over the projects:" })}
          </p>
          <div style={{ maxHeight: 250, overflowY: "auto", marginBottom: 20, border: "1px solid #e5e7eb", borderRadius: 8 }}>
            {(users || []).filter(u => u.id !== pendingDeletionUser?.id && u.active !== false).map((u) => (
              <div
                key={u.id}
                onClick={() => setSelectedReassignUser(u)}
                style={{
                  padding: "10px 14px",
                  cursor: "pointer",
                  background: selectedReassignUser?.id === u.id ? "#eff6ff" : "transparent",
                  borderBottom: "1px solid #f3f4f6",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 14,
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: selectedReassignUser?.id === u.id ? "var(--color-primary, #2563eb)" : "#e5e7eb",
                  color: selectedReassignUser?.id === u.id ? "#fff" : "#6b7280",
                  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 12, flexShrink: 0,
                }}>
                  {u.name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 500 }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>{u.email}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button
              onClick={() => { setReassignSelectOpen(false); setSelectedReassignUser(null); setReassignConfirmOpen(true); }}
              style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#e5e7eb", color: "#374151", cursor: "pointer", fontWeight: 600, fontSize: 14 }}
            >
              {t("Back", { defaultValue: "Back" })}
            </button>
            <button
              onClick={handleConfirmReassign}
              disabled={!selectedReassignUser}
              style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: selectedReassignUser ? "var(--color-primary, #2563eb)" : "#d1d5db", color: "#fff", cursor: selectedReassignUser ? "pointer" : "not-allowed", fontWeight: 600, fontSize: 14 }}
            >
              {t("Confirm & Delete", { defaultValue: "Confirm & Delete" })}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* Admin Delete User Confirmation Modal (updated) */}
    <ConfirmModal
      isOpen={adminDeleteConfirmOpen}
      onClose={() => { setAdminDeleteConfirmOpen(false); setPendingDeletionUser(null); setProjectInvolvement(null); }}
      onConfirm={confirmAdminDeleteUser}
      title={t("Delete User Account", { defaultValue: "Delete User Account" })}
      message={projectInvolvement?.has_involvement
        ? t('User "{{name}}" will be removed from all projects. Their created projects will be reassigned to the selected user. Continue?', { name: pendingDeletionUser?.name, defaultValue: `User "${pendingDeletionUser?.name}" will be removed from all projects. Their created projects will be reassigned to the selected user. Continue?` })
        : t('Are you sure you want to permanently delete user "{{name}}"? All associated files and settings will be permanently removed.', { name: pendingDeletionUser?.name, defaultValue: `Are you sure you want to permanently delete user "${pendingDeletionUser?.name}"? All associated files and settings will be permanently removed.` })
      }
      confirmText={t("Delete User", { defaultValue: "Delete User" })}
      cancelText={t("Cancel", { defaultValue: "Cancel" })}
      danger
    />
    </>
  );
}

export default ManageUsers;
