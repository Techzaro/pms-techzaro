import { useState, useEffect } from 'react';
import { Clock, ArrowUpCircle, ArrowDownCircle, RotateCcw, Play, Pause, Ban, CheckCircle, Zap, Calendar, TrendingUp, Users, FolderKanban, CreditCard } from 'lucide-react';
import { api } from '../api/superAdminApi';

const EVENT_CONFIG = {
  trial_started: { label: 'Trial Started', icon: Zap, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  plan_assigned: { label: 'Plan Assigned', icon: Play, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  plan_changed: { label: 'Plan Changed', icon: RotateCcw, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  plan_upgraded: { label: 'Upgraded', icon: ArrowUpCircle, color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  plan_downgraded: { label: 'Downgraded', icon: ArrowDownCircle, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  subscription_renewed: { label: 'Renewed', icon: CheckCircle, color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  subscription_cancelled: { label: 'Cancelled', icon: Ban, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  subscription_suspended: { label: 'Suspended', icon: Pause, color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  subscription_reactivated: { label: 'Reactivated', icon: Play, color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
};

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function SubscriptionHistory({ organizationId, orgCreatedAt }) {
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState(null);
  const [planUsage, setPlanUsage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!organizationId) return;
    loadData();
  }, [organizationId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [historyRes, summaryRes] = await Promise.all([
        api.getSubscriptionHistory(organizationId),
        api.getSubscriptionSummary(organizationId),
      ]);
      setHistory(historyRes.data || []);
      setSummary(summaryRes.data?.summary || {});
      setPlanUsage(summaryRes.data?.plan_usage || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredHistory = filter === 'all'
    ? history
    : history.filter(h => h.event_type === filter);

  if (loading) {
    return (
      <div className="rounded-xl p-5 shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-48" />
          <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl p-5 shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
        <p style={{ color: 'var(--color-danger)', textAlign: 'center' }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Registration Info */}
      <div className="rounded-xl p-5 shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
          <Calendar className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
          Registration
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-lg" style={{ background: 'var(--color-primary-bg)', border: '1px solid var(--color-primary)' }}>
            <p className="text-xs" style={{ color: 'var(--color-primary)' }}>Registered On</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-dark)' }}>{formatDate(orgCreatedAt)}</p>
          </div>
          <div className="p-3 rounded-lg" style={{ background: 'var(--color-primary-bg)', border: '1px solid var(--color-primary)' }}>
            <p className="text-xs" style={{ color: 'var(--color-primary)' }}>Total Events</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-dark)' }}>{history.length}</p>
          </div>
        </div>
      </div>

      {/* Subscription Summary */}
      {summary && (
        <div className="rounded-xl p-5 shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
            <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
            Subscription Summary
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Subscriptions', value: summary.total_subscriptions || 0, color: 'var(--color-primary)' },
              { label: 'Plan Changes', value: summary.total_plan_changes || 0, color: 'var(--color-blue)' },
              { label: 'Renewals', value: summary.total_renewals || 0, color: 'var(--color-success)' },
              { label: 'Trial Periods', value: summary.total_trial_periods || 0, color: '#8b5cf6' },
            ].map((item) => (
              <div key={item.label} className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
                <p className="text-xl font-bold" style={{ color: item.color }}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plan Usage Summary */}
      {planUsage.length > 0 && (
        <div className="rounded-xl p-5 shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
            <CreditCard className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
            Plan Usage
          </h3>
          <div className="space-y-2">
            {planUsage.map((item) => (
              <div key={item.plan_id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-primary-bg)' }}>
                    <CreditCard className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-dark)' }}>{item.plan_name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.plan_slug}</p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
                  {item.times_used} {item.times_used === 1 ? 'time' : 'times'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subscription History Timeline */}
      <div className="rounded-xl p-5 shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
            <Clock className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
            Subscription History
          </h3>
          <div className="flex gap-1 flex-wrap">
            {[
              { value: 'all', label: 'All' },
              { value: 'trial_started', label: 'Trials' },
              { value: 'plan_upgraded', label: 'Upgrades' },
              { value: 'plan_downgraded', label: 'Downgrades' },
              { value: 'subscription_renewed', label: 'Renewals' },
            ].map((f) => (
              <button key={f.value} onClick={() => setFilter(f.value)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: filter === f.value ? 'var(--color-primary)' : 'var(--bg-hover)',
                  color: filter === f.value ? '#fff' : 'var(--text-muted)',
                  border: '1px solid ' + (filter === f.value ? 'var(--color-primary)' : 'var(--border-light)'),
                }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>
            {history.length === 0 ? 'No subscription history recorded yet.' : 'No events match this filter.'}
          </p>
        ) : (
          <div className="space-y-3">
            {filteredHistory.map((item) => {
              const config = EVENT_CONFIG[item.event_type] || EVENT_CONFIG.plan_changed;
              const Icon = config.icon;
              return (
                <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg transition-colors"
                  style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: config.bg }}>
                    <Icon className="w-4.5 h-4.5" style={{ color: config.color, width: 18, height: 18 }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-dark)' }}>
                        {config.label}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: config.bg, color: config.color }}>
                        {item.plan?.name || 'Unknown'}
                      </span>
                      {item.previous_plan && (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          from {item.previous_plan.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span>{formatDateTime(item.created_at)}</span>
                      {item.started_at && item.ended_at && (
                        <span>{formatDate(item.started_at)} → {formatDate(item.ended_at)}</span>
                      )}
                      {item.changed_by && (
                        <span>by {item.changed_by}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {item.amount > 0 && (
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-dark)' }}>${item.amount}</p>
                    )}
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.billing_period}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
