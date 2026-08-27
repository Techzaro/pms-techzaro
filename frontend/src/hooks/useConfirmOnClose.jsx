import { useTranslation } from "react-i18next";
import { useState, useCallback, useEffect } from "react";
import ConfirmModal from "../components/ConfirmModal";

/**
 * Reusable hook that adds "are you sure?" confirmation when closing a modal
 * that has unsaved changes.
 *
 * Usage:
 *   const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
 *
 *   // Track changes
 *   useEffect(() => { setIsDirty(true); }, [someField]);
 *
import { useState, useCallback, useEffect } from "react";
import ConfirmModal from "../components/ConfirmModal";

/**
 * Reusable hook that adds "are you sure?" confirmation when closing a modal
 * that has unsaved changes.
 *
 * Usage:
 *   const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
 *
 *   // Track changes
 *   useEffect(() => { setIsDirty(true); }, [someField]);
 *
 *   // Use handleClose instead of onClose
 *   <button onClick={handleClose}>Close</button>
 *
 *   // Render ConfirmDialog inside the modal
 *   {ConfirmDialog}
 */
export default function useConfirmOnClose(onClose) {
  const { t } = useTranslation();
  const [isDirty, setIsDirty] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const confirmClose = useCallback(() => {
    setShowConfirm(false);
    setIsDirty(false);
    onClose();
  }, [onClose]);

  const cancelConfirm = useCallback(() => {
    setShowConfirm(false);
  }, []);

  const ConfirmDialog = (
    <ConfirmModal
      isOpen={showConfirm}
      onClose={cancelConfirm}
      onConfirm={confirmClose}
      title={t("Unsaved Changes", { defaultValue: "Unsaved Changes" })}
      message={t("You have unsaved changes. Are you sure you want to close? All changes will be lost.", { defaultValue: "You have unsaved changes. Are you sure you want to close? All changes will be lost." })}
      confirmText={t("Yes, Discard", { defaultValue: "Yes, Discard" })}
      cancelText={t("Keep Editing", { defaultValue: "Keep Editing" })}
      danger
    />
  );

  return { isDirty, setIsDirty, handleClose, ConfirmDialog };
}
