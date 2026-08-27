import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import "./MultiSelectDropdown.css";

const MultiSelectDropdown = ({ value = [], onChange, options = [], placeholder = "Select...", searchPlaceholder = "Search...", name, size = "md", className = "" }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const ref = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

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

  const selectedSet = useMemo(() => new Set(value.map(String)), [value]);

  const q = search.toLowerCase().trim();
  const filtered = useMemo(() => {
    const result = q ? options.filter((o) => o.label?.toLowerCase().includes(q)) : options;
    return result;
  }, [options, q]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [search, open]);

  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.children[highlightedIndex];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, open]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((o) => selectedSet.has(String(o.value)));
  const someVisibleSelected = filtered.some((o) => selectedSet.has(String(o.value)));

  const handleToggle = (optValue) => {
    const strVal = String(optValue);
    const next = selectedSet.has(strVal)
      ? value.filter((v) => String(v) !== strVal)
      : [...value, optValue];
    onChange(next);
  };

  const handleSelectAll = () => {
    if (allVisibleSelected) {
      const visibleValues = new Set(filtered.map((o) => String(o.value)));
      onChange(value.filter((v) => !visibleValues.has(String(v))));
    } else {
      const merged = new Set(value.map(String));
      filtered.forEach((o) => merged.add(String(o.value)));
      onChange(options.filter((o) => merged.has(String(o.value))).map((o) => o.value));
    }
  };

  const handleClearAll = (e) => {
    e.stopPropagation();
    onChange([]);
  };

  const handleTriggerClick = () => {
    if (!open) {
      setSearch("");
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleArrowClick = (e) => {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      setSearch("");
    } else {
      setSearch("");
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setSearch("");
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      } else {
        setHighlightedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered[highlightedIndex]) {
        handleToggle(filtered[highlightedIndex].value);
      } else if (!open) {
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    }
  };

  const displayText = useMemo(() => {
    if (value.length === 0) return null;
    if (value.length === 1) {
      const opt = options.find((o) => String(o.value) === String(value[0]));
      return opt?.label || String(value[0]);
    }
    return `${value.length} ${t("selected", { defaultValue: "selected" })}`;
  }, [value, options, t]);

  return (
    <div className={`msd-wrap ${size === "sm" ? "msd-sm" : ""} ${className} ${open ? "msd-open" : ""}`} ref={ref} tabIndex={0}>
      <div className="msd-trigger" onClick={handleTriggerClick}>
        {open ? (
          <input
            ref={inputRef}
            type="text"
            className="msd-combo-input"
            placeholder={t(searchPlaceholder)}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        ) : displayText ? (
          <span className="msd-selected-text">{displayText}</span>
        ) : (
          <span className="msd-placeholder-text">{t(placeholder)}</span>
        )}
        <div className="msd-trigger-right">
          {value.length > 0 && !open && (
            <span className="msd-clear-btn" onClick={handleClearAll} title={t("Clear all")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
          )}
          <svg className={`msd-arrow ${open ? "msd-arrow-open" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" onClick={handleArrowClick}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>
      {open && (
        <div className="msd-dropdown">
          {filtered.length > 0 && (
            <div className="msd-select-all" onClick={handleSelectAll}>
              <span className={`msd-checkbox ${allVisibleSelected ? "msd-checked" : someVisibleSelected ? "msd-partial" : ""}`}>
                {allVisibleSelected && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                )}
                {someVisibleSelected && !allVisibleSelected && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                )}
              </span>
              <span className="msd-select-all-text">{allVisibleSelected ? t("Deselect All") : t("Select All")}</span>
            </div>
          )}
          <div className="msd-options-list" ref={listRef}>
            {filtered.length === 0 ? (
              <div className="msd-empty">{t("No matches found")}</div>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = selectedSet.has(String(opt.value));
                return (
                  <div
                    key={opt.value}
                    className={`msd-option ${isSelected ? "msd-option-selected" : ""} ${idx === highlightedIndex ? "msd-highlighted" : ""}`}
                    onClick={() => handleToggle(opt.value)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                  >
                    <span className={`msd-checkbox ${isSelected ? "msd-checked" : ""}`}>
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </span>
                    <span className="msd-option-label">{opt.label}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      <input type="hidden" name={name} value={value.join(",")} />
    </div>
  );
};

export default MultiSelectDropdown;
