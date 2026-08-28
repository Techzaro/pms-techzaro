import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, AlertCircle, X, HardDrive, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../lib/api';

const SEVERITY_CONFIG = {
  warning: {
    bg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
    border: '#f59e0b',
    icon: AlertTriangle,
    iconColor: '#d97706',
    textColor: '#92400e',
    badgeBg: '#fef3c7',
    badgeColor: '#d97706',
  },
  critical: {
    bg: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
    border: '#ef4444',
    icon: AlertCircle,
    iconColor: '#dc2626',
    textColor: '#991b1b',
    badgeBg: '#fee2e2',
    badgeColor: '#dc2626',
  },
};

export default function StorageNotificationBanner() {
  const { t } = useTranslation();
  const [pinned, setPinned] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get('/organization/storage/notifications');
      if (res.success) {
        setPinned(res.pinned || []);
        setNotifications(res.notifications || []);
      }
    } catch (err) {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleDismiss = async (notifId) => {
    try {
      await api.post(`/organization/storage/notifications/${notifId}/dismiss`);
      setPinned(prev => prev.filter(n => n.id !== notifId));
      setNotifications(prev => prev.filter(n => n.id !== notifId));
    } catch (err) {
      console.error('Failed to dismiss notification');
    }
  };

  const handleDismissAll = async () => {
    try {
      await api.post('/organization/storage/notifications/dismiss-all');
      setPinned([]);
      setNotifications([]);
    } catch (err) {
      console.error('Failed to dismiss all');
    }
  };

  if (loading || (pinned.length === 0 && notifications.length === 0)) {
    return null;
  }

  // Show pinned notifications as top banner (like Google)
  const pinnedNotif = pinned[0]; // Most recent pinned
  if (pinnedNotif) {
    const config = SEVERITY_CONFIG[pinnedNotif.severity] || SEVERITY_CONFIG.warning;
    const Icon = config.icon;

    return (
      <div style={{
        background: config.bg,
        borderLeft: `4px solid ${config.border}`,
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        position: 'relative',
        zIndex: 50,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}>
        <Icon size={20} style={{ color: config.iconColor, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: config.badgeColor,
              background: config.badgeBg,
              padding: '2px 8px',
              borderRadius: '10px',
              border: `1px solid ${config.border}33`,
            }}>
              {t(pinnedNotif.severity)}
            </span>
            <span style={{ fontWeight: 700, fontSize: '13px', color: config.textColor }}>
              {pinnedNotif.title}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: config.textColor, lineHeight: 1.5 }}>
            {pinnedNotif.message}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <a href={`/${import.meta.env.VITE_SUPER_ADMIN_TENANT || 'techxaro'}/storage`} style={{
            fontSize: '12px',
            fontWeight: 600,
            color: config.badgeColor,
            textDecoration: 'underline',
            whiteSpace: 'nowrap',
          }}>
            {t("Manage Storage", { defaultValue: "Manage Storage" })}
          </a>
          <button onClick={() => handleDismiss(pinnedNotif.id)} style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            color: config.textColor,
            opacity: 0.7,
          }} title={t("Dismiss", { defaultValue: "Dismiss" })}>
            <X size={16} />
          </button>
        </div>

        {/* Additional non-pinned notifications dropdown */}
        {notifications.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0 }}>
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                width: '100%',
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderTop: 'none',
                padding: '6px 20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                fontSize: '12px',
                color: '#6b7280',
              }}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {t("{{count}} more notification(s)", { defaultValue: `${notifications.length} more notifications`, count: notifications.length })}
            </button>
            {expanded && (
              <div style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                maxHeight: '300px',
                overflow: 'auto',
              }}>
                {notifications.map(n => {
                  const nc = SEVERITY_CONFIG[n.severity] || SEVERITY_CONFIG.warning;
                  const NIcon = nc.icon;
                  return (
                    <div key={n.id} style={{
                      padding: '10px 20px',
                      borderBottom: '1px solid #f3f4f6',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                    }}>
                      <NIcon size={16} style={{ color: nc.iconColor, flexShrink: 0, marginTop: '2px' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '12px', color: nc.textColor }}>{n.title}</div>
                        <p style={{ margin: 0, fontSize: '11px', color: '#6b7280', lineHeight: 1.4 }}>{n.message}</p>
                      </div>
                      <button onClick={() => handleDismiss(n.id)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#9ca3af',
                      }}>
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
                <button onClick={handleDismissAll} style={{
                  width: '100%', padding: '8px', background: '#f9fafb', border: 'none', cursor: 'pointer',
                  fontSize: '12px', color: '#6b7280', fontWeight: 600,
                }}>
                  {t("Dismiss All", { defaultValue: "Dismiss All" })}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // No pinned but has regular notifications
  if (notifications.length > 0) {
    const latest = notifications[0];
    const config = SEVERITY_CONFIG[latest.severity] || SEVERITY_CONFIG.warning;
    const Icon = config.icon;

    return (
      <div style={{
        background: config.bg,
        borderLeft: `4px solid ${config.border}`,
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}>
        <Icon size={18} style={{ color: config.iconColor, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: '13px', color: config.textColor, fontWeight: 500 }}>
          <strong>{latest.title}</strong> — {latest.message}
        </span>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <a href={`/${import.meta.env.VITE_SUPER_ADMIN_TENANT || 'techxaro'}/storage`} style={{
            fontSize: '12px', fontWeight: 600, color: config.badgeColor, textDecoration: 'underline',
          }}>{t("Manage", { defaultValue: "Manage" })}</a>
          <button onClick={() => handleDismiss(latest.id)} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: config.textColor, opacity: 0.7,
          }}>
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
