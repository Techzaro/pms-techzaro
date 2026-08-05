import { useState, useEffect, useCallback } from 'react';
import { HeartPulse, CheckCircle2, AlertTriangle, XCircle, Clock, RefreshCw, Server, Database, HardDrive, Mail, Zap, Wifi, Cpu } from 'lucide-react';
import { LoadingState, ErrorState } from './components/LoadingState';
import { api } from './api/superAdminApi';

const iconMap = {
  masterDatabase: Database, tenantDatabases: Database, queue: Zap, mail: Mail,
  cache: Cpu, redis: Wifi, storage: HardDrive, scheduler: Clock,
};
const labelMap = {
  masterDatabase: 'Master Database', tenantDatabases: 'Tenant Databases', queue: 'Queue System',
  mail: 'Mail Service', cache: 'Cache Layer', redis: 'Redis', storage: 'File Storage', scheduler: 'Task Scheduler',
};

export default function SystemHealthPage() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try { const res = await api.getHealth(); setHealth(res.data); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={fetchHealth} />;

  const getStatusIcon = (status) => {
    if (status === 'healthy') return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    if (status === 'warning') return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    if (status === 'error') return <XCircle className="w-5 h-5 text-red-500" />;
    return <Clock className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />;
  };

  const overall = health?.overall || 'unknown';
  const entries = Object.entries(health || {}).filter(([k]) => k !== 'overall');

  const s = {
    card: { background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '16px' },
    text: { color: 'var(--text-dark)' },
    textSecondary: { color: 'var(--text-secondary)' },
    textMuted: { color: 'var(--text-muted)' },
    textHeading: { color: 'var(--text-heading)' },
    divider: { borderTop: '1px solid var(--border-light)' },
  };

  const overallStyle = {
    healthy: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)' },
    warning: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)' },
    error: { bg: 'rgba(220,38,38,0.1)', border: 'rgba(220,38,38,0.3)' },
  };
  const oc = overallStyle[overall] || overallStyle.error;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={s.textHeading}>System Health</h1>
          <p className="text-sm mt-1" style={s.textSecondary}>Real-time platform health status</p>
        </div>
        <button onClick={fetchHealth} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="p-5 rounded-xl border-2" style={{ background: oc.bg, borderColor: oc.border }}>
        <div className="flex items-center gap-3">
          {getStatusIcon(overall)}
          <div>
            <h2 className="text-lg font-semibold capitalize" style={s.textHeading}>System Status: {overall}</h2>
            <p className="text-sm" style={s.textSecondary}>Last checked: {new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {entries.map(([key, check]) => {
          const Icon = iconMap[key] || Server;
          return (
            <div key={key} className="rounded-xl p-5 hover:shadow-md transition-shadow" style={s.card}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--bg-hover)' }}>
                    <Icon className="w-5 h-5" style={s.textMuted} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold" style={s.textHeading}>{labelMap[key] || key}</h3>
                    <p className="text-xs capitalize" style={s.textSecondary}>{check?.status || 'unknown'}</p>
                  </div>
                </div>
                {getStatusIcon(check?.status)}
              </div>
              <div className="space-y-2 mt-4">
                {Object.entries(check || {}).filter(([k]) => !['status'].includes(k)).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <span className="capitalize" style={s.textSecondary}>{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="font-medium" style={s.text}>{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {entries.length === 0 && <p className="text-sm col-span-3 text-center py-8" style={s.textMuted}>No health data available</p>}
      </div>
    </div>
  );
}
