/**
 * AutoSaveIndicator.jsx
 * Small status indicator showing auto-save state in form modals.
 * Shows: "Saving...", "Saved at 10:45 AM", "Last saved 2 min ago"
 */

import { useMemo } from "react";
import { FiSave } from "react-icons/fi";
import { BiLoaderCircle } from "react-icons/bi";
import { IoCheckmarkCircleOutline } from "react-icons/io5";
import "./AutoSaveIndicator.css";

function formatTime(date) {
  if (!date) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(date) {
  if (!date) return "";
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatTime(date);
}

function AutoSaveIndicator({ isSaving, lastSaved, error }) {
  const content = useMemo(() => {
    if (error) {
      return (
        <span className="asi-text asi-error">
          <FiSave size={14} />
          Save failed
        </span>
      );
    }
    if (isSaving) {
      return (
        <span className="asi-text asi-saving">
          <BiLoaderCircle size={14} className="asi-spin" />
          Saving...
        </span>
      );
    }
    if (lastSaved) {
      return (
        <span className="asi-text asi-saved">
          <IoCheckmarkCircleOutline size={14} />
          Last saved at {formatTime(lastSaved)}
        </span>
      );
    }
    return null;
  }, [isSaving, lastSaved, error]);

  if (!content) return null;

  return <div className="auto-save-indicator">{content}</div>;
}

export default AutoSaveIndicator;
