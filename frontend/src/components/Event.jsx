/**
 * Event.jsx
 * Multi-step modal for creating or editing calendar events.
 * Step 1: Title and description. Step 2: Date/time, type, and user assignment.
 * Supports both single-date and multi-day events, all-day mode, and global assignment.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { authToken, getUser } from "../utils/auth";
import API_URL from "../config/api";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useSubmit } from "../hooks/useSubmit";
import UserSelectDropdown from "./UserSelectDropdown";
import LoadingButton from "./LoadingButton";
import { publish } from "../utils/eventBus";
import { notify, showSuccessMessage } from "../utils/notify";
import draftService from "../services/draftService";
import useDraftGuard from "../hooks/useDraftGuard";
import useAutoSave from "../hooks/useAutoSave";
import AutoSaveIndicator from "./AutoSaveIndicator";
import RichTextEditor from "./RichTextEditor";
import { Globe, AlertTriangle } from "lucide-react";
import {
  convertToLocal,
  convertToUTC,
  getTimezoneOffsetDisplay,
  checkWorkingHoursCompliance,
} from "../utils/timezoneUtils";
import "./Event.css";

const TYPE_MAP = {
  "Meeting": "Meeting",
  "Training": "Training",
  "Workshop": "Workshop",
  "Client Meeting": "Client Meeting",
  "Company Event": "Company Event",
  "Holiday": "Holiday",
  "Interview": "Interview",
  "Project Milestone": "Project Milestone",
  "Internship Activity": "Internship Activity",
  "Other": "Other",
};

const TYPE_MAP_REVERSE = {
  "Meeting": "Meeting",
  "Training": "Training",
  "Workshop": "Workshop",
  "Client Meeting": "Client Meeting",
  "Company Event": "Company Event",
  "Holiday": "Holiday",
  "Interview": "Interview",
  "Project Milestone": "Project Milestone",
  "Internship Activity": "Internship Activity",
  "Other": "Other",
};

const COLOR_MAP = {
  "Meeting": "#6366f1",
  "Training": "#3b82f6",
  "Workshop": "#8b5cf6",
  "Client Meeting": "#f59e0b",
  "Company Event": "#22c55e",
  "Holiday": "#ef4444",
  "Interview": "#ec4899",
  "Project Milestone": "#14b8a6",
  "Internship Activity": "#06b6d4",
  "Other": "#6b7280",
};

/**
 * Multi-step modal for creating or editing calendar events.
 * @param {boolean} isOpen - Whether the modal is visible
 * @param {Function} onClose - Callback to close the modal
 * @param {Function} [onEventCreated] - Callback when an event is created or updated
 * @param {Object|null} [editEvent=null] - Event object to edit (null for creation mode)
 */
