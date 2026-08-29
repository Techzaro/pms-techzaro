/**
 * @file timezoneUtils.js
 * @description Central Timezone, Working Hours & Regional Formatting Engine (SRS Section 9).
 * Powered by dayjs with utc, timezone, and customParseFormat plugins.
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import customParseFormat from "dayjs/plugin/customParseFormat";
import relativeTime from "dayjs/plugin/relativeTime";

// Extend dayjs with necessary plugins
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(relativeTime);

/**
 * Days of the week in standard order.
 */
export const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/**
 * Default standard 7-day working hours schedule (Mon-Fri 09:00-17:00, Sat-Sun Off).
 */
export const DEFAULT_WORKING_HOURS = [
  { day: "Monday", is_working: true, start_time: "09:00", end_time: "17:00", intervals: [{ start: "09:00", end: "17:00" }] },
  { day: "Tuesday", is_working: true, start_time: "09:00", end_time: "17:00", intervals: [{ start: "09:00", end: "17:00" }] },
  { day: "Wednesday", is_working: true, start_time: "09:00", end_time: "17:00", intervals: [{ start: "09:00", end: "17:00" }] },
  { day: "Thursday", is_working: true, start_time: "09:00", end_time: "17:00", intervals: [{ start: "09:00", end: "17:00" }] },
  { day: "Friday", is_working: true, start_time: "09:00", end_time: "17:00", intervals: [{ start: "09:00", end: "17:00" }] },
  { day: "Saturday", is_working: false, start_time: "09:00", end_time: "17:00", intervals: [{ start: "09:00", end: "17:00" }] },
  { day: "Sunday", is_working: false, start_time: "09:00", end_time: "17:00", intervals: [{ start: "09:00", end: "17:00" }] },
];

/**
 * Supported Date Formats (SRS Section 23)
 */
export const SUPPORTED_DATE_FORMATS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (e.g., 25/08/2026)", dayjsPattern: "DD/MM/YYYY" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (e.g., 08/25/2026)", dayjsPattern: "MM/DD/YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (e.g., 2026-08-25)", dayjsPattern: "YYYY-MM-DD" },
];

/**
 * Supported Time Formats (SRS Section 23)
 */
export const SUPPORTED_TIME_FORMATS = [
  { value: "12-hour", label: "12-hour (e.g., 03:30 PM)", dayjsPattern: "hh:mm A" },
  { value: "24-hour", label: "24-hour (e.g., 15:30)", dayjsPattern: "HH:mm" },
];

/**
 * Supported Languages
 */
export const SUPPORTED_LANGUAGES = [
  { value: "English", label: "English (US/UK)" },
  { value: "Spanish", label: "Español (Spanish)" },
  { value: "French", label: "Français (French)" },
  { value: "German", label: "Deutsch (German)" },
  { value: "Arabic", label: "العربية (Arabic)" },
  { value: "Urdu", label: "اردو (Urdu)" },
  { value: "Hindi", label: "हिन्दी (Hindi)" },
  { value: "Chinese", label: "中文 (Chinese)" },
  { value: "Japanese", label: "日本語 (Japanese)" },
];

/**
 * Safely detects the user's browser device timezone (SRS Section 4).
 * @returns {string} IANA Timezone string (e.g., 'America/New_York', 'Asia/Karachi', 'UTC')
 */
export function detectDeviceTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && typeof tz === "string" && tz.length > 0) {
      return tz;
    }
  } catch (err) {
    console.warn("Failed to detect browser timezone, falling back to UTC", err);
  }
  return "UTC";
}

/**
 * Retrieves the authenticated user's saved timezone from auth storage.
 * Falls back to device timezone, then 'UTC'.
 * @returns {string}
 */
export function getUserTimezone() {
  try {
    const user = getUser();
    if (user?.timezone) return user.timezone;
  } catch {}
  return detectDeviceTimezone();
}

/**
 * Retrieves the authenticated user's preferred date format.
 * @returns {string} 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
 */
export function getUserDateFormat() {
  try {
    const user = getUser();
    if (user?.date_format) return user.date_format;
  } catch {}
  return "DD/MM/YYYY";
}

/**
 * Retrieves the authenticated user's preferred time format.
 * @returns {string} '12-hour' | '24-hour'
 */
export function getUserTimeFormat() {
  try {
    const user = getUser();
    if (user?.time_format) {
      if (user.time_format === "24h" || user.time_format === "24-hour") return "24-hour";
      return "12-hour";
    }
  } catch {}
  return "12-hour";
}

