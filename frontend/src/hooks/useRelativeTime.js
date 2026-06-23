import { useState, useEffect } from "react";
import { timeAgo } from "../utils/formatDateTime";

/**
 * Single 30-second tick timer shared by all components on the page.
 * Returns the current tick count — pass to timeAgo() to force re-render.
 *
 * Usage:
 *   const tick = useRelativeTime();
 *   <span>{timeAgo(item.created_at)}</span>   // will auto-update every 30s
 */
export function useRelativeTime() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  return tick;
}
