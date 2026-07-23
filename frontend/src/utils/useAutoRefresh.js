/**
 * @file useAutoRefresh.js
 * @description Event-driven auto-refresh hook (WhatsApp/Facebook style).
 * NO polling — refreshes ONLY when an event bus event fires
 * (same tab or cross-tab via localStorage).
 *
 * Does NOT refresh on tab switch / visibility change to prevent
 * losing unsaved form data when the user switches tabs.
 *
 * Polling is handled by a SINGLE global poll in DashboardLayout
 * that only checks unread-count, not by individual pages.
 */

import { useEffect, useRef, useCallback } from 'react';
import { subscribe } from './eventBus';

/**
 * Auto-refresh hook — event-driven only (no polling, no visibility refresh).
 *
 * @param {Function} refreshFn - The function to call to refetch data
 * @param {Object} options - Configuration options
 * @param {string[]} options.events - Event bus events to listen for
 */
export function useAutoRefresh(refreshFn, options = {}) {
  const {
    events = [],
  } = options;

  const refreshRef = useRef(refreshFn);
  refreshRef.current = refreshFn;

  const lastRefreshRef = useRef(0);

  const safeRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshRef.current < 2000) return;
    lastRefreshRef.current = now;
    try { refreshRef.current(); } catch (_) { /* ignore */ }
  }, []);

  // Event bus subscriptions (same tab + cross-tab via localStorage)
  useEffect(() => {
    if (!events.length) return;
    const unsubs = events.map((event) => subscribe(event, safeRefresh));
    return () => unsubs.forEach((fn) => fn());
  }, [events, safeRefresh]);
}
