/**
 * @file useUnifiedSummary.js
 * @description Hook for fetching today's and upcoming events summary.
 * Auto-refreshes on calendar sync events, visibility changes, and date changes.
 * Filters to only show manually created events (not system-generated).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";

/** Minimum interval between fetches (30 seconds) to prevent API spam */
const MIN_INTERVAL = 30000;

/**
 * Hook that provides today's and upcoming events summary.
 * @returns {Object} Summary data with today's and upcoming events, loading state, and refetch function
 */
export function useUnifiedSummary() {
  const [summary, setSummary] = useState({ today: [], upcoming: [] });
  const [loading, setLoading] = useState(true);
  const lastFetchRef = useRef(0);

  /**
   * Fetches the unified summary from the API with rate limiting.
   * Only fetches if minimum interval has passed since last fetch.
   */
  const fetchSummary = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchRef.current < MIN_INTERVAL) return;
    lastFetchRef.current = now;

    try {
      const token = authToken();
      if (!token) return;

      // Use Swedish date format (YYYY-MM-DD) for API
      const localDate = new Date().toLocaleDateString("sv-SE");
      const res = await fetch(`${API_URL}/unified-summary?local_date=${localDate}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      if (res.ok) {
        const data = await res.json();
        // Filter to only manual events (exclude system-generated)
        setSummary({
          today: (data.today || []).filter(ev => ev.source === "manual"),
          upcoming: (data.upcoming || []).filter(ev => ev.source === "manual"),
        });
      }
    } catch (err) {
      console.error("Failed to fetch calendar/dashboard summary:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();

    // Listen for calendar sync events from other components
    const handleSync = () => { fetchSummary(); };
    // Refetch when tab becomes visible again
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchSummary();
    };

    // Check for date changes every minute
    let lastDate = new Date().toDateString();
    const interval = setInterval(() => {
      const currentDate = new Date().toDateString();
      if (currentDate !== lastDate) {
        lastDate = currentDate;
        fetchSummary();
      }
    }, 60000);

    window.addEventListener("calendar-sync", handleSync);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("calendar-sync", handleSync);
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(interval);
    };
  }, [fetchSummary]);

  return { ...summary, loading, refetch: fetchSummary };
}
