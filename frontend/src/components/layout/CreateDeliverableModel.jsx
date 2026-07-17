/**
 * CreateSubtaskTask - Modal form for creating a new subtask.
 * Provides fields for task selection, assignment, description, status,
 * priority, and date range. Dispatches a modal-state custom event to
 * coordinate with other layout components (e.g., hiding toggles).
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import useConfirmOnClose from "../../hooks/useConfirmOnClose";
import CustomSelect from "../CustomSelect";
import CustomDateTimePicker from "../CustomDateTimePicker";
import "../layout/CreateDeliverableModel.css";

/**
 * @param {{ onClose: () => void }} props - Callback to close the modal
 */
const CreateSubtaskTask = ({ onClose }) => {
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
  useEscapeKey(true, handleClose);

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
    <div className="subtask-overlay">

      <div className="subtask-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Header: Title and close button ── */}
        <div className="subtask-header">

          <div className="subtask-header-left">

            <div className="subtask-icon">
              ⊕
            </div>

            <div>
              <h2>Create New Subtask</h2>

              <p>
                Add subtask details.
              </p>
            </div>

          </div>

          <div className="subtask-header-actions">
            <button className="subtask-create-btn">
              ⊕ Create Task
            </button>
            <button className="subtask-close-btn" onClick={handleClose}>
              ✕
            </button>
          </div>

        </div>

        {/* ── Body: Left (form fields) + Right (status/priority/dates) ── */}
        <div className="subtask-body">

          {/* Left column – task, assignment, description */}
          <div className="subtask-left">

            <div className="subtask-grid-2">

              <div className="subtask-field">

                <label>
                  Subtask
                </label>

                <CustomSelect
                  value={form.task}
                  onChange={(val) => { setIsDirty(true); setForm((p) => ({ ...p, task: val })); }}
                  placeholder="Select Task"
                  options={[
                    { value: "", label: "Select Task" },
                  ]}
                />

              </div>

              <div className="subtask-field">

                <label>
                  Assign To <span>*</span>
                </label>

                <CustomSelect
                  value={form.assign_to}
                  onChange={(val) => { setIsDirty(true); setForm((p) => ({ ...p, assign_to: val })); }}
                  placeholder="Select user(s)"
                  options={[
                    { value: "", label: "Select user(s)" },
                  ]}
                />

              </div>

            </div>

            <div className="subtask-field">

              <label>
                Description
              </label>

              <textarea
                placeholder="Enter subtask description..."
              ></textarea>

            </div>

          </div>

          {/* Right column – status, priority, date pickers */}
          <div className="subtask-right">

            {/* Status selection card */}

            <div className="subtask-card">

              <label>
                Status
              </label>

              <CustomSelect
                value={form.status}
                onChange={(val) => { setIsDirty(true); setForm((p) => ({ ...p, status: val })); }}
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

            <div className="subtask-card">

              <label>
                Priority
              </label>

              <CustomSelect
                value={form.priority}
                onChange={(val) => { setIsDirty(true); setForm((p) => ({ ...p, priority: val })); }}
                options={[
                  { value: "Medium", label: "Medium" },
                  { value: "Low", label: "Low" },
                  { value: "High", label: "High" },
                ]}
              />

            </div>

            {/* Date range pickers card */}

            <div className="subtask-card">

              <label>
                Date
              </label>

              <div className="subtask-date-grid">

                <div>
                  <span>Start Date</span>

                  <CustomDateTimePicker
                    value={form.start_date}
                    onChange={(val) => { setIsDirty(true); setForm((p) => ({ ...p, start_date: val })); }}
                    dateOnly
                    min={new Date().toISOString()}
                  />
                </div>

                <div>
                  <span>Due Date</span>

                  <CustomDateTimePicker
                    value={form.due_date}
                    onChange={(val) => { setIsDirty(true); setForm((p) => ({ ...p, due_date: val })); }}
                    dateOnly
                    min={new Date().toISOString()}
                  />
                </div>

              </div>

            </div>

          </div>

        </div>

      </div>

      <ConfirmDialog />

    </div>,
    document.body
  );
};

export default CreateSubtaskTask;
