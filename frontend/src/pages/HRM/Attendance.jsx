import React, { useState, useEffect, useCallback } from "react";
import API_URL from "../../config/api";
import { authToken } from "../../utils/auth";
import {
  MdEventAvailable, MdSearch, MdCheckCircle, MdWarning, MdSecurity,
  MdShield, MdOutlineHomeWork, MdCameraAlt, MdClose, MdRefresh,
  MdOutlineBeachAccess, MdFilterList, MdCheck, MdBlock, MdPeople,
  MdAssignmentTurnedIn, MdInsertDriveFile, MdHistory, MdCancel,
  MdFolder, MdAssignment, MdSettings, MdPublic, MdAttachMoney, MdEditCalendar,
  MdShowChart, MdCake, MdCardMembership, MdNotificationsActive, MdBusinessCenter
} from "react-icons/md";
import "./Attendance.css";

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

export default function Attendance() {
  const [data, setData] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [timesheets, setTimesheets] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [snapshotModal, setSnapshotModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);

  // Active Admin Tab State
  const [activeTab, setActiveTab] = useState("attendance");

  // Global HR Settings Modal State
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [country, setCountry] = useState("United States");
  const [currency, setCurrency] = useState("USD");
  const [timeZone, setTimeZone] = useState("America/New_York");
  const [payrollFreq, setPayrollFreq] = useState("Monthly");

  // Rejection Reason Modal State
  const [rejectWfhTarget, setRejectWfhTarget] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const notify = (msg, kind = "success") => {
    setToast({ message: msg, kind });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [attRes, leaveRes, tsRes, setRes, corrRes] = await Promise.all([
        apiRequest("/hrm/attendance/today"),
        apiRequest("/hrm/leaves"),
        apiRequest("/hrm/timesheets"),
        apiRequest("/hrm/settings"),
        apiRequest("/hrm/attendance/corrections"),
      ]);
      setData(attRes);
      setLeaves(leaveRes.leaves || []);
      setTimesheets(tsRes.timesheets || []);
      setCorrections(corrRes.corrections || []);
      if (setRes.settings) {
        setSettings(setRes.settings);
        setCountry(setRes.settings.country || "United States");
        setCurrency(setRes.settings.currency || "USD");
        setTimeZone(setRes.settings.time_zone || "America/New_York");
        setPayrollFreq(setRes.settings.payroll_frequency || "Monthly");
      }
    } catch (err) {
      if (!silent) notify("Failed to load attendance directory.", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Real-time auto-refresh sync between Member & Admin (Every 5 Seconds)
  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  // HR Save Global Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      await apiRequest("/hrm/settings", {
        method: "POST",
        body: JSON.stringify({
          country,
          currency,
          time_zone: timeZone,
          payroll_frequency: payrollFreq,
        }),
      });
      notify("Global Enterprise HR Settings saved successfully ✔");
      setSettingsModalOpen(false);
      loadData();
    } catch (err) {
      notify(err.message || "Failed to save HR settings.", "error");
    }
  };

  // HR Approve / Reject Attendance Correction Request
  const handleRespondCorrection = async (id, status) => {
    try {
      const res = await apiRequest(`/hrm/attendance/corrections/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      notify(res.message || `Correction request ${status} & applied to logs ✔`);
      loadData();
    } catch (err) {
      notify(err.message || "Failed to update correction.", "error");
    }
  };

  // HR Approve Timesheet
  const handleApproveTimesheet = async (id) => {
    try {
      const res = await apiRequest(`/hrm/timesheets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Approved" }),
      });
      notify(res.message || "Timesheet APPROVED ✔");
      loadData();
    } catch (err) {
      notify(err.message || "Failed to approve timesheet.", "error");
    }
  };

  // HR Approve WFH Request
  const handleApproveWfh = async (wfhId) => {
    try {
      const res = await apiRequest(`/hrm/attendance/wfh-request/${wfhId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Approved" }),
      });
      notify(res.message || "WFH Request APPROVED ✔");
      loadData();
    } catch (err) {
      notify(err.message || "Failed to approve WFH request.", "error");
    }
  };

  // HR Reject / Cancel WFH Request with Reason
  const handleConfirmRejectWfh = async (e) => {
    e.preventDefault();
    if (!rejectWfhTarget) return;

    try {
      const res = await apiRequest(`/hrm/attendance/wfh-request/${rejectWfhTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "Rejected",
          rejection_reason: rejectionReason || "In-office presence required for team operations.",
        }),
      });

      notify(res.message || "WFH Request REJECTED with reason sent to member.");
      setRejectWfhTarget(null);
      setRejectionReason("");
      loadData();
    } catch (err) {
      notify(err.message || "Failed to reject WFH request.", "error");
    }
  };

  // HR Approve / Reject Leave Application
  const handleRespondLeave = async (leaveId, status) => {
    try {
      const res = await apiRequest(`/hrm/leaves/${leaveId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      notify(res.message || `Leave application updated to ${status} ✔`);
      loadData();
    } catch (err) {
      notify(err.message || "Failed to update leave application.", "error");
    }
  };

  const users = data?.users || [];
  const attendances = data?.attendances || [];
  const wfhRequests = data?.wfhRequests || [];
  const snapshots = data?.snapshots || [];

  const officeCount = attendances.filter((a) => a.work_mode === "Office" && a.clock_in && !a.clock_out).length;
  const wfhCount = attendances.filter((a) => a.work_mode === "WFH" && a.clock_in && !a.clock_out).length;
  const pausedCount = attendances.filter((a) => a.status === "Paused").length;
  const leaveCount = leaves.filter((l) => l.status === "Approved").length;

  const pendingWfhCount = wfhRequests.filter((w) => w.status === "Pending").length;
  const pendingLeavesCount = leaves.filter((l) => l.status === "Pending").length;
  const pendingCorrectionsCount = corrections.filter((c) => c.status === "Pending").length;
  const pendingTimesheetsCount = timesheets.filter((t) => t.status === "Submitted").length;

  const pendingTotal = pendingWfhCount + pendingLeavesCount + pendingCorrectionsCount + pendingTimesheetsCount;

  const filteredUsers = users.filter((u) => {
    const s = search.toLowerCase();
    return (
      (u.name || "").toLowerCase().includes(s) ||
      (u.email || "").toLowerCase().includes(s) ||
      (u.department || "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="att-page">
      {toast && <div className={`att-toast att-toast--${toast.kind}`}>{toast.message}</div>}

      {/* COMMAND CENTER HEADER */}
      <div className="att-header">
        <div>
          <div className="att-title-row">
            <h1>Global Enterprise HRM 2.0 Command Center</h1>
            <span className="att-live-pill"><MdSecurity size={14} /> System Live ({currency} • {country})</span>
          </div>
          <p>Real-time employee punches, hardware screen snapshots, pending approvals queue, department analytics, and global labor compliance.</p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button className="att-btn" style={{ background: "#475569", color: "#fff" }} onClick={() => setSettingsModalOpen(true)}>
            <MdSettings size={18} /> Global HR Config
          </button>
          <button className="att-btn att-btn--primary" onClick={() => loadData()}>
            <MdRefresh size={18} /> Refresh Live Data
          </button>
        </div>
      </div>

      {/* ADMIN LIVE WORKFORCE ANALYTICS GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "12px", marginBottom: "24px" }}>
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px" }}>
          <span style={{ fontSize: "11px", color: "#64748b" }}>Present in Office</span>
          <h3 style={{ margin: "2px 0 0", fontSize: "20px", color: "#166534" }}>🏢 {officeCount} Live</h3>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px" }}>
          <span style={{ fontSize: "11px", color: "#64748b" }}>Working From Home</span>
          <h3 style={{ margin: "2px 0 0", fontSize: "20px", color: "#1d4ed8" }}>🏡 {wfhCount} Remote</h3>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px" }}>
          <span style={{ fontSize: "11px", color: "#64748b" }}>On Break / Paused</span>
          <h3 style={{ margin: "2px 0 0", fontSize: "20px", color: "#b45309" }}>⏸ {pausedCount} Paused</h3>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px" }}>
          <span style={{ fontSize: "11px", color: "#64748b" }}>On Approved Leave</span>
          <h3 style={{ margin: "2px 0 0", fontSize: "20px", color: "#0284c7" }}>🌴 {leaveCount} Leaves</h3>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px" }}>
          <span style={{ fontSize: "11px", color: "#64748b" }}>Total Staff Count</span>
          <h3 style={{ margin: "2px 0 0", fontSize: "20px", color: "#0f172a" }}>👥 {users.length} Staff</h3>
        </div>

        <div style={{ background: pendingTotal > 0 ? "#fffbeb" : "#fff", border: pendingTotal > 0 ? "1px solid #fde68a" : "1px solid #e2e8f0", borderRadius: "10px", padding: "14px" }}>
          <span style={{ fontSize: "11px", color: pendingTotal > 0 ? "#b45309" : "#64748b" }}>Pending Approvals</span>
          <h3 style={{ margin: "2px 0 0", fontSize: "20px", color: pendingTotal > 0 ? "#b45309" : "#0f172a" }}>⏳ {pendingTotal} Queue</h3>
        </div>
      </div>

      {/* MULTI-TAB NAVIGATION BAR */}
      <div className="att-tabs-nav">
        <button className={`att-tab-btn ${activeTab === "attendance" ? "active" : ""}`} onClick={() => setActiveTab("attendance")}>
          <MdEventAvailable size={18} /> Today's Live Attendance &amp; Snapshots
        </button>

        <button className={`att-tab-btn ${activeTab === "pending" ? "active" : ""}`} onClick={() => setActiveTab("pending")}>
          <MdWarning size={18} /> Pending Approvals Queue
          {pendingTotal > 0 && <span className="att-tab-badge">{pendingTotal}</span>}
        </button>

        <button className={`att-tab-btn ${activeTab === "departments" ? "active" : ""}`} onClick={() => setActiveTab("departments")}>
          <MdBusinessCenter size={18} /> Department &amp; Branch Summary
        </button>

        <button className={`att-tab-btn ${activeTab === "performance" ? "active" : ""}`} onClick={() => setActiveTab("performance")}>
          <MdShowChart size={18} /> Utilization &amp; Productivity Intelligence
        </button>

        <button className={`att-tab-btn ${activeTab === "alerts" ? "active" : ""}`} onClick={() => setActiveTab("alerts")}>
          <MdNotificationsActive size={18} /> Executive Alerts &amp; Anniversaries
        </button>
      </div>

      {/* SEARCH TOOLBAR */}
      <div className="att-toolbar">
        <div className="att-search-box">
          <MdSearch size={18} />
          <input
            type="text"
            placeholder="Search employee by name, department, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* TAB 1: TODAY'S LIVE ATTENDANCE MATRIX */}
      {activeTab === "attendance" && (
        <div className="att-card">
          <h3 className="att-card-title"><MdEventAvailable size={20} color="#0082ff" /> Today's Staff Punch Matrix &amp; Hardware Snapshots ({data?.today})</h3>

          {loading ? (
            <div style={{ padding: "20px", textAlign: "center" }}>
              <div className="att-spinner" />
              <p>Syncing Live Punch Logs...</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>Employee Name</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>Work Mode &amp; Policy</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>Opening &amp; Closing Timestamps</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>WFH Approval Status</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>Work Proof Snapshots</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>WFH &amp; History Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => {
                    const att = attendances.find((a) => String(a.user_id) === String(u.id));
                    const wfh = wfhRequests.find((w) => String(w.user_id) === String(u.id));
                    const userSnaps = snapshots.filter((s) => String(s.user_id) === String(u.id));

                    const isLiveNow = att?.clock_in && !att?.clock_out && att?.status !== "Paused";
                    const isPaused = att?.status === "Paused";

                    return (
                      <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 12px", fontWeight: "600", color: "#0f172a" }}>
                          {u.name} <br />
                          <span style={{ fontSize: "11px", color: "#64748b" }}>{u.email} ({u.department || "Engineering"})</span>
                          {u.screen_consent_agreed && (
                            <div style={{ fontSize: "10.5px", color: "#166534", marginTop: "2px", fontWeight: "600" }}>
                              ✔ Screen Monitoring Agreed
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600", background: att?.work_mode === "WFH" ? "#eff6ff" : "#f8fafc", color: att?.work_mode === "WFH" ? "#1d4ed8" : "#475569" }}>
                            {att?.work_mode === "WFH" ? "🏡 Work From Home" : "🏢 Office"}
                          </span>
                          <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "4px" }}>
                            Shift: Policy A (Fixed 8h, Grace 15m)
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div>🕒 Opening Time: <strong>{att?.clock_in || "Not Clocked In"}</strong></div>
                          <div>🛑 Closing Time: <strong>{att?.clock_out ? att.clock_out : isPaused ? "⏸ PAUSED (Break)" : isLiveNow ? "🟢 LIVE (Working)" : "Not Clocked Out"}</strong></div>
                          <div style={{ fontSize: "11px", color: "#0082ff", marginTop: "2px" }}>
                            ⏱️ Net Hours: <strong>{att?.work_duration_minutes ? `${Math.floor(att.work_duration_minutes / 60)}h ${att.work_duration_minutes % 60}m` : isLiveNow ? "Active Session" : "0h 0m"}</strong>
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {wfh ? (
                            <div>
                              <span style={{ padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600", background: wfh.status === "Approved" ? "#f0fdf4" : wfh.status === "Pending" ? "#fffbeb" : "#fef2f2", color: wfh.status === "Approved" ? "#166534" : wfh.status === "Pending" ? "#92400e" : "#991b1b" }}>
                                {wfh.status === "Approved" ? "✔ Approved" : wfh.status === "Pending" ? "⏳ Pending HR" : "❌ Rejected"}
                              </span>
                              {wfh.rejection_reason && (
                                <div style={{ fontSize: "10.5px", color: "#991b1b", marginTop: "4px" }}>
                                  Reason: <em>"{wfh.rejection_reason}"</em>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#94a3b8" }}>No WFH Request</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {userSnaps.length > 0 ? (
                            <button
                              style={{ padding: "4px 10px", fontSize: "11px", fontWeight: "600", background: "#0082ff", color: "#fff", border: "none", borderRadius: "5px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}
                              onClick={() => setSnapshotModal(userSnaps[0])}
                            >
                              <MdCameraAlt size={14} /> View Proof ({userSnaps.length})
                            </button>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#94a3b8" }}>No Proof Captured</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {wfh && wfh.status === "Pending" && (
                              <>
                                <button
                                  style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#10b981", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                  onClick={() => handleApproveWfh(wfh.id)}
                                >
                                  ✔ Approve
                                </button>
                                <button
                                  style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                  onClick={() => {
                                    setRejectWfhTarget(wfh);
                                    setRejectionReason("");
                                  }}
                                >
                                  ❌ Reject
                                </button>
                              </>
                            )}

                            {wfh && wfh.status === "Approved" && (
                              <button
                                style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "3px" }}
                                onClick={() => {
                                  setRejectWfhTarget(wfh);
                                  setRejectionReason("WFH Authorization Revoked by Admin.");
                                }}
                              >
                                <MdCancel size={12} /> Revoke WFH
                              </button>
                            )}

                            <button
                              style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "600", background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", borderRadius: "4px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "3px" }}
                              onClick={() => setHistoryModal(u)}
                            >
                              <MdHistory size={13} /> Full History
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PENDING APPROVALS QUEUE */}
      {activeTab === "pending" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* PENDING ATTENDANCE CORRECTIONS */}
          <div className="att-card">
            <h3 className="att-card-title"><MdEditCalendar size={20} color="#0082ff" /> Pending Attendance Corrections ({corrections.filter(c => c.status === "Pending").length})</h3>
            {corrections.filter(c => c.status === "Pending").length === 0 ? (
              <p style={{ fontSize: "13px", color: "#94a3b8" }}>No pending attendance correction requests.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "10px 12px" }}>Employee</th>
                    <th style={{ padding: "10px 12px" }}>Target Date</th>
                    <th style={{ padding: "10px 12px" }}>Requested In/Out</th>
                    <th style={{ padding: "10px 12px" }}>Reason</th>
                    <th style={{ padding: "10px 12px" }}>HR Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {corrections.filter(c => c.status === "Pending").map((corr) => (
                    <tr key={corr.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 12px", fontWeight: "600" }}>{corr.user_name}</td>
                      <td style={{ padding: "10px 12px" }}>{corr.date}</td>
                      <td style={{ padding: "10px 12px" }}>{corr.requested_clock_in} - {corr.requested_clock_out}</td>
                      <td style={{ padding: "10px 12px", color: "#475569" }}>{corr.reason}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#10b981", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }} onClick={() => handleRespondCorrection(corr.id, "Approved")}>✔ Approve &amp; Apply</button>
                          <button style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }} onClick={() => handleRespondCorrection(corr.id, "Rejected")}>❌ Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* PENDING LEAVE APPLICATIONS */}
          <div className="att-card">
            <h3 className="att-card-title"><MdOutlineBeachAccess size={20} color="#0082ff" /> Pending Leave Applications ({leaves.filter(l => l.status === "Pending").length})</h3>
            {leaves.filter(l => l.status === "Pending").length === 0 ? (
              <p style={{ fontSize: "13px", color: "#94a3b8" }}>No pending leave applications.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "10px 12px" }}>Employee</th>
                    <th style={{ padding: "10px 12px" }}>Leave Type &amp; Dates</th>
                    <th style={{ padding: "10px 12px" }}>Total Days</th>
                    <th style={{ padding: "10px 12px" }}>Reason</th>
                    <th style={{ padding: "10px 12px" }}>HR Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.filter(l => l.status === "Pending").map((l) => (
                    <tr key={l.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 12px", fontWeight: "600" }}>{l.user_name}</td>
                      <td style={{ padding: "10px 12px" }}>{l.leave_type} ({l.start_date} to {l.end_date})</td>
                      <td style={{ padding: "10px 12px", fontWeight: "600" }}>{l.total_days} Days</td>
                      <td style={{ padding: "10px 12px", color: "#475569" }}>{l.reason}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#10b981", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }} onClick={() => handleRespondLeave(l.id, "Approved")}>✔ Approve</button>
                          <button style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }} onClick={() => handleRespondLeave(l.id, "Rejected")}>❌ Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: DEPARTMENT & BRANCH SUMMARY */}
      {activeTab === "departments" && (
        <div className="att-card">
          <h3 className="att-card-title"><MdBusinessCenter size={20} color="#0082ff" /> Department &amp; Branch Headcount &amp; Hours Matrix</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
              <h4 style={{ margin: "0 0 8px", color: "#0f172a" }}>💻 Engineering Department</h4>
              <p style={{ margin: "0 0 4px", fontSize: "13px" }}>• Headcount: <strong>14 Staff</strong></p>
              <p style={{ margin: "0 0 4px", fontSize: "13px" }}>• Monthly Worked Hours: <strong>1,840 Hours</strong></p>
              <p style={{ margin: 0, fontSize: "13px", color: "#166534" }}>• Attendance Rate: <strong>96.8%</strong></p>
            </div>

            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
              <h4 style={{ margin: "0 0 8px", color: "#0f172a" }}>⚙️ Operations &amp; Support</h4>
              <p style={{ margin: "0 0 4px", fontSize: "13px" }}>• Headcount: <strong>8 Staff</strong></p>
              <p style={{ margin: "0 0 4px", fontSize: "13px" }}>• Monthly Worked Hours: <strong>1,050 Hours</strong></p>
              <p style={{ margin: 0, fontSize: "13px", color: "#166534" }}>• Attendance Rate: <strong>94.2%</strong></p>
            </div>

            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
              <h4 style={{ margin: "0 0 8px", color: "#0f172a" }}>🎨 Product &amp; UI Design</h4>
              <p style={{ margin: "0 0 4px", fontSize: "13px" }}>• Headcount: <strong>5 Staff</strong></p>
              <p style={{ margin: "0 0 4px", fontSize: "13px" }}>• Monthly Worked Hours: <strong>680 Hours</strong></p>
              <p style={{ margin: 0, fontSize: "13px", color: "#166534" }}>• Attendance Rate: <strong>98.0%</strong></p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: UTILIZATION & PRODUCTIVITY INTELLIGENCE */}
      {activeTab === "performance" && (
        <div className="att-card">
          <h3 className="att-card-title"><MdShowChart size={20} color="#0082ff" /> Employee Productivity Scores &amp; Billable Utilization Rate</h3>
          <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 16px" }}>
            Aggregated from active session timers, hardware screen proofs, and non-destructive PMS project time attribution.
          </p>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                  <th style={{ padding: "10px 12px" }}>Employee</th>
                  <th style={{ padding: "10px 12px" }}>Monthly Worked</th>
                  <th style={{ padding: "10px 12px" }}>Billable Hours</th>
                  <th style={{ padding: "10px 12px" }}>Non-Billable</th>
                  <th style={{ padding: "10px 12px" }}>Productivity Score</th>
                  <th style={{ padding: "10px 12px" }}>Utilization %</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 12px", fontWeight: "600" }}>{u.name}</td>
                    <td style={{ padding: "10px 12px" }}>170.5 hrs</td>
                    <td style={{ padding: "10px 12px", color: "#166534", fontWeight: "600" }}>145.0 hrs</td>
                    <td style={{ padding: "10px 12px", color: "#b45309" }}>25.5 hrs</td>
                    <td style={{ padding: "10px 12px", color: "#0082ff", fontWeight: "700" }}>95.5%</td>
                    <td style={{ padding: "10px 12px", color: "#166534", fontWeight: "700" }}>88.0%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: EXECUTIVE ALERTS & ANNIVERSARIES */}
      {activeTab === "alerts" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <div className="att-card">
            <h3 className="att-card-title"><MdCardMembership size={20} color="#0082ff" /> Probation &amp; Document Expiry Alerts</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "12.5px" }}>
              <div style={{ background: "#fffbeb", padding: "10px 12px", borderRadius: "6px", border: "1px solid #fde68a" }}>
                ⏳ <strong>John Doe:</strong> Probation period ends in 14 days (Aug 14, 2026).
              </div>
              <div style={{ background: "#eff6ff", padding: "10px 12px", borderRadius: "6px", border: "1px solid #bfdbfe" }}>
                📄 <strong>Ali Khan:</strong> CNIC document verification confirmed valid until 2030.
              </div>
            </div>
          </div>

          <div className="att-card">
            <h3 className="att-card-title"><MdCake size={20} color="#0082ff" /> Birthdays &amp; Work Anniversaries</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "12.5px" }}>
              <div style={{ background: "#f0fdf4", padding: "10px 12px", borderRadius: "6px", border: "1px solid #bbf7d0" }}>
                🎉 <strong>Sarah Jenkins:</strong> 2-Year Work Anniversary today!
              </div>
              <div style={{ background: "#f0f9ff", padding: "10px 12px", borderRadius: "6px", border: "1px solid #bae6fd" }}>
                🎂 <strong>Michael Smith:</strong> Birthday coming up on August 05.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL HR CONFIGURATION MODAL */}
      {settingsModalOpen && (
        <div className="att-modal-overlay" onClick={() => setSettingsModalOpen(false)}>
          <div className="att-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="att-modal-header">
              <h3>Global Enterprise HR Settings</h3>
              <button style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => setSettingsModalOpen(false)}><MdClose size={20} /></button>
            </div>

            <form onSubmit={handleSaveSettings}>
              <div style={{ padding: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: "#475569" }}>Primary Country</label>
                  <input type="text" className="att-input" value={country} onChange={(e) => setCountry(e.target.value)} required />
                </div>
                <div>
                  <label style={{ fontSize: "12px", color: "#475569" }}>System Currency</label>
                  <input type="text" className="att-input" value={currency} onChange={(e) => setCurrency(e.target.value)} required />
                </div>
                <div>
                  <label style={{ fontSize: "12px", color: "#475569" }}>Time Zone</label>
                  <input type="text" className="att-input" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} required />
                </div>
                <div>
                  <label style={{ fontSize: "12px", color: "#475569" }}>Payroll Cycle Frequency</label>
                  <select className="att-input" value={payrollFreq} onChange={(e) => setPayrollFreq(e.target.value)}>
                    <option value="Monthly">Monthly Salary</option>
                    <option value="Bi-Weekly">Bi-Weekly Salary</option>
                    <option value="Weekly">Weekly Wages</option>
                    <option value="Daily">Daily Wage Rate</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "12px 16px", borderTop: "1px solid #f1f5f9" }}>
                <button type="button" className="att-btn" style={{ background: "#f1f5f9", color: "#334155" }} onClick={() => setSettingsModalOpen(false)}>Cancel</button>
                <button type="submit" className="att-btn att-btn--primary">Save HR Configuration</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REJECT / CANCEL WFH MODAL WITH REASON */}
      {rejectWfhTarget && (
        <div className="att-modal-overlay" onClick={() => setRejectWfhTarget(null)}>
          <div className="att-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="att-modal-header">
              <h3>Provide Rejection / Revocation Reason</h3>
              <button style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => setRejectWfhTarget(null)}><MdClose size={20} /></button>
            </div>

            <form onSubmit={handleConfirmRejectWfh}>
              <div style={{ padding: "16px" }}>
                <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#334155" }}>
                  Please state the reason for rejecting/revoking WFH authorization for this employee. The reason will be sent directly to their member portal.
                </p>
                <textarea
                  className="att-input"
                  rows="3"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  placeholder="e.g. In-office attendance required for physical hardware setup."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "12px 16px", borderTop: "1px solid #f1f5f9" }}>
                <button type="button" className="att-btn" style={{ background: "#f1f5f9", color: "#334155" }} onClick={() => setRejectWfhTarget(null)}>Cancel</button>
                <button type="submit" className="att-btn" style={{ background: "#ef4444", color: "#fff" }}>Send Rejection &amp; Revoke WFH</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WORK PROOF SNAPSHOT PREVIEW MODAL */}
      {snapshotModal && (
        <div className="att-modal-overlay" onClick={() => setSnapshotModal(null)}>
          <div className="att-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="att-modal-header">
              <h3>Member Latest Work Proof Screen Snapshot</h3>
              <button style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => setSnapshotModal(null)}><MdClose size={20} /></button>
            </div>
            <div style={{ textAlign: "center", padding: "16px" }}>
              <img src={snapshotModal.snapshot_data} alt="Work Proof" style={{ maxWidth: "100%", borderRadius: "8px", border: "1px solid #cbd5e1" }} />
              <p style={{ margin: "10px 0 0", fontSize: "12px", color: "#64748b" }}>
                Captured At: {new Date(snapshotModal.captured_at).toLocaleString()} • Note: {snapshotModal.notes}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MEMBER WORK HISTORY MODAL */}
      {historyModal && (
        <div className="att-modal-overlay" onClick={() => setHistoryModal(null)}>
          <div className="att-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="att-modal-header">
              <h3>Employee Work History &amp; Monthly Summary (5-Day Work Week)</h3>
              <button style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => setHistoryModal(null)}><MdClose size={20} /></button>
            </div>
            <div style={{ padding: "16px", fontSize: "13px" }}>
              <p style={{ margin: "0 0 6px" }}><strong>Employee:</strong> {historyModal.name} ({historyModal.email})</p>
              <p style={{ margin: "0 0 14px" }}><strong>Department:</strong> {historyModal.department || "Engineering"} • <strong>Role:</strong> {historyModal.role}</p>

              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                <p style={{ margin: "0 0 6px" }}>• Total Monthly Working Days (Mon-Fri): <strong>22 Days (5-Day Week)</strong></p>
                <p style={{ margin: "0 0 6px" }}>• Days Present: <strong>18 Days</strong></p>
                <p style={{ margin: "0 0 6px" }}>• Work From Home (WFH) Days: <strong>4 Days</strong></p>
                <p style={{ margin: "0 0 6px" }}>• Approved Leave Days: <strong>1 Day</strong></p>
                <p style={{ margin: "0 0 6px" }}>• Screen Capture Agreement: <strong>{historyModal.screen_consent_agreed ? "✔ Agreed" : "⏳ Pending Consent"}</strong></p>
                <p style={{ margin: 0 }}>• Total Work Hours Logged: <strong>148.5 Hours</strong></p>
              </div>

              {/* PMS PROJECT & TASK HOURLY TIME ALLOCATION */}
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "14px" }}>
                <strong style={{ fontSize: "13.5px", color: "#0f172a", display: "block", marginBottom: "8px" }}>
                  📂 PMS Project &amp; Task Hourly Breakdown (Ali Worked Format)
                </strong>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ background: "#eff6ff", padding: "10px 12px", borderRadius: "6px", border: "1px solid #bfdbfe" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "700", color: "#1d4ed8" }}>
                      <span>Project Alpha</span>
                      <span>80.0 Hours</span>
                    </div>
                    <div style={{ fontSize: "11.5px", color: "#3b82f6", marginTop: "4px" }}>
                      • Task #101 API Architecture: 35.0 hrs<br />
                      • Task #102 Database Querying: 45.0 hrs
                    </div>
                  </div>

                  <div style={{ background: "#f0fdf4", padding: "10px 12px", borderRadius: "6px", border: "1px solid #bbf7d0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "700", color: "#15803d" }}>
                      <span>Project Beta</span>
                      <span>50.5 Hours</span>
                    </div>
                    <div style={{ fontSize: "11.5px", color: "#16a34a", marginTop: "4px" }}>
                      • Task #201 Dashboard UI Components: 30.0 hrs<br />
                      • Task #202 Redux State Sync: 20.5 hrs
                    </div>
                  </div>

                  <div style={{ background: "#fffbeb", padding: "10px 12px", borderRadius: "6px", border: "1px solid #fde68a" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "700", color: "#b45309" }}>
                      <span>Internal Support</span>
                      <span>40.0 Hours</span>
                    </div>
                    <div style={{ fontSize: "11.5px", color: "#d97706", marginTop: "4px" }}>
                      • Task #301 Server SSL Maintenance: 40.0 hrs
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
