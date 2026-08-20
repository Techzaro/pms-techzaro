import { useState, useEffect } from 'react';
import api from '../lib/api';
import DashboardLayout from '../components/layout/DashboardLayout';
import Breadcrumb from '../components/Breadcrumb';
import './NotificationSettings.css';

const CATEGORIES = [
  { key: 'project', label: 'Project Activity', description: 'Updates when you are added to a project, project status changes, and milestone updates' },
  { key: 'task', label: 'Task Notifications', description: 'When someone assigns a task to you, updates status, or submits work for review' },
  { key: 'sub_task', label: 'Sub-Tasks & Deliverables', description: 'When deliverables or sub-tasks are assigned to you or updated' },
  { key: 'events', label: 'Events & Calendar', description: 'When you are invited to events or schedule changes occur' },
  { key: 'profile', label: 'Profile & Security', description: 'Account security, profile updates, and password alerts' },
  { key: 'teams', label: 'Team Activity', description: 'When you are added to a team or appointed team leader' },
  { key: 'draft', label: 'Draft Items', description: 'Notifications regarding saved drafts and background items' },
];

export default function NotificationSettings() {
  const [preferences, setPreferences] = useState({});

  const [webhooks, setWebhooks] = useState({
    slack_webhook_url: '',
    google_chat_webhook_url: '',
    ms_teams_webhook_url: '',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      const response = await api.get('/notification-settings');
      if (response?.success) {
        if (response.preferences) {
          setPreferences(response.preferences);
        }
        if (response.webhooks) {
          setWebhooks(response.webhooks);
        }
      }
    } catch (err) {
      console.error('Failed to load notification settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (categoryKey, channel) => {
    setPreferences((prev) => {
      const currentCat = prev[categoryKey] || { email: true, desktop: true, slack: true, google_chat: true, teams_channel: true };
      return {
        ...prev,
        [categoryKey]: {
          ...currentCat,
          [channel]: !currentCat[channel],
        },
      };
    });
  };

  const handleToggleAllChannel = (channel, value) => {
    setPreferences((prev) => {
      const updated = { ...prev };
      CATEGORIES.forEach(({ key }) => {
        const currentCat = updated[key] || { email: true, desktop: true, slack: true, google_chat: true, teams_channel: true };
        updated[key] = { ...currentCat, [channel]: value };
      });
      return updated;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const response = await api.put(
        '/notification-settings',
        { preferences, webhooks }
      );
      if (response?.success) {
        setMessage('Notification preferences & webhooks saved successfully!');
      } else {
        setMessage('Failed to save preferences.');
      }
    } catch (err) {
      console.error('Save preferences error:', err);
      setMessage('Failed to save preferences.');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 4000);
    }
  };

  return (
    <DashboardLayout>
      <Breadcrumb items={[{ label: 'Notification Preferences' }]} />
      <div className="dashboard-page-content" style={{ padding: '1rem 0', boxSizing: 'border-box' }}>
        {/* Page Header Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Settings</span>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', margin: '0.2rem 0 0.4rem 0' }}>Multi-Channel Notification Preferences</h1>
            <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0 }}>Configure Outlook Email, Desktop, Slack, Google Chat, and Microsoft Teams alerts.</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              padding: '0.65rem 1.25rem',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: saving || loading ? 'not-allowed' : 'pointer',
              opacity: saving || loading ? 0.7 : 1,
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
              transition: 'all 0.2s',
            }}
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>

        {message && (
          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            marginBottom: '1.2rem',
            fontSize: '0.9rem',
            backgroundColor: message.includes('successfully') ? '#ecfdf5' : '#fef2f2',
            color: message.includes('successfully') ? '#047857' : '#b91c1c',
            border: `1px solid ${message.includes('successfully') ? '#a7f3d0' : '#fecaca'}`,
          }}>
            {message}
          </div>
        )}

        {/* Info Banner */}
        <div style={{
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '8px',
          padding: '0.85rem 1rem',
          marginBottom: '1.2rem',
          fontSize: '0.88rem',
          color: '#1e40af',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span>ℹ️</span>
          <div><strong>Receiver-Only Spam Prevention:</strong> The sender performing an action will never receive email, desktop, or 3rd-party webhook notifications. Senders only view history in the in-app Notifications tab.</div>
        </div>

        {/* THIRD-PARTY WEBHOOK INTEGRATIONS */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          padding: '1.5rem',
          marginBottom: '1.5rem',
        }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', marginTop: 0, marginBottom: '1rem' }}>Third-Party Integration Webhooks</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Slack Webhook URL
              </label>
              <input
                type="url"
                placeholder="https://hooks.slack.com/services/..."
                value={webhooks.slack_webhook_url || ''}
                onChange={(e) => setWebhooks((p) => ({ ...p, slack_webhook_url: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Google Chat Webhook URL
              </label>
              <input
                type="url"
                placeholder="https://chat.googleapis.com/v1/spaces/..."
                value={webhooks.google_chat_webhook_url || ''}
                onChange={(e) => setWebhooks((p) => ({ ...p, google_chat_webhook_url: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Microsoft Teams Webhook URL
              </label>
              <input
                type="url"
                placeholder="https://outlook.office.com/webhook/..."
                value={webhooks.ms_teams_webhook_url || ''}
                onChange={(e) => setWebhooks((p) => ({ ...p, ms_teams_webhook_url: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
              />
            </div>
          </div>
        </div>

        {/* Main Matrix Card */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
          padding: '1.5rem',
          boxSizing: 'border-box',
        }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', marginTop: 0, marginBottom: '1.2rem' }}>Category Channels Matrix</h3>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Loading preferences...</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', width: '30%' }}>Category</th>
                    {['email', 'desktop', 'slack', 'google_chat', 'teams_channel'].map((channel) => (
                      <th key={channel} style={{ padding: '0.75rem 0.5rem', fontSize: '0.78rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'center' }}>
                        <div>
                          {channel === 'email' && '📧 Outlook'}
                          {channel === 'desktop' && '💻 Desktop'}
                          {channel === 'slack' && '💬 Slack'}
                          {channel === 'google_chat' && '🟢 G-Chat'}
                          {channel === 'teams_channel' && '🟦 Teams'}
                        </div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 500, marginTop: '2px' }}>
                          <button type="button" onClick={() => handleToggleAllChannel(channel, true)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, fontSize: '0.68rem' }}>On</button>
                          <span style={{ margin: '0 2px', color: '#cbd5e1' }}>•</span>
                          <button type="button" onClick={() => handleToggleAllChannel(channel, false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0, fontSize: '0.68rem' }}>Off</button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CATEGORIES.map(({ key, label, description }, index) => {
                    return (
                      <tr key={key} style={{ borderBottom: index < CATEGORIES.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>{label}</div>
                          <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '2px' }}>{description}</div>
                        </td>
                        {['email', 'desktop', 'slack', 'google_chat', 'teams_channel'].map((channel) => {
                          const checked = preferences?.[key]?.[channel] ?? (key !== 'draft' && (channel === 'email' || channel === 'desktop'));
                          return (
                            <td key={channel} style={{ padding: '0.85rem 0.5rem', textAlign: 'center' }}>
                              <label style={{ position: 'relative', display: 'inline-block', width: '38px', height: '20px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => handleToggle(key, channel)}
                                  style={{ opacity: 0, width: 0, height: 0 }}
                                />
                                <span style={{
                                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                  backgroundColor: checked ? '#2563eb' : '#cbd5e1',
                                  transition: '.3s', borderRadius: '20px',
                                }}>
                                  <span style={{
                                    position: 'absolute', content: '""', height: '14px', width: '14px', left: '3px', bottom: '3px',
                                    backgroundColor: 'white', transition: '.3s', borderRadius: '50%',
                                    transform: checked ? 'translateX(18px)' : 'translateX(0)',
                                  }}></span>
                                </span>
                              </label>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
