import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Search, X, Hash } from 'lucide-react';
import { LoadingState, ErrorState } from './components/LoadingState';
import { api } from './api/superAdminApi';

const orgStatusConfig = {
  active: { label: 'Active', color: '#16a34a', bg: '#f0fdf4' },
  trial: { label: 'Trial', color: '#2563eb', bg: '#eff6ff' },
  suspended: { label: 'Suspended', color: '#dc2626', bg: '#fef2f2' },
  cancelled: { label: 'Cancelled', color: '#dc2626', bg: '#fef2f2' },
  deleted: { label: 'Deleted', color: '#6b7280', bg: '#f9fafb' },
  pending: { label: 'Pending', color: '#d97706', bg: '#fffbeb' },
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function DomainsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');

  useEffect(() => {
    api.getDomains().then(res => setDomains(res.data || [])).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const plans = useMemo(() => {
    const map = new Map();
    domains.forEach(d => {
      const p = d.organization?.subscription?.plan;
      if (p) map.set(p.id, p.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [domains]);

  const filtered = useMemo(() => {
    let result = domains;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(d => {
        const name = d.organization?.name || '';
        const id = String(d.organization?.id || '');
        return name.toLowerCase().includes(q) || d.domain.toLowerCase().includes(q) || id === q;
      });
    }

    if (statusFilter) {
      result = result.filter(d => (d.organization?.status || 'pending') === statusFilter);
    }

    if (planFilter) {
      result = result.filter(d => {
        const planId = d.organization?.subscription?.plan?.id;
        return String(planId) === planFilter;
      });
    }

    result = [...result].sort((a, b) => {
      const dateA = a.organization?.created_at ? new Date(a.organization.created_at).getTime() : 0;
      const dateB = b.organization?.created_at ? new Date(b.organization.created_at).getTime() : 0;
      return dateB - dateA;
    });

    return result;
  }, [domains, search, statusFilter, planFilter]);

  const hasFilters = statusFilter || planFilter;

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const s = {
    card: { background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '16px' },
    textHeading: { color: 'var(--text-heading)' },
    textSecondary: { color: 'var(--text-secondary)' },
    textMuted: { color: 'var(--text-muted)' },
    input: { background: 'var(--bg-hover)', color: 'var(--text-dark)', border: 'none' },
    divider: { borderTop: '1px solid var(--border-light)' },
    filterSelect: { background: 'var(--bg-hover)', color: 'var(--text-dark)', border: '1px solid var(--border-light)', borderRadius: '8px' },
    filterBtn: { padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', border: 'none' },
    idBadge: { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, background: 'var(--color-primary-bg)', color: 'var(--color-primary)', fontFamily: 'monospace' },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={s.textHeading}>{t('Domains', { defaultValue: 'Domains' })}</h1>
        <p className="text-sm mt-1" style={s.textSecondary}>{t('{{count}} registered domains', { count: domains.length, defaultValue: `${domains.length} registered domains` })}</p>
      </div>

      <div className="rounded-xl" style={s.card}>
        <div className="p-4 flex flex-wrap items-center gap-3" style={s.divider}>
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={s.textMuted} />
            <input type="text" placeholder={t("Search by name, domain, or ID...", { defaultValue: "Search by name, domain, or ID..." })} value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg focus:ring-2 focus:ring-blue-500" style={s.input} />
          </div>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg focus:ring-2 focus:ring-blue-500" style={s.filterSelect}>
            <option value="">{t('All Status', { defaultValue: 'All Status' })}</option>
            {Object.entries(orgStatusConfig).map(([key, cfg]) => (
              <option key={key} value={key}>{t(cfg.label, { defaultValue: cfg.label })}</option>
            ))}
          </select>

          <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg focus:ring-2 focus:ring-blue-500" style={s.filterSelect}>
            <option value="">{t('All Plans', { defaultValue: 'All Plans' })}</option>
            {plans.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {hasFilters && (
            <button onClick={() => { setStatusFilter(''); setPlanFilter(''); }}
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors"
              style={{ ...s.filterBtn, color: '#dc2626', background: 'rgba(220,38,38,0.08)' }}>
              <X className="w-3.5 h-3.5" /> {t('Clear', { defaultValue: 'Clear' })}
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={s.divider}>
                {[
                  { key: 'ID', defaultLabel: 'ID' },
                  { key: 'Organization', defaultLabel: 'Organization' },
                  { key: 'Domain', defaultLabel: 'Domain' },
                  { key: 'Plan', defaultLabel: 'Plan' },
                  { key: 'Status', defaultLabel: 'Status' },
                  { key: 'Users', defaultLabel: 'Users' },
                  { key: 'Created', defaultLabel: 'Created' },
                ].map((h) => (
                  <th key={h.key} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={s.textMuted}>{t(h.key, { defaultValue: h.defaultLabel })}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((domain) => {
                const org = domain.organization;
                const status = org?.status || 'pending';
                const cfg = orgStatusConfig[status] || orgStatusConfig.pending;
                const plan = org?.subscription?.plan;
                return (
                  <tr key={domain.id} style={{ ...s.divider, cursor: 'pointer' }}
                    onClick={() => org?.id && navigate(`/super-admin/organizations/${org.id}`)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <td className="px-4 py-3">
                      <span style={s.idBadge}><Hash className="w-3 h-3" />{org?.id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium" style={{ color: 'var(--color-primary)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>{org?.name || t('Unknown', { defaultValue: 'Unknown' })}</span>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-sm px-2 py-0.5 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text)' }}>{domain.domain}</code>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm" style={s.textSecondary}>{plan?.name || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ color: cfg.color, background: cfg.bg }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                        {t(cfg.label, { defaultValue: cfg.label })}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm" style={s.textSecondary}>{org?.users_count ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm" style={s.textSecondary}>{formatDate(org?.created_at)}</span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={s.textMuted}>{t('No domains found', { defaultValue: 'No domains found' })}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
