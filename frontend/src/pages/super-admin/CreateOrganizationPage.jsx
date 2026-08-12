import { useState, useEffect, useMemo } from 'react';
import { Building2, Loader2, X, Check, ArrowRight, ArrowLeft, Sliders, Globe } from 'lucide-react';
import { api } from './api/superAdminApi';
import TrialConfigurationModal from './components/TrialConfigurationModal';
import PlanCustomizeModal from './components/PlanCustomizeModal';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import { countries, getCountryByCode, formatPhoneByCountry } from './data/countries';
import CountrySelect from '../../components/CountrySelect';

const flagEmoji = (code) => {
  if (!code) return '🌍';
  const map = { PK:'🇵🇰', US:'🇺🇸', GB:'🇬🇧', IN:'🇮🇳', AE:'🇦🇪', SA:'🇸🇦', CA:'🇨🇦', AU:'🇦🇺', DE:'🇩🇪', FR:'🇫🇷', TR:'🇹🇷', CN:'🇨🇳', JP:'🇯🇵', BR:'🇧🇷', NG:'🇳🇬', ZA:'🇿🇦', EG:'🇪🇬', KE:'🇰🇪', PH:'🇵🇭', MY:'🇲🇾', BD:'🇧🇩', NP:'🇳🇵', LK:'🇱🇰', SG:'🇸🇬', HK:'🇭🇰', NZ:'🇳🇿', IT:'🇮🇹', ES:'🇪🇸', NL:'🇳🇱', SE:'🇸🇪', CH:'🇨🇭', PL:'🇵🇱', RU:'🇷🇺', KR:'🇰🇷', TH:'🇹🇭', ID:'🇮🇩', VN:'🇻🇳', MX:'🇲🇽', AR:'🇦🇷', CO:'🇨🇴', GH:'🇬🇭', TZ:'🇹🇿', UG:'🇺🇬', ET:'🇪🇹', JO:'🇯🇴', KW:'🇰🇼', BH:'🇧🇭', QA:'🇶🇦', OM:'🇴🇲', LB:'🇱🇧', IQ:'🇮🇶', MA:'🇲🇦', DZ:'🇩🇿', TN:'🇹🇳' };
  return map[code] || '🌍';
};

