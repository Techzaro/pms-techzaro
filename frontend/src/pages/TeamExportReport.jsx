import { useState } from "react";
import { createPortal } from "react-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import DonutChart from "../components/DonutChart";
import "../components/Charts.css";
import "../pages/ExportReport.css";

const ROLE_LABEL = { admin: "Admin", manager: "Manager", team_lead: "Team Lead", member: "Member" };

const STATUS_COLORS_PDF = {
  completed: [22, 101, 52], done: [22, 101, 52], approved: [22, 101, 52],
  pending: [146, 64, 14], "in_progress": [30, 64, 175], "in progress": [30, 64, 175],
  submitted: [30, 64, 175], reopened: [91, 33, 182], rejected: [153, 27, 27],
  failed: [153, 27, 27], overdue: [153, 27, 27],
};

function formatDateShort(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatStatus(status) {
  const map = { pending: "Pending", submitted: "Submitted", reopened: "Reopened", approved: "Approved", rejected: "Rejected" };
  return map[status] || status || "-";
}

const S = {
  green: { bg: "#dcfce7", text: "#166534" },
  red: { bg: "#fee2e2", text: "#991b1b" },
  amber: { bg: "#fef3c7", text: "#92400e" },
  blue: { bg: "#dbeafe", text: "#1e40af" },
  indigo: { bg: "#eef2ff", text: "#4338ca" },
  purple: { bg: "#ede9fe", text: "#5b21b6" },
  gray: { bg: "#f3f4f6", text: "#6b7280" },
};

function getStatusStyle(s) {
  const m = {
    approved: S.green, completed: S.green, done: S.green,
    pending: S.amber, in_progress: S.blue, "in progress": S.blue,
    submitted: S.blue, reopened: S.purple, rejected: S.red,
    failed: S.red, overdue: S.red,
  };
  return m[s?.toLowerCase()] || S.gray;
}

function getPriStyle(p) {
  const m = { High: S.red, Medium: S.amber, Low: S.green };
  return m[p] || S.amber;
}

function TeamExportReport({ isOpen, onClose, team }) {
  const [dateRange, setDateRange] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [generating, setGenerating] = useState(false);
  const [showReview, setShowReview] = useState(false);

  if (!isOpen || !team) return null;

  const members = team.members || [];
  const totalAssigned = team.assigned || 0;
  const totalCompleted = team.completed || 0;
  const totalPending = team.pending || 0;
  const totalOverdue = team.overdue || 0;

  const now = new Date();
  const genDate = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const genTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

  const dateRangeLabels = {
    all: "All Time", today: "Today", week: "This Week", month: "This Month",
    custom: customStart && customEnd ? `${formatDateShort(customStart)} - ${formatDateShort(customEnd)}` : "Custom Range",
  };

  const filterMembersByDateRange = (list) => {
    if (dateRange === "all") return list;
    const now = new Date();
    let start;
    if (dateRange === "today") start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (dateRange === "week") { start = new Date(now); start.setDate(now.getDate() - 7); }
    else if (dateRange === "month") { start = new Date(now); start.setMonth(now.getMonth() - 1); }
    else if (dateRange === "custom" && customStart && customEnd) {
      const s = new Date(customStart), e = new Date(customEnd); e.setHours(23, 59, 59, 999);
      return list.filter(m => { const d = new Date(m.last_task_date || m.created_at || Date.now()); return !isNaN(d) && d >= s && d <= e; });
    } else return list;
    return list.filter(m => { const d = new Date(m.last_task_date || m.created_at || Date.now()); return !isNaN(d) && d >= start; });
  };

  const filteredMembers = filterMembersByDateRange(members);
  const filteredAssigned = filteredMembers.reduce((s, m) => s + (m.assigned || 0), 0);
  const filteredCompleted = filteredMembers.reduce((s, m) => s + (m.completed || 0), 0);
  const filteredPending = filteredMembers.reduce((s, m) => s + (m.pending || 0), 0);
  const filteredOverdue = filteredMembers.reduce((s, m) => s + (m.overdue || 0), 0);

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
      doc.text(`TEAM PERFORMANCE REPORT — ${(team.name || "Team").toUpperCase()}`, PW / 2, 8, { align: "center" });
      y = 18;

      // ── PROFILE ──
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
      doc.roundedRect(M, y, CW, 24, 2, 2, "S");
      doc.setFillColor(209, 213, 219); doc.circle(M + 14, y + 12, 7.5, "F");
      doc.setFillColor(180, 185, 195); doc.roundedRect(M + 10, y + 8, 8, 6, 1, 1, "F");
      doc.setFillColor(229, 231, 235); doc.rect(M + 12, y + 6, 4, 2, "F");
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text(team.name || "Unknown Team", M + 27, y + 7);
      doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128); doc.text(`${members.length} Members`, M + 27, y + 12);
      doc.setTextColor(99, 102, 241); doc.setFont("helvetica", "bold");
      doc.text(team.leader ? `Lead: ${team.leader.name}` : "", M + 27, y + 16);

      const profileRX = M + CW / 2 + 5;
      const profileData = [
        ["Team ID:", `TEAM-${String(team.id || 0).padStart(4, "0")}`, "Team Lead:", team.leader?.name || "-"],
        ["Report Period:", dateRangeLabels[dateRange], "Total Members:", String(members.length)],
        ["Total Assigned:", String(totalAssigned), "Report Date:", genDate],
        ["Total Completed:", String(totalCompleted), "Report Time:", genTime],
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
      const cardMeta = [
        { key: "assigned", label: "Total Assigned", value: totalAssigned, color: [79, 70, 229] },
        { key: "completed", label: "Completed", value: totalCompleted, color: [34, 197, 94] },
        { key: "pending", label: "Pending", value: totalPending, color: [245, 158, 11] },
        { key: "overdue", label: "Overdue", value: totalOverdue, color: [239, 68, 68] },
      ];
      const cGap = 4, cW = (CW - cGap * 3) / 4;
      cardMeta.forEach((c, i) => {
        const cx = M + i * (cW + cGap);
        doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
        doc.roundedRect(cx, y, cW, 22, 2, 2, "S");
        doc.setFillColor(...c.color); doc.circle(cx + 9, y + 6, 4.5, "F");
        doc.setFillColor(255, 255, 255); doc.circle(cx + 9, y + 6, 2, "F");
        doc.setFontSize(6); doc.setFont("helvetica", "normal");
        doc.setTextColor(107, 114, 128); doc.text(c.label, cx + 18, y + 6);
        doc.setFontSize(18); doc.setFont("helvetica", "bold");
        doc.setTextColor(...c.color); doc.text(String(c.value), cx + 18, y + 16);
        doc.setFontSize(5); doc.setFont("helvetica", "normal");
        doc.setTextColor(156, 163, 175);
        const subs = { assigned: "All tasks assigned", completed: "Tasks completed", pending: "Tasks in progress", overdue: "Require attention" };
        doc.text(subs[c.key], cx + cW / 2, y + 20, { align: "center" });
      });
      y += 30;

      // ── TWO-COLUMN CHARTS ──
      const chartColW = (CW - 4) / 2;
      const chartH = 38;

      if (y + chartH > PH - 40) { doc.addPage(); y = 16; }

      // Left: Task Status Breakdown (Donut)
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
      doc.roundedRect(M, y, chartColW, chartH, 2, 2, "S");
      doc.setFontSize(7); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text("TASK STATUS BREAKDOWN", M + 4, y + 5);

      const sb = team.status_breakdown || {};
      const donutSegments = [
        { label: "Completed", count: sb.completed || 0, color: [16, 185, 129] },
        { label: "Pending", count: sb.pending || 0, color: [245, 158, 11] },
        { label: "In Review", count: (sb.submitted || 0) + (sb.reopened || 0), color: [99, 102, 241] },
        { label: "Overdue", count: sb.overdue || 0, color: [239, 68, 68] },
      ];
      const donutTotal = donutSegments.reduce((s, seg) => s + seg.count, 0) || 1;
      const donutCX = M + 22;
      const donutCY = y + chartH / 2 + 3;
      const donutR = 11;
      const donutInner = 7;
      const drawPieSlice = (cx, cy, r, startAngle, endAngle) => {
        const steps = 32;
        const sweep = endAngle - startAngle;
        const points = [[cx + r * Math.cos(startAngle), cy + r * Math.sin(startAngle)]];
        for (let i = 1; i <= steps; i++) {
          const a = startAngle + (sweep * i) / steps;
          points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
        }
        points.push([cx, cy]);
        const deltas = points.map((p, i) => i === 0 ? [0, 0] : [p[0] - points[i - 1][0], p[1] - points[i - 1][1]]);
        doc.lines(deltas, points[0][0], points[0][1], [1, 1], "F");
      };

      let arcAngle = -Math.PI / 2;
      donutSegments.forEach((seg) => {
        if (seg.count === 0) return;
        const sweep = (seg.count / donutTotal) * 2 * Math.PI;
        doc.setFillColor(...seg.color);
        doc.setDrawColor(...seg.color); doc.setLineWidth(0.1);
        drawPieSlice(donutCX, donutCY, donutR, arcAngle, arcAngle + sweep);
        arcAngle += sweep;
      });
      doc.setFillColor(255, 255, 255);
      doc.circle(donutCX, donutCY, donutInner, "F");
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39);
      doc.text(String(donutTotal), donutCX, donutCY - 0.5, { align: "center" });
      doc.setFontSize(4); doc.setFont("helvetica", "normal");
      doc.setTextColor(156, 163, 175);
      doc.text("Total Tasks", donutCX, donutCY + 3, { align: "center" });

      const legendX = M + 42;
      donutSegments.forEach((seg, i) => {
        const ly = y + 10 + i * 6;
        doc.setFillColor(...seg.color); doc.circle(legendX + 2, ly, 1.5, "F");
        doc.setFontSize(5); doc.setFont("helvetica", "normal"); doc.setTextColor(55, 65, 81);
        doc.text(seg.label, legendX + 5, ly + 1);
        const pct = Math.round((seg.count / donutTotal) * 100);
        doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
        doc.text(`${seg.count} (${pct}%)`, legendX + 28, ly + 1);
      });

      // Right: Priority Distribution (Bar)
      const rightX = M + chartColW + 4;
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
      doc.roundedRect(rightX, y, chartColW, chartH, 2, 2, "S");
      doc.setFontSize(7); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text("PRIORITY DISTRIBUTION", rightX + 4, y + 5);

      const pd = team.priority_distribution || {};
      const priItems = [
        { label: "High", count: pd.high || 0, color: [239, 68, 68] },
        { label: "Medium", count: pd.medium || 0, color: [245, 158, 11] },
        { label: "Low", count: pd.low || 0, color: [16, 185, 129] },
      ];
      const priTotal = priItems.reduce((s, p) => s + p.count, 0) || 1;
      const barMaxW = chartColW - 42;
      priItems.forEach((p, i) => {
        const by = y + 10 + i * 9;
        const pct = Math.round((p.count / priTotal) * 100);
        doc.setFontSize(5); doc.setFont("helvetica", "normal"); doc.setTextColor(55, 65, 81);
        doc.text(p.label, rightX + 4, by + 2);
        doc.setFillColor(243, 244, 246); doc.roundedRect(rightX + 22, by - 0.5, barMaxW, 3, 1, 1, "F");
        if (p.count > 0) {
          doc.setFillColor(...p.color); doc.roundedRect(rightX + 22, by - 0.5, barMaxW * (p.count / priTotal), 3, 1, 1, "F");
        }
        doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
        doc.text(`${p.count} (${pct}%)`, rightX + 24 + barMaxW, by + 2);
      });

      y += chartH + 6;

      // ── MEMBER PERFORMANCE TABLE ──
      if (y > 220) { doc.addPage(); y = 16; }
      doc.setFontSize(9); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text("MEMBER PERFORMANCE DETAILS", M, y + 2);
      y += 6;

      const tableData = filteredMembers.map((m, i) => {
        const rate = m.assigned > 0 ? Math.round((m.completed / m.assigned) * 100) : 0;
        return [
          String(i + 1),
          (m.name || "-").substring(0, 30),
          ROLE_LABEL[m.role] || m.role || "-",
          String(m.assigned ?? 0),
          String(m.completed ?? 0),
          String(m.pending ?? 0),
          String(m.overdue ?? 0),
          `${rate}%`,
        ];
      });

      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [["#", "Member Name", "Role", "Assigned", "Completed", "Pending", "Overdue", "Rate"]],
        body: tableData,
        theme: "plain",
        styles: { fontSize: 6, cellPadding: 3, textColor: [55, 65, 81], lineColor: [229, 231, 235], lineWidth: 0.1 },
        headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          0: { cellWidth: 8, halign: "center" },
          1: { cellWidth: "auto" },
          2: { cellWidth: 24, halign: "center" },
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
      doc.text(`Report Type:  Team Performance Report — ${team.name || "Team"}`, PW - M - 50, fY + 4);
      doc.text("Page 1 of 1", PW - M, fY + 7.5, { align: "right" });

      doc.save(`Team-Performance-Report-${(team.name || "team").replace(/\s+/g, "-")}.pdf`);
    } catch (err) {
      console.error("PDF generation error:", err);
    } finally {
      setGenerating(false);
    }
  };

  // ═══════════════════════════ RENDER ═══════════════════════════
  if (!isOpen) return null;

  const cardMeta = [
    { key: "assigned", label: "Total Assigned", value: totalAssigned, color: "#6366f1", bg: "#EEF2FF" },
    { key: "completed", label: "Completed", value: totalCompleted, color: "#22C55E", bg: "#ECFDF5" },
    { key: "pending", label: "Pending", value: totalPending, color: "#F59E0B", bg: "#FEF3C7" },
    { key: "overdue", label: "Overdue", value: totalOverdue, color: "#EF4444", bg: "#FEF2F2" },
  ];

  return createPortal(
    <>
      {/* ── CONFIG MODAL ── */}
      {!showReview && (
        <div className="er-overlay">
          <div className="er-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="er-header">
              <div>
                <h2>Export Team Report</h2>
                <p>Select date range and review team performance report for <strong>{team.name}</strong>.</p>
              </div>
              <button className="er-close-btn" onClick={onClose}>
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
                  <button key={opt.value} className={`er-date-btn ${dateRange === opt.value ? "active" : ""}`} onClick={() => setDateRange(opt.value)}>
                    {opt.label}
                  </button>
                ))}
              </div>
              {dateRange === "custom" && (
                <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                    style={{ flex: 1, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, color: "#374151", outline: "none" }} />
                  <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                    style={{ flex: 1, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, color: "#374151", outline: "none" }} />
                </div>
              )}
            </div>
            <div className="er-footer">
              <button className="er-cancel-btn" onClick={onClose}>Cancel</button>
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
          <div className="er-review-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 860 }}>
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
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>TEAM PERFORMANCE REPORT — {(team.name || "Team").toUpperCase()}</span>
                </div>
              </div>

              {/* ═══ PROFILE ═══ */}
              <div className="erm-profile">
                <div className="erm-profile-left">
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{team.name || "Unknown Team"}</div>
                    <div style={{ fontSize: 9, color: "#6b7280" }}>{members.length} Members</div>
                    <div style={{ fontSize: 9, fontWeight: 600, color: "#6366f1" }}>{team.leader ? `Lead: ${team.leader.name}` : ""}</div>
                  </div>
                </div>
                <div className="erm-profile-right">
                  {[
                    { lbl: "Team ID", val: `TEAM-${String(team.id || 0).padStart(4, "0")}`, col: 1 }, { lbl: "Team Lead", val: team.leader?.name || "-", col: 2 },
                    { lbl: "Report Period", val: dateRangeLabels[dateRange], col: 1 }, { lbl: "Total Members", val: String(members.length), col: 2 },
                    { lbl: "Total Assigned", val: String(totalAssigned), col: 1 }, { lbl: "Report Date", val: genDate, col: 2 },
                    { lbl: "Total Completed", val: String(totalCompleted), col: 1 }, { lbl: "Report Time", val: genTime, col: 2 },
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
                      {c.key === "assigned" ? "All tasks assigned" : c.key === "completed" ? "Tasks completed" : c.key === "pending" ? "Tasks in progress" : "Require attention"}
                    </div>
                  </div>
                ))}
              </div>

              {/* ═══ TWO COLUMNS: STATUS BREAKDOWN + PRIORITY DISTRIBUTION ═══ */}
              <div className="erm-two-col">
                {/* Left: Status Breakdown */}
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 8 }}>TASK STATUS BREAKDOWN</div>
                  {(() => {
                    const sb = team.status_breakdown || {};
                    const total = totalAssigned || 1;
                    const segments = [
                      { label: "Completed", count: sb.completed || 0, color: "#10b981" },
                      { label: "Pending", count: sb.pending || 0, color: "#f59e0b" },
                      { label: "In Review", count: (sb.submitted || 0) + (sb.reopened || 0), color: "#6366f1" },
                      { label: "Overdue", count: sb.overdue || 0, color: "#ef4444" },
                    ];
                    return (
                      <DonutChart segments={segments} size={140} strokeWidth={24} totalLabel="Total Tasks" />
                    );
                  })()}
                </div>

                {/* Right: Priority Distribution */}
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 4 }}>PRIORITY DISTRIBUTION</div>
                  {(() => {
                    const pd = team.priority_distribution || {};
                    const totalP = (pd.high || 0) + (pd.medium || 0) + (pd.low || 0);
                    const items = [
                      { label: "High", count: pd.high || 0, color: "#ef4444" },
                      { label: "Medium", count: pd.medium || 0, color: "#f59e0b" },
                      { label: "Low", count: pd.low || 0, color: "#10b981" },
                    ];
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                        {items.map((p) => {
                          const pct = totalP > 0 ? Math.round((p.count / totalP) * 1000) / 10 : 0;
                          return (
                            <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
                              <span style={{ fontSize: 11, color: "#374151", fontWeight: 500, minWidth: 50 }}>{p.label}</span>
                              <div style={{ flex: 1, height: 8, background: "#f3f4f6", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: p.color, transition: "width 0.6s ease" }}></div>
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 600, color: "#111827", minWidth: 60, textAlign: "right" }}>{p.count} ({Math.round(pct)}%)</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* ═══ MEMBER PERFORMANCE TABLE ═══ */}
              <div className="erm-table-section">
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 6 }}>MEMBER PERFORMANCE DETAILS</div>
                <div className="erm-table-wrapper">
                  <table className="erm-table">
                    <thead>
                      <tr>
                        <th style={{ width: "5%", textAlign: "center" }}>#</th>
                        <th style={{ width: "25%", textAlign: "left" }}>Member Name</th>
                        <th style={{ width: "12%", textAlign: "center" }}>Role</th>
                        <th style={{ width: "10%", textAlign: "center" }}>Assigned</th>
                        <th style={{ width: "10%", textAlign: "center" }}>Completed</th>
                        <th style={{ width: "10%", textAlign: "center" }}>Pending</th>
                        <th style={{ width: "10%", textAlign: "center" }}>Overdue</th>
                        <th style={{ width: "18%", textAlign: "center" }}>Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMembers.length === 0 ? (
                        <tr><td colSpan={8} style={{ textAlign: "center", padding: 20, color: "#9ca3af" }}>No members found</td></tr>
                      ) : filteredMembers.map((m, i) => {
                        const rate = m.assigned > 0 ? Math.round((m.completed / m.assigned) * 100) : 0;
                        const rs = rate >= 80 ? S.green : rate >= 50 ? S.amber : S.red;
                        return (
                          <tr key={m.id || i} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 ? "#f9fafb" : "#fff" }}>
                            <td data-label="#" style={{ textAlign: "center", color: "#6b7280" }}>{i + 1}</td>
                            <td data-label="Member" style={{ fontWeight: 600, color: "#111827" }}>{m.name || "-"}</td>
                            <td data-label="Role" style={{ textAlign: "center" }}>
                              <span style={{ fontWeight: 600, color: "#6366f1" }}>{ROLE_LABEL[m.role] || m.role || "-"}</span>
                            </td>
                            <td data-label="Assigned" style={{ textAlign: "center", fontWeight: 600, color: "#6366f1" }}>{m.assigned ?? 0}</td>
                            <td data-label="Completed" style={{ textAlign: "center", fontWeight: 600, color: "#22c55e" }}>{m.completed ?? 0}</td>
                            <td data-label="Pending" style={{ textAlign: "center", fontWeight: 600, color: "#f59e0b" }}>{m.pending ?? 0}</td>
                            <td data-label="Overdue" style={{ textAlign: "center", fontWeight: 600, color: "#ef4444" }}>{m.overdue ?? 0}</td>
                            <td data-label="Rate">
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <div style={{ flex: 1, height: 4, borderRadius: 2, background: "#e5e7eb", overflow: "hidden" }}>
                                  <div style={{ width: `${rate}%`, height: "100%", borderRadius: 2, background: rate >= 80 ? "#22c55e" : rate >= 50 ? "#f59e0b" : "#ef4444" }}></div>
                                </div>
                                <span style={{ fontWeight: 600, fontSize: 9, color: "#374151", minWidth: 28 }}>{rate}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
                <div>Report Type:  Team Performance Report — {team.name} | Page 1 of 1</div>
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
    </>,
    document.body
  );
}

export default TeamExportReport;
