import "./layout/CreateTaskModal.css";

const CreateTaskModal = ({ onClose }) => {
  return (
    <div className="task-overlay">

      <div className="task-modal">

        {/* HEADER */}
        <div className="task-header">

          <div className="task-header-left">

            <div className="task-icon">
              ⊕
            </div>

            <div>
              <h2>Create New Task</h2>

              <p>
                Add task details and assign it to team members.
              </p>
            </div>

          </div>

          <button
            className="task-close-btn"
            onClick={onClose}
          >
            ✕
          </button>

        </div>

        {/* BODY */}
        <div className="task-body">

          {/* LEFT SIDE */}
          <div className="task-left">

            <div className="task-grid-2">

              <div className="task-field">
                <label>
                  Projects <span>*</span>
                </label>

                <select>
                  <option>Select project</option>
                </select>
              </div>

              <div className="task-field">
                <label>
                  Assign To <span>*</span>
                </label>

                <select>
                  <option>Select user(s)</option>
                </select>

                <small>
                  Hold Ctrl/Cmd to select multiple
                </small>
              </div>

            </div>

            <div className="task-field">

              <label>
                Task Name <span>*</span>
              </label>

              <input
                type="text"
                placeholder="Enter task name.."
              />

            </div>

            <div className="task-field">

              <label>Description</label>

              <textarea
                placeholder="Enter task description.."
              ></textarea>

            </div>

          </div>

          {/* RIGHT SIDE */}
          <div className="task-right">

            {/* STATUS */}
            <div className="task-card">

              <label>Status</label>

              <select>
                <option>Planned</option>
                <option>In Progress</option>
                <option>Completed</option>
              </select>

            </div>

            {/* PRIORITY */}
            <div className="task-card">

              <label>Priority</label>

              <select>
                <option>Medium</option>
                <option>Low</option>
                <option>High</option>
              </select>

            </div>

            {/* DATE */}
            <div className="task-card">

              <label>Date</label>

              <div className="task-date-grid">

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

            {/* ATTACHMENTS */}
            <div className="task-card">

              <label>Attachments</label>

              <div className="task-upload-box">

                <p>Drag & drop files here</p>

                <span>or browse</span>

              </div>

              <div className="task-or">
                OR
              </div>

              <div className="task-link-box">

                <input
                  type="text"
                  placeholder="Paste link (Drive, Figma, Website, etc.)"
                />

                <button>
                  Add Link
                </button>

              </div>

            </div>

          </div>

        </div>

        {/* FOOTER */}
        <div className="task-footer">

          <div className="task-checkbox">

            <input type="checkbox" />

            <span>Mark as Recurring Task</span>

          </div>

          <div className="task-footer-btns">

            <button
              className="task-cancel-btn"
              onClick={onClose}
            >
              Cancel
            </button>

            <button className="task-create-btn">
              + Create Task
            </button>

          </div>

        </div>

      </div>

    </div>
  );
};

export default CreateTaskModal;