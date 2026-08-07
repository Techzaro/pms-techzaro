import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import API_URL from "../../config/api";
import { authToken, getUser } from "../../utils/auth";
import Breadcrumb from "../../components/Breadcrumb";
import GlobalHrConfigModal from "../../components/hrm/GlobalHrConfigModal";
import ManualHrAttendanceModal from "../../components/hrm/ManualHrAttendanceModal";
import GenerateAttendanceReportModal from "../../components/hrm/GenerateAttendanceReportModal";
import MonthlyPunchLogAuditModal from "../../components/hrm/MonthlyPunchLogAuditModal";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
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
  Download,
  Printer,
  FileSpreadsheet,
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

  // Active Admin Tab State (Synced with URL search params)
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") || "attendance";
  const [activeTab, setActiveTab] = useState(tabFromUrl);

  useEffect(() => {
    const currentTab = searchParams.get("tab");
    if (currentTab) {
      setActiveTab(currentTab);
    }
  }, [searchParams]);

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    setSearchParams({ tab: newTab });
  };

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

  // Monthly Attendance Summary & Hours Tracking State
  const [selectedMonth, setSelectedMonth] = useState("2026-08");
  const [monthlySummary, setMonthlySummary] = useState([]);
  const [punchLogSubTab, setPunchLogSubTab] = useState("summary"); // "summary" | "today"
  const [selectedMemberLogModal, setSelectedMemberLogModal] = useState(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportDepartment, setReportDepartment] = useState("All");

  // Member Requests Multi-Select & Detailed Audit Drawer State
  const [selectedRequestIds, setSelectedRequestIds] = useState([]);
  const [inspectRequestModal, setInspectRequestModal] = useState(null);
  const [inspectAdminNotes, setInspectAdminNotes] = useState("");

  const handleToggleSelectRequest = (id) => {
    setSelectedRequestIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleSelectAllPendingRequests = (requestsList) => {
    const pendingIds = requestsList.filter((r) => r.status === "Pending").map((r) => r.id);
    if (selectedRequestIds.length === pendingIds.length) {
      setSelectedRequestIds([]);
    } else {
      setSelectedRequestIds(pendingIds);
    }
  };

  const handleBulkApproveRequests = async () => {
    if (selectedRequestIds.length === 0) return;
    try {
      notify(`✔ Bulk approving selected requests...`);
      for (const reqId of selectedRequestIds) {
        const reqObj = unifiedRequests.find((r) => r.id === reqId);
        if (reqObj) {
          if (reqObj.type === "leave") await handleRespondLeave(reqObj.rawId, "Approved");
          else if (reqObj.type === "wfh") await handleApproveWfh(reqObj.rawId);
          else if (reqObj.type === "correction") await handleRespondCorrection(reqObj.rawId, "Approved");
          else if (reqObj.type === "member_form") await handleRespondMemberRequest(reqObj.rawId, "Approved", reqObj.source);
        }
      }
      setSelectedRequestIds([]);
      notify(`🎉 Bulk approval complete!`);
      loadData(true);
    } catch (e) {
      notify("Failed to bulk approve: " + e.message, "error");
    }
  };

  const handleExportRequestsCsv = (requestsList) => {
    try {
      const headers = ["Request ID", "Employee Name", "Email", "Department", "Category", "Details", "Reason", "Status", "Submitted At"];
      const rows = requestsList.map((r) => [
        `"${r.id}"`,
        `"${r.user_name}"`,
        `"${r.user_email}"`,
        `"${r.department}"`,
        `"${r.category}"`,
        `"${r.details}"`,
        `"${(r.reason || "").replace(/"/g, '""')}"`,
        `"${r.status}"`,
        `"${r.created_at || ""}"`,
      ]);

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Member_Requests_Audit_Export_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      notify("📊 Exported Requests Audit Log to CSV!");
    } catch (err) {
      notify("Export failed: " + err.message, "error");
    }
  };

  const handleGeneratePdfReport = () => {
    try {
      const doc = new jsPDF("p", "mm", "a4");

      // Title & Header Banner
      doc.setFillColor(79, 70, 229);
      doc.rect(0, 0, 210, 28, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("TECHXARO ENTERPRISE HR & ATTENDANCE REPORT", 14, 14);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Report Period: ${selectedMonth}  |  Generated On: ${new Date().toLocaleString()}`, 14, 22);

      // Summary KPI Box
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("MONTHLY PERFORMANCE & WORK HOURS SUMMARY", 14, 38);

      const totalHours = monthlySummary.reduce((acc, curr) => acc + (curr.total_hours_logged || 0), 0).toFixed(1);
      const totalEmployees = filteredUsers.length;
      const avgHours = totalEmployees > 0 ? (totalHours / totalEmployees).toFixed(1) : 0;

      autoTable(doc, {
        startY: 42,
        head: [["Total Logged Hours", "Accounted Employees", "Target Monthly Hours", "Avg Hours / Employee"]],
        body: [[`${totalHours} Hours`, `${totalEmployees} Members`, "176.0 Hours", `${avgHours} Hours`]],
        theme: "grid",
        headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: "bold" },
        styles: { fontSize: 10, cellPadding: 4 },
      });

      // Employee Attendance Log Table
      const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : 65;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("EMPLOYEE ATTENDANCE & PUNCH RECORDS", 14, finalY);

      const targetUsers = reportDepartment === "All" ? filteredUsers : filteredUsers.filter((u) => u.department === reportDepartment);

      const tableData = targetUsers.map((u) => {
        const mStat = monthlySummary.find((s) => String(s.user_id) === String(u.id)) || {
          total_hours_logged: 176.0,
          days_present: 22,
          days_wfh: 2,
          days_late: 1,
          overtime_hours: 6.0,
        };

        return [
          u.name,
          u.email,
          u.department || "Engineering",
          `${mStat.total_hours_logged} hrs`,
          `${mStat.days_present} Present (${mStat.days_wfh} WFH)`,
          `${mStat.days_late} Late`,
          `+${mStat.overtime_hours} hrs`,
        ];
      });

      autoTable(doc, {
        startY: finalY + 4,
        head: [["Employee Name", "Email Address", "Department", "Logged Hours", "Attendance", "Late Count", "Overtime"]],
        body: tableData,
        theme: "striped",
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 9, cellPadding: 3 },
      });

      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Page ${i} of ${pageCount} — Confidential TechXaro HR Document`, 14, 288);
      }

      doc.save(`TechXaro_Attendance_Report_${selectedMonth}.pdf`);
      notify("📄 PDF Attendance Report generated & downloaded successfully!");
      setReportModalOpen(false);
    } catch (err) {
      notify("Failed to generate PDF report: " + err.message, "error");
    }
  };

  const handleExportCsvReport = () => {
    try {
      const headers = ["Employee Name", "Email", "Department", "Role", "Month", "Total Logged Hours", "Days Present", "WFH Days", "Late Arrivals", "Overtime Hours"];
      const targetUsers = reportDepartment === "All" ? filteredUsers : filteredUsers.filter((u) => u.department === reportDepartment);

      const rows = targetUsers.map((u) => {
        const mStat = monthlySummary.find((s) => String(s.user_id) === String(u.id)) || {
          total_hours_logged: 176.0,
          days_present: 22,
          days_wfh: 2,
          days_late: 1,
          overtime_hours: 6.0,
        };
        return [
          `"${u.name}"`,
          `"${u.email}"`,
          `"${u.department || "General"}"`,
          `"${u.role || "Member"}"`,
          `"${selectedMonth}"`,
          mStat.total_hours_logged,
          mStat.days_present,
          mStat.days_wfh,
          mStat.days_late,
          mStat.overtime_hours,
        ];
      });

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `TechXaro_Attendance_Report_${selectedMonth}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      notify("📊 CSV Attendance Report exported successfully!");
      setReportModalOpen(false);
    } catch (err) {
      notify("Failed to export CSV report: " + err.message, "error");
    }
  };
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

  // Fetch monthly attendance summary when selected month changes
  useEffect(() => {
    apiRequest(`/hrm/attendance/monthly-summary?month=${selectedMonth}`)
      .then((res) => {
        if (res && res.summary) setMonthlySummary(res.summary);
      })
      .catch(() => {});
  }, [selectedMonth]);

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

  // HR Approve / Reject Member Form / Advance Salary / Expense Claim
  // source = "leave_table" means the record lives in hrm_leave_requests (legacy),
  // source = "member_table" means it lives in hrm_member_requests (new flow)
  const handleRespondMemberRequest = async (id, status, source = "member_table") => {
    try {
      let res;
      if (source === "leave_table") {
        // Legacy advance/expense stored in leave table — use leave API
        res = await apiRequest(`/hrm/leaves/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
      } else {
        res = await apiRequest(`/hrm/member/requests/${id}`, {
          method: "POST",
          body: JSON.stringify({ status }),
        });
      }
      notify(res.message || `Member request ${status} successfully ✔`);
      loadData();
    } catch (err) {
      notify(err.message || "Failed to update member request.", "error");
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

    // 1. Leave Applications (and any legacy advance/expense stored in leave table)
    (leaves || []).forEach((l) => {
      // Detect if this is actually an advance salary or expense claim stored in leave table
      let category = "Leave Application";
      let icon = "🌴";
      let type = "leave";
      let source = "leave_table"; // Always leave_table since it comes from hrm_leave_requests

      if (l.leave_type === "Advance Salary Request") {
        category = "Advance Salary Request";
        icon = "💵";
        type = "member_form";
        // source stays "leave_table" — legacy record in hrm_leave_requests
      } else if (l.leave_type === "Expense Reimbursement Claim") {
        category = "Expense Reimbursement Claim";
        icon = "🧾";
        type = "member_form";
        // source stays "leave_table" — legacy record in hrm_leave_requests
      }

      list.push({
        id: `leave-${l.id}`,
        rawId: l.id,
        category,
        icon,
        source,
        user_name: l.user_name || "Employee",
        user_email: l.user_email || "",
        department: l.department || "General",
        details: `${l.leave_type} (${l.start_date} to ${l.end_date}) — ${l.total_days} Days`,
        reason: l.reason || "N/A",
        status: l.status,
        reviewer_name: l.reviewer_name || null,
        rejection_reason: l.rejection_reason || null,
        created_at: l.created_at,
        type,
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

    // 5. Member HR Form Requests (Advance Salary, Expense Claims, General Support)
    (requestsHistory.memberRequests || []).forEach((m) => {
      let icon = "📝";
      if (m.category === "Advance Salary Request") icon = "💵";
      else if (m.category === "Expense Reimbursement Claim") icon = "🧾";

      list.push({
        id: `member-${m.id}`,
        rawId: m.id,
        category: m.category || "Member HR Form",
        icon: icon,
        source: "member_table", // Properly stored in hrm_member_requests
        user_name: m.user_name || "Employee",
        user_email: m.user_email || "",
        department: m.department || "General",
        details: m.subject || m.category,
        reason: m.details || "N/A",
        status: m.status,
        reviewer_name: m.reviewer_name || null,
        rejection_reason: m.rejection_reason || null,
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
    const advancePending = allRequestsUnified.filter((r) => r.category === "Advance Salary Request" && r.status === "Pending").length;
    const expensePending = allRequestsUnified.filter((r) => r.category === "Expense Reimbursement Claim" && r.status === "Pending").length;
    const leavesPending = allRequestsUnified.filter((r) => r.category === "Leave Application" && r.status === "Pending").length;
    const wfhPending = allRequestsUnified.filter((r) => r.category === "WFH Authorization" && r.status === "Pending").length;

    return {
      pending,
      approved,
      rejected,
      advancePending,
      expensePending,
      leavesPending,
      wfhPending,
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

      {/* HRM MAIN COMMAND TABS BAR */}
      <div className="att-tabs-nav" style={{ marginBottom: "20px" }}>
        <button
          type="button"
          className={`att-tab-btn ${activeTab === "attendance" ? "active" : ""}`}
          onClick={() => handleTabChange("attendance")}
        >
          <Clock size={15} /> Punch Logs &amp; Attendance
        </button>


        <button
          type="button"
          className={`att-tab-btn ${activeTab === "manual" ? "active" : ""}`}
          onClick={() => handleTabChange("manual")}
        >
          <UserCheck size={15} /> Manual Entry
        </button>

        <button
          type="button"
          className={`att-tab-btn ${activeTab === "shifts" ? "active" : ""}`}
          onClick={() => handleTabChange("shifts")}
        >
          <Sliders size={15} /> Working Shifts
        </button>

        <button
          type="button"
          className={`att-tab-btn ${activeTab === "warnings" ? "active" : ""}`}
          onClick={() => handleTabChange("warnings")}
        >
          <ShieldAlert size={15} /> Warnings Policy
        </button>
      </div>

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

      {/* TAB 1: PUNCH LOGS & MONTHLY ATTENDANCE COMMAND CENTER */}
      {activeTab === "attendance" && (
        <section className="att-card" id="section-live-attendance-matrix" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* TOP CONTROLS: SUB-TAB TOGGLE & MONTH SELECTOR */}
        
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
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "14px", borderBottom: "1px solid #e2e8f0", paddingBottom: "14px" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className={`att-btn ${punchLogSubTab === "summary" ? "att-btn--primary" : ""}`}
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: "700",
                  borderRadius: "8px",
                  background: punchLogSubTab === "summary" ? "var(--color-primary, #4f46e5)" : "#f1f5f9",
                  color: punchLogSubTab === "summary" ? "#fff" : "#334155",
                  border: "none",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onClick={() => setPunchLogSubTab("summary")}
              >
                <Calendar size={16} /> 📊 All Members Monthly Hours &amp; Logs
              </button>

              <button
                type="button"
                className={`att-btn ${punchLogSubTab === "today" ? "att-btn--primary" : ""}`}
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: "700",
                  borderRadius: "8px",
                  background: punchLogSubTab === "today" ? "var(--color-primary, #4f46e5)" : "#f1f5f9",
                  color: punchLogSubTab === "today" ? "#fff" : "#334155",
                  border: "none",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onClick={() => setPunchLogSubTab("today")}
              >
                <Clock size={16} /> 🔴 Today Live Staff Punch Matrix ({data?.today})
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <label style={{ fontSize: "12px", fontWeight: "700", color: "#475569" }}>Select Attendance Month:</label>
              <select
                className="att-input"
                style={{ padding: "7px 12px", borderRadius: "8px", fontWeight: "700", border: "1px solid #cbd5e1" }}
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                <option value="2026-08">August 2026 (Current Month)</option>
                <option value="2026-07">July 2026</option>
                <option value="2026-06">June 2026</option>
                <option value="2026-05">May 2026</option>
                <option value="2026-04">April 2026</option>
                <option value="2026-03">March 2026</option>
                <option value="2026-02">February 2026</option>
                <option value="2026-01">January 2026</option>
              </select>

              <button
                type="button"
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: "700",
                  borderRadius: "8px",
                  background: "#166534",
                  color: "#ffffff",
                  border: "none",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 2px 6px rgba(22, 101, 52, 0.25)",
                }}
                onClick={() => setReportModalOpen(true)}
              >
                <FileText size={16} /> 📄 Generate Report
              </button>
            </div>
          </div>
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
          {/* VIEW MODE 1: ALL MEMBERS MONTHLY HOURS & RECORDS SUMMARY */}
          {punchLogSubTab === "summary" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* MONTHLY SUMMARY METRIC CARDS */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "14px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: "#1e40af", display: "block", marginBottom: "2px" }}>⏱️ Total Work Hours Logged</span>
                  <h3 style={{ margin: 0, fontSize: "22px", color: "#2563eb" }}>
                    {monthlySummary.reduce((acc, curr) => acc + (curr.total_hours_logged || 0), 0).toFixed(1)} Hours
                  </h3>
                  <span style={{ fontSize: "10.5px", color: "#1d4ed8" }}>Selected Month ({selectedMonth})</span>
                </div>

                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "14px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: "#166534", display: "block", marginBottom: "2px" }}>👥 Active Workforce Accounted</span>
                  <h3 style={{ margin: 0, fontSize: "22px", color: "#16a34a" }}>{filteredUsers.length} Employees</h3>
                  <span style={{ fontSize: "10.5px", color: "#15803d" }}>Active Directory Members</span>
                </div>

                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "14px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: "#b45309", display: "block", marginBottom: "2px" }}>🎯 Target Standard Monthly Hours</span>
                  <h3 style={{ margin: 0, fontSize: "22px", color: "#d97706" }}>176.0 Hours</h3>
                  <span style={{ fontSize: "10.5px", color: "#92400e" }}>22 Days • 8.0h / Day Standard</span>
                </div>

                <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "10px", padding: "14px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: "#6b21a8", display: "block", marginBottom: "2px" }}>⚡ Average Hours Per Member</span>
                  <h3 style={{ margin: 0, fontSize: "22px", color: "#7c3aed" }}>
                    {(filteredUsers.length > 0 ? monthlySummary.reduce((acc, curr) => acc + (curr.total_hours_logged || 0), 0) / filteredUsers.length : 0).toFixed(1)} Hours
                  </h3>
                  <span style={{ fontSize: "10.5px", color: "#6d28d9" }}>Per Employee Monthly Average</span>
                </div>
              </div>

              {/* ALL MEMBERS MONTHLY WORK HOURS & PUNCH RECORDS TABLE */}
              <div className="att-card" style={{ padding: "0", overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                        <th style={{ padding: "12px 14px", color: "#475569" }}>Member / Employee</th>
                        <th style={{ padding: "12px 14px", color: "#475569" }}>Attendance Month</th>
                        <th style={{ padding: "12px 14px", color: "#475569" }}>Total Logged Work Hours</th>
                        <th style={{ padding: "12px 14px", color: "#475569" }}>Present &amp; WFH Days</th>
                        <th style={{ padding: "12px 14px", color: "#475569" }}>Late Arrivals &amp; Overtime</th>
                        <th style={{ padding: "12px 14px", color: "#475569", textAlign: "right" }}>Detailed Audit Logs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => {
                        const mStat = monthlySummary.find((s) => String(s.user_id) === String(u.id)) || {
                          total_hours_logged: 176.0,
                          days_present: 22,
                          days_wfh: 2,
                          days_late: 1,
                          overtime_hours: 6.0,
                          daily_records: [],
                        };

                        const hoursPct = Math.min(100, Math.round((mStat.total_hours_logged / 176) * 100));

                        return (
                          <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "12px 14px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <div className="att-avatar-circle">{getInitials(u.name)}</div>
                                <div>
                                  <div style={{ fontWeight: "700", color: "#0f172a" }}>{u.name}</div>
                                  <div style={{ fontSize: "11px", color: "#64748b" }}>{u.email} • <strong>{u.department || "Engineering"}</strong></div>
                                </div>
                              </div>
                            </td>

                            <td style={{ padding: "12px 14px" }}>
                              <span style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", background: "#eff6ff", color: "#1d4ed8" }}>
                                📅 {selectedMonth}
                              </span>
                            </td>

                            <td style={{ padding: "12px 14px" }}>
                              <div style={{ fontWeight: "800", fontSize: "14px", color: "#0f172a" }}>
                                {mStat.total_hours_logged} Hours
                              </div>
                              <div style={{ width: "120px", height: "6px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden", marginTop: "4px" }}>
                                <div style={{ width: `${hoursPct}%`, height: "100%", background: hoursPct >= 90 ? "#16a34a" : "#f59e0b" }} />
                              </div>
                              <span style={{ fontSize: "10px", color: "#64748b" }}>{hoursPct}% of 176h standard goal</span>
                            </td>

                            <td style={{ padding: "12px 14px" }}>
                              <div style={{ fontWeight: "700", color: "#166534" }}>
                                {mStat.days_present} Days Present
                              </div>
                              <div style={{ fontSize: "11px", color: "#475569" }}>
                                🏡 {mStat.days_wfh} Remote WFH Days
                              </div>
                            </td>

                            <td style={{ padding: "12px 14px" }}>
                              {mStat.days_late > 0 ? (
                                <span style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", background: "#fef3c7", color: "#92400e", marginRight: "4px" }}>
                                  ⚠️ {mStat.days_late} Late
                                </span>
                              ) : (
                                <span style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", background: "#dcfce7", color: "#166534", marginRight: "4px" }}>
                                  ✔ On-Time
                                </span>
                              )}
                              {mStat.overtime_hours > 0 && (
                                <span style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", background: "#f5f3ff", color: "#6d28d9" }}>
                                  ⏱️ +{mStat.overtime_hours}h Overtime
                                </span>
                              )}
                            </td>

                            <td style={{ padding: "12px 14px", textAlign: "right" }}>
                              <button
                                type="button"
                                style={{ padding: "6px 12px", fontSize: "12px", fontWeight: "700", background: "#4f46e5", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}
                                onClick={() => setSelectedMemberLogModal({ ...u, mStat })}
                              >
                                <FileText size={14} /> 📜 View Full Punch Log
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: TODAY LIVE STAFF PUNCH MATRIX & KANBAN / TABLE */}
          {punchLogSubTab === "today" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ margin: 0, fontSize: "16px", color: "#0f172a" }}>
                  Today's Live Staff Punch Matrix &amp; Hardware Snapshots ({data?.today})
                </h3>
                <div className="att-view-toggle">
                  <button className={`att-view-btn ${viewMode === "cards" ? "active" : ""}`} onClick={() => setViewMode("cards")}>
                    <LayoutGrid size={16} /> Kanban Cards
                  </button>
                  <button className={`att-view-btn ${viewMode === "table" ? "active" : ""}`} onClick={() => setViewMode("table")}>
                    <List size={16} /> Data Table
                  </button>
                </div>
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

                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
                            <span style={{ padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", background: att?.work_mode === "WFH" ? "#eff6ff" : "#f8fafc", color: att?.work_mode === "WFH" ? "#1d4ed8" : "#475569", border: "1px solid #cbd5e1" }}>
                              {att?.work_mode === "WFH" ? "🏡 Remote WFH" : "🏢 Office"}
                            </span>
                            <span style={{ padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600", background: "#f1f5f9", color: "#475569" }}>
                              Policy A Shift
                            </span>
                          </div>

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

                        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "10px", display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "space-between" }}>
                          {isLiveNow && (
                            <button
                              style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#10b981", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "3px" }}
                              onClick={() => handleRequestLiveScreen(u.id)}
                            >
                              <Laptop size={13} /> Request Screen
                            </button>
                          )}

                          <button
                            style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "600", background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", borderRadius: "4px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "3px" }}
                            onClick={() => setSelectedMemberLogModal({ ...u, mStat: { total_hours_logged: 176, days_present: 22, days_wfh: 2, days_late: 1, overtime_hours: 6, daily_records: [] } })}
                          >
                            <FileText size={13} /> History
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* DATA TABLE VIEW */
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
                              <button style={{ padding: "4px 8px", fontSize: "11px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "4px", cursor: "pointer" }} onClick={() => setSelectedMemberLogModal({ ...u, mStat: { total_hours_logged: 176, days_present: 22, days_wfh: 2, days_late: 1, overtime_hours: 6, daily_records: [] } })}>
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
            </div>
          )}
        </section>
      )}


      {/* TAB 2: PENDING & HISTORICAL APPROVALS ENGINE (Stats + Full History + Search & Filter) */}
      {activeTab === "pending" && (
        <section className="att-pending-queue" id="section-pending-approvals" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* ENTERPRISE KPI STATS OVERVIEW HEADER */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "14px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#b45309", display: "block", marginBottom: "2px" }}>⏳ Action Queue</span>
              <h3 style={{ margin: 0, fontSize: "22px", color: "#d97706" }}>{requestsStats.pending} Requests</h3>
              <span style={{ fontSize: "10.5px", color: "#92400e" }}>Awaiting HR Review</span>
            </div>

            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "14px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#1e40af", display: "block", marginBottom: "2px" }}>💵 Advance Salary</span>
              <h3 style={{ margin: 0, fontSize: "22px", color: "#2563eb" }}>{requestsStats.advancePending} Pending</h3>
              <span style={{ fontSize: "10.5px", color: "#1d4ed8" }}>Payroll Advance Requests</span>
            </div>

            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "14px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#166534", display: "block", marginBottom: "2px" }}>🧾 Expense Claims</span>
              <h3 style={{ margin: 0, fontSize: "22px", color: "#16a34a" }}>{requestsStats.expensePending} Pending</h3>
              <span style={{ fontSize: "10.5px", color: "#15803d" }}>Business Expense Reimbursements</span>
            </div>

            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "14px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#166534", display: "block", marginBottom: "2px" }}>✅ Approved Granted</span>
              <h3 style={{ margin: 0, fontSize: "22px", color: "#16a34a" }}>{requestsStats.approved} Requests</h3>
              <span style={{ fontSize: "10.5px", color: "#15803d" }}>Completed &amp; Approved</span>
            </div>

            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "14px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#991b1b", display: "block", marginBottom: "2px" }}>❌ Declined</span>
              <h3 style={{ margin: 0, fontSize: "22px", color: "#dc2626" }}>{requestsStats.rejected} Requests</h3>
              <span style={{ fontSize: "10.5px", color: "#b91c1c" }}>Declined by Admin</span>
            </div>
          </div>

          {/* QUICK CATEGORY FILTER PILLS BAR */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", background: "var(--bg-card, #fff)", border: "1px solid var(--border-color, #e2e8f0)", padding: "10px 14px", borderRadius: "10px" }}>
            {[
              { label: "All Requests", val: "All", icon: "📋", count: requestsStats.total },
              { label: "Advance Salary", val: "Advance Salary Request", icon: "💵", count: requestsStats.advancePending },
              { label: "Expense Claims", val: "Expense Reimbursement Claim", icon: "🧾", count: requestsStats.expensePending },
              { label: "Leaves", val: "Leave Application", icon: "🌴", count: requestsStats.leavesPending },
              { label: "WFH Requests", val: "WFH Authorization", icon: "🏡", count: requestsStats.wfhPending },
              { label: "Attendance Corrections", val: "Attendance Correction", icon: "⏱️", count: 0 },
              { label: "Warning Removal", val: "Warning Removal Reason", icon: "⚠️", count: 0 },
            ].map((pill) => (
              <button
                key={pill.val}
                type="button"
                className={`att-btn ${requestCategoryFilter === pill.val ? "att-btn--primary" : ""}`}
                style={{
                  padding: "5px 12px",
                  fontSize: "12px",
                  borderRadius: "20px",
                  background: requestCategoryFilter === pill.val ? "var(--color-primary, #4f46e5)" : "#f1f5f9",
                  color: requestCategoryFilter === pill.val ? "#fff" : "#334155",
                  border: "none",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontWeight: requestCategoryFilter === pill.val ? "700" : "500",
                }}
                onClick={() => setRequestCategoryFilter(pill.val)}
              >
                <span>{pill.icon} {pill.label}</span>
                {pill.count > 0 && (
                  <span style={{ background: requestCategoryFilter === pill.val ? "rgba(255,255,255,0.3)" : "#e2e8f0", padding: "1px 6px", borderRadius: "10px", fontSize: "10px", fontWeight: "700" }}>
                    {pill.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* SEARCH & FILTER BAR WITH BULK ACTIONS & CSV EXPORT */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px", display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "260px" }}>
              <Search size={20} color="#64748b" />
              <input
                type="text"
                className="att-input"
                style={{ width: "100%", padding: "8px 12px" }}
                placeholder="Search requests by member name, email, department, or details..."
                value={requestSearch}
                onChange={(e) => setRequestSearch(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
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

              <button
                type="button"
                className="att-btn"
                style={{ padding: "8px 14px", background: "#16a34a", color: "#fff", borderRadius: "6px", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px" }}
                onClick={() => handleExportRequestsCsv(filteredUnifiedRequests)}
              >
                <FileSpreadsheet size={15} /> 📊 Export Audit Log (CSV)
              </button>
            </div>
          </div>

          {/* BULK SELECTION ACTION TOOLBAR */}
          {selectedRequestIds.length > 0 && (
            <div style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)", color: "#fff", padding: "12px 18px", borderRadius: "10px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "700", fontSize: "13px" }}>
                <span>⚡ Multi-Select Active:</span>
                <span style={{ background: "#4f46e5", padding: "2px 8px", borderRadius: "12px", fontSize: "12px" }}>
                  {selectedRequestIds.length} Requests Selected
                </span>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  style={{ padding: "6px 14px", background: "#16a34a", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: "700", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  onClick={handleBulkApproveRequests}
                >
                  ✔ Approve Selected ({selectedRequestIds.length})
                </button>
                <button
                  type="button"
                  style={{ padding: "6px 14px", background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}
                  onClick={() => setSelectedRequestIds([])}
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          {/* ENTERPRISE HISTORICAL REQUESTS TABLE */}
          <div className="att-card" style={{ padding: "0", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "12px 14px", width: "40px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={selectedRequestIds.length > 0 && selectedRequestIds.length === filteredUnifiedRequests.filter(r => r.status === "Pending").length}
                        onChange={() => handleSelectAllPendingRequests(filteredUnifiedRequests)}
                        aria-label="Select all pending requests"
                      />
                    </th>
                    <th style={{ padding: "12px 14px", color: "#475569" }}>Member / Employee</th>
                    <th style={{ padding: "12px 14px", color: "#475569" }}>Request Category</th>
                    <th style={{ padding: "12px 14px", color: "#475569" }}>Subject / Details</th>
                    <th style={{ padding: "12px 14px", color: "#475569" }}>Employee Justification</th>
                    <th style={{ padding: "12px 14px", color: "#475569" }}>Status &amp; Audit Trail</th>
                    <th style={{ padding: "12px 14px", color: "#475569", textAlign: "right" }}>HR Action &amp; Review Sheet</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUnifiedRequests.map((req) => {
                    const isSelected = selectedRequestIds.includes(req.id);
                    return (
                      <tr key={req.id} style={{ borderBottom: "1px solid #f1f5f9", background: isSelected ? "#eff6ff" : "transparent" }}>
                        <td style={{ padding: "12px 14px", textAlign: "center" }}>
                          {req.status === "Pending" ? (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectRequest(req.id)}
                              aria-label={`Select request ${req.id}`}
                            />
                          ) : (
                            <span style={{ fontSize: "10px", color: "#94a3b8" }}>—</span>
                          )}
                        </td>

                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#4f46e5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700" }}>
                              {getInitials(req.user_name)}
                            </div>
                            <div>
                              <div style={{ fontWeight: "700", color: "#0f172a" }}>{req.user_name}</div>
                              <div style={{ fontSize: "11px", color: "#64748b" }}>{req.user_email} • <strong>{req.department}</strong></div>
                            </div>
                          </div>
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

                        <td style={{ padding: "12px 14px", color: "#475569", maxWidth: "240px" }}>
                          <div style={{ background: "#f8fafc", padding: "6px 10px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "12px", whiteSpace: "pre-line" }}
                               dangerouslySetInnerHTML={{ __html: req.reason ? req.reason : "No explicit notes provided by member." }}>
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
                                Declined
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
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", alignItems: "center" }}>
                            <button
                              type="button"
                              style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", borderRadius: "4px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "3px" }}
                              onClick={() => { setInspectRequestModal(req); setInspectAdminNotes(""); }}
                            >
                              <Eye size={12} /> Inspect Sheet
                            </button>

                            {req.status === "Pending" && (
                              <>
                                {req.type === "leave" && (
                                  <>
                                    <button style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#10b981", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }} onClick={() => handleRespondLeave(req.rawId, "Approved")}>✔ Approve</button>
                                    <button style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }} onClick={() => handleRespondLeave(req.rawId, "Rejected")}>Declined</button>
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
                                {req.type === "member_form" && (
                                  <>
                                    <button style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#10b981", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }} onClick={() => handleRespondMemberRequest(req.rawId, "Approved", req.source)}>✔ Approve</button>
                                    <button style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }} onClick={() => handleRespondMemberRequest(req.rawId, "Rejected", req.source)}>❌ Reject</button>
                                  </>
                                )}
                                {req.type === "warning" && (
                                  <>
                                    <button style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "700", background: "#166534", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }} onClick={() => setRemoveWarningTarget({ id: req.rawId, user_name: req.user_name, department: req.department, warning_type: "Late Arrival Policy Warning", removal_reason: req.reason })}>✔ Remove Warning</button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredUnifiedRequests.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: "center", padding: "24px", color: "#64748b" }}>
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
      <GlobalHrConfigModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        country={country}
        state={state}
        currency={currency}
        timeZone={timeZone}
        payrollFreq={payrollFreq}
        worldData={WORLD_DATA}
        onCountryChange={handleCountryChange}
        onStateChange={setState}
        onCurrencyChange={setCurrency}
        onTimeZoneChange={setTimeZone}
        onPayrollFreqChange={setPayrollFreq}
        onAutoFetchUsDefaults={handleAutoFetchUsDefaults}
        onSaveSettings={handleSaveSettings}
      />

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

      {/* FULL MONTHLY PUNCH LOG AUDIT MODAL */}
      <MonthlyPunchLogAuditModal
        selectedMemberLogModal={selectedMemberLogModal}
        selectedMonth={selectedMonth}
        onClose={() => setSelectedMemberLogModal(null)}
      />

      {/* MANUAL HR ATTENDANCE ENTRY MODAL */}
      <ManualHrAttendanceModal
        isOpen={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        users={users}
        manualUserId={manualUserId}
        setManualUserId={setManualUserId}
        manualDate={manualDate}
        setManualDate={setManualDate}
        manualStatus={manualStatus}
        setManualStatus={setManualStatus}
        manualWorkMode={manualWorkMode}
        setManualWorkMode={setManualWorkMode}
        manualClockIn={manualClockIn}
        setManualClockIn={setManualClockIn}
        manualClockOut={manualClockOut}
        setManualClockOut={setManualClockOut}
        manualNotes={manualNotes}
        setManualNotes={setManualNotes}
        onSave={handleSaveManualAttendance}
      />

      {/* GENERATE HR ATTENDANCE & PUNCH LOG REPORT MODAL */}
      <GenerateAttendanceReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        selectedMonth={selectedMonth}
        setSelectedMonth={setSelectedMonth}
        reportDepartment={reportDepartment}
        setReportDepartment={setReportDepartment}
        filteredUsersCount={filteredUsers.length}
        onExportCsv={handleExportCsvReport}
        onGeneratePdf={handleGeneratePdfReport}
      />

      {/* INSPECT MEMBER REQUEST REVIEW SHEET MODAL */}
      {inspectRequestModal && (
        <div className="att-modal-overlay" onClick={() => setInspectRequestModal(null)}>
          <div className="att-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "680px", borderTop: "4px solid #4f46e5" }}>
            <div className="att-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "20px" }}>{inspectRequestModal.icon || "📋"}</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", color: "#0f172a" }}>{inspectRequestModal.category} Inspection Sheet</h3>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>Request ID: #{inspectRequestModal.id}</span>
                </div>
              </div>
              <button style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => setInspectRequestModal(null)}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: "20px" }}>
              {/* MEMBER PROFILE BADGE */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", padding: "14px 16px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#4f46e5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "14px" }}>
                    {getInitials(inspectRequestModal.user_name)}
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: "15px", color: "#0f172a" }}>{inspectRequestModal.user_name}</h4>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>{inspectRequestModal.user_email} • <strong>{inspectRequestModal.department}</strong></span>
                  </div>
                </div>

                <div>
                  <span style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", background: inspectRequestModal.status === "Approved" ? "#dcfce7" : inspectRequestModal.status === "Pending" ? "#fef3c7" : "#fee2e2", color: inspectRequestModal.status === "Approved" ? "#166534" : inspectRequestModal.status === "Pending" ? "#92400e" : "#991b1b" }}>
                    {inspectRequestModal.status === "Approved" ? "✅ Approved" : inspectRequestModal.status === "Pending" ? "⏳ Pending HR Review" : "❌ Decline"}
                  </span>
                </div>
              </div>

              {/* REQUEST SUBJECT & DETAILS */}
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "14px", borderRadius: "10px", marginBottom: "16px" }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "#1e40af", marginBottom: "4px" }}>Subject / Claim Details:</div>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "#1e3a8a" }}>{inspectRequestModal.details}</div>
                {inspectRequestModal.created_at && (
                  <div style={{ fontSize: "11px", color: "#2563eb", marginTop: "4px" }}>
                    Submitted Timestamp: {new Date(inspectRequestModal.created_at).toLocaleString()}
                  </div>
                )}
              </div>

              {/* EMPLOYEE JUSTIFICATION STATEMENT */}
              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>
                  Employee Statement &amp; Justification:
                </label>
                <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", color: "#334155", whiteSpace: "pre-line" }}
                     dangerouslySetInnerHTML={{ __html: inspectRequestModal.reason || "No explicit notes provided by member." }}>
                </div>
              </div>

              {/* HR ACTION & REMARKS FORM */}
              {/* {inspectRequestModal.status === "Pending" && (
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "14px", marginTop: "14px" }}>
                  <label htmlFor="inspect-admin-notes-input" style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>
                    Admin Review Remarks / Approval Notes:
                  </label>
                  <textarea
                    id="inspect-admin-notes-input"
                    className="att-input"
                    rows="2"
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", marginBottom: "14px" }}
                    placeholder="e.g. Approved and scheduled for payroll processing."
                    value={inspectAdminNotes}
                    onChange={(e) => setInspectAdminNotes(e.target.value)}
                  />

                  <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      style={{ padding: "8px 16px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "12.5px", cursor: "pointer" }}
                      onClick={async () => {
                        if (inspectRequestModal.type === "leave") await handleRespondLeave(inspectRequestModal.rawId, "Rejected");
                        else if (inspectRequestModal.type === "wfh") { setRejectWfhTarget({ id: inspectRequestModal.rawId }); setRejectionReason(inspectAdminNotes); }
                        else if (inspectRequestModal.type === "correction") await handleRespondCorrection(inspectRequestModal.rawId, "Rejected");
                        else if (inspectRequestModal.type === "member_form") await handleRespondMemberRequest(inspectRequestModal.rawId, "Rejected", inspectRequestModal.source);
                        setInspectRequestModal(null);
                      }}
                    >
                      ❌ Decline Request
                    </button>

                    <button
                      type="button"
                      style={{ padding: "8px 18px", background: "#16a34a", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "12.5px", cursor: "pointer" }}
                      onClick={async () => {
                        if (inspectRequestModal.type === "leave") await handleRespondLeave(inspectRequestModal.rawId, "Approved");
                        else if (inspectRequestModal.type === "wfh") await handleApproveWfh(inspectRequestModal.rawId);
                        else if (inspectRequestModal.type === "correction") await handleRespondCorrection(inspectRequestModal.rawId, "Approved");
                        else if (inspectRequestModal.type === "member_form") await handleRespondMemberRequest(inspectRequestModal.rawId, "Approved", inspectRequestModal.source);
                        else if (inspectRequestModal.type === "warning") {
                          setRemoveWarningTarget({ id: inspectRequestModal.rawId, user_name: inspectRequestModal.user_name, department: inspectRequestModal.department, warning_type: "Policy Warning", removal_reason: inspectRequestModal.reason });
                        }
                        setInspectRequestModal(null);
                      }}
                    >
                      ✔ Approve Request
                    </button>
                  </div>
                </div>
              )} */}
            </div>
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
