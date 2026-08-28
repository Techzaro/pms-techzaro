import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { MdVisibility, MdVisibilityOff } from "react-icons/md";
import { saveSuperAdminSession, getSuperAdminToken, clearSuperAdminSession } from "../../utils/auth";
import { getOrgBaseUrl } from "../../utils/domain";
import { api } from "./api/superAdminApi";
import "../../pages/Login.css";

function SuperAdminLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ email: "", password: "", form: "" });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // If there's a token, try to use it — but if all API calls fail,
    // user will see 401 errors. So when user navigates to login page,
    // it means they want to re-authenticate. Clear old session.
    clearSuperAdminSession();
  }, []);

  useEffect(() => {
    const urlMessage = searchParams.get("message");
    if (urlMessage) {
      setFieldErrors((prev) => ({ ...prev, form: urlMessage }));
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleLogin = async () => {
    const errors = { email: "", password: "", form: "" };

    if (!email.trim()) {
      errors.email = t("Please enter your email address.", { defaultValue: "Please enter your email address." });
    }
    if (!password.trim()) {
      errors.password = t("Please enter your password.", { defaultValue: "Please enter your password." });
    }
    if (errors.email || errors.password) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({ email: "", password: "", form: "" });
    setLoading(true);

    try {
      const data = await api.login(email, password, rememberMe);

      if (data.success) {
        saveSuperAdminSession(data.token, data.user || {}, rememberMe, data.expires_at);

        if (data.must_change_password) {
          navigate("/super-admin", { replace: true });
        } else {
          window.location.href = "/super-admin";
        }
      } else {
        setFieldErrors({ email: "", password: "", form: t(data.message || "Incorrect email or password.", { defaultValue: data.message || "Incorrect email or password." }) });
      }
    } catch (err) {
      let msg = err.message || "Something went wrong. Please try again.";
      if (msg.includes("429") || msg.includes("Too many")) {
        msg = "Too many failed login attempts. Please try again later.";
      }
      setFieldErrors({ email: "", password: "", form: t(msg, { defaultValue: msg }) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="overlay">
          <h1>{t('TECHXARO ADMIN', { defaultValue: 'TECHXARO ADMIN' })}</h1>
          <p>{t('Organization Management System', { defaultValue: 'Organization Management System' })}</p>
        </div>
      </div>

      <div className="login-right">
        <div className="login-box">
          <h2>{t('Super Admin', { defaultValue: 'Super Admin' })}</h2>
          <p className="subtitle">{t('Login to manage organizations', { defaultValue: 'Login to manage organizations' })}</p>

          {fieldErrors.form && <span className="field-error-text form-error">{fieldErrors.form}</span>}

          <input
            type="email"
            placeholder={t("Enter Email", { defaultValue: "Enter Email" })}
            value={email}
            onChange={(e) => { setEmail(e.target.value); setFieldErrors(prev => ({ ...prev, email: "", form: "" })); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("sa-login-password")?.focus(); } }}
            className={fieldErrors.email ? "field-error" : ""}
          />
          {fieldErrors.email && <span className="field-error-text">{fieldErrors.email}</span>}

          <div style={{ position: "relative", width: "100%", display: "block", marginBottom: "6px" }}>
            <input
              id="sa-login-password"
              type={showPassword ? "text" : "password"}
              placeholder={t("Enter Password", { defaultValue: "Enter Password" })}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setFieldErrors(prev => ({ ...prev, password: "", form: "" })); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleLogin(); } }}
              className={fieldErrors.password ? "field-error" : ""}
              style={{
                width: "100%",
                paddingRight: "45px",
                margin: 0,
                boxSizing: "border-box",
                display: "block"
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? t("Hide password", { defaultValue: "Hide password" }) : t("Show password", { defaultValue: "Show password" })}
              style={{
                position: "absolute",
                right: "4px",
                top: "0",
                bottom: "0",
                width: "40px",
                minWidth: "auto",
                height: "100%",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#64748b"
              }}
            >
              {showPassword ? <MdVisibilityOff size={20} /> : <MdVisibility size={20} />}
            </button>
          </div>
          {fieldErrors.password && <span className="field-error-text">{fieldErrors.password}</span>}

          <div className="bottom-area">
            <div className="options">
              <label className="remember-box">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                {t('Remember Me', { defaultValue: 'Remember Me' })}
              </label>
              <Link to="/super-admin/forgot-password" className="forgot-password">{t('Forgot Password?', { defaultValue: 'Forgot Password?' })}</Link>
            </div>

            <div className="button-area">
              <button
                onClick={handleLogin}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "14px",
                  background: loading ? "#94a3b8" : "#4f46e5",
                  color: "white",
                  border: "none",
                  borderRadius: "10px",
                  fontSize: "16px",
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "background 0.2s",
                }}
              >
                {loading ? t("Logging in...", { defaultValue: "Logging in..." }) : t("Login", { defaultValue: "Login" })}
              </button>
            </div>
          </div>

          <div style={{ textAlign: "center", marginTop: "24px" }}>
            <a href={`${getOrgBaseUrl()}/login`} style={{ color: "#4f46e5", fontSize: "14px", textDecoration: "none" }}>
              {t('← Back to PMS Login', { defaultValue: '← Back to PMS Login' })}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SuperAdminLogin;
