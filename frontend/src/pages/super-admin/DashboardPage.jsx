import { useState, useEffect, useCallback } from 'react';
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

  if (loading) return <LoadingState message="Loading dashboard..." />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  const getHealthIcon = (status) => {
    if (status === 'healthy') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (status === 'warning') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    if (status === 'error') return <XCircle className="w-4 h-4 text-red-500" />;
    return <Clock className="w-4 h-4 text-gray-400" />;
  };

  const recentOrgs = orgs.slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Overview of your SaaS platform</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <StatCard title="Organizations" value={stats?.total_organizations || 0} icon={Building2} color="blue" />
        <StatCard title="Active Orgs" value={stats?.active_organizations || 0} icon={CheckCircle2} color="green" />
        <StatCard title="Total Users" value={stats?.total_users || 0} icon={Users} color="purple" />
        <StatCard title="Total Projects" value={stats?.total_projects || 0} icon={FolderKanban} color="cyan" />
        <StatCard title="Modules" value={stats?.total_modules || 0} icon={Puzzle} color="amber" />
        <StatCard title="Plans" value={stats?.total_plans || 0} icon={CreditCard} color="blue" />
        <StatCard title="Trial Orgs" value={stats?.trial_organizations || 0} icon={Clock} color="purple" />
        <StatCard title="Suspended" value={stats?.suspended_organizations || 0} icon={AlertTriangle} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Organizations</h2>
            <button onClick={() => navigate('/super-admin/organizations')} className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              View all <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-3">
            {recentOrgs.map((org) => (
              <div key={org.id} onClick={() => navigate(`/super-admin/organizations/${org.id}`)} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{org.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{org.subscription?.plan?.name || org.type || 'Standard'} &middot; {org.users_count || 0} users</p>
                  </div>
                </div>
                <StatusBadge status={org.status} size="sm" />
              </div>
            ))}
            {recentOrgs.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No organizations yet</p>}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Activity</h2>
            <button onClick={() => navigate('/super-admin/activity')} className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              View all <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className="mt-0.5">{getHealthIcon(log.status)}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 dark:text-white">
                    <span className="font-medium">{log.user}</span>{' '}
                    <span className="text-gray-500 dark:text-gray-400">{log.action}</span>{' '}
                    {log.target && <span className="font-medium">{log.target}</span>}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{log.created_at}</p>
                </div>
              </div>
            ))}
            {logs.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No activity yet</p>}
          </div>
        </div>
      </div>

      {health && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">System Health</h2>
            <button onClick={() => navigate('/super-admin/health')} className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              Full report <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(health).filter(([k]) => !['overall'].includes(k)).slice(0, 8).map(([key, check]) => (
              <div key={key} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                {getHealthIcon(check?.status)}
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{check?.status || 'unknown'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
