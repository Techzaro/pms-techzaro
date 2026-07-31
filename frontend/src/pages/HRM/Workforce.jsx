import React, { useState, useEffect, useCallback } from "react";
import API_URL from "../../config/api";
import { authToken } from "../../utils/auth";
import {
  MdPeople, MdSearch, MdShield, MdCheckCircle, MdWarning,
  MdPhone, MdMail, MdBadge, MdLocationOn, MdFilterList, MdEdit,
  MdSecurity, MdDescription, MdSchool
} from "react-icons/md";
import WorkforceEmployeeModal from "../../components/layout/hrm/layoutComponent/hrm Modal/WorkforceEmployeeModal";
import "./Workforce.css";

async function apiRequest(path, options = {}) {
  const token = authToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API Error ${res.status}`);
  }
  return res.json();
}

export default function Workforce() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedUser, setSelectedUser] = useState(null);
  const [toast, setToast] = useState(null);
  const [editModal, setEditModal] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [editForm, setEditForm] = useState({
    id: "",
    name: "",
    email: "",
    phone_number: "",
    contact_no: "",
    id_card_number: "",
    department: "",
    designation: "",
    employee_code: "",
    father_name: "",
    present_address: "",
    permanent_address: "",
    address: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    criminal_check_status: "Pending",
    cnic_front_image: "",
    cnic_back_image: "",
    criminal_record_file: "",
    educational_documents: "",
    other_document: "",
  });

  const notify = (msg, kind = "success") => {
    setToast({ message: msg, kind });
    setTimeout(() => setToast(null), 4000);
  };

  const loadWorkforce = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/team-users");
      const list = Array.isArray(res) ? res : res.users || [];
      setUsers(list);
    } catch (err) {
      notify(err.message || "Failed to load workforce.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkforce();
  }, [loadWorkforce]);

  const handleOpenEdit = (u) => {
    setSelectedUser(u);
    const phoneVal = u.phone_number || u.contact_no || u.phone || "N/A";
    const cnicVal = u.id_card_number || u.cnic || "N/A";

    setEditForm({
      id: u.id,
      name: u.name || "",
      email: u.email || "",
      phone_number: phoneVal,
      contact_no: phoneVal,
      id_card_number: cnicVal,
      department: u.department || "Engineering",
      designation: u.designation || "Staff Specialist",
      employee_code: u.employee_code || `EMP-${u.id}`,
      father_name: u.father_name || "",
      present_address: u.present_address || u.address || "",
      permanent_address: u.permanent_address || "",
      address: u.address || u.present_address || "",
      emergency_contact_name: u.emergency_contact_name || "",
      emergency_contact_phone: u.emergency_contact_phone || "",
      criminal_check_status: u.criminal_check_status || "Pending",
      cnic_front_image: u.cnic_front_image || "",
      cnic_back_image: u.cnic_back_image || "",
      criminal_record_file: u.criminal_record_file || "",
      educational_documents: u.educational_documents || "",
      other_document: u.other_document || "",
    });
    setEditModal(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    try {
      await apiRequest(`/users/${editForm.id}`, {
        method: "PUT",
        body: JSON.stringify(editForm),
      });
      notify("Employee workforce profile & compliance updated successfully.");
      setEditModal(false);
      loadWorkforce();
    } catch (err) {
      notify(err.message || "Failed to update profile.", "error");
    }
  };

  const handleFileUpload = async (e, field) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", field);

    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/hrm/candidates/upload-resume`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });
      const data = await res.json();
      if (data.file) {
        setEditForm((prev) => ({ ...prev, [field]: data.file }));
        notify(`${field.replace(/_/g, " ").toUpperCase()} document uploaded successfully.`);
      }
    } catch (err) {
      notify("Failed to upload document file.", "error");
    } finally {
      setUploading(false);
    }
  };

  // Filter Logic
  const filteredUsers = users.filter((u) => {
    const searchLow = search.toLowerCase();
    const phoneVal = (u.phone_number || u.contact_no || u.phone || "").toLowerCase();
    const cnicVal = (u.id_card_number || u.cnic || "").toLowerCase();

    const matchesSearch =
      (u.name || "").toLowerCase().includes(searchLow) ||
      (u.email || "").toLowerCase().includes(searchLow) ||
      cnicVal.includes(searchLow) ||
      phoneVal.includes(searchLow) ||
      (u.designation || "").toLowerCase().includes(searchLow);

    const matchesDept = selectedDept === "All" || u.department === selectedDept;
    const matchesStatus =
      selectedStatus === "All" ||
      (u.criminal_check_status || "Pending") === selectedStatus;

    return matchesSearch && matchesDept && matchesStatus;
  });

  const totalEmployees = users.length;
  const activeCount = users.filter((u) => u.active !== 0).length;
  const clearedCheckCount = users.filter(
    (u) => u.criminal_check_status === "Cleared"
  ).length;
  const pendingCheckCount = users.filter(
    (u) => !u.criminal_check_status || u.criminal_check_status === "Pending"
  ).length;

  const departments = ["All", ...new Set(users.map((u) => u.department || "General").filter(Boolean))];

  return (
    <div className="wf-page">
      {toast && <div className={`wf-toast wf-toast--${toast.kind}`}>{toast.message}</div>}

      {/* HEADER */}
      <div className="wf-header">
        <div>
          <div className="wf-title-row">
            <h1>Workforce &amp; Employee Directory</h1>
            <span className="wf-live-pill"><MdShield size={14} /> Verified Enterprise Directory</span>
          </div>
          <p>Manage official employee records, CNIC documentation, background checks, and emergency contacts.</p>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="wf-stats-grid">
        <div className="wf-stat-card">
          <div>
            <span className="wf-stat-label">Total Active Workforce</span>
            <span className="wf-stat-value">{totalEmployees}</span>
          </div>
          <div className="wf-stat-icon wf-stat-icon--blue"><MdPeople size={24} /></div>
        </div>

        <div className="wf-stat-card">
          <div>
            <span className="wf-stat-label">Active Staff Status</span>
            <span className="wf-stat-value">{activeCount}</span>
          </div>
          <div className="wf-stat-icon wf-stat-icon--green"><MdCheckCircle size={24} /></div>
        </div>

        <div className="wf-stat-card">
          <div>
            <span className="wf-stat-label">Background Check Cleared</span>
            <span className="wf-stat-value">{clearedCheckCount}</span>
          </div>
          <div className="wf-stat-icon wf-stat-icon--sky"><MdSecurity size={24} /></div>
        </div>

        <div className="wf-stat-card">
          <div>
            <span className="wf-stat-label">Verification Pending</span>
            <span className="wf-stat-value">{pendingCheckCount}</span>
          </div>
          <div className="wf-stat-icon wf-stat-icon--amber"><MdWarning size={24} /></div>
        </div>
      </div>

      {/* TOOLBAR & SEARCH */}
      <div className="wf-toolbar">
        <div className="wf-search-box">
          <MdSearch size={18} />
          <input
            type="text"
            placeholder="Search employee by name, CNIC, phone, email, designation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="wf-filters">
          <div className="wf-filter-item">
            <MdFilterList size={16} />
            <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}>
              <option value="All">All Departments</option>
              {departments.filter((d) => d !== "All").map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="wf-filter-item">
            <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
              <option value="All">All Background Checks</option>
              <option value="Cleared">Cleared Check</option>
              <option value="Pending">Pending Check</option>
              <option value="Flagged">Flagged / Action Needed</option>
            </select>
          </div>
        </div>
      </div>

      {/* WORKFORCE GRID */}
      {loading ? (
        <div className="wf-loading-state">
          <div className="wf-spinner" />
          <p>Syncing Workforce Directory...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="wf-empty-card">
          <MdPeople size={48} color="#94a3b8" />
          <h3>No Employee Records Found</h3>
          <p>Try adjusting your search query or department filters.</p>
        </div>
      ) : (
        <div className="wf-grid">
          {filteredUsers.map((u) => {
            const checkStatus = u.criminal_check_status || "Pending";
            const phoneVal = u.phone_number || u.contact_no || u.phone || "Not Logged";
            const cnicVal = u.id_card_number || u.cnic || "Not Logged";

            return (
              <div key={u.id} className="wf-user-card" onClick={() => handleOpenEdit(u)}>
                <div className="wf-card-top">
                  <div className="wf-avatar">
                    {u.name?.slice(0, 2).toUpperCase() || "EM"}
                  </div>
                  <div className="wf-user-info">
                    <h4>{u.name}</h4>
                    <span className="wf-role-badge">{u.designation || u.role || "Staff Member"}</span>
                  </div>
                </div>

                <div className="wf-card-details">
                  <p><MdMail size={14} /> {u.email}</p>
                  <p><MdPhone size={14} /> Phone: <strong>{phoneVal}</strong></p>
                  <p><MdBadge size={14} /> CNIC: <strong>{cnicVal}</strong></p>
                  <p><MdLocationOn size={14} /> Dept: {u.department || "Engineering"}</p>
                </div>

                <div className="wf-card-footer">
                  <span className={`wf-pill wf-pill--${checkStatus === "Cleared" ? "success" : checkStatus === "Flagged" ? "danger" : "warning"}`}>
                    <MdSecurity size={12} /> Police Check: {checkStatus}
                  </span>
                  <button className="wf-edit-btn" onClick={(e) => { e.stopPropagation(); handleOpenEdit(u); }}>
                    <MdEdit size={14} /> Profile &amp; Docs
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* WORKFORCE EMPLOYEE MODAL Component */}
      <WorkforceEmployeeModal
        open={editModal}
        onClose={() => setEditModal(false)}
        editForm={editForm}
        setEditForm={setEditForm}
        onSave={handleSaveUser}
        handleFileUpload={handleFileUpload}
        uploading={uploading}
      />
    </div>
  );
}
