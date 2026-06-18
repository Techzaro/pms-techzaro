import { useState, useEffect, useCallback, useMemo } from "react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";

const CACHE_DURATION = 5 * 60 * 1000;

let calendarCache = null;
let cacheTimestamp = null;
let fetchPromise = null;

export function useCalendarData() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const fetchEventsForMonth = useCallback(async (year, month) => {
    const cacheKey = `${year}-${month}`;
    const now = Date.now();

    if (calendarCache && cacheTimestamp && calendarCache.key === cacheKey && now - cacheTimestamp < CACHE_DURATION) {
      return calendarCache.data;
    }

    if (fetchPromise) {
      return fetchPromise;
    }

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
      setLoading();
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

  const navigateMonth = useCallback((direction) => {
    setCurrentMonth((prev) => {
      const newMonth = prev.month + direction;
      if (newMonth < 0) return { year: prev.year - 1, month: 11 };
      if (newMonth > 11) return { year: prev.year + 1, month: 0 };
      return { year: prev.year, month: newMonth };
    });
  }, []);

  const goToToday = useCallback(() => {
    const d = new Date();
    setCurrentMonth({ year: d.getFullYear(), month: d.getMonth() });
  }, []);

  const getEventsForDate = useCallback((date) => {
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return events.filter((ev) => {
      const start = ev.start_date?.split("T")[0];
      const end = ev.end_date?.split("T")[0] || start;
      return dateStr >= start && dateStr <= end;
    });
  }, [events]);

  const getEventIndicatorsForDate = useCallback((date) => {
    const dayEvents = getEventsForDate(date);
    const types = new Set();
    dayEvents.forEach((ev) => types.add(ev.type));
    return Array.from(types);
  }, [getEventsForDate]);

  const clearCache = useCallback(() => {
    calendarCache = null;
    cacheTimestamp = null;
  }, []);

  const refetch = useCallback(() => {
    clearCache();
    return fetchEventsForMonth(currentMonth.year, currentMonth.month);
  }, [clearCache, fetchEventsForMonth, currentMonth]);

  const monthName = useMemo(() => {
    return new Date(currentMonth.year, currentMonth.month).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [currentMonth]);

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

export function triggerCalendarSync() {
  window.dispatchEvent(new CustomEvent("calendar-sync"));
}