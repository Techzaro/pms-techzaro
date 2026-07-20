/**
 * @file useAutoRefresh.js
 * @description Event-driven auto-refresh hook (WhatsApp/Facebook style).
 * NO polling — refreshes only when:
 * 1. An event bus event fires (same tab or cross-tab)
 * 2. User switches back to the tab (visibility change)
 *
 * Polling is handled by a SINGLE global poll in DashboardLayout
 * that only checks unread-count, not by individual pages.
 */

import { useEffect, useRef, useCallback } from 'react';
import { subscribe } from './eventBus';

/**
 * Auto-refresh hook — event-driven only (no polling).
 *
 * @param {Function} refreshFn - The function to call to refetch data
 * @param {Object} options - Configuration options
 * @param {string[]} options.events - Event bus events to listen for
 * @param {boolean} options.enableVisibility - Refetch on tab focus. Default: true
 */
export function useAutoRefresh(refreshFn, options = {}) {
  const {
    events = [],
    enableVisibility = true,
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

  // 1. Event bus subscriptions (same tab + cross-tab via localStorage)
  useEffect(() => {
    if (!events.length) return;
    const unsubs = events.map((event) => subscribe(event, safeRefresh));
    return () => unsubs.forEach((fn) => fn());
  }, [events, safeRefresh]);

  // 2. Visibility API: refetch when user returns to the tab
  useEffect(() => {
    if (!enableVisibility) return;
    const handler = () => {
      if (!document.hidden) safeRefresh();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [enableVisibility, safeRefresh]);
}
