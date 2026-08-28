/**
 * ExportReport.jsx — Performance Report Export Modal
 *
 * A modal component for generating and exporting a team performance report as PDF.
 * Features:
 * - Timeline filter (All Time, Today, This Week, This Month, Custom Range)
 * - Report preview with summary cards and user performance table
 * - PDF export using jsPDF with branded header/footer and auto-generated tables
 * - Rendered via React portal to body
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import "../pages/ExportReport.css";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import { getUserTimezone, formatLocalDate, formatLocalTime } from "../utils/timezoneUtils";

/** Color palette for user avatar backgrounds */
const AVATAR_COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

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

/** Display labels for user roles */
const ROLE_LABEL = { admin: "Admin", manager: "Manager", team_lead: "Team Lead", member: "Member", guest: "Guest" };
/** RGB color values for task statuses in PDF */
const STATUS_COLORS_PDF = {
  completed: [22, 101, 52], done: [22, 101, 52], approved: [22, 101, 52],
  pending: [146, 64, 14],
  assigned: [30, 64, 175],
  overdue: [153, 27, 27],
};

/** Formats a status string to display label */
function formatStatus(status) {
  const map = { pending: "Pending", approved: "Approved", assigned: "Assigned", completed: "Completed" };
  return map[status] || status || "-";
}

/**
 * ExportReport — Modal for generating and exporting a performance report as PDF.
 * Accepts summary data and users array as props, provides timeline filtering,
 * report preview, and PDF generation.
 */
