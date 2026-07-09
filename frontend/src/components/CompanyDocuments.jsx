/**
 * CompanyDocuments.jsx
 * Modal component for managing company documents (logo, QR code, other documents)
 * that are attached to user onboarding emails.
 *
 * Admin/Manager only. Allows uploading, viewing, and replacing each document type.
 * Other Documents supports multiple file uploads.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Upload, FileText, Image, Check, X, Loader2, Trash2 } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { notify } from "../utils/notify";
import ConfirmModal from "./ConfirmModal";
import "./CompanyDocuments.css";

const SINGLE_TYPES = [
  { key: "company_logo", label: "Company Logo", accept: ".png,.jpg,.jpeg,.webp", icon: "image" },
  { key: "qr_code", label: "QR Code", accept: ".png,.jpg,.jpeg,.webp", icon: "image" },
];

function CompanyDocuments({ isOpen, onClose }) {
  const [documents, setDocuments] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState({ type: "", filename: "" });

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

  const handleDelete = async (type, filename) => {
    try {
      const url = type === "other_documents" && filename
        ? `${API_URL}/company-documents/${type}?filename=${encodeURIComponent(filename)}`
        : `${API_URL}/company-documents/${type}`;

      const res = await fetch(url, {
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

  const otherDocs = documents.other_documents;

  return createPortal(
    <>
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
              <>
                <div className="cd-doc-list">
                  {SINGLE_TYPES.map(({ key, label, accept, icon }) => {
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
                              <button className="cd-delete-btn" onClick={() => { setPendingDelete({ type: key, filename: "" }); setConfirmDeleteOpen(true); }}>
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="cd-other-section">
                  <div className="cd-doc-item cd-doc-item--active">
                    <div className="cd-doc-icon">
                      <FileText size={20} />
                    </div>
                    <div className="cd-doc-info">
                      <span className="cd-doc-label">Other Documents</span>
                      <span className={`cd-doc-status ${otherDocs?.exists ? "cd-doc-status--ok" : ""}`}>
                        {otherDocs?.exists ? (
                          <>
                            <Check size={14} /> {otherDocs.files.length} file(s) uploaded
                          </>
                        ) : (
                          "No files uploaded"
                        )}
                      </span>
                    </div>
                    <div className="cd-doc-actions">
                      <label className={`cd-upload-btn ${uploading === "other_documents" ? "cd-upload-btn--loading" : ""}`}>
                        {uploading === "other_documents" ? (
                          <Loader2 size={14} className="cd-spin" />
                        ) : (
                          <Upload size={14} />
                        )}
                        <span>Upload</span>
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.webp"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const f = e.target.files[0];
                            if (f) handleUpload("other_documents", f);
                            e.target.value = "";
                          }}
                          disabled={uploading === "other_documents"}
                        />
                      </label>
                    </div>
                  </div>

                  {otherDocs?.files?.length > 0 && (
                    <div className="cd-other-files">
                      {otherDocs.files.map((file, idx) => (
                        <div key={idx} className="cd-other-file-row">
                          <a
                            href={`${API_URL.replace("/api", "")}/storage/${file.path}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cd-other-file-name"
                          >
                            {file.filename}
                          </a>
                          <button
                            className="cd-delete-btn"
                            onClick={() => { setPendingDelete({ type: "other_documents", filename: file.filename }); setConfirmDeleteOpen(true); }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="cd-footer">
            <p className="cd-footer-note">
              Company Logo, QR Code, and Other Documents are attached to new user welcome emails.
            </p>
          </div>
        </div>
      </div>
      <ConfirmModal
        isOpen={confirmDeleteOpen}
        onClose={() => { setConfirmDeleteOpen(false); setPendingDelete({ type: "", filename: "" }); }}
        onConfirm={() => { handleDelete(pendingDelete.type, pendingDelete.filename); setConfirmDeleteOpen(false); setPendingDelete({ type: "", filename: "" }); }}
        title="Delete Document"
        message="Are you sure you want to delete this document? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger
      />
    </>,
    document.body
  );
}

export default CompanyDocuments;
