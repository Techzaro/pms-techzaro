import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import jsQR from "jsqr";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import LoadingSpinner from "../components/LoadingSpinner";
import ConfirmModal from "../components/ConfirmModal";
import API_URL from "../config/api";
import { authToken, getCurrentRole, getTenantSlug, rolePath, getUser } from "../utils/auth";
import { FiLink, FiShare2, FiDownload, FiUsers, FiActivity, FiSearch, FiPlus, FiCheck, FiX, FiClock, FiAlertTriangle, FiCopy, FiExternalLink, FiSettings, FiTrash2, FiEdit2, FiEye, FiMessageSquare, FiFilter, FiRefreshCw, FiUpload, FiBell } from "react-icons/fi";
import "./Sharing.css";

const TABS = [
  { id: "connections", label: "Connections", icon: FiLink },
  { id: "shared-by-us", label: "Shared By Us", icon: FiShare2 },
  { id: "shared-with-me", label: "Shared With Me", icon: FiDownload },
  { id: "activities", label: "Activity Log", icon: FiActivity },
];

const STATUS_COLORS = {
  active: { bg: "#d1fae5", text: "#065f46" },
  pending: { bg: "#fef3c7", text: "#92400e" },
  rejected: { bg: "#fee2e2", text: "#991b1b" },
  revoked: { bg: "#e5e7eb", text: "#374151" },
  expired: { bg: "#fef3c7", text: "#92400e" },
  suspended: { bg: "#fce7f3", text: "#9d174d" },
};

const PERMISSION_COLORS = {
  view: { bg: "#dbeafe", text: "#1e40af" },
  comment: { bg: "#e0e7ff", text: "#3730a3" },
  collaborate: { bg: "#ede9fe", text: "#5b21b6" },
};

const RESOURCE_TYPE_LABELS = {
  project: "Project",
  task: "Task",
  document: "Document",
  event: "Event",
  knowledge_base: "Knowledge Base",
};

