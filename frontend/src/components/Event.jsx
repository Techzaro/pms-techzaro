import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import "./Event.css";

function Event({ isOpen, onClose }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    reminder: "30 mins before",
    startDate: "2026-06-17",
    startTime: "10:00",
    endDate: "2026-06-17",
    endTime: "10:00",
    eventType: "Meeting",
  });

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
    onClose();
  };

  const handleCreate = () => {
    console.log("Event created:", formData);
    setStep(1);
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="event-overlay">
      <div className="event-modal" onClick={(e) => e.stopPropagation()}>

        <div className="event-header">
          <h2>Add New Event</h2>
          <button className="event-close" onClick={handleCancel}>×</button>
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
            <textarea
              className="event-textarea"
              placeholder="Add event description..."
              rows={4}
              value={formData.description}
              onChange={(e) => handleChange("description", e.target.value)}
            />

            <label className="event-label">Add Reminder</label>
            <input
              type="text"
              className="event-input"
              placeholder="30 mins before"
              value={formData.reminder}
              onChange={(e) => handleChange("reminder", e.target.value)}
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

            <div className="event-datetime-row">
              <input
                type="date"
                className="event-input"
                value={formData.startDate}
                onChange={(e) => handleChange("startDate", e.target.value)}
              />
              <input
                type="time"
                className="event-input"
                value={formData.startTime}
                onChange={(e) => handleChange("startTime", e.target.value)}
              />
            </div>

            <div className="event-datetime-row">
              <input
                type="date"
                className="event-input"
                value={formData.endDate}
                onChange={(e) => handleChange("endDate", e.target.value)}
              />
              <input
                type="time"
                className="event-input"
                value={formData.endTime}
                onChange={(e) => handleChange("endTime", e.target.value)}
              />
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

            <div className="event-dots">
              <span className="dot" />
              <span className="dot active" />
            </div>

            <div className="event-footer">
              <button className="btn-cancel" onClick={handleBack}>Cancel</button>
              <button className="btn-primary" onClick={handleCreate}>Create Event</button>
            </div>
          </div>
        )}

      </div>
    </div>
  , document.body);
}

export default Event;
