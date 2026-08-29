import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/layout/DashboardLayout';
import Breadcrumb from '../components/Breadcrumb';
import api from '../lib/api';
import ConfirmModal from '../components/ConfirmModal';
import {
  HardDrive, FileText, Image, Archive, FolderOpen, TrendingUp,
  AlertTriangle, CheckCircle, Trash2, Clock, ChevronDown, ChevronUp,
  Loader2, Filter, Download, Calendar, ArrowDown, ArrowUp, Info,
  Zap, Shield, BarChart3, PieChart, Bell, Settings, X, AlertCircle
} from 'lucide-react';

const CATEGORY_CONFIG = {
  attachments: { label: 'Attachments', icon: FolderOpen, color: 'var(--color-primary)' },
  documents: { label: 'Documents', icon: FileText, color: 'var(--color-blue)' },
  images: { label: 'Images', icon: Image, color: 'var(--color-success)' },
  archives: { label: 'Archives', icon: Archive, color: 'var(--color-warning)' },
  other: { label: 'Other', icon: HardDrive, color: 'var(--text-muted)' },
};

const fmtBytesToUnit = (bytes, unit = 'GB') => {
  if (!bytes) return `0 ${unit}`;
  const divisors = { KB: 1024, MB: 1024**2, GB: 1024**3 };
  const divisor = divisors[unit] || divisors.GB;
  return `${(bytes / divisor).toFixed(2)} ${unit}`;
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function StoragePage() {
  const { t } = useTranslation();
  const [storage, setStorage] = useState(null);
  const [summary, setSummary] = useState(null);
  const [largeFiles, setLargeFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [pinnedNotifications, setPinnedNotifications] = useState([]);
  const [preferences, setPreferences] = useState(null);
  const [prefLoading, setPrefLoading] = useState(false);
  const [prefSaving, setPrefSaving] = useState(false);
  const [singleDeleteConfirm, setSingleDeleteConfirm] = useState({ open: false, id: null });

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get('/organization/storage/notifications');
      if (res.success) {
        setNotifications(res.notifications || []);
        setPinnedNotifications(res.pinned || []);
      }
    } catch (err) { /* ignore */ }
  }, []);

  const fetchPreferences = useCallback(async () => {
    setPrefLoading(true);
    try {
      const res = await api.get('/organization/storage/preferences');
      if (res.success) setPreferences(res.preferences);
    } catch (err) { /* ignore */ }
    finally { setPrefLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'notifications') fetchNotifications();
    if (activeTab === 'preferences') fetchPreferences();
  }, [activeTab, fetchNotifications, fetchPreferences]);

  async function fetchAllData() {
    try {
      setLoading(true);
      const [storageRes, summaryRes, largeRes] = await Promise.all([
        api.get('/organization/storage'),
        api.get('/organization/storage/summary'),
        api.get('/organization/storage/large-files?min_size_mb=500'),
      ]);

      if (storageRes.success) setStorage(storageRes.storage);
      if (summaryRes.success) setSummary(summaryRes.summary);
      if (largeRes.success) setLargeFiles(largeRes.large_files || []);

      // Also fetch notifications and preferences on initial load
      try {
        const [notifRes, prefRes] = await Promise.all([
          api.get('/organization/storage/notifications'),
          api.get('/organization/storage/preferences'),
        ]);
        if (notifRes.success) {
          setNotifications(notifRes.notifications || []);
          setPinnedNotifications(notifRes.pinned || []);
        }
        if (prefRes.success) setPreferences(prefRes.preferences);
      } catch (_) { /* ignore */ }
    } catch (err) {
      setError(t('Failed to load storage data.', { defaultValue: 'Failed to load storage data.' }));
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteOldFiles(months) {
    setDeleting(true);
    try {
      const res = await api.delete(`/organization/storage/old-files?months=${months}`);
      if (res.success) {
        setToast({ type: 'success', message: res.message });
        setDeleteModal(null);
        fetchAllData();
      }
    } catch (err) {
      setToast({ type: 'error', message: t('Failed to delete files.', { defaultValue: 'Failed to delete files.' }) });
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteLargeFiles(minSizeGb) {
    setDeleting(true);
    try {
      const res = await api.delete(`/organization/storage/large-files?min_size_gb=${minSizeGb}`);
      if (res.success) {
        setToast({ type: 'success', message: res.message });
        setDeleteModal(null);
        fetchAllData();
      }
    } catch (err) {
      setToast({ type: 'error', message: t('Failed to delete files.', { defaultValue: 'Failed to delete files.' }) });
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteSingleFile(id) {
    try {
      const res = await api.delete(`/organization/storage/${id}`);
      if (res.success) {
        setToast({ type: 'success', message: t('File record deleted.', { defaultValue: 'File record deleted.' }) });
        fetchAllData();
      }
    } catch (err) {
      setToast({ type: 'error', message: t('Failed to delete file.', { defaultValue: 'Failed to delete file.' }) });
    }
  }

  function toggleCategory(cat) {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  }

  if (loading) {
    return (
      <DashboardLayout hideRightSidebar>
        <Breadcrumb items={[{ label: t('Storage', { defaultValue: 'Storage' }) }]} />
        <div style={{ background: 'var(--bg-card)', borderRadius: '20px', padding: '40px', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <Loader2 style={{ width: '24px', height: '24px', animation: 'spin 1s linear infinite', color: 'var(--color-primary)' }} />
          <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{t('Loading storage data...', { defaultValue: 'Loading storage data...' })}</span>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout hideRightSidebar>
        <Breadcrumb items={[{ label: t('Storage', { defaultValue: 'Storage' }) }]} />
        <div style={{ background: 'var(--bg-card)', borderRadius: '20px', padding: '40px', boxShadow: 'var(--shadow-sm)', textAlign: 'center' }}>
          <AlertTriangle style={{ width: '40px', height: '40px', color: 'var(--color-danger)', margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--color-danger)', fontSize: '14px' }}>{error}</p>
        </div>
      </DashboardLayout>
    );
  }

  const usagePercent = summary?.usage_percent || storage?.usage_percent || 0;
  const warnThreshold = preferences?.warn_threshold || 80;
  const criticalThreshold = preferences?.critical_threshold || 90;
  const isWarning = usagePercent >= warnThreshold;
  const isCritical = usagePercent >= criticalThreshold;
  const isNearLimit = usagePercent > 70;

  return (
    <DashboardLayout hideRightSidebar>
      <Breadcrumb items={[{ label: t('Storage', { defaultValue: 'Storage' }) }]} />

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
          padding: '12px 20px', borderRadius: '12px',
          background: toast.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
          border: `1px solid ${toast.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)'}`,
          display: 'flex', alignItems: 'center', gap: '8px', boxShadow: 'var(--shadow-md)',
          animation: 'slideIn 0.3s ease',
        }}>
          {toast.type === 'success' ? <CheckCircle style={{ width: '16px', height: '16px', color: 'var(--color-success)' }} /> : <AlertTriangle style={{ width: '16px', height: '16px', color: 'var(--color-danger)' }} />}
          <span style={{ fontSize: '13px', fontWeight: 600, color: toast.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)' }}>{toast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>{t('Storage Management', { defaultValue: 'Storage Management' })}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '4px 0 0' }}>
            {summary?.org_name} &middot; {t('{{plan}} Plan', { plan: summary?.plan_name, defaultValue: `${summary?.plan_name} Plan` })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { key: 'overview', label: t('Overview', { defaultValue: 'Overview' }), icon: BarChart3 },
            { key: 'files', label: t('Files', { defaultValue: 'Files' }), icon: FileText },
            { key: 'cleanup', label: t('Cleanup', { defaultValue: 'Cleanup' }), icon: Trash2 },
            { key: 'notifications', label: t('Notifications', { defaultValue: 'Notifications' }), icon: Bell, badge: notifications.filter(n => !n.is_read).length },
            { key: 'preferences', label: t('Preferences', { defaultValue: 'Preferences' }), icon: Settings },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '10px', border: 'none',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                background: activeTab === tab.key ? 'var(--color-primary)' : 'var(--bg-hover)',
                color: activeTab === tab.key ? '#fff' : 'var(--text-secondary)',
                transition: 'all 0.2s',
              }}
            >
              <tab.icon style={{ width: '14px', height: '14px' }} />
              {tab.label}
              {tab.badge > 0 && (
                <span style={{
                  background: 'var(--color-danger)',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '10px',
                  marginLeft: '4px',
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Critical Warning Banner */}
      {isCritical && (
        <div style={{
          padding: '14px 20px', borderRadius: '14px',
          background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger)',
          display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px',
        }}>
          <AlertTriangle style={{ width: '20px', height: '20px', color: 'var(--color-danger)', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-danger)', margin: 0 }}>{t('Storage Almost Full', { defaultValue: 'Storage Almost Full' })}</p>
            <p style={{ fontSize: '12px', color: 'var(--color-danger)', margin: '2px 0 0', opacity: 0.8 }}>
              {t("You've used {{percent}}% of your storage. Consider deleting old or large files.", { percent: usagePercent, defaultValue: `You've used ${usagePercent}% of your storage. Consider deleting old or large files.` })}
            </p>
          </div>
        </div>
      )}

      {isWarning && !isCritical && (
        <div style={{
          padding: '14px 20px', borderRadius: '14px',
          background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning)',
          display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px',
        }}>
          <AlertTriangle style={{ width: '20px', height: '20px', color: 'var(--color-warning)', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-warning)', margin: 0 }}>{t('Storage Warning', { defaultValue: 'Storage Warning' })}</p>
            <p style={{ fontSize: '12px', color: 'var(--color-warning)', margin: '2px 0 0', opacity: 0.8 }}>
              {t("You've used {{percent}}% of your storage. Consider cleaning up unused files.", { percent: usagePercent, defaultValue: `You've used ${usagePercent}% of your storage. Consider cleaning up unused files.` })}
            </p>
          </div>
        </div>
      )}

      {/* ═══════════ OVERVIEW TAB ═══════════ */}
      {activeTab === 'overview' && (
        <>
          {/* Main Storage Card */}
          <div style={{
            background: 'var(--bg-card)', borderRadius: '20px', padding: '28px',
            boxShadow: 'var(--shadow-sm)', marginBottom: '20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '52px', height: '52px', borderRadius: '16px',
                  background: isCritical ? 'var(--color-danger-bg)' : isWarning ? 'var(--color-warning-bg)' : 'var(--color-primary-bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isCritical ? (
                    <AlertTriangle style={{ width: '26px', height: '26px', color: 'var(--color-danger)' }} />
                  ) : isWarning ? (
                    <AlertTriangle style={{ width: '26px', height: '26px', color: 'var(--color-warning)' }} />
                  ) : (
                    <HardDrive style={{ width: '26px', height: '26px', color: 'var(--color-primary)' }} />
                  )}
                </div>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>{t('Storage Usage', { defaultValue: 'Storage Usage' })}</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '2px 0 0' }}>
                    {t('{{count}} files uploaded', { count: summary?.total_files || 0, defaultValue: `${summary?.total_files || 0} files uploaded` })}
                  </p>
                </div>
              </div>
              <div style={{
                padding: '8px 16px', borderRadius: '20px',
                background: isCritical ? 'var(--color-danger-bg)' : isWarning ? 'var(--color-warning-bg)' : 'var(--color-success-bg)',
                fontSize: '13px', fontWeight: 700,
                color: isCritical ? 'var(--color-danger)' : isWarning ? 'var(--color-warning)' : 'var(--color-success)',
              }}>
                {t('{{percent}}% Used', { percent: usagePercent, defaultValue: `${usagePercent}% Used` })}
              </div>
            </div>

            {/* Circular-style progress bar */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)' }}>
<span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-dark)' }}>
                  {fmtBytesToUnit(summary?.total_bytes || storage?.total_bytes || 0, summary?.storage_unit || storage?.storage_unit || 'GB')}
                </span>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  {t('of {{max}} {{unit}}', {
                    max: summary?.max_storage_gb || storage?.max_storage_gb || 0,
                    unit: summary?.storage_unit || storage?.storage_unit || 'GB',
                    defaultValue: `of ${summary?.max_storage_gb || storage?.max_storage_gb || 0} ${summary?.storage_unit || storage?.storage_unit || 'GB'}`
                  })}
                </span>
                </span>
              </div>
              <div style={{ width: '100%', height: '14px', borderRadius: '7px', background: 'var(--bg-hover)', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(usagePercent, 100)}%`,
                  height: '100%',
                  borderRadius: '7px',
                  background: isCritical
                    ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                    : isWarning
                      ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                      : 'linear-gradient(90deg, var(--color-primary), #6366f1)',
                  transition: 'width 0.6s ease',
                  boxShadow: isCritical ? '0 2px 8px rgba(239,68,68,0.3)' : isWarning ? '0 2px 8px rgba(245,158,11,0.3)' : '0 2px 8px rgba(79,70,229,0.3)',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
<span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {t('{{percent}}% used', { percent: usagePercent, defaultValue: `${usagePercent}% used` })}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {t('{{remaining}} remaining', { 
                    remaining: fmtBytesToUnit(summary?.remaining_bytes, summary?.storage_unit || 'GB'), 
                    defaultValue: `${fmtBytesToUnit(summary?.remaining_bytes, summary?.storage_unit || 'GB')} remaining` 
                  })}
                </span>
              </div>
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
              {[
{ label: t('Total Files', { defaultValue: 'Total Files' }), value: summary?.total_files || 0, color: 'var(--color-primary)', icon: FileText },
                { label: t('Used Space', { defaultValue: 'Used Space' }), value: fmtBytesToUnit(summary?.total_bytes || 0, summary?.storage_unit || 'GB'), color: 'var(--color-blue)', icon: HardDrive },
                { label: t('Storage Limit', { defaultValue: 'Storage Limit' }), value: `${summary?.max_storage_gb || 0} ${summary?.storage_unit || 'GB'}`, color: 'var(--color-success)', icon: Shield },
                { label: t('Remaining', { defaultValue: 'Remaining' }), value: fmtBytesToUnit(summary?.remaining_bytes, summary?.storage_unit || 'GB'), color: isCritical ? 'var(--color-danger)' : 'var(--color-warning)', icon: ArrowDown },
              ].map((stat) => (
                <div key={stat.label} style={{
                  padding: '16px', borderRadius: '14px',
                  background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <stat.icon style={{ width: '14px', height: '14px', color: stat.color }} />
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</p>
                  </div>
                  <p style={{ fontSize: '22px', fontWeight: 700, color: stat.color, margin: 0 }}>{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Category Breakdown */}
          {storage?.by_category?.length > 0 && (
            <div style={{
              background: 'var(--bg-card)', borderRadius: '20px', padding: '24px',
              boxShadow: 'var(--shadow-sm)', marginBottom: '20px',
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PieChart style={{ width: '18px', height: '18px', color: 'var(--color-primary)' }} />
                {t('Usage by Category', { defaultValue: 'Usage by Category' })}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {storage.by_category.map((cat) => {
                  const config = CATEGORY_CONFIG[cat.category] || CATEGORY_CONFIG.other;
                  const Icon = config.icon;
                  const catPercent = storage.total_bytes > 0 ? ((cat.total_bytes / storage.total_bytes) * 100).toFixed(1) : 0;
                  return (
                    <div key={cat.category} style={{
                      padding: '14px 16px', borderRadius: '14px',
                      background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px' }}>
                        <div style={{
                          width: '40px', height: '40px', borderRadius: '10px',
                          background: `${config.color}15`, color: config.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <Icon style={{ width: '18px', height: '18px' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dark)', margin: 0 }}>{t(config.label, { defaultValue: config.label })}</p>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{t('{{count}} files', { count: cat.file_count, defaultValue: `${cat.file_count} files` })}</p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>{cat.total_mb} MB</p>
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{catPercent}%</p>
                        </div>
                      </div>
                      <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'var(--bg-card)', overflow: 'hidden' }}>
                        <div style={{
                          width: `${catPercent}%`, height: '100%', borderRadius: '3px',
                          background: config.color, transition: 'width 0.5s ease',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Storage by Size Distribution */}
          {summary?.old_files && (
            <div style={{
              background: 'var(--bg-card)', borderRadius: '20px', padding: '24px',
              boxShadow: 'var(--shadow-sm)', marginBottom: '20px',
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock style={{ width: '18px', height: '18px', color: 'var(--color-primary)' }} />
                {t('File Age Distribution', { defaultValue: 'File Age Distribution' })}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                {[
                  { label: t('Older than 3 months', { defaultValue: 'Older than 3 months' }), count: summary.old_files['3_months']?.count || 0, size: summary.old_files['3_months']?.size_mb || 0, color: '#f59e0b' },
                  { label: t('Older than 6 months', { defaultValue: 'Older than 6 months' }), count: summary.old_files['6_months']?.count || 0, size: summary.old_files['6_months']?.size_mb || 0, color: '#f97316' },
                  { label: t('Older than 1 year', { defaultValue: 'Older than 1 year' }), count: summary.old_files['12_months']?.count || 0, size: summary.old_files['12_months']?.size_mb || 0, color: '#ef4444' },
                ].map((item) => (
                  <div key={item.label} style={{
                    padding: '16px', borderRadius: '14px',
                    background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
                    borderLeft: `3px solid ${item.color}`,
                  }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</p>
                    <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-heading)', margin: '6px 0 0' }}>{t('{{count}} files', { count: item.count, defaultValue: `${item.count} files` })}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>{t('{{size}} MB total', { size: item.size, defaultValue: `${item.size} MB total` })}</p>
                  </div>
                ))}
              </div>
              {summary?.large_files && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '12px' }}>
                  {[
                    { label: t('Files > 1 GB', { defaultValue: 'Files > 1 GB' }), count: summary.large_files['over_1gb']?.count || 0, size: summary.large_files['over_1gb']?.size_mb || 0, color: '#ef4444' },
                    { label: t('Files > 2 GB', { defaultValue: 'Files > 2 GB' }), count: summary.large_files['over_2gb']?.count || 0, size: summary.large_files['over_2gb']?.size_mb || 0, color: '#dc2626' },
                  ].map((item) => (
                    <div key={item.label} style={{
                      padding: '16px', borderRadius: '14px',
                      background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
                      borderLeft: `3px solid ${item.color}`,
                    }}>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</p>
                      <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-heading)', margin: '6px 0 0' }}>{t('{{count}} files', { count: item.count, defaultValue: `${item.count} files` })}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>{t('{{size}} MB total', { size: item.size, defaultValue: `${item.size} MB total` })}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ═══════════ FILES TAB ═══════════ */}
      {activeTab === 'files' && (
        <>
          {/* Large Files */}
          {largeFiles.length > 0 && (
            <div style={{
              background: 'var(--bg-card)', borderRadius: '20px', padding: '24px',
              boxShadow: 'var(--shadow-sm)', marginBottom: '20px',
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle style={{ width: '18px', height: '18px', color: 'var(--color-warning)' }} />
                {t('Large Files ({{count}})', { count: largeFiles.length, defaultValue: `Large Files (${largeFiles.length})` })}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
                {t('Files larger than 500 MB that may be consuming significant storage.', { defaultValue: 'Files larger than 500 MB that may be consuming significant storage.' })}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {largeFiles.map((file) => (
                  <div key={file.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', borderRadius: '12px',
                    background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                      <div style={{
                        width: '38px', height: '38px', borderRadius: '10px',
                        background: file.file_size_gb >= 2 ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <FileText style={{ width: '16px', height: '16px', color: file.file_size_gb >= 2 ? 'var(--color-danger)' : 'var(--color-warning)' }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dark)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {file.file_name}
                        </p>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                          {t(file.category, { defaultValue: file.category })} {file.uploaded_by ? `· ${file.uploaded_by}` : ''} · {formatDate(file.created_at)}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                        background: file.file_size_gb >= 2 ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)',
                        color: file.file_size_gb >= 2 ? 'var(--color-danger)' : 'var(--color-warning)',
                      }}>
                        {file.file_size_mb} MB
                      </span>
                      <button
                        onClick={() => setSingleDeleteConfirm({ open: true, id: file.id })}
                        style={{
                          padding: '6px 10px', borderRadius: '8px', border: 'none',
                          background: 'var(--color-danger-bg)', color: 'var(--color-danger)',
                          cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                          display: 'flex', alignItems: 'center', gap: '4px',
                        }}
                      >
                        <Trash2 style={{ width: '12px', height: '12px' }} />
                        {t('Delete', { defaultValue: 'Delete' })}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Files */}
          {storage?.recent_files?.length > 0 && (
            <div style={{
              background: 'var(--bg-card)', borderRadius: '20px', padding: '24px',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 16px' }}>
                {t('Recent Files', { defaultValue: 'Recent Files' })}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {storage.recent_files.map((file) => (
                  <div key={file.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', borderRadius: '12px',
                    background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                      <FileText style={{ width: '16px', height: '16px', color: 'var(--text-muted)', flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dark)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {file.file_name}
                        </p>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                          {t(file.category, { defaultValue: file.category })} {file.uploaded_by ? `· ${file.uploaded_by}` : ''}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{file.file_size_mb} MB</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {new Date(file.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      <button
                        onClick={() => setSingleDeleteConfirm({ open: true, id: file.id })}
                        style={{
                          padding: '4px 8px', borderRadius: '6px', border: 'none',
                          background: 'transparent', color: 'var(--text-muted)',
                          cursor: 'pointer', display: 'flex', alignItems: 'center',
                        }}
                        title={t('Delete', { defaultValue: 'Delete' })}
                      >
                        <Trash2 style={{ width: '14px', height: '14px' }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════ CLEANUP TAB ═══════════ */}
      {activeTab === 'cleanup' && (
        <>
          {/* Delete Old Files */}
          <div style={{
            background: 'var(--bg-card)', borderRadius: '20px', padding: '24px',
            boxShadow: 'var(--shadow-sm)', marginBottom: '20px',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock style={{ width: '18px', height: '18px', color: 'var(--color-warning)' }} />
              {t('Delete Old Files', { defaultValue: 'Delete Old Files' })}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
              {t('Remove files older than a specific time period to free up storage space.', { defaultValue: 'Remove files older than a specific time period to free up storage space.' })}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              {[
                { months: 3, label: t('3+ Months Old', { defaultValue: '3+ Months Old' }), desc: t('Delete files older than 3 months', { defaultValue: 'Delete files older than 3 months' }), count: summary?.old_files?.['3_months']?.count || 0, size: summary?.old_files?.['3_months']?.size_mb || 0, color: '#f59e0b' },
                { months: 6, label: t('6+ Months Old', { defaultValue: '6+ Months Old' }), desc: t('Delete files older than 6 months', { defaultValue: 'Delete files older than 6 months' }), count: summary?.old_files?.['6_months']?.count || 0, size: summary?.old_files?.['6_months']?.size_mb || 0, color: '#f97316' },
                { months: 12, label: t('1+ Year Old', { defaultValue: '1+ Year Old' }), desc: t('Delete files older than 1 year', { defaultValue: 'Delete files older than 1 year' }), count: summary?.old_files?.['12_months']?.count || 0, size: summary?.old_files?.['12_months']?.size_mb || 0, color: '#ef4444' },
              ].map((item) => (
                <div key={item.months} style={{
                  padding: '20px', borderRadius: '14px',
                  background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
                  display: 'flex', flexDirection: 'column', gap: '12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '10px',
                      background: `${item.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Clock style={{ width: '18px', height: '18px', color: item.color }} />
                    </div>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>{item.label}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{item.desc}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>{item.count}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{item.size} MB</p>
                    </div>
                    <button
                      onClick={() => setDeleteModal({ type: 'old', months: item.months, label: item.label, count: item.count, size: item.size })}
                      disabled={item.count === 0}
                      style={{
                        padding: '8px 16px', borderRadius: '10px', border: 'none',
                        background: item.count > 0 ? 'var(--color-danger)' : 'var(--bg-hover)',
                        color: item.count > 0 ? '#fff' : 'var(--text-muted)',
                        fontSize: '12px', fontWeight: 600, cursor: item.count > 0 ? 'pointer' : 'not-allowed',
                        display: 'flex', alignItems: 'center', gap: '6px',
                      }}
                    >
                      <Trash2 style={{ width: '12px', height: '12px' }} />
                      {t('Delete', { defaultValue: 'Delete' })}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Delete Large Files */}
          <div style={{
            background: 'var(--bg-card)', borderRadius: '20px', padding: '24px',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap style={{ width: '18px', height: '18px', color: 'var(--color-danger)' }} />
              {t('Delete Large Files', { defaultValue: 'Delete Large Files' })}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
              {t('Remove files that exceed a specific size threshold to quickly reclaim storage.', { defaultValue: 'Remove files that exceed a specific size threshold to quickly reclaim storage.' })}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              {[
                { minGb: 1, label: t('> 1 GB Files', { defaultValue: '> 1 GB Files' }), count: summary?.large_files?.['over_1gb']?.count || 0, size: summary?.large_files?.['over_1gb']?.size_mb || 0, color: '#ef4444' },
                { minGb: 2, label: t('> 2 GB Files', { defaultValue: '> 2 GB Files' }), count: summary?.large_files?.['over_2gb']?.count || 0, size: summary?.large_files?.['over_2gb']?.size_mb || 0, color: '#dc2626' },
              ].map((item) => (
                <div key={item.minGb} style={{
                  padding: '20px', borderRadius: '14px',
                  background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
                  display: 'flex', flexDirection: 'column', gap: '12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '10px',
                      background: `${item.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Zap style={{ width: '18px', height: '18px', color: item.color }} />
                    </div>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>{item.label}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{t('Files larger than {{min}} GB', { min: item.minGb, defaultValue: `Files larger than ${item.minGb} GB` })}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>{item.count}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{item.size} MB</p>
                    </div>
                    <button
                      onClick={() => setDeleteModal({ type: 'large', minGb: item.minGb, label: item.label, count: item.count, size: item.size })}
                      disabled={item.count === 0}
                      style={{
                        padding: '8px 16px', borderRadius: '10px', border: 'none',
                        background: item.count > 0 ? 'var(--color-danger)' : 'var(--bg-hover)',
                        color: item.count > 0 ? '#fff' : 'var(--text-muted)',
                        fontSize: '12px', fontWeight: 600, cursor: item.count > 0 ? 'pointer' : 'not-allowed',
                        display: 'flex', alignItems: 'center', gap: '6px',
                      }}
                    >
                      <Trash2 style={{ width: '12px', height: '12px' }} />
                      {t('Delete', { defaultValue: 'Delete' })}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Storage Report */}
          <div style={{
            background: 'var(--bg-card)', borderRadius: '20px', padding: '24px',
            boxShadow: 'var(--shadow-sm)', marginTop: '20px',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info style={{ width: '18px', height: '18px', color: 'var(--color-primary)' }} />
              {t('Storage Report', { defaultValue: 'Storage Report' })}
            </h3>
            <div style={{
              padding: '16px', borderRadius: '12px',
              background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('Organization', { defaultValue: 'Organization' })}</p>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dark)', margin: '4px 0 0' }}>{summary?.org_name}</p>
                </div>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('Current Plan', { defaultValue: 'Current Plan' })}</p>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dark)', margin: '4px 0 0' }}>{summary?.plan_name}</p>
                </div>
                <div>
<p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t('Storage Used', { defaultValue: 'Storage Used' })}
                  </p>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dark)', margin: '4px 0 0' }}>
                    {fmtBytesToUnit(summary?.total_bytes || 0, summary?.storage_unit || 'GB')} / {summary?.max_storage_gb || 0} {summary?.storage_unit || 'GB'}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('Total Files', { defaultValue: 'Total Files' })}</p>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dark)', margin: '4px 0 0' }}>{summary?.total_files}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══════════ NOTIFICATIONS TAB ═══════════ */}
      {activeTab === 'notifications' && (
        <div style={{
          background: 'var(--bg-card)', borderRadius: '20px', padding: '28px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell style={{ width: '18px', height: '18px', color: 'var(--color-primary)' }} />
              {t('Storage Notifications', { defaultValue: 'Storage Notifications' })}
            </h3>
            {notifications.length > 0 && (
              <button
                onClick={async () => {
                  await api.post('/organization/storage/notifications/dismiss-all');
                  setNotifications([]);
                  setPinnedNotifications([]);
                  setToast({ type: 'success', message: t('All notifications dismissed.', { defaultValue: 'All notifications dismissed.' }) });
                }}
                style={{
                  padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border-light)',
                  background: 'var(--bg-hover)', color: 'var(--text-secondary)',
                  fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t('Dismiss All', { defaultValue: 'Dismiss All' })}
              </button>
            )}
          </div>

          {pinnedNotifications.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>{t('Active Alerts', { defaultValue: 'Active Alerts' })}</p>
              {pinnedNotifications.map(n => (
                <div key={n.id} style={{
                  padding: '14px 18px', borderRadius: '12px', marginBottom: '8px',
                  background: n.severity === 'critical' ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)',
                  border: `1px solid ${n.severity === 'critical' ? 'var(--color-danger)' : 'var(--color-warning)'}`,
                  display: 'flex', alignItems: 'flex-start', gap: '12px',
                }}>
                  {n.severity === 'critical'
                    ? <AlertCircle style={{ width: '18px', height: '18px', color: 'var(--color-danger)', flexShrink: 0, marginTop: '2px' }} />
                    : <AlertTriangle style={{ width: '18px', height: '18px', color: 'var(--color-warning)', flexShrink: 0, marginTop: '2px' }} />
                  }
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: n.severity === 'critical' ? 'var(--color-danger)' : 'var(--color-warning)', margin: 0 }}>{n.title}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0', lineHeight: 1.5 }}>{n.message}</p>
                  </div>
                  <button onClick={async () => {
                    await api.post(`/organization/storage/notifications/${n.id}/dismiss`);
                    setPinnedNotifications(prev => prev.filter(x => x.id !== n.id));
                    setNotifications(prev => prev.filter(x => x.id !== n.id));
                  }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
                    <X style={{ width: '14px', height: '14px' }} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {notifications.length === 0 && pinnedNotifications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <Bell style={{ width: '40px', height: '40px', color: 'var(--text-muted)', margin: '0 auto 12px' }} />
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>{t('No storage notifications', { defaultValue: 'No storage notifications' })}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>{t("You'll see alerts here when storage thresholds are reached", { defaultValue: "You'll see alerts here when storage thresholds are reached" })}</p>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>{t('History', { defaultValue: 'History' })}</p>
              {notifications.map(n => (
                <div key={n.id} style={{
                  padding: '12px 16px', borderRadius: '10px', marginBottom: '6px',
                  background: n.is_read ? 'transparent' : 'var(--bg-hover)',
                  border: '1px solid var(--border-light)',
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  opacity: n.is_read ? 0.7 : 1,
                }}>
                  {n.severity === 'critical'
                    ? <AlertCircle style={{ width: '16px', height: '16px', color: 'var(--color-danger)', flexShrink: 0, marginTop: '2px' }} />
                    : <AlertTriangle style={{ width: '16px', height: '16px', color: 'var(--color-warning)', flexShrink: 0, marginTop: '2px' }} />
                  }
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>{n.title}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>{n.message}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                  <button onClick={async () => {
                    await api.post(`/organization/storage/notifications/${n.id}/dismiss`);
                    setNotifications(prev => prev.filter(x => x.id !== n.id));
                  }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
                    <X style={{ width: '14px', height: '14px' }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ PREFERENCES TAB ═══════════ */}
      {activeTab === 'preferences' && (
        <div style={{
          background: 'var(--bg-card)', borderRadius: '20px', padding: '28px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings style={{ width: '18px', height: '18px', color: 'var(--color-primary)' }} />
            {t('Storage Preferences', { defaultValue: 'Storage Preferences' })}
          </h3>

          {prefLoading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Loader2 style={{ width: '24px', height: '24px', color: 'var(--color-primary)', animation: 'spin 1s linear infinite' }} />
            </div>
          ) : preferences ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Auto-Delete Toggle */}
              <div style={{
                padding: '18px 20px', borderRadius: '14px',
                background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>{t('Auto-Delete Old Files', { defaultValue: 'Auto-Delete Old Files' })}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                      {t('Automatically delete oldest files when storage is full', { defaultValue: 'Automatically delete oldest files when storage is full' })}
                    </p>
                  </div>
                  <button
                    onClick={() => setPreferences(p => ({ ...p, auto_delete: !p.auto_delete }))}
                    style={{
                      width: '48px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer',
                      background: preferences.auto_delete ? 'var(--color-primary)' : '#d1d5db',
                      position: 'relative', transition: 'background 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: '3px', left: preferences.auto_delete ? '25px' : '3px',
                      width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
                      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                </div>
              </div>

              {/* Overwrite Toggle */}
              <div style={{
                padding: '18px 20px', borderRadius: '14px',
                background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>{t('Overwrite When Full', { defaultValue: 'Overwrite When Full' })}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                      {t('Allow overwriting oldest files when storage limit is reached', { defaultValue: 'Allow overwriting oldest files when storage limit is reached' })}
                    </p>
                  </div>
                  <button
                    onClick={() => setPreferences(p => ({ ...p, overwrite: !p.overwrite }))}
                    style={{
                      width: '48px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer',
                      background: preferences.overwrite ? 'var(--color-primary)' : '#d1d5db',
                      position: 'relative', transition: 'background 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: '3px', left: preferences.overwrite ? '25px' : '3px',
                      width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
                      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                </div>
              </div>

              {/* Threshold Settings */}
              <div style={{
                padding: '18px 20px', borderRadius: '14px',
                background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
              }}>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 16px' }}>{t('Notification Thresholds', { defaultValue: 'Notification Thresholds' })}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  {[
                    { key: 'warn_threshold', label: t('Warning', { defaultValue: 'Warning' }), color: 'var(--color-warning)', desc: t('First alert', { defaultValue: 'First alert' }) },
                    { key: 'critical_threshold', label: t('Critical', { defaultValue: 'Critical' }), color: 'var(--color-danger)', desc: t('Urgent alert', { defaultValue: 'Urgent alert' }) },
                    { key: 'pin_threshold', label: t('Pinned', { defaultValue: 'Pinned' }), color: '#dc2626', desc: t('Header banner', { defaultValue: 'Header banner' }) },
                  ].map(({ key, label, color, desc }) => (
                    <div key={key}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color, display: 'block', marginBottom: '6px' }}>{label}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="range"
                          min={key === 'warn_threshold' ? 50 : key === 'critical_threshold' ? 60 : 70}
                          max={key === 'warn_threshold' ? 95 : key === 'critical_threshold' ? 98 : 100}
                          value={preferences[key]}
                          onChange={(e) => setPreferences(p => ({ ...p, [key]: parseInt(e.target.value) }))}
                          style={{ flex: 1, accentColor: color }}
                        />
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-heading)', minWidth: '36px', textAlign: 'right' }}>
                          {preferences[key]}%
                        </span>
                      </div>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Storage Limit Override */}
              <div style={{
                padding: '18px 20px', borderRadius: '14px',
                background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
              }}>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-info)', margin: '0 0 12px' }}>Storage Limit Override</p>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                  Set a custom storage limit for this organization. Leave empty to use the plan default.
                </p>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    max="9999"
                    value={preferences.custom_max_storage_gb || ''}
                    onChange={(e) => setPreferences(p => ({ ...p, custom_max_storage_gb: e.target.value ? parseFloat(e.target.value) : null }))}
                    placeholder="Leave empty to use plan limit"
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: '10px',
                      border: '2px solid #64748b', fontSize: '13px',
                      background: 'var(--bg-card)', color: 'var(--text-heading)',
                    }}
                  />
                  <select
                    value={preferences.storage_unit || 'GB'}
                    onChange={(e) => setPreferences(p => ({ ...p, storage_unit: e.target.value }))}
                    style={{
                      padding: '10px 14px', borderRadius: '10px',
                      border: '2px solid #64748b', fontSize: '13px',
                      background: 'var(--bg-card)', color: 'var(--text-heading)',
                      minWidth: '80px',
                    }}
                  >
                    <option value="KB">KB</option>
                    <option value="MB">MB</option>
                    <option value="GB">GB</option>
                  </select>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 0' }}>
                  Plan default: {summary?.max_storage_gb || 0} {summary?.storage_unit || 'GB'}
                </p>
              </div>

              {/* Driver Selection */}
              <div style={{
                padding: '18px 20px', borderRadius: '14px',
                background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
              }}>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 12px' }}>{t('Storage Driver', { defaultValue: 'Storage Driver' })}</p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {[
                    { value: 'local', label: t('Local Server', { defaultValue: 'Local Server' }), desc: t('Files stored on hosting server', { defaultValue: 'Files stored on hosting server' }) },
                    { value: 's3', label: t('AWS S3', { defaultValue: 'AWS S3' }), desc: t('Object storage (recommended for scale)', { defaultValue: 'Object storage (recommended for scale)' }) },
                  ].map(({ value, label, desc }) => (
                    <button
                      key={value}
                      onClick={() => setPreferences(p => ({ ...p, driver: value }))}
                      style={{
                        flex: 1, padding: '14px 16px', borderRadius: '12px', cursor: 'pointer',
                        border: `2px solid ${preferences.driver === value ? 'var(--color-primary)' : 'var(--border-light)'}`,
                        background: preferences.driver === value ? 'var(--color-primary-bg)' : 'var(--bg-card)',
                        textAlign: 'left', transition: 'all 0.2s',
                      }}
                    >
                      <p style={{ fontSize: '13px', fontWeight: 600, color: preferences.driver === value ? 'var(--color-primary)' : 'var(--text-heading)', margin: 0 }}>{label}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{desc}</p>
                    </button>
                  ))}
                </div>

                {/* S3 Configuration Fields */}
                {preferences.driver === 's3' && (
                  <div style={{ marginTop: '16px', padding: '16px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
                    <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {t('S3 Configuration', { defaultValue: 'S3 Configuration' })}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                          {t('Bucket Prefix', { defaultValue: 'Bucket Prefix' })}
                        </label>
                        <input
                          type="text"
                          value={preferences.s3_prefix || ''}
                          onChange={(e) => setPreferences(p => ({ ...p, s3_prefix: e.target.value }))}
                          placeholder={`org-${summary?.org_id || '{id}'}`}
                          style={{
                            width: '100%', padding: '8px 12px', borderRadius: '8px',
                            border: '1px solid var(--border-light)', fontSize: '13px',
                            background: 'var(--bg-hover)', color: 'var(--text-heading)',
                          }}
                        />
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                          Files stored under: s3://bucket/{preferences.s3_prefix || 'org-{id}'}/
                        </p>
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                          {t('AWS Region', { defaultValue: 'AWS Region' })}
                        </label>
                        <input
                          type="text"
                          value="us-east-1"
                          disabled
                          style={{
                            width: '100%', padding: '8px 12px', borderRadius: '8px',
                            border: '1px solid var(--border-light)', fontSize: '13px',
                            background: 'var(--bg-hover)', color: 'var(--text-muted)',
                          }}
                        />
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                          Set in .env: AWS_DEFAULT_REGION
                        </p>
                      </div>
                    </div>
                    <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                      <p style={{ fontSize: '12px', color: '#1e40af', margin: 0, lineHeight: 1.5 }}>
                        <strong>{t('Note:', { defaultValue: 'Note:' })}</strong> {t("AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_BUCKET) must be configured in the server's .env file. Each organization's files are isolated under its own prefix for security.", { defaultValue: "AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_BUCKET) must be configured in the server's .env file. Each organization's files are isolated under its own prefix for security." })}
                      </p>
                    </div>
                  </div>
                )}

                {preferences.driver === 'local' && (
                  <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <p style={{ fontSize: '12px', color: '#166534', margin: 0 }}>
                      {t("Files are stored on the hosting server's local disk. Storage limit is enforced per organization.", { defaultValue: "Files are stored on the hosting server's local disk. Storage limit is enforced per organization." })}
                    </p>
                  </div>
                )}
              </div>

              {/* Save Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  onClick={() => fetchPreferences()}
                  style={{
                    padding: '10px 20px', borderRadius: '10px', border: '1px solid var(--border-light)',
                    background: 'var(--bg-hover)', color: 'var(--text-secondary)',
                    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {t('Reset', { defaultValue: 'Reset' })}
                </button>
                <button
                  onClick={async () => {
                    setPrefSaving(true);
                    try {
                      const payload = { ...preferences };
                      if (payload.custom_max_storage_gb != null) {
                        payload.custom_storage_unit = payload.storage_unit || 'GB';
                      } else {
                        payload.custom_max_storage_gb = null;
                        payload.custom_storage_unit = null;
                      }
                      const res = await api.put('/organization/storage/preferences', payload);
                      if (res.success) {
                        setToast({ type: 'success', message: t('Storage preferences saved.', { defaultValue: 'Storage preferences saved.' }) });
                      }
                    } catch (err) {
                      setToast({ type: 'error', message: t('Failed to save preferences.', { defaultValue: 'Failed to save preferences.' }) });
                    } finally {
                      setPrefSaving(false);
                    }
                  }}
                  disabled={prefSaving}
                  style={{
                    padding: '10px 24px', borderRadius: '10px', border: 'none',
                    background: 'var(--color-primary)', color: '#fff',
                    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}
                >
                  {prefSaving && <Loader2 style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} />}
                  {prefSaving ? t('Saving...', { defaultValue: 'Saving...' }) : t('Save Preferences', { defaultValue: 'Save Preferences' })}
                </button>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>
              {t('Failed to load preferences.', { defaultValue: 'Failed to load preferences.' })}
            </p>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '20px', padding: '28px',
            boxShadow: 'var(--shadow-lg)', width: '90%', maxWidth: '420px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: 'var(--color-danger-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <AlertTriangle style={{ width: '22px', height: '22px', color: 'var(--color-danger)' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>{t('Confirm Delete', { defaultValue: 'Confirm Delete' })}</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>{t('This action cannot be undone', { defaultValue: 'This action cannot be undone' })}</p>
              </div>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              {t('Are you sure you want to delete {{count}} files ({{size}} MB)?', { count: deleteModal.count, size: deleteModal.size, defaultValue: `Are you sure you want to delete ${deleteModal.count} files (${deleteModal.size} MB)?` })}
              {deleteModal.type === 'old' && ` ${t('These are files {{label}}.', { label: deleteModal.label.toLowerCase(), defaultValue: `These are files ${deleteModal.label.toLowerCase()}.` })}`}
              {deleteModal.type === 'large' && ` ${t('These are {{label}} files.', { label: deleteModal.label, defaultValue: `These are ${deleteModal.label} files.` })}`}
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteModal(null)}
                style={{
                  padding: '10px 20px', borderRadius: '10px', border: '1px solid var(--border-light)',
                  background: 'var(--bg-hover)', color: 'var(--text-secondary)',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t('Cancel', { defaultValue: 'Cancel' })}
              </button>
              <button
                onClick={() => deleteModal.type === 'old' ? handleDeleteOldFiles(deleteModal.months) : handleDeleteLargeFiles(deleteModal.minGb)}
                disabled={deleting}
                style={{
                  padding: '10px 20px', borderRadius: '10px', border: 'none',
                  background: 'var(--color-danger)', color: '#fff',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                {deleting ? <Loader2 style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} /> : <Trash2 style={{ width: '14px', height: '14px' }} />}
                {deleting ? t('Deleting...', { defaultValue: 'Deleting...' }) : t('Delete', { defaultValue: 'Delete' })}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={singleDeleteConfirm.open}
        onClose={() => setSingleDeleteConfirm({ open: false, id: null })}
        onConfirm={() => {
          handleDeleteSingleFile(singleDeleteConfirm.id);
          setSingleDeleteConfirm({ open: false, id: null });
        }}
title={t('Delete File', { defaultValue: 'Delete File' })}
        message={t('Are you sure you want to delete this file? This file will be removed from storage and all linked projects, tasks, deliverables, and submissions. This action cannot be undone.', { defaultValue: 'Are you sure you want to delete this file? This file will be removed from storage and all linked projects, tasks, deliverables, and submissions. This action cannot be undone.' })}
        confirmText={t('Delete', { defaultValue: 'Delete' })}
        danger
      />
    </DashboardLayout>
  );
}
