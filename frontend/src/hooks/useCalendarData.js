/**
 * @file useCalendarData.js
 * @description Calendar data management hook with month navigation and event caching.
 * Fetches calendar events from the API, supports caching for 5 minutes,
 * and provides utilities for navigating months and filtering events by date.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";

/** Cache duration in milliseconds (5 minutes) */
const CACHE_DURATION = 5 * 60 * 1000;

/** @type {Object|null} Cached calendar data */
let calendarCache = null;
/** @type {number|null} Timestamp when cache was last updated */
let cacheTimestamp = null;
/** @type {Promise|null} Current fetch promise to prevent duplicate requests */
let fetchPromise = null;

/**
 * Hook providing calendar data management with caching and month navigation.
 * @returns {Object} Calendar state and utility functions
 */
export function useCalendarData() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  /**
   * Fetches calendar events for a specific month with caching.
   * Deduplicates concurrent requests for the same month.
   * @param {number} year - Year to fetch (e.g., 2024)
   * @param {number} month - Month index (0-11)
   * @returns {Promise<Array>} Array of calendar events
   */
  const fetchEventsForMonth = useCallback(async (year, month) => {
    const cacheKey = `${year}-${month}`;
    const now = Date.now();

    // Return cached data if still valid
    if (calendarCache && cacheTimestamp && calendarCache.key === cacheKey && now - cacheTimestamp < CACHE_DURATION) {
      return calendarCache.data;
    }

    // Return existing promise if fetch is in progress
    if (fetchPromise) {
      return fetchPromise;
    }

    // Calculate date range for the month
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    const pad = (n) => String(n).padStart(2, "0");
    const from = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
    const to = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;

    fetchPromise = (async () => {
      try {
        const token = authToken();
        if (!token) throw new Error("No auth token");

        const params = new URLSearchParams();
        params.append("from", from);
        params.append("to", to);
        params.append("all", "1");

        const res = await fetch(`${API_URL}/unified-calendar?${params.toString()}`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          skipLoader: true,
        });

        if (!res.ok) throw new Error("Failed to fetch calendar data");

        const data = await res.json();
        const eventsData = data?.data || [];

        // Update cache
        calendarCache = { key: cacheKey, data: eventsData };
        cacheTimestamp = Date.now();

        return eventsData;
      } catch (err) {
        console.error("Failed to fetch calendar events:", err);
        throw err;
      } finally {
        fetchPromise = null;
      }
    })();

    return fetchPromise;
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadEvents = async () => {
      setLoading(true);
      try {
        const data = await fetchEventsForMonth(currentMonth.year, currentMonth.month);
        if (mounted) {
          setEvents(data);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    loadEvents();

    return () => { mounted = false; };
  }, [currentMonth, fetchEventsForMonth]);

  /**
   * Navigates to the previous or next month.
   * @param {number} direction - -1 for previous month, 1 for next month
   */
  const navigateMonth = useCallback((direction) => {
    setCurrentMonth((prev) => {
      const newMonth = prev.month + direction;
      if (newMonth < 0) return { year: prev.year - 1, month: 11 };
      if (newMonth > 11) return { year: prev.year + 1, month: 0 };
      return { year: prev.year, month: newMonth };
    });
  }, []);

  /** Navigates to the current month (today) */
  const goToToday = useCallback(() => {
    const d = new Date();
    setCurrentMonth({ year: d.getFullYear(), month: d.getMonth() });
  }, []);

  /**
   * Filters events that occur on a specific date.
   * @param {Date} date - Date to filter events for
   * @returns {Array} Events that occur on the given date
   */
  const getEventsForDate = useCallback((date) => {
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return events.filter((ev) => {
      const start = ev.start_date?.split("T")[0];
      const end = ev.end_date?.split("T")[0] || start;
      return dateStr >= start && dateStr <= end;
    });
  }, [events]);

  /**
   * Returns unique event types for a specific date (for calendar indicators).
   * @param {Date} date - Date to check
   * @returns {Array} Unique event type strings
   */
  const getEventIndicatorsForDate = useCallback((date) => {
    const dayEvents = getEventsForDate(date);
    const types = new Set();
    dayEvents.forEach((ev) => types.add(ev.type));
    return Array.from(types);
  }, [getEventsForDate]);

  /** Clears the calendar event cache */
  const clearCache = useCallback(() => {
    calendarCache = null;
    cacheTimestamp = null;
  }, []);

  /** Forces a refetch of current month's events, clearing cache first */
  const refetch = useCallback(() => {
    clearCache();
    return fetchEventsForMonth(currentMonth.year, currentMonth.month);
  }, [clearCache, fetchEventsForMonth, currentMonth]);

  /** Display name for the current month (e.g., "June 2024") */
  const monthName = useMemo(() => {
    return new Date(currentMonth.year, currentMonth.month).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [currentMonth]);

  /** Array of Date objects (and nulls for padding) representing calendar grid cells */
  const calendarDays = useMemo(() => {
    const start = new Date(currentMonth.year, currentMonth.month, 1);
    const startDay = start.getDay();
    const totalDays = new Date(currentMonth.year, currentMonth.month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= totalDays; d++) {
      cells.push(new Date(currentMonth.year, currentMonth.month, d));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [currentMonth]);

  /**
   * Checks if a date is today.
   * @param {Date} date - Date to check
   * @returns {boolean} True if the date is today
   */
  const isToday = useCallback((date) => {
    const today = new Date();
    return date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate();
  }, []);

  return {
    events,
    loading,
    error,
    currentMonth,
    monthName,
    calendarDays,
    navigateMonth,
    goToToday,
    getEventsForDate,
    getEventIndicatorsForDate,
    isToday,
    refetch,
    clearCache,
    setCurrentMonth,
  };
}

/**
 * Dispatches a custom event to trigger calendar synchronization.
 * Used to notify other components when calendar data needs refreshing.
 */
export function triggerCalendarSync() {
  window.dispatchEvent(new CustomEvent("calendar-sync"));
}