import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText, Plus, Search, X, Send, Printer, CheckCircle2, XCircle, Clock,
  Eye, Edit3, Trash2, ShieldCheck, MessageSquare, AlertCircle, RefreshCw
} from 'lucide-react';

import API_URL from "../../config/api";
import { authToken } from "../../utils/auth";

import './Offerletters.css';

/* =========================================================================
   API LAYER
   ========================================================================= */
async function apiRequest(path, options = {}) {
  const token = authToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    skipLoader: true,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

/* TechXaro Contract Clauses & Strict Regulations */
const TECHXARO_CLAUSES = {
  contractTerms: `1. Duties: The Employee/Intern agrees to faithfully, actively, and to the best of their skill, ability, experience, and talents perform all assigned duties and comply with all Employer written and oral policies.
2. Responsiveness: Remain responsive to urgent, work-related communication received outside office hours and take timely action in accordance with Beyond Office Hours Policy.
3. Stipend & Working Hours: Working hours as designated. Break: 1-hour lunch break and two 15-minute breaks.
4. Lateness Policy: If more than 10 minutes late, must compensate with double time. Lateness exceeding 30 minutes is marked as half-day, and exceeding 60 minutes results in an absence. Frequent lateness (more than 2 days in a month) or unapproved absences will result in formal warning letters. Upon 3 warning letters, employment may be terminated.
5. Data Confidentiality & Non-Solicitation: During employment and for 3 years thereafter, Employee/Intern shall not disclose proprietary trade secrets or solicit clients/employees retained by TechXaro in the last 36 months.
6. Notice Period: 7-10 days notice during Trial Period; 14 days notice during Probation/Internship; 30 days notice after Probation.`,
  regulationsSummary: `TechXaro Regulations: Strict Policies, Conduct Code, and Procedures apply to this offer:
- Attendance & Punctuality Policy (Strict lateness compensation & warning rules)
- Leave Policy (24 days paid vacation after probation; no paid leave during probation/internship; unapproved leaves result in double deduction)
- Data Privacy & Security (Zero tolerance for unauthorized data sharing or deals)
- Anti-Harassment & Professionalism Policy (Zero tolerance)
- Provident Fund (10% employee contribution + 10% company match after 1 year)`
};

/* Predefined Templates */
const OFFER_TEMPLATES = {
  Standard: {
    label: 'Standard Full-time Offer (TechXaro Contract)',
    employmentType: 'Full-time',
    benefits: 'Health insurance, 10% Provident Fund (with 10% company match), Medical allowance (PKR 3,000/mo), 24 paid annual leaves (post-probation).',
    customClauses: `${TECHXARO_CLAUSES.contractTerms}\n\n${TECHXARO_CLAUSES.regulationsSummary}`,
  },
  Executive: {
    label: 'Executive Senior Offer (TechXaro Contract)',
    employmentType: 'Full-time',
    benefits: 'Comprehensive family health insurance, 10% Provident Fund match, Executive performance bonus, PKR 5,000/mo medical allowance, 24 paid annual leaves.',
    customClauses: `${TECHXARO_CLAUSES.contractTerms}\n\n${TECHXARO_CLAUSES.regulationsSummary}`,
  },
  Internship: {
    label: 'Web Developer / Technical Internship Contract',
    employmentType: 'Internship',
    benefits: 'Monthly stipend (PKR 15,000/mo), mentorship program, certificate of completion, training on TechXaro core stack.',
    customClauses: `1. Duties: Learn and perform all essential job functions assigned. Comply with all Employer policies.
2. Stipend & Leaves: 3-month contract at PKR 15,000/mo. No paid leave during internship. Emergency absences must be reported before office start.
3. Lateness: >10 mins late requires double time compensation. >15 mins is half-day. >30 mins is absence. >2 late days per month results in warning letter. 3 warnings result in immediate termination. Unapproved leave results in double stipend deduction.
4. Confidentiality: 3-year non-compete, non-solicitation, and non-disclosure of TechXaro clients or trade secrets.
5. Notice Period: Resignation requires 14-day notice period or forfeit 1 month stipend.`,
  },
  Contractor: {
    label: 'Contractor Agreement (TechXaro)',
    employmentType: 'Contract',
    benefits: 'Flexible remote work, milestone-based compensation, professional development allowance.',
    customClauses: `1. Fixed-term contract with TechXaro Pvt. Ltd.
2. Confidentiality & Non-Disclosure: Strict non-disclosure of TechXaro codebases, client credentials, and business logic.
3. Non-solicitation of TechXaro clients or staff for 36 months.`,
  },
};

const COMPANY = {
  name: 'TechXaro Pvt. Ltd.',
  address: 'Lahore, Pakistan',
  email: 'hr@techxaro.com',
  signatory: 'Muhammad Ahsan',
  signatoryTitle: 'Head of People Operations',
};

const STATUS_TONE = {
  Draft: 'neutral',
  Sent: 'warning',
  Viewed: 'violet',
  Accepted: 'success',
  Declined: 'danger',
  Expired: 'neutral',
  Negotiating: 'sky',
};

const STATUS_TABS = ['All', 'Draft', 'Sent', 'Viewed', 'Accepted', 'Declined', 'Expired', 'Negotiating'];

/* UI Primitives */
const Modal = ({ open, onClose, title, children, size = 'md' }) => {
  if (!open) return null;
  return (
    <div className="ol-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`ol-modal-panel ol-modal-panel--${size}`}>
        <div className="ol-modal-header">
          <h3>{title}</h3>
          <button onClick={onClose} className="ol-icon-btn" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="ol-modal-body">{children}</div>
      </div>
    </div>
  );
};

const Badge = ({ status }) => (
  <span className={`ol-badge ol-badge--${STATUS_TONE[status] || 'neutral'}`}>{status}</span>
);

/* ================================== MAIN ================================== */
const OfferLetters = () => {
  const [offers, setOffers] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const [showCreate, setShowCreate] = useState(false);
  const [previewOffer, setPreviewOffer] = useState(null);
  const [editOffer, setEditOffer] = useState(null);
  const [deleteConfirmOffer, setDeleteConfirmOffer] = useState(null);
  const [sendingEmailId, setSendingEmailId] = useState(null);

  const notify = (message, kind = 'success') => setToast({ message, kind });

  const loadData = async () => {
    setLoading(true);
    try {
      const [offersData, candidatesData] = await Promise.all([
        apiRequest('/hrm/offer-letters'),
        apiRequest('/hrm/candidates').catch(() => []),
      ]);
      setOffers(offersData || []);
      setCandidates(candidatesData || []);
    } catch (e) {
      console.error("Fetch error:", e);
      notify(e.message || "Failed to load offer letters", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return offers.filter(o =>
      (statusFilter === 'All' || o.status === statusFilter) &&
      (!q || o.candidateName.toLowerCase().includes(q) || o.jobTitle.toLowerCase().includes(q))
    );
  }, [offers, query, statusFilter]);

  const stats = useMemo(() => ({
    total: offers.length,
    pending: offers.filter(o => o.status === 'Sent' || o.status === 'Viewed').length,
    accepted: offers.filter(o => o.status === 'Accepted').length,
    declined: offers.filter(o => o.status === 'Declined').length,
  }), [offers]);

  /* Backend Operations */
  const createOffer = async (form) => {
    try {
      const created = await apiRequest('/hrm/offer-letters', { method: 'POST', body: JSON.stringify(form) });
      setOffers(prev => [created, ...prev]);
      setShowCreate(false);
      notify(`Offer letter created for ${created.candidateName}`);
    } catch (e) {
      console.error('createOffer error:', e);
      notify(e.message || 'Failed to create offer letter', 'error');
    }
  };

  const updateOffer = async (id, form) => {
    try {
      const updated = await apiRequest(`/hrm/offer-letters/${id}`, { method: 'PATCH', body: JSON.stringify(form) });
      setOffers(prev => prev.map(o => o.id === id ? (updated || { ...o, ...form }) : o));
      setEditOffer(null);
      notify('Offer letter updated');
    } catch (e) {
      console.error('updateOffer error:', e);
      notify(e.message || 'Failed to update offer letter', 'error');
    }
  };

  const sendOfferEmail = async (offer) => {
    setSendingEmailId(offer.id);
    try {
      const result = await apiRequest(`/hrm/offer-letters/${offer.id}/send-email`, { method: 'POST' });
      if (result.offer) {
        setOffers(prev => prev.map(o => o.id === offer.id ? result.offer : o));
      }
      notify(result.message || `Offer letter email sent to ${offer.candidateEmail}`);
    } catch (e) {
      console.error('sendOfferEmail error:', e);
      notify(e.message || 'Failed to send offer email', 'error');
    } finally {
      setSendingEmailId(null);
    }
  };

  const deleteOffer = async () => {
    const offer = deleteConfirmOffer;
    if (!offer) return;
    try {
      await apiRequest(`/hrm/offer-letters/${offer.id}`, { method: 'DELETE' });
      setOffers(prev => prev.filter(o => o.id !== offer.id));
      notify(`Deleted offer letter for ${offer.candidateName}`, 'error');
    } catch (e) {
      console.error('deleteOffer error:', e);
      notify(e.message || 'Failed to delete offer letter', 'error');
    }
    setDeleteConfirmOffer(null);
  };

  if (loading) {
    return (
      <div className="offer-letters-page">
        <div className="ol-loading-center">
          <RefreshCw className="ol-spin" size={28} />
          <p>Loading offer letters database...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="offer-letters-page">
      {toast && (
        <div className={`ol-toast ol-toast--${toast.kind}`}>{toast.message}</div>
      )}

      {/* Page Header */}
      <div className="ol-page-header">
        <div className="ol-header-text">
          <div className="ol-title-row">
            <h1>Offer Letter Management</h1>
            <span className="ol-badge ol-badge--success">Connected</span>
          </div>
          <p>Generate, send, track, and manage official digital offer letters for candidates.</p>
        </div>
        <div className="ol-header-actions">
          <button className="ol-btn ol-btn--primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Create Offer Letter
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="ol-stats-grid">
        <div className="ol-stat-card">
          <div className="ol-stat-info">
            <span className="ol-stat-label">Total Issued</span>
            <span className="ol-stat-value">{stats.total}</span>
          </div>
          <FileText size={24} className="ol-stat-icon" />
        </div>
        <div className="ol-stat-card">
          <div className="ol-stat-info">
            <span className="ol-stat-label">Awaiting Response</span>
            <span className="ol-stat-value">{stats.pending}</span>
          </div>
          <Clock size={24} className="ol-stat-icon text-warning" />
        </div>
        <div className="ol-stat-card">
          <div className="ol-stat-info">
            <span className="ol-stat-label">Accepted</span>
            <span className="ol-stat-value">{stats.accepted}</span>
          </div>
          <CheckCircle2 size={24} className="ol-stat-icon text-success" />
        </div>
        <div className="ol-stat-card">
          <div className="ol-stat-info">
            <span className="ol-stat-label">Declined</span>
            <span className="ol-stat-value">{stats.declined}</span>
          </div>
          <XCircle size={24} className="ol-stat-icon text-danger" />
        </div>
      </div>

      {/* Search & Status Filter Tabs */}
      <div className="ol-toolbar">
        <div className="ol-search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search candidate name or job title..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="ol-tabs">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              className={`ol-tab ${statusFilter === tab ? 'ol-tab--active' : ''}`}
              onClick={() => setStatusFilter(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Offer Letters Table */}
      <div className="ol-table-card">
        {filtered.length === 0 ? (
          <div className="ol-empty-state">
            <FileText size={36} />
            <h3>No Offer Letters Found</h3>
            <p>Click "Create Offer Letter" to issue a new employment offer.</p>
          </div>
        ) : (
          <table className="ol-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Job Title &amp; Dept</th>
                <th>Base Salary</th>
                <th>Start Date</th>
                <th>Expiry Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((offer) => (
                <tr key={offer.id}>
                  <td>
                    <div className="ol-candidate-cell">
                      <strong>{offer.candidateName}</strong>
                      <span className="ol-subtext">{offer.candidateEmail}</span>
                    </div>
                  </td>
                  <td>
                    <strong>{offer.jobTitle}</strong>
                    <span className="ol-subtext">{offer.department} ({offer.employmentType})</span>
                  </td>
                  <td>PKR {Number(offer.baseSalary).toLocaleString()}</td>
                  <td>{offer.startDate}</td>
                  <td>
                    <span className={offer.status === 'Expired' ? 'text-danger' : ''}>
                      {offer.expiryDate}
                    </span>
                  </td>
                  <td><Badge status={offer.status} /></td>
                  <td>
                    <div className="ol-action-buttons">
                      <button
                        className="ol-icon-action"
                        title="View / Audit Offer Letter"
                        onClick={() => setPreviewOffer(offer)}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        className="ol-icon-action"
                        title="Edit Offer Letter"
                        onClick={() => setEditOffer(offer)}
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        className="ol-icon-action text-primary"
                        title="Send Email to Candidate"
                        disabled={sendingEmailId === offer.id}
                        onClick={() => sendOfferEmail(offer)}
                      >
                        {sendingEmailId === offer.id ? <RefreshCw size={16} className="ol-spin" /> : <Send size={16} />}
                      </button>
                      <button
                        className="ol-icon-action text-danger"
                        title="Delete Offer Letter"
                        onClick={() => setDeleteConfirmOffer(offer)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* CREATE OFFER LETTER MODAL */}
      {showCreate && (
        <OfferFormModal
          open={showCreate}
          title="Create New Offer Letter"
          candidates={candidates}
          onClose={() => setShowCreate(false)}
          onSubmit={createOffer}
        />
      )}

      {/* EDIT OFFER LETTER MODAL */}
      {editOffer && (
        <OfferFormModal
          open={!!editOffer}
          title="Edit Offer Letter"
          initialData={editOffer}
          candidates={candidates}
          onClose={() => setEditOffer(null)}
          onSubmit={(form) => updateOffer(editOffer.id, form)}
        />
      )}

      {/* DELETE CONFIRM DIALOG */}
      {deleteConfirmOffer && (
        <Modal
          open={!!deleteConfirmOffer}
          title="Delete Offer Letter"
          onClose={() => setDeleteConfirmOffer(null)}
          size="sm"
        >
          <p className="ol-hint-text">
            Are you sure you want to delete the offer letter for <strong>{deleteConfirmOffer.candidateName}</strong>? This action cannot be undone.
          </p>
          <div className="ol-form-actions">
            <button className="ol-btn ol-btn--ghost" onClick={() => setDeleteConfirmOffer(null)}>Cancel</button>
            <button className="ol-btn ol-btn--danger" onClick={deleteOffer}>Delete Offer</button>
          </div>
        </Modal>
      )}

      {/* PREVIEW & AUDIT LOG MODAL */}
      {previewOffer && (
        <Modal
          open={!!previewOffer}
          title={`Offer Letter: ${previewOffer.candidateName}`}
          onClose={() => setPreviewOffer(null)}
          size="lg"
        >
          <div className="ol-preview-content">
            {/* Audit Log Banner */}
            {previewOffer.status === 'Accepted' && (
              <div className="ol-portal-banner ol-portal-banner--success" style={{ marginBottom: '16px' }}>
                <ShieldCheck size={20} />
                <div>
                  <strong>Digitally Accepted &amp; Signed</strong>
                  <p>Signature Name: <strong>{previewOffer.signatureName || previewOffer.candidateName}</strong></p>
                  <p>IP Address: <strong>{previewOffer.signedIp || 'Logged'}</strong> | Date: <strong>{previewOffer.signedAt || previewOffer.respondedDate}</strong></p>
                </div>
              </div>
            )}

            {previewOffer.status === 'Declined' && (
              <div className="ol-portal-banner ol-portal-banner--danger" style={{ marginBottom: '16px' }}>
                <XCircle size={20} />
                <div>
                  <strong>Offer Declined by Candidate</strong>
                  <p>Reason: {previewOffer.rejectionReason || 'No reason provided'}</p>
                </div>
              </div>
            )}

            {previewOffer.status === 'Negotiating' && (
              <div className="ol-portal-banner ol-portal-banner--info" style={{ marginBottom: '16px' }}>
                <MessageSquare size={20} />
                <div>
                  <strong>Candidate Requested Discussion</strong>
                  <p>Notes: "{previewOffer.discussionNotes}"</p>
                </div>
              </div>
            )}

            <div className="ol-document-header">
              <div>
                <h2>{COMPANY.name}</h2>
                <p>{COMPANY.address}</p>
              </div>
              <div className="ol-doc-pill">{previewOffer.status}</div>
            </div>

            <div className="ol-details-grid">
              <div className="ol-grid-item">
                <span className="ol-grid-label">Candidate Name</span>
                <span className="ol-grid-value">{previewOffer.candidateName} ({previewOffer.candidateEmail})</span>
              </div>
              <div className="ol-grid-item">
                <span className="ol-grid-label">Job Title</span>
                <span className="ol-grid-value">{previewOffer.jobTitle} ({previewOffer.department})</span>
              </div>
              <div className="ol-grid-item">
                <span className="ol-grid-label">Base Salary</span>
                <span className="ol-grid-value">PKR {Number(previewOffer.baseSalary).toLocaleString()}</span>
              </div>
              <div className="ol-grid-item">
                <span className="ol-grid-label">Start Date</span>
                <span className="ol-grid-value">{previewOffer.startDate}</span>
              </div>
              <div className="ol-grid-item">
                <span className="ol-grid-label">Offer Expiry Date</span>
                <span className="ol-grid-value">{previewOffer.expiryDate}</span>
              </div>
              <div className="ol-grid-item">
                <span className="ol-grid-label">Template</span>
                <span className="ol-grid-value">{previewOffer.template}</span>
              </div>
            </div>

            {previewOffer.benefits && (
              <div className="ol-clause-box" style={{ marginTop: '14px' }}>
                <h4>Benefits</h4>
                <p>{previewOffer.benefits}</p>
              </div>
            )}

            {previewOffer.customClauses && (
              <div className="ol-clause-box" style={{ marginTop: '10px' }}>
                <h4>Custom Clauses</h4>
                <p>{previewOffer.customClauses}</p>
              </div>
            )}

            <div className="ol-form-actions" style={{ marginTop: '20px' }}>
              <button
                className="ol-btn ol-btn--secondary"
                onClick={() => sendOfferEmail(previewOffer)}
              >
                <Send size={16} /> Send Offer Email
              </button>
              <button className="ol-btn ol-btn--ghost" onClick={() => setPreviewOffer(null)}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

/* FORM MODAL COMPONENT (WITH PREDEFINED TEMPLATES & CANDIDATE PRE-FILL) */
const OfferFormModal = ({ open, title, initialData, candidates, onClose, onSubmit }) => {
  const [templateKey, setTemplateKey] = useState(initialData?.template || 'Standard');
  const [candidateId, setCandidateId] = useState(initialData?.candidateId || '');
  const [form, setForm] = useState({
    candidateId: initialData?.candidateId || '',
    candidateName: initialData?.candidateName || '',
    candidateEmail: initialData?.candidateEmail || '',
    jobTitle: initialData?.jobTitle || '',
    department: initialData?.department || 'Engineering',
    employmentType: initialData?.employmentType || 'Full-time',
    baseSalary: initialData?.baseSalary || 150000,
    bonus: initialData?.bonus || 0,
    benefits: initialData?.benefits || OFFER_TEMPLATES.Standard.benefits,
    startDate: initialData?.startDate || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    expiryDate: initialData?.expiryDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    reportingManager: initialData?.reportingManager || 'HR Operations',
    template: initialData?.template || 'Standard',
    customClauses: initialData?.customClauses || OFFER_TEMPLATES.Standard.customClauses,
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  /* Auto-fill when template changes */
  const handleTemplateChange = (e) => {
    const key = e.target.value;
    setTemplateKey(key);
    const tmpl = OFFER_TEMPLATES[key];
    if (tmpl) {
      setForm((f) => ({
        ...f,
        template: key,
        employmentType: tmpl.employmentType,
        benefits: tmpl.benefits,
        customClauses: tmpl.customClauses,
      }));
    }
  };

  /* Auto-fill when candidate selected */
  const handleCandidateChange = (e) => {
    const id = e.target.value;
    setCandidateId(id);
    const cand = candidates.find((c) => c.id === id);
    if (cand) {
      setForm((f) => ({
        ...f,
        candidateId: cand.id,
        candidateName: cand.name,
        candidateEmail: cand.email,
        jobTitle: cand.jobTitle || f.jobTitle || 'Developer',
        department: cand.department || f.department || 'Engineering',
      }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.candidateName.trim() || !form.candidateEmail.trim() || !form.jobTitle.trim()) return;
    onSubmit(form);
  };

  return (
    <Modal open={open} title={title} onClose={onClose} size="lg">
      <form onSubmit={handleSubmit}>
        <div className="ol-form-row ol-form-row--2">
          <div className="ol-field">
            <span className="ol-field-label">Predefined Template</span>
            <select className="ol-input" value={templateKey} onChange={handleTemplateChange}>
              {Object.keys(OFFER_TEMPLATES).map((k) => (
                <option key={k} value={k}>{OFFER_TEMPLATES[k].label}</option>
              ))}
            </select>
          </div>
          <div className="ol-field">
            <span className="ol-field-label">Select Candidate (Pre-fill)</span>
            <select className="ol-input" value={candidateId} onChange={handleCandidateChange}>
              <option value="">Select Candidate...</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="ol-form-row ol-form-row--2">
          <div className="ol-field">
            <span className="ol-field-label">Candidate Name</span>
            <input className="ol-input" value={form.candidateName} onChange={set('candidateName')} required placeholder="e.g. Jane Cooper" />
          </div>
          <div className="ol-field">
            <span className="ol-field-label">Candidate Email</span>
            <input type="email" className="ol-input" value={form.candidateEmail} onChange={set('candidateEmail')} required placeholder="jane@example.com" />
          </div>
        </div>

        <div className="ol-form-row ol-form-row--3">
          <div className="ol-field">
            <span className="ol-field-label">Job Title</span>
            <input className="ol-input" value={form.jobTitle} onChange={set('jobTitle')} required placeholder="Senior Developer" />
          </div>
          <div className="ol-field">
            <span className="ol-field-label">Department</span>
            <input className="ol-input" value={form.department} onChange={set('department')} required placeholder="Engineering" />
          </div>
          <div className="ol-field">
            <span className="ol-field-label">Employment Type</span>
            <select className="ol-input" value={form.employmentType} onChange={set('employmentType')}>
              <option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option>
            </select>
          </div>
        </div>

        <div className="ol-form-row ol-form-row--2">
          <div className="ol-field">
            <span className="ol-field-label">Base Monthly Salary (PKR)</span>
            <input type="number" className="ol-input" value={form.baseSalary} onChange={set('baseSalary')} required />
          </div>
          <div className="ol-field">
            <span className="ol-field-label">Bonus / Allowance (PKR)</span>
            <input type="number" className="ol-input" value={form.bonus} onChange={set('bonus')} />
          </div>
        </div>

        <div className="ol-form-row ol-form-row--2">
          <div className="ol-field">
            <span className="ol-field-label">Start Date</span>
            <input type="date" className="ol-input" value={form.startDate} onChange={set('startDate')} required />
          </div>
          <div className="ol-field">
            <span className="ol-field-label">Offer Expiry Date</span>
            <input type="date" className="ol-input" value={form.expiryDate} onChange={set('expiryDate')} required />
          </div>
        </div>

        <div className="ol-field">
          <span className="ol-field-label">Benefits Package</span>
          <textarea className="ol-textarea" rows={3} value={form.benefits} onChange={set('benefits')} />
        </div>

        <div className="ol-field">
          <span className="ol-field-label">Custom Clauses &amp; Terms</span>
          <textarea className="ol-textarea" rows={3} value={form.customClauses} onChange={set('customClauses')} />
        </div>

        <div className="ol-form-actions">
          <button type="button" className="ol-btn ol-btn--ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="ol-btn ol-btn--primary">Save Offer Letter</button>
        </div>
      </form>
    </Modal>
  );
};

export default OfferLetters;