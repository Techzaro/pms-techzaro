import { useEffect, useState } from "react";
import CustomSelect from "../CustomSelect";
import CustomDateTimePicker from "../CustomDateTimePicker";
import "../layout/CreateDeliverableModel.css";

const CreateDeliverableTask = ({ onClose }) => {
  const [form, setForm] = useState({
    task: "",
    assign_to: "",
    status: "Pending",
    priority: "Medium",
    start_date: "",
    due_date: "",
  });

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: true } }));
    return () => window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: false } }));
  }, []);

  return (
    <div className="deliverable-overlay">

      <div className="deliverable-modal">

        {/* HEADER */}

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

          <button className="deliverable-close-btn" onClick={onClose}>
            ✕
          </button>

        </div>

        {/* BODY */}

        <div className="deliverable-body">

          {/* LEFT */}

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

          {/* RIGHT */}

          <div className="deliverable-right">

            {/* STATUS */}

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

            {/* PRIORITY */}

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

            {/* DATE */}

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

        {/* FOOTER */}

        <div className="deliverable-footer">

          <button
            className="deliverable-cancel-btn"
            onClick={onClose}
          >
            Cancel
          </button>

          <button className="deliverable-create-btn">
            ⊕ Create Task
          </button>

        </div>

      </div>

    </div>
  );
};

export default CreateDeliverableTask;
