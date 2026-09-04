import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { subscribe, publish } from "../utils/eventBus";
import "./VerificationBanner.css";

function VerificationBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [skipLoading, setSkipLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem("vb_dismissed") === "true";
  });
  const [daysRemaining, setDaysRemaining] = useState(null);

  const checkStatus = () => {
    const token = authToken();
    if (!token) return;
    const dismissed = sessionStorage.getItem("vb_dismissed");
    if (dismissed === "true") return;
    fetch(`${API_URL}/email/verification-status?t=${Date.now()}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      _notifHandled: true,
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && (data.show_banner || data.needs_verification)) {
          setVisible(true);
          setDaysRemaining(data.days_remaining || null);
        } else {
          setVisible(false);
          setDaysRemaining(null);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    checkStatus();
    const unsub = subscribe("email:verified", () => {
      setVisible(false);
      setShowPopup(false);
      sessionStorage.removeItem("vb_dismissed");
    });
    return unsub;
  }, []);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSendCode = async () => {
    setShowPopup(true);
    setCode(["", "", "", "", "", ""]);
    setCountdown(60);
    setVerifyLoading(true);
    setTimeout(() => document.getElementById("banner-code-0")?.focus(), 50);
    try {
      const res = await fetch(`${API_URL}/email/send-code`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken()}`,
        },
      });
      const data = await res.json();
    } catch {
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleCodeChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    if (value && index < 5) {
      document.getElementById(`banner-code-${index + 1}`)?.focus();
    }
    if (newCode.every((d) => d !== "") && newCode.join("").length === 6) {
      handleVerifyCode(newCode.join(""));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      document.getElementById(`banner-code-${index - 1}`)?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      const newCode = pasted.split("");
      setCode(newCode);
      document.getElementById("banner-code-5")?.focus();
      handleVerifyCode(pasted);
    }
  };

  const handleVerifyCode = async (codeStr) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/email/verify-code`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken()}`,
        },
        body: JSON.stringify({ code: codeStr }),
      });
      const data = await res.json();
      if (data.success) {
        setVisible(false);
        setShowPopup(false);
        publish("email:verified");
      } else {
        setCode(["", "", "", "", "", ""]);
        document.getElementById("banner-code-0")?.focus();
      }
    } catch {
      setCode(["", "", "", "", "", ""]);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setSkipLoading(true);
    try {
      const res = await fetch(`${API_URL}/email/skip-verification`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken()}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        setVisible(false);
        setShowPopup(false);
        sessionStorage.setItem("vb_dismissed", "true");
      }
    } catch {
    } finally {
      setSkipLoading(false);
    }
  };

  const getBannerText = () => {
    if (daysRemaining !== null && daysRemaining > 0) {
      if (daysRemaining === 1) {
        return t("Please verify your email address — today is the last day", { defaultValue: "Please verify your email address — today is the last day" });
      }
      return t("Please verify your email address — {{days}} days remaining", { days: daysRemaining, defaultValue: `Please verify your email address — ${daysRemaining} days remaining` });
    }
    return t("Please verify your email address", { defaultValue: "Please verify your email address" });
  };

  if (!visible || dismissed) return null;

  return (
    <>
      <div className="verification-banner">
        <div className="vb-content">
          <span className="vb-icon">✉</span>
          <span className="vb-text">
            {getBannerText()}
          </span>
        </div>
        <div className="vb-actions">
          <button className="vb-btn vb-verify" onClick={handleSendCode} disabled={verifyLoading}>
            {verifyLoading ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: 12, height: 12, animation: "spin 0.8s linear infinite" }}>
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                {t("Processing...", { defaultValue: "Processing..." })}
              </span>
            ) : t("Verify Now", { defaultValue: "Verify Now" })}
          </button>
          <button className="vb-btn vb-skip" onClick={handleSkip} disabled={skipLoading}>
            {skipLoading ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: 12, height: 12, animation: "spin 0.8s linear infinite" }}>
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                {t("Processing...", { defaultValue: "Processing..." })}
              </span>
            ) : t("Skip for now", { defaultValue: "Skip for now" })}
          </button>
        </div>
      </div>

      {showPopup && createPortal(
        <div className="vb-popup-overlay" onClick={() => setShowPopup(false)}>
          <div className="vb-popup" onClick={(e) => e.stopPropagation()}>
            <h3>{t("Verify Your Email", { defaultValue: "Verify Your Email" })}</h3>
            <p>{t("Enter the 6-digit code sent to your email", { defaultValue: "Enter the 6-digit code sent to your email" })}</p>
            <div className="vb-code-inputs" onPaste={handlePaste}>
              {code.map((digit, i) => (
                <input
                  key={i}
                  id={`banner-code-${i}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleCodeChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="vb-code-input"
                  autoFocus={i === 0}
                />
              ))}
            </div>
            <button
              className="vb-popup-resend"
              onClick={handleSendCode}
              disabled={countdown > 0 || verifyLoading}
            >
              {countdown > 0
                ? t("Resend in {{s}}s", { s: countdown, defaultValue: `Resend in ${countdown}s` })
                : t("Resend Code", { defaultValue: "Resend Code" })}
            </button>
            <div className="vb-popup-actions">
              <button className="vb-popup-cancel" onClick={() => setShowPopup(false)}>
                {t("Cancel", { defaultValue: "Cancel" })}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default VerificationBanner;
