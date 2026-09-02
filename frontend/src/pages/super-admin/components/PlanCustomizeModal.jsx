import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2, DollarSign, Users, FolderKanban, HardDrive, RotateCcw } from 'lucide-react';

/**
 * PlanCustomizeModal — Reusable modal for customizing a plan's pricing and limits per organization.
 */
export default function PlanCustomizeModal({ plan, billingPeriod = 'monthly', initialData, isCustom = false, onSaved, onReset, onClose }) {
  const { t } = useTranslation();
  const [priceMonthly, setPriceMonthly] = useState(initialData?.custom_price_monthly ?? plan.price_monthly ?? 0);
  const [priceYearly, setPriceYearly] = useState(initialData?.custom_price_yearly ?? plan.price_yearly ?? 0);
  const [maxUsers, setMaxUsers] = useState(initialData?.custom_max_users ?? plan.max_users ?? 5);
  const [maxProjects, setMaxProjects] = useState(initialData?.custom_max_projects ?? plan.max_projects ?? 5);
  const [maxStorage, setMaxStorage] = useState(initialData?.custom_max_storage_gb ?? plan.max_storage_gb ?? 5);
  const [storageUnit, setStorageUnit] = useState(initialData?.custom_storage_unit ?? plan.storage_unit ?? 'GB');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const baseline = useMemo(() => ({
    priceMonthly: initialData?.custom_price_monthly ?? plan.price_monthly ?? 0,
    priceYearly: initialData?.custom_price_yearly ?? plan.price_yearly ?? 0,
    maxUsers: initialData?.custom_max_users ?? plan.max_users ?? 5,
    maxProjects: initialData?.custom_max_projects ?? plan.max_projects ?? 5,
    maxStorage: initialData?.custom_max_storage_gb ?? plan.max_storage_gb ?? 5,
    storageUnit: initialData?.custom_storage_unit ?? plan.storage_unit ?? 'GB',
  }), [initialData, plan]);

  const current = useMemo(() => ({
    priceMonthly, priceYearly, maxUsers, maxProjects, maxStorage, storageUnit,
  }), [priceMonthly, priceYearly, maxUsers, maxProjects, maxStorage, storageUnit]);

  const isDirty = useMemo(() => {
    const norm = (v) => v === undefined || v === null ? '' : (typeof v === 'string' ? v.trim() : v);
    return Object.keys(baseline).some(key => norm(baseline[key]) !== norm(current[key]));
  }, [baseline, current]);

  const handleCloseClick = () => {
    if (isDirty) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    onSaved?.({
      is_custom: true,
      custom_price_monthly: parseFloat(priceMonthly),
      custom_price_yearly: parseFloat(priceYearly),
      custom_max_users: parseInt(maxUsers),
      custom_max_projects: parseInt(maxProjects),
      custom_max_storage_gb: parseFloat(maxStorage),
      custom_storage_unit: storageUnit,
    });
  };

  const handleReset = () => {
    setShowResetConfirm(false);
    onReset?.();
  };

  const inputStyle = {
    padding: '8px 12px',
    background: 'var(--bg-hover)',
    border: '1px solid var(--border-light)',
    borderRadius: '10px',
    fontSize: '14px',
    color: 'var(--text-dark)',
    outline: 'none',
    width: '100%',
  };

  const s = {
    text: { color: 'var(--text-dark)' },
    textSecondary: { color: 'var(--text-secondary)' },
    textMuted: { color: 'var(--text-muted)' },
    textHeading: { color: 'var(--text-heading)' },
    divider: { borderTop: '1px solid var(--border-light)' },
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 11000 }}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }} />
      <div className="relative rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', zIndex: 11001 }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between p-5" style={s.divider}>
          <div>
            <h2 className="text-lg font-semibold" style={s.textHeading}>
              {t('Customize {{name}} Plan', { name: plan.name, defaultValue: `Customize ${plan.name} Plan` })}
            </h2>
            <p className="text-xs mt-0.5" style={s.textMuted}>
              {isCustom ? t('Custom settings for this organization', { defaultValue: 'Custom settings for this organization' }) : t('Override plan defaults for this organization', { defaultValue: 'Override plan defaults for this organization' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" form="planCustomForm"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2">
              {t('Save', { defaultValue: 'Save' })}
            </button>
            <button onClick={handleCloseClick} className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Badge */}
        <div className="px-5 pt-4">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${
            isCustom
              ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'bg-gray-50 text-gray-600 border border-gray-200'
          }`}>
            {isCustom ? t('Custom Plan', { defaultValue: 'Custom Plan' }) : t('Default Plan', { defaultValue: 'Default Plan' })}
          </span>
        </div>

        {/* Form */}
        <form id="planCustomForm" onSubmit={handleSave} className="p-5 space-y-5">
          {/* Pricing */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={s.textMuted}>
              <DollarSign className="w-3.5 h-3.5 inline mr-1" /> {t('Pricing', { defaultValue: 'Pricing' })}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1" style={s.textMuted}>{t('Monthly ($)', { defaultValue: 'Monthly ($)' })}</label>
                <input type="number" min="0" step="0.01" value={priceMonthly}
                  onChange={(e) => setPriceMonthly(e.target.value)}
                  required style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={s.textMuted}>{t('Yearly ($)', { defaultValue: 'Yearly ($)' })}</label>
                <input type="number" min="0" step="0.01" value={priceYearly}
                  onChange={(e) => setPriceYearly(e.target.value)}
                  required style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Limits */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Users, labelKey: 'User Limit', defaultLabel: 'User Limit', value: maxUsers, set: setMaxUsers, unlimitedValue: 9999 },
              { icon: FolderKanban, labelKey: 'Project Limit', defaultLabel: 'Project Limit', value: maxProjects, set: setMaxProjects, unlimitedValue: 9999 },
            ].map((f) => (
              <div key={f.labelKey}>
                <label className="block text-xs font-medium mb-1.5" style={s.textMuted}>
                  <f.icon className="w-3.5 h-3.5 inline mr-1" /> {t(f.labelKey, { defaultValue: f.defaultLabel })}
                </label>
                <input type="number" min="1" value={f.value === 9999 ? '' : f.value}
                  placeholder={f.value === 9999 || (f.unlimitedValue && f.value === f.unlimitedValue) ? t('Unlimited', { defaultValue: 'Unlimited' }) : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      f.set(f.unlimitedValue || 1);
                    } else {
                      f.set(parseInt(val) || 1);
                    }
                  }}
                  style={inputStyle} />
                {f.unlimitedValue && (
                  <button type="button" onClick={() => f.set(f.unlimitedValue)}
                    className="mt-1 text-xs font-medium transition-colors"
                    style={{ color: 'var(--color-primary)' }}>
                    {t('Set Unlimited', { defaultValue: 'Set Unlimited' })}
                  </button>
                )}
              </div>
            ))}
          </div>
          {/* Storage Limit (full width, separate row) */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={s.textMuted}>
              <HardDrive className="w-3.5 h-3.5 inline mr-1" /> Storage Limit ({storageUnit})
            </label>
            <div className="flex gap-2">
              <input type="number" min="0.001" step="any" value={maxStorage}
                onChange={(e) => setMaxStorage(e.target.value)}
                required style={{ ...inputStyle, flex: 1 }} />
              <select value={storageUnit} onChange={(e) => setStorageUnit(e.target.value)}
                style={{ ...inputStyle, width: 'auto', cursor: 'pointer', minWidth: '70px' }}>
                <option value="KB">KB</option>
                <option value="MB">MB</option>
                <option value="GB">GB</option>
              </select>
            </div>
          </div>

          {/* Info text */}
          <p className="text-xs" style={s.textMuted}>
            {t('These settings apply only to this organization and do not affect the global plan defaults.', { defaultValue: 'These settings apply only to this organization and do not affect the global plan defaults.' })}
          </p>
        </form>

        {/* Reset to Default (when custom) */}
        {isCustom && (
          <div className="px-5 pb-4">
            <button onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors"
              style={{ color: '#dc2626', background: 'rgba(220,38,38,0.08)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(220,38,38,0.15)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(220,38,38,0.08)'; }}>
              <RotateCcw className="w-4 h-4" /> {t('Reset to Default Plan', { defaultValue: 'Reset to Default Plan' })}
            </button>
          </div>
        )}

        {/* Close Confirm */}
        {showCloseConfirm && (
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 11002 }}>
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }} onClick={() => setShowCloseConfirm(false)} />
            <div className="relative rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center" style={{ background: 'var(--bg-card)', zIndex: 11003 }}>
              <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(220,38,38,0.1)' }}>
                <X className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={s.textHeading}>{t('Close without saving?', { defaultValue: 'Close without saving?' })}</h3>
              <p className="text-sm mb-6" style={s.textSecondary}>{t('You have unsaved changes. Are you sure you want to close?', { defaultValue: 'You have unsaved changes. Are you sure you want to close?' })}</p>
              <div className="flex gap-3">
                <button onClick={() => setShowCloseConfirm(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{t('Keep Editing', { defaultValue: 'Keep Editing' })}</button>
                <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">{t('Close', { defaultValue: 'Close' })}</button>
              </div>
            </div>
          </div>
        )}

        {/* Reset Confirm */}
        {showResetConfirm && (
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 11002 }}>
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }} onClick={() => setShowResetConfirm(false)} />
            <div className="relative rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center" style={{ background: 'var(--bg-card)', zIndex: 11003 }}>
              <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(147,51,234,0.1)' }}>
                <RotateCcw className="w-6 h-6" style={{ color: '#9333ea' }} />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={s.textHeading}>{t('Reset to Default Plan?', { defaultValue: 'Reset to Default Plan?' })}</h3>
              <p className="text-sm mb-6" style={s.textSecondary}>
                {t('This organization will use the default {{name}} plan settings. Custom overrides will be removed.', { name: plan.name, defaultValue: `This organization will use the default ${plan.name} plan settings. Custom overrides will be removed.` })}
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowResetConfirm(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{t('Cancel', { defaultValue: 'Cancel' })}</button>
                <button onClick={handleReset}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors flex items-center justify-center gap-2">
                  <RotateCcw className="w-4 h-4" /> {t('Reset', { defaultValue: 'Reset' })}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
