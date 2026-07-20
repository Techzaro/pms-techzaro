/**
 * Pagination.jsx
 * Reusable pagination component with Previous/Next buttons and smart page number
 * display. Shows ellipsis for large page counts to keep the UI compact.
 */

import React from "react";

/**
 * Renders pagination controls for navigating between pages.
 * @param {number} currentPage - The currently active page (1-indexed).
 * @param {number} totalPages - Total number of pages.
 * @param {Function} onPageChange - Callback invoked with the target page number.
 */
export default function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  /** Generate array of all page numbers */
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    pages.push(i);
  }

  /**
   * Determine which page numbers to display.
   * Shows all pages if <= 7, otherwise shows a window around the current page
   * with ellipsis markers for skipped ranges.
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

  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: "6px",
      padding: "16px 0",
      flexWrap: "wrap",
    }}>
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
          /* Ellipsis marker for skipped page ranges */
          <span key={`dots-${idx}`} style={{ padding: "0 4px", color: "var(--text-muted)", fontSize: "13px" }}>
            ...
          </span>
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
  );
}
