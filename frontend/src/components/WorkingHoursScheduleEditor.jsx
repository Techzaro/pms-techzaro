/**
 * @file WorkingHoursScheduleEditor.jsx
 * @description Reusable interactive 7-day Working Hours Schedule Editor with support
 * for multiple daily time intervals / split shifts (SRS Section 14).
 */

import { Plus, Trash2, RotateCcw, Clock, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DEFAULT_WORKING_HOURS } from "../utils/timezoneUtils";
import { notify } from "../utils/notify";

export default function WorkingHoursScheduleEditor({ schedule, onChange, readOnly = false }) {
  const { t } = useTranslation();
  const currentSchedule = Array.isArray(schedule) && schedule.length === 7 ? schedule : DEFAULT_WORKING_HOURS;

  const handleToggleDay = (dayIndex) => {
    if (readOnly) return;
    const next = currentSchedule.map((item, idx) => {
      if (idx === dayIndex) {
        const nextIsWorking = !item.is_working;
        return {
          ...item,
          is_working: nextIsWorking,
          // ensure at least 1 interval if switching to working
          intervals: (!item.intervals || item.intervals.length === 0)
            ? [{ start: "09:00", end: "17:00" }]
            : item.intervals,
        };
      }
      return item;
    });
    onChange(next);
  };

  const handleIntervalChange = (dayIndex, intervalIndex, field, value) => {
    if (readOnly) return;
    const next = currentSchedule.map((item, idx) => {
      if (idx === dayIndex) {
        const intervals = [...(item.intervals || [{ start: "09:00", end: "17:00" }])];
        intervals[intervalIndex] = {
          ...intervals[intervalIndex],
          [field]: value,
        };
        return {
          ...item,
          intervals,
          start_time: intervals[0]?.start || "09:00",
          end_time: intervals[intervals.length - 1]?.end || "17:00",
        };
      }
      return item;
    });
    onChange(next);
  };

  const handleAddInterval = (dayIndex) => {
    if (readOnly) return;
    const next = currentSchedule.map((item, idx) => {
      if (idx === dayIndex) {
        const intervals = [...(item.intervals || [])];
        const lastInterval = intervals[intervals.length - 1];
        let newStart = "13:00";
        let newEnd = "17:00";
        if (lastInterval?.end) {
          newStart = lastInterval.end;
          const [h, m] = lastInterval.end.split(":").map(Number);
          const endH = Math.min(23, (h || 0) + 4);
          newEnd = `${String(endH).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
        }
        intervals.push({ start: newStart, end: newEnd });
        return {
          ...item,
          is_working: true,
          intervals,
          start_time: intervals[0]?.start || "09:00",
          end_time: intervals[intervals.length - 1]?.end || "17:00",
        };
      }
      return item;
    });
    onChange(next);
  };

  const handleRemoveInterval = (dayIndex, intervalIndex) => {
    if (readOnly) return;
    const next = currentSchedule.map((item, idx) => {
      if (idx === dayIndex) {
        const intervals = (item.intervals || []).filter((_, i) => i !== intervalIndex);
        const hasIntervals = intervals.length > 0;
        return {
          ...item,
          is_working: hasIntervals,
          intervals: hasIntervals ? intervals : [{ start: "09:00", end: "17:00" }],
          start_time: intervals[0]?.start || "09:00",
          end_time: intervals[intervals.length - 1]?.end || "17:00",
        };
      }
      return item;
    });
    onChange(next);
  };

  const applyMondayToWeekdays = () => {
    if (readOnly) return;
    const monday = currentSchedule[0] || { is_working: true, intervals: [{ start: "09:00", end: "17:00" }] };
    const next = currentSchedule.map((item, idx) => {
      if (idx <= 4) {
        return {
          ...item,
          is_working: monday.is_working,
          intervals: JSON.parse(JSON.stringify(monday.intervals || [{ start: "09:00", end: "17:00" }])),
          start_time: monday.start_time || "09:00",
          end_time: monday.end_time || "17:00",
        };
      }
      return item;
    });
    onChange(next);
    notify.success(t("Monday's schedule applied to all weekdays (Mon-Fri).", { defaultValue: "Monday's schedule applied to all weekdays (Mon-Fri)." }));
  };

  const resetToDefaults = () => {
    if (readOnly) return;
    onChange(JSON.parse(JSON.stringify(DEFAULT_WORKING_HOURS)));
    notify.success(t("Working hours reset to standard Mon-Fri 9AM-5PM.", { defaultValue: "Working hours reset to standard Mon-Fri 9AM-5PM." }));
  };

  return (
    <div style={{ width: "100%" }}>
      {/* Quick Toolbar */}
      {!readOnly && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-heading, #1e293b)" }}>
            {t("Daily Schedule & Shifts", { defaultValue: "Daily Schedule & Shifts" })}
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={applyMondayToWeekdays}
              style={{
                background: "var(--bg-hover, #f8fafc)",
                border: "1px solid var(--border-color, #cbd5e1)",
                color: "var(--text-secondary, #64748b)",
                borderRadius: "8px",
                padding: "5px 12px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <Copy size={13} /> {t("Copy Mon to Weekdays", { defaultValue: "Copy Mon to Weekdays" })}
            </button>
            <button
              type="button"
              onClick={resetToDefaults}
              style={{
                background: "var(--bg-hover, #f8fafc)",
                border: "1px solid var(--border-color, #cbd5e1)",
                color: "var(--text-secondary, #64748b)",
                borderRadius: "8px",
                padding: "5px 12px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <RotateCcw size={13} /> {t("Reset")}
            </button>
          </div>
        </div>
      )}

      {/* Schedule Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {currentSchedule.map((dayItem, dayIdx) => {
          const intervals = (dayItem.intervals && dayItem.intervals.length > 0)
            ? dayItem.intervals
            : [{ start: dayItem.start_time || "09:00", end: dayItem.end_time || "17:00" }];

          return (
            <div
              key={dayItem.day}
              style={{
                background: "var(--bg-hover, #f8fafc)",
                border: "1px solid var(--border-light, #e2e8f0)",
                borderRadius: "12px",
                padding: "12px 16px",
                opacity: dayItem.is_working ? 1 : 0.6,
                transition: "all 0.2s ease",
              }}
            >
              {/* Day Header Row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: dayItem.is_working ? "10px" : "0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "14px", fontWeight: 700, minWidth: "90px", color: "var(--text-heading, #0f172a)" }}>
                    {t(dayItem.day)}
                  </span>

                  <label className="rs-switch" style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(dayItem.is_working)}
                      disabled={readOnly}
                      onChange={() => handleToggleDay(dayIdx)}
                    />
                    <span className="rs-slider" />
                  </label>

                  <span style={{ fontSize: "12px", fontWeight: 600, color: dayItem.is_working ? "var(--color-success, #10b981)" : "var(--text-secondary, #64748b)" }}>
                    {dayItem.is_working ? t("Working Day") : t("Day Off")}
                  </span>
                </div>

                {/* Add Shift button */}
                {dayItem.is_working && !readOnly && (
                  <button
                    type="button"
                    onClick={() => handleAddInterval(dayIdx)}
                    style={{
                      background: "var(--color-primary-bg, rgba(79, 70, 229, 0.08))",
                      color: "var(--color-primary, #4f46e5)",
                      border: "1px dashed var(--color-primary, #4f46e5)",
                      borderRadius: "6px",
                      padding: "4px 10px",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <Plus size={12} /> {t("Add Shift / Hours")}
                  </button>
                )}
              </div>

              {/* Intervals List */}
              {dayItem.is_working && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingLeft: "10px", borderLeft: "2px solid var(--border-color, #cbd5e1)", marginLeft: "4px" }}>
                  {intervals.map((interval, intIdx) => (
                    <div
                      key={intIdx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontSize: "11px", color: "var(--text-secondary, #64748b)", minWidth: "45px" }}>
                        {t("Shift")} {intIdx + 1}:
                      </span>
                      <input
                        type="time"
                        value={interval.start || "09:00"}
                        disabled={readOnly}
                        onChange={(e) => handleIntervalChange(dayIdx, intIdx, "start", e.target.value)}
                        style={{
                          height: "32px",
                          padding: "0 8px",
                          borderRadius: "6px",
                          border: "1px solid var(--border-color, #cbd5e1)",
                          background: "var(--bg-card, #ffffff)",
                          fontSize: "12px",
                          color: "var(--text-primary, #0f172a)",
                          outline: "none",
                        }}
                      />
                      <span style={{ fontSize: "12px", color: "var(--text-secondary, #64748b)" }}>{t("to")}</span>
                      <input
                        type="time"
                        value={interval.end || "17:00"}
                        disabled={readOnly}
                        onChange={(e) => handleIntervalChange(dayIdx, intIdx, "end", e.target.value)}
                        style={{
                          height: "32px",
                          padding: "0 8px",
                          borderRadius: "6px",
                          border: "1px solid var(--border-color, #cbd5e1)",
                          background: "var(--bg-card, #ffffff)",
                          fontSize: "12px",
                          color: "var(--text-primary, #0f172a)",
                          outline: "none",
                        }}
                      />

                      {intervals.length > 1 && !readOnly && (
                        <button
                          type="button"
                          onClick={() => handleRemoveInterval(dayIdx, intIdx)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--color-danger, #ef4444)",
                            cursor: "pointer",
                            padding: "4px",
                            borderRadius: "4px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          title={t("Remove this shift interval", { defaultValue: "Remove this shift interval" })}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
