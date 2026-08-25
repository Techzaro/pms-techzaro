import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import { authToken } from "../utils/auth";
import API_URL from "../config/api";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { getUserTimezone, convertToLocal } from "../utils/timezoneUtils";
import "./AuditLogExportModal.css";

function AuditLogExportModal({ onClose }) {
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
  useEscapeKey(true, handleClose);
  const [format, setFormat] = useState("pdf");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: true } }));
    return () => window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: false } }));
  }, []);

  const generatePdf = async () => {
    const token = authToken();
    if (!token) return;
    try {
      const userTz = getUserTimezone();
      const res = await fetch(`${API_URL}/audit-logs?per_page=10000`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      const data = await res.json();
      const logs = data.data || [];

      const doc = new jsPDF({ orientation: "landscape" });
      const PW = doc.internal.pageSize.getWidth();
      const PH = doc.internal.pageSize.getHeight();
      const M = 14;
      const genDate = convertToLocal(new Date().toISOString(), userTz, "DD/MM/YYYY");
      const genTime = convertToLocal(new Date().toISOString(), userTz, "hh:mm A");

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
      doc.text("APPLICATION AUDIT LOGS REPORT", PW / 2, 8, { align: "center" });

      // ── TABLE ──
      const headers = [`Date & Time (${userTz})`, "User", "Module", "Action", "Description", "Status", "IP Address", "Browser", "Device"];
      const rows = logs.map((l) => [
        l.created_at ? convertToLocal(l.created_at, userTz, "DD/MM/YYYY, hh:mm A") : "-",
        l.user?.name || "System",
        l.module || "-",
        l.action || "-",
        l.description || "-",
        (l.status || "success").charAt(0).toUpperCase() + (l.status || "success").slice(1),
        l.ip_address || "-",
        l.browser || "-",
        l.device || "-",
      ]);

      autoTable(doc, {
        startY: 18,
        margin: { left: M, right: M },
        head: [headers],
        body: rows,
        theme: "plain",
        styles: { fontSize: 7, cellPadding: 3, textColor: [31, 41, 55], lineColor: [229, 231, 235], lineWidth: 0.1 },
        headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 5) {
            const status = logs[data.row.index]?.status;
            const color = status === "success" ? [5, 150, 105] : [220, 38, 38];
            data.cell.styles.textColor = color;
            data.cell.styles.fontStyle = "bold";
          }
        },
      });

      // ── FOOTER ──
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
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
        doc.text(`Timezone: ${userTz} | Report Type: Application Audit Logs`, PW - M - 60, fY + 4);
        doc.text(`Page ${i} of ${totalPages}`, PW - M, fY + 7.5, { align: "right" });
      }

      doc.save(`audit-logs-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error("PDF export failed", e);
    }
  };

  const exportExcel = async () => {
    const token = authToken();
    if (!token) return;
    try {
      const userTz = getUserTimezone();
      const res = await fetch(`${API_URL}/audit-logs/export`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ format: "xlsx", timezone: userTz }),
      });
      if (!res.ok) throw new Error("Export failed");
      const resBlob = await res.blob();
      const excelBlob = new Blob([resBlob], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(excelBlob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `audit-logs-${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (e) {
      console.error("Excel export failed", e);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    if (format === "pdf") {
      await generatePdf();
    } else {
      await exportExcel();
    }
    setExporting(false);
    onClose();
  };

  return createPortal(
    <>
      <div className="ael-overlay" onClick={handleClose}>
        <div className="ael-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
          <div className="ael-header">
            <div className="ael-header-left">
              <div className="ael-header-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <div>
                <h2 className="ael-title">Export Audit Logs</h2>
                <p className="ael-subtitle">Choose a format to export the audit log data</p>
              </div>
            </div>
            <button className="ael-close-btn" onClick={handleClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="ael-body">
            <div className="ael-format-group">
              <label className="ael-radio-label">
                <input
                  type="radio"
                  name="export-format"
                  value="pdf"
                  checked={format === "pdf"}
                  onChange={() => { setFormat("pdf"); setIsDirty(true); }}
                />
                <span className="ael-radio-mark" />
                <div className="ael-radio-content">
                  <span className="ael-radio-title">PDF</span>
                  <span className="ael-radio-desc">Portable Document Format - best for viewing and printing</span>
                </div>
              </label>
              <label className="ael-radio-label">
                <input
                  type="radio"
                  name="export-format"
                  value="xlsx"
                  checked={format === "xlsx"}
                  onChange={() => { setFormat("xlsx"); setIsDirty(true); }}
                />
                <span className="ael-radio-mark" />
                <div className="ael-radio-content">
                  <span className="ael-radio-title">Excel</span>
                  <span className="ael-radio-desc">Spreadsheet format - best for data analysis and filtering</span>
                </div>
              </label>
            </div>
          </div>

          <div className="ael-footer">
            <button className="ael-cancel-btn" onClick={handleClose} disabled={exporting}>Cancel</button>
            <button className="ael-export-btn" onClick={handleExport} disabled={exporting}>
              {exporting ? "Exporting..." : "Export"}
            </button>
          </div>
        </div>
      </div>
      {ConfirmDialog}
    </>,
    document.body
  );
}

export default AuditLogExportModal;
