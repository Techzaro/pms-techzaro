import React, { useState } from "react";
import { MdClose } from "react-icons/md";

export default function JobFormModal({ open, initialData, onClose, onSubmit }) {
  const [form, setForm] = useState({
    title: initialData?.title || "",
    department: initialData?.department || "Engineering",
    location: initialData?.location || "Lahore, Pakistan",
    type: initialData?.type || "Full-time",
    openings: initialData?.openings || 1,
    status: initialData?.status || "Open",
    description: initialData?.description || "",
  });

  if (!open) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="r-modal-overlay" onClick={onClose}>
      <div className="r-modal-panel r-modal-panel--md" onClick={(e) => e.stopPropagation()}>
        <div className="r-modal-header">
          <h3>{initialData ? "Edit Job Posting" : "Post Vacancy"}</h3>
          <button className="r-icon-btn" onClick={onClose} aria-label="Close modal"><MdClose size={20} /></button>
        </div>
        <form className="r-modal-form" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
          <div className="r-modal-body">
            <div className="r-field">
              <span className="r-field-label">Job Title</span>
              <input className="r-input" value={form.title} onChange={set("title")} required placeholder="e.g. Senior Web Developer" />
            </div>
            <div className="r-form-row r-form-row--2">
              <div className="r-field">
                <span className="r-field-label">Department</span>
                <input className="r-input" value={form.department} onChange={set("department")} required />
              </div>
              <div className="r-field">
                <span className="r-field-label">Location</span>
                <input className="r-input" value={form.location} onChange={set("location")} required />
              </div>
            </div>
            <div className="r-form-row r-form-row--2">
              <div className="r-field">
                <span className="r-field-label">Job Type</span>
                <select className="r-input" value={form.type} onChange={set("type")}>
                  <option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option>
                </select>
              </div>
              <div className="r-field">
                <span className="r-field-label">Open Positions</span>
                <input type="number" className="r-input" min="1" value={form.openings} onChange={set("openings")} required />
              </div>
            </div>
            <div className="r-field">
              <span className="r-field-label">Job Description</span>
              <textarea className="r-textarea" rows={3} value={form.description} onChange={set("description")} placeholder="Outline key responsibilities and requirements..." />
            </div>
          </div>
          <div className="r-modal-footer">
            <button type="button" className="r-btn r-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="r-btn r-btn--primary">Save Job Posting</button>
          </div>
        </form>
      </div>
    </div>
  );
}
