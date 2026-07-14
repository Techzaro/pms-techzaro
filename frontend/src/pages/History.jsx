import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import AuditLogDetailModal from "../components/AuditLogDetailModal";
import { authToken, getUser, rolePath } from "../utils/auth";
import { formatDateTimeInline } from "../utils/formatDateTime";
import { timeAgo } from "../utils/formatDateTime";
import { getActivityDestination } from "../utils/navigation";
import API_URL from "../config/api";
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
    }).catch(() => {});
  }, []);
  return (
    <div className="audit-company-header">
      <div className="audit-company-header-inner">
        {logo && <img src={logo} alt="Company Logo" className="audit-company-logo" />}
        <div className="audit-company-info">
          <h2 className="audit-company-name">{companyName}</h2>
          <p className="audit-company-report">My Activity Report</p>
        </div>
      </div>
    </div>
  );
}

function MyActivity() {
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
  const [detailLog, setDetailLog] = useState(null);
  const searchTimerRef = useRef(null);
  const navigate = useNavigate();
  const user = getUser();

  const fetchLogs = useCallback(async (p = 1) => {
    const token = authToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: p, per_page: 25, sort_field: "created_at", sort_order: "desc" });
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
  }, [search, dateFrom, dateTo, moduleFilter, actionFilter]);

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

  const navigateToEntity = (log) => {
    const dest = getActivityDestination({
      related_module: log.module,
      action: log.action,
      related_id: log.entity_id,
    });
    if (dest) navigate(dest);
  };

  return (
    <DashboardLayout hideRightSidebar={true}>
      <Breadcrumb items={[{ label: "My Activity" }]} />
      <CompanyHeader />
      <br />
      <div className="audit-layout">
        <div className="audit-layout-row">
          <div className="audit-header">
            <div className="audit-header-left">
              <div className="audit-header-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <h1 className="audit-title">My Activity</h1>
                <p className="audit-subtitle">Track your personal actions across the system</p>
              </div>
            </div>
          </div>

          <div className="audit-filters">
            <div className="audit-filter-row">
              <div className="audit-search">
                <svg className="audit-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input type="text" placeholder="Search your activity..." value={searchInput} onChange={(e) => handleSearchChange(e.target.value)} />
                {searchInput && (
                  <button className="audit-search-clear" onClick={() => { setSearchInput(""); setSearch(""); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                )}
              </div>
              <div className="audit-date-range">
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From" />
                <span className="audit-date-sep">to</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To" />
              </div>
              <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
                <option value="">All Modules</option>
                <option value="auth">Auth</option>
                <option value="user">User</option>
                <option value="project">Project</option>
                <option value="task">Task</option>
                <option value="deliverable">Deliverable</option>
                <option value="team">Team</option>
                <option value="event">Event</option>
              </select>
              <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
                <option value="">All Actions</option>
                <option value="created">Created</option>
                <option value="updated">Updated</option>
                <option value="deleted">Deleted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="submitted">Submitted</option>
                <option value="completed">Completed</option>
                <option value="login">Login</option>
                <option value="logout">Logout</option>
              </select>
            </div>
            <div className="audit-filter-actions">
              <button className="audit-apply-btn" onClick={applyFilters}>Apply Filters</button>
              <button className="audit-clear-btn" onClick={clearFilters}>Clear</button>
            </div>
          </div>

          <div className="audit-page">
            {loading ? (
              <div className="audit-empty"><div className="audit-spinner"></div><p>Loading your activity...</p></div>
            ) : error ? (
              <div className="audit-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                <p style={{ color: "#ef4444" }}>{error}</p>
                <button onClick={() => fetchLogs(page)} style={{ marginTop: 8, padding: "6px 16px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13 }}>Try again</button>
              </div>
            ) : logs.length === 0 ? (
              <div className="audit-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                <p>No activity found.</p>
              </div>
            ) : (
              <>
                <div className="audit-table-wrap">
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>Date & Time</th>
                        <th>Module</th>
                        <th>Action</th>
                        <th>Description</th>
                        <th>Status</th>
                        <th>IP Address</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id}>
                          <td className="audit-cell-date" title={formatDateTimeInline(log.created_at)}>
                            {timeAgo(log.created_at)}
                          </td>
                          <td><span style={{ textTransform: "capitalize" }}>{log.module || "-"}</span></td>
                          <td><span style={{ textTransform: "capitalize" }}>{(log.action || "").replace(/_/g, " ")}</span></td>
                          <td className="audit-cell-desc">{log.description || "-"}</td>
                          <td>
                            <span className={`audit-status-badge audit-status-${log.status || "success"}`}>
                              {(log.status || "success").charAt(0).toUpperCase() + (log.status || "success").slice(1)}
                            </span>
                          </td>
                          <td className="audit-cell-ip">{log.ip_address || "-"}</td>
                          <td>
                            <div style={{ display: "flex", gap: 4 }}>
                              {log.module !== "auth" && log.entity_id && (
                                <button className="audit-action-btn" onClick={() => navigateToEntity(log)} title="Go to related item">
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                                </button>
                              )}
                              <button className="audit-action-btn" onClick={() => setDetailLog(log)} title="View details">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {lastPage > 1 && (
                  <div className="audit-pagination">
                    <button className="audit-page-btn" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>Previous</button>
                    <span className="audit-page-info">Page {page} of {lastPage}</span>
                    <button className="audit-page-btn" disabled={page >= lastPage} onClick={() => handlePageChange(page + 1)}>Next</button>
                  </div>
                )}
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
