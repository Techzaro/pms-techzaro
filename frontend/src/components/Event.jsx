import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { authToken } from "../utils/auth";
import API_URL from "../config/api";
import UserSelectDropdown from "./UserSelectDropdown";
import { publish } from "../utils/eventBus";
import { toUTCIso } from "../utils/formatDateTime";
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

function Event({ isOpen, onClose, onEventCreated, editEvent = null }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [users, setUsers] = useState([]);
  const [assignedUserIds, setAssignedUserIds] = useState([]);
  const [isGlobal, setIsGlobal] = useState(false);
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
    eventType: "Meeting",
    allDay: false,
  });

  const isEditing = !!editEvent;

  useEffect(() => {
    if (editEvent) {
      const start = new Date(editEvent.start_date);
      const end = editEvent.end_date ? new Date(editEvent.end_date) : start;
      setFormData({
        title: editEvent.title || "",
        description: editEvent.description || "",
        startDate: getLocalDateStr(start),
        startTime: start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
        endDate: getLocalDateStr(end),
        endTime: end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
        eventType: TYPE_MAP_REVERSE[editEvent.type] || "Meeting",
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
        eventType: "Meeting",
        allDay: false,
      });
      setAssignedUserIds([]);
      setIsGlobal(false);
    }
    setStep(1);
    setError("");
  }, [editEvent, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const token = authToken();

    fetch(`${API_URL}/team-users`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]));
  }, [isOpen]);

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
    { label: "Other", color: "gray" },
  ];

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNext = () => setStep(2);
  const handleBack = () => setStep(1);
  const handleCancel = () => {
    setStep(1);
    setError("");
    onClose();
  };

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      setError("Event title is required");
      return;
    }

    setLoading(true);
    setError("");

    const startDateTime = formData.allDay
      ? toUTCIso(formData.startDate + "T00:00")
      : toUTCIso(formData.startDate + "T" + formData.startTime);

    const endDateTime = formData.allDay
      ? toUTCIso((formData.endDate || formData.startDate) + "T23:59")
      : toUTCIso(formData.endDate + "T" + formData.endTime);

    const payload = {
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      type: TYPE_MAP[formData.eventType] || "Meeting",
      color: COLOR_MAP[TYPE_MAP[formData.eventType]] || null,
      start_date: startDateTime,
      end_date: endDateTime,
      all_day: formData.allDay,
      is_global: isGlobal,
      assigned_user_ids: isGlobal ? [] : assignedUserIds,
    };

    try {
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
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to save event");
      }

      setStep(1);
      setError("");
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
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="event-overlay">
      <div className="event-modal" onClick={(e) => e.stopPropagation()}>

        <div className="event-header">
          <h2>{isEditing ? "Edit Event" : "Add New Event"}</h2>
          <button className="event-close" onClick={handleCancel}>×</button>
        </div>

        {error && (
          <div style={{
            margin: "0 24px",
            padding: "10px 14px",
            background: "#FEF2F2",
            color: "#B91C1C",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
          }}>
            {error}
          </div>
        )}

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
            <textarea
              className="event-textarea"
              placeholder="Add event description..."
              rows={4}
              value={formData.description}
              onChange={(e) => handleChange("description", e.target.value)}
            />

            <div className="event-dots">
              <span className="dot active" />
              <span className="dot" />
            </div>

            <div className="event-footer">
              <button className="btn-cancel" onClick={handleCancel}>Cancel</button>
              <button className="btn-primary" onClick={handleNext}>Next</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="event-step">
            <label className="event-label required">Date &amp; Time</label>

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

            <div className="event-datetime-row">
              <input
                type="date"
                className="event-input"
                value={formData.startDate}
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

            <div className="event-datetime-row">
              <input
                type="date"
                className="event-input"
                value={formData.endDate}
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

            <label className="event-label">Event Type</label>
            <div className="event-type-pills">
              {eventTypes.map((type) => (
                <button
                  key={type.label}
                  className={`type-pill type-${type.color} ${
                    formData.eventType === type.label ? "active" : ""
                  }`}
                  onClick={() => handleChange("eventType", type.label)}
                >
                  {type.label}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
              <input
                id="assignAll"
                type="checkbox"
                checked={isGlobal}
                onChange={(e) => {
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
                  onChange={setAssignedUserIds}
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
              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={loading}
                style={{ opacity: loading ? 0.6 : 1 }}
              >
                {loading ? "Saving..." : isEditing ? "Update Event" : "Create Event"}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  , document.body);
}

export default Event;
