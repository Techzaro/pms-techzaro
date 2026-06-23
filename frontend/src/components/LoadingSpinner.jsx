import { memo } from "react";
import "./LoadingSpinner.css";

const LoadingSpinner = memo(function LoadingSpinner() {
  return (
    <div className="loading-spinner-overlay">
      <div className="loading-spinner" />
    </div>
  );
});

export default LoadingSpinner;
