/**
 * MemberExportReport — modal component for generating and exporting a user/member
 * performance report as a styled PDF.  Used on both the user-performance page
 * (admin/manager viewing another user) and the self-performance page (member
 * viewing own data).
 *
 * The component accepts user data, summary statistics, task/project lists and
 * deliverable information, then renders a configuration modal (date-range
 * picker) followed by a full preview modal.  The "Export PDF" button triggers
 * jsPDF to build a multi-section A4 document containing header, profile,
 * summary cards, status breakdown, workload chart, tasks table, deliverables
 * summary and a manager-remarks section.
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import DonutChart from "../components/DonutChart";
import "../components/Charts.css";
import "../pages/ExportReport.css";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";

/** Mapping of status strings to RGB colour triples used when drawing PDF cells. */
const STATUS_COLORS_PDF = {
  completed: [22, 101, 52], done: [22, 101, 52], approved: [22, 101, 52],
  pending: [146, 64, 14], "in_progress": [30, 64, 175], "in progress": [30, 64, 175],
  submitted: [30, 64, 175], reopened: [91, 33, 182], rejected: [153, 27, 27],
  failed: [153, 27, 27], overdue: [153, 27, 27],
};

/** Format a date string to a short "DD Mon YYYY" display. */
function formatDateShort(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Capitalise and map raw status keys to display-friendly labels. */
function formatStatus(status) {
  const map = { pending: "Pending", submitted: "Submitted", reopened: "Reopened", approved: "Approved", rejected: "Rejected" };
  return map[status] || status || "-";
}

/**
 * Calculate the progress percentage for a task/project item.
 * For projects it uses completed_tasks/total_tasks; for tasks it
 * falls back to the deliverables_progress field.
 */
function calculateProgress(item) {
  if (item.item_type === "project") {
    const t = Number(item.total_tasks ?? 0) || 0, c = Number(item.completed_tasks ?? 0) || 0;
    return t === 0 ? 0 : Math.round((c / t) * 100) || 0;
  }
  return Number(item.deliverables_progress) || 0;
}

/** Reusable style presets used for status/priority pills in the review UI. */
const S = {
  green: { bg: "#dcfce7", text: "#166534" },
  red: { bg: "#fee2e2", text: "#991b1b" },
  amber: { bg: "#fef3c7", text: "#92400e" },
  blue: { bg: "#dbeafe", text: "#1e40af" },
  indigo: { bg: "#eef2ff", text: "#4338ca" },
  purple: { bg: "#ede9fe", text: "#5b21b6" },
  gray: { bg: "#f3f4f6", text: "#6b7280" },
};

/** Return the background/text style pair for a given status string. */
function getStatusStyle(s) {
  const m = {
    approved: S.green, completed: S.green, done: S.green,
    pending: S.amber, in_progress: S.blue, "in progress": S.blue,
    submitted: S.blue, reopened: S.purple, rejected: S.red,
    failed: S.red, overdue: S.red,
  };
  return m[s?.toLowerCase()] || S.gray;
}

/** Return the background/text style pair for a given priority level. */
function getPriStyle(p) {
  const m = { High: S.red, Medium: S.amber, Low: S.green };
  return m[p] || S.amber;
}

/**
 * MemberExportReport — renders a portal-based modal for exporting a user
 * performance report.  Manages date-range selection, preview display and
 * PDF generation.
 *
 * @param {boolean}  isOpen     - Whether the modal is visible.
 * @param {function} onClose    - Callback to close the modal.
 * @param {object}   userData   - Full user report data (user, summary, tasks, etc.).
 * @param {boolean}  isOwnPage  - True when the logged-in user is viewing their own report.
 */
function MemberExportReport({ isOpen, onClose, userData, isOwnPage = false }) {
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
  useEscapeKey(true, handleClose);

  const [dateRange, setDateRange] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [generating, setGenerating] = useState(false);
  const [showReview, setShowReview] = useState(false);

  const user = userData?.user || {};
  const summary = userData?.summary || {};
  const statusBreakdown = userData?.status_breakdown || {};
  const statusDistribution = userData?.status_distribution || {};
  const priorityDistribution = userData?.priority_distribution || {};
  const tasks = userData?.tasks || [];
  const projects = userData?.projects || [];
  const deliverables = userData?.deliverables || [];
  const delivSummary = userData?.deliverable_summary || {};

  // "MY" for member/team_lead viewing own page, "USER" for admin/manager viewing others
  const reportLabel = isOwnPage ? "MY" : "USER";
  const reportLabelTitle = isOwnPage ? "My" : "User";

  const allItems = [
    ...tasks.map(t => ({ ...t, item_type: "task" })),
    ...projects.map(p => ({
      ...p, item_type: "project", title: p.name || p.title,
      status: ["submitted", "approved", "rejected", "reopened"].includes(p.status) ? p.status : "pending",
    })),
  ];

  const dateRangeLabels = {
    all: "All Time", today: "Today", week: "This Week", month: "This Month",
    custom: customStart && customEnd ? `${formatDateShort(customStart)} - ${formatDateShort(customEnd)}` : "Custom Range",
  };

  const filterByDateRange = (items) => {
    if (dateRange === "all") return items;
    const now = new Date();
    let start;
    if (dateRange === "today") start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (dateRange === "week") { start = new Date(now); start.setDate(now.getDate() - 7); }
    else if (dateRange === "month") { start = new Date(now); start.setMonth(now.getMonth() - 1); }
    else if (dateRange === "custom" && customStart && customEnd) {
      const s = new Date(customStart), e = new Date(customEnd); e.setHours(23, 59, 59, 999);
      return items.filter(i => { const d = new Date(i.end_date || i.created_at || i.start_date || Date.now()); return !isNaN(d) && d >= s && d <= e; });
    } else return items;
    return items.filter(i => { const d = new Date(i.end_date || i.created_at || i.start_date || Date.now()); return !isNaN(d) && d >= start; });
  };

  const filteredItems = filterByDateRange(allItems);
  const filteredTasks = filteredItems.filter(i => i.item_type !== "project");
  const filteredProjects = filteredItems.filter(i => i.item_type === "project");
  const totalItems = filteredItems.length;
  const totalAssigned = summary.total_assigned ?? totalItems;
  const approvedCount = summary.approved ?? statusBreakdown.completed ?? 0;
  const pendingCount = summary.pending ?? statusBreakdown.pending ?? 0;
  const overdueCount = summary.overdue ?? 0;

  const sc = {
    approved: statusDistribution.approved ?? statusBreakdown.completed ?? 0,
    pending: statusDistribution.pending ?? statusBreakdown.pending ?? 0,
    submitted: statusDistribution.submitted ?? 0,
    reopened: statusDistribution.reopened ?? 0,
    rejected: statusDistribution.rejected ?? 0,
    overdue: statusDistribution.overdue ?? overdueCount,
  };

  const now = new Date();
  const genDate = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const genTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  const roleDisplay = user.role
    ? user.role === "team_lead" || user.role === "teamlead"
      ? "Team Lead"
      : user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : "Member";
  const empId = user.employee_id || "EMP-" + String(user.id || 0).padStart(4, "0");

  // ═══════════════════════════ PDF GENERATION ═══════════════════════════
  const generatePDF = () => {
    setGenerating(true);
    try {
      const doc = new jsPDF("p", "mm", "a4");
      const PW = doc.internal.pageSize.getWidth();
      const PH = doc.internal.pageSize.getHeight();
      const M = 14;
      const CW = PW - M * 2;
      let y = 0;

      // ── HEADER ──
      doc.setFillColor(15, 23, 42); doc.rect(0, 0, PW, 14, "F");
      doc.setFillColor(79, 70, 229); doc.roundedRect(M, 2.5, 8, 8, 1.5, 1.5, "F");
      doc.setFontSize(5.5); doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255); doc.text("TX", M + 4, 8, { align: "center" });
      doc.setFontSize(9); doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255); doc.text("Techxaro", M + 12, 6.5);
      doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184); doc.text("PMS Portal", M + 12, 10.5);
      doc.setFontSize(11); doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(`${reportLabel} PERFORMANCE REPORT`, PW / 2, 8, { align: "center" });
      y = 18;

      // ── PROFILE ──
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
      doc.roundedRect(M, y, CW, 24, 2, 2, "S");
      doc.setFillColor(209, 213, 219); doc.circle(M + 14, y + 12, 7.5, "F");
      doc.setFillColor(152, 163, 175); doc.circle(M + 14, y + 8.5, 3.5, "F");
      doc.setFillColor(209, 213, 219); doc.circle(M + 14, y + 17, 5, "F");
      doc.setFillColor(15, 23, 42); doc.circle(M + 14, y + 8.5, 1.5, "F");
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text(user.name || "Unknown User", M + 27, y + 7);
      doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128); doc.text(roleDisplay, M + 27, y + 12);
      doc.setTextColor(99, 102, 241); doc.setFont("helvetica", "bold");
      doc.text(user.team || "", M + 27, y + 16);
      // Profile right side — 2-col grid
      const profileRX = M + CW / 2 + 5;
      const profileData = [
        ["Employee ID:", empId, "Role:", roleDisplay],
        ["Report Period:", dateRangeLabels[dateRange], "Reporting To:", user.reporting_to || "-"],
        ["Total Work Items:", String(totalItems), "Report Date:", genDate],
        ["Team:", user.team || "-", "Report Time:", genTime],
      ];
      profileData.forEach((row, ri) => {
        const ry = y + 4 + ri * 5;
        doc.setFontSize(5); doc.setFont("helvetica", "normal"); doc.setTextColor(107, 114, 128);
        doc.text(row[0], profileRX, ry);
        doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
        doc.text(String(row[1]).substring(0, 28), profileRX + 28, ry);
        doc.setFont("helvetica", "normal"); doc.setTextColor(107, 114, 128);
        doc.text(row[2], profileRX + CW / 2 - 12, ry);
        doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
        doc.text(String(row[3]).substring(0, 28), profileRX + CW / 2 + 16, ry);
      });
      y += 30;

      // ── SUMMARY CARDS ──
      const cGap = 4, cW = (CW - cGap * 3) / 4;
      cardMeta.forEach((c, i) => {
        const cx = M + i * (cW + cGap);
        doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
        doc.roundedRect(cx, y, cW, 22, 2, 2, "S");
        const colArr = c.key === "total_assigned" ? [79, 70, 229] : c.key === "approved" ? [34, 197, 94] : c.key === "pending" ? [245, 158, 11] : [239, 68, 68];
        doc.setFillColor(...colArr); doc.circle(cx + 9, y + 6, 4.5, "F");
        doc.setFillColor(255, 255, 255); doc.circle(cx + 9, y + 6, 2, "F");
        doc.setFontSize(6); doc.setFont("helvetica", "normal");
        doc.setTextColor(107, 114, 128); doc.text(c.label, cx + 18, y + 6);
        doc.setFontSize(18); doc.setFont("helvetica", "bold");
        doc.setTextColor(...colArr);
        doc.text(String(c.value), cx + 18, y + 16);
        doc.setFontSize(5); doc.setFont("helvetica", "normal");
        doc.setTextColor(156, 163, 175);
        const subs = { total_assigned: "All tasks and projects", approved: "Tasks completed", pending: "Tasks in progress", overdue: "Require attention" };
        doc.text(subs[c.key], cx + cW / 2, y + 20, { align: "center" });
      });
      y += 30;

      // ── TWO COLUMNS: STATUS BREAKDOWN + PRIORITY DISTRIBUTION ──
      const halfW = (CW - 5) / 2;

      // Left: Status Breakdown with Donut
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
      doc.roundedRect(M, y, halfW, 42, 2, 2, "S");
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text("TASK STATUS BREAKDOWN", M + 5, y + 6);
      const bStatuses = [
        { label: "Approved", count: sc.approved, color: [16, 185, 129] },
        { label: "Pending", count: sc.pending, color: [245, 158, 11] },
        { label: "In Review", count: sc.submitted + sc.reopened, color: [99, 102, 241] },
        { label: "Overdue", count: sc.overdue, color: [239, 68, 68] },
      ];
      const stTotal = bStatuses.reduce((s, x) => s + x.count, 0) || 1;
      const donutCx = M + 22, donutCy = y + 26, outerR = 12, innerR = 8;
      let startAngle = -Math.PI / 2;
      bStatuses.forEach((s) => {
        if (s.count <= 0) return;
        const sweep = (s.count / stTotal) * 2 * Math.PI;
        const endAngle = startAngle + sweep;
        const steps = Math.max(Math.ceil(sweep / (Math.PI / 32)), 4);
        const step = sweep / steps;
        const points = [];
        for (let i = 0; i <= steps; i++) {
          const a = startAngle + i * step;
          points.push([donutCx + outerR * Math.cos(a), donutCy + outerR * Math.sin(a)]);
        }
        for (let i = steps; i >= 0; i--) {
          const a = startAngle + i * step;
          points.push([donutCx + innerR * Math.cos(a), donutCy + innerR * Math.sin(a)]);
        }
        doc.setFillColor(...s.color); doc.setDrawColor(...s.color); doc.setLineWidth(0.01);
        doc.lines(points.map((p, i) => i === 0 ? [0, 0] : [p[0] - points[i - 1][0], p[1] - points[i - 1][1]]), points[0][0], points[0][1], [1, 1], "F");
        startAngle = endAngle;
      });
      doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
      doc.text(String(stTotal), donutCx, donutCy + 1, { align: "center" });
      doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(156, 163, 175);
      doc.text("Total Tasks", donutCx, donutCy + 5, { align: "center" });
      const lgX = M + 46;
      bStatuses.forEach((s, i) => {
        const sy = y + 17 + i * 7;
        const pct = stTotal > 0 ? Math.round((s.count / stTotal) * 100) : 0;
        doc.setFillColor(...s.color); doc.circle(lgX, sy, 1.5, "F");
        doc.setFontSize(6); doc.setFont("helvetica", "normal");
        doc.setTextColor(55, 65, 81); doc.text(s.label, lgX + 4, sy + 0.5);
        doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
        doc.text(`${s.count} (${pct}%)`, M + halfW - 5, sy + 0.5, { align: "right" });
      });

      // Right: Priority Distribution
      const rX = M + halfW + 5;
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
      doc.roundedRect(rX, y, halfW, 42, 2, 2, "S");
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text("PRIORITY DISTRIBUTION", rX + 5, y + 6);
      const totalP = (priorityDistribution.high ?? 0) + (priorityDistribution.medium ?? 0) + (priorityDistribution.low ?? 0);
      doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
      doc.setTextColor(156, 163, 175); doc.text(`${totalP} Total Tasks`, rX + 5, y + 10.5);
      const priItems = [
        { label: "High", count: priorityDistribution.high ?? 0, color: [239, 68, 68] },
        { label: "Medium", count: priorityDistribution.medium ?? 0, color: [245, 158, 11] },
        { label: "Low", count: priorityDistribution.low ?? 0, color: [16, 185, 129] },
      ];
      priItems.forEach((p, i) => {
        const sy = y + 18 + i * 9;
        const pct = totalP > 0 ? Math.round((p.count / totalP) * 100) : 0;
        doc.setFontSize(6); doc.setFont("helvetica", "normal");
        doc.setTextColor(55, 65, 81); doc.text(p.label, rX + 5, sy);
        doc.setTextColor(156, 163, 175); doc.text(`${p.count} (${pct}%)`, rX + halfW - 5, sy, { align: "right" });
        const barX = rX + 5, barMax = halfW - 10;
        doc.setFillColor(229, 231, 235); doc.roundedRect(barX, sy + 1.5, barMax, 3, 1, 1, "F");
        if (pct > 0) { doc.setFillColor(...p.color); doc.roundedRect(barX, sy + 1.5, barMax * (pct / 100), 3, 1, 1, "F"); }
      });
      y += 50;

      // ── TASKS & PROJECTS TABLE ──
      if (y > 220) { doc.addPage(); y = 16; }
      doc.setFontSize(9); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text("TASKS & PROJECTS DETAILS", M, y + 2);
      y += 6;

      const taskTableData = filteredItems.map((item, idx) => {
        const progress = calculateProgress(item);
        const isProject = item.item_type === "project";
        const st = isProject ? (["submitted", "approved", "rejected", "reopened"].includes(item.status) ? formatStatus(item.status) : "Pending") : formatStatus(item.status);
        const due = item.end_date ? formatDateShort(item.end_date) : "-";
        return [
          String(idx + 1),
          (item.title || item.name || "-").substring(0, 36),
          isProject ? "Project" : "Task",
          st,
          `${progress}%`,
          item.priority || "Medium",
          due,
        ];
      });

      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [["#", "Task / Project Name", "Type", "Status", "Progress", "Priority", "Due Date"]],
        body: taskTableData,
        theme: "plain",
        styles: { fontSize: 6, cellPadding: 3, textColor: [55, 65, 81], lineColor: [229, 231, 235], lineWidth: 0.1 },
        headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          0: { cellWidth: 8, halign: "center" },
          1: { cellWidth: "auto" },
          2: { cellWidth: 18, halign: "center" },
          3: { cellWidth: 20, halign: "center" },
          4: { cellWidth: 20, halign: "center" },
          5: { cellWidth: 18, halign: "center" },
          6: { cellWidth: 22, halign: "center" },
        },
        didParseCell(data) {
          if (data.section === "body") {
            if (data.column.index === 1) data.cell.styles.fontStyle = "bold";
            if (data.column.index === 3 || data.column.index === 5) data.cell.styles.fontStyle = "bold";
          }
        },
        didDrawCell(data) {
          if (data.section === "body" && data.column.index === 4) {
            const pctVal = parseInt(data.cell.raw) || 0;
            const { x: cx, y: cy, height: ch, width: cw } = data.cell;
            const barY = cy + ch - 3.5;
            const barMaxW = cw - 4;
            doc.setFillColor(229, 231, 235); doc.roundedRect(cx + 2, barY, barMaxW, 2, 1, 1, "F");
            if (pctVal > 0) {
              const barCol = pctVal >= 80 ? [34, 197, 94] : pctVal >= 50 ? [245, 158, 11] : [239, 68, 68];
              doc.setFillColor(...barCol); doc.roundedRect(cx + 2, barY, barMaxW * (pctVal / 100), 2, 1, 1, "F");
            }
          }
        },
      });
      y = doc.lastAutoTable.finalY + 5;

      // ── DELIVERABLES ──
      if (y > 220) { doc.addPage(); y = 16; }
      const qHalf = (CW - 5) / 2;

      // Left: Deliverables Summary
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
      doc.roundedRect(M, y, qHalf, 42, 2, 2, "S");
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text("DELIVERABLES SUMMARY", M + 5, y + 7);
      const delivItems = [
        { label: "Total Deliverables", count: delivSummary.total ?? 0, color: [99, 102, 241] },
        { label: "Submitted", count: delivSummary.submitted ?? 0, color: [245, 158, 11] },
        { label: "Approved", count: delivSummary.approved ?? 0, color: [34, 197, 94] },
        { label: "Pending Review", count: delivSummary.pending_review ?? 0, color: [245, 158, 11] },
        { label: "Rejected", count: delivSummary.rejected ?? 0, color: [239, 68, 68] },
        { label: "Reopened", count: delivSummary.reopened ?? 0, color: [99, 102, 241] },
      ];
      delivItems.forEach((d, i) => {
        const dy = y + 14 + i * 4.5;
        doc.setFillColor(...d.color); doc.circle(M + 8, dy, 1.2, "F");
        doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
        doc.setTextColor(55, 65, 81); doc.text(d.label, M + 12, dy + 0.5);
        doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
        doc.text(String(d.count), M + qHalf - 5, dy + 0.5, { align: "right" });
      });

      // Right: Deliverables Details
      const ddX = M + qHalf + 5;
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
      doc.roundedRect(ddX, y, qHalf, 42, 2, 2, "S");
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text("DELIVERABLES DETAILS", ddX + 5, y + 7);
      if (deliverables.length === 0) {
        doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.setTextColor(152, 163, 175);
        doc.text("No deliverables found.", ddX + qHalf / 2, y + 24, { align: "center" });
      } else {
        const delivTableData = deliverables.slice(0, 6).map((d, i) => [
          String(i + 1),
          (d.title || "-").substring(0, 20),
          formatStatus(d.status),
          d.submitted_at ? formatDateShort(d.submitted_at) : "-",
          d.approved_at ? formatDateShort(d.approved_at) : "-",
        ]);
        autoTable(doc, {
          startY: y + 10,
          margin: { left: ddX + 3, right: ddX + 3 },
          head: [["#", "Name", "Status", "Submitted", "Approved"]],
          body: delivTableData,
          theme: "plain",
          styles: { fontSize: 5, cellPadding: 2, textColor: [55, 65, 81], lineColor: [229, 231, 235], lineWidth: 0.05 },
          headStyles: { fillColor: [249, 250, 251], textColor: [107, 114, 128], fontStyle: "bold", fontSize: 5, cellPadding: 2 },
          columnStyles: { 0: { cellWidth: 8, halign: "center" }, 1: { cellWidth: "auto" }, 2: { cellWidth: 22, halign: "center" }, 3: { cellWidth: 22, halign: "center" }, 4: { cellWidth: 22, halign: "center" } },
        });
      }
      y += 50;

      // ── MANAGER REMARKS ──
      if (y > 240) { doc.addPage(); y = 16; }
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
      doc.roundedRect(M, y, CW, 28, 2, 2, "S");
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text("MANAGER REMARKS", M + 5, y + 7);
      for (let i = 0; i < 4; i++) { doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.1); doc.line(M + 5, y + 13 + i * 4, M + CW - 60, y + 13 + i * 4); }
      doc.setFontSize(5); doc.setFont("helvetica", "normal"); doc.setTextColor(107, 114, 128);
      doc.text("Manager Signature", PW - M - 20, y + 7, { align: "center" });
      doc.setDrawColor(17, 24, 39); doc.setLineWidth(0.1);
      doc.line(PW - M - 35, y + 15, PW - M - 5, y + 15);
      doc.text("Date", PW - M - 20, y + 19, { align: "center" });
      doc.line(PW - M - 35, y + 25, PW - M - 5, y + 25);
      y += 36;

      // ── FOOTER ──
      const fY = PH - 10;
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
      doc.line(M, fY, PW - M, fY);
      doc.setFillColor(79, 70, 229); doc.roundedRect(M, fY + 1.5, 5.5, 5.5, 1, 1, "F");
      doc.setFontSize(4); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
      doc.text("TX", M + 2.75, fY + 5, { align: "center" });
      doc.setFontSize(5); doc.setFont("helvetica", "bold"); doc.setTextColor(107, 114, 128);
      doc.text("Techxaro", M + 8.5, fY + 4);
      doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(156, 163, 175);
      doc.text("PMS Portal", M + 8.5, fY + 7.5);
      doc.text(`Generated Date:   ${genDate}  |  Generated Time:   ${genTime}`, M + 38, fY + 4);
      doc.text(`Report Type:  ${reportLabelTitle} Performance Report`, PW - M - 50, fY + 4);
      doc.text("Page 1 of 1", PW - M, fY + 7.5, { align: "right" });

      doc.save(`${reportLabelTitle}-Performance-Report-${(user.name || "user").replace(/\s+/g, "-")}.pdf`);
    } catch (err) {
      console.error("PDF generation error:", err);
    } finally {
      setGenerating(false);
    }
  };

  // ═══════════════════════════ RENDER ═══════════════════════════
  if (!isOpen) return null;

  // ── REVIEW MODAL ──
  const cardMeta = [
    { key: "total_assigned", label: "Total Assigned", value: totalAssigned, color: "#6366f1", bg: "#EEF2FF" },
    { key: "approved", label: "Approved", value: approvedCount, color: "#22C55E", bg: "#ECFDF5" },
    { key: "pending", label: "Pending", value: pendingCount, color: "#F59E0B", bg: "#FEF3C7" },
    { key: "overdue", label: "Overdue", value: overdueCount, color: "#EF4444", bg: "#FEF2F2" },
  ];

  return createPortal(
    <>
      {/* ── CONFIG MODAL ── */}
      {!showReview && (
        <div className="er-overlay">
          <div className="er-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="er-header">
              <div>
                <h2>Export Report</h2>
                <p>Select date range and review {isOwnPage ? "my" : "the user's"} performance report.</p>
              </div>
              <button className="er-close-btn" onClick={handleClose}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 5L5 15M5 5l10 10" />
                </svg>
              </button>
            </div>
            <div className="er-section">
              <h3>Timeline</h3>
              <div className="er-date-buttons" style={{ marginBottom: 12 }}>
                {[
                  { value: "all", label: "All Time" },
                  { value: "today", label: "Today" },
                  { value: "week", label: "This Week" },
                  { value: "month", label: "This Month" },
                  { value: "custom", label: "Custom Range" },
                ].map((opt) => (
                  <button key={opt.value} className={`er-date-btn ${dateRange === opt.value ? "active" : ""}`} onClick={() => { setDateRange(opt.value); setIsDirty(true); }}>
                    {opt.label}
                  </button>
                ))}
              </div>
              {dateRange === "custom" && (
                <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                  <input type="date" value={customStart} onChange={(e) => { setCustomStart(e.target.value); setIsDirty(true); }}
                    style={{ flex: 1, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, color: "#374151", outline: "none" }} />
                  <input type="date" value={customEnd} onChange={(e) => { setCustomEnd(e.target.value); setIsDirty(true); }}
                    style={{ flex: 1, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, color: "#374151", outline: "none" }} />
                </div>
              )}
            </div>
            <div className="er-footer">
              <button className="er-cancel-btn" onClick={handleClose}>Cancel</button>
              <button className="er-export-btn" onClick={() => setShowReview(true)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v8M4 6l4 4 4-4M2 14h12" />
                </svg>
                Report Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── REVIEW POPUP ── */}
      {showReview && (
        <div className="er-overlay">
          <div className="er-review-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820 }}>
            {/* Close */}
            <button className="er-close-btn" style={{ position: "absolute", top: 16, right: 16, zIndex: 10 }} onClick={() => setShowReview(false)}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 5L5 15M5 5l10 10" />
              </svg>
            </button>

            <div style={{ padding: "0", background: "#fff" }}>
              {/* ═══ HEADER ═══ */}
              <div className="erm-header">
                <div className="erm-header-left">
                  <div style={{ width: 26, height: 26, borderRadius: 5, background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>TX</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Techxaro</div>
                    <div style={{ fontSize: 8, color: "#94a3b8" }}>PMS Portal</div>
                  </div>
                </div>
                <div className="erm-header-center">
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{reportLabel} PERFORMANCE REPORT</span>
                </div>
              </div>

              {/* ═══ PROFILE ═══ */}
              <div className="erm-profile">
                <div className="erm-profile-left">
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#d1d5db", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="20" height="20" viewBox="0 0 48 48" fill="#9ca3af"><circle cx="24" cy="18" r="8" /><path d="M5 46c0-11 9-20 20-20s20 9 20 20" /></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{user.name || "Unknown User"}</div>
                    <div style={{ fontSize: 9, color: "#6b7280" }}>{roleDisplay}</div>
                    <div style={{ fontSize: 9, fontWeight: 600, color: "#6366f1" }}>{user.team || ""}</div>
                  </div>
                </div>
                <div className="erm-profile-right">
                  {[
                    { lbl: "Employee ID", val: empId, col: 1 }, { lbl: "Role", val: roleDisplay, col: 2 },
                    { lbl: "Report Period", val: dateRangeLabels[dateRange], col: 1 }, { lbl: "Reporting To", val: user.reporting_to || "-", col: 2 },
                    { lbl: "Total Work Items", val: String(totalItems), col: 1 }, { lbl: "Report Date", val: genDate, col: 2 },
                    { lbl: "Team", val: user.team || "-", col: 1 }, { lbl: "Report Time", val: genTime, col: 2 },
                  ].map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 4 }}>
                      <span style={{ color: "#6b7280", whiteSpace: "nowrap" }}>{r.lbl}:</span>
                      <span style={{ fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis" }}>{r.val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ═══ SUMMARY CARDS ═══ */}
              <div className="erm-summary-grid">
                {cardMeta.map((c) => (
                  <div key={c.key} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${c.color}` }}></div>
                      </div>
                      <div style={{ fontSize: 10, color: "#6b7280" }}>{c.label}</div>
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: c.color, marginTop: 4 }}>{c.value}</div>
                    <div style={{ fontSize: 8, color: "#9ca3af", marginTop: 2 }}>
                      {c.key === "total_assigned" ? "All tasks and projects" : c.key === "approved" ? "Tasks completed" : c.key === "pending" ? "Tasks in progress" : "Require attention"}
                    </div>
                  </div>
                ))}
              </div>

              {/* ═══ TWO COLUMNS ═══ */}
              <div className="erm-two-col">
                {/* Left: Status Breakdown */}
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 8 }}>TASK STATUS BREAKDOWN</div>
                  <DonutChart
                    segments={[
                      { label: "Approved", count: sc.approved, color: "#10b981" },
                      { label: "Pending", count: sc.pending, color: "#f59e0b" },
                      { label: "In Review", count: sc.submitted + sc.reopened, color: "#6366f1" },
                      { label: "Overdue", count: sc.overdue, color: "#ef4444" },
                    ]}
                    size={140}
                    strokeWidth={24}
                    totalLabel="Total Tasks"
                  />
                </div>

                {/* Right: Priority Distribution */}
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 4 }}>PRIORITY DISTRIBUTION</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {(() => {
                      const totalP = (priorityDistribution.high ?? 0) + (priorityDistribution.medium ?? 0) + (priorityDistribution.low ?? 0);
                      return [
                        { label: "High", count: priorityDistribution.high ?? 0, color: "#ef4444" },
                        { label: "Medium", count: priorityDistribution.medium ?? 0, color: "#f59e0b" },
                        { label: "Low", count: priorityDistribution.low ?? 0, color: "#10b981" },
                      ].map((p) => {
                        const pct = totalP > 0 ? Math.round((p.count / totalP) * 1000) / 10 : 0;
                        return (
                          <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 0" }}>
                            <span style={{ fontSize: 14, color: "#374151", fontWeight: 500, minWidth: 60 }}>{p.label}</span>
                            <div style={{ flex: 1, height: 10, background: "#f3f4f6", borderRadius: 5, overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", borderRadius: 5, background: p.color, transition: "width 0.6s ease" }}></div>
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#111827", minWidth: 80, textAlign: "right" }}>{p.count} ({Math.round(pct)}%)</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 8 }}>
                    {(priorityDistribution.high ?? 0) + (priorityDistribution.medium ?? 0) + (priorityDistribution.low ?? 0)} Total Tasks
                  </div>
                </div>
              </div>

              {/* ═══ TASKS TABLE ═══ */}
              <div className="erm-table-section">
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 6 }}>TASKS & PROJECTS DETAILS</div>
                <div className="erm-table-wrapper">
                  <table className="erm-table">
                    <thead>
                      <tr>
                        <th style={{ width: "5%", textAlign: "center" }}>#</th>
                        <th style={{ width: "30%", textAlign: "left" }}>Task / Project Name</th>
                        <th style={{ width: "10%", textAlign: "center" }}>Type</th>
                        <th style={{ width: "14%", textAlign: "center" }}>Status</th>
                        <th style={{ width: "16%", textAlign: "center" }}>Progress</th>
                        <th style={{ width: "10%", textAlign: "center" }}>Priority</th>
                        <th style={{ width: "15%", textAlign: "center" }}>Due Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.length === 0 ? (
                        <tr><td colSpan={7} style={{ textAlign: "center", padding: 20, color: "#9ca3af" }}>No items found</td></tr>
                      ) : filteredItems.map((item, idx) => {
                        const progress = calculateProgress(item);
                        const isProject = item.item_type === "project";
                        const st = isProject ? (["submitted", "approved", "rejected", "reopened"].includes(item.status) ? formatStatus(item.status) : "Pending") : formatStatus(item.status);
                        const ss = getStatusStyle(st);
                        const ps = getPriStyle(item.priority || "Medium");
                        const due = item.end_date ? formatDateShort(item.end_date) : "-";
                        return (
                          <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6", background: idx % 2 ? "#f9fafb" : "#fff" }}>
                            <td data-label="#" style={{ textAlign: "center", color: "#6b7280" }}>{idx + 1}</td>
                            <td data-label="Name" style={{ fontWeight: 600, color: "#111827", wordBreak: "break-word" }}>{item.title || item.name || "-"}</td>
                            <td data-label="Type" style={{ textAlign: "center" }}>
                              <span style={{ fontWeight: 600, color: isProject ? "#6366f1" : "#16a34a" }}>{isProject ? "Project" : "Task"}</span>
                            </td>
                            <td data-label="Status" style={{ textAlign: "center" }}>
                              <span style={{ fontWeight: 600, color: ss.text }}>&#9679; {st}</span>
                            </td>
                            <td data-label="Progress" style={{ textAlign: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <div style={{ flex: 1, height: 4, borderRadius: 2, background: "#e5e7eb", overflow: "hidden" }}>
                                  <div style={{ width: `${progress}%`, height: "100%", borderRadius: 2, background: progress >= 80 ? "#22c55e" : progress >= 50 ? "#f59e0b" : "#ef4444" }}></div>
                                </div>
                                <span style={{ fontWeight: 600, fontSize: 9, color: "#374151" }}>{progress}%</span>
                              </div>
                            </td>
                            <td data-label="Priority" style={{ textAlign: "center" }}>
                              <span style={{ fontWeight: 600, fontSize: 9, color: ps.text }}>&#9679; {item.priority || "Medium"}</span>
                            </td>
                            <td data-label="Due Date" style={{ textAlign: "center", color: "#6b7280", fontSize: 9 }}>{due}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ═══ DELIVERABLES ═══ */}
              <div className="erm-deliverables-grid">
                {/* Left */}
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 6 }}>DELIVERABLES SUMMARY</div>
                  {[
                    { label: "Total Deliverables", count: delivSummary.total ?? 0, color: "#6366f1" },
                    { label: "Submitted", count: delivSummary.submitted ?? 0, color: "#f59e0b" },
                    { label: "Approved", count: delivSummary.approved ?? 0, color: "#22c55e" },
                    { label: "Pending Review", count: delivSummary.pending_review ?? 0, color: "#f59e0b" },
                    { label: "Rejected", count: delivSummary.rejected ?? 0, color: "#ef4444" },
                    { label: "Reopened", count: delivSummary.reopened ?? 0, color: "#6366f1" },
                  ].map((d) => (
                    <div key={d.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0", fontSize: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: d.color }}></div>
                        <span style={{ color: "#374151" }}>{d.label}</span>
                      </div>
                      <span style={{ fontWeight: 700, color: "#111827" }}>{d.count}</span>
                    </div>
                  ))}
                </div>

                {/* Right */}
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 6 }}>DELIVERABLES DETAILS</div>
                  {deliverables.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 20, color: "#9ca3af", fontSize: 10 }}>No deliverables found.</div>
                  ) : (
                    <div className="erm-table-wrapper">
                      <table className="erm-table" style={{ tableLayout: "auto", minWidth: 0 }}>
                        <thead>
                          <tr style={{ background: "#f9fafb", color: "#6b7280", fontWeight: 600 }}>
                            <th style={{ width: "8%", padding: "4px 6px", textAlign: "center" }}>#</th>
                            <th style={{ width: "40%", padding: "4px 6px", textAlign: "left" }}>Name</th>
                            <th style={{ width: "17%", padding: "4px 6px", textAlign: "center" }}>Status</th>
                            <th style={{ width: "17%", padding: "4px 6px", textAlign: "center" }}>Submitted</th>
                            <th style={{ width: "18%", padding: "4px 6px", textAlign: "center" }}>Approved</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deliverables.slice(0, 6).map((d, i) => {
                            const ss = getStatusStyle(d.status);
                            return (
                              <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 ? "#f9fafb" : "#fff" }}>
                                <td data-label="#" style={{ padding: "4px 6px", textAlign: "center", color: "#6b7280" }}>{i + 1}</td>
                                <td data-label="Name" style={{ padding: "4px 6px", fontWeight: 600, color: "#111827" }}>{(d.title || "-").substring(0, 24)}</td>
                                <td data-label="Status" style={{ padding: "4px 6px", textAlign: "center", fontWeight: 600, color: ss.text }}>&#9679; {formatStatus(d.status)}</td>
                                <td data-label="Submitted" style={{ padding: "4px 6px", textAlign: "center", color: "#6b7280" }}>{d.submitted_at ? formatDateShort(d.submitted_at) : "-"}</td>
                                <td data-label="Approved" style={{ padding: "4px 6px", textAlign: "center", color: "#6b7280" }}>{d.approved_at ? formatDateShort(d.approved_at) : "-"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* ═══ MANAGER REMARKS ═══ */}
              <div className="erm-remarks">
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 6 }}>MANAGER REMARKS</div>
                <div style={{ display: "flex", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} style={{ borderBottom: "1px solid #e5e7eb", height: 20, marginBottom: 4 }}></div>
                    ))}
                  </div>
                  <div style={{ width: 120, textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 4 }}>Manager Signature</div>
                    <div style={{ borderBottom: "1px solid #111827", height: 20, marginBottom: 8 }}></div>
                    <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 4 }}>Date</div>
                    <div style={{ borderBottom: "1px solid #111827", height: 20 }}></div>
                  </div>
                </div>
              </div>

              {/* ═══ FOOTER ═══ */}
              <div className="erm-footer">
                <div className="erm-footer-left">
                  <div style={{ width: 16, height: 16, borderRadius: 3, background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 7, fontWeight: 700, color: "#fff" }}>TX</span>
                  </div>
                  <span style={{ fontWeight: 600, color: "#6b7280" }}>Techxaro</span>
                  <span>PMS Portal</span>
                </div>
                <div>Generated Date:  {genDate} | Generated Time:  {genTime}</div>
                <div>Report Type:  {reportLabelTitle} Performance Report | Page 1 of 1</div>
              </div>

              {/* ═══ ACTIONS ═══ */}
              <div className="erm-actions">
                <button className="er-cancel-btn" onClick={() => setShowReview(false)}>Back</button>
                <button className="er-export-btn" onClick={generatePDF} disabled={generating}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v8M4 6l4 4 4-4M2 14h12" />
                  </svg>
                  {generating ? "Generating..." : "Export PDF"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {ConfirmDialog}
    </>,
    document.body
  );
}

export default MemberExportReport;
