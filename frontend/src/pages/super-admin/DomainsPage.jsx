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
      <div>
        <h1 className="text-2xl font-bold" style={s.textHeading}>Domains</h1>
        <p className="text-sm mt-1" style={s.textSecondary}>{domains.length} registered domains</p>
      </div>

      <div className="rounded-xl" style={s.card}>
        <div className="p-4" style={s.divider}>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={s.textMuted} />
            <input type="text" placeholder="Search domains..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg focus:ring-2 focus:ring-blue-500" style={s.input} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={s.divider}>
                {['Organization', 'Domain', 'SSL', 'Verified', 'Primary'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={s.textMuted}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((domain) => (
                <tr key={domain.id} style={s.divider}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium" style={s.textHeading}>{domain.organization?.name || 'Unknown'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-sm px-2 py-0.5 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text)' }}>{domain.domain}</code>
                  </td>
                  <td className="px-4 py-3">
                    {domain.is_verified ? (
                      <span className="flex items-center gap-1 text-sm text-emerald-600"><Shield className="w-4 h-4" /> Active</span>
                    ) : (
                      <span className="flex items-center gap-1 text-sm" style={s.textMuted}><ShieldOff className="w-4 h-4" /> N/A</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={domain.is_verified ? 'active' : 'pending'} size="sm" />
                  </td>
                  <td className="px-4 py-3">
                    {domain.is_primary ? <span className="text-xs" style={{ color: 'var(--color-primary)' }}>Primary</span> : <span className="text-xs" style={s.textMuted}>&mdash;</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={s.textMuted}>No domains found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