/**
 * Converts a Date / UTC string to dayjs pattern matching user's date preference.
 * @param {string} [dateFormat]
 * @returns {string}
 */
export function getDayjsDatePattern(dateFormat) {
  const format = dateFormat || getUserDateFormat();
  switch (format) {
    case "MM/DD/YYYY":
      return "MM/DD/YYYY";
    case "YYYY-MM-DD":
      return "YYYY-MM-DD";
    case "DD/MM/YYYY":
    default:
      return "DD/MM/YYYY";
  }
}

/**
 * Converts time format preference to dayjs time pattern.
 * @param {string} [timeFormat]
 * @returns {string}
 */
export function getDayjsTimePattern(timeFormat) {
  const format = timeFormat || getUserTimeFormat();
  return format === "24-hour" || format === "24h" ? "HH:mm" : "hh:mm A";
}

/**
 * Converts UTC timestamp to the given IANA timezone and formats it (SRS Section 9).
 *
 * @param {string|Date} utcString - UTC datetime input (ISO string, MySQL timestamp, or Date)
 * @param {string} [userTimezone] - Target IANA timezone (defaults to user's saved timezone)
 * @param {string} [customFormat] - Optional explicit dayjs format pattern
 * @returns {string} Formatted localized date/time string or '—' on error/null
 */
export function convertToLocal(utcString, userTimezone = null, customFormat = null) {
  if (!utcString) return "—";

  try {
    const tz = userTimezone || getUserTimezone();
    const d = dayjs.utc(utcString);
    if (!d.isValid()) return String(utcString);

    const localized = d.tz(tz);
    if (!localized.isValid()) return String(utcString);

    if (customFormat) {
      return localized.format(customFormat);
    }

    const datePattern = getDayjsDatePattern();
    const timePattern = getDayjsTimePattern();
    return localized.format(`${datePattern} ${timePattern}`);
  } catch (err) {
    console.error("Error converting UTC to local time:", err);
    return String(utcString);
  }
}

/**
 * Converts a local datetime input back to UTC ISO string for API payloads (SRS Section 9).
 *
 * @param {string|Date} localString - Local datetime string or Date object
 * @param {string} [userTimezone] - Origin IANA timezone (defaults to user's saved timezone)
 * @param {string} [inputFormat] - Optional input parsing format
 * @returns {string|null} ISO 8601 UTC string (e.g., '2026-08-25T14:30:00.000Z') or null
 */
export function convertToUTC(localString, userTimezone = null, inputFormat = null) {
  if (!localString) return null;

  try {
    const tz = userTimezone || getUserTimezone();
    let d;

    if (inputFormat) {
      d = dayjs.tz(localString, inputFormat, tz);
    } else if (typeof localString === "string" && localString.includes("T")) {
      d = dayjs.tz(localString, tz);
    } else {
      d = dayjs(localString).tz(tz, true);
    }

    if (!d.isValid()) return null;

    return d.utc().toISOString();
  } catch (err) {
    console.error("Error converting local time to UTC:", err);
    return null;
  }
}

/**
 * Formats only the date part of a UTC timestamp according to user timezone and preference.
 *
 * @param {string|Date} dateStr
 * @param {string} [userTimezone]
 * @param {string} [dateFormat]
 * @returns {string}
 */
export function formatLocalDate(dateStr, userTimezone = null, dateFormat = null) {
  if (!dateStr) return "—";
  try {
    const tz = userTimezone || getUserTimezone();
    const d = dayjs.utc(dateStr);
    if (!d.isValid()) return String(dateStr);

    const localized = d.tz(tz);
    const pattern = getDayjsDatePattern(dateFormat);
    return localized.format(pattern);
  } catch {
    return String(dateStr);
  }
}

/**
 * Formats only the time part of a UTC timestamp according to user timezone and preference.
 *
 * @param {string|Date} dateStr
 * @param {string} [userTimezone]
 * @param {string} [timeFormat]
 * @returns {string}
 */
export function formatLocalTime(dateStr, userTimezone = null, timeFormat = null) {
  if (!dateStr) return "—";
  try {
    const tz = userTimezone || getUserTimezone();
    const d = dayjs.utc(dateStr);
    if (!d.isValid()) return String(dateStr);

    const localized = d.tz(tz);
    const pattern = getDayjsTimePattern(timeFormat);
    return localized.format(pattern);
  } catch {
    return String(dateStr);
  }
}

