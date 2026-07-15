/**
 * CustomSelect.jsx
 * Combobox-style custom dropdown. Click input → search mode. Click arrow → toggle dropdown.
 */

import { useState, useRef, useEffect } from "react";
import "./CustomSelect.css";

const CustomSelect = ({ value, onChange, options, placeholder = "Select...", name }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = options.find((o) => String(o.value) === String(value));

  const q = search.toLowerCase().trim();
  const filtered = q
    ? options.filter((o) => o.label?.toLowerCase().includes(q))
    : options;

  const handleInputChange = (e) => {
    setSearch(e.target.value);
    if (!open) setOpen(true);
  };

  const handleInputFocus = () => {
    setOpen(true);
  };

  const handleTriggerClick = () => {
    if (!open) {
      setSearch(selected ? selected.label : "");
      setOpen(true);
      setTimeout(() => {
        inputRef.current?.focus();
        if (selected) inputRef.current?.select();
      }, 0);
    }
  };

  const handleArrowClick = (e) => {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      setSearch("");
    } else {
      setSearch(selected ? selected.label : "");
      setOpen(true);
      setTimeout(() => {
        inputRef.current?.focus();
        if (selected) inputRef.current?.select();
      }, 0);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setSearch("");
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleSelect = (optValue) => {
    onChange(optValue);
    setOpen(false);
    setSearch("");
  };

  return (
    <div className={`cs-wrap ${open ? "cs-open" : ""}`} ref={ref}>
      <div className="cs-trigger" onClick={handleTriggerClick}>
        {open ? (
          <input
            ref={inputRef}
            type="text"
            className="cs-combo-input"
            placeholder="Search..."
            value={search}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
          />
        ) : selected ? (
          <span className="cs-selected-text">{selected.label}</span>
        ) : (
          <span className="cs-placeholder-text">{placeholder}</span>
        )}
        <svg
          className={`cs-arrow ${open ? "cs-arrow-open" : ""}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          onClick={handleArrowClick}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {open && (
        <div className="cs-dropdown">
          {filtered.length === 0 ? (
            <div className="cs-empty">No matches found</div>
          ) : (
            filtered.map((opt) => (
              <div
                key={opt.value}
                className={`cs-option ${String(opt.value) === String(value) ? "cs-selected" : ""}`}
                onClick={() => handleSelect(opt.value)}
              >
                {opt.label}
              </div>
            ))
          )}
        </div>
      )}
      <input type="hidden" name={name} value={value || ""} />
    </div>
  );
};

export default CustomSelect;
