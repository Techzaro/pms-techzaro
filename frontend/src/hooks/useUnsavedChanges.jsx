import { useState, useCallback, useMemo } from "react";
import ConfirmModal from "../components/ConfirmModal";

/**
 * Normalize a value for comparison.
 * Handles null/undefined/"" equivalence, number/string equivalence,
 * and rich-text empty HTML.
 */
function normalize(value) {
  if (value === undefined || value === null || value === "") return "";

  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return "";
    return trimmed;
  }

  if (typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = normalize(value[key]);
    }
    return sorted;
  }

  return value;
}

/**
 * Deep equality check for normalized values.
 */
function deepEqual(a, b) {
  const na = normalize(a);
  const nb = normalize(b);

  if (na === nb) return true;

  if (Array.isArray(na) && Array.isArray(nb)) {
    if (na.length !== nb.length) return false;
    return na.every((item, i) => deepEqual(item, nb[i]));
  }

  if (typeof na === "object" && na !== null && typeof nb === "object" && nb !== null) {
    const keysA = Object.keys(na);
    const keysB = Object.keys(nb);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => deepEqual(na[key], nb[key]));
  }

  return false;
}

/**
 * useUnsavedChanges - Smart unsaved changes detection hook.
 *
 * Automatically compares initial values against current values.
 * Only marks form as dirty when actual data differs from the baseline.
 *
 * @param {Object} initialValues - The baseline form state (captured on open or after save)
 * @param {Object} currentValues - The current form state (live values)
 * @param {Function} onClose - Callback to close the modal
 * @param {Object} [options] - Optional configuration
 * @param {string} [options.title] - Confirmation dialog title
 * @param {string} [options.message] - Confirmation dialog message
 * @param {string} [options.confirmText] - Confirm button text
 * @param {string} [options.cancelText] - Cancel button text
 * @param {boolean} [options.danger=false] - Use danger color scheme
 *
 * @returns {Object} Hook API
 * @returns {boolean} .isDirty - Whether form has unsaved changes
 * @returns {Function} .handleClose - Close handler (shows confirm if dirty)
 * @returns {Function} .markSaved - Reset baseline after successful save
 * @returns {Function} .resetBaseline - Reset baseline to new values
 * @returns {JSX.Element} .ConfirmDialog - Confirmation dialog component
 */
export default function useUnsavedChanges(
  initialValues,
  currentValues,
  onClose,
  options = {}
) {
  const {
    title = "Unsaved Changes",
    message = "You have unsaved changes. Are you sure you want to close? All changes will be lost.",
    confirmText = "Yes, Discard",
    cancelText = "Keep Editing",
    danger = true,
  } = options;

  const [baseline, setBaseline] = useState(initialValues);
  const [showConfirm, setShowConfirm] = useState(false);

  const isDirty = useMemo(() => {
    return !deepEqual(baseline, currentValues);
  }, [baseline, currentValues]);

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const confirmClose = useCallback(() => {
    setShowConfirm(false);
    onClose();
  }, [onClose]);

  const cancelConfirm = useCallback(() => {
    setShowConfirm(false);
  }, []);

  /**
   * Reset baseline to current values after a successful save.
   */
  const markSaved = useCallback(() => {
    setBaseline(currentValues);
  }, [currentValues]);

  /**
   * Reset baseline to new provided values (e.g., when modal reopens with fresh data).
   */
  const resetBaseline = useCallback((newValues) => {
    setBaseline(newValues);
  }, []);

  const ConfirmDialog = (
    <ConfirmModal
      isOpen={showConfirm}
      onClose={cancelConfirm}
      onConfirm={confirmClose}
      title={title}
      message={message}
      confirmText={confirmText}
      cancelText={cancelText}
      danger={danger}
    />
  );

  return { isDirty, handleClose, markSaved, resetBaseline, ConfirmDialog };
}
