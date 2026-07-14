import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { authToken } from "../utils/auth";
import API_URL from "../config/api";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import "./AuditLogExportModal.css";

function AuditLogExportModal({ onClose }) {
  useEscapeKey(true, onClose);
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
      const [logRes, docRes] = await Promise.all([
        fetch(`${API_URL}/audit-logs?per_page=10000`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          skipLoader: true,
        }),
        fetch(`${API_URL}/company-documents`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          skipLoader: true,
        }),
      ]);
      if (!logRes.ok) throw new Error("Failed to fetch audit logs");
      const data = await logRes.json();
      const logs = data.data || [];

      let logoBase64 = null;
      let logoMime = "image/png";
      if (docRes.ok) {
        const docData = await docRes.json();
        const logoInfo = docData?.documents?.company_logo;
        if (logoInfo?.exists && logoInfo?.url) {
          try {
            const logoResp = await fetch(logoInfo.url, { skipLoader: true });
            if (logoResp.ok) {
              logoMime = logoResp.headers.get("content-type") || "image/png";
              const blob = await logoResp.blob();
              logoBase64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
              });
            }
          } catch (_) {}
        }
      }

      const doc = new jsPDF({ orientation: "landscape" });
      const pageWidth = doc.internal.pageSize.getWidth();

      if (logoBase64) {
        doc.addImage(logoBase64, logoMime === "image/jpeg" ? "JPEG" : "PNG", 14, 8, 22, 22);
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text("Techxaro Solutions", 40, 18);
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text("Application Audit Logs Report", 40, 25);
      } else {
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text("Application Audit Logs", pageWidth / 2, 20, { align: "center" });
      }
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated on ${new Date().toLocaleString()}`, pageWidth / 2, logoBase64 ? 32 : 27, { align: "center" });

      const headers = ["Date & Time", "User", "Module", "Action", "Description", "Status", "IP Address", "Browser", "Device"];
      const rows = logs.map((l) => [
        l.created_at ? new Date(l.created_at).toLocaleString() : "-",
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
        startY: logoBase64 ? 39 : 34,
        head: [headers],
        body: rows,
        theme: "plain",
        styles: { fontSize: 7, cellPadding: 3, textColor: [31, 41, 55], lineColor: [229, 231, 235], lineWidth: 0.1 },
        headStyles: { fillColor: [249, 250, 251], textColor: [107, 114, 128], fontStyle: "bold", fontSize: 7 },
        didDrawCell: (data) => {
          if (data.section === "body" && data.column.index === 5) {
            const status = logs[data.row.index]?.status;
            const color = status === "success" ? [5, 150, 105] : [220, 38, 38];
            doc.setTextColor(...color);
            doc.setFont("helvetica", "bold");
            doc.text(String(data.cell.raw), data.cell.x + data.cell.padding("left"), data.cell.y + data.cell.padding("top") + 4);
            doc.setTextColor(31, 41, 55);
            doc.setFont("helvetica", "normal");
          }
        },
      });

      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(229, 231, 235);
        doc.line(14, 195, pageWidth - 14, 195);
        doc.setFontSize(6);
        doc.setTextColor(156, 163, 175);
        doc.text("Techxaro Solutions - PMS Audit Trail", 14, 199);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, 199, { align: "right" });
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
      const res = await fetch(`${API_URL}/audit-logs/export`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ format: "xlsx" }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      onClose();
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
    <div className="ael-overlay" onClick={onClose}>
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
          <button className="ael-close-btn" onClick={onClose}>
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
                onChange={() => setFormat("pdf")}
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
                onChange={() => setFormat("xlsx")}
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
          <button className="ael-cancel-btn" onClick={onClose} disabled={exporting}>Cancel</button>
          <button className="ael-export-btn" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default AuditLogExportModal;
