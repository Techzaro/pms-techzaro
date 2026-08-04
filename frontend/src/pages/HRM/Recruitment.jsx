import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import API_URL from "../../config/api";
import { authToken } from "../../utils/auth";

import Breadcrumb from "../../components/Breadcrumb";
import {
  Briefcase,
  Users,
  Search,
  Plus,
  X,
  ChevronRight,
  ArrowRight,
  Mail,
  Phone,
  Award,
  Calendar,
  MapPin,
  Link as LinkIcon,
  Edit3,
  Trash2,
  RefreshCw,
  Filter,
  ChevronDown,
  CheckCircle2,
  Clock,
  Upload,
  Send,
  FileText,
  Video,
  Bell,
  Key,
  AlertTriangle,
} from "lucide-react";

/* Modularized HRM Modal Components */
import JobFormModal from "../../components/layout/hrm/layoutComponent/hrm Modal/JobFormModal";
import CandidateFormModal from "../../components/layout/hrm/layoutComponent/hrm Modal/CandidateFormModal";
import ScheduleInterviewModal from "../../components/layout/hrm/layoutComponent/hrm Modal/ScheduleInterviewModal";
import DirectOfferModal from "../../components/layout/hrm/layoutComponent/hrm Modal/DirectOfferModal";
import OnboardingFormModal from "../../components/layout/hrm/layoutComponent/hrm Modal/OnboardingFormModal";
import CandidateProfileModal from "../../components/layout/hrm/layoutComponent/hrm Modal/CandidateProfileModal";

import "./Recruitment.css";

const ENDPOINTS = {
  jobs: "/hrm/job-openings",
  candidates: "/hrm/candidates",
  onboarding: "/hrm/onboarding",
};

