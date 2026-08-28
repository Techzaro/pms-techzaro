import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Search, Filter, Download, CheckCircle2, AlertTriangle, Info, ChevronLeft, ChevronRight, Clock, Eye, X, Loader2, Building2 } from 'lucide-react';
import StatusBadge from './components/StatusBadge';
import { LoadingState, ErrorState } from './components/LoadingState';
import '../../components/AuditLogDetailModal.css';
import { api } from './api/superAdminApi';

function SuperAdminLogsView() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actions, setActions] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [perPage, setPerPage] = useState(15);

  const fetchActions = useCallback(async () => {
    try {
      const res = await api.getActivityLogActions();
      if (res.data) setActions(res.data);
    } catch {}
  }, []);

  const fetchLogs = useCallback(async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = { page: p, per_page: perPage };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (actionFilter) params.action = actionFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await api.getActivityLogs(params);
      setLogs(res.data?.data || []);
      setLastPage(res.data?.last_page || 1);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [currentPage, search, statusFilter, actionFilter, dateFrom, dateTo, perPage]);

  useEffect(() => { fetchActions(); }, [fetchActions]);
  useEffect(() => { fetchLogs(currentPage); }, [fetchLogs, currentPage]);

  const getStatusIcon = (status) => {
    if (status === 'success') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (status === 'warning') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    return <Info className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />;
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const s = {
    card: { background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '16px' },
    text: { color: 'var(--text-dark)' },
    textSecondary: { color: 'var(--text-secondary)' },
    textMuted: { color: 'var(--text-muted)' },
    textHeading: { color: 'var(--text-heading)' },
    input: { background: 'var(--bg-hover)', color: 'var(--text-dark)', border: '1px solid var(--border-light)' },
    divider: { borderTop: '1px solid var(--border-light)' },
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={s.card}>
        <div className="flex flex-wrap gap-3 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={s.textMuted} />
            <input type="text" placeholder="Search user, action, target..." value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg focus:ring-2 focus:ring-blue-500" style={s.input} />
          </div>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm" style={s.input} title="From date" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm" style={s.input} title="To date" />
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm" style={s.input}>
            <option value="">All Actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm" style={s.input}>
            <option value="">All Status</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setSearch(searchInput); setCurrentPage(1); fetchLogs(1); }}
            className="px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: 'var(--color-primary)', color: '#fff' }}>
            Apply Filters
          </button>
          <button onClick={() => {
            setSearchInput(''); setSearch(''); setDateFrom(''); setDateTo('');
            setActionFilter(''); setStatusFilter(''); setCurrentPage(1);
          }}
            className="px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
            Clear
          </button>
        </div>
      </div>

      <div className="rounded-xl" style={s.card}>
        {loading ? <LoadingState message="Loading logs..." /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={s.divider}>
                    {['User', 'Action', 'Target', 'IP', 'Status', 'Time'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                        style={s.textMuted}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} style={s.divider}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                      <td className="px-4 py-3"><span className="text-sm font-medium" style={s.text}>{log.user}</span></td>
                      <td className="px-4 py-3"><span className="text-sm" style={s.textSecondary}>{log.action}</span></td>
                      <td className="px-4 py-3"><span className="text-sm" style={s.textSecondary}>{log.target || '—'}</span></td>
                      <td className="px-4 py-3"><code className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text)' }}>{log.ip || '—'}</code></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-1.5">{getStatusIcon(log.status)}<StatusBadge status={log.status} size="sm" /></div></td>
                      <td className="px-4 py-3"><span className="text-sm" style={s.textSecondary}>{formatTime(log.created_at)}</span></td>
                    </tr>
                  ))}
                  {logs.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm" style={s.textMuted}>No logs found</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3" style={s.divider}>
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>Rows per page:</span>
                <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="px-2 py-1 rounded-lg text-sm"
                  style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)', color: 'var(--text-dark)' }}>
                  {[10, 15, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              {lastPage > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Page {currentPage} of {lastPage}</span>
                  <button onClick={() => { const p = currentPage - 1; if (p >= 1) setCurrentPage(p); }} disabled={currentPage <= 1}
                    className="p-1.5 rounded-lg disabled:opacity-30 transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => { const p = currentPage + 1; if (p <= lastPage) setCurrentPage(p); }} disabled={currentPage >= lastPage}
                    className="p-1.5 rounded-lg disabled:opacity-30 transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ApplicationLogsView() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [modules, setModules] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [detailLog, setDetailLog] = useState(null);

  const fetchModules = useCallback(async () => {
    try {
      const res = await api.getAllOrgAuditLogModules();
      if (res.data) setModules(res.data);
    } catch {}
  }, []);

  const fetchLogs = useCallback(async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = { page: p, per_page: perPage };
      if (search) params.search = search;
      if (moduleFilter) params.module = moduleFilter;
      if (actionFilter) params.action = actionFilter;
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const res = await api.getAllOrgAuditLogs(params);
      setLogs(res.data || []);
      setCurrentPage(res.meta?.current_page || 1);
      setLastPage(res.meta?.last_page || 1);
      setTotal(res.meta?.total || 0);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [search, moduleFilter, actionFilter, statusFilter, dateFrom, dateTo, perPage]);

  useEffect(() => { fetchModules(); }, [fetchModules]);
  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const s = {
    card: { background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '16px' },
    text: { color: 'var(--text-dark)' },
    textSecondary: { color: 'var(--text-secondary)' },
    textMuted: { color: 'var(--text-muted)' },
    textHeading: { color: 'var(--text-heading)' },
    input: { background: 'var(--bg-hover)', color: 'var(--text-dark)', border: '1px solid var(--border-light)' },
    divider: { borderTop: '1px solid var(--border-light)' },
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={s.card}>
        <div className="flex flex-wrap gap-3 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={s.textMuted} />
            <input type="text" placeholder="Search description, module, action, IP, user..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg focus:ring-2 focus:ring-blue-500" style={s.input} />
          </div>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm" style={s.input} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm" style={s.input} />
          <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm" style={s.input}>
            <option value="">All Modules</option>
            {modules.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm" style={s.input}>
            <option value="">All Actions</option>
            {['create', 'update', 'delete', 'submit', 'login', 'logout', 'bulk_delete', 'resign', 'approve', 'reject'].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm" style={s.input}>
            <option value="">All Status</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setSearch(searchInput); fetchLogs(1); }}
            className="px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: 'var(--color-primary)', color: '#fff' }}>
            Apply Filters
          </button>
          <button onClick={() => {
            setSearchInput(''); setSearch(''); setDateFrom(''); setDateTo('');
            setModuleFilter(''); setActionFilter(''); setStatusFilter('');
          }}
            className="px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
            Clear
          </button>
        </div>
      </div>

      <div className="rounded-xl" style={s.card}>
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-12">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-primary)' }} />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading application logs...</span>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--color-danger)' }} />
            <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
            <button onClick={() => fetchLogs(currentPage)}
              className="mt-3 px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
              Try again
            </button>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No application logs found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={s.divider}>
                    {['Organization', 'Date & Time', 'User', 'Module', 'Action', 'Description', 'Status', 'IP', ''].map((h, i) => (
                      <th key={i} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                        style={s.textMuted}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, idx) => (
                    <tr key={`${log.org_id}-${log.id}-${idx}`} style={s.divider}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                      <td className="px-4 py-3">
                        <button onClick={() => navigate(`/super-admin/organizations/${log.org_id}?tab=org-logs`)}
                          className="flex items-center gap-2 group cursor-pointer text-left"
                          title={`View logs for ${log.org_name}`}>
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors group-hover:opacity-80" style={{ background: 'var(--color-primary-bg)' }}>
                            <Building2 className="w-3.5 h-3.5" style={{ color: 'var(--color-primary)' }} />
                          </div>
                          <div>
                            <p className="text-sm font-medium transition-colors" style={{ color: 'var(--color-primary)' }}>{log.org_name}</p>
                            <p className="text-[10px]" style={s.textMuted}>/org/{log.org_slug}</p>
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium" style={s.text}>{log.user_name || '-'}</span>
                          {log.user_role && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded uppercase"
                              style={{
                                background: log.user_role === 'admin' ? 'var(--color-primary-bg)' : log.user_role === 'manager' ? 'rgba(16,185,129,0.1)' : 'var(--bg-hover)',
                                color: log.user_role === 'admin' ? 'var(--color-primary)' : log.user_role === 'manager' ? 'var(--color-success)' : 'var(--text-muted)',
                              }}>
                              {log.user_role}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{log.module || '-'}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{log.action || '-'}</td>
                      <td className="px-4 py-3 text-sm max-w-[220px] truncate" style={{ color: 'var(--text-secondary)' }}>{log.description || '-'}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 text-xs font-semibold rounded-full"
                          style={{
                            background: log.status === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                            color: log.status === 'success' ? 'var(--color-success)' : 'var(--color-danger)',
                          }}>
                          {(log.status || 'success').charAt(0).toUpperCase() + (log.status || 'success').slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono" style={{ color: 'var(--text-muted)' }}>{log.ip_address || '-'}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => setDetailLog(log)}
                          className="p-1.5 rounded-md transition-colors hover:opacity-80"
                          style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}
                          title="View details">
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3" style={s.divider}>
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>Rows per page:</span>
                <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="px-2 py-1 rounded-lg text-sm"
                  style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)', color: 'var(--text-dark)' }}>
                  {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {total} total logs
                </span>
              </div>
              {lastPage > 1 && (
                <div className="flex items-center gap-2">
                  <button onClick={() => fetchLogs(currentPage - 1)} disabled={currentPage <= 1}
                    className="p-1.5 rounded-lg disabled:opacity-30 transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Page {currentPage} of {lastPage}</span>
                  <button onClick={() => fetchLogs(currentPage + 1)} disabled={currentPage >= lastPage}
                    className="p-1.5 rounded-lg disabled:opacity-30 transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {detailLog && (
        <div className="ald-overlay" onClick={() => setDetailLog(null)}>
          <div className="ald-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ald-header">
              <div className="ald-header-left">
                <div className="ald-header-icon">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="ald-title">Audit Log Details</h2>
                  <p className="ald-subtitle">Detailed information about this activity</p>
                </div>
              </div>
              <button className="ald-close-btn" onClick={() => setDetailLog(null)}>
                <X className="w-[18px] h-[18px]" />
              </button>
            </div>

            <div className="ald-body">
              <div className="ald-section">
                <h3 className="ald-section-title">Basic Information</h3>
                <div className="ald-grid">
                  <div className="ald-field">
                    <span className="ald-label">Date & Time</span>
                    <span className="ald-value">{formatDateTime(detailLog.created_at)}</span>
                  </div>
                  <div className="ald-field">
                    <span className="ald-label">Module</span>
                    <span className="ald-value">{detailLog.module || '-'}</span>
                  </div>
                  <div className="ald-field">
                    <span className="ald-label">Action</span>
                    <span className="ald-value">{detailLog.action || '-'}</span>
                  </div>
                  <div className="ald-field">
                    <span className="ald-label">Status</span>
                    <span className={`ald-status-badge ald-status-${detailLog.status || 'success'}`}>
                      {(detailLog.status || 'success').charAt(0).toUpperCase() + (detailLog.status || 'success').slice(1)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="ald-section">
                <h3 className="ald-section-title">Organization</h3>
                <button onClick={() => { setDetailLog(null); navigate(`/super-admin/organizations/${detailLog.org_id}?tab=org-logs`); }}
                  className="ald-value cursor-pointer hover:underline transition-colors"
                  style={{ color: 'var(--color-primary)' }}>
                  {detailLog.org_name} (/org/{detailLog.org_slug})
                </button>
              </div>

              <div className="ald-section">
                <h3 className="ald-section-title">User Information</h3>
                <div className="ald-grid">
                  <div className="ald-field">
                    <span className="ald-label">Name</span>
                    <span className="ald-value">{detailLog.user_name || '-'}</span>
                  </div>
                  <div className="ald-field">
                    <span className="ald-label">Email</span>
                    <span className="ald-value">{detailLog.user_email || '-'}</span>
                  </div>
                  <div className="ald-field">
                    <span className="ald-label">Role</span>
                    <span className="ald-value">{detailLog.user_role || '-'}</span>
                  </div>
                </div>
              </div>

              <div className="ald-section">
                <h3 className="ald-section-title">Description</h3>
                <p className="ald-description-text">{detailLog.description || '-'}</p>
              </div>

              <div className="ald-section">
                <h3 className="ald-section-title">Request Information</h3>
                <div className="ald-grid">
                  <div className="ald-field">
                    <span className="ald-label">IP Address</span>
                    <span className="ald-value ald-mono">{detailLog.ip_address || '-'}</span>
                  </div>
                  <div className="ald-field">
                    <span className="ald-label">Browser</span>
                    <span className="ald-value">{detailLog.browser || '-'}</span>
                  </div>
                  <div className="ald-field">
                    <span className="ald-label">OS</span>
                    <span className="ald-value">{detailLog.os || '-'}</span>
                  </div>
                  <div className="ald-field">
                    <span className="ald-label">Device</span>
                    <span className="ald-value">{detailLog.device || '-'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="ald-footer">
              <button className="ald-close-btn ald-close-footer-btn" onClick={() => setDetailLog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ActivityLogsPage() {
  const [activeTab, setActiveTab] = useState('admin');

  const s = {
    textHeading: { color: 'var(--text-heading)' },
    textSecondary: { color: 'var(--text-secondary)' },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={s.textHeading}>Activity Logs</h1>
          <p className="text-sm mt-1" style={s.textSecondary}>Platform & organization activity history</p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
          <button onClick={() => setActiveTab('admin')}
            className="px-4 py-2 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5"
            style={{
              background: activeTab === 'admin' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'admin' ? '#fff' : 'var(--text-secondary)',
            }}>
            <ClipboardList className="w-3.5 h-3.5" /> Super Admin Logs
          </button>
          <button onClick={() => setActiveTab('app')}
            className="px-4 py-2 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5"
            style={{
              background: activeTab === 'app' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'app' ? '#fff' : 'var(--text-secondary)',
            }}>
            <Clock className="w-3.5 h-3.5" /> Application Logs
          </button>
        </div>
      </div>

      {activeTab === 'admin' ? <SuperAdminLogsView /> : <ApplicationLogsView />}
    </div>
  );
}
