/**
 * CustomSelect.jsx
 * Custom dropdown select component with click-outside detection.
 * Replaces native <select> for consistent styling across the app.
 */

import { useState, useRef, useEffect } from "react";
import "./CustomSelect.css";

/**
 * Custom dropdown select component.
 * @param {*} value - Currently selected value
 * @param {Function} onChange - Callback when selection changes, receives the option value
 * @param {Array<{value: *, label: string}>} options - Array of selectable options
 * @param {string} [placeholder="Select..."] - Placeholder text when nothing is selected
 * @param {string} [name] - Optional name attribute for the hidden input
 */
const CustomSelect = ({ value, onChange, options, placeholder = "Select...", name }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = options.find((o) => String(o.value) === String(value));

  return (
    <div className={`cs-wrap ${open ? "cs-open" : ""}`} ref={ref}>
      <button
        type="button"
        className={`cs-trigger ${!selected ? "cs-placeholder" : ""}`}
        onClick={() => setOpen((p) => !p)}
      >
        <span>{selected ? selected.label : placeholder}</span>
        <svg className={`cs-arrow ${open ? "cs-arrow-open" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div className="cs-dropdown">
          {options.map((opt) => (
            <div
              key={opt.value}
              className={`cs-option ${String(opt.value) === String(value) ? "cs-selected" : ""}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
      <input type="hidden" name={name} value={value || ""} />
    </div>
  );
};

export default CustomSelect;
