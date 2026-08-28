/**
 * RegisterOrganization.jsx — Public Organization Registration Page
 *
 * Allows anyone to register their organization on the platform.
 * Flow: Fill form → Auto-generate password → Send welcome email → Show success
 */
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import API_URL from "../../config/api";
import { getOrgBaseUrl } from "../../utils/domain";
import "../Login.css";

function RegisterOrganization() {
  const { t } = useTranslation();
  const [step, setStep] = useState(1); // 1 = form, 2 = success
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [trialPlan, setTrialPlan] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/super-admin/public/plans`).then(r => r.json()).then(res => {
      const trial = (res.data || []).find(p => p.slug === 'trial');
      if (trial) setTrialPlan(trial);
    }).catch(() => {});
  }, []);

  const [form, setForm] = useState({
    company_name: "",
    name: "",
    email: "",
    phone: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    setError("");
  };

  const validate = () => {
    const errs = {};
    if (!form.company_name.trim()) errs.company_name = t("Company name is required", { defaultValue: "Company name is required" });
    if (!form.name.trim()) errs.name = t("Your name is required", { defaultValue: "Your name is required" });
    if (!form.email.trim()) {
      errs.email = t("Email is required", { defaultValue: "Email is required" });
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = t("Please enter a valid email address", { defaultValue: "Please enter a valid email address" });
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/super-admin/organizations/register`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company_name: form.company_name.trim(),
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || t("Registration failed. Please try again.", { defaultValue: "Registration failed. Please try again." }));
      }

      setStep(2);
    } catch (err) {
      setError(err.message || t("Something went wrong. Please try again.", { defaultValue: "Something went wrong. Please try again." }));
    } finally {
      setLoading(false);
    }
  };

  // Success state
  if (step === 2) {
    return (
      <div className="login-page">
        <div className="login-left">
          <div className="overlay">
            <img
              src="https://cdn-icons-png.flaticon.com/512/5968/5968705.png"
              alt="Techxaro Logo"
              className="logo"
            />
            <h1>{t("TECHXARO PMS", { defaultValue: "TECHXARO PMS" })}</h1>
            <p>{t('Manage Projects, Teams & Tasks Professionally', { defaultValue: 'Manage Projects, Teams & Tasks Professionally' })}</p>
          </div>
        </div>

        <div className="login-right">
          <div className="login-box" style={{ maxWidth: 420, textAlign: "center" }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>&#10003;</div>
            <h2 style={{ fontSize: 26, marginBottom: 12 }}>{t('Organization Created!', { defaultValue: 'Organization Created!' })}</h2>
            <p className="subtitle" style={{ marginBottom: 24, lineHeight: 1.7 }}>
              {t('Your organization has been successfully registered. We have sent login credentials to', { defaultValue: 'Your organization has been successfully registered. We have sent login credentials to' })}{' '}
              <strong>{form.email}</strong>.{' '}
              {t('Please check your inbox (and spam folder) for the welcome email.', { defaultValue: 'Please check your inbox (and spam folder) for the welcome email.' })}
            </p>

            <div
              style={{
                background: "#eff6ff",
                border: "2px solid #3b82f6",
                borderRadius: 12,
                padding: "16px 20px",
                marginBottom: 24,
                textAlign: "left",
              }}
            >
              <p style={{ color: "#1e40af", fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>
                {t("What's Next?", { defaultValue: "What's Next?" })}
              </p>
              <ol style={{ color: "#374151", fontSize: 13, lineHeight: 2, margin: 0, paddingLeft: 20 }}>
                <li>{t('Check your email for login credentials', { defaultValue: 'Check your email for login credentials' })}</li>
                <li>{t('Login at the portal with your email & temporary password', { defaultValue: 'Login at the portal with your email & temporary password' })}</li>
                <li>{t('Change your password when prompted', { defaultValue: 'Change your password when prompted' })}</li>
                <li>{t('Set up your organization and invite your team', { defaultValue: 'Set up your organization and invite your team' })}</li>
              </ol>
            </div>

            <a
              href={`${getOrgBaseUrl()}/login`}
              style={{
                display: "inline-block",
                padding: "12px 34px",
                background: "#1e90ff",
                color: "white",
                borderRadius: 9,
                fontSize: 15,
                fontWeight: 600,
                textDecoration: "none",
                width: "100%",
                textAlign: "center",
              }}
            >
              {t('Go to Login', { defaultValue: 'Go to Login' })}
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Registration form
  return (
    <div className="login-page">
      <div className="login-left">
        <div className="overlay">
          <img
            src="https://cdn-icons-png.flaticon.com/512/5968/5968705.png"
            alt="Techxaro Logo"
            className="logo"
          />
          <h1>{t("TECHXARO PMS", { defaultValue: "TECHXARO PMS" })}</h1>
          <p>{t('Manage Projects, Teams & Tasks Professionally', { defaultValue: 'Manage Projects, Teams & Tasks Professionally' })}</p>
        </div>
      </div>

      <div className="login-right">
        <div className="login-box" style={{ maxWidth: 420 }}>
          <h2>{t('Register Organization', { defaultValue: 'Register Organization' })}</h2>
          <p className="subtitle">
            {t('Create your organization and start managing projects', { defaultValue: 'Create your organization and start managing projects' })}
          </p>

          {error && <span className="field-error-text form-error">{error}</span>}

          <form onSubmit={handleSubmit}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
              {t('Company / Organization Name', { defaultValue: 'Company / Organization Name' })}
            </label>
            <input
              type="text"
              name="company_name"
              placeholder={t("e.g. Acme Solutions", { defaultValue: "e.g. Acme Solutions" })}
              value={form.company_name}
              onChange={handleChange}
              className={fieldErrors.company_name ? "field-error" : ""}
              style={{
                width: "100%",
                padding: "14px 16px",
                marginBottom: 6,
                border: `1px solid ${fieldErrors.company_name ? "#e74c3c" : "#dfe4ea"}`,
                borderRadius: 10,
                fontSize: 15,
                outline: "none",
                background: "#f1f2f6",
                color: "#2f3542",
              }}
            />
            {fieldErrors.company_name && <span className="field-error-text">{fieldErrors.company_name}</span>}

            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4, marginTop: 10 }}>
              {t('Your Full Name', { defaultValue: 'Your Full Name' })}
            </label>
            <input
              type="text"
              name="name"
              placeholder={t("e.g. John Smith", { defaultValue: "e.g. John Smith" })}
              value={form.name}
              onChange={handleChange}
              className={fieldErrors.name ? "field-error" : ""}
              style={{
                width: "100%",
                padding: "14px 16px",
                marginBottom: 6,
                border: `1px solid ${fieldErrors.name ? "#e74c3c" : "#dfe4ea"}`,
                borderRadius: 10,
                fontSize: 15,
                outline: "none",
                background: "#f1f2f6",
                color: "#2f3542",
              }}
            />
            {fieldErrors.name && <span className="field-error-text">{fieldErrors.name}</span>}

            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4, marginTop: 10 }}>
              {t('Personal Email (Gmail etc.)', { defaultValue: 'Personal Email (Gmail etc.)' })}
            </label>
            <input
              type="email"
              name="email"
              placeholder={t("e.g. john@gmail.com", { defaultValue: "e.g. john@gmail.com" })}
              value={form.email}
              onChange={handleChange}
              className={fieldErrors.email ? "field-error" : ""}
              style={{
                width: "100%",
                padding: "14px 16px",
                marginBottom: 6,
                border: `1px solid ${fieldErrors.email ? "#e74c3c" : "#dfe4ea"}`,
                borderRadius: 10,
                fontSize: 15,
                outline: "none",
                background: "#f1f2f6",
                color: "#2f3542",
              }}
            />
            {fieldErrors.email && <span className="field-error-text">{fieldErrors.email}</span>}

            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4, marginTop: 10 }}>
              {t('Phone Number', { defaultValue: 'Phone Number' })} <span style={{ color: "#9ca3af", fontWeight: 400 }}>({t('optional', { defaultValue: 'optional' })})</span>
            </label>
            <input
              type="tel"
              name="phone"
              placeholder={t("e.g. +92 300 1234567", { defaultValue: "e.g. +92 300 1234567" })}
              value={form.phone}
              onChange={handleChange}
              style={{
                width: "100%",
                padding: "14px 16px",
                marginBottom: 16,
                border: "1px solid #dfe4ea",
                borderRadius: 10,
                fontSize: 15,
                outline: "none",
                background: "#f1f2f6",
                color: "#2f3542",
              }}
            />

            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #22c55e",
                borderRadius: 10,
                padding: "12px 16px",
                marginBottom: 20,
              }}
            >
              <p style={{ color: "#166534", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                <strong>{trialPlan ? `${trialPlan.trial_duration || 14} ${t(trialPlan.trial_duration_unit || 'days', { defaultValue: trialPlan.trial_duration_unit || 'days' }).replace(/s$/, '')}` : t('14-day', { defaultValue: '14-day' })} {t('free trial', { defaultValue: 'free trial' })}</strong> — {t('No credit card required. Your password will be sent to your email.', { defaultValue: 'No credit card required. Your password will be sent to your email.' })}
              </p>
            </div>

            <div className="button-area">
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: "12px 34px",
                  background: loading ? "#93c5fd" : "#1e90ff",
                  color: "white",
                  border: "none",
                  borderRadius: 9,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  width: "100%",
                }}
              >
                {loading ? t("Creating Organization...", { defaultValue: "Creating Organization..." }) : t("Create Organization", { defaultValue: "Create Organization" })}
              </button>
            </div>
          </form>

          <p style={{ textAlign: "center", marginTop: 20, fontSize: 14, color: "#747d8c" }}>
            {t('Already have an account?', { defaultValue: 'Already have an account?' })}{" "}
            <a href={`${getOrgBaseUrl()}/login`} style={{ color: "#1e90ff", textDecoration: "none" }}>
              {t('Login', { defaultValue: 'Login' })}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default RegisterOrganization;
