import { useState, useEffect, useMemo } from 'react';
import { Building2, Loader2, X, Check, ArrowRight, ArrowLeft, Settings2 } from 'lucide-react';
import { api } from './api/superAdminApi';
import TrialConfigurationModal from './components/TrialConfigurationModal';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';

export default function CreateOrganizationModal({ onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [form, setForm] = useState({ name: '', admin_name: '', admin_email: '', admin_phone: '' });
  const [showTrialModal, setShowTrialModal] = useState(false);
  const [trialDefaults, setTrialDefaults] = useState(null);
  const [trialCustomization, setTrialCustomization] = useState(null);

  const initialValues = useMemo(() => ({
    name: '', admin_name: '', admin_email: '', admin_phone: '',
    selectedPlanId: null, billingPeriod: 'monthly',
  }), []);

  const currentValues = useMemo(() => ({
    name: form.name, admin_name: form.admin_name, admin_email: form.admin_email, admin_phone: form.admin_phone,
    selectedPlanId, billingPeriod,
  }), [form.name, form.admin_name, form.admin_email, form.admin_phone, selectedPlanId, billingPeriod]);

  const { isDirty, handleClose, ConfirmDialog } = useUnsavedChanges(
    initialValues, currentValues, onClose,
    { title: 'Close without saving?', message: 'You have unsaved changes. Are you sure you want to close? All changes will be lost.' }
  );

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleEsc = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', handleEsc); };
  }, [handleClose]);

  useEffect(() => {
    if (step === 2 && plans.length === 0) {
      setPlansLoading(true);
      api.getPlans()
        .then(res => {
          setPlans(res.data || []);
          const def = (res.data || []).find(p => p.is_default);
          if (def) setSelectedPlanId(def.id);
        })
        .catch(e => setError(e.message))
        .finally(() => setPlansLoading(false));
    }
  }, [step, plans.length]);

  // Fetch trial defaults when trial plan is selected
  useEffect(() => {
    if (selectedPlanId && plans.find(p => p.id === selectedPlanId)?.slug === 'trial' && !trialDefaults) {
      api.getTrialDefaults().then(res => setTrialDefaults(res.data)).catch(() => {});
    }
  }, [selectedPlanId, plans, trialDefaults]);

  const handleNext = () => { if (!form.name || !form.admin_name || !form.admin_email) return; setStep(2); setError(null); };
  const handleBack = () => { setStep(1); setError(null); };

  const handleSubmit = async () => {
    if (!selectedPlanId) { setError('Please select a plan'); return; }
    const isTrial = plans.find(p => p.id === selectedPlanId)?.slug === 'trial';
    setSubmitting(true); setError(null);
    try {
      const payload = {
        name: form.name, admin_name: form.admin_name, admin_email: form.admin_email,
        admin_phone: form.admin_phone || undefined, plan_id: selectedPlanId, billing_period: billingPeriod,
      };
      if (isTrial && trialCustomization) {
        payload.customize_trial = true;
        payload.trial_duration = trialCustomization.trial_duration;
        payload.trial_duration_unit = trialCustomization.trial_duration_unit;
        payload.trial_max_users = trialCustomization.max_users;
        payload.trial_max_projects = trialCustomization.max_projects;
        payload.trial_max_storage_gb = trialCustomization.max_storage_gb;
      }
      await api.createOrganization(payload);
      onSuccess(`Organization "${form.name}" created successfully. Credentials emailed to ${form.admin_email}.`);
    } catch (e) { setError(e.message); } finally { setSubmitting(false); }
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
    errorBg: { background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)' },
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 9999 }}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }} onClick={handleClose}></div>
      <div className="relative rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col" style={{ ...s.card, zIndex: 10000 }}>
        <div className="flex items-center justify-between p-6 pb-4" style={s.divider}>
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2" style={s.textHeading}>
              <Building2 className="w-5 h-5 text-blue-600" /> New Organization
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
          <div className="flex-1 h-0.5 rounded"
            style={{ background: step === 2 ? 'var(--color-success)' : 'var(--bg-hover)' }}></div>
          <div className="flex items-center gap-2 text-sm font-medium"
            style={{ color: step === 2 ? 'var(--color-primary)' : 'var(--text-muted)' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: step === 2 ? 'var(--color-primary)' : 'var(--bg-hover)', color: step === 2 ? '#fff' : 'var(--text-muted)' }}>2</div>
            Plan
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 rounded-lg" style={s.errorBg}>
            <p className="text-sm" style={{ color: '#ef4444' }}>{error}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-4">
              {[
                { label: 'Company Name *', key: 'name', type: 'text', placeholder: 'Acme Corporation' },
                { label: 'Admin Name *', key: 'admin_name', type: 'text', placeholder: 'John Smith' },
                { label: 'Email *', key: 'admin_email', type: 'email', placeholder: 'admin@acme.com' },
                { label: 'Phone Number', key: 'admin_phone', type: 'tel', placeholder: '03XX-XXXXXXX' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium mb-1" style={s.textSecondary}>{label}</label>
                  <input type={type} value={form[key]}
                    onChange={(e) => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    style={s.input} placeholder={placeholder} />
                </div>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {plans.find(p => p.id === selectedPlanId)?.slug !== 'trial' && (
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
              )}

              {plansLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="ml-2 text-sm" style={s.textSecondary}>Loading plans...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {plans.map((plan) => {
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
                            {plan.slug === 'trial' && (
                              <span className="px-2 py-0.5 text-xs font-medium rounded-full"
                                style={{ background: 'rgba(147,51,234,0.12)', color: 'var(--color-primary)' }}>{plan.trial_duration || 14} {(plan.trial_duration_unit || 'days').replace(/s$/, '')} Free</span>
                            )}
                            {plan.is_default && (
                              <span className="px-2 py-0.5 text-xs font-medium rounded-full"
                                style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>Default</span>
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
              )}

              {/* Customize Trial Option */}
              {selectedPlan && selectedPlan.slug === 'trial' && (
                <div className="mt-4 p-4 rounded-xl border" style={{ borderColor: 'var(--border-light)', background: 'var(--bg-card)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium" style={s.textHeading}>Trial Configuration</p>
                      <p className="text-xs mt-0.5" style={s.textMuted}>
                        {trialCustomization
                          ? 'Custom settings configured for this organization'
                          : 'Uses default from Plans page. Optionally customize for this org.'}
                      </p>
                    </div>
                    <button type="button" onClick={() => setShowTrialModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                      style={{
                        background: trialCustomization ? 'rgba(147,51,234,0.1)' : 'var(--bg-hover)',
                        color: trialCustomization ? '#9333ea' : 'var(--text-secondary)',
                        border: trialCustomization ? '1px solid rgba(147,51,234,0.3)' : '1px solid var(--border-light)',
                      }}>
                      <Settings2 className="w-3.5 h-3.5" />
                      {trialCustomization ? 'Edit Trial' : 'Customize Trial'}
                    </button>
                  </div>
                  {trialCustomization && (
                    <div className="mt-2 flex gap-2 text-xs" style={s.textSecondary}>
                      <span>{trialCustomization.trial_duration} {trialCustomization.trial_duration_unit}</span>
                      <span>·</span>
                      <span>{trialCustomization.max_users} users</span>
                      <span>·</span>
                      <span>{trialCustomization.max_projects} projects</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 p-6 pt-4" style={s.divider}>
          <button onClick={handleClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
            Cancel
          </button>
          {step === 1 ? (
            <button onClick={handleNext} disabled={!form.name || !form.admin_name || !form.admin_email}
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
              <button onClick={handleSubmit} disabled={submitting || !selectedPlanId}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : 'Create Organization'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Trial Configuration Modal */}
      {showTrialModal && (
        <TrialConfigurationModal
          mode="organization"
          localOnly
          initialData={trialCustomization || trialDefaults}
          isCustom={!!trialCustomization}
          onSaved={(data) => {
            setTrialCustomization(data);
            setShowTrialModal(false);
          }}
          onClose={() => setShowTrialModal(false)}
        />
      )}
      {ConfirmDialog}
    </div>
  );
}
