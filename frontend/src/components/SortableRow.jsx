import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export default function SortableRow({ id, children, as = 'tr', className = '', style = {} }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const sortStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    ...style,
  };

  if (as === 'tr') {
    return (
      <tr
        ref={setNodeRef}
        className={className}
        style={sortStyle}
      >
        {children({ attributes, listeners, setNodeRef, isDragging })}
      </tr>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={className}
      style={sortStyle}
    >
      {children({ attributes, listeners, setNodeRef, isDragging })}
    </div>
  );
}
