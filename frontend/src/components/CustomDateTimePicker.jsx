/**
 * CustomDateTimePicker.jsx
 * Custom date/time picker with dropdown selects for day, month, year, hour, and minute.
 * Supports minimum date constraints and date-only mode.
 */

import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { formatLocalDate, formatLocalTime, getUserTimeFormat } from "../utils/timezoneUtils";
import "./CustomDateTimePicker.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Returns the number of days in a given month (0-indexed). */
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

/** Pads a number with leading zero to 2 digits. */
const padNum = (n) => String(n).padStart(2, "0");

/**
 * Custom date/time picker with dropdown selects.
 * @param {string} value - Current value in ISO format (e.g., "2025-03-15T14:30") or date-only ("2025-03-15")
 * @param {Function} onChange - Callback when value changes, receives formatted string
 * @param {string} [label] - Optional label text
 * @param {boolean} [dateOnly=false] - If true, hides time selectors
 * @param {string|null} [min=null] - Minimum selectable date/time in ISO format
 */
const CustomDateTimePicker = ({ value, onChange, label, dateOnly = false, min = null }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const now = new Date();
  const parsed = value ? new Date(value) : null;

  const minDate = min ? new Date(min) : null;

  const [year, setYear] = useState(parsed ? parsed.getFullYear() : now.getFullYear());
  const [month, setMonth] = useState(parsed ? parsed.getMonth() : now.getMonth());
  const [day, setDay] = useState(parsed ? parsed.getDate() : now.getDate());
  const [hours, setHours] = useState(parsed ? parsed.getHours() : 0);
  const [minutes, setMinutes] = useState(parsed ? parsed.getMinutes() : 0);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (parsed) {
      setYear(parsed.getFullYear());
      setMonth(parsed.getMonth());
      setDay(parsed.getDate());
      setHours(parsed.getHours());
      setMinutes(parsed.getMinutes());
    }
  }, [value]);

  useEffect(() => {
    if (!minDate) return;
    let changed = false;
    let y = year, mo = month, d = day, h = hours, m = minutes;
    if (y < minDate.getFullYear()) { y = minDate.getFullYear(); mo = minDate.getMonth(); d = minDate.getDate(); h = minDate.getHours(); m = Math.ceil(minDate.getMinutes() / 5) * 5; changed = true; }
    else if (y === minDate.getFullYear() && mo < minDate.getMonth()) { mo = minDate.getMonth(); d = minDate.getDate(); h = minDate.getHours(); m = Math.ceil(minDate.getMinutes() / 5) * 5; changed = true; }
    else if (y === minDate.getFullYear() && mo === minDate.getMonth() && d < minDate.getDate()) { d = minDate.getDate(); h = minDate.getHours(); m = Math.ceil(minDate.getMinutes() / 5) * 5; changed = true; }
    else if (y === minDate.getFullYear() && mo === minDate.getMonth() && d === minDate.getDate() && h < minDate.getHours()) { h = minDate.getHours(); m = Math.ceil(minDate.getMinutes() / 5) * 5; changed = true; }
    else if (y === minDate.getFullYear() && mo === minDate.getMonth() && d === minDate.getDate() && h === minDate.getHours() && m < Math.ceil(minDate.getMinutes() / 5) * 5) { m = Math.ceil(minDate.getMinutes() / 5) * 5; changed = true; }
    if (changed) {
      setYear(y); setMonth(mo); setDay(d); setHours(h); setMinutes(m);
      applyValue(y, mo, d, h, m);
    }
  }, [min]);

  const maxDay = getDaysInMonth(year, month);
  const safeDay = Math.min(day, maxDay);

  const minYear = minDate ? minDate.getFullYear() : null;
  const minMonth = minDate && year === minDate.getFullYear() ? minDate.getMonth() : null;
  const minDay = minDate && year === minDate.getFullYear() && month === minDate.getMonth() ? minDate.getDate() : null;
  const minHours = minDate && year === minDate.getFullYear() && month === minDate.getMonth() && safeDay === minDate.getDate() ? minDate.getHours() : null;
  const minMinutes = minDate && year === minDate.getFullYear() && month === minDate.getMonth() && safeDay === minDate.getDate() && hours === minDate.getHours() ? Math.ceil(minDate.getMinutes() / 5) * 5 : null;

  const years = [];
  for (let y = now.getFullYear() - 5; y <= now.getFullYear() + 5; y++) years.push(y);

  const months = minYear !== null
    ? MONTHS.map((m, i) => ({ name: m, index: i })).filter((m) => year > minYear || m.index >= minMonth)
    : MONTHS.map((m, i) => ({ name: m, index: i }));

  const days = [];
  const startDay = minDay !== null ? minDay : 1;
  for (let d = startDay; d <= maxDay; d++) days.push(d);

  const hoursList = [];
  const startHour = minHours !== null ? minHours : 0;
  for (let h = startHour; h < 24; h++) hoursList.push(h);

  const minutesList = [];
  const startMin = minMinutes !== null ? minMinutes : 0;
  for (let m = startMin; m < 60; m += 5) minutesList.push(m);

  /**
   * Formats the selected date/time components into an ISO-style string
   * and calls onChange. Clamps the day to the valid range for the month.
   */
  const applyValue = (y, mo, d, h, m) => {
    const safeD = Math.min(d, getDaysInMonth(y, mo));
    if (dateOnly) {
      onChange(`${y}-${padNum(mo + 1)}-${padNum(safeD)}`);
    } else {
      onChange(`${y}-${padNum(mo + 1)}-${padNum(safeD)}T${padNum(h)}:${padNum(m)}`);
    }
  };

  /**
   * Returns a human-readable display string for the current value.
   * @returns {string} Formatted date/time string or empty if no value
   */
  const displayValue = () => {
    if (!value) return "";
    try {
      const d = parsed || new Date();
      const iso = d.toISOString();
      if (dateOnly) {
        return formatLocalDate(iso);
      }
      return `${formatLocalDate(iso)} ${formatLocalTime(iso)}`;
    } catch {
      return String(value);
    }
  };

  return (
    <div className="cdt-wrap" ref={ref}>
      <button
        type="button"
        className={`cdt-trigger ${!value ? "cdt-placeholder" : ""}`}
        onClick={() => setOpen((p) => !p)}
      >
        <span>{value ? displayValue() : t("Select date", { defaultValue: "Select date" })}</span>
        <svg className={`cdt-arrow ${open ? "cdt-arrow-open" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {open && (
        <div className="cdt-dropdown">
          <div className="cdt-row">
            <div className="cdt-col">
              <label>{t("Day", { defaultValue: "Day" })}</label>
              <select
                value={safeDay}
                onChange={(e) => {
                  const d = parseInt(e.target.value);
                  setDay(d);
                  applyValue(year, month, d, hours, minutes);
                }}
              >
                {days.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="cdt-col">
              <label>{t("Month", { defaultValue: "Month" })}</label>
              <select
                value={month}
                onChange={(e) => {
                  const mo = parseInt(e.target.value);
                  setMonth(mo);
                  const newMax = getDaysInMonth(year, mo);
                  const newDay = Math.min(day, newMax);
                  setDay(newDay);
                  applyValue(year, mo, newDay, hours, minutes);
                }}
              >
                {months.map((m) => (
                  <option key={m.index} value={m.index}>{t(m.name)}</option>
                ))}
              </select>
            </div>
            <div className="cdt-col">
              <label>{t("Year", { defaultValue: "Year" })}</label>
              <select
                value={year}
                onChange={(e) => {
                  const y = parseInt(e.target.value);
                  setYear(y);
                  const newMax = getDaysInMonth(y, month);
                  const newDay = Math.min(day, newMax);
                  setDay(newDay);
                  applyValue(y, month, newDay, hours, minutes);
                }}
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {!dateOnly && (
            <div className="cdt-row cdt-time-row">
              <div className="cdt-col">
                <label>{t("Hour", { defaultValue: "Hour" })}</label>
                <select
                  value={hours}
                  onChange={(e) => {
                    const h = parseInt(e.target.value);
                    setHours(h);
                    applyValue(year, month, safeDay, h, minutes);
                  }}
                >
                  {hoursList.map((h) => {
                    const is24h = getUserTimeFormat() === "24-hour";
                    const label = is24h
                      ? `${padNum(h)}:00`
                      : `${padNum(h % 12 || 12)}:00 ${h >= 12 ? "PM" : "AM"}`;
                    return (
                      <option key={h} value={h}>{label}</option>
                    );
                  })}
                </select>
              </div>
              <div className="cdt-col">
                <label>{t("Min", { defaultValue: "Min" })}</label>
                <select
                  value={minutes}
                  onChange={(e) => {
                    const m = parseInt(e.target.value);
                    setMinutes(m);
                    applyValue(year, month, safeDay, hours, m);
                  }}
                >
                  {minutesList.map((m) => (
                    <option key={m} value={m}>{padNum(m)}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="cdt-actions">
            <button type="button" className="cdt-today" onClick={() => {
              const n = new Date();
              setYear(n.getFullYear());
              setMonth(n.getMonth());
              setDay(n.getDate());
              setHours(n.getHours());
              setMinutes(Math.floor(n.getMinutes() / 5) * 5);
              applyValue(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), Math.floor(n.getMinutes() / 5) * 5);
            }}>{t("Today", { defaultValue: "Today" })}</button>
            <button type="button" className="cdt-clear" onClick={() => {
              onChange("");
              setOpen(false);
            }}>{t("Clear", { defaultValue: "Clear" })}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomDateTimePicker;
