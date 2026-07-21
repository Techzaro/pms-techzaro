/**
 * Event.jsx
 * Multi-step modal for creating or editing calendar events.
 * Step 1: Title and description. Step 2: Date/time, type, and user assignment.
 * Supports both single-date and multi-day events, all-day mode, and global assignment.
 */

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { authToken } from "../utils/auth";
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
  });

  const { lastSaved, isSaving, draftId: autoSaveDraftId } = useAutoSave({
    draftId,
    formData,
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
        assigned_user_ids: assignedUserIds,
        is_global: isGlobal,
      };
      const payload = {
        module_type: "event",
        title: formData.title || "Untitled Event Draft",
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
      notify.error(err.message || "Save draft failed");
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
  }, [isOpen]);

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
      notify.error("Event title is required");
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
          throw new Error(data.message || "Failed to save event");
        }

        showSuccessMessage("Event", isEditing ? "updated" : "created");
        setStep(1);
        if (isEditing) {
          publish('event:updated', data.event || data);
          publish('data:changed', { type: 'event', action: 'updated' });
        } else {
          publish('event:created', data.event || data);
          publish('data:changed', { type: 'event', action: 'created' });
        }
        onEventCreated?.(data.event);
        onClose();
      } catch (err) {
        notify.error(err.message || "Something went wrong");
      }
    });
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="event-overlay">
      <div className="event-modal" onClick={(e) => e.stopPropagation()}>

        <div className="event-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
            <h2 style={{ margin: 0 }}>{isEditing ? "Edit Event" : "Add New Event"}</h2>
            <AutoSaveIndicator isSaving={isSaving} lastSaved={lastSaved} />
          </div>
          <div className="event-header-actions" style={{ display: "flex", gap: 8 }}>
            <button className="event-save-draft-btn" onClick={handleSaveDraft} type="button">
              Save Draft
            </button>
            <button className="event-close" onClick={handleClose}>×</button>
          </div>
        </div>

        {step === 1 && (
          <div className="event-step">
            <label className="event-label required">Event Title</label>
            <input
              type="text"
              className="event-input"
              placeholder="Enter name.."
              value={formData.title}
              onChange={(e) => handleChange("title", e.target.value)}
            />

            <label className="event-label">Description</label>
            <RichTextEditor
              value={formData.description}
              onChange={(val) => handleChange("description", val)}
              placeholder="Add event description..."
            />

            <div className="event-dots">
              <span className="dot active" />
              <span className="dot" />
            </div>

            <div className="event-footer">
              <button className="btn-cancel" onClick={handleClose}>Cancel</button>
              <button className="btn-primary" onClick={handleNext}>Next</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="event-step">
            <label className="event-label required">Event Date</label>

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
                All Day Event
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
                Add End Date &amp; Time
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

            <label className="event-label">Event Type</label>
            {formData.eventType === "__custom__" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  className="event-input"
                  placeholder="Enter custom event type"
                  value={formData.eventTypeCustom}
                  onChange={(e) => handleChange("eventTypeCustom", e.target.value)}
                  autoFocus
                  style={{ flex: 1, marginBottom: 0 }}
                />
                <button
                  type="button"
                  className="custom-input-revert"
                  onClick={() => handleChange("eventType", "Meeting")}
                  title="Back to list"
                  style={{ flexShrink: 0, width: 36, height: 36, border: "1px solid #d1d5db", borderRadius: 10, background: "#f3f4f6", color: "#6b7280", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
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
                    {type.label}
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
                Assign To All Users
              </label>
            </div>

            {!isGlobal && (
              <div style={{ marginTop: 14 }}>
                <label className="event-label">Assign Users</label>
                <UserSelectDropdown
                  users={users}
                  selectedIds={assignedUserIds}
                  onChange={(ids) => { setIsDirty(true); setAssignedUserIds(ids); }}
                  placeholder="Select users to assign"
                />
              </div>
            )}

            <div className="event-dots">
              <span className="dot" />
              <span className="dot active" />
            </div>

            <div className="event-footer">
              <button className="btn-cancel" onClick={handleBack}>Back</button>
              <LoadingButton
                className="btn-primary"
                onClick={handleCreate}
                loading={submitting}
              >
                {isEditing ? "Update Event" : "Create Event"}
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
