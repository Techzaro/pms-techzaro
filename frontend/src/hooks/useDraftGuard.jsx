import { useTranslation } from "react-i18next";
/**
 * useDraftGuard.jsx
 * Enhanced version of useConfirmOnClose that adds "Save as Draft" option
 * for modules that support the draft system.
/**
 * useDraftGuard.jsx
 * Enhanced version of useConfirmOnClose that adds "Save as Draft" option
 * for modules that support the draft system.
 */

import { useState, useCallback } from "react";
import DraftGuardDialog from "../components/DraftGuardDialog";
import ConfirmModal from "../components/ConfirmModal";

export default function useDraftGuard(
  onClose,
  { draftSaveHandler, hasDraftFeature = true } = {}
) {
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

  const handleSaveDraft = useCallback(async () => {
    if (draftSaveHandler) {
      await draftSaveHandler();
    }
    setShowConfirm(false);
    setIsDirty(false);
    onClose();
  }, [draftSaveHandler, onClose]);

  const handleDiscard = useCallback(() => {
    setShowConfirm(false);
    setIsDirty(false);
    onClose();
  }, [onClose]);

  const ConfirmDialog = hasDraftFeature ? (
    <DraftGuardDialog
      isOpen={showConfirm}
      onClose={() => setShowConfirm(false)}
      onSaveDraft={handleSaveDraft}
      onDiscard={handleDiscard}
    />
  ) : (
    <ConfirmModal
      isOpen={showConfirm}
      onClose={() => setShowConfirm(false)}
      onConfirm={handleDiscard}
      title={t("Unsaved Changes", { defaultValue: "Unsaved Changes" })}
      message={t("You have unsaved changes. Are you sure you want to close? All changes will be lost.", { defaultValue: "You have unsaved changes. Are you sure you want to close? All changes will be lost." })}
      confirmText={t("Yes, Discard", { defaultValue: "Yes, Discard" })}
      cancelText={t("Keep Editing", { defaultValue: "Keep Editing" })}
      danger
    />
  );

  return { isDirty, setIsDirty, handleClose, ConfirmDialog };
}
