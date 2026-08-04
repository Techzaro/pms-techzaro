import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  List,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
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

function getInitials(name) {
  if (!name) return "EM";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function formatTimer(totalSecs) {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const WORLD_DATA = {
  "United States": {
    currency: "USD",
    symbol: "$",
    states: [
      "New York", "California", "Texas", "Florida", "Washington", "Illinois",
      "Pennsylvania", "Ohio", "Georgia", "North Carolina", "Virginia", "Massachusetts",
      "Michigan", "Colorado", "New Jersey", "Arizona", "Nevada", "Oregon"
    ],
    timezones: [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Anchorage",
      "Pacific/Honolulu"
    ]
  },
  "United Kingdom": {
    currency: "GBP",
    symbol: "£",
    states: ["England", "Scotland", "Wales", "Northern Ireland", "London Region", "Greater Manchester"],
    timezones: ["Europe/London"]
  },
  "Canada": {
    currency: "CAD",
    symbol: "$",
    states: ["Ontario", "Quebec", "British Columbia", "Alberta", "Manitoba", "Saskatchewan", "Nova Scotia"],
    timezones: ["America/Toronto", "America/Vancouver", "America/Edmonton"]
  },
  "United Arab Emirates": {
    currency: "AED",
    symbol: "AED",
    states: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"],
    timezones: ["Asia/Dubai"]
  },
  "Saudi Arabia": {
    currency: "SAR",
    symbol: "SR",
    states: ["Riyadh", "Makkah", "Eastern Province (Dammam)", "Madinah", "Asir", "Tabuk"],
    timezones: ["Asia/Riyadh"]
  },
  "Pakistan": {
    currency: "PKR",
    symbol: "Rs",
    states: ["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory", "Gilgit-Baltistan", "Azad Kashmir"],
    timezones: ["Asia/Karachi"]
  },
  "India": {
    currency: "INR",
    symbol: "₹",
    states: ["Maharashtra", "Karnataka", "Delhi NCT", "Tamil Nadu", "Telangana", "Gujarat", "Uttar Pradesh", "West Bengal", "Haryana", "Punjab"],
    timezones: ["Asia/Kolkata"]
  },
  "Germany": {
    currency: "EUR",
    symbol: "€",
    states: ["Bavaria", "North Rhine-Westphalia", "Baden-Württemberg", "Lower Saxony", "Hesse", "Berlin", "Hamburg", "Saxony"],
    timezones: ["Europe/Berlin"]
  },
  "Australia": {
    currency: "AUD",
    symbol: "$",
    states: ["New South Wales", "Victoria", "Queensland", "Western Australia", "South Australia", "Tasmania", "Australian Capital Territory"],
    timezones: ["Australia/Sydney", "Australia/Melbourne", "Australia/Perth"]
  },
  "Singapore": {
    currency: "SGD",
    symbol: "$",
    states: ["Central Region", "East Region", "North Region", "North-East Region", "West Region"],
    timezones: ["Asia/Singapore"]
  },
  "Japan": {
    currency: "JPY",
    symbol: "¥",
    states: ["Tokyo", "Osaka", "Kanagawa", "Aichi", "Hokkaido", "Fukuoka", "Kyoto"],
    timezones: ["Asia/Tokyo"]
  }
};

export default function Attendance() {
  const currentUser = getUser() || {};
  const [data, setData] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [timesheets, setTimesheets] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [snapshotModal, setSnapshotModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);

  // Admin Duty Web Clock State
  const [isAdminWorking, setIsAdminWorking] = useState(false);
  const [isAdminPaused, setIsAdminPaused] = useState(false);
  const [adminWorkSeconds, setAdminWorkSeconds] = useState(0);

  // Odoo Style View Mode: 'cards' (Kanban Grid) or 'table' (Data Table View)
  const [viewMode, setViewMode] = useState("cards");

  // Active Admin Tab State
  const [activeTab, setActiveTab] = useState("attendance");

  // Global HR Settings Modal State
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [country, setCountry] = useState("United States");
  const [state, setState] = useState("New York");
  const [currency, setCurrency] = useState("USD");
  const [timeZone, setTimeZone] = useState("America/New_York");
  const [payrollFreq, setPayrollFreq] = useState("Monthly");

  // Manual HR Attendance Modal State
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualUserId, setManualUserId] = useState("");
  const [manualDate, setManualDate] = useState(new Date().toISOString().split("T")[0]);
  const [manualStatus, setManualStatus] = useState("Present");
  const [manualWorkMode, setManualWorkMode] = useState("Office");
  const [manualClockIn, setManualClockIn] = useState("09:00");
  const [manualClockOut, setManualClockOut] = useState("17:00");
  const [manualNotes, setManualNotes] = useState("");

  // Rejection Reason Modal State
  const [rejectWfhTarget, setRejectWfhTarget] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Working Models / Shift Policy Form Modal State (Create & Edit)
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState(null);
  const [shiftName, setShiftName] = useState("Fixed Morning Shift");
  const [shiftType, setShiftType] = useState("Fixed");
  const [shiftStart, setShiftStart] = useState("09:00");
  const [shiftEnd, setShiftEnd] = useState("17:00");
  const [graceMins, setGraceMins] = useState(15);
  const [lateThresh, setLateThresh] = useState("09:15");
  const [weeklyHrs, setWeeklyHrs] = useState("40.0");
  const [ruleAutoAbsent, setRuleAutoAbsent] = useState(true);
  const [ruleIdleTimeout, setRuleIdleTimeout] = useState(15);
  const [ruleRemoteAllowed, setRuleRemoteAllowed] = useState(true);
  const [ruleOvertime, setRuleOvertime] = useState(true);
  const [ruleScreenshot, setRuleScreenshot] = useState(true);

  // Corporate Warnings & Department Settings State
  const [warnings, setWarnings] = useState([]);
  const [warningsSummary, setWarningsSummary] = useState({});
  const [deptSettings, setDeptSettings] = useState([]);
  const [maxLateAllowed, setMaxLateAllowed] = useState(3);
  const [removeWarningTarget, setRemoveWarningTarget] = useState(null);
  const [adminRemoveNotes, setAdminRemoveNotes] = useState("");
  const [warningStatusFilter, setWarningStatusFilter] = useState("All");

  // Request History, Search, & Filters State (Point 2)
  const [requestsHistory, setRequestsHistory] = useState({ corrections: [], leaves: [], wfhRequests: [], screenRequests: [], warningRemovals: [], memberRequests: [] });
  const [requestSearch, setRequestSearch] = useState("");
  const [requestCategoryFilter, setRequestCategoryFilter] = useState("All");
  const [requestStatusFilter, setRequestStatusFilter] = useState("All");

  const notify = (msg, kind = "success") => {
    setToast({ message: msg, kind });
    setTimeout(() => setToast(null), 4000);
  };

  // Dynamic SEO Document Title
  useEffect(() => {
    document.title = "Admin Command Center | TechXaro Global Enterprise HRM 2.0";
  }, []);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [attRes, leaveRes, tsRes, setRes, corrRes, shiftRes, warnRes, deptRes, reqHistRes] = await Promise.all([
        apiRequest("/hrm/attendance/today").catch(() => ({ success: false, users: [], attendances: [] })),
        apiRequest("/hrm/leaves").catch(() => ({ leaves: [] })),
        apiRequest("/hrm/timesheets").catch(() => ({ timesheets: [] })),
        apiRequest("/hrm/settings").catch(() => ({ settings: {} })),
        apiRequest("/hrm/attendance/corrections").catch(() => ({ corrections: [] })),
        apiRequest("/hrm/shifts").catch(() => ({ shifts: [] })),
        apiRequest("/hrm/warnings").catch(() => ({ warnings: [], summary: {} })),
        apiRequest("/hrm/departments/settings").catch(() => ({ departments: [] })),
        apiRequest("/hrm/requests-history").catch(() => ({ corrections: [], leaves: [], wfhRequests: [], screenRequests: [], warningRemovals: [], memberRequests: [] })),
      ]);
      if (attRes && attRes.users) {
        setData(attRes);
      }
      setLeaves(leaveRes.leaves || []);
      setTimesheets(tsRes.timesheets || []);
      setCorrections(corrRes.corrections || []);
      setShifts(shiftRes.shifts || []);
      setWarnings(warnRes.warnings || []);
      setWarningsSummary(warnRes.summary || {});
      setDeptSettings(deptRes.departments || []);
      if (reqHistRes) {
        setRequestsHistory(reqHistRes);
      }
      if (setRes && setRes.settings) {
        setSettings(setRes.settings);
        setCountry(setRes.settings.country || "United States");
        setState(setRes.settings.state || "New York");
        setCurrency(setRes.settings.currency || "USD");
        setTimeZone(setRes.settings.time_zone || "America/New_York");
        setPayrollFreq(setRes.settings.payroll_frequency || "Monthly");
      }

      // Restore Admin's own live duty status
      const myAtt = attRes.attendances?.find((a) => String(a.user_id) === String(currentUser.id));
      if (myAtt) {
        if (myAtt.clock_in && !myAtt.clock_out) {
          setIsAdminWorking(true);
          setIsAdminPaused(myAtt.status === "Paused");
        } else if (myAtt.clock_out) {
          setIsAdminWorking(false);
          setIsAdminPaused(false);
        }
      }
    } catch (err) {
      if (!silent) notify("Failed to load attendance directory.", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [currentUser.id]);

  // Real-time auto-refresh sync between Member & Admin (Every 5 Seconds)
  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Live Duty Ticker for Admin
  useEffect(() => {
    let timer = null;
    if (isAdminWorking && !isAdminPaused) {
      timer = setInterval(() => {
        setAdminWorkSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isAdminWorking, isAdminPaused]);

  // Admin Start Own Duty
  const handleStartAdminDuty = async () => {
    try {
      const res = await apiRequest("/hrm/attendance/clock-in", {
        method: "POST",
        body: JSON.stringify({ work_mode: "Office" }),
      });
      setIsAdminWorking(true);
      setIsAdminPaused(false);
      notify(res.message || "Admin Duty Started Successfully! 🚀");
      loadData();
    } catch (err) {
      notify(err.message || "Failed to start admin duty.", "error");
    }
  };

  // Admin Pause Duty
  const handlePauseAdminDuty = async () => {
    try {
      const res = await apiRequest("/hrm/attendance/pause-work", { method: "POST" });
      setIsAdminPaused(true);
      notify(res.message || "Admin Duty Paused (Break logged) ⏸");
      loadData();
    } catch (err) {
      notify(err.message || "Failed to pause admin duty.", "error");
    }
  };

  // Admin Resume Duty
  const handleResumeAdminDuty = async () => {
    try {
      const res = await apiRequest("/hrm/attendance/resume-work", { method: "POST" });
      setIsAdminPaused(false);
      notify(res.message || "Admin Duty Resumed ▶️");
      loadData();
    } catch (err) {
      notify(err.message || "Failed to resume admin duty.", "error");
    }
  };

  // Admin End Duty
  const handleEndAdminDuty = async () => {
    try {
      const res = await apiRequest("/hrm/attendance/clock-out", { method: "POST" });
      setIsAdminWorking(false);
      setIsAdminPaused(false);
      notify(res.message || "Admin Duty Ended. Great leadership today! ⏹");
      loadData();
    } catch (err) {
      notify(err.message || "Failed to end admin duty.", "error");
    }
  };

  // Open Modal to Create New Working Policy
  const handleOpenCreateShiftModal = () => {
    setEditingShiftId(null);
    setShiftName("Fixed Morning Shift");
    setShiftType("Fixed");
    setShiftStart("09:00");
    setShiftEnd("17:00");
    setGraceMins(15);
    setLateThresh("09:15");
    setMaxLateAllowed(3);
    setWeeklyHrs("40.0");
    setRuleAutoAbsent(true);
    setRuleIdleTimeout(15);
    setRuleRemoteAllowed(true);
    setRuleOvertime(true);
    setRuleScreenshot(true);
    setShiftModalOpen(true);
  };

  // Open Modal to Edit Existing Working Policy
  const handleOpenEditShiftModal = (s) => {
    setEditingShiftId(s.id);
    setShiftName(s.name || "");
    setShiftType(s.shift_type || "Fixed");
    setShiftStart(s.shift_start ? s.shift_start.substring(0, 5) : "09:00");
    setShiftEnd(s.shift_end ? s.shift_end.substring(0, 5) : "17:00");
    setGraceMins(s.grace_minutes || 15);
    setLateThresh(s.late_threshold ? s.late_threshold.substring(0, 5) : "09:15");
    setMaxLateAllowed(s.max_late_allowed || 3);
    setWeeklyHrs(s.weekly_hours || "40.0");

    let rules = {};
    try {
      rules = typeof s.rules_json === "string" ? JSON.parse(s.rules_json) : (s.rules_json || {});
    } catch (e) {}

    setRuleAutoAbsent(rules.auto_absent !== false);
    setRuleIdleTimeout(rules.idle_timeout_mins || 15);
    setRuleRemoteAllowed(rules.remote_allowed !== false);
    setRuleOvertime(rules.overtime_allowed !== false);
    setRuleScreenshot(rules.screenshot_required !== false);
    setShiftModalOpen(true);
  };

  // Save Working Shift Template Policy (Create or Update)
  const handleSaveShiftPolicy = async (e) => {
    e.preventDefault();
    const payload = {
      name: shiftName,
      shift_type: shiftType,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      grace_minutes: Number(graceMins),
      late_threshold: lateThresh,
      max_late_allowed: Number(maxLateAllowed),
      weekly_hours: Number(weeklyHrs),
      rules: {
        auto_absent: ruleAutoAbsent,
        idle_timeout_mins: Number(ruleIdleTimeout),
        remote_allowed: ruleRemoteAllowed,
        overtime_allowed: ruleOvertime,
        screenshot_required: ruleScreenshot,
      },
    };

    try {
      if (editingShiftId) {
        await apiRequest(`/hrm/shifts/${editingShiftId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        notify("Working Policy updated successfully ✔");
      } else {
        await apiRequest("/hrm/shifts", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        notify("New Working Policy Template created successfully ✔");
      }
      setShiftModalOpen(false);
      loadData();
    } catch (err) {
      notify(err.message || "Failed to save working policy.", "error");
    }
  };

  // Sync Department Settings with Current Active Policy
  const handleSyncDepartmentPolicy = async (shiftId = null) => {
    try {
      const res = await apiRequest("/hrm/departments/sync-policy", {
        method: "POST",
        body: JSON.stringify({ shift_id: shiftId }),
      });
      notify(res.message || "All department settings updated with current policy ✔");
      loadData();
    } catch (err) {
      notify(err.message || "Failed to sync department settings.", "error");
    }
  };

  // Admin Confirm Remove Warning from Account
  const handleAdminConfirmRemoveWarning = async (e) => {
    e.preventDefault();
    if (!removeWarningTarget) return;
    try {
      const res = await apiRequest(`/hrm/warnings/${removeWarningTarget.id}/remove`, {
        method: "POST",
        body: JSON.stringify({ admin_notes: adminRemoveNotes }),
      });
      notify(res.message || "Policy warning successfully removed from member account ✔");
      setRemoveWarningTarget(null);
      setAdminRemoveNotes("");
      loadData();
    } catch (err) {
      notify(err.message || "Failed to remove warning.", "error");
    }
  };

  // Admin Reject Warning Removal Request
  const handleAdminRejectWarningRemoval = async (warningId) => {
    try {
      const res = await apiRequest(`/hrm/warnings/${warningId}/reject`, {
        method: "POST",
        body: JSON.stringify({ admin_notes: "Removal request declined by management." }),
      });
      notify(res.message || "Warning removal request declined.");
      loadData();
    } catch (err) {
      notify(err.message || "Failed to decline removal request.", "error");
    }
  };

  // Set Policy as Active Organization Policy
  const handleActivateShiftPolicy = async (id) => {
    try {
      const res = await apiRequest(`/hrm/shifts/${id}/activate`, { method: "POST" });
      notify(res.message || "Working Policy implemented for organization ✔");
      loadData();
    } catch (err) {
      notify(err.message || "Failed to activate policy.", "error");
    }
  };

  // Delete Working Policy Template
  const handleDeleteShiftPolicy = async (id) => {
    if (!window.confirm("Are you sure you want to delete this working policy template?")) return;
    try {
      await apiRequest(`/hrm/shifts/${id}`, { method: "DELETE" });
      notify("Working Policy deleted ✔");
      loadData();
    } catch (err) {
      notify(err.message || "Failed to delete working policy.", "error");
    }
  };

  // Dynamic Country Selection Handler
  const handleCountryChange = (newCountry) => {
    setCountry(newCountry);
    const data = WORLD_DATA[newCountry];
    if (data) {
      if (data.states && data.states.length > 0) {
        setState(data.states[0]);
      }
      if (data.currency) {
        setCurrency(data.currency);
      }
      if (data.timezones && data.timezones.length > 0) {
        setTimeZone(data.timezones[0]);
      }
    }
  };

  // Auto Fetch United States Standard Enterprise Defaults
  const handleAutoFetchUsDefaults = () => {
    setCountry("United States");
    setState("New York");
    setCurrency("USD");
    setTimeZone("America/New_York");
    setPayrollFreq("Monthly");
    notify("🇺🇸 United States Standard Enterprise Defaults loaded!");
  };

  // HR Save Global Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      const res = await apiRequest("/hrm/settings", {
        method: "POST",
        body: JSON.stringify({
          country,
          state,
          currency,
          time_zone: timeZone,
          payroll_frequency: payrollFreq,
        }),
      });
      if (res && res.settings) {
        setSettings(res.settings);
        setCountry(res.settings.country || country);
        setState(res.settings.state || state);
        setCurrency(res.settings.currency || currency);
        setTimeZone(res.settings.time_zone || timeZone);
        setPayrollFreq(res.settings.payroll_frequency || payrollFreq);
      }
      notify(res.message || "Global Enterprise HR Settings saved successfully ✔");
      setSettingsModalOpen(false);
      loadData();
    } catch (err) {
      notify(err.message || "Failed to save HR settings.", "error");
    }
  };

  // HR Save Manual Attendance Entry / Override
  const handleSaveManualAttendance = async (e) => {
    e.preventDefault();
    if (!manualUserId) {
      notify("Please select an employee.", "error");
      return;
    }
    try {
      const res = await apiRequest("/hrm/attendance/manual", {
        method: "POST",
        body: JSON.stringify({
          user_id: manualUserId,
          date: manualDate,
          status: manualStatus,
          work_mode: manualWorkMode,
          clock_in: manualClockIn ? `${manualClockIn}:00` : "09:00:00",
          clock_out: manualClockOut ? `${manualClockOut}:00` : "17:00:00",
          notes: manualNotes,
        }),
      });
      notify(res.message || "Manual attendance record saved successfully ✔");
      setManualModalOpen(false);
      loadData();
    } catch (err) {
      notify(err.message || "Failed to mark manual attendance.", "error");
    }
  };

  // Send Admin Real-Time Screen Verification Request
  const handleRequestLiveScreen = async (userId) => {
    try {
      const res = await apiRequest("/hrm/screen-requests", {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      });
      notify(res.message || "Real-time Screen Verification Request sent to employee ✔");
    } catch (err) {
      notify(err.message || "Failed to send screen request.", "error");
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
  const activePolicy = data?.activePolicy || shifts.find((s) => s.is_active === true || String(s.is_active) === "1") || shifts[0] || {};

  // Unified Request History Memoization for Stats + Member Search & Filters (Point 2)
  const allRequestsUnified = useMemo(() => {
    const list = [];

    // 1. Leave Applications
    (leaves || []).forEach((l) => {
      list.push({
        id: `leave-${l.id}`,
        rawId: l.id,
        category: "Leave Application",
        icon: "🌴",
        user_name: l.user_name || "Employee",
        user_email: l.user_email || "",
        department: l.department || "General",
        details: `${l.leave_type} (${l.start_date} to ${l.end_date}) — ${l.total_days} Days`,
        reason: l.reason || "N/A",
        status: l.status,
        reviewer_name: l.reviewer_name || null,
        rejection_reason: l.rejection_reason || null,
        created_at: l.created_at,
        type: "leave",
      });
    });

    // 2. WFH Authorization Requests
    const wfhAll = (wfhRequests || []).concat(requestsHistory.wfhRequests || []);
    wfhAll.forEach((w) => {
      if (!list.some((item) => item.id === `wfh-${w.id}`)) {
        const u = (users || []).find((usr) => String(usr.id) === String(w.user_id));
        list.push({
          id: `wfh-${w.id}`,
          rawId: w.id,
          category: "WFH Authorization",
          icon: "🏡",
          user_name: w.user_name || u?.name || "Employee",
          user_email: w.user_email || u?.email || "",
          department: w.department || u?.department || "General",
          details: `WFH Authorization for ${w.request_date}`,
          reason: w.reason || "Remote Work Authorization",
          status: w.status,
          reviewer_name: null,
          rejection_reason: w.rejection_reason || null,
          created_at: w.created_at,
          type: "wfh",
        });
      }
    });

    // 3. Attendance Corrections
    (corrections || []).forEach((c) => {
      list.push({
        id: `corr-${c.id}`,
        rawId: c.id,
        category: "Attendance Correction",
        icon: "⏱️",
        user_name: c.user_name || "Employee",
        user_email: c.user_email || "",
        department: c.department || "General",
        details: `Correction for ${c.date} (${c.requested_clock_in} - ${c.requested_clock_out || 'N/A'})`,
        reason: c.reason || "Duty Session Adjustment",
        status: c.status,
        reviewer_name: null,
        rejection_reason: null,
        created_at: c.created_at,
        type: "correction",
      });
    });

    // 4. Warning Removal Reasons
    (warnings || []).filter(w => w.status === "Removal Requested" || w.status === "Removed").forEach((w) => {
      list.push({
        id: `warn-${w.id}`,
        rawId: w.id,
        category: "Warning Removal Reason",
        icon: "⚠️",
        user_name: w.user_name || "Employee",
        user_email: w.user_email || "",
        department: w.department || "General",
        details: `Late Arrival Warning Removal (${w.late_count} Late Days)`,
        reason: w.removal_reason || "Online Justification",
        status: w.status === "Removed" ? "Approved" : w.status === "Removal Requested" ? "Pending" : w.status,
        reviewer_name: w.removed_by_name || null,
        rejection_reason: w.admin_notes || null,
        created_at: w.removal_requested_at || w.created_at,
        type: "warning",
      });
    });

    // 5. Member HR Form Requests
    (requestsHistory.memberRequests || []).forEach((m) => {
      list.push({
        id: `member-${m.id}`,
        rawId: m.id,
        category: "Member HR Form",
        icon: "📝",
        user_name: m.user_name || "Employee",
        user_email: m.user_email || "",
        department: m.department || "General",
        details: `[${m.category}] ${m.subject}`,
        reason: m.details || "N/A",
        status: m.status,
        reviewer_name: null,
        rejection_reason: null,
        created_at: m.created_at,
        type: "member_form",
      });
    });

    return list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [leaves, wfhRequests, requestsHistory, users, corrections, warnings]);

  const requestsStats = useMemo(() => {
    const pending = allRequestsUnified.filter((r) => r.status === "Pending").length;
    const approved = allRequestsUnified.filter((r) => r.status === "Approved" || r.status === "Removed").length;
    const rejected = allRequestsUnified.filter((r) => r.status === "Rejected" || r.status === "Declined").length;
    return {
      pending,
      approved,
      rejected,
      total: allRequestsUnified.length,
    };
  }, [allRequestsUnified]);

  const filteredUnifiedRequests = useMemo(() => {
    return allRequestsUnified.filter((req) => {
      const query = requestSearch.toLowerCase().trim();
      const matchesSearch = !query || (
        (req.user_name && req.user_name.toLowerCase().includes(query)) ||
        (req.user_email && req.user_email.toLowerCase().includes(query)) ||
        (req.department && req.department.toLowerCase().includes(query)) ||
        (req.reason && req.reason.toLowerCase().includes(query)) ||
        (req.details && req.details.toLowerCase().includes(query))
      );

      const matchesCategory = requestCategoryFilter === "All" || req.category === requestCategoryFilter;
      const matchesStatus = requestStatusFilter === "All" ||
        (requestStatusFilter === "Pending" && req.status === "Pending") ||
        (requestStatusFilter === "Approved" && (req.status === "Approved" || req.status === "Removed")) ||
        (requestStatusFilter === "Rejected" && (req.status === "Rejected" || req.status === "Declined"));

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [allRequestsUnified, requestSearch, requestCategoryFilter, requestStatusFilter]);

  const officeCount = attendances.filter((a) => a.work_mode === "Office" && a.clock_in && !a.clock_out).length;
  const wfhCount = attendances.filter((a) => a.work_mode === "WFH" && a.clock_in && !a.clock_out).length;
  const pausedCount = attendances.filter((a) => a.status === "Paused").length;
  const leaveCount = leaves.filter((l) => l.status === "Approved").length;

  const pendingWfhCount = wfhRequests.filter((w) => w.status === "Pending").length;
  const pendingLeavesCount = leaves.filter((l) => l.status === "Pending").length;
  const pendingCorrectionsCount = corrections.filter((c) => c.status === "Pending").length;
  const pendingTimesheetsCount = timesheets.filter((t) => t.status === "Submitted").length;

  const pendingTotal = requestsStats.pending;

  const filteredUsers = users.filter((u) => {
    const s = search.toLowerCase();
    return (
      (u.name || "").toLowerCase().includes(s) ||
      (u.email || "").toLowerCase().includes(s) ||
      (u.department || "").toLowerCase().includes(s)
    );
  });

  return (
    <main className="att-page" id="admin-attendance-page">
      <Breadcrumb items={[{ label: "Enterprise HRM", path: "/admin/hrm/attendance" }, { label: "Attendance Command Center" }]} />
      {toast && <div className={`att-toast att-toast--${toast.kind}`} role="alert">{toast.message}</div>}

      {/* COMMAND CENTER HEADER */}
      <header className="att-header" id="admin-att-header">
        <div>
          <div className="att-title-row">
            <h1>Global Enterprise HRM 2.0 Command Center</h1>
            <span className="att-live-pill"><ShieldAlert size={14} /> Implemented Policy: <strong>{activePolicy.name || "Standard Working Policy"}</strong></span>
          </div>
          <p>Real-time employee punches, hardware screen snapshots, working models policy engine, and pending approvals queue.</p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button id="btn-global-hr-config" className="att-btn" style={{ background: "#475569", color: "#fff" }} onClick={() => setSettingsModalOpen(true)}>
            <Sliders size={16} /> Global HR Config
          </button>
          <button id="btn-refresh-live-data" className="att-btn att-btn--primary" onClick={() => loadData()}>
            <RefreshCw size={16} /> Refresh Live Data
          </button>
        </div>
      </header>

      {/* ADMIN OWN DUTY WEB CLOCK CONTROL BANNER */}
      <section className="att-card" style={{ marginBottom: "20px", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "16px", color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
              <Briefcase size={20} color="#38bdf8" /> Admin Duty Web Clock ({currentUser.name || "Admin"})
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#94a3b8" }}>
              Start/pause your executive shift duty directly from the Command Center.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "11px", color: "#94a3b8" }}>Admin Duty Elapsed:</div>
              <div style={{ fontSize: "20px", fontWeight: "800", color: "#38bdf8" }}>{formatTimer(adminWorkSeconds)}</div>
            </div>

            <span style={{ padding: "6px 12px", borderRadius: "20px", fontSize: "11.5px", fontWeight: "700", background: isAdminPaused ? "#f59e0b" : isAdminWorking ? "#10b981" : "#475569", color: "#fff" }}>
              {isAdminPaused ? "⏸ PAUSED" : isAdminWorking ? "🟢 ON DUTY" : "⏹ OFF DUTY"}
            </span>

            <div style={{ display: "flex", gap: "6px" }}>
              {!isAdminWorking ? (
                <button id="btn-admin-start-duty" className="att-btn" style={{ background: "#10b981", color: "#fff", fontWeight: "700" }} onClick={handleStartAdminDuty}>
                  <Play size={16} /> ▶️ Start Duty
                </button>
              ) : (
                <>
                  {isAdminPaused ? (
                    <button id="btn-admin-resume-duty" className="att-btn" style={{ background: "#3b82f6", color: "#fff", fontWeight: "700" }} onClick={handleResumeAdminDuty}>
                      <Play size={16} /> ▶️ Resume
                    </button>
                  ) : (
                    <button id="btn-admin-pause-duty" className="att-btn" style={{ background: "#f59e0b", color: "#fff", fontWeight: "700" }} onClick={handlePauseAdminDuty}>
                      <Pause size={16} /> ⏸ Pause
                    </button>
                  )}

                  <button id="btn-admin-end-duty" className="att-btn" style={{ background: "#ef4444", color: "#fff", fontWeight: "700" }} onClick={handleEndAdminDuty}>
                    <UserX size={16} /> ⏹ End Duty
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ADMIN LIVE WORKFORCE ANALYTICS GRID */}
      <section className="att-stats-grid" id="admin-stats-overview" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "24px" }}>
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
          <span style={{ fontSize: "11px", color: "#64748b" }}>Active Working Policies</span>
          <h3 style={{ margin: "2px 0 0", fontSize: "20px", color: "#0f172a" }}>⚙️ {shifts.length} Shifts</h3>
        </div>

        <div style={{ background: pendingTotal > 0 ? "#fffbeb" : "#fff", border: pendingTotal > 0 ? "1px solid #fde68a" : "1px solid #e2e8f0", borderRadius: "10px", padding: "14px" }}>
          <span style={{ fontSize: "11px", color: pendingTotal > 0 ? "#b45309" : "#64748b" }}>Pending Approvals</span>
          <h3 style={{ margin: "2px 0 0", fontSize: "20px", color: pendingTotal > 0 ? "#b45309" : "#0f172a" }}>⏳ {pendingTotal} Queue</h3>
        </div>
      </section>

      {/* MULTI-TAB NAVIGATION BAR */}
      <nav className="att-tabs-nav" id="admin-tabs-navigation">
        <button id="tab-live-attendance" className={`att-tab-btn ${activeTab === "attendance" ? "active" : ""}`} onClick={() => setActiveTab("attendance")}>
          <Calendar size={18} /> Today's Live Attendance &amp; Snapshots
        </button>

        <button id="tab-manual-attendance" className={`att-tab-btn ${activeTab === "manual" ? "active" : ""}`} onClick={() => setActiveTab("manual")}>
          <Edit3 size={18} color="#0082ff" /> Manual HR Entry &amp; Roster ({users.length})
        </button>

        <button id="tab-pending-approvals" className={`att-tab-btn ${activeTab === "pending" ? "active" : ""}`} onClick={() => setActiveTab("pending")}>
          <AlertTriangle size={18} /> Pending Approvals Queue
          {pendingTotal > 0 && <span className="att-tab-badge">{pendingTotal}</span>}
        </button>

        <button id="tab-working-shifts" className={`att-tab-btn ${activeTab === "shifts" ? "active" : ""}`} onClick={() => setActiveTab("shifts")}>
          <Clock size={18} /> Working Models &amp; Shifts Configuration
        </button>

        <button id="tab-corporate-warnings" className={`att-tab-btn ${activeTab === "warnings" ? "active" : ""}`} onClick={() => setActiveTab("warnings")}>
          <AlertTriangle size={18} color="#ef4444" /> Policy Warnings &amp; Removal Center
          {(warningsSummary.pending_removal_requests > 0 || warningsSummary.active_warnings > 0) && (
            <span className="att-tab-badge" style={{ background: warningsSummary.pending_removal_requests > 0 ? "#f59e0b" : "#ef4444" }}>
              {warningsSummary.pending_removal_requests || warningsSummary.active_warnings}
            </span>
          )}
        </button>

        <button id="tab-department-summary" className={`att-tab-btn ${activeTab === "departments" ? "active" : ""}`} onClick={() => setActiveTab("departments")}>
          <Building2 size={18} /> Department &amp; Branch Summary
        </button>

        <button id="tab-executive-alerts" className={`att-tab-btn ${activeTab === "alerts" ? "active" : ""}`} onClick={() => setActiveTab("alerts")}>
          <Bell size={18} /> Executive Alerts &amp; Anniversaries
        </button>
      </nav>

      {/* SEARCH & ODOO VIEW MODE TOOLBAR */}
      <div className="att-toolbar" id="admin-search-toolbar">
        <div className="att-search-box">
          <Search size={18} color="#64748b" />
          <input
            id="admin-search-input"
            type="text"
            placeholder="Search employee by name, department, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search employees"
          />
        </div>

        {activeTab === "attendance" && (
          <div className="att-view-toggle">
            <button className={`att-view-btn ${viewMode === "cards" ? "active" : ""}`} onClick={() => setViewMode("cards")}>
              <LayoutGrid size={16} /> Kanban Cards
            </button>
            <button className={`att-view-btn ${viewMode === "table" ? "active" : ""}`} onClick={() => setViewMode("table")}>
              <List size={16} /> Data Table
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: TODAY'S LIVE ATTENDANCE MATRIX */}
      {activeTab === "attendance" && (
        <section className="att-card" id="section-live-attendance-matrix">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 className="att-card-title" style={{ margin: 0 }}>
              <Calendar size={20} color="#0082ff" /> Today's Staff Punch Matrix &amp; Hardware Snapshots ({data?.today})
            </h2>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              Total Active Employees: <strong>{filteredUsers.length}</strong>
            </span>
          </div>

          {loading ? (
            <div style={{ padding: "30px", textAlign: "center" }}>
              <div className="att-spinner" />
              <p style={{ fontSize: "13px", color: "#64748b" }}>Syncing Live Punch Logs...</p>
            </div>
          ) : viewMode === "cards" ? (
            /* ODOO KANBAN CARDS VIEW */
            <div className="att-kanban-grid">
              {filteredUsers.map((u) => {
                const att = attendances.find((a) => String(a.user_id) === String(u.id));
                const wfh = wfhRequests.find((w) => String(w.user_id) === String(u.id));
                const userSnaps = snapshots.filter((s) => String(s.user_id) === String(u.id));

                const isLiveNow = att?.clock_in && !att?.clock_out && att?.status !== "Paused";
                const isPaused = att?.status === "Paused";

                return (
                  <div key={u.id} className="att-kanban-card">
                    <div>
                      {/* CARD HEADER */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div className="att-avatar-circle">{getInitials(u.name)}</div>
                          <div>
                            <h3 style={{ margin: 0, fontSize: "14.5px", color: "#0f172a", fontWeight: "700" }}>{u.name}</h3>
                            <span style={{ fontSize: "11px", color: "#64748b" }}>{u.department || "Engineering"} • {u.role}</span>
                          </div>
                        </div>

                        <span className={`att-pulse-dot ${isLiveNow ? "att-pulse-dot--live" : isPaused ? "att-pulse-dot--paused" : "att-pulse-dot--off"}`} title={isLiveNow ? "Live Working" : isPaused ? "Paused" : "Off"} />
                      </div>

                      {/* WORK MODE & SHIFT BADGES */}
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
                        <span style={{ padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", background: att?.work_mode === "WFH" ? "#eff6ff" : "#f8fafc", color: att?.work_mode === "WFH" ? "#1d4ed8" : "#475569", border: "1px solid #cbd5e1" }}>
                          {att?.work_mode === "WFH" ? "🏡 Remote WFH" : "🏢 Office"}
                        </span>
                        <span style={{ padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600", background: "#f1f5f9", color: "#475569" }}>
                          Policy A Shift
                        </span>
                      </div>

                      {/* PUNCH TIMESTAMPS */}
                      <div style={{ background: "#f8fafc", padding: "10px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px", marginBottom: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                          <span style={{ color: "#64748b" }}>Opening Time:</span>
                          <strong>{att?.clock_in || "Not Clocked In"}</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                          <span style={{ color: "#64748b" }}>Closing Time:</span>
                          <strong style={{ color: isLiveNow ? "#10b981" : isPaused ? "#f59e0b" : "#0f172a" }}>
                            {att?.clock_out ? att.clock_out : isPaused ? "⏸ PAUSED" : isLiveNow ? "🟢 LIVE" : "Off"}
                          </strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #e2e8f0", paddingTop: "4px", marginTop: "4px" }}>
                          <span style={{ color: "#64748b" }}>Net Worked:</span>
                          <strong style={{ color: "#0082ff" }}>
                            {att?.work_duration_minutes ? `${Math.floor(att.work_duration_minutes / 60)}h ${att.work_duration_minutes % 60}m` : isLiveNow ? "Active Session" : "0h 0m"}
                          </strong>
                        </div>
                      </div>

                      {/* SCREEN PROOF SNAPSHOT PREVIEW THUMBNAIL */}
                      {userSnaps.length > 0 ? (
                        <div style={{ marginBottom: "12px" }}>
                          <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "4px" }}>Latest Hardware Screen Proof:</div>
                          <div
                            style={{ position: "relative", cursor: "pointer", borderRadius: "6px", overflow: "hidden", border: "1px solid #cbd5e1" }}
                            onClick={() => setSnapshotModal(userSnaps[0])}
                          >
                            <img src={userSnaps[0].snapshot_data} alt="Proof" style={{ width: "100%", height: "90px", objectFit: "cover", display: "block" }} />
                            <div style={{ position: "absolute", bottom: "4px", right: "6px", background: "rgba(15,23,42,0.8)", color: "#fff", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: "600" }}>
                              📸 Click to Expand
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ background: "#f8fafc", padding: "8px", borderRadius: "6px", border: "1px dashed #cbd5e1", textAlign: "center", fontSize: "11px", color: "#94a3b8", marginBottom: "12px" }}>
                          No Screen Proof Captured
                        </div>
                      )}
                    </div>

                    {/* CARD FOOTER ACTIONS */}
                    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "10px", display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "space-between" }}>
                      {isLiveNow && (
                        <button
                          style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#10b981", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "3px" }}
                          onClick={() => handleRequestLiveScreen(u.id)}
                        >
                          <Laptop size={13} /> Request Screen
                        </button>
                      )}

                      {wfh && wfh.status === "Pending" && (
                        <>
                          <button style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#10b981", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }} onClick={() => handleApproveWfh(wfh.id)}>✔ WFH</button>
                          <button style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }} onClick={() => { setRejectWfhTarget(wfh); setRejectionReason(""); }}>Not Approved</button>
                        </>
                      )}

                      <button
                        style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "600", background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", borderRadius: "4px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "3px" }}
                        onClick={() => setHistoryModal(u)}
                      >
                        <FileText size={13} /> History
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* DATA TABLE VIEW WITH TOUCH SCROLL */
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
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600", background: att?.work_mode === "WFH" ? "#eff6ff" : "#f8fafc", color: att?.work_mode === "WFH" ? "#1d4ed8" : "#475569" }}>
                            {att?.work_mode === "WFH" ? "🏡 Work From Home" : "🏢 Office"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div>🕒 In: <strong>{att?.clock_in || "Not Clocked In"}</strong></div>
                          <div>🛑 Out: <strong>{att?.clock_out ? att.clock_out : isPaused ? "⏸ PAUSED" : isLiveNow ? "🟢 LIVE" : "Off"}</strong></div>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {wfh ? (
                            <span style={{ padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600", background: wfh.status === "Approved" ? "#f0fdf4" : wfh.status === "Pending" ? "#fffbeb" : "#fef2f2", color: wfh.status === "Approved" ? "#166534" : wfh.status === "Pending" ? "#92400e" : "#991b1b" }}>
                              {wfh.status === "Approved" ? "✔ Approved" : wfh.status === "Pending" ? "⏳ Pending HR" : "❌ Rejected"}
                            </span>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#94a3b8" }}>No WFH Request</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {userSnaps.length > 0 ? (
                            <button style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "600", background: "#0082ff", color: "#fff", border: "none", borderRadius: "5px", cursor: "pointer" }} onClick={() => setSnapshotModal(userSnaps[0])}>
                              View Proof ({userSnaps.length})
                            </button>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#94a3b8" }}>No Proof</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <button style={{ padding: "4px 8px", fontSize: "11px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "4px", cursor: "pointer" }} onClick={() => setHistoryModal(u)}>
                            History
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: PENDING & HISTORICAL APPROVALS ENGINE (Stats + Full History + Search & Filter) */}
      {activeTab === "pending" && (
        <section className="att-pending-queue" id="section-pending-approvals" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* STATS OVERVIEW HEADER */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "14px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#b45309", display: "block", marginBottom: "2px" }}>⏳ Pending Action Queue</span>
              <h3 style={{ margin: 0, fontSize: "22px", color: "#d97706" }}>{requestsStats.pending} Requests</h3>
            </div>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "14px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#166534", display: "block", marginBottom: "2px" }}>✅ Approved &amp; Granted</span>
              <h3 style={{ margin: 0, fontSize: "22px", color: "#16a34a" }}>{requestsStats.approved} Requests</h3>
            </div>
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "14px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#991b1b", display: "block", marginBottom: "2px" }}>❌ Rejected / Declined</span>
              <h3 style={{ margin: 0, fontSize: "22px", color: "#dc2626" }}>{requestsStats.rejected} Requests</h3>
            </div>
            <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "10px", padding: "14px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "2px" }}>📊 Total Logged Request History</span>
              <h3 style={{ margin: 0, fontSize: "22px", color: "#0f172a" }}>{requestsStats.total} Requests</h3>
            </div>
          </div>

          {/* SEARCH & FILTER BAR FOR ANY MEMBER */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px", display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "260px" }}>
              <Search size={20} color="#64748b" />
              <input
                type="text"
                className="att-input"
                style={{ width: "100%", padding: "8px 12px" }}
                placeholder="Search requests by member name, email, department, or reason..."
                value={requestSearch}
                onChange={(e) => setRequestSearch(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <select
                className="att-input"
                style={{ padding: "8px 12px", borderRadius: "6px" }}
                value={requestCategoryFilter}
                onChange={(e) => setRequestCategoryFilter(e.target.value)}
              >
                <option value="All">All Request Categories</option>
                <option value="Leave Application">🌴 Leave Applications</option>
                <option value="WFH Authorization">🏡 WFH Requests</option>
                <option value="Attendance Correction">⏱️ Attendance Corrections</option>
                <option value="Warning Removal Reason">⚠️ Warning Removal Reasons</option>
                <option value="Member HR Form">📝 Member HR Forms</option>
              </select>

              <select
                className="att-input"
                style={{ padding: "8px 12px", borderRadius: "6px" }}
                value={requestStatusFilter}
                onChange={(e) => setRequestStatusFilter(e.target.value)}
              >
                <option value="All">All Statuses</option>
                <option value="Pending">⏳ Pending Only</option>
                <option value="Approved">✅ Approved Only</option>
                <option value="Rejected">❌ Rejected Only</option>
              </select>
            </div>
          </div>

          {/* HISTORICAL REQUESTS TABLE */}
          <div className="att-card" style={{ padding: "0", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "12px 14px", color: "#475569" }}>Member / Employee</th>
                    <th style={{ padding: "12px 14px", color: "#475569" }}>Request Type</th>
                    <th style={{ padding: "12px 14px", color: "#475569" }}>Request Details</th>
                    <th style={{ padding: "12px 14px", color: "#475569" }}>Reason / Justification</th>
                    <th style={{ padding: "12px 14px", color: "#475569" }}>Status &amp; Audit Trail</th>
                    <th style={{ padding: "12px 14px", color: "#475569", textAlign: "right" }}>HR Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUnifiedRequests.map((req) => (
                    <tr key={req.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontWeight: "700", color: "#0f172a" }}>{req.user_name}</div>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>{req.user_email} • <strong>{req.department}</strong></div>
                      </td>

                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", background: "#eff6ff", color: "#1d4ed8", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          {req.icon} {req.category}
                        </span>
                      </td>

                      <td style={{ padding: "12px 14px", fontWeight: "600", color: "#334155" }}>
                        {req.details}
                        {req.created_at && (
                          <div style={{ fontSize: "10.5px", color: "#94a3b8", fontWeight: "400", marginTop: "2px" }}>
                            Submitted: {new Date(req.created_at).toLocaleString()}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: "12px 14px", color: "#475569", maxWidth: "260px" }}>
                        <div style={{ background: "#f8fafc", padding: "6px 10px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "12px" }}>
                          "{req.reason}"
                        </div>
                      </td>

                      <td style={{ padding: "12px 14px" }}>
                        {req.status === "Pending" && (
                          <span style={{ padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", background: "#fef3c7", color: "#92400e" }}>
                            ⏳ Pending HR Review
                          </span>
                        )}
                        {(req.status === "Approved" || req.status === "Removed") && (
                          <div>
                            <span style={{ padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", background: "#dcfce7", color: "#166534" }}>
                              ✅ {req.status === "Removed" ? "Warning Removed" : "Approved"}
                            </span>
                            {req.reviewer_name && (
                              <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "2px" }}>
                                Reviewed By: {req.reviewer_name}
                              </div>
                            )}
                          </div>
                        )}
                        {(req.status === "Rejected" || req.status === "Declined") && (
                          <div>
                            <span style={{ padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", background: "#fee2e2", color: "#991b1b" }}>
                              Not Approved
                            </span>
                            {req.rejection_reason && (
                              <div style={{ fontSize: "10.5px", color: "#991b1b", marginTop: "2px" }}>
                                Reason: {req.rejection_reason}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        {req.status === "Pending" ? (
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                            {req.type === "leave" && (
                              <>
                                <button style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#10b981", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }} onClick={() => handleRespondLeave(req.rawId, "Approved")}>✔ Approve</button>
                                <button style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }} onClick={() => handleRespondLeave(req.rawId, "Rejected")}>Not Approved</button>
                              </>
                            )}
                            {req.type === "wfh" && (
                              <>
                                <button style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#10b981", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }} onClick={() => handleApproveWfh(req.rawId)}>✔ Approve</button>
                                <button style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }} onClick={() => { setRejectWfhTarget({ id: req.rawId }); setRejectionReason(""); }}>❌ Reject</button>
                              </>
                            )}
                            {req.type === "correction" && (
                              <>
                                <button style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#10b981", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }} onClick={() => handleRespondCorrection(req.rawId, "Approved")}>✔ Approve</button>
                                <button style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }} onClick={() => handleRespondCorrection(req.rawId, "Rejected")}>❌ Reject</button>
                              </>
                            )}
                            {req.type === "warning" && (
                              <>
                                <button style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#166534", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }} onClick={() => setRemoveWarningTarget({ id: req.rawId, user_name: req.user_name, department: req.department, warning_type: "Late Arrival Policy Warning", removal_reason: req.reason })}>✔ Remove Warning</button>
                              </>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "600" }}>
                            Log Stored
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredUnifiedRequests.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: "center", padding: "24px", color: "#64748b" }}>
                        No requests matching search &amp; filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: WORKING MODELS & SHIFT TEMPLATES */}
      {activeTab === "shifts" && (
        <section className="att-card" id="section-working-shifts-management">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h2 className="att-card-title" style={{ margin: 0 }}>
                <Clock size={22} color="#0082ff" /> Global Working Models &amp; Shift Templates Engine
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "#64748b" }}>
                Create and manage unlimited corporate working policies (Fixed Shift, Flexible 40h, Rotational, Compressed Work Week, Split Shift, Contractor).
              </p>
            </div>
            <button id="btn-add-shift-policy" className="att-btn att-btn--primary" onClick={handleOpenCreateShiftModal}>
              <Plus size={18} /> Create New Working Policy
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
            {shifts.map((s) => {
              let rules = {};
              try {
                rules = typeof s.rules_json === "string" ? JSON.parse(s.rules_json) : (s.rules_json || {});
              } catch (e) {}

              return (
                <div key={s.id} style={{ background: s.is_active ? "#f0fdf4" : "#f8fafc", border: s.is_active ? "2px solid #166534" : "1px solid #cbd5e1", borderRadius: "10px", padding: "16px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: "15px", color: "#0f172a" }}>⚙️ {s.name}</h3>
                        {s.is_active && (
                          <span style={{ fontSize: "10.5px", fontWeight: "700", color: "#166534", background: "#bbf7d0", padding: "2px 6px", borderRadius: "4px", marginTop: "4px", display: "inline-block" }}>
                            🟢 ACTIVE ORGANIZATION POLICY
                          </span>
                        )}
                      </div>
                      <span style={{ padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", background: "#eff6ff", color: "#1d4ed8" }}>
                        {s.shift_type}
                      </span>
                    </div>

                    <div style={{ fontSize: "12.5px", color: "#334155", display: "flex", flexDirection: "column", gap: "4px", marginBottom: "12px" }}>
                      <div>🕒 Shift Hours: <strong>{s.shift_start ? `${s.shift_start} - ${s.shift_end}` : "Flexible Clock-In"}</strong></div>
                      <div>⌛ Grace Period: <strong>{s.grace_minutes} Mins</strong> (Late Threshold: {s.late_threshold || "N/A"})</div>
                      <div>⚠️ Warning Limit: <strong>{s.max_late_allowed || 3} Late Days (Auto-Warning)</strong></div>
                      <div>📅 Weekly Target: <strong>{s.weekly_hours} Target Hours</strong></div>
                    </div>

                    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px", fontSize: "11px", color: "#475569", display: "flex", flexDirection: "column", gap: "2px" }}>
                      <div>• Auto Absent Rule: <strong>{rules.auto_absent ? "Enabled ✔" : "Disabled"}</strong></div>
                      <div>• Idle Timeout: <strong>{rules.idle_timeout_mins || 15} Mins</strong></div>
                      <div>• Remote WFH Allowed: <strong>{rules.remote_allowed ? "Yes ✔" : "No"}</strong></div>
                      <div>• Screen Verification Required: <strong>{rules.screenshot_required ? "Yes ✔" : "Optional"}</strong></div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px", borderTop: "1px solid #e2e8f0", paddingTop: "10px" }}>
                    {!s.is_active ? (
                      <button style={{ padding: "4px 10px", fontSize: "11px", fontWeight: "700", background: "#166534", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "3px" }} onClick={() => handleActivateShiftPolicy(s.id)}>
                        <Award size={14} /> Implement Policy
                      </button>
                    ) : (
                      <button style={{ padding: "4px 10px", fontSize: "11px", fontWeight: "700", background: "#0284c7", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }} onClick={() => handleSyncDepartmentPolicy(s.id)}>
                        🔄 Sync Dept Settings
                      </button>
                    )}

                    <div style={{ display: "flex", gap: "4px" }}>
                      <button style={{ padding: "4px 8px", fontSize: "11px", background: "#0082ff", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "3px" }} onClick={() => handleOpenEditShiftModal(s)}>
                        <Edit3 size={14} /> Edit Policy
                      </button>
                      <button style={{ padding: "4px 8px", fontSize: "11px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "3px" }} onClick={() => handleDeleteShiftPolicy(s.id)}>
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB: CORPORATE POLICY WARNINGS & REMOVAL CENTER */}
      {activeTab === "warnings" && (
        <section className="att-card" id="section-policy-warnings-management">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h2 className="att-card-title" style={{ margin: 0 }}>
                <AlertTriangle size={22} color="#ef4444" /> Corporate Policy Warnings &amp; Member Removal Center
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "#64748b" }}>
                Automated policy enforcement for 3-day late arrivals past 9:15 AM grace threshold. Review online reasons submitted by members and remove warnings from account.
              </p>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button className="att-btn att-btn--primary" onClick={() => handleSyncDepartmentPolicy()}>
                🔄 Sync All Department Settings with Current Policy
              </button>
            </div>
          </div>

          {/* KPI SUMMARY CARDS */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "20px" }}>
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "14px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#991b1b" }}>Active Warnings on Account</span>
              <h3 style={{ margin: "4px 0 0", fontSize: "22px", color: "#dc2626" }}>⚠️ {warningsSummary.active_warnings || 0} Members</h3>
            </div>
            <div style={{ background: "#fffbe6", border: "1px solid #ffe58f", borderRadius: "10px", padding: "14px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#92400e" }}>Pending Online Removal Requests</span>
              <h3 style={{ margin: "4px 0 0", fontSize: "22px", color: "#d97706" }}>📝 {warningsSummary.pending_removal_requests || 0} Requests</h3>
            </div>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "14px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#166534" }}>Warnings Removed / Cleared</span>
              <h3 style={{ margin: "4px 0 0", fontSize: "22px", color: "#16a34a" }}>✅ {warningsSummary.removed_warnings || 0} Cleared</h3>
            </div>
            <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "10px", padding: "14px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#334155" }}>Policy Late Rule Threshold</span>
              <h3 style={{ margin: "4px 0 0", fontSize: "18px", color: "#0f172a" }}>🕒 9:15 AM (3 Days)</h3>
            </div>
          </div>

          {/* FILTER BAR */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
            {["All", "Active", "Removal Requested", "Removed"].map((st) => (
              <button
                key={st}
                className={`att-btn ${warningStatusFilter === st ? "att-btn--primary" : ""}`}
                style={{ padding: "6px 12px", fontSize: "12px" }}
                onClick={() => setWarningStatusFilter(st)}
              >
                {st === "All" ? "All Warnings" : st}
              </button>
            ))}
          </div>

          {/* WARNINGS TABLE */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                  <th style={{ padding: "10px 12px" }}>Candidate / Member</th>
                  <th style={{ padding: "10px 12px" }}>Department</th>
                  <th style={{ padding: "10px 12px" }}>Policy &amp; Grace Threshold</th>
                  <th style={{ padding: "10px 12px" }}>Late Count</th>
                  <th style={{ padding: "10px 12px" }}>Online Removal Reason</th>
                  <th style={{ padding: "10px 12px" }}>Warning Status</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {warnings
                  .filter((w) => warningStatusFilter === "All" || w.status === warningStatusFilter)
                  .map((w) => {
                    let lateDates = [];
                    try {
                      lateDates = typeof w.late_dates_json === "string" ? JSON.parse(w.late_dates_json) : (w.late_dates_json || []);
                    } catch (e) {}

                    return (
                      <tr key={w.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px" }}>
                          <div style={{ fontWeight: "700", color: "#0f172a" }}>{w.user_name}</div>
                          <div style={{ fontSize: "11px", color: "#64748b" }}>{w.user_email}</div>
                        </td>
                        <td style={{ padding: "12px", color: "#334155" }}>{w.department || "General"}</td>
                        <td style={{ padding: "12px", color: "#334155" }}>
                          <div><strong>{w.policy_name || "Fixed Morning Policy"}</strong></div>
                          <div style={{ fontSize: "11px", color: "#64748b" }}>Threshold: {w.late_threshold || "09:15:00"}</div>
                        </td>
                        <td style={{ padding: "12px" }}>
                          <span style={{ fontWeight: "800", color: "#dc2626", background: "#fee2e2", padding: "3px 8px", borderRadius: "6px", fontSize: "11px" }}>
                            ⚠️ {w.late_count} / 3 Late Days
                          </span>
                          {lateDates.length > 0 && (
                            <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "2px" }}>
                              Dates: {lateDates.join(", ")}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px", maxWidth: "260px" }}>
                          {w.removal_reason ? (
                            <div style={{ background: "#f8fafc", padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px" }}>
                              💬 "{w.removal_reason}"
                              {w.removal_requested_at && (
                                <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>
                                  Submitted: {new Date(w.removal_requested_at).toLocaleString()}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#94a3b8", fontStyle: "italic" }}>No online reason submitted yet</span>
                          )}
                        </td>
                        <td style={{ padding: "12px" }}>
                          {w.status === "Active" && (
                            <span style={{ padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", background: "#fee2e2", color: "#991b1b" }}>
                              ⚠️ Active Warning
                            </span>
                          )}
                          {w.status === "Removal Requested" && (
                            <span style={{ padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", background: "#fef3c7", color: "#92400e" }}>
                              ⏳ Removal Requested
                            </span>
                          )}
                          {w.status === "Removed" && (
                            <span style={{ padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", background: "#dcfce7", color: "#166534" }}>
                              ✅ Warning Removed
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "12px", textAlign: "right" }}>
                          {w.status !== "Removed" ? (
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                              <button
                                style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#166534", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                onClick={() => {
                                  setRemoveWarningTarget(w);
                                  setAdminRemoveNotes("Management approved warning removal based on online justification.");
                                }}
                              >
                                ✔ Remove Warning from Account
                              </button>
                              {w.status === "Removal Requested" && (
                                <button
                                  style={{ padding: "4px 8px", fontSize: "11px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                  onClick={() => handleAdminRejectWarningRemoval(w.id)}
                                >
                                  ❌ Reject
                                </button>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#166534" }}>
                              Removed by {w.removed_by_name || "Admin"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                {warnings.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: "center", padding: "24px", color: "#64748b" }}>
                      No policy warnings issued. All employees are adhering to attendance grace thresholds.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 4: DEPARTMENT & BRANCH SUMMARY */}
      {activeTab === "departments" && (
        <section className="att-card" id="section-departments-summary">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h2 className="att-card-title" style={{ margin: 0 }}>
                <Building2 size={20} color="#0082ff" /> Department &amp; Branch Policy Matrix
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "#64748b" }}>
                All department settings synced with current working policy (Shift Start, Grace Period 9:15 AM, 3-Day Late Limit).
              </p>
            </div>
            <button className="att-btn att-btn--primary" onClick={() => handleSyncDepartmentPolicy()}>
              🔄 Update All Department Settings with Current Policy
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
            {deptSettings.map((dept) => (
              <div key={dept.department} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <h3 style={{ margin: 0, color: "#0f172a", fontSize: "15px" }}>🏢 {dept.department}</h3>
                    <span style={{ background: "#eff6ff", color: "#1d4ed8", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: "700" }}>
                      {dept.headcount} Staff
                    </span>
                  </div>

                  <div style={{ fontSize: "12.5px", color: "#334155", display: "flex", flexDirection: "column", gap: "4px", marginBottom: "12px" }}>
                    <div>⚙️ Active Policy: <strong>{dept.active_policy_name}</strong></div>
                    <div>🕒 Shift Hours: <strong>{dept.shift_start} - {dept.shift_end}</strong></div>
                    <div>⌛ Grace Threshold: <strong>{dept.late_threshold} ({dept.grace_minutes} Mins)</strong></div>
                    <div>⚠️ Late Warning Trigger: <strong>{dept.max_late_allowed} Late Days</strong></div>
                    <div>🚨 Active Warnings: <strong style={{ color: dept.active_warnings > 0 ? "#dc2626" : "#166534" }}>{dept.active_warnings} Warnings</strong></div>
                  </div>
                </div>

                <button
                  style={{ width: "100%", padding: "6px", fontSize: "11px", fontWeight: "700", background: "#f1f5f9", color: "#1e293b", border: "1px solid #cbd5e1", borderRadius: "6px", cursor: "pointer" }}
                  onClick={() => handleSyncDepartmentPolicy()}
                >
                  🔄 Sync Setting with Current Policy
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TAB: MANUAL HR ATTENDANCE ENTRY & ROSTER */}
      {activeTab === "manual" && (
        <section className="att-card" id="section-manual-attendance">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h2 className="att-card-title" style={{ margin: 0 }}>
                <Edit3 size={20} color="#0082ff" /> Master Employee Roster &amp; Manual HR Attendance Override
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "#64748b" }}>
                View all company members and manually record or override attendance status, clock-in, and clock-out times.
              </p>
            </div>

            <button
              className="att-btn att-btn--primary"
              onClick={() => {
                setManualUserId(users[0]?.id || "");
                setManualDate(data?.today || new Date().toLocaleDateString('en-CA'));
                setManualStatus("Present");
                setManualWorkMode("Office");
                setManualClockIn("09:00");
                setManualClockOut("17:00");
                setManualNotes("");
                setManualModalOpen(true);
              }}
            >
              <Edit3 size={16} /> Mark Manual Attendance
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                  <th style={{ padding: "12px", color: "#475569" }}>Employee Name</th>
                  <th style={{ padding: "12px", color: "#475569" }}>Department &amp; Role</th>
                  <th style={{ padding: "12px", color: "#475569" }}>Today's Status</th>
                  <th style={{ padding: "12px", color: "#475569" }}>Clock In</th>
                  <th style={{ padding: "12px", color: "#475569" }}>Clock Out</th>
                  <th style={{ padding: "12px", color: "#475569" }}>Work Mode / Address</th>
                  <th style={{ padding: "12px", color: "#475569", textAlign: "right" }}>HR Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const att = attendances.find((a) => String(a.user_id) === String(u.id));
                  let statusVal = "Not Clocked In";
                  if (att && att.status) {
                    statusVal = att.status;
                  } else if (leaves.some((l) => String(l.user_id) === String(u.id) && l.status === "Approved")) {
                    statusVal = "Leave";
                  }

                  return (
                    <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "12px", fontWeight: "700", color: "#0f172a" }}>
                        {u.name} <br />
                        <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "400" }}>{u.email}</span>
                      </td>

                      <td style={{ padding: "12px", color: "#334155" }}>
                        {u.department || "Engineering"} <br />
                        <span style={{ fontSize: "11px", color: "#64748b" }}>{u.designation || "Team Member"}</span>
                      </td>

                      <td style={{ padding: "12px" }}>
                        {statusVal === "Present" && (
                          <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}>
                            🏢 Present (Office)
                          </span>
                        )}
                        {statusVal === "Late" && (
                          <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a" }}>
                            ⌛ Late Arrival
                          </span>
                        )}
                        {statusVal === "Paused" && (
                          <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a" }}>
                            ⏸ Paused
                          </span>
                        )}
                        {(statusVal === "WFH" || att?.work_mode === "WFH") && statusVal !== "Leave" && (
                          <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
                            🏡 Remote WFH
                          </span>
                        )}
                        {statusVal === "Leave" && (
                          <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd" }}>
                            🌴 On Approved Leave
                          </span>
                        )}
                        {statusVal === "Absent" && (
                          <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
                            ❌ Absent (Unexcused)
                          </span>
                        )}
                        {statusVal === "Not Clocked In" && (
                          <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
                            ❌ Not Clocked In (Absent)
                          </span>
                        )}
                      </td>

                      <td style={{ padding: "12px", color: "#334155" }}>
                        {att?.clock_in ? <strong>{att.clock_in}</strong> : "--:--"}
                      </td>

                      <td style={{ padding: "12px", color: "#334155" }}>
                        {att?.clock_out ? <strong>{att.clock_out}</strong> : "--:--"}
                      </td>

                      <td style={{ padding: "12px", fontSize: "12px", color: "#64748b" }}>
                        {att?.location_address || (att?.work_mode ? `${att.work_mode} Duty` : "No Punch Record")}
                      </td>

                      <td style={{ padding: "12px", textAlign: "right" }}>
                        <button
                          style={{ padding: "5px 12px", fontSize: "11.5px", fontWeight: "700", background: "#0082ff", color: "#ffffff", border: "none", borderRadius: "6px", cursor: "pointer" }}
                          onClick={() => {
                            setManualUserId(u.id);
                            setManualDate(data?.today || new Date().toLocaleDateString('en-CA'));
                            setManualStatus(att?.status || "Present");
                            setManualWorkMode(att?.work_mode || "Office");
                            setManualClockIn(att?.clock_in ? att.clock_in.substring(0, 5) : "09:00");
                            setManualClockOut(att?.clock_out ? att.clock_out.substring(0, 5) : "17:00");
                            setManualNotes("");
                            setManualModalOpen(true);
                          }}
                        >
                          ✏️ Mark / Edit Attendance
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 5: EXECUTIVE ALERTS & ANNIVERSARIES */}
      {activeTab === "alerts" && (
        <section className="att-executive-alerts" id="section-executive-alerts" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <div className="att-card">
            <h2 className="att-card-title"><Award size={20} color="#0082ff" /> Probation &amp; Document Expiry Alerts</h2>
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
            <h2 className="att-card-title"><Gift size={20} color="#0082ff" /> Birthdays &amp; Work Anniversaries</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "12.5px" }}>
              <div style={{ background: "#f0fdf4", padding: "10px 12px", borderRadius: "6px", border: "1px solid #bbf7d0" }}>
                🎉 <strong>Sarah Jenkins:</strong> 2-Year Work Anniversary today!
              </div>
              <div style={{ background: "#f0f9ff", padding: "10px 12px", borderRadius: "6px", border: "1px solid #bae6fd" }}>
                🎂 <strong>Michael Smith:</strong> Birthday coming up on August 05.
              </div>
            </div>
          </div>
        </section>
      )}

      {/* CREATE / EDIT WORKING SHIFT POLICY MODAL */}
      {shiftModalOpen && (
        <div className="att-modal-overlay" onClick={() => setShiftModalOpen(false)}>
          <div className="att-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px" }}>
            <div className="att-modal-header">
              <h3>{editingShiftId ? "Edit Working Policy Model" : "Create New Working Policy Model"}</h3>
              <button style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => setShiftModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleSaveShiftPolicy}>
              <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: "#475569" }}>Policy Name</label>
                  <input type="text" className="att-input" placeholder="e.g. Policy D - Compressed 4x10h Week" value={shiftName} onChange={(e) => setShiftName(e.target.value)} required />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "12px", color: "#475569" }}>Shift Model Type</label>
                    <select className="att-input" value={shiftType} onChange={(e) => setShiftType(e.target.value)}>
                      <option value="Fixed">Fixed Shift (09:00 - 05:00)</option>
                      <option value="Flexible">Flexible Shift (40h/week)</option>
                      <option value="Rotational">Rotational Night Shift</option>
                      <option value="Split">Split Shift (Morning + Evening)</option>
                      <option value="Compressed">Compressed Work Week (4x10h)</option>
                      <option value="PartTime">Part-Time Shift</option>
                      <option value="Contractor">Contractor Hourly Policy</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", color: "#475569" }}>Target Weekly Hours</label>
                    <input type="text" className="att-input" value={weeklyHrs} onChange={(e) => setWeeklyHrs(e.target.value)} required />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: "8px" }}>
                  <div>
                    <label style={{ fontSize: "11px", color: "#475569" }}>Start Time</label>
                    <input type="time" className="att-input" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "#475569" }}>End Time</label>
                    <input type="time" className="att-input" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "#475569" }}>Grace (Mins)</label>
                    <input type="number" className="att-input" value={graceMins} onChange={(e) => setGraceMins(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "#475569" }}>Late Threshold</label>
                    <input type="time" className="att-input" value={lateThresh} onChange={(e) => setLateThresh(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "#475569" }}>Max Late Days</label>
                    <input type="number" className="att-input" value={maxLateAllowed} onChange={(e) => setMaxLateAllowed(e.target.value)} min="1" max="30" />
                  </div>
                </div>

                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "10px" }}>
                  <label style={{ fontSize: "12px", fontWeight: "700", color: "#0f172a", display: "block", marginBottom: "8px" }}>Policy Enforcement Rules:</label>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <input type="checkbox" checked={ruleAutoAbsent} onChange={(e) => setRuleAutoAbsent(e.target.checked)} />
                      Auto Absent if No Clock-In
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <input type="checkbox" checked={ruleRemoteAllowed} onChange={(e) => setRuleRemoteAllowed(e.target.checked)} />
                      Remote WFH Allowed
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <input type="checkbox" checked={ruleOvertime} onChange={(e) => setRuleOvertime(e.target.checked)} />
                      Overtime Logged
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <input type="checkbox" checked={ruleScreenshot} onChange={(e) => setRuleScreenshot(e.target.checked)} />
                      Screen Verification Required
                    </label>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "12px 16px", borderTop: "1px solid #f1f5f9" }}>
                <button type="button" className="att-btn" style={{ background: "#f1f5f9", color: "#334155" }} onClick={() => setShiftModalOpen(false)}>Cancel</button>
                <button type="submit" className="att-btn att-btn--primary">{editingShiftId ? "Update Policy" : "Save Policy Template"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GLOBAL HR CONFIGURATION MODAL */}
      {settingsModalOpen && (
        <div className="att-modal-overlay" onClick={() => setSettingsModalOpen(false)}>
          <div className="att-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "680px" }}>
            <div className="att-modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0 }}>Global Enterprise HR &amp; System Settings</h3>
                <span style={{ fontSize: "11px", color: "#64748b" }}>Configure enterprise country, state/province, currency, time zone &amp; payroll parameters</span>
              </div>
              <button style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => setSettingsModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleSaveSettings}>
              <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "10px 14px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: "12px", color: "#1e40af" }}>
                    <strong>Enterprise Location Auto-Preset:</strong> Load US Enterprise Standard Settings
                  </div>
                  <button
                    type="button"
                    style={{ padding: "6px 12px", fontSize: "11px", fontWeight: "700", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}
                    onClick={handleAutoFetchUsDefaults}
                  >
                    🇺🇸 Auto-Fetch United States Defaults
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label htmlFor="cfg-country" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Primary Country</label>
                    <select
                      id="cfg-country"
                      className="att-input"
                      value={country}
                      onChange={(e) => handleCountryChange(e.target.value)}
                    >
                      {Object.keys(WORLD_DATA).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="cfg-state" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>State / Province / Region</label>
                    <select
                      id="cfg-state"
                      className="att-input"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                    >
                      {(WORLD_DATA[country]?.states || [state]).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="cfg-currency" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>System Currency</label>
                    <select
                      id="cfg-currency"
                      className="att-input"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                    >
                      <option value="USD">USD ($) - US Dollar</option>
                      <option value="GBP">GBP (£) - British Pound</option>
                      <option value="EUR">EUR (€) - Euro</option>
                      <option value="CAD">CAD ($) - Canadian Dollar</option>
                      <option value="AUD">AUD ($) - Australian Dollar</option>
                      <option value="AED">AED (AED) - UAE Dirham</option>
                      <option value="SAR">SAR (SR) - Saudi Riyal</option>
                      <option value="PKR">PKR (Rs) - Pakistani Rupee</option>
                      <option value="INR">INR (₹) - Indian Rupee</option>
                      <option value="SGD">SGD ($) - Singapore Dollar</option>
                      <option value="JPY">JPY (¥) - Japanese Yen</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="cfg-timezone" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Time Zone</label>
                    <select
                      id="cfg-timezone"
                      className="att-input"
                      value={timeZone}
                      onChange={(e) => setTimeZone(e.target.value)}
                    >
                      {(WORLD_DATA[country]?.timezones || [timeZone]).map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <label htmlFor="cfg-payroll" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Payroll Cycle Frequency</label>
                    <select id="cfg-payroll" className="att-input" value={payrollFreq} onChange={(e) => setPayrollFreq(e.target.value)}>
                      <option value="Monthly">Monthly Salary (End of Month)</option>
                      <option value="Bi-Weekly">Bi-Weekly Salary (Every 2 Weeks)</option>
                      <option value="Weekly">Weekly Wages (Every Friday)</option>
                      <option value="Daily">Daily Wage Rate</option>
                    </select>
                  </div>
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
              <button style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => setRejectWfhTarget(null)}><X size={20} /></button>
            </div>

            <form onSubmit={handleConfirmRejectWfh}>
              <div style={{ padding: "16px" }}>
                <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#334155" }}>
                  Please state the reason for rejecting/revoking WFH authorization for this employee. The reason will be sent directly to their member portal.
                </p>
                <textarea
                  id="wfh-rejection-reason-input"
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
              <button style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => setSnapshotModal(null)}><X size={20} /></button>
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
              <button style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => setHistoryModal(null)}><X size={20} /></button>
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
            </div>
          </div>
        </div>
      )}
      {/* ADMIN REMOVE WARNING FROM MEMBER ACCOUNT MODAL */}
      {removeWarningTarget && (
        <div className="att-modal-overlay" onClick={() => setRemoveWarningTarget(null)}>
          <div className="att-modal-panel" onClick={(e) => e.stopPropagation()} style={{ borderTop: "4px solid #166534", maxWidth: "520px" }}>
            <div className="att-modal-header">
              <h3>Remove Policy Warning from Member Account</h3>
              <button style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => setRemoveWarningTarget(null)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAdminConfirmRemoveWarning}>
              <div style={{ padding: "16px" }}>
                <p style={{ margin: "0 0 10px", fontSize: "13px", color: "#334155" }}>
                  You are removing the <strong>{removeWarningTarget.warning_type}</strong> for <strong>{removeWarningTarget.user_name}</strong> ({removeWarningTarget.department}).
                </p>

                {removeWarningTarget.removal_reason && (
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "10px", borderRadius: "6px", marginBottom: "14px", fontSize: "12px", color: "#166534" }}>
                    <strong>Member's Online Reason:</strong> "{removeWarningTarget.removal_reason}"
                  </div>
                )}

                <label htmlFor="admin-remove-notes" style={{ fontSize: "12px", fontWeight: "600", color: "#475569", display: "block", marginBottom: "4px" }}>
                  Admin Approval Remarks / Notes:
                </label>
                <textarea
                  id="admin-remove-notes"
                  className="att-input"
                  rows="3"
                  style={{ width: "100%", padding: "10px" }}
                  value={adminRemoveNotes}
                  onChange={(e) => setAdminRemoveNotes(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "12px 16px", borderTop: "1px solid #f1f5f9" }}>
                <button type="button" className="att-btn" style={{ background: "#f1f5f9", color: "#334155" }} onClick={() => setRemoveWarningTarget(null)}>Cancel</button>
                <button type="submit" className="att-btn" style={{ background: "#166534", color: "#fff" }}>✔ Approve &amp; Remove Warning</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANUAL HR ATTENDANCE ENTRY MODAL */}
      {manualModalOpen && (
        <div className="att-modal-overlay" onClick={() => setManualModalOpen(false)}>
          <div className="att-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "580px" }}>
            <div className="att-modal-header" style={{ borderTop: "4px solid #0082ff" }}>
              <h3>Manual HR Attendance Entry &amp; Override</h3>
              <button style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => setManualModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveManualAttendance}>
              <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label htmlFor="man-user" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Select Employee</label>
                  <select
                    id="man-user"
                    className="att-input"
                    value={manualUserId}
                    onChange={(e) => setManualUserId(e.target.value)}
                    required
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.department || "General"}) - {u.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label htmlFor="man-date" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Attendance Date</label>
                    <input
                      id="man-date"
                      type="date"
                      className="att-input"
                      value={manualDate}
                      onChange={(e) => setManualDate(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="man-status" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Attendance Status</label>
                    <select
                      id="man-status"
                      className="att-input"
                      value={manualStatus}
                      onChange={(e) => {
                        setManualStatus(e.target.value);
                        if (e.target.value === "WFH") setManualWorkMode("WFH");
                        else if (e.target.value === "Present" || e.target.value === "Late") setManualWorkMode("Office");
                      }}
                    >
                      <option value="Present">🏢 Present (Office)</option>
                      <option value="Late">⌛ Late Arrival</option>
                      <option value="WFH">🏡 Work From Home (Remote)</option>
                      <option value="Leave">🌴 On Approved Leave</option>
                      <option value="Absent">❌ Absent (Unexcused)</option>
                      <option value="Paused">⏸ Paused / On Break</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                  <div>
                    <label htmlFor="man-mode" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Work Mode</label>
                    <select
                      id="man-mode"
                      className="att-input"
                      value={manualWorkMode}
                      onChange={(e) => setManualWorkMode(e.target.value)}
                    >
                      <option value="Office">Office Duty</option>
                      <option value="WFH">Remote WFH</option>
                      <option value="Field">Field Duty</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="man-in" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Clock In Time</label>
                    <input
                      id="man-in"
                      type="time"
                      className="att-input"
                      value={manualClockIn}
                      onChange={(e) => setManualClockIn(e.target.value)}
                    />
                  </div>

                  <div>
                    <label htmlFor="man-out" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Clock Out Time</label>
                    <input
                      id="man-out"
                      type="time"
                      className="att-input"
                      value={manualClockOut}
                      onChange={(e) => setManualClockOut(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="man-notes" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>HR Remarks / Override Notes</label>
                  <textarea
                    id="man-notes"
                    className="att-input"
                    rows="2"
                    style={{ width: "100%", padding: "8px" }}
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    placeholder="e.g. Attendance manually verified and marked by HR Manager."
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "12px 16px", borderTop: "1px solid #f1f5f9" }}>
                <button type="button" className="att-btn" style={{ background: "#f1f5f9", color: "#334155" }} onClick={() => setManualModalOpen(false)}>Cancel</button>
                <button type="submit" className="att-btn att-btn--primary">Save Manual Attendance</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function roundVal(v, d) {
  return Number(Math.round(v + "e" + d) + "e-" + d) || 0;
}

function minVal(a, b) {
  return Math.min(a, b);
}

function maxVal(a, b) {
  return Math.max(a, b);
}
