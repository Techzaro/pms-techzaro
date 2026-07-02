/**
 * CompanyDocuments.jsx
 * Modal component for managing company documents (logo, QR code, employment contract,
 * offer letter, techxaro regulations) that are attached to user onboarding emails.
 *
 * Admin/Manager only. Allows uploading, viewing, and replacing each document type.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Upload, FileText, Image, Check, X, Loader2 } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { notify } from "../utils/notify";
import "./CompanyDocuments.css";

const DOC_TYPES = [
  { key: "company_logo", label: "Company Logo", accept: ".png,.jpg,.jpeg,.webp", icon: "image" },
  { key: "qr_code", label: "QR Code", accept: ".png,.jpg,.jpeg,.webp", icon: "image" },
  { key: "employment_contract", label: "Employment Contract", accept: ".pdf,.png,.jpg,.jpeg,.webp", icon: "file" },
  { key: "offer_letter", label: "Offer Letter", accept: ".pdf,.png,.jpg,.jpeg,.webp", icon: "file" },
  { key: "techxaro_regulations", label: "TechXaro Regulations", accept: ".pdf,.png,.jpg,.jpeg,.webp", icon: "file" },
];

function CompanyDocuments({ isOpen, onClose }) {
  const [documents, setDocuments] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      fetchDocuments();
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/company-documents`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${authToken()}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDocuments(data.documents);
      }
    } catch {
      notify.error("Failed to load company documents.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (type, file) => {
    if (!file) return;
    setUploading(type);
    try {
      const formData = new FormData();
      formData.append("type", type);
      formData.append("file", file);

      const res = await fetch(`${API_URL}/company-documents`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${authToken()}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify.success(data.message);
        fetchDocuments();
      } else {
        notify.error(data.message || "Upload failed.");
      }
    } catch {
      notify.error("An error occurred during upload.");
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (type) => {
    try {
      const res = await fetch(`${API_URL}/company-documents/${type}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${authToken()}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify.success(data.message);
        fetchDocuments();
      } else {
        notify.error(data.message || "Delete failed.");
      }
    } catch {
      notify.error("An error occurred during deletion.");
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="cd-overlay" onClick={onClose}>
      <div className="cd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cd-header">
          <div>
            <h2 className="cd-title">Company Documents</h2>
            <p className="cd-subtitle">
              These standard documents are attached to user onboarding emails.
            </p>
          </div>
          <button className="cd-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="cd-body">
          {loading ? (
            <div className="cd-loading">
              <Loader2 size={24} className="cd-spin" />
              <span>Loading documents...</span>
            </div>
          ) : (
            <div className="cd-doc-list">
              {DOC_TYPES.map(({ key, label, accept, icon }) => {
                const doc = documents[key];
                const exists = doc?.exists;
                const isUploading = uploading === key;

                return (
                  <div key={key} className={`cd-doc-item ${exists ? "cd-doc-item--active" : ""}`}>
                    <div className="cd-doc-icon">
                      {icon === "image" ? <Image size={20} /> : <FileText size={20} />}
                    </div>
                    <div className="cd-doc-info">
                      <span className="cd-doc-label">{label}</span>
                      <span className={`cd-doc-status ${exists ? "cd-doc-status--ok" : ""}`}>
                        {exists ? (
                          <>
                            <Check size={14} /> Uploaded
                          </>
                        ) : (
                          "Not uploaded"
                        )}
                      </span>
                    </div>
                    <div className="cd-doc-actions">
                      <label className={`cd-upload-btn ${isUploading ? "cd-upload-btn--loading" : ""}`}>
                        {isUploading ? (
                          <Loader2 size={14} className="cd-spin" />
                        ) : (
                          <Upload size={14} />
                        )}
                        <span>{exists ? "Replace" : "Upload"}</span>
                        <input
                          type="file"
                          accept={accept}
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const f = e.target.files[0];
                            if (f) handleUpload(key, f);
                            e.target.value = "";
                          }}
                          disabled={isUploading}
                        />
                      </label>
                      {exists && (
                        <>
                          <a
                            href={doc.url ? `${API_URL.replace("/api", "")}/storage/${doc.path}` : "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cd-view-btn"
                          >
                            View
                          </a>
                          <button className="cd-delete-btn" onClick={() => handleDelete(key)}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="cd-footer">
          <p className="cd-footer-note">
            User personal emails receive only these 5 standard documents. Admin/Manager confirmation emails also include all additional uploaded user documents.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default CompanyDocuments;
