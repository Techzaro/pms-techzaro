/**
 * @file TeamWorkingHoursModal.jsx
 * @description Modal for Admins, Managers, and Team Leads to configure team-specific working hours with multiple shift support (SRS Section 14).
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Clock, X, Save, Loader2 } from "lucide-react";
import {
  DEFAULT_WORKING_HOURS,
  normalizeWorkingHoursSchedule,
} from "../utils/timezoneUtils";
import { authToken } from "../utils/auth";
import API_URL from "../config/api";
import { notify } from "../utils/notify";
import WorkingHoursScheduleEditor from "./WorkingHoursScheduleEditor";

export default function TeamWorkingHoursModal({ isOpen, onClose, team, onSaved }) {
  const { t } = useTranslation();
  const [schedule, setSchedule] = useState(DEFAULT_WORKING_HOURS);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && team) {
      if (team.working_hours && Array.isArray(team.working_hours)) {
        setSchedule(normalizeWorkingHoursSchedule(team.working_hours));
      } else {
        // Fetch fresh team working hours from API
        fetchTeamWorkingHours();
      }
    }
  }, [isOpen, team]);

  const fetchTeamWorkingHours = async () => {
    if (!team?.id) return;
    setLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/teams/${team.id}/working-hours`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.working_hours || data?.data?.working_hours) {
          setSchedule(normalizeWorkingHoursSchedule(data.working_hours || data.data.working_hours));
        } else {
          setSchedule(DEFAULT_WORKING_HOURS);
        }
      }
    } catch {
      setSchedule(DEFAULT_WORKING_HOURS);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!team?.id) return;

    setSaving(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/teams/${team.id}/working-hours`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ working_hours: schedule }),
        _notifHandled: true,
      });

      const data = await res.json();
      if (res.ok && data?.success !== false) {
        notify.success(t('Working hours for "{{name}}" updated successfully.', { defaultValue: `Working hours for "${team.name}" updated successfully.`, name: team.name }));
        if (onSaved) onSaved(schedule);
        onClose();
      } else {
        notify.error(data?.message || t("Failed to update team working hours.", { defaultValue: "Failed to update team working hours." }));
      }
    } catch (err) {
      notify.error(t("Network error while saving team working hours.", { defaultValue: "Network error while saving team working hours." }));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !team) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
        padding: "16px",
        boxSizing: "border-box",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-card, #ffffff)",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "650px",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
          border: "1px solid var(--border-light, #e2e8f0)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 22px",
            borderBottom: "1px solid var(--border-light, #f1f5f9)",
          }}
        >
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
              }}
            >
              <Clock size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-heading, #0f172a)" }}>
                {t("Team Working Hours: {{name}}", { defaultValue: `Team Working Hours: ${team.name}`, name: team.name })}
              </h3>
              <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "var(--text-secondary, #64748b)" }}>
                {t("Set customized work schedule and split shifts for members of this team", { defaultValue: "Set customized work schedule and split shifts for members of this team" })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary, #64748b)",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "8px",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px 22px", overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-secondary)" }}>
              <Loader2 className="w-5 h-5 animate-spin" style={{ margin: "0 auto 8px" }} />
              {t("Loading team schedule...", { defaultValue: "Loading team schedule..." })}
            </div>
          ) : (
            <WorkingHoursScheduleEditor
              schedule={schedule}
              onChange={setSchedule}
            />
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "10px",
            padding: "16px 22px",
            borderTop: "1px solid var(--border-light, #f1f5f9)",
            background: "var(--bg-card, #ffffff)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid var(--border-color, #cbd5e1)",
              background: "transparent",
              color: "var(--text-secondary, #64748b)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 20px",
              borderRadius: "8px",
              border: "none",
              background: "var(--color-primary, #4f46e5)",
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 6px rgba(79, 70, 229, 0.25)",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={15} />}
            {saving ? t("Saving...", { defaultValue: "Saving..." }) : t("Save Working Hours", { defaultValue: "Save Working Hours" })}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
