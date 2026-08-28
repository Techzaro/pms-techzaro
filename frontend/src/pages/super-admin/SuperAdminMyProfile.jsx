import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, Lock, Calendar, Clock, Shield, Save, Loader2 } from 'lucide-react';
import { getSuperAdminUser, superAdminAuthToken } from '../../utils/auth';
import { api } from './api/superAdminApi';
import { showSuccessMessage } from '../../utils/notify';
import '../../pages/UserProfile.css';

const displayPhone = (value) => {
  if (!value) return '---';
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return digits.slice(0, 4) + '-' + digits.slice(4);
};

const displayCNIC = (value) => {
  if (!value) return '---';
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return digits.slice(0, 5) + '-' + digits.slice(5);
  return digits.slice(0, 5) + '-' + digits.slice(5, 12) + '-' + digits.slice(12);
};

export default function SuperAdminMyProfile() {
  const { t } = useTranslation();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const user = getSuperAdminUser();
  const userEmail = user?.email || '';

  const fetchProfile = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getMyProfile(userEmail);
      setProfileData(data);
    } catch (err) {
      setError(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userEmail) {
      fetchProfile();
    } else {
      setError(t('Unable to identify your account. Please log in again.', { defaultValue: 'Unable to identify your account. Please log in again.' }));
      setLoading(false);
    }
  }, []);

  const validatePasswordForm = () => {
    const errors = {};
    if (!passwordForm.old_password) errors.old_password = t('Current password is required', { defaultValue: 'Current password is required' });
    if (!passwordForm.new_password) errors.new_password = t('New password is required', { defaultValue: 'New password is required' });
    else if (passwordForm.new_password.length < 8) errors.new_password = t('Password must be at least 8 characters', { defaultValue: 'Password must be at least 8 characters' });
    else if (!/[A-Z]/.test(passwordForm.new_password)) errors.new_password = t('Must include an uppercase letter', { defaultValue: 'Must include an uppercase letter' });
    else if (!/[a-z]/.test(passwordForm.new_password)) errors.new_password = t('Must include a lowercase letter', { defaultValue: 'Must include a lowercase letter' });
    else if (!/[0-9]/.test(passwordForm.new_password)) errors.new_password = t('Must include a number', { defaultValue: 'Must include a number' });
    if (passwordForm.new_password !== passwordForm.confirm_password) errors.confirm_password = t('Passwords do not match', { defaultValue: 'Passwords do not match' });
    return errors;
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    const errors = validatePasswordForm();
    setPasswordErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await api.changePassword(passwordForm.old_password, passwordForm.new_password);
      showSuccessMessage(t('Password', { defaultValue: 'Password' }), t('changed', { defaultValue: 'changed' }));
      setShowPasswordModal(false);
      setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      setPasswordErrors({ form: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-primary)' }} />
        <span className="ml-3 text-sm" style={{ color: 'var(--text-muted)' }}>{t('Loading profile...', { defaultValue: 'Loading profile...' })}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{t(error, { defaultValue: error })}</p>
        <button onClick={fetchProfile} className="mt-3 text-sm font-medium" style={{ color: 'var(--color-primary)' }}>{t('Retry', { defaultValue: 'Retry' })}</button>
      </div>
    );
  }

  const u = profileData?.user || {};
  const account = profileData?.account || {};

  return (
    <div className="space-y-0">
      {/* Profile header */}
      <div className="profile-header-profile" style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-heading)' }}>{t('My Profile', { defaultValue: 'My Profile' })}</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{t('View and manage your personal information and account settings.', { defaultValue: 'View and manage your personal information and account settings.' })}</p>
      </div>

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* LEFT SIDE */}
        <div style={{ flex: '1 1 0', minWidth: '0' }}>
          {/* User Card */}
          <div className="profile-info-card" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: '#fff', fontSize: '1rem', fontWeight: '600' }}>
                  {(u.name || 'S').charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--text-heading)', margin: 0 }}>{u.name || t('Super Admin', { defaultValue: 'Super Admin' })}</h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)' }}>{t('Super Admin', { defaultValue: 'Super Admin' })}</span>
              </div>
            </div>
          </div>

          {/* Personal Information */}
          <div className="profile-info-card">
            <div className="info-card-header">
              <h3>{t('Personal Information', { defaultValue: 'Personal Information' })}</h3>
              <button className="btn-edit" onClick={() => setShowPasswordModal(true)}>
                <Lock size={16} /> {t('Update Password', { defaultValue: 'Update Password' })}
              </button>
            </div>
            <div className="info-card-body">
              <div className="info-row">
                <span className="info-label">{t('Full Name', { defaultValue: 'Full Name' })}</span>
                <span className="info-value">{u.name || '---'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">{t('Father Name', { defaultValue: 'Father Name' })}</span>
                <span className="info-value">{u.father_name || '---'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">{t('ID Card Number', { defaultValue: 'ID Card Number' })}</span>
                <span className="info-value">{displayCNIC(u.id_card_number)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">{t('Phone Number', { defaultValue: 'Phone Number' })}</span>
                <span className="info-value">{displayPhone(u.phone_number || u.contact_no)}</span>
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="profile-info-card">
            <div className="info-card-header"><h3>{t('Address', { defaultValue: 'Address' })}</h3></div>
            <div className="info-card-body">
              <div className="info-row">
                <span className="info-label">{t('Present Address', { defaultValue: 'Present Address' })}</span>
                <span className="info-value">{u.present_address || u.address || '---'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">{t('Permanent Address', { defaultValue: 'Permanent Address' })}</span>
                <span className="info-value">{u.permanent_address || '---'}</span>
              </div>
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="profile-info-card">
            <div className="info-card-header"><h3>{t('Emergency Contact', { defaultValue: 'Emergency Contact' })}</h3></div>
            <div className="info-card-body">
              <div className="info-row">
                <span className="info-label">{t('Name', { defaultValue: 'Name' })}</span>
                <span className="info-value">{u.emergency_contact_name || '---'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">{t('Relation', { defaultValue: 'Relation' })}</span>
                <span className="info-value">{u.emergency_contact_relation || '---'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">{t('Phone', { defaultValue: 'Phone' })}</span>
                <span className="info-value">{displayPhone(u.emergency_contact_phone)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE - Account Status */}
        <div style={{ width: '280px', flexShrink: 0 }}>
          <div className="account-status-card">
            <h3>{t('Account Status', { defaultValue: 'Account Status' })}</h3>
            <div className="status-list">
              <div className="status-item">
                <span className={`status-dot ${u.active !== false ? 'dot-active' : 'dot-inactive'}`}></span>
                <span className="status-text">{u.active !== false ? t('Active', { defaultValue: 'Active' }) : t('Inactive', { defaultValue: 'Inactive' })}</span>
              </div>
              <div className="status-item">
                <span className="status-icon">
                  <Calendar size={18} />
                </span>
                <div className="status-info">
                  <span className="status-label">{t('Member Since', { defaultValue: 'Member Since' })}</span>
                  <span className="status-value">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '---'}
                  </span>
                </div>
              </div>
              <div className="status-item">
                <span className="status-icon">
                  <Clock size={18} />
                </span>
                <div className="status-info">
                  <span className="status-label">{t('Last Login', { defaultValue: 'Last Login' })}</span>
                  <span className="status-value">
                    {u.last_login_at
                      ? new Date(u.last_login_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                      : t('Never logged in', { defaultValue: 'Never logged in' })}
                  </span>
                </div>
              </div>
              <div className="status-item">
                <span className="status-icon">
                  <Shield size={18} />
                </span>
                <div className="status-info">
                  <span className="status-label">{t('Account Type', { defaultValue: 'Account Type' })}</span>
                  <span className="status-value">{t('Super Admin', { defaultValue: 'Super Admin' })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="user-modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="user-modal-content" style={{ maxWidth: '480px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <div className="user-modal-header">
              <div>
                <h2>{t('Change Password', { defaultValue: 'Change Password' })}</h2>
                <p className="modal-subtitle">{t('Update your account password.', { defaultValue: 'Update your account password.' })}</p>
              </div>
              <button className="user-modal-close" onClick={() => setShowPasswordModal(false)}>&#10005;</button>
            </div>
            <form onSubmit={handlePasswordSubmit}>
              <div className="user-modal-body">
                {passwordErrors.form && <div className="field-error-text form-error" style={{ marginBottom: '12px' }}>{passwordErrors.form}</div>}

                <div className="user-form-group">
                  <label>{t('Current Password', { defaultValue: 'Current Password' })}</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={passwordForm.old_password}
                      onChange={(e) => setPasswordForm({ ...passwordForm, old_password: e.target.value })}
                      placeholder={t("Enter current password", { defaultValue: "Enter current password" })}
                      style={{ width: '100%', paddingRight: '40px' }}
                    />
                    <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                      <Eye size={16} />
                    </button>
                  </div>
                  {passwordErrors.old_password && <span className="field-error-text">{passwordErrors.old_password}</span>}
                </div>

                <div className="user-form-group">
                  <label>{t('New Password', { defaultValue: 'New Password' })}</label>
                  <input
                    type="password"
                    value={passwordForm.new_password}
                    onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                    placeholder={t("Enter new password", { defaultValue: "Enter new password" })}
                  />
                  {passwordErrors.new_password && <span className="field-error-text">{passwordErrors.new_password}</span>}
                </div>

                <div className="user-form-group">
                  <label>{t('Confirm New Password', { defaultValue: 'Confirm New Password' })}</label>
                  <input
                    type="password"
                    value={passwordForm.confirm_password}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                    placeholder={t("Confirm new password", { defaultValue: "Confirm new password" })}
                  />
                  {passwordErrors.confirm_password && <span className="field-error-text">{passwordErrors.confirm_password}</span>}
                </div>
              </div>
              <div className="user-modal-footer">
                <button type="button" className="user-btn user-btn-secondary" onClick={() => setShowPasswordModal(false)}>{t('Cancel', { defaultValue: 'Cancel' })}</button>
                <button type="submit" className="user-btn user-btn-primary" disabled={saving}>
                  {saving ? <><Loader2 size={16} className="animate-spin" /> {t('Updating...', { defaultValue: 'Updating...' })}</> : <><Save size={16} /> {t('Update Password', { defaultValue: 'Update Password' })}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
