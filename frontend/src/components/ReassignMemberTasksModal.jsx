import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, X, UserCheck, ArrowRight, ListTodo } from "lucide-react";
import { useEscapeKey } from "../hooks/useEscapeKey";

/**
 * Modal to mandate reassigning active tasks and deliverables (subtasks)
 * of a project member to another active member before removing them from the project.
 */
export default function ReassignMemberTasksModal({
  isOpen,
  onClose,
  memberToRemove,
  activeTasks = [],
  activeDeliverables = [],
  totalActiveCount = 0,
  availableMembers = [],
  onConfirm,
  loading = false,
}) {
  const { t } = useTranslation();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [error, setError] = useState("");

  useEscapeKey(isOpen, () => {
    if (!loading) onClose();
  });

  useEffect(() => {
    if (isOpen) {
      setSelectedUserId("");
      setError("");
    }
  }, [isOpen, memberToRemove]);

  if (!isOpen || !memberToRemove) return null;

  // Filter out the member being removed from available assignees
  const candidateMembers = (availableMembers || []).filter(
    (m) => Number(m.id) !== Number(memberToRemove.id)
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedUserId) {
      setError(t("Please select a project member to receive the reassigned tasks.", { defaultValue: "Please select a project member to receive the reassigned tasks." }));
      return;
    }
    setError("");
    onConfirm(Number(selectedUserId));
  };

  const tasksCount = activeTasks.length || 0;
  const delivCount = activeDeliverables.length || 0;
  const count = totalActiveCount || (tasksCount + delivCount);

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100050,
        background: "rgba(15, 23, 42, 0.6)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={() => {
        if (!loading) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-card, #ffffff)",
          borderRadius: "14px",
          width: "100%",
          maxWidth: "520px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
          overflow: "hidden",
          border: "1px solid var(--border-color, #e2e8f0)",
          animation: "modalSlideIn 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color, #e2e8f0)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "#fef3c7",
                color: "#d97706",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-primary, #0f172a)" }}>
                {t("Reassign Tasks & Remove Member", { defaultValue: "Reassign Tasks & Remove Member" })}
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--text-secondary, #64748b)" }}>
                {t("Mandatory task transfer before removing project member", { defaultValue: "Mandatory task transfer before removing project member" })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              background: "none",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              color: "var(--text-muted, #94a3b8)",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", overflowY: "auto" }}>
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  background: "#fef2f2",
                  border: "1px solid #fee2e2",
                  color: "#ef4444",
                  fontSize: "13px",
                  fontWeight: 500,
                }}
              >
                {error}
              </div>
            )}

            {/* Outgoing Member Summary Card */}
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "10px",
                background: "var(--bg-page, #f8fafc)",
                border: "1px solid var(--border-color, #e2e8f0)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary, #64748b)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {t("Member Being Removed", { defaultValue: "Member Being Removed" })}
                </span>
                <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-primary, #0f172a)", marginTop: "2px" }}>
                  {memberToRemove.name}
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted, #64748b)" }}>
                  {memberToRemove.email || memberToRemove.role || ""}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "4px 10px",
                    borderRadius: "20px",
                    background: "#fef3c7",
                    color: "#b45309",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  <ListTodo size={14} />
                  {count} {t("Active Item(s)", { defaultValue: "Active Item(s)" })}
                </span>
                <div style={{ fontSize: "11px", color: "var(--text-secondary, #64748b)", marginTop: "3px" }}>
                  {tasksCount} {t("tasks", { defaultValue: "tasks" })}, {delivCount} {t("subtasks", { defaultValue: "subtasks" })}
                </div>
              </div>
            </div>

            {/* Explanatory Warning */}
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary, #475569)", lineHeight: 1.5 }}>
              {t(
                "{{name}} currently has active tasks or subtasks assigned in this project. To prevent orphaned tasks, please select another team member to take over these responsibilities before {{name}} is removed.",
                {
                  name: memberToRemove.name,
                  defaultValue: `${memberToRemove.name} currently has active tasks or subtasks assigned in this project. To prevent orphaned tasks, please select another team member to take over these responsibilities before ${memberToRemove.name} is removed.`,
                }
              )}
            </p>

            {/* Target Member Dropdown */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary, #1e293b)", display: "flex", alignItems: "center", gap: "6px" }}>
                <UserCheck size={16} color="var(--color-primary, #2563eb)" />
                {t("Reassign Active Tasks To", { defaultValue: "Reassign Active Tasks To" })} <span style={{ color: "#ef4444" }}>*</span>
              </label>

              {candidateMembers.length === 0 ? (
                <div style={{ padding: "12px", borderRadius: "8px", background: "#fef2f2", color: "#dc2626", fontSize: "13px" }}>
                  {t("No other members are assigned to this project. Please add another member to the project first so tasks can be reassigned.", {
                    defaultValue: "No other members are assigned to this project. Please add another member to the project first so tasks can be reassigned.",
                  })}
                </div>
              ) : (
                <select
                  value={selectedUserId}
                  onChange={(e) => {
                    setSelectedUserId(e.target.value);
                    if (error) setError("");
                  }}
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: error ? "1px solid #ef4444" : "1px solid var(--border-color, #cbd5e1)",
                    background: "var(--bg-card, #ffffff)",
                    fontSize: "14px",
                    color: "var(--text-primary, #0f172a)",
                    outline: "none",
                  }}
                  required
                >
                  <option value="">{t("-- Select a replacement member --", { defaultValue: "-- Select a replacement member --" })}</option>
                  {candidateMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.role ? `(${m.role})` : ""} {m.department ? `· ${m.department}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Preview of items being reassigned */}
            {activeTasks.length > 0 && (
              <div style={{ borderTop: "1px dashed var(--border-color, #e2e8f0)", paddingTop: "12px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary, #64748b)" }}>
                  {t("Active Tasks To Reassign ({{count}}):", { count: activeTasks.length, defaultValue: `Active Tasks To Reassign (${activeTasks.length}):` })}
                </span>
                <div style={{ maxHeight: "110px", overflowY: "auto", marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {activeTasks.map((tItem) => (
                    <div
                      key={tItem.id}
                      style={{
                        fontSize: "12px",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        background: "var(--bg-page, #f8fafc)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        color: "var(--text-primary, #334155)",
                      }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "340px" }}>
                        <strong>{tItem.business_id || `#${tItem.id}`}:</strong> {tItem.title}
                      </span>
                      <span style={{ fontSize: "11px", textTransform: "capitalize", color: "var(--text-muted, #64748b)", flexShrink: 0 }}>
                        {tItem.status || "In Progress"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "14px 20px",
              borderTop: "1px solid var(--border-color, #e2e8f0)",
              background: "var(--bg-page, #f8fafc)",
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                background: "var(--bg-card, #ffffff)",
                color: "var(--text-secondary, #475569)",
                border: "1px solid var(--border-color, #cbd5e1)",
                fontSize: "13px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {t("Cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="submit"
              disabled={loading || !selectedUserId || candidateMembers.length === 0}
              style={{
                padding: "8px 20px",
                borderRadius: "8px",
                background: loading || !selectedUserId || candidateMembers.length === 0 ? "var(--btn-disabled, #94a3b8)" : "#ef4444",
                color: "#ffffff",
                border: "none",
                fontSize: "13px",
                fontWeight: 600,
                cursor: loading || !selectedUserId || candidateMembers.length === 0 ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                transition: "background 0.15s ease",
              }}
            >
              {loading ? (
                t("Processing...", { defaultValue: "Processing..." })
              ) : (
                <>
                  <ArrowRight size={15} />
                  {t("Reassign & Remove", { defaultValue: "Reassign & Remove" })}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
