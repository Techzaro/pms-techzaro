import  { useState, useEffect, useCallback } from "react";
import API_URL from "../../config/api";
import { authToken } from "../../utils/auth";
import Breadcrumb from "../../components/Breadcrumb";
import {
  FileText,
  Search,
  ShieldAlert,
  CheckCircle2,
  Upload,
  Download,
  X,
  Users,
  Phone,
} from "lucide-react";
import "./EmployeeDocuments.css";

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

const DOCUMENT_TYPES = [
  { key: "cv", label: "📄 Resume / CV", category: "Educational Degrees" },
  { key: "cnic_front_image", label: "🪪 CNIC Front Copy", category: "Identity & CNIC" },
  { key: "cnic_back_image", label: "🪪 CNIC Back Copy", category: "Identity & CNIC" },
  { key: "criminal_record_file", label: "👮 Police Clearance Certificate", category: "Police & Criminal Clearance" },
  { key: "latest_education_cert", label: "🎓 Educational Degree Certificate", category: "Educational Degrees" },
  { key: "employment_contract", label: "💼 Official Employment Contract", category: "Employment Contracts" },
  { key: "offer_letter", label: "✉️ Signed Offer Letter", category: "Employment Contracts" },
  { key: "techxaro_regulations", label: "📜 Company Regulations Agreement", category: "Employment Contracts" },
  { key: "previous_exp_letter", label: "🏛️ Previous Experience Certificate", category: "Educational Degrees" },
  { key: "previous_salary_slip", label: "💵 Previous Salary Slip", category: "Educational Degrees" },
  { key: "other_document", label: "📁 Other Compliance Documents", category: "Identity & CNIC" },
];

