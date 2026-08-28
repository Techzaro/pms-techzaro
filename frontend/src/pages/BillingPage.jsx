import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/layout/DashboardLayout';
import Breadcrumb from '../components/Breadcrumb';
import api from '../lib/api';
import { CreditCard, CheckCircle, Clock, AlertCircle, FileText, TrendingUp, Download, Calendar } from 'lucide-react';
import { formatDate } from '../utils/formatDateTime';

const STATUS_CONFIG = {
  paid: { label: 'Paid', color: 'var(--color-success)', bg: 'var(--color-success-bg)', icon: CheckCircle },
  pending: { label: 'Pending', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', icon: Clock },
  overdue: { label: 'Overdue', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)', icon: AlertCircle },
  cancelled: { label: 'Cancelled', color: 'var(--text-muted)', bg: 'var(--bg-hover)', icon: AlertCircle },
};

function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(amount || 0);
}

export default function BillingPage() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchBilling();
  }, []);

  async function fetchBilling() {
    try {
      const json = await api.get('/organization/billing/invoices');
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      setError(t('Failed to load billing data.', { defaultValue: 'Failed to load billing data.' }));
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateInvoice() {
    setGenerating(true);
    try {
      const json = await api.post('/organization/billing/generate-invoice');
      if (json.success) {
        fetchBilling();
      }
    } catch (err) {
      setError(t('Failed to generate invoice.', { defaultValue: 'Failed to generate invoice.' }));
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout hideRightSidebar>
        <Breadcrumb items={[{ label: t('Settings', { defaultValue: 'Settings' }) }, { label: t('Billing', { defaultValue: 'Billing' }) }]} />
        <div style={{ background: 'var(--bg-card)', borderRadius: '20px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-48" />
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const { invoices = [], summary = {} } = data || {};

  return (
    <DashboardLayout hideRightSidebar>
      <Breadcrumb items={[{ label: t('Settings', { defaultValue: 'Settings' }) }, { label: t('Billing', { defaultValue: 'Billing' }) }]} />

      {/* Billing Summary Card */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '20px', padding: '28px', boxShadow: 'var(--shadow-sm)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>{t('Billing & Invoices', { defaultValue: 'Billing & Invoices' })}</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '4px 0 0' }}>
              {t('Manage your subscription billing and payment history', { defaultValue: 'Manage your subscription billing and payment history' })}
            </p>
          </div>
          <button
            onClick={handleGenerateInvoice}
            disabled={generating}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              borderRadius: '12px', border: 'none', cursor: generating ? 'not-allowed' : 'pointer',
              background: 'var(--color-primary)', color: '#fff', fontSize: '14px', fontWeight: 600,
              opacity: generating ? 0.7 : 1,
            }}
          >
            <FileText style={{ width: '16px', height: '16px' }} />
            {generating ? t('Generating...', { defaultValue: 'Generating...' }) : t('Generate Invoice', { defaultValue: 'Generate Invoice' })}
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          <div style={{ padding: '16px', borderRadius: '14px', background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('Total Paid', { defaultValue: 'Total Paid' })}</p>
            <p style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-success)', margin: '4px 0 0' }}>
              {formatCurrency(summary.total_paid)}
            </p>
          </div>
          <div style={{ padding: '16px', borderRadius: '14px', background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('Pending', { defaultValue: 'Pending' })}</p>
            <p style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-warning)', margin: '4px 0 0' }}>
              {formatCurrency(summary.total_pending)}
            </p>
          </div>
          <div style={{ padding: '16px', borderRadius: '14px', background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('Total Invoices', { defaultValue: 'Total Invoices' })}</p>
            <p style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-primary)', margin: '4px 0 0' }}>
              {summary.total_invoices || 0}
            </p>
          </div>
          {summary.current_plan && (
            <div style={{ padding: '16px', borderRadius: '14px', background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('Current Plan', { defaultValue: 'Current Plan' })}</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-blue)', margin: '4px 0 0' }}>
                {summary.current_plan.name}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                {formatCurrency(summary.current_plan.billing_period === 'yearly' ? summary.current_plan.price_yearly : summary.current_plan.price_monthly)}/{summary.current_plan.billing_period === 'yearly' ? t('yr', { defaultValue: 'yr' }) : t('mo', { defaultValue: 'mo' })}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Invoices List */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '20px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText style={{ width: '18px', height: '18px', color: 'var(--color-primary)' }} />
          {t('Invoice History', { defaultValue: 'Invoice History' })}
        </h3>

        {invoices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <CreditCard style={{ width: '48px', height: '48px', color: 'var(--text-muted)', margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{t('No invoices yet. Generate your first invoice above.', { defaultValue: 'No invoices yet. Generate your first invoice above.' })}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {invoices.map((invoice) => {
              const config = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.pending;
              const StatusIcon = config.icon;
              return (
                <div key={invoice.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px', borderRadius: '14px', background: 'var(--bg-hover)',
                  border: '1px solid var(--border-light)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '10px',
                      background: config.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <StatusIcon style={{ width: '18px', height: '18px', color: config.color }} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dark)', margin: 0 }}>
                          {invoice.invoice_number}
                        </p>
                        <span style={{
                          padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                          background: config.bg, color: config.color,
                        }}>
                          {t(config.label, { defaultValue: config.label })}
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                        {invoice.description || invoice.plan?.name || t('Subscription', { defaultValue: 'Subscription' })}
                        {invoice.billing_period && ` · ${t(invoice.billing_period, { defaultValue: invoice.billing_period })}`}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                        {formatCurrency(invoice.total_amount, invoice.currency)}
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                        {invoice.paid_at
                          ? t("Paid {{date}}", { date: formatDate(invoice.paid_at), defaultValue: `Paid ${formatDate(invoice.paid_at)}` })
                          : invoice.due_at
                            ? t("Due {{date}}", { date: formatDate(invoice.due_at), defaultValue: `Due ${formatDate(invoice.due_at)}` })
                            : formatDate(invoice.created_at)
                        }
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
