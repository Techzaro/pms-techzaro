import React, { useState, useEffect, useCallback, useRef } from "react";
import API_URL from "../../config/api";
import { authToken, getUser } from "../../utils/auth";
import {
  MdDashboard, MdCheckCircle, MdWarning, MdEventAvailable,
  MdCloudUpload, MdDownload, MdBadge, MdPhone, MdMail, MdHome,
  MdWork, MdPlayArrow, MdPause, MdStop, MdCameraAlt, MdDescription, MdSend,
  MdAccountBalanceWallet, MdPerson, MdCalendarToday, MdOutlineBeachAccess,
  MdShield, MdAssignment, MdFolder, MdEditCalendar, MdAccessTime, MdQueryStats,
  MdPublic, MdReceiptLong
} from "react-icons/md";
import "./MemberHrmDashboard.css";

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

function dateString(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}

export default function MemberHrmDashboard() {
  const user = getUser() || {};
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Work Timer & Real Screen Capture State
  const [isWorking, setIsWorking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [workSeconds, setWorkSeconds] = useState(0);
  const [workMode, setWorkMode] = useState("WFH");
  const [lastCapturedTime, setLastCapturedTime] = useState(null);

  // Screen Capture Consent Checkbox State
  const [consentAgreed, setConsentAgreed] = useState(Boolean(user.screen_consent_agreed));
  const [consentCheckbox, setConsentCheckbox] = useState(false);

  // HR Form State
  const [formCategory, setFormCategory] = useState("WFH Request");
  const [formSubject, setFormSubject] = useState("");
  const [formDetails, setFormDetails] = useState("");
  const [submittingForm, setSubmittingForm] = useState(false);

  // Leave Form State
  const [leaveModal, setLeaveModal] = useState(false);
  const [leaveType, setLeaveType] = useState("Casual");
  const [startDate, setStartDate] = useState(dateString(0));
  const [endDate, setEndDate] = useState(dateString(0));
  const [leaveReason, setLeaveReason] = useState("");

  // Attendance Correction Form State
  const [correctionModal, setCorrectionModal] = useState(false);
  const [corrDate, setCorrDate] = useState(dateString(0));
  const [corrClockIn, setCorrClockIn] = useState("09:00");
  const [corrClockOut, setCorrClockOut] = useState("17:00");
  const [corrReason, setCorrReason] = useState("");

  // Hardware Screen Capture Stream Reference
  const screenStreamRef = useRef(null);
  const captureIntervalRef = useRef(null);

  const notify = (msg, kind = "success") => {
    setToast({ message: msg, kind });
    setTimeout(() => setToast(null), 4000);
  };

  const loadMemberSummary = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiRequest("/hrm/member/summary");
      setData(res);
      if (res.user && res.user.screen_consent_agreed) {
        setConsentAgreed(true);
      }
      if (res.todayAttendance) {
        if (res.todayAttendance.clock_in && !res.todayAttendance.clock_out) {
          setIsWorking(true);
          setIsPaused(res.todayAttendance.status === "Paused");
        } else if (res.todayAttendance.clock_out) {
          setIsWorking(false);
          setIsPaused(false);
        }
      }
    } catch (err) {
      if (!silent) notify("Failed to load member dashboard.", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Real-time 5-second polling sync with server
  useEffect(() => {
    loadMemberSummary();
    const interval = setInterval(() => {
      loadMemberSummary(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [loadMemberSummary]);

  // Live Timer Ticker
  useEffect(() => {
    let timer = null;
    if (isWorking && !isPaused) {
      timer = setInterval(() => {
        setWorkSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isWorking, isPaused]);

  // Submit Screen Consent Agreement
  const handleAgreeConsent = async () => {
    if (!consentCheckbox) {
      notify("Please check the consent checkbox to agree.", "error");
      return;
    }
    try {
      await apiRequest("/hrm/attendance/consent", { method: "POST" });
      setConsentAgreed(true);
      notify("Screen monitoring consent agreement confirmed ✔");
      loadMemberSummary();
    } catch (err) {
      notify(err.message || "Failed to update consent.", "error");
    }
  };

  // Capture Hardware Desktop Display Snapshot & Upload
  const captureAndUploadScreen = useCallback(async () => {
    if (!screenStreamRef.current) return;
    try {
      const track = screenStreamRef.current.getVideoTracks()[0];
      if (!track || track.readyState !== "live") return;

      const imageCapture = new ImageCapture(track);
      const bitmap = await imageCapture.grabFrame();

      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);

      const base64Data = canvas.toDataURL("image/jpeg", 0.7);

      await apiRequest("/hrm/attendance/work-snapshot", {
        method: "POST",
        body: JSON.stringify({
          snapshot_data: base64Data,
          notes: `Auto 1-min Desktop Screen Proof (${workMode} Mode)`,
        }),
      });

      setLastCapturedTime(new Date().toLocaleTimeString());
    } catch (err) {
      console.warn("Screen capture skipped/failed:", err);
    }
  }, [workMode]);

  // Start Work Session
  const handleStartWork = async () => {
    if (!consentAgreed) {
      notify("You must agree to the Screen Capture & Activity Agreement first.", "error");
      return;
    }

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" },
          audio: false,
        });
        screenStreamRef.current = stream;

        stream.getVideoTracks()[0].onended = () => {
          notify("Screen capture stream ended.", "warning");
        };
      }
    } catch (err) {
      notify("Display capture permission required for live session tracking.", "warning");
    }

    try {
      const res = await apiRequest("/hrm/attendance/clock-in", {
        method: "POST",
        body: JSON.stringify({ work_mode: workMode }),
      });
      setIsWorking(true);
      setIsPaused(false);
      notify(res.message || "Work session started successfully! 🚀");
      loadMemberSummary();

      setTimeout(() => {
        captureAndUploadScreen();
      }, 3000);

      captureIntervalRef.current = setInterval(() => {
        captureAndUploadScreen();
      }, 60000);
    } catch (err) {
      notify(err.message || "Failed to start work session.", "error");
    }
  };

  // Pause Work Session
  const handlePauseWork = async () => {
    try {
      const res = await apiRequest("/hrm/attendance/pause-work", { method: "POST" });
      setIsPaused(true);
      notify(res.message || "Work session paused (Break logged) ⏸");
      loadMemberSummary();
    } catch (err) {
      notify(err.message || "Failed to pause work session.", "error");
    }
  };

  // Resume Work Session
  const handleResumeWork = async () => {
    try {
      const res = await apiRequest("/hrm/attendance/resume-work", { method: "POST" });
      setIsPaused(false);
      notify(res.message || "Work session resumed! ▶️");
      loadMemberSummary();
    } catch (err) {
      notify(err.message || "Failed to resume work session.", "error");
    }
  };

  // End Work Session
  const handleEndWork = async () => {
    try {
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      const res = await apiRequest("/hrm/attendance/clock-out", { method: "POST" });
      setIsWorking(false);
      setIsPaused(false);
      notify(res.message || "Work session ended. Great job today! ⏹");
      loadMemberSummary();
    } catch (err) {
      notify(err.message || "Failed to end work session.", "error");
    }
  };

  // Submit HR Form
  const handleSubmitHrForm = async (e) => {
    e.preventDefault();
    if (!formSubject || !formDetails) return;
    setSubmittingForm(true);
    try {
      const res = await apiRequest("/hrm/member/request-form", {
        method: "POST",
        body: JSON.stringify({ category: formCategory, subject: formSubject, details: formDetails }),
      });
      notify(res.message || "Request submitted to HR successfully!");
      setFormSubject("");
      setFormDetails("");
      loadMemberSummary();
    } catch (err) {
      notify(err.message || "Failed to submit request.", "error");
    } finally {
      setSubmittingForm(false);
    }
  };

  // Apply Leave
  const handleApplyLeave = async (e) => {
    e.preventDefault();
    try {
      const res = await apiRequest("/hrm/leaves", {
        method: "POST",
        body: JSON.stringify({ leave_type: leaveType, start_date: startDate, end_date: endDate, reason: leaveReason }),
      });
      notify(res.message || "Leave application submitted!");
      setLeaveModal(false);
      setLeaveReason("");
      loadMemberSummary();
    } catch (err) {
      notify(err.message || "Failed to submit leave.", "error");
    }
  };

  // Generate Timesheet
  const handleGenerateTimesheet = async () => {
    try {
      const res = await apiRequest("/hrm/timesheets/generate", { method: "POST" });
      notify(res.message || "Monthly Timesheet generated & submitted for approval ✔");
      loadMemberSummary();
    } catch (err) {
      notify(err.message || "Failed to generate timesheet.", "error");
    }
  };

  // Submit Attendance Correction
  const handleSubmitCorrection = async (e) => {
    e.preventDefault();
    try {
      const res = await apiRequest("/hrm/attendance/corrections", {
        method: "POST",
        body: JSON.stringify({
          date: corrDate,
          requested_clock_in: corrClockIn,
          requested_clock_out: corrClockOut,
          reason: corrReason,
        }),
      });
      notify(res.message || "Attendance correction request submitted to HR ✔");
      setCorrectionModal(false);
      setCorrReason("");
      loadMemberSummary();
    } catch (err) {
      notify(err.message || "Failed to submit attendance correction.", "error");
    }
  };

  const formatTimer = (totalSecs) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const summary = data?.summary || {};
  const wfh = data?.wfhToday;
  const todayAtt = data?.todayAttendance;
  const salarySlips = data?.salarySlips || [];
  const offer = data?.offerLetter;
  const customDocs = data?.customDocuments || [];
  const cand = data?.candidate;
  const pmsBreakdown = data?.pmsProjectBreakdown || [];
  const holidays = data?.upcomingHolidays || [];

  const wfhStatus = wfh?.status || "None";

  return (
    <div className="m-dashboard-page">
      {toast && <div className={`m-toast m-toast--${toast.kind}`}>{toast.message}</div>}

      {/* HEADER */}
      <div className="m-header">
        <div>
          <div className="m-title-row">
            <h1>Welcome Back, {user.name || "Member"}</h1>
            <span className="m-role-badge"><MdPerson size={14} /> Role: Member (Personal Portal)</span>
          </div>
          <p>Personal HRM 2.0 workspace for Web Clock, attendance corrections, project hours, leave balances, and timesheets.</p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button className="m-btn" style={{ background: "#475569", color: "#fff" }} onClick={() => setCorrectionModal(true)}>
            <MdEditCalendar size={18} /> Attendance Correction
          </button>
          <button className="m-btn m-btn--primary" onClick={() => setLeaveModal(true)}>
            <MdOutlineBeachAccess size={18} /> Apply For Leave
          </button>
        </div>
      </div>

      {/* SCREEN CAPTURE CONSENT AGREEMENT CARD (IF NOT AGREED YET) */}
      {!consentAgreed && (
        <div style={{ background: "#fff", border: "2px solid #0082ff", borderRadius: "12px", padding: "18px", marginBottom: "24px", boxShadow: "0 4px 12px rgba(0,130,255,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#0082ff", marginBottom: "10px" }}>
            <MdShield size={24} />
            <h3 style={{ margin: 0, fontSize: "16px" }}>Screen Capture &amp; Activity Verification Agreement</h3>
          </div>
          <p style={{ fontSize: "13px", color: "#334155", margin: "0 0 12px" }}>
            In accordance with company policy for remote and office work verification, automated screen snapshots and active time tracking are conducted during active work sessions.
          </p>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#0f172a", cursor: "pointer", marginBottom: "14px", fontWeight: "600" }}>
            <input
              type="checkbox"
              checked={consentCheckbox}
              onChange={(e) => setConsentCheckbox(e.target.checked)}
            />
            I agree to real-time screen capture &amp; activity verification during active work hours.
          </label>

          <button className="m-btn m-btn--primary" onClick={handleAgreeConsent} disabled={!consentCheckbox}>
            <MdCheckCircle size={16} /> Confirm Agreement &amp; Enable Web Clock
          </button>
        </div>
      )}

      {/* GLOBAL TIME INTELLIGENCE STAT CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "14px", marginBottom: "24px" }}>
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px" }}>
          <span style={{ fontSize: "11px", color: "#64748b" }}>Today's Worked</span>
          <h3 style={{ margin: "2px 0 0", fontSize: "20px", color: "#0f172a" }}>⏱️ {summary.today_hours || 0}h</h3>
          <span style={{ fontSize: "10.5px", color: "#166534" }}>Active Session</span>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px" }}>
          <span style={{ fontSize: "11px", color: "#64748b" }}>This Week Worked</span>
          <h3 style={{ margin: "2px 0 0", fontSize: "20px", color: "#0f172a" }}>📅 {summary.weekly_hours || 0}h</h3>
          <span style={{ fontSize: "10.5px", color: "#0082ff" }}>Rem: {summary.remaining_weekly_hours || 0}h</span>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px" }}>
          <span style={{ fontSize: "11px", color: "#64748b" }}>Monthly Worked ({summary.month_name})</span>
          <h3 style={{ margin: "2px 0 0", fontSize: "20px", color: "#0082ff" }}>📊 {summary.total_work_hours || 0}h</h3>
          <span style={{ fontSize: "10.5px", color: "#475569" }}>{summary.total_working_days || 22} Working Days</span>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px" }}>
          <span style={{ fontSize: "11px", color: "#64748b" }}>Yearly Total Worked</span>
          <h3 style={{ margin: "2px 0 0", fontSize: "20px", color: "#0f172a" }}>🚀 {summary.yearly_hours || 0}h</h3>
          <span style={{ fontSize: "10.5px", color: "#166534" }}>Annual Accrual</span>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px" }}>
          <span style={{ fontSize: "11px", color: "#64748b" }}>Attendance Rate</span>
          <h3 style={{ margin: "2px 0 0", fontSize: "20px", color: "#166534" }}>🎯 {summary.attendance_percentage || 100}%</h3>
          <span style={{ fontSize: "10.5px", color: "#166534" }}>Score: {summary.productivity_score}%</span>
        </div>
      </div>

      {/* WEB CLOCK WORK SESSION CONTROLS */}
      <div className="m-card" style={{ marginBottom: "24px", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #334155", paddingBottom: "14px", marginBottom: "16px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "18px", color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
              <MdWork size={22} color="#38bdf8" /> Web Clock &amp; Hardware Screen Capture Session
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#94a3b8" }}>
              Shift Policy: Policy A (Fixed 8h Shift, 15m Grace) • Mode: Office / WFH
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ padding: "6px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "700", background: isPaused ? "#f59e0b" : isWorking ? "#10b981" : "#475569", color: "#fff" }}>
              {isPaused ? "⏸ PAUSED (Break)" : isWorking ? "🟢 LIVE WORKING" : "⏹ CLOCKED OUT"}
            </span>
          </div>
        </div>

        {/* REJECTION REASON ALERT IF WFH WAS REJECTED OR REVOKED */}
        {wfh && wfh.status === "Rejected" && (
          <div style={{ background: "#451a1a", border: "1px solid #ef4444", borderRadius: "8px", padding: "12px", marginBottom: "16px", color: "#fca5a5", fontSize: "12.5px" }}>
            ⚠️ <strong>WFH Request Rejected / Revoked by HR:</strong> "{wfh.rejection_reason || "In-office attendance required."}"
            <br /><span style={{ fontSize: "11px", color: "#f87171" }}>Please clock in using Office mode or submit a new WFH request.</span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "20px", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "12px", color: "#94a3b8" }}>Elapsed Active Session Time:</div>
            <div style={{ fontSize: "36px", fontWeight: "800", letterSpacing: "2px", color: "#38bdf8", margin: "4px 0" }}>
              {formatTimer(workSeconds)}
            </div>
            {lastCapturedTime && (
              <div style={{ fontSize: "11px", color: "#10b981", display: "flex", alignItems: "center", gap: "4px" }}>
                <MdCameraAlt size={13} /> Screen Snapshot Synced at {lastCapturedTime}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "flex-end" }}>
            {!isWorking ? (
              <button className="m-btn" style={{ background: "#10b981", color: "#fff", padding: "12px 20px", fontSize: "14px", fontWeight: "700" }} onClick={handleStartWork}>
                <MdPlayArrow size={20} /> ▶️ Start Work Session
              </button>
            ) : (
              <>
                {isPaused ? (
                  <button className="m-btn" style={{ background: "#3b82f6", color: "#fff", padding: "12px 18px", fontWeight: "700" }} onClick={handleResumeWork}>
                    <MdPlayArrow size={18} /> ▶️ Resume Work
                  </button>
                ) : (
                  <button className="m-btn" style={{ background: "#f59e0b", color: "#fff", padding: "12px 18px", fontWeight: "700" }} onClick={handlePauseWork}>
                    <MdPause size={18} /> ⏸ Pause Work
                  </button>
                )}

                <button className="m-btn" style={{ background: "#ef4444", color: "#fff", padding: "12px 20px", fontWeight: "700" }} onClick={handleEndWork}>
                  <MdStop size={20} /> ⏹ End Work Session
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* PMS PROJECT & TASK HOURLY BREAKDOWN CARD */}
      <div className="m-card" style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <h3 className="m-card-title" style={{ margin: 0 }}>
            <MdFolder size={20} color="#0082ff" /> PMS Project &amp; Task Hourly Breakdown (Ali Worked Format)
          </h3>
          <span style={{ fontSize: "12px", color: "#166534", background: "#f0fdf4", padding: "4px 10px", borderRadius: "12px", fontWeight: "600" }}>
            Total PMS Logged: {summary.pms_total_hours || 0} Hours
          </span>
        </div>

        {pmsBreakdown.length === 0 ? (
          <p style={{ fontSize: "13px", color: "#94a3b8" }}>No active PMS task hours logged yet.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px" }}>
            {pmsBreakdown.map((proj) => (
              <div key={proj.project_id || proj.project_name} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "700", color: "#0f172a", marginBottom: "8px" }}>
                  <span>📂 {proj.project_name}</span>
                  <span style={{ color: "#0082ff" }}>{proj.total_hours} hrs</span>
                </div>
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px", fontSize: "11.5px" }}>
                  {proj.tasks.map((t) => (
                    <div key={t.id} style={{ display: "flex", justifyContent: "space-between", margin: "4px 0", color: "#475569" }}>
                      <span>• #{t.id} {t.title}</span>
                      <strong>{t.hours} hrs</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TIMESHEET & UPCOMING HOLIDAYS SECTION */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "24px" }}>
        {/* MONTHLY TIMESHEET CARD */}
        <div className="m-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 className="m-card-title" style={{ margin: 0 }}><MdReceiptLong size={20} color="#0082ff" /> Monthly Timesheet Submission</h3>
            <button className="m-btn m-btn--primary" style={{ fontSize: "12px", padding: "6px 12px" }} onClick={handleGenerateTimesheet}>
              📄 Generate Monthly Timesheet
            </button>
          </div>
          <p style={{ fontSize: "12.5px", color: "#475569", margin: "0 0 10px" }}>
            Generate and submit your monthly aggregated timesheet to HR for payroll approval.
          </p>
          <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}>
            <div>• Current Period: <strong>{summary.month_name}</strong></div>
            <div>• Net Worked Hours: <strong>{summary.total_work_hours || 0} Hours</strong></div>
            <div>• Billable Hours: <strong>{summary.billable_hours || 0} Hours</strong></div>
            <div>• Non-Billable Hours: <strong>{summary.non_billable_hours || 0} Hours</strong></div>
          </div>
        </div>

        {/* UPCOMING PUBLIC HOLIDAYS */}
        <div className="m-card">
          <h3 className="m-card-title" style={{ marginBottom: "12px" }}><MdCalendarToday size={20} color="#0082ff" /> 2026 Company Public Holidays</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {holidays.map((h, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", background: "#f8fafc", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "12px" }}>
                <span><strong>{h.title}</strong></span>
                <span style={{ color: "#0082ff" }}>{h.date} ({h.day})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* HR REQUEST FORM SECTION */}
      <div className="m-card">
        <h3 className="m-card-title"><MdSend size={20} color="#0082ff" /> Submit Request / WFH Form To HR</h3>
        <form onSubmit={handleSubmitHrForm}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "14px", marginBottom: "12px" }}>
            <div>
              <label style={{ fontSize: "12px", color: "#475569", display: "block", marginBottom: "4px" }}>Request Category</label>
              <select className="m-input" value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
                <option value="WFH Request">🏡 Work From Home Request</option>
                <option value="Attendance Correction">🕒 Attendance Correction</option>
                <option value="Equipment Request">💻 Hardware / Asset Request</option>
                <option value="Salary Inquiry">💵 Payroll &amp; Salary Query</option>
                <option value="General HR">📋 General HR Inquiry</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "#475569", display: "block", marginBottom: "4px" }}>Subject</label>
              <input type="text" className="m-input" placeholder="e.g. WFH request for project sprint completion" value={formSubject} onChange={(e) => setFormSubject(e.target.value)} required />
            </div>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={{ fontSize: "12px", color: "#475569", display: "block", marginBottom: "4px" }}>Detailed Reason / Context</label>
            <textarea className="m-input" rows="3" placeholder="State your detailed reasons..." value={formDetails} onChange={(e) => setFormDetails(e.target.value)} required />
          </div>
          <button type="submit" className="m-btn m-btn--primary" disabled={submittingForm}>
            <MdSend size={16} /> Submit HR Request
          </button>
        </form>
      </div>

      {/* APPLY LEAVE MODAL */}
      {leaveModal && (
        <div className="m-modal-overlay" onClick={() => setLeaveModal(false)}>
          <div className="m-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="m-modal-header">
              <h3>Apply For Leave</h3>
              <button style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => setLeaveModal(false)}>✕</button>
            </div>
            <form onSubmit={handleApplyLeave}>
              <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: "#475569" }}>Leave Type</label>
                  <select className="m-input" value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                    <option value="Casual">☕ Casual Leave (12 Days Balance)</option>
                    <option value="Sick">🤒 Sick Leave (10 Days Balance)</option>
                    <option value="Annual">🌴 Paid Annual Leave (14 Days Balance)</option>
                    <option value="Medical">🏥 Medical Leave</option>
                    <option value="Maternity">👶 Maternity / Paternity Leave</option>
                    <option value="Bereavement">🕊️ Bereavement Leave</option>
                    <option value="CompOff">🔄 Comp Off Leave</option>
                    <option value="HalfDay">🌗 Half Day Leave</option>
                    <option value="Hourly">⏰ Hourly Leave</option>
                    <option value="Unpaid">💵 Unpaid Leave / LWP</option>
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "12px", color: "#475569" }}>Start Date</label>
                    <input type="date" className="m-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", color: "#475569" }}>End Date</label>
                    <input type="date" className="m-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: "12px", color: "#475569" }}>Reason</label>
                  <textarea className="m-input" rows="3" value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} required />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "12px 16px", borderTop: "1px solid #f1f5f9" }}>
                <button type="button" className="m-btn" style={{ background: "#f1f5f9", color: "#334155" }} onClick={() => setLeaveModal(false)}>Cancel</button>
                <button type="submit" className="m-btn m-btn--primary">Submit Leave Application</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ATTENDANCE CORRECTION MODAL */}
      {correctionModal && (
        <div className="m-modal-overlay" onClick={() => setCorrectionModal(false)}>
          <div className="m-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="m-modal-header">
              <h3>Attendance Correction &amp; Manual Punch Request</h3>
              <button style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => setCorrectionModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmitCorrection}>
              <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: "#475569" }}>Target Date</label>
                  <input type="date" className="m-input" value={corrDate} onChange={(e) => setCorrDate(e.target.value)} required />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "12px", color: "#475569" }}>Requested Clock In Time</label>
                    <input type="time" className="m-input" value={corrClockIn} onChange={(e) => setCorrClockIn(e.target.value)} required />
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", color: "#475569" }}>Requested Clock Out Time</label>
                    <input type="time" className="m-input" value={corrClockOut} onChange={(e) => setCorrClockOut(e.target.value)} required />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: "12px", color: "#475569" }}>Reason for Correction</label>
                  <textarea className="m-input" rows="3" placeholder="e.g. Forgot to clock in due to network issue." value={corrReason} onChange={(e) => setCorrReason(e.target.value)} required />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "12px 16px", borderTop: "1px solid #f1f5f9" }}>
                <button type="button" className="m-btn" style={{ background: "#f1f5f9", color: "#334155" }} onClick={() => setCorrectionModal(false)}>Cancel</button>
                <button type="submit" className="m-btn m-btn--primary">Submit Correction Request</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
