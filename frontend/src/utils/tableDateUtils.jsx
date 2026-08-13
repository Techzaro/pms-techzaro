import React from "react";
import { formatDateTime } from "./formatDateTime";
import { getUser } from "./auth";

/**
 * Formats date value safely.
 */
function formatDate(dateVal) {
  if (!dateVal) return "-";
  try {
    return formatDateTime(dateVal);
  } catch {
    return String(dateVal);
  }
}

/**
 * Dynamic Date Display & Overdue Highlighting Helper
 */
export function renderDynamicDates(item, currentUser) {
  if (!item) return "-";

  const user = currentUser || getUser();

  const status = (item.status || "").toLowerCase().trim();
  const isSubmittedOrFinished = [
    "submitted",
    "approved",
    "completed",
    "done",
    "abandoned",
  ].includes(status);

  // 1. Resolve Start Date
  const myPivotStart = item.assignees?.find(
    (a) => parseInt(a.id, 10) === parseInt(user?.id, 10)
  )?.pivot?.start_date;
  const startDateVal = myPivotStart || item.start_date || item.created_at;
  const startDateStr = formatDate(startDateVal);

  if (isSubmittedOrFinished) {
    // Condition A: Display Start Date & Submission Date
    const submissionDateVal =
      item.submitted_at ||
      item.submitted_date ||
      item.completed_at ||
      item.updated_at;
    const submissionDateStr = formatDate(submissionDateVal);

    // Check if Overdue (submission_date > due_date)
    const myPivotDue = item.assignees?.find(
      (a) => parseInt(a.id, 10) === parseInt(user?.id, 10)
    )?.pivot?.due_date;
    const dueDateVal = myPivotDue || item.end_date || item.due_date;

    let isOverdue = false;
    if (submissionDateVal && dueDateVal) {
      const subTime = new Date(submissionDateVal).getTime();
      const dueTime = new Date(dueDateVal).getTime();
      if (!isNaN(subTime) && !isNaN(dueTime) && subTime > dueTime) {
        isOverdue = true;
      }
    }

    return (
      <div className="dynamic-date-cell">
        <div className="start-date-line">{startDateStr}</div>
        <div
          className={`submission-date-line ${isOverdue ? "overdue-red" : ""}`}
          style={{
            color: isOverdue ? "#ef4444" : "inherit",
            fontWeight: isOverdue ? 700 : "normal",
          }}
          title={
            isOverdue
              ? "Submitted AFTER Due Date (Overdue)"
              : "Submitted on time"
          }
        >
          {submissionDateStr}
        </div>
      </div>
    );
  } else {
    // Condition B: Display Start Date & Due Date
    const myPivotDue = item.assignees?.find(
      (a) => parseInt(a.id, 10) === parseInt(user?.id, 10)
    )?.pivot?.due_date;
    const dueDateVal = myPivotDue || item.end_date || item.due_date;
    const dueDateStr = formatDate(dueDateVal);

    return (
      <div className="dynamic-date-cell">
        <div className="start-date-line">{startDateStr}</div>
        <div className="due-date-line">{dueDateStr}</div>
      </div>
    );
  }
}
