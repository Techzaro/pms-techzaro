/**
 * LoadingButton.jsx — Reusable button with built-in loading/disabled state.
 *
 * Shows a spinner and "Processing..." text while `loading` is true.
 * Automatically disabled during loading to prevent double submissions.
 * Accepts all standard button props (className, style, type, etc.).
 */
import { useTranslation } from "react-i18next";
import "./LoadingButton.css";

function LoadingButton({
  children,
  loading = false,
  disabled = false,
  className = "",
  type = "button",
  onClick,
  ...rest
}) {
  const { t } = useTranslation();
  const isDisabled = loading || disabled;

  return (
    <button
      type={type}
      className={`lb-btn ${className} ${loading ? "lb-btn--loading" : ""}`}
      disabled={isDisabled}
      onClick={onClick}
      {...rest}
    >
      {loading && (
        <span className="lb-spinner">
          <svg className="lb-spinner-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
        </span>
      )}
      <span className="lb-text">{loading ? t("Processing...", { defaultValue: "Processing..." }) : children}</span>
    </button>
  );
}

export default LoadingButton;
