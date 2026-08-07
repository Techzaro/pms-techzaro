import React from "react";
import { X } from "lucide-react";

export default function ManualHrAttendanceModal({
  isOpen,
  onClose,
  users = [],
  manualUserId,
  setManualUserId,
  manualDate,
  setManualDate,
  manualStatus,
  setManualStatus,
  manualWorkMode,
  setManualWorkMode,
  manualClockIn,
  setManualClockIn,
  manualClockOut,
  setManualClockOut,
  manualNotes,
  setManualNotes,
  onSave,
}) {
  if (!isOpen) return null;

  return (
    <div className="att-modal-overlay" onClick={onClose}>
      <div className="att-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "580px" }}>
        <div className="att-modal-header" style={{ borderTop: "4px solid #0082ff" }}>
          <h3>Manual HR Attendance Entry &amp; Override</h3>
          <button style={{ border: "none", background: "none", cursor: "pointer" }} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSave}>
          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <label htmlFor="man-user" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Select Employee</label>
              <select
                id="man-user"
                className="att-input"
                value={manualUserId}
                onChange={(e) => setManualUserId(e.target.value)}
                required
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.department || "General"}) - {u.email}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label htmlFor="man-date" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Attendance Date</label>
                <input
                  id="man-date"
                  type="date"
                  className="att-input"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  required
                />
              </div>

              <div>
                <label htmlFor="man-status" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Attendance Status</label>
                <select
                  id="man-status"
                  className="att-input"
                  value={manualStatus}
                  onChange={(e) => {
                    setManualStatus(e.target.value);
                    if (e.target.value === "WFH") setManualWorkMode("WFH");
                    else if (e.target.value === "Present" || e.target.value === "Late") setManualWorkMode("Office");
                  }}
                >
                  <option value="Present">🏢 Present (Office)</option>
                  <option value="Late">⌛ Late Arrival</option>
                  <option value="WFH">🏡 Work From Home (Remote)</option>
                  <option value="Leave">🌴 On Approved Leave</option>
                  <option value="Absent">❌ Absent (Unexcused)</option>
                  <option value="Paused">⏸ Paused / On Break</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
              <div>
                <label htmlFor="man-mode" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Work Mode</label>
                <select
                  id="man-mode"
                  className="att-input"
                  value={manualWorkMode}
                  onChange={(e) => setManualWorkMode(e.target.value)}
                >
                  <option value="Office">Office Duty</option>
                  <option value="WFH">Remote WFH</option>
                  <option value="Field">Field Duty</option>
                </select>
              </div>

              <div>
                <label htmlFor="man-in" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Clock In Time</label>
                <input
                  id="man-in"
                  type="time"
                  className="att-input"
                  value={manualClockIn}
                  onChange={(e) => setManualClockIn(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="man-out" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Clock Out Time</label>
                <input
                  id="man-out"
                  type="time"
                  className="att-input"
                  value={manualClockOut}
                  onChange={(e) => setManualClockOut(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="man-notes" style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>HR Remarks / Override Notes</label>
              <textarea
                id="man-notes"
                className="att-input"
                rows="2"
                style={{ width: "100%", padding: "8px" }}
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="e.g. Attendance manually verified and marked by HR Manager."
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "12px 16px", borderTop: "1px solid #f1f5f9" }}>
            <button type="button" className="att-btn" style={{ background: "#f1f5f9", color: "#334155" }} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="att-btn att-btn--primary">
              Save Manual Attendance
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
