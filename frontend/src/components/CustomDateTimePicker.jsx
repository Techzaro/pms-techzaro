import { useState, useRef, useEffect } from "react";
import "./CustomDateTimePicker.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

const padNum = (n) => String(n).padStart(2, "0");

const CustomDateTimePicker = ({ value, onChange, label, dateOnly = false }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const now = new Date();
  const parsed = value ? new Date(value) : null;

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

  const maxDay = getDaysInMonth(year, month);
  const safeDay = Math.min(day, maxDay);

  const years = [];
  for (let y = now.getFullYear() - 5; y <= now.getFullYear() + 5; y++) years.push(y);

  const days = [];
  for (let d = 1; d <= maxDay; d++) days.push(d);

  const hoursList = [];
  for (let h = 0; h < 24; h++) hoursList.push(h);

  const minutesList = [];
  for (let m = 0; m < 60; m += 5) minutesList.push(m);

  const applyValue = (y, mo, d, h, m) => {
    const safeD = Math.min(d, getDaysInMonth(y, mo));
    if (dateOnly) {
      onChange(`${y}-${padNum(mo + 1)}-${padNum(safeD)}`);
    } else {
      onChange(`${y}-${padNum(mo + 1)}-${padNum(safeD)}T${padNum(h)}:${padNum(m)}`);
    }
  };

  const displayValue = () => {
    if (!value) return "";
    if (dateOnly) {
      const d = parsed || new Date();
      return `${padNum(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    }
    const d = parsed || new Date();
    const h = d.getHours();
    const m = padNum(d.getMinutes());
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${padNum(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${h12}:${m} ${ampm}`;
  };

  return (
    <div className="cdt-wrap" ref={ref}>
      <button
        type="button"
        className={`cdt-trigger ${!value ? "cdt-placeholder" : ""}`}
        onClick={() => setOpen((p) => !p)}
      >
        <span>{value ? displayValue() : "Select date"}</span>
        <svg className={`cdt-arrow ${open ? "cdt-arrow-open" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {open && (
        <div className="cdt-dropdown">
          <div className="cdt-row">
            <div className="cdt-col">
              <label>Day</label>
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
              <label>Month</label>
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
                {MONTHS.map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>
            </div>
            <div className="cdt-col">
              <label>Year</label>
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
                <label>Hour</label>
                <select
                  value={hours}
                  onChange={(e) => {
                    const h = parseInt(e.target.value);
                    setHours(h);
                    applyValue(year, month, safeDay, h, minutes);
                  }}
                >
                  {hoursList.map((h) => (
                    <option key={h} value={h}>{padNum(h)}:00</option>
                  ))}
                </select>
              </div>
              <div className="cdt-col">
                <label>Min</label>
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
            }}>Today</button>
            <button type="button" className="cdt-clear" onClick={() => {
              onChange("");
              setOpen(false);
            }}>Clear</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomDateTimePicker;