/**
 * Formats a date with nice human readable short format (e.g., '25 Aug 2026, 03:30 PM').
 *
 * @param {string|Date} dateStr
 * @param {string} [userTimezone]
 * @returns {string}
 */
export function formatReadableDateTime(dateStr, userTimezone = null, dateFormat = null, timeFormat = null) {
  if (!dateStr) return "—";
  try {
    const tz = userTimezone || getUserTimezone();
    const d = dayjs.utc(dateStr);
    if (!d.isValid()) return String(dateStr);

    const datePattern = getDayjsDatePattern(dateFormat);
    const timePattern = getDayjsTimePattern(timeFormat);
    return d.tz(tz).format(`${datePattern}, ${timePattern}`);
  } catch {
    return String(dateStr);
  }
}

/**
 * Formats a date to relative time ago (e.g. '5 minutes ago', 'Yesterday', '3 days ago').
 *
 * @param {string|Date} dateStr
 * @returns {string}
 */
export function formatRelativeTime(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = dayjs.utc(dateStr);
    if (!d.isValid()) return "—";
    return d.fromNow();
  } catch {
    return "—";
  }
}

/**
 * Formats a date for HTML input type="datetime-local" (YYYY-MM-DDTHH:mm).
 *
 * @param {string|Date} dateStr
 * @param {string} [userTimezone]
 * @returns {string}
 */
export function toLocalDatetimeInput(dateStr, userTimezone = null) {
  if (!dateStr) return "";
  try {
    const tz = userTimezone || getUserTimezone();
    const d = dayjs.utc(dateStr);
    if (!d.isValid()) return "";
    return d.tz(tz).format("YYYY-MM-DDTHH:mm");
  } catch {
    return "";
  }
}

/**
 * Formats a date for HTML input type="date" (YYYY-MM-DD).
 *
 * @param {string|Date} dateStr
 * @param {string} [userTimezone]
 * @returns {string}
 */
export function toLocalDateInput(dateStr, userTimezone = null) {
  if (!dateStr) return "";
  try {
    const tz = userTimezone || getUserTimezone();
    const d = dayjs.utc(dateStr);
    if (!d.isValid()) return "";
    return d.tz(tz).format("YYYY-MM-DD");
  } catch {
    return "";
  }
}

/**
 * Normalizes and validates a working hours schedule array.
 * Ensures all 7 days are present with valid keys.
 *
 * @param {Array} schedule
 * @returns {Array}
 */
export function normalizeWorkingHoursSchedule(schedule) {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return JSON.parse(JSON.stringify(DEFAULT_WORKING_HOURS));
  }

  return DAYS_OF_WEEK.map((day) => {
    const existing = schedule.find((s) => s?.day?.toLowerCase() === day.toLowerCase());
    if (existing) {
      let intervals = [];
      if (Array.isArray(existing.intervals) && existing.intervals.length > 0) {
        intervals = existing.intervals.map((iv) => ({
          start: iv.start || iv.start_time || "09:00",
          end: iv.end || iv.end_time || "17:00",
        }));
      } else if (Array.isArray(existing.shifts) && existing.shifts.length > 0) {
        intervals = existing.shifts.map((iv) => ({
          start: iv.start || iv.start_time || "09:00",
          end: iv.end || iv.end_time || "17:00",
        }));
      } else {
        intervals = [{
          start: existing.start_time || existing.start || "09:00",
          end: existing.end_time || existing.end || "17:00",
        }];
      }

      const is_working = Boolean(existing.is_working ?? (day !== "Saturday" && day !== "Sunday"));
      return {
        day,
        is_working,
        start_time: intervals[0]?.start || "09:00",
        end_time: intervals[intervals.length - 1]?.end || "17:00",
        intervals,
      };
    }

    const isWeekend = day === "Saturday" || day === "Sunday";
    return {
      day,
      is_working: !isWeekend,
      start_time: "09:00",
      end_time: "17:00",
      intervals: [{ start: "09:00", end: "17:00" }],
    };
  });
}

/**
 * Get current timezone offset string (e.g. 'UTC+05:00' or 'UTC-04:00').
 *
 * @param {string} tzName
 * @returns {string}
 */
export function getTimezoneOffsetDisplay(tzName) {
  try {
    const offset = dayjs().tz(tzName).format("Z");
    return `(UTC${offset})`;
  } catch {
    return "";
  }
}

