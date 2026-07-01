import { useEffect } from "react";

/**
 * Calls onClose when the Escape key is pressed.
 * @param {boolean} isOpen - Whether the modal/popup is open
 * @param {Function} onClose - Callback to close the modal
 */
export function useEscapeKey(isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);
}
