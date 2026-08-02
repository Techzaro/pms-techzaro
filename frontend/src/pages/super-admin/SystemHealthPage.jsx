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
    try {
      const res = await api.getHealth();
      setHealth(res.data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={fetchHealth} />;

  const getStatusIcon = (status) => {
    if (status === 'healthy') return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    if (status === 'warning') return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    if (status === 'error') return <XCircle className="w-5 h-5 text-red-500" />;
    return <Clock className="w-5 h-5 text-gray-400" />;
  };

  const overall = health?.overall || 'unknown';
  const entries = Object.entries(health || {}).filter(([k]) => k !== 'overall');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Health</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Real-time platform health status</p>
        </div>
        <button onClick={fetchHealth} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className={`p-5 rounded-xl border-2 ${
        overall === 'healthy' ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800' :
        overall === 'warning' ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800' :
        'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800'
      }`}>
        <div className="flex items-center gap-3">
          {getStatusIcon(overall)}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">System Status: {overall}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Last checked: {new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {entries.map(([key, check]) => {
          const Icon = iconMap[key] || Server;
          return (
            <div key={key} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{labelMap[key] || key}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{check?.status || 'unknown'}</p>
                  </div>
                </div>
                {getStatusIcon(check?.status)}
              </div>
              <div className="space-y-2 mt-4">
                {Object.entries(check || {}).filter(([k]) => !['status'].includes(k)).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {entries.length === 0 && <p className="text-sm text-gray-400 col-span-3 text-center py-8">No health data available</p>}
      </div>
    </div>
  );
}
