/**
 * Pagination.jsx
 * Reusable pagination component with Previous/Next buttons and smart page number
 * display. Shows ellipsis for large page counts to keep the UI compact.
 */

import React, { useState, useRef, useEffect } from "react";

/**
 * Renders pagination controls for navigating between pages.
 * @param {number} currentPage - The currently active page (1-indexed).
 * @param {number} totalPages - Total number of pages.
 * @param {Function} onPageChange - Callback invoked with the target page number.
 */
export default function Pagination({ currentPage, totalPages, onPageChange, itemsPerPage, onItemsPerPageChange }) {
  const [jumpIdx, setJumpIdx] = useState(null);
  const [jumpValue, setJumpValue] = useState("");
  const jumpInputRef = useRef(null);

  useEffect(() => {
    if (jumpIdx !== null && jumpInputRef.current) {
      jumpInputRef.current.focus();
      jumpInputRef.current.select();
    }
  }, [jumpIdx]);

  if (totalPages <= 1 && !onItemsPerPageChange) return null;

  /** Generate array of all page numbers */
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    pages.push(i);
  }

  /**
   * Determine which page numbers to display.
   */
  const getVisiblePages = () => {
    if (totalPages <= 7) return pages;
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    const visible = [];
    if (start > 1) {
      visible.push(1);
      if (start > 2) visible.push("...");
    }
    for (let i = start; i <= end; i++) {
      visible.push(i);
    }
    if (end < totalPages) {
      if (end < totalPages - 1) visible.push("...");
      visible.push(totalPages);
    }
    return visible;
  };

  const handleJump = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const pageNum = parseInt(jumpValue, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum);
    }
    setJumpIdx(null);
    setJumpValue("");
  };

  return (
    <div style={{
      display: "flex",
      justify: "space-between",
      alignItems: "center",
      gap: "12px",
      padding: "16px 0",
      flexWrap: "wrap",
      width: "100%",
    }}>
      {onItemsPerPageChange ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "13px", color: "var(--text-secondary)" }}>
          <span>Rows per page:</span>
          <select
            value={itemsPerPage || 10}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            style={{
              padding: "4px 8px",
              borderRadius: "6px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      ) : <div />}

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            style={{
              padding: "6px 14px",
              border: "var(--border-color)",
              borderRadius: "6px",
              background: currentPage <= 1 ? "var(--bg-hover)" : "var(--bg-card)",
              color: currentPage <= 1 ? "var(--text-muted)" : "var(--text-primary)",
              cursor: currentPage <= 1 ? "not-allowed" : "pointer",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            Previous
          </button>

          {getVisiblePages().map((page, idx) =>
            page === "..." ? (
              jumpIdx === idx ? (
                <div
                  key={`jump-${idx}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "2px 4px",
                    background: "var(--bg-card)",
                    border: "1px solid var(--color-primary)",
                    borderRadius: "6px",
                  }}
                >
                  <input
                    ref={jumpInputRef}
                    type="number"
                    min={1}
                    max={totalPages}
                    placeholder="#"
                    value={jumpValue}
                    onChange={(e) => setJumpValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleJump(e);
                      if (e.key === "Escape") { setJumpIdx(null); setJumpValue(""); }
                    }}
                    onBlur={() => {
                      // Slight delay so click on Go button still registers
                      setTimeout(() => {
                        setJumpIdx((curr) => (curr === idx ? null : curr));
                      }, 180);
                    }}
                    style={{
                      width: "42px",
                      padding: "4px 2px",
                      border: "none",
                      background: "transparent",
                      color: "var(--text-primary)",
                      fontSize: "12px",
                      textAlign: "center",
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleJump(e);
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      handleJump(e);
                    }}
                    title="Go to page"
                    style={{
                      padding: "2px 6px",
                      borderRadius: "4px",
                      border: "none",
                      background: "var(--color-primary)",
                      color: "#fff",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Go
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  key={`dots-${idx}`}
                  onClick={() => { setJumpIdx(idx); setJumpValue(""); }}
                  title="Click to jump to a page"
                  style={{
                    padding: "4px 6px",
                    color: "var(--text-muted)",
                    fontSize: "13px",
                    background: "transparent",
                    border: "1px dashed transparent",
                    borderRadius: "4px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-primary)";
                    e.currentTarget.style.color = "var(--color-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "transparent";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  ...
                </button>
              )
            ) : (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                style={{
                  padding: "6px 12px",
                  border: "1px solid",
                  borderColor: page === currentPage ? "var(--color-primary)" : "var(--border-color)",
                  borderRadius: "6px",
                  background: page === currentPage ? "var(--color-primary)" : "var(--bg-card)",
                  color: page === currentPage ? "#fff" : "var(--text-primary)",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: page === currentPage ? 600 : 500,
                  minWidth: "36px",
                }}
              >
                {page}
              </button>
            )
          )}

          <button
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            style={{
              padding: "6px 14px",
              border: "var(--border-color)",
              borderRadius: "6px",
              background: currentPage >= totalPages ? "var(--bg-hover)" : "var(--bg-card)",
              color: currentPage >= totalPages ? "var(--text-muted)" : "var(--text-primary)",
              cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
