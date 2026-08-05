import { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Save, Sun, Moon, User, Lock, Loader2 } from 'lucide-react';
import { useOrgBranding, useUpdateBranding } from '../../hooks/useOrgBranding';
import { useTheme } from '../../context/ThemeContext';
import { getUser, getStoredEmail } from '../../utils/auth';
import API_URL from '../../config/api';

const tabs = [
  { id: 'profile', label: 'Profile' },
  { id: 'password', label: 'Password' },
  { id: 'general', label: 'General' },
  { id: 'branding', label: 'Branding' },
];

export default function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const initialTab = params.get('tab') || 'profile';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [saved, setSaved] = useState(false);

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <div className="space-y-0">
      <div className="border-b" style={{ borderColor: 'var(--border-light)' }}>
        <div className="flex gap-0 overflow-x-auto">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap"
              style={{
                color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--text-muted)',
                borderColor: activeTab === tab.id ? 'var(--color-primary)' : 'transparent',
              }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-6">
        {activeTab === 'profile' && <ProfileSection />}
        {activeTab === 'password' && <PasswordSection />}
        {activeTab === 'general' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Platform Name</label>
                <input type="text" defaultValue={import.meta.env.VITE_APP_NAME || 'PMS'} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-hover)', color: 'var(--text-dark)', border: '1px solid var(--border-light)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Support Email</label>
                <input type="email" defaultValue="support@yourdomain.com" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-hover)', color: 'var(--text-dark)', border: '1px solid var(--border-light)' }} />
              </div>
            </div>

            <ThemeToggle />

            <div className="flex justify-end">
              <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
                <Save className="w-4 h-4" /> {saved ? 'Saved!' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'branding' && <BrandingSection />}
      </div>
    </div>
  );
}

function ProfileSection() {
  const user = getUser('admin');
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || getStoredEmail('admin') || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/super-admin/my-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email: user?.email || getStoredEmail('admin') }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update profile');
      if (data.user) {
        const sessions = JSON.parse(localStorage.getItem('sessions_admin') || '{}');
        const sid = sessionStorage.getItem('sessionId');
        if (sid && sessions[sid]) {
          sessions[sid].user = { ...sessions[sid].user, ...data.user };
          localStorage.setItem('sessions_admin', JSON.stringify(sessions));
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const s = {
    input: { background: 'var(--bg-hover)', color: 'var(--text-dark)', border: '1px solid var(--border-light)' },
    label: { color: 'var(--text-secondary)' },
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
          <span className="text-xl font-bold text-white">{(name || 'S').charAt(0).toUpperCase()}</span>
        </div>
        <div>
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>{name || 'Super Admin'}</h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Super Admin</p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1" style={s.label}>Full Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm" style={s.input} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={s.label}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm" style={s.input} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={s.label}>Phone</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm" style={s.input} placeholder="Optional" />
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
}

function PasswordSection() {
  const user = getUser('admin');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/super-admin/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email: user?.email || getStoredEmail('admin'), old_password: currentPassword, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to change password');
      setSaved(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const s = {
    input: { background: 'var(--bg-hover)', color: 'var(--text-dark)', border: '1px solid var(--border-light)' },
    label: { color: 'var(--text-secondary)' },
  };

  return (
    <div className="space-y-5 max-w-md">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1" style={s.label}>Current Password</label>
        <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm" style={s.input} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" style={s.label}>New Password</label>
        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm" style={s.input} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" style={s.label}>Confirm New Password</label>
        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm" style={s.input} />
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving || !currentPassword || !newPassword || !confirmPassword}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
          {saving ? 'Saving...' : saved ? 'Updated!' : 'Update Password'}
        </button>
      </div>
    </div>
  );
}

function BrandingSection() {
  const { data: branding, isLoading } = useOrgBranding();
  const updateBranding = useUpdateBranding();
  const [subtitle, setSubtitle] = useState('');
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const fileInputRef = useRef(null);

  if (isLoading && !initialized) {
    return (
      <div className="space-y-5">
        <div className="animate-pulse space-y-4">
          <div className="h-24 rounded-lg" style={{ background: 'var(--bg-hover)' }} />
          <div className="h-10 rounded-lg w-64" style={{ background: 'var(--bg-hover)' }} />
        </div>
      </div>
    );
  }

  if (branding && !initialized) {
    setSubtitle(branding.subtitle || 'PMS Portal');
    setLogoPreview(branding.logo_url || null);
    setInitialized(true);
  }

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.type)) return;
    if (file.size > 2 * 1024 * 1024) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => { setLogoFile(null); setLogoPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const handleSaveBranding = async () => {
    const formData = new FormData();
    formData.append('subtitle', subtitle);
    if (logoFile) formData.append('logo', logoFile);
    try { await updateBranding.mutateAsync(formData); } catch (err) {}
  };

  const initials = (subtitle || 'PMS').substring(0, 2).toUpperCase();

  const s = {
    text: { color: 'var(--text-dark)' },
    textSecondary: { color: 'var(--text-secondary)' },
    textMuted: { color: 'var(--text-muted)' },
    textHeading: { color: 'var(--text-heading)' },
    input: { background: 'var(--bg-hover)', color: 'var(--text-dark)', border: '1px solid var(--border-light)' },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="flex-1 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={s.textSecondary}>Subtitle Text</label>
            <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={100}
              className="w-full px-3 py-2 rounded-lg text-sm" style={s.input} placeholder="e.g. PMS Portal" />
            <p className="text-xs mt-1" style={s.textMuted}>Shown below the logo in sidebar and header</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={s.textSecondary}>Organization Logo</label>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" onChange={handleLogoChange} className="hidden" id="logo-upload" />
            <div className="flex items-center gap-3">
              <button onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
                {logoFile ? 'Change Logo' : 'Upload Logo'}
              </button>
              {logoPreview && (
                <button onClick={handleRemoveLogo} className="px-3 py-2 text-sm font-medium text-red-600 hover:text-red-700 transition-colors">Remove</button>
              )}
            </div>
            <p className="text-xs mt-1" style={s.textMuted}>JPG, PNG, WebP or SVG. Max 2MB.</p>
          </div>
        </div>

        <div className="flex-shrink-0">
          <p className="text-xs font-medium mb-2" style={s.textMuted}>Preview</p>
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ background: 'var(--bg-heading)' }}>
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-sm font-bold">{initials}</span>
              )}
            </div>
            <div>
              <h4 className="text-sm font-bold leading-tight" style={s.textHeading}>{subtitle || 'PMS Portal'}</h4>
              <span className="text-[10px]" style={s.textMuted}>Organization</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSaveBranding} disabled={updateBranding.isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
          <Save className="w-4 h-4" /> {updateBranding.isPending ? 'Saving...' : 'Save Branding'}
        </button>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="flex items-center justify-between p-4 rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
      <div className="flex items-center gap-3">
        {isDark ? <Moon className="w-5 h-5" style={{ color: '#818cf8' }} /> : <Sun className="w-5 h-5 text-amber-500" />}
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-heading)' }}>Appearance</p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Switch between light and dark mode</p>
        </div>
      </div>
      <button onClick={toggleTheme}
        className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors"
        style={{ background: isDark ? '#6366f1' : 'var(--text-muted)' }}>
        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white transition-transform ${isDark ? 'translate-x-6' : 'translate-x-1'}`}>
          {isDark ? <Moon className="h-3 w-3" style={{ color: '#6366f1' }} /> : <Sun className="h-3 w-3 text-amber-500" />}
        </span>
      </button>
    </div>
  );
}
