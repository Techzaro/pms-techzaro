import React, { useState } from "react";
import HRMRichTextEditor from "./HRMRichTextEditor";
import { CheckCircle, XCircle, Trash2 } from "lucide-react";
import "./HRMAdminActions.css";

export default function HRMAdminActions({ onAction }) {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAction = async (actionType) => {
    if (!comment && actionType !== 'approve') {
      alert(`Please provide a comment for this ${actionType} action.`);
      return;
    }
    setIsSubmitting(true);
    try {
      await onAction(actionType, comment);
      setComment("");
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="hrm-admin-actions-container">
      <h3 className="hrm-admin-actions-title">Admin Actions</h3>
      <div className="hrm-admin-actions-content">
        <HRMRichTextEditor 
          label="Admin Comment" 
          value={comment} 
          onChange={setComment} 
          required={false} 
        />
        <div className="hrm-admin-actions-btns">
          <button 
            className="hrm-action-btn hrm-action-approve" 
            onClick={() => handleAction('approve')}
            disabled={isSubmitting}
          >
            <CheckCircle size={16} /> Approve
          </button>
          <button 
            className="hrm-action-btn hrm-action-reject" 
            onClick={() => handleAction('reject')}
            disabled={isSubmitting}
          >
            <XCircle size={16} /> Reject
          </button>
          <button 
            className="hrm-action-btn hrm-action-remove" 
            onClick={() => handleAction('remove')}
            disabled={isSubmitting}
          >
            <Trash2 size={16} /> Remove
          </button>
        </div>
      </div>
    </div>
  );
}
