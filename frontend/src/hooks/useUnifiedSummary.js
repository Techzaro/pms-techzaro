import { useState, useEffect, useCallback, useRef } from "react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";

export function useUnifiedSummary() {
  const [summary, setSummary] = useState({ today: [], upcoming: [] });
  const [loading, setLoading] = useState(true);
  const lastFetchRef = useRef(0);
  const MIN_INTERVAL = 30000;

  const fetchSummary = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchRef.current < MIN_INTERVAL) return;
    lastFetchRef.current = now;

    try {
      const token = authToken();
      if (!token) return;

      const localDate = new Date().toLocaleDateString("sv-SE");
      const res = await fetch(`${API_URL}/unified-summary?local_date=${localDate}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      if (res.ok) {
        const data = await res.json();
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

    const handleSync = () => { fetchSummary(); };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchSummary();
    };

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
