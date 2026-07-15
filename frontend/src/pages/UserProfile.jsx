/**
 * UserProfile page component — admin/manager view of another user's profile.
 *
 * Displays the selected user's personal information, employment details,
 * email accounts, salary/bank data, uploaded documents and account status.
 * Provides an edit modal (accessible to admins and managers) for updating
 * user fields, uploading documents and changing system role.  Read-only for
 * non-admin roles unless editing their own profile.
 */

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import { MdEdit, MdArrowBack } from "react-icons/md";
import { Pencil, Trash2, Eye } from "lucide-react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import ConfirmModal from "../components/ConfirmModal";
import { publish } from "../utils/eventBus";
import API_URL from "../config/api";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import { authToken, getCurrentRole, rolePath, getUser, normalizeRole } from "../utils/auth";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage } from "../utils/notify";
import { formatDateTimeInline } from "../utils/formatDateTime";
import { useActivityHighlight } from "../hooks/useActivityHighlight";
import "../components/layout/ActivityHighlight.css";
import "./UserProfile.css";
import { useSubmit } from "../hooks/useSubmit";
import LoadingButton from "../components/LoadingButton";
import "./ManageUsers.css";
import "./TaskDetails.css";

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

/** Formats raw phone digits for display: 03XX-XXXXXXX */
const displayPhone = (value) => {
  if (!value) return "---";
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return digits.slice(0, 4) + "-" + digits.slice(4);
};

/** Formats raw CNIC digits for display: XXXXX-XXXXXXX-X */
const displayCNIC = (value) => {
  if (!value) return "---";
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return digits.slice(0, 5) + "-" + digits.slice(5);
  return digits.slice(0, 5) + "-" + digits.slice(5, 12) + "-" + digits.slice(12);
};

