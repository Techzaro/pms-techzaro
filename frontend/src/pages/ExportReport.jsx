import { useState } from "react";
import { createPortal } from "react-dom";
import { authHeaders, getUser } from "../utils/auth";
import {
  createDoc,
  getPageWidth,
  addLogo,
  addTitle,
  addSubtitle,
  addDivider,
  addSectionTitle,
  addStatCards,
  addAutoTable,
  addTimeline,
  addFooter,
  savePdf,
  COLORS,
  getStatusColor,
} from "../utils/pdfUtils";
import "../pages/ExportReport.css";

import API_URL from "../config/api";
import { formatDateTimeShort } from "../utils/formatDateTime";

const exportTypes = [
  {
    id: "summary",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    title: "Summary Report",
    description: "Overview of key metrics and high-level insights",
  },
  {
    id: "detailed",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
    title: "Detailed Report",
    description: "Overview of key metrics and high level insights",
  },
  {
    id: "performance",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: "Team Performance",
    description: "Overview of key metrics and high-level insights",
  },
  {
    id: "progress",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    title: "Project Progress",
    description: "Overview of key metrics and high-level insights",
  },
];

const fileFormats = [
  {
    id: "pdf",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="4" fill="#fef2f2" />
        <text x="12" y="15" textAnchor="middle" fill="#ef4444" fontSize="8" fontWeight="700" fontFamily="Arial">PDF</text>
      </svg>
    ),
    title: "PDF",
    description: "Best for sharing and printing",
  },
  {
    id: "excel",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="4" fill="#f0fdf4" />
        <text x="12" y="15" textAnchor="middle" fill="#16a34a" fontSize="7" fontWeight="700" fontFamily="Arial">XLS</text>
      </svg>
    ),
    title: "Excel / CSV",
    description: "Best for data analysis and calculations",
  },
  {
    id: "link",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
    title: "Share Link",
    description: "Generate a live link to share report",
  },
];

const includeOptionsList = [
  { id: "charts", label: "Charts & Graphs" },
  { id: "activity", label: "Team Activity" },
  { id: "attachments", label: "Attachments" },
  { id: "completed", label: "Completed Tasks" },
];

