/**
 * DelegationChain.jsx
 * Displays the delegation chain for a task or deliverable.
 * Shows the chain of delegations, accept/reject/revoke actions,
 * and pending delegation notifications.
 */

import { useState } from "react";
import API_URL from "../config/api";
import { authToken, getUser } from "../utils/auth";
import { notify } from "../utils/notify";
import { formatDateTime } from "../utils/formatDateTime";

function DelegationChain({ task, delegationChain = [], approvalChain = [], onTaskUpdate }) {
  const currentUser = getUser();
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const pendingDelegation = task?.pending_delegation;
  const isDelegatedToMe = pendingDelegation && pendingDelegation.delegated_to === currentUser?.id;

  const handleAccept = async () => {
    if (!pendingDelegation) return;
    setAccepting(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${task.id}/accept-delegation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify.success("Transfer accepted");
        onTaskUpdate?.();
      } else {
        notify.error(data.message || "Failed to accept");
      }
    } catch {
      notify.error("Error accepting transfer");
    } finally {
      setAccepting(false);
    }
  };

  const handleReject = async () => {
    if (!pendingDelegation) return;
    setRejecting(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${task.id}/reject-delegation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: "Not available to take this task" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify.success("Transfer rejected");
        onTaskUpdate?.();
      } else {
        notify.error(data.message || "Failed to reject");
      }
    } catch {
      notify.error("Error rejecting transfer");
    } finally {
      setRejecting(false);
    }
  };

  const handleRevoke = async (delegationId) => {
    setRevoking(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${task.id}/revoke-delegation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ delegation_id: delegationId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify.success("Transfer revoked");
        onTaskUpdate?.();
      } else {
        notify.error(data.message || "Failed to revoke");
      }
    } catch {
      notify.error("Error revoking transfer");
    } finally {
      setRevoking(false);
    }
  };

  const statusColor = (status) => {
    const map = {
      pending: "var(--color-warning)",
      accepted: "var(--color-success)",
      rejected: "var(--color-error)",
      revoked: "var(--text-secondary)",
    };
    return map[status] || "var(--text-secondary)";
  };

  const statusBg = (status) => {
    const map = {
      pending: "var(--color-warning-bg, #fef3c7)",
      accepted: "var(--color-success-bg, #d1fae5)",
      rejected: "var(--color-error-bg, #fee2e2)",
      revoked: "var(--bg-hover, #f3f4f6)",
    };
    return map[status] || "var(--bg-hover)";
  };

  const safeDelegationChain = Array.isArray(delegationChain) ? delegationChain : [];
  const safeApprovalChain = Array.isArray(approvalChain) ? approvalChain : [];

  if (!safeDelegationChain.length && !isDelegatedToMe) return null;

  return (
    <div className="td-card td-submission-card" style={{ marginBottom: "16px" }}>
      {/* Pending delegation alert for me */}
      {isDelegatedToMe && (
        <div style={{
          padding: "16px", marginBottom: "16px", borderRadius: "8px",
          background: "linear-gradient(135deg, var(--color-warning-bg, #fef3c7) 0%, var(--color-info-bg, #f0f9ff) 100%)",
          border: "1px solid var(--color-warning, #f59e0b)",
        }}>
          <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-heading)", marginBottom: "8px" }}>
            Task Transferred to You
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "12px" }}>
            <strong>{pendingDelegation.delegated_by_name || "Someone"}</strong> has transferred this task to you.
            {pendingDelegation.reason && (
              <span> Reason: <em>{pendingDelegation.reason}</em></span>
            )}
          </div>
          {pendingDelegation.notes && (
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontStyle: "italic", marginBottom: "12px" }}>
              Notes: "{pendingDelegation.notes}"
            </div>
          )}
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className="btn btn-primary"
              onClick={handleAccept}
              disabled={accepting || rejecting}
              style={{ fontSize: "13px", padding: "6px 16px", opacity: accepting ? 0.6 : 1, cursor: accepting ? "not-allowed" : "pointer" }}
            >
              {accepting ? "Accepting..." : "Accept"}
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleReject}
              disabled={accepting || rejecting}
              style={{ fontSize: "13px", padding: "6px 16px", opacity: rejecting ? 0.6 : 1, cursor: rejecting ? "not-allowed" : "pointer" }}
            >
              {rejecting ? "Rejecting..." : "Reject"}
            </button>
          </div>
        </div>
      )}

          <h3 className="td-card-title">Transfer Chain</h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
        {safeDelegationChain.map((entry, idx) => {
          const isLast = idx === safeDelegationChain.length - 1;
          const canRevoke = entry.status === 'pending';
          const isDelegator = entry.delegated_by === currentUser?.id;

          return (
            <div key={entry.id || idx} style={{
              display: "flex", gap: "12px", padding: "12px 0",
              borderBottom: !isLast ? "1px solid var(--border)" : "none",
            }}>
              <div style={{
                width: "32px", height: "32px", borderRadius: "50%",
                background: statusBg(entry.status), color: statusColor(entry.status),
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "12px", fontWeight: 700, flexShrink: 0,
              }}>
                L{entry.level}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", color: "var(--text-heading)", marginBottom: "2px" }}>
                  <strong>{entry.delegated_by_name}</strong>
                  <span style={{ margin: "0 6px", color: "var(--text-secondary)" }}>&rarr;</span>
                  <strong>{entry.delegated_to_name}</strong>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span className="badge" style={{
                    background: statusBg(entry.status),
                    color: statusColor(entry.status),
                    fontSize: "11px", padding: "2px 8px", borderRadius: "12px", fontWeight: 600,
                  }}>
                    {entry.status?.charAt(0).toUpperCase() + entry.status?.slice(1)}
                  </span>
                  {entry.reason && (
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{entry.reason}</span>
                  )}
                  {entry.return_to_transferor !== undefined && (
                    <span style={{
                      fontSize: "10px", padding: "1px 6px", borderRadius: "8px",
                      background: entry.return_to_transferor ? "var(--color-info-bg, #f0f9ff)" : "var(--color-warning-bg, #fef3c7)",
                      color: entry.return_to_transferor ? "var(--color-info, #0369a1)" : "var(--color-warning, #d97706)",
                    }}>
                      {entry.return_to_transferor ? "Returns to transferor" : "Direct to original assigner"}
                    </span>
                  )}
                  {entry.created_at && (
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary, #9CA3AF)" }}>
                      {formatDateTime(entry.created_at)}
                    </span>
                  )}
                </div>
                {canRevoke && isDelegator && (
                  <button
                    className="btn btn-sm"
                    onClick={() => handleRevoke(entry.id)}
                    disabled={revoking}
                    style={{
                      marginTop: "6px", fontSize: "11px", padding: "2px 8px",
                      color: "var(--color-error, #DC2626)", background: "none",
                      border: "1px solid var(--color-error, #DC2626)", borderRadius: "4px",
                      cursor: revoking ? "not-allowed" : "pointer",
                      opacity: revoking ? 0.6 : 1,
                    }}
                  >
                    {revoking ? "Revoking..." : "Revoke"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Approval chain */}
      {safeApprovalChain.length > 0 && (
        <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>
            Approval Route (reversed chain):
          </div>
          {safeApprovalChain.map((approver, idx) => (
            <div key={idx} style={{ fontSize: "12px", color: "var(--text-heading)", marginBottom: "4px" }}>
              Level {approver.level}: <strong>{approver.approver_name}</strong>
              <span className="badge" style={{
                marginLeft: "8px",
                background: approver.status === 'approved' ? "var(--color-success-bg)" : "var(--bg-hover)",
                color: approver.status === 'approved' ? "var(--color-success)" : "var(--text-secondary)",
                fontSize: "10px", padding: "1px 6px", borderRadius: "8px",
              }}>
                {approver.status === 'approved' ? 'Approved' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Current owner indicator */}
      {task.current_owner && task.current_owner_name && (
        <div style={{
          marginTop: "12px", padding: "8px 12px", borderRadius: "6px",
          background: "var(--color-info-bg, #f0f9ff)",
          fontSize: "12px", color: "var(--text-secondary)",
        }}>
          Current Owner: <strong style={{ color: "var(--text-heading)" }}>{task.current_owner_name}</strong>
        </div>
      )}
    </div>
  );
}

export default DelegationChain;
