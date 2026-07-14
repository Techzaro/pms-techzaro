/**
 * AuditLogDetailModal.jsx
 * Modal component that displays full details of a single audit log entry.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { formatDateTime } from "../utils/formatDateTime";
import { normalizeRole } from "../utils/auth";
import "./AuditLogDetailModal.css";

function AuditLogDetailModal({ log, onClose }) {
  useEscapeKey(true, onClose);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: true } }));
    return () => window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: false } }));
  }, []);

  if (!log) return null;

  const oldValues = log.old_values || log.old;
  const newValues = log.new_values || log.new;
  const statusLabel = (log.status || "success").charAt(0).toUpperCase() + (log.status || "success").slice(1);

  return createPortal(
    <div className="ald-overlay" onClick={onClose}>
      <div className="ald-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="ald-header">
          <div className="ald-header-left">
            <div className="ald-header-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <h2 className="ald-title">Audit Log Details</h2>
              <p className="ald-subtitle">Detailed information about this activity</p>
            </div>
          </div>
          <button className="ald-close-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="ald-body">
          <div className="ald-section">
            <h3 className="ald-section-title">Basic Information</h3>
            <div className="ald-grid">
              <div className="ald-field">
                <span className="ald-label">Date & Time</span>
                <span className="ald-value">{formatDateTime(log.created_at)}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">Module</span>
                <span className="ald-value">{log.module || "-"}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">Action</span>
                <span className="ald-value">{log.action || "-"}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">Status</span>
                <span className={`ald-status-badge ald-status-${log.status || "success"}`}>{statusLabel}</span>
              </div>
            </div>
          </div>

          <div className="ald-section">
            <h3 className="ald-section-title">User Information</h3>
            <div className="ald-grid">
              <div className="ald-field">
                <span className="ald-label">Name</span>
                <span className="ald-value">{log.user?.name || "-"}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">Email</span>
                <span className="ald-value">{log.user?.professional_email || log.user?.email || "-"}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">Role</span>
                <span className="ald-value">{log.user?.role ? normalizeRole(log.user.role) : "-"}</span>
              </div>
            </div>
          </div>

          <div className="ald-section">
            <h3 className="ald-section-title">Description</h3>
            <p className="ald-description-text">{log.description || "-"}</p>
          </div>

          {oldValues && Object.keys(oldValues).length > 0 && (
            <div className="ald-section">
              <h3 className="ald-section-title">Old Values</h3>
              <pre className="ald-json">{JSON.stringify(oldValues, null, 2)}</pre>
            </div>
          )}

          {newValues && Object.keys(newValues).length > 0 && (
            <div className="ald-section">
              <h3 className="ald-section-title">New Values</h3>
              <pre className="ald-json">{JSON.stringify(newValues, null, 2)}</pre>
            </div>
          )}

          <div className="ald-section">
            <h3 className="ald-section-title">Request Information</h3>
            <div className="ald-grid">
              <div className="ald-field">
                <span className="ald-label">IP Address</span>
                <span className="ald-value ald-mono">{log.ip_address || "-"}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">Browser</span>
                <span className="ald-value">{log.browser || "-"}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">OS</span>
                <span className="ald-value">{log.os || log.device || "-"}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">Device</span>
                <span className="ald-value">{log.device || "-"}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">URL</span>
                <span className="ald-value ald-url">{log.url || "-"}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">Request Method</span>
                <span className="ald-value">{log.method || log.request_method || "-"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="ald-footer">
          <button className="ald-close-btn ald-close-footer-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default AuditLogDetailModal;
