/**
 * @file useDragReorder.js
 * @description Drag-and-drop reordering hook using @dnd-kit library.
 * Provides sortable list functionality with drag overlay support.
 */

import { useState, useCallback, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';

/**
 * Hook for implementing drag-and-drop reordering of list items.
 * @param {Object} options - Configuration options
 * @param {Array} options.items - Array of items to be reordered
 * @param {Function} options.onReorder - Callback when items are reordered, receives mapped and reordered arrays
 * @param {string} [options.idKey='id'] - Key name for unique item identifier
 * @param {boolean} [options.disabled=false] - Whether drag-and-drop is disabled
 * @returns {Object} Drag-and-drop context props and components
 */
export default function useDragReorder({ items, onReorder, idKey = 'id', disabled = false }) {
  const [activeId, setActiveId] = useState(null);
  const currentItemsRef = useRef(items);

  currentItemsRef.current = items;

  // Configure pointer sensor with 5px activation distance to prevent accidental drags
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragEnd = useCallback((event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = currentItemsRef.current.findIndex((i) => i[idKey] === active.id);
    const newIndex = currentItemsRef.current.findIndex((i) => i[idKey] === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(currentItemsRef.current, oldIndex, newIndex);
    const mapped = reordered.map((item, idx) => ({ id: item[idKey], sort_order: idx }));
    onReorder(mapped, reordered);
  }, [onReorder, idKey]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const activeItem = activeId ? items.find((i) => i[idKey] === activeId) : null;

  const contextProps = {
    sensors,
    collisionDetection: closestCenter,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragCancel: handleDragCancel,
  };

  const sortableContextProps = {
    items: items.map((i) => i[idKey]),
    strategy: verticalListSortingStrategy,
    disabled,
  };

  return {
    contextProps,
    sortableContextProps,
    activeId,
    activeItem,
    DragOverlay,
    SortableContext,
    DndContext,
  };
}
