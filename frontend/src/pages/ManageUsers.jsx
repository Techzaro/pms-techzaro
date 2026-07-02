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
import { MdVisibility } from "react-icons/md";
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

/** Predefined department options (includes __custom__ for custom input) */
const DEPARTMENTS = [
  "Digital Marketing",
  "Website Development",
  "Graphic Design",
  "Data Entry",
  "Human Resource",
  "__custom__",
];

/** Predefined designation options (includes __custom__ for custom input) */
const DESIGNATIONS = [
  "SEO Link Builder Intern",
  "SEO Intern",
  "SEO Associate",
  "WordPress Developer Intern",
  "Web Developer Intern",
  "Graphic Design Intern",
  "Data Entry Operator",
  "SQA Intern",
  "HR",
  "__custom__",
];

/**
 * ManageUsers — Main user management page component.
 * Handles CRUD operations for users, role assignment, resignation, and profile viewing.
 */
function ManageUsers() {
  const notify = useNotification();
  const [users, setUsers] = useState([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
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
      const usersData = (data.users ?? data).map((user) => ({
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

  const openEditModal = (user) => {
    setEditingUser(user);
    const deptVal = user.department || "";
    const isCustomDept = !DEPARTMENTS.slice(0, -1).includes(deptVal) && deptVal !== "";
    const desgVal = user.designation || "";
    const isCustomDesg = !DESIGNATIONS.slice(0, -1).includes(desgVal) && desgVal !== "";

    setNewUser({
      fullName: user.name || "",
      fatherName: user.father_name || "",
      idCardNumber: user.id_card_number || "",
      presentAddress: user.present_address || user.address || "",
      permanentAddress: user.permanent_address || "",
      phoneNumber: user.phone_number || user.contact_no || "",
      emergencyContactName: user.emergency_contact_name || "",
      emergencyContactRelation: user.emergency_contact_relation || "",
      emergencyContactPhone: user.emergency_contact_phone || "",
      email: user.email || "",
      personalEmail: user.personal_email || "",
      professionalEmail: user.professional_email || "",
      professionalEmailPassword: user.professional_email_password || "",
      department: isCustomDept ? "__custom__" : deptVal,
      departmentCustom: isCustomDept ? deptVal : "",
      designation: isCustomDesg ? "__custom__" : desgVal,
      designationCustom: isCustomDesg ? desgVal : "",
      hiredFor: user.hired_for || "",
      employeeCode: user.employee_code || "",
      jobStartedDate: user.job_started_date ? user.job_started_date.substring(0, 10) : "",
      jobEndedDate: user.job_ended_date ? user.job_ended_date.substring(0, 10) : "",
      role: user.role || "member",
      grossSalary: user.gross_salary || "",
      appliedVia: user.applied_via || "",
      bankName: user.bank_name || "",
      bankAccountNumber: user.bank_account_number || "",
      bankAccountTitle: user.bank_account_title || "",
      employmentContract: null,
      offerLetter: null,
      techxaroRegulations: null,
      otherDocument: [],
    });
    setAddErrors({});
    setIsAddModalOpen(true);
  };

  const closeModal = () => {
    setIsAddModalOpen(false);
    setEditingUser(null);
    setAddErrors({});
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
    } else if (!/^\d{13}$/.test(newUser.idCardNumber.trim())) {
      errors.idCardNumber = "CNIC must be exactly 13 digits.";
    }
    if (!newUser.presentAddress.trim()) errors.presentAddress = "Present Address is required.";
    if (!newUser.phoneNumber.trim()) {
      errors.phoneNumber = "Phone Number is required.";
    } else if (!/^0\d{10}$/.test(newUser.phoneNumber.trim())) {
      errors.phoneNumber = "Phone Number must be 11 digits starting with 0.";
    }
    if (newUser.emergencyContactPhone.trim() && !/^0\d{10}$/.test(newUser.emergencyContactPhone.trim())) {
      errors.emergencyContactPhone = "Emergency Phone must be 11 digits starting with 0.";
    }
    if (!newUser.personalEmail.trim()) {
      errors.personalEmail = "Personal Email Address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.personalEmail.trim())) {
      errors.personalEmail = "Please enter a valid personal email address.";
    }
    if (newUser.professionalEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.professionalEmail.trim())) {
      errors.professionalEmail = "Please enter a valid professional email address.";
    }
    if (newUser.professionalEmail.trim() && !newUser.professionalEmailPassword.trim()) {
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
    if (newUser.grossSalary && (isNaN(newUser.grossSalary) || Number(newUser.grossSalary) < 0)) {
      errors.grossSalary = "Gross Salary must be a valid positive number.";
    }
    if (newUser.bankAccountNumber.trim() && !/^\d+$/.test(newUser.bankAccountNumber.trim())) {
      errors.bankAccountNumber = "Bank Account Number must contain only digits.";
    }
    return errors;
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setNewUser((prev) => ({ ...prev, [name]: value }));
    if (addErrors[name]) {
      setAddErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
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
      user.active !== false && !isSelf && !(currentUserRole === "manager" && isTargetProtected);

    return (
      <tr key={user.id} className={isResigned ? "resigned-row" : ""}>
        <td style={{ width: "40%", textAlign: "left" }}>
          <div className="user-info">
            <span className="user-avatar">{getInitials(user.name)}</span>
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
              className="btn-resign"
              onClick={() => handleResignUser(user.id)}
              disabled={!canModifyUser}
              aria-label="Resign user"
            >
              <ResignIcon className="resign-icon" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  // Apply search, role, and status filters to users list
  const filteredUsers = localUsers.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
        sortOrder === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
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
            <span className="user-avatar">{getInitials(user.name)}</span>
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
            <button className="btn-resign" onClick={() => handleResignUser(user.id)} disabled={!canModifyUser} aria-label="Resign user"><ResignIcon className="resign-icon" /></button>
          </div>
        </td>
      </tr>
    );
  }


  // Submit new user or update existing user via API with FormData (supports file uploads)
  const handleSubmit = async (event) => {
    event.preventDefault();

    const errors = validateAddForm();
    setAddErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const finalDepartment =
      newUser.department === "__custom__" ? newUser.departmentCustom : newUser.department;
    const finalDesignation =
      newUser.designation === "__custom__" ? newUser.designationCustom : newUser.designation;

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
    formData.append("professional_email_password", newUser.professionalEmailPassword || "");
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
      newUser.otherDocument.forEach((f) => {
        formData.append("other_document[]", f);
      });
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
            email: "email", full_name: "fullName",
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
              <SortableContext items={paginatedUsers.map((u) => u.id)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="4" className="loading-row">Loading users...</td>
                    </tr>
                  ) : localUsers.length ? (
                      paginatedUsers.length ? (
                        paginatedUsers.map((user) => {
                        const isSelf = currentUserId === user.id;
                        const isTargetProtected = user.role === "admin" || user.role === "manager";
                        const canModifyUser = user.active !== false && !isSelf && !(currentUserRole === "manager" && isTargetProtected);
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
        {isAddModalOpen && (
          <div className="user-modal-overlay">
            <div
              className="user-modal-content"
              style={{ maxWidth: "1100px", width: "100%" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="user-modal-header">
                <div>
                  <h2>{editingUser ? "Edit User" : "Add New User"}</h2>
                  <p className="modal-subtitle">
                    {editingUser ? "Update user information and documents." : "Register a new user and automatically send login credentials via email."}
                  </p>
                </div>
                <button className="user-modal-close" onClick={closeModal}>
                  &#10005;
                </button>
              </div>

              <form className="user-form" onSubmit={handleSubmit} style={{ pointerEvents: submitting ? 'none' : 'auto', opacity: submitting ? 0.7 : 1 }}>
                {/* ===== Personal Information ===== */}
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
                    <input type="text" id="idCardNumber" name="idCardNumber" value={newUser.idCardNumber} onChange={handleChange} placeholder="Enter ID card number" maxLength={13} className={addErrors.idCardNumber ? "field-error" : ""} />
                    {addErrors.idCardNumber && <span className="field-error-text">{addErrors.idCardNumber}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="phoneNumber">Phone Number *</label>
                    <input type="text" id="phoneNumber" name="phoneNumber" value={newUser.phoneNumber} onChange={handleChange} placeholder="Enter phone number" maxLength={11} className={addErrors.phoneNumber ? "field-error" : ""} />
                    {addErrors.phoneNumber && <span className="field-error-text">{addErrors.phoneNumber}</span>}
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
                    <input type="text" id="emergencyContactPhone" name="emergencyContactPhone" value={newUser.emergencyContactPhone} onChange={handleChange} placeholder="Emergency contact phone" maxLength={11} className={addErrors.emergencyContactPhone ? "field-error" : ""} />
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
                    <label htmlFor="professionalEmailPassword">Password of Professional Email *</label>
                    <input type="password" id="professionalEmailPassword" name="professionalEmailPassword" value={newUser.professionalEmailPassword} onChange={handleChange} placeholder="Enter professional email password" className={addErrors.professionalEmailPassword ? "field-error" : ""} />
                    {addErrors.professionalEmailPassword && <span className="field-error-text">{addErrors.professionalEmailPassword}</span>}
                  </div>
                </div>

                {/* ===== Employment Details ===== */}
                <h3 className="form-section-title">Employment Details</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="designation">Designation / Role *</label>
                    <select id="designation" name="designation" value={newUser.designation} onChange={handleChange} className={addErrors.designation ? "field-error" : ""}>
                      <option value="">Select Designation</option>
                      {DESIGNATIONS.map((d) =>
                        d === "__custom__" ? (
                          <option key="custom" value="__custom__">Custom / Type Here</option>
                        ) : (
                          <option key={d} value={d}>{d}</option>
                        )
                      )}
                    </select>
                    {addErrors.designation && <span className="field-error-text">{addErrors.designation}</span>}
                  </div>
                  {newUser.designation === "__custom__" && (
                    <div className="form-row">
                      <label htmlFor="designationCustom">Custom Designation</label>
                      <input type="text" id="designationCustom" name="designationCustom" value={newUser.designationCustom} onChange={handleChange} placeholder="Enter custom designation" className={addErrors.designationCustom ? "field-error" : ""} />
                      {addErrors.designationCustom && <span className="field-error-text">{addErrors.designationCustom}</span>}
                    </div>
                  )}
                  <div className="form-row">
                    <label htmlFor="department">Department *</label>
                    <select id="department" name="department" value={newUser.department} onChange={handleChange} className={addErrors.department ? "field-error" : ""}>
                      <option value="">Select Department</option>
                      {DEPARTMENTS.map((d) =>
                        d === "__custom__" ? (
                          <option key="custom" value="__custom__">Custom / Type Here</option>
                        ) : (
                          <option key={d} value={d}>{d}</option>
                        )
                      )}
                    </select>
                    {addErrors.department && <span className="field-error-text">{addErrors.department}</span>}
                  </div>
                  {newUser.department === "__custom__" && (
                    <div className="form-row">
                      <label htmlFor="departmentCustom">Custom Department</label>
                      <input type="text" id="departmentCustom" name="departmentCustom" value={newUser.departmentCustom} onChange={handleChange} placeholder="Enter custom department" className={addErrors.departmentCustom ? "field-error" : ""} />
                      {addErrors.departmentCustom && <span className="field-error-text">{addErrors.departmentCustom}</span>}
                    </div>
                  )}
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
                    <input type="date" id="jobStartedDate" name="jobStartedDate" value={newUser.jobStartedDate} min={new Date().toISOString().split('T')[0]} onChange={handleChange} className={addErrors.jobStartedDate ? "field-error" : ""} />
                    {addErrors.jobStartedDate && <span className="field-error-text">{addErrors.jobStartedDate}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="jobEndedDate">Job Ended Date</label>
                    <input type="date" id="jobEndedDate" name="jobEndedDate" value={newUser.jobEndedDate} min={newUser.jobStartedDate || new Date().toISOString().split('T')[0]} onChange={handleChange} />
                  </div>
                </div>

                {/* ===== Salary & Bank ===== */}
                <h3 className="form-section-title">Salary & Bank Details</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="grossSalary">Gross Salary</label>
                    <input type="number" id="grossSalary" name="grossSalary" value={newUser.grossSalary} onChange={handleChange} placeholder="Enter gross salary" className={addErrors.grossSalary ? "field-error" : ""} />
                    {addErrors.grossSalary && <span className="field-error-text">{addErrors.grossSalary}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="appliedVia">Applied Via</label>
                    <input type="text" id="appliedVia" name="appliedVia" value={newUser.appliedVia} onChange={handleChange} placeholder="e.g. Website, Referral, LinkedIn" />
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
                    {editingUser && editingUser.other_document && newUser.otherDocument.length === 0 && (
                      <div style={{ marginBottom: 6, fontSize: 13, color: "#64748b" }}>
                        Current: <a href={`${API_URL}/users/${editingUser.id}/documents/other_document?token=${authToken()}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>View uploaded file(s)</a>
                      </div>
                    )}
                    <input
                      type="file"
                      id="otherDocument"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        const valid = [];
                        for (const f of files) {
                          if (!["application/pdf","image/jpeg","image/png","image/webp"].includes(f.type)) {
                            notify.error(`"${f.name}" is not a supported file type. Skipped.`);
                            continue;
                          }
                          valid.push(f);
                        }
                        if (valid.length > 0) {
                          setNewUser((p) => ({ ...p, otherDocument: [...p.otherDocument, ...valid] }));
                        }
                        e.target.value = "";
                      }}
                    />
                    {newUser.otherDocument.length > 0 && (
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                        {newUser.otherDocument.map((f, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}>
                            <span style={{ color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{f.name}</span>
                            <button type="button" onClick={() => {
                              setNewUser((p) => ({ ...p, otherDocument: p.otherDocument.filter((_, idx) => idx !== i) }));
                            }} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 12, fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>Remove</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>


                </div>

                <div className="user-form-actions">
                  <button type="button" className="secondary-button" onClick={closeModal} disabled={submitting}>
                    Cancel
                  </button>
                  <LoadingButton type="submit" className="primary-button" loading={submitting}>
                    {submitting ? (editingUser ? "Updating User..." : "Creating User...") : (editingUser ? "Update User" : "Create User")}
                  </LoadingButton>
                </div>
              </form>
            </div>
          </div>
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

    <CompanyDocuments
      isOpen={companyDocsOpen}
      onClose={() => setCompanyDocsOpen(false)}
    />
    </>
  );
}

export default ManageUsers;
