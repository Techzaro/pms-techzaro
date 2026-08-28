/**
 * Breadcrumb.jsx
 * Reusable breadcrumb navigation component for indicating page hierarchy.
 * Renders clickable links for parent pages and a plain label for the current page.
 */

import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./Breadcrumb.css";

/**
 * Reusable Breadcrumb Navigation Component
 * @param {Array} items - Array of breadcrumb items [{label, path}]
 *                        Last item should NOT have a path (current page)
 */
export default function Breadcrumb({ items = [] }) {
  const { t } = useTranslation();
  if (!items || items.length === 0) return null;

  // Sanitize labels (strip extra slashes or separators) and deduplicate consecutive identical items
  const cleanedItems = items.reduce((acc, item) => {
    if (!item || !item.label) return acc;
    const cleanLabel = String(item.label).replace(/[/\\>]+/g, "").trim();
    if (!cleanLabel) return acc;
    if (acc.length > 0 && acc[acc.length - 1].label === cleanLabel) {
      return acc;
    }
    acc.push({ ...item, label: cleanLabel });
    return acc;
  }, []);

  if (cleanedItems.length === 0) return null;

  return (
    <nav className="breadcrumb" aria-label={t("Breadcrumb", { defaultValue: "Breadcrumb" })}>
      {cleanedItems.map((item, index) => {
        const isLast = index === cleanedItems.length - 1;
        const translatedLabel = t(item.label);

        return (
          <span key={index} className="breadcrumb-item">
            {index > 0 && (
              <ChevronRight size={14} className="breadcrumb-separator" />
            )}
            {isLast || !item.path ? (
              <span className="breadcrumb-current">{translatedLabel}</span>
            ) : (
              <Link to={item.path} className="breadcrumb-link">
                {translatedLabel}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
