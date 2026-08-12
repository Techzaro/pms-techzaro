import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Building2, Plus, Search, Filter, ChevronRight, X, Hash } from 'lucide-react';
import StatusBadge from './components/StatusBadge';
import Pagination from './components/Pagination';
import EmptyState from './components/EmptyState';
import { LoadingState, ErrorState } from './components/LoadingState';
import { api } from './api/superAdminApi';
import CreateOrganizationModal from './CreateOrganizationPage';

const ITEMS_PER_PAGE = 10;

const displayStatus = (org) => {
  if (org.status === 'suspended' || org.status === 'archived') return 'suspended';
  return 'active';
};

const planLabel = (org) => {
  const planName = org.subscription?.plan?.name;
  if (planName) return planName;
  if (org.status === 'trial') return 'Trial';
  return org.type === 'owner' ? 'Owner' : '—';
};

export default function OrganizationsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [organizations, setOrganizations] = useState([]);
  const [search, setSearch] = useState(location.state?.search || new URLSearchParams(location.search).get('search') || '');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(location.state?.flash || null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (location.state?.flash) {
      window.history.replaceState({}, '');
      const timer = setTimeout(() => setFlash(null), 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await api.getOrganizations(params);
      setOrganizations(res.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);

  const totalPages = Math.ceil(organizations.length / ITEMS_PER_PAGE);
  const paginated = organizations.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (loading && organizations.length === 0) return <LoadingState message="Loading organizations..." />;
  if (error && organizations.length === 0) return <ErrorState message={error} onRetry={fetchOrgs} />;

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
      {flash && (
        <div className="flex items-center justify-between p-4 rounded-lg" style={{ background: 'var(--color-success-bg)', border: '1px solid var(--color-success)' }}>
          <p className="text-sm" style={{ color: 'var(--color-success)' }}>{flash}</p>
          <button onClick={() => setFlash(null)} style={{ color: 'var(--color-success)' }}><X className="w-4 h-4" /></button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={s.textHeading}>Organizations</h1>
          <p className="text-sm mt-1" style={s.textSecondary}>{organizations.length} total organizations</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> New Organization
        </button>
      </div>

      <div style={s.card}>
        <div className="p-4 flex flex-col sm:flex-row gap-3" style={s.divider}>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={s.textMuted} />
            <input
              type="text" placeholder="Search by name, slug, or ID..." value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg focus:ring-2 focus:ring-blue-500"
              style={s.input}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" style={s.textMuted} />
            {['all', 'active', 'suspended'].map((status) => (
              <button key={status} onClick={() => { setStatusFilter(status); setCurrentPage(1); }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors"
                style={{
                  background: statusFilter === status ? 'var(--color-primary-bg)' : 'transparent',
                  color: statusFilter === status ? 'var(--color-primary)' : 'var(--text-muted)',
                }}>
                {status}
              </button>
            ))}
          </div>
        </div>

        {paginated.length === 0 ? (
          <EmptyState icon={Building2} title="No organizations found" description="No organizations match your current filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={s.divider}>
                    {['ID', 'Organization', 'Plan', 'Users', 'Projects', 'Status'].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                        style={s.textMuted}>
                        {h}
                      </th>
                    ))}
                    <th className="text-right px-5 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((org, idx) => {
                    const isLast = idx === paginated.length - 1;
                    return (
                      <tr key={org.id} onClick={() => navigate(`/super-admin/organizations/${org.id}`)}
                        className="cursor-pointer transition-colors"
                        style={{
                          borderBottom: isLast ? 'none' : '1px solid var(--border-light)',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold"
                            style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                            <Hash className="w-3 h-3" />{org.id}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-primary-bg)' }}>
                              <Building2 className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate" style={s.textHeading}>{org.name}</p>
                              <p className="text-xs truncate" style={s.textMuted}>/org/{org.slug}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full"
                            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
                            {planLabel(org)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-sm font-medium" style={s.textHeading}>{org.users_count || 0}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-sm font-medium" style={s.textHeading}>{org.projects_count || 0}</span>
                        </td>
                        <td className="px-5 py-4"><StatusBadge status={displayStatus(org)} size="sm" /></td>
                        <td className="px-5 py-4 text-right"><ChevronRight className="w-4 h-4" style={s.textMuted} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
          </>
        )}
      </div>

      {showCreateModal && (
        <CreateOrganizationModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={(msg) => {
            setShowCreateModal(false);
            setFlash(msg);
            fetchOrgs();
          }}
        />
      )}
    </div>
  );
}
