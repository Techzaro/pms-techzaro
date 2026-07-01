/**
 * useSubmit.js — Reusable async submission hook with double-click prevention.
 *
 * Wraps async functions to automatically manage a `submitting` boolean.
 * While a request is in-flight, subsequent calls are silently ignored,
 * preventing duplicate API calls from rapid or repeated button clicks.
 *
 * Usage:
 *   const { submitting, run } = useSubmit();
 *
 *   const handleSubmit = async () => {
 *     await run(async () => {
 *       // your async work here (fetch, etc.)
 *     });
 *   };
 *
 *   <LoadingButton onClick={handleSubmit} loading={submitting}>Save</LoadingButton>
 */
import { useState, useCallback } from "react";

export function useSubmit(initialState = false) {
  const [submitting, setSubmitting] = useState(initialState);

  const run = useCallback(async (asyncFn) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      return await asyncFn();
    } finally {
      setSubmitting(false);
    }
  }, [submitting]);

  return { submitting, run };
}
