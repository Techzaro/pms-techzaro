/**
 * AuditLogDetailModal.jsx
 * Modal component that displays full details of a single audit log entry.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { formatDateTime } from "../utils/formatDateTime";
import { normalizeRole } from "../utils/auth";
import "./AuditLogDetailModal.css";

function AuditLogDetailModal({ log, onClose }) {
  const { t } = useTranslation();
  useEscapeKey(true, onClose);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: true } }));
    return () => window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: false } }));
  }, []);

  if (!log) return null;

  const oldValues = log.old_values || log.old;
  const newValues = log.new_values || log.new;
  const statusLabel = t((log.status || "success").charAt(0).toUpperCase() + (log.status || "success").slice(1));

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
              <h2 className="ald-title">{t("Audit Log Details", { defaultValue: "Audit Log Details" })}</h2>
              <p className="ald-subtitle">{t("Detailed information about this activity", { defaultValue: "Detailed information about this activity" })}</p>
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
            <h3 className="ald-section-title">{t("Basic Information", { defaultValue: "Basic Information" })}</h3>
            <div className="ald-grid">
              <div className="ald-field">
                <span className="ald-label">{t("Date & Time", { defaultValue: "Date & Time" })}</span>
                <span className="ald-value">{formatDateTime(log.created_at)}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">{t("Module", { defaultValue: "Module" })}</span>
                <span className="ald-value">{log.module ? t(log.module) : "-"}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">{t("Action", { defaultValue: "Action" })}</span>
                <span className="ald-value">{log.action ? t(log.action) : "-"}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">{t("Status")}</span>
                <span className={`ald-status-badge ald-status-${log.status || "success"}`}>{statusLabel}</span>
              </div>
            </div>
          </div>

          <div className="ald-section">
            <h3 className="ald-section-title">{t("User Information", { defaultValue: "User Information" })}</h3>
            <div className="ald-grid">
              <div className="ald-field">
                <span className="ald-label">{t("Name")}</span>
                <span className="ald-value">{log.user?.name || "-"}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">{t("Email")}</span>
                <span className="ald-value">{log.user?.professional_email || log.user?.email || "-"}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">{t("Role")}</span>
                <span className="ald-value">{log.user?.role ? normalizeRole(log.user.role) : "-"}</span>
              </div>
            </div>
          </div>

          <div className="ald-section">
            <h3 className="ald-section-title">{t("Description")}</h3>
            <p className="ald-description-text">{log.description ? t(log.description) : "-"}</p>
          </div>

          {oldValues && Object.keys(oldValues).length > 0 && (
            <div className="ald-section">
              <h3 className="ald-section-title">{t("Old Values", { defaultValue: "Old Values" })}</h3>
              <pre className="ald-json">{JSON.stringify(oldValues, null, 2)}</pre>
            </div>
          )}

          {newValues && Object.keys(newValues).length > 0 && (
            <div className="ald-section">
              <h3 className="ald-section-title">{t("New Values", { defaultValue: "New Values" })}</h3>
              <pre className="ald-json">{JSON.stringify(newValues, null, 2)}</pre>
            </div>
          )}

          <div className="ald-section">
            <h3 className="ald-section-title">{t("Request Information", { defaultValue: "Request Information" })}</h3>
            <div className="ald-grid">
              <div className="ald-field">
                <span className="ald-label">{t("IP Address", { defaultValue: "IP Address" })}</span>
                <span className="ald-value ald-mono">{log.ip_address || "-"}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">{t("Browser", { defaultValue: "Browser" })}</span>
                <span className="ald-value">{log.browser || "-"}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">{t("OS", { defaultValue: "OS" })}</span>
                <span className="ald-value">{log.os || log.device || "-"}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">{t("Device", { defaultValue: "Device" })}</span>
                <span className="ald-value">{log.device || "-"}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">{t("URL", { defaultValue: "URL" })}</span>
                <span className="ald-value ald-url">{log.url || "-"}</span>
              </div>
              <div className="ald-field">
                <span className="ald-label">{t("Request Method", { defaultValue: "Request Method" })}</span>
                <span className="ald-value">{log.method || log.request_method || "-"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="ald-footer">
          <button className="ald-close-btn ald-close-footer-btn" onClick={onClose}>{t("Close")}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default AuditLogDetailModal;
