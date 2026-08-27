import { useState, useEffect, useCallback, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { Building2, Plus, Search, Filter, X, Hash, Eye, SlidersHorizontal, ExternalLink, Mail, User, Pencil, Trash2, Ban, CheckCircle, Loader2, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import ActionPopover from '../../components/ActionPopover';
import '../../components/ActionPopover.css';
import ConfirmModal from '../../components/ConfirmModal';
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

export default function OrganizationsPage() {
  const { t } = useTranslation();
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ action: '', orgId: null, orgName: '' });
  const [actionLoading, setActionLoading] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editOrg, setEditOrg] = useState(null);
  const [editPlans, setEditPlans] = useState([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const planLabel = (org) => {
    const planName = org.subscription?.plan?.name;
    if (planName) return planName;
    if (org.status === 'trial') return t('Trial', { defaultValue: 'Trial' });
    return org.type === 'owner' ? t('Owner', { defaultValue: 'Owner' }) : '—';
  };

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

  const openConfirm = (action, org) => {
    if (action === 'suspend') {
      setConfirmConfig({
        action: 'suspend', orgId: org.id, orgName: org.name,
        title: t('Suspend Organization', { defaultValue: 'Suspend Organization' }),
        message: t('Are you sure you want to suspend "{{name}}"? Users will no longer be able to access this organization.', { name: org.name, defaultValue: `Are you sure you want to suspend "${org.name}"? Users will no longer be able to access this organization.` }),
        confirmText: t('Suspend', { defaultValue: 'Suspend' }), danger: true,
      });
    } else if (action === 'activate') {
      setConfirmConfig({
        action: 'activate', orgId: org.id, orgName: org.name,
        title: t('Activate Organization', { defaultValue: 'Activate Organization' }),
        message: t('Are you sure you want to activate "{{name}}"? This will restore access for all users.', { name: org.name, defaultValue: `Are you sure you want to activate "${org.name}"? This will restore access for all users.` }),
        confirmText: t('Activate', { defaultValue: 'Activate' }), danger: false,
      });
    } else if (action === 'delete') {
      setConfirmConfig({
        action: 'delete', orgId: org.id, orgName: org.name,
        title: t('Delete Organization', { defaultValue: 'Delete Organization' }),
        message: t('Are you sure you want to permanently delete "{{name}}"? This will delete ALL data including users, projects, tasks, and files. This action cannot be undone.', { name: org.name, defaultValue: `Are you sure you want to permanently delete "${org.name}"? This will delete ALL data including users, projects, tasks, and files. This action cannot be undone.` }),
        confirmText: t('Delete', { defaultValue: 'Delete' }), danger: true,
      });
    }
    setConfirmOpen(true);
  };

  const handleAction = async () => {
    setActionLoading(confirmConfig.action);
    try {
      if (confirmConfig.action === 'suspend') await api.suspendOrganization(confirmConfig.orgId);
      else if (confirmConfig.action === 'activate') await api.activateOrganization(confirmConfig.orgId);
      else if (confirmConfig.action === 'delete') {
        await api.deleteOrganization(confirmConfig.orgId);
        setConfirmOpen(false);
        fetchOrgs();
        return;
      }
      setConfirmOpen(false);
      fetchOrgs();
    } catch (e) {
      alert(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const openEditModal = async (org) => {
    setEditLoading(true);
    try {
      const [orgRes, plansRes] = await Promise.all([
        api.getOrganization(org.id),
        api.getPlans(),
      ]);
      setEditOrg(orgRes.data);
      setEditPlans(plansRes.data || []);
      setEditOpen(true);
    } catch (e) {
      alert(t('Failed to load organization details.', { defaultValue: 'Failed to load organization details.' }));
    } finally {
      setEditLoading(false);
    }
  };

  const handleEditSave = async (data) => {
    setEditSaving(true);
    try {
      await api.updateOrganization(editOrg.id, data);
      setEditOpen(false);
      setEditOrg(null);
      fetchOrgs();
    } catch (e) {
      alert(e.message);
    } finally {
      setEditSaving(false);
    }
  };

  const totalPages = Math.ceil(organizations.length / ITEMS_PER_PAGE);
  const paginated = organizations.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (loading && organizations.length === 0) return <LoadingState message={t("Loading organizations...", { defaultValue: "Loading organizations..." })} />;
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
          <h1 className="text-2xl font-bold" style={s.textHeading}>{t('Organizations', { defaultValue: 'Organizations' })}</h1>
          <p className="text-sm mt-1" style={s.textSecondary}>{t('{{count}} total organizations', { count: organizations.length, defaultValue: `${organizations.length} total organizations` })}</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> {t('New Organization', { defaultValue: 'New Organization' })}
        </button>
      </div>

      <div style={s.card}>
        <div className="p-4 flex flex-col sm:flex-row gap-3" style={s.divider}>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={s.textMuted} />
            <input
              type="text" placeholder={t("Search by name, slug, or ID...", { defaultValue: "Search by name, slug, or ID..." })} value={search}
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
                {t(status, { defaultValue: status })}
              </button>
            ))}
          </div>
        </div>

        {paginated.length === 0 ? (
          <EmptyState icon={Building2} title={t("No organizations found", { defaultValue: "No organizations found" })} description={t("No organizations match your current filters.", { defaultValue: "No organizations match your current filters." })} />
        ) : (
          <>
            <div>
              <table className="w-full" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr style={s.divider}>
                    {[
                      { label: t('ID', { defaultValue: 'ID' }), width: 'w-[45px]' },
                      { label: t('Organization', { defaultValue: 'Organization' }), width: 'w-[180px]' },
                      { label: t('Org Owner', { defaultValue: 'Org Owner' }), width: 'w-[170px]' },
                      { label: t('Plan', { defaultValue: 'Plan' }), width: 'w-[80px]' },
                      { label: t('Users', { defaultValue: 'Users' }), width: 'w-[50px]' },
                      { label: t('Projects', { defaultValue: 'Projects' }), width: 'w-[55px]' },
                      { label: t('Status', { defaultValue: 'Status' }), width: 'w-[80px]' },
                      { label: t('Action', { defaultValue: 'Action' }), width: 'w-[65px]' },
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
                                title={t("View Organization", { defaultValue: "View Organization" })}
                                onClick={() => navigate(`/super-admin/organizations/${org.id}`)}
                              >
                                <Eye size={18} />
                              </button>
                              <ActionPopover
                                trigger={
                                  <button
                                    className="action-icon-btn action-manage action-trigger-lg"
                                    title={t("More Actions", { defaultValue: "More Actions" })}
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
                                  title={t("Edit Organization", { defaultValue: "Edit Organization" })}
                                  onClick={() => openEditModal(org)}
                                >
                                  <Pencil size={14} />
                                </button>
                                {displayStatus(org) === 'suspended' ? (
                                  <button
                                    className="action-icon-btn"
                                    title={t("Activate Organization", { defaultValue: "Activate Organization" })}
                                    style={{ background: '#D1FAE5', color: '#059669' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = '#10B981'; e.currentTarget.style.color = '#fff'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = '#D1FAE5'; e.currentTarget.style.color = '#059669'; }}
                                    onClick={() => openConfirm('activate', org)}
                                  >
                                    <CheckCircle size={14} />
                                  </button>
                                ) : (
                                  <button
                                    className="action-icon-btn"
                                    title={t("Suspend Organization", { defaultValue: "Suspend Organization" })}
                                    style={{ background: '#FEF3C7', color: '#D97706' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = '#F59E0B'; e.currentTarget.style.color = '#fff'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = '#FEF3C7'; e.currentTarget.style.color = '#D97706'; }}
                                    onClick={() => openConfirm('suspend', org)}
                                  >
                                    <Ban size={14} />
                                  </button>
                                )}
                                <button
                                  className="action-icon-btn action-delete"
                                  title={t("Delete Organization", { defaultValue: "Delete Organization" })}
                                  onClick={() => openConfirm('delete', org)}
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

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => { setConfirmOpen(false); setConfirmConfig({ action: '', orgId: null, orgName: '' }); }}
        onConfirm={handleAction}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : confirmConfig.confirmText}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        danger={confirmConfig.danger}
      />

      {editOpen && editOrg && (
        <EditOrganizationModal
          key={editOrg.id}
          org={editOrg}
          plans={editPlans}
          saving={editSaving}
          onSave={handleEditSave}
          onClose={() => { setEditOpen(false); setEditOrg(null); }}
        />
      )}
    </div>
  );
}

function EditOrganizationModal({ org, plans, saving, onSave, onClose }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [selectedPlanId, setSelectedPlanId] = useState(org?.subscription?.plan?.id || null);
  const [billingPeriod, setBillingPeriod] = useState(org?.subscription?.billing_period || 'monthly');
  const [form, setForm] = useState({
    name: org?.name || '', admin_name: org?.admin_name || '',
    admin_email: org?.admin_email || '', admin_phone: org?.admin_phone || '',
  });

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', handleEsc); };
  }, [onClose]);

  const handleNext = () => { if (!form.name || !form.admin_name) return; setStep(2); };
  const handleBack = () => setStep(1);

  const handleSubmit = () => {
    if (!selectedPlanId) return;
    onSave({
      name: form.name, admin_name: form.admin_name,
      admin_phone: form.admin_phone || null,
      plan_id: selectedPlanId, billing_period: billingPeriod,
    });
  };

  const selectedPlan = plans.find(p => p.id === selectedPlanId);

  const s = {
    card: { background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '16px' },
    textHeading: { color: 'var(--text-heading)' },
    textSecondary: { color: 'var(--text-secondary)' },
    textMuted: { color: 'var(--text-muted)' },
    input: { background: 'var(--bg-hover)', color: 'var(--text-dark)', border: 'none' },
    divider: { borderTop: '1px solid var(--border-light)' },
    infoBox: { background: 'var(--color-primary-bg)', border: '1px solid var(--color-primary)' },
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 9999 }}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }} onClick={onClose}></div>
      <div className="relative rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col" style={{ ...s.card, zIndex: 10000 }}>
        <div className="flex items-center justify-between p-6 pb-4" style={s.divider}>
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2" style={s.textHeading}>
              <Building2 className="w-5 h-5" style={{ color: 'var(--color-primary)' }} /> {t('Edit Organization', { defaultValue: 'Edit Organization' })}
            </h2>
            <p className="text-sm mt-1" style={s.textSecondary}>
              {t('Step {{step}} of 2 — {{label}}', { step, label: step === 1 ? t('Organization Details', { defaultValue: 'Organization Details' }) : t('Select Plan', { defaultValue: 'Select Plan' }), defaultValue: `Step ${step} of 2 — ${step === 1 ? 'Organization Details' : 'Select Plan'}` })}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-6 pt-4">
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: step === 1 ? 'var(--color-primary)' : 'var(--color-success)' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: step === 1 ? 'var(--color-primary)' : 'var(--color-success)' }}>
              {step > 1 ? <Check className="w-4 h-4" /> : '1'}
            </div>
            {t('Details', { defaultValue: 'Details' })}
          </div>
          <div className="flex-1 h-0.5 rounded" style={{ background: step === 2 ? 'var(--color-success)' : 'var(--bg-hover)' }}></div>
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: step === 2 ? 'var(--color-primary)' : 'var(--text-muted)' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: step === 2 ? 'var(--color-primary)' : 'var(--bg-hover)', color: step === 2 ? '#fff' : 'var(--text-muted)' }}>2</div>
            {t('Plan', { defaultValue: 'Plan' })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={s.textSecondary}>{t('Organization Name', { defaultValue: 'Organization Name' })} *</label>
                <input type="text" value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  style={s.input} placeholder={t("Acme Corporation", { defaultValue: "Acme Corporation" })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={s.textSecondary}>{t('Admin Name', { defaultValue: 'Admin Name' })} *</label>
                <input type="text" value={form.admin_name}
                  onChange={(e) => setForm(prev => ({ ...prev, admin_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  style={s.input} placeholder={t("John Smith", { defaultValue: "John Smith" })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={s.textSecondary}>{t('Email', { defaultValue: 'Email' })}</label>
                <input type="email" value={form.admin_email} readOnly
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ ...s.input, opacity: 0.6, cursor: 'not-allowed' }} placeholder={t("Read-only", { defaultValue: "Read-only" })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={s.textSecondary}>{t('Phone Number', { defaultValue: 'Phone Number' })}</label>
                <input type="tel" value={form.admin_phone}
                  onChange={(e) => setForm(prev => ({ ...prev, admin_phone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  style={s.input} placeholder="+1 234 567 890" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-4 mb-2">
                {['monthly', 'yearly'].map((p) => (
                  <button key={p} onClick={() => setBillingPeriod(p)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      background: billingPeriod === p ? 'var(--color-primary)' : 'var(--bg-hover)',
                      color: billingPeriod === p ? '#fff' : 'var(--text-muted)',
                    }}>
                    {p === 'monthly' ? t('Monthly', { defaultValue: 'Monthly' }) : t('Yearly', { defaultValue: 'Yearly' })}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {plans.filter(p => p.is_active).map((plan) => {
                  const isSelected = selectedPlanId === plan.id;
                  const price = billingPeriod === 'monthly' ? plan.price_monthly : plan.price_yearly;
                  const users = plan.max_users;
                  const projects = plan.max_projects;
                  const storage = plan.max_storage_gb;
                  return (
                    <div key={plan.id} onClick={() => setSelectedPlanId(plan.id)}
                      className="relative cursor-pointer rounded-xl border-2 p-4 transition-all hover:shadow-md flex items-center gap-4"
                      style={{
                        borderColor: isSelected ? 'var(--color-primary)' : 'var(--border-light)',
                        background: isSelected ? 'var(--color-primary-bg)' : 'var(--bg-card)',
                        boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
                      }}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-semibold" style={s.textHeading}>{plan.name}</h4>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--color-primary)' }}>
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                          {plan.is_default && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full" style={s.infoBox}>{t('Default', { defaultValue: 'Default' })}</span>
                          )}
                        </div>
                        <p className="text-sm mt-0.5" style={s.textSecondary}>
                          ${price}/{billingPeriod === 'monthly' ? t('mo', { defaultValue: 'mo' }) : t('yr', { defaultValue: 'yr' })}
                          <span className="mx-1.5" style={{ color: 'var(--border-light)' }}>·</span>
                          {users === 9999 ? t('Unlimited', { defaultValue: 'Unlimited' }) : users} {t('users', { defaultValue: 'users' })}
                          <span className="mx-1.5" style={{ color: 'var(--border-light)' }}>·</span>
                          {projects === 9999 ? t('Unlimited', { defaultValue: 'Unlimited' }) : projects} {t('projects', { defaultValue: 'projects' })}
                        </p>
                      </div>
                      <div className="text-right text-xs" style={s.textMuted}>{storage === 9999 ? t('Unlimited', { defaultValue: 'Unlimited' }) : storage} {t('GB storage', { defaultValue: 'GB storage' })}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 p-6 pt-4" style={s.divider}>
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{t('Cancel', { defaultValue: 'Cancel' })}</button>
          {step === 1 ? (
            <button onClick={handleNext} disabled={!form.name || !form.admin_name}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed">
              {t('Next', { defaultValue: 'Next' })} <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex-1 flex gap-3">
              <button onClick={handleBack}
                className="py-2.5 px-4 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                <ArrowLeft className="w-4 h-4" /> {t('Back', { defaultValue: 'Back' })}
              </button>
              <button onClick={handleSubmit} disabled={saving || !selectedPlanId}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('Saving...', { defaultValue: 'Saving...' })}</> : t('Save Changes', { defaultValue: 'Save Changes' })}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
