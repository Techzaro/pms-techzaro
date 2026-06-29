/**
 * @file useRelativeTime.js
 * @description Hook that provides a shared timer for updating relative timestamps.
 * All components using this hook share the same 30-second interval.
 */

import { useState, useEffect } from "react";
import { timeAgo } from "../utils/formatDateTime";

/**
 * Returns a tick counter that updates every 30 seconds.
 * Use with timeAgo() to auto-update relative timestamps.
 *
 * @example
 * const tick = useRelativeTime();
 * <span>{timeAgo(item.created_at)}</span> // updates every 30s
 *
 * @returns {number} Current tick count
 */
export function useRelativeTime() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  return tick;
}
