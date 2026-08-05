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
export default function Pagination({ currentPage, totalPages, onPageChange, itemsPerPage, onItemsPerPageChange }) {
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
      )}
    </div>
  );
}
