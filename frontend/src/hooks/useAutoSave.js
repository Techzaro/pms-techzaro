/**
 * useAutoSave.js
 * Hook for automatic draft saving with debounce.
 * Creates a draft on first change, updates on subsequent changes.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import draftService from "../services/draftService";

const AUTO_SAVE_DELAY = 20000; // 20 seconds

export default function useAutoSave({
  draftId: initialDraftId,
  formData,
  moduleType,
  enabled = true,
  project_id = null,
  parent_id = null,
  titleField = "title",
}) {
  const [lastSaved, setLastSaved] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState(initialDraftId);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const latestDataRef = useRef(formData);
  const hasChangesRef = useRef(false);

  useEffect(() => {
    latestDataRef.current = formData;
    hasChangesRef.current = true;
  }, [formData]);

  useEffect(() => {
    setCurrentDraftId(initialDraftId);
  }, [initialDraftId]);

  const saveDraft = useCallback(
    async (data, isAuto = false) => {
      if (!data || Object.keys(data).length === 0) return;

      setIsSaving(true);
      setError(null);
      try {
        const payload = {
          draft_data: data,
          title: data[titleField] || "Untitled Draft",
        };

        if (currentDraftId) {
          await draftService.autoSave(currentDraftId, payload);
        } else {
          return;
        }

        setLastSaved(new Date());
        hasChangesRef.current = false;
      } catch (err) {
        setError(err.message || "Auto-save failed");
      } finally {
        setIsSaving(false);
      }
    },
    [currentDraftId, moduleType, project_id, parent_id, titleField]
  );

  useEffect(() => {
    if (!enabled || !hasChangesRef.current) return;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveDraft(latestDataRef.current, true);
    }, AUTO_SAVE_DELAY);

    return () => clearTimeout(timerRef.current);
  }, [formData, enabled, saveDraft]);

  const saveNow = useCallback(async () => {
    clearTimeout(timerRef.current);
    await saveDraft(latestDataRef.current, false);
  }, [saveDraft]);

  const clearTimer = useCallback(() => {
    clearTimeout(timerRef.current);
  }, []);

  return {
    lastSaved,
    isSaving,
    draftId: currentDraftId,
    error,
    saveNow,
    clearTimer,
  };
}