export default function EmployeeDocuments() {
  const [users, setUsers] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [offerLetters, setOfferLetters] = useState([]);
  const [customDocuments, setCustomDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);

  const [selectedUser, setSelectedUser] = useState("");
  const [docField, setDocField] = useState("criminal_record_file");
  const [selectedFile, setSelectedFile] = useState(null);

  const notify = (msg, kind = "success") => {
    setToast({ message: msg, kind });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/hrm/employee-documents");
      const userList = res.users || [];
      const candList = res.candidates || [];
      const offerList = res.offerLetters || [];
      const docList = res.documents || [];

      // Deduplicate Users
      const uniqueUsersMap = new Map();
      userList.forEach((u) => {
        if (u.id && !uniqueUsersMap.has(u.id)) {
          uniqueUsersMap.set(u.id, u);
        }
      });

      setUsers(Array.from(uniqueUsersMap.values()));
      setCandidates(candList);
      setOfferLetters(offerList);
      setCustomDocuments(docList);
    } catch (err) {
      notify("Failed to load employee document profiles.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdatePoliceStatus = async (userId, newStatus) => {
    try {
      await apiRequest(`/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify({ criminal_check_status: newStatus }),
      });
      notify(`Police Verification status updated to ${newStatus} ✔`);
      loadData();
    } catch (err) {
      notify(err.message || "Failed to update Police status.", "error");
    }
  };

  const openUploadModal = (userId = "", fieldKey = "criminal_record_file") => {
    setSelectedUser(userId || (users[0] ? users[0].id : ""));
    setDocField(fieldKey);
    setSelectedFile(null);
    setModalOpen(true);
  };

  const handleUploadToUserTable = async (e) => {
    e.preventDefault();
    if (!selectedUser) {
      notify("Please select an employee.", "error");
      return;
    }
    if (!selectedFile) {
      notify("Please select a document file to attach.", "error");
      return;
    }

    setUploading(true);
    const fd = new FormData();
    fd.append(docField, selectedFile);

    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/users/${selectedUser}`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: fd,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to upload document");

      notify(`Document successfully saved directly to employee's user profile record!`);
      setModalOpen(false);
      loadData();
    } catch (err) {
      notify(err.message || "Error uploading document file.", "error");
    } finally {
      setUploading(false);
    }
  };

  // Helper to find matching candidate & offer letter
  const getEmployeeMetaData = (u) => {
    const cand = candidates.find(
      (c) => (c.email && c.email.toLowerCase() === u.email?.toLowerCase()) || String(c.user_id) === String(u.id)
    );

    const offer = offerLetters.find(
      (o) => (o.candidate_email && o.candidate_email.toLowerCase() === u.email?.toLowerCase()) || (cand && String(o.candidate_id) === String(cand.id))
    );

    const userCustomDocs = customDocuments.filter(
      (d) => String(d.user_id) === String(u.id) || (d.user_email && d.user_email.toLowerCase() === u.email?.toLowerCase())
    );

    const phoneVal = u.phone_number || u.contact_no || u.phone || cand?.phone || "N/A";
    const cnicVal = u.id_card_number || u.cnic || cand?.cnic || "N/A";

    const hasCnic =
      Boolean(u.cnic_front_image || u.cnic_back_image) ||
      (cnicVal !== "N/A") ||
      userCustomDocs.some((d) => d.category === "Identity & CNIC");

    const isPoliceCleared =
      u.criminal_check_status === "Cleared" ||
      Boolean(u.criminal_record_file) ||
      userCustomDocs.some((d) => d.category === "Police & Criminal Clearance");

    const hasDegree =
      Boolean(u.latest_education_cert || u.cv) ||
      Boolean(cand?.resume_file) ||
      userCustomDocs.some((d) => d.category === "Educational Degrees");

    const hasContract =
      Boolean(offer) ||
      Boolean(u.employment_contract || u.offer_letter) ||
      userCustomDocs.some((d) => d.category === "Employment Contracts");

    return { cand, offer, userCustomDocs, phoneVal, cnicVal, hasCnic, isPoliceCleared, hasDegree, hasContract };
  };

  // Filter Unique Users
  const filteredUsers = users.filter((u) => {
    const searchLow = search.toLowerCase();
    const { phoneVal, cnicVal } = getEmployeeMetaData(u);

    return (
      (u.name || "").toLowerCase().includes(searchLow) ||
      (u.email || "").toLowerCase().includes(searchLow) ||
      cnicVal.toLowerCase().includes(searchLow) ||
      phoneVal.toLowerCase().includes(searchLow) ||
      (u.department || "").toLowerCase().includes(searchLow)
    );
  });

  const getFileUrl = (uId, docKey, path) => {
    if (!path) return null;
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    const cleanPath = path.replace(/^\/+/, "");
    return `${API_URL.replace("/api", "")}/storage/${cleanPath}`;
  };

  return (
    <div className="ed-page">
      {toast && <div className={`ed-toast ed-toast--${toast.kind}`}>{toast.message}</div>}

      {/* BREADCRUMB */}
      <Breadcrumb items={[{ label: "Enterprise HRM", path: "/admin/hrm/documents" }, { label: "Employee Documents Vault" }]} />

      {/* HEADER */}
      <div className="ed-header">
        <div>
          <div className="ed-title-row">
            <h1>Employee Document Vault &amp; User Records</h1>
            <span className="ed-live-pill"><CheckCircle2 size={14} /> Integrated PMS, HRM &amp; Offer Letter Vault</span>
          </div>
          <p>Centralized employee compliance matrix fetching phone, CNIC, educational degrees, police checks, and contract offer letters.</p>
        </div>

        <button className="ed-btn ed-btn--primary" onClick={() => openUploadModal()}>
          <Upload size={18} /> Upload User Document
        </button>
      </div>

      {/* COMPLIANCE MATRIX TABLE */}
      <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "20px", marginBottom: "24px" }}>
        <h3 style={{ margin: "0 0 14px", fontSize: "16px", color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
          <FileText size={20} color="#0082ff" /> Employee Required Compliance Document Matrix
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ padding: "10px 12px", color: "#475569" }}>Employee Name</th>
                <th style={{ padding: "10px 12px", color: "#475569" }}>CNIC &amp; Phone</th>
                <th style={{ padding: "10px 12px", color: "#475569" }}>CNIC Front/Back</th>
                <th style={{ padding: "10px 12px", color: "#475569" }}>Police Clearance</th>
                <th style={{ padding: "10px 12px", color: "#475569" }}>Educational Degree</th>
                <th style={{ padding: "10px 12px", color: "#475569" }}>Employment Contract</th>
                <th style={{ padding: "10px 12px", color: "#475569" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                const { offer, phoneVal, cnicVal, hasCnic, isPoliceCleared, hasDegree, hasContract } = getEmployeeMetaData(u);

                return (
                  <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 12px", fontWeight: "600", color: "#0f172a" }}>
                      {u.name} <br />
                      <span style={{ fontSize: "11px", color: "#64748b" }}>{u.email} ({u.department || "Engineering"})</span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#475569" }}>
                      CNIC: <strong>{cnicVal}</strong><br />
                      Phone: <strong>{phoneVal}</strong>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600", background: hasCnic ? "#f0fdf4" : "#fef2f2", color: hasCnic ? "#166534" : "#991b1b" }}>
                        {hasCnic ? "✔ Uploaded" : "❌ Missing CNIC"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600", background: isPoliceCleared ? "#f0fdf4" : "#fef2f2", color: isPoliceCleared ? "#166534" : "#991b1b" }}>
                          {isPoliceCleared ? "✔ Cleared" : "❌ Pending"}
                        </span>
                        {!isPoliceCleared && (
                          <button
                            style={{ padding: "3px 7px", fontSize: "10.5px", fontWeight: "700", background: "#10b981", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
                            onClick={() => handleUpdatePoliceStatus(u.id, "Cleared")}
                            title="Mark Police Verification as Cleared"
                          >
                            ✔ Mark Cleared
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600", background: hasDegree ? "#f0fdf4" : "#fef2f2", color: hasDegree ? "#166534" : "#991b1b" }}>
                        {hasDegree ? "✔ Verified" : "❌ Missing Degree"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600", background: hasContract ? "#f0fdf4" : "#fef2f2", color: hasContract ? "#166534" : "#991b1b" }}>
                        {hasContract ? (offer ? `✔ Offer (${offer.status})` : "✔ Uploaded") : "❌ Missing Contract"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <button
                        style={{ padding: "5px 12px", fontSize: "11.5px", fontWeight: "600", background: "#0082ff", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}
                        onClick={() => openUploadModal(u.id, !isPoliceCleared ? "criminal_record_file" : !hasCnic ? "cnic_front_image" : "employment_contract")}
                      >
                        <Upload size={14} /> + Upload Doc
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SEARCH TOOLBAR */}
      <div className="ed-toolbar">
        <div className="ed-search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search employee document vault by name, CNIC, phone, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* USER-CENTRIC CARDS GRID */}
      {loading ? (
        <div className="ed-loading-state">
          <div className="ed-spinner" />
          <p>Loading Employee Profiles &amp; Documents...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="ed-empty-card">
          <FileText size={48} color="#94a3b8" />
          <h3>No Employee Profiles Found</h3>
          <p>Try searching for a different employee name or email address.</p>
        </div>
      ) : (
        <div className="ed-grid">
          {filteredUsers.map((u) => {
            const { offer, phoneVal, cnicVal, isPoliceCleared } = getEmployeeMetaData(u);

            // Map user attached documents
            const userAttachedDocs = DOCUMENT_TYPES.map((dt) => ({
              ...dt,
              fileUrl: getFileUrl(u.id, dt.key, u[dt.key]),
            })).filter((dt) => dt.fileUrl);

            // Fetch and append offer letter document
            if (offer) {
              userAttachedDocs.unshift({
                key: "offer_letter_doc",
                label: `✉️ Digital Offer Letter (${offer.status || "Active"})`,
                category: "Employment Contracts",
                fileUrl: offer.pdf_path
                  ? getFileUrl(u.id, "offer_letter", offer.pdf_path)
                  : `${API_URL}/public/offer-letters/${offer.id}/document`,
              });
            }

            return (
              <div key={u.id} className="ed-doc-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div className="ed-card-header">
                    <span className="ed-category-badge">{u.department || "Engineering"}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span className={`ed-pill ed-pill--${isPoliceCleared ? "success" : "warning"}`}>
                        <ShieldAlert size={12} /> Police Check: {isPoliceCleared ? "Cleared ✔" : "Pending"}
                      </span>
                      {!isPoliceCleared && (
                        <button
                          style={{ padding: "3px 8px", fontSize: "11px", fontWeight: "700", background: "#10b981", color: "#fff", border: "none", borderRadius: "5px", cursor: "pointer" }}
                          onClick={() => handleUpdatePoliceStatus(u.id, "Cleared")}
                        >
                          ✔ Mark Cleared
                        </button>
                      )}
                    </div>
                  </div>

                  <h3 className="ed-doc-title" style={{ fontSize: "16px", marginBottom: "4px" }}>{u.name}</h3>
                  <div className="ed-user-meta" style={{ marginBottom: "14px" }}>
                    <Users size={16} color="#0082ff" />
                    <div>
                      <strong>{u.designation || u.role || "Staff Specialist"}</strong>
                      <span>{u.email}</span>
                    </div>
                  </div>

                  <div style={{ fontSize: "12px", color: "#475569", background: "#f8fafc", padding: "10px 12px", borderRadius: "8px", marginBottom: "14px" }}>
                    <p style={{ margin: "0 0 4px" }}><FileText size={13} color="#64748b" /> CNIC: <strong>{cnicVal}</strong></p>
                    <p style={{ margin: 0 }}><Phone size={13} color="#64748b" /> Phone: <strong>{phoneVal}</strong></p>
                  </div>

                  {offer && (
                    <div style={{ fontSize: "12px", color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "8px 10px", borderRadius: "6px", marginBottom: "12px" }}>
                      ✉️ <strong>Offer Letter ({offer.status}):</strong> {offer.job_title} ({offer.base_salary ? `PKR ${Number(offer.base_salary).toLocaleString()}` : "Active"})
                    </div>
                  )}

                  <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "10px" }}>
                    <h5 style={{ margin: "0 0 8px", fontSize: "12.5px", color: "#334155", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      📁 User Profile Documents ({userAttachedDocs.length})
                    </h5>

                    {userAttachedDocs.length === 0 ? (
                      <p style={{ fontSize: "12px", color: "#94a3b8", fontStyle: "italic" }}>No files uploaded yet for this user record.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {userAttachedDocs.map((doc) => (
                          <div key={doc.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#ffffff", border: "1px solid #e2e8f0", padding: "6px 10px", borderRadius: "6px", fontSize: "12px" }}>
                            <span style={{ fontWeight: "500", color: "#0f172a" }}>{doc.label}</span>
                            <a
                              href={doc.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="ed-download-btn"
                              style={{ fontSize: "11px", padding: "4px 10px", background: "#0082ff", color: "#fff", textDecoration: "none", borderRadius: "5px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                            >
                              <Download size={13} /> View / Download File
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="ed-card-footer" style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid #f1f5f9" }}>
                  <small style={{ color: "#64748b" }}>Role: {u.role}</small>
                  <button className="ed-download-btn" style={{ background: "#0082ff", color: "#fff", border: "none" }} onClick={() => openUploadModal(u.id)}>
                    <Upload size={14} /> Upload New File
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* UPLOAD DOCUMENT MODAL */}
      {modalOpen && (
        <div className="ed-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="ed-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="ed-modal-header">
              <h3>Upload Document Directly To User Record</h3>
              <button className="ed-close-btn" onClick={() => setModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleUploadToUserTable}>
              <div className="ed-modal-body">
                <div className="ed-field">
                  <label>Select Target Employee User Account</label>
                  <select className="ed-input" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} required>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                </div>

                <div className="ed-field">
                  <label>Target User Profile Document Field</label>
                  <select className="ed-input" value={docField} onChange={(e) => setDocField(e.target.value)}>
                    {DOCUMENT_TYPES.map((dt) => (
                      <option key={dt.key} value={dt.key}>{dt.label}</option>
                    ))}
                  </select>
                </div>

                <div className="ed-field">
                  <label>Attach File Document (PDF / JPG / PNG)</label>
                  <div className="ed-upload-box">
                    <input type="file" onChange={(e) => setSelectedFile(e.target.files[0])} required />
                    <span><Upload size={18} /> {selectedFile ? `Selected: ${selectedFile.name}` : "Click to Browse File"}</span>
                  </div>
                </div>
              </div>

              <div className="ed-modal-footer">
                <button type="button" className="ed-btn ed-btn--ghost" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="ed-btn ed-btn--primary" disabled={uploading}>
                  {uploading ? "Saving File to User Record..." : "Save to User Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
