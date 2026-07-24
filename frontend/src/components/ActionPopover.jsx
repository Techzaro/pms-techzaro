/**
 * ActionPopover.jsx
 * Hover-triggered popover menu for table row actions.
 * Uses fixed positioning via portal to float above table overflow.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import "./ActionPopover.css";

const ActionPopover = ({ trigger, children, onTriggerClick }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapRef = useRef(null);
  const popoverRef = useRef(null);
  const timeoutRef = useRef(null);

  const calcPosition = useCallback(() => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const popoverEl = popoverRef.current;
    const popoverWidth = popoverEl ? popoverEl.offsetWidth : 100;
    const popoverHeight = popoverEl ? popoverEl.offsetHeight : 40;

    let top = rect.top + rect.height / 2 - popoverHeight / 2;
    let left = rect.right + 8;

    if (left + popoverWidth > window.innerWidth) {
      left = rect.left - popoverWidth;
    }
    if (top < 0) top = 4;
    if (top + popoverHeight > window.innerHeight) {
      top = window.innerHeight - popoverHeight - 4;
    }

    setPos({ top, left });
  }, []);

  const handleMouseEnter = () => {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => calcPosition());
    }
  }, [open, calcPosition]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => calcPosition();
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open, calcPosition]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        wrapRef.current && !wrapRef.current.contains(e.target) &&
        popoverRef.current && !popoverRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) setHighlightedIndex(-1);
  }, [open]);

  const childArray = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      if (!open) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < childArray.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : childArray.length - 1));
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div
      className="ap-wrap"
      ref={wrapRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="ap-trigger" onClick={onTriggerClick}>{trigger}</div>
      {open &&
        createPortal(
          <div
            className="ap-popover"
            ref={popoverRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 99999 }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="ap-popover-content">
              {childArray.map((child, idx) => (
                <div key={idx} className={`ap-popover-item ${highlightedIndex === idx ? "ap-popover-item--highlighted" : ""}`} onMouseEnter={() => setHighlightedIndex(idx)}>
                  {child}
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default ActionPopover;