/**
 * Checks if a proposed event/meeting interval falls within a user's working hours schedule (SRS Sec 11, 15, 16).
 *
 * @param {string} startDateTimeUtc - ISO or UTC date-time string
 * @param {string} endDateTimeUtc - ISO or UTC date-time string (optional)
 * @param {Array} userWorkingHours - User's 7-day schedule array
 * @param {string} userTimezone - User's IANA timezone (defaults to UTC)
 * @returns {Object} { isCompliant: boolean, reason?: string, localDay: string, localStartTime: string, localEndTime: string, localTimeFormatted: string, scheduleText: string }
 */
export function checkWorkingHoursCompliance(
  startDateTimeUtc,
  endDateTimeUtc,
  userWorkingHours,
  userTimezone = "UTC"
) {
  try {
    if (!startDateTimeUtc) return { isCompliant: true };
    const tz = userTimezone || "UTC";
    const startObj = dayjs.utc(startDateTimeUtc).tz(tz);
    if (!startObj.isValid()) return { isCompliant: true };

    const endObj = endDateTimeUtc
      ? dayjs.utc(endDateTimeUtc).tz(tz)
      : startObj.add(1, "hour");

    const localDay = startObj.format("dddd"); // "Monday", "Tuesday", etc.
    const localStartTime = startObj.format("HH:mm");
    const localEndTime = endObj.format("HH:mm");
    const localTimeFormatted = startObj.format(getDayjsTimePattern());

    const schedule = normalizeWorkingHoursSchedule(userWorkingHours);
    const dayItem = schedule.find((s) => s.day?.toLowerCase() === localDay.toLowerCase());

    if (!dayItem || !dayItem.is_working) {
      return {
        isCompliant: false,
        reason: "day_off",
        localDay,
        localStartTime,
        localEndTime,
        localTimeFormatted,
        scheduleText: "Day Off",
      };
    }

    const intervals = (dayItem.intervals && dayItem.intervals.length > 0)
      ? dayItem.intervals
      : [{ start: dayItem.start_time || "09:00", end: dayItem.end_time || "17:00" }];

    // Check if the event interval [localStartTime, localEndTime] fits inside any working interval
    const fitsInShift = intervals.some((iv) => {
      const s = iv.start || "09:00";
      const e = iv.end || "17:00";
      return localStartTime >= s && localEndTime <= e;
    });

    const scheduleText = intervals.map((iv) => `${iv.start} - ${iv.end}`).join(", ");

    if (!fitsInShift) {
      return {
        isCompliant: false,
        reason: "outside_hours",
        localDay,
        localStartTime,
        localEndTime,
        localTimeFormatted,
        scheduleText: scheduleText || "09:00 - 17:00",
      };
    }

    return {
      isCompliant: true,
      localDay,
      localStartTime,
      localEndTime,
      localTimeFormatted,
      scheduleText: scheduleText || "09:00 - 17:00",
    };
  } catch (err) {
    console.error("checkWorkingHoursCompliance error:", err);
    return { isCompliant: true };
  }
}

/**
 * Formats a concise summary of a user's working hours schedule (SRS Sec 13 & 14).
 *
 * @param {Array} schedule - User's 7-day working hours schedule
 * @param {string} timezone - User's IANA timezone
 * @returns {string} e.g. "Today: 09:00 - 17:00 • Mon–Fri"
 */
export function formatWorkingHoursSummary(schedule, timezone = "UTC") {
  try {
    const normalized = normalizeWorkingHoursSchedule(schedule);
    const tz = timezone || "UTC";
    const todayName = dayjs().tz(tz).format("dddd");
    const todayItem = normalized.find((d) => d.day?.toLowerCase() === todayName.toLowerCase());

    const todayStr = (!todayItem || !todayItem.is_working)
      ? "Today: Day Off"
      : `Today: ${todayItem.intervals.map((iv) => `${iv.start}-${iv.end}`).join(", ")}`;

    const workingDays = normalized.filter((d) => d.is_working).map((d) => d.day.substring(0, 3));
    let daysPattern = "Mon–Fri";
    if (workingDays.length === 5 && !workingDays.includes("Sat") && !workingDays.includes("Sun")) {
      daysPattern = "Mon–Fri";
    } else if (workingDays.length === 7) {
      daysPattern = "All Week";
    } else if (workingDays.length > 0) {
      daysPattern = workingDays.join(", ");
    } else {
      daysPattern = "None";
    }

    return `${todayStr} (${daysPattern})`;
  } catch {
    return "09:00 - 17:00 (Mon–Fri)";
  }
}


