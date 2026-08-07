import React, { useState, useEffect } from "react";
import { CalendarRange, X } from "lucide-react";
import "./HRMPickers.css";

export default function HRMDateRangePicker({ label, value, onChange, required, onClear }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useEffect(() => {
    if (value && typeof value === 'object') {
      setStart(value.start || "");
      setEnd(value.end || "");
    }
  }, [value]);

  const handleStartChange = (v) => {
    setStart(v);
    onChange({ start: v, end });
  };

  const handleEndChange = (v) => {
    setEnd(v);
    onChange({ start, end: v });
  };

  const calcDays = () => {
    if (start && end) {
      const s = new Date(start);
      const e = new Date(end);
      const diffTime = Math.abs(e - s);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive
      return diffDays > 0 ? diffDays : 0;
    }
    return 0;
  };

  const days = calcDays();

  return (
    <div className="hrm-picker-container hrm-range-container">
      {label && <label className="hrm-picker-label">{label} {required && <span className="req">*</span>}</label>}
      <div className="hrm-range-inputs">
        <div className="hrm-picker-input-wrapper">
          <CalendarRange className="hrm-picker-icon" size={16} />
          <input
            type="date"
            className="hrm-picker-input"
            value={start}
            onChange={(e) => handleStartChange(e.target.value)}
            required={required}
            placeholder="Start Date"
          />
        </div>
        <span className="hrm-range-sep">to</span>
        <div className="hrm-picker-input-wrapper">
          <CalendarRange className="hrm-picker-icon" size={16} />
          <input
            type="date"
            className="hrm-picker-input"
            value={end}
            onChange={(e) => handleEndChange(e.target.value)}
            required={required}
            placeholder="End Date"
          />
        </div>
        {(start || end) && onClear && (
          <button type="button" className="hrm-picker-clear" onClick={() => { setStart(""); setEnd(""); onClear(); }}>
            <X size={14} />
          </button>
        )}
      </div>
      {days > 0 && <div className="hrm-range-summary">Total Days: {days}</div>}
    </div>
  );
}
