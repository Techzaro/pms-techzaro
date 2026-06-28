import React from "react";

export default function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    pages.push(i);
  }

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
          border: "1px solid #d1d5db",
          borderRadius: "6px",
          background: currentPage <= 1 ? "#f9fafb" : "#fff",
          color: currentPage <= 1 ? "#9ca3af" : "#374151",
          cursor: currentPage <= 1 ? "not-allowed" : "pointer",
          fontSize: "13px",
          fontWeight: 500,
        }}
      >
        Previous
      </button>

      {getVisiblePages().map((page, idx) =>
        page === "..." ? (
          <span key={`dots-${idx}`} style={{ padding: "0 4px", color: "#9ca3af", fontSize: "13px" }}>
            ...
          </span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            style={{
              padding: "6px 12px",
              border: "1px solid",
              borderColor: page === currentPage ? "#4f46e5" : "#d1d5db",
              borderRadius: "6px",
              background: page === currentPage ? "#4f46e5" : "#fff",
              color: page === currentPage ? "#fff" : "#374151",
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
          border: "1px solid #d1d5db",
          borderRadius: "6px",
          background: currentPage >= totalPages ? "#f9fafb" : "#fff",
          color: currentPage >= totalPages ? "#9ca3af" : "#374151",
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
