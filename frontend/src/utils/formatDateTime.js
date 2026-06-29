/**
 * @file formatDateTime.js
 * @description Date and time formatting utilities for consistent display across the app.
 * Provides various formatters for dates, times, and relative time calculations.
 */

/**
 * Formats a date string to "DD Mon YYYY\nHH:MM AM/PM" format (multiline).
 * @param {string} dateStr - ISO date string to format
 * @returns {string} Formatted date string or "-" if invalid
 */
export function formatDateTime(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date}\n${time}`;
}

/**
 * Formats a date string to "D Mon YYYY HH:MM AM/PM" format (inline).
 * @param {string} dateStr - ISO date string to format
 * @returns {string} Formatted date string or "—" if invalid
 */
export function formatDateTimeInline(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date} ${time}`;
}

/**
 * Formats a date string to short format (alias for formatDateTimeInline).
 * @param {string} dateStr - ISO date string to format
 * @returns {string} Formatted date string or "—" if invalid
 */
export function formatDateTimeShort(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date} ${time}`;
}

/**
 * Converts an ISO date string to HTML datetime-local input format.
 * @param {string} dateStr - ISO date string to convert
 * @returns {string} Format: "YYYY-MM-DDTHH:MM" or empty string if invalid
 */
export function toDatetimeLocal(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Converts a local datetime-local string to ISO format with seconds.
 * @param {string} localDatetimeLocal - datetime-local format string
 * @returns {string|null} Format: "YYYY-MM-DDTHH:MM:00" or null if invalid
 */
export function toUTCIso(localDatetimeLocal) {
  if (!localDatetimeLocal) return null;
  const d = new Date(localDatetimeLocal);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

/**
 * Converts an ISO string to HTML datetime-local format.
 * @param {string} utcStr - ISO date string
 * @returns {string} Format: "YYYY-MM-DDTHH:MM" or empty string if invalid
 */
export function fromUTCIso(utcStr) {
  if (!utcStr) return "";
  const d = new Date(utcStr);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Formats a date string to "DD Mon YYYY" format (date only).
 * @param {string} dateStr - ISO date string to format
 * @returns {string} Formatted date or "-" if invalid
 */
export function formatDateOnly(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Gets the current date/time in datetime-local format.
 * @returns {string} Format: "YYYY-MM-DDTHH:MM"
 */
export function getNowDatetimeLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Formats an event's date for display.
 * @param {Object} event - Event object with start_date or date property
 * @returns {string} Formatted date or "—" if invalid
 */
export function formatEventDate(event) {
  if (!event) return "—";
  const dateStr = event.start_date || event.date;
  return formatDateOnly(dateStr);
}

/**
 * Formats an event's time for display.
 * @param {Object} event - Event object with start_date, date, and all_day properties
 * @returns {string} Formatted time, "All Day", or "—" if invalid
 */
export function formatEventTime(event) {
  if (!event) return "—";
  if (event.all_day) return "All Day";
  const dateStr = event.start_date || event.date;
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * Formats an event's date and time for display.
 * @param {Object} event - Event object
 * @returns {string} Formatted datetime string or "—" if invalid
 */
export function formatEventDateTime(event) {
  if (!event) return "—";
  const dateStr = event.start_date || event.date;
  if (!dateStr) return "—";
  if (event.all_day) return formatDateOnly(dateStr);
  return `${formatDateOnly(dateStr)} • ${formatEventTime(event)}`;
}

/**
 * Converts a date string to relative time (e.g., "5 minutes ago", "Yesterday").
 * @param {string} dateString - ISO date string
 * @returns {string} Relative time string or "—" if invalid
 */
export function timeAgo(dateString) {
  if (!dateString) return "—";
  const now = new Date();
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) return "Just now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}