function ExportReport({ isOpen, onClose }) {
  const [selectedTeams, setSelectedTeams] = useState("Design Team, Development Team");
  const [selectedProjects, setSelectedProjects] = useState("All Projects");
  const [selectedTasks, setSelectedTasks] = useState("All Tasks");
  const [exportType, setExportType] = useState("summary");
  const [dateRange, setDateRange] = useState("Custom");
  const [customDate] = useState("Oct 1, 2026 - Oct 17, 2026");
  const [fileFormat, setFileFormat] = useState("pdf");
  const [checks, setChecks] = useState({
    charts: true,
    activity: true,
    attachments: false,
    completed: true,
  });
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewType, setPreviewType] = useState("summary");
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const toggleCheck = (id) => setChecks((p) => ({ ...p, [id]: !p[id] }));

  const getPeriodParam = () => {
    switch (dateRange) {
      case "Today": return "today";
      case "This Week": return "week";
      case "This Month": return "month";
      default: return "all";
    }
  };

  const fetchJson = async (url) => {
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  const fetchPreviewData = async () => {
    setPreviewLoading(true);
    try {
      const summaryData = await fetchJson(`${API_URL}/reports/summary`);
      const user = getUser();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      const endDate = new Date();

      setPreviewData({
        generatedBy: user?.name || "Admin",
        dateRange: `${startDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} – ${endDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
        totalTeams: summaryData.total_teams || 0,
        activeProjects: summaryData.active_projects || 0,
        tasksCreated: summaryData.tasks_created || 0,
        tasksCompleted: summaryData.tasks_completed || 0,
        completionRate: summaryData.completion_rate || 0,
        overdueTasks: summaryData.overdue_tasks || 0,
        projects: (summaryData.projects || []).map(p => ({
          name: p.title,
          completion: p.completion || 0,
          tasksCompleted: `${p.completed_tasks || 0} / ${p.total_tasks || 0}`,
          date: p.end_date || "—",
        })),
      });
      setShowPreview(true);
    } catch (err) {
      console.error("Failed to load preview data:", err);
      alert("Failed to load report preview. Please try again.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadSummaryPDF = async () => {
    setLoading(true);
    try {
      await generateSummaryPDF();
      setShowPreview(false);
      onClose();
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fetchDetailedPreviewData = async () => {
    setPreviewLoading(true);
    try {
      const data = await fetchJson(`${API_URL}/reports/detailed`);
      const user = getUser();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      const endDate = new Date();

      setPreviewData({
        generatedBy: user?.name || "Admin",
        dateRange: `${startDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} – ${endDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
        totalTeams: data.total_teams || 0,
        activeProjects: data.active_projects || 0,
        tasksCreated: data.tasks_created || 0,
        tasksCompleted: data.tasks_completed || 0,
        completionRate: data.completion_rate || 0,
        overdueTasks: data.overdue_tasks || 0,
        projects: (data.projects || []).map(p => ({
          name: p.title,
          completion: p.completion || 0,
          tasksCompleted: `${p.completed_tasks || 0} / ${p.total_tasks || 0}`,
          status: p.status || "—",
        })),
        teams: (data.teams || []).map(t => ({
          name: t.name,
          members: t.members || 0,
          tasksCompleted: `${t.completed_tasks || 0} / ${t.total_tasks || 0}`,
          completionRate: t.completion_rate || 0,
        })),
        overdueList: (data.overdue_list || []).map(t => ({
          task: t.title,
          project: t.project,
          daysOverdue: t.days_overdue || 0,
        })),
        recentTasks: (data.recent_tasks || []).map(t => ({
          name: t.title,
          project: t.project,
          assignee: t.assignee,
          status: t.status,
          dueDate: t.end_date,
        })),
      });
      setPreviewType("detailed");
      setShowPreview(true);
    } catch (err) {
      console.error("Failed to load detailed preview:", err);
      alert("Failed to load report preview. Please try again.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadDetailedPDF = async () => {
    setLoading(true);
    try {
      await generateDetailedPDF();
      setShowPreview(false);
      onClose();
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fetchPerformancePreviewData = async () => {
    setPreviewLoading(true);
    try {
      const data = await fetchJson(`${API_URL}/reports/performance`);
      const user = getUser();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      const endDate = new Date();

      setPreviewData({
        generatedBy: user?.name || "Admin",
        dateRange: `${startDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} – ${endDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
        overview: data.overview || {},
        teams: (data.teams || []).map(t => ({
          name: t.name,
          members: t.members || 0,
          tasksCompleted: `${t.completed_tasks || 0} / ${t.total_tasks || 0}`,
          completionRate: t.completion_rate || 0,
        })),
        members: (data.members || []).map(m => ({
          name: m.name,
          assigned: m.assigned || 0,
          completed: m.completed || 0,
          pending: m.pending || 0,
          completionRate: m.completion_rate || 0,
        })),
        openTasks: (data.open_tasks || []).map(t => ({
          title: t.title,
          assignee: t.assignee,
          priority: t.priority,
          daysLate: t.days_late || 0,
        })),
      });
      setPreviewType("performance");
      setShowPreview(true);
    } catch (err) {
      console.error("Failed to load performance preview:", err);
      alert("Failed to load report preview. Please try again.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadPerformancePDF = async () => {
    setLoading(true);
    try {
      await generatePerformancePDF();
      setShowPreview(false);
      onClose();
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fetchProgressPreviewData = async () => {
    setPreviewLoading(true);
    try {
      const data = await fetchJson(`${API_URL}/reports/progress`);
      const user = getUser();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      const endDate = new Date();

      setPreviewData({
        generatedBy: user?.name || "Admin",
        dateRange: `${startDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} – ${endDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
        overview: data.overview || {},
        project: data.project || null,
        members: (data.members || []).map(m => ({
          name: m.name,
          assigned: m.assigned || 0,
        })),
        milestones: (data.milestones || []).map(m => ({
          title: m.title,
          status: m.status,
          targetDate: m.target_date,
          dueDate: m.due_date,
        })),
        openTasks: (data.open_tasks || []).map(t => ({
          title: t.title,
          assignee: t.assignee,
          priority: t.priority,
          daysLate: t.days_late || 0,
        })),
      });
      setPreviewType("progress");
      setShowPreview(true);
    } catch (err) {
      console.error("Failed to load progress preview:", err);
      alert("Failed to load report preview. Please try again.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadProgressPDF = async () => {
    setLoading(true);
    try {
      await generateProgressPDF();
      setShowPreview(false);
      onClose();
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const generateSummaryPDF = async () => {
    const period = getPeriodParam();
    const teamData = await fetchJson(`${API_URL}/reports/team-performance?period=${period}`);

    const doc = createDoc();
    const pageWidth = getPageWidth(doc);
    let y = 20;

    y = addLogo(doc, y);
    y = addTitle(doc, "Summary Report", y);
    y = addSubtitle(doc, `${selectedTeams} \u2022 ${customDate}`, y);
    y = addDivider(doc, y);

    y = addSectionTitle(doc, "Overview", y);
    y = addStatCards(doc, [
      { label: "Total Assigned", value: teamData.summary.total_assigned, color: COLORS.primary },
      { label: "Completed", value: teamData.summary.total_completed, color: COLORS.success },
      { label: "Pending", value: teamData.summary.total_pending, color: COLORS.warning },
      { label: "Completion Rate", value: `${teamData.summary.completion_rate}%`, color: COLORS.info },
    ], y);

    y = addDivider(doc, y);
    y = addSectionTitle(doc, "Team Members", y);
    y = addAutoTable(doc,
      ["Name", "Role", "Assigned", "Completed", "Pending"],
      teamData.members.map(m => [m.name, m.role, String(m.assigned), String(m.completed), String(m.pending)]),
      y,
      { columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 30 }, 2: { cellWidth: 25, halign: "center" }, 3: { cellWidth: 25, halign: "center" }, 4: { cellWidth: 25, halign: "center" } } }
    );

    y = addDivider(doc, y);
    y = addSectionTitle(doc, "Project Involvement", y);
    const projectRows = teamData.members.flatMap(m =>
      (m.projects || []).map(p => [m.name, p])
    );
    if (projectRows.length > 0) {
      y = addAutoTable(doc, ["Member", "Project"], projectRows, y);
    }

    addFooter(doc);
    savePdf(doc, `Summary-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const generateDetailedPDF = async () => {
    const period = getPeriodParam();
    const teamData = await fetchJson(`${API_URL}/reports/team-performance?period=${period}`);

    const doc = createDoc();
    const pageWidth = getPageWidth(doc);
    let y = 20;

    y = addLogo(doc, y);
    y = addTitle(doc, "Detailed Report", y);
    y = addSubtitle(doc, `${selectedTeams} \u2022 ${customDate}`, y);
    y = addDivider(doc, y);

    y = addSectionTitle(doc, "Performance Summary", y);
    y = addStatCards(doc, [
      { label: "Total Assigned", value: teamData.summary.total_assigned, color: COLORS.primary },
      { label: "Completed", value: teamData.summary.total_completed, color: COLORS.success },
      { label: "Pending", value: teamData.summary.total_pending, color: COLORS.warning },
      { label: "Completion Rate", value: `${teamData.summary.completion_rate}%`, color: COLORS.info },
    ], y);

    y = addDivider(doc, y);
    y = addSectionTitle(doc, "Member Details", y);
    y = addAutoTable(doc,
      ["Name", "Email", "Role", "Assigned", "Completed", "Pending"],
      teamData.members.map(m => [m.name, m.email, m.role, String(m.assigned), String(m.completed), String(m.pending)]),
      y,
      { columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 40 }, 2: { cellWidth: 25 }, 3: { cellWidth: 20, halign: "center" }, 4: { cellWidth: 20, halign: "center" }, 5: { cellWidth: 20, halign: "center" } } }
    );

    if (checks.completed) {
      y = addDivider(doc, y);
      y = addSectionTitle(doc, "Completed Task Breakdown", y);
      const completedRows = teamData.members
        .filter(m => m.completed > 0)
        .map(m => [m.name, String(m.completed), `${m.assigned > 0 ? Math.round((m.completed / m.assigned) * 100) : 0}%`]);
      if (completedRows.length > 0) {
        y = addAutoTable(doc, ["Member", "Completed", "Rate"], completedRows, y);
      }
    }

    addFooter(doc);
    savePdf(doc, `Detailed-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const generatePerformancePDF = async () => {
    const period = getPeriodParam();
    const teamData = await fetchJson(`${API_URL}/reports/team-performance?period=${period}`);

    const doc = createDoc();
    const pageWidth = getPageWidth(doc);
    let y = 20;

    y = addLogo(doc, y);
    y = addTitle(doc, "Team Performance Report", y);
    y = addSubtitle(doc, `${selectedTeams} \u2022 ${customDate}`, y);
    y = addDivider(doc, y);

    y = addSectionTitle(doc, "Team Summary", y);
    y = addStatCards(doc, [
      { label: "Total Assigned", value: teamData.summary.total_assigned, color: COLORS.primary },
      { label: "Completed", value: teamData.summary.total_completed, color: COLORS.success },
      { label: "Pending", value: teamData.summary.total_pending, color: COLORS.warning },
      { label: "Completion Rate", value: `${teamData.summary.completion_rate}%`, color: COLORS.info },
    ], y);

    y = addDivider(doc, y);
    y = addSectionTitle(doc, "Member Performance", y);
    y = addAutoTable(doc,
      ["Member", "Role", "Assigned", "Completed", "Pending", "Completion %"],
      teamData.members.map(m => [
        m.name,
        m.role,
        String(m.assigned),
        String(m.completed),
        String(m.pending),
        `${m.assigned > 0 ? Math.round((m.completed / m.assigned) * 100) : 0}%`,
      ]),
      y,
      { columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 25 }, 2: { cellWidth: 22, halign: "center" }, 3: { cellWidth: 22, halign: "center" }, 4: { cellWidth: 22, halign: "center" }, 5: { cellWidth: 28, halign: "center" } } }
    );

    y = addDivider(doc, y);
    y = addSectionTitle(doc, "Project Distribution", y);
    const projectMap = {};
    teamData.members.forEach(m => {
      (m.projects || []).forEach(p => {
        if (!projectMap[p]) projectMap[p] = [];
        projectMap[p].push(m.name);
      });
    });
    const projRows = Object.entries(projectMap).map(([project, members]) => [project, members.join(", ")]);
    if (projRows.length > 0) {
      y = addAutoTable(doc, ["Project", "Members"], projRows, y);
    }

    addFooter(doc);
    savePdf(doc, `Team-Performance-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const generateProgressPDF = async () => {
    const period = getPeriodParam();
    const teamData = await fetchJson(`${API_URL}/reports/team-performance?period=${period}`);

    const doc = createDoc();
    const pageWidth = getPageWidth(doc);
    let y = 20;

    y = addLogo(doc, y);
    y = addTitle(doc, "Project Progress Report", y);
    y = addSubtitle(doc, `${selectedTeams} \u2022 ${customDate}`, y);
    y = addDivider(doc, y);

    y = addSectionTitle(doc, "Overall Progress", y);
    y = addStatCards(doc, [
      { label: "Total Assigned", value: teamData.summary.total_assigned, color: COLORS.primary },
      { label: "Completed", value: teamData.summary.total_completed, color: COLORS.success },
      { label: "Pending", value: teamData.summary.total_pending, color: COLORS.warning },
      { label: "Completion Rate", value: `${teamData.summary.completion_rate}%`, color: COLORS.info },
    ], y);

    if (checks.activity) {
      y = addDivider(doc, y);
      y = addSectionTitle(doc, "Member Progress", y);
      y = addAutoTable(doc,
        ["Member", "Assigned", "Completed", "Pending", "Progress"],
        teamData.members.map(m => [
          m.name,
          String(m.assigned),
          String(m.completed),
          String(m.pending),
          `${m.assigned > 0 ? Math.round((m.completed / m.assigned) * 100) : 0}%`,
        ]),
        y
      );
    }

    if (checks.completed) {
      y = addDivider(doc, y);
      y = addSectionTitle(doc, "Completed Work", y);
      const completedRows = teamData.members
        .filter(m => m.completed > 0)
        .map(m => [m.name, String(m.completed), `${m.assigned > 0 ? Math.round((m.completed / m.assigned) * 100) : 0}%`]);
      if (completedRows.length > 0) {
        y = addAutoTable(doc, ["Member", "Completed Tasks", "Completion %"], completedRows, y);
      }
    }

    y = addDivider(doc, y);
    y = addSectionTitle(doc, "Project Overview", y);
    const projectMap = {};
    teamData.members.forEach(m => {
      (m.projects || []).forEach(p => {
        if (!projectMap[p]) projectMap[p] = new Set();
        projectMap[p].add(m.name);
      });
    });
    const projRows = Object.entries(projectMap).map(([project, members]) => [project, String(members.size)]);
    if (projRows.length > 0) {
      y = addAutoTable(doc, ["Project", "Team Size"], projRows, y);
    }

    addFooter(doc);
    savePdf(doc, `Project-Progress-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleExport = async () => {
    if (fileFormat !== "pdf") {
      alert("Only PDF export is currently supported.");
      return;
    }
    if (exportType === "summary") {
      await fetchPreviewData();
      return;
    }
    if (exportType === "detailed") {
      await fetchDetailedPreviewData();
      return;
    }
    if (exportType === "performance") {
      await fetchPerformancePreviewData();
      return;
    }
    if (exportType === "progress") {
      await fetchProgressPreviewData();
      return;
    }
    setLoading(true);
    try {
      switch (exportType) {
        case "detailed": await generateDetailedPDF(); break;
        case "performance": await generatePerformancePDF(); break;
        case "progress": await generateProgressPDF(); break;
        default: await generateSummaryPDF();
      }
      onClose();
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  if (showPreview && previewData) {
    const isDetailed = previewType === "detailed";
    const isPerformance = previewType === "performance";
    const isProgress = previewType === "progress";
    const reportTitle = isPerformance ? "Team Performance" : isDetailed ? "Detailed Report" : isProgress ? "Project Progress" : "Summary Report";
    const priorityColor = (p) => {
      const pr = (p || "").toLowerCase();
      if (pr === "high") return { bg: "#fee2e2", color: "#991b1b" };
      if (pr === "low") return { bg: "#dbeafe", color: "#1d4ed8" };
      return { bg: "#fef3c7", color: "#92400e" };
    };
    const statusColor = (s) => {
      const st = (s || "").toLowerCase();
      if (st === "completed" || st === "done") return { bg: "#d1fae5", color: "#047857" };
      if (st === "in_progress" || st === "active") return { bg: "#dbeafe", color: "#1d4ed8" };
      if (st === "planned") return { bg: "#f1f5f9", color: "#475569" };
      if (st === "failed") return { bg: "#fee2e2", color: "#991b1b" };
      return { bg: "#fef3c7", color: "#92400e" };
    };

    const handleDownload = isPerformance ? handleDownloadPerformancePDF : isDetailed ? handleDownloadDetailedPDF : isProgress ? handleDownloadProgressPDF : handleDownloadSummaryPDF;

    return createPortal(
      <div className="er-overlay" onClick={onClose}>
        <div className="sr-modal" onClick={(e) => e.stopPropagation()}>
          <div className="sr-report">
            {/* Header */}
            <div className="sr-header">
              <div className="sr-logo">
                <div className="sr-logo-icon"></div>
                <span>PMS</span>
              </div>
              <h1 className="sr-title">{reportTitle}</h1>
              <div className="sr-avatar">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <circle cx="20" cy="20" r="20" fill="#e5e7eb" />
                  <circle cx="20" cy="16" r="7" fill="#9ca3af" />
                  <path d="M6 36c0-7.732 6.268-14 14-14s14 6.268 14 14" fill="#9ca3af" />
                </svg>
              </div>
              <p className="sr-generated-label">Generated By:</p>
              <p className="sr-generated-name">{previewData.generatedBy}</p>
              <p className="sr-date-range">{previewData.dateRange}</p>
            </div>

            <div className={`sr-divider ${isPerformance ? "sr-divider--peach" : isProgress ? "sr-divider--pink" : ""}`}></div>

            {/* ═══ PERFORMANCE: Performance Overview ═══ */}
            {isPerformance && previewData.overview && (
              <div className="sr-section">
                <h2 className="sr-section-title">Performance Overview</h2>
                <div className="sr-overview-card">
                  <div className="sr-overview-stats">
                    <div className="sr-overview-stat">
                      <span className="sr-overview-stat__label">Assigned</span>
                      <span className="sr-overview-stat__value sr-overview-stat__value--blue">{previewData.overview.assigned}</span>
                    </div>
                    <div className="sr-overview-stat">
                      <span className="sr-overview-stat__label">Completed</span>
                      <span className="sr-overview-stat__value sr-overview-stat__value--green">{previewData.overview.completed}</span>
                    </div>
                    <div className="sr-overview-stat">
                      <span className="sr-overview-stat__label">Pending</span>
                      <span className="sr-overview-stat__value sr-overview-stat__value--amber">{previewData.overview.pending}</span>
                    </div>
                    <div className="sr-overview-stat">
                      <span className="sr-overview-stat__label">Overdue</span>
                      <span className="sr-overview-stat__value sr-overview-stat__value--red">{previewData.overview.overdue}</span>
                    </div>
                  </div>
                  <div className="sr-overview-rate">
                    <span>Completion Rate</span>
                    <span className="sr-overview-rate__value">{previewData.overview.completion_rate}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ PERFORMANCE: Team Overview ═══ */}
            {isPerformance && previewData.overview && (
              <div className="sr-section">
                <h2 className="sr-section-title">Team Overview</h2>
                <div className="sr-summary-card">
                  <div className="sr-summary-row">
                    <span className="sr-summary-label">Teams Name</span>
                    <span className="sr-summary-value">All Teams</span>
                  </div>
                  <div className="sr-summary-row">
                    <span className="sr-summary-label">Department</span>
                    <span className="sr-summary-value">Engineering</span>
                  </div>
                  <div className="sr-summary-row">
                    <span className="sr-summary-label">Team Lead</span>
                    <span className="sr-summary-value">—</span>
                  </div>
                  <div className="sr-summary-row">
                    <span className="sr-summary-label">Members</span>
                    <span className="sr-summary-value">{previewData.members?.length || 0}</span>
                  </div>
                  <div className="sr-summary-row">
                    <span className="sr-summary-label">Projects</span>
                    <span className="sr-summary-value">{previewData.teams?.length || 0}</span>
                  </div>
                  <div className="sr-summary-row sr-summary-row--last">
                    <span className="sr-summary-label">Report Period</span>
                    <span className="sr-summary-value">{new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ PERFORMANCE: Team Performance table ═══ */}
            {isPerformance && previewData.teams && previewData.teams.length > 0 && (
              <div className="sr-section">
                <h2 className="sr-section-title">Team Performance</h2>
                <div className="sr-projects-card">
                  <div className="sr-projects-table">
                    <div className="sr-projects-head sr-projects-head--teams">
                      <span>Team Name</span>
                      <span>Members</span>
                      <span>Task Completed</span>
                      <span>Completion Rate</span>
                    </div>
                    {previewData.teams.map((t, i) => (
                      <div key={i} className="sr-projects-row sr-projects-row--teams">
                        <span className="sr-project-name">{t.name}</span>
                        <span>{t.members}</span>
                        <span>{t.tasksCompleted}</span>
                        <span>{t.completionRate}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ PERFORMANCE: Member Performance table ═══ */}
            {isPerformance && previewData.members && previewData.members.length > 0 && (
              <div className="sr-section">
                <h2 className="sr-section-title">Member Performance</h2>
                <div className="sr-projects-card">
                  <div className="sr-projects-table">
                    <div className="sr-projects-head sr-projects-head--members">
                      <span>Member</span>
                      <span>Task Assigned</span>
                      <span>Tasks Completed</span>
                      <span>Pending Tasks</span>
                      <span>Completion Rate</span>
                    </div>
                    {previewData.members.map((m, i) => (
                      <div key={i} className="sr-projects-row sr-projects-row--members">
                        <span className="sr-project-name">{m.name}</span>
                        <span>{m.assigned}</span>
                        <span>{m.completed}</span>
                        <span>{m.pending}</span>
                        <span style={{ color: m.completionRate >= 80 ? "#047857" : m.completionRate >= 50 ? "#92400e" : "#991b1b", fontWeight: 700 }}>
                          {m.completionRate}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ PERFORMANCE: Workload Distribution ═══ */}
            {isPerformance && previewData.members && previewData.members.length > 0 && (
              <div className="sr-section">
                <h2 className="sr-section-title">Workload Distribution</h2>
                <div className="sr-projects-card" style={{ padding: "16px 18px" }}>
                  <p style={{ margin: "0 0 14px", fontSize: "12px", fontWeight: 700, color: "#6366f1" }}>Tasks Assigned Per Member</p>
                  {previewData.members.map((m, i) => {
                    const maxAssigned = Math.max(...previewData.members.map(x => x.assigned), 1);
                    const barWidth = Math.max((m.assigned / maxAssigned) * 100, 4);
                    return (
                      <div key={i} className="sr-workload-row">
                        <span className="sr-workload-name">{m.name}</span>
                        <div className="sr-workload-bar-wrap">
                          <div className="sr-workload-bar" style={{ width: `${barWidth}%` }} />
                        </div>
                        <span className="sr-workload-val">{m.assigned}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ═══ PERFORMANCE: Open Tasks & Risks ═══ */}
            {isPerformance && previewData.openTasks && previewData.openTasks.length > 0 && (
              <div className="sr-section">
                <h2 className="sr-section-title">Open Tasks & Risks</h2>
                <div className="sr-projects-card">
                  <div className="sr-projects-table">
                    <div className="sr-projects-head sr-projects-head--risks">
                      <span>Task Name</span>
                      <span>Assignee</span>
                      <span>Priority</span>
                      <span>Days Late</span>
                    </div>
                    {previewData.openTasks.map((t, i) => (
                      <div key={i} className="sr-projects-row sr-projects-row--risks">
                        <span className="sr-project-name">{t.title}</span>
                        <span>{t.assignee}</span>
                        <span>
                          <span className="sr-status-badge" style={{ background: priorityColor(t.priority).bg, color: priorityColor(t.priority).color }}>
                            {t.priority}
                          </span>
                        </span>
                        <span>{t.daysLate} {t.daysLate === 1 ? "Day" : "Days"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ PROGRESS: Performance Overview ═══ */}
            {isProgress && previewData.overview && (
              <div className="sr-section">
                <h2 className="sr-section-title">Performance Overview</h2>
                <div className="sr-overview-card">
                  <div className="sr-overview-stats">
                    <div className="sr-overview-stat">
                      <span className="sr-overview-stat__label">Assigned</span>
                      <span className="sr-overview-stat__value sr-overview-stat__value--blue">{previewData.overview.assigned}</span>
                    </div>
                    <div className="sr-overview-stat">
                      <span className="sr-overview-stat__label">Completed</span>
                      <span className="sr-overview-stat__value sr-overview-stat__value--green">{previewData.overview.completed}</span>
                    </div>
                    <div className="sr-overview-stat">
                      <span className="sr-overview-stat__label">Pending</span>
                      <span className="sr-overview-stat__value sr-overview-stat__value--amber">{previewData.overview.pending}</span>
                    </div>
                    <div className="sr-overview-stat">
                      <span className="sr-overview-stat__label">Overdue</span>
                      <span className="sr-overview-stat__value sr-overview-stat__value--red">{previewData.overview.overdue}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ PROGRESS: Completion Rate (Donut) ═══ */}
            {isProgress && previewData.overview && (
              <div className="sr-section">
                <h2 className="sr-section-title">Completion Rate</h2>
                <div className="sr-donut-card">
                  <div className="sr-donut-wrap">
                    <svg className="sr-donut" viewBox="0 0 120 120">
                      {(() => {
                        const total = previewData.overview.assigned || 1;
                        const completed = previewData.overview.completed || 0;
                        const pending = previewData.overview.pending || 0;
                        const overdue = previewData.overview.overdue || 0;
                        const pctCompleted = (completed / total) * 100;
                        const pctPending = (pending / total) * 100;
                        const pctOverdue = (overdue / total) * 100;
                        const r = 45;
                        const circ = 2 * Math.PI * r;
                        const dashCompleted = (pctCompleted / 100) * circ;
                        const dashPending = (pctPending / 100) * circ;
                        const dashOverdue = (pctOverdue / 100) * circ;
                        const offsetCompleted = 0;
                        const offsetPending = dashCompleted;
                        const offsetOverdue = dashCompleted + dashPending;
                        return (
                          <>
                            <circle cx="60" cy="60" r={r} fill="none" stroke="#e5e7eb" strokeWidth="12" />
                            <circle cx="60" cy="60" r={r} fill="none" stroke="#22c55e" strokeWidth="12"
                              strokeDasharray={`${dashCompleted} ${circ}`} strokeDashoffset={-offsetCompleted}
                              transform="rotate(-90 60 60)" strokeLinecap="round" />
                            <circle cx="60" cy="60" r={r} fill="none" stroke="#f59e0b" strokeWidth="12"
                              strokeDasharray={`${dashPending} ${circ}`} strokeDashoffset={-offsetPending}
                              transform="rotate(-90 60 60)" strokeLinecap="round" />
                            <circle cx="60" cy="60" r={r} fill="none" stroke="#ef4444" strokeWidth="12"
                              strokeDasharray={`${dashOverdue} ${circ}`} strokeDashoffset={-offsetOverdue}
                              transform="rotate(-90 60 60)" strokeLinecap="round" />
                            <text x="60" y="56" textAnchor="middle" fontSize="22" fontWeight="800" fill="#111827">
                              {Math.round(pctCompleted)}%
                            </text>
                            <text x="60" y="72" textAnchor="middle" fontSize="9" fill="#6b7280">
                              Completion
                            </text>
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                  <div className="sr-donut-legend">
                    <div className="sr-donut-legend__item">
                      <span className="sr-donut-dot" style={{ background: "#22c55e" }}></span>
                      <span>Completed</span>
                      <span className="sr-donut-legend__val">{previewData.overview.completed} ({Math.round(((previewData.overview.completed || 0) / (previewData.overview.assigned || 1)) * 100)}%)</span>
                    </div>
                    <div className="sr-donut-legend__item">
                      <span className="sr-donut-dot" style={{ background: "#f59e0b" }}></span>
                      <span>Pending</span>
                      <span className="sr-donut-legend__val">{previewData.overview.pending} ({Math.round(((previewData.overview.pending || 0) / (previewData.overview.assigned || 1)) * 100)}%)</span>
                    </div>
                    <div className="sr-donut-legend__item">
                      <span className="sr-donut-dot" style={{ background: "#ef4444" }}></span>
                      <span>Overdue</span>
                      <span className="sr-donut-legend__val">{previewData.overview.overdue} ({Math.round(((previewData.overview.overdue || 0) / (previewData.overview.assigned || 1)) * 100)}%)</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ PROGRESS: Project Overview ═══ */}
            {isProgress && previewData.project && (
              <div className="sr-section">
                <h2 className="sr-section-title">Project Overview</h2>
                <div className="sr-summary-card">
                  <div className="sr-summary-row">
                    <span className="sr-summary-label">Project Name</span>
                    <span className="sr-summary-value">{previewData.project.name}</span>
                  </div>
                  <div className="sr-summary-row">
                    <span className="sr-summary-label">Client</span>
                    <span className="sr-summary-value">{previewData.project.client}</span>
                  </div>
                  <div className="sr-summary-row">
                    <span className="sr-summary-label">Team Lead</span>
                    <span className="sr-summary-value">{previewData.project.team_lead}</span>
                  </div>
                  <div className="sr-summary-row">
                    <span className="sr-summary-label">Members</span>
                    <span className="sr-summary-value">{previewData.project.members}</span>
                  </div>
                  <div className="sr-summary-row">
                    <span className="sr-summary-label">Start Date</span>
                    <span className="sr-summary-value">{formatDateTimeShort(previewData.project.start_date)}</span>
                  </div>
                  <div className="sr-summary-row sr-summary-row--last">
                    <span className="sr-summary-label">Due Date</span>
                    <span className="sr-summary-value">{formatDateTimeShort(previewData.project.end_date)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ PROGRESS: Team Contribution (Workload) ═══ */}
            {isProgress && previewData.members && previewData.members.length > 0 && (
              <div className="sr-section">
                <h2 className="sr-section-title">Team Contribution</h2>
                <div className="sr-projects-card" style={{ padding: "16px 18px" }}>
                  <p style={{ margin: "0 0 14px", fontSize: "12px", fontWeight: 700, color: "#6366f1" }}>Tasks Assigned Per Member</p>
                  {previewData.members.map((m, i) => {
                    const maxAssigned = Math.max(...previewData.members.map(x => x.assigned), 1);
                    const barWidth = Math.max((m.assigned / maxAssigned) * 100, 4);
                    return (
                      <div key={i} className="sr-workload-row">
                        <span className="sr-workload-name">{m.name}</span>
                        <div className="sr-workload-bar-wrap">
                          <div className="sr-workload-bar" style={{ width: `${barWidth}%` }} />
                        </div>
                        <span className="sr-workload-val">{m.assigned}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ═══ PROGRESS: Milestones Tracking ═══ */}
            {isProgress && previewData.milestones && previewData.milestones.length > 0 && (
              <div className="sr-section">
                <h2 className="sr-section-title">Milestones Tracking</h2>
                <div className="sr-projects-card">
                  <div className="sr-projects-table">
                    <div className="sr-projects-head sr-projects-head--milestones">
                      <span>Milestone</span>
                      <span>Status</span>
                      <span>Target Date</span>
                      <span>Due Date</span>
                    </div>
                    {previewData.milestones.map((m, i) => (
                      <div key={i} className="sr-projects-row sr-projects-row--milestones">
                        <span className="sr-project-name">{m.title}</span>
                        <span>
                          <span className="sr-status-badge" style={{ background: statusColor(m.status).bg, color: statusColor(m.status).color }}>
                            {m.status === "completed" || m.status === "done" ? "Completed" : m.status === "in_progress" ? "In Progress" : m.status || "Pending"}
                          </span>
                        </span>
                        <span>{formatDateTimeShort(m.targetDate)}</span>
                        <span>{formatDateTimeShort(m.dueDate)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ PROGRESS: Open Tasks & Risks ═══ */}
            {isProgress && previewData.openTasks && previewData.openTasks.length > 0 && (
              <div className="sr-section">
                <h2 className="sr-section-title">Open Tasks & Risks</h2>
                <div className="sr-projects-card">
                  <div className="sr-projects-table">
                    <div className="sr-projects-head sr-projects-head--risks">
                      <span>Task Name</span>
                      <span>Assignee</span>
                      <span>Priority</span>
                      <span>Days Late</span>
                    </div>
                    {previewData.openTasks.map((t, i) => (
                      <div key={i} className="sr-projects-row sr-projects-row--risks">
                        <span className="sr-project-name">{t.title}</span>
                        <span>{t.assignee}</span>
                        <span>
                          <span className="sr-status-badge" style={{ background: priorityColor(t.priority).bg, color: priorityColor(t.priority).color }}>
                            {t.priority}
                          </span>
                        </span>
                        <span>{t.daysLate} {t.daysLate === 1 ? "Day" : "Days"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ SUMMARY / DETAILED: Report Overview ═══ */}
            {!isPerformance && !isProgress && (
              <div className="sr-section">
                <h2 className="sr-section-title">{isDetailed ? "Report Overview" : "Executive Summary"}</h2>
                <div className="sr-summary-card">
                  <div className="sr-summary-row">
                    <span className="sr-summary-label">Total Teams</span>
                    <span className="sr-summary-value">{String(previewData.totalTeams).padStart(2, "0")}</span>
                  </div>
                  <div className="sr-summary-row">
                    <span className="sr-summary-label">Active Projects</span>
                    <span className="sr-summary-value">{previewData.activeProjects}</span>
                  </div>
                  <div className="sr-summary-row">
                    <span className="sr-summary-label">Tasks Created</span>
                    <span className="sr-summary-value">{previewData.tasksCreated}</span>
                  </div>
                  <div className="sr-summary-row">
                    <span className="sr-summary-label">Task Completed</span>
                    <span className="sr-summary-value">{previewData.tasksCompleted}</span>
                  </div>
                  <div className="sr-summary-row">
                    <span className="sr-summary-label">Completion Rate</span>
                    <span className="sr-summary-value">{previewData.completionRate}</span>
                  </div>
                  <div className="sr-summary-row sr-summary-row--last">
                    <span className="sr-summary-label">Overdue Tasks</span>
                    <span className="sr-summary-value">{previewData.overdueTasks}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ SUMMARY / DETAILED: Projects Progress ═══ */}
            {!isPerformance && !isProgress && (
              <div className="sr-section">
                <h2 className="sr-section-title">Projects Progress</h2>
                <div className="sr-projects-card">
                  <div className="sr-projects-table">
                    <div className="sr-projects-head">
                      <span>Projects</span>
                      <span>Completion</span>
                      <span>Task Completed</span>
                      <span>{isDetailed ? "Status" : "Date"}</span>
                    </div>
                    {previewData.projects.map((p, i) => (
                      <div key={i} className="sr-projects-row">
                        <span className="sr-project-name">{p.name}</span>
                        <span className="sr-project-completion">
                          {p.completion}%
                          <div className="sr-progress-bar">
                            <div
                              className="sr-progress-fill"
                              style={{
                                width: `${p.completion}%`,
                                background: p.completion >= 80 ? "#22c55e" : p.completion >= 50 ? "#f59e0b" : "#3b82f6",
                              }}
                            />
                          </div>
                        </span>
                        <span>{p.tasksCompleted}</span>
                        <span>
                          {isDetailed ? (
                            <span className="sr-status-badge" style={{ background: statusColor(p.status).bg, color: statusColor(p.status).color }}>
                              {p.status || "—"}
                            </span>
                          ) : (
                            formatDateTimeShort(p.date)
                          )}
                        </span>
                      </div>
                    ))}
                    {previewData.projects.length === 0 && (
                      <div className="sr-projects-empty">No projects found.</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ DETAILED: Team Performance ═══ */}
            {isDetailed && previewData.teams && previewData.teams.length > 0 && (
              <div className="sr-section">
                <h2 className="sr-section-title">Team Performance</h2>
                <div className="sr-projects-card">
                  <div className="sr-projects-table">
                    <div className="sr-projects-head sr-projects-head--teams">
                      <span>Team Name</span>
                      <span>Members</span>
                      <span>Task Completed</span>
                      <span>Completion Rate</span>
                    </div>
                    {previewData.teams.map((t, i) => (
                      <div key={i} className="sr-projects-row sr-projects-row--teams">
                        <span className="sr-project-name">{t.name}</span>
                        <span>{t.members}</span>
                        <span>{t.tasksCompleted}</span>
                        <span>{t.completionRate}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ DETAILED: Attention Required ═══ */}
            {isDetailed && previewData.overdueList && previewData.overdueList.length > 0 && (
              <div className="sr-section">
                <h2 className="sr-section-title">Attention Required</h2>
                <div className="sr-projects-card">
                  <div className="sr-projects-table">
                    <div className="sr-projects-head sr-projects-head--overdue">
                      <span>Task</span>
                      <span>Project</span>
                      <span>Days Overdue</span>
                    </div>
                    {previewData.overdueList.map((t, i) => (
                      <div key={i} className="sr-projects-row sr-projects-row--overdue">
                        <span className="sr-project-name">{t.task}</span>
                        <span>{t.project}</span>
                        <span>{t.daysOverdue} Days</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ DETAILED: Task Details ═══ */}
            {isDetailed && previewData.recentTasks && previewData.recentTasks.length > 0 && (
              <div className="sr-section">
                <h2 className="sr-section-title">Task Details</h2>
                <div className="sr-projects-card">
                  <div className="sr-projects-table">
                    <div className="sr-projects-head sr-projects-head--tasks">
                      <span>Task Name</span>
                      <span>Project Name</span>
                      <span>Assignee</span>
                      <span>Status</span>
                      <span>Due Date</span>
                    </div>
                    {previewData.recentTasks.map((t, i) => (
                      <div key={i} className="sr-projects-row sr-projects-row--tasks">
                        <span className="sr-project-name">{t.name}</span>
                        <span>{t.project}</span>
                        <span>{t.assignee}</span>
                        <span>
                          <span className="sr-status-badge" style={{ background: statusColor(t.status).bg, color: statusColor(t.status).color }}>
                            {t.status === "completed" || t.status === "done" ? "Completed" : t.status === "in_progress" ? "In Progress" : t.status || "—"}
                          </span>
                        </span>
                        <span>{formatDateTimeShort(t.dueDate)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="sr-footer">
              <span>Generated by PMS</span>
              <span>Page 1 of 6</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="sr-actions">
            <button className="sr-cancel-btn" onClick={() => setShowPreview(false)}>
              Cancel
            </button>
            <button className="sr-download-btn" onClick={handleDownload} disabled={loading}>
              {loading ? (
                <span>Generating...</span>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v8M4 6l4 4 4-4M2 14h12" />
                  </svg>
                  Download PDF
                </>
              )}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="er-overlay" onClick={onClose}>
      <div className="er-modal" onClick={(e) => e.stopPropagation()}>

        {/* HEADER */}
        <div className="er-header">
          <div>
            <h2>Export Report</h2>
            <p>Choose your preferences and export your report.</p>
          </div>
          <button className="er-close-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5L5 15M5 5l10 10" />
            </svg>
          </button>
        </div>

        {/* SECTION 1: CHOOSE TEAMS */}
        <div className="er-section">
          <h3>1. Choose Teams</h3>
          <div className="er-teams-row">
            <div className="er-select-wrapper">
              <select value={selectedTeams} onChange={(e) => setSelectedTeams(e.target.value)}>
                <option>Design Team, Development Team</option>
                <option>Design Team</option>
                <option>Development Team</option>
                <option>All Teams</option>
              </select>
            </div>
            <button className="er-include-btn">Include all teams</button>
          </div>
          <p className="er-or-label">Or Choose Projects & Tasks</p>
          <div className="er-projects-row">
            <div className="er-select-wrapper">
              <select value={selectedProjects} onChange={(e) => setSelectedProjects(e.target.value)}>
                <option>All Projects</option>
                <option>Ecommerce Website</option>
                <option>Website Redesign</option>
                <option>CRM System</option>
                <option>Mobile App</option>
              </select>
            </div>
            <button className="er-include-btn">Include all projects</button>
            <div className="er-select-wrapper">
              <select value={selectedTasks} onChange={(e) => setSelectedTasks(e.target.value)}>
                <option>All Tasks</option>
                <option>Pending</option>
                <option>In Progress</option>
                <option>Completed</option>
                <option>Overdue</option>
              </select>
            </div>
            <button className="er-include-btn">Include all tasks</button>
          </div>
        </div>

        {/* SECTION 2: EXPORT TYPE */}
        <div className="er-section">
          <h3>2. Export Type</h3>
          <div className="er-cards-grid er-export-type-grid">
            {exportTypes.map((type) => (
              <div
                key={type.id}
                className={`er-type-card ${exportType === type.id ? "active" : ""}`}
                onClick={() => setExportType(type.id)}
              >
                <div className="er-type-icon">{type.icon}</div>
                <h4>{type.title}</h4>
                <p>{type.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION 3: DATE RANGE */}
        <div className="er-section">
          <h3>3. Date Range</h3>
          <div className="er-date-row">
            <div className="er-date-buttons">
              {["Today", "This Week", "This Month", "Custom"].map((range) => (
                <button
                  key={range}
                  className={`er-date-btn ${dateRange === range ? "active" : ""}`}
                  onClick={() => setDateRange(range)}
                >
                  {range}
                </button>
              ))}
            </div>
            <div className="er-date-display">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="14" height="13" rx="2" />
                <path d="M2 7h14" />
                <path d="M6 1v4M12 1v4" />
              </svg>
              <span>{customDate}</span>
            </div>
          </div>
        </div>

        {/* SECTION 4: FILE FORMAT */}
        <div className="er-section">
          <h3>4. File Format</h3>
          <div className="er-cards-grid er-format-grid">
            {fileFormats.map((format) => (
              <div
                key={format.id}
                className={`er-format-card ${fileFormat === format.id ? "active" : ""}`}
                onClick={() => setFileFormat(format.id)}
              >
                <div className="er-format-icon">{format.icon}</div>
                <div className="er-format-info">
                  <h4>{format.title}</h4>
                  <p>{format.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION 5: INCLUDE OPTIONS */}
        <div className="er-section">
          <h3>5. Include Options</h3>
          <div className="er-checkbox-row">
            {includeOptionsList.map((opt) => (
              <label key={opt.id} className="er-checkbox-label">
                <input
                  type="checkbox"
                  checked={checks[opt.id]}
                  onChange={() => toggleCheck(opt.id)}
                />
                <span className="er-checkbox-custom"></span>
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* FOOTER */}
        <div className="er-footer">
          <button className="er-cancel-btn" onClick={onClose}>Cancel</button>
          <button
            className="er-export-btn"
            onClick={handleExport}
            disabled={loading || previewLoading || fileFormat === "excel"}
            style={fileFormat === "excel" ? { opacity: 0.5, cursor: "not-allowed" } : {}}
          >
            {loading || previewLoading ? (
              <span>Generating...</span>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v8M4 6l4 4 4-4M2 14h12" />
                </svg>
                Export Report
              </>
            )}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}

export default ExportReport;
