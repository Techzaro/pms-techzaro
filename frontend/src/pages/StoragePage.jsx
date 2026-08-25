import { useState, useEffect, useCallback } from 'react';
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
  avatars: { label: 'Avatars', icon: Image, color: '#8b5cf6' },
  reports: { label: 'Reports', icon: FileText, color: 'var(--color-warning)' },
  other: { label: 'Other', icon: Archive, color: 'var(--text-muted)' },
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

      // Also fetch notifications on initial load
      try {
        const notifRes = await api.get('/organization/storage/notifications');
        if (notifRes.success) {
          setNotifications(notifRes.notifications || []);
          setPinnedNotifications(notifRes.pinned || []);
        }
      } catch (_) { /* ignore */ }
    } catch (err) {
      setError('Failed to load storage data.');
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
      setToast({ type: 'error', message: 'Failed to delete files.' });
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
      setToast({ type: 'error', message: 'Failed to delete files.' });
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteSingleFile(id) {
    try {
      const res = await api.delete(`/organization/storage/${id}`);
      if (res.success) {
        setToast({ type: 'success', message: 'File record deleted.' });
        fetchAllData();
      }
    } catch (err) {
      setToast({ type: 'error', message: 'Failed to delete file.' });
    }
  }

  function toggleCategory(cat) {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  }

  if (loading) {
    return (
      <DashboardLayout hideRightSidebar>
        <Breadcrumb items={[{ label: 'Storage' }]} />
        <div style={{ background: 'var(--bg-card)', borderRadius: '20px', padding: '40px', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <Loader2 style={{ width: '24px', height: '24px', animation: 'spin 1s linear infinite', color: 'var(--color-primary)' }} />
          <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Loading storage data...</span>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout hideRightSidebar>
        <Breadcrumb items={[{ label: 'Storage' }]} />
        <div style={{ background: 'var(--bg-card)', borderRadius: '20px', padding: '40px', boxShadow: 'var(--shadow-sm)', textAlign: 'center' }}>
          <AlertTriangle style={{ width: '40px', height: '40px', color: 'var(--color-danger)', margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--color-danger)', fontSize: '14px' }}>{error}</p>
        </div>
      </DashboardLayout>
    );
  }

  const usagePercent = summary?.usage_percent || storage?.usage_percent || 0;
  const isWarning = usagePercent > 80;
  const isCritical = usagePercent > 95;
  const isNearLimit = usagePercent > 70;

  return (
    <DashboardLayout hideRightSidebar>
      <Breadcrumb items={[{ label: 'Storage' }]} />

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
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>Storage Management</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '4px 0 0' }}>
            {summary?.org_name} &middot; {summary?.plan_name} Plan
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { key: 'overview', label: 'Overview', icon: BarChart3 },
            { key: 'files', label: 'Files', icon: FileText },
            { key: 'cleanup', label: 'Cleanup', icon: Trash2 },
            { key: 'notifications', label: 'Notifications', icon: Bell, badge: notifications.filter(n => !n.is_read).length },
            { key: 'preferences', label: 'Preferences', icon: Settings },
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
            <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-danger)', margin: 0 }}>Storage Almost Full</p>
            <p style={{ fontSize: '12px', color: 'var(--color-danger)', margin: '2px 0 0', opacity: 0.8 }}>
              You've used {usagePercent}% of your storage. Consider deleting old or large files.
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
            <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-warning)', margin: 0 }}>Storage Warning</p>
            <p style={{ fontSize: '12px', color: 'var(--color-warning)', margin: '2px 0 0', opacity: 0.8 }}>
              You've used {usagePercent}% of your storage. Consider cleaning up unused files.
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
                  <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>Storage Usage</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '2px 0 0' }}>
                    {summary?.total_files || 0} files uploaded
                  </p>
                </div>
              </div>
              <div style={{
                padding: '8px 16px', borderRadius: '20px',
                background: isCritical ? 'var(--color-danger-bg)' : isWarning ? 'var(--color-warning-bg)' : 'var(--color-success-bg)',
                fontSize: '13px', fontWeight: 700,
                color: isCritical ? 'var(--color-danger)' : isWarning ? 'var(--color-warning)' : 'var(--color-success)',
              }}>
                {usagePercent}% Used
              </div>
            </div>

            {/* Circular-style progress bar */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)' }}>
                  {summary?.total_gb || storage?.total_gb || 0} GB
                </span>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  of {summary?.max_storage_gb || storage?.max_storage_gb || 0} GB
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
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{usagePercent}% used</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{summary?.remaining_gb || storage?.remaining_gb || 0} GB remaining</span>
              </div>
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
              {[
                { label: 'Total Files', value: summary?.total_files || 0, color: 'var(--color-primary)', icon: FileText },
                { label: 'Used Space', value: `${summary?.total_gb || 0} GB`, color: 'var(--color-blue)', icon: HardDrive },
                { label: 'Storage Limit', value: `${summary?.max_storage_gb || 0} GB`, color: 'var(--color-success)', icon: Shield },
                { label: 'Remaining', value: `${summary?.remaining_gb || 0} GB`, color: isCritical ? 'var(--color-danger)' : 'var(--color-warning)', icon: ArrowDown },
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
                Usage by Category
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
                          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dark)', margin: 0 }}>{config.label}</p>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{cat.file_count} files</p>
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
                File Age Distribution
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                {[
                  { label: 'Older than 3 months', count: summary.old_files['3_months']?.count || 0, size: summary.old_files['3_months']?.size_mb || 0, color: '#f59e0b' },
                  { label: 'Older than 6 months', count: summary.old_files['6_months']?.count || 0, size: summary.old_files['6_months']?.size_mb || 0, color: '#f97316' },
                  { label: 'Older than 1 year', count: summary.old_files['12_months']?.count || 0, size: summary.old_files['12_months']?.size_mb || 0, color: '#ef4444' },
                ].map((item) => (
                  <div key={item.label} style={{
                    padding: '16px', borderRadius: '14px',
                    background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
                    borderLeft: `3px solid ${item.color}`,
                  }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</p>
                    <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-heading)', margin: '6px 0 0' }}>{item.count} files</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>{item.size} MB total</p>
                  </div>
                ))}
              </div>
              {summary?.large_files && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '12px' }}>
                  {[
                    { label: 'Files > 1 GB', count: summary.large_files['over_1gb']?.count || 0, size: summary.large_files['over_1gb']?.size_mb || 0, color: '#ef4444' },
                    { label: 'Files > 2 GB', count: summary.large_files['over_2gb']?.count || 0, size: summary.large_files['over_2gb']?.size_mb || 0, color: '#dc2626' },
                  ].map((item) => (
                    <div key={item.label} style={{
                      padding: '16px', borderRadius: '14px',
                      background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
                      borderLeft: `3px solid ${item.color}`,
                    }}>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</p>
                      <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-heading)', margin: '6px 0 0' }}>{item.count} files</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>{item.size} MB total</p>
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
                Large Files ({largeFiles.length})
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
                Files larger than 500 MB that may be consuming significant storage.
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
                          {file.category} {file.uploaded_by ? `· ${file.uploaded_by}` : ''} · {formatDate(file.created_at)}
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
                        Delete
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
                Recent Files
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
                          {file.category} {file.uploaded_by ? `· ${file.uploaded_by}` : ''}
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
                        title="Delete"
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
              Delete Old Files
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
              Remove files older than a specific time period to free up storage space.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              {[
                { months: 3, label: '3+ Months Old', desc: 'Delete files older than 3 months', count: summary?.old_files?.['3_months']?.count || 0, size: summary?.old_files?.['3_months']?.size_mb || 0, color: '#f59e0b' },
                { months: 6, label: '6+ Months Old', desc: 'Delete files older than 6 months', count: summary?.old_files?.['6_months']?.count || 0, size: summary?.old_files?.['6_months']?.size_mb || 0, color: '#f97316' },
                { months: 12, label: '1+ Year Old', desc: 'Delete files older than 1 year', count: summary?.old_files?.['12_months']?.count || 0, size: summary?.old_files?.['12_months']?.size_mb || 0, color: '#ef4444' },
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
                      Delete
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
              Delete Large Files
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
              Remove files that exceed a specific size threshold to quickly reclaim storage.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              {[
                { minGb: 1, label: '> 1 GB Files', count: summary?.large_files?.['over_1gb']?.count || 0, size: summary?.large_files?.['over_1gb']?.size_mb || 0, color: '#ef4444' },
                { minGb: 2, label: '> 2 GB Files', count: summary?.large_files?.['over_2gb']?.count || 0, size: summary?.large_files?.['over_2gb']?.size_mb || 0, color: '#dc2626' },
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
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>Files larger than {item.minGb} GB</p>
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
                      Delete
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
              Storage Report
            </h3>
            <div style={{
              padding: '16px', borderRadius: '12px',
              background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Organization</p>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dark)', margin: '4px 0 0' }}>{summary?.org_name}</p>
                </div>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Plan</p>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dark)', margin: '4px 0 0' }}>{summary?.plan_name}</p>
                </div>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Storage Used</p>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dark)', margin: '4px 0 0' }}>{summary?.total_gb} GB / {summary?.max_storage_gb} GB</p>
                </div>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Files</p>
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
              Storage Notifications
            </h3>
            {notifications.length > 0 && (
              <button
                onClick={async () => {
                  await api.post('/organization/storage/notifications/dismiss-all');
                  setNotifications([]);
                  setPinnedNotifications([]);
                  setToast({ type: 'success', message: 'All notifications dismissed.' });
                }}
                style={{
                  padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border-light)',
                  background: 'var(--bg-hover)', color: 'var(--text-secondary)',
                  fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Dismiss All
              </button>
            )}
          </div>

          {pinnedNotifications.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Active Alerts</p>
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
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>No storage notifications</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>You'll see alerts here when storage thresholds are reached</p>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>History</p>
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
            Storage Preferences
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
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>Auto-Delete Old Files</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                      Automatically delete oldest files when storage is full
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
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>Overwrite When Full</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                      Allow overwriting oldest files when storage limit is reached
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
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 16px' }}>Notification Thresholds</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  {[
                    { key: 'warn_threshold', label: 'Warning', color: 'var(--color-warning)', desc: 'First alert' },
                    { key: 'critical_threshold', label: 'Critical', color: 'var(--color-danger)', desc: 'Urgent alert' },
                    { key: 'pin_threshold', label: 'Pinned', color: '#dc2626', desc: 'Header banner' },
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

              {/* Driver Selection */}
              <div style={{
                padding: '18px 20px', borderRadius: '14px',
                background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
              }}>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 12px' }}>Storage Driver</p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {[
                    { value: 'local', label: 'Local Server', desc: 'Files stored on hosting server' },
                    { value: 's3', label: 'AWS S3', desc: 'Object storage (recommended for scale)' },
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
                      S3 Configuration
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                          Bucket Prefix
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
                          AWS Region
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
                        <strong>Note:</strong> AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_BUCKET) must be configured in the server's <code>.env</code> file. 
                        Each organization's files are isolated under its own prefix for security.
                      </p>
                    </div>
                  </div>
                )}

                {preferences.driver === 'local' && (
                  <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <p style={{ fontSize: '12px', color: '#166534', margin: 0 }}>
                      Files are stored on the hosting server's local disk. Storage limit is enforced per organization.
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
                  Reset
                </button>
                <button
                  onClick={async () => {
                    setPrefSaving(true);
                    try {
                      const res = await api.put('/organization/storage/preferences', preferences);
                      if (res.success) {
                        setToast({ type: 'success', message: 'Storage preferences saved.' });
                      }
                    } catch (err) {
                      setToast({ type: 'error', message: 'Failed to save preferences.' });
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
                  {prefSaving ? 'Saving...' : 'Save Preferences'}
                </button>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>
              Failed to load preferences.
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
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>Confirm Delete</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>This action cannot be undone</p>
              </div>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Are you sure you want to delete <strong style={{ color: 'var(--text-heading)' }}>{deleteModal.count} files</strong> ({deleteModal.size} MB)?
              {deleteModal.type === 'old' && ` These are files ${deleteModal.label.toLowerCase()}.`}
              {deleteModal.type === 'large' && ` These are ${deleteModal.label} files.`}
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
                Cancel
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
                {deleting ? 'Deleting...' : 'Delete'}
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
        title="Delete File"
        message="Are you sure you want to delete this file? This action cannot be undone."
        confirmText="Delete"
        danger
      />
    </DashboardLayout>
  );
}
