import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2, Clock, Users, FolderKanban, HardDrive, RotateCcw } from 'lucide-react';
import { api } from '../api/superAdminApi';

/**
 * TrialConfigurationModal — Reusable modal for editing trial configuration.
 */
export default function TrialConfigurationModal({ mode = 'global', orgId, localOnly = false, initialData, isCustom = false, onSaved, onClose }) {
  const { t } = useTranslation();
  const [trialDuration, setTrialDuration] = useState(initialData?.trial_duration || 14);
  const [trialUnit, setTrialUnit] = useState(initialData?.trial_duration_unit || 'days');
  const [maxUsers, setMaxUsers] = useState(initialData?.max_users || 5);
  const [maxProjects, setMaxProjects] = useState(initialData?.max_projects || 5);
  const [maxStorage, setMaxStorage] = useState(initialData?.max_storage_gb || 5);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [error, setError] = useState('');

  const isOrgMode = mode === 'organization';

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data = {
        trial_duration: parseInt(trialDuration),
        trial_duration_unit: trialUnit,
        max_users: parseInt(maxUsers),
        max_projects: parseInt(maxProjects),
        max_storage_gb: parseInt(maxStorage),
      };
      if (localOnly) {
        onSaved?.(data);
      } else if (isOrgMode) {
        await api.updateOrgTrialSettings(orgId, data);
        onSaved?.();
      } else {
        await api.updatePlan('trial', data);
        onSaved?.();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await api.resetOrgTrialSettings(orgId);
      setShowResetConfirm(false);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setResetting(false);
    }
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
              {isOrgMode ? t('Trial Configuration', { defaultValue: 'Trial Configuration' }) : t('Default Trial Configuration', { defaultValue: 'Default Trial Configuration' })}
            </h2>
            <p className="text-xs mt-0.5" style={s.textMuted}>
              {isOrgMode
                ? (isCustom ? t('Custom settings for this organization', { defaultValue: 'Custom settings for this organization' }) : t('Using global default from Plans', { defaultValue: 'Using global default from Plans' }))
                : t('Global default for all new Trial organizations', { defaultValue: 'Global default for all new Trial organizations' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" form="trialConfigForm" disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} {saving ? t('Saving...', { defaultValue: 'Saving...' }) : t('Save', { defaultValue: 'Save' })}
            </button>
            <button onClick={() => setShowCloseConfirm(true)} className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Badge */}
        {isOrgMode && (
          <div className="px-5 pt-4">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${
              isCustom
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-gray-50 text-gray-600 border border-gray-200'
            }`}>
              {isCustom ? t('Custom Trial', { defaultValue: 'Custom Trial' }) : t('Default Trial', { defaultValue: 'Default Trial' })}
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-5 mt-3 p-3 rounded-lg text-sm" style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form id="trialConfigForm" onSubmit={handleSave} className="p-5 space-y-5">
          {/* Trial Duration */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={s.textMuted}>
              <Clock className="w-3.5 h-3.5 inline mr-1" /> {t('Trial Duration', { defaultValue: 'Trial Duration' })}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" min="1" value={trialDuration}
                onChange={(e) => setTrialDuration(e.target.value)}
                required style={inputStyle} />
              <select value={trialUnit} onChange={(e) => setTrialUnit(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="minutes">{t('Minutes', { defaultValue: 'Minutes' })}</option>
                <option value="hours">{t('Hours', { defaultValue: 'Hours' })}</option>
                <option value="days">{t('Days', { defaultValue: 'Days' })}</option>
              </select>
            </div>
          </div>

          {/* Limits */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Users, labelKey: 'User Limit', defaultLabel: 'User Limit', value: maxUsers, set: setMaxUsers },
              { icon: FolderKanban, labelKey: 'Project Limit', defaultLabel: 'Project Limit', value: maxProjects, set: setMaxProjects },
              { icon: HardDrive, labelKey: 'Storage (GB)', defaultLabel: 'Storage (GB)', value: maxStorage, set: setMaxStorage },
            ].map((f) => (
              <div key={f.labelKey}>
                <label className="block text-xs font-medium mb-1.5" style={s.textMuted}>
                  <f.icon className="w-3.5 h-3.5 inline mr-1" /> {t(f.labelKey, { defaultValue: f.defaultLabel })}
                </label>
                <input type="number" min="1" value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  required style={inputStyle} />
              </div>
            ))}
          </div>

          {/* Info text */}
          <p className="text-xs" style={s.textMuted}>
            {isOrgMode
              ? t('These settings apply only to this organization and do not affect the global Trial configuration.', { defaultValue: 'These settings apply only to this organization and do not affect the global Trial configuration.' })
              : t('These are the default settings applied to all new organizations using the Trial plan.', { defaultValue: 'These are the default settings applied to all new organizations using the Trial plan.' })}
          </p>
        </form>

        {/* Reset to Default (org mode only, when custom) */}
        {isOrgMode && isCustom && (
          <div className="px-5 pb-4">
            <button onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors"
              style={{ color: '#dc2626', background: 'rgba(220,38,38,0.08)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(220,38,38,0.15)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(220,38,38,0.08)'; }}>
              <RotateCcw className="w-4 h-4" /> {t('Reset to Default Trial', { defaultValue: 'Reset to Default Trial' })}
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
              <h3 className="text-lg font-semibold mb-2" style={s.textHeading}>{t('Reset to Default Trial?', { defaultValue: 'Reset to Default Trial?' })}</h3>
              <p className="text-sm mb-6" style={s.textSecondary}>
                {t('This organization will use the global Trial configuration from Plans. Custom settings will be removed.', { defaultValue: 'This organization will use the global Trial configuration from Plans. Custom settings will be removed.' })}
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowResetConfirm(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{t('Cancel', { defaultValue: 'Cancel' })}</button>
                <button onClick={handleReset} disabled={resetting}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                  {resetting && <Loader2 className="w-4 h-4 animate-spin" />} {resetting ? t('Resetting...', { defaultValue: 'Resetting...' }) : t('Reset', { defaultValue: 'Reset' })}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
