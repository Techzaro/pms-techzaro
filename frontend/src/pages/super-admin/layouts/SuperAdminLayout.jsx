import { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Building2, CreditCard, Puzzle, Globe, HeartPulse,
  ClipboardList, Settings, ChevronLeft, Menu, Shield, LogOut,
  Bell, Search, Sun, Moon, ChevronDown, User, Activity, CheckCheck, Key,
  HardDrive, FileText, MessageSquare,
} from 'lucide-react';
import { getSuperAdminUser, getSuperAdminToken, logoutSuperAdmin } from '../../../utils/auth';
import { getOrgBaseUrl } from '../../../utils/domain';
import { api } from '../api/superAdminApi';
import {
  showDesktopNotification,
  getNotificationPermission,
} from '../../../utils/browserNotification';
import SuperAdminChatWidget from './SuperAdminChatWidget';

const navItems = [
  { label: 'Dashboard', path: '/super-admin', icon: LayoutDashboard, exact: true },
  { label: 'Organizations', path: '/super-admin/organizations', icon: Building2 },
  { label: 'Plans', path: '/super-admin/plans', icon: CreditCard },
  { label: 'Modules', path: '/super-admin/modules', icon: Puzzle },
  { label: 'Storage', path: '/super-admin/storage', icon: HardDrive },
  { label: 'Billing', path: '/super-admin/billing', icon: FileText },
  { label: 'Support', path: '/super-admin/support', icon: MessageSquare },
  { label: 'Domains', path: '/super-admin/domains', icon: Globe },
  // { label: 'System Health', path: '/super-admin/health', icon: HeartPulse },
  { label: 'Notifications', path: '/super-admin/notifications', icon: Bell },
  { label: 'Activity Logs', path: '/super-admin/activity', icon: ClipboardList },
];

