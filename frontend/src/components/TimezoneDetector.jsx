/**
 * @file TimezoneDetector.jsx
 * @description Smart Device Timezone Detection & Prompt Component (SRS Sections 4 & 5).
 * Non-blocking prompt that asks the user for explicit consent if their browser's
 * current timezone differs from their saved profile timezone.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Clock, Check, X } from "lucide-react";
import { detectDeviceTimezone } from "../utils/timezoneUtils";
import { getUser, setUser, getCurrentRole, authToken } from "../utils/auth";
import API_URL from "../config/api";
import { notify } from "../utils/notify";

export default function TimezoneDetector() {
  const { t } = useTranslation();
  const [showPrompt, setShowPrompt] = useState(false);
  const [deviceTz, setDeviceTz] = useState("");
  const [savedTz, setSavedTz] = useState("");
  const [updating, setUpdating] = useState(false);

  const checkTimezoneMismatch = useCallback(() => {
    try {
      const token = authToken();
      if (!token) {
        setShowPrompt(false);
        return;
      }

      // Check if user already dismissed the prompt for this browser session
      const isDismissed = sessionStorage.getItem("tx_tz_prompt_dismissed");
      if (isDismissed === "true") {
        setShowPrompt(false);
        return;
      }

      const detected = detectDeviceTimezone();
      setDeviceTz(detected);

      const user = getUser();
      const currentSaved = user?.timezone || "";
      setSavedTz(currentSaved);

      // If detected timezone differs from saved timezone, show prompt
      if (detected && detected !== currentSaved) {
        setShowPrompt(true);
      } else {
        setShowPrompt(false);
      }
    } catch (err) {
      console.warn("Timezone detection check error:", err);
    }
  }, []);

  useEffect(() => {
    // Initial check after mount
    const timer = setTimeout(() => {
      checkTimezoneMismatch();
    }, 1500);

    return () => clearTimeout(timer);
  }, [checkTimezoneMismatch]);

  // Handle user clicking "Update to [Detected]"
  const handleUpdate = async () => {
    if (!deviceTz) return;
    setUpdating(true);

    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/regional-settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ timezone: deviceTz }),
        _notifHandled: true,
      });

      if (res.ok) {
        const data = await res.json();
        const role = getCurrentRole();
        const user = getUser(role);
        if (user) {
          user.timezone = deviceTz;
          setUser(role, user);
        }

        sessionStorage.setItem("tx_tz_prompt_dismissed", "true");
        setShowPrompt(false);
        notify.success(t("Timezone successfully updated to {{tz}}", { tz: deviceTz, defaultValue: `Timezone successfully updated to ${deviceTz}` }));
        window.dispatchEvent(new CustomEvent("regional-settings:updated", { detail: { timezone: deviceTz } }));
      } else {
        notify.error(t("Failed to update timezone setting.", { defaultValue: "Failed to update timezone setting." }));
      }
    } catch (err) {
      console.error("Error updating timezone:", err);
      notify.error(t("Network error while updating timezone.", { defaultValue: "Network error while updating timezone." }));
    } finally {
      setUpdating(false);
    }
  };

  // Handle user clicking "Keep [Saved]" or closing the prompt
  const handleDismiss = () => {
    sessionStorage.setItem("tx_tz_prompt_dismissed", "true");
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 9999,
        maxWidth: "420px",
        width: "calc(100vw - 48px)",
        background: "var(--bg-card, #ffffff)",
        color: "var(--text-primary, #1e293b)",
        border: "1px solid var(--color-primary, #4f46e5)",
        borderRadius: "16px",
        boxShadow: "0 12px 32px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(79, 70, 229, 0.1)",
        padding: "18px 20px",
        animation: "slideUpFade 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "var(--color-primary-bg, rgba(79, 70, 229, 0.1))",
              color: "var(--color-primary, #4f46e5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Globe size={20} />
          </div>
          <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--text-heading, #0f172a)" }}>
            {t("Timezone Update", { defaultValue: "Timezone Update" })}
          </h4>
        </div>
        <button
          onClick={handleDismiss}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-secondary, #64748b)",
            cursor: "pointer",
            padding: "4px",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title={t("Dismiss", { defaultValue: "Dismiss" })}
          aria-label={t("Dismiss timezone prompt", { defaultValue: "Dismiss timezone prompt" })}
        >
          <X size={18} />
        </button>
      </div>

      <p style={{ margin: "0 0 14px 0", fontSize: "13px", lineHeight: "1.5", color: "var(--text-secondary, #475569)" }}>
        {t("Your device is currently in {{deviceTz}}, but your account timezone is set to {{savedTz}}. Would you like to update it?", {
          defaultValue: `Your device is currently in ${deviceTz}, but your account timezone is set to ${savedTz || "Not set (UTC)"}. Would you like to update it?`,
          deviceTz,
          savedTz: savedTz || t("Not set (UTC)", { defaultValue: "Not set (UTC)" }),
        })}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "flex-end" }}>
        <button
          onClick={handleDismiss}
          style={{
            background: "transparent",
            border: "1px solid var(--border-color, #cbd5e1)",
            color: "var(--text-secondary, #64748b)",
            borderRadius: "8px",
            padding: "7px 14px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            transition: "background 0.2s",
          }}
        >
          {t("Keep {{tz}}", { tz: savedTz || t("Current", { defaultValue: "Current" }), defaultValue: `Keep ${savedTz || "Current"}` })}
        </button>

        <button
          onClick={handleUpdate}
          disabled={updating}
          style={{
            background: "var(--color-primary, #4f46e5)",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            padding: "7px 16px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: updating ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            boxShadow: "0 2px 8px rgba(79, 70, 229, 0.3)",
          }}
        >
          <Check size={14} />
          {updating
            ? t("Updating...", { defaultValue: "Updating..." })
            : t("Update to {{tz}}", {
                tz: deviceTz.split("/").pop().replace(/_/g, " "),
                defaultValue: `Update to ${deviceTz.split("/").pop().replace(/_/g, " ")}`,
              })}
        </button>
      </div>
    </div>
  );
}
