import { useState, useEffect, useCallback } from "react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";

export function useUnifiedSummary() {
  const [summary, setSummary] = useState({ today: [], upcoming: [] });
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      const token = authToken();
      if (!token) return;

      const localDate = new Date().toLocaleDateString("sv-SE"); // sv-SE outputs YYYY-MM-DD in local time
      const res = await fetch(`${API_URL}/unified-summary?local_date=${localDate}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      if (res.ok) {
        const data = await res.json();
        setSummary({
          today: data.today || [],
          upcoming: data.upcoming || [],
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

    const handleSync = () => {
      fetchSummary();
    };

    window.addEventListener("calendar-sync", handleSync);
    return () => {
      window.removeEventListener("calendar-sync", handleSync);
    };
  }, [fetchSummary]);

  return { ...summary, loading, refetch: fetchSummary };
}
