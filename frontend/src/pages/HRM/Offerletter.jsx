import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText, Plus, Search, X, Send, Printer, CheckCircle2, XCircle, Clock,
  Eye, Edit3, Trash2, Wifi, WifiOff, Mail, Building2, Calendar, DollarSign,
  User, ChevronRight, AlertCircle
} from 'lucide-react';

/* =========================================================================
   BACKEND CONNECTION LAYER
   -------------------------------------------------------------------------
   Mirrors the Laravel HRM backend (Sanctum-protected, RoleMiddleware-gated,
   same pattern as ProjectController / TaskController in the existing app).
   Suggested routes to add under backend/routes/api.php:
     GET    /api/offer-letters
     POST   /api/offer-letters
     PUT    /api/offer-letters/{id}
     PATCH  /api/offer-letters/{id}/status     ({ status: 'Sent'|'Accepted'|... })
     DELETE /api/offer-letters/{id}
     GET    /api/candidates?stage=Offer,Hired  (fills the candidate picker)
   Every call below tries the live endpoint first and falls back to local
   state, so the page works today and goes live the moment the backend
   answers — no code changes needed on reconnect.
   ========================================================================= */
const API_BASE = 'http://localhost:8000/api';

async function apiRequest(path, options = {}) {
  const token = window.__HRM_TOKEN__ || null;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function withFallback(liveCall, fallback) {
  try { return { data: await liveCall(), live: true }; }
  catch (e) { return { data: fallback(), live: false }; }
}

/* ------------------------------ Demo data -------------------------------- */
const candidatePool = [
  { id: 'c4', name: 'Mike Chen', jobTitle: 'DevOps Engineer', department: 'Infrastructure', email: 'mike.chen@example.com' },
  { id: 'c5', name: 'David Kim', jobTitle: 'Backend Developer', department: 'Engineering', email: 'david.kim@example.com' },
  { id: 'c3', name: 'Sarah Lee', jobTitle: 'UI/UX Designer', department: 'Design', email: 'sarah.lee@example.com' },
  { id: 'c6', name: 'Priya Anand', jobTitle: 'Product Manager', department: 'Product', email: 'priya.anand@example.com' },
];

const seedOffers = [
  {
    id: 'ol1', candidateId: 'c4', candidateName: 'Mike Chen', candidateEmail: 'mike.chen@example.com',
    jobTitle: 'DevOps Engineer', department: 'Infrastructure', employmentType: 'Full-time',
    baseSalary: 220000, bonus: 20000, benefits: 'Health insurance, provident fund, annual leave (18 days)',
    startDate: '2026-08-15', expiryDate: '2026-08-05', reportingManager: 'Fatima Noor',
    template: 'Standard', customClauses: '', status: 'Sent', issuedDate: '2026-07-25', sentDate: '2026-07-25', respondedDate: null,
  },
  {
    id: 'ol2', candidateId: 'c5', candidateName: 'David Kim', candidateEmail: 'david.kim@example.com',
    jobTitle: 'Backend Developer', department: 'Engineering', employmentType: 'Full-time',
    baseSalary: 200000, bonus: 15000, benefits: 'Health insurance, provident fund, annual leave (18 days)',
    startDate: '2026-08-01', expiryDate: '2026-07-20', reportingManager: 'Ahmed Raza',
    template: 'Standard', customClauses: '', status: 'Accepted', issuedDate: '2026-07-10', sentDate: '2026-07-10', respondedDate: '2026-07-14',
  },
];

const COMPANY = { name: 'Techzaro Pvt. Ltd.', address: 'Plot 12, Gulberg III, Lahore, Pakistan', email: 'hr@techzaro.com', signatory: 'Ayesha Malik', signatoryTitle: 'Head of People Operations' };

const uid = (p) => `${p}${Math.random().toString(36).slice(2, 9)}`;
const money = (n) => `PKR ${Number(n || 0).toLocaleString()}`;
const today = () => new Date().toISOString().slice(0, 10);

const STATUS_STYLE = {
  Draft: 'bg-gray-100 text-gray-500',
  Sent: 'bg-[#D98E3E]/10 text-[#D98E3E]',
  Viewed: 'bg-[#6C5CE7]/10 text-[#6C5CE7]',
  Accepted: 'bg-[#2F8F5B]/10 text-[#2F8F5B]',
  Declined: 'bg-[#C1483B]/10 text-[#C1483B]',
  Expired: 'bg-gray-100 text-gray-400',
};

/* ------------------------------- UI atoms --------------------------------- */
const Modal = ({ open, onClose, title, children, width = 'max-w-lg' }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-[#0B1F29]/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative w-full ${width} max-h-[92vh] sm:max-h-[90vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-[#E4E7EB]`}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-[#E4E7EB] sticky top-0 bg-white rounded-t-2xl z-10">
          <h3 className="text-base font-semibold text-[#163B4D] pr-2">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition print:hidden flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
};

const Field = ({ label, children }) => (
  <label className="block mb-4">
    <span className="block text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5">{label}</span>
    {children}
  </label>
);

const inputCls = "w-full px-3 py-2.5 bg-[#F6F7F9] border border-[#E4E7EB] rounded-lg text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#163B4D]/20 focus:border-[#163B4D] transition";

const Toast = ({ message, kind = 'success', onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, [onDone]);
  const colors = kind === 'success' ? 'bg-[#163B4D] text-white' : kind === 'error' ? 'bg-[#C1483B] text-white' : 'bg-[#2F8F5B] text-white';
  return <div className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${colors}`}>{message}</div>;
};

const StatCard = ({ label, value, accent, icon }) => (
  <div className="bg-white p-3.5 sm:p-5 rounded-xl shadow-sm border border-[#E4E7EB] flex items-center justify-between gap-2" style={{ borderLeft: `3px solid ${accent}` }}>
    <div className="min-w-0">
      <p className="text-xs sm:text-sm text-[#6B7280] font-medium mb-1 truncate">{label}</p>
      <h3 className="text-lg sm:text-2xl font-bold text-[#1F2937]">{value}</h3>
    </div>
    <div className="p-2 sm:p-3 rounded-lg flex-shrink-0" style={{ backgroundColor: `${accent}14` }}>{icon}</div>
  </div>
);

/* ================================== MAIN ================================== */
const OfferLetters = () => {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const [showCreate, setShowCreate] = useState(false);
  const [previewOffer, setPreviewOffer] = useState(null);
  const [editOffer, setEditOffer] = useState(null);

  const notify = (message, kind = 'success') => setToast({ message, kind });

  useEffect(() => {
    (async () => {
      const { data, live: isLive } = await withFallback(() => apiRequest('/offer-letters'), () => seedOffers);
      setOffers(data);
      setLive(isLive);
      setLoading(false);
    })();
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

  const persist = async (id, patch, path = `/offer-letters/${id}`, method = 'PATCH') => {
    await withFallback(() => apiRequest(path, { method, body: JSON.stringify(patch) }), () => null);
    setOffers(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o));
  };

  const createOffer = async (form) => {
    const candidate = candidatePool.find(c => c.id === form.candidateId);
    const payload = {
      id: uid('ol'), candidateId: candidate.id, candidateName: candidate.name, candidateEmail: candidate.email,
      status: 'Draft', issuedDate: today(), sentDate: null, respondedDate: null, ...form,
    };
    const { data, live: isLive } = await withFallback(
      () => apiRequest('/offer-letters', { method: 'POST', body: JSON.stringify(form) }),
      () => payload
    );
    setOffers(prev => [isLive ? data : payload, ...prev]);
    setShowCreate(false);
    notify(`Offer letter drafted for ${candidate.name}${isLive ? '' : ' (saved locally — backend offline)'}`);
  };

  const updateOffer = async (id, form) => {
    await persist(id, form, `/offer-letters/${id}`, 'PUT');
    setEditOffer(null);
    notify('Offer letter updated');
  };

  const sendOffer = async (offer) => {
    await persist(offer.id, { status: 'Sent', sentDate: today() }, `/offer-letters/${offer.id}/status`);
    notify(`Offer sent to ${offer.candidateName} at ${offer.candidateEmail}`);
  };

  const markStatus = async (offer, status) => {
    await persist(offer.id, { status, respondedDate: today() }, `/offer-letters/${offer.id}/status`);
    notify(`${offer.candidateName}'s offer marked as ${status}`, status === 'Declined' ? 'error' : 'success');
  };

  const deleteOffer = async (offer) => {
    await withFallback(() => apiRequest(`/offer-letters/${offer.id}`, { method: 'DELETE' }), () => null);
    setOffers(prev => prev.filter(o => o.id !== offer.id));
    notify(`Offer letter for ${offer.candidateName} deleted`, 'error');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F7F9]">
        <div className="flex items-center gap-3 text-[#6B7280] text-sm">
          <div className="w-4 h-4 border-2 border-[#163B4D] border-t-transparent rounded-full animate-spin" />
          Loading offer letters…
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-[#F6F7F9] min-h-screen text-[#1F2937]">
      {toast && <Toast message={toast.message} kind={toast.kind} onDone={() => setToast(null)} />}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-[#163B4D]">Offer Letters</h1>
            <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${live ? 'bg-[#2F8F5B]/10 text-[#2F8F5B]' : 'bg-gray-100 text-gray-500'}`}>
              {live ? <Wifi size={11} /> : <WifiOff size={11} />}
              {live ? 'Backend connected' : 'Demo data (backend offline)'}
            </span>
          </div>
          <p className="text-sm text-[#6B7280] mt-1">Draft, send, and track offer letters through to acceptance.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="w-full md:w-auto flex items-center justify-center gap-2 bg-[#163B4D] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#0F2C3A] transition whitespace-nowrap">
          <Plus size={18} /> New Offer Letter
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <StatCard label="Total Offers" value={stats.total} accent="#163B4D" icon={<FileText size={20} style={{ color: '#163B4D' }} />} />
        <StatCard label="Awaiting Response" value={stats.pending} accent="#D98E3E" icon={<Clock size={20} style={{ color: '#D98E3E' }} />} />
        <StatCard label="Accepted" value={stats.accepted} accent="#2F8F5B" icon={<CheckCircle2 size={20} style={{ color: '#2F8F5B' }} />} />
        <StatCard label="Declined" value={stats.declined} accent="#C1483B" icon={<XCircle size={20} style={{ color: '#C1483B' }} />} />
      </div>

      <div className="flex flex-col gap-3 bg-white p-4 rounded-xl shadow-sm border border-[#E4E7EB] mb-6">
        <div className="relative w-full">
          <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search candidate or role…" className="w-full pl-10 pr-4 py-2 bg-[#F6F7F9] border border-[#E4E7EB] rounded-lg text-sm focus:outline-none focus:border-[#163B4D]" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {['All', 'Draft', 'Sent', 'Viewed', 'Accepted', 'Declined', 'Expired'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition flex-shrink-0 ${statusFilter === s ? 'bg-[#163B4D] text-white' : 'bg-[#F6F7F9] text-gray-500 hover:text-gray-700'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E4E7EB] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#6B7280]">
            <FileText size={28} className="mx-auto text-gray-300 mb-2" />
            No offer letters match this view.
          </div>
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F6F7F9] border-b border-[#E4E7EB] text-[#6B7280]">
                  <tr>
                    <th className="px-6 py-4 font-medium">Candidate</th>
                    <th className="px-6 py-4 font-medium">Role</th>
                    <th className="px-6 py-4 font-medium">Package</th>
                    <th className="px-6 py-4 font-medium">Start Date</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E7EB]">
                  {filtered.map(offer => (
                    <tr key={offer.id} className="hover:bg-[#F6F7F9] transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#163B4D]/10 text-[#163B4D] flex items-center justify-center font-bold text-[11px] flex-shrink-0">
                            {offer.candidateName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-[#1F2937] truncate">{offer.candidateName}</p>
                            <p className="text-xs text-gray-400 truncate">{offer.candidateEmail}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-[#6B7280]">
                        <p>{offer.jobTitle}</p>
                        <p className="text-xs text-gray-400">{offer.department}</p>
                      </td>
                      <td className="px-6 py-4 text-[#6B7280]">
                        <p className="font-medium text-[#1F2937]">{money(offer.baseSalary)}/yr</p>
                        {offer.bonus > 0 && <p className="text-xs text-gray-400">+{money(offer.bonus)} bonus</p>}
                      </td>
                      <td className="px-6 py-4 text-[#6B7280] whitespace-nowrap">{offer.startDate}</td>
                      <td className="px-6 py-4">
                        <span className={`text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${STATUS_STYLE[offer.status]}`}>{offer.status}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setPreviewOffer(offer)} title="Preview" className="p-2 text-gray-400 hover:text-[#163B4D] hover:bg-[#163B4D]/10 rounded-lg transition"><Eye size={16} /></button>
                          {offer.status === 'Draft' && (
                            <button onClick={() => setEditOffer(offer)} title="Edit" className="p-2 text-gray-400 hover:text-[#163B4D] hover:bg-[#163B4D]/10 rounded-lg transition"><Edit3 size={16} /></button>
                          )}
                          <button onClick={() => deleteOffer(offer)} title="Delete" className="p-2 text-gray-400 hover:text-[#C1483B] hover:bg-[#C1483B]/10 rounded-lg transition"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-[#E4E7EB]">
              {filtered.map(offer => (
                <div key={offer.id} className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full bg-[#163B4D]/10 text-[#163B4D] flex items-center justify-center font-bold text-xs flex-shrink-0">
                      {offer.candidateName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-[#1F2937] text-sm truncate">{offer.candidateName}</p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${STATUS_STYLE[offer.status]}`}>{offer.status}</span>
                      </div>
                      <p className="text-xs text-[#6B7280] truncate">{offer.jobTitle} · {offer.department}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div className="bg-[#F6F7F9] rounded-lg px-3 py-2">
                      <p className="text-gray-400">Salary</p>
                      <p className="font-medium text-[#1F2937]">{money(offer.baseSalary)}/yr</p>
                    </div>
                    <div className="bg-[#F6F7F9] rounded-lg px-3 py-2">
                      <p className="text-gray-400">Start Date</p>
                      <p className="font-medium text-[#1F2937]">{offer.startDate}</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => setPreviewOffer(offer)} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border border-[#E4E7EB] text-[#163B4D] rounded-lg active:bg-gray-50">
                      <Eye size={14} /> Preview
                    </button>
                    {offer.status === 'Draft' && (
                      <button onClick={() => setEditOffer(offer)} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border border-[#E4E7EB] text-[#163B4D] rounded-lg active:bg-gray-50">
                        <Edit3 size={14} /> Edit
                      </button>
                    )}
                    <button onClick={() => deleteOffer(offer)} className="px-3 flex items-center justify-center border border-[#C1483B]/30 text-[#C1483B] rounded-lg active:bg-[#C1483B]/5">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Create */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Offer Letter" width="max-w-xl">
        <OfferForm onSubmit={createOffer} onCancel={() => setShowCreate(false)} />
      </Modal>

      {/* Edit (draft only) */}
      <Modal open={!!editOffer} onClose={() => setEditOffer(null)} title="Edit Offer Letter" width="max-w-xl">
        {editOffer && <OfferForm initial={editOffer} onSubmit={(form) => updateOffer(editOffer.id, form)} onCancel={() => setEditOffer(null)} lockCandidate />}
      </Modal>

      {/* Preview / Document */}
      <Modal open={!!previewOffer} onClose={() => setPreviewOffer(null)} title="Offer Letter Preview" width="max-w-3xl">
        {previewOffer && (
          <OfferPreview
            offer={previewOffer}
            onSend={() => sendOffer(previewOffer)}
            onAccept={() => markStatus(previewOffer, 'Accepted')}
            onDecline={() => markStatus(previewOffer, 'Declined')}
          />
        )}
      </Modal>
    </div>
  );
};

/* ------------------------------- Offer form ------------------------------- */
const OfferForm = ({ initial, onSubmit, onCancel, lockCandidate }) => {
  const [form, setForm] = useState(initial || {
    candidateId: candidatePool[0]?.id || '',
    jobTitle: candidatePool[0]?.jobTitle || '',
    department: candidatePool[0]?.department || '',
    employmentType: 'Full-time',
    baseSalary: 180000,
    bonus: 0,
    benefits: 'Health insurance, provident fund, annual leave (18 days)',
    startDate: '',
    expiryDate: '',
    reportingManager: '',
    template: 'Standard',
    customClauses: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => {
    const v = e.target.value;
    if (k === 'candidateId') {
      const c = candidatePool.find(p => p.id === v);
      setForm(f => ({ ...f, candidateId: v, jobTitle: c?.jobTitle || f.jobTitle, department: c?.department || f.department }));
    } else {
      setForm(f => ({ ...f, [k]: v }));
    }
  };
  const valid = form.jobTitle && form.startDate && form.expiryDate && Number(form.baseSalary) > 0;

  return (
    <form onSubmit={async (e) => { e.preventDefault(); if (!valid) return; setSaving(true); await onSubmit(form); setSaving(false); }}>
      <Field label="Candidate">
        <select className={inputCls} value={form.candidateId} onChange={set('candidateId')} disabled={lockCandidate}>
          {candidatePool.map(c => <option key={c.id} value={c.id}>{c.name} — {c.jobTitle}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Job Title"><input className={inputCls} value={form.jobTitle} onChange={set('jobTitle')} required /></Field>
        <Field label="Department"><input className={inputCls} value={form.department} onChange={set('department')} required /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Employment Type">
          <select className={inputCls} value={form.employmentType} onChange={set('employmentType')}>
            <option>Full-time</option><option>Part-time</option><option>Contract</option>
          </select>
        </Field>
        <Field label="Base Salary (PKR/yr)"><input type="number" min="0" className={inputCls} value={form.baseSalary} onChange={set('baseSalary')} required /></Field>
        <Field label="Signing Bonus (PKR)"><input type="number" min="0" className={inputCls} value={form.bonus} onChange={set('bonus')} /></Field>
      </div>
      <Field label="Benefits"><textarea className={inputCls} rows={2} value={form.benefits} onChange={set('benefits')} /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Proposed Start Date"><input type="date" className={inputCls} value={form.startDate} onChange={set('startDate')} required /></Field>
        <Field label="Offer Expiry Date"><input type="date" className={inputCls} value={form.expiryDate} onChange={set('expiryDate')} required /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Reporting Manager"><input className={inputCls} value={form.reportingManager} onChange={set('reportingManager')} placeholder="e.g. Fatima Noor" /></Field>
        <Field label="Template">
          <select className={inputCls} value={form.template} onChange={set('template')}>
            <option>Standard</option><option>Senior / Leadership</option><option>Contractor</option>
          </select>
        </Field>
      </div>
      <Field label="Additional Clauses (optional)"><textarea className={inputCls} rows={2} value={form.customClauses} onChange={set('customClauses')} placeholder="Relocation support, equity, non-compete, etc." /></Field>
      <div className="flex justify-end gap-2 mt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition">Cancel</button>
        <button type="submit" disabled={!valid || saving} className="px-4 py-2 text-sm font-medium bg-[#163B4D] text-white rounded-lg hover:bg-[#0F2C3A] transition disabled:opacity-50">
          {saving ? 'Saving…' : initial ? 'Save Changes' : 'Save Draft'}
        </button>
      </div>
    </form>
  );
};

/* ------------------------------ Offer preview ------------------------------ */
const OfferPreview = ({ offer, onSend, onAccept, onDecline }) => {
  const [sending, setSending] = useState(false);
  const isFinal = offer.status === 'Accepted' || offer.status === 'Declined';

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 print:hidden">
        <span className={`text-[11px] font-semibold px-2 py-1 rounded-full w-fit ${STATUS_STYLE[offer.status]}`}>{offer.status}</span>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => window.print()} className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border border-[#E4E7EB] text-[#163B4D] rounded-lg hover:bg-gray-50 transition">
            <Printer size={14} /> Print / Save as PDF
          </button>
          {offer.status === 'Draft' && (
            <button
              onClick={async () => { setSending(true); await onSend(); setSending(false); }}
              disabled={sending}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#163B4D] text-white rounded-lg hover:bg-[#0F2C3A] transition disabled:opacity-50"
            >
              <Send size={14} /> {sending ? 'Sending…' : 'Send Offer'}
            </button>
          )}
          {(offer.status === 'Sent' || offer.status === 'Viewed') && (
            <>
              <button onClick={onDecline} className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border border-[#C1483B]/30 text-[#C1483B] rounded-lg hover:bg-[#C1483B]/5 transition">
                <XCircle size={14} /> Mark Declined
              </button>
              <button onClick={onAccept} className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#2F8F5B] text-white rounded-lg hover:bg-[#25743F] transition">
                <CheckCircle2 size={14} /> Mark Accepted
              </button>
            </>
          )}
        </div>
      </div>

      {/* Document */}
      <div className="border border-[#E4E7EB] rounded-xl p-5 sm:p-8 bg-white overflow-x-hidden" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
        <div className="flex flex-col sm:flex-row justify-between items-start gap-2 pb-6 border-b border-[#E4E7EB] mb-6">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#163B4D]" style={{ fontFamily: 'inherit' }}>{COMPANY.name}</h2>
            <p className="text-xs text-gray-500 mt-1">{COMPANY.address}</p>
            <p className="text-xs text-gray-500">{COMPANY.email}</p>
          </div>
          <p className="text-xs text-gray-400">{offer.issuedDate}</p>
        </div>

        <p className="text-sm mb-4">Dear {offer.candidateName},</p>
        <p className="text-sm leading-relaxed mb-4">
          We are pleased to offer you the position of <strong>{offer.jobTitle}</strong> in the {offer.department} department
          at {COMPANY.name}, reporting to {offer.reportingManager || 'the department lead'}. This is a {offer.employmentType.toLowerCase()} position
          with a proposed start date of <strong>{offer.startDate}</strong>.
        </p>

        <table className="w-full text-sm mb-4">
          <tbody>
            <tr className="border-t border-[#E4E7EB]"><td className="py-2 text-gray-500 w-32 sm:w-48 align-top">Annual Base Salary</td><td className="py-2 font-medium">{money(offer.baseSalary)}</td></tr>
            <tr className="border-t border-[#E4E7EB]"><td className="py-2 text-gray-500 align-top">Signing Bonus</td><td className="py-2 font-medium">{money(offer.bonus)}</td></tr>
            <tr className="border-t border-b border-[#E4E7EB]"><td className="py-2 text-gray-500 align-top">Benefits</td><td className="py-2 font-medium">{offer.benefits}</td></tr>
          </tbody>
        </table>

        {offer.customClauses && (
          <p className="text-sm leading-relaxed mb-4"><strong>Additional terms:</strong> {offer.customClauses}</p>
        )}

        <p className="text-sm leading-relaxed mb-4">
          This offer is valid until <strong>{offer.expiryDate}</strong>. Please confirm your acceptance before this date.
          We are excited about the possibility of you joining our team and contributing to our continued growth.
        </p>

        <p className="text-sm mb-8">Sincerely,</p>
        <div>
          <p className="text-sm font-semibold">{COMPANY.signatory}</p>
          <p className="text-xs text-gray-500">{COMPANY.signatoryTitle}, {COMPANY.name}</p>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 text-xs text-gray-500 print:hidden">
        <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
        {offer.status === 'Draft'
          ? 'This letter is a draft and has not been sent to the candidate yet.'
          : offer.respondedDate
            ? `Candidate responded on ${offer.respondedDate}.`
            : `Sent on ${offer.sentDate}. Awaiting candidate response.`}
      </div>
    </div>
  );
};

export default OfferLetters;