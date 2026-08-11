/**
 * CompanyEmployeeReport.jsx — Company Employee Report Modal
 *
 * A modal component that generates a company-wide employee performance report.
 * Features:
 * - Timeline filter (All Time, Today, This Week, This Month, Custom Range)
 * - Report preview with company overview, summary cards, status breakdown,
 *   tasks trend chart, employee performance table, team-wise summary, and status distribution
 * - PDF export using jsPDF with branded header/footer, charts, and tables
 * - Rendered via React portal to body
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useApiQuery } from "../hooks/useApi";
import DonutChart from "../components/DonutChart";
import "../components/Charts.css";
import "../pages/ExportReport.css";

/** Color palette for user avatar backgrounds */
const AVATAR_COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];
/** Display labels for user roles */
const ROLE_LABEL = { admin: "Admin", manager: "Manager", team_lead: "Team Lead", member: "Member", guest: "Guest" };
/** RGB color values for task statuses, used in PDF generation */
const STATUS_COLORS_PDF = {
  completed: [22, 101, 52], done: [22, 101, 52], approved: [22, 101, 52],
  pending: [146, 64, 14], "in_progress": [30, 64, 175], submitted: [30, 64, 175],
  reopened: [91, 33, 182], rejected: [153, 27, 27], failed: [153, 27, 27], overdue: [153, 27, 27],
};

/** Extracts up to 2 initials from a name */
function getInitials(name) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

