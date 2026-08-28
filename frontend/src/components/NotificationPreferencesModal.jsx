import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MdClose, MdNotifications, MdEmail, MdDesktopWindows, MdCheck } from 'react-icons/md';
import axios from 'axios';
import API_URL from '../config/api';
import { authToken } from '../utils/auth';
import './NotificationPreferencesModal.css';

/**
 * FEATURE: Centered Modal for managing both Email and Desktop notification preferences.
 */
const NotificationPreferencesModal = ({ isOpen, onClose, currentUser, onUserUpdated }) => {
  const { t } = useTranslation();
  const [preferences, setPreferences] = useState({
    enable_email: true,
    enable_desktop: false,
    task_assigned: true,
    project_updates: true,
    system_announcements: true,
    self_actions: false, // Default to false (prevent self-spam)
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (currentUser && currentUser.notification_preferences) {
      setPreferences((prev) => ({
        ...prev,
        ...currentUser.notification_preferences,
      }));
    }
  }, [currentUser, isOpen]);

  if (!isOpen) return null;

  const handleToggle = async (key) => {
    if (key === 'enable_desktop' && !preferences.enable_desktop) {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setMessage({
            type: 'error',
            text: t('Desktop notification permission was denied in your browser settings.', { defaultValue: 'Desktop notification permission was denied in your browser settings.' }),
          });
          return;
        }
      } else {
        setMessage({
          type: 'error',
          text: t('Your browser does not support desktop notifications.', { defaultValue: 'Your browser does not support desktop notifications.' }),
        });
        return;
      }
    }

    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const token = authToken();
      const response = await axios.post(
        `${API_URL}/user/notification-preferences`,
        { notification_preferences: preferences },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setMessage({ type: 'success', text: t('Notification preferences saved!', { defaultValue: 'Notification preferences saved!' }) });

      if (onUserUpdated && response.data.user) {
        onUserUpdated(response.data.user);
      }

      setLoading(false);
      setTimeout(() => {
        setMessage({ type: '', text: '' });
        onClose(); // Automatically closes the modal
      }, 400);
    } catch (error) {
      setLoading(false);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || t('Failed to save preferences. Please try again.', { defaultValue: 'Failed to save preferences. Please try again.' }),
      });
    }
  };

  return (
    <div className="profile-overlay modal-overlay">
      <div className="profile-modal modal-content" style={{ maxWidth: '480px' }}>
        
        {/* Modal Header */}
        <div className="profile-header flex items-center justify-between">
          <div className="profile-user">
            <div className="profile-avatar" style={{ background: 'var(--color-primary)', color: '#fff' }}>
              <MdNotifications size={24} />
            </div>
            <div>
              <h2>{t("Notification Settings", { defaultValue: "Notification Settings" })}</h2>
              <p>{t("Configure how and when you receive updates", { defaultValue: "Configure how and when you receive updates" })}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="close-btn"
            style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <MdClose size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="profile-body modal-body-scroll" style={{ gap: '18px', maxHeight: '70vh', overflowY: 'auto' }}>
          {message.text && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                background: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: message.type === 'success' ? '#10b981' : '#ef4444',
                border: `1px solid ${message.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
              }}
            >
              {message.text}
            </div>
          )}

          {/* Section 1: Channels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
              {t("Notification Channels", { defaultValue: "Notification Channels" })}
            </label>

            {/* Desktop Toggle */}
            <div 
              onClick={() => handleToggle('enable_desktop')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card)',
                cursor: 'pointer',
                transition: '0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <MdDesktopWindows size={20} style={{ color: 'var(--color-primary)' }} />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{t("Desktop Notifications", { defaultValue: "Desktop Notifications" })}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t("Browser pop-up alerts", { defaultValue: "Browser pop-up alerts" })}</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={preferences.enable_desktop}
                onChange={() => {}}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
              />
            </div>

            {/* Email Toggle */}
            <div 
              onClick={() => handleToggle('enable_email')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card)',
                cursor: 'pointer',
                transition: '0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <MdEmail size={20} style={{ color: 'var(--color-primary)' }} />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{t("Email Notifications", { defaultValue: "Email Notifications" })}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t("Inbox alerts sent to your email", { defaultValue: "Inbox alerts sent to your email" })}</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={preferences.enable_email}
                onChange={() => {}}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
              />
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />

          {/* Section 2: Event Types */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
              {t("Notify Me About", { defaultValue: "Notify Me About" })}
            </label>

            {[
              { key: 'task_assigned', title: t('Task Assignments', { defaultValue: 'Task Assignments' }), desc: t('When tasks are assigned to you or updated', { defaultValue: 'When tasks are assigned to you or updated' }) },
              { key: 'project_updates', title: t('Project Activity', { defaultValue: 'Project Activity' }), desc: t('Milestone changes and project status updates', { defaultValue: 'Milestone changes and project status updates' }) },
              { key: 'system_announcements', title: t('System Announcements', { defaultValue: 'System Announcements' }), desc: t('Broadcast updates from portal admins', { defaultValue: 'Broadcast updates from portal admins' }) },
            ].map((item) => (
              <div
                key={item.key}
                onClick={() => handleToggle(item.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-card)',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{item.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.desc}</div>
                </div>
                <input
                  type="checkbox"
                  checked={preferences[item.key] || false}
                  onChange={() => {}}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                />
              </div>
            ))}
          </div>

          {/* Footer Actions */}
          <div className="profile-footer" style={{ padding: '10px 0 0 0', borderTop: '1px solid var(--border-color)', marginTop: '6px' }}>
            <button
              type="button"
              onClick={onClose}
              className="close-btn"
            >
              {t("Cancel")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="change-btn"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <MdCheck size={16} />
              {loading ? t('Saving...', { defaultValue: 'Saving...' }) : t('Save Settings', { defaultValue: 'Save Settings' })}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NotificationPreferencesModal;