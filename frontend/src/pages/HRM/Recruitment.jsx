import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Briefcase, Clock, CheckCircle2, Search, Plus, MoreVertical, ChevronRight,
  X, Mail, Phone, Star, FileText, UserCheck, Calendar, MapPin, Wifi, WifiOff,
  ArrowRight, Trash2, Edit3, ThumbsDown, Link as LinkIcon, ClipboardList
} from 'lucide-react';

/* =========================================================================
   BACKEND CONNECTION LAYER
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
  try {
    return { data: await liveCall(), live: true };
  } catch (e) {
    return { data: fallback(), live: false };
  }
}

/* ---------------------------- Demo seed data ---------------------------- */
const seedJobs = [
  { id: 'j1', title: 'Frontend Developer', department: 'Engineering', location: 'Lahore, PK', type: 'Full-time', status: 'Open', openings: 2, postedDate: '2026-07-10', description: 'Build and maintain customer-facing React interfaces.' },
  { id: 'j2', title: 'Backend Developer', department: 'Engineering', location: 'Remote', type: 'Full-time', status: 'Open', openings: 1, postedDate: '2026-07-05', description: 'Own Laravel API services and database design.' },
  { id: 'j3', title: 'UI/UX Designer', department: 'Design', location: 'Lahore, PK', type: 'Full-time', status: 'Open', openings: 1, postedDate: '2026-07-01', description: 'Design product flows and maintain the design system.' },
  { id: 'j4', title: 'DevOps Engineer', department: 'Infrastructure', location: 'Remote', type: 'Contract', status: 'Open', openings: 1, postedDate: '2026-06-20', description: 'Manage CI/CD, infra-as-code, and observability.' },
];

const STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired'];

const seedCandidates = [
  { id: 'c1', name: 'Alice Smith', email: 'alice.smith@example.com', phone: '+92 300 1234567', jobId: 'j1', stage: 'Applied', appliedDate: '2026-07-27', source: 'LinkedIn', rating: 0, notes: '' },
  { id: 'c2', name: 'John Doe', email: 'john.doe@example.com', phone: '+92 301 2345678', jobId: 'j2', stage: 'Applied', appliedDate: '2026-07-26', source: 'Referral', rating: 0, notes: '' },
  { id: 'c3', name: 'Sarah Lee', email: 'sarah.lee@example.com', phone: '+92 302 3456789', jobId: 'j3', stage: 'Interview', appliedDate: '2026-07-24', source: 'Indeed', rating: 4, notes: 'Strong portfolio, second interview scheduled.' },
  { id: 'c4', name: 'Mike Chen', email: 'mike.chen@example.com', phone: '+92 303 4567890', jobId: 'j4', stage: 'Offer', appliedDate: '2026-07-20', source: 'LinkedIn', rating: 5, notes: 'Offer sent, awaiting response.' },
  { id: 'c5', name: 'David Kim', email: 'david.kim@example.com', phone: '+92 304 5678901', jobId: 'j2', stage: 'Hired', appliedDate: '2026-07-05', source: 'Referral', rating: 5, notes: 'Accepted offer.' },
];

const defaultChecklist = () => ([
  { id: 't1', label: 'Sign contract', done: false },
  { id: 't2', label: 'Provision hardware', done: false },
  { id: 't3', label: 'Create system accounts', done: false },
  { id: 't4', label: 'Complete orientation', done: false },
]);

const seedOnboarding = [
  { id: 'o1', candidateId: 'c5', name: 'David Kim', role: 'Backend Developer', startDate: '2026-08-01', buddy: 'Fatima Noor', status: 'In Progress', tasks: [
    { id: 't1', label: 'Sign contract', done: true },
    { id: 't2', label: 'Provision hardware', done: true },
    { id: 't3', label: 'Create system accounts', done: false },
    { id: 't4', label: 'Complete orientation', done: false },
  ] },
];

const uid = (p) => `${p}${Math.random().toString(36).slice(2, 9)}`;
const progressOf = (tasks) => tasks.length ? Math.round((tasks.filter(t => t.done).length / tasks.length) * 100) : 0;

