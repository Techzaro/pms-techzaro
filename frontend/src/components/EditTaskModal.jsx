import { useState } from "react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import "./layout/CreateTaskModal.css";

export default function EditTaskModal({ task, onClose }) {
  const [form, setForm] = useState({
    title: task.title || "",
    description: task.description || "",
    priority: task.priority || "Medium",
    status: task.status || "pending",
    start_date: task.start_date ? task.start_date.slice(0, 10) : "",
    end_date: task.end_date ? task.end_date.slice(0, 10) : "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/tasks/${task.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${authToken()}`,
        },
        body: JSON.stringify(form),
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
              <h2>Edit Task</h2>
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
                <label>Assigned To</label>
                <div className="task-project-name">
                  {task.assignees?.map((a) => a.name).join(", ") || "—"}
                </div>
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
              <label>Status</label>
              <select name="status" value={form.status} onChange={handleChange}>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="review">Review</option>
                <option value="completed">Completed</option>
                <option value="done">Done</option>
                <option value="failed">Failed</option>
                <option value="abandoned">Abandoned</option>
              </select>
            </div>

            <div className="task-card">
              <div className="task-card-top"><span>Dates</span></div>
              <div className="task-deadline-grid">
                <div>
                  <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>Start</label>
                  <input type="date" name="start_date" value={form.start_date} onChange={handleChange} />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>End</label>
                  <input type="date" name="end_date" value={form.end_date} onChange={handleChange} />
                </div>
              </div>
            </div>

          </div>

          {error && <div className="task-error-banner" style={{ margin: "0 28px" }}>{error}</div>}

          {/* FOOTER */}
          <div className="task-footer">
            <button type="button" className="task-cancel-btn" onClick={() => onClose(false)} disabled={loading}>Cancel</button>
            <button type="submit" className="task-create-btn" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
