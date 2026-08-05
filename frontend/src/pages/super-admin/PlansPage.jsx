import { useState, useEffect, useMemo } from 'react';
import { CreditCard, Check, X, Users, FolderKanban, HardDrive, Pencil, Loader2 } from 'lucide-react';
import { LoadingState, ErrorState } from './components/LoadingState';
import { api } from './api/superAdminApi';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';

const moduleNameOverrides = { deliverables: 'Subtask' };
function moduleDisplayName(name, slug) {
  return moduleNameOverrides[slug] || name;
}

export default function PlansPage() {
  const [plans, setPlans] = useState([]);
  const [allModules, setAllModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingPlan, setEditingPlan] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try {
      const [plansRes, modulesRes] = await Promise.all([api.getPlans(), api.getModules()]);
      setPlans(plansRes.data || []); setAllModules(modulesRes.data || []);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async (planId, data) => {
    setSaving(true);
    try { const res = await api.updatePlan(planId, data); setPlans(prev => prev.map(p => p.id === planId ? res.data : p)); setEditingPlan(null); }
    catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  const s = {
    card: { background: 'var(--bg-card)', border: '2px solid var(--border-light)', borderRadius: '16px' },
    text: { color: 'var(--text-dark)' },
    textSecondary: { color: 'var(--text-secondary)' },
    textMuted: { color: 'var(--text-muted)' },
    textHeading: { color: 'var(--text-heading)' },
    divider: { borderTop: '1px solid var(--border-light)' },
    infoBox: { background: 'var(--color-primary-bg)', border: '1px solid var(--color-primary)' },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={s.textHeading}>Plans & Pricing</h1>
        <p className="text-sm mt-1" style={s.textSecondary}>{plans.length} subscription plans</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div key={plan.id} className="p-6 hover:shadow-lg transition-all relative" style={s.card}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold" style={s.textHeading}>{plan.name}</h3>
                {plan.slug === 'trial' && <span className="px-2 py-0.5 text-xs font-medium rounded-full" style={{ background: 'rgba(147,51,234,0.1)', color: '#9333ea' }}>{plan.trial_duration || 14} {plan.trial_duration_unit || 'days'}</span>}
                {plan.is_default && <span className="px-2 py-0.5 text-xs font-medium rounded-full" style={s.infoBox}>Default</span>}
                {!plan.is_active && <span className="px-2 py-0.5 text-xs font-medium rounded-full" style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>Inactive</span>}
              </div>
              <button onClick={() => setEditingPlan(plan)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors">
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            </div>
            <div className="mb-6">
              {plan.price_monthly == 0 && plan.price_yearly == 0 ? (
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-emerald-600">Free</span>
                  <span className="text-sm" style={s.textSecondary}>{plan.trial_duration || 14} {plan.trial_duration_unit || 'days'} trial</span>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold" style={s.textHeading}>${plan.price_monthly}</span>
                    <span className="text-sm" style={s.textSecondary}>/month</span>
                  </div>
                  <p className="text-sm mt-1" style={s.textSecondary}>${plan.price_yearly}/year</p>
                </>
              )}
            </div>
            <div className="space-y-3 mb-6">
              {[
                { icon: Users, text: `${plan.max_users === 9999 ? 'Unlimited' : plan.max_users} users` },
                { icon: FolderKanban, text: `${plan.max_projects === 9999 ? 'Unlimited' : plan.max_projects} projects` },
                { icon: HardDrive, text: `${plan.max_storage_gb} GB storage` },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm" style={s.textSecondary}>
                  <item.icon className="w-4 h-4" /> {item.text}
                </div>
              ))}
            </div>
            <div className="pt-4" style={s.divider}>
              <p className="text-xs font-medium uppercase tracking-wider mb-3" style={s.textMuted}>Modules</p>
              <div className="space-y-2">
                {(plan.modules || []).map((mod) => (
                  <div key={mod.slug || mod.id} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm" style={s.text}>{moduleDisplayName(mod.name, mod.slug)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {editingPlan && <EditPlanModal plan={editingPlan} allModules={allModules} saving={saving} onSave={handleSave} onClose={() => setEditingPlan(null)} />}
    </div>
  );
}

function EditPlanModal({ plan, allModules, saving, onSave, onClose }) {
  const isTrial = plan.slug === 'trial';

  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description || '');
  const [priceMonthly, setPriceMonthly] = useState(plan.price_monthly);
  const [priceYearly, setPriceYearly] = useState(plan.price_yearly);
  const [maxUsers, setMaxUsers] = useState(plan.max_users === 9999 ? '' : plan.max_users);
  const [maxProjects, setMaxProjects] = useState(plan.max_projects === 9999 ? '' : plan.max_projects);
  const [maxStorage, setMaxStorage] = useState(plan.max_storage_gb);
  const [trialDuration, setTrialDuration] = useState(plan.trial_duration || 14);
  const [trialDurationUnit, setTrialDurationUnit] = useState(plan.trial_duration_unit || 'days');
  const [isActive, setIsActive] = useState(plan.is_active);
  const [isDefault, setIsDefault] = useState(plan.is_default);
  const [selectedModules, setSelectedModules] = useState((plan.modules || []).map(m => m.id));

  const initialValues = useMemo(() => ({
    name: plan.name,
    description: plan.description || '',
    priceMonthly: plan.price_monthly,
    priceYearly: plan.price_yearly,
    maxUsers: plan.max_users === 9999 ? '' : plan.max_users,
    maxProjects: plan.max_projects === 9999 ? '' : plan.max_projects,
    maxStorage: plan.max_storage_gb,
    trialDuration: plan.trial_duration || 14,
    trialDurationUnit: plan.trial_duration_unit || 'days',
    isActive: plan.is_active,
    isDefault: plan.is_default,
    selectedModules: (plan.modules || []).map(m => m.id),
  }), [plan.id]);

  const currentValues = useMemo(() => ({
    name, description, priceMonthly, priceYearly,
    maxUsers, maxProjects, maxStorage,
    trialDuration, trialDurationUnit,
    isActive, isDefault, selectedModules,
  }), [name, description, priceMonthly, priceYearly, maxUsers, maxProjects, maxStorage, trialDuration, trialDurationUnit, isActive, isDefault, selectedModules]);

  const { isDirty, handleClose, markSaved, ConfirmDialog } = useUnsavedChanges(
    initialValues, currentValues, onClose,
    { title: 'Close without saving?', message: 'You have unsaved changes. Are you sure you want to close? All changes will be lost.' }
  );

  const toggleModule = (moduleId) => setSelectedModules(prev => prev.includes(moduleId) ? prev.filter(id => id !== moduleId) : [...prev, moduleId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(plan.id, {
      name, description: description || null,
      price_monthly: isTrial ? 0 : parseFloat(priceMonthly),
      price_yearly: isTrial ? 0 : parseFloat(priceYearly),
      max_users: maxUsers === '' ? 9999 : parseInt(maxUsers), max_projects: maxProjects === '' ? 9999 : parseInt(maxProjects),
      max_storage_gb: parseInt(maxStorage),
      trial_duration: isTrial ? parseInt(trialDuration) || 14 : undefined,
      trial_duration_unit: isTrial ? trialDurationUnit : undefined,
      is_active: isActive, is_default: isDefault, module_ids: selectedModules,
    });
  };

  const inputStyle = { padding: "8px 12px", background: "var(--bg-hover)", border: "1px solid var(--border-light)", borderRadius: "10px", fontSize: "14px", color: "var(--text-dark)", outline: "none", width: "100%" };

  const s = {
    card: { background: 'var(--bg-card)', border: '1px solid var(--border-light)' },
    text: { color: 'var(--text-dark)' },
    textSecondary: { color: 'var(--text-secondary)' },
    textMuted: { color: 'var(--text-muted)' },
    textHeading: { color: 'var(--text-heading)' },
    divider: { borderTop: '1px solid var(--border-light)' },
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }} />
      <div className="relative rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ ...s.card, background: 'var(--bg-card)', zIndex: 10000 }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5" style={s.divider}>
          <h2 className="text-lg font-semibold" style={s.textHeading}>Edit Plan: {plan.name}</h2>
          <div className="flex items-center gap-2">
            <button type="submit" form="editPlanForm" disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button onClick={handleClose} className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form id="editPlanForm" onSubmit={handleSubmit} className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={s.textMuted}>Plan Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={s.textMuted}>Description</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} />
            </div>
          </div>
          {!isTrial && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={s.textMuted}>Monthly Price ($)</label>
                <input type="number" step="0.01" min="0" value={priceMonthly} onChange={e => setPriceMonthly(e.target.value)} required style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={s.textMuted}>Yearly Price ($)</label>
                <input type="number" step="0.01" min="0" value={priceYearly} onChange={e => setPriceYearly(e.target.value)} required style={inputStyle} />
              </div>
            </div>
          )}
          {isTrial && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={s.textMuted}>Trial Duration</label>
                <input type="number" min="1" value={trialDuration} onChange={e => setTrialDuration(e.target.value)} required style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={s.textMuted}>Duration Unit</label>
                <select value={trialDurationUnit} onChange={e => setTrialDurationUnit(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Max Users', value: maxUsers, set: setMaxUsers, ph: 'Unlimited' },
              { label: 'Max Projects', value: maxProjects, set: setMaxProjects, ph: 'Unlimited' },
              { label: 'Storage (GB)', value: maxStorage, set: setMaxStorage, required: true },
            ].map((f) => (
              <div key={f.label}>
                <label className="block text-xs font-medium mb-1.5" style={s.textMuted}>{f.label}</label>
                <input type="number" min="1" value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.ph} required={f.required} style={inputStyle} />
                <p className="text-[11px] mt-1" style={s.textMuted}>Leave empty = unlimited</p>
              </div>
            ))}
          </div>
          <div className="flex gap-4">
            {[
              { label: 'Active', checked: isActive, set: setIsActive },
              { label: 'Default Plan', checked: isDefault, set: setIsDefault },
            ].map((c) => (
              <label key={c.label} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={c.checked} onChange={e => c.set(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm" style={s.text}>{c.label}</span>
              </label>
            ))}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider mb-3" style={s.textMuted}>Modules</p>
            <div className="grid grid-cols-2 gap-2">
              {allModules.map((mod) => (
                <label key={mod.id} className="flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: selectedModules.includes(mod.id) ? 'var(--color-primary-bg)' : 'var(--bg-hover)',
                    border: selectedModules.includes(mod.id) ? '1px solid var(--color-primary)' : '1px solid transparent',
                  }}>
                  <input type="checkbox" checked={selectedModules.includes(mod.id)} onChange={() => toggleModule(mod.id)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm" style={s.text}>{mod.name}</span>
                </label>
              ))}
            </div>
          </div>
        </form>
      </div>
      {ConfirmDialog}
    </div>
  );
}
