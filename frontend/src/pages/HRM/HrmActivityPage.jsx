import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import DashboardLayout from "../../components/layout/hrm/DashboardLayout";
import Breadcrumb from "../../components/Breadcrumb";
import { authToken, getUser, rolePath } from "../../utils/auth";
import API_URL from "../../config/api";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import "../AuditLogs.css";
import "./HrmActivityPage.css";

/* ── Comprehensive HRM Activity Detail Modal ── */
function HrmActivityDetailModal({ log, onClose }) {
  if (!log) return null;

  const isFailed = log.status === 'failed' || log.status === 'error';
  const meta = log.metadata || {};

  return (
    <div className="hrm-modal-overlay" onClick={onClose}>
      <div className="hrm-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="hrm-modal-header">
          <div>
            <h2 className="hrm-modal-header-title">Activity Audit Record</h2>
            <p className="hrm-modal-header-sub">ID: {log.id} • {log.formatted_time || log.created_at}</p>
          </div>
          <button className="hrm-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="hrm-modal-body">
          {/* Status & Event Card */}
          <div className="hrm-modal-card">
            <div className="hrm-modal-card-title">Event Overview</div>
            <div className="hrm-modal-grid">
              <div className="hrm-modal-field">
                <span className="hrm-modal-label">Action Performed</span>
                <span className="hrm-modal-val" style={{ textTransform: 'capitalize' }}>{log.action}</span>
              </div>
              <div className="hrm-modal-field">
                <span className="hrm-modal-label">Target Module</span>
                <span className="hrm-modal-val" style={{ textTransform: 'capitalize' }}>{(log.related_module || log.activity_type || '').replace('_', ' ')}</span>
              </div>
              <div className="hrm-modal-field">
                <span className="hrm-modal-label">Execution Status</span>
                <span className="hrm-modal-val" style={{ color: isFailed ? '#dc2626' : '#059669' }}>
                  {isFailed ? 'Failed' : 'Success'}
                </span>
              </div>
              <div className="hrm-modal-field">
                <span className="hrm-modal-label">IP Address</span>
                <span className="hrm-modal-val" style={{ fontFamily: 'monospace' }}>{log.ip_address || '127.0.0.1'}</span>
              </div>
            </div>
          </div>

          {/* User Details */}
          <div className="hrm-modal-card">
            <div className="hrm-modal-card-title">Performer Details</div>
            <div className="hrm-modal-grid">
              <div className="hrm-modal-field">
                <span className="hrm-modal-label">User Name</span>
                <span className="hrm-modal-val">{log.user_name || 'System'}</span>
              </div>
              <div className="hrm-modal-field">
                <span className="hrm-modal-label">Professional Email</span>
                <span className="hrm-modal-val">{log.user_email || 'N/A'}</span>
              </div>
              <div className="hrm-modal-field">
                <span className="hrm-modal-label">Designation</span>
                <span className="hrm-modal-val">{log.user_designation || 'Staff'}</span>
              </div>
              <div className="hrm-modal-field">
                <span className="hrm-modal-label">Department</span>
                <span className="hrm-modal-val">{log.user_department || 'General'}</span>
              </div>
            </div>
          </div>

          {/* Activity Description */}
          <div className="hrm-modal-card">
            <div className="hrm-modal-card-title">Activity Description</div>
            <p style={{ margin: 0, fontSize: '13px', color: '#1e293b', lineHeight: 1.5, fontWeight: 500 }}>
              {log.description || 'No detailed description provided.'}
            </p>
          </div>

          {/* Payload / Metadata Details */}
          {Object.keys(meta).length > 0 && (
            <div className="hrm-modal-card">
              <div className="hrm-modal-card-title">Payload & Audit Attributes</div>
              <div className="hrm-modal-grid">
                {meta.request_number && (
                  <div className="hrm-modal-field">
                    <span className="hrm-modal-label">Request Number</span>
                    <span className="hrm-modal-val">{meta.request_number}</span>
                  </div>
                )}
                {meta.title && (
                  <div className="hrm-modal-field">
                    <span className="hrm-modal-label">Application Title</span>
                    <span className="hrm-modal-val">{meta.title}</span>
                  </div>
                )}
                {meta.status && (
                  <div className="hrm-modal-field">
                    <span className="hrm-modal-label">Application Status</span>
                    <span className="hrm-modal-val">{meta.status}</span>
                  </div>
                )}
                {meta.remarks && (
                  <div className="hrm-modal-field" style={{ gridColumn: '1 / -1' }}>
                    <span className="hrm-modal-label">Approver Remarks / Comments</span>
                    <span className="hrm-modal-val">{meta.remarks}</span>
                  </div>
                )}
                {Object.entries(meta).map(([key, val]) => {
                  if (['request_number', 'title', 'status', 'remarks'].includes(key)) return null;
                  return (
                    <div key={key} className="hrm-modal-field">
                      <span className="hrm-modal-label">{key.replace(/_/g, ' ')}</span>
                      <span className="hrm-modal-val">
                        {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HrmActivityPage() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isMyMode = searchParams.get("mode") === "my";

  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({
    total_activities: 0,
    applications_logged: 0,
    attendance_events: 0,
    system_changes: 0,
  });
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
  const isElevated = ["admin", "owner", "manager", "hr_manager", "superadmin", "super_admin"].includes(
    (user?.role || "").toLowerCase()
  );

  const fetchLogs = useCallback(async (p = 1) => {
    const token = authToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: p, per_page: perPage });
      if (isMyMode) params.set("mode", "my");
      if (search) params.set("search", search);
      if (dateFrom) params.set("start_date", dateFrom);
      if (dateTo) params.set("end_date", dateTo);
      if (moduleFilter) params.set("module", moduleFilter);
      if (actionFilter) params.set("action", actionFilter);

      const endpoint = isMyMode ? `${API_URL}/hrm/my-activity?${params}` : `${API_URL}/hrm/activities?${params}`;
      const res = await fetch(endpoint, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      if (!res.ok) throw new Error("Failed to fetch HRM activities");
      const json = await res.json();
      setLogs(json.data || []);
      if (json.stats) setStats(json.stats);
      setPage(json.meta?.current_page || 1);
      setLastPage(json.meta?.last_page || 1);
      setTotal(json.meta?.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isMyMode, search, dateFrom, dateTo, moduleFilter, actionFilter, perPage]);

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
    setSearchInput(""); 
    setSearch(""); 
    setDateFrom(""); 
    setDateTo("");
    setModuleFilter(""); 
    setActionFilter("");
  };

  const handlePageChange = (p) => { if (p >= 1 && p <= lastPage) fetchLogs(p); };

  const generatePdf = async () => {
    const token = authToken();
    if (!token) return;
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: "landscape" });
      const PW = doc.internal.pageSize.getWidth();
      const PH = doc.internal.pageSize.getHeight();
      const M = 14;
      const genDate = new Date().toLocaleDateString();
      const genTime = new Date().toLocaleTimeString();

      // Header banner
      doc.setFillColor(15, 23, 42); doc.rect(0, 0, PW, 14, "F");
      doc.setFillColor(79, 70, 229); doc.roundedRect(M, 2.5, 8, 8, 1.5, 1.5, "F");
      doc.setFontSize(5.5); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
      doc.text("HRM", M + 4, 8, { align: "center" });
      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
      doc.text("Techxaro Enterprise HRM Portal", M + 12, 6.5);
      doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.setTextColor(148, 163, 184);
      doc.text("Activity Audit Logs", M + 12, 10.5);
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
      doc.text(isMyMode ? "MY ACTIVITY REPORT" : "HRM ACTIVITY REPORT", PW / 2, 8, { align: "center" });

      const headers = ["Date & Time", "User", "Module", "Action", "Description", "Status", "IP Address"];
      const rows = logs.map((l) => [
        l.formatted_time || l.created_at || "-",
        l.user_name || "-",
        l.related_module || l.activity_type || "-",
        l.action || "-",
        l.description || "-",
        (l.status || "success").toUpperCase(),
        l.ip_address || "127.0.0.1",
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
            const color = status === "failed" ? [220, 38, 38] : [5, 150, 105];
            data.cell.styles.textColor = color;
            data.cell.styles.fontStyle = "bold";
          }
        },
      });

      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        const fY = PH - 10;
        doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
        doc.line(M, fY, PW - M, fY);
        doc.setFontSize(5); doc.setFont("helvetica", "bold"); doc.setTextColor(107, 114, 128);
        doc.text("Techxaro Enterprise HRM", M, fY + 5);
        doc.setFontSize(4.5); doc.setFont("helvetica", "normal"); doc.setTextColor(156, 163, 175);
        doc.text(`Generated: ${genDate} ${genTime}`, M + 40, fY + 5);
        doc.text(`Page ${i} of ${totalPages}`, PW - M, fY + 5, { align: "right" });
      }

      doc.save(`hrm-${isMyMode ? 'my-activity' : 'activity-log'}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error("PDF export failed", e);
    } finally {
      setExporting(false);
    }
  };

  const formatModuleBadge = (moduleStr, typeStr) => {
    const m = (moduleStr || typeStr || "").toLowerCase();
    if (m.includes("application")) return { label: "Applications", cls: "audit-tag-blue" };
    if (m.includes("attendance") || m.includes("clock")) return { label: "Attendance", cls: "audit-tag-green" };
    if (m.includes("workflow")) return { label: "Workflow", cls: "audit-tag-amber" };
    if (m.includes("recruitment") || m.includes("offer")) return { label: "Recruitment", cls: "audit-tag-purple" };
    if (m.includes("auth") || m.includes("login")) return { label: "Auth", cls: "audit-tag-cyan" };
    return { label: "HRM System", cls: "audit-tag-gray" };
  };

  return (
    <main className="att-page" id="hrm-activity-page">
      <Breadcrumb items={[{ label: "Enterprise HRM", path: rolePath("hrm") }, { label: isMyMode ? "My Activity" : "Activity Logs" }]} />

      <div className="audit-layout">
        <div className="audit-layout-row">
          <div className="audit-header">
            <div className="audit-header-left">
              <div className="audit-header-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <h1 className="audit-title">{isMyMode ? "My Activity Logs" : "HRM Activity Logs"}</h1>
                <p className="audit-subtitle">
                  {isMyMode 
                    ? "Track your personal actions, login history, and application submissions across the system" 
                    : "Audit trail of all HRM activity, application approvals, logins, and workflow changes across the organization"}
                </p>
              </div>
            </div>
            <button className="audit-export-btn" onClick={generatePdf} disabled={exporting}>
              {exporting ? "Exporting..." : "Export PDF"}
            </button>
          </div>

          {/* Filters Bar matching PMS Activity page */}
          <div className="audit-filters">
            <div className="audit-filter-row">
              <div className="audit-search">
                <svg className="audit-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input 
                  type="text" 
                  placeholder="Search by description, IP address, user..." 
                  value={searchInput} 
                  onChange={(e) => handleSearchChange(e.target.value)} 
                />
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
                  title="From"
                />
                <span className="audit-date-sep">to</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDateTo(val);
                    if (dateFrom && val < dateFrom) setDateFrom(val);
                  }}
                  title="To"
                />
              </div>
              <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
                <option value="">All Modules</option>
                <option value="auth">Auth & Login</option>
                <option value="application">Applications</option>
                <option value="attendance">Attendance & Shifts</option>
                <option value="workflow">Workflow Settings</option>
                <option value="recruitment">Recruitment & Offers</option>
              </select>
              <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
                <option value="">All Actions</option>
                <option value="Submitted">Submitted</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
                <option value="Created">Created</option>
                <option value="Updated">Updated</option>
                <option value="Login">Login</option>
                <option value="Logout">Logout</option>
              </select>
            </div>
            <div className="audit-filter-actions">
              <button className="audit-apply-btn" onClick={applyFilters}>Apply Filters</button>
              <button className="audit-clear-btn" onClick={clearFilters}>Clear</button>
            </div>
          </div>

          {/* Activity Data Table */}
          <div className="audit-page">
            {loading ? (
              <div className="audit-empty"><div className="audit-spinner"></div><p>Loading activity logs...</p></div>
            ) : error ? (
              <div className="audit-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                <p style={{ color: "var(--color-danger)" }}>{error}</p>
                <button onClick={() => fetchLogs(page)} style={{ marginTop: 8, padding: "6px 16px", border: "1px solid var(--border-color)", borderRadius: 8, background: "var(--bg-card)", cursor: "pointer", fontSize: 13 }}>Try again</button>
              </div>
            ) : logs.length === 0 ? (
              <div className="audit-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border-medium)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                <p>No activity records found.</p>
              </div>
            ) : (
              <>
                <div className="audit-table-wrap">
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>Date & Time</th>
                        <th>User</th>
                        <th>Module</th>
                        <th>Action</th>
                        <th>Description</th>
                        <th>Status</th>
                        <th>IP Address</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => {
                        const badge = formatModuleBadge(log.related_module, log.activity_type);
                        const isFailed = log.status === 'failed' || log.status === 'error';
                        return (
                          <tr key={log.id}>
                            <td style={{ whiteSpace: "nowrap" }}>
                              <div><strong>{log.formatted_time || log.created_at}</strong></div>
                              <small style={{ color: "#64748b", fontSize: "11px" }}>{log.time_ago}</small>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div>
                                  <strong>{log.user_name}</strong>
                                  <div style={{ fontSize: "11px", color: "#64748b" }}>
                                    {log.user_designation || 'Staff'} • {log.user_department || 'General'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className={`audit-tag ${badge.cls}`}>{badge.label}</span>
                            </td>
                            <td>
                              <strong style={{ color: "var(--text-heading)", textTransform: "capitalize" }}>
                                {log.action}
                              </strong>
                            </td>
                            <td style={{ maxWidth: "280px", wordBreak: "break-word" }}>
                              {log.description}
                            </td>
                            <td>
                              <span style={{ 
                                fontWeight: 700, 
                                fontSize: "12px", 
                                color: isFailed ? "#dc2626" : "#059669",
                                textTransform: "capitalize"
                              }}>
                                {isFailed ? "Failed" : "Success"}
                              </span>
                            </td>
                            <td style={{ fontFamily: "monospace", fontSize: "12px", color: "#475569" }}>
                              {log.ip_address || "127.0.0.1"}
                            </td>
                            <td>
                              <button 
                                className="audit-view-btn" 
                                onClick={() => setDetailLog(log)}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div className="audit-pagination">
                  <div className="audit-pagination-info">
                    Showing {logs.length > 0 ? (page - 1) * perPage + 1 : 0} to {Math.min(page * perPage, total)} of {total} entries
                  </div>
                  <div className="audit-pagination-controls">
                    <button 
                      className="audit-page-btn" 
                      disabled={page <= 1} 
                      onClick={() => handlePageChange(page - 1)}
                    >
                      Previous
                    </button>
                    <span className="audit-page-current">Page {page} of {lastPage}</span>
                    <button 
                      className="audit-page-btn" 
                      disabled={page >= lastPage} 
                      onClick={() => handlePageChange(page + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {detailLog && (
        <HrmActivityDetailModal log={detailLog} onClose={() => setDetailLog(null)} />
      )}
    </main>
  );
}
