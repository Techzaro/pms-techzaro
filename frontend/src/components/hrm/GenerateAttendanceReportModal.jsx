import "react";
import { FileText, X, FileSpreadsheet, Download } from "lucide-react";

export default function GenerateAttendanceReportModal({
  isOpen,
  onClose,
  selectedMonth,
  setSelectedMonth,
  reportDepartment,
  setReportDepartment,
  filteredUsersCount = 0,
  onExportCsv,
  onGeneratePdf,
}) {
  if (!isOpen) return null;

  return (
    <div className="att-modal-overlay" onClick={onClose}>
      <div className="att-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px" }}>
        <div className="att-modal-header" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "#fff" }}>
          <h3 style={{ margin: 0, color: "#fff", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            <FileText size={20} color="#0082ff" /> Generate HR Attendance &amp; Punch Log Report
          </h3>
          <button style={{ border: "none", background: "none", color: "#fff", cursor: "pointer" }} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: "20px" }}>
          <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 16px" }}>
            Generate an official, branded HR Attendance &amp; Punch Log Report for management, audit, or payroll processing.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "20px" }}>
            <div>
              <label htmlFor="report-month-select" style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>
                Attendance Month Period:
              </label>
              <select
                id="report-month-select"
                className="att-input"
                style={{ width: "100%", padding: "10px", borderRadius: "8px", fontWeight: "600" }}
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
            </div>

            <div>
              <label htmlFor="report-dept-select" style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>
                Department Filter:
              </label>
              <select
                id="report-dept-select"
                className="att-input"
                style={{ width: "100%", padding: "10px", borderRadius: "8px", fontWeight: "600" }}
                value={reportDepartment}
                onChange={(e) => setReportDepartment(e.target.value)}
              >
                <option value="All">All Organization Departments ({filteredUsersCount} Members)</option>
                <option value="Engineering">Engineering Department</option>
                <option value="Design">Design Department</option>
                <option value="Sales">Sales &amp; Marketing</option>
                <option value="HR">Human Resources</option>
              </select>
            </div>

            <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px", color: "#334155" }}>
              <div style={{ fontWeight: "700", marginBottom: "4px" }}>Included Report Metrics:</div>
              <div>• Employee Work Hours Logged &amp; Attendance Ratios</div>
              <div>• Present Days, Remote WFH Days, Late Arrivals</div>
              <div>• Overtime &amp; Extra Hours Logged</div>
              <div>• Official Company Audit Header &amp; Timestamps</div>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "flex-end", borderTop: "1px solid #e2e8f0", paddingTop: "14px" }}>
            <button
              type="button"
              className="att-btn"
              style={{ background: "#f1f5f9", color: "#334155", padding: "10px 16px", borderRadius: "8px" }}
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              type="button"
              className="att-btn"
              style={{ background: "#16a34a", color: "#ffffff", padding: "10px 16px", borderRadius: "8px", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "6px" }}
              onClick={onExportCsv}
            >
              <FileSpreadsheet size={16} /> 📊 Export Excel / CSV
            </button>

            <button
              type="button"
              className="att-btn att-btn--primary"
              style={{ padding: "10px 18px", borderRadius: "8px", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "6px" }}
              onClick={onGeneratePdf}
            >
              <Download size={16} /> 📄 Generate &amp; Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
