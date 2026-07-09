/**
 * SortableTableWrapper.jsx
 * Provides drag-and-drop reordering using @dnd-kit.
 * HandleSensor ensures only [data-dnd-handle] elements can initiate a drag.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { DndContext, DragOverlay, closestCenter, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

/**
 * Custom sensor: only activates when pointerdown occurs inside [data-dnd-handle].
 * Extends PointerSensor so it inherits pointermove/pointerup handling.
 */
class HandleSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown',
      handler: ({ nativeEvent: event }) => {
        if (!event.isPrimary || event.button !== 0) return false;
        if (!event.target.closest('[data-dnd-handle]')) return false;
        return true;
      },
    },
  ];
}

/** Drag handle — wrap with data-dnd-handle so HandleSensor activates here */
function DragHandle({ listeners, attributes, style }) {
  return (
    <span
      data-dnd-handle="true"
      {...listeners}
      {...attributes}
      style={{
        cursor: 'grab',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 6,
        flexShrink: 0,
        touchAction: 'none',
        ...style,
      }}
    >
      <GripVertical size={18} />
    </span>
  );
}

/** Sortable item — does NOT spread listeners on wrapper, passes them via render prop */
function SortableItem({ id, as = 'tr', children, className = '', style = {} }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const itemStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    ...style,
  };
  const Tag = as;
  return (
    <Tag ref={setNodeRef} className={className} style={itemStyle}>
      {typeof children === 'function' ? children({ isDragging, listeners, attributes }) : children}
    </Tag>
  );
}

/**
 * Main wrapper for sortable lists.
 * @param {Array} items - Items to render.
 * @param {Function} onReorder - Callback with reordered items.
 * @param {string} [idKey='id'] - Unique key property.
 * @param {Function} children - Render fn receiving (item, index, { isDragging, listeners, attributes }).
 * @param {string} [as='tr'] - Wrapper element type.
 * @param {Function} [overlayRender] - Custom drag overlay render.
 * @param {boolean} [disabled] - Disable drag-and-drop.
 */
export default function SortableTableWrapper({
  items: externalItems,
  onReorder,
  idKey = 'id',
  children: renderRow,
  as = 'tr',
  overlayRender,
  disabled = false,
}) {
  const [localItems, setLocalItems] = useState(Array.isArray(externalItems) ? externalItems : []);
  const [activeId, setActiveId] = useState(null);
  const localRef = useRef(localItems);
  localRef.current = localItems;

  useEffect(() => {
    setLocalItems(Array.isArray(externalItems) ? externalItems : []);
  }, [externalItems]);

  const sensors = useSensors(
    useSensor(HandleSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragEnd = useCallback((event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const items = localRef.current;
    const oldIndex = items.findIndex((i) => String(i[idKey]) === String(active.id));
    const newIndex = items.findIndex((i) => String(i[idKey]) === String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(items, oldIndex, newIndex);
    setLocalItems(reordered);
    onReorder(reordered);
  }, [onReorder, idKey]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const activeItem = activeId ? localItems.find((i) => String(i[idKey]) === String(activeId)) : null;

  const dndAccessibility = as === 'tr' && typeof document !== 'undefined'
    ? { container: document.body }
    : undefined;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel} accessibility={dndAccessibility}>
      <SortableContext items={localItems.map((i) => String(i[idKey]))} strategy={verticalListSortingStrategy} disabled={disabled}>
        {localItems.map((item, idx) => (
          <SortableItem
            key={`${item[idKey]}-${idx}`}
            id={String(item[idKey])}
            as={as}
          >
            {(dndProps) => renderRow(item, idx, dndProps)}
          </SortableItem>
        ))}
      </SortableContext>
      <DragOverlay>
        {activeItem && overlayRender ? overlayRender(activeItem) : null}
      </DragOverlay>
    </DndContext>
  );
}

export { DragHandle };
