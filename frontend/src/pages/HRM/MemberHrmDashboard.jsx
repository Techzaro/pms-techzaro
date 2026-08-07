import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import API_URL from "../../config/api";
import { authToken, getUser } from "../../utils/auth";
import Breadcrumb from "../../components/Breadcrumb";
import {
  Calendar,
  Clock,
  UserCheck,
  UserX,
  AlertTriangle,
  CheckCircle2,
  Building2,
  Laptop,
  RefreshCw,
  Sliders,
  Plus,
  Search,
  Filter,
  ShieldAlert,
  FileText,
  X,
  Play,
  Pause,
  Users,
  Briefcase,
  Bell,
  Eye,
  Trash2,
  Edit3,
  Gift,
  Award,
  Check,
  MapPin,
  Camera,
  Layers,
  LayoutGrid,
  CreditCard,
  List,
  ChevronRight,
  TrendingUp,
  Send,
  Info,
} from "lucide-react";
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

function formatTimer(totalSecs) {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDetailedTime(totalSecs) {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${h} Hours, ${m} Minutes, ${s} Seconds`;
}

export default function MemberHrmDashboard() {
  const user = getUser() || {};
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const currentTabFromUrl = searchParams.get("tab") || "overview";
  const [activeTab, setActiveTab] = useState(currentTabFromUrl);

  useEffect(() => {
    const tabFromUrl = searchParams.get("tab");
    if (tabFromUrl) {
      setActiveTab(tabFromUrl);
      if (tabFromUrl === "advance") {
        setClaimsSubTab("advance");
      } else if (tabFromUrl === "reimbursement") {
        setClaimsSubTab("expense");
      }
    } else {
      setActiveTab("overview");
    }
  }, [searchParams]);

  const handleTabChange = (tabName) => {
    setActiveTab(tabName);
    setSearchParams({ tab: tabName });
  };

  // Web Clock & Active Duty Session State
  const [isWorking, setIsWorking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [workMode, setWorkMode] = useState("Office");
  const [workSeconds, setWorkSeconds] = useState(0);
  const [lastCapturedTime, setLastCapturedTime] = useState(null);

  // Consent & Real-time Verification State
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [pendingScreenReq, setPendingScreenReq] = useState(null);

  // Track responded/dismissed screen request IDs to prevent polling popups
  const dismissedScreenReqIdsRef = useRef(new Set());

  // Rejection with Reason Modal State
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReasonText, setRejectReasonText] = useState("");

  // Dedicated WFH Request Form State
  const [wfhDate, setWfhDate] = useState(dateToday());
  const [wfhReason, setWfhReason] = useState("");
  const [submittingWfh, setSubmittingWfh] = useState(false);

  // HR General Request Form State
  const [requestCategory, setRequestCategory] = useState("General Support");
  const [requestSubject, setRequestSubject] = useState("");
  const [requestDetails, setRequestDetails] = useState("");
  const [submittingReq, setSubmittingReq] = useState(false);
  const [appTypes, setAppTypes] = useState([]);
  const [editingReqId, setEditingReqId] = useState(null);
  const [dynamicFormState, setDynamicFormState] = useState({});
  const [formStep, setFormStep] = useState(1);

  // Real-Time Leave Application Form State
  const [leaveType, setLeaveType] = useState("Casual Leave");
  const [leaveStartDate, setLeaveStartDate] = useState(dateToday());
  const [leaveEndDate, setLeaveEndDate] = useState(dateToday());
  const [leaveReason, setLeaveReason] = useState("");
  const [submittingLeave, setSubmittingLeave] = useState(false);

  // Attendance Correction Form State
  const [corrDate, setCorrDate] = useState(dateToday());
  const [corrIn, setCorrIn] = useState("09:00");
  const [corrOut, setCorrOut] = useState("17:00");
  const [corrReason, setCorrReason] = useState("");
  const [submittingCorr, setSubmittingCorr] = useState(false);

  // Financial Claims Sub-tab State (Advance Salary vs Expense Reimbursement)
  const [claimsSubTab, setClaimsSubTab] = useState("advance");

  // Advance Salary & Emergency Loan State
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceDeductionMonth, setAdvanceDeductionMonth] = useState("Next Month Payroll");
  const [advanceReason, setAdvanceReason] = useState("");
  const [submittingAdvance, setSubmittingAdvance] = useState(false);

  // Expense Reimbursement Claim State
  const [expenseCategory, setExpenseCategory] = useState("Travel & Fuel");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(dateToday());
  const [expenseNotes, setExpenseNotes] = useState("");
  const [submittingExpense, setSubmittingExpense] = useState(false);

  // Corporate Policy Warning State
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [selectedWarning, setSelectedWarning] = useState(null);
  const [removalCategory, setRemovalCategory] = useState("Traffic & Transit Emergency");
  const [removalDetails, setRemovalDetails] = useState("");
  const [submittingWarningReason, setSubmittingWarningReason] = useState(false);

  const handleOpenWarningRemovalModal = (warning) => {
    setSelectedWarning(warning);
    setRemovalDetails(warning.removal_reason ? warning.removal_reason.replace(/^\[.*?\]:\s*/, "") : "");
    setWarningModalOpen(true);
  };

  const handleConfirmSubmitWarningReason = async (e) => {
    e.preventDefault();
    if (!selectedWarning || !removalDetails) return;
    setSubmittingWarningReason(true);
    try {
      const fullReason = `[${removalCategory}]: ${removalDetails}`;
      const res = await apiRequest(`/hrm/warnings/${selectedWarning.id}/submit-reason`, {
        method: "POST",
        body: JSON.stringify({ reason: fullReason }),
      });
      notify(res.message || "Online warning removal reason submitted to Admin for review ✔");
      setWarningModalOpen(false);
      loadMemberSummary(false);
    } catch (err) {
      notify(err.message || "Failed to submit warning removal reason.", "error");
    } finally {
      setSubmittingWarningReason(false);
    }
  };

  // Refs for video screen stream & auto 1-min snapshot loop
  const screenStreamRef = useRef(null);
  const captureIntervalRef = useRef(null);

  function notify(msg, kind = "success") {
    setToast({ message: msg, kind });
    setTimeout(() => setToast(null), 4000);
  }

  function dateToday() {
    return new Date().toISOString().split("T")[0];
  }

  const loadMemberSummary = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [summaryRes, screenReqRes, appTypesRes] = await Promise.all([
        apiRequest("/hrm/member/summary"),
        apiRequest("/hrm/screen-requests/active").catch(() => ({ pending_request: null })),
        apiRequest("/hrm/application-types").catch(() => ({ data: [] })),
      ]);

      setData(summaryRes);
      if (appTypesRes && appTypesRes.data) {
        setAppTypes(appTypesRes.data);
      }

      if (
        screenReqRes.pending_request &&
        !dismissedScreenReqIdsRef.current.has(screenReqRes.pending_request.id)
      ) {
        setPendingScreenReq(screenReqRes.pending_request);
      } else {
        setPendingScreenReq(null);
      }

      if (summaryRes.user && summaryRes.user.screen_consent_agreed !== undefined) {
        setConsentAgreed(Boolean(summaryRes.user.screen_consent_agreed));
      }

      if (summaryRes.today_work_seconds !== undefined && summaryRes.today_work_seconds !== null) {
        setWorkSeconds(summaryRes.today_work_seconds);
      }

      if (summaryRes.todayAttendance) {
        if (summaryRes.todayAttendance.clock_in && !summaryRes.todayAttendance.clock_out) {
          setIsWorking(true);
          setIsPaused(summaryRes.todayAttendance.status === "Paused");
        } else if (summaryRes.todayAttendance.clock_out) {
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

  // Real-time 5-second polling sync
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

  // Enable Screen Consent Agreement
  const handleAgreeConsent = async () => {
    try {
      await apiRequest("/hrm/attendance/consent", {
        method: "POST",
        body: JSON.stringify({ agreed: true }),
      });
      setConsentAgreed(true);
      notify("Screen sharing & monitoring policy ENABLED ✔");
      loadMemberSummary();
    } catch (err) {
      notify(err.message || "Failed to update consent policy.", "error");
    }
  };

  // Disable Screen Consent Agreement (Privacy Mode)
  const handleDisableConsent = async () => {
    try {
      await apiRequest("/hrm/attendance/consent", {
        method: "POST",
        body: JSON.stringify({ agreed: false }),
      });
      setConsentAgreed(false);
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      notify("Screen sharing policy DISABLED (Privacy Mode active) ✔", "warning");
      loadMemberSummary();
    } catch (err) {
      notify(err.message || "Failed to update consent policy.", "error");
    }
  };

  // Universal HTML5 Screen Snapshot Function (Works across Chrome, Firefox, Edge, Safari)
  const captureFrameFromStream = async (stream, notes = "Desktop Work Proof") => {
    if (!stream) return false;
    try {
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState !== "live") return false;

      const video = document.createElement("video");
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;

      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.play().catch(() => {});
          setTimeout(resolve, 300);
        };
        setTimeout(resolve, 600);
      });

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const base64Data = canvas.toDataURL("image/jpeg", 0.7);

      await apiRequest("/hrm/attendance/work-snapshot", {
        method: "POST",
        body: JSON.stringify({
          snapshot_data: base64Data,
          notes: notes,
        }),
      });

      setLastCapturedTime(new Date().toLocaleTimeString());
      return true;
    } catch (err) {
      console.warn("Screen frame capture error:", err);
      return false;
    }
  };

  // Capture Hardware Desktop Display Snapshot & Upload
  const captureAndUploadScreen = useCallback(async (customNotes = null) => {
    if (screenStreamRef.current) {
      return await captureFrameFromStream(screenStreamRef.current, customNotes || `Auto 1-min Desktop Screen Proof (${workMode} Mode)`);
    } else {
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        try {
          const tempStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: "always" },
            audio: false,
          });
          if (tempStream) {
            screenStreamRef.current = tempStream;
            const success = await captureFrameFromStream(tempStream, customNotes || "Admin Live Screen Verification");
            return success;
          }
        } catch (e) {
          console.warn("Display media prompt skipped by user:", e);
        }
      }
    }
    return false;
  }, [workMode]);

  // Accept Real-Time Admin Screen Verification Request
  const handleAcceptScreenReq = async () => {
    if (!pendingScreenReq) return;
    const reqId = pendingScreenReq.id;
    dismissedScreenReqIdsRef.current.add(reqId);
    setPendingScreenReq(null);

    try {
      await apiRequest(`/hrm/screen-requests/${reqId}/respond`, {
        method: "POST",
        body: JSON.stringify({ status: "Accepted" }),
      });
      notify("Screen verification request accepted ✔");
      await captureAndUploadScreen("Admin Live Screen Verification");
    } catch (err) {
      notify(err.message || "Failed to accept screen request.", "error");
    }
  };

  // Open Recline Reason Modal
  const handleOpenRejectModal = () => {
    setRejectReasonText("");
    setRejectModalOpen(true);
  };

  // Confirm Rejection with Reason
  const handleConfirmRejectScreenReq = async (e) => {
    e.preventDefault();
    if (!pendingScreenReq) return;
    const reqId = pendingScreenReq.id;
    dismissedScreenReqIdsRef.current.add(reqId);
    setPendingScreenReq(null);
    setRejectModalOpen(false);

    try {
      await apiRequest(`/hrm/screen-requests/${reqId}/respond`, {
        method: "POST",
        body: JSON.stringify({
          status: "Not Approved",
          reason: rejectReasonText || "User declined screen capture request",
        }),
      });
      notify("Screen request declined & reason transmitted to Admin ✔", "warning");
    } catch (err) {
      notify(err.message || "Failed to submit rejection.", "error");
    }
  };

  // Submit Dedicated WFH Request
  const handleSubmitWfhRequest = async (e) => {
    e.preventDefault();
    if (!wfhDate || !wfhReason) return;
    setSubmittingWfh(true);
    try {
      const res = await apiRequest("/hrm/attendance/wfh-request", {
        method: "POST",
        body: JSON.stringify({
          request_date: wfhDate,
          reason: wfhReason,
        }),
      });
      notify(res.message || "Work From Home request submitted to HR in real-time ✔");
      setWfhReason("");
      await loadMemberSummary(false);
    } catch (err) {
      notify(err.message || "Failed to submit WFH request.", "error");
    } finally {
      setSubmittingWfh(false);
    }
  };

  // Start Work Session
  const handleStartWork = async () => {
    if (consentAgreed && !screenStreamRef.current) {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: "always" },
            audio: false,
          }).catch((e) => {
            console.warn("Screen share prompt skipped by user:", e);
            return null;
          });

          if (stream) {
            screenStreamRef.current = stream;
            stream.getVideoTracks()[0].onended = () => {
              notify("Screen capture stream ended.", "warning");
            };
          }
        }
      } catch (err) {
        console.warn("Display capture skipped.", err);
      }
    }

    try {
      const res = await apiRequest("/hrm/attendance/clock-in", {
        method: "POST",
        body: JSON.stringify({ work_mode: workMode }),
      });
      setIsWorking(true);
      setIsPaused(false);
      notify(res.message || "Work session started successfully! 🚀");
      await loadMemberSummary(false);

      if (consentAgreed && screenStreamRef.current) {
        setTimeout(() => {
          captureAndUploadScreen();
        }, 3000);

        captureIntervalRef.current = setInterval(() => {
          captureAndUploadScreen();
        }, 60000);
      }
    } catch (err) {
      notify(err.message || "Failed to start work session.", "error");
    }
  };

  // Pause Work Session
  const handlePauseWork = async () => {
    try {
      const res = await apiRequest("/hrm/attendance/pause-work", { method: "POST" });
      setIsPaused(true);
      notify(res.message || "Work session paused (Break logged, time subtracted) ⏸");
      await loadMemberSummary(false);
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
      await loadMemberSummary(false);
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
      notify(res.message || "Work session ended. Net worked duration saved! ⏹");
      await loadMemberSummary(false);
    } catch (err) {
      notify(err.message || "Failed to end work session.", "error");
    }
  };

  // Submit Real-Time Leave Application
  const handleSubmitLeaveApplication = async (e) => {
    e.preventDefault();
    if (!leaveStartDate || !leaveEndDate || !leaveReason) return;
    setSubmittingLeave(true);
    try {
      const res = await apiRequest("/hrm/leaves", {
        method: "POST",
        body: JSON.stringify({
          leave_type: leaveType,
          start_date: leaveStartDate,
          end_date: leaveEndDate,
          reason: leaveReason,
        }),
      });
      notify(res.message || "Leave application submitted to HR in real-time ✔");
      setLeaveReason("");
      await loadMemberSummary(false);
    } catch (err) {
      notify(err.message || "Failed to submit leave application.", "error");
    } finally {
      setSubmittingLeave(false);
    }
  };

  // Submit HR Request Form
  const handleSubmitHrRequest = async (e) => {
    e.preventDefault();
    if (!requestSubject || !requestCategory) return;
    setSubmittingReq(true);
    try {
      const token = authToken();
      const matchedType = appTypes.find(t => t.name === requestCategory || t.id === requestCategory);
      
      if (!matchedType) {
         alert("Please select a valid application type");
         setSubmittingReq(false);
         return;
      }

      const formData = new FormData();
      formData.append("application_type_id", matchedType.id);
      formData.append("title", requestSubject);
      
      if (requestDetails) {
         formData.append("reason", requestDetails);
      }
      
      if (Object.keys(dynamicFormState).length > 0) {
         Object.keys(dynamicFormState).forEach(key => {
            formData.append(`dynamic_fields[${key}]`, dynamicFormState[key]);
         });
      }
      
      if (reqAttachments && reqAttachments.length > 0) {
         for (let i = 0; i < reqAttachments.length; i++) {
            formData.append("attachments[]", reqAttachments[i]);
         }
      }

      const res = await fetch(`${API_URL}/hrm/member/request-form`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to submit HR request.");

      notify(data.message || "HR Request submitted successfully ✔");
      setRequestSubject("");
      setRequestDetails("");
      setReqAttachments(null);
      setFilePreviews([]);
      setDynamicFormState({});
      setFormStep(1);
      loadMemberSummary(false);
    } catch (err) {
      notify(err.message || "Failed to submit HR request.", "error");
    } finally {
      setSubmittingReq(false);
    }
  };

  // Submit Attendance Correction Request
  const handleSubmitCorrection = async (e) => {
    e.preventDefault();
    if (!corrReason) return;
    setSubmittingCorr(true);
    try {
      const res = await apiRequest("/hrm/attendance/corrections", {
        method: "POST",
        body: JSON.stringify({
          date: corrDate,
          requested_clock_in: corrIn,
          requested_clock_out: corrOut,
          work_mode: workMode,
          reason: corrReason,
        }),
      });
      notify(res.message || "Attendance Correction submitted to HR for approval ✔");
      setCorrReason("");
      await loadMemberSummary(false);
    } catch (err) {
      notify(err.message || "Failed to submit attendance correction.", "error");
    } finally {
      setSubmittingCorr(false);
    }
  };

  // Submit Advance Salary / Loan Request
  const handleSubmitAdvance = async (e) => {
    e.preventDefault();
    if (!advanceAmount || !advanceReason) return;
    setSubmittingAdvance(true);
    try {
      const res = await apiRequest("/hrm/member/request-form", {
        method: "POST",
        body: JSON.stringify({
          category: "Advance Salary Request",
          subject: `Advance Salary Request - PKR/USD ${Number(advanceAmount).toLocaleString()}`,
          details: `Requested Amount: PKR/USD ${advanceAmount}\nDeduction Plan: ${advanceDeductionMonth}\nReason: ${advanceReason}`,
        }),
      });
      notify(res.message || "Advance Salary Request submitted to HR Payroll for review ✔");
      setAdvanceAmount("");
      setAdvanceReason("");
      await loadMemberSummary(false);
    } catch (err) {
      notify(err.message || "Failed to submit advance salary request.", "error");
    } finally {
      setSubmittingAdvance(false);
    }
  };

  // Submit Expense Reimbursement Claim
  const handleSubmitExpense = async (e) => {
    e.preventDefault();
    if (!expenseAmount || !expenseNotes) return;
    setSubmittingExpense(true);
    try {
      const res = await apiRequest("/hrm/member/request-form", {
        method: "POST",
        body: JSON.stringify({
          category: "Expense Reimbursement Claim",
          subject: `Expense Reimbursement - ${expenseCategory} (PKR/USD ${Number(expenseAmount).toLocaleString()})`,
          details: `Expense Date: ${expenseDate}\nCategory: ${expenseCategory}\nClaim Amount: PKR/USD ${expenseAmount}\nNotes: ${expenseNotes}`,
        }),
      });
      notify(res.message || "Expense Reimbursement Claim submitted to HR Finance ✔");
      setExpenseAmount("");
      setExpenseNotes("");
      await loadMemberSummary(false);
    } catch (err) {
      notify(err.message || "Failed to submit expense claim.", "error");
    } finally {
      setSubmittingExpense(false);
    }
  };

  const summary = data?.summary || {};
  const activePolicy = data?.activePolicy || {};
  const upcomingHolidays = data?.upcomingHolidays || [];
  const pmsBreakdown = data?.pmsProjectBreakdown || [];
  const salarySlips = data?.salarySlips || [];
  const memberRequests = data?.memberRequests || [];
  const offerLetter = data?.offerLetter || null;
  const customDocuments = data?.customDocuments || [];
  const wfhToday = data?.wfhToday || null;
  const leaveHistory = data?.leaveHistory || [];
  const latestLeaveDecision = data?.latestLeaveDecision || null;
  const activeWarning = data?.activeWarning || null;
  const warningsList = data?.warnings || [];

  return (
    <main className="mem-page" id="member-hrm-portal">
      {toast && <div className={`mem-toast mem-toast--${toast.kind}`} role="alert">{toast.message}</div>}

      {/* ONLINE WARNING REMOVAL REASON MODAL */}
      {warningModalOpen && selectedWarning && (
        <div className="mem-modal-overlay" style={{ zIndex: 9999 }}>
          <div className="mem-modal-panel" style={{ maxWidth: "520px", borderTop: "4px solid #dc2626" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertTriangle size={26} color="#dc2626" />
                <h3 style={{ margin: 0, fontSize: "16px", color: "#0f172a" }}>Submit Reason to Remove Warning</h3>
              </div>
              <button style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => setWarningModalOpen(false)}>
                <X size={20} color="#64748b" />
              </button>
            </div>

            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "10px 14px", borderRadius: "8px", fontSize: "12.5px", color: "#991b1b", marginBottom: "14px" }}>
              <strong>Policy Notice:</strong> Submitting an online reason sends your request directly to Admin to remove the warning from your account.
            </div>

            <form onSubmit={handleConfirmSubmitWarningReason} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>
                  Select Reason Category:
                </label>
                <select
                  className="mem-input"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px" }}
                  value={removalCategory}
                  onChange={(e) => setRemovalCategory(e.target.value)}
                >
                  <option value="Traffic &amp; Transit Emergency">🚦 Severe Traffic &amp; Public Transport Delay</option>
                  <option value="Medical &amp; Health Reason">🏥 Medical Emergency / Doctor Appointment</option>
                  <option value="Technical &amp; Internet Outage">💻 Technical Failure / Work Mode Issue</option>
                  <option value="Family &amp; Urgent Personal Matter">🏠 Urgent Family / Personal Reason</option>
                  <option value="Other Valid Excuse">📝 Other Valid Justification</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>
                  Detailed Reason / Explanation for Late Arrivals:
                </label>
                <textarea
                  className="mem-input"
                  rows="3"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px" }}
                  placeholder="Provide full details regarding why you were late past the grace threshold..."
                  value={removalDetails}
                  onChange={(e) => setRemovalDetails(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }}>
                <button type="button" className="mem-btn" style={{ background: "#64748b", color: "#fff" }} onClick={() => setWarningModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="mem-btn" style={{ background: "#dc2626", color: "#fff" }} disabled={submittingWarningReason}>
                  {submittingWarningReason ? "Submitting..." : "Send Removal Reason to Admin ✔"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN REAL-TIME SCREEN VERIFICATION POPUP MODAL */}
      {pendingScreenReq && (
        <div className="mem-modal-overlay" style={{ zIndex: 9999 }}>
          <div className="mem-modal-panel" style={{ borderTop: "4px solid #0082ff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <Camera size={28} color="#0082ff" />
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", color: "#0f172a" }}>📸 Real-Time Screen Proof Request</h3>
                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>Admin has requested an immediate hardware screen verification proof.</p>
              </div>
            </div>

            {!rejectModalOpen ? (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
                <button className="mem-btn" style={{ background: "#ef4444", color: "#fff" }} onClick={handleOpenRejectModal}>❌ Decline with Reason</button>
                <button className="mem-btn mem-btn--primary" onClick={handleAcceptScreenReq}>✔ Accept &amp; Capture</button>
              </div>
            ) : (
              <form onSubmit={handleConfirmRejectScreenReq} style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Reason for Declining Screen Request:</label>
                <textarea
                  className="mem-input"
                  rows="2"
                  placeholder="e.g. Viewing confidential financial dashboard or NDA document..."
                  value={rejectReasonText}
                  onChange={(e) => setRejectReasonText(e.target.value)}
                  required
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <button type="button" className="mem-btn" style={{ background: "#64748b", color: "#fff" }} onClick={() => setRejectModalOpen(false)}>Cancel</button>
                  <button type="submit" className="mem-btn" style={{ background: "#ef4444", color: "#fff" }}>Send Rejection &amp; Reason to Admin</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MEMBER PORTAL HEADER */}
      <header className="mem-header" id="member-portal-header">
        <div>
          <div className="mem-title-row">
            <h1>Member Enterprise Portal &amp; Work Engine</h1>
            <span className="mem-live-pill">
              <ShieldAlert size={14} /> Implemented Policy: <strong>{activePolicy.name || "Standard Working Policy"}</strong> ({activePolicy.weekly_hours || 40.0}h/wk)
            </span>
          </div>
          <p>Welcome back, <strong>{user.name}</strong> ({user.email}). Track your active shift, leaves, offer letter stipends, and PMS project hours.</p>
        </div>
      </header>

      {/* PROMINENT CORPORATE POLICY WARNING ALERT BANNER */}
      {activeWarning && (
        <div
          style={{
            background: activeWarning.status === "Removal Requested" ? "#fffbe6" : "#fef2f2",
            border: activeWarning.status === "Removal Requested" ? "2px solid #f59e0b" : "2px solid #ef4444",
            borderRadius: "12px",
            padding: "16px 20px",
            marginBottom: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 4px 12px rgba(239, 68, 68, 0.15)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
            <div style={{ background: activeWarning.status === "Removal Requested" ? "#fef3c7" : "#fee2e2", padding: "10px", borderRadius: "10px" }}>
              <AlertTriangle size={28} color={activeWarning.status === "Removal Requested" ? "#d97706" : "#dc2626"} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "16px", color: activeWarning.status === "Removal Requested" ? "#92400e" : "#991b1b", fontWeight: "700" }}>
                  ⚠️ ATTENDANCE POLICY WARNING ACCUMULATED
                </h3>
                <span style={{ fontSize: "11px", fontWeight: "800", padding: "3px 8px", borderRadius: "6px", background: activeWarning.status === "Removal Requested" ? "#fef3c7" : "#fee2e2", color: activeWarning.status === "Removal Requested" ? "#92400e" : "#991b1b" }}>
                  {activeWarning.status === "Removal Requested" ? "REMOVAL REASON SUBMITTED — UNDER ADMIN REVIEW ⏳" : "ACTIVE WARNING ON ACCOUNT ⚠️"}
                </span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#334155" }}>
                {activeWarning.description || `You have exceeded the late grace threshold (${summary.late_threshold || '09:15 AM'}) ${summary.max_late_allowed || 3} times. According to Working Policy, a warning has been issued.`}
              </p>
              {activeWarning.removal_reason && (
                <div style={{ marginTop: "6px", fontSize: "12px", color: "#475569", background: "rgba(255,255,255,0.7)", padding: "6px 10px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                  <strong>Your Submitted Reason:</strong> "{activeWarning.removal_reason}"
                </div>
              )}
            </div>
          </div>

          <div>
            {activeWarning.status === "Active" ? (
              <button
                className="mem-btn"
                style={{ background: "#dc2626", color: "#fff", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "6px", boxShadow: "0 2px 8px rgba(220, 38, 38, 0.3)" }}
                onClick={() => handleOpenWarningRemovalModal(activeWarning)}
              >
                📝 Submit Reason for Warning Removal
              </button>
            ) : (
              <button
                className="mem-btn"
                style={{ background: "#d97706", color: "#fff", fontWeight: "700" }}
                onClick={() => handleOpenWarningRemovalModal(activeWarning)}
              >
                ✏️ Update Online Reason
              </button>
            )}
          </div>
        </div>
      )}

      {/* REAL-TIME LEAVE DECISION ALERT BANNER */}
      {latestLeaveDecision && (
        <div
          style={{
            background: latestLeaveDecision.status === "Approved" ? "#f0fdf4" : "#fef2f2",
            border: latestLeaveDecision.status === "Approved" ? "1px solid #bbf7d0" : "1px solid #fecaca",
            padding: "12px 18px",
            borderRadius: "8px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "20px" }}>
              {latestLeaveDecision.status === "Approved" ? "🎉" : "⚠️"}
            </span>
            <div>
              <strong style={{ color: latestLeaveDecision.status === "Approved" ? "#166534" : "#991b1b", fontSize: "14px" }}>
                Leave Request {latestLeaveDecision.status}: {latestLeaveDecision.leave_type} ({latestLeaveDecision.start_date} to {latestLeaveDecision.end_date})
              </strong>
              <div style={{ fontSize: "12.5px", color: "#475569", marginTop: "2px" }}>
                {latestLeaveDecision.status === "Approved"
                  ? `Approved by ${latestLeaveDecision.reviewer_name || "HR Management"}`
                  : `Not Accepted by ${latestLeaveDecision.reviewer_name || "HR Management"} — Reason: ${latestLeaveDecision.rejection_reason || "Not specified"}`}
              </div>
            </div>
          </div>
          <span style={{
            fontSize: "12px",
            fontWeight: "800",
            padding: "5px 12px",
            borderRadius: "6px",
            background: latestLeaveDecision.status === "Approved" ? "#dcfce7" : "#fee2e2",
            color: latestLeaveDecision.status === "Approved" ? "#15803d" : "#b91c1c"
          }}>
            {latestLeaveDecision.status === "Approved" ? "✔ APPROVED" : "❌ Not Appreved"}
          </span>
        </div>
      )}

      {/* SUB-MODULE 1: LIVE WORK SESSION ENGINE BANNER */}
      <section className="mem-clock-banner" id="section-web-clock-engine">
        <div className="mem-clock-left">
          <div className="mem-work-mode-select">
            <label id="lbl-work-mode">Work Location Mode:</label>
            <select
              id="select-work-mode"
              className="mem-input"
              value={workMode}
              onChange={(e) => setWorkMode(e.target.value)}
              disabled={isWorking}
            >
              <option value="Office">🏢 Office Mode (In-House)</option>
              <option value="WFH">🏡 Work From Home (Remote)</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className={`mem-status-badge ${isPaused ? "mem-status-badge--paused" : isWorking ? "mem-status-badge--live" : "mem-status-badge--off"}`}>
              {isPaused ? "⏸ PAUSED (Break Time Deducted)" : isWorking ? "🟢 LIVE ON DUTY" : "⏹ OFF DUTY"}
            </span>

            {lastCapturedTime && (
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                📸 Last Auto Proof: {lastCapturedTime}
              </span>
            )}
          </div>

          {wfhToday && wfhToday.status === "Rejected" && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", color: "#991b1b" }}>
              ⚠️ <strong>WFH Request Rejected:</strong> {wfhToday.rejection_reason || "In-office attendance required today."}
            </div>
          )}
        </div>

        <div className="mem-clock-right">
          <div className="mem-timer-box">
            <span className="mem-timer-label">Today's Active Working Time (Hours, Mins, Secs):</span>
            <span className="mem-timer-digits" style={{ fontSize: "20px", color: "#0082ff" }}>
              {formatDetailedTime(workSeconds)}
            </span>
          </div>

          <div className="mem-clock-actions">
            {!isWorking ? (
              <button id="btn-start-work" className="mem-btn mem-btn--primary" onClick={handleStartWork}>
                <Play size={20} /> {consentAgreed ? "▶️ Start Work & Share Screen" : "▶️ Start Work Session"}
              </button>
            ) : (
              <>
                {isPaused ? (
                  <button id="btn-resume-work" className="mem-btn" style={{ background: "#3b82f6", color: "#fff" }} onClick={handleResumeWork}>
                    <Play size={18} /> ▶️ Resume Session
                  </button>
                ) : (
                  <button id="btn-pause-work" className="mem-btn" style={{ background: "#f59e0b", color: "#fff" }} onClick={handlePauseWork}>
                    <Pause size={18} /> ⏸ Pause (Break)
                  </button>
                )}

                <button id="btn-end-work" className="mem-btn" style={{ background: "#ef4444", color: "#fff" }} onClick={handleEndWork}>
                  <UserX size={20} /> ⏹ End Work Session
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* SCREEN CAPTURE & CONSENT TOGGLE CARD */}
      <section className="mem-card" style={{ background: consentAgreed ? "#f0fdf4" : "#eff6ff", border: consentAgreed ? "1px solid #bbf7d0" : "1px solid #bfdbfe", marginBottom: "20px" }}>
        <h2 className="mem-card-title">
          <ShieldAlert size={20} color={consentAgreed ? "#166534" : "#1d4ed8"} /> Screen Sharing &amp; Monitoring Settings
        </h2>
        <p style={{ fontSize: "13px", color: "#334155", margin: "0 0 12px" }}>
          {consentAgreed
            ? "✔ You have ACCEPTED screen sharing. Hardware desktop proofs are captured when you start duty."
            : "🔒 You have NOT agreed to screen sharing. Duty clock-in starts work cleanly WITHOUT asking for screen capture."}
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {!consentAgreed ? (
            <button className="mem-btn mem-btn--primary" style={{ padding: "6px 14px", fontSize: "12.5px" }} onClick={handleAgreeConsent}>
              ✔ Enable Screen Sharing &amp; Proofs
            </button>
          ) : (
            <button className="mem-btn" style={{ background: "#64748b", color: "#fff", padding: "6px 14px", fontSize: "12.5px" }} onClick={handleDisableConsent}>
              🚫 Disable Screen Sharing (Privacy Mode)
            </button>
          )}
        </div>
      </section>



      {/* SUB-MODULE CONTENT */}
      {activeTab === "overview" && (
        <section className="mem-card" id="section-member-summary">
          <div className="mem-card-header">
            <h2 className="mem-card-title"><Calendar size={19} /> Monthly Working Summary ({summary.month_name})</h2>
            <p className="mem-card-desc">Your attendance and work hour overview for the current month.</p>
          </div>

          <div className="mem-stat-grid">
            <div className="mem-stat-card">
              <span className="mem-stat-label">Present Days</span>
              <span className="mem-stat-value mem-stat-value--green">{summary.present_days}</span>
              <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>Days this month</span>
            </div>
            <div className="mem-stat-card">
              <span className="mem-stat-label">Work From Home</span>
              <span className="mem-stat-value mem-stat-value--blue">{summary.wfh_days}</span>
              <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>WFH days logged</span>
            </div>
            <div className="mem-stat-card">
              <span className="mem-stat-label">Approved Leaves</span>
              <span className="mem-stat-value mem-stat-value--indigo">{summary.leave_days}</span>
              <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>Days approved</span>
            </div>
            <div className="mem-stat-card">
              <span className="mem-stat-label">Total Work Hours</span>
              <span className="mem-stat-value">{summary.total_work_hours}</span>
              <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>Hours logged</span>
            </div>
          </div>

          <div className="mem-info-banner">
            <h3><Clock size={16} /> Active Policy — {activePolicy.name || "Policy Template"}</h3>
            <div className="mem-info-grid">
              <div className="mem-info-grid-item">
                <span>Active Shift Model</span>
                <strong>{activePolicy.shift_type || "Fixed"} ({activePolicy.shift_start?.substring(0, 5)} – {activePolicy.shift_end?.substring(0, 5)})</strong>
              </div>
              <div className="mem-info-grid-item">
                <span>Weekly Target Hours</span>
                <strong>{activePolicy.weekly_hours || 40.0} hrs / week</strong>
              </div>
              <div className="mem-info-grid-item">
                <span>Grace Period & Late Threshold</span>
                <strong style={{ color: "var(--color-warning)" }}>{activePolicy.grace_minutes || 15} min ({activePolicy.late_threshold?.substring(0, 5) || "09:15"})</strong>
              </div>
            </div>
          </div>

          <p className="mem-section-sub"><Calendar size={15} /> Public Holidays Calendar (2026)</p>
          <div className="mem-holiday-grid">
            {upcomingHolidays.map((h, i) => (
              <div key={i} className="mem-holiday-chip">
                <strong>🎉 {h.title}</strong>
                <span>{h.date} ({h.day})</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "leaves" && (
        <section className="mem-card" id="section-leave-application">
          <div className="mem-card-header">
            <h2 className="mem-card-title"><Calendar size={19} /> Leave Application Form &amp; History</h2>
            <p className="mem-card-desc">
              Submit formal leave applications directly to HR Management for review. Track decision status audit logs in real-time.
            </p>
          </div>

          <div style={{ background: "var(--bg-card-alt)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "20px", marginBottom: "28px" }}>
            <p className="mem-section-sub" style={{ margin: "0 0 16px" }}>
              <FileText size={16} /> New Leave Application Request
            </p>

            <form onSubmit={handleSubmitHrRequest} className="mem-form" style={{ maxWidth: "100%", position: "relative", minHeight: "450px" }}>
              {/* STEP 1: APPLICATION TYPE & SUBJECT */}
              <div style={{ display: formStep === 1 ? 'block' : 'none', animation: 'fadeIn 0.4s ease-out' }}>
                <div style={{ marginBottom: "20px", paddingBottom: "15px", borderBottom: "1px solid var(--border-color)" }}>
                  <h3 style={{ margin: 0, color: "var(--text-heading)", fontSize: "16px" }}>Step 1: Select Application Type</h3>
                  <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "13px" }}>Choose the type of request you are submitting.</p>
                </div>
                
                <div className="mem-form-grid" style={{ gridTemplateColumns: "1fr" }}>
                  <div className="mem-form-group">
                    <label className="mem-form-label">
                      Application Category <span style={{ color: "var(--color-danger)" }}>*</span>
                    </label>
                    <select
                      className="mem-input"
                      value={requestCategory}
                      onChange={(e) => setRequestCategory(e.target.value)}
                      required
                    >
                      {appTypes && appTypes.length > 0 ? (
                        appTypes.map((t) => (
                          <option key={t.id || t.name} value={t.name}>{t.name}</option>
                        ))
                      ) : (
                        <option value="General HR Application">General HR Application</option>
                      )}
                    </select>
                  </div>

                  <div className="mem-form-group">
                    <label className="mem-form-label">
                      Application Subject / Title <span style={{ color: "var(--color-danger)" }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="mem-input"
                      placeholder="Brief subject or title of your application..."
                      value={requestSubject}
                      onChange={(e) => setRequestSubject(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="mem-form-actions" style={{ justifyContent: "flex-end", marginTop: "20px" }}>
                  <button
                    type="button"
                    className="mem-btn mem-btn--primary"
                    onClick={() => {
                      if (!requestCategory || !requestSubject) return alert("Please fill out all required fields.");
                      setFormStep(2);
                    }}
                  >
                    Next Step <span style={{ marginLeft: "6px" }}>→</span>
                  </button>
                </div>
              </div>

              {/* STEP 2: DYNAMIC FIELDS & ATTACHMENTS */}
              <div style={{ display: formStep === 2 ? 'block' : 'none', animation: 'fadeIn 0.4s ease-out' }}>
                <div style={{ marginBottom: "20px", paddingBottom: "15px", borderBottom: "1px solid var(--border-color)" }}>
                  <h3 style={{ margin: 0, color: "var(--text-heading)", fontSize: "16px" }}>Step 2: Provide Required Details</h3>
                  <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "13px" }}>Fill out the required dynamic fields for {requestCategory}.</p>
                </div>

                <div className="mem-form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  {appTypes?.find(t => t.name === requestCategory || t.id === requestCategory)?.fields?.map(f => {
                     let inputType = 'text';
                     const dbType = (f.field_type || '').toLowerCase();
                     if (dbType === 'file upload' || dbType === 'file') inputType = 'file';
                     else if (dbType === 'date') inputType = 'date';
                     else if (dbType === 'time') inputType = 'time';
                     else if (dbType === 'datetime') inputType = 'datetime-local';
                     else if (dbType === 'checkbox') inputType = 'checkbox';
                     else if (dbType === 'number') inputType = 'number';
                     
                     // Interactive logic for Half Day
                     const halfDayField = appTypes.find(t => t.name === requestCategory || t.id === requestCategory)?.fields?.find(x => x.field_name === 'half_day');
                     const isHalfDaySelected = halfDayField && dynamicFormState[halfDayField.id] && dynamicFormState[halfDayField.id].includes('Half Day');
                     
                     // Hide start_time / end_time if half day is NOT selected
                     if ((f.field_name === 'start_time' || f.field_name === 'end_time') && !isHalfDaySelected) {
                        return null;
                     }
                     
                     // Date Range Specific Component
                     if (dbType === 'daterange') {
                        const drState = dynamicFormState[f.id] ? JSON.parse(dynamicFormState[f.id]) : { start: '', end: '' };
                        let totalDays = 0;
                        if (drState.start && drState.end) {
                           const start = new Date(drState.start);
                           const end = new Date(drState.end);
                           totalDays = Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
                        }
                        
                        return (
                          <div className="mem-form-group" key={f.id} style={{ gridColumn: '1 / -1' }}>
                            <label className="mem-form-label">
                              {f.field_label} {f.is_required && <span style={{ color: "var(--color-danger)" }}>*</span>}
                            </label>
                            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                               <input type="date" className="mem-input" required={f.is_required} value={drState.start} 
                                      onChange={e => setDynamicFormState({...dynamicFormState, [f.id]: JSON.stringify({ ...drState, start: e.target.value })})} />
                               <span>to</span>
                               <input type="date" className="mem-input" required={f.is_required} value={drState.end} 
                                      onChange={e => setDynamicFormState({...dynamicFormState, [f.id]: JSON.stringify({ ...drState, end: e.target.value })})} />
                               {totalDays > 0 && <span style={{ marginLeft: "10px", padding: "4px 8px", background: "#e0e7ff", color: "#4338ca", borderRadius: "12px", fontSize: "12px", fontWeight: "600" }}>{totalDays} Days</span>}
                            </div>
                            <input type="hidden" id={`dyn_field_${f.id}`} value={totalDays > 0 ? JSON.stringify(drState) : ''} />
                          </div>
                        );
                     }
                     
                     return (
                     <div className="mem-form-group" key={f.id}>
                       <label className="mem-form-label">
                         {f.field_label} {f.is_required && <span style={{ color: "var(--color-danger)" }}>*</span>}
                       </label>
                       {dbType === 'textarea' ? (
                          <textarea id={`dyn_field_${f.id}`} className="mem-input" required={f.is_required} rows={3} value={dynamicFormState[f.id] || ''} onChange={e => setDynamicFormState({...dynamicFormState, [f.id]: e.target.value})} />
                       ) : dbType === 'dropdown' || dbType === 'radio' ? (
                          <select id={`dyn_field_${f.id}`} className="mem-input" required={f.is_required} value={dynamicFormState[f.id] || ''} onChange={e => setDynamicFormState({...dynamicFormState, [f.id]: e.target.value})}>
                             <option value="">Select Option</option>
                             {f.options && (typeof f.options === 'string' ? JSON.parse(f.options) : f.options).map((opt, i) => (
                                <option key={i} value={opt}>{opt}</option>
                             ))}
                          </select>
                       ) : inputType === 'checkbox' ? (
                          <input id={`dyn_field_${f.id}`} type="checkbox" style={{width: '20px', height: '20px', display: 'block', marginTop: '10px'}} checked={!!dynamicFormState[f.id]} onChange={e => setDynamicFormState({...dynamicFormState, [f.id]: e.target.checked})} />
                       ) : inputType === 'file' ? (
                          <input id={`dyn_field_${f.id}`} type="file" className="mem-input" required={f.is_required} />
                       ) : (
                          <input id={`dyn_field_${f.id}`} type={inputType} className="mem-input" required={f.is_required} value={dynamicFormState[f.id] || ''} onChange={e => setDynamicFormState({...dynamicFormState, [f.id]: e.target.value})} />
                       )}
                     </div>
                  )})}
                </div>

                <div className="mem-form-group" style={{ marginTop: "15px" }}>
                  <label className="mem-form-label">
                    Additional Application Details &amp; Reason (Optional)
                  </label>
                  <div style={{ marginBottom: "20px" }}>
                    <ReactQuill
                      theme="snow"
                      placeholder="Provide complete background details, reason, or coverage notes for HR review..."
                      value={requestDetails}
                      onChange={setRequestDetails}
                      style={{ backgroundColor: "white", borderRadius: "8px" }}
                    />
                  </div>
                </div>

                <div className="mem-form-group">
                  <label className="mem-form-label">
                    Attach Documents / Proofs (Multiple Files Supported)
                  </label>
                  <input
                    type="file"
                    multiple
                    className="mem-input"
                    onChange={handleMemberFileChange}
                  />
                  <span style={{ fontSize: "11.5px", color: "var(--text-secondary)", marginTop: "4px" }}>
                    Select one or multiple supporting files (PDFs, receipts, medical notes, images). Click any image thumbnail below to preview.
                  </span>

                  {/* THUMBNAIL PREVIEW GRID FOR MEMBER */}
                  {filePreviews.length > 0 && (
                    <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "10px" }}>
                      {filePreviews.map((f, i) => (
                        <div key={i} style={{ border: "1px solid var(--border-color)", borderRadius: "8px", overflow: "hidden", background: "var(--bg-main)", fontSize: "11px", padding: "6px" }}>
                          {f.isImage ? (
                            <div style={{ height: "70px", borderRadius: "4px", overflow: "hidden", cursor: "pointer", position: "relative" }} onClick={() => setMemberLightboxUrl(f.url)}>
                              <img src={f.url} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              <div style={{ position: "absolute", inset: 0, background: "rgba(0, 130, 255, 0.4)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10.5px", fontWeight: "700" }}>
                                👁️ Review Pic
                              </div>
                            </div>
                          ) : (
                            <div style={{ height: "60px", background: "#e2e8f0", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", color: "#475569" }}>
                              📄 Document
                            </div>
                          )}
                          <div style={{ marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: "600", color: "var(--text-heading)" }} title={f.name}>
                            {f.name}
                          </div>
                          <div style={{ color: "var(--text-secondary)", fontSize: "10px" }}>{f.size}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mem-form-actions" style={{ justifyContent: "space-between", marginTop: "20px" }}>
                  <button type="button" className="mem-btn" style={{ background: "#f1f5f9", color: "#334155" }} onClick={() => setFormStep(1)}>
                    <span style={{ marginRight: "6px" }}>←</span> Back
                  </button>
                  <button type="button" className="mem-btn mem-btn--primary" onClick={() => setFormStep(3)}>
                    Review Information <span style={{ marginLeft: "6px" }}>→</span>
                  </button>
                </div>
              </div>

              {/* STEP 3: REVIEW & SUBMIT */}
              <div style={{ display: formStep === 3 ? 'block' : 'none', animation: 'fadeIn 0.4s ease-out' }}>
                <div style={{ marginBottom: "20px", paddingBottom: "15px", borderBottom: "1px solid var(--border-color)" }}>
                  <h3 style={{ margin: 0, color: "var(--text-heading)", fontSize: "16px" }}>Step 3: Review & Submit</h3>
                  <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "13px" }}>Please verify the information before submitting to HR.</p>
                </div>

                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "20px" }}>
                   <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                     <div>
                       <strong style={{ color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>Category</strong>
                       <div>{requestCategory}</div>
                     </div>
                     <div>
                       <strong style={{ color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>Subject</strong>
                       <div>{requestSubject}</div>
                     </div>
                   </div>
                   
                   <hr style={{ margin: "16px 0", borderTop: "1px solid #e2e8f0" }} />
                   
                   <strong style={{ color: "var(--text-secondary)", display: "block", marginBottom: "8px", fontSize: "13px" }}>Dynamic Fields Data</strong>
                   <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                      {appTypes?.find(t => t.name === requestCategory || t.id === requestCategory)?.fields?.map(f => {
                         let val = dynamicFormState[f.id] || '-';
                         if (f.field_type.toLowerCase() === 'daterange') {
                            const drState = dynamicFormState[f.id] ? JSON.parse(dynamicFormState[f.id]) : {};
                            if (drState.start && drState.end) val = `${drState.start} to ${drState.end}`;
                         } else if (f.field_type.toLowerCase() === 'checkbox') {
                            val = dynamicFormState[f.id] ? 'Yes' : 'No';
                         } else if (f.field_type.toLowerCase() === 'file upload' || f.field_type.toLowerCase() === 'file') {
                            val = 'File Attached';
                         }
                         
                         // Skip hidden half day fields
                         const halfDayField = appTypes.find(t => t.name === requestCategory || t.id === requestCategory)?.fields?.find(x => x.field_name === 'half_day');
                         const isHalfDaySelected = halfDayField && dynamicFormState[halfDayField.id] && dynamicFormState[halfDayField.id].includes('Half Day');
                         if ((f.field_name === 'start_time' || f.field_name === 'end_time') && !isHalfDaySelected) return null;
                         
                         return (
                            <div key={f.id}>
                               <strong style={{ color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>{f.field_label}</strong>
                               <div>{val}</div>
                            </div>
                         );
                      })}
                   </div>
                </div>

                <div className="mem-form-actions" style={{ justifyContent: "space-between", marginTop: "20px" }}>
                  <button type="button" className="mem-btn" style={{ background: "#f1f5f9", color: "#334155" }} onClick={() => setFormStep(2)}>
                    <span style={{ marginRight: "6px" }}>←</span> Edit Details
                  </button>
                  <button
                    type="submit"
                    className="mem-btn mem-btn--primary"
                    disabled={submittingReq}
                    style={{ background: "#10b981" }}
                  >
                    <Send size={16} /> {submittingReq ? "Submitting Application..." : "Confirm & Submit Application"}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* MEMBER LEAVE HISTORY & DECISION AUDIT LOG TABLE */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <p className="mem-section-sub" style={{ margin: 0 }}>
              <FileText size={16} /> Leave History &amp; Decision Audit Log
            </p>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Total Applications Logged: <strong>{leaveHistory.length}</strong>
            </span>
          </div>

          {leaveHistory.length === 0 ? (
            <div className="mem-table-empty">
              No leave applications submitted yet.
            </div>
          ) : (
            <div className="mem-table-wrap">
              <table className="mem-table">
                <thead>
                  <tr>
                    <th>Leave Type</th>
                    <th>Dates &amp; Duration</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Reviewed By / Reason</th>
                    <th>Applied On</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveHistory.map((l) => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: "600", color: "var(--text-heading)" }}>{l.leave_type}</td>
                      <td>
                        {l.start_date} to {l.end_date} (<strong>{l.total_days} Day(s)</strong>)
                      </td>
                      <td style={{ maxWidth: "250px" }}>{l.reason}</td>
                      <td>
                        <span className={`mem-badge ${l.status === "Approved" ? "mem-badge--success" : l.status === "Rejected" ? "mem-badge--danger" : "mem-badge--warning"}`}>
                          {l.status === "Approved" ? "✔ Approved" : l.status === "Rejected" ? "❌ Not Approved" : "⏳ Pending HR"}
                        </span>
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        {l.reviewer_name ? `By: ${l.reviewer_name}` : "Awaiting HR Decision"}
                        {l.rejection_reason && <div style={{ color: "var(--color-danger)", marginTop: "2px", fontWeight: "600" }}>Reason: {l.rejection_reason}</div>}
                      </td>
                      <td style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                        {l.created_at ? new Date(l.created_at).toLocaleDateString() : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === "pms" && (
        <section className="mem-card" id="section-pms-hours">
          <div className="mem-card-header">
            <h2 className="mem-card-title"><Briefcase size={19} /> PMS Projects &amp; Task Hours Breakdown</h2>
            <p className="mem-card-desc">Hours tracked directly from PMS tasks assigned to you.</p>
          </div>

          {pmsBreakdown.length === 0 ? (
            <p style={{ fontSize: "13.5px", color: "var(--text-muted)", padding: "20px 0" }}>No active PMS task hours recorded yet.</p>
          ) : (
            pmsBreakdown.map((p) => (
              <div key={p.project_id} className="mem-project-card">
                <div className="mem-project-header">
                  <h3 className="mem-project-name">📁 {p.project_name}</h3>
                  <span className="mem-project-hours">
                    {formatDetailedTime(p.total_seconds !== undefined ? p.total_seconds : Math.round((p.total_hours || 0) * 3600))} Logged
                  </span>
                </div>
                <div className="mem-task-list">
                  {p.tasks.map((t) => (
                    <div key={t.id} className="mem-task-row">
                      <span>• {t.title} <span className="mem-task-status">({t.status})</span></span>
                      <strong className="mem-task-hours">
                        {formatDetailedTime(t.seconds !== undefined ? t.seconds : Math.round((t.hours || 0) * 3600))}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {activeTab === "workmode" && (
        <section className="mem-card" id="section-workmode-wfh">
          <div className="mem-card-header">
            <h2 className="mem-card-title"><Laptop size={19} /> Work From Home (WFH) Request</h2>
            <p className="mem-card-desc">
              Submit an official Work From Home request to HR. Approved WFH requests grant remote clock-in authorization.
            </p>
          </div>

          <form onSubmit={handleSubmitWfhRequest} className="mem-form">
            <div className="mem-form-group">
              <label className="mem-form-label">Target WFH Date</label>
              <input type="date" className="mem-input" value={wfhDate} onChange={(e) => setWfhDate(e.target.value)} required />
            </div>
            <div className="mem-form-group">
              <label className="mem-form-label">Reason / Remote Work Details</label>
              <textarea className="mem-input" rows="4" placeholder="Provide reason for remote work request..." value={wfhReason} onChange={(e) => setWfhReason(e.target.value)} required />
            </div>
            <div className="mem-form-actions">
              <button type="submit" className="mem-btn mem-btn--primary" disabled={submittingWfh}>
                {submittingWfh ? "Submitting Request..." : "Submit WFH Request to HR"}
              </button>
            </div>
          </form>
        </section>
      )}

      {activeTab === "corrections" && (
        <section className="mem-card" id="section-attendance-corrections">
          <div className="mem-card-header">
            <h2 className="mem-card-title"><AlertTriangle size={19} /> Submit Attendance Correction</h2>
            <p className="mem-card-desc">
              Missed a clock-in or clock-out punch? Submit a correction request for HR review.
            </p>
          </div>

          <form onSubmit={handleSubmitCorrection} className="mem-form">
            <div className="mem-form-grid mem-form-grid--3">
              <div className="mem-form-group">
                <label className="mem-form-label">Target Date</label>
                <input type="date" className="mem-input" value={corrDate} onChange={(e) => setCorrDate(e.target.value)} required />
              </div>
              <div className="mem-form-group">
                <label className="mem-form-label">Clock In Time</label>
                <input type="time" className="mem-input" value={corrIn} onChange={(e) => setCorrIn(e.target.value)} required />
              </div>
              <div className="mem-form-group">
                <label className="mem-form-label">Clock Out Time</label>
                <input type="time" className="mem-input" value={corrOut} onChange={(e) => setCorrOut(e.target.value)} required />
              </div>
            </div>

            <div className="mem-form-group">
              <label className="mem-form-label">Reason for Correction</label>
              <textarea className="mem-input" rows="3" placeholder="e.g. Internet / power outage prevented clock-in at 9:00 AM..." value={corrReason} onChange={(e) => setCorrReason(e.target.value)} required />
            </div>

            <div className="mem-form-actions">
              <button type="submit" className="mem-btn mem-btn--primary" disabled={submittingCorr}>
                {submittingCorr ? "Submitting..." : "Submit Correction Request"}
              </button>
            </div>
          </form>
        </section>
      )}

      {(activeTab === "claims" || activeTab === "advance" || activeTab === "reimbursement") && (
        <section className="mem-card" id="section-financial-claims">
          <div className="mem-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <h2 className="mem-card-title"><CreditCard size={19} /> Advance Salary &amp; Expense Claims</h2>
              <p className="mem-card-desc" style={{ margin: "4px 0 0" }}>
                Submit requests for salary advances, emergency loans, or out-of-pocket business expense reimbursements.
              </p>
            </div>

            {/* SUB TOGGLE BUTTONS FOR FINANCIAL CLAIMS */}
            <div style={{ display: "flex", gap: "6px", background: "var(--bg-card-alt)", padding: "4px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
              <button
                type="button"
                className={`mem-btn ${claimsSubTab === "advance" ? "mem-btn--primary" : ""}`}
                style={{ padding: "6px 14px", fontSize: "12.5px", background: claimsSubTab === "advance" ? "var(--color-primary)" : "transparent", color: claimsSubTab === "advance" ? "#fff" : "var(--text-dark)" }}
                onClick={() => setClaimsSubTab("advance")}
              >
                💵 Advance Salary &amp; Loan
              </button>
              <button
                type="button"
                className={`mem-btn ${claimsSubTab === "expense" ? "mem-btn--primary" : ""}`}
                style={{ padding: "6px 14px", fontSize: "12.5px", background: claimsSubTab === "expense" ? "var(--color-primary)" : "transparent", color: claimsSubTab === "expense" ? "#fff" : "var(--text-dark)" }}
                onClick={() => setClaimsSubTab("expense")}
              >
                🧾 Expense Reimbursement
              </button>
            </div>
          </div>

          {claimsSubTab === "advance" ? (
            <form onSubmit={handleSubmitAdvance} className="mem-form">
              <div className="mem-form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div className="mem-form-group">
                  <label className="mem-form-label">
                    Requested Advance Amount (PKR / USD) <span style={{ color: "var(--color-danger)" }}>*</span>
                  </label>
                  <input
                    type="number"
                    min="500"
                    step="100"
                    className="mem-input"
                    placeholder="e.g. 25000"
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="mem-form-group">
                  <label className="mem-form-label">Target Payroll Deduction</label>
                  <select
                    className="mem-input"
                    value={advanceDeductionMonth}
                    onChange={(e) => setAdvanceDeductionMonth(e.target.value)}
                  >
                    <option value="Next Month Payroll">Deduct 100% in Next Month's Payroll</option>
                    <option value="2 Months Installments">Split in 2 Monthly Installments (50% / 50%)</option>
                    <option value="3 Months Installments">Split in 3 Monthly Installments (33% / 33% / 34%)</option>
                  </select>
                </div>
              </div>

              <div className="mem-form-group">
                <label className="mem-form-label">
                  Reason &amp; Emergency Details <span style={{ color: "var(--color-danger)" }}>*</span>
                </label>
                <textarea
                  className="mem-input"
                  rows="4"
                  placeholder="State the reason for requesting an advance salary / emergency loan..."
                  value={advanceReason}
                  onChange={(e) => setAdvanceReason(e.target.value)}
                  required
                />
              </div>

              <div className="mem-form-actions">
                <button type="submit" className="mem-btn mem-btn--primary" disabled={submittingAdvance}>
                  <Send size={16} /> {submittingAdvance ? "Submitting Request..." : "Submit Advance Salary Request"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmitExpense} className="mem-form">
              <div className="mem-form-grid mem-form-grid--3">
                <div className="mem-form-group">
                  <label className="mem-form-label">Expense Category</label>
                  <select
                    className="mem-input"
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                  >
                    <option value="Travel & Fuel">🚗 Travel, Fuel &amp; Conveyance</option>
                    <option value="Client Meeting & Meals">🍽 Client Meeting &amp; Meals</option>
                    <option value="Office Supplies & Stationary">📝 Office Supplies &amp; Stationary</option>
                    <option value="Software & Tools Subscriptions">💻 Software &amp; Tool Subscriptions</option>
                    <option value="Hardware & Equipment">🖥 Hardware &amp; Peripherals</option>
                    <option value="Medical & Health">🏥 Medical Expense</option>
                    <option value="Other Business Expense">📦 Other Business Expense</option>
                  </select>
                </div>

                <div className="mem-form-group">
                  <label className="mem-form-label">
                    Claim Amount (PKR / USD) <span style={{ color: "var(--color-danger)" }}>*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    className="mem-input"
                    placeholder="e.g. 4500"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="mem-form-group">
                  <label className="mem-form-label">Date Expense Incurred</label>
                  <input
                    type="date"
                    className="mem-input"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="mem-form-group">
                <label className="mem-form-label">
                  Expense Description &amp; Receipt Notes <span style={{ color: "var(--color-danger)" }}>*</span>
                </label>
                <textarea
                  className="mem-input"
                  rows="4"
                  placeholder="Provide detailed description of expense incurred, vendor name, invoice/receipt reference..."
                  value={expenseNotes}
                  onChange={(e) => setExpenseNotes(e.target.value)}
                  required
                />
              </div>

              <div className="mem-form-actions">
                <button type="submit" className="mem-btn mem-btn--primary" disabled={submittingExpense}>
                  <Send size={16} /> {submittingExpense ? "Submitting Claim..." : "Submit Expense Claim"}
                </button>
              </div>
            </form>
          )}

          {/* SUBMITTED FINANCIAL REQUESTS HISTORY TABLE */}
          <div style={{ marginTop: "28px", paddingTop: "20px", borderTop: "1px solid var(--border-color)" }}>
            <p className="mem-section-sub" style={{ margin: "0 0 12px" }}>
              <FileText size={16} /> Submitted Financial Requests &amp; Approval History
            </p>

            {memberRequests.length === 0 ? (
              <div className="mem-table-empty">
                No financial requests or expense claims submitted yet.
              </div>
            ) : (
              <div className="mem-table-wrap">
                <table className="mem-table">
                  <thead>
                    <tr>
                      <th>Request Type</th>
                      <th>Subject / Amount</th>
                      <th>Details</th>
                      <th>Status</th>
                      <th>Submitted Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberRequests.map((r) => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: "600", color: "var(--text-heading)" }}>{r.category}</td>
                        <td style={{ fontWeight: "600", color: "var(--text-dark)" }}>{r.subject}</td>
                        <td style={{ fontSize: "12px", color: "var(--text-secondary)", whiteSpace: "pre-line", maxWidth: "300px" }}>{r.details}</td>
                        <td>
                          <span className={`mem-badge ${r.status === "Approved" ? "mem-badge--success" : r.status === "Rejected" ? "mem-badge--danger" : "mem-badge--warning"}`}>
                            {r.status === "Approved" ? "✔ Approved" : r.status === "Rejected" ? "❌ Rejected" : "⏳ Pending Review"}
                          </span>
                        </td>
                        <td style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                          {r.created_at ? new Date(r.created_at).toLocaleDateString() : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "offer" && (
        <section className="mem-card" id="section-offer-salary">
          <div className="mem-card-header">
            <h2 className="mem-card-title"><FileText size={19} /> Accepted Offer Letter &amp; Salary Slips</h2>
            <p className="mem-card-desc">Your official employment offer details and monthly salary slip records.</p>
          </div>

          {offerLetter ? (
            <div className="mem-offer-banner">
              <h3>✔ Official Offer Letter Confirmed</h3>
              <p>Monthly Base Salary / Stipend: <strong>PKR/USD {offerLetter.base_salary?.toLocaleString()}</strong></p>
              <p>Employment Type: <strong>{offerLetter.employment_type || "Full-Time Enterprise"}</strong></p>
            </div>
          ) : (
            <div className="mem-offer-fallback">
              Monthly Base Salary / Stipend: <strong>PKR/USD {summary.accepted_stipend?.toLocaleString()}</strong> (Policy Standard)
            </div>
          )}

          <p className="mem-section-sub"><FileText size={15} /> Salary Slips Directory</p>
          {salarySlips.length === 0 ? (
            <p style={{ fontSize: "13.5px", color: "var(--text-muted)", padding: "12px 0" }}>No salary slips generated yet.</p>
          ) : (
            <div className="mem-table-wrap">
              <table className="mem-table">
                <thead>
                  <tr>
                    <th>Pay Period</th>
                    <th>Basic Salary</th>
                    <th>Net Paid</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {salarySlips.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: "600", color: "var(--text-heading)" }}>{s.month_year}</td>
                      <td>PKR/USD {s.basic_salary?.toLocaleString()}</td>
                      <td style={{ fontWeight: "700", color: "#15803d" }}>PKR/USD {s.net_salary?.toLocaleString()}</td>
                      <td>
                        <span className="mem-badge mem-badge--success">{s.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === "requests" && (
        <section className="mem-card" id="section-hr-forms">
          <div className="mem-card-header">
            <h2 className="mem-card-title"><FileText size={19} /> HR Forms &amp; Corporate Documents</h2>
            <p className="mem-card-desc">
              Access corporate HR policies, CNIC verification copies, and employment documents.
            </p>
          </div>

          <div className="mem-doc-grid">
            <div className="mem-doc-card">
              <div className="mem-doc-title">📄 Corporate Code of Conduct</div>
              <div className="mem-doc-meta">PDF Document • Verified</div>
            </div>
            <div className="mem-doc-card">
              <div className="mem-doc-title">📄 NDA &amp; Intellectual Property</div>
              <div className="mem-doc-meta">Signed &amp; Archival Verified</div>
            </div>
            <div className="mem-doc-card">
              <div className="mem-doc-title">📄 Health Insurance Policy 2026</div>
              <div className="mem-doc-meta">Active Standard Coverage</div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
