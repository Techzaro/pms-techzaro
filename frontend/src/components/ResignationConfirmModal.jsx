import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { authToken } from "../utils/auth";
import API_URL from "../config/api";
import { notify } from "../utils/notify";
import "./ResignationConfirmModal.css";

const MODULE_COLORS = {
  project: "#4f46e5",
  task: "#0891b2",
  deliverable: "#7c3aed",
  event: "#059669",
};

const MODULE_LABELS = {
  project: "Project",
  task: "Task",
  deliverable: "Subtask",
  event: "Event",
};

function ResignationConfirmModal({ isOpen, onClose, onConfirm, user, impact, loading: impactLoading }) {
  useEscapeKey(isOpen, onClose);
  const [processing, setProcessing] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setNotes("");
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  const summary = impact?.summary || {};
  const totalItems = summary.total_items || 0;
  const affectedItems = [
    ...(impact?.active_projects || []).map(i => ({ ...i, type: "project" })),
    ...(impact?.active_tasks || []).map(i => ({ ...i, type: "task" })),
    ...(impact?.active_deliverables || []).map(i => ({ ...i, type: "deliverable" })),
    ...(impact?.active_events || []).map(i => ({ ...i, type: "event" })),
  ];

  const handleConfirm = async () => {
    setProcessing(true);
    try {
      const res = await fetch(`${API_URL}/users/${user.id}/resign`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${authToken()}`,
        },
        body: JSON.stringify({ notes: notes || null }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to resign user");
      if (onConfirm) onConfirm(data);
      onClose();
    } catch (err) {
      notify.error(err.message || "Failed to resign user.");
    } finally {
      setProcessing(false);
    }
  };

  return createPortal(
    <div className="rcm-overlay" onClick={onClose}>
      <div className="rcm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rcm-header">
          <div className="rcm-header-left">
            <div className="rcm-header-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="17" y1="11" x2="23" y2="11" />
              </svg>
            </div>
            <div>
              <h2>Resign User</h2>
              <p>This action will revoke access and return work items to assigners</p>
            </div>
          </div>
          <button className="rcm-close-btn" onClick={onClose} disabled={processing}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="rcm-body">
          {impactLoading ? (
            <div className="rcm-loading">
              <div className="rcm-spinner"></div>
              <p>Analyzing impact...</p>
            </div>
          ) : (
            <>
              <div className="rcm-user-card">
                <div className="rcm-user-avatar">
                  {user?.avatar ? (
                    <img src={`${API_URL.replace("/api", "")}/storage/${user.avatar}`} alt="" />
                  ) : (
                    <span>{(user?.name || "U").charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="rcm-user-info">
                  <h3>{user?.name}</h3>
                  <p>{user?.email}</p>
                  <div className="rcm-user-tags">
                    <span className="rcm-tag">{user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1).replace("_", " ") : "-"}</span>
                    {user?.department && <span className="rcm-tag">{user.department}</span>}
                  </div>
                </div>
              </div>

              <div className="rcm-impact-summary">
                <h4>Impact Summary</h4>
                <div className="rcm-impact-grid">
                  <div className="rcm-impact-item">
                    <span className="rcm-impact-count" style={{ color: "#4f46e5" }}>{summary.total_projects || 0}</span>
                    <span className="rcm-impact-label">Projects</span>
                  </div>
                  <div className="rcm-impact-item">
                    <span className="rcm-impact-count" style={{ color: "#0891b2" }}>{summary.total_tasks || 0}</span>
                    <span className="rcm-impact-label">Tasks</span>
                  </div>
                  <div className="rcm-impact-item">
                    <span className="rcm-impact-count" style={{ color: "#7c3aed" }}>{summary.total_deliverables || 0}</span>
                    <span className="rcm-impact-label">Subtasks</span>
                  </div>
                  <div className="rcm-impact-item">
                    <span className="rcm-impact-count" style={{ color: "#059669" }}>{summary.total_events || 0}</span>
                    <span className="rcm-impact-label">Events</span>
                  </div>
                </div>
                {totalItems > 0 && (
                  <div className="rcm-total-badge">
                    <strong>{totalItems}</strong> item{totalItems !== 1 ? "s" : ""} will return to original assigners as drafts
                  </div>
                )}
              </div>

              {affectedItems.length > 0 && (
                <div className="rcm-affected-items">
                  <h4>Affected Items</h4>
                  <div className="rcm-items-table-wrap">
                    <table className="rcm-items-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Code</th>
                          <th>Title</th>
                          <th>Return To</th>
                        </tr>
                      </thead>
                      <tbody>
                        {affectedItems.map((item, idx) => (
                          <tr key={`${item.type}-${item.id}-${idx}`}>
                            <td>
                              <span className="rcm-type-badge" style={{
                                background: (MODULE_COLORS[item.type] || "#6b7280") + "15",
                                color: MODULE_COLORS[item.type] || "#6b7280",
                              }}>
                                {MODULE_LABELS[item.type] || item.type}
                              </span>
                            </td>
                            <td className="rcm-item-code">{item.code || "-"}</td>
                            <td>{item.title}</td>
                            <td className="rcm-item-assigner">{item.assigner?.name || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {totalItems === 0 && (
                <div className="rcm-no-items">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span>No active work items found. User can be safely resigned.</span>
                </div>
              )}

              <div className="rcm-warning">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>This user will <strong>immediately lose access</strong> to the system. All unfinished work will automatically return to the original assigners as Draft items for review and reassignment.</span>
              </div>

              <div className="rcm-notes">
                <label>Notes (optional)</label>
                <textarea
                  placeholder="Add a reason or note about this resignation..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </>
          )}
        </div>

        <div className="rcm-footer">
          <button className="rcm-cancel-btn" onClick={onClose} disabled={processing}>
            Cancel
          </button>
          <button
            className="rcm-confirm-btn"
            onClick={handleConfirm}
            disabled={processing || impactLoading}
          >
            {processing ? (
              <>
                <div className="rcm-btn-spinner"></div>
                Processing...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="17" y1="11" x2="23" y2="11" />
                </svg>
                Confirm Resignation
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ResignationConfirmModal;
