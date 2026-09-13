/**
 * filterUtils.js
 * Utilities for task and deliverable filter calculations.
 */

/**
 * Calculates the cutoff Date threshold object for the "Updated Since" filter.
 * Returns null if no filter is active.
 *
 * @param {string} preset - Preset key: "15m", "1h", "24h", "7d", "1mo", "custom"
 * @param {number|string} customVal - Numeric value when preset === "custom"
 * @param {string} customUnit - Unit: "minutes", "hours", "days", "months"
 * @returns {Date|null}
 */
export function getUpdatedSinceThreshold(preset, customVal, customUnit) {
  if (!preset || preset === "all" || preset === "") return null;
  const now = new Date();
  const p = String(preset).toLowerCase().trim();

  if (p === "15m" || p === "15_mins" || p === "15mins") {
    return new Date(now.getTime() - 15 * 60 * 1000);
  }
  if (p === "1h" || p === "1_hour" || p === "1hour") {
    return new Date(now.getTime() - 60 * 60 * 1000);
  }
  if (p === "24h" || p === "24_hours" || p === "24hours" || p === "1d") {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
  if (p === "7d" || p === "7_days" || p === "7days") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  if (p === "1mo" || p === "1m" || p === "1_month" || p === "30d") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return d;
  }
  if (p === "custom" && customVal && Number(customVal) > 0) {
    const val = Number(customVal);
    const unit = String(customUnit || "hours").toLowerCase().trim();
    if (unit.startsWith("min")) {
      return new Date(now.getTime() - val * 60 * 1000);
    }
    if (unit.startsWith("hour")) {
      return new Date(now.getTime() - val * 60 * 60 * 1000);
    }
    if (unit.startsWith("day")) {
      return new Date(now.getTime() - val * 24 * 60 * 60 * 1000);
    }
    if (unit.startsWith("month")) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - val);
      return d;
    }
  }
  return null;
}

/**
 * Formats an ISO string, date string, or timestamp to "YYYY-MM-DDTHH:mm" format for <input type="datetime-local">.
 *
 * @param {string|Date} val
 * @returns {string}
 */
export function formatForDatetimeLocal(val) {
  if (!val) return "";
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(val.getDate())}T${pad(val.getHours())}:${pad(val.getMinutes())}`;
  }
  const str = String(val).trim();
  if (!str) return "";
  if (str.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return `${str}T00:00`;
  }
  if (str.includes("T")) {
    return str.substring(0, 16);
  }
  if (str.includes(" ")) {
    return str.replace(" ", "T").substring(0, 16);
  }
  return str;
}
