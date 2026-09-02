import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import LoadingSpinner from "./LoadingSpinner";
import { FiX, FiShare2, FiCheck, FiLink, FiUsers } from "react-icons/fi";
import "./ShareResourceModal.css";

/**
 * ShareResourceModal - Modal for sharing a resource (project, task, event, etc.)
 * with a connected organization.
 *
 * Props:
 * - resourceType: 'project' | 'task' | 'event' | 'knowledge_base'
 * - resourceId: number
 * - resourceName: string (display name of the resource)
 * - onClose: function
 * - onShared: function (called after successful share)
 */
export default function ShareResourceModal({ resourceType, resourceId, resourceName, onClose, onShared }) {
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

  useEffect(() => {
    const fetchConnections = async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/sharing/connections?status=active`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          const active = (data.data || []).filter(c => c.status === "active");
          setConnections(active);
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    fetchConnections();
  }, []);

  const handleShare = async () => {
    if (!selectedConnection) {
      setError(t("Please select an organization", { defaultValue: "Please select an organization" }));
      return;
    }

    setSharing(true);
    setError("");

    try {
      const token = authToken();
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
          expires_at: expiresAt || null,
          notes: notes || null,
          user_ids: userIds.length > 0 ? userIds : null,
        }),
      });

      const data = await res.json();

      if (data.success) {
        onShared?.();
        onClose();
      } else {
        setError(data.message || t("Failed to share resource", { defaultValue: "Failed to share resource" }));
      }
    } catch (err) {
      setError(t("An error occurred", { defaultValue: "An error occurred" }));
    }
    setSharing(false);
  };

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="share-modal-header">
          <h3>
            <FiShare2 /> {t("Share Resource", { defaultValue: "Share Resource" })}
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

          {loading ? (
            <LoadingSpinner />
          ) : connections.length === 0 ? (
            <div className="share-no-connections">
              <FiLink size={32} />
              <p>{t("No active connections. Connect with an organization first.", { defaultValue: "No active connections. Connect with an organization first." })}</p>
            </div>
          ) : (
            <>
              {/* Select Organization */}
              <div className="share-form-group">
                <label>{t("Share With", { defaultValue: "Share With" })}</label>
                <div className="share-org-list">
                  {connections.map((conn) => (
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
              </div>

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

              {/* Expiry */}
              <div className="share-form-group">
                <label>{t("Expiry Date (Optional)", { defaultValue: "Expiry Date (Optional)" })}</label>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="share-input"
                />
              </div>

              {/* Notes */}
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

              {error && <div className="share-error">{error}</div>}
            </>
          )}
        </div>

        <div className="share-modal-footer">
          <button className="share-btn share-btn-cancel" onClick={(e) => { e.stopPropagation(); onClose(); }}>
            {t("Cancel", { defaultValue: "Cancel" })}
          </button>
          <button
            className="share-btn share-btn-primary"
            onClick={(e) => { e.stopPropagation(); handleShare(); }}
            disabled={sharing || loading || connections.length === 0 || !selectedConnection}
          >
            {sharing ? <LoadingSpinner size="sm" /> : <FiShare2 />}
            {t("Share", { defaultValue: "Share" })}
          </button>
        </div>
      </div>
    </div>
  );
}
