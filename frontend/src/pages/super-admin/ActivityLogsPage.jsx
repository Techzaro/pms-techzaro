import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, Search, Filter, Download, CheckCircle2, AlertTriangle, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import StatusBadge from './components/StatusBadge';
import { LoadingState, ErrorState } from './components/LoadingState';
import { api } from './api/superAdminApi';

export default function ActivityLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: currentPage, per_page: 15 };
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await api.getActivityLogs(params);
      setLogs(res.data?.data || []);
      setLastPage(res.data?.last_page || 1);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [currentPage, search, statusFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

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
    input: { background: 'var(--bg-hover)', color: 'var(--text-dark)', border: 'none' },
    divider: { borderTop: '1px solid var(--border-light)' },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={s.textHeading}>Activity Logs</h1>
          <p className="text-sm mt-1" style={s.textSecondary}>Platform activity history</p>
        </div>
      </div>

      <div className="rounded-xl" style={s.card}>
        <div className="p-4 flex flex-col sm:flex-row gap-3" style={s.divider}>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={s.textMuted} />
            <input type="text" placeholder="Search logs..." value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg focus:ring-2 focus:ring-blue-500" style={s.input} />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" style={s.textMuted} />
            {['all', 'success', 'warning', 'info'].map((f) => (
              <button key={f} onClick={() => { setStatusFilter(f); setCurrentPage(1); }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors"
                style={{
                  background: statusFilter === f ? 'var(--color-primary-bg)' : 'transparent',
                  color: statusFilter === f ? 'var(--color-primary)' : 'var(--text-muted)',
                }}>{f}</button>
            ))}
          </div>
        </div>

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
              <p className="text-sm" style={s.textSecondary}>Page {currentPage} of {lastPage}</p>
              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  className="p-1.5 rounded-lg disabled:opacity-30 transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setCurrentPage(p => Math.min(lastPage, p + 1))} disabled={currentPage === lastPage}
                  className="p-1.5 rounded-lg disabled:opacity-30 transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
