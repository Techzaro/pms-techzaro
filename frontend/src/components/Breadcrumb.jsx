import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import "./Breadcrumb.css";

/**
 * Reusable Breadcrumb Navigation Component
 * @param {Array} items - Array of breadcrumb items [{label, path}]
 *                        Last item should NOT have a path (current page)
 */
export default function Breadcrumb({ items = [] }) {
  if (!items || items.length === 0) return null;

  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <span key={index} className="breadcrumb-item">
            {index > 0 && (
              <ChevronRight size={14} className="breadcrumb-separator" />
            )}
            {isLast || !item.path ? (
              <span className="breadcrumb-current">{item.label}</span>
            ) : (
              <Link to={item.path} className="breadcrumb-link">
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
