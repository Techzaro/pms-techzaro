/**
 * CreateDeliverableTask - Modal form for creating a new deliverable task.
 * Provides fields for task selection, assignment, description, status,
 * priority, and date range. Dispatches a modal-state custom event to
 * coordinate with other layout components (e.g., hiding toggles).
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import CustomSelect from "../CustomSelect";
import CustomDateTimePicker from "../CustomDateTimePicker";
import "../layout/CreateDeliverableModel.css";

/**
 * @param {{ onClose: () => void }} props - Callback to close the modal
 */
const CreateDeliverableTask = ({ onClose }) => {
  useEscapeKey(true, onClose);

  const [form, setForm] = useState({
    task: "",
    assign_to: "",
    status: "Pending",
    priority: "Medium",
    start_date: "",
    due_date: "",
  });

  // Notify layout that a modal is open so toggles can be hidden
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: true } }));
    return () => window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: false } }));
  }, []);

  return createPortal(
    <div className="deliverable-overlay">

      <div className="deliverable-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Header: Title and close button ── */}
        <div className="deliverable-header">

          <div className="deliverable-header-left">

            <div className="deliverable-icon">
              ⊕
            </div>

            <div>
              <h2>Create New Deliverable Task</h2>

              <p>
                Add deliverable task details.
              </p>
            </div>

          </div>

          <div className="deliverable-header-actions">
            <button className="deliverable-create-btn">
              ⊕ Create Task
            </button>
            <button className="deliverable-close-btn" onClick={onClose}>
              ✕
            </button>
          </div>

        </div>

        {/* ── Body: Left (form fields) + Right (status/priority/dates) ── */}
        <div className="deliverable-body">

          {/* Left column – task, assignment, description */}
          <div className="deliverable-left">

            <div className="deliverable-grid-2">

              <div className="deliverable-field">

                <label>
                  Deliverable Task
                </label>

                <CustomSelect
                  value={form.task}
                  onChange={(val) => setForm((p) => ({ ...p, task: val }))}
                  placeholder="Select Task"
                  options={[
                    { value: "", label: "Select Task" },
                  ]}
                />

              </div>

              <div className="deliverable-field">

                <label>
                  Assign To <span>*</span>
                </label>

                <CustomSelect
                  value={form.assign_to}
                  onChange={(val) => setForm((p) => ({ ...p, assign_to: val }))}
                  placeholder="Select user(s)"
                  options={[
                    { value: "", label: "Select user(s)" },
                  ]}
                />

              </div>

            </div>

            <div className="deliverable-field">

              <label>
                Description
              </label>

              <textarea
                placeholder="Enter deliverable task description..."
              ></textarea>

            </div>

          </div>

          {/* Right column – status, priority, date pickers */}
          <div className="deliverable-right">

            {/* Status selection card */}

            <div className="deliverable-card">

              <label>
                Status
              </label>

              <CustomSelect
                value={form.status}
                onChange={(val) => setForm((p) => ({ ...p, status: val }))}
                options={[
                  { value: "Pending", label: "Pending" },
                  { value: "In Progress", label: "In Progress" },
                  { value: "Completed", label: "Completed" },
                  { value: "Abandoned", label: "Abandoned" },
                  { value: "Failed", label: "Failed" },
                ]}
              />

            </div>

            {/* Priority selection card */}

            <div className="deliverable-card">

              <label>
                Priority
              </label>

              <CustomSelect
                value={form.priority}
                onChange={(val) => setForm((p) => ({ ...p, priority: val }))}
                options={[
                  { value: "Medium", label: "Medium" },
                  { value: "Low", label: "Low" },
                  { value: "High", label: "High" },
                ]}
              />

            </div>

            {/* Date range pickers card */}

            <div className="deliverable-card">

              <label>
                Date
              </label>

              <div className="deliverable-date-grid">

                <div>
                  <span>Start Date</span>

                  <CustomDateTimePicker
                    value={form.start_date}
                    onChange={(val) => setForm((p) => ({ ...p, start_date: val }))}
                    dateOnly
                    min={new Date().toISOString()}
                  />
                </div>

                <div>
                  <span>Due Date</span>

                  <CustomDateTimePicker
                    value={form.due_date}
                    onChange={(val) => setForm((p) => ({ ...p, due_date: val }))}
                    dateOnly
                    min={new Date().toISOString()}
                  />
                </div>

              </div>

            </div>

          </div>

        </div>

      </div>

    </div>,
    document.body
  );
};

export default CreateDeliverableTask;
