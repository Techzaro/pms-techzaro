import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { authToken } from "../utils/auth";
import API_URL from "../config/api";
import UserSelectDropdown from "./UserSelectDropdown";
import { publish } from "../utils/eventBus";
import "./Event.css";

const TYPE_MAP = {
  Meeting: "meeting",
  Task: "task",
  Review: "other",
  Deadline: "deadline",
  Personal: "personal",
};

const TYPE_MAP_REVERSE = {
  meeting: "Meeting",
  task: "Task",
  other: "Review",
  deadline: "Deadline",
  personal: "Personal",
};

const COLOR_MAP = {
  meeting: "#6366f1",
  task: "#3b82f6",
  other: "#f97316",
  deadline: "#ef4444",
  personal: "#22c55e",
};

function Event({ isOpen, onClose, onEventCreated, editEvent = null }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [users, setUsers] = useState([]);
  const [assignedUserIds, setAssignedUserIds] = useState([]);
  const [isGlobal, setIsGlobal] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    startDate: new Date().toISOString().split("T")[0],
    startTime: "10:00",
    endDate: new Date().toISOString().split("T")[0],
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
        startDate: start.toISOString().split("T")[0],
        startTime: start.toTimeString().slice(0, 5),
        endDate: end.toISOString().split("T")[0],
        endTime: end.toTimeString().slice(0, 5),
        eventType: TYPE_MAP_REVERSE[editEvent.type] || "Meeting",
        allDay: editEvent.all_day || false,
      });
      setAssignedUserIds(editEvent.assigned_user_ids || []);
      setIsGlobal(Boolean(editEvent.is_global));
    } else {
      setFormData({
        title: "",
        description: "",
        startDate: new Date().toISOString().split("T")[0],
        startTime: "10:00",
        endDate: new Date().toISOString().split("T")[0],
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
    { label: "Task", color: "light-blue" },
    { label: "Review", color: "green" },
    { label: "Deadline", color: "red" },
    { label: "Personal", color: "orange" },
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
      ? formData.startDate + "T00:00:00"
      : formData.startDate + "T" + formData.startTime + ":00";

    const endDateTime = formData.allDay
      ? (formData.endDate || formData.startDate) + "T23:59:59"
      : formData.endDate + "T" + formData.endTime + ":00";

    const payload = {
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      type: TYPE_MAP[formData.eventType] || "meeting",
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
