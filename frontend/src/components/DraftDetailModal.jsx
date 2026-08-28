/**
 * DraftDetailModal.jsx
 * Modal showing full draft data with version history and actions.
 * For returned-from-resignation drafts, includes reassignment flow.
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "../hooks/useEscapeKey";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import draftService from "../services/draftService";
import { notify } from "../utils/notify";
import { publish } from "../utils/eventBus";
import { MdClose, MdRestore } from "react-icons/md";
import "./DraftDetailModal.css";

const MODULE_LABELS = {
  project: "Project",
  task: "Task",
  deliverable: "Subtask",
  event: "Calendar Event",
  user: "User",
  team: "Team",
};

function DraftDetailModal({ draft: initialDraft, onClose }) {
  const { t } = useTranslation();
  useEscapeKey(true, onClose);
  const [draft, setDraft] = useState(initialDraft);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [assigneeId, setAssigneeId] = useState(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const fetchDetail = async () => {
      setLoading(true);
      try {
        const data = await draftService.get(initialDraft.id);
        if (data) setDraft(data.data);
      } catch {}
      setLoading(false);
    };
    fetchDetail();
  }, [initialDraft.id]);

  useEffect(() => {
    if (draft?.is_returned) {
      const fetchUsers = async () => {
        try {
          const token = authToken();
          const res = await fetch(`${API_URL}/team-users`, {
            headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          if (data.success) setUsers(data.users || []);
        } catch {}
      };
      fetchUsers();
    }
  }, [draft?.is_returned]);

  const handleRestoreVersion = async (version) => {
    try {
      const data = await draftService.restoreVersion(draft.id, version);
      setDraft(data.data);
      notify.success(data.message || t("Version restored", { defaultValue: "Version restored" }));
    } catch (err) {
      notify.error(err.message);
    }
  };

  const handlePublishAndReassign = async () => {
    if (!assigneeId) {
      notify.error(t("Please select a user to assign", { defaultValue: "Please select a user to assign" }));
      return;
    }

    setPublishing(true);
    try {
      const updatedData = { ...draft.draft_data, assigned_to: parseInt(assigneeId) };
      const data = await draftService.publishReturned(draft.id, { draft_data: updatedData });
      notify.success(t("Draft published and reassigned successfully", { defaultValue: "Draft published and reassigned successfully" }));
      onClose();
      publish("drafts:changed");
    } catch (err) {
      notify.error(err.message || t("Failed to publish draft", { defaultValue: "Failed to publish draft" }));
    } finally {
      setPublishing(false);
    }
  };

  const draftData = draft?.draft_data || {};
  const versions = draft?.versions || [];

  const renderField = (key, value) => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "object" && !Array.isArray(value)) return null;
    if (Array.isArray(value) && value.length === 0) return null;

    let displayValue = value;
    if (Array.isArray(value)) {
      displayValue = value.join(", ");
    } else if (typeof value === "boolean") {
      displayValue = value ? t("Yes") : t("No");
    }

    return (
      <div className="ddm-field" key={key}>
        <span className="ddm-field-label">{t(key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))}</span>
        <span className="ddm-field-value">{String(displayValue)}</span>
      </div>
    );
  };

  return createPortal(
    <div className="ddm-overlay" onClick={onClose}>
      <div className="ddm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ddm-header">
          <div className="ddm-header-left">
            <h2>{t("Draft Details", { defaultValue: "Draft Details" })}</h2>
            <span className="ddm-draft-code">{draft?.draft_code}</span>
          </div>
          <button className="ddm-close-btn" onClick={onClose}>
            <MdClose size={20} />
          </button>
        </div>

        <div className="ddm-body">
          {loading ? (
            <div className="ddm-loading">{t("Loading...", { defaultValue: "Loading..." })}</div>
          ) : (
            <>
              {draft?.is_returned && (
                <div className="ddm-returned-banner">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#92400e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <div>
                    <strong>{t("Returned from Resignation", { defaultValue: "Returned from Resignation" })}</strong>
                    {draft?.returned_from_user && (
                      <p>{t("Original assignee", { defaultValue: "Original assignee" })}: {draft.returned_from_user.name} ({t("Resigned", { defaultValue: "Resigned" })})</p>
                    )}
                    {draft?.returned_at && (
                      <p>{t("Returned", { defaultValue: "Returned" })}: {new Date(draft.returned_at).toLocaleDateString()}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="ddm-section">
                <h3>{t("General Info", { defaultValue: "General Info" })}</h3>
                <div className="ddm-fields-grid">
                  {renderField("Title", draft?.title)}
                  {renderField("Module", MODULE_LABELS[draft?.module_type] ? t(MODULE_LABELS[draft?.module_type]) : draft?.module_type)}
                  {renderField("Status", draft?.status_label ? t(draft.status_label) : (draft?.status ? t(draft.status) : null))}
                  {renderField("Version", `v${draft?.version}`)}
                  {renderField("Created By", draft?.creator?.name)}
                  {renderField("Last Edited By", draft?.lastEditor?.name)}
                  {renderField("Created At", draft?.created_at ? new Date(draft.created_at).toLocaleString() : null)}
                  {renderField("Last Updated", draft?.updated_at ? new Date(draft.updated_at).toLocaleString() : null)}
                </div>
              </div>

              <div className="ddm-section">
                <h3>{t("Draft Data", { defaultValue: "Draft Data" })}</h3>
                <div className="ddm-fields-grid">
                  {Object.entries(draftData).map(([key, value]) => renderField(key, value))}
                </div>
              </div>

              {draft?.is_returned && (
                <div className="ddm-section ddm-reassign-section">
                  <h3>{draft?.original_record_id ? t("Edit & Reassign Work Item", { defaultValue: "Edit & Reassign Work Item" }) : t("Create & Reassign Work Item", { defaultValue: "Create & Reassign Work Item" })}</h3>
                  <p className="ddm-reassign-info">
                    {draft?.original_record_id
                      ? t("This work item was returned because the original assignee was resigned. The original record exists — update and reassign it to a new team member.", { defaultValue: "This work item was returned because the original assignee was resigned. The original record exists — update and reassign it to a new team member." })
                      : t("This work item was returned because the original assignee was resigned. The original record was never created — create it and assign it to a new team member.", { defaultValue: "This work item was returned because the original assignee was resigned. The original record was never created — create it and assign it to a new team member." })}
                  </p>
                  <div className="ddm-assignee-select">
                    <label>{t("Assign to", { defaultValue: "Assign to" })}</label>
                    <select
                      value={assigneeId || ""}
                      onChange={(e) => setAssigneeId(e.target.value)}
                    >
                      <option value="">{t("Select a user...", { defaultValue: "Select a user..." })}</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="ddm-publish-btn"
                    onClick={handlePublishAndReassign}
                    disabled={!assigneeId || publishing}
                  >
                    {publishing
                      ? t("Publishing...", { defaultValue: "Publishing..." })
                      : draft?.original_record_id
                        ? t("Edit & Reassign", { defaultValue: "Edit & Reassign" })
                        : t("Create & Reassign", { defaultValue: "Create & Reassign" })}
                  </button>
                </div>
              )}

              {versions.length > 0 && (
                <div className="ddm-section">
                  <h3>{t("Version History", { defaultValue: "Version History" })}</h3>
                  <div className="ddm-versions">
                    {versions.map((v) => (
                      <div className="ddm-version-item" key={v.version}>
                        <div className="ddm-version-info">
                          <span className="ddm-version-num">v{v.version}</span>
                          <span className="ddm-version-editor">{v.editor?.name || t("Unknown", { defaultValue: "Unknown" })}</span>
                          <span className="ddm-version-time">
                            {v.edited_at ? new Date(v.edited_at).toLocaleString() : ""}
                          </span>
                        </div>
                        {v.version !== draft?.version && (
                          <button
                            className="ddm-restore-btn"
                            onClick={() => handleRestoreVersion(v.version)}
                            title={t("Restore this version", { defaultValue: "Restore this version" })}
                          >
                            <MdRestore size={14} /> {t("Restore", { defaultValue: "Restore" })}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default DraftDetailModal;
