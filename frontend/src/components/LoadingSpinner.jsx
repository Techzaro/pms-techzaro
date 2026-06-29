/**
 * LoadingSpinner.jsx
 * Full-screen overlay with a CSS-animated loading spinner.
 * Used as a global loading indicator across the application.
 */

import { memo } from "react";
import "./LoadingSpinner.css";

/** Displays a centered loading spinner overlay. Memoized to prevent unnecessary re-renders. */
const LoadingSpinner = memo(function LoadingSpinner() {
  return (
    <div className="loading-spinner-overlay">
      <div className="loading-spinner" />
    </div>
  );
});

export default LoadingSpinner;