/* ------------------------------ UI atoms -------------------------------- */
const Modal = ({ open, onClose, title, children, width = 'max-w-lg' }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-[#0B1F29]/50 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className={`relative w-full ${width} max-h-[90vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-[#E4E7EB] animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95`}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-[#E4E7EB] bg-white rounded-t-2xl flex-shrink-0">
          <h3 className="text-base font-semibold text-[#163B4D] pr-2">{title}</h3>
          <button onClick={onClose} className="p-2 -mr-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto overscroll-contain">
          {children}
        </div>
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

// Increased padding on mobile (py-3) for better touch targets, scales down on sm (py-2.5)
const inputCls = "w-full px-3 py-3 sm:py-2.5 bg-[#F6F7F9] border border-[#E4E7EB] rounded-lg text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#163B4D]/20 focus:border-[#163B4D] transition appearance-none";

const Toast = ({ message, kind = 'success', onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, [onDone]);
  const colors = kind === 'success' ? 'bg-[#163B4D] text-white' : 'bg-[#C1483B] text-white';
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0 z-[60] w-[90vw] sm:w-auto px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${colors} animate-in slide-in-from-bottom-5 fade-in`}>
      {message}
    </div>
  );
};

const MetricCard = ({ title, value, icon, accent }) => (
  <div className="bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-[#E4E7EB] flex items-center justify-between gap-3" style={{ borderLeft: `4px solid ${accent}` }}>
    <div className="min-w-0 flex-1">
      <p className="text-xs sm:text-sm text-[#6B7280] font-medium mb-1 truncate">{title}</p>
      <h3 className="text-xl sm:text-2xl font-bold text-[#1F2937] truncate">{value}</h3>
    </div>
    <div className="p-2 sm:p-3 rounded-lg flex-shrink-0" style={{ backgroundColor: `${accent}14` }}>{icon}</div>
  </div>
);

const initials = (name) => name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

/* ================================ MAIN =================================== */
const RecruitmentOnboarding = () => {
  const [activeView, setActiveView] = useState('recruitment');
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [jobs, setJobs] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [onboarding, setOnboarding] = useState([]);
  const [query, setQuery] = useState('');

  const [showJobModal, setShowJobModal] = useState(false);
  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [showJobsList, setShowJobsList] = useState(false);
  const [detailCandidate, setDetailCandidate] = useState(null);
  const [showOnboardModal, setShowOnboardModal] = useState(false);
  const [taskDetail, setTaskDetail] = useState(null);

  const notify = (message, kind = 'success') => setToast({ message, kind });

  useEffect(() => {
    (async () => {
      const [jRes, cRes, oRes] = await Promise.all([
        withFallback(() => apiRequest('/job-openings'), () => seedJobs),
        withFallback(() => apiRequest('/candidates'), () => seedCandidates),
        withFallback(() => apiRequest('/onboarding'), () => seedOnboarding),
      ]);
      setJobs(jRes.data);
      setCandidates(cRes.data);
      setOnboarding(oRes.data);
      setLive(jRes.live && cRes.live && oRes.live);
      setLoading(false);
    })();
  }, []);

  const jobById = useCallback((id) => jobs.find(j => j.id === id), [jobs]);

  const metrics = useMemo(() => ({
    openRoles: jobs.filter(j => j.status === 'Open').length,
    activeCandidates: candidates.filter(c => c.stage !== 'Refused').length,
    timeToHire: '22 Days',
    onboardingCompletion: onboarding.length
      ? `${Math.round(onboarding.reduce((s, o) => s + progressOf(o.tasks), 0) / onboarding.length)}%`
      : '0%',
  }), [jobs, candidates, onboarding]);

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (jobById(c.jobId)?.title || '').toLowerCase().includes(q)
    );
  }, [candidates, query, jobById]);

  const pipeline = STAGES.map(stage => ({
    stage,
    items: filteredCandidates.filter(c => c.stage === stage),
  }));

  /* ------------------------------ Handlers ------------------------------ */
  const createJob = async (form) => {
    const payload = { id: uid('j'), status: 'Open', postedDate: new Date().toISOString().slice(0, 10), ...form };
    const { data, live: isLive } = await withFallback(() => apiRequest('/job-openings', { method: 'POST', body: JSON.stringify(form) }), () => payload);
    setJobs(prev => [isLive ? data : payload, ...prev]);
    setShowJobModal(false);
    notify(`Job opening created${isLive ? '' : ' (local)'}`);
  };

  const createCandidate = async (form) => {
    const payload = { id: uid('c'), stage: 'Applied', appliedDate: new Date().toISOString().slice(0, 10), rating: 0, notes: '', ...form };
    const { data, live: isLive } = await withFallback(() => apiRequest('/candidates', { method: 'POST', body: JSON.stringify(form) }), () => payload);
    setCandidates(prev => [isLive ? data : payload, ...prev]);
    setShowCandidateModal(false);
    notify(`${form.name} added${isLive ? '' : ' (local)'}`);
  };

  const updateCandidate = async (id, patch) => {
    const { live: isLive } = await withFallback(() => apiRequest(`/candidates/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }), () => null);
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    if (detailCandidate?.id === id) setDetailCandidate(prev => ({ ...prev, ...patch }));
    return isLive;
  };

  const advanceStage = async (candidate) => {
    const idx = STAGES.indexOf(candidate.stage);
    if (idx === -1 || idx === STAGES.length - 1) return;
    const nextStage = STAGES[idx + 1];
    await updateCandidate(candidate.id, { stage: nextStage });
    notify(`Moved to ${nextStage}`);
  };

  const refuseCandidate = async (candidate) => {
    await updateCandidate(candidate.id, { stage: 'Refused' });
    setDetailCandidate(null);
    notify('Candidate refused', 'error');
  };

  const deleteCandidate = async (candidate) => {
    await withFallback(() => apiRequest(`/candidates/${candidate.id}`, { method: 'DELETE' }), () => null);
    setCandidates(prev => prev.filter(c => c.id !== candidate.id));
    setDetailCandidate(null);
    notify('Candidate removed', 'error');
  };

  const hiredWithoutOnboarding = candidates.filter(c => c.stage === 'Hired' && !onboarding.some(o => o.candidateId === c.id));

  const startOnboarding = async (form) => {
    const candidate = candidates.find(c => c.id === form.candidateId);
    const payload = {
      id: uid('o'), candidateId: candidate.id, name: candidate.name,
      role: jobById(candidate.jobId)?.title || 'New Hire', startDate: form.startDate,
      buddy: form.buddy, status: 'Pending', tasks: defaultChecklist(),
    };
    const { data, live: isLive } = await withFallback(() => apiRequest('/onboarding', { method: 'POST', body: JSON.stringify(form) }), () => payload);
    setOnboarding(prev => [isLive ? data : payload, ...prev]);
    setShowOnboardModal(false);
    notify(`Onboarding started${isLive ? '' : ' (local)'}`);
  };

  const toggleTask = async (onboardId, taskId) => {
    setOnboarding(prev => prev.map(o => {
      if (o.id !== onboardId) return o;
      const tasks = o.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t);
      const status = progressOf(tasks) === 100 ? 'Completed' : progressOf(tasks) === 0 ? 'Pending' : 'In Progress';
      const updated = { ...o, tasks, status };
      if (taskDetail?.id === onboardId) setTaskDetail(updated);
      withFallback(() => apiRequest(`/onboarding/${onboardId}`, { method: 'PATCH', body: JSON.stringify({ tasks, status }) }), () => null);
      return updated;
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F7F9]">
        <div className="flex items-center gap-3 text-[#6B7280] text-sm">
          <div className="w-4 h-4 border-2 border-[#163B4D] border-t-transparent rounded-full animate-spin" />
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 bg-[#F6F7F9] min-h-screen text-[#1F2937]">
      {toast && <Toast message={toast.message} kind={toast.kind} onDone={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6 sm:mb-8">
        <div className="min-w-0 w-full lg:w-auto">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-xl sm:text-2xl font-bold text-[#163B4D]">Talent &amp; Onboarding</h1>
            <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${live ? 'bg-[#2F8F5B]/10 text-[#2F8F5B]' : 'bg-gray-200 text-gray-600'}`}>
              {live ? <Wifi size={11} /> : <WifiOff size={11} />}
              <span className="hidden sm:inline">{live ? 'Connected' : 'Offline Mode'}</span>
            </span>
          </div>
          <p className="text-sm text-[#6B7280]">Manage recruitment pipeline and integration.</p>
        </div>
        <div className="flex flex-row gap-2 w-full lg:w-auto">
          <button onClick={() => setShowJobsList(true)} className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-white border border-[#E4E7EB] text-[#163B4D] px-4 py-2.5 sm:py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition whitespace-nowrap shadow-sm">
            <Briefcase size={16} /> <span className="hidden sm:inline">Job Openings</span>
          </button>
          <button
            onClick={() => activeView === 'recruitment' ? setShowCandidateModal(true) : setShowOnboardModal(true)}
            className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-[#163B4D] text-white px-4 py-2.5 sm:py-2 rounded-lg text-sm font-medium hover:bg-[#0F2C3A] transition whitespace-nowrap shadow-sm"
          >
            <Plus size={18} />
            {activeView === 'recruitment' ? 'Candidate' : 'Onboard'}
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <MetricCard title="Open Roles" value={metrics.openRoles} icon={<Briefcase size={20} style={{ color: '#163B4D' }} />} accent="#163B4D" />
        <MetricCard title="Active Candidates" value={metrics.activeCandidates} icon={<Users size={20} style={{ color: '#2F8F5B' }} />} accent="#2F8F5B" />
        <MetricCard title="Avg Time-to-Hire" value={metrics.timeToHire} icon={<Clock size={20} style={{ color: '#D98E3E' }} />} accent="#D98E3E" />
        <MetricCard title="Onboarding" value={metrics.onboardingCompletion} icon={<CheckCircle2 size={20} style={{ color: '#6C5CE7' }} />} accent="#6C5CE7" />
      </div>

      {/* Toggle + Search */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-[#E4E7EB] mb-6 gap-3 lg:gap-0">
        <div className="flex p-1 bg-[#F6F7F9] rounded-lg w-full lg:w-auto">
          <button onClick={() => setActiveView('recruitment')} className={`flex-1 lg:flex-none px-4 py-2 sm:py-1.5 rounded-md text-sm font-medium transition ${activeView === 'recruitment' ? 'bg-white shadow-sm text-[#163B4D]' : 'text-gray-500 hover:text-gray-700'}`}>
            Pipeline
          </button>
          <button onClick={() => setActiveView('onboarding')} className={`flex-1 lg:flex-none px-4 py-2 sm:py-1.5 rounded-md text-sm font-medium transition ${activeView === 'onboarding' ? 'bg-white shadow-sm text-[#163B4D]' : 'text-gray-500 hover:text-gray-700'}`}>
            Onboarding
          </button>
        </div>
        <div className="relative w-full lg:w-72">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people or roles…"
            className="w-full pl-10 pr-4 py-2.5 sm:py-2 bg-[#F6F7F9] border border-[#E4E7EB] rounded-lg text-sm focus:outline-none focus:border-[#163B4D] appearance-none"
          />
        </div>
      </div>

      {/* Views */}
      {activeView === 'recruitment' ? (
        // Horizontal scroll container on mobile, native grid on Desktop
        <div className="flex lg:grid lg:grid-cols-5 gap-4 overflow-x-auto snap-x snap-mandatory pb-4 lg:pb-0 lg:overflow-visible">
          {pipeline.map((col) => (
            <div key={col.stage} className="w-[85vw] sm:w-[320px] lg:w-auto flex-shrink-0 snap-center bg-white/60 rounded-xl p-4 border border-[#E4E7EB] flex flex-col h-[65vh] lg:h-auto lg:max-h-[600px]">
              <div className="flex justify-between items-center mb-4 flex-shrink-0">
                <h3 className="font-semibold text-[#163B4D] text-sm">{col.stage}</h3>
                <span className="bg-[#163B4D]/10 text-[#163B4D] text-xs font-bold px-2 py-1 rounded-full">{col.items.length}</span>
              </div>
              <div className="space-y-3 overflow-y-auto pr-1 pb-2 flex-1 overscroll-contain">
                {col.items.map(candidate => (
                  <div
                    key={candidate.id}
                    onClick={() => setDetailCandidate(candidate)}
                    className="bg-white p-3 sm:p-4 rounded-lg shadow-sm border border-[#E4E7EB] cursor-pointer hover:shadow-md hover:border-[#163B4D]/30 transition group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium text-[#1F2937] text-sm truncate pr-2">{candidate.name}</h4>
                      <MoreVertical size={16} className="text-gray-400 lg:opacity-0 group-hover:opacity-100 transition flex-shrink-0" />
                    </div>
                    <p className="text-xs text-[#6B7280] mb-3 truncate">{jobById(candidate.jobId)?.title || 'Unassigned role'}</p>
                    <div className="flex justify-between items-center text-xs text-gray-400 mt-auto">
                      <span>{candidate.appliedDate}</span>
                      <div className="w-6 h-6 rounded-full bg-[#163B4D]/10 text-[#163B4D] flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                        {initials(candidate.name)}
                      </div>
                    </div>
                  </div>
                ))}
                {col.items.length === 0 && (
                  <div className="text-center p-4 border-2 border-dashed border-[#E4E7EB] rounded-lg text-gray-400 text-xs">
                    No candidates
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-[#E4E7EB] overflow-hidden">
          {onboarding.length === 0 ? (
            <div className="p-8 sm:p-12 text-center text-sm text-[#6B7280]">
              No onboarding in progress.<br className="sm:hidden" /> Hire a candidate, then click <span className="font-medium text-[#163B4D]">Onboard</span>.
            </div>
          ) : (
            <>
              {/* Desktop / tablet table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F6F7F9] border-b border-[#E4E7EB] text-[#6B7280]">
                    <tr>
                      <th className="px-6 py-4 font-medium whitespace-nowrap">New Hire</th>
                      <th className="px-6 py-4 font-medium whitespace-nowrap">Role</th>
                      <th className="px-6 py-4 font-medium whitespace-nowrap">Start Date</th>
                      <th className="px-6 py-4 font-medium whitespace-nowrap">Progress</th>
                      <th className="px-6 py-4 font-medium whitespace-nowrap">Status</th>
                      <th className="px-6 py-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E7EB]">
                    {onboarding.map(person => {
                      const pct = progressOf(person.tasks);
                      return (
                        <tr key={person.id} className="hover:bg-[#F6F7F9] transition cursor-pointer" onClick={() => setTaskDetail(person)}>
                          <td className="px-6 py-4 font-medium text-[#1F2937] whitespace-nowrap">{person.name}</td>
                          <td className="px-6 py-4 text-[#6B7280] whitespace-nowrap">{person.role}</td>
                          <td className="px-6 py-4 text-[#6B7280] whitespace-nowrap">{person.startDate}</td>
                          <td className="px-6 py-4 min-w-[150px]">
                            <div className="flex items-center gap-2">
                              <div className="bg-gray-200 rounded-full h-1.5 w-full max-w-[100px]">
                                <div className="bg-[#2F8F5B] h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                              </div>
                              <span className="text-xs text-[#6B7280] font-medium">{pct}%</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${person.status === 'Completed' ? 'bg-[#2F8F5B]/10 text-[#2F8F5B]' : person.status === 'In Progress' ? 'bg-[#D98E3E]/10 text-[#D98E3E]' : 'bg-gray-100 text-gray-500'}`}>
                              {person.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button className="text-[#163B4D] hover:text-[#0F2C3A] p-2 -mr-2">
                              <ChevronRight size={18} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="md:hidden divide-y divide-[#E4E7EB]">
                {onboarding.map(person => {
                  const pct = progressOf(person.tasks);
                  return (
                    <button key={person.id} onClick={() => setTaskDetail(person)} className="w-full text-left px-4 py-4 active:bg-[#F6F7F9] transition">
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="font-medium text-[#1F2937] text-sm truncate">{person.name}</p>
                          <p className="text-xs text-[#6B7280] truncate mt-0.5">{person.role}</p>
                        </div>
                        <ChevronRight size={16} className="text-[#163B4D] flex-shrink-0 mt-1" />
                      </div>
                      <div className="flex items-center justify-between gap-3 mt-3">
                        <span className="text-xs text-gray-400">Starts {person.startDate}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${person.status === 'Completed' ? 'bg-[#2F8F5B]/10 text-[#2F8F5B]' : person.status === 'In Progress' ? 'bg-[#D98E3E]/10 text-[#D98E3E]' : 'bg-gray-100 text-gray-500'}`}>
                          {person.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <div className="bg-gray-200 rounded-full h-1.5 flex-1">
                          <div className="bg-[#2F8F5B] h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                        </div>
                        <span className="text-xs text-[#6B7280] font-medium w-8 text-right">{pct}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* --------------------------- Modals --------------------------- */}
      <Modal open={showJobModal} onClose={() => setShowJobModal(false)} title="New Job Opening">
        <JobForm onSubmit={createJob} onCancel={() => setShowJobModal(false)} />
      </Modal>

      <Modal open={showJobsList} onClose={() => setShowJobsList(false)} title="Job Openings" width="max-w-2xl">
        <div className="space-y-3">
          {jobs.map(job => (
            <div key={job.id} className="border border-[#E4E7EB] rounded-lg p-4 flex flex-col sm:flex-row justify-between items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <h4 className="font-semibold text-[#1F2937] text-sm">{job.title}</h4>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${job.status === 'Open' ? 'bg-[#2F8F5B]/10 text-[#2F8F5B]' : 'bg-gray-100 text-gray-500'}`}>{job.status}</span>
                </div>
                <div className="text-xs text-[#6B7280] flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="flex items-center gap-1"><Briefcase size={12} />{job.department}</span>
                  <span className="flex items-center gap-1"><MapPin size={12} />{job.location}</span>
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded">{job.type}</span>
                </div>
                <p className="text-xs text-gray-500 mt-2 line-clamp-2">{job.description}</p>
              </div>
              <div className="w-full sm:w-auto bg-[#163B4D]/5 px-3 py-2 sm:px-2 sm:py-1 rounded-lg sm:rounded-full flex items-center justify-center">
                 <span className="text-xs font-semibold text-[#163B4D] whitespace-nowrap">
                   {candidates.filter(c => c.jobId === job.id).length} applicants
                 </span>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => { setShowJobsList(false); setShowJobModal(true); }}
          className="mt-4 w-full flex items-center justify-center gap-2 border border-dashed border-[#163B4D]/40 text-[#163B4D] py-3 sm:py-2.5 rounded-lg text-sm font-medium hover:bg-[#163B4D]/5 transition"
        >
          <Plus size={16} /> Add another opening
        </button>
      </Modal>

      <Modal open={showCandidateModal} onClose={() => setShowCandidateModal(false)} title="Add Candidate">
        <CandidateForm jobs={jobs} onSubmit={createCandidate} onCancel={() => setShowCandidateModal(false)} />
      </Modal>

      <Modal open={!!detailCandidate} onClose={() => setDetailCandidate(null)} title="Candidate Profile">
        {detailCandidate && (
          <CandidateDetail
            candidate={detailCandidate}
            job={jobById(detailCandidate.jobId)}
            onAdvance={() => advanceStage(detailCandidate)}
            onRefuse={() => refuseCandidate(detailCandidate)}
            onDelete={() => deleteCandidate(detailCandidate)}
            onSaveNotes={(notes) => updateCandidate(detailCandidate.id, { notes })}
            onRate={(rating) => updateCandidate(detailCandidate.id, { rating })}
          />
        )}
      </Modal>

      <Modal open={showOnboardModal} onClose={() => setShowOnboardModal(false)} title="Start Onboarding">
        <OnboardForm candidates={hiredWithoutOnboarding} onSubmit={startOnboarding} onCancel={() => setShowOnboardModal(false)} />
      </Modal>

      <Modal open={!!taskDetail} onClose={() => setTaskDetail(null)} title="Onboarding Checklist">
        {taskDetail && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-[#163B4D]/10 text-[#163B4D] flex items-center justify-center font-bold text-base flex-shrink-0">
                {initials(taskDetail.name)}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-[#1F2937] text-base truncate">{taskDetail.name}</p>
                <p className="text-sm text-[#6B7280] truncate">{taskDetail.role}</p>
                <p className="text-xs text-gray-400 mt-0.5">Starts {taskDetail.startDate}</p>
              </div>
            </div>
            <div className="space-y-2.5 mb-4">
              {taskDetail.tasks.map(t => (
                <label key={t.id} className="flex items-center gap-3 p-3 sm:p-3.5 border border-[#E4E7EB] rounded-xl cursor-pointer hover:bg-[#F6F7F9] active:bg-gray-100 transition touch-manipulation">
                  <input type="checkbox" checked={t.done} onChange={() => toggleTask(taskDetail.id, t.id)} className="w-5 h-5 rounded border-gray-300 accent-[#163B4D]" />
                  <span className={`text-sm ${t.done ? 'line-through text-gray-400' : 'text-[#1F2937]'}`}>{t.label}</span>
                </label>
              ))}
            </div>
            <div className="bg-[#F6F7F9] p-3 rounded-lg flex items-start gap-2">
               <UserCheck size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
               <p className="text-xs text-[#6B7280] leading-relaxed">
                 Buddy assigned:<br/>
                 <span className="font-medium text-[#1F2937] text-sm">{taskDetail.buddy || 'None assigned'}</span>
               </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

/* ------------------------------- Form parts ------------------------------ */
const JobForm = ({ onSubmit, onCancel }) => {
  const [form, setForm] = useState({ title: '', department: '', location: '', type: 'Full-time', openings: 1, description: '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const valid = form.title.trim() && form.department.trim() && form.location.trim();
  
  return (
    <form onSubmit={async (e) => { e.preventDefault(); if (!valid) return; setSaving(true); await onSubmit(form); setSaving(false); }}>
      <Field label="Job Title"><input className={inputCls} value={form.title} onChange={set('title')} placeholder="e.g. Senior Backend Developer" required /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:gap-4">
        <Field label="Department"><input className={inputCls} value={form.department} onChange={set('department')} placeholder="Engineering" required /></Field>
        <Field label="Location"><input className={inputCls} value={form.location} onChange={set('location')} placeholder="Lahore, PK" required /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:gap-4">
        <Field label="Employment Type">
          <select className={inputCls} value={form.type} onChange={set('type')}>
            <option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option>
          </select>
        </Field>
        <Field label="Openings"><input type="number" min="1" className={inputCls} value={form.openings} onChange={set('openings')} /></Field>
      </div>
      <Field label="Description"><textarea className={inputCls} rows={4} value={form.description} onChange={set('description')} placeholder="Role summary and responsibilities" /></Field>
      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-6">
        <button type="button" onClick={onCancel} className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition">Cancel</button>
        <button type="submit" disabled={!valid || saving} className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm font-medium bg-[#163B4D] text-white rounded-lg hover:bg-[#0F2C3A] transition disabled:opacity-50">
          {saving ? 'Creating…' : 'Create Opening'}
        </button>
      </div>
    </form>
  );
};

const CandidateForm = ({ jobs, onSubmit, onCancel }) => {
  const [form, setForm] = useState({ name: '', email: '', phone: '', jobId: jobs[0]?.id || '', source: 'LinkedIn', resumeUrl: '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const valid = form.name.trim() && form.email.trim() && form.jobId;
  
  return (
    <form onSubmit={async (e) => { e.preventDefault(); if (!valid) return; setSaving(true); await onSubmit(form); setSaving(false); }}>
      <Field label="Full Name"><input className={inputCls} value={form.name} onChange={set('name')} placeholder="Jane Cooper" required /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:gap-4">
        <Field label="Email"><input type="email" className={inputCls} value={form.email} onChange={set('email')} placeholder="jane@example.com" required /></Field>
        <Field label="Phone"><input type="tel" className={inputCls} value={form.phone} onChange={set('phone')} placeholder="+92 300 0000000" /></Field>
      </div>
      <Field label="Applying For">
        <select className={inputCls} value={form.jobId} onChange={set('jobId')} required>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:gap-4">
        <Field label="Source">
          <select className={inputCls} value={form.source} onChange={set('source')}>
            <option>LinkedIn</option><option>Referral</option><option>Indeed</option><option>Company Website</option><option>Other</option>
          </select>
        </Field>
        <Field label="Resume Link"><input type="url" className={inputCls} value={form.resumeUrl} onChange={set('resumeUrl')} placeholder="https://…" /></Field>
      </div>
      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-6">
        <button type="button" onClick={onCancel} className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition">Cancel</button>
        <button type="submit" disabled={!valid || saving} className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm font-medium bg-[#163B4D] text-white rounded-lg hover:bg-[#0F2C3A] transition disabled:opacity-50">
          {saving ? 'Adding…' : 'Add Candidate'}
        </button>
      </div>
    </form>
  );
};

const CandidateDetail = ({ candidate, job, onAdvance, onRefuse, onDelete, onSaveNotes, onRate }) => {
  const [notes, setNotes] = useState(candidate.notes || '');
  const idx = STAGES.indexOf(candidate.stage);
  const isFinal = candidate.stage === 'Hired' || candidate.stage === 'Refused';
  
  return (
    <div>
      <div className="flex items-center gap-3 sm:gap-4 mb-6">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#163B4D]/10 text-[#163B4D] flex items-center justify-center font-bold text-lg flex-shrink-0">
          {initials(candidate.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[#1F2937] text-base sm:text-lg truncate">{candidate.name}</p>
          <p className="text-sm text-[#6B7280] truncate">{job?.title || 'Unassigned role'}</p>
        </div>
        <span className={`text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${candidate.stage === 'Refused' ? 'bg-[#C1483B]/10 text-[#C1483B]' : 'bg-[#163B4D]/10 text-[#163B4D]'}`}>
          {candidate.stage}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4 text-sm mb-6 bg-[#F6F7F9] p-4 rounded-xl">
        <div className="flex items-center gap-2.5 text-[#1F2937] overflow-hidden"><Mail size={16} className="text-gray-400 flex-shrink-0" /><span className="truncate">{candidate.email}</span></div>
        <div className="flex items-center gap-2.5 text-[#1F2937]"><Phone size={16} className="text-gray-400 flex-shrink-0" />{candidate.phone || '—'}</div>
        <div className="flex items-center gap-2.5 text-[#1F2937]"><Calendar size={16} className="text-gray-400 flex-shrink-0" />Applied {candidate.appliedDate}</div>
        <div className="flex items-center gap-2.5 text-[#1F2937]"><LinkIcon size={16} className="text-gray-400 flex-shrink-0" />{candidate.source}</div>
      </div>

      <div className="mb-5">
        <span className="block text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-2">Rating</span>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => onRate(n)} type="button" className="p-1 -ml-1">
              <Star size={24} className={n <= (candidate.rating || 0) ? 'fill-[#D98E3E] text-[#D98E3E]' : 'text-gray-200'} />
            </button>
          ))}
        </div>
      </div>

      <Field label="Notes">
        <textarea className={inputCls} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => onSaveNotes(notes)} placeholder="Interview feedback, next steps…" />
      </Field>

      {!isFinal && (
        <div className="flex items-center gap-1.5 mb-6 mt-4">
          {STAGES.map((s, i) => (
            <React.Fragment key={s}>
              <div className={`h-2 flex-1 rounded-full ${i <= idx ? 'bg-[#163B4D]' : 'bg-gray-200'}`} />
            </React.Fragment>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 justify-between items-stretch sm:items-center pt-4 border-t border-[#E4E7EB]">
        <button onClick={onDelete} className="flex items-center justify-center sm:justify-start gap-1.5 px-3 py-3 sm:py-2 text-sm font-medium text-[#C1483B] hover:bg-[#C1483B]/10 rounded-lg transition order-2 sm:order-1">
          <Trash2 size={16} /> Remove
        </button>
        <div className="flex flex-col sm:flex-row gap-2 order-1 sm:order-2">
          {!isFinal && (
            <button onClick={onRefuse} className="flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-4 py-3 sm:py-2 text-sm font-medium text-[#C1483B] border border-[#C1483B]/30 rounded-lg hover:bg-[#C1483B]/5 transition">
              <ThumbsDown size={16} /> Refuse
            </button>
          )}
          {!isFinal && (
            <button onClick={onAdvance} className="flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-5 py-3 sm:py-2 text-sm font-medium bg-[#163B4D] text-white rounded-lg hover:bg-[#0F2C3A] transition">
              Move to {STAGES[idx + 1]} <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const OnboardForm = ({ candidates, onSubmit, onCancel }) => {
  const [form, setForm] = useState({ candidateId: candidates[0]?.id || '', startDate: '', buddy: '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const valid = form.candidateId && form.startDate;

  if (candidates.length === 0) {
    return (
      <div className="text-center py-8">
        <UserCheck size={36} className="mx-auto text-gray-300 mb-3" />
        <p className="text-sm text-[#1F2937] font-medium mb-1">No pending candidates</p>
        <p className="text-sm text-[#6B7280]">Move a candidate to the "Hired" stage first to begin onboarding.</p>
        <button onClick={onCancel} className="mt-6 w-full sm:w-auto px-6 py-3 sm:py-2 text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg transition">Close</button>
      </div>
    );
  }

  return (
    <form onSubmit={async (e) => { e.preventDefault(); if (!valid) return; setSaving(true); await onSubmit(form); setSaving(false); }}>
      <Field label="Hired Candidate">
        <select className={inputCls} value={form.candidateId} onChange={set('candidateId')}>
          {candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:gap-4">
        <Field label="Start Date"><input type="date" className={inputCls} value={form.startDate} onChange={set('startDate')} required /></Field>
        <Field label="Onboarding Buddy"><input className={inputCls} value={form.buddy} onChange={set('buddy')} placeholder="e.g. Fatima Noor" /></Field>
      </div>
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-6 flex gap-2">
        <ClipboardList size={16} className="text-blue-500 flex-shrink-0 mt-0.5" /> 
        <p className="text-xs text-blue-700 leading-relaxed">
          A standard checklist (contract, hardware, system accounts, orientation) will be generated automatically.
        </p>
      </div>
      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
        <button type="button" onClick={onCancel} className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition">Cancel</button>
        <button type="submit" disabled={!valid || saving} className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm font-medium bg-[#163B4D] text-white rounded-lg hover:bg-[#0F2C3A] transition disabled:opacity-50">
          {saving ? 'Starting…' : 'Start Onboarding'}
        </button>
      </div>
    </form>
  );
};

export default RecruitmentOnboarding;