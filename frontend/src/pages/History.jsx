import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import AuditLogDetailModal from "../components/AuditLogDetailModal";
import { authToken, getUser } from "../utils/auth";
import { formatDateTimeInline } from "../utils/formatDateTime";
import { timeAgo } from "../utils/formatDateTime";
import API_URL from "../config/api";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import "./AuditLogs.css";

function CompanyHeader() {
  const [logo, setLogo] = useState(null);
  const [companyName, setCompanyName] = useState("Techxaro Solutions");
  useEffect(() => {
    const token = authToken();
    if (!token) return;
    fetch(`${API_URL}/company-documents`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    }).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.company_logo?.exists) {
        setLogo(`${API_URL.replace("/api", "")}/storage/${d.company_logo.path}`);
      }
    }).catch(() => { });
  }, []);
}

function MyActivity() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [perPage, setPerPage] = useState(25);
  const [detailLog, setDetailLog] = useState(null);
  const [exporting, setExporting] = useState(false);
  const searchTimerRef = useRef(null);
  const user = getUser();

  const fetchLogs = useCallback(async (p = 1) => {
    const token = authToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: p, per_page: perPage, sort_field: "created_at", sort_order: "desc" });
      if (search) params.set("search", search);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (moduleFilter) params.set("module", moduleFilter);
      if (actionFilter) params.set("action", actionFilter);

      const res = await fetch(`${API_URL}/my-activity?${params}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      if (!res.ok) throw new Error("Failed to fetch activity");
      const data = await res.json();
      setLogs(data.data || []);
      setPage(data.meta?.current_page || data.current_page || 1);
      setLastPage(data.meta?.last_page || data.last_page || 1);
      setTotal(data.meta?.total || data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, dateFrom, dateTo, moduleFilter, actionFilter, perPage]);

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  const handleSearchChange = (val) => {
    setSearchInput(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setSearch(val), 400);
  };

  const applyFilters = () => { setSearch(searchInput); fetchLogs(1); };
  const clearFilters = () => {
    setSearchInput(""); setSearch(""); setDateFrom(""); setDateTo("");
    setModuleFilter(""); setActionFilter("");
  };
  const handlePageChange = (p) => { if (p >= 1 && p <= lastPage) fetchLogs(p); };

  const generatePdf = async () => {
    const token = authToken();
    if (!token) return;
    setExporting(true);
    try {
      let allLogs = [];
      let page = 1;
      let lastPage = 1;
      do {
        const params = new URLSearchParams({ page, per_page: 200, sort_field: "created_at", sort_order: "desc" });
        if (search) params.set("search", search);
        if (dateFrom) params.set("date_from", dateFrom);
        if (dateTo) params.set("date_to", dateTo);
        if (moduleFilter) params.set("module", moduleFilter);
        if (actionFilter) params.set("action", actionFilter);

        const res = await fetch(`${API_URL}/my-activity?${params}`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          skipLoader: true,
        });
        if (!res.ok) throw new Error("Failed to fetch activity");
        const data = await res.json();
        allLogs = allLogs.concat(data.data || []);
        lastPage = data.meta?.last_page || data.last_page || 1;
        page++;
      } while (page <= lastPage);

      const logs = allLogs;

      const doc = new jsPDF({ orientation: "landscape" });
      const PW = doc.internal.pageSize.getWidth();
      const PH = doc.internal.pageSize.getHeight();
      const M = 14;
      const genDate = new Date().toLocaleDateString();
      const genTime = new Date().toLocaleTimeString();

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
      doc.text("MY ACTIVITY REPORT", PW / 2, 8, { align: "center" });

      // ── TABLE ──
      const headers = ["Date & Time", "Module", "Action", "Description", "Status", "IP Address"];
      const rows = logs.map((l) => [
        l.created_at ? new Date(l.created_at).toLocaleString() : "-",
        l.module || "-",
        (l.action || "").replace(/_/g, " "),
        l.description || "-",
        (l.status || "success").charAt(0).toUpperCase() + (l.status || "success").slice(1),
        l.ip_address || "-",
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
          if (data.section === "body" && data.column.index === 4) {
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
        doc.text(`Generated Time:   ${genTime}`, M + 38, fY + 7.5);
        doc.text("Report Type:  My Activity Report", PW - M - 42, fY + 4);
        doc.text(`Page ${i} of ${totalPages}`, PW - M, fY + 7.5, { align: "right" });
      }

      doc.save(`my-activity-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error("PDF export failed", e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <DashboardLayout hideRightSidebar={true}>
      <Breadcrumb items={[{ label: t("My Activity", { defaultValue: "My Activity" }) }]} />
      <CompanyHeader />
      <br />
      <div className="audit-layout">
        <div className="audit-layout-row">
          <div className="audit-header">
            <div className="audit-header-left">
              <div className="audit-header-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <h1 className="audit-title">{t("My Activity", { defaultValue: "My Activity" })}</h1>
                <p className="audit-subtitle">{t("Track your personal actions across the system", { defaultValue: "Track your personal actions across the system" })}</p>
              </div>
            </div>
            <button className="audit-export-btn" onClick={generatePdf} disabled={exporting} style={{ marginLeft: "auto" }}>
              {exporting ? t("Exporting...", { defaultValue: "Exporting..." }) : t("Export PDF", { defaultValue: "Export PDF" })}
            </button>
          </div>

          <div className="audit-filters">
            <div className="audit-filter-row">
              <div className="audit-search">
                <svg className="audit-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input type="text" placeholder={t("Search by activity description...", { defaultValue: "Search by activity description..." })} value={searchInput} onChange={(e) => handleSearchChange(e.target.value)} />
                {searchInput && (
                  <button className="audit-search-clear" onClick={() => { setSearchInput(""); setSearch(""); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                )}
              </div>
              <div className="audit-date-range">
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDateFrom(val);
                    if (dateTo && val > dateTo) setDateTo(val);
                  }}
                  title={t("From", { defaultValue: "From" })}
                />
                <span className="audit-date-sep">{t("to", { defaultValue: "to" })}</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDateTo(val);
                    if (dateFrom && val < dateFrom) setDateFrom(val);
                  }}
                  title={t("To", { defaultValue: "To" })}
                />
              </div>
              <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
                <option value="">{t("All Modules", { defaultValue: "All Modules" })}</option>
                <option value="auth">{t("Auth", { defaultValue: "Auth" })}</option>
                <option value="user">{t("User", { defaultValue: "User" })}</option>
                <option value="project">{t("Project", { defaultValue: "Project" })}</option>
                <option value="task">{t("Task", { defaultValue: "Task" })}</option>
                <option value="deliverable">{t("Subtask", { defaultValue: "Subtask" })}</option>
                <option value="team">{t("Team", { defaultValue: "Team" })}</option>
                <option value="event">{t("Event", { defaultValue: "Event" })}</option>
              </select>
              <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
                <option value="">{t("All Actions", { defaultValue: "All Actions" })}</option>
                <option value="created">{t("Created", { defaultValue: "Created" })}</option>
                <option value="updated">{t("Updated", { defaultValue: "Updated" })}</option>
                <option value="deleted">{t("Deleted", { defaultValue: "Deleted" })}</option>
                <option value="approved">{t("Approved", { defaultValue: "Approved" })}</option>
                <option value="rejected">{t("Declined", { defaultValue: "Declined" })}</option>
                <option value="submitted">{t("Submitted", { defaultValue: "Submitted" })}</option>
                <option value="completed">{t("Completed", { defaultValue: "Completed" })}</option>
                <option value="login">{t("Login", { defaultValue: "Login" })}</option>
                <option value="logout">{t("Logout", { defaultValue: "Logout" })}</option>
              </select>
            </div>
            <div className="audit-filter-actions">
              <button className="audit-apply-btn" onClick={applyFilters}>{t("Apply Filters", { defaultValue: "Apply Filters" })}</button>
              <button className="audit-clear-btn" onClick={clearFilters}>{t("Clear", { defaultValue: "Clear" })}</button>
            </div>
          </div>

          <div className="audit-page">
            {loading ? (
              <div className="audit-empty"><div className="audit-spinner"></div><p>{t("Loading your activity...", { defaultValue: "Loading your activity..." })}</p></div>
            ) : error ? (
              <div className="audit-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                <p style={{ color: "var(--color-danger)" }}>{error}</p>
                <button onClick={() => fetchLogs(page)} style={{ marginTop: 8, padding: "6px 16px", border: "1px solid var(--border-color)", borderRadius: 8, background: "var(--bg-card)", cursor: "pointer", fontSize: 13 }}>{t("Try again", { defaultValue: "Try again" })}</button>
              </div>
            ) : logs.length === 0 ? (
              <div className="audit-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border-medium)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                <p>{t("No activity found.", { defaultValue: "No activity found." })}</p>
              </div>
            ) : (
              <>
                <div className="audit-table-wrap">
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>{t("Date & Time", { defaultValue: "Date & Time" })}</th>
                        <th>{t("Module", { defaultValue: "Module" })}</th>
                        <th>{t("Action", { defaultValue: "Action" })}</th>
                        <th>{t("Description", { defaultValue: "Description" })}</th>
                        <th>{t("Status", { defaultValue: "Status" })}</th>
                        <th>{t("IP Address", { defaultValue: "IP Address" })}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id}>
                          <td className="audit-cell-date" title={formatDateTimeInline(log.created_at)}>
                            {timeAgo(log.created_at)}
                          </td>
                          <td><span style={{ textTransform: "capitalize" }}>{t(log.module || "-", { defaultValue: log.module || "-" })}</span></td>
                          <td><span style={{ textTransform: "capitalize" }}>{t((log.action || "").replace(/_/g, " "), { defaultValue: (log.action || "").replace(/_/g, " ") })}</span></td>
                          <td className="audit-cell-desc">{log.description || "-"}</td>
                          <td>
                            <span className={`audit-status-badge audit-status-${log.status || "success"}`}>
                              {t((log.status || "success").charAt(0).toUpperCase() + (log.status || "success").slice(1), { defaultValue: (log.status || "success").charAt(0).toUpperCase() + (log.status || "success").slice(1) })}
                            </span>
                          </td>
                          <td className="audit-cell-ip">{log.ip_address || "-"}</td>
                          <td>
                            <button className="audit-action-btn" onClick={() => setDetailLog(log)} title={t("View details", { defaultValue: "View details" })}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                  <div className="audit-pagination" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginTop: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-secondary)" }}>
                      <span>{t("Rows per page:", { defaultValue: "Rows per page:" })}</span>
                      <select
                        value={perPage}
                        onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                        style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "13px", cursor: "pointer" }}
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={500}>500</option>
                        <option value={1000}>1000</option>
                      </select>
                    </div>
                    {lastPage > 1 && (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <button className="audit-page-btn" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>{t("Previous", { defaultValue: "Previous" })}</button>
                        <span className="audit-page-info">{t("Page {{page}} of {{lastPage}}", { page, lastPage, defaultValue: `Page ${page} of ${lastPage}` })}</span>
                        <button className="audit-page-btn" disabled={page >= lastPage} onClick={() => handlePageChange(page + 1)}>{t("Next", { defaultValue: "Next" })}</button>
                      </div>
                    )}
                  </div>
              </>
            )}
          </div>
        </div>
      </div>

      {detailLog && <AuditLogDetailModal log={detailLog} onClose={() => setDetailLog(null)} />}
    </DashboardLayout>
  );
}

export default MyActivity;
