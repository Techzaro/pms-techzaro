import "../layout/CreateDeliverableModel.css";

const CreateDeliverableTask = ({ onClose }) => {
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

          <button
            className="deliverable-close-btn"
            onClick={onClose}
          >
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

                <select>
                  <option>
                    Select Task
                  </option>
                </select>

              </div>

              <div className="deliverable-field">

                <label>
                  Assign To <span>*</span>
                </label>

                <select>
                  <option>
                    Select user(s)
                  </option>
                </select>

                <small>
                  Hold Ctrl/Cmd to select multiple
                </small>

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

              <select>
                <option>
                  Pending
                </option>

                <option>
                  In Progress
                </option>

                <option>
                  Completed
                </option>
                <option>
                  Abandoned
                </option>
                <option>
                  Failed
                </option>
              </select>

            </div>

            {/* PRIORITY */}

            <div className="deliverable-card">

              <label>
                Priority
              </label>

              <select>
                <option>
                  Medium
                </option>

                <option>
                  Low
                </option>

                <option>
                  High
                </option>
              </select>

            </div>

            {/* DATE */}

            <div className="deliverable-card">

              <label>
                Date
              </label>

              <div className="deliverable-date-grid">

                <div>
                  <span>Start Date</span>

                  <input type="date" />
                </div>

                <div>
                  <span>Due Date</span>

                  <input type="date" />
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