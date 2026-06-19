import { GripVertical } from 'lucide-react';

export default function DragHandle({ listeners, attributes, className = '' }) {
  return (
    <span
      className={`drag-handle ${className}`}
      style={{
        cursor: 'grab',
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 6px',
        touchAction: 'none',
        color: '#999',
      }}
      {...listeners}
      {...attributes}
    >
      <GripVertical size={16} />
    </span>
  );
}
