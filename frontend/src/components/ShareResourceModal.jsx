import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import LoadingSpinner from "./LoadingSpinner";
import { FiX, FiShare2, FiCheck, FiLink, FiUsers, FiEdit2, FiTrash2, FiClock, FiDownload } from "react-icons/fi";
import "./ShareResourceModal.css";

/**
 * ShareResourceModal - Modal for sharing a resource (project, task, event, etc.)
 * with a connected organization. Supports both creating new shares and editing
 * existing shares.
 *
 * Props:
 * - resourceType: 'project' | 'task' | 'event' | 'knowledge_base'
 * - resourceId: number
 * - resourceName: string (display name of the resource)
 * - onClose: function
 * - onShared: function (called after successful share/update/revoke)
 * - existingShares: array (optional) - list of existing active shares for this resource
 * - editingShareId: number (optional) - if set, we're editing this specific share
 */
export default function ShareResourceModal({
  resourceType,
  resourceId,
  resourceName,
  onClose,
  onShared,
  existingShares = [],
  editingShareId = null,
}) {
  const { t } = useTranslation();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [permission, setPermission] = useState("view");
  const [canDownload, setCanDownload] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [userIds, setUserIds] = useState([]);
  const [error, setError] = useState("");

  // Timezone helpers: datetime-local input is local time, API stores UTC
  const toLocalDatetimeString = (utcStr) => {
    if (!utcStr) return "";
    // Ensure it's treated as UTC — append Z if missing
    let isoStr = utcStr;
    if (!isoStr.endsWith("Z") && !isoStr.includes("+")) {
      isoStr += "Z";
    }
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const toISOString = (localStr) => {
    if (!localStr) return null;
    const d = new Date(localStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  };
  const [shares, setShares] = useState(existingShares);
  const [isEditMode, setIsEditMode] = useState(!!editingShareId);
  const [editingShare, setEditingShare] = useState(null);
  const [revokingId, setRevokingId] = useState(null);
  const [confirmRevoke, setConfirmRevoke] = useState(null);

  useEffect(() => {
    setShares(existingShares);
  }, [existingShares]);

  useEffect(() => {
    if (editingShareId && existingShares.length > 0) {
      const share = existingShares.find((s) => s.id === editingShareId);
      if (share) {
        setEditingShare(share);
        setIsEditMode(true);
        setSelectedConnection(share.connection_id);
        setPermission(share.permission);
        setCanDownload(share.can_download);
        setExpiresAt(share.expires_at ? toLocalDatetimeString(share.expires_at) : "");
        setNotes(share.notes || "");
      }
    }
  }, [editingShareId, existingShares]);

  useEffect(() => {
    const fetchConnections = async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/sharing/connections?status=active`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          const active = (data.data || []).filter((c) => c.status === "active");
          setConnections(active);
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    fetchConnections();
  }, []);

  const resetForm = () => {
    setSelectedConnection(null);
    setPermission("view");
    setCanDownload(false);
    setExpiresAt("");
    setNotes("");
    setUserIds([]);
    setError("");
    setIsEditMode(false);
    setEditingShare(null);
  };

  const handleShare = async () => {
    if (!selectedConnection) {
      setError(t("Please select an organization", { defaultValue: "Please select an organization" }));
      return;
    }

    setSharing(true);
    setError("");

    try {
      const token = authToken();

      if (isEditMode && editingShare) {
        const res = await fetch(`${API_URL}/sharing/resources/${editingShare.id}/permission`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            permission,
            can_download: canDownload,
            expires_at: toISOString(expiresAt),
          }),
        });

        const data = await res.json();

        if (data.success) {
          setShares((prev) =>
            prev.map((s) =>
              s.id === editingShare.id
                ? { ...s, permission, can_download: canDownload, expires_at: toISOString(expiresAt) || s.expires_at }
                : s
            )
          );
          resetForm();
          onShared?.();
        } else {
          setError(data.message || t("Failed to update share", { defaultValue: "Failed to update share" }));
        }
      } else {
        const res = await fetch(`${API_URL}/sharing/share`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            connection_id: selectedConnection,
            resource_type: resourceType,
            resource_id: Number(resourceId),
            resource_name: resourceName,
            permission,
            can_download: canDownload,
            expires_at: toISOString(expiresAt),
            notes: notes || null,
            user_ids: userIds.length > 0 ? userIds : null,
          }),
        });

        const data = await res.json();
        console.log("Share response:", res.status, data);

        if (data.success) {
          onShared?.();
          onClose();
        } else {
          setError(data.message || t("Failed to share resource", { defaultValue: "Failed to share resource" }));
        }
      }
    } catch (err) {
      console.error("Share error:", err);
      if (err instanceof SyntaxError) {
        setError(t("Server error. Please try again.", { defaultValue: "Server error. Please try again." }));
      } else {
        setError(err.message || t("An error occurred", { defaultValue: "An error occurred" }));
      }
    }
    setSharing(false);
  };

  const handleRevoke = async (shareId) => {
    setRevokingId(shareId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/sharing/resources/${shareId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (data.success) {
        setShares((prev) => prev.filter((s) => s.id !== shareId));
        if (editingShareId === shareId) {
          resetForm();
        }
        setConfirmRevoke(null);
        onShared?.();
      } else {
        setError(data.message || t("Failed to revoke access", { defaultValue: "Failed to revoke access" }));
      }
    } catch (err) {
      setError(t("An error occurred", { defaultValue: "An error occurred" }));
    }
    setRevokingId(null);
  };

  const handleEditShare = (share) => {
    setEditingShare(share);
    setIsEditMode(true);
    setSelectedConnection(share.connection_id);
    setPermission(share.permission);
    setCanDownload(share.can_download);
    setExpiresAt(share.expires_at ? toLocalDatetimeString(share.expires_at) : "");
    setNotes(share.notes || "");
    setError("");
  };

  const isExpired = (expiresAt) => {
    if (!expiresAt) return false;
    let isoStr = expiresAt;
    if (!isoStr.endsWith("Z") && !isoStr.includes("+")) {
      isoStr += "Z";
    }
    return new Date(isoStr) <= new Date();
  };

  const isViewOnly = (expiresAt) => {
    return isExpired(expiresAt);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    let isoStr = dateStr;
    if (!isoStr.endsWith("Z") && !isoStr.includes("+")) {
      isoStr += "Z";
    }
    return new Date(isoStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const sharedOrgIds = new Set(
    shares
      .filter((s) => s.status === "active")
      .map((s) => s.shared_with_organization?.id)
      .filter(Boolean)
  );

  const availableConnections = connections.filter(
    (conn) => !sharedOrgIds.has(conn.other_organization?.id)
  );

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="share-modal-header">
          <h3>
            {isEditMode ? <FiEdit2 /> : <FiShare2 />}
            {isEditMode
              ? t("Edit Share", { defaultValue: "Edit Share" })
              : t("Share Resource", { defaultValue: "Share Resource" })}
          </h3>
          <button className="share-modal-close" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="share-modal-body">
          {/* Resource Info */}
          <div className="share-resource-info">
            <span className="share-resource-type">{resourceType}</span>
            <span className="share-resource-name">{resourceName}</span>
          </div>

          {/* Existing Shares Section */}
          {shares.length > 0 && (
            <div className="share-existing-section">
              <div className="share-existing-header">
                <label>
                  <FiUsers size={14} />
                  {t("Currently Shared With ({{count}})", {
                    count: shares.length,
                    defaultValue: `Currently Shared With (${shares.length})`,
                  })}
                </label>
              </div>
              <div className="share-existing-list">
                {shares.map((share) => (
                  <div
                    key={share.id}
                    className={`share-existing-item ${editingShare?.id === share.id ? "editing" : ""} ${isExpired(share.expires_at) ? "expired" : ""}`}
                  >
                    <div className="share-existing-org">
                      <div className="share-existing-avatar">
                        {share.shared_with_organization?.logo_path ? (
                          <img src={share.shared_with_organization.logo_path} alt="" />
                        ) : (
                          <span>{share.shared_with_organization?.name?.charAt(0) || "?"}</span>
                        )}
                      </div>
                      <div className="share-existing-details">
                        <span className="share-existing-name">
                          {share.shared_with_organization?.name || t("Unknown Org", { defaultValue: "Unknown Org" })}
                        </span>
                        <span className="share-existing-code">
                          {share.shared_with_organization?.organization_code}
                        </span>
                      </div>
                    </div>
                    <div className="share-existing-meta">
                      <span className={`share-existing-badge share-badge--${share.permission}`}>
                        {share.permission}
                      </span>
                      {share.can_download && (
                        <span className="share-existing-tag" title={t("Download allowed", { defaultValue: "Download allowed" })}>
                          <FiDownload size={11} />
                        </span>
                      )}
                      {share.expires_at && (
                        <span
                          className={`share-existing-tag ${isViewOnly(share.expires_at) ? "share-existing-tag--expired" : ""}`}
                          title={`${t("View-Only After", { defaultValue: "View-Only After" })}: ${formatDate(share.expires_at)}`}
                        >
                          <FiClock size={11} />
                          {isViewOnly(share.expires_at)
                            ? t("View-Only", { defaultValue: "View-Only" })
                            : formatDate(share.expires_at)}
                        </span>
                      )}
                    </div>
                    <div className="share-existing-actions">
                      <button
                        className="share-existing-btn share-edit-btn"
                        onClick={() => handleEditShare(share)}
                        title={t("Edit this share", { defaultValue: "Edit this share" })}
                        disabled={revokingId === share.id}
                      >
                        <FiEdit2 size={13} />
                      </button>
                        <button
                          className="share-existing-btn share-revoke-btn"
                          onClick={() => setConfirmRevoke(share.id)}
                          title={t("Revoke access", { defaultValue: "Revoke access" })}
                          disabled={revokingId === share.id}
                        >
                          <FiTrash2 size={13} />
                        </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <LoadingSpinner />
          ) : connections.length === 0 ? (
            <div className="share-no-connections">
              <FiLink size={32} />
              <p>{t("No active connections. Connect with an organization first.", {
                defaultValue: "No active connections. Connect with an organization first.",
              })}</p>
            </div>
          ) : (
            <>
              {/* Form Section - Share or Edit */}
              <div className="share-form-divider">
                <span>
                  {isEditMode
                    ? t("Edit Share Settings", { defaultValue: "Edit Share Settings" })
                    : t("Share With", { defaultValue: "Share With" })}
                </span>
              </div>

              {/* Select Organization (only when creating new share) */}
              {!isEditMode && (
                <div className="share-form-group">
                  <label>{t("Share With", { defaultValue: "Share With" })}</label>
                  {availableConnections.length === 0 ? (
                    <div className="share-no-connections" style={{ padding: "16px" }}>
                      <p style={{ fontSize: "13px" }}>{t("All connected organizations already have access to this resource.", {
                        defaultValue: "All connected organizations already have access to this resource.",
                      })}</p>
                    </div>
                  ) : (
                    <div className="share-org-list">
                      {availableConnections.map((conn) => (
                        <div
                          key={conn.id}
                          className={`share-org-option ${selectedConnection === conn.id ? "selected" : ""}`}
                          onClick={() => setSelectedConnection(conn.id)}
                        >
                          <div className="share-org-avatar">
                            {conn.other_organization?.logo_path ? (
                              <img src={conn.other_organization.logo_path} alt="" />
                            ) : (
                              <span>{conn.other_organization?.name?.charAt(0) || "?"}</span>
                            )}
                          </div>
                          <div className="share-org-details">
                            <span className="share-org-name">{conn.other_organization?.name}</span>
                            <span className="share-org-code">{conn.other_organization?.organization_code}</span>
                          </div>
                          {selectedConnection === conn.id && <FiCheck className="share-check" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* When editing, show which org this share is for */}
              {isEditMode && editingShare && (
                <div className="share-form-group">
                  <label>{t("Shared With", { defaultValue: "Shared With" })}</label>
                  <div className="share-edit-org-display">
                    <div className="share-org-avatar">
                      {editingShare.shared_with_organization?.logo_path ? (
                        <img src={editingShare.shared_with_organization.logo_path} alt="" />
                      ) : (
                        <span>{editingShare.shared_with_organization?.name?.charAt(0) || "?"}</span>
                      )}
                    </div>
                    <div className="share-org-details">
                      <span className="share-org-name">
                        {editingShare.shared_with_organization?.name}
                      </span>
                      <span className="share-org-code">
                        {editingShare.shared_with_organization?.organization_code}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Permission */}
              <div className="share-form-group">
                <label>{t("Permission", { defaultValue: "Permission" })}</label>
                <div className="share-permission-options">
                  {[
                    { value: "view", label: "View", desc: "Can view the shared resource" },
                    { value: "comment", label: "Comment", desc: "Can view and add comments" },
                    { value: "collaborate", label: "Collaborate", desc: "Can view, comment, and collaborate" },
                  ].map((p) => (
                    <div
                      key={p.value}
                      className={`share-permission-option ${permission === p.value ? "selected" : ""}`}
                      onClick={() => setPermission(p.value)}
                    >
                      <span className="share-permission-label">{t(p.label, { defaultValue: p.label })}</span>
                      <span className="share-permission-desc">{t(p.desc, { defaultValue: p.desc })}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Download Permission */}
              <div className="share-form-group">
                <label className="share-checkbox-label">
                  <input
                    type="checkbox"
                    checked={canDownload}
                    onChange={(e) => setCanDownload(e.target.checked)}
                  />
                  {t("Allow Download", { defaultValue: "Allow Download" })}
                </label>
              </div>

              {/* View-Only After */}
              <div className="share-form-group">
                <label>{t("View-Only After (Optional)", { defaultValue: "View-Only After (Optional)" })}</label>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="share-input"
                />
                <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  {t("After this date, the share will become view-only (no task creation, editing, or member management).", { defaultValue: "After this date, the share will become view-only (no task creation, editing, or member management)." })}
                </p>
              </div>

              {/* Notes - hidden for now, will be included later */}
              {false && !isEditMode && (
                <div className="share-form-group">
                  <label>{t("Notes (Optional)", { defaultValue: "Notes (Optional)" })}</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t("Add a note...", { defaultValue: "Add a note..." })}
                    rows={2}
                    className="share-textarea"
                  />
                </div>
              )}

              {error && <div className="share-error">{error}</div>}
            </>
          )}
        </div>

        <div className="share-modal-footer">
          <button
            className="share-btn share-btn-cancel"
            onClick={(e) => {
              e.stopPropagation();
              if (isEditMode) {
                resetForm();
                if (shares.length === 0) onClose();
              } else {
                onClose();
              }
            }}
          >
            {isEditMode && shares.length > 0
              ? t("Cancel", { defaultValue: "Cancel" })
              : t("Cancel", { defaultValue: "Cancel" })}
          </button>
          {!isEditMode && (
            <button
              className="share-btn share-btn-primary"
              onClick={(e) => {
                e.stopPropagation();
                handleShare();
              }}
              disabled={sharing || loading || !selectedConnection}
            >
              {sharing ? <LoadingSpinner size="sm" /> : <FiShare2 />}
              {t("Share", { defaultValue: "Share" })}
            </button>
          )}
          {isEditMode && (
            <button
              className="share-btn share-btn-primary"
              onClick={(e) => {
                e.stopPropagation();
                handleShare();
              }}
              disabled={sharing || loading}
            >
              {sharing ? <LoadingSpinner size="sm" /> : <FiEdit2 />}
              {t("Update", { defaultValue: "Update" })}
            </button>
          )}
        </div>
      </div>

      {/* Revoke Confirmation Modal */}
      {confirmRevoke && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }} onClick={() => setConfirmRevoke(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', maxWidth: 380, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111827' }}>
              {t("Revoke Share?", { defaultValue: "Revoke Share?" })}
            </h3>
            <p style={{ margin: '10px 0 0', fontSize: 14, color: '#6b7280', lineHeight: 1.5 }}>
              {t("The receiving organization will lose all access to this shared resource. You can re-share it later if needed.", { defaultValue: "The receiving organization will lose all access to this shared resource. You can re-share it later if needed." })}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setConfirmRevoke(null)}
                style={{ padding: '8px 16px', borderRadius: 6, background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: 500, fontSize: 14 }}
              >
                {t("Cancel", { defaultValue: "Cancel" })}
              </button>
              <button
                onClick={() => handleRevoke(confirmRevoke)}
                disabled={revokingId === confirmRevoke}
                style={{ padding: '8px 16px', borderRadius: 6, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, opacity: revokingId === confirmRevoke ? 0.6 : 1 }}
              >
                {revokingId === confirmRevoke ? t("Revoking...", { defaultValue: "Revoking..." }) : t("Revoke Access", { defaultValue: "Revoke Access" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
