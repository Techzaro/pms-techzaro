import React, { useState } from "react";
import { X, Upload } from "lucide-react";
import API_URL from "../../../../../config/api";
import { authToken } from "../../../../../utils/auth";

export default function CandidateFormModal({ open, jobs, onClose, onSubmit }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    cnic: "",
    jobId: jobs[0]?.id || "",
    source: "LinkedIn",
    resumeUrl: "",
    resumeFile: "",
  });
  const [uploading, setUploading] = useState(false);

  if (!open) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const fd = new FormData();
    fd.append("resume", file);

    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/hrm/candidates/upload-resume`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed");

      setForm((f) => ({
        ...f,
        resumeUrl: data.url,
        resumeFile: data.filename,
      }));
    } catch (err) {
      alert(err.message || "Error uploading file");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="r-modal-overlay" onClick={onClose}>
      <div className="r-modal-panel r-modal-panel--md" onClick={(e) => e.stopPropagation()}>
        <div className="r-modal-header">
          <h3>Add New Candidate</h3>
          <button className="r-icon-btn" onClick={onClose} aria-label="Close modal"><X size={20} /></button>
        </div>
        <form className="r-modal-form" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
          <div className="r-modal-body">
            <div className="r-form-row r-form-row--2">
              <div className="r-field">
                <span className="r-field-label">Full Name</span>
                <input className="r-input" value={form.name} onChange={set("name")} required placeholder="e.g. Farhan Ullah" />
              </div>
              <div className="r-field">
                <span className="r-field-label">Email Address</span>
                <input type="email" className="r-input" value={form.email} onChange={set("email")} required placeholder="farhan@example.com" />
              </div>
            </div>

            <div className="r-form-row r-form-row--2">
              <div className="r-field">
                <span className="r-field-label">Phone Number</span>
                <input className="r-input" value={form.phone} onChange={set("phone")} placeholder="+923119121134" />
              </div>
              <div className="r-field">
                <span className="r-field-label">CNIC Number</span>
                <input className="r-input" value={form.cnic} onChange={set("cnic")} placeholder="12101-1492836-1" />
              </div>
            </div>

            <div className="r-form-row r-form-row--2">
              <div className="r-field">
                <span className="r-field-label">Target Job Role</span>
                <select className="r-input" value={form.jobId} onChange={set("jobId")}>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>{j.title} ({j.department})</option>
                  ))}
                </select>
              </div>
              <div className="r-field">
                <span className="r-field-label">Source</span>
                <select className="r-input" value={form.source} onChange={set("source")}>
                  <option>LinkedIn</option><option>Referral</option><option>Career Portal</option><option>Direct</option>
                </select>
              </div>
            </div>

            <div className="r-field">
              <span className="r-field-label">Upload Candidate CV / Document (PDF, DOCX)</span>
              <div className="r-file-upload-box">
                <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleFileUpload} id="cv-upload-input" style={{ display: 'none' }} />
                <label htmlFor="cv-upload-input" className="r-file-upload-label">
                  <Upload size={24} />
                  <span>{uploading ? "Uploading Document..." : form.resumeFile ? `Selected: ${form.resumeFile}` : "Click to Browse & Upload Resume File"}</span>
                </label>
              </div>
            </div>
          </div>
          <div className="r-modal-footer">
            <button type="button" className="r-btn r-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="r-btn r-btn--primary" disabled={uploading}>Add Candidate</button>
          </div>
        </form>
      </div>
    </div>
  );
}
