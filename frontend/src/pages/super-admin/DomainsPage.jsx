import { useState, useEffect } from 'react';
import { Globe, Search, Shield, ShieldOff, ExternalLink } from 'lucide-react';
import StatusBadge from './components/StatusBadge';
import { LoadingState, ErrorState } from './components/LoadingState';
import { api } from './api/superAdminApi';

export default function DomainsPage() {
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.getDomains().then(res => setDomains(res.data || [])).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const filtered = domains.filter((d) => {
    const name = d.organization?.name || '';
    return name.toLowerCase().includes(search.toLowerCase()) || d.domain.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Domains</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{domains.length} registered domains</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search domains..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 border-0 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder-gray-400" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Organization</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Domain</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">SSL</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Verified</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Primary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {filtered.map((domain) => (
                <tr key={domain.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{domain.organization?.name || 'Unknown'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">{domain.domain}</code>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {domain.is_verified ? (
                      <span className="flex items-center gap-1 text-sm text-emerald-600"><Shield className="w-4 h-4" /> Active</span>
                    ) : (
                      <span className="flex items-center gap-1 text-sm text-gray-400"><ShieldOff className="w-4 h-4" /> N/A</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={domain.is_verified ? 'active' : 'pending'} size="sm" />
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {domain.is_primary ? <span className="text-xs text-blue-600 dark:text-blue-400">Primary</span> : <span className="text-xs text-gray-400">&mdash;</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">No domains found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
