/**
 * CreateUserModal.jsx
 * Modal component for creating a new user or editing an existing user.
 * Supports auto-saving drafts, resuming drafts in-place, custom departments/designations,
 * document attachments, and clean closing without unexpected navigation away.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import API_URL from "../config/api";
import { authToken, getCurrentRole } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useDraftGuard from "../hooks/useDraftGuard";
import useAutoSave from "../hooks/useAutoSave";
import AutoSaveIndicator from "./AutoSaveIndicator";
import MultiSelectDropdown from "./MultiSelectDropdown";
import LoadingButton from "./LoadingButton";
import ConfirmModal from "./ConfirmModal";
import { publish } from "../utils/eventBus";
import { notify, showSuccessMessage } from "../utils/notify";
import { useSubmit } from "../hooks/useSubmit";
import "../pages/ManageUsers.css";

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

const CreateUserModal = ({
  isOpen = true,
  onClose,
  onSuccess,
  restoreDraftId = null,
  draftData = null,
  editingUser = null,
}) => {
  const { t } = useTranslation();
  const { submitting, run } = useSubmit();

  const [currentUserRole] = useState(() => getCurrentRole() || "");
  const [projectsList, setProjectsList] = useState([]);
  const [emailMode, setEmailMode] = useState("single");
  const [showProfPassword, setShowProfPassword] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState(restoreDraftId);
  const [existingOtherDocs, setExistingOtherDocs] = useState([]);
  const [addErrors, setAddErrors] = useState({});

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
  const [removeDocConfirmOpen, setRemoveDocConfirmOpen] = useState(false);
  const [pendingRemoveDoc, setPendingRemoveDoc] = useState({ source: "", index: -1, type: "", api: "", label: "" });

  const [editDocItem, setEditDocItem] = useState(null);
  const [editDocForm, setEditDocForm] = useState({ title: "" });
  const [editDocNewFile, setEditDocNewFile] = useState(null);
  const [editDocDeleted, setEditDocDeleted] = useState(false);
  const [editDocDeleteConfirm, setEditDocDeleteConfirm] = useState(false);

  // Dynamic departments and designations from localStorage
  const [deletedDesignations, setDeletedDesignations] = useState(() => {
    try { return JSON.parse(localStorage.getItem("deleted_designations") || "[]"); } catch { return []; }
  });
  const [deletedDepartments, setDeletedDepartments] = useState(() => {
    try { return JSON.parse(localStorage.getItem("deleted_departments") || "[]"); } catch { return []; }
  });

  const departments = [
    ...new Set([
      ...(() => {
        try { return JSON.parse(localStorage.getItem("persisted_departments") || "[]"); } catch { return []; }
      })(),
    ]),
  ].filter((d) => !deletedDepartments.includes(d));

  const designations = [
    ...new Set([
      ...(() => {
        try { return JSON.parse(localStorage.getItem("persisted_designations") || "[]"); } catch { return []; }
      })(),
    ]),
  ].filter((d) => !deletedDesignations.includes(d));

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

  // Fetch projects list
  useEffect(() => {
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
      } catch {}
    };
    fetchProjects();
  }, []);

  // Initialize draft data or editing user
  useEffect(() => {
    if (draftData) {
      setActiveDraftId(restoreDraftId);
      setNewUser((prev) => ({
        ...prev,
        fullName: draftData.name || draftData.full_name || draftData.fullName || "",
        fatherName: draftData.father_name || draftData.fatherName || "",
        idCardNumber: draftData.id_card_number || draftData.idCardNumber || "",
        presentAddress: draftData.present_address || draftData.presentAddress || draftData.address || "",
        permanentAddress: draftData.permanent_address || draftData.permanentAddress || "",
        phoneNumber: draftData.phone_number || draftData.phoneNumber || draftData.contact_no || "",
        emergencyContactName: draftData.emergency_contact_name || draftData.emergencyContactName || "",
        emergencyContactRelation: draftData.emergency_contact_relation || draftData.emergencyContactRelation || "",
        emergencyContactPhone: draftData.emergency_contact_phone || draftData.emergencyContactPhone || "",
        email: draftData.email || "",
        personalEmail: draftData.personal_email || draftData.personalEmail || "",
        professionalEmail: draftData.professional_email || draftData.professionalEmail || "",
        professionalEmailPassword: draftData.professional_email_password || draftData.professionalEmailPassword || "",
        department: draftData.department || "",
        departmentCustom: draftData.departmentCustom || "",
        designation: draftData.designation || "",
        designationCustom: draftData.designationCustom || "",
        hiredFor: draftData.hired_for || draftData.hiredFor || "",
        employeeCode: draftData.employee_code || draftData.employeeCode || "",
        jobStartedDate: draftData.job_started_date || draftData.jobStartedDate || "",
        jobEndedDate: draftData.job_ended_date || draftData.jobEndedDate || "",
        role: draftData.role || "member",
        project_ids: draftData.project_ids || [],
        grossSalary: draftData.gross_salary || draftData.grossSalary || "",
        appliedVia: draftData.applied_via || draftData.appliedVia || "",
        bankName: draftData.bank_name || draftData.bankName || "",
        bankAccountNumber: draftData.bank_account_number || draftData.bankAccountNumber || "",
        bankAccountTitle: draftData.bank_account_title || draftData.bankAccountTitle || "",
        passwordType: draftData.password_type || "auto",
        password: draftData.password || "",
      }));
      if (draftData.email_mode) setEmailMode(draftData.email_mode);
    } else if (editingUser) {
      const fullUser = editingUser;
      const deptVal = fullUser.department || "";
      const isCustomDept = !departments.includes(deptVal) && deptVal !== "";
      const desgVal = fullUser.designation || "";
      const isCustomDesg = !designations.includes(desgVal) && desgVal !== "";

      const existingProjectIds = fullUser.projects
        ? fullUser.projects.map((p) => (typeof p === "object" ? p.id : p))
        : (fullUser.project_ids || []);

      setEmailMode(fullUser.email_mode || "single");
      setNewUser((prev) => ({
        ...prev,
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
        project_ids: existingProjectIds,
        status: fullUser.status || (fullUser.active !== false ? "Active" : "Inactive"),
        grossSalary: fullUser.gross_salary || "",
        appliedVia: fullUser.applied_via || "",
        bankName: fullUser.bank_name || "",
        bankAccountNumber: fullUser.bank_account_number || "",
        bankAccountTitle: fullUser.bank_account_title || "",
        avatar: null,
        _existingAvatar: fullUser.avatar || null,
        remove_avatar: false,
      }));

      const docs = typeof fullUser.other_document === "string"
        ? (() => { try { return JSON.parse(fullUser.other_document); } catch { return []; } })()
        : (fullUser.other_document || []);
      setExistingOtherDocs((Array.isArray(docs) ? docs : []).filter(Boolean).map((doc) => {
        const docPath = typeof doc === "string" ? doc : (doc && doc.path ? doc.path : null);
        if (!docPath) return null;
        const docName = typeof doc === "object" && doc.name ? doc.name : docPath.split("/").pop().replace(/^other_document_\d+_\d+_/, "").replace(/\.[^.]+$/, "");
        return { path: docPath, name: docName, renaming: false };
      }).filter(Boolean));
    }
  }, [draftData, restoreDraftId, editingUser]);

  const draftSaveRef = useRef(null);
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useDraftGuard(onClose, {
    draftSaveHandler: () => draftSaveRef.current?.(),
    hasDraftFeature: true,
  });

  useEscapeKey(isOpen, handleClose);

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

  const buildDraftBody = useCallback(() => ({
    full_name: newUser.fullName,
    father_name: newUser.fatherName,
    email: newUser.email,
    personal_email: newUser.personalEmail,
    professional_email: newUser.professionalEmail,
    phone_number: newUser.phoneNumber,
    role: newUser.role,
    designation: newUser.designation === "__custom__" ? newUser.designationCustom : newUser.designation,
    department: newUser.department === "__custom__" ? newUser.departmentCustom : newUser.department,
    id_card_number: newUser.idCardNumber,
    present_address: newUser.presentAddress,
    permanent_address: newUser.permanentAddress,
    gross_salary: newUser.grossSalary,
    employee_code: newUser.employeeCode,
    job_started_date: newUser.jobStartedDate,
    job_ended_date: newUser.jobEndedDate,
    bank_name: newUser.bankName,
    bank_account_number: newUser.bankAccountNumber,
    bank_account_title: newUser.bankAccountTitle,
  }), [newUser]);

  const { lastSaved: userLastSaved, isSaving: userSaving, saveNow: userSaveNow } = useAutoSave({
    draftId: activeDraftId,
    formData: buildDraftBody(),
    moduleType: "user",
    enabled: isDirty,
  });

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
        if (!isSingleDoc) {
          setNewUser((p) => {
            const updated = [...p.otherDocument];
            updated[index] = { ...updated[index], customName: editDocForm.title };
            return { ...p, otherDocument: updated };
          });
        }
      }
      setEditDocItem(null);
      return;
    }

    const token = authToken();
    if (!token) return;

    try {
      if (editDocDeleted && !editDocNewFile) {
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
          if (isSingleDoc) {
            setNewUser((prev) => ({ ...prev, [type === "employment_contract" ? "employmentContract" : type === "offer_letter" ? "offerLetter" : "techxaroRegulations"]: null }));
          } else {
            setExistingOtherDocs(data.user.other_document || []);
          }
        }
        notify.success(t("Document deleted successfully", { defaultValue: "Document deleted successfully" }));
      } else if (editDocNewFile) {
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
        if (data.user && !isSingleDoc) {
          setExistingOtherDocs(data.user.other_document || []);
        }
        notify.success(t("Document replaced successfully", { defaultValue: "Document replaced successfully" }));
      } else {
        if (!isSingleDoc) {
          const res = await fetch(`${API_URL}/users/${editingUser.id}/document/rename`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ type, index, name: editDocForm.title.trim() }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || t("Failed to rename document", { defaultValue: "Failed to rename document" }));
          if (data.user) {
            setExistingOtherDocs(data.user.other_document || []);
          }
          notify.success(t("Document renamed successfully", { defaultValue: "Document renamed successfully" }));
        }
      }
    } catch (err) {
      notify.error(err.message);
    } finally {
      setEditDocItem(null);
    }
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

    // Persist custom department/designation to localStorage
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
    if (isDraft) {
      formData.append("is_draft", "true");
      if (activeDraftId) {
        formData.append("draft_id", activeDraftId);
      }
    }
    formData.append("name", (newUser.fullName || "").trim() || "Draft User");
    formData.append("email_mode", emailMode);
    if (emailMode === "single") {
      formData.append("email", (newUser.personalEmail || "").trim());
      formData.append("personal_email", newUser.personalEmail || "");
    } else {
      formData.append("email", (newUser.professionalEmail || newUser.personalEmail || "").trim());
      formData.append("personal_email", newUser.personalEmail || "");
    }
    formData.append("father_name", newUser.fatherName || "");
    formData.append("id_card_number", newUser.idCardNumber || "");
    formData.append("present_address", newUser.presentAddress || "");
    formData.append("permanent_address", newUser.permanentAddress || "");
    formData.append("phone_number", newUser.phoneNumber || "");
    formData.append("emergency_contact_name", newUser.emergencyContactName || "");
    formData.append("emergency_contact_relation", newUser.emergencyContactRelation || "");
    formData.append("emergency_contact_phone", newUser.emergencyContactPhone || "");
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
    formData.append("hired_for", newUser.hiredFor || "");
    formData.append("employee_code", newUser.employeeCode || "");
    formData.append("job_started_date", newUser.jobStartedDate || "");
    formData.append("job_ended_date", newUser.jobEndedDate || "");
    formData.append("role", newUser.role || "member");
    const selectedStatus = isDraft ? "Draft" : (newUser.status || "Active");
    formData.append("status", selectedStatus);
    formData.append("active", selectedStatus === "Active" ? "1" : "0");
    formData.append("gross_salary", newUser.grossSalary || "");
    formData.append("applied_via", newUser.appliedVia || "");
    formData.append("bank_name", newUser.bankName || "");
    formData.append("bank_account_number", newUser.bankAccountNumber || "");
    formData.append("bank_account_title", newUser.bankAccountTitle || "");

    if (newUser.project_ids && Array.isArray(newUser.project_ids)) {
      if (newUser.project_ids.length > 0) {
        newUser.project_ids.forEach((pid) => {
          formData.append("project_ids[]", pid);
        });
      } else if (editingUser) {
        formData.append("project_ids", "");
      }
    }

    const fileFields = ["employmentContract", "offerLetter", "techxaroRegulations"];
    const fileApiNames = ["employment_contract", "offer_letter", "techxaro_regulations"];
    fileFields.forEach((field, i) => {
      if (newUser[field]) formData.append(fileApiNames[i], newUser[field]);
    });

    if (newUser.otherDocument && newUser.otherDocument.length > 0) {
      newUser.otherDocument.forEach((item) => {
        if (item && item.file) {
          formData.append("other_document[]", item.file);
          formData.append("other_document_names[]", item.customName || item.file.name.replace(/\.[^.]+$/, ""));
        }
      });
    }

    if (editingUser && editingUser.other_document) {
      formData.append("existing_other_docs", JSON.stringify(existingOtherDocs));
    }

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
        formData.append("_method", "PUT");
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: formData,
        _notifHandled: true,
      });

      if (res.status === 413) {
        notify.error(t("File is too large. Please upload smaller files.", { defaultValue: "File is too large. Please upload smaller files." }));
        return;
      }

      let data = {};
      try {
        data = await res.json();
      } catch {
        notify.error(t("Server returned an invalid response. Please try again.", { defaultValue: "Server returned an invalid response. Please try again." }));
        return;
      }

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
          Object.entries(data.errors).forEach(([k, msgs]) => {
            mapped[fieldMap[k] || k] = Array.isArray(msgs) ? msgs[0] : msgs;
          });
          setAddErrors(mapped);
          scrollToFirstError(mapped);
        }
        notify.error(data.message || (isEdit ? t("Unable to update user", { defaultValue: "Unable to update user" }) : t("Unable to create user", { defaultValue: "Unable to create user" })));
        return;
      }

      setAddErrors({});
      if (data.is_draft || isDraft) {
        notify.success(t("Draft saved successfully", { defaultValue: "Draft saved successfully" }));
        publish("data:changed", { type: "draft", action: isEdit ? "updated" : "created" });
        publish("drafts:changed");
        if (onClose) onClose();
        return;
      }

      showSuccessMessage("User", isEdit ? "updated" : "created");
      publish("data:changed", { type: "user", action: isEdit ? "updated" : "created" });
      publish("drafts:changed");
      if (onSuccess) onSuccess(data.user || data);
      else if (onClose) onClose();
    });
  };

  const handleSaveDraft = useCallback(async () => {
    if (typeof userSaveNow === "function") {
      draftSaveRef.current = userSaveNow;
      await userSaveNow();
    }
    await handleSubmit(null, { isDraft: true });
  }, [userSaveNow, handleSubmit]);

  if (!isOpen) return null;

  return (
    <>
      {createPortal(
        <div className="user-modal-overlay" onClick={handleClose}>
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
                <button type="button" className="task-save-draft-btn" onClick={handleSaveDraft} disabled={submitting}>
                  {t("Save Draft", { defaultValue: "Save Draft" })}
                </button>
                <LoadingButton type="button" className="primary-button" loading={submitting} onClick={handleSubmit}>
                  {submitting ? (editingUser ? t("Updating User...", { defaultValue: "Updating User..." }) : t("Creating User...", { defaultValue: "Creating User..." })) : (editingUser ? t("Update User", { defaultValue: "Update User" }) : t("Create User", { defaultValue: "Create User" }))}
                </LoadingButton>
                <button className="user-modal-close" onClick={handleClose} aria-label={t("Close modal", { defaultValue: "Close modal" })}>
                  &#10005;
                </button>
              </div>
            </div>

            <form id="user-modal-form" className="user-form" onSubmit={handleSubmit} style={{ pointerEvents: submitting ? "none" : "auto", opacity: submitting ? 0.7 : 1 }}>
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
                    <div className="avatar-preview" onClick={() => document.getElementById("avatar-input")?.click()}>
                      {newUser.avatar ? (
                        <img src={URL.createObjectURL(newUser.avatar)} alt="Avatar preview" />
                      ) : newUser._existingAvatar ? (
                        <img src={`${API_URL.replace("/api", "")}/storage/${newUser._existingAvatar}`} alt="Avatar preview" />
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
                    <input id="avatar-input" type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={(e) => { const file = e.target.files[0]; if (file) { setNewUser((prev) => ({ ...prev, avatar: file })); markDirty(); } }} />
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
                          value={newUser.status || "Active"}
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
                    {currentUserRole === "admin" && (
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
                    showChips={true}
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

                {/* Other Document */}
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
                      {newUser.otherDocument.filter((item) => item && item.file).map((item, i) => (
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
                      {existingOtherDocs.filter((doc) => doc && doc.path).map((doc, i) => (
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

      {ConfirmDialog}

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
                  notify.success(t("Document deleted successfully", { defaultValue: "Document deleted successfully" }));
                } catch (err) { notify.error(err.message); }
              }
            }
            const stateKey = pendingRemoveDoc.api === "employment_contract" ? "employmentContract" : pendingRemoveDoc.api === "offer_letter" ? "offerLetter" : "techxaroRegulations";
            setNewUser((p) => ({ ...p, [stateKey]: null }));
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

      {editDocItem && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={() => { setEditDocItem(null); setEditDocNewFile(null); setEditDocDeleted(false); setEditDocDeleteConfirm(false); }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: "24px 28px", width: 420, maxWidth: "90vw", boxShadow: "var(--shadow-xl)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "var(--text-heading)" }}>{t("Edit File", { defaultValue: "Edit File" })}</h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--text-secondary)" }}>{t("Rename or replace this file.", { defaultValue: "Rename or replace this file." })}</p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-dark)", marginBottom: 6 }}>{t("Title", { defaultValue: "Title" })}</label>
              <input
                type="text"
                value={editDocForm.title}
                onChange={(e) => setEditDocForm({ title: e.target.value })}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveEditDoc(); }}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border-color)", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", color: "var(--text-heading)" }}
              />
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
                  <input
                    type="file"
                    style={{ display: "none" }}
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.bmp,.svg,.tiff,.tif"
                    onChange={(e) => {
                      if (e.target.files.length > 0) {
                        const f = e.target.files[0];
                        setEditDocNewFile(f);
                        setEditDocDeleted(false);
                        if (!editDocForm.title) setEditDocForm({ title: f.name.replace(/\.[^.]+$/, "") });
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => { setEditDocItem(null); setEditDocNewFile(null); setEditDocDeleted(false); setEditDocDeleteConfirm(false); }}
                style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid var(--border-medium)", background: "var(--bg-card)", color: "var(--text-dark)", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }}
                onMouseEnter={(e) => e.target.style.background = "var(--bg-card-alt)"}
                onMouseLeave={(e) => e.target.style.background = "var(--bg-card)"}
              >
                {t("Cancel", { defaultValue: "Cancel" })}
              </button>
              <button
                type="button"
                onClick={handleSaveEditDoc}
                style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }}
                onMouseEnter={(e) => e.target.style.background = "var(--color-primary-dark)"}
                onMouseLeave={(e) => e.target.style.background = "var(--color-primary)"}
              >
                {t("Save", { defaultValue: "Save" })}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

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
    </>
  );
};

export default CreateUserModal;
