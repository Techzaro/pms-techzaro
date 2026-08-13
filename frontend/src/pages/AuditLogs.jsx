import { useState, useEffect, useCallback, useRef } from "react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { authToken, getUser } from "../utils/auth";
import { formatDateTimeInline } from "../utils/formatDateTime";
import API_URL from "../config/api";
import AuditLogDetailModal from "../components/AuditLogDetailModal";
import AuditLogExportModal from "../components/AuditLogExportModal";
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
}

function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [perPage, setPerPage] = useState(25);

  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");

  const [modules, setModules] = useState([]);
  const [actions, setActions] = useState([]);
  const [users, setUsers] = useState([]);

  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");

  const [detailLog, setDetailLog] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);

  const searchTimerRef = useRef(null);

  const fetchFilters = useCallback(async () => {
    const token = authToken();
    if (!token) return;
    try {
      const [modRes, actRes, usrRes] = await Promise.all([
        fetch(`${API_URL}/audit-logs/modules`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, skipLoader: true }),
        fetch(`${API_URL}/audit-logs/actions`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, skipLoader: true }),
        fetch(`${API_URL}/audit-logs/users`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, skipLoader: true }),
      ]);
      if (modRes.ok) { const d = await modRes.json(); setModules(d.data || []); }
      if (actRes.ok) { const d = await actRes.json(); setActions(d.data || []); }
      if (usrRes.ok) { const d = await usrRes.json(); setUsers(d.data || []); }
    } catch {}
  }, []);

  const fetchLogs = useCallback(async (p = 1) => {
    const token = authToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: p, per_page: perPage, sort_field: sortBy, sort_order: sortDir });
      if (search) params.set("search", search);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (moduleFilter) params.set("module", moduleFilter);
      if (actionFilter) params.set("action", actionFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (userFilter) params.set("user_id", userFilter);

      const res = await fetch(`${API_URL}/audit-logs?${params}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      if (!res.ok) throw new Error("Failed to fetch audit logs");
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
  }, [search, dateFrom, dateTo, moduleFilter, actionFilter, statusFilter, userFilter, sortBy, sortDir, perPage]);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  const handleSearchChange = (val) => {
    setSearchInput(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearch(val);
    }, 400);
  };

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  };

  const sortArrow = (col) => {
    if (sortBy !== col) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  const applyFilters = () => {
    setSearch(searchInput);
    fetchLogs(1);
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setModuleFilter("");
    setActionFilter("");
    setStatusFilter("");
    setUserFilter("");
  };

  const handlePageChange = (p) => {
    if (p < 1 || p > lastPage) return;
    fetchLogs(p);
  };

  const currentUser = getUser();

  return (
    <DashboardLayout hideRightSidebar={true}>
      <Breadcrumb items={[{ label: "Application Logs" }]} />
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
                <h1 className="audit-title">Application Logs</h1>
                <p className="audit-subtitle">Monitor all system activities</p>
              </div>
            </div>
               <button className="audit-export-btn" onClick={() => setExportOpen(true)} title="Export">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export
              </button>


          </div>

          <div className="audit-filters">
            <div className="audit-filter-row">
              <div className="audit-search">
                <svg className="audit-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search description, module, action, IP..."
                  value={searchInput}
                  onChange={(e) => handleSearchChange(e.target.value)}
                />
                {searchInput && (
                  <button className="audit-search-clear" onClick={() => { setSearchInput(""); setSearch(""); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
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
                  title="From date"
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
                  title="To date"
                />
              </div>

              <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
                <option value="">All Modules</option>
                {modules.map((m) => (
                  <option key={m.value || m} value={m.value || m}>{m.label || m}</option>
                ))}
              </select>

              <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
                <option value="">All Actions</option>
                {actions.map((a) => (
                  <option key={a.value || a} value={a.value || a}>{a.label || a}</option>
                ))}
              </select>

              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All Status</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>

              <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
                <option value="">All Users</option>
                {users.map((u) => (
                  <option key={u.id || u.value} value={u.id || u.value}>{u.name || u.label || u}</option>
                ))}
              </select>
            </div>

            <div className="audit-filter-actions">
              <button className="audit-apply-btn" onClick={applyFilters}>Apply Filters</button>
              <button className="audit-clear-btn" onClick={clearFilters}>Clear</button>
            </div>
          </div>

          <div className="audit-page">
            {loading ? (
              <div className="audit-empty">
                <div className="audit-spinner"></div>
                <p>Loading audit logs...</p>
              </div>
            ) : error ? (
              <div className="audit-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p style={{ color: "var(--color-danger)" }}>{error}</p>
                <button
                  onClick={() => fetchLogs(page)}
                  style={{ marginTop: 8, padding: "6px 16px", border: "1px solid var(--border-color)", borderRadius: 8, background: "var(--bg-card)", cursor: "pointer", fontSize: 13 }}
                >
                  Try again
                </button>
              </div>
            ) : logs.length === 0 ? (
              <div className="audit-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border-medium)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <p>No audit logs found.</p>
              </div>
            ) : (
              <>
                <div className="audit-table-wrap">
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th className="audit-th-sort" onClick={() => handleSort("created_at")}>
                          Date & Time{sortArrow("created_at")}
                        </th>
                        <th>User</th>
                        <th className="audit-th-sort" onClick={() => handleSort("module")}>
                          Module{sortArrow("module")}
                        </th>
                        <th className="audit-th-sort" onClick={() => handleSort("action")}>
                          Action{sortArrow("action")}
                        </th>
                        <th>Description</th>
                        <th className="audit-th-sort" onClick={() => handleSort("status")}>
                          Status{sortArrow("status")}
                        </th>
                        <th>IP Address</th>
                        <th>Browser</th>
                        <th>Device</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id}>
                          <td className="audit-cell-date">{formatDateTimeInline(log.created_at)}</td>
                          <td>
                            <div className="audit-user-cell">
                              <span className="audit-user-name">{log.user?.name || "-"}</span>
                              {log.user?.role && (
                                <span className={`audit-role-badge audit-role-${log.user.role}`}>
                                  {log.user.role === "team_lead" || log.user.role === "teamlead" ? "Team Lead" : log.user.role.charAt(0).toUpperCase() + log.user.role.slice(1)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>{log.module || "-"}</td>
                          <td>{log.action || "-"}</td>
                          <td className="audit-cell-desc">{log.description || "-"}</td>
                          <td>
                            <span className={`audit-status-badge audit-status-${log.status || "success"}`}>
                              {(log.status || "success").charAt(0).toUpperCase() + (log.status || "success").slice(1)}
                            </span>
                          </td>
                          <td className="audit-cell-ip">{log.ip_address || "-"}</td>
                          <td>{log.browser || "-"}</td>
                          <td>{log.device || log.os || "-"}</td>
                          <td>
                            <button
                              className="audit-action-btn"
                              onClick={() => setDetailLog(log)}
                              title="View details"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                  <div className="audit-pagination" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginTop: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-secondary)" }}>
                      <span>Rows per page:</span>
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
                        <button className="audit-page-btn" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>
                          Previous
                        </button>
                        <span className="audit-page-info">Page {page} of {lastPage}</span>
                        <button className="audit-page-btn" disabled={page >= lastPage} onClick={() => handlePageChange(page + 1)}>
                          Next
                        </button>
                      </div>
                    )}
                  </div>
              </>
            )}
          </div>
        </div>
      </div>

      {detailLog && (
        <AuditLogDetailModal log={detailLog} onClose={() => setDetailLog(null)} />
      )}

      {exportOpen && (
        <AuditLogExportModal onClose={() => setExportOpen(false)} />
      )}
    </DashboardLayout>
  );
}

export default AuditLogs;
