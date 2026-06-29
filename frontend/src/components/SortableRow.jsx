/**
 * SortableRow.jsx
 * A wrapper component that makes table rows or div elements sortable using
 * the @dnd-kit library. Provides drag-and-drop reordering via the render
 * props pattern, passing drag attributes and listeners to children.
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * Makes a child element sortable via drag and drop.
 * @param {*} id - Unique identifier for the sortable item.
 * @param {React.ReactNode|Function} children - Child content or render function receiving dnd props.
 * @param {string} [as='tr'] - Element type to render ('tr' or 'div').
 * @param {string} [className] - Optional CSS class name.
 * @param {Object} [style] - Optional inline styles.
 */
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
