import { useState, useEffect } from "react";
import API_URL from "../config/api";
import { authToken, getUser } from "../utils/auth";
import UserSelectDropdown from "./UserSelectDropdown";
import { formatDateTime, toDatetimeLocal } from "../utils/formatDateTime";
import "./layout/CreateTaskModal.css";

export default function EditTaskModal({ task, onClose }) {
  const currentUser = getUser();

  const [form, setForm] = useState({
    title: task.title || "",
    description: task.description || "",
    priority: task.priority || "Medium",
    start_date: task.start_date ? toDatetimeLocal(task.start_date) : "",
    end_date: task.end_date ? toDatetimeLocal(task.end_date) : "",
  });
  const [allUsers, setAllUsers] = useState([]);
  const [displayUsers, setDisplayUsers] = useState([]);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState(
    task.assignees?.map((a) => a.id) || []
  );
  const [deliverables, setDeliverables] = useState([]);
  const [deliverableInput, setDeliverableInput] = useState({ title: "", due_datetime: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isSelfTask = currentUser && parseInt(task.assigned_by, 10) === parseInt(currentUser.id, 10) && selectedAssigneeIds.length === 1 && selectedAssigneeIds[0] === parseInt(currentUser.id, 10);

  useEffect(() => {
    const token = authToken();
    fetch(`${API_URL}/team-users`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const users = Array.isArray(data) ? data : [];
        setAllUsers(users);
        setDisplayUsers(users);
      })
      .catch(() => {});
  }, []);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAssignedToChange = (ids) => {
    setSelectedAssigneeIds(ids);
  };

  const handleAddDeliverable = () => {
    if (!deliverableInput.title.trim()) return;
    const dt = deliverableInput.due_datetime;
    const dueDate = dt ? dt.replace("T", " ") + ":00" : null;
    setDeliverables((prev) => [...prev, { title: deliverableInput.title.trim(), due_date: dueDate }]);
    setDeliverableInput({ title: "", due_datetime: "" });
  };

  const handleRemoveDeliverable = (index) => {
    setDeliverables((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDeliverableKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddDeliverable(); }
  };

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body = { ...form, assigned_to: selectedAssigneeIds };
      if (deliverables.length > 0) {
        body.deliverables = deliverables.map((d) => ({ title: d.title, due_date: d.due_date || null }));
      }
      const res = await fetch(`${API_URL}/tasks/${task.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${authToken()}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update task");
      onClose(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="task-overlay" onClick={() => onClose(false)}>
      <div className="task-modal" onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="task-header">
          <div className="task-header-left">
            <div className="task-icon">✎</div>
            <div>
              <h2>{isSelfTask ? "Edit Self Task" : "Edit Task"}</h2>
              <p>Update task details</p>
            </div>
          </div>
          <button className="task-close-btn" onClick={() => onClose(false)}>✕</button>
        </div>

        {/* BODY */}
        <form onSubmit={handleSubmit} className="task-body">

          {/* LEFT SIDE */}
          <div className="task-left">

            <div className="task-grid-2">
              <div className="task-field">
                <label>Project</label>
                <div className="task-project-name">{task.project?.title || "—"}</div>
              </div>
              <div className="task-field">
                <label>Assign To {!isSelfTask && <span>*</span>}</label>
                {isSelfTask ? (
                  <div className="task-project-name">
                    {task.assignees?.map((a) => a.name).join(", ") || "—"}
                  </div>
                ) : (
                  <UserSelectDropdown
                    users={displayUsers}
                    selectedIds={selectedAssigneeIds}
                    onChange={handleAssignedToChange}
                    placeholder="Click to select members"
                  />
                )}
              </div>
            </div>

            <div className="task-field">
              <label>Task Name <span>*</span></label>
              <input
                type="text"
                name="title"
                placeholder="Enter task name"
                value={form.title}
                onChange={handleChange}
              />
            </div>

            <div className="task-field">
              <label>Description</label>
              <textarea
                name="description"
                placeholder="Enter task description"
                value={form.description}
                onChange={handleChange}
              />
            </div>

            {Array.isArray(task.requirements) && task.requirements.length > 0 && (
              <div className="task-field">
                <label>Requirements</label>
                <div className="cp-goals-list">
                  {task.requirements.map((req, idx) => (
                    <div key={idx} className="cp-goals-item">
                      <span className="cp-goals-item-text">{req}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* RIGHT SIDE */}
          <div className="task-right">

            <div className="task-card">
              <label>Priority <span style={{ color: "#ef4444" }}>*</span></label>
              <select name="priority" value={form.priority} onChange={handleChange}>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
                <option value="High">High</option>
              </select>
            </div>

            <div className="task-card">
              <div className="task-card-top"><span>Dates</span></div>
              <div className="task-deadline-grid">
                <div>
                  <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>Start</label>
                  <input type="datetime-local" name="start_date" value={form.start_date} onChange={handleChange} />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>End</label>
                  <input type="datetime-local" name="end_date" value={form.end_date} onChange={handleChange} />
                </div>
              </div>
            </div>

            {/* DELIVERABLES */}
            <div className="task-card">
              <div className="task-card-top">
                <span>Deliverables</span>
              </div>
              <div className="task-deadline-grid">
                <div className="task-field">
                  <label style={{ fontSize: "13px" }}>Deliverable Name</label>
                  <input
                    type="text"
                    placeholder="Enter deliverable name"
                    value={deliverableInput.title}
                    onChange={(e) => setDeliverableInput((prev) => ({ ...prev, title: e.target.value }))}
                    onKeyDown={handleDeliverableKeyDown}
                  />
                </div>
                <div className="task-field">
                  <label style={{ fontSize: "13px" }}>Due Date & Time</label>
                  <input
                    type="datetime-local"
                    value={deliverableInput.due_datetime}
                    onChange={(e) => setDeliverableInput((prev) => ({ ...prev, due_datetime: e.target.value }))}
                    onKeyDown={handleDeliverableKeyDown}
                  />
                </div>
              </div>
              <button
                type="button"
                className="task-add-phase-btn"
                onClick={handleAddDeliverable}
                disabled={!deliverableInput.title.trim()}
              >
                + Add Deliverable
              </button>
              {deliverables.length > 0 && (
                <div className="task-phase-list">
                  {deliverables.map((d, index) => (
                    <div key={index} className="task-phase-item">
                      <div className="task-phase-item-dot" style={{ background: "#8b5cf6" }} />
                      <div className="task-phase-item-info">
                        <div className="task-phase-item-title">{d.title}</div>
                        <div className="task-phase-item-date">{d.due_date ? formatDateTime(d.due_date).replace("\n", " ") : "No due date"}</div>
                      </div>
                      <button type="button" className="task-phase-item-remove" onClick={() => handleRemoveDeliverable(index)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {error && <div className="task-error-banner" style={{ margin: "0 28px" }}>{error}</div>}

        </form>

        {/* FOOTER */}
        <div className="task-footer">
          <button type="button" className="task-cancel-btn" onClick={() => onClose(false)} disabled={loading}>Cancel</button>
          <button type="submit" className="task-create-btn" onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
