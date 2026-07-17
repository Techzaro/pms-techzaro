/**
 * @file useAutoRefresh.js
 * @description Hook for automatic data refresh like WhatsApp/Facebook.
 * Combines: Visibility API (refetch on tab focus) + light polling + event bus.
 */

import { useEffect, useRef, useCallback } from 'react';
import { subscribe } from './eventBus';

/**
 * Auto-refresh hook that keeps data up to date without manual refresh.
 *
 * @param {Function} refreshFn - The function to call to refetch data
 * @param {Object} options - Configuration options
 * @param {string[]} options.events - Event bus events to listen for
 * @param {number} options.pollInterval - Polling interval in ms (0 = disabled). Default: 30000 (30s)
 * @param {boolean} options.enableVisibility - Refetch on tab focus. Default: true
 */
export function useAutoRefresh(refreshFn, options = {}) {
  const {
    events = [],
    pollInterval = 30000,
    enableVisibility = true,
  } = options;

  const refreshRef = useRef(refreshFn);
  refreshRef.current = refreshFn;

  const lastRefreshRef = useRef(0);

  const safeRefresh = useCallback(() => {
    const now = Date.now();
    // Debounce: don't refresh more than once per 3 seconds
    if (now - lastRefreshRef.current < 3000) return;
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

  // 3. Light polling: refetch at interval (only when tab is visible)
  useEffect(() => {
    if (!pollInterval || pollInterval <= 0) return;
    const id = setInterval(() => {
      if (!document.hidden) safeRefresh();
    }, pollInterval);
    return () => clearInterval(id);
  }, [pollInterval, safeRefresh]);
}
