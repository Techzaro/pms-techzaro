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
      title="Unsaved Changes"
      message="You have unsaved changes. Are you sure you want to close? All changes will be lost."
      confirmText="Yes, Discard"
      cancelText="Keep Editing"
      danger
    />
  );

  return { isDirty, setIsDirty, handleClose, ConfirmDialog };
}