async function apiRequest(path, options = {}) {
  const token = authToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    skipLoader: true,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

const STAGE_TABS = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"];

export default function RecruitmentOnboarding() {
  const [activeTab, setActiveTab] = useState("Open Roles");
  const [search, setSearch] = useState("");
  const [jobs, setJobs] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [onboarding, setOnboarding] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  /* Modals state */
  const [modalCandidate, setModalCandidate] = useState(null);
  const [modalJobOpen, setModalJobOpen] = useState(false);
  const [editJob, setEditJob] = useState(null);
  const [modalCandidateOpen, setModalCandidateOpen] = useState(false);
  const [modalOnboardingOpen, setModalOnboardingOpen] = useState(false);
  const [onboardingCandidateId, setOnboardingCandidateId] = useState(null);

  /* Schedule Interview Modal */
  const [interviewCandidate, setInterviewCandidate] = useState(null);
  const [schedulingInterview, setSchedulingInterview] = useState(false);

  /* Send Offer Modal from Recruitment */
  const [directOfferCandidate, setDirectOfferCandidate] = useState(null);
  const [sendingOffer, setSendingOffer] = useState(false);

  /* AI CV Processing state */
  const [analyzingId, setAnalyzingId] = useState(null);

  const notify = useCallback((message, kind = "success") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 4000);
  }, []);

  /* Audio Chime Synthesizer for Real-time Notifications */
  const playNotificationChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime);
      gain1.gain.setValueAtTime(0.15, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.3);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(783.99, ctx.currentTime + 0.15);
      gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.15);
      osc2.stop(ctx.currentTime + 0.55);
    } catch (e) {
      // Audio context policy fallback
    }
  }, []);

  /* Real-time Offer Notifications State */
  const [hrmNotifications, setHrmNotifications] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const prevUnreadRef = useRef(0);

  const fetchHrmNotifications = useCallback(async () => {
    try {
      const res = await apiRequest("/hrm/notifications");
      if (res && res.notifications) {
        setHrmNotifications(res.notifications);
        const newUnread = res.unreadCount || 0;
        if (newUnread > prevUnreadRef.current) {
          playNotificationChime();
          const latestNotif = res.notifications[0];
          if (latestNotif) {
            notify(`${latestNotif.title} — ${latestNotif.message}`, "success");
          }
        }
        prevUnreadRef.current = newUnread;
        setUnreadNotifications(newUnread);
      }
    } catch (err) {
      // silent
    }
  }, [notify, playNotificationChime]);

  useEffect(() => {
    fetchHrmNotifications();
    const interval = setInterval(fetchHrmNotifications, 10000);
    return () => clearInterval(interval);
  }, [fetchHrmNotifications]);

  const handleMarkNotificationsRead = async () => {
    try {
      await apiRequest("/hrm/notifications/mark-read", { method: "POST" });
      setUnreadNotifications(0);
      setHrmNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      // silent
    }
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [jData, cData, oData] = await Promise.all([
        apiRequest(ENDPOINTS.jobs),
        apiRequest(ENDPOINTS.candidates),
        apiRequest(ENDPOINTS.onboarding).catch(() => []),
      ]);
      setJobs(jData || []);
      setCandidates(cData || []);
      setOnboarding(oData || []);
    } catch (err) {
      notify(err.message || "Failed to sync with backend.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  /* Backend Job Actions */
  const handleSaveJob = async (jobData) => {
    try {
      if (editJob) {
        const updated = await apiRequest(`${ENDPOINTS.jobs}/${editJob.id}`, {
          method: "PATCH",
          body: JSON.stringify(jobData),
        });
        setJobs((prev) => prev.map((j) => (j.id === editJob.id ? (updated || { ...j, ...jobData }) : j)));
        notify("Job updated successfully.");
      } else {
        const created = await apiRequest(ENDPOINTS.jobs, {
          method: "POST",
          body: JSON.stringify(jobData),
        });
        setJobs((prev) => [created, ...prev]);
        notify("Job posting created.");
      }
      setModalJobOpen(false);
      setEditJob(null);
    } catch (err) {
      notify(err.message || "Failed to save job.", "error");
    }
  };

  const handleDeleteJob = async (jobId) => {
    try {
      await apiRequest(`${ENDPOINTS.jobs}/${jobId}`, { method: "DELETE" });
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      notify("Job opening permanently deleted.");
    } catch (err) {
      notify(err.message || "Failed to delete job.", "error");
    }
  };

  /* Backend Candidate Actions */
  const handleSaveCandidate = async (candData) => {
    try {
      const created = await apiRequest(ENDPOINTS.candidates, {
        method: "POST",
        body: JSON.stringify(candData),
      });
      setCandidates((prev) => [created, ...prev]);
      setModalCandidateOpen(false);
      notify(`Candidate ${created.name} added successfully.`);
    } catch (err) {
      notify(err.message || "Failed to save candidate.", "error");
    }
  };

  const handleUpdateCandidateStage = async (candidateId, newStage) => {
    try {
      await apiRequest(`${ENDPOINTS.candidates}/${candidateId}`, {
        method: "PATCH",
        body: JSON.stringify({ stage: newStage }),
      });
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? { ...c, stage: newStage } : c))
      );
      if (modalCandidate && modalCandidate.id === candidateId) {
        setModalCandidate((prev) => ({ ...prev, stage: newStage }));
      }
      notify(`Candidate moved to ${newStage}.`);
    } catch (err) {
      notify(err.message || "Failed to update stage.", "error");
    }
  };

  const handleUpdateCandidateRating = async (candidateId, rating) => {
    try {
      await apiRequest(`${ENDPOINTS.candidates}/${candidateId}`, {
        method: "PATCH",
        body: JSON.stringify({ rating }),
      });
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? { ...c, rating } : c))
      );
      if (modalCandidate && modalCandidate.id === candidateId) {
        setModalCandidate((prev) => ({ ...prev, rating }));
      }
      notify("Rating updated.");
    } catch (err) {
      notify(err.message || "Failed to update rating.", "error");
    }
  };

  const handleUpdateCandidateNotes = async (candidateId, notes) => {
    try {
      const updated = await apiRequest(`${ENDPOINTS.candidates}/${candidateId}`, {
        method: "PATCH",
        body: JSON.stringify({ notes }),
      });
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? (updated || { ...c, notes }) : c))
      );
      if (modalCandidate && modalCandidate.id === candidateId) {
        setModalCandidate((prev) => ({ ...prev, notes }));
      }
      notify("HR candidate notes saved successfully.");
    } catch (err) {
      notify(err.message || "Failed to save HR notes.", "error");
    }
  };

  /* AI CV Screening Engine */
  const handleRunAICVScreening = async (candidateId) => {
    setAnalyzingId(candidateId);
    try {
      const result = await apiRequest(`/hrm/candidates/${candidateId}/analyze-cv`, {
        method: "POST",
      });
      if (result.candidate) {
        setCandidates((prev) =>
          prev.map((c) => (c.id === candidateId ? result.candidate : c))
        );
        if (modalCandidate && modalCandidate.id === candidateId) {
          setModalCandidate(result.candidate);
        }
      }
      notify(`AI CV Analysis complete! Score: ${result.analysis.matchScore}% Match.`);
    } catch (err) {
      notify(err.message || "AI Analysis failed.", "error");
    } finally {
      setAnalyzingId(null);
    }
  };

  /* Schedule & Email Interview Invitation */
  const handleScheduleInterview = async (interviewForm) => {
    setSchedulingInterview(true);
    try {
      const result = await apiRequest(`/hrm/candidates/${interviewForm.candidateId}/schedule-interview`, {
        method: 'POST',
        body: JSON.stringify(interviewForm),
      });

      if (result.candidate) {
        setCandidates((prev) =>
          prev.map((c) => (c.id === interviewForm.candidateId ? result.candidate : c))
        );
      }

      setInterviewCandidate(null);
      notify(result.message || `Interview invitation emailed to ${interviewForm.candidateEmail}!`);
    } catch (err) {
      notify(err.message || "Failed to schedule interview.", "error");
    } finally {
      setSchedulingInterview(false);
    }
  };

  /* Direct Offer Letter Sending from Recruitment Page */
  const handleSendDirectOffer = async (offerForm) => {
    setSendingOffer(true);
    try {
      const createdOffer = await apiRequest('/hrm/offer-letters', {
        method: 'POST',
        body: JSON.stringify(offerForm),
      });
      
      await apiRequest(`/hrm/offer-letters/${createdOffer.id}/send-email`, { method: 'POST' });
      
      if (offerForm.candidateId) {
        handleUpdateCandidateStage(offerForm.candidateId, 'Offer');
      }

      setDirectOfferCandidate(null);
      notify(`Official Offer Letter created and emailed directly to ${offerForm.candidateEmail}!`);
    } catch (err) {
      notify(err.message || 'Failed to send direct offer letter.', 'error');
    } finally {
      setSendingOffer(false);
    }
  };

  /* Onboarding Actions */
  const handleSaveOnboarding = async (formData) => {
    try {
      const created = await apiRequest(ENDPOINTS.onboarding, {
        method: "POST",
        body: JSON.stringify(formData),
      });
      setOnboarding((prev) => [created, ...prev]);

      // Move candidate stage from Hired to Onboarding
      if (formData.candidateId) {
        await handleUpdateCandidateStage(formData.candidateId, "Onboarding");
      }

      setModalOnboardingOpen(false);
      setOnboardingCandidateId(null);
      setActiveTab("Onboarding");
      notify("Candidate moved from Hired section to Onboarding!");
    } catch (err) {
      notify(err.message || "Failed to add onboarding record.", "error");
    }
  };

  const handleToggleTask = async (onboardingId, taskId) => {
    const record = onboarding.find((o) => o.id === onboardingId);
    if (!record) return;
    const updatedTasks = record.tasks.map((t) =>
      t.id === taskId ? { ...t, done: !t.done } : t
    );
    const allDone = updatedTasks.every((t) => t.done);
    const newStatus = allDone ? "Completed" : "In Progress";
    try {
      await apiRequest(`${ENDPOINTS.onboarding}/${onboardingId}`, {
        method: "PATCH",
        body: JSON.stringify({ tasks: updatedTasks, status: newStatus }),
      });
      setOnboarding((prev) =>
        prev.map((o) =>
          o.id === onboardingId ? { ...o, tasks: updatedTasks, status: newStatus } : o
        )
      );
    } catch (err) {
      notify(err.message || "Failed to update task.", "error");
    }
  };

  const handleConvertToUser = async (candidateId) => {
    try {
      const res = await apiRequest(`/hrm/candidates/${candidateId}/convert-to-user`, {
        method: "POST",
      });
      notify(`🎉 ${res.message}`);
      loadAll();
    } catch (err) {
      notify(err.message || "Failed to convert candidate to employee user.", "error");
    }
  };

  /* Stats */
  const stats = useMemo(() => {
    const openRoles = jobs.filter((j) => j.status === "Open").length;
    const activeCandidates = candidates.filter((c) => c.stage !== "Rejected").length;
    const hiredCount = candidates.filter((c) => c.stage === "Hired").length;
    const onboardingPending = onboarding.filter((o) => o.status !== "Completed").length;
    return { openRoles, activeCandidates, hiredCount, onboardingPending };
  }, [jobs, candidates, onboarding]);

  /* Filtered Lists */
  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) => j.title.toLowerCase().includes(q) || j.department.toLowerCase().includes(q));
  }, [jobs, search]);

  const filteredCandidatesForStage = (stage) => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) => {
      if (c.stage !== stage) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
    });
  };

  const jobMap = useMemo(() => {
    const map = {};
    jobs.forEach((j) => { map[j.id] = j; });
    return map;
  }, [jobs]);

  if (loading) {
    return (
      <div className="r-page">
        <div className="r-loading">
          <div className="r-loading-inner">
            <div className="r-spinner" />
            <span>Syncing HRM recruitment engine...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="r-page">
      {toast && (
        <div className={`r-toast r-toast--${toast.kind}`}>{toast.message}</div>
      )}

      {/* BREADCRUMB */}
      <Breadcrumb items={[{ label: "Enterprise HRM", path: "/admin/hrm/recruitment" }, { label: "Recruitment & Talent Acquisition" }]} />

      {/* HEADER */}
      <div className="r-header">
        <div className="r-header-text">
          <div className="r-header-title-row">
            <h1>Recruitment &amp; Talent Acquisition</h1>
            <span className="r-status-pill r-status-pill--live">
              <CheckCircle2 size={13} /> Live System
            </span>
          </div>
          <p>Manage job requisitions, schedule interviews, evaluate AI CV match scores, and issue offer letters.</p>
        </div>

        <div className="r-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {activeTab === "Open Roles" && (
            <button className="r-btn r-btn--ghost" onClick={() => { setEditJob(null); setModalJobOpen(true); }}>
              <Plus size={18} /> Post Vacancy
            </button>
          )}
          
          <button className="r-btn r-btn--primary" onClick={() => setModalCandidateOpen(true)}>
            <Users size={18} /> Add New Candidate
          </button>

          {/* Real-time Notification Bell on the RIGHT side of Add New Candidate */}
          <div className="r-notifications-bell-wrap" style={{ position: "relative" }}>
            <button
              className="r-btn r-btn--ghost"
              style={{ position: "relative", padding: "8px 12px" }}
              title="Real-time Offer Letter Notifications"
              onClick={() => {
                setShowNotificationDropdown(!showNotificationDropdown);
                if (unreadNotifications > 0) handleMarkNotificationsRead();
              }}
            >
              <Bell size={20} />
              {unreadNotifications > 0 && (
                <span style={{
                  position: "absolute",
                  top: "-4px",
                  right: "-4px",
                  background: "#ef4444",
                  color: "#ffffff",
                  borderRadius: "999px",
                  padding: "2px 6px",
                  fontSize: "10px",
                  fontWeight: "800"
                }}>
                  {unreadNotifications}
                </span>
              )}
            </button>

            {showNotificationDropdown && (
              <div style={{
                position: "absolute",
                right: 0,
                top: "42px",
                width: "320px",
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                boxShadow: "0 12px 30px rgba(15, 23, 42, 0.15)",
                zIndex: 9999,
                overflow: "hidden"
              }}>
                <div style={{ padding: "12px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: "700", fontSize: "13px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Offer Letter Alerts</span>
                  <button style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => setShowNotificationDropdown(false)}>
                    <X size={16} />
                  </button>
                </div>
                <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                  {hrmNotifications.length === 0 ? (
                    <p style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: "12px", margin: 0 }}>
                      No recent offer letter notifications.
                    </p>
                  ) : (
                    hrmNotifications.map((n) => (
                      <div key={n.id} style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", background: n.read ? "#ffffff" : "#f0f9ff" }}>
                        <div style={{ fontWeight: "700", fontSize: "12.5px", color: "#0f172a" }}>{n.title}</div>
                        <div style={{ fontSize: "12px", color: "#475569", marginTop: "2px" }}>{n.message}</div>
                        <small style={{ color: "#94a3b8", fontSize: "10.5px" }}>{new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {activeTab === "Onboarding" && (
            <button className="r-btn r-btn--ghost" onClick={() => setModalOnboardingOpen(true)}>
              <Plus size={18} /> Initialize Onboarding
            </button>
          )}
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="r-stats-row">
        <div className="r-stat-card">
          <div className="r-stat-info">
            <span className="r-stat-label">Active Job Openings</span>
            <span className="r-stat-value">{stats.openRoles}</span>
          </div>
          <div className="r-stat-icon r-stat-icon--violet"><Briefcase size={22} /></div>
        </div>
        <div className="r-stat-card">
          <div className="r-stat-info">
            <span className="r-stat-label">Active Pipeline</span>
            <span className="r-stat-value">{stats.activeCandidates}</span>
          </div>
          <div className="r-stat-icon r-stat-icon--sky"><Users size={22} /></div>
        </div>
        <div className="r-stat-card">
          <div className="r-stat-info">
            <span className="r-stat-label">Hired Candidates</span>
            <span className="r-stat-value">{stats.hiredCount}</span>
          </div>
          <div className="r-stat-icon r-stat-icon--success"><CheckCircle2 size={22} /></div>
        </div>
        <div className="r-stat-card">
          <div className="r-stat-info">
            <span className="r-stat-label">Onboarding Pending</span>
            <span className="r-stat-value">{stats.onboardingPending}</span>
          </div>
          <div className="r-stat-icon r-stat-icon--warning"><Clock size={22} /></div>
        </div>
      </div>

      {/* NAVBAR / TABS */}
      <div className="recruitment-tabs">
        <button
          className={`recruitment-tab ${activeTab === "Open Roles" ? "is-active" : ""}`}
          onClick={() => setActiveTab("Open Roles")}
        >
          Open Roles <span className="recruitment-tab-count">{jobs.length}</span>
        </button>
        {STAGE_TABS.map((stg) => {
          const count = candidates.filter((c) => c.stage === stg).length;
          return (
            <button
              key={stg}
              className={`recruitment-tab ${activeTab === stg ? "is-active" : ""}`}
              onClick={() => setActiveTab(stg)}
            >
              {stg} <span className="recruitment-tab-count">{count}</span>
            </button>
          );
        })}
        <button
          className={`recruitment-tab ${activeTab === "Onboarding" ? "is-active" : ""}`}
          onClick={() => setActiveTab("Onboarding")}
        >
          Onboarding <span className="recruitment-tab-count">{onboarding.length}</span>
        </button>
      </div>

      {/* SEARCH BAR */}
      <div className="recruitment-search">
        <Search size={18} />
        <input
          type="text"
          placeholder={`Search ${activeTab.toLowerCase()}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* MAIN TAB CONTENT */}
      <div className="recruitment-tab-content">
        {/* OPEN ROLES TAB */}
        {activeTab === "Open Roles" && (
          <div className="r-card-grid r-card-grid--jobs">
            {filteredJobs.length === 0 ? (
              <div className="r-empty-state">
                <div className="r-empty-state-icon"><Briefcase size={24} /></div>
                <h3 className="r-empty-state-title">No Job Openings</h3>
                <p className="r-empty-state-message">Click "Post Vacancy" to list a new job opening.</p>
              </div>
            ) : (
              filteredJobs.map((j) => (
                <div key={j.id} className="r-job-card">
                  <div className="r-job-card-top">
                    <h3 className="r-job-card-title">{j.title}</h3>
                    <div className="r-job-card-actions">
                      <button className="r-icon-btn" title="Edit Job" onClick={() => { setEditJob(j); setModalJobOpen(true); }}>
                        <Edit3 size={16} />
                      </button>
                      <button className="r-icon-btn r-icon-btn--danger" title="Delete Job" onClick={() => handleDeleteJob(j.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="r-job-card-meta">
                    <span><Briefcase size={14} /> {j.department}</span>
                    <span><MapPin size={14} /> {j.location}</span>
                    <span className={`r-pill r-pill--${j.status === "Open" ? "success" : "neutral"}`}>{j.status}</span>
                  </div>
                  <p className="r-job-card-desc">{j.description || "No description provided."}</p>
                  <div className="r-job-card-footer">
                    <span>{j.type} ({j.openings} opening{j.openings > 1 ? "s" : ""})</span>
                    <span className="r-job-card-applicants"><Users size={16} /> {candidates.filter(c => c.jobId === j.id).length} candidates</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* CANDIDATE STAGE TABS */}
        {STAGE_TABS.includes(activeTab) && (
          <div className="r-card-grid">
            {filteredCandidatesForStage(activeTab).length === 0 ? (
              <div className="r-empty-state">
                <div className="r-empty-state-icon"><Users size={24} /></div>
                <h3 className="r-empty-state-title">No Candidates in {activeTab}</h3>
                <p className="r-empty-state-message">Click "+ Add New Candidate" to register a candidate into the pipeline.</p>
              </div>
            ) : (
              filteredCandidatesForStage(activeTab).map((c) => {
                const targetJob = jobMap[c.jobId];
                const candOnboarding = onboarding.find(
                  (o) => o.candidate_id === c.id || o.name === c.name || o.email === c.email
                );
                const totalTasks = candOnboarding?.tasks?.length || 0;
                const completedTasks = candOnboarding?.tasks?.filter((t) => t.done)?.length || 0;
                const remainingTasks = totalTasks - completedTasks;
                const isAllOnboarded = totalTasks > 0 && remainingTasks === 0;

                return (
                  <div key={c.id} className="r-candidate-card" onClick={() => setModalCandidate(c)}>
                    <div className="r-candidate-card-top">
                      <h4 className="r-candidate-card-name">{c.name}</h4>
                      {c.aiScore > 0 && (
                        <span className={`r-ai-badge ${c.aiScore >= 85 ? 'r-ai-badge--high' : 'r-ai-badge--mid'}`}>
                          <Award size={14} /> {c.aiScore}% Match
                        </span>
                      )}
                    </div>
                    <p className="r-candidate-card-role">{targetJob ? targetJob.title : "General Applicant"} • {c.email}</p>
                    
                    <div className="r-rating-row" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: '4px', margin: '4px 0' }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <span key={star} onClick={() => handleUpdateCandidateRating(c.id, star)} style={{ cursor: 'pointer' }}>
                          {star <= c.rating ? <Award size={16} color="#f59e0b" /> : <Award size={16} color="#94a3b8" />}
                        </span>
                      ))}
                    </div>

                    <div className="r-candidate-card-footer" onClick={(e) => e.stopPropagation()}>
                      <div className="r-card-footer-meta">
                        <span className="r-candidate-card-date">{c.appliedDate}</span>
                        {candOnboarding ? (
                          isAllOnboarded ? (
                            <span className="r-pill r-pill--success" title="All Onboarding Checklist Tasks Completed">
                              <CheckCircle2 size={12} /> Onboarding Done
                            </span>
                          ) : (
                            <span className="r-pill r-pill--warning" title={`${remainingTasks} tasks remaining`}>
                              ⚡ {completedTasks}/{totalTasks} ({remainingTasks} left)
                            </span>
                          )
                        ) : (
                          <span className="r-pill r-pill--sky">{c.stage}</span>
                        )}
                      </div>
                      <div className="r-actions-row">
                        {/* APPLIED STAGE */}
                        {c.stage === "Applied" && (
                          <>
                            <button
                              className="r-btn r-btn--xs r-btn--ghost"
                              onClick={() => handleRunAICVScreening(c.id)}
                            >
                              <Award size={14} /> AI Review
                            </button>
                            <button
                              className="r-btn r-btn--xs r-btn--primary"
                              onClick={() => handleUpdateCandidateStage(c.id, "Screening")}
                            >
                              <ArrowRight size={14} /> Screening
                            </button>
                          </>
                        )}

                        {/* SCREENING STAGE */}
                        {c.stage === "Screening" && (
                          <>
                            <button
                              className="r-btn r-btn--xs r-btn--ghost"
                              onClick={() => setInterviewCandidate(c)}
                            >
                              <Calendar size={14} /> Schedule Interview
                            </button>
                            <button
                              className="r-btn r-btn--xs r-btn--primary"
                              onClick={() => handleUpdateCandidateStage(c.id, "Interview")}
                            >
                              <ArrowRight size={14} /> To Interview
                            </button>
                          </>
                        )}

                        {/* INTERVIEW STAGE */}
                        {c.stage === "Interview" && (
                          <>
                            <button
                              className="r-btn r-btn--xs r-btn--ghost"
                              title="Schedule & Send Interview Email"
                              onClick={() => setInterviewCandidate(c)}
                            >
                              <Calendar size={14} /> Schedule Interview
                            </button>
                            <button
                              className="r-btn r-btn--xs r-btn--primary"
                              title="Issue Official Offer Letter"
                              onClick={() => setDirectOfferCandidate(c)}
                            >
                              <Send size={14} /> Send Offer
                            </button>
                          </>
                        )}

                        {/* OFFER STAGE */}
                        {c.stage === "Offer" && (
                          <>
                            <button
                              className="r-btn r-btn--xs r-btn--primary"
                              onClick={() => setDirectOfferCandidate(c)}
                            >
                              <Send size={14} /> Send Offer
                            </button>
                            <button
                              className="r-btn r-btn--xs r-btn--ghost"
                              onClick={() => handleUpdateCandidateStage(c.id, "Hired")}
                            >
                              <CheckCircle2 size={14} /> Mark Hired
                            </button>
                          </>
                        )}

                        {/* HIRED STAGE */}
                        {c.stage === "Hired" && (
                          <button
                            className="r-btn r-btn--xs r-btn--primary"
                            style={{ width: "100%" }}
                            onClick={() => {
                              setOnboardingCandidateId(c.id);
                              setModalOnboardingOpen(true);
                            }}
                          >
                            <FileText size={14} /> Start Onboarding
                          </button>
                        )}

                        {/* REJECTED STAGE */}
                        {c.stage === "Rejected" && (
                          <button
                            className="r-btn r-btn--xs r-btn--ghost"
                            style={{ width: "100%" }}
                            onClick={() => handleUpdateCandidateStage(c.id, "Applied")}
                          >
                            <RefreshCw size={14} /> Re-evaluate
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ONBOARDING TAB */}
        {activeTab === "Onboarding" && (
          <div className="r-onboarding-list">
            {onboarding.length === 0 ? (
              <div className="r-empty-state">
                <div className="r-empty-state-icon"><FileText size={24} /></div>
                <h3 className="r-empty-state-title">No Onboarding Records</h3>
                <p className="r-empty-state-message">Initialize onboarding when a candidate is hired.</p>
              </div>
            ) : (
              onboarding.map((o) => {
                const oTotal = o.tasks ? o.tasks.length : 0;
                const oCompleted = o.tasks ? o.tasks.filter((t) => t.done).length : 0;
                const oRemaining = oTotal - oCompleted;
                const oDoneAll = oTotal > 0 && oRemaining === 0;

                return (
                  <div key={o.id} className="r-onboarding-card">
                    <div className="r-onboarding-header">
                      <div>
                        <h3>{o.name}</h3>
                        <span className="r-sub">{o.role} • Start Date: {o.start_date || o.startDate}</span>
                      </div>
                      <span className={`r-pill r-pill--${oDoneAll ? "success" : "warning"}`}>
                        {oDoneAll ? "✔ Onboarding Completed" : `In Progress (${oCompleted}/${oTotal})`}
                      </span>
                    </div>

                    <div style={{ margin: "12px 0 14px", background: "#e2e8f0", borderRadius: "999px", height: "8px", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${oTotal ? (oCompleted / oTotal) * 100 : 0}%`,
                          background: oDoneAll ? "#10b981" : "#0082ff",
                          height: "100%",
                          transition: "width 0.3s ease"
                        }}
                      />
                    </div>

                    <div className="r-checklist">
                      {o.tasks && o.tasks.map((task) => (
                        <label key={task.id} className="r-check-item">
                          <input
                            type="checkbox"
                            checked={task.done}
                            onChange={() => handleToggleTask(o.id, task.id)}
                          />
                          <span className={task.done ? "line-through" : ""}>{task.label}</span>
                        </label>
                      ))}
                    </div>

                    <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                      <button
                        className="r-btn r-btn--primary r-btn--sm"
                        style={{ background: "#0082ff", borderRadius: "8px" }}
                        onClick={() => handleConvertToUser(o.candidate_id || o.id)}
                      >
                        <Key size={16} /> Email Sign-In Credentials to Candidate
                      </button>

                      {oDoneAll ? (
                        <span style={{ color: "#166534", fontSize: "12.5px", fontWeight: "700", display: "flex", alignItems: "center", gap: "4px" }}>
                          <CheckCircle2 size={16} color="#166534" /> Account &amp; Docs Ready
                        </span>
                      ) : (
                        <span style={{ fontSize: "12px", color: "#64748b" }}>
                          ⚡ {oRemaining} task{oRemaining > 1 ? "s" : ""} left
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* MODULARIZED MODAL DIALOGS */}
      {modalCandidate && (
        <CandidateProfileModal
          candidate={modalCandidate}
          onClose={() => setModalCandidate(null)}
          onUpdateStage={handleUpdateCandidateStage}
          onRunAIScreening={handleRunAICVScreening}
          analyzingId={analyzingId}
          onSaveNotes={handleUpdateCandidateNotes}
          onOpenScheduleInterview={(cand) => {
            setModalCandidate(null);
            setInterviewCandidate(cand);
          }}
          onOpenDirectOffer={(cand) => {
            setModalCandidate(null);
            setDirectOfferCandidate(cand);
          }}
        />
      )}

      {modalJobOpen && (
        <JobFormModal
          open={modalJobOpen}
          initialData={editJob}
          onClose={() => setModalJobOpen(false)}
          onSubmit={handleSaveJob}
        />
      )}

      {modalCandidateOpen && (
        <CandidateFormModal
          open={modalCandidateOpen}
          jobs={jobs}
          onClose={() => setModalCandidateOpen(false)}
          onSubmit={handleSaveCandidate}
        />
      )}

      {interviewCandidate && (
        <ScheduleInterviewModal
          open={!!interviewCandidate}
          candidate={interviewCandidate}
          onClose={() => setInterviewCandidate(null)}
          onSubmit={handleScheduleInterview}
          submitting={schedulingInterview}
        />
      )}

      {modalOnboardingOpen && (
        <OnboardingFormModal
          open={modalOnboardingOpen}
          candidates={candidates}
          initialCandidateId={onboardingCandidateId}
          onClose={() => {
            setModalOnboardingOpen(false);
            setOnboardingCandidateId(null);
          }}
          onSubmit={handleSaveOnboarding}
        />
      )}

      {directOfferCandidate && (
        <DirectOfferModal
          open={!!directOfferCandidate}
          candidate={directOfferCandidate}
          onClose={() => setDirectOfferCandidate(null)}
          onSubmit={handleSendDirectOffer}
          submitting={sendingOffer}
        />
      )}
    </div>
  );
}