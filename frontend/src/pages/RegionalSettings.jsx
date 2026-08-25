/**
 * @file RegionalSettings.jsx
 * @description User's Personal Regional & Working Hours Settings UI (SRS Section 23).
 * Provides interactive controls for Language, Timezone, Date Format, Time Format,
 * and customizable Daily Working Hours schedule.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import {
  Globe,
  Clock,
  Calendar,
  Languages,
  Check,
  RotateCcw,
  Save,
  Sparkles,
  Info,
  Laptop,
} from "lucide-react";
import WorkingHoursScheduleEditor from "../components/WorkingHoursScheduleEditor";
import {
  SUPPORTED_LANGUAGES,
  SUPPORTED_DATE_FORMATS,
  SUPPORTED_TIME_FORMATS,
  DEFAULT_WORKING_HOURS,
  DAYS_OF_WEEK,
  detectDeviceTimezone,
  normalizeWorkingHoursSchedule,
  getTimezoneOffsetDisplay,
} from "../utils/timezoneUtils";
import { getUser, setUser, getCurrentRole, rolePath } from "../utils/auth";
import api from "../lib/api";
import { notify } from "../utils/notify";
import dayjs from "dayjs";
import "./RegionalSettings.css";

export default function RegionalSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [timezones, setTimezones] = useState([]);
  const [tzSearch, setTzSearch] = useState("");

  // Form State
  const [language, setLanguage] = useState("English");
  const [timezone, setTimezone] = useState("UTC");
  const [dateFormat, setDateFormat] = useState("DD/MM/YYYY");
  const [timeFormat, setTimeFormat] = useState("12-hour");
  const [workingHours, setWorkingHours] = useState(DEFAULT_WORKING_HOURS);

  const deviceTz = useMemo(() => detectDeviceTimezone(), []);

  const breadcrumbs = [
    { label: "Dashboard", path: rolePath("dashboard") },
    { label: "Settings", path: rolePath("settings/notifications") },
    { label: "Regional Settings" },
  ];

  // Load User Settings & Available Timezones
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch available timezones
      const tzRes = await api.get("/regional-settings/timezones");
      if (tzRes?.data && Array.isArray(tzRes.data)) {
        setTimezones(tzRes.data);
      } else {
        // Fallback default list if endpoint fails
        setTimezones([
          "UTC",
          "America/New_York",
          "America/Chicago",
          "America/Denver",
          "America/Los_Angeles",
          "Europe/London",
          "Europe/Paris",
          "Europe/Berlin",
          "Asia/Dubai",
          "Asia/Karachi",
          "Asia/Kolkata",
          "Asia/Singapore",
          "Asia/Tokyo",
          "Australia/Sydney",
        ]);
      }

      // 2. Fetch user settings
      const settingsRes = await api.get("/regional-settings");
      const data = settingsRes?.data || settingsRes?.settings || {};

      if (data.language) setLanguage(data.language);
      if (data.timezone) setTimezone(data.timezone);
      else if (deviceTz) setTimezone(deviceTz);

      if (data.date_format) setDateFormat(data.date_format);
      if (data.time_format) setTimeFormat(data.time_format);

      if (data.working_hours) {
        setWorkingHours(normalizeWorkingHoursSchedule(data.working_hours));
      } else {
        setWorkingHours(DEFAULT_WORKING_HOURS);
      }
    } catch (err) {
      console.error("Error loading regional settings:", err);
      // Fallback from localStorage user
      const u = getUser();
      if (u) {
        if (u.language) setLanguage(u.language);
        if (u.timezone) setTimezone(u.timezone);
        if (u.date_format) setDateFormat(u.date_format);
        if (u.time_format) setTimeFormat(u.time_format);
        if (u.working_hours) setWorkingHours(normalizeWorkingHoursSchedule(u.working_hours));
      }
    } finally {
      setLoading(false);
    }
  }, [deviceTz]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Submit Changes
  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        language,
        timezone,
        date_format: dateFormat,
        time_format: timeFormat,
        working_hours: workingHours,
      };

      const res = await api.put("/regional-settings", payload);

      if (res?.success) {
        // Update user in session storage
        const role = getCurrentRole();
        const user = getUser(role);
        if (user) {
          user.language = language;
          user.timezone = timezone;
          user.date_format = dateFormat;
          user.time_format = timeFormat;
          user.working_hours = workingHours;
          setUser(role, user);
        }

        notify.success("Regional settings saved successfully!");
        window.dispatchEvent(new CustomEvent("regional-settings:updated", { detail: payload }));
      }
    } catch (err) {
      console.error("Failed to save regional settings:", err);
    } finally {
      setSaving(false);
    }
  };

  // Filtered timezone list
  const filteredTimezones = useMemo(() => {
    if (!tzSearch.trim()) return timezones;
    const q = tzSearch.toLowerCase();
    return timezones.filter((tz) => tz.toLowerCase().includes(q));
  }, [timezones, tzSearch]);

  const today = dayjs();

  return (
    <DashboardLayout>
      <div className="regional-settings-page">
        <Breadcrumb items={breadcrumbs} />

        <div className="rs-header">
          <h1 className="rs-title">Regional & Timezone Settings</h1>
          <p className="rs-subtitle">
            Configure your preferred language, time zone, date/time formatting, and daily working hours.
          </p>
        </div>

        {loading ? (
          <div className="rs-card" style={{ textAlign: "center", padding: "60px 20px" }}>
            <p style={{ color: "var(--text-secondary)" }}>Loading regional preferences...</p>
          </div>
        ) : (
          <form onSubmit={handleSave}>
            {/* 1. Language & Timezone */}
            <div className="rs-card">
              <div className="rs-card-header">
                <div className="rs-card-icon">
                  <Globe size={20} />
                </div>
                <div>
                  <h2 className="rs-card-title">Locale & Timezone</h2>
                  <p className="rs-card-desc">Choose your preferred display language and timezone</p>
                </div>
              </div>

              <div className="rs-grid-2">
                {/* Language Selection */}
                <div className="rs-form-group">
                  <label className="rs-label flex items-center gap-1.5">
                    <Languages size={15} /> Preferred Language
                  </label>
                  <select
                    className="rs-select"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.value} value={lang.value}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                  <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                    Select the interface display language for your account.
                  </p>
                </div>

                {/* Timezone Selection */}
                <div className="rs-form-group">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <label className="rs-label" style={{ margin: 0 }}>
                      Timezone (IANA)
                    </label>
                    {deviceTz && deviceTz !== timezone && (
                      <button
                        type="button"
                        onClick={() => setTimezone(deviceTz)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--color-primary, #4f46e5)",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Laptop size={13} /> Use Device ({deviceTz})
                      </button>
                    )}
                  </div>

                  <select
                    className="rs-select"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                  >
                    {timezones.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz} {getTimezoneOffsetDisplay(tz)}
                      </option>
                    ))}
                  </select>
                  <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                    All task deadlines and event schedules will be rendered in this timezone.
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Date & Time Format */}
            <div className="rs-card">
              <div className="rs-card-header">
                <div className="rs-card-icon">
                  <Calendar size={20} />
                </div>
                <div>
                  <h2 className="rs-card-title">Date & Time Formats</h2>
                  <p className="rs-card-desc">Choose how dates and times appear throughout the system</p>
                </div>
              </div>

              {/* Date Format */}
              <div className="rs-form-group">
                <label className="rs-label">Date Format</label>
                <div className="rs-radio-grid">
                  {SUPPORTED_DATE_FORMATS.map((df) => {
                    const isSelected = dateFormat === df.value;
                    const previewText = today.format(df.dayjsPattern);
                    return (
                      <div
                        key={df.value}
                        className={`rs-radio-card ${isSelected ? "active" : ""}`}
                        onClick={() => setDateFormat(df.value)}
                      >
                        <input
                          type="radio"
                          name="dateFormat"
                          checked={isSelected}
                          onChange={() => setDateFormat(df.value)}
                        />
                        <div>
                          <div className="rs-radio-title">{df.value}</div>
                          <div className="rs-radio-preview">Preview: {previewText}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Time Format */}
              <div className="rs-form-group" style={{ marginTop: "24px" }}>
                <label className="rs-label">Time Format</label>
                <div className="rs-radio-grid">
                  {SUPPORTED_TIME_FORMATS.map((tf) => {
                    const isSelected = timeFormat === tf.value;
                    const previewText = today.format(tf.dayjsPattern);
                    return (
                      <div
                        key={tf.value}
                        className={`rs-radio-card ${isSelected ? "active" : ""}`}
                        onClick={() => setTimeFormat(tf.value)}
                      >
                        <input
                          type="radio"
                          name="timeFormat"
                          checked={isSelected}
                          onChange={() => setTimeFormat(tf.value)}
                        />
                        <div>
                          <div className="rs-radio-title">{tf.label}</div>
                          <div className="rs-radio-preview">Preview: {previewText}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 3. Working Hours Schedule */}
            <div className="rs-card">
              <div className="rs-card-header">
                <div className="rs-card-icon">
                  <Clock size={20} />
                </div>
                <div>
                  <h2 className="rs-card-title">Daily Working Hours &amp; Shifts</h2>
                  <p className="rs-card-desc">Set your working availability with support for multiple shifts and split hours</p>
                </div>
              </div>

              <WorkingHoursScheduleEditor
                schedule={workingHours}
                onChange={setWorkingHours}
              />
            </div>

            {/* Actions Footer */}
            <div className="rs-actions-footer">
              <button
                type="button"
                className="rs-btn-reset"
                onClick={loadData}
                disabled={saving}
              >
                Discard Changes
              </button>
              <button
                type="submit"
                className="rs-btn-save"
                disabled={saving}
              >
                <Save size={16} />
                {saving ? "Saving..." : "Save Regional Settings"}
              </button>
            </div>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
}
