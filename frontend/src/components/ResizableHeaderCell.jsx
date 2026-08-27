import React, { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import "./ResizableHeaderCell.css";

/**
 * ResizableHeaderCell Component
 *
 * Implements reliable column resizing using React Drag Handle (Method 2)
 * combined with Inner Div wrapper (Method 1).
 */
export default function ResizableHeaderCell({
  children,
  className = "",
  style = {},
  minWidth = 120,
  defaultWidth,
  as = "div",
  onResize,
}) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(defaultWidth || null);
  const [isResizing, setIsResizing] = useState(false);
  const cellRef = useRef(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback(
    (e) => {
      e.stopPropagation();
      e.preventDefault();

      const currentWidth = cellRef.current
        ? cellRef.current.getBoundingClientRect().width
        : width || minWidth;

      setIsResizing(true);
      startXRef.current = e.clientX;
      startWidthRef.current = currentWidth;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMouseMove = (moveEvent) => {
        const deltaX = moveEvent.clientX - startXRef.current;
        const newWidth = Math.max(minWidth, startWidthRef.current + deltaX);
        setWidth(newWidth);
        if (onResize) onResize(newWidth);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [minWidth, width, onResize]
  );

  const Component = as;

  const cellStyle = {
    position: "relative",
    boxSizing: "border-box",
    minWidth: `${minWidth}px`,
    ...(width ? { width: `${width}px`, flex: `0 0 ${width}px` } : {}),
    ...style,
  };

  return (
    <Component
      ref={cellRef}
      className={`resizable-header-cell ${isResizing ? "is-resizing" : ""} ${className}`}
      style={cellStyle}
    >
      <div
        className="resize-wrapper"
        style={{
          width: "100%",
          minWidth: `${minWidth}px`,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </div>
      <div
        className={`col-resizer-handle ${isResizing ? "active" : ""}`}
        onMouseDown={handleMouseDown}
        title={t("Drag to resize column", { defaultValue: "Drag to resize column" })}
      />
    </Component>
  );
}
