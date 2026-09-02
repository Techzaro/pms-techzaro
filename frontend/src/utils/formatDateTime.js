/**
 * @file formatDateTime.js
 * @description Date and time formatting utilities for consistent display across the app.
 * Integrates with timezoneUtils to respect user timezone and formatting preferences.
 */

import {
  convertToLocal,
  formatLocalDate,
  formatLocalTime,
  formatReadableDateTime,
  formatRelativeTime,
  toLocalDatetimeInput,
  convertToUTC,
  parseUtcToEpochMs,
} from "./timezoneUtils";

export { parseUtcToEpochMs };

/**
 * Formats a date string to multiline date and time.
 * @param {string} dateStr - ISO date string to format
 * @returns {string} Formatted date string or "-" if invalid
 */
export function formatDateTime(dateStr) {
  if (!dateStr) return "-";
  try {
    const d = formatLocalDate(dateStr);
    const t = formatLocalTime(dateStr);
    if (d === "—" || !d) return "-";
    return `${d}\n${t}`;
  } catch {
    return dateStr;
  }
}

/**
 * Formats a date string to inline format with user preferences.
 * @param {string} dateStr - ISO date string to format
 * @returns {string} Formatted date string or "—" if invalid
 */
export function formatDateTimeInline(dateStr) {
  if (!dateStr) return "—";
  return formatReadableDateTime(dateStr);
}

/**
 * Formats a date string to short format (alias for formatDateTimeInline).
 * @param {string} dateStr - ISO date string to format
 * @returns {string} Formatted date string or "—" if invalid
 */
export function formatDateTimeShort(dateStr) {
  if (!dateStr) return "—";
  return formatReadableDateTime(dateStr);
}

/**
 * Converts an ISO date string to HTML datetime-local input format in user's timezone.
 * @param {string} dateStr - ISO date string to convert
 * @returns {string} Format: "YYYY-MM-DDTHH:MM" or empty string if invalid
 */
export function toDatetimeLocal(dateStr) {
  if (!dateStr) return "";
  return toLocalDatetimeInput(dateStr);
}

/**
 * Converts a local datetime-local string to UTC ISO string.
 * @param {string} localDatetimeLocal - datetime-local format string
 * @returns {string|null} Format: "YYYY-MM-DDTHH:MM:SSZ" or null if invalid
 */
export function toUTCIso(localDatetimeLocal) {
  if (!localDatetimeLocal) return null;
  return convertToUTC(localDatetimeLocal);
}

/**
 * Converts an ISO string to HTML datetime-local format.
 * @param {string} utcStr - ISO date string
 * @returns {string} Format: "YYYY-MM-DDTHH:MM" or empty string if invalid
 */
export function fromUTCIso(utcStr) {
  if (!utcStr) return "";
  return toLocalDatetimeInput(utcStr);
}

/**
 * Formats a date string to date only based on user preferences.
 * @param {string} dateStr - ISO date string to format
 * @returns {string} Formatted date or "-" if invalid
 */
export function formatDateOnly(dateStr) {
  if (!dateStr) return "-";
  const res = formatLocalDate(dateStr);
  return res === "—" ? "-" : res;
}

/**
 * Gets the current date/time in datetime-local format for current user timezone.
 * @returns {string} Format: "YYYY-MM-DDTHH:MM"
 */
export function getNowDatetimeLocal() {
  return toLocalDatetimeInput(new Date().toISOString());
}

/**
 * Formats an event's date for display.
 * @param {Object} event - Event object with start_date or date property
 * @returns {string} Formatted date or "—" if invalid
 */
export function formatEventDate(event) {
  if (!event) return "—";
  const dateStr = event.start_date || event.date || event.event_date;
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
  const dateStr = event.start_date || event.date || event.event_start_time;
  if (!dateStr) return "—";
  return formatLocalTime(dateStr);
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
  return formatRelativeTime(dateString);
}
