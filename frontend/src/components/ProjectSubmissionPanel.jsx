import { FileText } from "lucide-react";
import ConfirmationDialog from "./ConfirmationDialog";
import ProjectReopenDialog from "./ProjectReopenDialog";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";

function formatDateTime(value) {
  if (!value) return "\u2014";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDateShort(value) {
  return formatDateTime(value);
}

function actionLabel(action) {
  const map = {
    submitted: "Submitted",
    resubmitted: "Resubmitted",
    approved: "Approved",
    rejected: "Rejected",
    reopened: "Reopened",
  };
  return map[action] || action;
}

function ProjectSubmissionPanel({
  project,
  isCreator,
  isAssignee,
  onProjectUpdate,
  onSubmitClick,
  confirmDialog,
  setConfirmDialog,
  reopenDialog,
  setReopenDialog,
  acting,
  setActing,
}) {
  const latestSubmission = project.latest_submission || project.latestSubmission;
  const workflowEvents = project.workflow_events || project.workflowEvents || [];
  const status = project.status;

  const handleAction = async (action, body = {}) => {
    setActing(true);
    try {
      const token = authToken();
      let res;
      if (action === "reopen") {
        return;
      }
      res = await fetch(`${API_URL}/projects/${project.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        onProjectUpdate(data.project);
      }
    } catch {
    } finally {
      setActing(false);
    }
  };

  const confirmMessages = {
    approve: "Are you sure you want to approve this project?",
    reject: "Are you sure you want to reject this project? The assignee will not be able to resubmit.",
  };

  const historyItems = workflowEvents.map((e) => ({
    id: `evt-${e.id}`,
    action: e.action,
    user: e.user,
    date: e.created_at,
    comment: e.comment,
    instructions: e.instructions,
    new_deadline: e.new_deadline,
    file_name: e.file_name,
    file_path: e.file_path,
    type: e.action === "submitted" || e.action === "resubmitted" ? "submission" : "event",
  }));

  return (
    <div className="td-submission-panel">
      {status === "reopened" && (
        <div className="td-card td-submission-card">
          <h3 className="td-card-title">Reopen Details</h3>
          <div className="td-submission-grid">
            <div className="td-submission-item">
              <span className="td-submission-label">Reopened By</span>
              <span className="td-submission-value">{(project.reopened_by || project.reopenedBy)?.name || "\u2014"}</span>
            </div>
            <div className="td-submission-item">
              <span className="td-submission-label">Reopened On</span>
              <span className="td-submission-value">{formatDateTime(project.reopened_at)}</span>
            </div>
          </div>
          {project.reopen_comment && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">Reopen Comment</span>
              <p className="td-submission-text">{project.reopen_comment}</p>
            </div>
          )}
          {project.reopen_instructions && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">Additional Instructions</span>
              <p className="td-submission-text">{project.reopen_instructions}</p>
            </div>
          )}
          {project.reopen_new_deadline && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">New Deadline</span>
              <span className="td-submission-value">{formatDateShort(project.reopen_new_deadline)}</span>
            </div>
          )}
          {project.reopen_file_name && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">Attached File</span>
              <span className="td-submission-value">{project.reopen_file_name}</span>
            </div>
          )}
        </div>
      )}

      {(status === "submitted" || status === "approved" || status === "rejected") && latestSubmission && (
        <div className="td-card td-submission-card">
          <h3 className="td-card-title">Submission Details</h3>
          <div className="td-submission-grid">
            <div className="td-submission-item">
              <span className="td-submission-label">Submitted By</span>
              <span className="td-submission-value">{(latestSubmission.submitted_by || latestSubmission.submittedBy)?.name || "Unknown"}</span>
            </div>
            <div className="td-submission-item">
              <span className="td-submission-label">Submitted At</span>
              <span className="td-submission-value">{formatDateTime(latestSubmission.created_at)}</span>
            </div>
          </div>
          {latestSubmission.comment && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">Submission Notes</span>
              <p className="td-submission-text">{latestSubmission.comment}</p>
            </div>
          )}
          {latestSubmission.file_name && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">Attached File</span>
              <a
                className="td-submission-file-link"
                href={`${API_URL}/projects/submission-file/${latestSubmission.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileText size={16} />
                <span>{latestSubmission.file_name}</span>
              </a>
            </div>
          )}

          {isCreator && status === "submitted" && (
            <div className="td-review-actions">
              <button
                className="td-review-btn td-review-btn--approve"
                disabled={acting}
                onClick={() => setConfirmDialog({ open: true, type: "approve" })}
              >
                Approve
              </button>
              <button
                className="td-review-btn td-review-btn--reject"
                disabled={acting}
                onClick={() => setConfirmDialog({ open: true, type: "reject" })}
              >
                Reject
              </button>
              <button
                className="td-review-btn td-review-btn--reopen"
                disabled={acting}
                onClick={() => setReopenDialog(true)}
              >
                Reject & Reopen
              </button>
            </div>
          )}
        </div>
      )}

      {historyItems.length > 0 && (
        <div className="td-card td-submission-card">
          <h3 className="td-card-title">Submission History</h3>
          <ul className="td-history-list">
            {historyItems.map((item) => (
              <li key={item.id} className="td-history-item">
                <div className="td-history-header">
                  <span className={`td-history-badge td-history-badge--${item.action}`}>{actionLabel(item.action)}</span>
                  <span className="td-history-date">{formatDateTime(item.date)}</span>
                </div>
                <div className="td-history-meta">
                  by {item.user?.name || "Unknown"}
                </div>
                {item.comment && <p className="td-submission-text">{item.comment}</p>}
                {item.instructions && (
                  <p className="td-submission-text"><strong>Instructions:</strong> {item.instructions}</p>
                )}
                {item.new_deadline && (
                  <p className="td-submission-text"><strong>New Deadline:</strong> {formatDateShort(item.new_deadline)}</p>
                )}
                {item.file_name && item.type === "submission" && item.file_path && (
                  <span className="td-submission-value">{item.file_name}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmationDialog
        isOpen={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, type: null })}
        onConfirm={() => {
          const type = confirmDialog.type;
          setConfirmDialog({ open: false, type: null });
          handleAction(type);
        }}
        title={confirmDialog.type === "approve" ? "Approve Project" : "Reject Project"}
        message={confirmMessages[confirmDialog.type] || ""}
        confirmText={confirmDialog.type === "approve" ? "Approve" : "Reject"}
        confirmColor={confirmDialog.type === "approve" ? "#16A34A" : "#DC2626"}
      />

      <ProjectReopenDialog
        isOpen={reopenDialog}
        onClose={() => setReopenDialog(false)}
        project={project}
        onReopenSuccess={onProjectUpdate}
      />
    </div>
  );
}

export default ProjectSubmissionPanel;
