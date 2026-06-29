/**
 * Toast.jsx
 * Global toast notification system that displays success, error, warning,
 * and info messages. Reads notifications from the NotificationContext and
 * renders them as auto-dismissing toast items.
 */

import { useNotification } from "../context/NotificationContext";
import { useEffect, useState } from "react";
import "./Toast.css";

/** SVG icon components for each notification type */
const ICONS = {
  success: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  error: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  warning: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
};

/**
 * A single toast notification item with icon, message, and close button.
 * Supports an exit animation before removal.
 * @param {Object} notification - The notification object (id, type, message).
 * @param {Function} onRemove - Callback to remove the notification by id.
 */
function ToastItem({ notification, onRemove }) {
  const [exiting, setExiting] = useState(false);

  /** Starts exit animation, then removes the notification after animation completes */
  const handleClose = () => {
    setExiting(true);
    setTimeout(() => onRemove(notification.id), 250);
  };

  return (
    <div className={`toast-item toast-${notification.type}${exiting ? " toast-exit" : ""}`}>
      <div className="toast-icon">{ICONS[notification.type]}</div>
      <div className="toast-message">{notification.message}</div>
      <button className="toast-close" onClick={handleClose} aria-label="Close notification">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Container component that renders all active toast notifications.
 * Reads from NotificationContext and manages the toast stack.
 */
export default function ToastContainer() {
  const { notifications, removeNotification } = useNotification();

  if (notifications.length === 0) return null;

  return (
    <div className="toast-container">
      {notifications.map((n) => (
        <ToastItem key={n.id} notification={n} onRemove={removeNotification} />
      ))}
    </div>
  );
}
