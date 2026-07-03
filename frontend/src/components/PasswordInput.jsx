import { useState } from "react";
import "./PasswordInput.css";

const PASSWORD_RULES = [
  { key: "length", test: (pw) => pw.length >= 8, label: "At least 8 characters" },
  { key: "upper", test: (pw) => /[A-Z]/.test(pw), label: "One uppercase letter" },
  { key: "lower", test: (pw) => /[a-z]/.test(pw), label: "One lowercase letter" },
  { key: "number", test: (pw) => /[0-9]/.test(pw), label: "One number" },
  { key: "special", test: (pw) => /[@$!%*?&#]/.test(pw), label: "One special character (@$!%*?&#)" },
];

export function getPasswordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[@$!%*?&#]/.test(pw)) score++;
  return score;
}

export function getStrengthLabel(score) {
  if (score <= 1) return { label: "Very Weak", color: "#dc2626" };
  if (score === 2) return { label: "Weak", color: "#ea580c" };
  if (score === 3) return { label: "Fair", color: "#ca8a04" };
  if (score === 4) return { label: "Strong", color: "#16a34a" };
  return { label: "Very Strong", color: "#15803d" };
}

export function isPasswordValid(pw) {
  return PASSWORD_RULES.every((r) => r.test(pw));
}

export function PasswordInput({
  id,
  name,
  value,
  onChange,
  placeholder,
  label,
  showToggle = true,
  showStrength = true,
  showRules = true,
  error,
  disabled,
}) {
  const [show, setShow] = useState(false);
  const strength = getPasswordStrength(value);
  const strengthInfo = getStrengthLabel(strength);

  return (
    <div className="pw-field">
      {label && <label htmlFor={id} className="pw-label">{label}</label>}
      <div className="pw-input-wrap">
        <input
          id={id}
          type={show ? "text" : "password"}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          className={`pw-input ${error ? "pw-input-error" : ""}`}
          autoComplete="new-password"
        />
        {showToggle && (
          <button type="button" className="pw-toggle" onClick={() => setShow(!show)} tabIndex={-1}>
            {show ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        )}
      </div>

      {error && <span className="pw-error">{error}</span>}

      {showStrength && value && (
        <div className="pw-strength">
          <div className="pw-strength-bar">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="pw-strength-seg" style={{ backgroundColor: i <= strength ? strengthInfo.color : "#e5e7eb" }} />
            ))}
          </div>
          <span className="pw-strength-label" style={{ color: strengthInfo.color }}>{strengthInfo.label}</span>
        </div>
      )}

      {showRules && (
        <div className="pw-rules">
          {PASSWORD_RULES.map((rule) => (
            <span key={rule.key} className={value && rule.test(value) ? "pw-rule-met" : ""}>
              {value && rule.test(value) ? "✓" : "○"} {rule.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
