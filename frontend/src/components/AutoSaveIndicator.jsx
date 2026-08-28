/**
 * AutoSaveIndicator.jsx
 * Small status indicator showing auto-save state in form modals.
 * Shows: "Saving...", "Saved at 10:45 AM", "Last saved 2 min ago"
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FiSave } from "react-icons/fi";
import { BiLoaderCircle } from "react-icons/bi";
import { IoCheckmarkCircleOutline } from "react-icons/io5";
import "./AutoSaveIndicator.css";

function formatTime(date) {
  if (!date) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function AutoSaveIndicator({ isSaving, lastSaved, error }) {
  const { t } = useTranslation();

  const content = useMemo(() => {
    if (error) {
      return (
        <span className="asi-text asi-error">
          <FiSave size={14} />
          {t("Save failed", { defaultValue: "Save failed" })}
        </span>
      );
    }
    if (isSaving) {
      return (
        <span className="asi-text asi-saving">
          <BiLoaderCircle size={14} className="asi-spin" />
          {t("Saving...", { defaultValue: "Saving..." })}
        </span>
      );
    }
    if (lastSaved) {
      return (
        <span className="asi-text asi-saved">
          <IoCheckmarkCircleOutline size={14} />
          {t("Last saved at {{time}}", { defaultValue: `Last saved at ${formatTime(lastSaved)}`, time: formatTime(lastSaved) })}
        </span>
      );
    }
    return null;
  }, [isSaving, lastSaved, error, t]);

  if (!content) return null;

  return <div className="auto-save-indicator">{content}</div>;
}

export default AutoSaveIndicator;
