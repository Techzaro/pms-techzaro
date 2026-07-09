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
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { MdVisibility, MdEdit } from "react-icons/md";
import { IoSearchOutline } from "react-icons/io5";
import { CiCirclePlus } from "react-icons/ci";
import { useNavigate } from "react-router-dom";
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import ConfirmModal from "../components/ConfirmModal";
import API_URL from "../config/api";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { authToken, getCurrentRole, getUser, setUser, rolePath, normalizeRole } from "../utils/auth";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import { publish } from "../utils/eventBus";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage } from "../utils/notify";
import Pagination from "../components/Pagination";
import { useSubmit } from "../hooks/useSubmit";
import LoadingButton from "../components/LoadingButton";
import CompanyDocuments from "../components/CompanyDocuments";
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
  const notify = useNotification();
  const [users, setUsers] = useState([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showProfPassword, setShowProfPassword] = useState(false);
  const [desgDropdownOpen, setDesgDropdownOpen] = useState(false);
  const [deptDropdownOpen, setDeptDropdownOpen] = useState(false);
  const desgDropdownRef = useRef(null);
  const deptDropdownRef = useRef(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState({ type: "", value: "" });
  const [avatarRemoveConfirmOpen, setAvatarRemoveConfirmOpen] = useState(false);
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
  });
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState(null);
  const { submitting, run } = useSubmit();
  const [addErrors, setAddErrors] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [resignConfirmOpen, setResignConfirmOpen] = useState(false);
  const [resignUserId, setResignUserId] = useState(null);
  const [removeDocConfirmOpen, setRemoveDocConfirmOpen] = useState(false);
  const [pendingRemoveDoc, setPendingRemoveDoc] = useState({ source: "", index: -1 });
  const [existingOtherDocs, setExistingOtherDocs] = useState([]);
  const [companyDocsOpen, setCompanyDocsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const [localUsers, setLocalUsers] = useState([]);
  const [activeDragId, setActiveDragId] = useState(null);
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

  const StatusBadge = ({ active, mustChangePassword }) => {
    let label, className;
    if (active) {
      label = "Active";
      className = "status-active";
    } else if (mustChangePassword) {
      label = "Inactive";
      className = "status-inactive";
    } else {
      label = "Resigned";
      className = "status-resigned";
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
      notify.error("Unable to load users. Please login again if required.");
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
        setUser(role, { id: data.id, name: data.name, email: data.email, role: data.role });
      }
    } catch {
      // ignore
    }
  };

  const navigate = useNavigate();

  useEffect(() => {
    const role = getCurrentRole();
    const token = authToken();
    if (!token || (role !== "admin" && role !== "manager")) {
      navigate("/");
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

  useRefreshOnEvent(["data:changed"], fetchUsers);

  useEffect(() => {
    setLocalUsers(users);
  }, [users]);

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
      grossSalary: "",
      appliedVia: "",
      bankName: "",
      bankAccountNumber: "",
      bankAccountTitle: "",
      employmentContract: null,
      offerLetter: null,
      techxaroRegulations: null,
      otherDocument: [],
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
    });
  };

  useEscapeKey(isAddModalOpen, closeModal);

  // Validates the add/edit user form and returns errors object
  const validateAddForm = () => {
    const errors = {};
    if (!newUser.fullName.trim()) {
      errors.fullName = "Full Name is required.";
    } else if (!/^[a-zA-Z\s]+$/.test(newUser.fullName.trim())) {
      errors.fullName = "Full Name must contain only letters and spaces.";
    }
    if (!newUser.fatherName.trim()) {
      errors.fatherName = "Father Name is required.";
    } else if (!/^[a-zA-Z\s]+$/.test(newUser.fatherName.trim())) {
      errors.fatherName = "Father Name must contain only letters and spaces.";
    }
    if (!newUser.idCardNumber.trim()) {
      errors.idCardNumber = "ID Card Number is required.";
    } else if (!/^\d{5}-\d{7}-\d$/.test(newUser.idCardNumber.trim())) {
      errors.idCardNumber = "CNIC must be in format XXXXX-XXXXXXX-X (13 digits).";
    }
    if (!newUser.presentAddress.trim()) errors.presentAddress = "Present Address is required.";
    if (!newUser.phoneNumber.trim()) {
      errors.phoneNumber = "Phone Number is required.";
    } else if (!/^0\d{3}-\d{7}$/.test(newUser.phoneNumber.trim())) {
      errors.phoneNumber = "Phone Number must be in format 03XX-XXXXXXX.";
    }
    if (newUser.emergencyContactPhone.trim() && !/^0\d{3}-\d{7}$/.test(newUser.emergencyContactPhone.trim())) {
      errors.emergencyContactPhone = "Emergency Phone must be in format 03XX-XXXXXXX.";
    }
    if (!newUser.personalEmail.trim()) {
      errors.personalEmail = "Personal Email Address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.personalEmail.trim())) {
      errors.personalEmail = "Please enter a valid personal email address.";
    }
    if (newUser.professionalEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.professionalEmail.trim())) {
      errors.professionalEmail = "Please enter a valid professional email address.";
    }
    const isExistingProEmail = editingUser && newUser.professionalEmail.trim() === (editingUser.professional_email || "").trim();
    if (newUser.professionalEmail.trim() && !newUser.professionalEmailPassword.trim() && !isExistingProEmail) {
      errors.professionalEmailPassword = "Password is required when professional email is provided.";
    }
    if (!newUser.department) {
      errors.department = "Department is required.";
    } else if (newUser.department === "__custom__" && !newUser.departmentCustom.trim()) {
      errors.departmentCustom = "Custom Department is required.";
    }
    if (!newUser.designation) {
      errors.designation = "Designation is required.";
    } else if (newUser.designation === "__custom__" && !newUser.designationCustom.trim()) {
      errors.designationCustom = "Custom Designation is required.";
    }
    if (!newUser.employeeCode.trim()) errors.employeeCode = "Employee Code is required.";
    if (!newUser.jobStartedDate) errors.jobStartedDate = "Job Start Date is required.";
    if (newUser.grossSalary && newUser.grossSalary.length > 300) {
      errors.grossSalary = "Gross Salary must be 300 characters or less.";
    }
    if (newUser.bankAccountNumber.trim() && !/^[\d\s\-a-zA-Z]+$/.test(newUser.bankAccountNumber.trim())) {
      errors.bankAccountNumber = "Bank Account Number must contain only digits, letters, spaces, or dashes.";
    }
    return errors;
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    let formattedValue = value;
    if (name === "idCardNumber") formattedValue = formatCNIC(value);
    if (name === "phoneNumber" || name === "emergencyContactPhone") formattedValue = formatPhone(value);
    setNewUser((prev) => ({ ...prev, [name]: formattedValue }));
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
      notify.error("Resigned users cannot be updated.");
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
      notify.error("Failed to update user role.");
    } finally {
      setSavingUserId(null);
    }
  };

  // Mark a user as resigned (inactive) after confirmation
  const handleResignUser = async (userId) => {
    setResignUserId(userId);
    setResignConfirmOpen(true);
  };

  // Confirm and execute user resignation via API
  const confirmResignUser = async () => {
    const userId = resignUserId;
    setResignConfirmOpen(false);
    setResignUserId(null);

    await run(async () => {
      const res = await fetch(`${API_URL}/users/${userId}/resign`, {
        method: "PUT",
        headers: { Accept: "application/json", ...authHeaders() },
        _notifHandled: true,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Unable to resign user");
      }

      setUsers((prev) =>
        prev.map((item) =>
          item.id === userId ? { ...item, active: false } : item
        )
      );
      showSuccessMessage("User", "resigned");
      publish('data:changed', { type: 'user', action: 'resigned' });
    });
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
    const isResigned = user.active === false && user.must_change_password === false;
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
          <StatusBadge active={user.active} mustChangePassword={user.must_change_password} />
        </td>
        <td style={{ width: "20%" }}>
          <div className="action-buttons">
            <button
              className="btn-view"
              onClick={() => navigate(rolePath(`manage-users/user-profile/${user.id}`))}
              aria-label="View user profile"
            >
              <MdVisibility size={24} />
            </button>
            <button
              className="btn-view"
              onClick={() => openEditModal(user)}
              disabled={!canModifyUser}
              aria-label="Edit user"
            >
              <MdEdit size={20} />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  // Apply search, role, and status filters to users list
  const filteredUsers = localUsers.filter(Boolean).filter((user) => {
    const matchesSearch =
      (user.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.professional_email || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "" || user.role === roleFilter;
    const matchesStatus =
      statusFilter === "" ||
      (statusFilter === "active" && user.active !== false) ||
      (statusFilter === "resigned" && user.active === false);
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
  function SortableUserRow({ user, isActive, canModifyUser, isSelf, isTargetProtected }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: user.id });
    const rowStyle = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.4 : 1,
    };
    const isResigned = user.active === false && user.must_change_password === false;
    return (
      <tr ref={setNodeRef} className={isResigned ? "resigned-row" : ""} style={rowStyle} {...listeners} {...attributes}>
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
        <td style={{ width: "20%" }}><StatusBadge active={user.active} mustChangePassword={user.must_change_password} /></td>
        <td style={{ width: "20%" }}>
          <div className="action-buttons">
            <button className="btn-view" onClick={() => navigate(rolePath(`manage-users/user-profile/${user.id}`))} aria-label="View user profile"><MdVisibility size={24} /></button>
            <button className="btn-view" onClick={() => openEditModal(user)} disabled={!canModifyUser} aria-label="Edit user"><MdEdit size={20} /></button>
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

  // Submit new user or update existing user via API with FormData (supports file uploads)
  const handleSubmit = async (event) => {
    if (event) event.preventDefault();

    const errors = validateAddForm();
    setAddErrors(errors);
    if (Object.keys(errors).length > 0) {
      scrollToFirstError(errors);
      return;
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
    formData.append("name", newUser.fullName.trim());
    formData.append("email", (newUser.personalEmail || newUser.email || "").trim());
    formData.append("father_name", newUser.fatherName);
    formData.append("id_card_number", newUser.idCardNumber);
    formData.append("present_address", newUser.presentAddress);
    formData.append("permanent_address", newUser.permanentAddress);
    formData.append("phone_number", newUser.phoneNumber);
    formData.append("emergency_contact_name", newUser.emergencyContactName);
    formData.append("emergency_contact_relation", newUser.emergencyContactRelation);
    formData.append("emergency_contact_phone", newUser.emergencyContactPhone);
    formData.append("personal_email", newUser.personalEmail || "");
    formData.append("professional_email", newUser.professionalEmail || "");
    if (!editingUser || newUser.professionalEmailPassword) {
      formData.append("professional_email_password", newUser.professionalEmailPassword || "");
    }
    formData.append("department", finalDepartment || "");
    formData.append("designation", finalDesignation || "");
    formData.append("hired_for", newUser.hiredFor);
    formData.append("employee_code", newUser.employeeCode);
    formData.append("job_started_date", newUser.jobStartedDate);
    formData.append("job_ended_date", newUser.jobEndedDate);
    formData.append("role", newUser.role);
    formData.append("gross_salary", newUser.grossSalary);
    formData.append("applied_via", newUser.appliedVia);
    formData.append("bank_name", newUser.bankName);
    formData.append("bank_account_number", newUser.bankAccountNumber);
    formData.append("bank_account_title", newUser.bankAccountTitle);

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

    // Avatar upload
    if (newUser.avatar) {
      formData.append("avatar", newUser.avatar);
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
        notify.error(data.message || (isEdit ? "Unable to update user" : "Unable to create user"));
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

  const breadcrumbs = [
    { label: "Users" },
  ];

  return (
    <>
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="manage-users-page">
        <div className="manage-users-header">
          <div>
            <h1>User Management</h1>
            <p>Manage users, roles and access permissions.</p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button className="primary-button add-user-button" onClick={() => setCompanyDocsOpen(true)} style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}>
              Company Documents
            </button>
            <button className="primary-button add-user-button" onClick={openModal}>
              <CiCirclePlus fontSize={"21px"} /> Add User
            </button>
          </div>
        </div>

        <div className="bar">
          <div className="search-bar">
            <IoSearchOutline fontSize={"25px"} />
            <input type="text" placeholder="Search users by name or email....." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} />
          </div>
          <select className="reports-filter" value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
            <option value="">All Time</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="180">Last 6 Months</option>
          </select>
          <select className="bar-role" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
            <option value="">Role</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="team_lead">Team-Lead</option>
            <option value="member">Member</option>
          </select>
          <select className="bar-status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">Status</option>
            <option value="active">Active</option>
            <option value="resigned">Resigned</option>
          </select>
          <select className="bar-sort" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
            <option value="">Sort By</option>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>

        <div className="manage-users-table-card">
          <div className="table-card-header">
            <h2>Existing Users</h2>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
            <table className="manage-user-table">
              <thead>
                <tr>
                  <th style={{ width: "40%" }}>User</th>
                  <th style={{ width: "20%" }}>Role</th>
                  <th style={{ width: "20%" }}>Status</th>
                  <th style={{ width: "20%" }}>Action</th>
                </tr>
              </thead>
              <SortableContext items={paginatedUsers.filter(Boolean).map((u) => u.id)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="4" className="loading-row">Loading users...</td>
                    </tr>
                  ) : localUsers.length ? (
                      paginatedUsers.length ? (
                        paginatedUsers.filter(Boolean).map((user) => {
                        const isSelf = currentUserId === user.id;
                        const isTargetProtected = user.role === "admin" || user.role === "manager";
                        const isResigned = user.active === false && user.must_change_password === false;
                        const canModifyUser = !isResigned && !isSelf && !(currentUserRole === "manager" && isTargetProtected);
                        return (
                          <SortableUserRow key={user.id} user={user} isActive={user.active !== false} canModifyUser={canModifyUser} isSelf={isSelf} isTargetProtected={isTargetProtected} />
                        );
                      })
                    ) : (
                      <tr><td colSpan="4" className="empty-row">No users match your search or filters.</td></tr>
                    )
                  ) : (
                    <tr><td colSpan="4" className="empty-row">No users found yet.</td></tr>
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
                    <h2>{editingUser ? "Edit User" : "Add New User"}</h2>
                    <p className="modal-subtitle">
                      {editingUser ? "Update user information and documents." : "Register a new user and automatically send login credentials via email."}
                    </p>
                  </div>
                </div>
                <div className="user-header-actions">
                  <LoadingButton type="button" className="primary-button" loading={submitting} onClick={handleSubmit}>
                    {submitting ? (editingUser ? "Updating User..." : "Creating User...") : (editingUser ? "Update User" : "Create User")}
                  </LoadingButton>
                  <button className="user-modal-close" onClick={closeModal}>
                    &#10005;
                  </button>
                </div>
              </div>

              <form id="user-modal-form" className="user-form" onSubmit={handleSubmit} style={{ pointerEvents: submitting ? 'none' : 'auto', opacity: submitting ? 0.7 : 1 }}>
                {/* ===== Profile Photo + Personal Information Row ===== */}
                <div className="personal-info-top-row">
                  <div className="personal-info-fields">
                    <h3 className="form-section-title">Personal Information</h3>
                    <div className="user-form-grid">
                      <div className="form-row">
                        <label htmlFor="fullName">Employee Full Name *</label>
                        <input type="text" id="fullName" name="fullName" value={newUser.fullName} onChange={handleChange} placeholder="Enter full name" className={addErrors.fullName ? "field-error" : ""} />
                        {addErrors.fullName && <span className="field-error-text">{addErrors.fullName}</span>}
                      </div>
                      <div className="form-row">
                        <label htmlFor="fatherName">Father Name *</label>
                        <input type="text" id="fatherName" name="fatherName" value={newUser.fatherName} onChange={handleChange} placeholder="Enter father name" className={addErrors.fatherName ? "field-error" : ""} />
                        {addErrors.fatherName && <span className="field-error-text">{addErrors.fatherName}</span>}
                      </div>
                      <div className="form-row">
                        <label htmlFor="idCardNumber">ID Card Number *</label>
                        <input type="text" id="idCardNumber" name="idCardNumber" value={newUser.idCardNumber} onChange={handleChange} placeholder="XXXXX-XXXXXXX-X" maxLength={15} className={addErrors.idCardNumber ? "field-error" : ""} />
                        {addErrors.idCardNumber && <span className="field-error-text">{addErrors.idCardNumber}</span>}
                      </div>
                      <div className="form-row">
                        <label htmlFor="phoneNumber">Phone Number *</label>
                        <input type="text" id="phoneNumber" name="phoneNumber" value={newUser.phoneNumber} onChange={handleChange} placeholder="03XX-XXXXXXX" maxLength={12} className={addErrors.phoneNumber ? "field-error" : ""} />
                        {addErrors.phoneNumber && <span className="field-error-text">{addErrors.phoneNumber}</span>}
                      </div>
                    </div>
                  </div>

                  {/* ===== Profile Photo ===== */}
                  <div className="avatar-upload-section">
                    <label className="avatar-upload-label">Profile Photo</label>
                    <div className="avatar-upload-row">
                      <div className="avatar-preview" onClick={() => document.getElementById('avatar-input').click()}>
                        {newUser.avatar ? (
                          <img src={URL.createObjectURL(newUser.avatar)} alt="Avatar preview" />
                        ) : newUser._existingAvatar ? (
                          <img src={`${API_URL.replace('/api', '')}/storage/${newUser._existingAvatar}`} alt="Avatar preview" />
                        ) : (
                          <>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                            <span className="avatar-upload-hint">Click to upload</span>
                          </>
                        )}
                      </div>
                      <input id="avatar-input" type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files[0]; if (file) setNewUser((prev) => ({ ...prev, avatar: file })); }} />
                      {(newUser.avatar || newUser._existingAvatar) && (
                        <button type="button" className="avatar-remove-btn" onClick={() => setAvatarRemoveConfirmOpen(true)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* ===== Address ===== */}
                <h3 className="form-section-title">Address</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="presentAddress">Present Address *</label>
                    <input type="text" id="presentAddress" name="presentAddress" value={newUser.presentAddress} onChange={handleChange} placeholder="Enter present address" className={addErrors.presentAddress ? "field-error" : ""} />
                    {addErrors.presentAddress && <span className="field-error-text">{addErrors.presentAddress}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="permanentAddress">Permanent Address</label>
                    <input type="text" id="permanentAddress" name="permanentAddress" value={newUser.permanentAddress} onChange={handleChange} placeholder="Enter permanent address" />
                  </div>
                </div>

                {/* ===== Emergency Contact ===== */}
                <h3 className="form-section-title">Emergency Contact</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="emergencyContactName">Name</label>
                    <input type="text" id="emergencyContactName" name="emergencyContactName" value={newUser.emergencyContactName} onChange={handleChange} placeholder="Emergency contact name" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="emergencyContactRelation">Relation</label>
                    <input type="text" id="emergencyContactRelation" name="emergencyContactRelation" value={newUser.emergencyContactRelation} onChange={handleChange} placeholder="e.g. Father, Mother, Spouse" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="emergencyContactPhone">Phone</label>
                    <input type="text" id="emergencyContactPhone" name="emergencyContactPhone" value={newUser.emergencyContactPhone} onChange={handleChange} placeholder="03XX-XXXXXXX" maxLength={12} className={addErrors.emergencyContactPhone ? "field-error" : ""} />
                    {addErrors.emergencyContactPhone && <span className="field-error-text">{addErrors.emergencyContactPhone}</span>}
                  </div>
                </div>

                {/* ===== Email Accounts ===== */}
                <h3 className="form-section-title">Email Accounts</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="personalEmail">Personal Email Address *</label>
                    <input type="email" id="personalEmail" name="personalEmail" value={newUser.personalEmail} onChange={handleChange} placeholder="Enter personal email address" className={addErrors.personalEmail ? "field-error" : ""} />
                    {addErrors.personalEmail && <span className="field-error-text">{addErrors.personalEmail}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="professionalEmail">Professional Email *</label>
                    <input type="email" id="professionalEmail" name="professionalEmail" value={newUser.professionalEmail} onChange={handleChange} placeholder="Enter professional email address" className={addErrors.professionalEmail ? "field-error" : ""} />
                    {addErrors.professionalEmail && <span className="field-error-text">{addErrors.professionalEmail}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="professionalEmailPassword">Password of Professional Email {editingUser ? "" : "*"}</label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type={showProfPassword ? "text" : "password"} id="professionalEmailPassword" name="professionalEmailPassword" value={newUser.professionalEmailPassword} onChange={handleChange} placeholder={editingUser ? "Leave blank to keep current" : "Enter professional email password"} className={addErrors.professionalEmailPassword ? "field-error" : ""} style={{ flex: 1 }} />
                      {editingUser && newUser.professionalEmailPassword && (
                        <button type="button" onClick={() => setShowProfPassword(!showProfPassword)} style={{ background: "none", border: "1px solid #d1d5db", borderRadius: "6px", padding: "6px 10px", cursor: "pointer", fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                          {showProfPassword ? "Hide" : "Show"}
                        </button>
                      )}
                    </div>
                    {addErrors.professionalEmailPassword && <span className="field-error-text">{addErrors.professionalEmailPassword}</span>}
                  </div>
                </div>

                {/* ===== Employment Details ===== */}
                <h3 className="form-section-title">Employment Details</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="designation">Designation / Role *</label>
                    {newUser.designation === "__custom__" ? (
                      <div className="custom-input-container">
                        <input type="text" id="designationCustom" name="designationCustom" value={newUser.designationCustom} onChange={handleChange} placeholder="Enter custom designation" autoFocus className={addErrors.designationCustom ? "field-error" : ""} />
                        <button type="button" className="custom-input-revert" onClick={() => handleCustomRevert("designation")} title="Back to list">&times;</button>
                      </div>
                    ) : (
                      <div className="category-dropdown-container" ref={desgDropdownRef}>
                        <button type="button" className="category-dropdown-trigger" onClick={() => setDesgDropdownOpen((o) => !o)} style={addErrors.designation ? { border: "1px solid #ef4444" } : {}}>
                          {newUser.designation || "Select Designation"} <span className={`category-dropdown-arrow ${desgDropdownOpen ? "open" : ""}`}>&#9662;</span>
                        </button>
                        {desgDropdownOpen && (
                          <div className="category-dropdown-options">
                            <div className="category-dropdown-option" onClick={() => { setNewUser((prev) => ({ ...prev, designation: "" })); setDesgDropdownOpen(false); }} style={{ fontWeight: !newUser.designation ? "600" : "400", background: !newUser.designation ? "#f0f9ff" : "transparent" }}>
                              Select Designation
                            </div>
                            {designations.map((d) => (
                              <div key={d} className="category-dropdown-option" onClick={() => { setNewUser((prev) => ({ ...prev, designation: d })); setDesgDropdownOpen(false); }} style={{ fontWeight: newUser.designation === d ? "600" : "400", background: newUser.designation === d ? "#f0f9ff" : "transparent" }}>
                                {d}
                                <span className="category-option-delete" onClick={(e) => { e.stopPropagation(); deleteDesignation(d); }} title="Delete">&times;</span>
                              </div>
                            ))}
                            <div className="category-dropdown-option category-dropdown-custom" onClick={() => { setNewUser((prev) => ({ ...prev, designation: "__custom__" })); setDesgDropdownOpen(false); }}>Custom / Type Here</div>
                          </div>
                        )}
                      </div>
                    )}
                    {addErrors.designation && <span className="field-error-text">{addErrors.designation}</span>}
                    {addErrors.designationCustom && <span className="field-error-text">{addErrors.designationCustom}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="department">Department *</label>
                    {newUser.department === "__custom__" ? (
                      <div className="custom-input-container">
                        <input type="text" id="departmentCustom" name="departmentCustom" value={newUser.departmentCustom} onChange={handleChange} placeholder="Enter custom department" autoFocus className={addErrors.departmentCustom ? "field-error" : ""} />
                        <button type="button" className="custom-input-revert" onClick={() => handleCustomRevert("department")} title="Back to list">&times;</button>
                      </div>
                    ) : (
                      <div className="category-dropdown-container" ref={deptDropdownRef}>
                        <button type="button" className="category-dropdown-trigger" onClick={() => setDeptDropdownOpen((o) => !o)} style={addErrors.department ? { border: "1px solid #ef4444" } : {}}>
                          {newUser.department || "Select Department"} <span className={`category-dropdown-arrow ${deptDropdownOpen ? "open" : ""}`}>&#9662;</span>
                        </button>
                        {deptDropdownOpen && (
                          <div className="category-dropdown-options">
                            <div className="category-dropdown-option" onClick={() => { setNewUser((prev) => ({ ...prev, department: "" })); setDeptDropdownOpen(false); }} style={{ fontWeight: !newUser.department ? "600" : "400", background: !newUser.department ? "#f0f9ff" : "transparent" }}>
                              Select Department
                            </div>
                            {departments.map((d) => (
                              <div key={d} className="category-dropdown-option" onClick={() => { setNewUser((prev) => ({ ...prev, department: d })); setDeptDropdownOpen(false); }} style={{ fontWeight: newUser.department === d ? "600" : "400", background: newUser.department === d ? "#f0f9ff" : "transparent" }}>
                                {d}
                                <span className="category-option-delete" onClick={(e) => { e.stopPropagation(); deleteDepartment(d); }} title="Delete">&times;</span>
                              </div>
                            ))}
                            <div className="category-dropdown-option category-dropdown-custom" onClick={() => { setNewUser((prev) => ({ ...prev, department: "__custom__" })); setDeptDropdownOpen(false); }}>Custom / Type Here</div>
                          </div>
                        )}
                      </div>
                    )}
                    {addErrors.department && <span className="field-error-text">{addErrors.department}</span>}
                    {addErrors.departmentCustom && <span className="field-error-text">{addErrors.departmentCustom}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="hiredFor">Hired For</label>
                    <input type="text" id="hiredFor" name="hiredFor" value={newUser.hiredFor} onChange={handleChange} placeholder="e.g. Full-time, Part-time, Contract" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="employeeCode">Employee Code *</label>
                    <input type="text" id="employeeCode" name="employeeCode" value={newUser.employeeCode} onChange={handleChange} placeholder="Enter employee code" className={addErrors.employeeCode ? "field-error" : ""} />
                    {addErrors.employeeCode && <span className="field-error-text">{addErrors.employeeCode}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="role">System Role</label>
                    <select id="role" name="role" value={newUser.role} onChange={handleChange}>
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="team_lead">Team Lead</option>
                      <option value="member">Member</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label htmlFor="jobStartedDate">Job Started Date *</label>
                    <input type="date" id="jobStartedDate" name="jobStartedDate" value={newUser.jobStartedDate} onChange={handleChange} className={addErrors.jobStartedDate ? "field-error" : ""} />
                    {addErrors.jobStartedDate && <span className="field-error-text">{addErrors.jobStartedDate}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="jobEndedDate">Job Ended Date</label>
                    <input type="date" id="jobEndedDate" name="jobEndedDate" value={newUser.jobEndedDate} onChange={handleChange} />
                  </div>
                  <div className="form-row">
                    <label htmlFor="appliedVia">Applied Via</label>
                    <input type="text" id="appliedVia" name="appliedVia" value={newUser.appliedVia} onChange={handleChange} placeholder="e.g. Website, Referral, LinkedIn" />
                  </div>
                </div>

                {/* ===== Salary & Bank ===== */}
                <h3 className="form-section-title">Salary & Bank Details</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="grossSalary">Gross Salary</label>
                    <input type="text" id="grossSalary" name="grossSalary" value={newUser.grossSalary} onChange={handleChange} placeholder="e.g. 50000 or Negotiable" className={addErrors.grossSalary ? "field-error" : ""} />
                    {addErrors.grossSalary && <span className="field-error-text">{addErrors.grossSalary}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="bankName">Bank Name</label>
                    <input type="text" id="bankName" name="bankName" value={newUser.bankName} onChange={handleChange} placeholder="Enter bank name" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="bankAccountNumber">Bank Account Number</label>
                    <input type="text" id="bankAccountNumber" name="bankAccountNumber" value={newUser.bankAccountNumber} onChange={handleChange} placeholder="Enter account number" className={addErrors.bankAccountNumber ? "field-error" : ""} />
                    {addErrors.bankAccountNumber && <span className="field-error-text">{addErrors.bankAccountNumber}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="bankAccountTitle">Bank Account Title</label>
                    <input type="text" id="bankAccountTitle" name="bankAccountTitle" value={newUser.bankAccountTitle} onChange={handleChange} placeholder="Enter account title" />
                  </div>
                </div>

                {/* ===== Documents ===== */}
                <h3 className="form-section-title">Documents</h3>
                <div className="user-form-grid">
                  {[
                    { label: "Employment Contract", key: "employmentContract", api: "employment_contract" },
                    { label: "Offer Letter", key: "offerLetter", api: "offer_letter" },
                    { label: "Techxaro Regulations", key: "techxaroRegulations", api: "techxaro_regulations" },
                  ].map(({ label, key, api }) => (
                    <div className="form-row" key={key}>
                      <label htmlFor={key}>{label}</label>
                      {editingUser && editingUser[api] && !newUser[key] && (
                        <div style={{ marginBottom: 6, fontSize: 13, color: "#64748b" }}>
                          Current: <a href={`${API_URL}/users/${editingUser.id}/documents/${api}?token=${authToken()}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>View uploaded file</a>
                        </div>
                      )}
                      <input
                        type="file"
                        id={key}
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        onChange={(e) => {
                          const f = e.target.files[0];
                          if (f && !["application/pdf","image/jpeg","image/png","image/webp"].includes(f.type)) {
                            notify.error("Only PDF and image files are allowed.");
                            e.target.value = "";
                            return;
                          }
                          setNewUser((p) => ({ ...p, [key]: f || null }));
                        }}
                      />
                    </div>
                  ))}

                  {/* Other Document — right after Previous Salary Slip */}
                  <div className="form-row">
                    <label htmlFor="otherDocument">Other Document</label>
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
                            notify.error(`"${f.name}" is not a supported file type. Skipped.`);
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
                        }
                        e.target.value = "";
                      }}
                    />
                    {newUser.otherDocument.length > 0 && (
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                        {newUser.otherDocument.filter(item => item && item.file).map((item, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}>
                            {item.renaming ? (
                              <>
                                <input
                                  autoFocus
                                  type="text"
                                  value={item.customName}
                                  onChange={(e) => {
                                    setNewUser((p) => {
                                      const updated = [...p.otherDocument];
                                      updated[i] = { ...updated[i], customName: e.target.value };
                                      return { ...p, otherDocument: updated };
                                    });
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      setNewUser((p) => {
                                        const updated = [...p.otherDocument];
                                        updated[i] = { ...updated[i], renaming: false };
                                        return { ...p, otherDocument: updated };
                                      });
                                    }
                                  }}
                                  style={{ flex: 1, border: "1px solid #93c5fd", borderRadius: 4, padding: "2px 6px", fontSize: 13, outline: "none" }}
                                />
                                <button type="button" onClick={() => {
                                  setNewUser((p) => {
                                    const updated = [...p.otherDocument];
                                    updated[i] = { ...updated[i], renaming: false };
                                    return { ...p, otherDocument: updated };
                                  });
                                }} style={{ background: "#16a34a", border: "none", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, borderRadius: 4, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 6 }} title="Save name">&#10003;</button>
                              </>
                            ) : (
                              <span style={{ color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={item.customName || item.file.name}>
                                {item.customName || item.file.name}
                              </span>
                            )}
                            {!item.renaming && (
                              <div style={{ display: "flex", gap: 10, flexShrink: 0, marginLeft: 8 }}>
                                <button type="button" onClick={() => {
                                  setNewUser((p) => {
                                    const updated = [...p.otherDocument];
                                    updated[i] = { ...updated[i], renaming: true, customName: item.customName || item.file.name.replace(/\.[^.]+$/, "") };
                                    return { ...p, otherDocument: updated };
                                  });
                                }} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Rename</button>
                                <button type="button" onClick={() => {
                                  setPendingRemoveDoc({ source: "new", index: i });
                                  setRemoveDocConfirmOpen(true);
                                }} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1 }} title="Remove">&#10005;</button>
                              </div>
                            )}
                            {item.renaming && (
                              <button type="button" onClick={() => {
                                setPendingRemoveDoc({ source: "new", index: i });
                                setRemoveDocConfirmOpen(true);
                              }} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1, flexShrink: 0, marginLeft: 6 }} title="Remove">&#10005;</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {editingUser && existingOtherDocs.length > 0 && newUser.otherDocument.length === 0 && (
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                        {existingOtherDocs.filter(doc => doc && doc.path).map((doc, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}>
                            {doc.renaming ? (
                              <>
                                <input
                                  autoFocus
                                  type="text"
                                  value={doc.name}
                                  onChange={(e) => {
                                    setExistingOtherDocs((prev) => {
                                      const updated = [...prev];
                                      updated[i] = { ...updated[i], name: e.target.value };
                                      return updated;
                                    });
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      setExistingOtherDocs((prev) => {
                                        const updated = [...prev];
                                        updated[i] = { ...updated[i], renaming: false };
                                        return updated;
                                      });
                                    }
                                  }}
                                  style={{ flex: 1, border: "1px solid #93c5fd", borderRadius: 4, padding: "2px 6px", fontSize: 13, outline: "none" }}
                                />
                                <button type="button" onClick={() => {
                                  setExistingOtherDocs((prev) => {
                                    const updated = [...prev];
                                    updated[i] = { ...updated[i], renaming: false };
                                    return updated;
                                  });
                                }} style={{ background: "#16a34a", border: "none", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, borderRadius: 4, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 6 }} title="Save name">&#10003;</button>
                              </>
                            ) : (
                              <a href={`${API_URL}/users/${editingUser.id}/documents/other_document?token=${authToken()}&file=${encodeURIComponent(doc.path)}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={doc.name}>
                                {doc.name || `Document ${i + 1}`}
                              </a>
                            )}
                            {!doc.renaming && (
                              <div style={{ display: "flex", gap: 10, flexShrink: 0, marginLeft: 8 }}>
                                <button type="button" onClick={() => {
                                  setExistingOtherDocs((prev) => {
                                    const updated = [...prev];
                                    updated[i] = { ...updated[i], renaming: true };
                                    return updated;
                                  });
                                }} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Rename</button>
                                <button type="button" onClick={() => {
                                  setPendingRemoveDoc({ source: "existing", index: i });
                                  setRemoveDocConfirmOpen(true);
                                }} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1 }} title="Remove">&#10005;</button>
                              </div>
                            )}
                            {doc.renaming && (
                              <button type="button" onClick={() => {
                                setPendingRemoveDoc({ source: "existing", index: i });
                                setRemoveDocConfirmOpen(true);
                              }} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1, flexShrink: 0, marginLeft: 6 }} title="Remove">&#10005;</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {editingUser && existingOtherDocs.length === 0 && newUser.otherDocument.length === 0 && (
                      <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>
                        No documents uploaded
                      </div>
                    )}
                  </div>


                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      </div>
    </DashboardLayout>

    <ConfirmModal
      isOpen={resignConfirmOpen}
      onClose={() => { setResignConfirmOpen(false); setResignUserId(null); }}
      onConfirm={confirmResignUser}
      title="Confirm Resignation"
      message="Are you sure you want to resign? This action may affect your access and assigned responsibilities."
      confirmText="Confirm Resignation"
      cancelText="Cancel"
      danger
    />

    <ConfirmModal
      isOpen={confirmDeleteOpen}
      onClose={() => { setConfirmDeleteOpen(false); setPendingDelete({ type: "", value: "" }); }}
      onConfirm={handleConfirmDelete}
      title="Confirm Deletion"
      message={`Are you sure you want to delete "${pendingDelete.value}"? This action cannot be undone.`}
      confirmText="Delete"
      cancelText="Cancel"
      danger
    />

    <ConfirmModal
      isOpen={removeDocConfirmOpen}
      onClose={() => { setRemoveDocConfirmOpen(false); setPendingRemoveDoc({ source: "", index: -1 }); }}
      onConfirm={() => {
        if (pendingRemoveDoc.source === "new") {
          setNewUser((p) => ({ ...p, otherDocument: p.otherDocument.filter((_, idx) => idx !== pendingRemoveDoc.index) }));
        } else if (pendingRemoveDoc.source === "existing") {
          setExistingOtherDocs((prev) => prev.filter((_, idx) => idx !== pendingRemoveDoc.index));
        }
        setRemoveDocConfirmOpen(false);
        setPendingRemoveDoc({ source: "", index: -1 });
      }}
      title="Remove Document"
      message="Are you sure you want to remove this document?"
      confirmText="Remove"
      cancelText="Cancel"
      danger
    />

    <ConfirmModal
      isOpen={avatarRemoveConfirmOpen}
      onClose={() => setAvatarRemoveConfirmOpen(false)}
      onConfirm={() => { setNewUser((prev) => ({ ...prev, avatar: null, _existingAvatar: null })); setAvatarRemoveConfirmOpen(false); }}
      title="Remove Photo"
      message="Are you sure you want to remove this profile photo?"
      confirmText="Remove"
      cancelText="Cancel"
      danger
    />

    <CompanyDocuments
      isOpen={companyDocsOpen}
      onClose={() => setCompanyDocsOpen(false)}
    />
    </>
  );
}

export default ManageUsers;
