import React, { useState, useEffect, useRef } from "react";
import { GripVertical } from "lucide-react";
import { GoDotFill } from "react-icons/go";

/**
 * DraggableStatusBadges.jsx
 * Reusable, horizontally draggable & scrollable status badge container.
 * Strictly filters top quick tabs to only allowed statuses.
 * Saves custom badge order in localStorage and persists across page reloads.
 */
export default function DraggableStatusBadges({
  badges = [],
  activeStatus = "",
  onSelectStatus,
  storageKey = "pms_status_badge_order",
  containerClassName = "task-progress",
}) {
  // Disallowed badges per SRS Section 5 & 8
  const disallowedBadgeIds = new Set(["due_today", "reopened", "transferred"]);
  const validBadges = Array.isArray(badges) ? badges.filter((b) => b && !disallowedBadgeIds.has(b.id)) : [];

  const [orderedBadges, setOrderedBadges] = useState(validBadges);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  
  const dragItem = useRef(null);
  const containerRef = useRef(null);
  const isMouseDown = useRef(false);
  const startX = useRef(0);
  const scrollLeftPos = useRef(0);

  // Sync and order badges according to saved localStorage order
  useEffect(() => {
    if (!validBadges || validBadges.length === 0) {
      setOrderedBadges([]);
      return;
    }

    try {
      const savedOrder = localStorage.getItem(storageKey);
      if (savedOrder) {
        const orderIds = JSON.parse(savedOrder);
        if (Array.isArray(orderIds) && orderIds.length > 0) {
          const badgeMap = new Map(validBadges.map((b) => [b.id, b]));
          const sorted = [];

          // Add items in saved order if they exist in valid badges
          orderIds.forEach((id) => {
            if (!disallowedBadgeIds.has(id) && badgeMap.has(id)) {
              sorted.push(badgeMap.get(id));
              badgeMap.delete(id);
            }
          });

          // Append any remaining new badges
          badgeMap.forEach((badge) => sorted.push(badge));
          setOrderedBadges(sorted);
          return;
        }
      }
    } catch (err) {
      console.warn("Error reading status badge order from localStorage:", err);
    }

    setOrderedBadges(validBadges);
  }, [badges, storageKey]);

  // Drag-and-drop handlers for reordering
  const handleDragStart = (e, index) => {
    e.stopPropagation();
    dragItem.current = index;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceIndex = dragItem.current;
    if (sourceIndex === null || sourceIndex === undefined || sourceIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const reordered = [...orderedBadges];
    const [movedItem] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, movedItem);

    setOrderedBadges(reordered);
    setDraggedIndex(null);
    setDragOverIndex(null);
    dragItem.current = null;

    // Save order to localStorage
    try {
      const orderIds = reordered.map((b) => b.id);
      localStorage.setItem(storageKey, JSON.stringify(orderIds));
    } catch (err) {
      console.warn("Error saving status badge order to localStorage:", err);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    dragItem.current = null;
  };

  // Mouse drag-to-scroll handlers
  const handleMouseDown = (e) => {
    if (!containerRef.current || e.target.closest(".drag-handle-icon")) return;
    isMouseDown.current = true;
    startX.current = e.pageX - containerRef.current.offsetLeft;
    scrollLeftPos.current = containerRef.current.scrollLeft;
  };

  const handleMouseMove = (e) => {
    if (!isMouseDown.current || !containerRef.current) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    containerRef.current.scrollLeft = scrollLeftPos.current - walk;
  };

  const handleMouseUpOrLeave = () => {
    isMouseDown.current = false;
  };

  return (
    <div
      ref={containerRef}
      className={containerClassName}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUpOrLeave}
      onMouseLeave={handleMouseUpOrLeave}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        overflowX: "auto",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        padding: "4px 0",
        marginBottom: "16px",
        userSelect: "none",
        cursor: isMouseDown.current ? "grabbing" : "grab",
      }}
    >
      {orderedBadges.map((badge, index) => {
        const isSelected = activeStatus === badge.id || (activeStatus === "" && badge.id === "");
        const isDragging = draggedIndex === index;
        const isOver = dragOverIndex === index;

        return (
          <div
            key={badge.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            onClick={() => onSelectStatus && onSelectStatus(badge.id)}
            className={`status-badge-item ${badge.className || ""} ${isSelected ? "active" : ""}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: isSelected ? 600 : 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
              opacity: isDragging ? 0.4 : 1,
              border: isOver ? "2px dashed #3b82f6" : undefined,
              flexShrink: 0,
            }}
          >
            <span
              className="drag-handle-icon"
              style={{
                cursor: "grab",
                display: "inline-flex",
                alignItems: "center",
                opacity: 0.5,
                marginRight: "-2px",
              }}
              title="Drag to reorder"
            >
              <GripVertical size={12} />
            </span>

            {badge.dotColor && (
              <GoDotFill style={{ color: badge.dotColor, fontSize: "14px", marginRight: "-2px" }} />
            )}

            <span>{badge.label}</span>

            {typeof badge.count === "number" && (
              <span
                style={{
                  background: isSelected ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.06)",
                  padding: "1px 6px",
                  borderRadius: "10px",
                  fontSize: "11px",
                  fontWeight: 600,
                  marginLeft: "2px",
                }}
              >
                {badge.count}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
