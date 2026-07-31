import React, { useState } from "react";
import { MdClose, MdSend } from "react-icons/md";

const TECHXARO_PRESETS = {
  Internship: {
    title: 'Web Developer / Technical Internship Contract',
    type: 'Internship',
    baseSalary: 15000,
    benefits: 'Monthly stipend (PKR 15,000/mo), mentorship program, certificate of completion, training on TechXaro core stack.',
    customClauses: `1. Duties: Learn and perform all essential job functions assigned. Comply with all Employer written & oral policies.
2. Stipend & Leaves: 3-month contract at PKR 15,000/mo. No paid leave during internship. Emergency absences must be reported before office start.
3. Lateness: >10 mins late requires double time compensation. >15 mins is half-day. >30 mins is absence. >2 late days per month results in warning letter. 3 warnings result in immediate termination. Unapproved leave results in double stipend deduction.
4. Confidentiality: 3-year non-compete, non-solicitation, and non-disclosure of TechXaro clients or trade secrets.
5. Notice Period: Resignation requires 14-day notice period or forfeit 1 month stipend.`,
  },
  FullTime: {
    title: 'Full-time Software Engineer Contract (TechXaro)',
    type: 'Full-time',
    baseSalary: 150000,
    benefits: 'Health insurance, 10% Provident Fund (with 10% company match), Medical allowance (PKR 3,000/mo), 24 paid annual leaves (post-probation).',
    customClauses: `1. Duties: Perform all duties required for the position. Comply with all TechXaro rules and regulations.
2. Attendance & Lateness: >10 mins late requires double time compensation. 3 warning letters for unpunctuality result in termination.
3. Medical Allowance: PKR 3,000/mo available post-probation with computerized QR & NTN receipts.
4. Data Privacy: 3-year non-solicitation of TechXaro clients/staff. Zero tolerance for unauthorized deals.
5. Notice Period: 30 days notice required post-probation.`,
  },
  PartTime: {
    title: 'Part-time Developer Agreement',
    type: 'Part-time',
    baseSalary: 65000,
    benefits: 'Flexible schedule (20 hrs/week), remote work allowance, milestone bonus.',
    customClauses: `1. Fixed part-time agreement with TechXaro Pvt. Ltd.
2. Strict non-disclosure of TechXaro codebases, client credentials, and business logic.
3. 36-month non-solicitation of TechXaro clients or employees.`,
  },
};

export default function DirectOfferModal({ open, candidate, onClose, onSubmit, submitting }) {
  const [presetKey, setPresetKey] = useState('Internship');
  const [form, setForm] = useState({
    candidateId: candidate?.id || '',
    candidateName: candidate?.name || '',
    candidateEmail: candidate?.email || '',
    jobTitle: candidate?.jobTitle || 'Web Developer Intern',
    department: 'Engineering',
    employmentType: TECHXARO_PRESETS.Internship.type,
    baseSalary: TECHXARO_PRESETS.Internship.baseSalary,
    bonus: 0,
    benefits: TECHXARO_PRESETS.Internship.benefits,
    startDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
    expiryDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
    reportingManager: 'Muhammad Ahsan (HR Operations)',
    template: 'Internship',
    customClauses: TECHXARO_PRESETS.Internship.customClauses,
  });

  if (!open) return null;

  const handlePresetChange = (e) => {
    const key = e.target.value;
    setPresetKey(key);
    const p = TECHXARO_PRESETS[key];
    if (p) {
      setForm((f) => ({
        ...f,
        template: key,
        employmentType: p.type,
        baseSalary: p.baseSalary,
        benefits: p.benefits,
        customClauses: p.customClauses,
      }));
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="r-modal-overlay" onClick={onClose}>
      <div className="r-modal-panel r-modal-panel--lg" onClick={(e) => e.stopPropagation()}>
        <div className="r-modal-header">
          <h3>Issue Official Offer Letter: {candidate?.name}</h3>
          <button className="r-icon-btn" onClick={onClose} aria-label="Close modal"><MdClose size={20} /></button>
        </div>
        <form className="r-modal-form" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
          <div className="r-modal-body">
            <div className="r-field">
              <span className="r-field-label">Pre-Saved Contract Template</span>
              <select className="r-input" value={presetKey} onChange={handlePresetChange}>
                <option value="Internship">Web Developer Internship Contract (3 Months - PKR 15,000/mo)</option>
                <option value="FullTime">Full-time Software Engineer Contract (TechXaro 10% PF + Medical)</option>
                <option value="PartTime">Part-time Developer Agreement (Flexible Hours)</option>
              </select>
            </div>

            <div className="r-form-row r-form-row--2">
              <div className="r-field">
                <span className="r-field-label">Candidate Name</span>
                <input className="r-input" value={form.candidateName} onChange={set('candidateName')} required />
              </div>
              <div className="r-field">
                <span className="r-field-label">Candidate Email</span>
                <input type="email" className="r-input" value={form.candidateEmail} onChange={set('candidateEmail')} required />
              </div>
            </div>

            <div className="r-form-row r-form-row--3">
              <div className="r-field">
                <span className="r-field-label">Job Title</span>
                <input className="r-input" value={form.jobTitle} onChange={set('jobTitle')} required />
              </div>
              <div className="r-field">
                <span className="r-field-label">Base Monthly Stipend / Salary (PKR)</span>
                <input type="number" className="r-input" value={form.baseSalary} onChange={set('baseSalary')} required />
              </div>
              <div className="r-field">
                <span className="r-field-label">Offer Expiry Date</span>
                <input type="date" className="r-input" value={form.expiryDate} onChange={set('expiryDate')} required />
              </div>
            </div>

            <div className="r-field">
              <span className="r-field-label">Contract Benefits Package</span>
              <textarea className="r-textarea" rows={2} value={form.benefits} onChange={set('benefits')} />
            </div>

            <div className="r-field">
              <span className="r-field-label">Strict Regulations &amp; Terms (TechXaro PDF Contract)</span>
              <textarea className="r-textarea" rows={4} value={form.customClauses} onChange={set('customClauses')} />
            </div>
          </div>

          <div className="r-modal-footer">
            <button type="button" className="r-btn r-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="r-btn r-btn--primary" disabled={submitting}>
              <MdSend size={16} /> {submitting ? "Sending Offer..." : "Issue & Send Offer Email"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
