import { useState, useEffect } from 'react';
import { CreditCard, Check, X, Users, FolderKanban, HardDrive, Calendar, Clock, Shield, Zap, Star, ArrowUpCircle, ArrowDownCircle, RotateCcw, Play, Pause, Ban, CheckCircle, TrendingUp, Loader2, ChevronDown } from 'lucide-react';
import { api } from './api/superAdminApi';

const STATUS_CONFIG = {
  active: { label: 'Active', color: '#16a34a', bg: '#f0fdf4' },
  trial: { label: 'Trial', color: '#2563eb', bg: '#eff6ff' },
  cancelled: { label: 'Cancelled', color: '#dc2626', bg: '#fef2f2' },
  past_due: { label: 'Past Due', color: '#d97706', bg: '#fffbeb' },
  suspended: { label: 'Suspended', color: '#dc2626', bg: '#fef2f2' },
};

const MODULE_CATEGORY_CONFIG = {
  core: { label: 'Core Features', icon: '\u2605', color: '#4f46e5' },
  standard: { label: 'Standard Features', icon: '\u25c6', color: '#2563eb' },
  enterprise: { label: 'Enterprise Features', icon: '\u25c9', color: '#d97706' },
};

const moduleNameOverrides = { deliverables: 'Subtask' };
function moduleDisplayName(name, slug) {
  return moduleNameOverrides[slug] || name;
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount || 0);
}

export default function SuperAdminSubscriptionPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedBilling, setSelectedBilling] = useState('monthly');
  const [changingPlan, setChangingPlan] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchSubscription = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getMySubscription();
      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to load subscription');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSubscription(); }, []);

  const handleChangePlan = async () => {
    if (!selectedPlanId) return;
    setChangingPlan(true);
    try {
      await api.changeMyPlan(selectedPlanId, selectedBilling);
      setShowPlanModal(false);
      setSelectedPlanId('');
      fetchSubscription();
    } catch (err) {
      alert(err.message || 'Failed to change plan');
    } finally {
      setChangingPlan(false);
    }
  };

  const openPlanModal = async () => {
    try {
      const result = await api.getAvailablePlans();
      setPlans(result.plans || []);
      setSelectedPlanId(data?.plan?.id || '');
      setSelectedBilling(data?.subscription?.billing_period || 'monthly');
      setShowPlanModal(true);
    } catch (err) {
      alert('Failed to load plans');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 80 }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#4f46e5' }} />
        <span style={{ marginLeft: 12, fontSize: 14, color: '#6b7280' }}>Loading subscription...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <p style={{ color: '#dc2626', fontSize: 14 }}>{error}</p>
        <button onClick={fetchSubscription} style={{ marginTop: 12, fontSize: 14, fontWeight: 600, color: '#4f46e5', background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button>
      </div>
    );
  }

  const { subscription, plan, modules, organization, usage, history } = data || {};

  if (!plan) {
    return (
      <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: 40, boxShadow: 'var(--shadow-sm)', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <CreditCard style={{ width: 32, height: 32, color: '#d97706' }} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 8 }}>No Active Plan</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>No subscription plan has been assigned to TechXaro yet.</p>
        <button onClick={openPlanModal} style={{ padding: '10px 24px', borderRadius: 10, background: '#4f46e5', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Assign Plan
        </button>
        {showPlanModal && <PlanChangeModal plans={plans} selectedPlanId={selectedPlanId} setSelectedPlanId={setSelectedPlanId} selectedBilling={selectedBilling} setSelectedBilling={setSelectedBilling} onChange={handleChangePlan} changing={changingPlan} onClose={() => setShowPlanModal(false)} />}
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[subscription?.status] || STATUS_CONFIG.active;
  const enabledModules = modules?.enabled || [];
  const disabledModules = modules?.disabled || [];
  const allModules = [...enabledModules, ...disabledModules];
  const modulesByCategory = allModules.reduce((acc, mod) => {
    const cat = mod.category || 'core';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(mod);
    return acc;
  }, {});

  const isYearly = subscription?.billing_period === 'yearly';
  const currentPrice = isYearly ? plan.price_yearly : plan.price_monthly;
  const priceLabel = isYearly ? '/year' : '/month';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
            TechXaro Subscription
            {organization?.id && (
              <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'var(--color-primary-bg)', color: 'var(--color-primary)', fontFamily: 'monospace', verticalAlign: 'middle' }}>
                #{organization.id}
              </span>
            )}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Manage your organization's subscription plan and billing.</p>
        </div>
        <button onClick={openPlanModal} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, background: '#4f46e5', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <CreditCard style={{ width: 16, height: 16 }} />
          Change Plan
        </button>
      </div>

      {/* Plan Header Card */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: 28, boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>{plan.name} Plan</h2>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: statusConfig.color, background: statusConfig.bg }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                {statusConfig.label}
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>{plan.description || `${plan.name} subscription plan`}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-heading)' }}>{formatCurrency(currentPrice)}</span>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{priceLabel}</span>
            </div>
            {isYearly && (
              <p style={{ fontSize: 12, color: '#16a34a', margin: '4px 0 0', fontWeight: 600 }}>
                Save {Math.round((1 - plan.price_yearly / (plan.price_monthly * 12)) * 100)}% vs monthly
              </p>
            )}
          </div>
        </div>

        {/* Billing Details */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border-light)' }}>
          <InfoItem icon={<Calendar style={{ width: 18, height: 18 }} />} iconBg="#eef2ff" iconColor="#4f46e5" label="Started" value={formatDate(subscription?.starts_at)} />
          {subscription?.ends_at && (
            <InfoItem icon={<Clock style={{ width: 18, height: 18 }} />} iconBg="#fffbeb" iconColor="#d97706" label="Renews" value={formatDate(subscription?.ends_at)} />
          )}
          <InfoItem icon={<CreditCard style={{ width: 18, height: 18 }} />} iconBg="#f0fdf4" iconColor="#16a34a" label="Billing" value={isYearly ? 'Yearly' : 'Monthly'} />
          {usage && (
            <InfoItem icon={<Users style={{ width: 18, height: 18 }} />} iconBg="#f0f9ff" iconColor="#0284c7" label="Usage" value={`${usage.users} users, ${usage.projects} projects`} />
          )}
        </div>
      </div>

      {/* Limits Card */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: 24, boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 16px' }}>Plan Limits</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <LimitCard icon={<Users style={{ width: 20, height: 20 }} />} label="Users" value={plan.max_users} color="#4f46e5" />
          <LimitCard icon={<FolderKanban style={{ width: 20, height: 20 }} />} label="Projects" value={plan.max_projects} color="#2563eb" />
          <LimitCard icon={<HardDrive style={{ width: 20, height: 20 }} />} label="Storage" value={plan.max_storage_gb} suffix={plan.storage_unit || 'GB'} color="#16a34a" />
        </div>
      </div>

      {/* Modules Card */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: 24, boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>Included Modules</h3>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{modules?.total_enabled || 0} active</span>
        </div>
        {allModules.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>No modules available for this plan.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {Object.entries(MODULE_CATEGORY_CONFIG).map(([catKey, catConfig]) => {
              const catModules = modulesByCategory[catKey];
              if (!catModules || catModules.length === 0) return null;
              return (
                <div key={catKey}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: catConfig.color }}>{catConfig.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{catConfig.label}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                    {catModules.map((mod) => (
                      <div key={mod.slug || mod.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: mod.is_enabled ? '#f0fdf4' : 'var(--bg-hover)', border: `1px solid ${mod.is_enabled ? '#bbf7d0' : 'var(--border-light)'}` }}>
                        {mod.is_enabled ? <Check style={{ width: 16, height: 16, color: '#16a34a', flexShrink: 0 }} /> : <X style={{ width: 16, height: 16, color: 'var(--text-muted)', flexShrink: 0 }} />}
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: mod.is_enabled ? 'var(--text-dark)' : 'var(--text-muted)', margin: 0 }}>{moduleDisplayName(mod.name, mod.slug)}</p>
                          {mod.description && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mod.description}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Subscription History */}
      {history && history.length > 0 && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: 24, boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock style={{ width: 18, height: 18, color: '#4f46e5' }} />
            Subscription History
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.map((item) => {
              const eventConfig = {
                trial_started: { label: 'Trial Started', icon: Zap, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
                plan_assigned: { label: 'Plan Assigned', icon: Play, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
                plan_changed: { label: 'Plan Changed', icon: RotateCcw, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
                plan_upgraded: { label: 'Upgraded', icon: ArrowUpCircle, color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
                plan_downgraded: { label: 'Downgraded', icon: ArrowDownCircle, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
                subscription_renewed: { label: 'Renewed', icon: CheckCircle, color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
                subscription_cancelled: { label: 'Cancelled', icon: Ban, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
                subscription_suspended: { label: 'Suspended', icon: Pause, color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
                subscription_reactivated: { label: 'Reactivated', icon: Play, color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
              }[item.event_type] || { label: item.event_type, icon: Clock, color: '#6b7280', bg: 'var(--bg-hover)' };
              const Icon = eventConfig.icon;
              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 12, background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: eventConfig.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon style={{ width: 18, height: 18, color: eventConfig.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-dark)' }}>{eventConfig.label}</span>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: eventConfig.bg, color: eventConfig.color }}>{item.plan?.name || 'Unknown'}</span>
                      {item.previous_plan && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>from {item.previous_plan.name}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                      <span>{new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                      {item.changed_by && <span>by {item.changed_by}</span>}
                    </div>
                  </div>
                  {item.amount > 0 && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-dark)', margin: 0 }}>${item.amount}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{item.billing_period}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Plan Change Modal */}
      {showPlanModal && (
        <PlanChangeModal plans={plans} selectedPlanId={selectedPlanId} setSelectedPlanId={setSelectedPlanId} selectedBilling={selectedBilling} setSelectedBilling={setSelectedBilling} onChange={handleChangePlan} changing={changingPlan} onClose={() => setShowPlanModal(false)} currentPlanId={plan?.id} />
      )}
    </div>
  );
}

function InfoItem({ icon, iconBg, iconColor, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconColor }}>{icon}</div>
      <div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dark)', margin: 0 }}>{value}</p>
      </div>
    </div>
  );
}

function LimitCard({ icon, label, value, suffix = '', color }) {
  const isUnlimited = value >= 9999;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}15`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
        <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-heading)', margin: '2px 0 0' }}>{isUnlimited ? 'Unlimited' : value}{!isUnlimited && suffix ? ` ${suffix}` : ''}</p>
      </div>
    </div>
  );
}

function PlanChangeModal({ plans, selectedPlanId, setSelectedPlanId, selectedBilling, setSelectedBilling, onChange, changing, onClose, currentPlanId }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '80vh', overflow: 'auto', margin: 16 }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>Change Plan</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>
        <div style={{ padding: 24 }}>
          {/* Billing Period Toggle */}
          <div style={{ display: 'flex', gap: 8, padding: 4, background: 'var(--bg-hover)', borderRadius: 12, marginBottom: 20 }}>
            <button onClick={() => setSelectedBilling('monthly')} style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', background: selectedBilling === 'monthly' ? '#4f46e5' : 'transparent', color: selectedBilling === 'monthly' ? '#fff' : 'var(--text-secondary)' }}>Monthly</button>
            <button onClick={() => setSelectedBilling('yearly')} style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', background: selectedBilling === 'yearly' ? '#4f46e5' : 'transparent', color: selectedBilling === 'yearly' ? '#fff' : 'var(--text-secondary)' }}>Yearly</button>
          </div>

          {/* Plan List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {plans.map((p) => {
              const price = selectedBilling === 'yearly' ? p.price_yearly : p.price_monthly;
              const isSelected = selectedPlanId === p.id;
              const isCurrent = currentPlanId === p.id;
              return (
                <div key={p.id} onClick={() => setSelectedPlanId(p.id)} style={{ padding: '14px 16px', borderRadius: 12, cursor: 'pointer', border: `2px solid ${isSelected ? '#4f46e5' : 'var(--border-light)'}`, background: isSelected ? '#eef2ff' : 'var(--bg-hover)', transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-heading)' }}>{p.name}</span>
                        {isCurrent && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: '#dcfce7', color: '#166534' }}>Current</span>}
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>{p.description}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-heading)' }}>{formatCurrency(price)}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>/{selectedBilling === 'yearly' ? 'yr' : 'mo'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>{p.max_users >= 9999 ? 'Unlimited' : p.max_users} users</span>
                    <span>{p.max_projects >= 9999 ? 'Unlimited' : p.max_projects} projects</span>
                    <span>{p.max_storage_gb} {p.storage_unit || 'GB'} storage</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border-light)', background: 'var(--bg-hover)', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>Cancel</button>
          <button onClick={onChange} disabled={changing || !selectedPlanId} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: changing || !selectedPlanId ? '#94a3b8' : '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 600, cursor: changing || !selectedPlanId ? 'not-allowed' : 'pointer' }}>
            {changing ? 'Changing...' : 'Confirm Change'}
          </button>
        </div>
      </div>
    </div>
  );
}
