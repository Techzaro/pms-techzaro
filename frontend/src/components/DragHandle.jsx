/**
 * DragHandle.jsx
 * Reusable drag handle component for drag-and-drop interfaces.
 * Renders a grip icon that users can grab to reorder items.
 */

import { GripVertical } from 'lucide-react';

/**
 * Drag handle with a grip icon for drag-and-drop reordering.
 * Spreads dnd-kit listeners and attributes onto the element.
 * @param {Object} listeners - dnd-kit drag listeners
 * @param {Object} attributes - dnd-kit drag attributes
 * @param {string} [className=''] - Additional CSS class names
 */
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
