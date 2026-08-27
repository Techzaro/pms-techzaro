import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "./api/superAdminApi";
import "../../pages/ForgotPassword.css";

function SuperAdminForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [isLocked, setIsLocked] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldError("");

    if (!email.trim()) {
      setFieldError(t("Please enter your email address.", { defaultValue: "Please enter your email address." }));
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setFieldError(t("Please enter a valid email address.", { defaultValue: "Please enter a valid email address." }));
      return;
    }

    setLoading(true);

    try {
      const rawBase = import.meta.env.VITE_API_URL || "";
      const apiUrl = rawBase.replace(/\/+$/g, "");
      const res = await fetch(`${apiUrl}/super-admin/forgot-password`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.status === 403 && data.code === "PASSWORD_RESET_DISABLED") {
        setIsLocked(true);
        setFieldError(t(data.message || "Password recovery has been disabled for your account.", { defaultValue: data.message || "Password recovery has been disabled for your account." }));
        return;
      }

      if (!res.ok) {
        setFieldError(t(data.message || "Something went wrong. Please try again.", { defaultValue: data.message || "Something went wrong. Please try again." }));
        return;
      }

      setSent(true);
    } catch (err) {
      setFieldError(t(err.message || "Something went wrong. Please try again.", { defaultValue: err.message || "Something went wrong. Please try again." }));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="forgot-page">
        <div className="forgot-left">
          <div className="forgot-left-overlay">
            <img
              src="https://cdn-icons-png.flaticon.com/512/5968/5968705.png"
              alt="TechXaro Logo"
              className="forgot-left-logo"
            />
            <h1>{t('TECHXARO', { defaultValue: 'TECHXARO' })}</h1>
            <p>{t('Organization Management System', { defaultValue: 'Organization Management System' })}</p>
          </div>
        </div>

        <div className="forgot-right">
          <div className="forgot-box">
            <div className="forgot-success-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2>{t('Check Your Email', { defaultValue: 'Check Your Email' })}</h2>
            <p className="forgot-success-text">
              {t("We've sent a password reset link to {{email}}. Please check your inbox and follow the instructions.", { email, defaultValue: `We've sent a password reset link to ${email}. Please check your inbox and follow the instructions.` })}
            </p>
            <p className="forgot-success-note">
              {t("Didn't receive the email? Check your spam folder or try again.", { defaultValue: "Didn't receive the email? Check your spam folder or try again." })}
            </p>
            <div className="forgot-buttons">
              <button className="forgot-btn-primary" onClick={() => { setSent(false); setEmail(""); }}>
                {t('Send Again', { defaultValue: 'Send Again' })}
              </button>
              <Link to="/super-admin/login" className="forgot-btn-secondary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"/>
                  <polyline points="12 19 5 12 12 5"/>
                </svg>
                {t('Back to Login', { defaultValue: 'Back to Login' })}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="forgot-page">
      <div className="forgot-left">
        <div className="forgot-left-overlay">
          <img
            src="https://cdn-icons-png.flaticon.com/512/5968/5968705.png"
            alt="TechXaro Logo"
            className="forgot-left-logo"
          />
          <h1>{t('TECHXARO', { defaultValue: 'TECHXARO' })}</h1>
          <p>{t('Organization Management System', { defaultValue: 'Organization Management System' })}</p>
        </div>
      </div>

      <div className="forgot-right">
        <div className="forgot-box">
          <div className="forgot-top-link">
            <Link to="/super-admin/login" className="forgot-back-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"/>
                <polyline points="12 19 5 12 12 5"/>
              </svg>
              {t('Back to Login', { defaultValue: 'Back to Login' })}
            </Link>
          </div>

          <h2>{t('Forgot Password?', { defaultValue: 'Forgot Password?' })}</h2>
          <p className="forgot-subtitle">
            {t('No worries! Enter your email address and we will send you a link to reset your password.', { defaultValue: 'No worries! Enter your email address and we will send you a link to reset your password.' })}
          </p>

          {isLocked && (
            <div style={{
              padding: "16px",
              borderRadius: 12,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              marginBottom: 20,
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#991b1b" }}>
                  {t('Password Recovery Disabled', { defaultValue: 'Password Recovery Disabled' })}
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "#b91c1c", lineHeight: 1.5 }}>
                  {fieldError || t("Your password has been changed by your administrator. Password recovery has been disabled for your account.", { defaultValue: "Your password has been changed by your administrator. Password recovery has been disabled for your account." })}
                </p>
              </div>
            </div>
          )}

          {fieldError && !isLocked && <div className="forgot-error-box">{fieldError}</div>}

          <form onSubmit={handleSubmit}>
            <label className="forgot-label">{t('Email Address', { defaultValue: 'Email Address' })}</label>
            <div className="forgot-input-wrapper">
              <svg className="forgot-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              <input
                type="email"
                placeholder={t("Enter your email address", { defaultValue: "Enter your email address" })}
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFieldError(""); }}
                className={fieldError ? "field-error" : ""}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="forgot-submit-btn"
              style={{ width: "100%", marginTop: "16px" }}
            >
              {loading ? t("Sending...", { defaultValue: "Sending..." }) : t("Send Reset Link", { defaultValue: "Send Reset Link" })}
            </button>
          </form>

          <div className="forgot-divider">
            <span>{t('OR', { defaultValue: 'OR' })}</span>
          </div>

          <Link to="/super-admin/login" className="forgot-login-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
            {t('Back to Login', { defaultValue: 'Back to Login' })}
          </Link>
        </div>

        <div className="forgot-footer">
          &copy; {new Date().getFullYear()} TechXaro. {t('All rights reserved.', { defaultValue: 'All rights reserved.' })}
        </div>
      </div>
    </div>
  );
}

export default SuperAdminForgotPassword;