export default function Sharing() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const role = getCurrentRole();
  const slug = getTenantSlug();
  const basePath = slug ? `/org/${slug}` : rolePath();

  const [activeTab, setActiveTab] = useState("connections");
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState([]);
  const [sharedByUs, setSharedByUs] = useState([]);
  const [sharedWithMe, setSharedWithMe] = useState([]);
  const [activities, setActivities] = useState([]);
  const [stats, setStats] = useState({});
  const [connectionStats, setConnectionStats] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [connectionDirection, setConnectionDirection] = useState("outgoing");
  const [loadedTabs, setLoadedTabs] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  // Modal states
  const [showFindOrgModal, setShowFindOrgModal] = useState(false);
  const [showConnectionDetail, setShowConnectionDetail] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Confirm modal states
  const [confirmAction, setConfirmAction] = useState(null); // { type, id }
  const confirmModalOpen = confirmAction !== null;

  // Form states
  const [findIdentifier, setFindIdentifier] = useState("");
  const [foundOrg, setFoundOrg] = useState(null);
  const [findLoading, setFindLoading] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const qrFileInputRef = useRef(null);
  const [qrUploading, setQrUploading] = useState(false);
  const [qrError, setQrError] = useState("");

  // Determine active tab from URL
  useEffect(() => {
    const path = location.pathname;
    if (path.includes("/sharing/shared-by-us")) setActiveTab("shared-by-us");
    else if (path.includes("/sharing/shared-with-me")) setActiveTab("shared-with-me");
    else if (path.includes("/sharing/activities")) setActiveTab("activities");
    else if (path.includes("/sharing/connections")) setActiveTab("connections");
    else setActiveTab("connections");
  }, [location.pathname]);

  // Fetch data
  const fetchConnections = useCallback(async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/sharing/connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setConnections(data.data);
    } catch (err) { console.error(err); }
  }, []);

  const fetchSharedByUs = useCallback(async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/sharing/shared-by-us`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setSharedByUs(data.data.resources || []);
    } catch (err) { console.error(err); }
  }, []);

  const fetchSharedWithMe = useCallback(async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/sharing/shared-with-me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setSharedWithMe(data.data.resources || []);
    } catch (err) { console.error(err); }
  }, []);

  const fetchActivities = useCallback(async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/sharing/activities?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setActivities(data.data.activities || []);
    } catch (err) { console.error(err); }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/sharing/all-stats`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setStats(data.data.sharing);
        setConnectionStats(data.data.connections);
      }
    } catch (err) { console.error(err); }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/sharing/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setNotifications(data.data.notifications || []);
    } catch (err) { console.error(err); }
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/sharing/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setUnreadCount(data.data.count || 0);
    } catch (err) { console.error(err); }
  }, []);

  const markNotificationRead = useCallback(async (notifId) => {
    try {
      const token = authToken();
      await fetch(`${API_URL}/sharing/notifications/${notifId}/read`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read_at: new Date().toISOString() } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) { console.error(err); }
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    try {
      const token = authToken();
      await fetch(`${API_URL}/sharing/notifications/read-all`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
      setUnreadCount(0);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true);
      await Promise.all([fetchConnections(), fetchStats(), fetchUnreadCount()]);
      setLoading(false);
      setLoadedTabs({ connections: true });
    };
    loadInitial();
  }, [fetchConnections, fetchStats, fetchUnreadCount]);

  // Lazy load tab data when tab changes
  const loadTab = useCallback(async (tabId) => {
    if (loadedTabs[tabId]) return;
    if (tabId === "shared-by-us") {
      await fetchSharedByUs();
    } else if (tabId === "shared-with-me") {
      await fetchSharedWithMe();
    } else if (tabId === "activities") {
      await fetchActivities();
    }
    setLoadedTabs(prev => ({ ...prev, [tabId]: true }));
  }, [loadedTabs, fetchSharedByUs, fetchSharedWithMe, fetchActivities]);

  // Find organization
  const handleFindOrg = async () => {
    if (!findIdentifier.trim()) return;
    setFindLoading(true);
    setFoundOrg(null);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/sharing/get-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ identifier: findIdentifier.trim() }),
      });
      const data = await res.json();
      if (data.success) setFoundOrg(data.data);
      else setFoundOrg(null);
    } catch (err) { console.error(err); }
    setFindLoading(false);
  };

  // QR Code upload handler - decodes QR image using jsQR library
  const handleQRUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setQrUploading(true);
    setQrError("");

    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();

      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height, {
          inversionAttempts: "dontInvert",
        });

        if (code) {
          const qrValue = code.data;
          const codeMatch = qrValue.match(/\/connect\/([A-Za-z0-9-]+)/);
          const foundCode = codeMatch ? codeMatch[1] : qrValue;
          setFindIdentifier(foundCode);
          setQrError("");
          // Auto-search
          setFindLoading(true);
          setFoundOrg(null);
          fetch(`${API_URL}/sharing/get-access`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
            body: JSON.stringify({ identifier: foundCode }),
          })
            .then((res) => res.json())
            .then((data) => { if (data.success) setFoundOrg(data.data); })
            .catch(() => {})
            .finally(() => setFindLoading(false));
        } else {
          setQrError(t("No QR code found in image", { defaultValue: "No QR code found in image" }));
        }
        setQrUploading(false);
      };

      img.onerror = () => {
        setQrError(t("Failed to load image", { defaultValue: "Failed to load image" }));
        setQrUploading(false);
      };

      img.src = URL.createObjectURL(file);
    } catch (err) {
      setQrError(t("Failed to scan QR code. Please enter the code manually.", { defaultValue: "Failed to scan QR code. Please enter the code manually." }));
      setQrUploading(false);
    }

    if (qrFileInputRef.current) qrFileInputRef.current.value = "";
  };

  // Request connection
  const handleRequestConnection = async () => {
    if (!foundOrg) return;
    setRequestLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/sharing/get-access/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ organization_id: foundOrg.id, message: requestMessage }),
      });
      const data = await res.json();
      if (data.success) {
        setShowFindOrgModal(false);
        setFindIdentifier("");
        setFoundOrg(null);
        setRequestMessage("");
        fetchConnections();
        fetchStats();
      }
    } catch (err) { console.error(err); }
    setRequestLoading(false);
  };

  // Approve connection
  const handleApprove = async (connectionId) => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/sharing/connections/${connectionId}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        fetchConnections();
        fetchStats();
      }
    } catch (err) { console.error(err); }
  };

  // Reject connection
  const handleReject = async (connectionId) => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/sharing/connections/${connectionId}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        fetchConnections();
        fetchStats();
      }
    } catch (err) { console.error(err); }
  };

  // Revoke connection
  const handleRevoke = async (connectionId) => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/sharing/connections/${connectionId}/revoke`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        fetchConnections();
        fetchStats();
      }
    } catch (err) { console.error(err); }
  };

  const handleSuspend = async (connectionId) => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/sharing/connections/${connectionId}/suspend`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        fetchConnections();
        fetchStats();
      }
    } catch (err) { console.error(err); }
  };

  const handleRestore = async (connectionId) => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/sharing/connections/${connectionId}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        fetchConnections();
        fetchStats();
      }
    } catch (err) { console.error(err); }
  };

  const handleForceDelete = async (connectionId) => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/sharing/connections/${connectionId}/force-delete`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        fetchConnections();
        fetchStats();
      }
    } catch (err) { console.error(err); }
  };

  // Copy to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  // Filter data
  const filteredConnections = connections.filter((conn) => {
    if (conn.direction !== connectionDirection) return false;
    if (filterStatus !== "all" && conn.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return conn.other_organization?.name?.toLowerCase().includes(q) ||
        conn.connection_code?.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredSharedByUs = sharedByUs.filter((r) => {
    if (filterType !== "all" && r.resource_type !== filterType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return r.resource_type?.toLowerCase().includes(q) ||
        r.resource_name?.toLowerCase().includes(q) ||
        r.notes?.toLowerCase().includes(q) ||
        r.shared_with_organization?.name?.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredSharedWithMe = sharedWithMe.filter((r) => {
    if (filterType !== "all" && r.resource_type !== filterType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return r.resource_type?.toLowerCase().includes(q) ||
        r.resource_name?.toLowerCase().includes(q) ||
        r.notes?.toLowerCase().includes(q) ||
        r.shared_by_organization?.name?.toLowerCase().includes(q);
    }
    return true;
  });

  if (loading) return <DashboardLayout><LoadingSpinner /></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="sharing-page">
        <Breadcrumb items={[
          { label: t("Dashboard", { defaultValue: "Dashboard" }), path: `${basePath}/dashboard` },
          { label: t("Sharing", { defaultValue: "Sharing" }) },
        ]} />

        {/* Header */}
        <div className="sharing-header">
          <div className="sharing-header-left">
            <h1>{t("Organization Sharing", { defaultValue: "Organization Sharing" })}</h1>
            <p>{t("Manage connections and share resources with external organizations", { defaultValue: "Manage connections and share resources with external organizations" })}</p>
          </div>
          <div className="sharing-header-actions">
            <div style={{ position: "relative" }}>
              <button
                className="btn btn-outline"
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  if (!showNotifications) fetchNotifications();
                }}
                style={{ position: "relative" }}
              >
                <FiBell />
                {unreadCount > 0 && (
                  <span style={{
                    position: "absolute", top: "-6px", right: "-6px",
                    background: "#ef4444", color: "#fff", borderRadius: "50%",
                    width: "18px", height: "18px", fontSize: "11px", fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "2px solid #fff",
                  }}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div style={{
                  position: "absolute", top: "100%", right: 0, marginTop: "8px",
                  width: "340px", maxHeight: "400px", overflowY: "auto",
                  background: "var(--bg-card)", border: "1px solid var(--border-color)",
                  borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 100,
                }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 700, fontSize: "14px" }}>{t("Notifications", { defaultValue: "Notifications" })}</span>
                    {unreadCount > 0 && (
                      <button onClick={markAllNotificationsRead} style={{ background: "none", border: "none", color: "#2563eb", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                        {t("Mark all read", { defaultValue: "Mark all read" })}
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
                      {t("No notifications", { defaultValue: "No notifications" })}
                    </div>
                  ) : (
                    notifications.slice(0, 20).map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => !notif.read_at && markNotificationRead(notif.id)}
                        style={{
                          padding: "10px 16px", borderBottom: "1px solid var(--border-color)",
                          cursor: notif.read_at ? "default" : "pointer",
                          background: notif.read_at ? "transparent" : "rgba(37,99,235,0.04)",
                        }}
                      >
                        <div style={{ fontSize: "13px", fontWeight: notif.read_at ? 400 : 600, color: "var(--text-primary)" }}>
                          {notif.title || notif.type?.replace(/_/g, " ")}
                        </div>
                        {notif.message && (
                          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                            {notif.message}
                          </div>
                        )}
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                          {notif.created_at ? new Date(notif.created_at).toLocaleString() : ""}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <button className="btn btn-outline" onClick={() => setShowFindOrgModal(true)}>
              <FiSearch /> {t("Get Access", { defaultValue: "Get Access" })}
            </button>
            <button className="btn btn-primary" onClick={() => setShowInviteModal(true)}>
              <FiPlus /> {t("Give Access", { defaultValue: "Give Access" })}
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="sharing-stats">
          <div className="stat-card">
            <FiLink className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{connectionStats.active || 0}</span>
              <span className="stat-label">{t("Active Connections", { defaultValue: "Active Connections" })}</span>
            </div>
          </div>
          <div className="stat-card">
            <FiClock className="stat-icon pending" />
            <div className="stat-content">
              <span className="stat-value">{connectionStats.pending || 0}</span>
              <span className="stat-label">{t("Pending Requests", { defaultValue: "Pending Requests" })}</span>
            </div>
          </div>
          <div className="stat-card">
            <FiShare2 className="stat-icon shared" />
            <div className="stat-content">
              <span className="stat-value">{stats.shared_by_us || 0}</span>
              <span className="stat-label">{t("Shared By Us", { defaultValue: "Shared By Us" })}</span>
            </div>
          </div>
          <div className="stat-card">
            <FiDownload className="stat-icon received" />
            <div className="stat-content">
              <span className="stat-value">{stats.shared_with_us || 0}</span>
              <span className="stat-label">{t("Shared With Me", { defaultValue: "Shared With Me" })}</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="sharing-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`sharing-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => {
                setActiveTab(tab.id);
                loadTab(tab.id);
                navigate(`${basePath}/sharing${tab.id === "connections" ? "" : `/${tab.id}`}`);
              }}
            >
              <tab.icon /> {t(tab.label, { defaultValue: tab.label })}
            </button>
          ))}
        </div>

        {/* Connection Direction Toggle */}
        {activeTab === "connections" && (
          <div className="connection-direction-toggle">
            <button
              className={`direction-btn ${connectionDirection === "outgoing" ? "active" : ""}`}
              onClick={() => setConnectionDirection("outgoing")}
            >
              <FiShare2 /> {t("Give Access", { defaultValue: "Give Access" })}
              <span className="direction-count">
                {connections.filter(c => c.direction === "outgoing").length}
              </span>
            </button>
            <button
              className={`direction-btn ${connectionDirection === "incoming" ? "active" : ""}`}
              onClick={() => setConnectionDirection("incoming")}
            >
              <FiDownload /> {t("Get Access", { defaultValue: "Get Access" })}
              <span className="direction-count">
                {connections.filter(c => c.direction === "incoming").length}
              </span>
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="sharing-filters">
          <div className="filter-search">
            <FiSearch />
            <input
              type="text"
              placeholder={t("Search...", { defaultValue: "Search..." })}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {activeTab === "connections" && (
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">{t("All Status", { defaultValue: "All Status" })}</option>
              <option value="active">{t("Active", { defaultValue: "Active" })}</option>
              <option value="pending">{t("Pending", { defaultValue: "Pending" })}</option>
              <option value="rejected">{t("Rejected", { defaultValue: "Rejected" })}</option>
              <option value="revoked">{t("Revoked", { defaultValue: "Revoked" })}</option>
            </select>
          )}
          {(activeTab === "shared-by-us" || activeTab === "shared-with-me") && (
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">{t("All Types", { defaultValue: "All Types" })}</option>
              <option value="project">{t("Projects", { defaultValue: "Projects" })}</option>
              <option value="task">{t("Tasks", { defaultValue: "Tasks" })}</option>
              <option value="document">{t("Documents", { defaultValue: "Documents" })}</option>
              <option value="event">{t("Events", { defaultValue: "Events" })}</option>
              <option value="knowledge_base">{t("Knowledge Base", { defaultValue: "Knowledge Base" })}</option>
            </select>
          )}
          <button className="btn btn-outline btn-sm" onClick={() => {
            if (loadedTabs.connections) fetchConnections();
            if (loadedTabs["shared-by-us"]) fetchSharedByUs();
            if (loadedTabs["shared-with-me"]) fetchSharedWithMe();
            if (loadedTabs.activities) fetchActivities();
            fetchStats();
          }}>
            <FiRefreshCw />
          </button>
        </div>

        {/* Tab Content */}
        <div className="sharing-content">
          {/* Connections Tab */}
          {activeTab === "connections" && (
            <div className="connections-list">
              {filteredConnections.length === 0 ? (
                <div className="empty-state">
                  <FiLink size={48} />
                  {connectionDirection === "outgoing" ? (
                    <>
                      <h3>{t("No Outgoing Connections", { defaultValue: "No Outgoing Connections" })}</h3>
                      <p>{t("You haven't given access to any organization yet. Use 'Get Access' to find and connect with organizations.", { defaultValue: "You haven't given access to any organization yet. Use 'Get Access' to find and connect with organizations." })}</p>
                    </>
                  ) : (
                    <>
                      <h3>{t("No Incoming Connections", { defaultValue: "No Incoming Connections" })}</h3>
                      <p>{t("No organization has requested access from you yet.", { defaultValue: "No organization has requested access from you yet." })}</p>
                    </>
                  )}
                  {connectionDirection === "outgoing" && (
                    <button className="btn btn-primary" onClick={() => setShowFindOrgModal(true)}>
                      <FiSearch /> {t("Find Organization", { defaultValue: "Find Organization" })}
                    </button>
                  )}
                </div>
              ) : (
                filteredConnections.map((conn) => (
                  <div key={conn.id} className={`connection-card ${conn.status}`}>
                    <div className="connection-org">
                      <div className="org-avatar">
                        {conn.other_organization?.logo_path ? (
                          <img src={conn.other_organization.logo_path} alt="" />
                        ) : (
                          <span>{conn.other_organization?.name?.charAt(0) || "?"}</span>
                        )}
                      </div>
                      <div className="org-info">
                        <h4>{conn.other_organization?.name}</h4>
                        <span className="org-code">{conn.other_organization?.organization_code}</span>
                      </div>
                    </div>
                    <div className="connection-meta">
                      <span className={`status-badge ${conn.status}`} style={{ backgroundColor: STATUS_COLORS[conn.status]?.bg, color: STATUS_COLORS[conn.status]?.text }}>
                        {conn.status}
                      </span>
                      <span className="connection-code">{conn.connection_code}</span>
                      <span className="connection-date">
                        {new Date(conn.requested_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="connection-actions">
                      {conn.status === "pending" && conn.direction === "outgoing" && (
                        <>
                          <button className="btn btn-success btn-sm" onClick={() => handleApprove(conn.id)}>
                            <FiCheck /> {t("Approve", { defaultValue: "Approve" })}
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleReject(conn.id)}>
                            <FiX /> {t("Reject", { defaultValue: "Reject" })}
                          </button>
                        </>
                      )}
                      {conn.status === "active" && conn.direction === "outgoing" && (
                        <>
                          <button className="btn btn-outline btn-sm" onClick={() => setConfirmAction({ type: "suspend", id: conn.id })}>
                            <FiClock /> {t("Suspend", { defaultValue: "Suspend" })}
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => setConfirmAction({ type: "revoke", id: conn.id })}>
                            <FiTrash2 /> {t("Revoke", { defaultValue: "Revoke" })}
                          </button>
                        </>
                      )}
                      {conn.status === "revoked" && conn.direction === "outgoing" && (
                        <>
                          <button className="btn btn-success btn-sm" onClick={() => setConfirmAction({ type: "restore", id: conn.id })}>
                            <FiCheck /> {t("Restore", { defaultValue: "Restore" })}
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => setConfirmAction({ type: "delete", id: conn.id })}>
                            <FiTrash2 /> {t("Delete", { defaultValue: "Delete" })}
                          </button>
                        </>
                      )}
                      <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => setShowConnectionDetail(conn)}>
                        <FiExternalLink />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Shared By Us Tab */}
          {activeTab === "shared-by-us" && (
            <div className="shared-resources-list">
              {!loadedTabs["shared-by-us"] ? (
                <LoadingSpinner />
              ) : filteredSharedByUs.length === 0 ? (
                <div className="empty-state">
                  <FiShare2 size={48} />
                  <h3>{t("No Resources Shared", { defaultValue: "No Resources Shared" })}</h3>
                  <p>{t("Share projects, tasks, and events with connected organizations.", { defaultValue: "Share projects, tasks, and events with connected organizations." })}</p>
                </div>
              ) : (
                filteredSharedByUs.map((resource) => (
                  <div key={resource.id} className="resource-card" style={{ cursor: "pointer" }} onClick={() => {
                    if (resource.resource_type === "project") navigate(`${basePath}/projects/project-details/${resource.resource_id}`);
                    else if (resource.resource_type === "task") navigate(`${basePath}/tasks/task-details/${resource.resource_id}`);
                  }}>
                    <div className="resource-type-icon">
                      {resource.resource_type === "project" && <FiShare2 />}
                      {resource.resource_type === "task" && <FiClock />}
                      {resource.resource_type === "event" && <FiActivity />}
                      {resource.resource_type === "knowledge_base" && <FiLink />}
                    </div>
                    <div className="resource-info">
                      <h4>{resource.resource_name || `${RESOURCE_TYPE_LABELS[resource.resource_type] || resource.resource_type} #${resource.resource_id}`}</h4>
                      <span className="resource-permission" style={{ backgroundColor: PERMISSION_COLORS[resource.permission]?.bg, color: PERMISSION_COLORS[resource.permission]?.text }}>
                        {resource.permission}
                      </span>
                      {resource.can_download && <span className="download-badge"><FiDownload /> Download</span>}
                    </div>
                    <div className="resource-meta">
                      <span className={`status-badge ${resource.status}`} style={{ backgroundColor: STATUS_COLORS[resource.status]?.bg, color: STATUS_COLORS[resource.status]?.text }}>
                        {resource.status}
                      </span>
                      <span className="resource-date">{new Date(resource.shared_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Shared With Me Tab */}
          {activeTab === "shared-with-me" && (
            <div className="shared-resources-list">
              {!loadedTabs["shared-with-me"] ? (
                <LoadingSpinner />
              ) : filteredSharedWithMe.length === 0 ? (
                <div className="empty-state">
                  <FiDownload size={48} />
                  <h3>{t("No Resources Shared With You", { defaultValue: "No Resources Shared With You" })}</h3>
                  <p>{t("Resources shared by external organizations will appear here.", { defaultValue: "Resources shared by external organizations will appear here." })}</p>
                </div>
              ) : (
                filteredSharedWithMe.map((resource) => (
                  <div key={resource.id} className="resource-card" style={{ cursor: "pointer" }} onClick={() => {
                    if (resource.resource_type === "project") navigate(`${basePath}/projects/project-details/${resource.resource_id}`);
                    else if (resource.resource_type === "task") navigate(`${basePath}/tasks/task-details/${resource.resource_id}`);
                  }}>
                    <div className="resource-type-icon">
                      {resource.resource_type === "project" && <FiShare2 />}
                      {resource.resource_type === "task" && <FiClock />}
                      {resource.resource_type === "event" && <FiActivity />}
                      {resource.resource_type === "knowledge_base" && <FiLink />}
                    </div>
                    <div className="resource-info">
                      <h4>{resource.resource_name || `${RESOURCE_TYPE_LABELS[resource.resource_type] || resource.resource_type} #${resource.resource_id}`}</h4>
                      <span className="resource-permission" style={{ backgroundColor: PERMISSION_COLORS[resource.permission]?.bg, color: PERMISSION_COLORS[resource.permission]?.text }}>
                        {resource.permission}
                      </span>
                    </div>
                    <div className="resource-meta">
                      <span className="resource-date">{new Date(resource.shared_at).toLocaleDateString()}</span>
                      {resource.expires_at && (
                        <span className="expiry-badge">
                          <FiAlertTriangle /> Expires: {new Date(resource.expires_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Activities Tab */}
          {activeTab === "activities" && (
            <div className="activities-list">
              {!loadedTabs["activities"] ? (
                <LoadingSpinner />
              ) : activities.length === 0 ? (
                <div className="empty-state">
                  <FiActivity size={48} />
                  <h3>{t("No Activity Yet", { defaultValue: "No Activity Yet" })}</h3>
                  <p>{t("Sharing activities will appear here.", { defaultValue: "Sharing activities will appear here." })}</p>
                </div>
              ) : (
                activities.map((activity) => (
                  <div key={activity.id} className="activity-item">
                    <div className="activity-icon">
                      {activity.action === "shared" && <FiShare2 />}
                      {activity.action === "unshared" && <FiTrash2 />}
                      {activity.action === "permission_changed" && <FiSettings />}
                      {activity.action === "connected" && <FiLink />}
                      {activity.action === "disconnected" && <FiX />}
                      {["access_granted", "access_approved"].includes(activity.action) && <FiCheck />}
                      {["access_revoked", "access_rejected"].includes(activity.action) && <FiX />}
                    </div>
                    <div className="activity-content">
                      <p>
                        <strong>{activity.user?.name || "System"}</strong> {activity.action.replace(/_/g, " ")}
                        {activity.resource_type && <> {RESOURCE_TYPE_LABELS[activity.resource_type] || activity.resource_type} #{activity.resource_id}</>}
                      </p>
                      {activity.old_permission && activity.new_permission && (
                        <span className="permission-change">
                          {activity.old_permission} → {activity.new_permission}
                        </span>
                      )}
                      <span className="activity-time">{new Date(activity.acted_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Find Organization Modal */}
      {showFindOrgModal && (
        <div className="modal-overlay" onClick={() => setShowFindOrgModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t("Find Organization", { defaultValue: "Find Organization" })}</h2>
              <button className="modal-close" onClick={() => setShowFindOrgModal(false)}><FiX /></button>
            </div>
            <div className="modal-body">
              <div className="find-org-search">
                <input
                  type="text"
                  placeholder={t("Enter Organization ID, Code, or Name", { defaultValue: "Enter Organization ID, Code, or Name" })}
                  value={findIdentifier}
                  onChange={(e) => setFindIdentifier(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFindOrg()}
                />
                <button className="btn btn-primary" onClick={handleFindOrg} disabled={findLoading}>
                  {findLoading ? <LoadingSpinner size="sm" /> : <FiSearch />}
                </button>
              </div>

              <div className="qr-upload-divider">
                <span>{t("OR", { defaultValue: "OR" })}</span>
              </div>

              <div className="qr-upload-section">
                <label className="qr-upload-label">
                  <FiUpload /> {t("Scan QR Code", { defaultValue: "Scan QR Code" })}
                </label>
                <p className="qr-upload-hint">{t("Upload a QR code image to auto-fill the organization code", { defaultValue: "Upload a QR code image to auto-fill the organization code" })}</p>
                <input
                  type="file"
                  accept="image/*"
                  className="qr-file-input"
                  onChange={handleQRUpload}
                  ref={qrFileInputRef}
                />
                <button className="btn btn-outline btn-sm" onClick={() => qrFileInputRef.current?.click()}>
                  <FiUpload /> {t("Choose QR Image", { defaultValue: "Choose QR Image" })}
                </button>
                {qrUploading && <span className="qr-status">{t("Scanning...", { defaultValue: "Scanning..." })}</span>}
                {qrError && <span className="qr-error">{qrError}</span>}
              </div>

              {foundOrg && (
                <div className="found-org-card">
                  <div className="org-avatar large">
                    {foundOrg.logo_path ? (
                      <img src={foundOrg.logo_path} alt="" />
                    ) : (
                      <span>{foundOrg.name?.charAt(0)}</span>
                    )}
                  </div>
                  <div className="org-details">
                    <h3>{foundOrg.name}</h3>
                    <p><strong>ID:</strong> {foundOrg.organization_code}</p>
                    {foundOrg.country && <p><strong>Country:</strong> {foundOrg.country}</p>}
                    {foundOrg.description && <p className="org-desc">{foundOrg.description}</p>}
                  </div>
                  <div className="request-form">
                    <textarea
                      placeholder={t("Optional message...", { defaultValue: "Optional message..." })}
                      value={requestMessage}
                      onChange={(e) => setRequestMessage(e.target.value)}
                      rows={3}
                    />
                    <button className="btn btn-primary" onClick={handleRequestConnection} disabled={requestLoading}>
                      {requestLoading ? <LoadingSpinner size="sm" /> : <>{FiLink && <FiLink />} {t("Send Request", { defaultValue: "Send Request" })}</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Give Access / Invite Modal */}
      {showInviteModal && (
        <InviteModal onClose={() => setShowInviteModal(false)} />
      )}

      {/* Request Access Modal */}
      {/* Connection Detail Modal */}
      {showConnectionDetail && (
        <ConnectionDetailModal
          connection={showConnectionDetail}
          onClose={() => setShowConnectionDetail(null)}
        />
      )}

      {/* Confirm Modal for Revoke */}
      <ConfirmModal
        isOpen={confirmAction?.type === "revoke"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => { handleRevoke(confirmAction?.id); setConfirmAction(null); }}
        title="Revoke Connection"
        message="Are you sure you want to revoke this connection? This will also revoke all shared resources."
        confirmText="Revoke"
        danger
      />

      {/* Confirm Modal for Suspend */}
      <ConfirmModal
        isOpen={confirmAction?.type === "suspend"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => { handleSuspend(confirmAction?.id); setConfirmAction(null); }}
        title="Suspend Connection"
        message="Are you sure you want to suspend this connection?"
        confirmText="Suspend"
        danger
      />

      {/* Confirm Modal for Restore */}
      <ConfirmModal
        isOpen={confirmAction?.type === "restore"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => { handleRestore(confirmAction?.id); setConfirmAction(null); }}
        title="Restore Connection"
        message="Restore this connection? Shared resources will become active again."
        confirmText="Restore"
        confirmColor="#10b981"
      />

      {/* Confirm Modal for Force Delete */}
      <ConfirmModal
        isOpen={confirmAction?.type === "delete"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => { handleForceDelete(confirmAction?.id); setConfirmAction(null); }}
        title="Delete Connection"
        message="Permanently delete this connection? This cannot be undone. You can create a new connection later."
        confirmText="Delete"
        danger
      />
    </DashboardLayout>
  );
}

// Invite Modal Component
function InviteModal({ onClose }) {
  const { t } = useTranslation();
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchInvitation = async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/sharing/give-access/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          setError(errData?.message || "Failed to generate invitation. Please try again.");
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (data.success) {
          setInvitation(data.data);
        } else {
          setError(data.message || "Failed to generate invitation.");
        }
      } catch (err) {
        console.error(err);
        setError("Failed to generate invitation. Please try again.");
      }
      setLoading(false);
    };
    fetchInvitation();
  }, []);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const downloadQR = (url, filename) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || 200;
        canvas.height = img.naturalHeight || 200;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        canvas.toBlob((blob) => {
          if (!blob) {
            window.open(url, "_blank");
            return;
          }
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(blobUrl);
        }, "image/png");
      };

      img.onerror = () => {
        window.open(url, "_blank");
      };

      img.src = url;
    } catch (err) {
      console.error("Download failed:", err);
      window.open(url, "_blank");
    }
  };

  if (loading) return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <LoadingSpinner />
      </div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("Give Access", { defaultValue: "Give Access" })}</h2>
          <button className="modal-close" onClick={onClose}><FiX /></button>
        </div>
        <div className="modal-body">
          {error && (
            <div className="invite-error" style={{ padding: "12px", background: "#fee2e2", borderRadius: "8px", color: "#991b1b", marginBottom: "16px" }}>
              <FiAlertTriangle /> {error}
            </div>
          )}
          {invitation && (
            <div className="invite-info">
              <p>{t("Share this code or link with the organization you want to connect with:", { defaultValue: "Share this code or link with the organization you want to connect with:" })}</p>

              <div className="invite-code-section">
                <label>{t("Connection Code", { defaultValue: "Connection Code" })}</label>
                <div className="code-display">
                  <span className="connection-code-large">{invitation.connection_code}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(invitation.connection_code)}>
                    <FiCopy />
                  </button>
                </div>
              </div>

              <div className="invite-link-section">
                <label>{t("Share Link", { defaultValue: "Share Link" })}</label>
                <div className="link-display">
                  <input type="text" value={invitation.share_link} readOnly />
                  <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(invitation.share_link)}>
                    <FiCopy />
                  </button>
                </div>
              </div>

              {invitation.qr_code_url && (
                <div className="invite-qr-section">
                  <label>{t("QR Code", { defaultValue: "QR Code" })}</label>
                  <div className="qr-code-display">
                    <img src={invitation.qr_code_url} alt="QR Code" width="200" height="200" />
                    <p className="qr-hint">{t("Scan this QR code to connect", { defaultValue: "Scan this QR code to connect" })}</p>
                    <div className="qr-actions">
                      <button className="btn btn-outline btn-sm" onClick={() => copyToClipboard(invitation.qr_code_url)}>
                        <FiCopy /> {t("Copy QR Link", { defaultValue: "Copy QR Link" })}
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => downloadQR(invitation.qr_code_url, `QR-${invitation.connection_code}.png`)}>
                        <FiDownload /> {t("Download QR", { defaultValue: "Download QR" })}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Connection Detail Modal
function ConnectionDetailModal({ connection, onClose }) {
  const { t } = useTranslation();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("Connection Details", { defaultValue: "Connection Details" })}</h2>
          <button className="modal-close" onClick={onClose}><FiX /></button>
        </div>
        <div className="modal-body">
          <div className="connection-detail">
            <div className="detail-row">
              <label>{t("Organization", { defaultValue: "Organization" })}</label>
              <span>{connection.other_organization?.name}</span>
            </div>
            <div className="detail-row">
              <label>{t("Connection Code", { defaultValue: "Connection Code" })}</label>
              <span className="connection-code">{connection.connection_code}</span>
            </div>
            <div className="detail-row">
              <label>{t("Status", { defaultValue: "Status" })}</label>
              <span className={`status-badge ${connection.status}`} style={{ backgroundColor: STATUS_COLORS[connection.status]?.bg, color: STATUS_COLORS[connection.status]?.text }}>
                {connection.status}
              </span>
            </div>
            <div className="detail-row">
              <label>{t("Direction", { defaultValue: "Direction" })}</label>
              <span>{connection.direction === "outgoing" ? t("Give Access", { defaultValue: "Give Access" }) : t("Get Access", { defaultValue: "Get Access" })}</span>
            </div>
            <div className="detail-row">
              <label>{t("Requested", { defaultValue: "Requested" })}</label>
              <span>{new Date(connection.requested_at).toLocaleString()}</span>
            </div>
            {connection.approved_at && (
              <div className="detail-row">
                <label>{t("Approved", { defaultValue: "Approved" })}</label>
                <span>{new Date(connection.approved_at).toLocaleString()}</span>
              </div>
            )}
            {connection.request_message && (
              <div className="detail-row">
                <label>{t("Message", { defaultValue: "Message" })}</label>
                <span>{connection.request_message}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
