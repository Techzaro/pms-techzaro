import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Building2, Loader2, CheckCircle, Clock, DollarSign, ArrowUpRight, Search, XCircle, AlertTriangle, Eye, X, Download } from 'lucide-react';
import { api } from './api/superAdminApi';

function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount || 0);
}

const STATUS_CONFIG = {
  pending:  { bg: 'rgba(245,158,11,0.1)', color: '#d97706', icon: Clock, labelKey: 'Pending', defaultLabel: 'Pending' },
  approved: { bg: 'rgba(16,185,129,0.1)', color: '#059669', icon: CheckCircle, labelKey: 'Approved', defaultLabel: 'Approved' },
  paid:     { bg: 'rgba(16,185,129,0.1)', color: '#059669', icon: CheckCircle, labelKey: 'Paid', defaultLabel: 'Paid' },
  rejected: { bg: 'rgba(239,68,68,0.1)',  color: '#dc2626', icon: XCircle,    labelKey: 'Rejected', defaultLabel: 'Rejected' },
  overdue:  { bg: 'rgba(239,68,68,0.1)',  color: '#dc2626', icon: AlertTriangle, labelKey: 'Overdue', defaultLabel: 'Overdue' },
  cancelled:{ bg: 'var(--bg-hover)', color: 'var(--text-muted)', icon: XCircle, labelKey: 'Cancelled', defaultLabel: 'Cancelled' },
};

