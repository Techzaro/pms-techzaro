import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Building2, Users, FolderKanban, Database, Globe, Calendar,
  Shield, Loader2, Mail, User, Phone, MailCheck, CreditCard, HardDrive, Check, Pencil, X, ArrowRight, Clock, RotateCcw, Sliders,
  HardDrive as StorageIcon, FileText, Image, Archive, FolderOpen, AlertTriangle, Trash2, Info, DollarSign, Receipt, TrendingUp,
  CheckCircle, XCircle, Eye, EyeOff, Download, Bell, Settings, AlertCircle, Lock,
} from 'lucide-react';
import StatusBadge from './components/StatusBadge';
import { LoadingState, ErrorState } from './components/LoadingState';
import { api } from './api/superAdminApi';
import ConfirmModal from '../../components/ConfirmModal';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import TrialConfigurationModal from './components/TrialConfigurationModal';
import PlanCustomizeModal from './components/PlanCustomizeModal';
import SuperAdminChangePasswordModal from './components/SuperAdminChangePasswordModal';
import { countries, getCountryByCode, formatPhoneByCountry } from './data/countries';
import CountrySelect from '../../components/CountrySelect';

const flagMap = { PK:'🇵🇰', US:'🇺🇸', GB:'🇬🇧', IN:'🇮🇳', AE:'🇦🇪', SA:'🇸🇦', CA:'🇨🇦', AU:'🇦🇺', DE:'🇩🇪', FR:'🇫🇷', TR:'🇹🇷', CN:'🇨🇳', JP:'🇯🇵', BR:'🇧🇷', NG:'🇳🇬', ZA:'🇿🇦', EG:'🇪🇬', KE:'🇰🇪', PH:'🇵🇭', MY:'🇲🇾', BD:'🇧🇩', NP:'🇳🇵', LK:'🇱🇰', SG:'🇸🇬', HK:'🇭🇰', NZ:'🇳🇿', IT:'🇮🇹', ES:'🇪🇸', NL:'🇳🇱', SE:'🇸🇪', CH:'🇨🇭', PL:'🇵🇱', RU:'🇷🇺', KR:'🇰🇷', TH:'🇹🇭', ID:'🇮🇩', VN:'🇻🇳', MX:'🇲🇽', AR:'🇦🇷', CO:'🇨🇴', GH:'🇬🇭', TZ:'🇹🇿', UG:'🇺🇬', ET:'🇪🇹', JO:'🇯🇴', KW:'🇰🇼', BH:'🇧🇭', QA:'🇶🇦', OM:'🇴🇲', LB:'🇱🇧', IQ:'🇮🇶', MA:'🇲🇦', DZ:'🇩🇿', TN:'🇹🇳' };
const flagEmoji = (code) => flagMap[code] || '🌍';

function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount || 0);
}

const moduleNameOverrides = { deliverables: 'Subtask' };
function moduleDisplayName(name, slug) {
  return moduleNameOverrides[slug] || name;
}

const formatPhone = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 4) return digits;
  return digits.slice(0, 4) + "-" + digits.slice(4);
};

const stripDashes = (value) => value.replace(/-/g, "");