/** Returns a deterministic avatar color based on the name hash */
function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** Formats a date string to short format like "29 Jun 2026" */
function formatDateShort(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const PERIOD_MAP = { "All Time": "all", "Today": "today", "This Week": "week", "This Month": "month" };

/**
 * CompanyEmployeeReport — Modal component for generating company-wide employee reports.
 * Fetches report data from /reports/company-employees API and provides
 * both a visual preview and PDF export.
 */
function CompanyEmployeeReport({ isOpen, onClose }) {
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
  useEscapeKey(true, handleClose);
  const [dateRange, setDateRange] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showReview, setShowReview] = useState(false);
  const [generating, setGenerating] = useState(false);

  const period = PERIOD_MAP[dateRange] || "all";

  // Fetch company employee report data filtered by selected time period
  const { data: reportData, isLoading } = useApiQuery(
    ["company-employees-report", period, customStart, customEnd],
    "/reports/company-employees",
    { period, time_filter: period, start_date: customStart, end_date: customEnd, startDate: customStart, endDate: customEnd },
    { staleTime: 60000, refetchOnMount: true }
  );

  const overview = reportData?.overview || {};
  const summary = reportData?.summary || {};
  const employees = reportData?.employees || [];
  const statusDist = reportData?.status_distribution || {};
  const priorityDist = reportData?.priority_distribution || {};
  const teams = reportData?.teams || [];
  const tasksTrend = reportData?.tasks_trend || [];

  const now = new Date();
  const genDate = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const genTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

  const totalAssigned = summary.total_assigned ?? 0;
  const totalCompleted = summary.completed ?? 0;
  const totalPending = summary.pending ?? 0;
  const totalOverdue = summary.overdue ?? 0;

  const cardMeta = [
    { key: "total_assigned", label: "Total Assigned", value: totalAssigned, color: "var(--color-primary)", bg: "#EEF2FF", sub: "All tasks assigned" },
    { key: "completed", label: "Completed", value: totalCompleted, color: "#22C55E", bg: "#ECFDF5", sub: "Tasks completed" },
    { key: "pending", label: "Pending", value: totalPending, color: "#F59E0B", bg: "#FEF3C7", sub: "Tasks in progress" },
    { key: "overdue", label: "Overdue", value: totalOverdue, color: "#EF4444", bg: "#FEF2F2", sub: "Require attention" },
  ];

  const totalStatusItems = statusDist.total || totalAssigned || 1;

  // ═══════════════════════════ PDF GENERATION ═══════════════════════════
  // Generates a branded PDF report with header, summary cards, status breakdown,
  // tasks trend chart, employee performance table, team summary, and footer
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
      doc.text("COMPANY EMPLOYEE REPORT", PW / 2, 8, { align: "center" });
      y = 18;

      // ── COMPANY OVERVIEW + SUMMARY CARDS ROW ──
      // Company Overview
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
      doc.roundedRect(M, y, 52, 24, 2, 2, "S");
      doc.setFillColor(209, 213, 219); doc.circle(M + 14, y + 12, 7.5, "F");
      doc.setFillColor(180, 185, 195); doc.roundedRect(M + 10, y + 8, 8, 6, 1, 1, "F");
      doc.setFillColor(229, 231, 235); doc.rect(M + 12, y + 6, 4, 2, "F");
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text("Company Overview", M + 27, y + 7);
      doc.setFontSize(6.5); doc.setFont("helvetica", "normal");
      doc.setTextColor(99, 102, 241); doc.text(overview.company_name || "Techxaro Solutions", M + 27, y + 12);
      doc.setFontSize(5.5); doc.setTextColor(107, 114, 128);
      doc.text("Total Employees", M + 27, y + 17);
      doc.setFontSize(7); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text(String(overview.total_employees ?? employees.length), M + 27, y + 21.5);

      // Summary Cards
      const cardStartX = M + 56;
      const cardGap = 4;
      const cardW = (CW - 52 - cardGap * 3) / 4;
      cardMeta.forEach((c, i) => {
        const cx = cardStartX + i * (cardW + cardGap);
        doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
        doc.roundedRect(cx, y, cardW, 24, 2, 2, "S");
        doc.setFillColor(...(c.key === "total_assigned" ? [79, 70, 229] : c.key === "completed" ? [34, 197, 94] : c.key === "pending" ? [245, 158, 11] : [239, 68, 68]));
        doc.circle(cx + 8, y + 6, 4, "F");
        doc.setFillColor(255, 255, 255); doc.circle(cx + 8, y + 6, 2, "F");
        doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
        doc.setTextColor(107, 114, 128); doc.text(c.label, cx + 16, y + 6);
        doc.setFontSize(16); doc.setFont("helvetica", "bold");
        doc.setTextColor(...(c.key === "total_assigned" ? [79, 70, 229] : c.key === "completed" ? [34, 197, 94] : c.key === "pending" ? [245, 158, 11] : [239, 68, 68]));
        doc.text(String(c.value), cx + 16, y + 16);
        doc.setFontSize(5); doc.setFont("helvetica", "normal");
        doc.setTextColor(156, 163, 175); doc.text(c.sub, cx + cardW / 2, y + 21.5, { align: "center" });
      });
      y += 30;

      // ── STATUS BREAKDOWN + TASKS TREND ──
      const halfW = (CW - 5) / 2;
      // Left: Status Breakdown with Donut
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
      doc.roundedRect(M, y, halfW, 42, 2, 2, "S");
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text("TASK STATUS BREAKDOWN (Overall)", M + 5, y + 6);
      const bStatuses = [
        { label: "Completed", count: statusDist.completed ?? 0, color: [16, 185, 129] },
        { label: "Pending", count: statusDist.pending ?? 0, color: [245, 158, 11] },
        { label: "In Review", count: statusDist.in_review ?? 0, color: [99, 102, 241] },
        { label: "Overdue", count: statusDist.overdue ?? 0, color: [239, 68, 68] },
      ];
      const stTotal = bStatuses.reduce((s, x) => s + x.count, 0) || 1;
      // Draw donut using filled polygon arc segments
      const donutCx = M + 22, donutCy = y + 26, outerR = 12, innerR = 8;
      let startAngle = -Math.PI / 2;
      bStatuses.forEach((s) => {
        if (s.count <= 0) { return; }
        const sweep = (s.count / stTotal) * 2 * Math.PI;
        const endAngle = startAngle + sweep;
        const segments = Math.max(Math.ceil(sweep / (Math.PI / 8)), 2);
        const step = sweep / segments;
        const points = [];
        for (let i = 0; i <= segments; i++) {
          const a = startAngle + i * step;
          points.push([donutCx + outerR * Math.cos(a), donutCy + outerR * Math.sin(a)]);
        }
        for (let i = segments; i >= 0; i--) {
          const a = startAngle + i * step;
          points.push([donutCx + innerR * Math.cos(a), donutCy + innerR * Math.sin(a)]);
        }
        doc.setFillColor(...s.color); doc.setDrawColor(...s.color); doc.setLineWidth(0.01);
        doc.lines(points.map((p, i) => i === 0 ? [0, 0] : [p[0] - points[i - 1][0], p[1] - points[i - 1][1]]), points[0][0], points[0][1], [1, 1], "F");
        startAngle = endAngle;
      });
      // Center text
      doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
      doc.text(String(stTotal), donutCx, donutCy + 1, { align: "center" });
      doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(156, 163, 175);
      doc.text("Total Tasks", donutCx, donutCy + 5, { align: "center" });
      // Legend (right of donut)
      const lgX = M + 46;
      bStatuses.forEach((s, i) => {
        const sy = y + 17 + i * 7;
        const pct = totalStatusItems > 0 ? Math.round((s.count / totalStatusItems) * 100) : 0;
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
      const totalPriority = (priorityDist.high ?? 0) + (priorityDist.medium ?? 0) + (priorityDist.low ?? 0);
      doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
      doc.setTextColor(156, 163, 175); doc.text(`${totalPriority} Total Tasks`, rX + 5, y + 10.5);
      const priorityItems = [
        { label: "High", count: priorityDist.high ?? 0, color: [239, 68, 68] },
        { label: "Medium", count: priorityDist.medium ?? 0, color: [245, 158, 11] },
        { label: "Low", count: priorityDist.low ?? 0, color: [16, 185, 129] },
      ];
      priorityItems.forEach((p, i) => {
        const sy = y + 18 + i * 9;
        const pct = totalPriority > 0 ? Math.round((p.count / totalPriority) * 100) : 0;
        doc.setFontSize(6); doc.setFont("helvetica", "normal");
        doc.setTextColor(55, 65, 81); doc.text(p.label, rX + 5, sy);
        doc.setTextColor(156, 163, 175); doc.text(`${p.count} (${pct}%)`, rX + halfW - 5, sy, { align: "right" });
        const barX = rX + 5, barMax = halfW - 10;
        doc.setFillColor(229, 231, 235); doc.roundedRect(barX, sy + 1.5, barMax, 3, 1, 1, "F");
        if (pct > 0) { doc.setFillColor(...p.color); doc.roundedRect(barX, sy + 1.5, barMax * (pct / 100), 3, 1, 1, "F"); }
      });
      y += 50;

      // ── EMPLOYEE PERFORMANCE TABLE ──
      doc.setFontSize(9); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text("EMPLOYEE PERFORMANCE SUMMARY", M, y + 2);
      y += 6;

      const tableData = employees.map((e, i) => {
        const rate = e.completion_rate ?? (e.assigned > 0 ? Math.round((e.completed / e.assigned) * 100) : 0);
        return [
          String(i + 1),
          e.name || "-",
          ROLE_LABEL[e.role] || e.role || "-",
          String(e.assigned ?? 0),
          String(e.completed ?? 0),
          String(e.pending ?? 0),
          String(e.overdue ?? 0),
          `${rate}%`,
        ];
      });

      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [["#", "Employee", "Role", "Assigned", "Completed", "Pending", "Overdue", "Completion Rate"]],
        body: tableData,
        theme: "plain",
        styles: { fontSize: 6, cellPadding: 3, textColor: [55, 65, 81], lineColor: [229, 231, 235], lineWidth: 0.1 },
        headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          0: { cellWidth: 8, halign: "center" },
          1: { cellWidth: "auto" },
          2: { cellWidth: 24 },
          3: { cellWidth: 18, halign: "center" },
          4: { cellWidth: 18, halign: "center" },
          5: { cellWidth: 18, halign: "center" },
          6: { cellWidth: 18, halign: "center" },
          7: { cellWidth: 24, halign: "center" },
        },
        didParseCell(data) {
          if (data.section === "body") {
            if (data.column.index === 1) data.cell.styles.fontStyle = "bold";
            if (data.column.index >= 3) data.cell.styles.fontStyle = "bold";
          }
        },
        didDrawCell(data) {
          if (data.section === "body" && data.column.index === 7) {
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

      // ── TEAM WISE SUMMARY + STATUS DISTRIBUTION ──
      if (y > 220) { doc.addPage(); y = 16; }
      const qHalf = (CW - 5) / 2;

      // Left: Team Wise Summary
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
      doc.roundedRect(M, y, qHalf, 48, 2, 2, "S");
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text("TEAM WISE SUMMARY", M + 5, y + 6);
      autoTable(doc, {
        startY: y + 10,
        margin: { left: M + 3, right: M + 3 },
        head: [["Team", "Assigned", "Completed", "Pending", "Rate"]],
        body: teams.map(t => [
          t.name || "-",
          String(t.assigned ?? 0),
          String(t.completed ?? 0),
          String(t.pending ?? 0),
          `${t.completion_rate ?? 0}%`,
        ]),
        theme: "plain",
        styles: { fontSize: 5, cellPadding: 2, textColor: [55, 65, 81], lineColor: [229, 231, 235], lineWidth: 0.05 },
        headStyles: { fillColor: [249, 250, 251], textColor: [107, 114, 128], fontStyle: "bold", fontSize: 5, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 16, halign: "center" }, 2: { cellWidth: 16, halign: "center" }, 3: { cellWidth: 16, halign: "center" }, 4: { cellWidth: 16, halign: "center" } },
        didParseCell(data) {
          if (data.section === "body" && data.column.index === 4) {
            const v = parseInt(data.cell.raw) || 0;
            data.cell.styles.textColor = v >= 80 ? [22, 101, 52] : v >= 50 ? [146, 64, 14] : [153, 27, 27];
            data.cell.styles.fontStyle = "bold";
          }
        },
      });

      // Right: Status Distribution — simple dot + label + count + % matching review modal
      const sdX = M + qHalf + 5;
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
      doc.roundedRect(sdX, y, qHalf, 48, 2, 2, "S");
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text("STATUS DISTRIBUTION (Overall)", sdX + 5, y + 6);
      const sdItems = [
        { label: "Completed", count: statusDist.completed ?? 0, color: [34, 197, 94] },
        { label: "Pending", count: statusDist.pending ?? 0, color: [245, 158, 11] },
        { label: "In Review", count: statusDist.in_review ?? 0, color: [99, 102, 241] },
        { label: "Overdue", count: statusDist.overdue ?? 0, color: [239, 68, 68] },
      ];
      sdItems.forEach((s, i) => {
        const sy = y + 15 + i * 7;
        const pct = totalStatusItems > 0 ? Math.round((s.count / totalStatusItems) * 100) : 0;
        doc.setFillColor(...s.color); doc.circle(sdX + 7, sy, 1.2, "F");
        doc.setFontSize(6); doc.setFont("helvetica", "normal");
        doc.setTextColor(55, 65, 81); doc.text(s.label, sdX + 11, sy + 0.5);
        doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
        doc.text(String(s.count), sdX + qHalf - 22, sy + 0.5, { align: "right" });
        doc.setFont("helvetica", "normal"); doc.setTextColor(156, 163, 175);
        doc.text(`${pct}%`, sdX + qHalf - 5, sy + 0.5, { align: "right" });
      });
      // Total row
      const totalY = y + 15 + 4 * 7;
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.1);
      doc.line(sdX + 5, totalY - 2, sdX + qHalf - 5, totalY - 2);
      doc.setFontSize(6); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text("Total", sdX + 7, totalY + 2);
      doc.text(String(totalStatusItems), sdX + qHalf - 22, totalY + 2, { align: "right" });
      doc.text("100%", sdX + qHalf - 5, totalY + 2, { align: "right" });
      y += 56;

      // ── REPORT NOTES + AUTHORIZED BY ──
      if (y > 240) { doc.addPage(); y = 16; }
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
      doc.roundedRect(M, y, qHalf, 32, 2, 2, "S");
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text("REPORT NOTES", M + 5, y + 7);
      for (let i = 0; i < 4; i++) { doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.1); doc.line(M + 5, y + 13 + i * 4.5, M + qHalf - 5, y + 13 + i * 4.5); }

      const aX = M + qHalf + 5;
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
      doc.roundedRect(aX, y, qHalf, 32, 2, 2, "S");
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text("AUTHORIZED BY", aX + 5, y + 7);
      doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(107, 114, 128);
      doc.text("Name:", aX + 5, y + 15);
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.1);
      doc.line(aX + 15, y + 15, aX + qHalf - 5, y + 15);
      doc.text("Date:", aX + 5, y + 23);
      doc.line(aX + 15, y + 23, aX + qHalf - 5, y + 23);
      y += 40;

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
      doc.setFontSize(4.5);
      doc.text("This is a system generated report.", M + 38, fY + 4);
      doc.text(`Generated Date:   ${genDate}`, M + 38, fY + 7.5);
      doc.text("Report Type:  Company Employee Report", PW - M - 50, fY + 4);
      doc.text("Page 1 of 1", PW - M, fY + 7.5, { align: "right" });
      doc.save("Company-Employee-Report.pdf");
    } catch (err) {
      console.error("PDF generation error:", err);
    } finally {
      setGenerating(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* ── CONFIG MODAL ── */}
      {!showReview && (
        <div className="er-overlay">
          <div className="er-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="er-header">
              <div>
                <h2>Export Report</h2>
                <p>Generate company-wide employee performance report.</p>
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
                  <input type="date" value={customStart} max={customEnd || undefined} onChange={(e) => {
                    const val = e.target.value;
                    setCustomStart(val);
                    if (customEnd && val > customEnd) setCustomEnd(val);
                    setIsDirty(true);
                  }}
                    style={{ flex: 1, padding: "10px 14px", border: "1px solid var(--border-color)", borderRadius: 10, fontSize: 13, color: "var(--text-dark)", outline: "none" }} />
                  <input type="date" value={customEnd} min={customStart || undefined} onChange={(e) => {
                    const val = e.target.value;
                    setCustomEnd(val);
                    if (customStart && val < customStart) setCustomStart(val);
                    setIsDirty(true);
                  }}
                    style={{ flex: 1, padding: "10px 14px", border: "1px solid var(--border-color)", borderRadius: 10, fontSize: 13, color: "var(--text-dark)", outline: "none" }} />
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

      {/* ── REVIEW MODAL ── */}
      {showReview && (
        <div className="er-overlay">
          <div className="er-review-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 860 }}>
            <button className="er-close-btn" style={{ position: "absolute", top: 16, right: 16, zIndex: 10 }} onClick={() => setShowReview(false)}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 5L5 15M5 5l10 10" />
              </svg>
            </button>

            <div style={{ padding: 0 }}>
              {/* ═══ HEADER ═══ */}
              <div className="erm-header">
                <div className="erm-header-left">
                  <div style={{ width: 26, height: 26, borderRadius: 5, background: "var(--color-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>TX</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Techxaro</div>
                    <div style={{ fontSize: 8, color: "#94a3b8" }}>PMS Portal</div>
                  </div>
                </div>
                <div className="erm-header-center">
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>COMPANY EMPLOYEE REPORT</span>
                  <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 2 }}>All Employees Performance Overview</div>
                </div>
              </div>

              {/* ═══ COMPANY OVERVIEW + SUMMARY CARDS ═══ */}
              <div style={{ margin: "14px 28px", display: "grid", gridTemplateColumns: "200px 1fr", gap: 10 }} className="erm-company-overview-grid">
                {/* Company Overview */}
                <div style={{ border: "1px solid var(--border-color)", borderRadius: 8, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--border-color)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 21h18M5 21V7l8-4v18M13 21V3l6 3v15" /><path d="M9 9h1M9 13h1M9 17h1M17 9h1M17 13h1M17 17h1" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 600, color: "var(--text-secondary)" }}>Company Overview</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-primary)" }}>{overview.company_name || "Techxaro Solutions"}</div>
                    </div>
                  </div>
                  <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 4 }}>
                    <div style={{ fontSize: 8, color: "var(--text-secondary)" }}>Total Employees</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-heading)" }}>{overview.total_employees ?? employees.length}</div>
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="erm-summary-grid" style={{ margin: 0 }}>
                  {cardMeta.map((c) => (
                    <div key={c.key} style={{ border: "1px solid var(--border-color)", borderRadius: 8, padding: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <div style={{ width: 14, height: 14, borderRadius: "50%", background: c.color }}></div>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{c.label}</div>
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 700, color: c.color, marginTop: 4 }}>{c.value}</div>
                      <div style={{ fontSize: 8, color: "var(--text-muted)", marginTop: 2 }}>{c.sub}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ═══ TWO COLUMNS ═══ */}
              <div className="erm-two-col">
                {/* Left: Status Breakdown */}
                <div style={{ border: "1px solid var(--border-color)", borderRadius: 8, padding: "12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-heading)", marginBottom: 8 }}>TASK STATUS BREAKDOWN (Overall)</div>
                  <DonutChart
                    segments={[
                      { label: "Completed", count: statusDist.completed ?? 0, color: "#10b981" },
                      { label: "Pending", count: statusDist.pending ?? 0, color: "#f59e0b" },
                      { label: "In Review", count: statusDist.in_review ?? 0, color: "var(--color-primary)" },
                      { label: "Overdue", count: statusDist.overdue ?? 0, color: "#ef4444" },
                    ]}
                    size={140}
                    strokeWidth={24}
                    totalLabel="Total Tasks"
                  />
                </div>

                {/* Right: Priority Distribution */}
                <div style={{ border: "1px solid var(--border-color)", borderRadius: 8, padding: "12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-heading)", marginBottom: 4 }}>PRIORITY DISTRIBUTION</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {(() => {
                      const totalPriority = (priorityDist.high ?? 0) + (priorityDist.medium ?? 0) + (priorityDist.low ?? 0);
                      return [
                        { label: "High", count: priorityDist.high ?? 0, color: "#ef4444" },
                        { label: "Medium", count: priorityDist.medium ?? 0, color: "#f59e0b" },
                        { label: "Low", count: priorityDist.low ?? 0, color: "#10b981" },
                      ].map((p) => {
                        const pct = totalPriority > 0 ? Math.round((p.count / totalPriority) * 1000) / 10 : 0;
                        return (
                          <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 0" }}>
                            <span style={{ fontSize: 14, color: "var(--text-dark)", fontWeight: 500, minWidth: 60 }}>{p.label}</span>
                            <div style={{ flex: 1, height: 10, background: "var(--border-light)", borderRadius: 5, overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", borderRadius: 5, background: p.color, transition: "width 0.6s ease" }}></div>
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-heading)", minWidth: 80, textAlign: "right" }}>{p.count} ({Math.round(pct)}%)</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
                    {(priorityDist.high ?? 0) + (priorityDist.medium ?? 0) + (priorityDist.low ?? 0)} Total Tasks
                  </div>
                </div>
              </div>

              {/* ═══ EMPLOYEE PERFORMANCE TABLE ═══ */}
              <div className="erm-table-section">
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-heading)", marginBottom: 6 }}>EMPLOYEE PERFORMANCE SUMMARY</div>
                <div className="erm-table-wrapper">
                  <table className="erm-table">
                    <thead>
                      <tr>
                        {["#", "Employee", "Role", "Assigned", "Completed", "Pending", "Overdue", "Rate"].map(h => (
                          <th key={h} style={{ textAlign: ["#", "Assigned", "Completed", "Pending", "Overdue", "Rate"].includes(h) ? "center" : "left" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {employees.length === 0 ? (
                        <tr><td colSpan={8} style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>No data</td></tr>
                      ) : employees.map((e, i) => {
                        const rate = e.completion_rate ?? (e.assigned > 0 ? Math.round((e.completed / e.assigned) * 100) : 0);
                        return (
                          <tr key={e.id} style={{ borderBottom: "1px solid var(--border-light)", background: i % 2 ? "var(--bg-card-alt)" : "var(--bg-card)" }}>
                            <td data-label="#" style={{ textAlign: "center", color: "var(--text-secondary)" }}>{i + 1}</td>
                            <td data-label="Employee" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 26, height: 26, borderRadius: "50%", background: getAvatarColor(e.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                                {getInitials(e.name)}
                              </div>
                              <span style={{ fontWeight: 600, color: "var(--text-heading)" }}>{e.name}</span>
                            </td>
                            <td data-label="Role" style={{ color: "var(--text-dark)" }}>{ROLE_LABEL[e.role] || e.role}</td>
                            <td data-label="Assigned" style={{ textAlign: "center", fontWeight: 600, color: "var(--color-primary)" }}>{e.assigned ?? 0}</td>
                            <td data-label="Completed" style={{ textAlign: "center", fontWeight: 600, color: "#22c55e" }}>{e.completed ?? 0}</td>
                            <td data-label="Pending" style={{ textAlign: "center", fontWeight: 600, color: "#f59e0b" }}>{e.pending ?? 0}</td>
                            <td data-label="Overdue" style={{ textAlign: "center", fontWeight: 600, color: "#ef4444" }}>{e.overdue ?? 0}</td>
                            <td data-label="Rate">
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <div style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--border-color)", overflow: "hidden" }}>
                                  <div style={{ width: `${rate}%`, height: "100%", borderRadius: 2, background: rate >= 80 ? "#22c55e" : rate >= 50 ? "#f59e0b" : "#ef4444" }}></div>
                                </div>
                                <span style={{ fontWeight: 600, fontSize: 9, color: "var(--text-dark)", minWidth: 28 }}>{rate}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ═══ TEAM WISE + STATUS DISTRIBUTION ═══ */}
              <div className="erm-two-col">
                {/* Team Wise Summary */}
                <div style={{ border: "1px solid var(--border-color)", borderRadius: 8, padding: "12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-heading)", marginBottom: 6 }}>TEAM WISE SUMMARY</div>
                  <div className="erm-table-wrapper" style={{ border: "none", borderRadius: 0 }}>
                    <table className="erm-table" style={{ tableLayout: "auto", minWidth: 0 }}>
                      <thead>
                        <tr style={{ background: "var(--bg-card-alt)", color: "var(--text-secondary)", fontWeight: 600 }}>
                          <th style={{ padding: "4px 6px", textAlign: "left" }}>Team</th>
                          <th style={{ padding: "4px 6px", textAlign: "center" }}>Assigned</th>
                          <th style={{ padding: "4px 6px", textAlign: "center" }}>Completed</th>
                          <th style={{ padding: "4px 6px", textAlign: "center" }}>Pending</th>
                          <th style={{ padding: "4px 6px", textAlign: "center" }}>Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teams.map((t, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid var(--border-light)", background: i % 2 ? "var(--bg-card-alt)" : "var(--bg-card)" }}>
                            <td data-label="Team" style={{ fontWeight: 600, color: "var(--text-heading)" }}>{t.name}</td>
                            <td data-label="Assigned" style={{ textAlign: "center", color: "var(--text-dark)" }}>{t.assigned ?? 0}</td>
                            <td data-label="Completed" style={{ textAlign: "center", color: "#22c55e", fontWeight: 600 }}>{t.completed ?? 0}</td>
                            <td data-label="Pending" style={{ textAlign: "center", color: "#f59e0b", fontWeight: 600 }}>{t.pending ?? 0}</td>
                            <td data-label="Rate" style={{ textAlign: "center", fontWeight: 700, color: (t.completion_rate ?? 0) >= 80 ? "#22c55e" : (t.completion_rate ?? 0) >= 50 ? "#f59e0b" : "#ef4444" }}>
                              {t.completion_rate ?? 0}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Status Distribution */}
                <div style={{ border: "1px solid var(--border-color)", borderRadius: 8, padding: "12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-heading)", marginBottom: 6 }}>STATUS DISTRIBUTION (Overall)</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { label: "Completed", count: statusDist.completed ?? 0, color: "#22c55e" },
                      { label: "Pending", count: statusDist.pending ?? 0, color: "#f59e0b" },
                      { label: "In Review", count: statusDist.in_review ?? 0, color: "var(--color-primary)" },
                      { label: "Overdue", count: statusDist.overdue ?? 0, color: "#ef4444" },
                    ].map((s) => {
                      const pct = totalStatusItems > 0 ? Math.round((s.count / totalStatusItems) * 100) : 0;
                      return (
                        <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }}></div>
                          <span style={{ flex: 1, color: "var(--text-dark)" }}>{s.label}</span>
                          <span style={{ fontWeight: 700, color: "var(--text-heading)", minWidth: 20, textAlign: "right" }}>{s.count}</span>
                          <span style={{ color: "var(--text-muted)", minWidth: 40, textAlign: "right" }}>{pct}%</span>
                        </div>
                      );
                    })}
                    <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 6, display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontWeight: 700 }}>
                      <span style={{ flex: 1, color: "var(--text-heading)" }}>Total</span>
                      <span style={{ color: "var(--text-heading)", minWidth: 20, textAlign: "right" }}>{totalStatusItems}</span>
                      <span style={{ color: "var(--text-heading)", minWidth: 40, textAlign: "right" }}>100%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ═══ REPORT NOTES + AUTHORIZED BY ═══ */}
              <div className="erm-two-col">
                <div style={{ border: "1px solid var(--border-color)", borderRadius: 8, padding: "12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-heading)", marginBottom: 6 }}>REPORT NOTES</div>
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} style={{ borderBottom: "1px solid #e5e7eb", height: 20, marginBottom: 4 }}></div>
                  ))}
                </div>
                <div style={{ border: "1px solid var(--border-color)", borderRadius: 8, padding: "12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-heading)", marginBottom: 6 }}>AUTHORIZED BY</div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 9, color: "var(--text-secondary)", marginBottom: 4 }}>Name</div>
                    <div style={{ borderBottom: "1px solid var(--text-heading)", height: 20 }}></div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: "var(--text-secondary)", marginBottom: 4 }}>Date: {genDate}</div>
                    <div style={{ borderBottom: "1px solid var(--text-heading)", height: 20 }}></div>
                  </div>
                </div>
              </div>

              {/* ═══ FOOTER ═══ */}
              <div className="erm-footer">
                <div className="erm-footer-left">
                  <div style={{ width: 16, height: 16, borderRadius: 3, background: "var(--color-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 7, fontWeight: 700, color: "#fff" }}>TX</span>
                  </div>
                  <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Techxaro</span>
                  <span>PMS Portal</span>
                </div>
                <div>This is a system generated report.</div>
                <div>Report Type:  Company Employee Report | Page 1 of 1</div>
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

export default CompanyEmployeeReport;
