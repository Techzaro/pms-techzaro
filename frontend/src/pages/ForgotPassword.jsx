import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import API_URL from "../config/api";
import { useSubmit } from "../hooks/useSubmit";
import LoadingButton from "../components/LoadingButton";
import "./ForgotPassword.css";

function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const [emailPolicy, setEmailPolicy] = useState(null);
  const [orgName, setOrgName] = useState("");
  const [policyLoading, setPolicyLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const { submitting, run } = useSubmit();

  useEffect(() => {
    const detectAndFetchPolicy = async () => {
      let orgSlug = searchParams.get("org");

      if (!orgSlug) {
        const hostname = window.location.hostname;
        const parts = hostname.split(".");
        if (parts.length > 2) {
          orgSlug = parts[0];
        }
      }

      if (orgSlug) {
        try {
          const res = await fetch(`${API_URL}/email-policy/${orgSlug}`);
          const data = await res.json();
          if (data.success) {
            setEmailPolicy(data.data.email_policy);
            setOrgName(data.data.organization_name);
          }
        } catch {
          setEmailPolicy(null);
        }
      } else {
        setEmailPolicy("standard");
      }
      setPolicyLoading(false);
    };

    detectAndFetchPolicy();
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldError("");

    if (!email.trim()) {
      setFieldError("Please enter your email address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setFieldError("Please enter a valid email address.");
      return;
    }

    await run(async () => {
      const res = await fetch(`${API_URL}/forgot-password`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        _notifHandled: true,
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.status === 403 && data.code === "PASSWORD_RESET_DISABLED") {
        setIsLocked(true);
        setFieldError(data.message || "Your password has been changed by your administrator. Please contact your administrator.");
        return;
      }

      if (res.status === 404 && data.code === "EMAIL_NOT_FOUND") {
        setFieldError(data.message || "This email is not registered in our system. Please contact our support team.");
        return;
      }

      if (res.status === 403 && data.code === "ACCOUNT_INACTIVE") {
        setFieldError(data.message || "This account has been deactivated. Please contact our support team.");
        return;
      }

      if (!res.ok) {
        setFieldError(data.message || "Something went wrong. Please try again.");
        return;
      }

      setSent(true);
    });
  };

  if (policyLoading) {
    return (
      <div className="forgot-page">
        <div className="forgot-left">
          <div className="forgot-left-overlay">
            <img src="https://cdn-icons-png.flaticon.com/512/5968/5968705.png" alt="PMS Logo" className="forgot-left-logo" />
            <h1>TECHXARO PMS</h1>
            <p>Manage Projects, Teams & Tasks Professionally</p>
          </div>
        </div>
        <div className="forgot-right">
          <div className="forgot-box" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
            <p style={{ color: "#6b7280" }}>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="forgot-page">
        <div className="forgot-left">
          <div className="forgot-left-overlay">
            <img src="https://cdn-icons-png.flaticon.com/512/5968/5968705.png" alt="PMS Logo" className="forgot-left-logo" />
            <h1>TECHXARO PMS</h1>
            <p>Manage Projects, Teams & Tasks Professionally</p>
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
            <h2>Check Your Email</h2>
            <p className="forgot-success-text">
              We've sent a password reset link to <strong>{email}</strong>.
              Please check your inbox and follow the instructions.
            </p>
            <p className="forgot-success-note">
              Didn't receive the email? Check your spam folder or try again.
            </p>
            <div className="forgot-buttons">
              <button className="forgot-btn-primary" onClick={() => { setSent(false); setEmail(""); }}>
                Send Again
              </button>
              <Link to="/" className="forgot-btn-secondary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"/>
                  <polyline points="12 19 5 12 12 5"/>
                </svg>
                Back to Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isCompanyRequired = emailPolicy === "company_required";

  return (
    <div className="forgot-page">
      <div className="forgot-left">
        <div className="forgot-left-overlay">
          <img src="https://cdn-icons-png.flaticon.com/512/5968/5968705.png" alt="PMS Logo" className="forgot-left-logo" />
          <h1>TECHXARO PMS</h1>
          <p>Manage Projects, Teams & Tasks Professionally</p>
        </div>
      </div>

      <div className="forgot-right">
        <div className="forgot-box">
          <div className="forgot-top-link">
            <Link to="/" className="forgot-back-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"/>
                <polyline points="12 19 5 12 12 5"/>
              </svg>
              Back to Login
            </Link>
          </div>

          <h2>Forgot Password?</h2>
          <p className="forgot-subtitle">
            {isCompanyRequired
              ? "Enter your company email address and we will send you a link to reset your password."
              : "No worries! Enter your email address and we will send you a link to reset your password."
            }
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
                  Password Recovery Disabled
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "#b91c1c", lineHeight: 1.5 }}>
                  Your password has been changed by your administrator. Password recovery has been disabled for your account. Please contact your administrator to regain access.
                </p>
              </div>
            </div>
          )}

          {fieldError && !isLocked && <div className="forgot-error-box">{fieldError}</div>}

          <form onSubmit={handleSubmit}>
            {isCompanyRequired ? (
              <>
                <label className="forgot-label">Company Email Address</label>
                <div className="forgot-input-wrapper">
                  <svg className="forgot-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                  </svg>
                  <input
                    type="email"
                    placeholder="Enter your company email address"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setFieldError(""); }}
                    className={fieldError ? "field-error" : ""}
                  />
                </div>
                <div className="forgot-info-box">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                  <div>
                    <strong>Use your company email</strong>
                    <span>Enter the professional email address you use to access your PMS account.</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <label className="forgot-label">Personal Email Address</label>
                <div className="forgot-input-wrapper">
                  <svg className="forgot-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <input
                    type="email"
                    placeholder="Enter your personal email address"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setFieldError(""); }}
                    className={fieldError ? "field-error" : ""}
                  />
                </div>
                <div className="forgot-info-box">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                  <div>
                    <strong>Use your personal email</strong>
                    <span>Enter the personal email address you use to log in to your PMS account.</span>
                  </div>
                </div>
              </>
            )}

            <LoadingButton type="submit" className="forgot-submit-btn" loading={submitting}>
              {submitting ? (
                <>
                  <span className="forgot-spinner"></span>
                  Sending...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                  Send Reset Link
                </>
              )}
            </LoadingButton>

            <p className="forgot-note">
              We will send you an email with instructions to reset your password.
            </p>
          </form>

          <div className="forgot-divider">
            <span>OR</span>
          </div>

          <Link to="/" className="forgot-login-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
            Back to Login
          </Link>
        </div>

        <div className="forgot-help-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
          </svg>
          <div>
            <strong>Need Help?</strong>
            <span>If you are having trouble resetting your password, please contact our support team.</span>
            <a href="mailto:support@pms.com">support@pms.com</a>
          </div>
        </div>

        <div className="forgot-footer">
          &copy; {new Date().getFullYear()} Project Management System (PMS). All rights reserved.
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;
