import { useState, useEffect } from 'react';
import { useOrgSubscription } from '../hooks/useOrgSubscription';
import DashboardLayout from '../components/layout/DashboardLayout';
import Breadcrumb from '../components/Breadcrumb';
import api from '../lib/api';
import { CreditCard, Check, X, Users, FolderKanban, HardDrive, Calendar, Clock, Shield, Zap, Star, ArrowUpCircle, ArrowDownCircle, RotateCcw, Play, Pause, Ban, CheckCircle, TrendingUp } from 'lucide-react';

const moduleNameOverrides = { deliverables: 'Subtask' };
function moduleDisplayName(name, slug) {
  return moduleNameOverrides[slug] || name;
}

const STATUS_CONFIG = {
  active: { label: 'Active', color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
  trial: { label: 'Trial', color: 'var(--color-blue)', bg: 'var(--color-blue-bg)' },
  cancelled: { label: 'Cancelled', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
  past_due: { label: 'Past Due', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
  suspended: { label: 'Suspended', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
};

const MODULE_CATEGORY_CONFIG = {
  core: { label: 'Core Features', icon: '★', color: 'var(--color-primary)' },
  standard: { label: 'Standard Features', icon: '◆', color: 'var(--color-blue)' },
  enterprise: { label: 'Enterprise Features', icon: '◉', color: 'var(--color-warning)' },
};

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export default function SubscriptionPage() {
  const { data, isLoading, error } = useOrgSubscription();
  const [now, setNow] = useState(new Date());
  const [subHistory, setSubHistory] = useState([]);
  const [subSummary, setSubSummary] = useState(null);
  const [planUsage, setPlanUsage] = useState([]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const json = await api.get('/organization-settings/subscription-history');
        if (json.success) {
          setSubHistory(json.history || []);
          setSubSummary(json.summary || {});
          setPlanUsage(json.plan_usage || []);
        }
      } catch {}
    }
    fetchHistory();
  }, []);

  if (isLoading) {
    return (
      <DashboardLayout hideRightSidebar>
        <Breadcrumb items={[{ label: 'Settings' }, { label: 'Subscription' }]} />
        <div style={{ background: 'var(--bg-card)', borderRadius: '20px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-48" />
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout hideRightSidebar>
        <Breadcrumb items={[{ label: 'Settings' }, { label: 'Subscription' }]} />
        <div style={{ background: 'var(--bg-card)', borderRadius: '20px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
          <p style={{ color: 'var(--color-danger)', textAlign: 'center', padding: '20px 0' }}>
            Failed to load subscription details. Please try again.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const { subscription, plan, modules, organization, trial_config } = data || {};

  if (organization?.is_owner) {
    return (
      <DashboardLayout hideRightSidebar>
        <Breadcrumb items={[{ label: 'Settings' }, { label: 'Subscription' }]} />
        <div style={{ background: 'var(--bg-card)', borderRadius: '20px', padding: '40px', boxShadow: 'var(--shadow-sm)', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--color-primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Shield style={{ width: '32px', height: '32px', color: 'var(--color-primary)' }} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '8px' }}>Owner Organization</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            This organization has full platform access with unlimited features.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  if (!plan) {
    return (
      <DashboardLayout hideRightSidebar>
        <Breadcrumb items={[{ label: 'Settings' }, { label: 'Subscription' }]} />
        <div style={{ background: 'var(--bg-card)', borderRadius: '20px', padding: '40px', boxShadow: 'var(--shadow-sm)', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--color-warning-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <CreditCard style={{ width: '32px', height: '32px', color: 'var(--color-warning)' }} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '8px' }}>No Active Plan</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            No subscription plan has been assigned to this organization yet.
          </p>
        </div>
      </DashboardLayout>
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
    <DashboardLayout hideRightSidebar>
      <Breadcrumb items={[{ label: 'Settings' }, { label: 'Subscription' }]} />

      {/* Plan Header Card */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '20px',
        padding: '28px',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                {plan.name} Plan
              </h1>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
                color: statusConfig.color,
                background: statusConfig.bg,
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
                {statusConfig.label}
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
              {trial_config
                ? `Free ${trial_config.trial_duration} ${trial_config.trial_duration_unit} trial`
                : (plan.description || `${plan.name} subscription plan`)}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-heading)' }}>
                {formatCurrency(currentPrice)}
              </span>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{priceLabel}</span>
            </div>
            {isYearly && (
              <p style={{ fontSize: '12px', color: 'var(--color-success)', margin: '4px 0 0', fontWeight: 600 }}>
                Save {Math.round((1 - plan.price_yearly / (plan.price_monthly * 12)) * 100)}% vs monthly
              </p>
            )}
          </div>
        </div>

        {/* Billing Details */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
          marginTop: '24px',
          paddingTop: '20px',
          borderTop: '1px solid var(--border-light)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'var(--color-primary-bg)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Calendar style={{ width: '18px', height: '18px', color: 'var(--color-primary)' }} />
            </div>
            <div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Started</p>
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dark)', margin: 0 }}>{formatDate(subscription?.starts_at)}</p>
            </div>
          </div>

          {subscription?.starts_at && trial_config && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'var(--color-warning-bg)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Clock style={{ width: '18px', height: '18px', color: 'var(--color-warning)' }} />
              </div>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {subscription?.status === 'trial' ? 'Expires' : 'Renews'}
                </p>
                {(() => {
                  const endDate = subscription?.ends_at ? new Date(subscription.ends_at) : null;
                  if (!endDate) return null;
                  const diffMs = endDate - now;
                  const unit = trial_config.trial_duration_unit || 'days';
                  const timeLeft = diffMs <= 0 ? null
                    : unit === 'minutes' ? `${Math.floor(diffMs / 60000)} min left`
                    : unit === 'hours' ? `${Math.floor(diffMs / 3600000)} hr left`
                    : `${Math.ceil(diffMs / 86400000)} days left`;
                  return (
                    <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dark)', margin: 0 }}>
                      {formatDate(endDate.toISOString())}
                      {timeLeft && (
                        <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '6px' }}>
                          ({timeLeft})
                        </span>
                      )}
                    </p>
                  );
                })()}
              </div>
            </div>
          )}

          {!trial_config && subscription?.ends_at && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'var(--color-warning-bg)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Clock style={{ width: '18px', height: '18px', color: 'var(--color-warning)' }} />
              </div>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Renews</p>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dark)', margin: 0 }}>{formatDate(subscription?.ends_at)}</p>
              </div>
            </div>
          )}

          {!trial_config && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'var(--color-success-bg)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <CreditCard style={{ width: '18px', height: '18px', color: 'var(--color-success)' }} />
              </div>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Billing</p>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dark)', margin: 0 }}>{isYearly ? 'Yearly' : 'Monthly'}</p>
              </div>
            </div>
          )}
          {trial_config && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'var(--color-primary-bg)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Zap style={{ width: '18px', height: '18px', color: 'var(--color-primary)' }} />
              </div>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Duration</p>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dark)', margin: 0 }}>
                  {trial_config.trial_duration} {trial_config.trial_duration_unit}
                  {subscription?.ends_at && (() => {
                    const diffMs = new Date(subscription.ends_at) - now;
                    if (diffMs <= 0) return <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--color-danger)', marginLeft: '6px' }}>(Expired)</span>;
                    const unit = trial_config.trial_duration_unit;
                    const timeLeft = unit === 'minutes'
                      ? `${Math.max(0, Math.floor(diffMs / 60000))} min left`
                      : unit === 'hours' ? `${Math.max(0, Math.floor(diffMs / 3600000))} hr left`
                      : `${Math.max(0, Math.ceil(diffMs / 86400000))} days left`;
                    return <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--color-success)', marginLeft: '6px' }}>({timeLeft})</span>;
                  })()}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Limits Card */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '20px',
        padding: '24px',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: '20px',
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 16px' }}>Plan Limits</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <LimitCard
            icon={<Users style={{ width: '20px', height: '20px' }} />}
            label="Users"
            value={plan.max_users}
            color="var(--color-primary)"
          />
          <LimitCard
            icon={<FolderKanban style={{ width: '20px', height: '20px' }} />}
            label="Projects"
            value={plan.max_projects}
            color="var(--color-blue)"
          />
          <LimitCard
            icon={<HardDrive style={{ width: '20px', height: '20px' }} />}
            label="Storage"
            value={plan.max_storage_gb}
            suffix="GB"
            color="var(--color-success)"
          />
        </div>
      </div>

      {/* Modules Card */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '20px',
        padding: '24px',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
            Included Modules
          </h3>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {modules?.total_enabled || 0} active
          </span>
        </div>

        {allModules.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
            No modules available for this plan.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {Object.entries(MODULE_CATEGORY_CONFIG).map(([catKey, catConfig]) => {
              const catModules = modulesByCategory[catKey];
              if (!catModules || catModules.length === 0) return null;
              return (
                <div key={catKey}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '12px', color: catConfig.color }}>{catConfig.icon}</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {catConfig.label}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                    {catModules.map((mod) => (
                      <div key={mod.slug || mod.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 14px',
                        borderRadius: '12px',
                        background: mod.is_enabled ? 'var(--color-success-bg)' : 'var(--bg-hover)',
                        border: `1px solid ${mod.is_enabled ? 'var(--color-success)' : 'var(--border-light)'}`,
                      }}>
                        {mod.is_enabled ? (
                          <Check style={{ width: '16px', height: '16px', color: 'var(--color-success)', flexShrink: 0 }} />
                        ) : (
                          <X style={{ width: '16px', height: '16px', color: 'var(--text-muted)', flexShrink: 0 }} />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <p style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: mod.is_enabled ? 'var(--text-dark)' : 'var(--text-muted)',
                            margin: 0,
                          }}>
                            {moduleDisplayName(mod.name, mod.slug)}
                          </p>
                          {mod.description && (
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {mod.description}
                            </p>
                          )}
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

      {/* Benefits Card */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '20px',
        padding: '24px',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 16px' }}>
          Plan Benefits
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
          <BenefitItem
            icon={<Users style={{ width: '16px', height: '16px' }} />}
            text={`Up to ${plan.max_users >= 9999 ? 'unlimited' : plan.max_users} team members`}
          />
          <BenefitItem
            icon={<FolderKanban style={{ width: '16px', height: '16px' }} />}
            text={`${plan.max_projects >= 9999 ? 'Unlimited' : plan.max_projects} active projects`}
          />
          <BenefitItem
            icon={<HardDrive style={{ width: '16px', height: '16px' }} />}
            text={`${plan.max_storage_gb} GB file storage`}
          />
          <BenefitItem
            icon={<Star style={{ width: '16px', height: '16px' }} />}
            text={`${modules?.total_enabled || 0} feature modules included`}
          />
          {enabledModules.some(m => m.category === 'standard') && (
            <BenefitItem
              icon={<Zap style={{ width: '16px', height: '16px' }} />}
              text="Advanced reporting & analytics"
            />
          )}
          {enabledModules.some(m => m.category === 'enterprise') && (
            <BenefitItem
              icon={<Shield style={{ width: '16px', height: '16px' }} />}
              text="Enterprise-grade features & support"
            />
          )}
          <BenefitItem
            icon={<Calendar style={{ width: '16px', height: '16px' }} />}
            text="Calendar & event management"
          />
          <BenefitItem
            icon={<Check style={{ width: '16px', height: '16px' }} />}
            text="Real-time notifications & chat"
          />
        </div>
      </div>

      {/* Subscription Summary */}
      {subSummary && subSummary.total_subscriptions > 0 && (
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '20px',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '20px',
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp style={{ width: '18px', height: '18px', color: 'var(--color-primary)' }} />
            Subscription Summary
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
            {[
              { label: 'Total Subscriptions', value: subSummary.total_subscriptions || 0, color: 'var(--color-primary)' },
              { label: 'Plan Changes', value: subSummary.total_plan_changes || 0, color: 'var(--color-blue)' },
              { label: 'Renewals', value: subSummary.total_renewals || 0, color: 'var(--color-success)' },
              { label: 'Trial Periods', value: subSummary.total_trial_periods || 0, color: '#8b5cf6' },
            ].map((item) => (
              <div key={item.label} style={{
                padding: '14px',
                borderRadius: '12px',
                background: 'var(--bg-hover)',
                border: '1px solid var(--border-light)',
              }}>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</p>
                <p style={{ fontSize: '22px', fontWeight: 700, color: item.color, margin: '4px 0 0' }}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plan Usage */}
      {planUsage.length > 0 && (
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '20px',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '20px',
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CreditCard style={{ width: '18px', height: '18px', color: 'var(--color-primary)' }} />
            Plan Usage
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {planUsage.map((item) => (
              <div key={item.plan_id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: '12px',
                background: 'var(--bg-hover)',
                border: '1px solid var(--border-light)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--color-primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CreditCard style={{ width: '16px', height: '16px', color: 'var(--color-primary)' }} />
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dark)' }}>{item.plan_name}</span>
                </div>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: 'var(--color-primary-bg)',
                  color: 'var(--color-primary)',
                }}>
                  {item.times_used} {item.times_used === 1 ? 'time' : 'times'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subscription History Timeline */}
      {subHistory.length > 0 && (
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '20px',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '20px',
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock style={{ width: '18px', height: '18px', color: 'var(--color-primary)' }} />
            Subscription History
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {subHistory.map((item) => {
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
              }[item.event_type] || { label: item.event_type, icon: Clock, color: 'var(--text-muted)', bg: 'var(--bg-hover)' };
              const Icon = eventConfig.icon;
              return (
                <div key={item.id} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '14px',
                  borderRadius: '12px',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-light)',
                }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    background: eventConfig.bg, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon style={{ width: '18px', height: '18px', color: eventConfig.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dark)' }}>{eventConfig.label}</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                        background: eventConfig.bg, color: eventConfig.color,
                      }}>{item.plan?.name || 'Unknown'}</span>
                      {item.previous_plan && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>from {item.previous_plan.name}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <span>{new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                      {item.changed_by && <span>by {item.changed_by}</span>}
                    </div>
                  </div>
                  {item.amount > 0 && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dark)', margin: 0 }}>${item.amount}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>{item.billing_period}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function LimitCard({ icon, label, value, suffix = '', color }) {
  const isUnlimited = value === 9999;
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      padding: '16px',
      borderRadius: '14px',
      background: 'var(--bg-hover)',
      border: '1px solid var(--border-light)',
    }}>
      <div style={{
        width: '44px',
        height: '44px',
        borderRadius: '12px',
        background: `${color}15`,
        color: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
        <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-heading)', margin: '2px 0 0' }}>
          {isUnlimited ? 'Unlimited' : value}{!isUnlimited && suffix ? ` ${suffix}` : ''}
        </p>
      </div>
    </div>
  );
}

function BenefitItem({ icon, text }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '12px 14px',
      borderRadius: '10px',
      background: 'var(--bg-hover)',
    }}>
      <div style={{ color: 'var(--color-success)', flexShrink: 0 }}>{icon}</div>
      <span style={{ fontSize: '13px', color: 'var(--text-dark)', fontWeight: 500 }}>{text}</span>
    </div>
  );
}
