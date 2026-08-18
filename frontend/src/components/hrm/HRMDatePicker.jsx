import "react";
import { Calendar, X } from "lucide-react";
import "./HRMPickers.css";

export default function HRMDatePicker({ label, value, onChange, required, onClear }) {
  return (
    <div className="hrm-picker-container">
      {label && <label className="hrm-picker-label">{label} {required && <span className="req">*</span>}</label>}
      <div className="hrm-picker-input-wrapper">
        <Calendar className="hrm-picker-icon" size={16} />
        <input
          type="date"
          className="hrm-picker-input"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
        {value && onClear && (
          <button type="button" className="hrm-picker-clear" onClick={onClear}>
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