export default function OrganizationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [org, setOrg] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [emailPolicyLoading, setEmailPolicyLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ action: null, title: '', message: '', confirmText: '', danger: true });
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [now, setNow] = useState(new Date());
  const [activeView, setActiveView] = useState(searchParams.get('tab') || 'details');
  const [storageData, setStorageData] = useState(null);
  const [storageSummary, setStorageSummary] = useState(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageTab, setStorageTab] = useState('overview');
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);
  const [storageNotifications, setStorageNotifications] = useState([]);
  const [storagePinned, setStoragePinned] = useState([]);
  const [storageFileDeleteConfirm, setStorageFileDeleteConfirm] = useState({ open: false, id: null });
  const [storagePreferences, setStoragePreferences] = useState(null);
  const [prefLoading, setPrefLoading] = useState(false);
  const [prefSaving, setPrefSaving] = useState(false);
  const [testingS3, setTestingS3] = useState(false);
  const [s3TestResult, setS3TestResult] = useState(null);
  const [showAccessKey, setShowAccessKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [driverMode, setDriverMode] = useState('local');
  const [billingData, setBillingData] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [viewInvoiceModal, setViewInvoiceModal] = useState(null);
  const [histData, setHistData] = useState(null);
  const [histSummary, setHistSummary] = useState(null);
  const [histPlanUsage, setHistPlanUsage] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchOrg = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgRes, plansRes] = await Promise.all([
        api.getOrganization(id),
        api.getPlans(),
      ]);
      setOrg(orgRes.data);
      setPlans(plansRes.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchOrg(); }, [fetchOrg]);

  const fetchStorageData = useCallback(async () => {
    setStorageLoading(true);
    try {
      const [storageRes, summaryRes] = await Promise.all([
        api.getOrgStorage(id),
        api.getOrgStorageSummary(id),
      ]);
      if (storageRes.success) setStorageData(storageRes.storage);
      if (summaryRes.success) setStorageSummary(summaryRes.summary);
    } catch (e) {
      console.error('Failed to load storage data', e);
    } finally {
      setStorageLoading(false);
    }
  }, [id]);

  const fetchStorageNotifications = useCallback(async () => {
    try {
      const res = await api.getOrgStorageNotifications(id);
      if (res.success) {
        setStorageNotifications(res.notifications || []);
        setStoragePinned(res.pinned || []);
      }
    } catch (e) { console.error('Failed to load storage notifications', e); }
  }, [id]);

  const fetchStoragePreferences = useCallback(async () => {
    setPrefLoading(true);
    try {
      const res = await api.getOrgStoragePreferences(id);
      if (res.success) {
        setStoragePreferences(res.preferences);
        setDriverMode(res.preferences.storage_driver || 'local');
      }
    } catch (e) { console.error('Failed to load storage preferences', e); }
    finally { setPrefLoading(false); }
  }, [id]);

  useEffect(() => {
    if (activeView === 'storage') fetchStorageData();
  }, [activeView, fetchStorageData]);

  useEffect(() => {
    if (activeView === 'storage' && storageTab === 'notifications') fetchStorageNotifications();
    if (activeView === 'storage' && storageTab === 'preferences') fetchStoragePreferences();
  }, [activeView, storageTab, fetchStorageNotifications, fetchStoragePreferences]);

  const fetchBillingData = useCallback(async () => {
    setBillingLoading(true);
    try {
      const res = await api.getOrgBilling(id);
      if (res.success !== false) setBillingData(res);
    } catch (e) {
      console.error('Failed to load billing data', e);
    } finally {
      setBillingLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (activeView === 'billing') fetchBillingData();
  }, [activeView, fetchBillingData]);

  const fetchHistoryData = useCallback(async () => {
    setHistLoading(true);
    try {
      const [histRes, sumRes] = await Promise.all([
        api.getSubscriptionHistory(id),
        api.getSubscriptionSummary(id),
      ]);
      setHistData(histRes.data || []);
      setHistSummary(sumRes.data?.summary || {});
      setHistPlanUsage(sumRes.data?.plan_usage || []);
    } catch (e) {
      console.error('Failed to load history data', e);
    } finally {
      setHistLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (activeView === 'history') fetchHistoryData();
  }, [activeView, fetchHistoryData]);

  const [approveModal, setApproveModal] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);

  const handleApprovePayment = async () => {
    if (!approveModal) return;
    setActionLoading('approve');
    try {
      const res = await api.approvePayment(approveModal.invoiceId);
      if (res.success) {
        setToast({ type: 'success', message: 'Payment approved successfully.' });
        setApproveModal(null);
        fetchBillingData();
      } else {
        setToast({ type: 'error', message: res.message || 'Failed to approve.' });
      }
    } catch (e) {
      setToast({ type: 'error', message: 'Failed to approve payment.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectPayment = async () => {
    if (!rejectModal) return;
    setActionLoading('reject');
    try {
      const res = await api.rejectPayment(rejectModal.invoiceId, rejectModal.reason);
      if (res.success) {
        setToast({ type: 'success', message: 'Payment rejected.' });
        setRejectModal(null);
        fetchBillingData();
      } else {
        setToast({ type: 'error', message: res.message || 'Failed to reject.' });
      }
    } catch (e) {
      setToast({ type: 'error', message: 'Failed to reject payment.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteStorageRecord = async (recordId) => {
    try {
      await api.deleteOrgStorageRecord(id, recordId);
      setToast({ type: 'success', message: 'File record deleted.' });
      fetchStorageData();
    } catch (e) {
      setToast({ type: 'error', message: 'Failed to delete file.' });
    }
  };

  const handleBulkDelete = async (type, params) => {
    setDeleting(true);
    try {
      const res = await api.deleteOrgStorageBulk(id, type, params);
      if (res.success) {
        setToast({ type: 'success', message: res.message });
        setDeleteModal(null);
        fetchStorageData();
      }
    } catch (e) {
      setToast({ type: 'error', message: 'Failed to delete files.' });
    } finally {
      setDeleting(false);
    }
  };

  const handleAction = async (action) => {
    setActionLoading(action);
    try {
      if (action === 'suspend') await api.suspendOrganization(id);
      else if (action === 'activate') await api.activateOrganization(id);
      else if (action === 'delete') {
        await api.deleteOrganization(id);
        navigate('/super-admin/organizations');
        return;
      }
      await fetchOrg();
    } catch (e) { alert(e.message); }
    finally { setActionLoading(null); }
  };

  const openConfirm = (action) => {
    if (action === 'delete') {
      setConfirmConfig({
        action: 'delete', title: 'Delete Organization',
        message: `Are you sure you want to permanently delete "${org.name}"? This will delete ALL data including users, projects, tasks, and files. This action cannot be undone.`,
        confirmText: 'Delete', danger: true,
      });
    } else if (action === 'suspend') {
      setConfirmConfig({
        action: 'suspend', title: 'Suspend Organization',
        message: `Are you sure you want to suspend "${org.name}"? Users will no longer be able to access this organization.`,
        confirmText: 'Suspend', danger: true,
      });
    } else if (action === 'activate') {
      setConfirmConfig({
        action: 'activate', title: 'Activate Organization',
        message: `Are you sure you want to activate "${org.name}"? This will restore access for all users.`,
        confirmText: 'Activate', danger: false,
      });
    }
    setConfirmOpen(true);
  };

  const handleEmailPolicyChange = async (newPolicy) => {
    setEmailPolicyLoading(true);
    try {
      await api.updateOrganization(id, { email_policy: newPolicy });
      setOrg((prev) => ({ ...prev, email_policy: newPolicy }));
    } catch (e) { alert(e.message); }
    finally { setEmailPolicyLoading(false); }
  };

  const handleEditSave = async (data) => {
    setEditSaving(true);
    try {
      await api.updateOrganization(id, data);
      await fetchOrg();
      setEditOpen(false);
    } catch (e) { alert(e.message); }
    finally { setEditSaving(false); }
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={fetchOrg} />;
  if (!org) return <ErrorState message="Organization not found" />;

  const s = {
    card: { background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '16px' },
    cardAlt: { background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '12px' },
    text: { color: 'var(--text-dark)' },
    textSecondary: { color: 'var(--text-secondary)' },
    textMuted: { color: 'var(--text-muted)' },
    textHeading: { color: 'var(--text-heading)' },
    input: { background: 'var(--bg-hover)', color: 'var(--text-dark)', border: 'none' },
    divider: { borderTop: '1px solid var(--border-light)' },
    infoBox: { background: 'var(--color-primary-bg)', border: '1px solid var(--color-primary)' },
  };

  const subStatusStyle = (status) => {
    if (status === 'active') return { background: 'rgba(16,185,129,0.1)', color: 'var(--color-success)' };
    if (status === 'trial') return { background: 'var(--color-primary-bg)', color: 'var(--color-primary)' };
    return { background: 'var(--bg-hover)', color: 'var(--text-muted)' };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/super-admin/organizations')} className="p-2 rounded-lg transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold"
              style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)', fontFamily: 'monospace' }}>
              #{org.id}
            </span>
            <h1 className="text-2xl font-bold" style={s.textHeading}>{org.name}</h1>
            <StatusBadge status={org.status} />
          </div>
          <p className="text-sm mt-0.5" style={s.textSecondary}>/org/{org.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
            <button onClick={() => { setActiveView('details'); setSearchParams({}); }}
              className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
              style={{
                background: activeView === 'details' ? 'var(--color-primary)' : 'transparent',
                color: activeView === 'details' ? '#fff' : 'var(--text-secondary)',
              }}>
              Details
            </button>
            <button onClick={() => { setActiveView('storage'); setSearchParams({}); }}
              className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5"
              style={{
                background: activeView === 'storage' ? 'var(--color-primary)' : 'transparent',
                color: activeView === 'storage' ? '#fff' : 'var(--text-secondary)',
              }}>
              <HardDrive className="w-3.5 h-3.5" /> Storage
            </button>
            <button onClick={() => { setActiveView('billing'); setSearchParams({ tab: 'billing' }); }}
              className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5"
              style={{
                background: activeView === 'billing' ? 'var(--color-primary)' : 'transparent',
                color: activeView === 'billing' ? '#fff' : 'var(--text-secondary)',
              }}>
              <CreditCard className="w-3.5 h-3.5" /> Billing
            </button>
            <button onClick={() => { setActiveView('history'); setSearchParams({ tab: 'history' }); }}
              className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5"
              style={{
                background: activeView === 'history' ? 'var(--color-primary)' : 'transparent',
                color: activeView === 'history' ? '#fff' : 'var(--text-secondary)',
              }}>
              <Clock className="w-3.5 h-3.5" /> History
            </button>
          </div>
          <button onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
            <Pencil className="w-4 h-4" /> Edit
          </button>
          {org.status === 'suspended' ? (
            <button onClick={() => openConfirm('activate')} disabled={actionLoading === 'activate'}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              {actionLoading === 'activate' && <Loader2 className="w-4 h-4 animate-spin" />} Activate
            </button>
          ) : (
            <button onClick={() => openConfirm('suspend')} disabled={actionLoading === 'suspend'}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              {actionLoading === 'suspend' && <Loader2 className="w-4 h-4 animate-spin" />} Suspend
            </button>
          )}
          <button onClick={() => openConfirm('delete')}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">Delete</button>
        </div>
      </div>

      <div className="space-y-6">
        {activeView === 'details' ? (
          <>
        <div className="rounded-xl p-5 shadow-sm" style={s.card}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2" style={s.textHeading}>
              <Lock className="w-5 h-5" style={{ color: 'var(--color-primary)' }} /> Admin Details
            </h3>
            <button onClick={() => setShowChangePasswordModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              style={{ background: 'var(--color-primary)', color: '#fff' }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}>
              <Lock className="w-3.5 h-3.5" /> Change Password
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: User, label: 'Admin Name', value: org.admin_name || 'N/A' },
              { icon: MailCheck, label: 'Admin Email', value: org.admin_email || 'N/A' },
              { icon: Phone, label: 'Phone', value: org.admin_phone || 'N/A' },
            ].map((item) => (
              <div key={item.label} className="p-4 rounded-lg" style={s.infoBox}>
                <div className="flex items-center gap-2 mb-1">
                  <item.icon className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
                  <p className="text-xs" style={{ color: 'var(--color-primary)' }}>{item.label}</p>
                </div>
                <p className="text-sm font-medium" style={s.text}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: Globe, label: 'URL', value: org.primary_domain?.domain || `/org/${org.slug}` },
            { icon: Database, label: 'Database', value: org.database_name },
            { icon: Shield, label: 'Plan', value: org.subscription?.plan?.name || org.type },
            { icon: Users, label: 'Users', value: org.users_count || 0 },
            { icon: FolderKanban, label: 'Projects', value: org.projects_count || 0 },
            { icon: Calendar, label: 'Created', value: org.created_at?.split('T')[0] },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow"
              style={s.cardAlt}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={s.infoBox}>
                <item.icon className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--color-primary)' }}>{item.label}</p>
                <p className="text-sm font-medium" style={s.text}>{item.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl p-5 shadow-sm" style={s.card}>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2" style={s.textHeading}>
            <CreditCard className="w-5 h-5" style={{ color: 'var(--color-primary)' }} /> Subscription Plan
            <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)', fontFamily: 'monospace' }}>
              Org #{org.id}
            </span>
          </h3>
          {org.subscription?.plan ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xl font-bold" style={s.textHeading}>{org.subscription.plan.name}</h4>
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full" style={subStatusStyle(org.subscription.status)}>
                      {org.subscription.status}
                    </span>
                    {org.effective_plan?.is_custom && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full"
                        style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706' }}>Custom</span>
                    )}
                  </div>
                  <p className="text-sm mt-0.5" style={s.textSecondary}>
                    {org.trial_config && org.subscription.plan.slug === 'trial'
                      ? `${org.trial_config.trial_duration} ${org.trial_config.trial_duration_unit} trial`
                      : `${org.subscription.billing_period === 'yearly' ? 'Yearly' : 'Monthly'} billing`}
                    {org.subscription.starts_at && (
                      <> — Started {new Date(org.subscription.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                    )}
                    {(() => {
                      if (!org.subscription.starts_at) return null;
                      if (org.trial_config && org.subscription.plan.slug === 'trial') {
                        const endDate = org.subscription.ends_at ? new Date(org.subscription.ends_at) : null;
                        if (!endDate) return null;
                        const diffMs = endDate - now;
                        const unit = org.trial_config.trial_duration_unit || 'days';
                        const timeLeft = diffMs <= 0 ? null
                          : unit === 'minutes' ? `${Math.floor(diffMs / 60000)} min left`
                          : unit === 'hours' ? `${Math.floor(diffMs / 3600000)} hr left`
                          : `${Math.ceil(diffMs / 86400000)} days left`;
                        return <> — Expires {endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{timeLeft && ` (${timeLeft})`}</>;
                      }
                      if (org.subscription.ends_at) {
                        const days = Math.ceil((new Date(org.subscription.ends_at) - now) / (1000 * 60 * 60 * 24));
                        const label = days <= 0 ? 'Today' : `${days} day${days !== 1 ? 's' : ''} left`;
                        return <> — {org.subscription.status === 'trial' ? 'Expires' : 'Renews'} {new Date(org.subscription.ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ({label})</>;
                      }
                      return null;
                    })()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold" style={s.textHeading}>
                    ${org.effective_plan?.is_custom
                      ? (org.subscription.billing_period === 'yearly' ? org.effective_plan.price_yearly : org.effective_plan.price_monthly)
                      : (org.subscription.billing_period === 'yearly' ? org.subscription.plan.price_yearly : org.subscription.plan.price_monthly)}
                  </p>
                  <p className="text-sm" style={s.textSecondary}>/{org.subscription.billing_period === 'yearly' ? 'year' : 'month'}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-3" style={s.divider}>
                {[
                  { icon: Users, label: 'Users', value: org.effective_plan?.is_custom ? org.effective_plan.max_users : (org.subscription.plan.slug === 'trial' && org.trial_config ? org.trial_config.max_users : (org.subscription.plan.max_users === 9999 ? 'Unlimited' : org.subscription.plan.max_users)) },
                  { icon: FolderKanban, label: 'Projects', value: org.effective_plan?.is_custom ? org.effective_plan.max_projects : (org.subscription.plan.slug === 'trial' && org.trial_config ? org.trial_config.max_projects : (org.subscription.plan.max_projects === 9999 ? 'Unlimited' : org.subscription.plan.max_projects)) },
                  { icon: HardDrive, label: 'Storage', value: `${org.effective_plan?.is_custom ? org.effective_plan.max_storage_gb : (org.subscription.plan.slug === 'trial' && org.trial_config ? org.trial_config.max_storage_gb : org.subscription.plan.max_storage_gb)} GB` },
                ].map((item) => (
                  <div key={item.label} className="p-3 rounded-lg" style={s.infoBox}>
                    <div className="flex items-center gap-2 mb-1">
                      <item.icon className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
                      <p className="text-xs" style={{ color: 'var(--color-primary)' }}>{item.label}</p>
                    </div>
                    <p className="text-lg font-semibold" style={s.text}>{item.value === 9999 ? 'Unlimited' : item.value}</p>
                  </div>
                ))}
              </div>

              {org.subscription.plan.modules && org.subscription.plan.modules.length > 0 && (
                <div className="pt-3" style={s.divider}>
                  <p className="text-xs font-medium uppercase tracking-wider mb-2" style={s.textMuted}>Included Modules</p>
                  <div className="flex flex-wrap gap-2">
                    {org.subscription.plan.modules.map((mod) => (
                      <span key={mod.slug || mod.id} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md"
                        style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                        <Check className="w-3 h-3 text-emerald-500" /> {moduleDisplayName(mod.name, mod.slug)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm" style={s.textSecondary}>No subscription plan assigned</p>
          )}
        </div>

        <div className="rounded-xl p-5 shadow-sm" style={s.card}>
          <h3 className="text-lg font-semibold mb-4" style={s.textHeading}>Email Policy</h3>
          <p className="text-sm mb-4" style={s.textSecondary}>Controls how user emails are managed in this organization.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            {[
              { value: 'standard', icon: Mail, title: 'Standard', desc: 'Single email for login and notifications' },
              { value: 'company_required', icon: Building2, title: 'Company Required', desc: 'Separate personal and company email' },
            ].map((opt) => (
              <button key={opt.value} onClick={() => handleEmailPolicyChange(opt.value)}
                disabled={emailPolicyLoading || org.email_policy === opt.value}
                className="px-4 py-3 rounded-lg text-sm font-medium transition-colors border-2 text-left"
                style={{
                  borderColor: org.email_policy === opt.value ? 'var(--color-primary)' : 'var(--border-light)',
                  background: org.email_policy === opt.value ? 'var(--color-primary-bg)' : 'var(--bg-card)',
                  color: org.email_policy === opt.value ? 'var(--color-primary)' : 'var(--text-secondary)',
                }}>
                <div className="flex items-center gap-2">
                  <opt.icon className="w-4 h-4" />
                  <span className="font-semibold">{opt.title}</span>
                </div>
                <p className="text-xs mt-1" style={s.textSecondary}>{opt.desc}</p>
              </button>
            ))}
          </div>
          {emailPolicyLoading && (
            <div className="flex items-center gap-2 mt-3 text-sm" style={s.textSecondary}>
              <Loader2 className="w-4 h-4 animate-spin" /> Updating...
            </div>
          )}
        </div>

          </>
        ) : activeView === 'storage' ? (
          /* ═══════════ STORAGE VIEW ═══════════ */
          <>
            {toast && (
              <div style={{
                position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
                padding: '12px 20px', borderRadius: '12px',
                background: toast.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                border: `1px solid ${toast.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)'}`,
                display: 'flex', alignItems: 'center', gap: '8px', boxShadow: 'var(--shadow-md)',
              }}>
                {toast.type === 'success' ? <Check className="w-4 h-4" style={{ color: 'var(--color-success)' }} /> : <AlertTriangle className="w-4 h-4" style={{ color: 'var(--color-danger)' }} />}
                <span style={{ fontSize: '13px', fontWeight: 600, color: toast.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)' }}>{toast.message}</span>
              </div>
            )}

            {storageLoading ? (
              <div className="rounded-xl p-10 shadow-sm flex items-center justify-center gap-3" style={s.card}>
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-primary)' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Loading storage data...</span>
              </div>
            ) : storageSummary ? (
              <>
                {/* Storage Overview */}
                <div className="rounded-xl p-5 shadow-sm" style={s.card}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2" style={s.textHeading}>
                      <HardDrive className="w-5 h-5" style={{ color: 'var(--color-primary)' }} /> Storage Usage
                    </h3>
                    <span className="px-3 py-1 rounded-full text-xs font-bold"
                      style={{
                        background: storageSummary.usage_percent > 95 ? 'var(--color-danger-bg)' : storageSummary.usage_percent > 80 ? 'var(--color-warning-bg)' : 'var(--color-success-bg)',
                        color: storageSummary.usage_percent > 95 ? 'var(--color-danger)' : storageSummary.usage_percent > 80 ? 'var(--color-warning)' : 'var(--color-success)',
                      }}>
                      {storageSummary.usage_percent}% Used
                    </span>
                  </div>
                  <div className="mb-3">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-semibold" style={s.text}>{storageSummary.total_gb} GB used</span>
                      <span className="text-sm" style={s.textSecondary}>of {storageSummary.max_storage_gb} GB</span>
                    </div>
                    <div className="w-full h-3 rounded-full" style={{ background: 'var(--bg-hover)' }}>
                      <div className="h-3 rounded-full transition-all" style={{
                        width: `${Math.min(storageSummary.usage_percent, 100)}%`,
                        background: storageSummary.usage_percent > 95 ? 'var(--color-danger)' : storageSummary.usage_percent > 80 ? 'var(--color-warning)' : 'var(--color-primary)',
                      }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs" style={s.textMuted}>{storageSummary.usage_percent}% used</span>
                      <span className="text-xs" style={s.textMuted}>{storageSummary.remaining_gb} GB remaining</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Total Files', value: storageSummary.total_files, color: 'var(--color-primary)' },
                      { label: 'Used Space', value: `${storageSummary.total_gb} GB`, color: 'var(--color-blue)' },
                      { label: 'Storage Limit', value: `${storageSummary.max_storage_gb} GB`, color: 'var(--color-success)' },
                      { label: 'Remaining', value: `${storageSummary.remaining_gb} GB`, color: storageSummary.usage_percent > 95 ? 'var(--color-danger)' : 'var(--color-warning)' },
                    ].map((item) => (
                      <div key={item.label} className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
                        <p className="text-xs" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</p>
                        <p className="text-lg font-bold mt-1" style={{ color: item.color }}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Storage Tabs */}
                <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
                  {[
                    { key: 'overview', label: 'Overview', icon: Info },
                    { key: 'files', label: 'Files', icon: FileText },
                    { key: 'cleanup', label: 'Cleanup', icon: Trash2 },
                    { key: 'notifications', label: 'Notifications', icon: Bell, badge: storageNotifications.filter(n => !n.is_read).length },
                    { key: 'preferences', label: 'Preferences', icon: Settings },
                  ].map((tab) => (
                    <button key={tab.key} onClick={() => setStorageTab(tab.key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                      style={{
                        background: storageTab === tab.key ? 'var(--color-primary)' : 'transparent',
                        color: storageTab === tab.key ? '#fff' : 'var(--text-secondary)',
                      }}>
                      <tab.icon className="w-3.5 h-3.5" /> {tab.label}
                      {tab.badge > 0 && (
                        <span style={{
                          background: 'var(--color-danger)', color: '#fff', fontSize: '9px',
                          fontWeight: 700, padding: '1px 5px', borderRadius: '8px', marginLeft: '2px',
                        }}>
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Overview Tab */}
                {storageTab === 'overview' && storageSummary.old_files && (
                  <div className="rounded-xl p-5 shadow-sm" style={s.card}>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={s.textHeading}>
                      <Clock className="w-4 h-4" style={{ color: 'var(--color-primary)' }} /> File Age Distribution
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { label: 'Older than 3 months', count: storageSummary.old_files['3_months']?.count || 0, size: storageSummary.old_files['3_months']?.size_mb || 0, color: '#f59e0b' },
                        { label: 'Older than 6 months', count: storageSummary.old_files['6_months']?.count || 0, size: storageSummary.old_files['6_months']?.size_mb || 0, color: '#f97316' },
                        { label: 'Older than 1 year', count: storageSummary.old_files['12_months']?.count || 0, size: storageSummary.old_files['12_months']?.size_mb || 0, color: '#ef4444' },
                      ].map((item) => (
                        <div key={item.label} className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)', borderLeft: `3px solid ${item.color}` }}>
                          <p className="text-xs" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</p>
                          <p className="text-lg font-bold mt-1" style={s.textHeading}>{item.count} files</p>
                          <p className="text-xs" style={s.textSecondary}>{item.size} MB</p>
                        </div>
                      ))}
                    </div>
                    {storageSummary.large_files && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                        {[
                          { label: 'Files > 1 GB', count: storageSummary.large_files['over_1gb']?.count || 0, size: storageSummary.large_files['over_1gb']?.size_mb || 0, color: '#ef4444' },
                          { label: 'Files > 2 GB', count: storageSummary.large_files['over_2gb']?.count || 0, size: storageSummary.large_files['over_2gb']?.size_mb || 0, color: '#dc2626' },
                        ].map((item) => (
                          <div key={item.label} className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)', borderLeft: `3px solid ${item.color}` }}>
                            <p className="text-xs" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</p>
                            <p className="text-lg font-bold mt-1" style={s.textHeading}>{item.count} files</p>
                            <p className="text-xs" style={s.textSecondary}>{item.size} MB</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Files Tab */}
                {storageTab === 'files' && storageData?.recent_files?.length > 0 && (
                  <div className="rounded-xl p-5 shadow-sm" style={s.card}>
                    <h3 className="text-sm font-semibold mb-3" style={s.textHeading}>Recent Files</h3>
                    <div className="flex flex-col gap-2">
                      {storageData.recent_files.map((file) => (
                        <div key={file.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate" style={s.text}>{file.file_name}</p>
                              <p className="text-xs" style={s.textMuted}>{file.category} {file.uploaded_by ? `· ${file.uploaded_by}` : ''}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-xs" style={s.textSecondary}>{file.file_size_mb} MB</span>
                            <span className="text-xs" style={s.textMuted}>{new Date(file.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            <button type="button"
                              onClick={() => { console.log('[DELETE] file clicked', file.id, file.file_name); setStorageFileDeleteConfirm({ open: true, id: file.id }); }}
                              className="p-1 rounded-md hover:bg-red-50 transition-colors"
                              title="Delete">
                              <Trash2 className="w-3.5 h-3.5" style={{ color: '#ef4444' }} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cleanup Tab */}
                {storageTab === 'cleanup' && (
                  <>
                    <div className="rounded-xl p-5 shadow-sm" style={s.card}>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={s.textHeading}>
                        <Clock className="w-4 h-4" style={{ color: 'var(--color-warning)' }} /> Delete Old Files
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                          { months: 3, label: '3+ Months', count: storageSummary?.old_files?.['3_months']?.count || 0, size: storageSummary?.old_files?.['3_months']?.size_mb || 0, color: '#f59e0b' },
                          { months: 6, label: '6+ Months', count: storageSummary?.old_files?.['6_months']?.count || 0, size: storageSummary?.old_files?.['6_months']?.size_mb || 0, color: '#f97316' },
                          { months: 12, label: '1+ Year', count: storageSummary?.old_files?.['12_months']?.count || 0, size: storageSummary?.old_files?.['12_months']?.size_mb || 0, color: '#ef4444' },
                        ].map((item) => (
                          <div key={item.months} className="p-4 rounded-lg flex flex-col gap-3" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
                            <div>
                              <p className="text-xs font-semibold" style={{ color: item.color }}>{item.label}</p>
                              <p className="text-lg font-bold" style={s.textHeading}>{item.count} files</p>
                              <p className="text-xs" style={s.textSecondary}>{item.size} MB</p>
                            </div>
                            <button onClick={() => setDeleteModal({ type: 'old', months: item.months, label: item.label, count: item.count, size: item.size })}
                              disabled={item.count === 0}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                              style={{
                                background: item.count > 0 ? 'var(--color-danger)' : 'var(--bg-hover)',
                                color: item.count > 0 ? '#fff' : 'var(--text-muted)',
                                cursor: item.count > 0 ? 'pointer' : 'not-allowed',
                              }}>
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl p-5 shadow-sm" style={s.card}>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={s.textHeading}>
                        <AlertTriangle className="w-4 h-4" style={{ color: 'var(--color-danger)' }} /> Delete Large Files
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          { minGb: 1, label: '> 1 GB Files', count: storageSummary?.large_files?.['over_1gb']?.count || 0, size: storageSummary?.large_files?.['over_1gb']?.size_mb || 0, color: '#ef4444' },
                          { minGb: 2, label: '> 2 GB Files', count: storageSummary?.large_files?.['over_2gb']?.count || 0, size: storageSummary?.large_files?.['over_2gb']?.size_mb || 0, color: '#dc2626' },
                        ].map((item) => (
                          <div key={item.minGb} className="p-4 rounded-lg flex flex-col gap-3" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
                            <div>
                              <p className="text-xs font-semibold" style={{ color: item.color }}>{item.label}</p>
                              <p className="text-lg font-bold" style={s.textHeading}>{item.count} files</p>
                              <p className="text-xs" style={s.textSecondary}>{item.size} MB</p>
                            </div>
                            <button onClick={() => setDeleteModal({ type: 'large', minGb: item.minGb, label: item.label, count: item.count, size: item.size })}
                              disabled={item.count === 0}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                              style={{
                                background: item.count > 0 ? 'var(--color-danger)' : 'var(--bg-hover)',
                                color: item.count > 0 ? '#fff' : 'var(--text-muted)',
                                cursor: item.count > 0 ? 'pointer' : 'not-allowed',
                              }}>
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Notifications Tab */}
                {storageTab === 'notifications' && (
                  <div className="space-y-3">
                    {storageNotifications.length === 0 ? (
                      <div className="rounded-xl p-8 shadow-sm text-center" style={s.card}>
                        <Bell className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No storage notifications</p>
                      </div>
                    ) : (
                      <>
                        {storagePinned.length > 0 && (
                          <div className="rounded-xl p-4 shadow-sm" style={{ ...s.card, borderLeft: '3px solid var(--color-warning)' }}>
                            <p className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--color-warning)' }}>
                              <AlertCircle className="w-3.5 h-3.5" /> Pinned Alerts ({storagePinned.length})
                            </p>
                            <div className="space-y-2">
                              {storagePinned.map((n) => (
                                <div key={n.id} className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
                                  <p className="text-sm font-semibold" style={s.text}>{n.title}</p>
                                  <p className="text-xs mt-1" style={s.textSecondary}>{n.message}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {storageNotifications.filter(n => !n.is_pinned).map((n) => (
                          <div key={n.id} className="rounded-xl p-4 shadow-sm flex items-start gap-3" style={{
                            ...s.card,
                            opacity: n.is_read ? 0.6 : 1,
                            borderLeft: `3px solid ${n.severity === 'critical' ? 'var(--color-danger)' : n.severity === 'warning' ? 'var(--color-warning)' : 'var(--color-info)'}`,
                          }}>
                            <div className="p-2 rounded-lg" style={{
                              background: n.severity === 'critical' ? 'var(--color-danger-bg)' : n.severity === 'warning' ? 'var(--color-warning-bg)' : 'var(--color-info-bg)',
                            }}>
                              {n.severity === 'critical' ? <AlertTriangle className="w-4 h-4" style={{ color: 'var(--color-danger)' }} /> :
                               n.severity === 'warning' ? <AlertCircle className="w-4 h-4" style={{ color: 'var(--color-warning)' }} /> :
                               <Info className="w-4 h-4" style={{ color: 'var(--color-info)' }} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold" style={s.text}>{n.title}</p>
                              <p className="text-xs mt-1" style={s.textSecondary}>{n.message}</p>
                              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                {n.created_at ? new Date(n.created_at).toLocaleDateString() : ''}
                              </p>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* Preferences Tab */}
                {storageTab === 'preferences' && (
                  <div className="rounded-xl p-6 shadow-sm" style={s.card}>
                    <h3 className="text-base font-semibold mb-5 flex items-center gap-2" style={s.textHeading}>
                      <Settings className="w-5 h-5" style={{ color: 'var(--color-primary)' }} /> Storage Preferences
                    </h3>
                    {prefLoading ? (
                      <div className="flex items-center gap-2 py-6 justify-center">
                        <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-primary)' }} />
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading preferences...</span>
                      </div>
                    ) : storagePreferences ? (
                      <div className="space-y-5" data-storage-prefs>
                        {/* Storage Driver */}
                        <div className="p-5 rounded-xl" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
                          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--color-primary)' }}>Storage Driver</p>
                          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Choose where this organization stores files. Switching drivers does NOT migrate existing files.</p>
                          <div style={{ display: 'flex', flexDirection: 'row', gap: '16px' }}>
                            {/* Local Option */}
                            <div onClick={() => setDriverMode('local')}
                              style={{
                                flex: 1, padding: '10px 16px', borderRadius: '12px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap',
                                background: driverMode === 'local' ? 'var(--color-primary-bg)' : 'var(--bg-primary)',
                                border: driverMode === 'local' ? '2px solid var(--color-primary)' : '2px solid var(--border-color)',
                              }}>
                              <input type="radio" name="storage_driver" value="local" readOnly
                                checked={driverMode === 'local'}
                                style={{ accentColor: 'var(--color-primary)', margin: 0, display: 'inline' }} />
                              <HardDrive style={{ width: '16px', height: '16px', color: 'var(--color-primary)', flexShrink: 0 }} />
                              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>Local Server</span>
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>- Store files on the application server disk</span>
                            </div>
                            {/* S3 Option */}
                            <div onClick={() => setDriverMode('s3')}
                              style={{
                                flex: 1, padding: '10px 16px', borderRadius: '12px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap',
                                background: driverMode === 's3' ? 'var(--color-primary-bg)' : 'var(--bg-primary)',
                                border: driverMode === 's3' ? '2px solid var(--color-primary)' : '2px solid var(--border-color)',
                              }}>
                              <input type="radio" name="storage_driver" value="s3" readOnly
                                checked={driverMode === 's3'}
                                style={{ accentColor: 'var(--color-primary)', margin: 0, display: 'inline' }} />
                              <Globe style={{ width: '16px', height: '16px', color: '#f59e0b', flexShrink: 0 }} />
                              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>AWS S3</span>
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>- Store files on Amazon S3 cloud storage</span>
                            </div>
                          </div>
                        </div>

                        {/* S3 Configuration (shown only when S3 is selected) */}
                        <div className="p-5 rounded-xl" id="s3-config-section"
                          style={{
                            background: 'var(--bg-hover)',
                            border: driverMode === 's3' ? '2px solid #f59e0b' : '1px solid var(--border-light)',
                            opacity: driverMode === 's3' ? 1 : 0.5,
                            transition: 'all 0.2s ease',
                          }}>
                          <p className="text-sm font-semibold mb-4 flex items-center gap-1.5" style={{ color: '#f59e0b' }}>
                            <Globe className="w-4 h-4" /> S3 Configuration
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Bucket Name *</label>
                              <input type="text" name="s3_bucket" defaultValue={storagePreferences.s3_bucket || ''} disabled={driverMode !== 's3'}
                                placeholder="my-pms-bucket"
                                className="w-full mt-1.5 p-2.5 rounded-lg text-sm transition-all"
                                style={{ background: 'var(--bg-primary)', border: '2px solid #64748b', color: 'var(--text-primary)' }}
                                onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px var(--color-primary-bg)'; }}
                                onBlur={(e) => { e.target.style.borderColor = '#64748b'; e.target.style.boxShadow = 'none'; }}
                                onMouseEnter={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#94a3b8'; }}
                                onMouseLeave={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#64748b'; }} />
                            </div>
                            <div>
                              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Region *</label>
                              <select name="s3_region" defaultValue={storagePreferences.s3_region || 'us-east-1'} disabled={driverMode !== 's3'}
                                className="w-full mt-1.5 p-2.5 rounded-lg text-sm transition-all"
                                style={{ background: 'var(--bg-primary)', border: '2px solid #64748b', color: 'var(--text-primary)' }}
                                onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px var(--color-primary-bg)'; }}
                                onBlur={(e) => { e.target.style.borderColor = '#64748b'; e.target.style.boxShadow = 'none'; }}
                                onMouseEnter={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#94a3b8'; }}
                                onMouseLeave={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#64748b'; }}>
                                {['us-east-1','us-east-2','us-west-1','us-west-2','eu-north-1','eu-west-1','eu-west-2','eu-central-1','ap-south-1','ap-southeast-1','ap-northeast-1','sa-east-1'].map(r => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Path Prefix</label>
                              <input type="text" name="s3_prefix" defaultValue={storagePreferences.s3_prefix || `org-${id}/`} disabled={driverMode !== 's3'}
                                placeholder={`org-${id}/`}
                                className="w-full mt-1.5 p-2.5 rounded-lg text-sm transition-all"
                                style={{ background: 'var(--bg-primary)', border: '2px solid #64748b', color: 'var(--text-primary)' }}
                                onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px var(--color-primary-bg)'; }}
                                onBlur={(e) => { e.target.style.borderColor = '#64748b'; e.target.style.boxShadow = 'none'; }}
                                onMouseEnter={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#94a3b8'; }}
                                onMouseLeave={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#64748b'; }} />
                            </div>
                            <div>
                              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Access Key ID</label>
                              <div style={{ position: 'relative' }}>
                                <input type={showAccessKey ? 'text' : 'password'} name="s3_access_key" defaultValue={storagePreferences.s3_access_key || ''} disabled={driverMode !== 's3'}
                                  placeholder="AKIA..."
                                  className="w-full mt-1.5 p-2.5 pr-10 rounded-lg text-sm transition-all"
                                  style={{ background: 'var(--bg-primary)', border: '2px solid #64748b', color: 'var(--text-primary)' }}
                                  onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px var(--color-primary-bg)'; }}
                                  onBlur={(e) => { e.target.style.borderColor = '#64748b'; e.target.style.boxShadow = 'none'; }}
                                  onMouseEnter={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#94a3b8'; }}
                                  onMouseLeave={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#64748b'; }} />
                                {driverMode === 's3' && storagePreferences.s3_access_key && (
                                  <button type="button" onClick={() => setShowAccessKey(!showAccessKey)}
                                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}>
                                    {showAccessKey ? <EyeOff size={16} style={{ color: 'var(--text-muted)' }} /> : <Eye size={16} style={{ color: 'var(--text-muted)' }} />}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div>
                              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Secret Access Key</label>
                              <div style={{ position: 'relative' }}>
                                <input type={showSecretKey ? 'text' : 'password'} name="s3_secret_key" defaultValue={storagePreferences.s3_secret_key || ''} disabled={driverMode !== 's3'}
                                  placeholder="••••••••"
                                  className="w-full mt-1.5 p-2.5 pr-10 rounded-lg text-sm transition-all"
                                  style={{ background: 'var(--bg-primary)', border: '2px solid #64748b', color: 'var(--text-primary)' }}
                                  onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px var(--color-primary-bg)'; }}
                                  onBlur={(e) => { e.target.style.borderColor = '#64748b'; e.target.style.boxShadow = 'none'; }}
                                  onMouseEnter={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#94a3b8'; }}
                                  onMouseLeave={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#64748b'; }} />
                                {driverMode === 's3' && storagePreferences.s3_secret_key && (
                                  <button type="button" onClick={() => setShowSecretKey(!showSecretKey)}
                                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}>
                                    {showSecretKey ? <EyeOff size={16} style={{ color: 'var(--text-muted)' }} /> : <Eye size={16} style={{ color: 'var(--text-muted)' }} />}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="mt-4">
                            <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Endpoint URL <span className="text-xs" style={{ color: 'var(--text-muted)' }}>(optional — for S3-compatible providers)</span></label>
                            <input type="text" name="s3_endpoint" defaultValue={storagePreferences.s3_endpoint || ''} disabled={driverMode !== 's3'}
                              placeholder="Leave empty for AWS S3. E.g. https://nyc3.digitaloceanspaces.com"
                              className="w-full mt-1.5 p-2.5 rounded-lg text-sm transition-all"
                              style={{ background: 'var(--bg-primary)', border: '2px solid #64748b', color: 'var(--text-primary)' }}
                              onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px var(--color-primary-bg)'; }}
                              onBlur={(e) => { e.target.style.borderColor = '#64748b'; e.target.style.boxShadow = 'none'; }}
                              onMouseEnter={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#94a3b8'; }}
                              onMouseLeave={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#64748b'; }} />
                            <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                              For Cloudflare R2, DigitalOcean Spaces, Wasabi, MinIO etc. Leave empty to use default AWS S3.
                            </p>
                          </div>
                          {driverMode === 's3' && (
                            <div className="mt-4 flex items-center gap-3">
                              <button type="button" disabled={testingS3}
                                onClick={async () => {
                                  setTestingS3(true);
                                  setS3TestResult(null);
                                  try {
                                    const section = document.querySelector('[data-storage-prefs]');
                                    const getVal = (name) => section?.querySelector(`[name="${name}"]`)?.value || '';
                                    const payload = {
                                      s3_bucket: getVal('s3_bucket'),
                                      s3_region: getVal('s3_region'),
                                      s3_access_key: getVal('s3_access_key'),
                                      s3_secret_key: getVal('s3_secret_key'),
                                      s3_prefix: getVal('s3_prefix'),
                                      s3_endpoint: getVal('s3_endpoint'),
                                    };
                                    const res = await api.testOrgS3Connection(id, payload);
                                    setS3TestResult({ success: true, message: res.message });
                                  } catch (e) {
                                    setS3TestResult({ success: false, message: e.message || 'Connection failed' });
                                  } finally {
                                    setTestingS3(false);
                                  }
                                }}
                                className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all hover:shadow-sm"
                                style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid var(--color-success)' }}>
                                {testingS3 ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                {testingS3 ? 'Testing...' : 'Test Connection'}
                              </button>
                              {s3TestResult && (
                                <span className="text-xs flex items-center gap-1" style={{ color: s3TestResult.success ? 'var(--color-success)' : 'var(--color-error)' }}>
                                  {s3TestResult.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                  {s3TestResult.message}
                                </span>
                              )}
                              {!s3TestResult && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Verify S3 credentials before saving</span>}
                            </div>
                          )}
                        </div>

                        {/* Cleanup Policy */}
                        <div className="p-5 rounded-xl" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
                          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--color-primary)' }}>Cleanup Policy</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Delete files older than (months)</label>
                              <input type="number" name="cleanup_months" min="1" max="60" defaultValue={storagePreferences.cleanup_months || 6}
                                className="w-full mt-1.5 p-2.5 rounded-lg text-sm transition-all"
                                style={{ background: 'var(--bg-primary)', border: '2px solid #64748b', color: 'var(--text-primary)' }}
                                onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px var(--color-primary-bg)'; }}
                                onBlur={(e) => { e.target.style.borderColor = '#64748b'; e.target.style.boxShadow = 'none'; }}
                                onMouseEnter={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#94a3b8'; }}
                                onMouseLeave={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#64748b'; }} />
                            </div>
                            <div>
                              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Large file threshold (MB)</label>
                              <input type="number" name="large_file_threshold_mb" min="100" max="10000" step="100" defaultValue={storagePreferences.large_file_threshold_mb || 500}
                                className="w-full mt-1.5 p-2.5 rounded-lg text-sm transition-all"
                                style={{ background: 'var(--bg-primary)', border: '2px solid #64748b', color: 'var(--text-primary)' }}
                                onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px var(--color-primary-bg)'; }}
                                onBlur={(e) => { e.target.style.borderColor = '#64748b'; e.target.style.boxShadow = 'none'; }}
                                onMouseEnter={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#94a3b8'; }}
                                onMouseLeave={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#64748b'; }} />
                            </div>
                          </div>
                          <label className="flex items-center gap-2 mt-4 cursor-pointer">
                            <input type="checkbox" name="auto_cleanup_enabled" defaultChecked={storagePreferences.auto_cleanup_enabled !== false}
                              className="w-4 h-4 rounded" style={{ accentColor: 'var(--color-primary)' }} />
                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Enable automatic cleanup</span>
                          </label>
                        </div>

                        {/* Notification Thresholds */}
                        <div className="p-5 rounded-xl" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
                          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--color-warning)' }}>Alert Thresholds</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Warning threshold (%)</label>
                              <input type="number" name="warning_threshold_percent" min="50" max="95" defaultValue={storagePreferences.warning_threshold_percent || 80}
                                className="w-full mt-1.5 p-2.5 rounded-lg text-sm transition-all"
                                style={{ background: 'var(--bg-primary)', border: '2px solid #64748b', color: 'var(--text-primary)' }}
                                onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px var(--color-primary-bg)'; }}
                                onBlur={(e) => { e.target.style.borderColor = '#64748b'; e.target.style.boxShadow = 'none'; }}
                                onMouseEnter={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#94a3b8'; }}
                                onMouseLeave={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#64748b'; }} />
                            </div>
                            <div>
                              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Critical threshold (%)</label>
                              <input type="number" name="critical_threshold_percent" min="80" max="100" defaultValue={storagePreferences.critical_threshold_percent || 95}
                                className="w-full mt-1.5 p-2.5 rounded-lg text-sm transition-all"
                                style={{ background: 'var(--bg-primary)', border: '2px solid #64748b', color: 'var(--text-primary)' }}
                                onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px var(--color-primary-bg)'; }}
                                onBlur={(e) => { e.target.style.borderColor = '#64748b'; e.target.style.boxShadow = 'none'; }}
                                onMouseEnter={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#94a3b8'; }}
                                onMouseLeave={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#64748b'; }} />
                            </div>
                          </div>
                        </div>

                        {/* Storage Limits Override */}
                        <div className="p-5 rounded-xl" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
                          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-info)' }}>Storage Limit Override</p>
                          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Override the plan storage limit for this specific organization</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Custom Max Storage (GB)</label>
                              <input type="number" name="custom_max_storage_gb" min="1" max="9999" defaultValue={storagePreferences.custom_max_storage_gb || ''} placeholder="Leave empty to use plan limit"
                                className="w-full mt-1.5 p-2.5 rounded-lg text-sm transition-all"
                                style={{ background: 'var(--bg-primary)', border: '2px solid #64748b', color: 'var(--text-primary)' }}
                                onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px var(--color-primary-bg)'; }}
                                onBlur={(e) => { e.target.style.borderColor = '#64748b'; e.target.style.boxShadow = 'none'; }}
                                onMouseEnter={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#94a3b8'; }}
                                onMouseLeave={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = '#64748b'; }} />
                            </div>
                            <div>
                              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Auto-delete when full</label>
                              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                                <input type="checkbox" name="auto_delete_enabled" defaultChecked={storagePreferences.auto_delete_enabled !== false}
                                  className="w-4 h-4 rounded" style={{ accentColor: 'var(--color-primary)' }} />
                                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Delete oldest files when storage limit reached</span>
                              </label>
                            </div>
                          </div>
                        </div>

                        {/* Save Button */}
                        <div className="flex justify-end pt-2">
                          <button disabled={prefSaving}
                            onClick={async () => {
                              setPrefSaving(true);
                              try {
                                const section = document.querySelector('[data-storage-prefs]');
                                const getVal = (name) => {
                                  const el = section?.querySelector(`[name="${name}"]`);
                                  if (!el) return '';
                                  if (el.type === 'radio') {
                                    const checked = section.querySelector(`[name="${name}"]:checked`);
                                    return checked ? checked.value : '';
                                  }
                                  return el.value;
                                };
                                const isChecked = (name) => section?.querySelector(`[name="${name}"]`)?.checked ?? false;

                                const payload = {
                                  storage_driver: getVal('storage_driver') || 'local',
                                  s3_bucket: getVal('s3_bucket'),
                                  s3_region: getVal('s3_region'),
                                  s3_prefix: getVal('s3_prefix'),
                                  s3_access_key: getVal('s3_access_key'),
                                  s3_secret_key: getVal('s3_secret_key'),
                                  s3_endpoint: getVal('s3_endpoint'),
                                  cleanup_months: parseInt(getVal('cleanup_months')) || 6,
                                  large_file_threshold_mb: parseInt(getVal('large_file_threshold_mb')) || 500,
                                  auto_cleanup_enabled: isChecked('auto_cleanup_enabled'),
                                  warning_threshold_percent: parseInt(getVal('warning_threshold_percent')) || 80,
                                  critical_threshold_percent: parseInt(getVal('critical_threshold_percent')) || 95,
                                  auto_delete_enabled: isChecked('auto_delete_enabled'),
                                  custom_max_storage_gb: getVal('custom_max_storage_gb') ? parseInt(getVal('custom_max_storage_gb')) : null,
                                };

                                await api.updateOrgStoragePreferences(id, payload);
                                setToast({ type: 'success', message: 'Preferences saved!' });
                                fetchStoragePreferences();
                              } catch (e) { setToast({ type: 'error', message: 'Failed to save' }); }
                              finally { setPrefSaving(false); }
                            }}
                            className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all hover:shadow-md"
                            style={{ background: 'var(--color-primary)', color: '#fff' }}>
                            {prefSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            {prefSaving ? 'Saving...' : 'Save Preferences'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No preferences data</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl p-10 shadow-sm text-center" style={s.card}>
                <HardDrive className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No storage data available</p>
              </div>
            )}
          </>
        ) : activeView === 'history' ? (
          <>
            {toast && (
              <div style={{
                position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
                padding: '12px 20px', borderRadius: '12px',
                background: toast.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                border: `1px solid ${toast.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)'}`,
                display: 'flex', alignItems: 'center', gap: '8px', boxShadow: 'var(--shadow-md)',
              }}>
                {toast.type === 'success' ? <Check className="w-4 h-4" style={{ color: 'var(--color-success)' }} /> : <AlertTriangle className="w-4 h-4" style={{ color: 'var(--color-danger)' }} />}
                <span style={{ fontSize: '13px', fontWeight: 600, color: toast.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)' }}>{toast.message}</span>
              </div>
            )}

            {histLoading ? (
              <div className="rounded-xl p-10 shadow-sm flex items-center justify-center gap-3" style={s.card}>
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-primary)' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Loading history...</span>
              </div>
            ) : histData ? (
              <>
                {/* Subscription Summary */}
                <div className="rounded-xl p-5 shadow-sm" style={s.card}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2" style={s.textHeading}>
                      <Clock className="w-5 h-5" style={{ color: 'var(--color-primary)' }} /> Subscription History
                    </h3>
                  </div>
                  {histSummary && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Subscriptions', value: histSummary.total_subscriptions || 0, color: 'var(--color-primary)', bg: 'var(--color-primary-bg)' },
                        { label: 'Plan Changes', value: histSummary.total_plan_changes || 0, color: '#d97706', bg: 'rgba(245,158,11,0.08)' },
                        { label: 'Renewals', value: histSummary.total_renewals || 0, color: 'var(--color-success)', bg: 'rgba(16,185,129,0.08)' },
                        { label: 'Trial Periods', value: histSummary.total_trial_periods || 0, color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
                      ].map((item) => (
                        <div key={item.label} className="p-3 rounded-lg" style={{ background: item.bg, border: '1px solid var(--border-light)' }}>
                          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
                          <p className="text-xl font-bold mt-1" style={{ color: item.color }}>{item.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Plan Usage */}
                {histPlanUsage.length > 0 && (
                  <div className="rounded-xl p-5 shadow-sm" style={s.card}>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={s.textHeading}>
                      <Shield className="w-4 h-4" style={{ color: 'var(--color-primary)' }} /> Plan Usage
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {histPlanUsage.map((p) => (
                        <span key={p.plan_id} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg"
                          style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
                          {p.plan_name} <span className="font-bold" style={{ color: 'var(--color-primary)' }}>x{p.times_used}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* History Timeline */}
                <div className="rounded-xl p-5 shadow-sm" style={s.card}>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={s.textHeading}>
                    <Clock className="w-4 h-4" style={{ color: 'var(--color-primary)' }} /> Subscription History
                  </h3>
                  {histData.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                            {['Event', 'Plan', 'Date'].map((h) => (
                              <th key={h} className="text-left py-2.5 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {histData.map((h) => (
                            <tr key={h.id} style={{ borderBottom: '1px solid var(--border-light)' }} className="hover:opacity-80 transition-opacity">
                              <td className="py-3 px-3">
                                <span className="text-sm font-medium px-2.5 py-1 rounded-full"
                                  style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
                                  {h.event_type?.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{h.plan?.name || '—'}</td>
                              <td className="py-3 px-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                                {h.created_at ? new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Clock className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No subscription history yet</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-xl p-10 shadow-sm text-center" style={s.card}>
                <Clock className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No history data available</p>
              </div>
            )}
          </>
        ) : (
          /* ═══════════ BILLING VIEW ═══════════ */
          <>
            {toast && (
              <div style={{
                position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
                padding: '12px 20px', borderRadius: '12px',
                background: toast.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                border: `1px solid ${toast.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)'}`,
                display: 'flex', alignItems: 'center', gap: '8px', boxShadow: 'var(--shadow-md)',
              }}>
                {toast.type === 'success' ? <Check className="w-4 h-4" style={{ color: 'var(--color-success)' }} /> : <AlertTriangle className="w-4 h-4" style={{ color: 'var(--color-danger)' }} />}
                <span style={{ fontSize: '13px', fontWeight: 600, color: toast.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)' }}>{toast.message}</span>
              </div>
            )}

            {billingLoading ? (
              <div className="rounded-xl p-10 shadow-sm flex items-center justify-center gap-3" style={s.card}>
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-primary)' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Loading billing data...</span>
              </div>
            ) : billingData ? (
              <>
                {/* Billing Summary */}
                <div className="rounded-xl p-5 shadow-sm" style={s.card}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2" style={s.textHeading}>
                      <CreditCard className="w-5 h-5" style={{ color: 'var(--color-primary)' }} /> Billing Summary
                    </h3>
                  </div>

                  {billingData.summary && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Total Paid', value: formatCurrency(billingData.summary.total_paid), color: 'var(--color-success)', bg: 'rgba(16,185,129,0.08)' },
                        { label: 'Total Pending', value: formatCurrency(billingData.summary.total_pending), color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.08)' },
                        { label: 'Total Invoices', value: billingData.summary.total_invoices || 0, color: 'var(--color-primary)', bg: 'var(--color-primary-bg)' },
                        { label: 'Current Plan', value: billingData.summary.current_plan?.name || 'None', color: 'var(--text-heading)', bg: 'var(--bg-hover)' },
                      ].map((item) => (
                        <div key={item.label} className="p-3 rounded-lg" style={{ background: item.bg, border: '1px solid var(--border-light)' }}>
                          <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
                          <p className="text-lg font-bold mt-1" style={{ color: item.color }}>{item.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Invoices List */}
                <div className="rounded-xl p-5 shadow-sm" style={s.card}>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={s.textHeading}>
                    <Receipt className="w-4 h-4" style={{ color: 'var(--color-primary)' }} /> Invoice History
                  </h3>
                  {billingData.invoices && billingData.invoices.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <th className="text-left py-2.5 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Invoice</th>
                            <th className="text-center py-2.5 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</th>
                            <th className="text-left py-2.5 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Plan</th>
                            <th className="text-right py-2.5 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total</th>
                            <th className="text-left py-2.5 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Period</th>
                            <th className="text-left py-2.5 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Date</th>
                            <th className="text-center py-2.5 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {billingData.invoices.map((inv) => {
                            const statusMap = {
                              pending:  { bg: 'rgba(245,158,11,0.1)', color: '#d97706', icon: Clock },
                              approved: { bg: 'rgba(16,185,129,0.1)', color: '#059669', icon: CheckCircle },
                              paid:     { bg: 'rgba(16,185,129,0.1)', color: '#059669', icon: CheckCircle },
                              rejected: { bg: 'rgba(239,68,68,0.1)',  color: '#dc2626', icon: XCircle },
                              overdue:  { bg: 'rgba(239,68,68,0.1)',  color: '#dc2626', icon: AlertTriangle },
                            };
                            const sc = statusMap[inv.status] || statusMap.paid;
                            const ScIcon = sc.icon;

                            const formatDateTime = (dateStr) => {
                              if (!dateStr) return null;
                              const d = new Date(dateStr);
                              return {
                                date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                                time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                              };
                            };

                            let displayDate = formatDateTime(inv.created_at);
                            let datePrefix = '';
                            if (inv.approved_at) {
                              displayDate = formatDateTime(inv.approved_at);
                              datePrefix = 'Approved ';
                            } else if (inv.paid_at) {
                              displayDate = formatDateTime(inv.paid_at);
                              datePrefix = '';
                            } else if (inv.due_at) {
                              displayDate = formatDateTime(inv.due_at);
                              datePrefix = 'Due ';
                            }

                            return (
                              <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-light)' }}
                                className="hover:opacity-80 transition-opacity">
                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                                    <span className="font-medium" style={{ color: 'var(--text-heading)' }}>{inv.invoice_number}</span>
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full"
                                    style={{ background: sc.bg, color: sc.color }}>
                                    <ScIcon className="w-3.5 h-3.5" /> {inv.status}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                  {inv.plan?.name || 'N/A'}
                                </td>
                                <td className="py-3 px-3 text-right text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>
                                  {formatCurrency(inv.total_amount, inv.currency)}
                                </td>
                                <td className="py-3 px-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                                  {inv.billing_period_start && inv.billing_period_end
                                    ? <>{new Date(inv.billing_period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(inv.billing_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                                    : inv.billing_period || '—'}
                                </td>
                                <td className="py-3 px-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                                  {displayDate ? (
                                    <div>
                                      <div>{datePrefix}{displayDate.date}</div>
                                      <div className="text-xs opacity-70">{displayDate.time}</div>
                                    </div>
                                  ) : '—'}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    {inv.status === 'pending' && (
                                      <>
                                        <button onClick={() => setApproveModal({ invoiceId: inv.id, invoice: inv })}
                                          className="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors"
                                          style={{ background: 'var(--color-success)', color: '#fff' }}>
                                          Approve
                                        </button>
                                        <button onClick={() => setRejectModal({ invoiceId: inv.id, invoice: inv })}
                                          className="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors"
                                          style={{ background: 'var(--color-danger)', color: '#fff' }}>
                                          Reject
                                        </button>
                                      </>
                                    )}
                                    <button onClick={() => setViewInvoiceModal(inv)}
                                      className="p-1.5 rounded-md transition-colors hover:opacity-80"
                                      style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}
                                      title="View Invoice Details">
                                      <Eye className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Receipt className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No invoices yet</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-xl p-10 shadow-sm text-center" style={s.card}>
                <CreditCard className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No billing data available</p>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => { setConfirmOpen(false); setConfirmConfig({ action: null, title: '', message: '', confirmText: '', danger: true }); }}
        onConfirm={async () => {
          await handleAction(confirmConfig.action);
          setConfirmOpen(false);
          setConfirmConfig({ action: null, title: '', message: '', confirmText: '', danger: true });
        }}
        title={confirmConfig.title} message={confirmConfig.message}
        confirmText={confirmConfig.confirmText} cancelText="Cancel" danger={confirmConfig.danger}
      />

      {deleteModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        }}>
          <div className="rounded-2xl p-6 w-full max-w-md" style={{ background: 'var(--bg-card)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-danger-bg)' }}>
                <AlertTriangle className="w-5 h-5" style={{ color: 'var(--color-danger)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold" style={s.textHeading}>Confirm Delete</h3>
                <p className="text-xs" style={s.textSecondary}>This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm mb-5" style={s.textSecondary}>
              Delete <strong style={s.textHeading}>{deleteModal.count} files</strong> ({deleteModal.size} MB)?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteModal(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
                Cancel
              </button>
              <button onClick={() => handleBulkDelete(deleteModal.type, deleteModal.type === 'old' ? { months: deleteModal.months } : { min_size_gb: deleteModal.minGb })}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2"
                style={{ background: 'var(--color-danger)' }}>
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {approveModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-2xl p-6 w-full max-w-md" style={{ background: 'var(--bg-card)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
                <CheckCircle className="w-5 h-5" style={{ color: 'var(--color-success)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold" style={s.textHeading}>Approve Payment</h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{approveModal.invoice.invoice_number}</p>
              </div>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Confirm that <strong style={s.textHeading}>{formatCurrency(approveModal.invoice.total_amount, approveModal.invoice.currency)}</strong> has been received?
            </p>
            {approveModal.invoice.renewal_reference && (
              <div className="rounded-lg px-3 py-2 mb-4 text-xs" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                Ref: {approveModal.invoice.renewal_reference}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setApproveModal(null)} className="px-4 py-2 rounded-lg text-sm font-medium transition-colors" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>Cancel</button>
              <button onClick={handleApprovePayment} disabled={actionLoading} className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2" style={{ background: 'var(--color-success)' }}>
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {actionLoading ? 'Approving...' : 'Approve Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-2xl p-6 w-full max-w-md" style={{ background: 'var(--bg-card)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
                <XCircle className="w-5 h-5" style={{ color: 'var(--color-danger)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold" style={s.textHeading}>Reject Payment</h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{rejectModal.invoice.invoice_number}</p>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Reason for rejection</label>
              <textarea rows={3} value={rejectModal.reason || ''} onChange={(e) => setRejectModal(prev => ({ ...prev, reason: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg-hover)', color: 'var(--text-heading)', border: '1px solid var(--border-light)' }}
                placeholder="Optional reason..." />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRejectModal(null)} className="px-4 py-2 rounded-lg text-sm font-medium transition-colors" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>Cancel</button>
              <button onClick={handleRejectPayment} disabled={actionLoading} className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2" style={{ background: 'var(--color-danger)' }}>
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                {actionLoading ? 'Rejecting...' : 'Reject Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewInvoiceModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-2xl w-full max-w-lg overflow-hidden" style={{ background: 'var(--bg-card)', boxShadow: 'var(--shadow-lg)' }}>
            {/* Header with TechXaro branding */}
            <div className="px-6 py-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">TechXaro</h3>
                  <p className="text-[10px] text-white/70">Invoice Detail</p>
                </div>
              </div>
              <button onClick={() => setViewInvoiceModal(null)} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Invoice Info */}
            <div className="px-6 py-5">
              {/* Organization Info */}
              <div className="flex items-center gap-3 mb-4 pb-4" style={{ borderBottom: '1px solid var(--border-light)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-primary-bg)' }}>
                  <Building2 className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>{org?.name || 'Organization'}</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>org/{org?.slug}</p>
                </div>
              </div>

              {/* Invoice Number + Status */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Invoice Number</p>
                  <p className="text-sm font-bold font-mono" style={{ color: 'var(--text-heading)' }}>{viewInvoiceModal.invoice_number}</p>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full"
                  style={{
                    background: viewInvoiceModal.status === 'paid' || viewInvoiceModal.status === 'approved' ? 'rgba(16,185,129,0.1)' : viewInvoiceModal.status === 'pending' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                    color: viewInvoiceModal.status === 'paid' || viewInvoiceModal.status === 'approved' ? '#059669' : viewInvoiceModal.status === 'pending' ? '#d97706' : '#dc2626',
                  }}>
                  {viewInvoiceModal.status === 'paid' || viewInvoiceModal.status === 'approved' ? <CheckCircle className="w-3 h-3" /> : viewInvoiceModal.status === 'pending' ? <Clock className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {viewInvoiceModal.status?.toUpperCase()}
                </span>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                  <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Plan</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text-heading)' }}>{viewInvoiceModal.plan?.name || 'N/A'}</p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                  <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Billing Period</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text-heading)' }}>{viewInvoiceModal.billing_period || '—'}</p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                  <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Amount</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text-heading)' }}>{formatCurrency(viewInvoiceModal.amount, viewInvoiceModal.currency)}</p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                  <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Tax</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text-heading)' }}>{formatCurrency(viewInvoiceModal.tax_amount, viewInvoiceModal.currency)}</p>
                </div>
              </div>

              {/* Total */}
              <div className="p-3 rounded-lg mb-4" style={{ background: 'var(--color-primary-bg)', border: '1px solid var(--border-light)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Total Amount</span>
                  <span className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>{formatCurrency(viewInvoiceModal.total_amount, viewInvoiceModal.currency)}</span>
                </div>
              </div>

              {/* Dates */}
              <div className="space-y-2 mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                {viewInvoiceModal.created_at && (
                  <div className="flex justify-between">
                    <span>Created</span>
                    <span style={{ color: 'var(--text-heading)' }}>
                      {new Date(viewInvoiceModal.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' '}
                      {new Date(viewInvoiceModal.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                {viewInvoiceModal.approved_at && (
                  <div className="flex justify-between">
                    <span>Approved</span>
                    <span style={{ color: 'var(--color-success)' }}>
                      {new Date(viewInvoiceModal.approved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' '}
                      {new Date(viewInvoiceModal.approved_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      {viewInvoiceModal.approved_by ? ` by ${viewInvoiceModal.approved_by}` : ''}
                    </span>
                  </div>
                )}
                {viewInvoiceModal.paid_at && (
                  <div className="flex justify-between">
                    <span>Paid</span>
                    <span style={{ color: 'var(--text-heading)' }}>
                      {new Date(viewInvoiceModal.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' '}
                      {new Date(viewInvoiceModal.paid_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                {viewInvoiceModal.rejection_reason && (
                  <div className="flex justify-between">
                    <span>Rejection Reason</span>
                    <span style={{ color: 'var(--color-danger)' }}>{viewInvoiceModal.rejection_reason}</span>
                  </div>
                )}
                {viewInvoiceModal.renewal_reference && (
                  <div className="flex justify-between">
                    <span>Reference</span>
                    <span className="font-mono" style={{ color: 'var(--text-heading)' }}>{viewInvoiceModal.renewal_reference}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-3" style={{ borderTop: '1px solid var(--border-light)' }}>
                <button onClick={async () => { try { await api.downloadInvoice(viewInvoiceModal.id); } catch { setToast({ type: 'error', message: 'Download failed.' }); } }}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  style={{ background: 'var(--color-primary)', color: '#fff' }}>
                  <Download className="w-4 h-4" /> Download Invoice
                </button>
                <button onClick={() => setViewInvoiceModal(null)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <EditOrganizationModal org={org} plans={plans} saving={editSaving} onSave={handleEditSave} onClose={() => setEditOpen(false)} />
      )}

      {showChangePasswordModal && (
        <SuperAdminChangePasswordModal
          org={org}
          onClose={() => setShowChangePasswordModal(false)}
          onSuccess={() => { setToast({ type: 'success', message: 'Admin password updated successfully.' }); }}
        />
      )}
    </div>
  );
}

function EditOrganizationModal({ org, plans, saving, onSave, onClose }) {
  const [step, setStep] = useState(1);
  const [selectedPlanId, setSelectedPlanId] = useState(org.subscription?.plan?.id || null);
  const [billingPeriod, setBillingPeriod] = useState(org.subscription?.billing_period || 'monthly');
  const [selectedCountry, setSelectedCountry] = useState(org.country_code || 'PK');
  const [form, setForm] = useState({
    name: org.name || '', admin_name: org.admin_name || '',
    admin_email: org.admin_email || '', admin_phone: org.admin_phone || '',
  });
  const [showTrialModal, setShowTrialModal] = useState(false);
  const [trialDefaults, setTrialDefaults] = useState(null);
  const [trialCustomization, setTrialCustomization] = useState(
    org.trial_config?.is_custom ? {
      trial_duration: org.trial_config.trial_duration,
      trial_duration_unit: org.trial_config.trial_duration_unit,
      max_users: org.trial_config.max_users,
      max_projects: org.trial_config.max_projects,
      max_storage_gb: org.trial_config.max_storage_gb,
    } : null
  );
  const [showPlanCustomModal, setShowPlanCustomModal] = useState(false);
  const [planCustomization, setPlanCustomization] = useState(
    org.effective_plan?.is_custom ? {
      custom_price_monthly: org.effective_plan.price_monthly,
      custom_price_yearly: org.effective_plan.price_yearly,
      custom_max_users: org.effective_plan.max_users,
      custom_max_projects: org.effective_plan.max_projects,
      custom_max_storage_gb: org.effective_plan.max_storage_gb,
    } : null
  );

  const initialValues = useMemo(() => ({
    name: org.name || '',
    admin_name: org.admin_name || '',
    admin_email: org.admin_email || '',
    admin_phone: org.admin_phone || '',
    country_code: org.country_code || 'PK',
    plan_id: org.subscription?.plan?.id || null,
    billing_period: org.subscription?.billing_period || 'monthly',
  }), [org]);

  const currentValues = useMemo(() => ({
    name: form.name,
    admin_name: form.admin_name,
    admin_email: form.admin_email,
    admin_phone: form.admin_phone,
    country_code: selectedCountry,
    plan_id: selectedPlanId,
    billing_period: billingPeriod,
  }), [form.name, form.admin_name, form.admin_email, form.admin_phone, selectedCountry, selectedPlanId, billingPeriod]);

  const { handleClose, markSaved, ConfirmDialog } = useUnsavedChanges(
    initialValues,
    currentValues,
    onClose,
    { title: 'Unsaved Changes', message: 'You have unsaved changes. Are you sure you want to close?' }
  );

  const isTrialPlan = plans.find(p => p.id === selectedPlanId)?.slug === 'trial';
  const orgTrialConfig = org.trial_config || null;
  const hasCustomTrial = orgTrialConfig?.is_custom || false;

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleEsc = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', handleEsc); };
  }, [handleClose]);

  // Fetch trial defaults when trial plan selected
  useEffect(() => {
    if (isTrialPlan && !trialDefaults) {
      api.getTrialDefaults().then(res => setTrialDefaults(res.data)).catch(() => {});
    }
  }, [isTrialPlan, trialDefaults]);

  const handleNext = () => { if (!form.name || !form.admin_name) return; setStep(2); };
  const handleBack = () => setStep(1);

  const handleSubmit = () => {
    if (!selectedPlanId) return;
    markSaved();
    const payload = {
      name: form.name, admin_name: form.admin_name,
      admin_phone: form.admin_phone ? `${getCountryByCode(selectedCountry).dial} ${form.admin_phone}` : null,
      country_code: selectedCountry,
      plan_id: selectedPlanId, billing_period: billingPeriod,
    };
    if (planCustomization) {
      payload.is_custom = true;
      payload.custom_price_monthly = planCustomization.custom_price_monthly;
      payload.custom_price_yearly = planCustomization.custom_price_yearly;
      payload.custom_max_users = planCustomization.custom_max_users;
      payload.custom_max_projects = planCustomization.custom_max_projects;
      payload.custom_max_storage_gb = planCustomization.custom_max_storage_gb;
    } else {
      payload.is_custom = false;
    }
    const isTrial = plans.find(p => p.id === selectedPlanId)?.slug === 'trial';
    if (isTrial && trialCustomization) {
      payload.customize_trial = true;
      payload.trial_duration = trialCustomization.trial_duration;
      payload.trial_duration_unit = trialCustomization.trial_duration_unit;
      payload.trial_max_users = trialCustomization.max_users;
      payload.trial_max_projects = trialCustomization.max_projects;
      payload.trial_max_storage_gb = trialCustomization.max_storage_gb;
    }
    onSave(payload);
  };

  const selectedPlan = plans.find(p => p.id === selectedPlanId);

  const s = {
    card: { background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '16px' },
    text: { color: 'var(--text-dark)' },
    textSecondary: { color: 'var(--text-secondary)' },
    textMuted: { color: 'var(--text-muted)' },
    textHeading: { color: 'var(--text-heading)' },
    input: { background: 'var(--bg-hover)', color: 'var(--text-dark)', border: 'none' },
    divider: { borderTop: '1px solid var(--border-light)' },
    infoBox: { background: 'var(--color-primary-bg)', border: '1px solid var(--color-primary)' },
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 9999 }}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }} onClick={handleClose}></div>
      <div className="relative rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col" style={{ ...s.card, zIndex: 10000 }}>
        <div className="flex items-center justify-between p-6 pb-4" style={s.divider}>
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2" style={s.textHeading}>
              <Building2 className="w-5 h-5" style={{ color: 'var(--color-primary)' }} /> Edit Organization
            </h2>
            <p className="text-sm mt-1" style={s.textSecondary}>Step {step} of 2 — {step === 1 ? 'Organization Details' : 'Select Plan'}</p>
          </div>
          <button onClick={handleClose} className="p-1 rounded-lg transition-colors cursor-pointer"
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
            Details
          </div>
          <div className="flex-1 h-0.5 rounded" style={{ background: step === 2 ? 'var(--color-success)' : 'var(--bg-hover)' }}></div>
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: step === 2 ? 'var(--color-primary)' : 'var(--text-muted)' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: step === 2 ? 'var(--color-primary)' : 'var(--bg-hover)', color: step === 2 ? '#fff' : 'var(--text-muted)' }}>2</div>
            Plan
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={s.textSecondary}>Organization Name *</label>
                <input type="text" value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  style={s.input} placeholder="Acme Corporation" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={s.textSecondary}>Admin Name *</label>
                <input type="text" value={form.admin_name}
                  onChange={(e) => setForm(prev => ({ ...prev, admin_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  style={s.input} placeholder="John Smith" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={s.textSecondary}>Email</label>
                <input type="email" value={form.admin_email} readOnly
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ ...s.input, opacity: 0.6, cursor: 'not-allowed' }} placeholder="Read-only" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={s.textSecondary}>Country</label>
                <CountrySelect value={selectedCountry} onChange={setSelectedCountry} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={s.textSecondary}>Phone Number</label>
                <div style={{ display: 'flex', gap: 0 }}>
                  <div style={{ padding: '8px 12px', background: 'var(--bg-hover)', borderRight: '1px solid var(--border-light)', borderRadius: '8px 0 0 8px', fontSize: 13, color: 'var(--text-dark)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', userSelect: 'none' }}>
                    <span style={{ fontSize: 14 }}>{flagEmoji(selectedCountry)}</span>
                    <span style={{ fontWeight: 500 }}>{getCountryByCode(selectedCountry).dial}</span>
                  </div>
                  <input type="tel" value={form.admin_phone}
                    onChange={(e) => setForm(prev => ({ ...prev, admin_phone: formatPhoneByCountry(e.target.value, getCountryByCode(selectedCountry)) }))}
                    className="flex-1 px-3 py-2 rounded-r-lg text-sm focus:ring-2 focus:ring-blue-500"
                    style={{ ...s.input, borderRadius: '0 8px 8px 0' }}
                    placeholder={getCountryByCode(selectedCountry).pattern} />
                </div>
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
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                    {p === 'yearly' && <span className="ml-1 text-xs text-emerald-400">Save 20%</span>}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {plans.filter(p => p.is_active).map((plan) => {
                  const isSelected = selectedPlanId === plan.id;
                  const isTrial = plan.slug === 'trial';
                  const hasCustom = isTrial ? (hasCustomTrial && isSelected) : (planCustomization && isSelected);
                  const price = hasCustom && !isTrial
                    ? (billingPeriod === 'monthly' ? planCustomization.custom_price_monthly : planCustomization.custom_price_yearly)
                    : (billingPeriod === 'monthly' ? plan.price_monthly : plan.price_yearly);
                  const users = hasCustom ? (isTrial ? orgTrialConfig?.max_users : planCustomization.custom_max_users) : plan.max_users;
                  const projects = hasCustom ? (isTrial ? orgTrialConfig?.max_projects : planCustomization.custom_max_projects) : plan.max_projects;
                  const storage = hasCustom ? (isTrial ? orgTrialConfig?.max_storage_gb : planCustomization.custom_max_storage_gb) : plan.max_storage_gb;
                  return (
                    <div key={plan.id} onClick={() => { setSelectedPlanId(plan.id); if (!isSelected) setPlanCustomization(null); }}
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
                          {isTrial && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full"
                              style={{ background: 'rgba(147,51,234,0.12)', color: 'var(--color-primary)' }}>{plan.trial_duration || 14} {(plan.trial_duration_unit || 'days').replace(/s$/, '')} Free</span>
                          )}
                          {plan.is_default && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full" style={s.infoBox}>Default</span>
                          )}
                          {hasCustom && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full"
                              style={{ background: isTrial ? 'rgba(147,51,234,0.12)' : 'rgba(245,158,11,0.12)', color: isTrial ? '#9333ea' : '#d97706' }}>Custom</span>
                          )}
                        </div>
                        <p className="text-sm mt-0.5" style={s.textSecondary}>
                          {plan.slug === 'trial' ? (
                            <>Free · {users === 9999 ? 'Unlimited' : users} users · {projects === 9999 ? 'Unlimited' : projects} projects</>
                          ) : (
                            <>
                              ${price}/{billingPeriod === 'monthly' ? 'mo' : 'yr'}
                              <span className="mx-1.5" style={{ color: 'var(--border-light)' }}>·</span>
                              {users === 9999 ? 'Unlimited' : users} users
                              <span className="mx-1.5" style={{ color: 'var(--border-light)' }}>·</span>
                              {projects === 9999 ? 'Unlimited' : projects} projects
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-xs" style={s.textMuted}>{storage === 9999 ? 'Unlimited' : storage} GB storage</div>
                        {isSelected && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); isTrial ? setShowTrialModal(true) : setShowPlanCustomModal(true); }}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors"
                            style={{
                              background: hasCustom ? (isTrial ? 'rgba(147,51,234,0.1)' : 'rgba(245,158,11,0.1)') : 'var(--bg-hover)',
                              color: hasCustom ? (isTrial ? '#9333ea' : '#d97706') : 'var(--text-secondary)',
                              border: hasCustom ? (isTrial ? '1px solid rgba(147,51,234,0.3)' : '1px solid rgba(245,158,11,0.3)') : '1px solid var(--border-light)',
                            }}>
                            <Sliders className="w-3.5 h-3.5" />
                            {hasCustom ? 'Edit Custom' : 'Custom'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}
        </div>

        <div className="flex gap-3 p-6 pt-4" style={s.divider}>
          <button onClick={handleClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>Cancel</button>
          {step === 1 ? (
            <button onClick={handleNext} disabled={!form.name}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed">
              Next <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex-1 flex gap-3">
              <button onClick={handleBack}
                className="py-2.5 px-4 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button onClick={handleSubmit} disabled={saving || !selectedPlanId}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Trial Configuration Modal */}
      {showTrialModal && (
        <TrialConfigurationModal
          mode="organization"
          orgId={org.id}
          initialData={orgTrialConfig?.is_custom ? orgTrialConfig : trialDefaults}
          isCustom={hasCustomTrial}
          onSaved={(data) => {
            setTrialCustomization(data);
            setShowTrialModal(false);
          }}
          onClose={() => setShowTrialModal(false)}
        />
      )}

      {/* Plan Customization Modal */}
      {showPlanCustomModal && selectedPlan && (
        <PlanCustomizeModal
          plan={selectedPlan}
          billingPeriod={billingPeriod}
          initialData={planCustomization}
          isCustom={!!planCustomization}
          onSaved={(data) => {
            setPlanCustomization(data);
            setShowPlanCustomModal(false);
          }}
          onReset={() => {
            setPlanCustomization(null);
            setShowPlanCustomModal(false);
          }}
          onClose={() => setShowPlanCustomModal(false)}
        />
      )}

      <ConfirmModal
        isOpen={storageFileDeleteConfirm.open}
        onClose={() => setStorageFileDeleteConfirm({ open: false, id: null })}
        onConfirm={async (done) => {
          try {
            await handleDeleteStorageRecord(storageFileDeleteConfirm.id);
          } finally {
            setStorageFileDeleteConfirm({ open: false, id: null });
            done();
          }
        }}
        title="Delete File"
        message="Are you sure you want to delete this file? This action cannot be undone."
        confirmText="Delete"
        danger
      />

      {ConfirmDialog}
    </div>
  );
}
