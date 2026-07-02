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

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import DonutChart from "../components/DonutChart";
import "../components/Charts.css";
import "../pages/ExportReport.css";

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
    const t = item.total_tasks ?? 0, c = item.completed_tasks ?? 0;
    return t === 0 ? 0 : Math.round((c / t) * 100);
  }
  return item.deliverables_progress || 0;
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
  const [dateRange, setDateRange] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [generating, setGenerating] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const reportRef = useRef(null);

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
  const genBy = user.name || "Admin";
  const roleDisplay = user.role
    ? user.role === "team_lead" || user.role === "teamlead"
      ? "Team Lead"
      : user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : "Member";
  const empId = user.employee_id || "EMP-" + String(user.id || 0).padStart(4, "0");

  // ═══════════════════════════ PDF GENERATION ═══════════════════════════
  const generatePDF = async () => {
    setGenerating(true);
    try {
      const el = reportRef.current;
      if (!el) return;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");
      const doc = new jsPDF("p", "mm", "a4");
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const imgW = canvas.width;
      const imgH = canvas.height;
      const ratio = Math.min(pw / imgW, ph / imgH);
      const dw = imgW * ratio;
      const dh = imgH * ratio;
      doc.addImage(imgData, "PNG", (pw - dw) / 2, 0, dw, dh);
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
          <div className="er-review-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820 }}>
            {/* Close */}
            <button className="er-close-btn" style={{ position: "absolute", top: 16, right: 16, zIndex: 10 }} onClick={() => setShowReview(false)}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 5L5 15M5 5l10 10" />
              </svg>
            </button>

            <div style={{ padding: "0", background: "#fff" }}>
              <div ref={reportRef}>
              {/* ═══ HEADER ═══ */}
              <div style={{ background: "#0f172a", padding: "14px 28px", display: "flex", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 5, background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>TX</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Techxaro</div>
                    <div style={{ fontSize: 8, color: "#94a3b8" }}>PMS Portal</div>
                  </div>
                </div>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{reportLabel} PERFORMANCE REPORT</span>
                </div>
                <div style={{ textAlign: "right", fontSize: 9, color: "#fff", lineHeight: 1.8 }}>
                  <div>Generated On:  {genDate}</div>
                  <div>Generated By:  {genBy}</div>
                  <div>Report Type:  {reportLabelTitle} Performance Report</div>
                </div>
              </div>

              {/* ═══ PROFILE ═══ */}
              <div style={{ margin: "14px 28px", border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 16px", display: "flex" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#d1d5db", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="20" height="20" viewBox="0 0 48 48" fill="#9ca3af"><circle cx="24" cy="18" r="8" /><path d="M5 46c0-11 9-20 20-20s20 9 20 20" /></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{user.name || "Unknown User"}</div>
                    <div style={{ fontSize: 9, color: "#6b7280" }}>{roleDisplay}</div>
                    <div style={{ fontSize: 9, fontWeight: 600, color: "#6366f1" }}>{user.team || ""}</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gapX: 16, gapY: 2, fontSize: 9, minWidth: 340 }}>
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
              <div style={{ margin: "0 28px 14px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
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
              <div style={{ margin: "0 28px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
              <div style={{ margin: "0 28px 14px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 6 }}>TASKS & PROJECTS DETAILS</div>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                  <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 10 }}>
                    <thead>
                      <tr style={{ background: "#111827", color: "#fff", fontWeight: 600, fontSize: 9 }}>
                        <th style={{ width: "5%", padding: "6px 8px", textAlign: "center" }}>#</th>
                        <th style={{ width: "30%", padding: "6px 8px", textAlign: "left" }}>Task / Project Name</th>
                        <th style={{ width: "10%", padding: "6px 8px", textAlign: "center" }}>Type</th>
                        <th style={{ width: "14%", padding: "6px 8px", textAlign: "center" }}>Status</th>
                        <th style={{ width: "16%", padding: "6px 8px", textAlign: "center" }}>Progress</th>
                        <th style={{ width: "10%", padding: "6px 8px", textAlign: "center" }}>Priority</th>
                        <th style={{ width: "15%", padding: "6px 8px", textAlign: "center" }}>Due Date</th>
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
                            <td style={{ padding: "6px 8px", textAlign: "center", color: "#6b7280", verticalAlign: "middle" }}>{idx + 1}</td>
                            <td style={{ padding: "6px 8px", fontWeight: 600, color: "#111827", wordBreak: "break-word", verticalAlign: "middle" }}>{item.title || item.name || "-"}</td>
                            <td style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "middle" }}>
                              <span style={{ fontWeight: 600, color: isProject ? "#6366f1" : "#16a34a" }}>{isProject ? "Project" : "Task"}</span>
                            </td>
                            <td style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "middle" }}>
                              <span style={{ fontWeight: 600, color: ss.text }}>&#9679; {st}</span>
                            </td>
                            <td style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "middle" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <div style={{ flex: 1, height: 4, borderRadius: 2, background: "#e5e7eb", overflow: "hidden" }}>
                                  <div style={{ width: `${progress}%`, height: "100%", borderRadius: 2, background: progress >= 80 ? "#22c55e" : progress >= 50 ? "#f59e0b" : "#ef4444" }}></div>
                                </div>
                                <span style={{ fontWeight: 600, fontSize: 9, color: "#374151" }}>{progress}%</span>
                              </div>
                            </td>
                            <td style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "middle" }}>
                              <span style={{ fontWeight: 600, fontSize: 9, color: ps.text }}>&#9679; {item.priority || "Medium"}</span>
                            </td>
                            <td style={{ padding: "6px 8px", textAlign: "center", color: "#6b7280", fontSize: 9, verticalAlign: "middle" }}>{due}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ═══ DELIVERABLES ═══ */}
              <div style={{ margin: "0 28px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
                    <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 9 }}>
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
                              <td style={{ padding: "4px 6px", textAlign: "center", color: "#6b7280", verticalAlign: "middle" }}>{i + 1}</td>
                              <td style={{ padding: "4px 6px", fontWeight: 600, color: "#111827", verticalAlign: "middle" }}>{(d.title || "-").substring(0, 24)}</td>
                              <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 600, color: ss.text, verticalAlign: "middle" }}>&#9679; {formatStatus(d.status)}</td>
                              <td style={{ padding: "4px 6px", textAlign: "center", color: "#6b7280", verticalAlign: "middle" }}>{d.submitted_at ? formatDateShort(d.submitted_at) : "-"}</td>
                              <td style={{ padding: "4px 6px", textAlign: "center", color: "#6b7280", verticalAlign: "middle" }}>{d.approved_at ? formatDateShort(d.approved_at) : "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* ═══ MANAGER REMARKS ═══ */}
              <div style={{ margin: "0 28px 14px", border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px" }}>
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
              <div style={{ borderTop: "1px solid #e5e7eb", margin: "0 28px", padding: "8px 0", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9, color: "#9ca3af" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 16, height: 16, borderRadius: 3, background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 7, fontWeight: 700, color: "#fff" }}>TX</span>
                  </div>
                  <span style={{ fontWeight: 600, color: "#6b7280" }}>Techxaro</span>
                  <span>PMS Portal</span>
                </div>
                <div>Generated Date:  {genDate} | Generated Time:  {genTime}</div>
                <div>Report Type:  {reportLabelTitle} Performance Report | Page 1 of 1</div>
              </div>
              </div>

              {/* ═══ ACTIONS ═══ */}
              <div style={{ borderTop: "1px solid #f3f4f6", padding: "14px 28px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
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

export default MemberExportReport;
