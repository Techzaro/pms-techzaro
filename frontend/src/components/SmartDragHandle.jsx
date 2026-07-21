import { useState } from 'react';
import { GripVertical } from 'lucide-react';

/**
 * SmartDragHandle - Shows business_id by default, swaps to drag handle on hover.
 * Listeners are always attached for drag to work; visual swap is CSS only.
 */
export default function SmartDragHandle({ listeners, attributes, businessId, color = '#2563eb' }) {
  const [hovered, setHovered] = useState(false);

  if (!businessId) return null;

  return (
    <span
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: hovered ? 'grab' : 'default',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        height: 28,
        touchAction: 'none',
        borderRadius: 6,
        transition: 'background 0.2s ease',
        background: hovered ? '#F3F4F6' : 'transparent',
        position: 'relative',
      }}
      {...listeners}
      {...attributes}
    >
      <span
        style={{
          opacity: hovered ? 0 : 1,
          transition: 'opacity 0.15s ease',
          fontSize: 12,
          fontWeight: 700,
          fontFamily: 'monospace',
          color,
          whiteSpace: 'nowrap',
          padding: '0 4px',
          pointerEvents: 'none',
        }}
      >
        {businessId}
      </span>
      <span
        style={{
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s ease',
          color: '#999',
          display: 'inline-flex',
          position: 'absolute',
          left: 0,
          pointerEvents: 'none',
        }}
      >
        <GripVertical size={16} />
      </span>
    </span>
  );
}