export default function CreateOrganizationModal({ onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [form, setForm] = useState({ name: '', slug: '', admin_name: '', admin_email: '', admin_phone: '' });
  const [slugEdited, setSlugEdited] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState('PK');
  const [showTrialModal, setShowTrialModal] = useState(false);
  const [trialDefaults, setTrialDefaults] = useState(null);
  const [trialCustomization, setTrialCustomization] = useState(null);
  const [showPlanCustomModal, setShowPlanCustomModal] = useState(false);
  const [planCustomization, setPlanCustomization] = useState(null);

  const initialValues = useMemo(() => ({
    name: '', slug: '', admin_name: '', admin_email: '', admin_phone: '', country_code: 'PK',
    selectedPlanId: null, billingPeriod: 'monthly',
  }), []);

  const currentValues = useMemo(() => ({
    name: form.name, slug: form.slug, admin_name: form.admin_name, admin_email: form.admin_email, admin_phone: form.admin_phone,
    country_code: selectedCountry, selectedPlanId, billingPeriod,
  }), [form.name, form.slug, form.admin_name, form.admin_email, form.admin_phone, selectedCountry, selectedPlanId, billingPeriod]);

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

  const toSlug = (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const handleNameChange = (e) => {
    const name = e.target.value;
    setForm(prev => ({
      ...prev,
      name,
      slug: slugEdited ? prev.slug : toSlug(name),
    }));
  };

  const handleSlugChange = (e) => {
    setSlugEdited(true);
    setForm(prev => ({ ...prev, slug: toSlug(e.target.value) }));
  };

  const handleSubmit = async () => {
    if (!selectedPlanId) { setError('Please select a plan'); return; }
    const isTrial = plans.find(p => p.id === selectedPlanId)?.slug === 'trial';
    setSubmitting(true); setError(null);
    try {
      const payload = {
        name: form.name, slug: form.slug || undefined, admin_name: form.admin_name, admin_email: form.admin_email,
        admin_phone: form.admin_phone ? `${getCountryByCode(selectedCountry).dial} ${form.admin_phone}` : undefined,
        country_code: selectedCountry,
        plan_id: selectedPlanId, billing_period: billingPeriod,
      };
      if (isTrial && trialCustomization) {
        payload.customize_trial = true;
        payload.trial_duration = trialCustomization.trial_duration;
        payload.trial_duration_unit = trialCustomization.trial_duration_unit;
        payload.trial_max_users = trialCustomization.max_users;
        payload.trial_max_projects = trialCustomization.max_projects;
        payload.trial_max_storage_gb = trialCustomization.max_storage_gb;
      }
      if (planCustomization) {
        payload.is_custom = true;
        payload.custom_price_monthly = planCustomization.custom_price_monthly;
        payload.custom_price_yearly = planCustomization.custom_price_yearly;
        payload.custom_max_users = planCustomization.custom_max_users;
        payload.custom_max_projects = planCustomization.custom_max_projects;
        payload.custom_max_storage_gb = planCustomization.custom_max_storage_gb;
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
              <div>
                <label className="block text-sm font-medium mb-1" style={s.textSecondary}>Organization Name *</label>
                <input type="text" value={form.name}
                  onChange={handleNameChange}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  style={s.input} placeholder="Acme Corporation" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={s.textSecondary}>
                  <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Slug</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  <input type="text" value={form.slug}
                    onChange={handleSlugChange}
                    className="flex-1 px-3 py-2 rounded-l-lg text-sm focus:ring-2 focus:ring-blue-500"
                    style={s.input} placeholder="acme-corporation" />
                  <span className="px-3 py-2 text-sm rounded-r-lg" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border-light)', borderLeft: 'none', whiteSpace: 'nowrap' }}>
                    /org/{form.slug || 'slug'}
                  </span>
                </div>
                <p className="text-xs mt-1" style={s.textMuted}>Auto-generated from name. You can customize it.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={s.textSecondary}>Admin Name *</label>
                <input type="text" value={form.admin_name}
                  onChange={(e) => setForm(prev => ({ ...prev, admin_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  style={s.input} placeholder="John Smith" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={s.textSecondary}>Email *</label>
                <input type="email" value={form.admin_email}
                  onChange={(e) => setForm(prev => ({ ...prev, admin_email: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  style={s.input} placeholder="admin@acme.com" />
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
                    const isTrial = plan.slug === 'trial';
                    const hasCustom = isTrial ? (trialCustomization && isSelected) : (planCustomization && isSelected);
                    const price = hasCustom && !isTrial
                      ? (billingPeriod === 'monthly' ? planCustomization.custom_price_monthly : planCustomization.custom_price_yearly)
                      : (billingPeriod === 'monthly' ? plan.price_monthly : plan.price_yearly);
                    const users = hasCustom ? (isTrial ? trialCustomization.max_users : planCustomization.custom_max_users) : plan.max_users;
                    const projects = hasCustom ? (isTrial ? trialCustomization.max_projects : planCustomization.custom_max_projects) : plan.max_projects;
                    const storage = hasCustom ? (isTrial ? trialCustomization.max_storage_gb : planCustomization.custom_max_storage_gb) : plan.max_storage_gb;
                    return (
                      <div key={plan.id} onClick={() => { setSelectedPlanId(plan.id); if (!isSelected) { setPlanCustomization(null); setTrialCustomization(null); } }}
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
                              <span className="px-2 py-0.5 text-xs font-medium rounded-full"
                                style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>Default</span>
                            )}
                            {hasCustom && (
                              <span className="px-2 py-0.5 text-xs font-medium rounded-full"
                                style={{ background: isTrial ? 'rgba(147,51,234,0.12)' : 'rgba(245,158,11,0.12)', color: isTrial ? '#9333ea' : '#d97706' }}>Custom</span>
                            )}
                          </div>
                          <p className="text-sm mt-0.5" style={s.textSecondary}>
                            {isTrial ? (
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
      {ConfirmDialog}
    </div>
  );
}
