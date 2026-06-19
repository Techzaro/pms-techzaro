import { useState, useCallback, useRef, useEffect } from 'react';
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

function DragHandle({ style = {} }) {
  return (
    <span style={{ cursor: 'grab', display: 'inline-flex', alignItems: 'center', padding: '2px 6px', touchAction: 'none', color: '#999', ...style }}>
      <GripVertical size={16} />
    </span>
  );
}

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
    <Tag ref={setNodeRef} className={className} style={itemStyle} {...listeners} {...attributes}>
      {typeof children === 'function' ? children({ isDragging }) : children}
    </Tag>
  );
}

export default function SortableTableWrapper({
  items: externalItems,
  onReorder,
  idKey = 'id',
  children: renderRow,
  as = 'tr',
  overlayRender,
  disabled = false,
}) {
  const [localItems, setLocalItems] = useState(externalItems || []);
  const [activeId, setActiveId] = useState(null);
  const localRef = useRef(localItems);
  localRef.current = localItems;

  useEffect(() => {
    setLocalItems(externalItems || []);
  }, [externalItems]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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