export default function SuperAdminLayout({ isDark, toggleTheme }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [headerSearch, setHeaderSearch] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [cpOldPassword, setCpOldPassword] = useState('');
  const [cpNewPassword, setCpNewPassword] = useState('');
  const [cpConfirmPassword, setCpConfirmPassword] = useState('');
  const [cpLoading, setCpLoading] = useState(false);
  const [cpError, setCpError] = useState('');
  const [cpSuccess, setCpSuccess] = useState('');
  const notifRef = useRef(null);
  const initialPollDoneRef = useRef(false);
  const lastNotifIdRef = useRef(0);
  const navigate = useNavigate();
  const location = useLocation();
  const user = getSuperAdminUser();
  const token = getSuperAdminToken();

  // Auth guard - redirect to login if not authenticated
  useEffect(() => {
    if (!token) {
      navigate('/super-admin/login', { replace: true });
    }
  }, [token, navigate]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isActive = (path, exact) => exact ? location.pathname === path : location.pathname.startsWith(path);

  // ─── Notification system ──────────────────────────────────────
  const fetchUnreadCount = useCallback(() => {
    if (!token) return;
    api.getUnreadCount()
      .then((data) => {
        const newCount = data.unread_count || 0;
        setUnreadCount((prev) => {
          if (newCount > prev && getNotificationPermission() === 'granted' && initialPollDoneRef.current && document.hidden) {
            api.getLatestNotifications(lastNotifIdRef.current)
              .then((d) => {
                (d.notifications || []).forEach((n) => showDesktopNotification(n));
              })
              .catch(() => {});
          }
          initialPollDoneRef.current = true;
          return newCount;
        });
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 15000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  const openNotifications = useCallback(() => {
    setShowNotifications((prev) => {
      if (!prev) {
        api.getNotifications({ per_page: 7 })
          .then((data) => setNotifications(data.data || []))
          .catch(() => setNotifications([]));
      }
      return !prev;
    });
  }, []);

  const markAsRead = useCallback(async (id) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: 1 } : n));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      fetchUnreadCount();
    } catch {}
  }, [fetchUnreadCount]);

  const markAllAsRead = useCallback(async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch {}
  }, []);

  // Close notification panel on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── Change Password ──────────────────────────────────────────
  const handleChangePassword = async () => {
    setCpError('');
    setCpSuccess('');

    if (!cpOldPassword) {
      setCpError('Please enter your current password.');
      return;
    }
    if (!cpNewPassword) {
      setCpError('Please enter a new password.');
      return;
    }
    if (cpNewPassword.length < 8) {
      setCpError('Password must be at least 8 characters.');
      return;
    }
    if (!/[A-Z]/.test(cpNewPassword) || !/[a-z]/.test(cpNewPassword) || !/[0-9]/.test(cpNewPassword) || !/[@$!%*?&#]/.test(cpNewPassword)) {
      setCpError('Password must include uppercase, lowercase, number, and special character.');
      return;
    }
    if (cpNewPassword !== cpConfirmPassword) {
      setCpError('Passwords do not match.');
      return;
    }

    setCpLoading(true);
    try {
      await api.changePassword(cpOldPassword, cpNewPassword);
      setCpSuccess('Password updated successfully!');
      setCpOldPassword('');
      setCpNewPassword('');
      setCpConfirmPassword('');
      setTimeout(() => {
        setShowChangePassword(false);
        setCpSuccess('');
      }, 2000);
    } catch (err) {
      setCpError(err.message || 'Failed to update password.');
    } finally {
      setCpLoading(false);
    }
  };

  // Don't render if not authenticated
  if (!token) return null;

  const SidebarContent = ({ collapsed }) => (
    <div className="flex flex-col h-full">
      <div
        className={`flex items-center ${collapsed ? 'justify-center px-2' : 'px-5'} h-16`}
        style={{ borderBottom: '1px solid var(--border-light)' }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--color-primary)' }}
        >
          <Shield className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="ml-3">
            <span className="text-sm font-bold" style={{ color: 'var(--text-heading)' }}>TechXaro</span>
            <span className="block text-[10px] -mt-0.5" style={{ color: 'var(--text-muted)' }}>Super Admin</span>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {navItems.map((item) => {
          const active = isActive(item.path, item.exact);
          return (
            <button
              key={item.path}
              onClick={() => { navigate(item.path); setMobileOpen(false); }}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${collapsed ? 'justify-center' : ''}`}
              style={{
                background: active ? 'var(--color-primary-bg)' : 'transparent',
                color: active ? 'var(--color-primary)' : 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" style={active ? { color: 'var(--color-primary)' } : {}} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-3" style={{ borderTop: '1px solid var(--border-light)' }}>
        <button
          onClick={() => { window.location.href = `${getOrgBaseUrl()}/login`; }}
          title={collapsed ? 'Login to PMS' : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${collapsed ? 'justify-center' : ''}`}
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <LogOut className="w-5 h-5" />
          {!collapsed && <span>Back to PMS</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-page)' }}>
      {/* Wave Background */}
      <svg
        className="dashboard-wave-bg"
        viewBox="0 0 1440 500"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMin slice"
        style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '500px', zIndex: 0, pointerEvents: 'none' }}
      >
        <path d="M0 0H1440V140C1440 140 1100 60 800 130C500 200 350 320 100 260C-50 220 0 340 0 340V0Z" fill="url(#sa-wave1)" />
        <path d="M0 0H1440V180C1440 180 1000 90 720 170C440 250 280 360 50 290C-100 240 0 380 0 380V0Z" fill="url(#sa-wave2)" />
        <path d="M0 0H1440V220C1440 220 900 120 600 220C300 320 150 400 0 340V0Z" fill="url(#sa-wave3)" />
        <defs>
          <linearGradient id="sa-wave1" x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#a7f3d0" stopOpacity="0.3" />
            <stop offset="35%" stopColor="#c4b5fd" stopOpacity="0.25" />
            <stop offset="70%" stopColor="#ddd6fe" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#ede9fe" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="sa-wave2" x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#bfdbfe" stopOpacity="0.25" />
            <stop offset="40%" stopColor="#c4b5fd" stopOpacity="0.2" />
            <stop offset="80%" stopColor="#e9d5ff" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#f3e8ff" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="sa-wave3" x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#e0e7ff" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#ede9fe" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#f5f3ff" stopOpacity="0.04" />
          </linearGradient>
        </defs>
      </svg>

      {/* Desktop sidebar */}
      <div
        className={`hidden lg:flex flex-col flex-shrink-0 transition-all duration-300 ${sidebarOpen ? 'w-60' : 'w-16'}`}
        style={{
          background: 'var(--bg-card)',
          borderRight: '1px solid var(--border-light)',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <SidebarContent collapsed={!sidebarOpen} />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0" style={{ background: 'var(--color-overlay-bg)' }} onClick={() => setMobileOpen(false)} />
          <div
            className="absolute left-0 top-0 bottom-0 w-64 shadow-xl"
            style={{ background: 'var(--bg-card)' }}
          >
            <SidebarContent collapsed={false} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 relative">
        {/* Top bar */}
        <header
          className="flex items-center h-16 px-4 flex-shrink-0"
          style={{
            background: 'var(--bg-card)',
            borderBottom: '1px solid var(--border-light)',
          }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 rounded-lg mr-2 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <Menu className="w-5 h-5" />
          </button>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:flex p-2 rounded-lg mr-4 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <ChevronLeft className={`w-5 h-5 transition-transform ${!sidebarOpen ? 'rotate-180' : ''}`} />
          </button>

          <div className="flex-1 max-w-lg">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search organizations..."
                value={headerSearch}
                onChange={(e) => setHeaderSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && headerSearch.trim()) {
                    navigate(`/super-admin/organizations?search=${encodeURIComponent(headerSearch.trim())}`);
                  }
                }}
                className="w-full pl-9 pr-4 py-2 text-sm border-0 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)]"
                style={{
                  background: 'var(--bg-hover)',
                  color: 'var(--text-dark)',
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {isDark ? <Sun className="w-5 h-5" style={{ color: 'var(--color-warning)' }} /> : <Moon className="w-5 h-5" />}
            </button>
            {/* Notification bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={openNotifications}
                className="relative p-2 rounded-lg transition-colors"
                style={{ color: unreadCount > 0 ? '#ef4444' : 'var(--text-secondary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full px-1">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div
                  ref={(el) => {
                    if (el) {
                      const rect = el.parentElement.getBoundingClientRect();
                      el.style.top = rect.bottom + 8 + 'px';
                      el.style.right = (window.innerWidth - rect.right) + 'px';
                    }
                  }}
                  className="fixed rounded-xl shadow-xl z-50 overflow-hidden"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', width: 'min(420px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 80px)' }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <h4 className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>Notifications</h4>
                    <div className="flex items-center gap-1">
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllAsRead}
                          className="text-xs font-medium px-2 py-1 rounded-md transition-colors"
                          style={{ color: 'var(--color-primary)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary-bg)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <CheckCheck className="w-3.5 h-3.5 inline mr-1" />
                          Mark all read
                        </button>
                      )}
                      <button
                        onClick={() => { setShowNotifications(false); navigate('/super-admin/notifications'); }}
                        className="text-xs font-medium px-2 py-1 rounded-md transition-colors"
                        style={{ color: 'var(--color-primary)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary-bg)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        View All
                      </button>
                    </div>
                  </div>

                  {/* Notification list */}
                  <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 130px)' }}>
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                        No notifications
                      </div>
                    ) : (
                      notifications.slice(0, 7).map((n) => (
                        <div
                          key={n.id}
                          className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors"
                          style={{
                            borderBottom: '1px solid var(--border-light)',
                            background: n.is_read ? 'transparent' : 'var(--color-primary-bg)',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = n.is_read ? 'transparent' : 'var(--color-primary-bg)'; }}
                          onClick={() => {
                            markAsRead(n.id);
                            if (n.link) {
                              setShowNotifications(false);
                              const path = n.link.startsWith('/super-admin') ? n.link : `/super-admin/${n.link.replace(/^\//, "")}`;
                              navigate(path);
                            }
                          }}
                        >
                          <div className="mt-1 flex-shrink-0">
                            {!n.is_read ? (
                              <span className="block w-2 h-2 rounded-full bg-blue-500" />
                            ) : (
                              <span className="block w-2 h-2 rounded-full" style={{ background: 'var(--border-light)' }} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-heading)' }}>
                              {n.title || n.type}
                            </p>
                            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                              {n.message}
                            </p>
                            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                              {new Date(n.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="relative ml-2">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full transition-colors"
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--color-primary)' }}
                >
                  <span className="text-sm font-semibold text-white">
                    {(user?.name || 'S').charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="hidden sm:block text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>{user?.name || 'Super Admin'}</span>
                {user?.email && <span className="hidden lg:block text-xs truncate max-w-[120px]" style={{ color: 'var(--text-muted)' }}>{user.email}</span>}
                <ChevronDown className={`w-4 h-4 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} />
              </button>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div
                    className="absolute right-0 mt-2 w-56 rounded-xl shadow-xl z-50 overflow-hidden"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}
                  >
                    <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: 'var(--color-primary)' }}
                        >
                          <span className="text-sm font-semibold text-white">
                            {(user?.name || 'S').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-heading)' }}>{user?.name || 'Super Admin'}</p>
                          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
                        </div>
                      </div>
                    </div>
                    <div className="py-1">
                      <button
                        onClick={() => { navigate('/super-admin/my-profile'); setUserMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                        style={{ color: 'var(--text-dark)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <User className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                        My Profile
                      </button>
                      <button
                        onClick={() => { navigate('/super-admin/activity'); setUserMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                        style={{ color: 'var(--text-dark)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <Activity className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                        My Activity
                      </button>
                      <button
                        onClick={() => { setShowChangePassword(true); setUserMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                        style={{ color: 'var(--text-dark)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <Key className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                        Change Password
                      </button>
                    </div>
                    <div className="py-1" style={{ borderTop: '1px solid var(--border-light)' }}>
                      <button
                        onClick={logoutSuperAdmin}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                        style={{ color: 'var(--color-danger)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-danger-bg)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="px-5 py-4">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Change Password Modal */}
      {showChangePassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4" style={{ background: 'var(--bg-card)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border-light)' }}>
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>Change Password</h3>
              <button
                onClick={() => { setShowChangePassword(false); setCpError(''); setCpSuccess(''); }}
                className="p-1 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {cpError && (
                <div className="p-3 rounded-lg text-sm" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
                  {cpError}
                </div>
              )}
              {cpSuccess && (
                <div className="p-3 rounded-lg text-sm" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
                  {cpSuccess}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-heading)' }}>Current Password</label>
                <input
                  type="password"
                  value={cpOldPassword}
                  onChange={(e) => setCpOldPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: 'var(--border-light)', background: 'var(--bg-hover)', color: 'var(--text-dark)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-heading)' }}>New Password</label>
                <input
                  type="password"
                  value={cpNewPassword}
                  onChange={(e) => setCpNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: 'var(--border-light)', background: 'var(--bg-hover)', color: 'var(--text-dark)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-heading)' }}>Confirm New Password</label>
                <input
                  type="password"
                  value={cpConfirmPassword}
                  onChange={(e) => setCpConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: 'var(--border-light)', background: 'var(--bg-hover)', color: 'var(--text-dark)' }}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border-light)' }}>
              <button
                onClick={() => { setShowChangePassword(false); setCpError(''); setCpSuccess(''); }}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: 'var(--text-secondary)', background: 'var(--bg-hover)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleChangePassword}
                disabled={cpLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ background: cpLoading ? '#94a3b8' : 'var(--color-primary)' }}
              >
                {cpLoading ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Chat Widget */}
      <SuperAdminChatWidget />
    </div>
  );
}
