/**
 * CustomSelect.jsx
 * Combobox-style custom dropdown. Click input → search mode. Click arrow → toggle dropdown.
 */

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import "./CustomSelect.css";

const CustomSelect = ({ value, onChange, options = [], placeholder = "Select...", name }) => {
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
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
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

  const q = search.toLowerCase().trim();
  const filtered = useMemo(() => {
    const result = q
      ? options.filter((o) => o.label?.toLowerCase().includes(q))
      : options;
    if (!q && selected) {
      const selectedIdx = result.findIndex((o) => String(o.value) === String(selected.value));
      if (selectedIdx > 0) {
        return [result[selectedIdx], ...result.filter((_, i) => i !== selectedIdx)];
      }
    }
    return result;
  }, [options, q, selected]);

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
    setSearch(e.target.value);
    if (!open) setOpen(true);
  };

  const handleInputFocus = () => {
    setOpen(true);
  };

  const handleTriggerClick = () => {
    if (!open) {
      setSearch("");
      setOpen(true);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
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
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setSearch("");
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightedIndex]) {
        handleSelect(filtered[highlightedIndex].value);
      }
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
            placeholder={t("Search...")}
            value={search}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
          />
        ) : selected ? (
          <span className="cs-selected-text">{t(selected.label)}</span>
        ) : (
          <span className="cs-placeholder-text">{t(placeholder)}</span>
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
            className="cs-dropdown"
            ref={listRef}
            style={{
              position: "fixed",
              top: `${dropdownPos.top}px`,
              left: `${dropdownPos.left}px`,
              width: `${dropdownPos.width}px`,
              zIndex: 99999,
            }}
          >
            {filtered.length === 0 ? (
              <div className="cs-empty">{t("No matches found")}</div>
            ) : (
              filtered.map((opt, idx) => (
                <div
                  key={opt.value}
                  className={`cs-option ${String(opt.value) === String(value) ? "cs-selected" : ""} ${idx === highlightedIndex ? "cs-highlighted" : ""}`}
                  onClick={() => handleSelect(opt.value)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                >
                  {t(opt.label)}
                </div>
              ))
            )}
          </div>,
          document.body
        )}
      <input type="hidden" name={name} value={value || ""} />
    </div>
  );
};

export default CustomSelect;
