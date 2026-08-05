import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, Users, FolderKanban, Database, Globe, Calendar,
  Shield, Loader2, Mail, User, Phone, MailCheck, CreditCard, HardDrive, Check, Pencil, X, ArrowRight, Clock, Settings2, RotateCcw,
} from 'lucide-react';
import StatusBadge from './components/StatusBadge';
import { LoadingState, ErrorState } from './components/LoadingState';
import { api } from './api/superAdminApi';
import ConfirmModal from '../../components/ConfirmModal';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import TrialConfigurationModal from './components/TrialConfigurationModal';
import SubscriptionHistory from './components/SubscriptionHistory';

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
            <h1 className="text-2xl font-bold" style={s.textHeading}>{org.name}</h1>
            <StatusBadge status={org.status} />
          </div>
          <p className="text-sm mt-0.5" style={s.textSecondary}>{org.slug}.{import.meta.env.VITE_TENANT_DOMAIN || 'pms.test'}</p>
        </div>
        <div className="flex items-center gap-2">
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
        <div className="rounded-xl p-5 shadow-sm" style={s.card}>
          <h3 className="text-lg font-semibold mb-4" style={s.textHeading}>Admin Details</h3>
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
            { icon: Globe, label: 'Domain', value: org.primary_domain?.domain || org.slug + '.' + (import.meta.env.VITE_TENANT_DOMAIN || 'pms.test') },
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
                    ${org.subscription.billing_period === 'yearly' ? org.subscription.plan.price_yearly : org.subscription.plan.price_monthly}
                  </p>
                  <p className="text-sm" style={s.textSecondary}>/{org.subscription.billing_period === 'yearly' ? 'year' : 'month'}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-3" style={s.divider}>
                {[
                  { icon: Users, label: 'Users', value: org.subscription.plan.slug === 'trial' && org.trial_config ? org.trial_config.max_users : (org.subscription.plan.max_users === 9999 ? 'Unlimited' : org.subscription.plan.max_users) },
                  { icon: FolderKanban, label: 'Projects', value: org.subscription.plan.slug === 'trial' && org.trial_config ? org.trial_config.max_projects : (org.subscription.plan.max_projects === 9999 ? 'Unlimited' : org.subscription.plan.max_projects) },
                  { icon: HardDrive, label: 'Storage', value: `${org.subscription.plan.slug === 'trial' && org.trial_config ? org.trial_config.max_storage_gb : org.subscription.plan.max_storage_gb} GB` },
                ].map((item) => (
                  <div key={item.label} className="p-3 rounded-lg" style={s.infoBox}>
                    <div className="flex items-center gap-2 mb-1">
                      <item.icon className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
                      <p className="text-xs" style={{ color: 'var(--color-primary)' }}>{item.label}</p>
                    </div>
                    <p className="text-lg font-semibold" style={s.text}>{item.value}</p>
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

        {/* Subscription History */}
        <SubscriptionHistory organizationId={org.id} orgCreatedAt={org.created_at} />
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

      {editOpen && (
        <EditOrganizationModal org={org} plans={plans} saving={editSaving} onSave={handleEditSave} onClose={() => setEditOpen(false)} />
      )}
    </div>
  );
}

function EditOrganizationModal({ org, plans, saving, onSave, onClose }) {
  const [step, setStep] = useState(1);
  const [selectedPlanId, setSelectedPlanId] = useState(org.subscription?.plan?.id || null);
  const [billingPeriod, setBillingPeriod] = useState(org.subscription?.billing_period || 'monthly');
  const [form, setForm] = useState({
    name: org.name || '', admin_name: org.admin_name || '',
    admin_email: org.admin_email || '', admin_phone: formatPhone(org.admin_phone || ''),
  });
  const [showTrialModal, setShowTrialModal] = useState(false);
  const [trialDefaults, setTrialDefaults] = useState(null);

  const initialValues = useMemo(() => ({
    name: org.name || '',
    admin_name: org.admin_name || '',
    admin_email: org.admin_email || '',
    admin_phone: formatPhone(org.admin_phone || ''),
    plan_id: org.subscription?.plan?.id || null,
    billing_period: org.subscription?.billing_period || 'monthly',
  }), [org]);

  const currentValues = useMemo(() => ({
    name: form.name,
    admin_name: form.admin_name,
    admin_email: form.admin_email,
    admin_phone: form.admin_phone,
    plan_id: selectedPlanId,
    billing_period: billingPeriod,
  }), [form.name, form.admin_name, form.admin_email, form.admin_phone, selectedPlanId, billingPeriod]);

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
    onSave({
      name: form.name, admin_name: form.admin_name,
      admin_phone: form.admin_phone ? stripDashes(form.admin_phone) : null,
      plan_id: selectedPlanId, billing_period: billingPeriod,
    });
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
              {[
                { label: 'Company Name *', key: 'name', type: 'text', placeholder: 'Acme Corporation' },
                { label: 'Admin Name *', key: 'admin_name', type: 'text', placeholder: 'John Smith' },
                { label: 'Email', key: 'admin_email', type: 'email', placeholder: 'Read-only', readOnly: true },
                { label: 'Phone Number', key: 'admin_phone', type: 'text', placeholder: '03XX-XXXXXXX', maxLength: 12 },
              ].map(({ label, key, type, placeholder, readOnly, maxLength }) => (
                <div key={key}>
                  <label className="block text-sm font-medium mb-1" style={s.textSecondary}>{label}</label>
                  <input type={type} value={form[key]} readOnly={readOnly} maxLength={maxLength}
                    onChange={(e) => {
                      if (key === 'admin_phone') setForm(prev => ({ ...prev, [key]: formatPhone(e.target.value) }));
                      else setForm(prev => ({ ...prev, [key]: e.target.value }));
                    }}
                    className="w-full px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    style={{ ...s.input, opacity: readOnly ? 0.6 : 1, cursor: readOnly ? 'not-allowed' : 'auto' }}
                    placeholder={placeholder} />
                </div>
              ))}
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
                  const price = billingPeriod === 'monthly' ? plan.price_monthly : plan.price_yearly;
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
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full" style={s.infoBox}>Default</span>
                          )}
                        </div>
                        <p className="text-sm mt-0.5" style={s.textSecondary}>
                          {plan.slug === 'trial' ? (
                            <>Free · {plan.max_users} users · {plan.max_projects} projects</>
                          ) : (
                            <>
                              ${price}/{billingPeriod === 'monthly' ? 'mo' : 'yr'}
                              <span className="mx-1.5" style={{ color: 'var(--border-light)' }}>·</span>
                              {plan.max_users === 9999 ? 'Unlimited' : plan.max_users} users
                              <span className="mx-1.5" style={{ color: 'var(--border-light)' }}>·</span>
                              {plan.max_projects === 9999 ? 'Unlimited' : plan.max_projects} projects
                            </>
                          )}
                        </p>
                      </div>
                      <div className="text-right text-xs" style={s.textMuted}>{plan.max_storage_gb} GB storage</div>
                    </div>
                  );
                })}
              </div>

              {/* Trial Configuration Section */}
              {isTrialPlan && (
                <div className="mt-4 p-4 rounded-xl border" style={{ borderColor: 'var(--border-light)', background: 'var(--bg-card)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium" style={s.textHeading}>Trial Configuration</p>
                      <p className="text-xs mt-0.5" style={s.textMuted}>
                        {hasCustomTrial
                          ? 'Custom settings for this organization'
                          : 'Using default from Plans page'}
                      </p>
                      {orgTrialConfig && (
                        <div className="mt-1 flex gap-2 text-xs" style={s.textSecondary}>
                          <span>{orgTrialConfig.trial_duration} {orgTrialConfig.trial_duration_unit}</span>
                          <span>·</span>
                          <span>{orgTrialConfig.max_users} users</span>
                          <span>·</span>
                          <span>{orgTrialConfig.max_projects} projects</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {hasCustomTrial && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full"
                          style={{ background: 'rgba(147,51,234,0.1)', color: '#9333ea' }}>Custom</span>
                      )}
                      <button type="button" onClick={() => setShowTrialModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                        style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
                        <Settings2 className="w-3.5 h-3.5" />
                        {hasCustomTrial ? 'Edit Trial' : 'Customize Trial'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

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
          onSaved={() => {
            setShowTrialModal(false);
            onSave({ name: form.name, admin_name: form.admin_name, _refreshTrial: true });
          }}
          onClose={() => setShowTrialModal(false)}
        />
      )}

      {ConfirmDialog}
    </div>
  );
}
