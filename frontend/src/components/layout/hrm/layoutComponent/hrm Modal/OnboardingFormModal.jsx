import React, { useState } from "react";
import { MdClose } from "react-icons/md";

export default function OnboardingFormModal({ open, candidates, initialCandidateId, onClose, onSubmit }) {
  const [form, setForm] = useState({
    candidateId: initialCandidateId || candidates[0]?.id || "",
    startDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    buddy: "Muhammad Ahsan (HR Operations)",
  });

  if (!open) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="r-modal-overlay" onClick={onClose}>
      <div className="r-modal-panel r-modal-panel--md" onClick={(e) => e.stopPropagation()}>
        <div className="r-modal-header">
          <h3>Initialize Candidate Onboarding</h3>
          <button className="r-icon-btn" onClick={onClose} aria-label="Close modal"><MdClose size={20} /></button>
        </div>
        <form className="r-modal-form" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
          <div className="r-modal-body">
            <div className="r-field">
              <span className="r-field-label">Select Hired Candidate</span>
              <select className="r-input" value={form.candidateId} onChange={set("candidateId")}>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                ))}
              </select>
            </div>
            <div className="r-form-row r-form-row--2">
              <div className="r-field">
                <span className="r-field-label">Start Date</span>
                <input type="date" className="r-input" value={form.startDate} onChange={set("startDate")} required />
              </div>
              <div className="r-field">
                <span className="r-field-label">Assigned Buddy / HR Contact</span>
                <input className="r-input" value={form.buddy} onChange={set("buddy")} required />
              </div>
            </div>
          </div>
          <div className="r-modal-footer">
            <button type="button" className="r-btn r-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="r-btn r-btn--primary">Start Onboarding</button>
          </div>
        </form>
      </div>
    </div>
  );
}
