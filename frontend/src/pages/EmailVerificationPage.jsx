import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import API_URL from "../config/api";
import { authToken, getUser, getTenantSlug } from "../utils/auth";
import { publish } from "../utils/eventBus";
import "./EmailVerificationPage.css";

function EmailVerificationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState("initial"); // initial | code_sent | verifying
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = getUser();
    setUser(stored);
  }, []);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSendCode = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/email/send-code`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken()}`,
        },
        _notifHandled: true,
      });
      const data = await res.json();
      if (data.success) {
        setStep("code_sent");
        setCountdown(60);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    // Auto-focus next input
    if (value && index < 5) {
      document.getElementById(`code-${index + 1}`)?.focus();
    }
    // Auto-submit when all 6 digits entered
    if (newCode.every((d) => d !== "") && newCode.join("").length === 6) {
      handleVerifyCode(newCode.join(""));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      document.getElementById(`code-${index - 1}`)?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      const newCode = pasted.split("");
      setCode(newCode);
      document.getElementById("code-5")?.focus();
      handleVerifyCode(pasted);
    }
  };

  const handleVerifyCode = async (codeStr) => {
    setLoading(true);
    setStep("verifying");
    try {
      const res = await fetch(`${API_URL}/email/verify-code`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken()}`,
        },
        body: JSON.stringify({ code: codeStr }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (data.success) {
        publish("email:verified");
        const slug = getTenantSlug();
        window.location.href = `/org/${slug}/dashboard`;
      } else {
        setStep("code_sent");
        setCode(["", "", "", "", "", ""]);
        document.getElementById("code-0")?.focus();
      }
    } catch {
      setStep("code_sent");
      setCode(["", "", "", "", "", ""]);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/email/skip-verification`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken()}`,
        },
        _notifHandled: true,
      });
      const data = await res.json();
      if (data.success) {
        const slug = getTenantSlug();
        window.location.href = `/org/${slug}/dashboard`;
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="email-verification-page">
      <div className="ev-container">
        <div className="ev-header">
          <div className="ev-icon">✉</div>
          <h1>{t("Verify Your Email", { defaultValue: "Verify Your Email" })}</h1>
          <p className="ev-subtitle">
            {t("Please verify your email address to continue.", { defaultValue: "Please verify your email address to continue." })}
          </p>
          {user && (
            <p className="ev-email">{user.email || user.personal_email || ""}</p>
          )}
        </div>

        {step === "initial" && (
          <div className="ev-body">
            <button className="ev-btn ev-btn-primary" onClick={handleSendCode} disabled={loading}>
              {loading ? t("Sending...", { defaultValue: "Sending..." }) : t("Send Verification Code", { defaultValue: "Send Verification Code" })}
            </button>
            <button className="ev-btn ev-btn-secondary" onClick={handleSkip} disabled={loading}>
              {t("Do it later", { defaultValue: "Do it later" })}
            </button>
          </div>
        )}

        {step === "code_sent" && (
          <div className="ev-body">
            <p className="ev-code-label">
              {t("Enter the 6-digit code sent to your email", { defaultValue: "Enter the 6-digit code sent to your email" })}
            </p>
            <div className="ev-code-inputs" onPaste={handlePaste}>
              {code.map((digit, i) => (
                <input
                  key={i}
                  id={`code-${i}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleCodeChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="ev-code-input"
                  autoFocus={i === 0}
                />
              ))}
            </div>
            <button
              className="ev-btn ev-btn-text"
              onClick={handleSendCode}
              disabled={countdown > 0 || loading}
            >
              {countdown > 0
                ? t("Resend in {{s}}s", { s: countdown, defaultValue: `Resend in ${countdown}s` })
                : t("Resend Code", { defaultValue: "Resend Code" })}
            </button>
            <button className="ev-btn ev-btn-secondary" onClick={handleSkip} disabled={loading}>
              {t("Do it later", { defaultValue: "Do it later" })}
            </button>
          </div>
        )}

        {step === "verifying" && (
          <div className="ev-body">
            <div className="ev-spinner"></div>
            <p>{t("Verifying...", { defaultValue: "Verifying..." })}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default EmailVerificationPage;