function ExportReport({ isOpen, onClose, summary = {}, users = [] }) {
  const { t } = useTranslation();
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
  useEscapeKey(true, handleClose);
  const [showReview, setShowReview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [timeRange, setTimeRange] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const userTz = getUserTimezone();
  const genDate = formatLocalDate(new Date().toISOString(), userTz);
  const genTime = formatLocalTime(new Date().toISOString(), userTz);

  const cardData = [
    { key: "total_assigned", label: t("Total Assigned", { defaultValue: "Total Assigned" }), value: summary?.total_assigned ?? 0, color: "var(--color-primary)", bg: "#EEF2FF", sub: t("All tasks assigned", { defaultValue: "All tasks assigned" }) },
    { key: "approved", label: t("Approved", { defaultValue: "Approved" }), value: summary?.approved ?? 0, color: "#22C55E", bg: "#ECFDF5", sub: t("Tasks completed", { defaultValue: "Tasks completed" }) },
    { key: "pending", label: t("Pending", { defaultValue: "Pending" }), value: summary?.pending ?? 0, color: "#F59E0B", bg: "#FEF3C7", sub: t("Tasks in progress", { defaultValue: "Tasks in progress" }) },
    { key: "overdue", label: t("Overdue", { defaultValue: "Overdue" }), value: summary?.overdue ?? 0, color: "#EF4444", bg: "#FEF2F2", sub: t("Require attention", { defaultValue: "Require attention" }) },
  ];

  const formatDateShort = (d) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  // Generates a branded PDF with summary cards and user performance table
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
      doc.setFontSize(5.5); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
      doc.text("TX", M + 4, 8, { align: "center" });
      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
      doc.text("Techxaro", M + 12, 6.5);
      doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.setTextColor(148, 163, 184);
      doc.text("PMS Portal", M + 12, 10.5);
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
      doc.text("PERFORMANCE REPORT", PW / 2, 8, { align: "center" });
      y = 18;

      // ── SUMMARY CARDS ──
      const cGap = 4, cW = (CW - cGap * 3) / 4;
      cardData.forEach((c, i) => {
        const cx = M + i * (cW + cGap);
        doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
        doc.roundedRect(cx, y, cW, 22, 2, 2, "S");
        doc.setFillColor(...(c.key === "total_assigned" ? [79, 70, 229] : c.key === "approved" ? [34, 197, 94] : c.key === "pending" ? [245, 158, 11] : [239, 68, 68]));
        doc.circle(cx + 9, y + 6, 4.5, "F");
        doc.setFillColor(255, 255, 255); doc.circle(cx + 9, y + 6, 2, "F");
        doc.setFontSize(6); doc.setFont("helvetica", "normal");
        doc.setTextColor(107, 114, 128); doc.text(c.label, cx + 18, y + 6);
        doc.setFontSize(18); doc.setFont("helvetica", "bold");
        doc.setTextColor(...(c.key === "total_assigned" ? [79, 70, 229] : c.key === "approved" ? [34, 197, 94] : c.key === "pending" ? [245, 158, 11] : [239, 68, 68]));
        doc.text(String(c.value), cx + 18, y + 16);
        doc.setFontSize(5); doc.setFont("helvetica", "normal");
        doc.setTextColor(156, 163, 175);
        doc.text(c.sub, cx + cW / 2, y + 20, { align: "center" });
      });
      y += 30;

      // ── USER PERFORMANCE TABLE ──
      doc.setFontSize(9); doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39); doc.text("USER PERFORMANCE", M, y + 2);
      y += 6;

      const tableData = (users || []).map((u, i) => [
        String(i + 1),
        u.name || "-",
        ROLE_LABEL[u.role] || u.role || "-",
        String(u.assigned ?? 0),
        String(u.completed ?? 0),
        String(u.pending ?? 0),
        String(u.overdue ?? 0),
      ]);

      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [["#", "User", "Role", "Assigned", "Completed", "Pending", "Overdue"]],
        body: tableData,
        theme: "plain",
        styles: { fontSize: 6, cellPadding: 3, textColor: [55, 65, 81], lineColor: [229, 231, 235], lineWidth: 0.1 },
        headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          0: { cellWidth: 8, halign: "center" },
          1: { cellWidth: "auto" },
          2: { cellWidth: 28 },
          3: { cellWidth: 20, halign: "center" },
          4: { cellWidth: 20, halign: "center" },
          5: { cellWidth: 20, halign: "center" },
          6: { cellWidth: 20, halign: "center" },
        },
        didParseCell(data) {
          if (data.section === "body") {
            if (data.column.index === 1) data.cell.styles.fontStyle = "bold";
            if (data.column.index >= 3) data.cell.styles.fontStyle = "bold";
          }
        },
      });

      y = doc.lastAutoTable.finalY + 5;

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
      doc.text(`Generated Date:   ${genDate}`, M + 38, fY + 4);
      doc.text(`Generated Time:   ${genTime} (${userTz})`, M + 38, fY + 7.5);
      doc.text(`Timezone: ${userTz} | Report: Performance Report`, PW - M - 60, fY + 4);
      doc.text("Page 1 of 1", PW - M, fY + 7.5, { align: "right" });

      doc.save("Performance-Report.pdf");
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
          <div className="er-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="er-header">
              <div>
                <h2>{t("Export Report", { defaultValue: "Export Report" })}</h2>
                <p>{t("Review and export your performance report.", { defaultValue: "Review and export your performance report." })}</p>
              </div>
               <button className="er-close-btn" onClick={handleClose}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 5L5 15M5 5l10 10" />
                </svg>
              </button>
            </div>
            <div className="er-section">
              <h3>{t("Timeline", { defaultValue: "Timeline" })}</h3>
              <div className="er-date-buttons" style={{ marginBottom: 12 }}>
                {[
                  { value: "all", label: t("All Time", { defaultValue: "All Time" }) },
                  { value: "today", label: t("Today", { defaultValue: "Today" }) },
                  { value: "week", label: t("This Week", { defaultValue: "This Week" }) },
                  { value: "month", label: t("This Month", { defaultValue: "This Month" }) },
                  { value: "custom", label: t("Custom Range", { defaultValue: "Custom Range" }) },
                ].map((opt) => (
                  <button key={opt.value} className={`er-date-btn ${timeRange === opt.value ? "active" : ""}`} onClick={() => { setTimeRange(opt.value); setIsDirty(true); }}>
                    {opt.label}
                  </button>
                ))}
              </div>
              {timeRange === "custom" && (
                <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                  <input type="date" value={customStart} onChange={(e) => { setCustomStart(e.target.value); setIsDirty(true); }}
                    style={{ flex: 1, padding: "10px 14px", border: "1px solid var(--border-color)", borderRadius: 10, fontSize: 13, color: "var(--text-dark)", outline: "none" }} />
                  <input type="date" value={customEnd} onChange={(e) => { setCustomEnd(e.target.value); setIsDirty(true); }}
                    style={{ flex: 1, padding: "10px 14px", border: "1px solid var(--border-color)", borderRadius: 10, fontSize: 13, color: "var(--text-dark)", outline: "none" }} />
                </div>
              )}
            </div>
            <div className="er-footer">
               <button className="er-cancel-btn" onClick={handleClose}>{t("Cancel", { defaultValue: "Cancel" })}</button>
              <button className="er-export-btn" onClick={() => setShowReview(true)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v8M4 6l4 4 4-4M2 14h12" />
                </svg>
                {t("Report Review", { defaultValue: "Report Review" })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── REVIEW MODAL ── */}
      {showReview && (
        <div className="er-overlay">
          <div className="er-review-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820 }}>
            <button className="er-close-btn" style={{ position: "absolute", top: 16, right: 16, zIndex: 10 }} onClick={() => setShowReview(false)}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 5L5 15M5 5l10 10" />
              </svg>
            </button>

            <div style={{ padding: 0 }}>
              {/* HEADER */}
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
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{t("PERFORMANCE REPORT", { defaultValue: "PERFORMANCE REPORT" })}</span>
                </div>
              </div>

              {/* SUMMARY CARDS */}
              <div className="erm-summary-grid">
                {cardData.map((c) => (
                  <div key={c.key} style={{ border: "1px solid var(--border-color)", borderRadius: 8, padding: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 14, height: 14, borderRadius: "50%", background: c.color }}></div>
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{c.label}</div>
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: c.color, marginTop: 4 }}>{c.value}</div>
                    <div style={{ fontSize: 8, color: "var(--text-muted)", marginTop: 2 }}>
                      {c.sub}
                    </div>
                  </div>
                ))}
              </div>

              {/* USER PERFORMANCE TABLE */}
              <div className="erm-table-section">
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-heading)", marginBottom: 6 }}>{t("USER PERFORMANCE", { defaultValue: "USER PERFORMANCE" })}</div>
                <div className="erm-table-wrapper">
                  <table className="erm-table">
                    <thead>
                      <tr>
                        {[
                          { key: "#", label: "#" },
                          { key: "User", label: t("User", { defaultValue: "User" }) },
                          { key: "Role", label: t("Role", { defaultValue: "Role" }) },
                          { key: "Assigned", label: t("Assigned", { defaultValue: "Assigned" }) },
                          { key: "Completed", label: t("Completed", { defaultValue: "Completed" }) },
                          { key: "Pending", label: t("Pending", { defaultValue: "Pending" }) },
                          { key: "Overdue", label: t("Overdue", { defaultValue: "Overdue" }) },
                        ].map(h => (
                          <th key={h.key} style={{ textAlign: h.key === "#" ? "center" : "left" }}>{h.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(users || []).length === 0 ? (
                        <tr><td colSpan={7} style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>{t("No data", { defaultValue: "No data" })}</td></tr>
                      ) : users.map((u, i) => (
                        <tr key={u.id} style={{ borderBottom: "1px solid var(--border-light)", background: i % 2 ? "var(--bg-hover)" : "var(--bg-card)" }}>
                          <td data-label="#" style={{ textAlign: "center", color: "var(--text-secondary)" }}>{i + 1}</td>
                          <td data-label={t("User", { defaultValue: "User" })} style={{ fontWeight: 600, color: "var(--text-heading)" }}>{u.name || "-"}</td>
                          <td data-label={t("Role", { defaultValue: "Role" })} style={{ color: "var(--text-dark)" }}>{ROLE_LABEL[u.role] ? t(ROLE_LABEL[u.role], { defaultValue: ROLE_LABEL[u.role] }) : u.role || "-"}</td>
                          <td data-label={t("Assigned", { defaultValue: "Assigned" })} style={{ fontWeight: 600, color: "var(--color-primary)" }}>{u.assigned ?? 0}</td>
                          <td data-label={t("Completed", { defaultValue: "Completed" })} style={{ fontWeight: 600, color: "#22c55e" }}>{u.completed ?? 0}</td>
                          <td data-label={t("Pending", { defaultValue: "Pending" })} style={{ fontWeight: 600, color: "#f59e0b" }}>{u.pending ?? 0}</td>
                          <td data-label={t("Overdue", { defaultValue: "Overdue" })} style={{ fontWeight: 600, color: "#ef4444" }}>{u.overdue ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* FOOTER */}
              <div className="erm-footer">
                <div className="erm-footer-left">
                  <div style={{ width: 16, height: 16, borderRadius: 3, background: "var(--color-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 7, fontWeight: 700, color: "#fff" }}>TX</span>
                  </div>
                  <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Techxaro</span>
                  <span>PMS Portal</span>
                </div>
                <div>{t("Generated Date: {{date}} | Generated Time: {{time}} ({{tz}})", { date: genDate, time: genTime, tz: userTz, defaultValue: `Generated Date: ${genDate} | Generated Time: ${genTime} (${userTz})` })}</div>
                <div>{t("Timezone: {{tz}} | Report Type: Performance Report", { tz: userTz, defaultValue: `Timezone: ${userTz} | Report Type: Performance Report` })}</div>
              </div>

              {/* ACTIONS */}
              <div className="erm-actions">
                <button className="er-cancel-btn" onClick={() => setShowReview(false)}>{t("Back", { defaultValue: "Back" })}</button>
                <button className="er-export-btn" onClick={generatePDF} disabled={generating}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v8M4 6l4 4 4-4M2 14h12" />
                  </svg>
                  {generating ? t("Generating...", { defaultValue: "Generating..." }) : t("Export PDF", { defaultValue: "Export PDF" })}
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

export default ExportReport;
