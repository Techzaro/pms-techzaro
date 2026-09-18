/**
 * CustomSelect.jsx
 * Combobox-style custom dropdown. Click input → search mode. Click arrow → toggle dropdown.
 */

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import "./CustomSelect.css";

const CustomSelect = ({
  value,
  onChange,
  options = [],
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  name,
  disabled = false,
  className = "",
  style = {},
  size = "md",
  showCheckbox = true,
  showSearch = true,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const ref = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const updatePos = useCallback(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      let left = rect.left;
      const maxWidth = 320;
      if (left + maxWidth > window.innerWidth - 8) {
        const rightAligned = rect.right - maxWidth;
        left = Math.max(8, rightAligned > 0 ? rightAligned : window.innerWidth - maxWidth - 8);
      }
      setDropdownPos({
        top: rect.bottom + 4,
        left: Math.max(8, left),
        width: rect.width,
      });
    }
  }, []);

  useEffect(() => {
    if (open) {
      updatePos();
      window.addEventListener("scroll", updatePos, true);
      window.addEventListener("resize", updatePos);
      return () => {
        window.removeEventListener("scroll", updatePos, true);
        window.removeEventListener("resize", updatePos);
      };
    }
  }, [open, updatePos]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        ref.current && !ref.current.contains(e.target) &&
        listRef.current && !listRef.current.contains(e.target)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = options.find((o) => String(o.value) === String(value));
  const isDefaultEmpty = !value || value === "" || (selected && (selected.value === "" || selected.value === null));

  const q = search.toLowerCase().trim();
  const filtered = useMemo(() => {
    const result = q
      ? options.filter((o) => {
          const lbl = String(o.label || "").toLowerCase();
          const sub = String(o.subtitle || o.email || o.role || "").toLowerCase();
          return lbl.includes(q) || sub.includes(q);
        })
      : options;
    if (!q && selected) {
      const selectedIdx = result.findIndex((o) => String(o.value) === String(selected.value));
      if (selectedIdx > 0) {
        return [result[selectedIdx], ...result.filter((_, i) => i !== selectedIdx)];
      }
    }
    return result;
  }, [options, q, selected]);

  const activeOptions = useMemo(() => {
    return filtered.filter((o) => o.isActive !== false && o.group !== "Inactive / Resigned");
  }, [filtered]);

  const inactiveOptions = useMemo(() => {
    return filtered.filter((o) => o.isActive === false || o.group === "Inactive / Resigned");
  }, [filtered]);

  const hasGroups = inactiveOptions.length > 0;
  const displayOptions = useMemo(() => {
    return hasGroups ? [...activeOptions, ...inactiveOptions] : filtered;
  }, [hasGroups, activeOptions, inactiveOptions, filtered]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [search, open]);

  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.children[highlightedIndex];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, open]);

  const handleInputChange = (e) => {
    if (disabled) return;
    setSearch(e.target.value);
    if (!open) setOpen(true);
  };

  const handleInputFocus = () => {
    if (disabled) return;
    setOpen(true);
  };

  const handleTriggerClick = () => {
    if (disabled) return;
    if (showSearch) {
      if (!open) {
        setSearch("");
        setOpen(true);
        setTimeout(() => {
          inputRef.current?.focus();
        }, 0);
      }
    } else {
      setOpen((prev) => !prev);
    }
  };

  const handleArrowClick = (e) => {
    e.stopPropagation();
    if (disabled) return;
    if (open) {
      setOpen(false);
      setSearch("");
    } else {
      setSearch("");
      setOpen(true);
      if (showSearch) {
        setTimeout(() => {
          inputRef.current?.focus();
        }, 0);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === "Escape") {
      setSearch("");
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        if (showSearch) setTimeout(() => inputRef.current?.focus(), 0);
      } else {
        setHighlightedIndex((prev) => (prev < displayOptions.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        if (showSearch) setTimeout(() => inputRef.current?.focus(), 0);
      } else {
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : displayOptions.length - 1));
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && displayOptions[highlightedIndex]) {
        handleSelect(displayOptions[highlightedIndex].value);
      } else if (!open) {
        setOpen(true);
        if (showSearch) setTimeout(() => inputRef.current?.focus(), 0);
      }
    }
  };

  const handleSelect = (optValue) => {
    onChange?.(optValue);
    setOpen(false);
    setSearch("");
  };

  return (
    <div
      className={`cs-wrap ${size === "sm" ? "cs-sm" : ""} ${open ? "cs-open" : ""} ${disabled ? "cs-disabled" : ""} ${className}`}
      ref={ref}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      style={style}
    >
      <div className="cs-trigger" onClick={handleTriggerClick}>
        {open && showSearch ? (
          <input
            ref={inputRef}
            type="text"
            className="cs-combo-input"
            placeholder={t(searchPlaceholder, { defaultValue: searchPlaceholder })}
            value={search}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            disabled={disabled}
          />
        ) : selected && !isDefaultEmpty ? (
          <span className="cs-selected-text">{selected.label}</span>
        ) : (
          <span className="cs-placeholder-text">{selected ? selected.label : t(placeholder, { defaultValue: placeholder })}</span>
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
      {open &&
        createPortal(
          <div
            className={`cs-dropdown ${size === "sm" ? "cs-sm-dropdown" : ""}`}
            ref={listRef}
            style={{
              position: "fixed",
              top: `${dropdownPos.top}px`,
              left: `${dropdownPos.left}px`,
              minWidth: `${dropdownPos.width}px`,
              width: "max-content",
              maxWidth: "320px",
              boxSizing: "border-box",
              zIndex: 99999,
            }}
          >
            {displayOptions.length === 0 ? (
              <div className="cs-empty">{t("No matches found", { defaultValue: "No matches found" })}</div>
            ) : hasGroups ? (
              <>
                {activeOptions.length > 0 && (
                  <div className="cs-group-header">
                    <span>{t("Active Users", { defaultValue: "Active Users" })}</span>
                    <span className="cs-group-badge">{activeOptions.length}</span>
                  </div>
                )}
                {activeOptions.map((opt, idx) => {
                  const isSelected = String(opt.value) === String(value);
                  return (
                    <div
                      key={opt.value}
                      className={`cs-option ${isSelected ? "cs-selected" : ""} ${idx === highlightedIndex ? "cs-highlighted" : ""}`}
                      onClick={() => handleSelect(opt.value)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                    >
                      {showCheckbox && (
                        <span className={`cs-checkbox ${isSelected ? "cs-checked" : ""}`}>
                          {isSelected && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </span>
                      )}
                      <span className="cs-option-label">{opt.label}</span>
                    </div>
                  );
                })}

                {inactiveOptions.length > 0 && (
                  <>
                    <div className="cs-group-header cs-group-header--inactive">
                      <span>{t("Inactive / Resigned", { defaultValue: "Inactive / Resigned" })}</span>
                      <span className="cs-group-badge">{inactiveOptions.length}</span>
                    </div>
                    {inactiveOptions.map((opt, idx) => {
                      const actualIdx = activeOptions.length + idx;
                      const isSelected = String(opt.value) === String(value);
                      return (
                        <div
                          key={opt.value}
                          className={`cs-option ${isSelected ? "cs-selected" : ""} ${actualIdx === highlightedIndex ? "cs-highlighted" : ""}`}
                          onClick={() => handleSelect(opt.value)}
                          onMouseEnter={() => setHighlightedIndex(actualIdx)}
                        >
                          {showCheckbox && (
                            <span className={`cs-checkbox ${isSelected ? "cs-checked" : ""}`}>
                              {isSelected && (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </span>
                          )}
                          <span className="cs-option-label" style={{ color: "var(--text-muted, #64748b)" }}>{opt.label}</span>
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <div
                    key={opt.value}
                    className={`cs-option ${isSelected ? "cs-selected" : ""} ${idx === highlightedIndex ? "cs-highlighted" : ""}`}
                    onClick={() => handleSelect(opt.value)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                  >
                    {showCheckbox && (
                      <span className={`cs-checkbox ${isSelected ? "cs-checked" : ""}`}>
                        {isSelected && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                    )}
                    <span className="cs-option-label">{opt.label}</span>
                  </div>
                );
              })
            )}
          </div>,
          document.body
        )}
      <input type="hidden" name={name} value={value || ""} />
    </div>
  );
};

export default CustomSelect;
