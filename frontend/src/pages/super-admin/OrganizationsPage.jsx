import { useState, useEffect, useCallback, Fragment } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Building2, Plus, Search, Filter, X, Hash, Eye, SlidersHorizontal, ExternalLink, Mail, User, Pencil, Trash2, Ban } from 'lucide-react';
import ActionPopover from '../../components/ActionPopover';
import '../../components/ActionPopover.css';
import StatusBadge from './components/StatusBadge';
import Pagination from './components/Pagination';
import EmptyState from './components/EmptyState';
import { LoadingState, ErrorState } from './components/LoadingState';
import { api } from './api/superAdminApi';
import CreateOrganizationModal from './CreateOrganizationPage';

const ITEMS_PER_PAGE = 10;
const ORG_APP_URL = import.meta.env.VITE_ORG_APP_URL || '';

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
            <div>
              <table className="w-full" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr style={s.divider}>
                    {[
                      { label: 'ID', width: 'w-[45px]' },
                      { label: 'Organization', width: 'w-[180px]' },
                      { label: 'Org Owner', width: 'w-[170px]' },
                      { label: 'Plan', width: 'w-[80px]' },
                      { label: 'Users', width: 'w-[50px]' },
                      { label: 'Projects', width: 'w-[55px]' },
                      { label: 'Status', width: 'w-[80px]' },
                      { label: 'Action', width: 'w-[65px]' },
                    ].map((col) => (
                      <th key={col.label} className={`text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider ${col.width}`}
                        style={s.textMuted}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((org, idx) => {
                    const isLast = idx === paginated.length - 1;
                    const fullUrl = ORG_APP_URL ? `${ORG_APP_URL.replace(/\/+$/, '')}/org/${org.slug}` : `/org/${org.slug}`;
                    return (
                      <Fragment key={org.id}>
                        <tr
                          style={{
                            borderBottom: isLast ? 'none' : '1px solid var(--border-light)',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                          <td className="px-3 py-4 w-[45px]">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold"
                              style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                              <Hash className="w-3 h-3" />{org.id}
                            </span>
                          </td>
                          <td className="px-3 py-4 w-[180px]">
                            <div className="flex items-center gap-2">
                              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-primary-bg)' }}>
                                <Building2 className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate" style={s.textHeading}>{org.name}</p>
                                <a
                                  href={fullUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs truncate flex items-center gap-1 hover:underline"
                                  style={{ color: 'var(--color-primary)' }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {fullUrl.replace(/^https?:\/\//, '')}
                                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                </a>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-4 w-[170px]">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate flex items-center gap-1.5" style={s.textHeading}>
                                <User className="w-3.5 h-3.5 flex-shrink-0" style={s.textMuted} />
                                {org.admin_name || '—'}
                              </p>
                              {org.admin_email && (
                                <p className="text-xs truncate flex items-center gap-1 mt-0.5" style={s.textMuted}>
                                  <Mail className="w-3 h-3 flex-shrink-0" />
                                  {org.admin_email}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-4 w-[80px]">
                            <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full"
                              style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
                              {planLabel(org)}
                            </span>
                          </td>
                          <td className="px-3 py-4 w-[50px]">
                            <span className="text-sm font-medium" style={s.textHeading}>{org.users_count || 0}</span>
                          </td>
                          <td className="px-3 py-4 w-[55px]">
                            <span className="text-sm font-medium" style={s.textHeading}>{org.projects_count || 0}</span>
                          </td>
                          <td className="px-3 py-4 w-[80px]"><StatusBadge status={displayStatus(org)} size="sm" /></td>
                          <td className="px-3 py-4 w-[65px]">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <button
                                className="action-icon-btn action-view action-trigger-lg"
                                title="View Organization"
                                onClick={() => navigate(`/super-admin/organizations/${org.id}`)}
                              >
                                <Eye size={18} />
                              </button>
                              <ActionPopover
                                trigger={
                                  <button
                                    className="action-icon-btn action-manage action-trigger-lg"
                                    title="More Actions"
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      padding: '4px', borderRadius: '6px',
                                      background: 'var(--bg-hover, #f3f4f6)',
                                      color: 'var(--text-primary, #374151)',
                                      border: '1px solid var(--border-color, #e5e7eb)', cursor: 'pointer',
                                    }}
                                  >
                                    <SlidersHorizontal size={18} />
                                  </button>
                                }
                                onTriggerClick={() => navigate(`/super-admin/organizations/${org.id}`)}
                              >
                                <button
                                  className="action-icon-btn action-edit"
                                  title="Edit Organization"
                                  onClick={() => navigate(`/super-admin/organizations/${org.id}`)}
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  className="action-icon-btn"
                                  title="Suspend Organization"
                                  style={{ background: '#FEF3C7', color: '#D97706' }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F59E0B'; e.currentTarget.style.color = '#fff'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = '#FEF3C7'; e.currentTarget.style.color = '#D97706'; }}
                                >
                                  <Ban size={14} />
                                </button>
                                <button
                                  className="action-icon-btn action-delete"
                                  title="Delete Organization"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </ActionPopover>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
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
