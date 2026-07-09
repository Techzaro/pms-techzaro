/**
 * SortableTableWrapper.jsx
 * Provides drag-and-drop reordering for table rows or div lists using @dnd-kit.
 * Manages the local item state, handles drag events, and notifies the parent
 * of reorder changes. Includes a DragOverlay for visual feedback during drag.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

/** Visual drag handle icon component — use with handleOnly mode */
function DragHandle({ listeners = {}, attributes = {}, className = '', style = {} }) {
  return (
    <span
      className={`row-drag-handle ${className}`}
      style={{ cursor: 'grab', display: 'inline-flex', alignItems: 'center', touchAction: 'none', color: '#9ca3af', ...style }}
      {...listeners}
      {...attributes}
    >
      <GripVertical size={16} />
    </span>
  );
}

/**
 * Individual sortable item that wraps each row/div in the sortable context.
 * Applies transform styles and passes drag listeners to children.
 * When handleOnly=true, listeners are NOT spread on the row — only passed to children.
 */
function SortableItem({ id, as = 'tr', children, className = '', style = {}, handleOnly = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const itemStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    ...style,
  };
  const Tag = as;
  return (
    <Tag
      ref={setNodeRef}
      className={className}
      style={itemStyle}
      {...(handleOnly ? {} : { ...listeners, ...attributes })}
    >
      {typeof children === 'function' ? children({ isDragging, listeners, attributes }) : children}
    </Tag>
  );
}

/**
 * Main wrapper component for sortable lists/tables.
 * @param {Array} items - Array of items to render.
 * @param {Function} onReorder - Callback with the reordered items array.
 * @param {string} [idKey='id'] - Property name used as unique key for each item.
 * @param {Function} children - Render function receiving (item, index, dndProps).
 * @param {string} [as='tr'] - Element type for each sortable item.
 * @param {Function} [overlayRender] - Custom render function for the drag overlay.
 * @param {boolean} [disabled] - Disables drag-and-drop when true.
 */
export default function SortableTableWrapper({
  items: externalItems,
  onReorder,
  idKey = 'id',
  children: renderRow,
  as = 'tr',
  overlayRender,
  disabled = false,
  handleOnly = false,
}) {
  const [localItems, setLocalItems] = useState(Array.isArray(externalItems) ? externalItems : []);
  const [activeId, setActiveId] = useState(null);
  const localRef = useRef(localItems);
  localRef.current = localItems;

  useEffect(() => {
    setLocalItems(Array.isArray(externalItems) ? externalItems : []);
  }, [externalItems]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragEnd = useCallback((event) => {
    setActiveId(null);
    const { active, over } = event;
    // Exit early if no valid drop target or dropped on same position
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

  // When rendered inside <tbody>, portal the DndKit accessibility <div> to <body>
  // to avoid "div cannot be a child of tbody" HTML nesting warnings.
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
            handleOnly={handleOnly}
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