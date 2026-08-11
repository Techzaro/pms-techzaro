import React, { useState, useEffect, useRef } from "react";
import { GripVertical } from "lucide-react";
import { GoDotFill } from "react-icons/go";

/**
 * DraggableStatusBadges.jsx
 * Reusable, horizontally draggable & scrollable status badge container.
 * Saves custom badge order in localStorage and persists across page reloads.
 */
export default function DraggableStatusBadges({
  badges = [],
  activeStatus = "",
  onSelectStatus,
  storageKey = "pms_status_badge_order",
  containerClassName = "task-progress",
}) {
  const [orderedBadges, setOrderedBadges] = useState(badges);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  
  const dragItem = useRef(null);
  const containerRef = useRef(null);
  const isMouseDown = useRef(false);
  const startX = useRef(0);
  const scrollLeftPos = useRef(0);

  // Sync and order badges according to saved localStorage order
  useEffect(() => {
    if (!badges || badges.length === 0) {
      setOrderedBadges([]);
      return;
    }

    try {
      const savedOrder = localStorage.getItem(storageKey);
      if (savedOrder) {
        const orderIds = JSON.parse(savedOrder);
        if (Array.isArray(orderIds) && orderIds.length > 0) {
          const badgeMap = new Map(badges.map((b) => [b.id, b]));
          const sorted = [];

          // Add items in saved order
          orderIds.forEach((id) => {
            if (badgeMap.has(id)) {
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

    setOrderedBadges(badges);
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
      console.warn("Failed to save status badge order to localStorage:", err);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    dragItem.current = null;
  };

  // Mouse Drag-to-Scroll Handlers
  const handleMouseDown = (e) => {
    if (!containerRef.current) return;
    isMouseDown.current = true;
    startX.current = e.pageX - containerRef.current.offsetLeft;
    scrollLeftPos.current = containerRef.current.scrollLeft;
  };

  const handleMouseLeave = () => {
    isMouseDown.current = false;
  };

  const handleMouseUp = () => {
    isMouseDown.current = false;
  };

  const handleMouseMove = (e) => {
    if (!isMouseDown.current || !containerRef.current) return;
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    containerRef.current.scrollLeft = scrollLeftPos.current - walk;
  };

  return (
    <div
      ref={containerRef}
      className={containerClassName}
      onMouseDown={handleMouseDown}
      onMouseLeave={handleMouseLeave}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      style={{
        userSelect: "none",
        overflowX: "auto",
        cursor: "grab",
        display: "flex",
        gap: "6px",
        paddingBottom: "4px",
        scrollbarWidth: "thin",
        msOverflowStyle: "none"
      }}
    >
      {orderedBadges.map((badge, index) => {
        const isActive = activeStatus === badge.id || (badge.id === "" && !activeStatus);
        const isDragging = draggedIndex === index;
        const isDragOver = dragOverIndex === index;

        return (
          <p
            key={badge.id ?? index}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            onClick={(e) => {
              if (onSelectStatus) onSelectStatus(badge.id);
            }}
            className={`${badge.className || ""} ${isActive ? "active" : ""}`}
            style={{
              cursor: isDragging ? "grabbing" : "grab",
              opacity: isDragging ? 0.4 : 1,
              transform: isDragOver ? "scale(1.04)" : "scale(1)",
              transition: "transform 0.15s ease, opacity 0.15s ease",
              border: isDragOver ? "2px dashed #2563eb" : undefined,
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              marginRight: "6px",
              marginBottom: "4px",
              whiteSpace: "nowrap",
              flexShrink: 0,
              ...badge.style,
            }}
            title="Click to filter, or drag to reorder"
          >
            <GripVertical
              size={12}
              style={{
                opacity: 0.5,
                cursor: "grab",
                flexShrink: 0,
                marginRight: 1,
              }}
            />
            {badge.dotColor ? (
              <GoDotFill color={badge.dotColor} style={{ flexShrink: 0 }} />
            ) : badge.id !== "" ? (
              <GoDotFill style={{ flexShrink: 0 }} />
            ) : null}
            {badge.label} ({badge.count ?? 0})
          </p>
        );
      })}
    </div>
  );
}