export default function SuperBillingPage() {
  const { t } = useTranslation();
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [approveModal, setApproveModal] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [viewInvoiceModal, setViewInvoiceModal] = useState(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getOrganizations();
      const orgList = res.data || [];
      const enriched = await Promise.all(
        orgList.map(async (org) => {
          try {
            const billing = await api.getOrgBilling(org.id);
            return { ...org, billing };
          } catch {
            return { ...org, billing: { invoices: [], summary: {} } };
          }
        })
      );
      setOrgs(enriched);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleApprove = async () => {
    if (!approveModal) return;
    setActionLoading(true);
    try {
      const res = await api.approvePayment(approveModal.invoiceId, approveModal.notes);
      if (res.success) {
        setToast({ type: 'success', message: t('Payment approved successfully.', { defaultValue: 'Payment approved successfully.' }) });
        setApproveModal(null);
        load();
      } else {
        setToast({ type: 'error', message: res.message || t('Failed to approve payment.', { defaultValue: 'Failed to approve payment.' }) });
      }
    } catch (e) {
      setToast({ type: 'error', message: t('Failed to approve payment.', { defaultValue: 'Failed to approve payment.' }) });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setActionLoading(true);
    try {
      const res = await api.rejectPayment(rejectModal.invoiceId, rejectModal.reason);
      if (res.success) {
        setToast({ type: 'success', message: t('Payment rejected.', { defaultValue: 'Payment rejected.' }) });
        setRejectModal(null);
        load();
      } else {
        setToast({ type: 'error', message: res.message || t('Failed to reject payment.', { defaultValue: 'Failed to reject payment.' }) });
      }
    } catch (e) {
      setToast({ type: 'error', message: t('Failed to reject payment.', { defaultValue: 'Failed to reject payment.' }) });
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = orgs.filter((org) =>
    org.name?.toLowerCase().includes(search.toLowerCase()) ||
    org.slug?.toLowerCase().includes(search.toLowerCase())
  );

  const totalPaid = orgs.reduce((sum, org) => sum + (org.billing?.summary?.total_paid || 0), 0);
  const totalPending = orgs.reduce((sum, org) => sum + (org.billing?.summary?.total_pending || 0), 0);
  const totalInvoices = orgs.reduce((sum, org) => sum + (org.billing?.summary?.total_invoices || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-primary)' }} />
        <span className="ml-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{t('Loading billing data...', { defaultValue: 'Loading billing data...' })}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
          padding: '12px 20px', borderRadius: '12px',
          background: toast.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
          border: `1px solid ${toast.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)'}`,
          display: 'flex', alignItems: 'center', gap: '8px', boxShadow: 'var(--shadow-md)',
        }}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" style={{ color: 'var(--color-success)' }} /> : <AlertTriangle className="w-4 h-4" style={{ color: 'var(--color-danger)' }} />}
          <span style={{ fontSize: '13px', fontWeight: 600, color: toast.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)' }}>{toast.message}</span>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>{t('Billing Overview', { defaultValue: 'Billing Overview' })}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{t('Track billing and invoices across all organizations', { defaultValue: 'Track billing and invoices across all organizations' })}</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: DollarSign, labelKey: 'Total Billing', defaultLabel: 'Total Billing', value: formatCurrency(totalPaid + totalPending), color: 'var(--color-primary)', bg: 'var(--color-primary-bg)' },
          { icon: CheckCircle, labelKey: 'Approved / Collected', defaultLabel: 'Approved / Collected', value: formatCurrency(totalPaid), color: 'var(--color-success)', bg: 'rgba(16,185,129,0.08)' },
          { icon: Clock, labelKey: 'Pending Approval', defaultLabel: 'Pending Approval', value: formatCurrency(totalPending), color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.08)' },
        ].map((item) => (
          <div key={item.labelKey} className="rounded-xl p-4 shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: item.bg }}>
                <item.icon className="w-5 h-5" style={{ color: item.color }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t(item.labelKey, { defaultValue: item.defaultLabel })}</p>
                <p className="text-lg font-bold" style={{ color: item.color }}>{item.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search organizations...", { defaultValue: "Search organizations..." })}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', color: 'var(--text-dark)' }}
          />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
          {['all', 'pending', 'approved'].map((f) => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
              style={{
                background: statusFilter === f ? 'var(--color-primary)' : 'transparent',
                color: statusFilter === f ? '#fff' : 'var(--text-secondary)',
              }}>
              {t(f.charAt(0).toUpperCase() + f.slice(1), { defaultValue: f.charAt(0).toUpperCase() + f.slice(1) })}
            </button>
          ))}
        </div>
      </div>

      {/* Org Billing Boxes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filtered.map((org) => {
          const summary = org.billing?.summary || {};
          const invoices = org.billing?.invoices || [];
          const filteredInvoices = statusFilter === 'all' ? invoices : invoices.filter(inv => inv.status === statusFilter);
          const paidAmount = summary.total_paid || 0;
          const pendingAmount = summary.total_pending || 0;

          return (
            <div
              key={org.id}
              className="rounded-xl shadow-sm transition-all hover:shadow-md group"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', overflow: 'hidden' }}
            >
              {/* Header */}
              <div className="p-5 pb-0">
                <div className="flex items-center justify-between mb-4 cursor-pointer" onClick={() => navigate(`/super-admin/organizations/${org.id}?tab=billing`)}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-primary-bg)' }}>
                      <Building2 className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-heading)' }}>{org.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{summary.current_plan?.name || t('No plan', { defaultValue: 'No plan' })}</p>
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 flex-shrink-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5" style={{ color: 'var(--text-muted)' }} />
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                    <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{t('Paid', { defaultValue: 'Paid' })}</p>
                    <p className="text-sm font-bold mt-1" style={{ color: 'var(--color-success)' }}>{formatCurrency(paidAmount)}</p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                    <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{t('Pending', { defaultValue: 'Pending' })}</p>
                    <p className="text-sm font-bold mt-1" style={{ color: 'var(--color-warning)' }}>{formatCurrency(pendingAmount)}</p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                    <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{t('Invoices', { defaultValue: 'Invoices' })}</p>
                    <p className="text-sm font-bold mt-1" style={{ color: 'var(--color-primary)' }}>{summary.total_invoices || 0}</p>
                  </div>
                </div>
              </div>

              {/* Invoices List */}
              {filteredInvoices.length > 0 ? (
                <div className="px-5 py-4" style={{ borderTop: '1px solid var(--border-light)', background: 'var(--bg-hover)' }}>
                  <div className="space-y-3">
                    {filteredInvoices.slice(0, 3).map((inv) => {
                      const statusConf = STATUS_CONFIG[inv.status] || STATUS_CONFIG.paid;
                      const StatusIcon = statusConf.icon;
                      return (
                        <div key={inv.id} className="rounded-lg p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-full flex-shrink-0 whitespace-nowrap"
                                style={{ background: statusConf.bg, color: statusConf.color }}>
                                <StatusIcon className="w-3 h-3" /> {t(statusConf.labelKey, { defaultValue: statusConf.defaultLabel })}
                              </span>
                              <span className="text-sm truncate font-medium" style={{ color: 'var(--text-secondary)' }}>{inv.invoice_number}</span>
                            </div>
                            <span className="text-sm font-bold flex-shrink-0" style={{ color: 'var(--text-heading)' }}>{formatCurrency(inv.total_amount)}</span>
                          </div>
                          <div className="flex items-center justify-end gap-2 mt-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); setViewInvoiceModal({ ...inv, orgName: org.name, orgSlug: org.slug }); }}
                              className="p-1.5 rounded-lg transition-colors"
                              style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}
                              title={t("View Details", { defaultValue: "View Details" })}>
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {inv.status === 'pending' && (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setApproveModal({ invoiceId: inv.id, orgName: org.name, invoice: inv }); }}
                                  className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                                  style={{ background: 'var(--color-success)', color: '#fff' }}>
                                  {t('Approve', { defaultValue: 'Approve' })}
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setRejectModal({ invoiceId: inv.id, orgName: org.name, invoice: inv }); }}
                                  className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                                  style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)' }}>
                                  {t('Reject', { defaultValue: 'Reject' })}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {filteredInvoices.length > 3 && (
                    <button onClick={() => navigate(`/super-admin/organizations/${org.id}?tab=billing`)}
                      className="text-xs w-full text-center py-1.5 mt-2 font-semibold" style={{ color: 'var(--color-primary)' }}>
                      {t('+{{count}} more invoices', { count: filteredInvoices.length - 3, defaultValue: `+${filteredInvoices.length - 3} more invoices` })}
                    </button>
                  )}
                </div>
              ) : (
                <div className="px-5 py-3 text-center" style={{ borderTop: '1px solid var(--border-light)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {statusFilter === 'all' ? t('No invoices yet', { defaultValue: 'No invoices yet' }) : t('No {{status}} invoices', { status: statusFilter, defaultValue: `No ${statusFilter} invoices` })}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-10">
          <CreditCard className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('No organizations found', { defaultValue: 'No organizations found' })}</p>
        </div>
      )}

      {/* Approve Confirmation Modal */}
      {approveModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        }}>
          <div className="rounded-2xl p-6 w-full max-w-md" style={{ background: 'var(--bg-card)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
                <CheckCircle className="w-5 h-5" style={{ color: 'var(--color-success)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: 'var(--text-heading)' }}>{t('Approve Payment', { defaultValue: 'Approve Payment' })}</h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('Confirm payment received', { defaultValue: 'Confirm payment received' })}</p>
              </div>
            </div>
            <div className="space-y-2 mb-5 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <p><strong>{t('Organization:', { defaultValue: 'Organization:' })}</strong> {approveModal.orgName}</p>
              <p><strong>{t('Invoice:', { defaultValue: 'Invoice:' })}</strong> {approveModal.invoice.invoice_number}</p>
              <p><strong>{t('Plan:', { defaultValue: 'Plan:' })}</strong> {approveModal.invoice.plan?.name || 'N/A'}</p>
              <p><strong>{t('Amount:', { defaultValue: 'Amount:' })}</strong> {formatCurrency(approveModal.invoice.total_amount)}</p>
              <p><strong>{t('Period:', { defaultValue: 'Period:' })}</strong> {approveModal.invoice.billing_period}</p>
              <p><strong>{t('Status:', { defaultValue: 'Status:' })}</strong> <span style={{ color: 'var(--color-warning)' }}>{t('Pending', { defaultValue: 'Pending' })}</span></p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setApproveModal(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
                {t('Cancel', { defaultValue: 'Cancel' })}
              </button>
              <button onClick={handleApprove} disabled={actionLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2"
                style={{ background: 'var(--color-success)', opacity: actionLoading ? 0.6 : 1 }}>
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {t('Approve Payment', { defaultValue: 'Approve Payment' })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Confirmation Modal */}
      {rejectModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        }}>
          <div className="rounded-2xl p-6 w-full max-w-md" style={{ background: 'var(--bg-card)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
                <XCircle className="w-5 h-5" style={{ color: 'var(--color-danger)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: 'var(--text-heading)' }}>{t('Reject Payment', { defaultValue: 'Reject Payment' })}</h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('Mark payment as rejected', { defaultValue: 'Mark payment as rejected' })}</p>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{t('Reason (optional)', { defaultValue: 'Reason (optional)' })}</label>
              <textarea value={rejectModal.reason || ''} onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-dark)', border: '1px solid var(--border-light)' }}
                placeholder={t("Reason for rejection...", { defaultValue: "Reason for rejection..." })} rows={3} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRejectModal(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
                {t('Cancel', { defaultValue: 'Cancel' })}
              </button>
              <button onClick={handleReject} disabled={actionLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2"
                style={{ background: 'var(--color-danger)', opacity: actionLoading ? 0.6 : 1 }}>
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                {t('Reject Payment', { defaultValue: 'Reject Payment' })}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* View Invoice Modal */}
      {viewInvoiceModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-2xl w-full max-w-lg overflow-hidden" style={{ background: 'var(--bg-card)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{t("TechXaro", { defaultValue: "TechXaro" })}</h3>
                  <p className="text-[10px] text-white/70">{t('Invoice Detail', { defaultValue: 'Invoice Detail' })}</p>
                </div>
              </div>
              <button onClick={() => setViewInvoiceModal(null)} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-4 pb-4" style={{ borderBottom: '1px solid var(--border-light)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-primary-bg)' }}>
                  <Building2 className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>{viewInvoiceModal.orgName}</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>org/{viewInvoiceModal.orgSlug}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('Invoice Number', { defaultValue: 'Invoice Number' })}</p>
                  <p className="text-sm font-bold font-mono" style={{ color: 'var(--text-heading)' }}>{viewInvoiceModal.invoice_number}</p>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full"
                  style={{
                    background: STATUS_CONFIG[viewInvoiceModal.status]?.bg || STATUS_CONFIG.paid.bg,
                    color: STATUS_CONFIG[viewInvoiceModal.status]?.color || STATUS_CONFIG.paid.color,
                  }}>
                  {STATUS_CONFIG[viewInvoiceModal.status]?.icon && React.createElement(STATUS_CONFIG[viewInvoiceModal.status].icon, { className: 'w-3 h-3' })}
                  {t(viewInvoiceModal.status?.toUpperCase(), { defaultValue: viewInvoiceModal.status?.toUpperCase() })}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                  <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{t('Plan', { defaultValue: 'Plan' })}</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text-heading)' }}>{viewInvoiceModal.plan?.name || 'N/A'}</p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                  <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{t('Billing Period', { defaultValue: 'Billing Period' })}</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text-heading)' }}>{viewInvoiceModal.billing_period || '—'}</p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                  <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{t('Amount', { defaultValue: 'Amount' })}</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text-heading)' }}>{formatCurrency(viewInvoiceModal.amount, viewInvoiceModal.currency)}</p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                  <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{t('Tax', { defaultValue: 'Tax' })}</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text-heading)' }}>{formatCurrency(viewInvoiceModal.tax_amount, viewInvoiceModal.currency)}</p>
                </div>
              </div>
              <div className="p-3 rounded-lg mb-4" style={{ background: 'var(--color-primary-bg)', border: '1px solid var(--border-light)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('Total Amount', { defaultValue: 'Total Amount' })}</span>
                  <span className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>{formatCurrency(viewInvoiceModal.total_amount, viewInvoiceModal.currency)}</span>
                </div>
              </div>
              <div className="space-y-2 mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                {viewInvoiceModal.created_at && (
                  <div className="flex justify-between">
                    <span>{t('Created', { defaultValue: 'Created' })}</span>
                    <span style={{ color: 'var(--text-heading)' }}>
                      {new Date(viewInvoiceModal.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' '}
                      {new Date(viewInvoiceModal.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                {viewInvoiceModal.approved_at && (
                  <div className="flex justify-between">
                    <span>{t('Approved', { defaultValue: 'Approved' })}</span>
                    <span style={{ color: 'var(--color-success)' }}>
                      {new Date(viewInvoiceModal.approved_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' '}
                      {new Date(viewInvoiceModal.approved_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      {viewInvoiceModal.approved_by ? ` ${t('by {{name}}', { name: viewInvoiceModal.approved_by, defaultValue: `by ${viewInvoiceModal.approved_by}` })}` : ''}
                    </span>
                  </div>
                )}
                {viewInvoiceModal.paid_at && (
                  <div className="flex justify-between">
                    <span>{t('Paid', { defaultValue: 'Paid' })}</span>
                    <span style={{ color: 'var(--text-heading)' }}>
                      {new Date(viewInvoiceModal.paid_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' '}
                      {new Date(viewInvoiceModal.paid_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-3" style={{ borderTop: '1px solid var(--border-light)' }}>
                <button onClick={async () => { try { await api.downloadInvoice(viewInvoiceModal.id); } catch { setToast({ type: 'error', message: t('Download failed.', { defaultValue: 'Download failed.' }) }); } }}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  style={{ background: 'var(--color-primary)', color: '#fff' }}>
                  <Download className="w-4 h-4" /> {t('Download Invoice', { defaultValue: 'Download Invoice' })}
                </button>
                <button onClick={() => setViewInvoiceModal(null)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
                  {t('Close', { defaultValue: 'Close' })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