/** Formats date string to display format without timezone issues */
const displayDate = (dateStr) => {
  if (!dateStr) return "---";
  const parts = dateStr.substring(0, 10).split("-");
  if (parts.length !== 3) return dateStr;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parseInt(parts[2])} ${months[parseInt(parts[1]) - 1]} ${parts[0]}`;
};

/** Main UserProfile page — fetches and displays another user's full profile. */
function UserProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const notify = useNotification();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showProfPassword, setShowProfPassword] = useState(false);
  const [error, setError] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [desgDropdownOpen, setDesgDropdownOpen] = useState(false);
  const [deptDropdownOpen, setDeptDropdownOpen] = useState(false);
  const desgDropdownRef = useRef(null);
  const deptDropdownRef = useRef(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState({ type: "", value: "" });
  const [avatarRemoveConfirmOpen, setAvatarRemoveConfirmOpen] = useState(false);
  const [editUser, setEditUser] = useState({
    name: "",
    father_name: "",
    id_card_number: "",
    present_address: "",
    permanent_address: "",
    phone_number: "",
    emergency_contact_name: "",
    emergency_contact_relation: "",
    emergency_contact_phone: "",
    personal_email: "",
    professional_email: "",
    professional_email_password: "",
    department: "",
    departmentCustom: "",
    designation: "",
    designationCustom: "",
    hired_for: "",
    employee_code: "",
    job_started_date: "",
    job_ended_date: "",
    role: "member",
    gross_salary: "",
    applied_via: "",
    bank_name: "",
    bank_account_number: "",
    bank_account_title: "",
  });
  const [editErrors, setEditErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const { submitting, run } = useSubmit();
  const [editFiles, setEditFiles] = useState({});
  const [filePreviews, setFilePreviews] = useState({});
  const [editOtherDocs, setEditOtherDocs] = useState([]);
  const [editAvatarFile, setEditAvatarFile] = useState(null);
  const [currentUserRole] = useState(() => getCurrentRole());
  const [changes, setChanges] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [resignConfirmOpen, setResignConfirmOpen] = useState(false);
  const [removeDocConfirmOpen, setRemoveDocConfirmOpen] = useState(false);
  const [pendingRemoveDoc, setPendingRemoveDoc] = useState({ source: "", index: -1 });
  const [existingOtherDocs, setExistingOtherDocs] = useState([]);
  const [companyDocs, setCompanyDocs] = useState({});
  const [editDocItem, setEditDocItem] = useState(null);
  const [editDocName, setEditDocName] = useState("");
  const [editDocFile, setEditDocFile] = useState(null);
  const [editDocExistingFileName, setEditDocExistingFileName] = useState("");
  const [deleteDocConfirmOpen, setDeleteDocConfirmOpen] = useState(false);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState(null);

  // Dynamic departments and designations from users data + localStorage persistence
  const [deletedDesignations, setDeletedDesignations] = useState(() => {
    try { return JSON.parse(localStorage.getItem("deleted_designations") || "[]"); } catch { return []; }
  });
  const [deletedDepartments, setDeletedDepartments] = useState(() => {
    try { return JSON.parse(localStorage.getItem("deleted_departments") || "[]"); } catch { return []; }
  });

  const departments = [
    ...new Set([
      ...allUsers.map((u) => u.department).filter(Boolean),
      ...(() => {
        try { return JSON.parse(localStorage.getItem("persisted_departments") || "[]"); } catch { return []; }
      })(),
    ]),
  ].filter((d) => !deletedDepartments.includes(d));
  const designations = [
    ...new Set([
      ...allUsers.map((u) => u.designation).filter(Boolean),
      ...(() => {
        try { return JSON.parse(localStorage.getItem("persisted_designations") || "[]"); } catch { return []; }
      })(),
    ]),
  ].filter((d) => !deletedDesignations.includes(d));

  const {
    hasUnread: userHasUnread,
    isItemUnread: isUserItemUnread,
    markViewed: markUserViewed,
  } = useActivityHighlight("user", userId, profileData?.activity_max_id || 0, changes);

  const { isDirty: editIsDirty, setIsDirty: setEditIsDirty, handleClose: handleEditClose, ConfirmDialog: EditConfirmDialog } = useConfirmOnClose(() => { setIsEditModalOpen(false); setExistingOtherDocs([]); });
  useEscapeKey(isEditModalOpen, handleEditClose);

  useEffect(() => {
    if (isEditModalOpen) {
      const overlay = document.querySelector(".user-modal-overlay");
      if (overlay) overlay.scrollTop = 0;
    }
  }, [isEditModalOpen]);

  /** Build auth headers for API requests. */
  const authHeaders = () => {
    const token = authToken();
    return {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    };
  };

  /** Resign icon component */
  const ResignIcon = ({ className = "" }) => (
    <svg
      className={className}
      width="16"
      height="16"
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

  /** Handle resign button click */
  const handleResignUser = () => {
    setResignConfirmOpen(true);
  };

  /** Confirm and execute user resignation via API */
  const confirmResignUser = async () => {
    setResignConfirmOpen(false);
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
      setProfileData((prev) => ({ ...prev, active: false }));
      showSuccessMessage("User", "resigned");
      publish('data:changed', { type: 'user', action: 'resigned' });
    });
  };

  /** Fetch the target user's profile data from the API. */
  const fetchProfile = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/users/${userId}/profile`, {
        headers: { Accept: "application/json", ...authHeaders() },
        skipLoader: true,
      });
      if (!res.ok) throw new Error("Unable to load user profile");
      const data = await res.json();
      setProfileData(data);
    } catch (err) {
      setError(err.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const fetchChanges = async () => {
    try {
      const res = await fetch(`${API_URL}/users/${userId}/changes`, {
        headers: { Accept: "application/json", ...authHeaders() },
      });
      const data = await res.json();
      if (data.success) setChanges(data.changes || []);
    } catch { }
  };

  useEffect(() => {
    const role = getCurrentRole();
    const token = authToken();
    if (!token || (role !== "admin" && role !== "manager")) {
      navigate("/");
      return;
    }
    fetchProfile();
    fetchChanges();
  }, [userId, navigate]);

  // Fetch all users for dynamic department/designation dropdowns
  useEffect(() => {
    const fetchAllUsers = async () => {
      try {
        const res = await fetch(`${API_URL}/users`, {
          headers: { Accept: "application/json", ...authHeaders() },
          _notifHandled: true,
        });
        if (res.ok) {
          const data = await res.json();
          setAllUsers(data.users ?? data);
        }
      } catch { }
    };
    fetchAllUsers();
  }, []);

  // Fetch company documents
  useEffect(() => {
    const fetchCompanyDocs = async () => {
      try {
        const res = await fetch(`${API_URL}/company-documents`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${authToken()}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCompanyDocs(data.documents || {});
        }
      } catch { }
    };
    fetchCompanyDocs();
  }, []);

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

  const getInitials = (name) => {
    if (!name) return "?";
    return name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0].toUpperCase())
      .join("");
  };

  /** Populate the edit form with current user data and open the modal. */
  const openEditModal = () => {
    const u = profileData.user;
    const deptVal = u.department || "";
    const isCustomDept = !departments.includes(deptVal) && deptVal !== "";
    const desgVal = u.designation || "";
    const isCustomDesg = !designations.includes(desgVal) && desgVal !== "";

    setEditUser({
      name: u.name || "",
      father_name: u.father_name || "",
      id_card_number: formatCNIC(u.id_card_number || ""),
      present_address: u.present_address || u.address || "",
      permanent_address: u.permanent_address || "",
      phone_number: formatPhone(u.phone_number || u.contact_no || ""),
      emergency_contact_name: u.emergency_contact_name || "",
      emergency_contact_relation: u.emergency_contact_relation || "",
      emergency_contact_phone: formatPhone(u.emergency_contact_phone || ""),
      personal_email: u.personal_email || "",
      professional_email: u.professional_email || "",
      professional_email_password: u.professional_email_password || "",
      department: isCustomDept ? "__custom__" : deptVal,
      departmentCustom: isCustomDept ? deptVal : "",
      designation: isCustomDesg ? "__custom__" : desgVal,
      designationCustom: isCustomDesg ? desgVal : "",
      hired_for: u.hired_for || "",
      employee_code: u.employee_code || "",
      job_started_date: u.job_started_date ? u.job_started_date.substring(0, 10) : "",
      job_ended_date: u.job_ended_date ? u.job_ended_date.substring(0, 10) : "",
      role: u.role || "member",
      gross_salary: u.gross_salary || "",
      applied_via: u.applied_via || "",
      bank_name: u.bank_name || "",
      bank_account_number: u.bank_account_number || "",
      bank_account_title: u.bank_account_title || "",
    });
    setEditErrors({});
    setEditFiles({});
    setFilePreviews({});
    // Initialize existing other docs with rename state
    const docs = typeof u.other_document === "string" ? (() => { try { return JSON.parse(u.other_document); } catch { return []; } })() : (u.other_document || []);
    setExistingOtherDocs((Array.isArray(docs) ? docs : []).filter(d => d).map((doc) => {
      const docPath = typeof doc === "string" ? doc : (doc && doc.path ? doc.path : null);
      if (!docPath) return null;
      const docName = typeof doc === "object" && doc.name ? doc.name : docPath.split("/").pop().replace(/^other_document_\d+_\d+_/, "").replace(/\.[^.]+$/, "");
      return { path: docPath, name: docName, renaming: false };
    }).filter(Boolean));
    setIsEditModalOpen(true);
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    let formattedValue = value;
    if (name === "id_card_number") formattedValue = formatCNIC(value);
    if (name === "phone_number" || name === "emergency_contact_phone") formattedValue = formatPhone(value);
    setEditUser((prev) => ({ ...prev, [name]: formattedValue }));
    setEditIsDirty(true);
    if (editErrors[name]) {
      setEditErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleCustomRevert = (field) => {
    const customField = field === "department" ? "departmentCustom" : "designationCustom";
    setEditUser((prev) => ({ ...prev, [field]: "", [customField]: "" }));
    setEditIsDirty(true);
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
      if (editUser.designation === value) {
        setEditUser((prev) => ({ ...prev, designation: "", designationCustom: "" }));
      }
    } else if (type === "department") {
      setDeletedDepartments((prev) => {
        const next = [...prev, value];
        localStorage.setItem("deleted_departments", JSON.stringify(next));
        return next;
      });
      if (editUser.department === value) {
        setEditUser((prev) => ({ ...prev, department: "", departmentCustom: "" }));
      }
    }
    setConfirmDeleteOpen(false);
    setPendingDelete({ type: "", value: "" });
  };

  /** Edit a document — rename and/or replace file via API. */
  const handleEditDoc = async () => {
    if (!editDocItem) return;
    if (!editDocName.trim() && !editDocFile) return;

    const isOther = editDocItem.type === "other_document";
    const idx = editDocItem.index;

    try {
      if (editDocFile) {
        // File replacement — use FormData with POST
        const formData = new FormData();
        formData.append("doc_type", editDocItem.type);
        if (isOther) formData.append("doc_index", idx);
        if (editDocName.trim()) formData.append("doc_name", editDocName.trim());
        formData.append("doc_file", editDocFile);

        const res = await fetch(`${API_URL}/users/${userId}/document/replace`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${authToken()}` },
          body: formData,
          _notifHandled: true,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to replace document");

        // Merge returned user data into profileData
        if (data.user) {
          setProfileData((prev) => {
            if (!prev) return prev;
            return { ...prev, user: { ...prev.user, ...data.user } };
          });
        }
      } else {
        // Rename only
        if (isOther) {
          // other_document rename — backend stores the new name
          const res = await fetch(`${API_URL}/users/${userId}/document/rename`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${authToken()}` },
            body: JSON.stringify({ type: editDocItem.type, index: idx, name: editDocName.trim() }),
            _notifHandled: true,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || "Failed to rename document");

          // Merge returned user data (other_document field updated)
          if (data.user) {
            setProfileData((prev) => {
              if (!prev) return prev;
              return { ...prev, user: { ...prev.user, ...data.user } };
            });
          }
        } else {
          // Single doc rename — no backend storage for labels, skip API call
          // The display label is handled locally; no DB change needed.
        }
      }

      // Re-fetch profile in background to ensure data sync
      try {
        const profileRes = await fetch(`${API_URL}/users/${userId}/profile`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${authToken()}` },
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          if (profile?.user) setProfileData(profile);
        }
      } catch {}

      showSuccessMessage("Document", editDocFile ? "replaced" : "renamed");
      publish("data:changed", { type: "user", action: "updated" });
    } catch (err) {
      notify.error(err.message);
    } finally {
      setEditDocItem(null);
      setEditDocName("");
      setEditDocFile(null);
      setEditDocExistingFileName("");
    }
  };

  /** Delete a document via API. */
  const handleDeleteDoc = async () => {
    if (!pendingDeleteDoc) return;
    const isOther = pendingDeleteDoc.type === "other_document";
    const idx = pendingDeleteDoc.index;

    try {
      const res = await fetch(`${API_URL}/users/${userId}/document`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${authToken()}` },
        body: JSON.stringify({ type: pendingDeleteDoc.type, index: idx }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to delete document");

      // For delete, merge returned user data if available
      if (data.user) {
        setProfileData((prev) => {
          if (!prev) return prev;
          return { ...prev, user: { ...prev.user, ...data.user } };
        });
      } else {
        // Fallback: update state directly for other_document removal
        setProfileData((prev) => {
          if (!prev) return prev;
          const user = { ...prev.user };
          if (isOther) {
            let docs = [];
            try { docs = typeof user.other_document === "string" ? JSON.parse(user.other_document) : (user.other_document || []); } catch { docs = []; }
            if (!Array.isArray(docs)) docs = [];
            if (idx >= 0 && idx < docs.length) {
              docs.splice(idx, 1);
            }
            user.other_document = docs.length > 0 ? JSON.stringify(docs) : null;
          } else if (pendingDeleteDoc.type) {
            user[pendingDeleteDoc.type] = null;
          }
          return { ...prev, user };
        });
      }

      // Re-fetch profile
      try {
        const profileRes = await fetch(`${API_URL}/users/${userId}/profile`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${authToken()}` },
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          if (profile?.user) setProfileData(profile);
        }
      } catch {}

      showSuccessMessage("Document", "deleted");
      publish("data:changed", { type: "user", action: "updated" });
    } catch (err) {
      notify.error(err.message);
    } finally {
      setDeleteDocConfirmOpen(false);
      setPendingDeleteDoc(null);
    }
  };

  /** Validate the edit form fields and return an errors object. */
  const validateEditForm = () => {
    const errors = {};
    if (!editUser.name.trim()) {
      errors.name = "Full Name is required.";
    } else if (!/^[a-zA-Z\s]+$/.test(editUser.name.trim())) {
      errors.name = "Full Name must contain only letters and spaces.";
    }
    if (!editUser.father_name.trim()) {
      errors.father_name = "Father Name is required.";
    } else if (!/^[a-zA-Z\s]+$/.test(editUser.father_name.trim())) {
      errors.father_name = "Father Name must contain only letters and spaces.";
    }
    if (!editUser.id_card_number.trim()) {
      errors.id_card_number = "ID Card Number is required.";
    } else if (!/^\d{5}-\d{7}-\d$/.test(editUser.id_card_number.trim())) {
      errors.id_card_number = "CNIC must be in format XXXXX-XXXXXXX-X (13 digits).";
    }
    if (!editUser.present_address.trim()) errors.present_address = "Present Address is required.";
    if (!editUser.phone_number.trim()) {
      errors.phone_number = "Phone Number is required.";
    } else if (!/^0\d{3}-\d{7}$/.test(editUser.phone_number.trim())) {
      errors.phone_number = "Phone Number must be in format 03XX-XXXXXXX.";
    }
    if (editUser.emergency_contact_phone.trim() && !/^0\d{3}-\d{7}$/.test(editUser.emergency_contact_phone.trim())) {
      errors.emergency_contact_phone = "Emergency Phone must be in format 03XX-XXXXXXX.";
    }
    if (editUser.personal_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editUser.personal_email.trim())) {
      errors.personal_email = "Please enter a valid personal email address.";
    }
    if (editUser.professional_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editUser.professional_email.trim())) {
      errors.professional_email = "Please enter a valid professional email address.";
    }
    const isExistingProEmail = editUser.professional_email.trim() === (profileData?.user?.professional_email || "").trim();
    if (editUser.professional_email.trim() && !editUser.professional_email_password.trim() && !isExistingProEmail) {
      errors.professional_email_password = "Password is required when professional email is provided.";
    }
    if (!editUser.department) {
      errors.department = "Department is required.";
    } else if (editUser.department === "__custom__" && !editUser.departmentCustom.trim()) {
      errors.departmentCustom = "Custom Department is required.";
    }
    if (!editUser.designation) {
      errors.designation = "Designation is required.";
    } else if (editUser.designation === "__custom__" && !editUser.designationCustom.trim()) {
      errors.designationCustom = "Custom Designation is required.";
    }
    if (!editUser.employee_code.trim()) errors.employee_code = "Employee Code is required.";
    if (!editUser.job_started_date) errors.job_started_date = "Job Start Date is required.";
    if (editUser.gross_salary && editUser.gross_salary.length > 100) {
      errors.gross_salary = "Gross Salary must be 300 characters or less.";
    }
    if (editUser.bank_account_number.trim() && !/^[\d\s\-a-zA-Z]+$/.test(editUser.bank_account_number.trim())) {
      errors.bank_account_number = "Bank Account Number must contain only digits, letters, spaces, or dashes.";
    }
    return errors;
  };

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
            if (modalBody) el.scrollIntoView({ block: "center", behavior: "smooth" });
            el.focus();
            break;
          }
        }
      }
    }, 100);
  };

  /** Submit the updated user data (with optional file uploads) to the API. */
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    const errors = validateEditForm();
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) {
      scrollToFirstError(errors);
      return;
    }

    const finalDepartment =
      editUser.department === "__custom__" ? editUser.departmentCustom : editUser.department;
    const finalDesignation =
      editUser.designation === "__custom__" ? editUser.designationCustom : editUser.designation;

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

    await run(async () => {
      const isOwnProfile = String(getUser()?.id) === String(userId);
      const formData = new FormData();
      formData.append("name", editUser.name);
      formData.append("father_name", editUser.father_name);
      formData.append("id_card_number", editUser.id_card_number);
      formData.append("present_address", editUser.present_address);
      formData.append("permanent_address", editUser.permanent_address);
      formData.append("phone_number", editUser.phone_number);
      formData.append("emergency_contact_name", editUser.emergency_contact_name);
      formData.append("emergency_contact_relation", editUser.emergency_contact_relation);
      formData.append("emergency_contact_phone", editUser.emergency_contact_phone);
      formData.append("personal_email", editUser.personal_email || "");
      formData.append("professional_email", editUser.professional_email || "");
      if (editUser.professional_email_password) {
        formData.append("professional_email_password", editUser.professional_email_password || "");
      }
      formData.append("department", finalDepartment || "");
      formData.append("designation", finalDesignation || "");
      formData.append("hired_for", editUser.hired_for);
      formData.append("employee_code", editUser.employee_code);
      formData.append("job_started_date", editUser.job_started_date);
      formData.append("job_ended_date", editUser.job_ended_date);
      formData.append("role", editUser.role);
      formData.append("gross_salary", editUser.gross_salary);
      formData.append("applied_via", editUser.applied_via);
      formData.append("bank_name", editUser.bank_name);
      formData.append("bank_account_number", editUser.bank_account_number);
      formData.append("bank_account_title", editUser.bank_account_title);

      const fileFields = [
        "employment_contract", "offer_letter", "techxaro_regulations",
      ];
      fileFields.forEach((field) => {
        if (editFiles[field]) {
          formData.append(field, editFiles[field]);
        }
      });

      if (editOtherDocs.length > 0) {
        editOtherDocs.forEach((item) => {
          formData.append("other_document[]", item.file);
          formData.append("other_document_names[]", item.customName || item.file.name.replace(/\.[^.]+$/, ""));
        });
      }

      // Existing other docs changes (renames / removals)
      if (user.other_document) {
        const originalDocs = typeof user.other_document === "string" ? (() => { try { return JSON.parse(user.other_document); } catch { return []; } })() : (user.other_document || []);
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
      if (editAvatarFile) {
        formData.append("avatar", editAvatarFile);
      }

      let url = isOwnProfile ? `${API_URL}/auth/update-profile` : `${API_URL}/users/${userId}`;

      if (!isOwnProfile) {
        formData.append('_method', 'PUT');
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${authToken()}`,
        },
        body: formData,
        _notifHandled: true,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unable to update user");

      setIsEditModalOpen(false);
      setEditFiles({});
      setFilePreviews({});
      setEditOtherDocs([]);
      setExistingOtherDocs([]);

      if (data.user) {
        setProfileData((prev) => ({ ...prev, user: { ...prev.user, ...data.user } }));
      }

      showSuccessMessage("User", "updated");
      publish('data:changed', { type: 'user', action: 'updated' });

      try {
        const profileRes = await fetch(`${API_URL}/users/${userId}/profile`, {
          headers: { Accept: "application/json", ...authHeaders() },
          _notifHandled: true,
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          setProfileData(profile);
        }
      } catch (reFetchErr) {
        console.error("Profile re-fetch failed:", reFetchErr);
      }
    });
  };

  if (loading) {
    return (
      <DashboardLayout hideRightSidebar={true}>
        <div className="user-profile-page">
          <div className="profile-loading">Loading profile...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout hideRightSidebar={true}>
        <div className="user-profile-page">
          <div className="profile-error">
            <p>{error}</p>
            <button className="primary-button" onClick={() => navigate(rolePath("manage-users"))}>
              Go Back
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const { user, account } = profileData;
  const isResignedProfile = account?.status === "Resigned" || (user && !user.active && user.must_change_password === false);
  const isOwnProfile = String(getUser()?.id) === String(userId);

  const breadcrumbs = [
    { label: "Users", path: rolePath("manage-users") },
    { label: user?.name || "User Profile" },
  ];

  const currentUserIndex = allUsers.findIndex((u) => String(u.id) === String(userId));
  const hasPrev = currentUserIndex > 0;
  const hasNext = currentUserIndex >= 0 && currentUserIndex < allUsers.length - 1;

  return (
    <DashboardLayout hideRightSidebar={true}>
      <div className="user-profile-page">
        <div className="profile">
          <div className="profile-layout">
        <Breadcrumb items={breadcrumbs} />
            <div className="profile-header-profile" style={{ display: "flex", alignItems: "center",gap: 310, }}>
              <div>
                <h1>User Profile</h1>
                <p>View and manage your personal information and account settings.</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <button
                  disabled={!hasPrev}
                  onClick={() => { if (hasPrev) navigate(rolePath(`manage-users/user-profile/${allUsers[currentUserIndex - 1].id}`)); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: hasPrev ? "#fff" : "#f9fafb", color: hasPrev ? "#374151" : "#9ca3af", fontWeight: 600, fontSize: 13, cursor: hasPrev ? "pointer" : "not-allowed", transition: "all 0.15s", whiteSpace: "nowrap" }}
                  onMouseEnter={(e) => { if (hasPrev) e.target.style.background = "#f3f4f6"; }}
                  onMouseLeave={(e) => { if (hasPrev) e.target.style.background = "#fff"; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                  Previous
                </button>
                <button
                  disabled={!hasNext}
                  onClick={() => { if (hasNext) navigate(rolePath(`manage-users/user-profile/${allUsers[currentUserIndex + 1].id}`)); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: hasNext ? "#fff" : "#f9fafb", color: hasNext ? "#374151" : "#9ca3af", fontWeight: 600, fontSize: 13, cursor: hasNext ? "pointer" : "not-allowed", transition: "all 0.15s", whiteSpace: "nowrap" }}
                  onMouseEnter={(e) => { if (hasNext) e.target.style.background = "#f3f4f6"; }}
                  onMouseLeave={(e) => { if (hasNext) e.target.style.background = "#fff"; }}
                >
                  Next
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              </div>
            </div>
            {/* LEFT SIDE */}
            <div className="profile-left">
              {/* User Card */}
              <div className="profile-top-row">
                <div className="profile-user-card">
                  <div className="profile-user-left">
                    <div className="profile-avatar">
                      {user.avatar ? (
                        <img src={`${API_URL.replace('/api', '')}/storage/${user.avatar}`} alt={user.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        getInitials(user.name)
                      )}
                    </div>
                    <div className="profile-user-info">
                      <h2>{user.name}</h2>
                      <span className="profile-designation">{user.designation || normalizeRole(user.role)}</span>
                    </div>
                  </div>
                </div>
                <div className="profile-avatar-center">
                  <div className="profile-avatar-large">
                    {user.avatar ? (
                      <img src={`${API_URL.replace('/api', '')}/storage/${user.avatar}`} alt={user.name} />
                    ) : (
                      getInitials(user.name)
                    )}
                  </div>
                </div>
              </div>

              {/* Personal Information */}
              <div className="profile-info-card">
                <div className="info-card-header">
                  <h3>Personal Information</h3>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {(!["admin", "manager"].includes(user.role) || currentUserRole === "admin") && (
                      <button className="btn-edit" onClick={openEditModal} disabled={isResignedProfile || isOwnProfile} style={isResignedProfile || isOwnProfile ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
                        <MdEdit size={16} /> Edit
                      </button>
                    )}
                    {(!["admin", "manager"].includes(user.role) || currentUserRole === "admin") && user.active !== false && String(getUser()?.id) !== String(userId) && (
                      <button className="btn-edit" onClick={handleResignUser} style={{ background: "#dc2626" }}>
                        <ResignIcon /> Resign
                      </button>
                    )}
                  </div>
                </div>
                <div className="info-card-body">
                  <div className="info-row">
                    <span className="info-label">Full Name</span>
                    <span className="info-value">{user.name || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Father Name</span>
                    <span className="info-value">{user.father_name || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">ID Card Number</span>
                    <span className="info-value">{displayCNIC(user.id_card_number)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Phone Number</span>
                    <span className="info-value">{displayPhone(user.phone_number || user.contact_no)}</span>
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="profile-info-card">
                <div className="info-card-header">
                  <h3>Address</h3>
                </div>
                <div className="info-card-body">
                  <div className="info-row">
                    <span className="info-label">Present Address</span>
                    <span className="info-value">{user.present_address || user.address || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Permanent Address</span>
                    <span className="info-value">{user.permanent_address || "---"}</span>
                  </div>
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="profile-info-card">
                <div className="info-card-header">
                  <h3>Emergency Contact</h3>
                </div>
                <div className="info-card-body">
                  <div className="info-row">
                    <span className="info-label">Name</span>
                    <span className="info-value">{user.emergency_contact_name || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Relation</span>
                    <span className="info-value">{user.emergency_contact_relation || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Phone</span>
                    <span className="info-value">{displayPhone(user.emergency_contact_phone)}</span>
                  </div>
                </div>
              </div>

              {/* Email Accounts */}
              <div className="profile-info-card">
                <div className="info-card-header">
                  <h3>Email Accounts</h3>
                </div>
                <div className="info-card-body">
                  <div className="info-row">
                    <span className="info-label">Personal Email</span>
                    <span className="info-value">{user.personal_email || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Professional Email</span>
                    <span className="info-value">{user.professional_email || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Password of Professional Email</span>
                    <span className="info-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {user.professional_email_password ? (showProfPassword ? user.professional_email_password : "********") : "---"}
                      {user.professional_email_password && (
                        <button type="button" onClick={() => setShowProfPassword(!showProfPassword)} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer', fontSize: '12px', color: '#6b7280' }}>
                          {showProfPassword ? "Hide" : "Show"}
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Employment Details */}
              <div className="profile-info-card">
                <div className="info-card-header">
                  <h3>Employment Details</h3>
                </div>
                <div className="info-card-body">
                  <div className="info-row">
                    <span className="info-label">Designation</span>
                    <span className="info-value">{user.designation || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Department</span>
                    <span className="info-value">{user.department || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Hired For</span>
                    <span className="info-value">{user.hired_for || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Employee Code</span>
                    <span className="info-value">{user.employee_code || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Role</span>
                    <span className="info-value">
                      {normalizeRole(user.role)}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Job Started Date</span>
                    <span className="info-value">{displayDate(user.job_started_date)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Job Ended Date</span>
                    <span className="info-value">{displayDate(user.job_ended_date)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Applied Via</span>
                    <span className="info-value">{user.applied_via || "---"}</span>
                  </div>
                </div>
              </div>

              {/* Salary & Bank Details */}
              <div className="profile-info-card">
                <div className="info-card-header">
                  <h3>Salary & Bank Details</h3>
                </div>
                <div className="info-card-body">
                  <div className="info-row">
                    <span className="info-label">Gross Salary</span>
                    <span className="info-value">{user.gross_salary || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Bank Name</span>
                    <span className="info-value">{user.bank_name || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Bank Account Number</span>
                    <span className="info-value">{user.bank_account_number || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Bank Account Title</span>
                    <span className="info-value">{user.bank_account_title || "---"}</span>
                  </div>
                </div>
              </div>

              {/* Documents */}
              <div className="profile-info-card">
                <div className="info-card-header">
                  <h3>Documents</h3>
                </div>
                <div className="info-card-body">
                  {[
                    { label: "Employment Contract", key: "employment_contract" },
                    { label: "Offer Letter", key: "offer_letter" },
                    { label: "Techxaro Regulations", key: "techxaro_regulations" },
                  ].map(({ label, key }) => (
                    <div className="info-row" key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span className="info-label">{label}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                        {user[key] ? (
                          <>
                            <a
                              href={`${API_URL}/users/${userId}/documents/${key}?token=${authToken()}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ background: "#2563eb", border: "none", color: "#fff", cursor: "pointer", padding: "6px 9px", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
                              title="View"
                            >
                              <Eye size={16} />
                            </a>
                          </>
                        ) : "---"}
                      </div>
                    </div>
                  ))}
                  {(() => {
                    let docs = [];
                    try {
                      docs = typeof user.other_document === "string" ? JSON.parse(user.other_document) : (user.other_document || []);
                    } catch { docs = []; }
                    if (!Array.isArray(docs)) docs = [];
                    if (docs.length === 0) {
                      return (
                        <div className="info-row">
                          <span className="info-label">Other Documents</span>
                          <span className="info-value">---</span>
                        </div>
                      );
                    }
                    return docs.map((doc, i) => {
                      const docPath = typeof doc === "string" ? doc : doc.path;
                      const docName = typeof doc === "object" && doc.name ? doc.name : docPath.split("/").pop().replace(/^other_document_\d+_\d+_/, "").replace(/\.[^.]+$/, "");
                      return (
                        <div className="info-row" key={`other-${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span className="info-label">{docName}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                            <a
                              href={`${API_URL}/users/${userId}/documents/other_document?token=${authToken()}&file=${encodeURIComponent(docPath)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ background: "#2563eb", border: "none", color: "#fff", cursor: "pointer", padding: "6px 9px", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
                              title="View"
                            >
                              <Eye size={16} />
                            </a>
                          </div>
                        </div>
                      );
                    });
                  })()}
                  {companyDocs?.other_documents?.files?.map((file, i) => {
                    const fileName = file.filename.replace(/^other_document_\d+_/, "").replace(/\.[^.]+$/, "");
                    return (
                      <div className="info-row" key={`company-${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span className="info-label">{fileName}</span>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flex: 1 }}>
                          <a
                            href={`${API_URL.replace("/api", "")}/storage/${file.path}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: "#2563eb", border: "none", color: "#fff", cursor: "pointer", padding: "6px 9px", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
                            title="View"
                          >
                            <Eye size={16} />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
          
            {/* RIGHT SIDE - Account Status */}
            <div className="profile-right">
              <div className="account-status-card">
                <h3>Account Status</h3>
                <div className="status-list">
                  <div className="status-item">
                    <span className={`status-dot ${account?.status === "Active" ? "dot-active" : "dot-inactive"}`}></span>
                    <span className="status-text">{account?.status || (user.active ? "Active" : user.must_change_password ? "Inactive" : "Resigned")}</span>
                  </div>
                  <div className="status-item">
                    <span className="status-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    </span>
                    <div className="status-info">
                      <span className="status-label">Member Since</span>
                      <span className="status-value">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "---"}
                      </span>
                    </div>
                  </div>
                  <div className="status-item">
                    <span className="status-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    </span>
                    <div className="status-info">
                      <span className="status-label">Last Login</span>
                      <span className="status-value">
                        {user.last_login_at
                          ? new Date(user.last_login_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })
                          : "Never logged in"}
                      </span>
                    </div>
                  </div>
                  <div className="status-item">
                    <span className="status-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18"></path><path d="M9 8h1"></path><path d="M9 12h1"></path><path d="M9 16h1"></path><path d="M14 8h1"></path><path d="M14 12h1"></path><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"></path></svg>
                    </span>
                    <div className="status-info">
                      <span className="status-label">Account Type</span>
                      <span className="status-value">Employee</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* Activity section hidden for now */}
            </div>
        </div>

      </div>

      {/* EDIT MODAL */}
      {isEditModalOpen && createPortal(
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
                  <h2>Edit User</h2>
                  <p className="modal-subtitle">Update user details.</p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <LoadingButton
                  onClick={handleEditSubmit}
                  className="primary-button"
                  style={{ fontSize: 14 }}
                >
                  Update User
                </LoadingButton>
                <button className="user-modal-close" onClick={handleEditClose}>
                  &#10005;
                </button>
              </div>
            </div>

            <form className="user-form" onSubmit={handleEditSubmit}>
              {/* ===== Profile Photo + Personal Information Row ===== */}
              <div className="personal-info-top-row">
                <div className="personal-info-fields">
                  <h3 className="form-section-title">Personal Information</h3>
                  <div className="user-form-grid">
                    <div className="form-row">
                      <label htmlFor="edit-name">Employee Full Name *</label>
                      <input type="text" id="edit-name" name="name" value={editUser.name} onChange={handleEditChange} placeholder="Enter full name" className={editErrors.name ? "field-error" : ""} />
                      {editErrors.name && <span className="field-error-text">{editErrors.name}</span>}
                    </div>
                    <div className="form-row">
                      <label htmlFor="edit-father_name">Father Name *</label>
                      <input type="text" id="edit-father_name" name="father_name" value={editUser.father_name} onChange={handleEditChange} placeholder="Enter father name" className={editErrors.father_name ? "field-error" : ""} />
                      {editErrors.father_name && <span className="field-error-text">{editErrors.father_name}</span>}
                    </div>
                    <div className="form-row">
                      <label htmlFor="edit-id_card_number">ID Card Number *</label>
                      <input type="text" id="edit-id_card_number" name="id_card_number" value={editUser.id_card_number} onChange={handleEditChange} placeholder="XXXXX-XXXXXXX-X" maxLength={15} className={editErrors.id_card_number ? "field-error" : ""} />
                      {editErrors.id_card_number && <span className="field-error-text">{editErrors.id_card_number}</span>}
                    </div>
                    <div className="form-row">
                      <label htmlFor="edit-phone_number">Phone Number *</label>
                      <input type="text" id="edit-phone_number" name="phone_number" value={editUser.phone_number} onChange={handleEditChange} placeholder="03XX-XXXXXXX" maxLength={12} className={editErrors.phone_number ? "field-error" : ""} />
                      {editErrors.phone_number && <span className="field-error-text">{editErrors.phone_number}</span>}
                    </div>
                  </div>
                </div>

                {/* ===== Profile Photo ===== */}
                <div className="avatar-upload-section">
                  <label className="avatar-upload-label">Profile Photo</label>
                  <div className="avatar-upload-row">
                    <div className="avatar-preview" onClick={() => document.getElementById('edit-avatar-input').click()}>
                      {editAvatarFile ? (
                        <img src={URL.createObjectURL(editAvatarFile)} alt="Avatar preview" />
                      ) : user.avatar ? (
                        <img src={`${API_URL.replace('/api', '')}/storage/${user.avatar}`} alt="Avatar preview" />
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
                    <input id="edit-avatar-input" type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files[0]; if (file) setEditAvatarFile(file); }} />
                    {(editAvatarFile || user.avatar) && (
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
                  <label htmlFor="edit-present_address">Present Address *</label>
                  <input type="text" id="edit-present_address" name="present_address" value={editUser.present_address} onChange={handleEditChange} placeholder="Enter present address" className={editErrors.present_address ? "field-error" : ""} />
                  {editErrors.present_address && <span className="field-error-text">{editErrors.present_address}</span>}
                </div>
                <div className="form-row">
                  <label htmlFor="edit-permanent_address">Permanent Address</label>
                  <input type="text" id="edit-permanent_address" name="permanent_address" value={editUser.permanent_address} onChange={handleEditChange} placeholder="Enter permanent address" />
                </div>
              </div>

              {/* ===== Emergency Contact ===== */}
              <h3 className="form-section-title">Emergency Contact</h3>
              <div className="user-form-grid">
                <div className="form-row">
                  <label htmlFor="edit-emergency_contact_name">Name</label>
                  <input type="text" id="edit-emergency_contact_name" name="emergency_contact_name" value={editUser.emergency_contact_name} onChange={handleEditChange} placeholder="Emergency contact name" />
                </div>
                <div className="form-row">
                  <label htmlFor="edit-emergency_contact_relation">Relation</label>
                  <input type="text" id="edit-emergency_contact_relation" name="emergency_contact_relation" value={editUser.emergency_contact_relation} onChange={handleEditChange} placeholder="e.g. Father, Mother, Spouse" />
                </div>
                <div className="form-row">
                  <label htmlFor="edit-emergency_contact_phone">Phone</label>
                  <input type="text" id="edit-emergency_contact_phone" name="emergency_contact_phone" value={editUser.emergency_contact_phone} onChange={handleEditChange} placeholder="03XX-XXXXXXX" maxLength={12} className={editErrors.emergency_contact_phone ? "field-error" : ""} />
                  {editErrors.emergency_contact_phone && <span className="field-error-text">{editErrors.emergency_contact_phone}</span>}
                </div>
              </div>

              {/* ===== Email Accounts ===== */}
              <h3 className="form-section-title">Email Accounts</h3>
              <div className="user-form-grid">
                <div className="form-row">
                  <label htmlFor="edit-personal_email">Personal Email Address</label>
                  <input type="email" id="edit-personal_email" name="personal_email" value={editUser.personal_email} onChange={handleEditChange} placeholder="Enter personal email address" className={editErrors.personal_email ? "field-error" : ""} />
                  {editErrors.personal_email && <span className="field-error-text">{editErrors.personal_email}</span>}
                </div>
                <div className="form-row">
                  <label htmlFor="edit-professional_email">Professional Email</label>
                  <input type="email" id="edit-professional_email" name="professional_email" value={editUser.professional_email || ""} onChange={handleEditChange} placeholder="Enter professional email address" className={editErrors.professional_email ? "field-error" : ""} />
                  {editErrors.professional_email && <span className="field-error-text">{editErrors.professional_email}</span>}
                </div>
                <div className="form-row">
                  <label htmlFor="edit-professional_email_password">Password of Professional Email</label>
                  <input type="password" id="edit-professional_email_password" name="professional_email_password" value={editUser.professional_email_password || ""} onChange={handleEditChange} placeholder="Enter professional email password" className={editErrors.professional_email_password ? "field-error" : ""} />
                  {editErrors.professional_email_password && <span className="field-error-text">{editErrors.professional_email_password}</span>}
                </div>
              </div>

              {/* ===== Employment Details ===== */}
              <h3 className="form-section-title">Employment Details</h3>
              <div className="user-form-grid">
                <div className="form-row">
                  <label htmlFor="edit-designation">Designation / Role *</label>
                  {editUser.designation === "__custom__" ? (
                    <div className="custom-input-container">
                      <input type="text" id="edit-designationCustom" name="designationCustom" value={editUser.designationCustom} onChange={handleEditChange} placeholder="Enter custom designation" autoFocus className={editErrors.designationCustom ? "field-error" : ""} />
                      <button type="button" className="custom-input-revert" onClick={() => handleCustomRevert("designation")} title="Back to list">&times;</button>
                    </div>
                  ) : (
                    <div className="category-dropdown-container" ref={desgDropdownRef}>
                      <button type="button" className="category-dropdown-trigger" onClick={() => setDesgDropdownOpen((o) => !o)} style={editErrors.designation ? { border: "1px solid #ef4444" } : {}}>
                        {editUser.designation || "Select Designation"} <span className={`category-dropdown-arrow ${desgDropdownOpen ? "open" : ""}`}>&#9662;</span>
                      </button>
                      {desgDropdownOpen && (
                        <div className="category-dropdown-options">
                          <div className="category-dropdown-option" onClick={() => { setEditUser((prev) => ({ ...prev, designation: "" })); setEditIsDirty(true); setDesgDropdownOpen(false); }} style={{ fontWeight: !editUser.designation ? "600" : "400", background: !editUser.designation ? "#f0f9ff" : "transparent" }}>
                            Select Designation
                          </div>
                          {designations.map((d) => (
                            <div key={d} className="category-dropdown-option" onClick={() => { setEditUser((prev) => ({ ...prev, designation: d })); setEditIsDirty(true); setDesgDropdownOpen(false); }} style={{ fontWeight: editUser.designation === d ? "600" : "400", background: editUser.designation === d ? "#f0f9ff" : "transparent" }}>
                              {d}
                              <span className="category-option-delete" onClick={(e) => { e.stopPropagation(); deleteDesignation(d); }} title="Delete">&times;</span>
                            </div>
                          ))}
                          <div className="category-dropdown-option category-dropdown-custom" onClick={() => { setEditUser((prev) => ({ ...prev, designation: "__custom__" })); setEditIsDirty(true); setDesgDropdownOpen(false); }}>Custom / Type Here</div>
                        </div>
                      )}
                    </div>
                  )}
                  {editErrors.designation && <span className="field-error-text">{editErrors.designation}</span>}
                  {editErrors.designationCustom && <span className="field-error-text">{editErrors.designationCustom}</span>}
                </div>
                <div className="form-row">
                  <label htmlFor="edit-department">Department *</label>
                  {editUser.department === "__custom__" ? (
                    <div className="custom-input-container">
                      <input type="text" id="edit-departmentCustom" name="departmentCustom" value={editUser.departmentCustom} onChange={handleEditChange} placeholder="Enter custom department" autoFocus className={editErrors.departmentCustom ? "field-error" : ""} />
                      <button type="button" className="custom-input-revert" onClick={() => handleCustomRevert("department")} title="Back to list">&times;</button>
                    </div>
                  ) : (
                    <div className="category-dropdown-container" ref={deptDropdownRef}>
                      <button type="button" className="category-dropdown-trigger" onClick={() => setDeptDropdownOpen((o) => !o)} style={editErrors.department ? { border: "1px solid #ef4444" } : {}}>
                        {editUser.department || "Select Department"} <span className={`category-dropdown-arrow ${deptDropdownOpen ? "open" : ""}`}>&#9662;</span>
                      </button>
                      {deptDropdownOpen && (
                        <div className="category-dropdown-options">
                          <div className="category-dropdown-option" onClick={() => { setEditUser((prev) => ({ ...prev, department: "" })); setEditIsDirty(true); setDeptDropdownOpen(false); }} style={{ fontWeight: !editUser.department ? "600" : "400", background: !editUser.department ? "#f0f9ff" : "transparent" }}>
                            Select Department
                          </div>
                          {departments.map((d) => (
                            <div key={d} className="category-dropdown-option" onClick={() => { setEditUser((prev) => ({ ...prev, department: d })); setEditIsDirty(true); setDeptDropdownOpen(false); }} style={{ fontWeight: editUser.department === d ? "600" : "400", background: editUser.department === d ? "#f0f9ff" : "transparent" }}>
                              {d}
                              <span className="category-option-delete" onClick={(e) => { e.stopPropagation(); deleteDepartment(d); }} title="Delete">&times;</span>
                            </div>
                          ))}
                          <div className="category-dropdown-option category-dropdown-custom" onClick={() => { setEditUser((prev) => ({ ...prev, department: "__custom__" })); setEditIsDirty(true); setDeptDropdownOpen(false); }}>Custom / Type Here</div>
                        </div>
                      )}
                    </div>
                  )}
                  {editErrors.department && <span className="field-error-text">{editErrors.department}</span>}
                  {editErrors.departmentCustom && <span className="field-error-text">{editErrors.departmentCustom}</span>}
                </div>
                <div className="form-row">
                  <label htmlFor="edit-hired_for">Hired For</label>
                  <input type="text" id="edit-hired_for" name="hired_for" value={editUser.hired_for} onChange={handleEditChange} placeholder="e.g. Full-time, Part-time, Contract" />
                </div>
                <div className="form-row">
                  <label htmlFor="edit-employee_code">Employee Code *</label>
                  <input type="text" id="edit-employee_code" name="employee_code" value={editUser.employee_code} onChange={handleEditChange} placeholder="Enter employee code" className={editErrors.employee_code ? "field-error" : ""} />
                  {editErrors.employee_code && <span className="field-error-text">{editErrors.employee_code}</span>}
                </div>
                <div className="form-row">
                  <label htmlFor="edit-role">System Role</label>
                  <select id="edit-role" name="role" value={editUser.role} onChange={handleEditChange}>
                    {getCurrentRole() === "admin" && <option value="admin">Admin</option>}
                    {getCurrentRole() === "admin" && <option value="manager">Manager</option>}
                    <option value="team_lead">Team Lead</option>
                    <option value="member">Member</option>
                  </select>
                </div>
                <div className="form-row">
                  <label htmlFor="edit-job_started_date">Job Started Date *</label>
                  <input type="date" id="edit-job_started_date" name="job_started_date" value={editUser.job_started_date} onChange={handleEditChange} className={editErrors.job_started_date ? "field-error" : ""} />
                  {editErrors.job_started_date && <span className="field-error-text">{editErrors.job_started_date}</span>}
                </div>
                <div className="form-row">
                  <label htmlFor="edit-job_ended_date">Job Ended Date</label>
                  <input type="date" id="edit-job_ended_date" name="job_ended_date" value={editUser.job_ended_date} onChange={handleEditChange} />
                </div>
                <div className="form-row">
                  <label htmlFor="edit-applied_via">Applied Via</label>
                  <input type="text" id="edit-applied_via" name="applied_via" value={editUser.applied_via} onChange={handleEditChange} placeholder="e.g. Website, Referral, LinkedIn" />
                </div>
              </div>

              {/* ===== Salary & Bank ===== */}
              <h3 className="form-section-title">Salary & Bank Details</h3>
              <div className="user-form-grid">
                <div className="form-row">
                  <label htmlFor="edit-gross_salary">Gross Salary</label>
                  <input type="text" id="edit-gross_salary" name="gross_salary" value={editUser.gross_salary} onChange={handleEditChange} placeholder="e.g. 50000 or Negotiable" className={editErrors.gross_salary ? "field-error" : ""} />
                  {editErrors.gross_salary && <span className="field-error-text">{editErrors.gross_salary}</span>}
                </div>
                <div className="form-row">
                  <label htmlFor="edit-bank_name">Bank Name</label>
                  <input type="text" id="edit-bank_name" name="bank_name" value={editUser.bank_name} onChange={handleEditChange} placeholder="Enter bank name" />
                </div>
                <div className="form-row">
                  <label htmlFor="edit-bank_account_number">Bank Account Number</label>
                  <input type="text" id="edit-bank_account_number" name="bank_account_number" value={editUser.bank_account_number} onChange={handleEditChange} placeholder="Enter account number" className={editErrors.bank_account_number ? "field-error" : ""} />
                  {editErrors.bank_account_number && <span className="field-error-text">{editErrors.bank_account_number}</span>}
                </div>
                <div className="form-row">
                  <label htmlFor="edit-bank_account_title">Bank Account Title</label>
                  <input type="text" id="edit-bank_account_title" name="bank_account_title" value={editUser.bank_account_title} onChange={handleEditChange} placeholder="Enter account title" />
                </div>
              </div>

              {/* ===== Documents ===== */}
              <h3 className="form-section-title">Documents</h3>
              <div className="user-form-grid">
                {[
                  { label: "Employment Contract", key: "employment_contract" },
                  { label: "Offer Letter", key: "offer_letter" },
                  { label: "Techxaro Regulations", key: "techxaro_regulations" },
                ].map(({ label, key }) => (
                  <div className="form-row" key={key}>
                    <label htmlFor={`edit-${key}`}>{label}</label>
                    {user[key] && !editFiles[key] && (
                      <div style={{ marginBottom: 6, fontSize: 13, color: "#64748b" }}>
                        Current: <a href={`${API_URL}/users/${userId}/documents/${key}?token=${authToken()}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>View uploaded file</a>
                      </div>
                    )}
                    <input
                      type="file"
                      id={`edit-${key}`}
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file && !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) {
                          notify.error("Only PDF and image files are allowed.");
                          e.target.value = "";
                          return;
                        }
                        if (file) {
                          setEditFiles((prev) => ({ ...prev, [key]: file }));
                          setFilePreviews((prev) => ({ ...prev, [key]: file.name }));
                        }
                      }}
                    />
                    {filePreviews[key] && (
                      <span style={{ fontSize: 12, color: "#16a34a", marginTop: 4 }}>
                        Selected: {filePreviews[key]}
                      </span>
                    )}
                  </div>
                ))}

                {/* Other Document — multi-file with remove buttons */}
                <div className="form-row">
                  <label htmlFor="edit-other_document">Other Document</label>
                  <input
                    type="file"
                    id="edit-other_document"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg,.tiff,.tif"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      const valid = [];
                      for (const f of files) {
                        if (!["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/svg+xml", "image/tiff"].includes(f.type)) {
                          notify.error(`"${f.name}" is not a supported file type. Skipped.`);
                          continue;
                        }
                        valid.push(f);
                      }
                      if (valid.length > 0) {
                        setEditOtherDocs((prev) => [
                          ...prev,
                          ...valid.map((f) => ({ file: f, customName: f.name.replace(/\.[^.]+$/, ""), renaming: false })),
                        ]);
                      }
                      e.target.value = "";
                    }}
                  />
                  {editOtherDocs.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {editOtherDocs.filter(item => item && item.file).map((item, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}>
                          {item.renaming ? (
                            <>
                              <input
                                autoFocus
                                type="text"
                                value={item.customName}
                                onChange={(e) => {
                                  setEditOtherDocs((prev) => {
                                    const updated = [...prev];
                                    updated[i] = { ...updated[i], customName: e.target.value };
                                    return updated;
                                  });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    setEditOtherDocs((prev) => {
                                      const updated = [...prev];
                                      updated[i] = { ...updated[i], renaming: false };
                                      return updated;
                                    });
                                  }
                                }}
                                style={{ flex: 1, border: "1px solid #93c5fd", borderRadius: 4, padding: "2px 6px", fontSize: 13, outline: "none" }}
                              />
                              <button type="button" onClick={() => {
                                setEditOtherDocs((prev) => {
                                  const updated = [...prev];
                                  updated[i] = { ...updated[i], renaming: false };
                                  return updated;
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
                                setEditOtherDocs((prev) => {
                                  const updated = [...prev];
                                  updated[i] = { ...updated[i], renaming: true, customName: item.customName || item.file.name.replace(/\.[^.]+$/, "") };
                                  return updated;
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
                  {existingOtherDocs.length > 0 && editOtherDocs.length === 0 && (
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
                            <a href={`${API_URL}/users/${userId}/documents/other_document?token=${authToken()}&file=${encodeURIComponent(doc.path)}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={doc.name}>
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
                  {existingOtherDocs.length === 0 && editOtherDocs.length === 0 && (
                    <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>
                      No documents uploaded
                    </div>
                  )}
                </div>
              </div>
            </form>
          </div>
          {EditConfirmDialog}
        </div>,
        document.body
      )}
      <ConfirmModal
        isOpen={resignConfirmOpen}
        onClose={() => setResignConfirmOpen(false)}
        onConfirm={confirmResignUser}
        title="Confirm Resignation"
        message="Are you sure you want to resign this user? This action may affect their access and assigned responsibilities."
        confirmText="Confirm Resignation"
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
            setEditOtherDocs((prev) => prev.filter((_, idx) => idx !== pendingRemoveDoc.index));
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
        onConfirm={() => { setEditAvatarFile(null); setAvatarRemoveConfirmOpen(false); }}
        title="Remove Photo"
        message="Are you sure you want to remove this profile photo?"
        confirmText="Remove"
        cancelText="Cancel"
        danger
      />

      {/* Edit Document Popup — Rename + Replace File */}
      {editDocItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }} onClick={() => { setEditDocItem(null); setEditDocFile(null); }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: "24px 28px", width: 460, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1e293b" }}>Edit Document</h3>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b" }}>Rename or replace the file below.</p>

            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Name</label>
                <input
                  autoFocus
                  type="text"
                  value={editDocName}
                  onChange={(e) => setEditDocName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (editDocName.trim() || editDocFile)) handleEditDoc(); }}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                />
              </div>

              {editDocExistingFileName && (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Current File</label>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}>
                    <span style={{ color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={editDocExistingFileName}>{editDocExistingFileName}</span>
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Replace File (optional)</label>
                {editDocFile ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}>
                    <span style={{ color: "#16a34a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={editDocFile.name}>{editDocFile.name}</span>
                    <button type="button" onClick={() => setEditDocFile(null)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1, flexShrink: 0, marginLeft: 8 }} title="Remove selected file">&#10005;</button>
                  </div>
                ) : (
                  <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "2px dashed #d1d5db", borderRadius: 8, padding: "16px 12px", cursor: "pointer", background: "#f8fafc", transition: "border-color 0.2s" }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = "#6366f1"}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = "#d1d5db"}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 6 }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span style={{ fontSize: 12, color: "#64748b" }}>Click to upload new file</span>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.bmp,.svg,.tiff,.tif"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) setEditDocFile(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => { setEditDocItem(null); setEditDocFile(null); }} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#374151" }}>Cancel</button>
              <button type="button" onClick={handleEditDoc} disabled={!editDocName.trim() && !editDocFile} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: (editDocName.trim() || editDocFile) ? "#6366f1" : "#e5e7eb", color: (editDocName.trim() || editDocFile) ? "#fff" : "#9ca3af", fontSize: 13, fontWeight: 600, cursor: (editDocName.trim() || editDocFile) ? "pointer" : "not-allowed" }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Document Confirmation */}
      <ConfirmModal
        isOpen={deleteDocConfirmOpen}
        onClose={() => { setDeleteDocConfirmOpen(false); setPendingDeleteDoc(null); }}
        onConfirm={handleDeleteDoc}
        title="Delete Document"
        message={`Are you sure you want to delete this document? This action cannot be undone.`}
        confirmText="Delete"
        danger
      />
    </DashboardLayout>
  );
}

export default UserProfile;
