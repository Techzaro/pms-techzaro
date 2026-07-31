import React, { useState } from "react";
import { MdClose, MdSend } from "react-icons/md";

export default function ScheduleInterviewModal({ open, candidate, onClose, onSubmit, submitting }) {
  const [form, setForm] = useState({
    candidateId: candidate?.id || '',
    candidateName: candidate?.name || '',
    candidateEmail: candidate?.email || '',
    interviewDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    interviewTime: '14:00',
    notes: 'Dear Candidate,\n\nYou have been shortlisted for an interview with TechXaro Pvt. Ltd. Please be ready at the scheduled time. We look forward to speaking with you.',
  });

  if (!open) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="r-modal-overlay" onClick={onClose}>
      <div className="r-modal-panel r-modal-panel--md" onClick={(e) => e.stopPropagation()}>
        <div className="r-modal-header">
          <h3>Schedule Interview &amp; Send Message</h3>
          <button className="r-icon-btn" onClick={onClose} aria-label="Close modal"><MdClose size={20} /></button>
        </div>
        <form className="r-modal-form" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
          <div className="r-modal-body">
            <div className="r-form-row r-form-row--2">
              <div className="r-field">
                <span className="r-field-label">Candidate Name</span>
                <input className="r-input" value={form.candidateName} disabled />
              </div>
              <div className="r-field">
                <span className="r-field-label">Candidate Email</span>
                <input type="email" className="r-input" value={form.candidateEmail} disabled />
              </div>
            </div>

            <div className="r-form-row r-form-row--2">
              <div className="r-field">
                <span className="r-field-label">Interview Date</span>
                <input type="date" className="r-input" value={form.interviewDate} onChange={set('interviewDate')} required />
              </div>
              <div className="r-field">
                <span className="r-field-label">Interview Time</span>
                <input type="time" className="r-input" value={form.interviewTime} onChange={set('interviewTime')} required />
              </div>
            </div>

            <div className="r-field">
              <span className="r-field-label">Interview Message to Candidate</span>
              <textarea className="r-textarea" rows={4} value={form.notes} onChange={set('notes')} placeholder="Type interview instructions or details..." required />
            </div>
          </div>
          <div className="r-modal-footer">
            <button type="button" className="r-btn r-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="r-btn r-btn--primary" disabled={submitting}>
              <MdSend size={16} /> {submitting ? "Sending Message..." : "Send Interview Message"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
