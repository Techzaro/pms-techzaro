import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, FolderKanban, Database, TrendingUp, Activity,
  ArrowUpRight, CheckCircle2, AlertTriangle, XCircle, Clock,
  Puzzle, CreditCard, Shield,
} from 'lucide-react';
import StatCard from './components/StatCard';
import StatusBadge from './components/StatusBadge';
import { LoadingState, ErrorState } from './components/LoadingState';
import { api } from './api/superAdminApi';

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [logs, setLogs] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, orgsRes, logsRes, healthRes] = await Promise.allSettled([
        api.getStats(),
        api.getOrganizations(),
        api.getActivityLogs({ per_page: 5 }),
        api.getHealth(),
      ]);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (orgsRes.status === 'fulfilled') setOrgs(orgsRes.value.data || []);
      if (logsRes.status === 'fulfilled') setLogs(logsRes.value.data?.data || []);
      if (healthRes.status === 'fulfilled') setHealth(healthRes.value.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    if (diffMin < 1) return t('Just now', { defaultValue: 'Just now' });
    if (diffMin < 60) return t('{{count}}m ago', { count: diffMin, defaultValue: `${diffMin}m ago` });
    if (diffHr < 24) return t('{{count}}h ago', { count: diffHr, defaultValue: `${diffHr}h ago` });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return <LoadingState message={t("Loading dashboard...", { defaultValue: "Loading dashboard..." })} />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  const getHealthIcon = (status) => {
    if (status === 'healthy') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (status === 'warning') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    if (status === 'error') return <XCircle className="w-4 h-4 text-red-500" />;
    return <Clock className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />;
  };

  const recentOrgs = orgs.slice(0, 5);

  const s = {
    card: { background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '16px' },
    text: { color: 'var(--text-dark)' },
    textSecondary: { color: 'var(--text-secondary)' },
    textMuted: { color: 'var(--text-muted)' },
    textHeading: { color: 'var(--text-heading)' },
    divider: { borderTop: '1px solid var(--border-light)' },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={s.textHeading}>{t('Dashboard', { defaultValue: 'Dashboard' })}</h1>
        <p className="text-sm mt-1" style={s.textSecondary}>{t('Overview of your SaaS platform', { defaultValue: 'Overview of your SaaS platform' })}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <StatCard title={t("Organizations", { defaultValue: "Organizations" })} value={stats?.total_organizations || 0} icon={Building2} color="blue" onClick={() => navigate('/super-admin/organizations')} />
        <StatCard title={t("Active Orgs", { defaultValue: "Active Orgs" })} value={stats?.active_organizations || 0} icon={CheckCircle2} color="green" onClick={() => navigate('/super-admin/organizations')} />
        <StatCard title={t("Trial Orgs", { defaultValue: "Trial Orgs" })} value={stats?.trial_organizations || 0} icon={Clock} color="purple" onClick={() => navigate('/super-admin/organizations')} />
        <StatCard title={t("Suspended", { defaultValue: "Suspended" })} value={stats?.suspended_organizations || 0} icon={AlertTriangle} color="red" onClick={() => navigate('/super-admin/organizations')} />
        <StatCard title={t("Modules", { defaultValue: "Modules" })} value={stats?.total_modules || 0} icon={Puzzle} color="amber" onClick={() => navigate('/super-admin/modules')} />
        <StatCard title={t("Plans", { defaultValue: "Plans" })} value={stats?.total_plans || 0} icon={CreditCard} color="blue" onClick={() => navigate('/super-admin/plans')} />
        <StatCard title={t("Total Users", { defaultValue: "Total Users" })} value={stats?.total_users || 0} icon={Users} color="purple" onClick={() => navigate('/super-admin/organizations')} />
        <StatCard title={t("Total Projects", { defaultValue: "Total Projects" })} value={stats?.total_projects || 0} icon={FolderKanban} color="cyan" onClick={() => navigate('/super-admin/organizations')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl p-5" style={s.card}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" style={s.textHeading}>{t('Organizations', { defaultValue: 'Organizations' })}</h2>
            <button onClick={() => navigate('/super-admin/organizations')} className="text-sm hover:underline flex items-center gap-1"
              style={{ color: 'var(--color-primary)' }}>
              {t('View all', { defaultValue: 'View all' })} <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-3">
            {recentOrgs.map((org) => (
              <div key={org.id} onClick={() => navigate(`/super-admin/organizations/${org.id}`)}
                className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors"
                style={{ background: 'transparent' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--bg-hover)' }}>
                    <Building2 className="w-4 h-4" style={s.textMuted} />
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={s.textHeading}>{org.name}</p>
                    <p className="text-xs" style={s.textSecondary}>{org.subscription?.plan?.name || org.type || t('Standard', { defaultValue: 'Standard' })} &middot; {t('{{count}} users', { count: org.users_count || 0, defaultValue: `${org.users_count || 0} users` })}</p>
                  </div>
                </div>
                <StatusBadge status={org.status} size="sm" />
              </div>
            ))}
            {recentOrgs.length === 0 && <p className="text-sm text-center py-4" style={s.textMuted}>{t('No organizations yet', { defaultValue: 'No organizations yet' })}</p>}
          </div>
        </div>

        <div className="rounded-xl p-5" style={s.card}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" style={s.textHeading}>{t('Recent Activity', { defaultValue: 'Recent Activity' })}</h2>
            <button onClick={() => navigate('/super-admin/activity')} className="text-sm hover:underline flex items-center gap-1"
              style={{ color: 'var(--color-primary)' }}>
              {t('View all', { defaultValue: 'View all' })} <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors"
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                <div>{getHealthIcon(log.status)}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm" style={s.text}>
                    <span className="font-medium">{log.user}</span>{' '}
                    <span style={s.textSecondary}>{t(log.action, { defaultValue: log.action })}</span>{' '}
                    {log.target && <span className="font-medium">{log.target}</span>}
                  </p>
                </div>
                <p className="text-xs whitespace-nowrap" style={s.textMuted}>{formatTime(log.created_at)}</p>
              </div>
            ))}
            {logs.length === 0 && <p className="text-sm text-center py-4" style={s.textMuted}>{t('No activity yet', { defaultValue: 'No activity yet' })}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
