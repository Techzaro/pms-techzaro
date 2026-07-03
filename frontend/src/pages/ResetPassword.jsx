import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import API_URL from "../config/api";
import { useSubmit } from "../hooks/useSubmit";
import LoadingButton from "../components/LoadingButton";
import "./ResetPassword.css";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({ password: "", confirmPassword: "" });
  const { submitting, run } = useSubmit();

  const getPasswordStrength = (pw) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[@$!%*?&#]/.test(pw)) score++;
    return score;
  };

  const getStrengthLabel = (score) => {
    if (score <= 1) return { label: "Very Weak", color: "#dc2626", bg: "#fef2f2" };
    if (score === 2) return { label: "Weak", color: "#ea580c", bg: "#fff7ed" };
    if (score === 3) return { label: "Fair", color: "#ca8a04", bg: "#fefce8" };
    if (score === 4) return { label: "Strong", color: "#16a34a", bg: "#f0fdf4" };
    return { label: "Very Strong", color: "#15803d", bg: "#f0fdf4" };
  };

  const validate = () => {
    const errors = { password: "", confirmPassword: "" };
    let valid = true;

    if (!password) {
      errors.password = "Please enter a new password.";
      valid = false;
    } else if (password.length < 8) {
      errors.password = "Password must be at least 8 characters long.";
      valid = false;
    } else if (!/[A-Z]/.test(password)) {
      errors.password = "Password must contain at least one uppercase letter.";
      valid = false;
    } else if (!/[a-z]/.test(password)) {
      errors.password = "Password must contain at least one lowercase letter.";
      valid = false;
    } else if (!/[0-9]/.test(password)) {
      errors.password = "Password must contain at least one number.";
      valid = false;
    } else if (!/[@$!%*?&#]/.test(password)) {
      errors.password = "Password must contain at least one special character (@$!%*?&#).";
      valid = false;
    }

    if (!confirmPassword) {
      errors.confirmPassword = "Please confirm your password.";
      valid = false;
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
      valid = false;
    }

    setFieldErrors(errors);
    return valid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!validate()) return;

    if (!token || !email) {
      setError("Invalid or expired reset link. Please request a new one.");
      return;
    }

    await run(async () => {
      const res = await fetch(`${API_URL}/reset-password`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        _notifHandled: true,
        body: JSON.stringify({
          email,
          token,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Failed to reset password. Please try again.");
        return;
      }

      setSuccess(true);
    });
  };

  if (!token || !email) {
    return (
      <div className="reset-page">
        <div className="reset-left">
          <div className="reset-left-overlay">
            <img
              src="https://cdn-icons-png.flaticon.com/512/5968/5968705.png"
              alt="PMS Logo"
              className="reset-left-logo"
            />
            <h1>TECHXARO PMS</h1>
            <p>Manage Projects, Teams & Tasks Professionally</p>
          </div>
        </div>

        <div className="reset-right">
          <div className="reset-box">
            <div className="reset-error-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>
            <h2>Invalid Reset Link</h2>
            <p className="reset-error-text">
              This password reset link is invalid or has expired.
              Please request a new one.
            </p>
            <Link to="/forgot-password" className="reset-submit-btn" style={{ textAlign: "center", textDecoration: "none" }}>
              Request New Link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="reset-page">
        <div className="reset-left">
          <div className="reset-left-overlay">
            <img
              src="https://cdn-icons-png.flaticon.com/512/5968/5968705.png"
              alt="PMS Logo"
              className="reset-left-logo"
            />
            <h1>TECHXARO PMS</h1>
            <p>Manage Projects, Teams & Tasks Professionally</p>
          </div>
        </div>

        <div className="reset-right">
          <div className="reset-box">
            <div className="reset-success-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2>Password Reset Successful</h2>
            <p className="reset-success-text">
              Your password has been reset successfully.
              You can now log in with your new password.
            </p>
            <Link to="/" className="reset-submit-btn" style={{ textAlign: "center", textDecoration: "none" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"/>
                <polyline points="12 19 5 12 12 5"/>
              </svg>
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const strength = getPasswordStrength(password);
  const strengthInfo = getStrengthLabel(strength);

  return (
    <div className="reset-page">
      <div className="reset-left">
        <div className="reset-left-overlay">
          <img
            src="https://cdn-icons-png.flaticon.com/512/5968/5968705.png"
            alt="PMS Logo"
            className="reset-left-logo"
          />
          <h1>TECHXARO PMS</h1>
          <p>Manage Projects, Teams & Tasks Professionally</p>
        </div>
      </div>

      <div className="reset-right">
        <div className="reset-box">
          <div className="reset-top-link">
            <Link to="/" className="reset-back-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"/>
                <polyline points="12 19 5 12 12 5"/>
              </svg>
              Back to Login
            </Link>
          </div>

          <h2>Reset Password</h2>
          <p className="reset-subtitle">
            Enter your new password below. Make sure it's strong and secure.
          </p>

          {error && <div className="reset-error-box">{error}</div>}

          <form onSubmit={handleSubmit}>
            <label className="reset-label">New Password</label>
            <div className="reset-input-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter new password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setFieldErrors(prev => ({ ...prev, password: "" })); }}
                className={fieldErrors.password ? "field-error" : ""}
              />
              <button
                type="button"
                className="reset-toggle-pw"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? (
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
            </div>
            {fieldErrors.password && <span className="reset-field-error">{fieldErrors.password}</span>}

            {password && (
              <div className="reset-strength">
                <div className="reset-strength-bar">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="reset-strength-segment"
                      style={{
                        backgroundColor: i <= strength ? strengthInfo.color : "#e5e7eb",
                      }}
                    />
                  ))}
                </div>
                <span className="reset-strength-label" style={{ color: strengthInfo.color }}>
                  {strengthInfo.label}
                </span>
              </div>
            )}

            <div className="reset-password-rules">
              <p className="reset-rules-title">Password must contain:</p>
              <div className="reset-rules-grid">
                <span className={password.length >= 8 ? "rule-met" : ""}>
                  {password.length >= 8 ? "✓" : "○"} At least 8 characters
                </span>
                <span className={/[A-Z]/.test(password) ? "rule-met" : ""}>
                  {/[A-Z]/.test(password) ? "✓" : "○"} One uppercase letter
                </span>
                <span className={/[a-z]/.test(password) ? "rule-met" : ""}>
                  {/[a-z]/.test(password) ? "✓" : "○"} One lowercase letter
                </span>
                <span className={/[0-9]/.test(password) ? "rule-met" : ""}>
                  {/[0-9]/.test(password) ? "✓" : "○"} One number
                </span>
                <span className={/[@$!%*?&#]/.test(password) ? "rule-met" : ""}>
                  {/[@$!%*?&#]/.test(password) ? "✓" : "○"} One special character
                </span>
              </div>
            </div>

            <label className="reset-label">Confirm Password</label>
            <div className="reset-input-wrapper">
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors(prev => ({ ...prev, confirmPassword: "" })); }}
                className={fieldErrors.confirmPassword ? "field-error" : ""}
              />
              <button
                type="button"
                className="reset-toggle-pw"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
              >
                {showConfirmPassword ? (
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
            </div>
            {fieldErrors.confirmPassword && <span className="reset-field-error">{fieldErrors.confirmPassword}</span>}

            <LoadingButton type="submit" className="reset-submit-btn" loading={submitting}>
              {submitting ? (
                <>
                  <span className="reset-spinner"></span>
                  Resetting...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  Reset Password
                </>
              )}
            </LoadingButton>
          </form>
        </div>

        <div className="reset-footer">
          &copy; {new Date().getFullYear()} Project Management System (PMS). All rights reserved.
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