function Event({ isOpen, onClose, onEventCreated, editEvent = null, restoreDraftId = null }) {
  const { t } = useTranslation();
  const draftSaveRef = useRef(null);
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useDraftGuard(onClose, {
    draftSaveHandler: () => draftSaveRef.current?.(),
    hasDraftFeature: true,
  });
  useEscapeKey(isOpen, handleClose);

  const [step, setStep] = useState(1);
  const { submitting, run } = useSubmit();
  const [users, setUsers] = useState([]);
  const [assignedUserIds, setAssignedUserIds] = useState([]);
  const [isGlobal, setIsGlobal] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [timezonesList, setTimezonesList] = useState([]);
  const [enforceOrgHours, setEnforceOrgHours] = useState(false);

  const getLocalDateStr = (d) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    startDate: getLocalDateStr(new Date()),
    startTime: "10:00",
    endDate: getLocalDateStr(new Date()),
    endTime: "11:00",
    hasEndDate: false,
    eventType: "Meeting",
    eventTypeCustom: "",
    allDay: false,
    eventTimezone: getUser()?.timezone || "UTC",
  });

  const autoSaveData = useMemo(() => {
    const finalType = formData.eventType === "__custom__" ? formData.eventTypeCustom.trim() : (TYPE_MAP[formData.eventType] || "Meeting");
    return {
      title: formData.title,
      description: formData.description,
      start_date: formData.startDate,
      start_time: formData.startTime,
      end_date: formData.endDate,
      end_time: formData.endTime,
      has_end_date: formData.hasEndDate,
      event_type: finalType || "Meeting",
      event_type_custom: formData.eventTypeCustom,
      all_day: formData.allDay,
      event_timezone: formData.eventTimezone,
      assigned_user_ids: assignedUserIds,
      is_global: isGlobal,
    };
  }, [formData, assignedUserIds, isGlobal]);

  const { lastSaved, isSaving, draftId: autoSaveDraftId } = useAutoSave({
    draftId,
    formData: autoSaveData,
    moduleType: "event",
    enabled: isDirty,
  });

  useEffect(() => {
    if (autoSaveDraftId && autoSaveDraftId !== draftId) {
      setDraftId(autoSaveDraftId);
    }
  }, [autoSaveDraftId]);

  const handleSaveDraft = async () => {
    try {
      const finalType = formData.eventType === "__custom__" ? formData.eventTypeCustom.trim() : (TYPE_MAP[formData.eventType] || "Meeting");
      const draftData = {
        title: formData.title,
        description: formData.description,
        start_date: formData.startDate,
        start_time: formData.startTime,
        end_date: formData.endDate,
        end_time: formData.endTime,
        has_end_date: formData.hasEndDate,
        event_type: finalType || "Meeting",
        event_type_custom: formData.eventTypeCustom,
        all_day: formData.allDay,
        event_timezone: formData.eventTimezone,
        assigned_user_ids: assignedUserIds,
        is_global: isGlobal,
      };
      const payload = {
        module_type: "event",
        title: formData.title || t("Untitled Event Draft", { defaultValue: "Untitled Event Draft" }),
        draft_data: draftData,
      };
      if (draftId) {
        await draftService.update(draftId, { title: payload.title, draft_data: payload.draft_data }, { skipNotify: true });
      } else {
        const data = await draftService.create(payload, { skipNotify: true });
        if (data?.data?.id) setDraftId(data.data.id);
      }
      setIsDirty(false);
    } catch (err) {
      notify.error(err.message || t("Save draft failed", { defaultValue: "Save draft failed" }));
    }
  };

  useEffect(() => {
    draftSaveRef.current = handleSaveDraft;
  });

  const isEditing = !!editEvent;

  useEffect(() => {
    if (editEvent) {
      const start = new Date(editEvent.start_date);
      const end = editEvent.end_date ? new Date(editEvent.end_date) : start;
      const startStr = getLocalDateStr(start);
      const endStr = getLocalDateStr(end);
      const isKnownType = TYPE_MAP_REVERSE[editEvent.type];
      setFormData({
        title: editEvent.title || "",
        description: editEvent.description || "",
        startDate: startStr,
        startTime: start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
        endDate: endStr,
        endTime: end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
        hasEndDate: startStr !== endStr || (editEvent.end_date && editEvent.start_date !== editEvent.end_date),
        eventType: isKnownType || "__custom__",
        eventTypeCustom: isKnownType ? "" : (editEvent.type || ""),
        allDay: editEvent.all_day || false,
        eventTimezone: editEvent.event_timezone || editEvent.timezone || getUser()?.timezone || "UTC",
      });
      setAssignedUserIds(editEvent.assigned_user_ids || []);
      setIsGlobal(Boolean(editEvent.is_global));
    } else {
      setFormData({
        title: "",
        description: "",
        startDate: getLocalDateStr(new Date()),
        startTime: "10:00",
        endDate: getLocalDateStr(new Date()),
        endTime: "11:00",
        hasEndDate: false,
        eventType: "Meeting",
        eventTypeCustom: "",
        allDay: false,
        eventTimezone: getUser()?.timezone || "UTC",
      });
      setAssignedUserIds([]);
      setIsGlobal(false);
    }
    setStep(1);
  }, [editEvent, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const token = authToken();

    fetch(`${API_URL}/team-users`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : { users: [] }))
      .then((data) => setUsers(Array.isArray(data) ? data : (data.users || [])))
      .catch(() => setUsers([]));

    // Fetch timezones list & Organization regional enforcement policy
    fetch(`${API_URL}/regional-settings/timezones`, { headers: { Authorization: `Bearer ${token}` }, skipLoader: true })
      .then((r) => r.json())
      .then((d) => {
        if (d?.data && Array.isArray(d.data)) setTimezonesList(d.data);
      })
      .catch(() => {});

    fetch(`${API_URL}/organization-settings/regional`, { headers: { Authorization: `Bearer ${token}` }, skipLoader: true })
      .then((r) => r.json())
      .then((d) => {
        const reg = d?.data || d?.regional_settings;
        if (reg && reg.enforce_working_hours !== undefined) {
          setEnforceOrgHours(Boolean(reg.enforce_working_hours));
        }
      })
      .catch(() => {});
  }, [isOpen]);

  // Compute UTC strings and check Working Hours Compliance (SRS Sec 11, 13, 15, 16)
  const startDateTimeUtc = useMemo(() => {
    if (!formData.startDate) return null;
    const time = formData.allDay ? "00:00:00" : `${formData.startTime}:00`;
    return convertToUTC(`${formData.startDate} ${time}`, formData.eventTimezone || "UTC");
  }, [formData.startDate, formData.startTime, formData.allDay, formData.eventTimezone]);

  const endDateTimeUtc = useMemo(() => {
    if (!formData.startDate) return null;
    const endD = formData.hasEndDate ? formData.endDate : formData.startDate;
    const endT = formData.hasEndDate ? formData.endTime : (formData.allDay ? "23:59:59" : `${formData.startTime}:00`);
    return convertToUTC(`${endD} ${endT}`, formData.eventTimezone || "UTC");
  }, [formData.startDate, formData.endDate, formData.endTime, formData.startTime, formData.hasEndDate, formData.allDay, formData.eventTimezone]);

  const participantWarnings = useMemo(() => {
    if (formData.allDay || !startDateTimeUtc || isGlobal) return [];
    const warnings = [];
    const selectedUsers = users.filter((u) => assignedUserIds.includes(u.id));
    selectedUsers.forEach((u) => {
      const uTz = u.timezone || "UTC";
      const comp = checkWorkingHoursCompliance(startDateTimeUtc, endDateTimeUtc, u.working_hours, uTz);
      if (!comp.isCompliant) {
        warnings.push({
          user: u,
          reason: comp.reason,
          localTime: comp.localTimeFormatted,
          localDay: comp.localDay,
          scheduleText: comp.scheduleText,
        });
      }
    });
    return warnings;
  }, [formData.allDay, startDateTimeUtc, endDateTimeUtc, isGlobal, users, assignedUserIds]);

  // Restore draft data when opened from DraftCenter
  useEffect(() => {
    if (!isOpen || !restoreDraftId) return;

    const loadDraft = async () => {
      try {
        const data = await draftService.get(restoreDraftId);
        const draft = data?.data;
        if (!draft?.draft_data) return;

        const d = draft.draft_data;
        setFormData({
          title: d.title || "",
          description: d.description || "",
          startDate: d.start_date || getLocalDateStr(new Date()),
          startTime: d.start_time || "10:00",
          endDate: d.end_date || getLocalDateStr(new Date()),
          endTime: d.end_time || "11:00",
          hasEndDate: d.has_end_date || false,
          eventType: d.event_type ? (TYPE_MAP_REVERSE[d.event_type] || "__custom__") : "Meeting",
          eventTypeCustom: d.event_type_custom || "",
          allDay: d.all_day || false,
        });
        setAssignedUserIds(d.assigned_user_ids || []);
        setIsGlobal(Boolean(d.is_global));
        setDraftId(restoreDraftId);
      } catch (err) {
        console.error("Failed to restore draft:", err);
      }
    };

    loadDraft();
  }, [isOpen, restoreDraftId]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const eventTypes = [
    { label: "Meeting", color: "blue" },
    { label: "Training", color: "light-blue" },
    { label: "Workshop", color: "purple" },
    { label: "Client Meeting", color: "amber" },
    { label: "Company Event", color: "green" },
    { label: "Holiday", color: "red" },
    { label: "Interview", color: "pink" },
    { label: "Project Milestone", color: "teal" },
    { label: "Internship Activity", color: "cyan" },
    { label: "Custom / Type Here", color: "gray", value: "__custom__" },
  ];

  const handleChange = (field, value) => {
    setIsDirty(true);
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNext = () => setStep(2);
  const handleBack = () => setStep(1);
  const handleCancel = () => {
    setStep(1);
    handleClose();
  };

  /**
   * Handles event creation or update. Validates title, builds the payload
   * with date/time logic, and sends POST (create) or PUT (edit) request.
   */
  const handleCreate = async () => {
    if (!formData.title.trim()) {
      notify.error(t("Event title is required", { defaultValue: "Event title is required" }));
      return;
    }

    // Check organization policy enforcement for working hours (SRS Sec 11, 15, 16)
    if (enforceOrgHours && participantWarnings.length > 0) {
      notify.error(
        t("Cannot schedule event: Organization strictly enforces working hours policy, and {{count}} participant(s) are outside their scheduled hours.", {
          defaultValue: `Cannot schedule event: Organization strictly enforces working hours policy, and ${participantWarnings.length} participant(s) are outside their scheduled hours.`,
          count: participantWarnings.length,
        })
      );
      return;
    }

    await run(async () => {
      try {
        // Build start datetime; all-day events use 00:00
        const startDateTime = formData.startDate + "T" + (formData.allDay ? "00:00" : formData.startTime) + ":00";

        // Use end date if enabled, otherwise fall back to start date
        const endDateToUse = formData.hasEndDate ? formData.endDate : formData.startDate;
        const endTimeToUse = formData.hasEndDate ? formData.endTime : (formData.allDay ? "23:59" : formData.startTime);

        const endDateTime = endDateToUse + "T" + endTimeToUse + ":00";

        // Build request payload
        const finalType = formData.eventType === "__custom__" ? formData.eventTypeCustom.trim() : (TYPE_MAP[formData.eventType] || "Meeting");
        const payload = {
          title: formData.title.trim(),
          description: formData.description.trim() || null,
          type: finalType || "Meeting",
          color: COLOR_MAP[TYPE_MAP[formData.eventType]] || "#6b7280",
          start_date: startDateTime,
          end_date: endDateTime,
          event_timezone: formData.eventTimezone || "UTC",
          timezone: formData.eventTimezone || "UTC",
          all_day: formData.allDay,
          is_global: isGlobal,
          assigned_user_ids: isGlobal ? [] : assignedUserIds,
        };

        const token = authToken();
        const url = isEditing
          ? `${API_URL}/events/${editEvent.id}`
          : `${API_URL}/events`;

        const res = await fetch(url, {
          method: isEditing ? "PUT" : "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
          _notifHandled: true,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || t("Failed to save event", { defaultValue: "Failed to save event" }));
        }

        showSuccessMessage(t("Event", { defaultValue: "Event" }), isEditing ? t("updated", { defaultValue: "updated" }) : t("created", { defaultValue: "created" }));
        setStep(1);
        if (isEditing) {
          publish('event:updated', data.event || data);
          publish('data:changed', { type: 'event', action: 'updated' });
        } else {
          publish('event:created', data.event || data);
          publish('data:changed', { type: 'event', action: 'created' });
        }
        if (restoreDraftId) draftService.delete(restoreDraftId).catch(() => {});
        onEventCreated?.(data.event);
        onClose();
      } catch (err) {
        notify.error(err.message || t("Something went wrong", { defaultValue: "Something went wrong" }));
      }
    });
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="event-overlay">
      <div className="event-modal" onClick={(e) => e.stopPropagation()}>

        <div className="event-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
            <h2 style={{ margin: 0 }}>{isEditing ? t("Edit Event", { defaultValue: "Edit Event" }) : t("Add New Event", { defaultValue: "Add New Event" })}</h2>
            <AutoSaveIndicator isSaving={isSaving} lastSaved={lastSaved} />
          </div>
          <div className="event-header-actions" style={{ display: "flex", gap: 8 }}>
            <button className="event-save-draft-btn" onClick={handleSaveDraft} type="button">
              {t("Save Draft", { defaultValue: "Save Draft" })}
            </button>
            <button className="event-close" onClick={handleClose}>×</button>
          </div>
        </div>

        {step === 1 && (
          <div className="event-step">
            <label className="event-label required">{t("Event Title", { defaultValue: "Event Title" })}</label>
            <input
              type="text"
              className="event-input"
              placeholder={t("Enter name..", { defaultValue: "Enter name.." })}
              value={formData.title}
              onChange={(e) => handleChange("title", e.target.value)}
            />

            <label className="event-label">{t("Description", { defaultValue: "Description" })}</label>
            <RichTextEditor
              value={formData.description}
              onChange={(val) => handleChange("description", val)}
              placeholder={t("Add event description...", { defaultValue: "Add event description..." })}
            />

            <div className="event-dots">
              <span className="dot active" />
              <span className="dot" />
            </div>

            <div className="event-footer">
              <button className="btn-cancel" onClick={handleClose}>{t("Cancel")}</button>
              <button className="btn-primary" onClick={handleNext}>{t("Next", { defaultValue: "Next" })}</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="event-step">
            <label className="event-label required">{t("Event Date", { defaultValue: "Event Date" })}</label>

            <div className="event-datetime-row">
              <input
                type="date"
                className="event-input"
                value={formData.startDate}
                min={getLocalDateStr(new Date())}
                onChange={(e) => handleChange("startDate", e.target.value)}
              />
              {!formData.allDay && (
                <input
                  type="time"
                  className="event-input"
                  value={formData.startTime}
                  onChange={(e) => handleChange("startTime", e.target.value)}
                />
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <input
                type="checkbox"
                id="allDay"
                checked={formData.allDay}
                onChange={(e) => handleChange("allDay", e.target.checked)}
                style={{ width: 16, height: 16, cursor: "pointer" }}
              />
              <label htmlFor="allDay" style={{ fontSize: 14, color: "#374151", cursor: "pointer" }}>
                {t("All Day Event", { defaultValue: "All Day Event" })}
              </label>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <input
                type="checkbox"
                id="hasEndDate"
                checked={formData.hasEndDate}
                onChange={(e) => {
                  handleChange("hasEndDate", e.target.checked);
                  if (!e.target.checked) {
                    handleChange("endDate", formData.startDate);
                    handleChange("endTime", formData.startTime);
                  }
                }}
                style={{ width: 16, height: 16, cursor: "pointer" }}
              />
              <label htmlFor="hasEndDate" style={{ fontSize: 14, color: "#374151", cursor: "pointer" }}>
                {t("Add End Date & Time", { defaultValue: "Add End Date & Time" })}
              </label>
            </div>

            {formData.hasEndDate && (
              <div className="event-datetime-row">
                <input
                  type="date"
                  className="event-input"
                  value={formData.endDate}
                  min={formData.startDate || getLocalDateStr(new Date())}
                  onChange={(e) => handleChange("endDate", e.target.value)}
                />
                {!formData.allDay && (
                  <input
                    type="time"
                    className="event-input"
                    value={formData.endTime}
                    onChange={(e) => handleChange("endTime", e.target.value)}
                  />
                )}
              </div>
            )}

            {/* Event Timezone Selector (SRS Sec 11) */}
            <div style={{ marginBottom: 12 }}>
              <label className="event-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Globe size={13} style={{ color: "var(--color-primary, #4f46e5)" }} /> {t("Event Timezone (IANA)", { defaultValue: "Event Timezone (IANA)" })}
              </label>
              <select
                className="event-input"
                value={formData.eventTimezone}
                onChange={(e) => handleChange("eventTimezone", e.target.value)}
                style={{ marginBottom: 0 }}
              >
                {timezonesList.length > 0 ? (
                  timezonesList.map((tz) => (
                    <option key={tz} value={tz}>{tz} {getTimezoneOffsetDisplay(tz)}</option>
                  ))
                ) : (
                  ['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Tokyo'].map((tz) => (
                    <option key={tz} value={tz}>{tz} {getTimezoneOffsetDisplay(tz)}</option>
                  ))
                )}
              </select>
            </div>

            <label className="event-label">{t("Event Type", { defaultValue: "Event Type" })}</label>
            {formData.eventType === "__custom__" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  className="event-input"
                  placeholder={t("Enter custom event type", { defaultValue: "Enter custom event type" })}
                  value={formData.eventTypeCustom}
                  onChange={(e) => handleChange("eventTypeCustom", e.target.value)}
                  autoFocus
                  style={{ flex: 1, marginBottom: 0 }}
                />
                <button
                  type="button"
                  className="custom-input-revert"
                  onClick={() => handleChange("eventType", "Meeting")}
                  title={t("Back to list", { defaultValue: "Back to list" })}
                  style={{ flexShrink: 0, width: 36, height: 36, border: "1px solid var(--border-color)", borderRadius: 10, background: "var(--bg-hover)", color: "var(--text-secondary)", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  &times;
                </button>
              </div>
            ) : (
              <select
                className="event-input"
                value={formData.eventType}
                onChange={(e) => handleChange("eventType", e.target.value)}
                style={{ marginBottom: 12 }}
              >
                {eventTypes.map((type) => (
                  <option key={type.label} value={type.value || type.label}>
                    {t(type.label)}
                  </option>
                ))}
              </select>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
              <input
                id="assignAll"
                type="checkbox"
                checked={isGlobal}
                onChange={(e) => {
                  setIsDirty(true);
                  setIsGlobal(e.target.checked);
                  if (e.target.checked) setAssignedUserIds([]);
                }}
                style={{ width: 16, height: 16, cursor: "pointer" }}
              />
              <label htmlFor="assignAll" style={{ fontSize: 14, color: "#374151", cursor: "pointer" }}>
                {t("Assign To All Users", { defaultValue: "Assign To All Users" })}
              </label>
            </div>

            {!isGlobal && (
              <div style={{ marginTop: 14 }}>
                <label className="event-label">{t("Assign Users", { defaultValue: "Assign Users" })}</label>
                <UserSelectDropdown
                  users={users}
                  selectedIds={assignedUserIds}
                  onChange={(ids) => { setIsDirty(true); setAssignedUserIds(ids); }}
                  placeholder={t("Select users to assign", { defaultValue: "Select users to assign" })}
                />

                {/* Selected Attendees Working Hours & Local Event Time (SRS Sec 13 & 15) */}
                {assignedUserIds.length > 0 && startDateTimeUtc && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    {users
                      .filter((u) => assignedUserIds.includes(u.id))
                      .map((u) => {
                        const uTz = u.timezone || "UTC";
                        const comp = checkWorkingHoursCompliance(startDateTimeUtc, endDateTimeUtc, u.working_hours, uTz);
                        return (
                          <div
                            key={u.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "4px 8px",
                              borderRadius: 6,
                              background: comp.isCompliant ? "var(--bg-hover, #f8fafc)" : "rgba(239, 68, 68, 0.08)",
                              border: `1px solid ${comp.isCompliant ? "var(--border-light, #e2e8f0)" : "rgba(239, 68, 68, 0.3)"}`,
                              fontSize: 11,
                              flexWrap: "wrap",
                              gap: 4,
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>{u.name}</span>
                            <span style={{ color: "var(--text-secondary)" }}>
                              {t("Local", { defaultValue: "Local" })}: <strong>{comp.localTimeFormatted}</strong> ({uTz})
                            </span>
                            <span style={{ color: comp.isCompliant ? "var(--color-success, #10b981)" : "var(--color-danger, #ef4444)", fontWeight: 600 }}>
                              {comp.isCompliant ? `✓ ${comp.scheduleText}` : `⚠ ${t("Outside Hours", { defaultValue: "Outside Hours" })} (${comp.scheduleText})`}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* WORKING HOURS WARNING BANNER (SRS Sec 15 & 16) */}
            {participantWarnings.length > 0 && (
              <div
                style={{
                  marginTop: 14,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: enforceOrgHours ? "rgba(239, 68, 68, 0.1)" : "rgba(245, 158, 11, 0.1)",
                  border: `1px solid ${enforceOrgHours ? "#ef4444" : "#f59e0b"}`,
                  color: enforceOrgHours ? "#b91c1c" : "#b45309",
                  fontSize: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, marginBottom: 4 }}>
                  <AlertTriangle size={15} />
                  {enforceOrgHours
                    ? t("Strict Organization Policy: Outside Working Hours", { defaultValue: "Strict Organization Policy: Outside Working Hours" })
                    : t("Working Hours Warning (Non-Blocking)", { defaultValue: "Working Hours Warning (Non-Blocking)" })}
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 }}>
                  {participantWarnings.map((w, idx) => (
                    <li key={idx}>
                      {t("{{name}}'s local time will be {{time}} ({{day}}), outside their working hours of {{schedule}}.", {
                        defaultValue: `${w.user.name}'s local time will be ${w.localTime} (${w.localDay}), outside their working hours of ${w.scheduleText}.`,
                        name: w.user.name,
                        time: w.localTime,
                        day: w.localDay,
                        schedule: w.scheduleText,
                      })}
                    </li>
                  ))}
                </ul>
                {enforceOrgHours && (
                  <p style={{ margin: "6px 0 0 0", fontSize: 11, fontWeight: 600 }}>
                    ⛔ {t("Organization policy strictly enforces working hours. Submission blocked.", { defaultValue: "Organization policy strictly enforces working hours. Submission blocked." })}
                  </p>
                )}
              </div>
            )}

            <div className="event-dots">
              <span className="dot" />
              <span className="dot active" />
            </div>

            <div className="event-footer">
              <button className="btn-cancel" onClick={handleBack}>{t("Back", { defaultValue: "Back" })}</button>
              <LoadingButton
                className="btn-primary"
                onClick={handleCreate}
                loading={submitting}
              >
                {isEditing ? t("Update Event", { defaultValue: "Update Event" }) : t("Create Event", { defaultValue: "Create Event" })}
              </LoadingButton>
            </div>
          </div>
        )}

      </div>
      {ConfirmDialog}
    </div>
  , document.body);
}

export default Event;
